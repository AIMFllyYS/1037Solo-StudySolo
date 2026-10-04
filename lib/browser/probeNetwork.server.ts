import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { checkCustomBaseUrl, embeddedIpv4FromV6 } from "@/lib/ai/customBaseUrl";

export type ProbeResolver = (hostname: string) => Promise<LookupAddress[]>;
export const resolveProbeAddresses: ProbeResolver = hostname => lookup(hostname, { all: true, verbatim: true });

export class BlockedProbeNetworkError extends Error {
  constructor() { super("Probe destination is not public"); this.name = "BlockedProbeNetworkError"; }
}

// Documentation, benchmarking, multicast and reserved addresses must not become
// server request destinations, including a local VPN's fake-DNS address range.
const RESERVED = new BlockList();
for (const [address, bits] of [
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) RESERVED.addSubnet(address, bits, "ipv4");
RESERVED.addSubnet("2001:db8::", 32, "ipv6");

export function isPublicProbeAddress(address: string): boolean {
  const version = isIP(address);
  if (!version || RESERVED.check(address, version === 4 ? "ipv4" : "ipv6")) return false;
  const host = version === 6 ? `[${address}]` : address;
  if (!checkCustomBaseUrl(`https://${host}/`).ok) return false;
  const embedded = version === 6 ? embeddedIpv4FromV6(address) : null;
  return embedded === null || isPublicProbeAddress(embedded);
}

/** The socket only receives immutable validated addresses, never another DNS result. */
export function createPinnedProbeLookup(hostname: string, answers: LookupAddress[]): LookupFunction {
  if (!answers.length || answers.length > 32 || answers.some(answer =>
    !isPublicProbeAddress(answer.address) || isIP(answer.address) !== answer.family)) {
    throw new BlockedProbeNetworkError();
  }
  const pinned = answers.map(answer => Object.freeze({ address: answer.address, family: answer.family }));
  return (requestedHost, options, callback) => {
    const family = options.family;
    const matching = pinned.filter(answer => !family || answer.family === family);
    if (requestedHost.toLowerCase().replace(/\.$/, "") !== hostname.toLowerCase().replace(/\.$/, "") || !matching.length) {
      callback(new BlockedProbeNetworkError(), "", 0);
      return;
    }
    if (options.all) callback(null, matching.map(answer => ({ ...answer })));
    else callback(null, matching[0].address, matching[0].family);
  };
}

async function abortableResolution(promise: Promise<LookupAddress[]>, signal: AbortSignal): Promise<LookupAddress[]> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export interface ProbeHeadersResponse { status: number; headers: Headers }

/** Retain URL Host/TLS identity while fixing the socket address for this hop. */
export async function fetchProbeHeaders(
  url: URL,
  signal: AbortSignal,
  headers: Record<string, string>,
  resolver: ProbeResolver = resolveProbeAddresses,
): Promise<ProbeHeadersResponse> {
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const version = isIP(hostname);
  const answers = version ? [{ address: hostname, family: version }] : await abortableResolution(resolver(hostname), signal);
  signal.throwIfAborted();
  const pinnedLookup = createPinnedProbeLookup(hostname, answers);
  const dispatcher = new Agent({
    connections: 1, connect: { lookup: pinnedLookup, timeout: 8000 },
    headersTimeout: 8000, bodyTimeout: 8000, maxHeaderSize: 16 * 1024,
  });
  try {
    const response = await fetch(url.toString(), {
      method: "GET", redirect: "manual", signal, headers, dispatcher,
    } as RequestInit & { dispatcher: Agent });
    // No upstream page body is retained. Destroy this hop's dispatcher after
    // cancelling it; redirects get a new independently validated address set.
    await response.body?.cancel().catch(() => {});
    return { status: response.status, headers: new Headers(response.headers) };
  } finally {
    await dispatcher.destroy();
  }
}
