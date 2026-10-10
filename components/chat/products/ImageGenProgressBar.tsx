"use client";

import { useT } from "@/lib/i18n/index";
import type { ImageGenProgress } from "@/lib/chat/imageGenProgress";

/**
 * 生图进度条。上游不回传进度，所以这里显示的是按模型典型耗时的估算：
 * 曲线渐近 99% 并**停在那里**，真完成时由上层把 status 置 done → 直接 100% 出图。
 * 慢速中转站（nano-banana / gpt-image-*）会长时间停在 99%，并给出"仍在生成"的说明，
 * 让用户知道进程没死。
 */
export default function ImageGenProgressBar({
  progress,
  compact = false,
}: {
  progress: ImageGenProgress;
  compact?: boolean;
}) {
  const t = useT();
  const elapsedSeconds = Math.max(0, Math.round(progress.elapsedMs / 1000));
  const remainingSeconds = Math.ceil(progress.remainingMs / 1000);
  const hint = progress.stalled
    ? t("window.imageGen.progress.slowHint")
    : remainingSeconds > 0
      ? t("window.imageGen.progress.remaining", { seconds: remainingSeconds })
      : t("window.imageGen.progress.almost");

  return (
    <div
      className={`imagegen-progress${compact ? " is-compact" : ""}`}
      data-testid="imagegen-progress"
      data-percent={progress.percent}
      data-stalled={progress.stalled ? "true" : "false"}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress.percent}
    >
      <div className="imagegen-progress-track">
        <div
          className={`imagegen-progress-fill${progress.stalled ? " is-stalled" : ""}`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="imagegen-progress-meta">
        <span className="imagegen-progress-percent">{progress.percent}%</span>
        <span>{t("window.imageGen.progress.elapsed", { seconds: elapsedSeconds })}</span>
        <span className="imagegen-progress-hint">{hint}</span>
      </div>
    </div>
  );
}
