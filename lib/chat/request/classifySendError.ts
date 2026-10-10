import { REQUEST_TOO_LARGE_MESSAGE, isPayloadTooLargeError } from "@/lib/chat/request/requestBudget";
import { formatLoginRequiredError } from "@/lib/auth/presentation/loginHint";
import { DEFAULT_MAX_WAIT_MS, type StallReason } from "@/lib/chat/streaming/createStallWatchdog";

/** 两种看门狗超时给不同文案：是"真没数据"还是"等太久了"，用户的下一步动作不一样。 */
export const STALL_IDLE_MESSAGE = "连接超过 60 秒没有响应，请重试。";
export function stallMaxWaitMessage(maxWaitMs = DEFAULT_MAX_WAIT_MS): string {
  return `生成等待超过 ${Math.round(maxWaitMs / 1000)} 秒仍未结束，已为你停止。可在「设置 → 工具调用 → 最长等待时间」提高上限后重试。`;
}

export function classifySendError(
  err: unknown,
  flags: { stalled: StallReason | false; aborted: boolean; maxWaitMs?: number },
): string | null {
  if (flags.stalled === "max-wait") return stallMaxWaitMessage(flags.maxWaitMs);
  if (flags.stalled) return STALL_IDLE_MESSAGE;
  const isAbort =
    flags.aborted ||
    (err != null && typeof err === "object" && "name" in err && err.name === "AbortError");
  if (isAbort) return null;
  if (isPayloadTooLargeError(err)) return REQUEST_TOO_LARGE_MESSAGE;
  const raw = err instanceof Error ? err.message : "发生未知错误";
  return formatLoginRequiredError(raw);
}
