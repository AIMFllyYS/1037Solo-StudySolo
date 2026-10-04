import dns from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";
import { checkCustomBaseUrl } from "@/lib/ai/customBaseUrl";
import { createPinnedProbeLookup, type ProbeResolver } from "@/lib/browser/probeNetwork.server";

export class PublicModelEndpointError extends Error {
  readonly code = "CUSTOM_PROVIDER_NETWORK_UNSAFE";
  // A preflight rejection sends no provider request and may cancel its reservation.
  readonly statusCode = 403;
  readonly isRetryable = false;
  constructor() { super("自定义模型地址未通过公网连接校验"); this.name = "PublicModelEndpointError"; }
}

const resolveAddresses: ProbeResolver = hostname => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Only user-configured website endpoints use this transport; operator URLs stay separate. */
export function createPublicModelFetch(
  baseUrl: string,
  timeoutMs: number,
  resolver: ProbeResolver = resolveAddresses,
  fetchImplementation: typeof fetch = (input, init) => globalThis.fetch(input, init),
): typeof fetch {
  const expected = new URL(baseUrl).origin;
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
    const signal = AbortSignal.any([AbortSignal.timeout(Math.min(900000, Math.max(1000, timeoutMs))), ...(callerSignal ? [callerSignal] : [])]);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    let pinnedLookup;
    try {
      signal.throwIfAborted();
      if (url.origin !== expected || url.username || url.password || !checkCustomBaseUrl(url.href).ok) throw new PublicModelEndpointError();
      const version = isIP(hostname);
      const answers = version ? [{ address: hostname, family: version }] : await new Promise<dns.LookupAddress[]>((resolve, reject) => {
        const abort = () => reject(new PublicModelEndpointError());
        signal.addEventListener("abort", abort, { once: true });
        resolver(hostname).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
      signal.throwIfAborted();
      pinnedLookup = createPinnedProbeLookup(hostname, answers);
    } catch { throw new PublicModelEndpointError(); }
    const dispatcher = new Agent({ connections: 1, connect: { lookup: pinnedLookup, timeout: 15000, rejectUnauthorized: true }, headersTimeout: Math.min(timeoutMs, 900000), bodyTimeout: Math.min(timeoutMs, 900000), maxHeaderSize: 16 * 1024 });
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; signal.removeEventListener("abort", dispose); void dispatcher.destroy().catch(() => {}); };
    signal.addEventListener("abort", dispose, { once: true });
    try {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.delete("host"); headers.delete("proxy-authorization");
      const response = await fetchImplementation(input, { ...init, headers, signal, redirect: "error", dispatcher } as RequestInit & { dispatcher: Agent });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {});
        throw new Error("自定义模型接口返回了不允许跟随的重定向");
      }
      if (!response.body) { dispose(); return response; }
      const reader = response.body.getReader();
      let bytes = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) { reader.releaseLock(); dispose(); controller.close(); return; }
            bytes += next.value.byteLength;
            if (bytes > 20 * 1024 * 1024) throw new Error("模型返回内容超过传输限制");
            controller.enqueue(next.value);
          } catch (error) { await reader.cancel().catch(() => {}); reader.releaseLock(); dispose(); controller.error(error); }
        },
        async cancel(reason) { await reader.cancel(reason).catch(() => {}); reader.releaseLock(); dispose(); },
      });
      return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { dispose(); throw error; }
  };
}
