/** 流式对话 UI 更新尾随节流（与 useChat 60ms 策略一致，可单测）。 */

export const STREAM_UI_THROTTLE_MS = 60;

export interface StreamUiThrottle {
  schedule: (write: () => void) => void;
  flush: () => void;
}

export function createStreamUiThrottle(throttleMs = STREAM_UI_THROTTLE_MS): StreamUiThrottle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingWrite: (() => void) | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingWrite) {
      const w = pendingWrite;
      pendingWrite = null;
      w();
    }
  };

  const schedule = (write: () => void) => {
    pendingWrite = write;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, throttleMs);
  };

  return { schedule, flush };
}
