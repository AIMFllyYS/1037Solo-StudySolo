"use client";

import { useState } from "react";
import { AgentImageIcon, AgentFileIcon, AgentCheckIcon, AgentCloseIcon } from "@/components/icons/AgentIcons";
import { useImageGen } from "@/lib/stores/assets/imageGen";
import { MessageContent } from "@/components/chat/messages/MessageContent";
import ImageGenProgressBar from "@/components/chat/products/ImageGenProgressBar";
import { useImageGenProgress } from "@/lib/hooks/files/useImageGenProgress";
import { useT } from "@/lib/i18n/index";

/**
 * AI 生图请求批准卡片：内嵌在助教对话气泡中，展示生图提示词、尺寸、数量，
 * 等待用户「批准」后才打开独立弹窗调用 /api/image-gen 实际生成图片。
 *
 * 与 ArtifactCard（自动生成）不同：生图涉及实际付费（¥0.10/张），故必须用户主动批准。
 */
export default function ImageGenCard({
  imageGenId,
  prompt,
  title,
  size,
  count,
  modelId,
}: {
  imageGenId: string;
  prompt?: string;
  title?: string;
  size?: string;
  count?: number;
  modelId?: string;
}) {
  const session = useImageGen((s) => s.sessions[imageGenId]);
  const openViewer = useImageGen((s) => s.openViewer);
  const bringToFront = useImageGen((s) => s.bringToFront);
  const [cancelled, setCancelled] = useState(false);
  const t = useT();

  const effectivePrompt = session?.prompt ?? prompt ?? "";
  const effectiveTitle = session?.title ?? title ?? t("window.imageGen.card.defaultTitle");
  const effectiveSize = session?.size ?? size ?? "1024x1024";
  const effectiveCount = session?.count ?? count ?? 1;

  const status = session?.status ?? "idle";
  const isApproved = status !== "idle";
  const hasImages = session?.images && session.images.length > 0;
  const progress = useImageGenProgress(session);

  const onApprove = () => {
    setCancelled(false);
    // 批准是**付费闸门**：只有这里把 approve 传下去，图窗才会开出来就开跑。
    // 其它入口（右上参考列）建会话时不带这个标记，图窗会停下来等用户再确认一次。
    openViewer(
      {
        id: imageGenId,
        prompt: effectivePrompt,
        title: effectiveTitle,
        size: effectiveSize,
        count: effectiveCount,
        modelId,
      },
      { approve: true },
    );
  };

  const onReopen = () => {
    bringToFront(imageGenId);
  };

  const onCancel = () => {
    setCancelled(true);
  };

  if (cancelled && !isApproved) {
    return (
      <div
        className="my-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]"
        style={{
          borderColor: "var(--md-sys-color-outline-variant)",
          background: "var(--md-sys-color-surface-container)",
          color: "var(--md-sys-color-on-surface-variant)",
        }}
      >
        <AgentCloseIcon size={14} />
        <span>{t("window.imageGen.card.cancelled", { title: effectiveTitle })}</span>
      </div>
    );
  }

  return (
    <div
      className="my-2 overflow-hidden rounded-xl border"
      style={{
        borderColor: "var(--md-sys-color-tertiary)",
        background:
          "color-mix(in srgb, var(--md-sys-color-tertiary) 8%, var(--md-sys-color-surface))",
      }}
    >
      {/* 头部 */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <AgentImageIcon
          size={15}
          className="shrink-0"
          style={{ color: "var(--md-sys-color-tertiary)" }}
        />
        <span
          className="min-w-0 flex-1 truncate text-[12.5px] font-semibold"
          style={{ color: "var(--md-sys-color-on-surface)" }}
        >
          {isApproved ? t("window.imageGen.card.approved", { title: effectiveTitle }) : t("window.imageGen.card.proposed", { title: effectiveTitle })}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background:
              "color-mix(in srgb, var(--md-sys-color-tertiary) 15%, transparent)",
            color: "var(--md-sys-color-tertiary)",
          }}
        >
          {t("window.imageGen.sizeCount", { size: effectiveSize, count: effectiveCount })}
        </span>
      </div>

      {/* 提示词预览（富文本渲染，与 ArtifactCard 一致） */}
      {effectivePrompt && (
        <div
          className="chat-prose px-3 py-2 text-[11.5px]"
          style={{
            color: "var(--md-sys-color-on-surface-variant)",
            background: "color-mix(in srgb, var(--md-sys-color-tertiary) 4%, transparent)",
            borderTop: "1px solid color-mix(in srgb, var(--md-sys-color-tertiary) 18%, transparent)",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            <AgentFileIcon size={11} className="inline align-text-bottom" /> {t("window.imageGen.card.promptPrefix")}
          </span>
          <MessageContent content={effectivePrompt} enableVisualizations={false} preserveLineBreaks />
        </div>
      )}

      {/* 生成中：卡片上也能看到进度，不必打开弹窗 */}
      {status === "loading" && (
        <div
          className="px-3 pb-1 pt-2"
          style={{ borderTop: "1px solid color-mix(in srgb, var(--md-sys-color-tertiary) 18%, transparent)" }}
        >
          <ImageGenProgressBar progress={progress} compact />
        </div>
      )}

      {/* 操作区 */}
      <div
        className="flex items-center gap-2 border-t px-3 py-2"
        style={{
          borderColor: "color-mix(in srgb, var(--md-sys-color-tertiary) 18%, transparent)",
        }}
      >
        {!isApproved ? (
          <>
            <button
              type="button"
              onClick={onApprove}
              className="press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--md-sys-color-tertiary)",
                color: "var(--md-sys-color-on-tertiary)",
              }}
            >
              <AgentCheckIcon size={13} /> {t("window.imageGen.card.approve")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="press inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium"
              style={{
                borderColor: "var(--md-sys-color-outline-variant)",
                color: "var(--md-sys-color-on-surface-variant)",
              }}
            >
              <AgentCloseIcon size={13} /> {t("common.cancel")}
            </button>
            <span
              className="ml-auto text-[10.5px]"
              style={{ color: "var(--md-sys-color-on-surface-variant)" }}
            >
              {t("window.imageGen.card.approveHint")}
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onReopen}
              className="press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--md-sys-color-tertiary)",
                color: "var(--md-sys-color-on-tertiary)",
              }}
            >
              <AgentImageIcon size={13} />{" "}
              {status === "loading" && t("window.imageGen.card.generating")}
              {status === "done" && (hasImages ? t("window.imageGen.card.viewImages") : t("window.imageGen.card.generated"))}
              {status === "error" && t("window.imageGen.card.viewError")}
            </button>
            <span
              className="ml-auto text-[10.5px]"
              style={{ color: "var(--md-sys-color-on-surface-variant)" }}
            >
              {status === "loading" && t("window.imageGen.card.working")}
              {status === "done" && hasImages && t("window.imageGen.card.generatedCount", { count: session?.images.length ?? 0 })}
              {status === "error" && t("window.imageGen.card.errorHint")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
