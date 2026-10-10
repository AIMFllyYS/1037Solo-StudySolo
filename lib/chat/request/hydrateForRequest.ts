import { hydrateAttachmentsForApi } from "@/lib/storage/chatStorage";
import type { ChatMessage } from "@/lib/types/chat";

export function lastUserMessageId(messages: ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") return messages[index].id;
  }
  return undefined;
}

/** IDB 水合本身不可取消，但停止后无需继续等待它；仍为原 Promise 安装拒绝处理器。 */
export function hydrateForRequest(
  messages: ChatMessage[],
  signal: AbortSignal,
  options?: { messageIds?: ReadonlySet<string> },
): Promise<ChatMessage[]> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("生成被中断", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    hydrateAttachmentsForApi(messages, options).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
