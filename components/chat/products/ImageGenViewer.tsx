"use client";

import { captureStorageOperation } from '@/lib/storage/ownerScope';
import { freezeGeneratedImages } from '@/lib/assets/freezeImages';
import { useEffect, useRef, useCallback } from "react";
import { Download, ImagePlus, RefreshCw, AlertTriangle, Check as AgentCheckIcon } from "lucide-react";
import { useImageGen, imageGenWindowId, acquireImageGenLease, hydrateImageGenImages, type ImageGenImage } from "@/lib/stores/assets/imageGen";
import { useSettings } from "@/lib/stores/settings";
import { useBillingStore, createBillingRecord } from "@/lib/stores/billing";
import { useLightbox } from "@/lib/stores/workspace/lightbox";
import ManagedWindow from "@/components/window/ManagedWindow";
import { safeImageSrc } from "@/components/browser/safeUrl";
import { createObjectUrlLease } from "@/lib/resources/objectUrl";
import { formatImageGenError, imageGenErrorHeading } from "@/lib/ai/images/imageGenError";
import { capabilityNeedsForImageGen, selectCapabilityEndpointsForRequest } from "@/lib/ai/endpoints/capabilityEndpoints";
import { getModelInfoWithCustom, selectCustomApiGroupsForRequest } from "@/lib/ai/models";
import ImageGenProgressBar from "@/components/chat/products/ImageGenProgressBar";
import { useImageGenProgress } from "@/lib/hooks/files/useImageGenProgress";
import { useT } from "@/lib/i18n/index";
import { WatercolorLoading } from "./imageGen/WatercolorLoading";
/** 将归一化图片项转为可渲染的 src：优先 url，回退 b64_json data URL。 */
function imageSrc(img: ImageGenImage): string {
  if (img.url) return img.url;
  if (img.b64_json) return `data:image/png;base64,${img.b64_json}`;
  return "";
}

