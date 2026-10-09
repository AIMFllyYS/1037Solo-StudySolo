import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { checkCustomBaseUrl, embeddedIpv4FromV6 } from "@/lib/ai/customBaseUrl";

export type ProbeResolver = (hostname: string) => Promise<LookupAddress[]>;

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
// Non-global/deprecated special-purpose prefixes (IANA IPv6 registry).
for (const [address, bits] of [
  ["64:ff9b:1::", 48], ["100::", 64], ["100:0:0:1::", 64],
  ["2001:2::", 48], ["2001:10::", 28], ["2001:db8::", 32],
  ["3fff::", 20], ["5f00::", 16], ["fec0::", 10],
] as const) RESERVED.addSubnet(address, bits, "ipv6");

export function isPublicProbeAddress(address: string): boolean {
  const version = isIP(address);
  if (!version || RESERVED.check(address, version === 4 ? "ipv4" : "ipv6")) return false;
  const host = version === 6 ? `[${address}]` : address;
  if (!checkCustomBaseUrl(`https://${host}/`).ok) return false;
  const embedded = version === 6 ? embeddedIpv4FromV6(address) : null;
  return embedded === null || isPublicProbeAddress(embedded);
}

// A local egress tunnel may answer every name from its fake-DNS pool (198.18.0.0/15).
// Only that exact case is re-resolved over DNS-over-HTTPS; every returned address is
// still validated by createPinnedProbeLookup, so private/reserved answers stay refused.
const FAKE_DNS = new BlockList();
FAKE_DNS.addSubnet("198.18.0.0", 15, "ipv4");
const DOH_ENDPOINTS = ["https://dns.google/resolve", "https://cloudflare-dns.com/dns-query"] as const;

export function isFakeDnsAnswerSet(answers: LookupAddress[]): boolean {
  return answers.length > 0 && answers.every(answer => isIP(answer.address) === 4 && FAKE_DNS.check(answer.address, "ipv4"));
}

export function dohFakeDnsFallbackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.STUDYSOLO_DOH_FAKE_DNS_FALLBACK?.trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

function logFakeDnsFallback(event: "fake-dns-doh-fallback" | "fake-dns-doh-failed", hostname: string): void {
  console.warn("[probe-network]", JSON.stringify({ event, hostname: hostname.slice(0, 253) }));
}

/** Public A records from DNS-over-HTTPS. Callers must still validate each address. */
export async function resolveViaDoh(
  hostname: string,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  endpoints: readonly string[] = DOH_ENDPOINTS,
): Promise<LookupAddress[]> {
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return await resolveViaDohEndpoint(hostname, endpoint, fetchImpl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("doh_unavailable");
}

async function resolveViaDohEndpoint(
  hostname: string,
  endpoint: string,
  fetchImpl: typeof fetch,
): Promise<LookupAddress[]> {
  const url = new URL(endpoint);
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", "A");
  const response = await fetchImpl(url, {
    headers: { accept: "application/dns-json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("doh_unavailable");
  const body = await response.json() as { Status?: unknown; Answer?: Array<{ type?: unknown; data?: unknown }> };
  if (body.Status !== 0 || !Array.isArray(body.Answer)) throw new Error("doh_no_answer");
  const answers = body.Answer
    .filter(answer => answer.type === 1 && typeof answer.data === "string" && isIP(answer.data) === 4)
    .map(answer => ({ address: answer.data as string, family: 4 }));
  if (!answers.length) throw new Error("doh_no_answer");
  return answers;
}

/** Use the system answer unless it is entirely fake-DNS; then try DoH, else keep the original (rejected) answer. */
export function withFakeDnsFallback(
  system: ProbeResolver,
  doh: ProbeResolver = hostname => resolveViaDoh(hostname),
  enabled: () => boolean = dohFakeDnsFallbackEnabled,
): ProbeResolver {
  return async hostname => {
    const answers = await system(hostname);
    if (!enabled() || !isFakeDnsAnswerSet(answers)) return answers;
    try {
      const resolved = await doh(hostname);
      logFakeDnsFallback("fake-dns-doh-fallback", hostname);
      return resolved;
    } catch {
      logFakeDnsFallback("fake-dns-doh-failed", hostname);
      return answers;
    }
  };
}

export const resolveProbeAddresses: ProbeResolver = withFakeDnsFallback(hostname => lookup(hostname, { all: true, verbatim: true }));

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
