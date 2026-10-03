import { SandboxError } from "./config.server";

/** Bound bytes while reading; rejecting after request.text() would allocate the entire body. */
export async function readSandboxJson(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new SandboxError("SANDBOX_JSON_REQUIRED", 415);
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    throw new SandboxError("SANDBOX_REQUEST_INVALID");
  }
  if (declared !== null && Number(declared) > maxBytes) throw new SandboxError("SANDBOX_REQUEST_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SandboxError("SANDBOX_REQUEST_INVALID");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new SandboxError("SANDBOX_REQUEST_TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
    catch { throw new SandboxError("SANDBOX_REQUEST_INVALID"); }
  } finally {
    reader.releaseLock();
  }
}
