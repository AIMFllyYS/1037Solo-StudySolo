/** Provider response limits apply to received bytes, including chunked bodies. */
export async function connectorResponseText(response: Response, maximumBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (!response.ok || !response.body || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes))) {
    await response.body?.cancel().catch(() => {});
    throw new Error("provider_response_unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw new Error("provider_response_too_large");
      chunks.push(value);
    }
    const output = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function connectorResponseJson(response: Response, maximumBytes = 65536): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await connectorResponseText(response, maximumBytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("provider_response_invalid");
  return value as Record<string, unknown>;
}
