import { streamText, type LanguageModel, type LanguageModelUsage } from "ai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";

interface RouteTextStreamOptions {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  temperature: number;
  maxOutputTokens?: number;
  providerOptions?: SharedV4ProviderOptions;
  abortSignal?: AbortSignal;
  idleTimeoutMs: number;
  onText: (delta: string) => void;
  onReasoning?: (delta: string) => void;
}

/**
 * Keep the artifact/record wire formats independent of the SDK UI-message protocol.
 * Consume fullStream, not just textStream: SDK stream errors/aborts are data parts
 * and must never be mistaken for a successful (possibly partial) result.
 */
export async function streamRouteText({
  idleTimeoutMs,
  onText,
  onReasoning,
  ...settings
}: RouteTextStreamOptions): Promise<{
  text: string;
  finishReason: string;
  usage: LanguageModelUsage;
}> {
  settings.abortSignal?.throwIfAborted();
  const upstreamAbort = new AbortController();
  let deadline=setTimeout(()=>upstreamAbort.abort(new DOMException('Model idle timeout','TimeoutError')),idleTimeoutMs);
  const touch=()=>{clearTimeout(deadline);deadline=setTimeout(()=>upstreamAbort.abort(new DOMException('Model idle timeout','TimeoutError')),idleTimeoutMs);};
  const result = streamText({
    ...settings,
    abortSignal: settings.abortSignal
      ? AbortSignal.any([settings.abortSignal, upstreamAbort.signal])
      : upstreamAbort.signal,
    // The model factory owns endpoint failover; do not silently repeat requests.
    maxRetries: 0,
    timeout: { firstChunkMs: idleTimeoutMs, chunkMs: idleTimeoutMs },
    onError: () => {}, // The caller translates the error into its existing SSE shape.
  });

  try {
    let text = "";
    let finished: { finishReason: string; usage: LanguageModelUsage } | undefined;
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
      if (part.type === "abort") {
        throw settings.abortSignal?.reason ?? new DOMException(part.reason || "生成已取消", "AbortError");
      }
      if (part.type === "text-delta") {
        touch();
        text += part.text;
        onText(part.text);
      } else if (part.type === "reasoning-delta") {
        touch();
        onReasoning?.(part.text);
      } else if (part.type === "finish") {
        finished = { finishReason: part.finishReason, usage: part.totalUsage };
      }
    }
    settings.abortSignal?.throwIfAborted();
    if (!finished || finished.finishReason === "error") throw new Error("流式响应提前结束，请重试");
    return { text, ...finished };
  } catch (error) {
    // fullStream is tee'd by the SDK. Cancelling only our iterator can leave the
    // other branch reading; abort the provider on errors or a throwing consumer.
    upstreamAbort.abort(error);
    throw error;
  }finally{clearTimeout(deadline);}
}