function ImageGenViewerSingle({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    const release = acquireImageGenLease(sessionId);
    void hydrateImageGenImages(sessionId);
    return release;
  }, [sessionId]);
  const session = useImageGen((s) => s.sessions[sessionId] ?? null);
  const closeViewer = useImageGen((s) => s.closeViewer);
  const startLoading = useImageGen((s) => s.startLoading);
  const updateSession = useImageGen((s) => s.updateSession);
  const openLightbox = useLightbox((s) => s.open);
  const t = useT();
  const requestStartedRef = useRef(false);

  const winId = imageGenWindowId(sessionId);

  const triggerGenerate = useCallback(
    async (sid: string) => {
      const cur = useImageGen.getState().sessions[sid];
      if (!cur) return;
      const operation = captureStorageOperation(sid);
      requestStartedRef.current = true;
      // 先读设置：进度条要用"这次到底会落到哪个模型"的典型耗时来估算。
      const settings = useSettings.getState();
      const progressModelId = cur.modelId || settings.defaultImageModelId || settings.selectedModelId;
      const expectedMs = getModelInfoWithCustom(progressModelId, settings.customApiGroups)?.imageParams?.expectedMs;
      startLoading(sid, expectedMs);

      try {
        const imageModelId = cur.modelId || settings.selectedModelId;
        const res = await fetch("/api/image-gen", {
          method: "POST",
          signal: operation.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: imageModelId,
            prompt: cur.prompt,
            size: cur.size,
            count: cur.count,
            customApiGroups: selectCustomApiGroupsForRequest(
              settings.customApiGroups,
              imageModelId,
              cur.modelId ? null : settings.defaultImageModelId,
            ),
            defaultImageModelId: cur.modelId ? null : settings.defaultImageModelId,
            capabilityEndpoints: selectCapabilityEndpointsForRequest(
              settings.capabilityEndpoints,
              capabilityNeedsForImageGen(),
            ),
          }),
        });

        if (!operation.isCurrent()) return;
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          if (!operation.isCurrent()) return;
          updateSession(sid, {
            status: "error",
            error: formatImageGenError(res.status, errBody),
          });
          return;
        }

        const data = await res.json();
        if (!operation.isCurrent()) return;
        if (!Array.isArray(data?.images) || data.images.length===0) {
          updateSession(sid, { status: "error", error: t("window.imageGen.badResponse") });
          return;
        }

        // 记录生图计费：用 registryId（custom:xxx:yyy 或内置 id）才能正确解析定价与供应商
        useBillingStore.getState().addRecord(createBillingRecord({
          type: 'image',
          modelId: data.registryId || data.model || imageModelId,
          sessionId: sid,
          customGroups: settings.customApiGroups,
          imageCount: data.images.length
        }));

        updateSession(sid, { status: 'error', images: data.images, error: '图片已生成，正在保存原图；此保留稿尚未同步。' });
        const frozen = await freezeGeneratedImages(data.images, operation.signal);
        if (!operation.isCurrent()) return;
        updateSession(sid, { status: "done", images: frozen, error: undefined });
      } catch (err) {
        if (!operation.isCurrent()) return;
        updateSession(sid, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [startLoading, updateSession, t],
  );

  useEffect(() => {
    if (!session) return;
    if (session.status !== "idle") return;
    // 没有用户批准（从参考列点进来的）就先停住：付费动作不能因为"打开看了一眼"就开跑。
    if (!session.autoStart) return;
    if (requestStartedRef.current) return;
    void triggerGenerate(sessionId);
  }, [session, sessionId, triggerGenerate]);

  const handleCloseViewer = useCallback(() => closeViewer(sessionId), [closeViewer, sessionId]);

  /** 图窗内的二次确认：标记 autoStart 之后 effect 会接着把生成跑起来。 */
  const confirmStart = useCallback(() => {
    updateSession(sessionId, { autoStart: true });
  }, [sessionId, updateSession]);

  // Hook 必须在任何早返回之前调用（session 为 null 时它自己返回零进度）。
  const progress = useImageGenProgress(session);

  if (!session) return null;

  if (session.status === "idle" && !session.autoStart) {
    return (
      <ManagedWindow
        windowId={winId}
        title={session.title}
        icon={<ImagePlus size={15} />}
        onClose={handleCloseViewer}
        fullscreenTarget="notes"
        minSize={{ minW: 380, minH: 360 }}
        overlayId={`image-gen-viewer-${sessionId}`}
        bodyClassName="flex flex-col"
        unmountWhenMinimized
      >
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
          <ImagePlus size={22} className="text-[var(--md-sys-color-tertiary)]" />
          <p className="text-[13px] font-semibold text-[var(--md-sys-color-on-surface)]">
            {t("window.imageGen.confirm.title")}
          </p>
          <p className="max-w-[42ch] text-[12px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {t("window.imageGen.confirm.hint")}
          </p>
          <p className="max-w-[46ch] break-words rounded-lg bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {session.prompt}
          </p>
          <button
            type="button"
            onClick={confirmStart}
            data-testid="image-gen-confirm-start"
            className="press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold"
            style={{
              background: "var(--md-sys-color-tertiary)",
              color: "var(--md-sys-color-on-tertiary)",
            }}
          >
            <AgentCheckIcon size={14} /> {t("window.imageGen.confirm.start")}
          </button>
          <span className="text-[10.5px] text-[var(--md-sys-color-on-surface-variant)]">
            {t("window.imageGen.sizeCount", { size: session.size, count: session.count })}
          </span>
        </div>
      </ManagedWindow>
    );
  }

  const handleRetry = () => {
    requestStartedRef.current = false;
    void triggerGenerate(sessionId);
  };

  const downloadImage = async (src: string, idx: number) => {
    try {
      // b64_json data URL 直接触发下载，无需 fetch（避免大 base64 二次请求）
      if (src.startsWith("data:")) {
        const a = document.createElement("a");
        a.href = src;
        a.download = `${session.title || "image"}-${idx + 1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const res = await fetch(src);
      const blob = await res.blob();
      const lease = createObjectUrlLease(blob);
      const a = document.createElement("a");
      a.href = lease.url;
      a.download = `${session.title || "image"}-${idx + 1}.png`;
      document.body.appendChild(a);
      try { a.click(); }
      finally { document.body.removeChild(a); setTimeout(() => lease.release(), 10_000); }
    } catch {
      const safeSrc = safeImageSrc(src);
      if (safeSrc) window.open(safeSrc, "_blank", "noopener");
    }
  };

  const isLoading = session.status === "loading" || session.status === "idle";
  const isDone = session.status === "done";
  const isError = session.status === "error";
  const placeholderCount = Math.max(1, session.count || 1);
  const gridCols = placeholderCount === 1 ? 1 : 2;

  return (
    <ManagedWindow
      windowId={winId}
      title={session.title}
      icon={<ImagePlus size={15} />}
      onClose={handleCloseViewer}
      fullscreenTarget="notes"
      minSize={{ minW: 380, minH: 360 }}
      overlayId={`image-gen-viewer-${sessionId}`}
      bodyClassName="flex flex-col"
      unmountWhenMinimized
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          className="shrink-0 border-b px-4 py-2 text-[11.5px]"
          style={{
            borderColor: "var(--md-sys-color-outline-variant)",
            background: "var(--md-sys-color-surface-container-low)",
            color: "var(--md-sys-color-on-surface-variant)",
          }}
        >
          <span style={{ fontWeight: 600 }}>{t("window.imageGen.promptLabel")}</span>
          <span className="break-words">{session.prompt}</span>
          <span
            className="ml-2 inline-block rounded px-1 text-[10px]"
            style={{ background: "var(--md-sys-color-surface-container-high)" }}
          >
            {t("window.imageGen.sizeCount", { size: session.size, count: session.count })}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {isLoading && (
            <div className="flex flex-col">
              {/* 进度条放在占位图之上：估算百分比 + 已等待秒数，卡到 99% 也不冲到底。 */}
              <div className="px-4 pt-4">
                <ImageGenProgressBar progress={progress} />
              </div>
              <WatercolorLoading count={placeholderCount} />
            </div>
          )}

          {isError && session.images.length>0 && <button className="m-3 underline text-sm" onClick={()=>{
            const operation=captureStorageOperation(sessionId);
            void freezeGeneratedImages(session.images,operation.signal).then(images=>{if(operation.isCurrent())updateSession(sessionId,{status:'done',images,error:undefined});}).catch(error=>{if(operation.isCurrent())updateSession(sessionId,{error:error.message});});
          }}>重试保存原图（不会重新生成）</button>}
          {isError && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <AlertTriangle size={36} style={{ color: "var(--md-sys-color-error)" }} />
              <div
                className="text-[13px] font-semibold"
                style={{ color: "var(--md-sys-color-on-surface)" }}
              >
                {imageGenErrorHeading(session.error)}
              </div>
              <div
                className="max-w-md text-[12px] leading-relaxed"
                style={{ color: "var(--md-sys-color-on-surface-variant)" }}
              >
                {session.error || t("window.imageGen.unknownError")}
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                style={{
                  background: "var(--md-sys-color-primary)",
                  color: "var(--md-sys-color-on-primary)",
                }}
              >
                <RefreshCw size={13} /> {t("common.retry")}
              </button>
            </div>
          )}

          {(isDone || isError) && session.images.length > 0 && (
            <div
              className="grid gap-3 p-4"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {session.images.map((img, idx) => {
                const src = imageSrc(img);
                return (
                <div
                  key={idx}
                  className="group relative overflow-hidden rounded-xl border"
                  style={{
                    borderColor: "var(--md-sys-color-outline-variant)",
                    background: "var(--md-sys-color-surface-container-low)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${session.title} ${idx + 1}`}
                    className="w-full cursor-zoom-in"
                    style={{ display: "block" }}
                    onClick={() => openLightbox(src, session.title, { toolbar: "top-right" })}
                  />
                  <button
                    type="button"
                    onClick={() => downloadImage(src, idx)}
                    title={t("window.common.downloadImage")}
                    className="press absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      background: "var(--md-sys-color-surface)",
                      color: "var(--md-sys-color-on-surface)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    }}
                  >
                    <Download size={13} />
                  </button>
                </div>
                );
              })}
            </div>
          )}

          {isDone && session.images.length === 0 && (
            <div
              className="flex h-full items-center justify-center text-[12px]"
              style={{ color: "var(--md-sys-color-on-surface-variant)" }}
            >
              {t("window.imageGen.empty")}
            </div>
          )}
        </div>

        {isDone && (
          <div
            className="shrink-0 border-t px-3 py-2"
            style={{ borderColor: "var(--md-sys-color-outline-variant)" }}
          >
            <button
              type="button"
              onClick={handleRetry}
              className="press inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium"
              style={{
                borderColor: "var(--md-sys-color-outline-variant)",
                color: "var(--md-sys-color-on-surface-variant)",
              }}
            >
              <RefreshCw size={13} /> {t("window.imageGen.regenerate")}
            </button>
            {session.images.some((img) => img.url && !img.b64_json) && (
              <span
                className="ml-3 text-[10.5px]"
                style={{ color: "var(--md-sys-color-on-surface-variant)" }}
              >
                {t("window.imageGen.urlExpiry")}
              </span>
            )}
          </div>
        )}
      </div>
    </ManagedWindow>
  );
}

export default function ImageGenViewerLayer() {
  const openIds = useImageGen((s) => s.openIds);
  return (
    <>
      {openIds.map((id) => (
        <ImageGenViewerSingle key={id} sessionId={id} />
      ))}
    </>
  );
}