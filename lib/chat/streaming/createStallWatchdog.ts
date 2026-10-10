/**
 * 流式请求看门狗：把"没反应"拆成两种可区分的超时。
 *
 * - **idle**：距上一次字节活动超过 idleTimeoutMs（默认 60s）。服务端在静默期会持续写
 *   SSE 注释（`lib/ai/sdk/heartbeat.ts` 的 keepaliveWhileIdle），所以这条只在**真正的死连接**
 *   （进程挂掉 / 网关掐流 / 上游彻底不响应）时才该触发。
 * - **max-wait**：从开始等待起的硬性总时长（用户设置「最长等待时间」，默认 300s）。
 *   深度思考 + 多步工具串行时，"一直有活动"并不代表还会结束，必须有这道总闸兜底。
 *
 * 两种超时都交给 onStall(reason) 决定怎么处理：当前实现是 abort，并给用户不同的文案。
 */

export type StallReason = "idle" | "max-wait";

/** 无字节活动判定。服务端静默保活是这一条的兜底，正常不该触发。 */
export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
/** 「最长等待时间」默认 300s：深度思考 + 多步工具的正常上限。 */
export const DEFAULT_MAX_WAIT_MS = 300_000;
export const MIN_MAX_WAIT_MS = 60_000;
export const MAX_MAX_WAIT_MS = 600_000;

/** 设置页来的值可能是字符串 / 空 / 超界：收敛到 [60s, 600s]，非法回默认。 */
export function clampMaxWaitMs(value: unknown, fallback = DEFAULT_MAX_WAIT_MS): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_MAX_WAIT_MS, Math.max(MIN_MAX_WAIT_MS, Math.round(n)));
}

export interface StallWatchdogOptions {
  idleTimeoutMs?: number;
  /** 0 = 不设总时长上限。 */
  maxWaitMs?: number;
  intervalMs?: number;
}

/**
 * @param options 传数字 = 只用 idle 阈值（历史签名，保持兼容）。
 * @param intervalMsArg 历史第三参；给了就覆盖 options.intervalMs。
 */
export function createStallWatchdog(
  onStall: (reason: StallReason) => void,
  options: number | StallWatchdogOptions = {},
  intervalMsArg?: number,
) {
  const opts: StallWatchdogOptions = typeof options === "number" ? { idleTimeoutMs: options } : options;
  const idleTimeoutMs = Math.max(0, opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS);
  const maxWaitMs = Math.max(0, opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
  const intervalMs = Math.max(1, intervalMsArg ?? opts.intervalMs ?? 5_000);
  const startedAt = Date.now();
  let lastActivity = startedAt;
  let fired = false;

  const interval = setInterval(() => {
    if (fired) return;
    const now = Date.now();
    // idle 优先：它更具体（真没数据），max-wait 只是总闸。
    if (idleTimeoutMs > 0 && now - lastActivity > idleTimeoutMs) {
      fired = true;
      onStall("idle");
      return;
    }
    if (maxWaitMs > 0 && now - startedAt > maxWaitMs) {
      fired = true;
      onStall("max-wait");
    }
  }, intervalMs);

  return {
    touch() {
      lastActivity = Date.now();
    },
    stop() {
      clearInterval(interval);
    },
  };
}
