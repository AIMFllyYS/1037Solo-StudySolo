"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from "lucide-react";
import { useLightbox } from "@/lib/stores/lightbox";
import { safeImageSrc } from "@/components/browser/safeUrl";
import { createObjectUrlLease } from "@/lib/resources/objectUrl";
import { useOverlayRegistration } from "@/lib/keyboard/useOverlayRegistration";
import { useT } from "@/lib/i18n";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const STEP = 1.2;

/** data URL / 远程 URL 都尽量给一个像样的文件名，而不是一律 "image.png"。 */
function downloadName(src: string, alt: string): string {
  const base = (alt || "image")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .slice(0, 60) || "image";
  const ext = src.startsWith("data:image/")
    ? (src.slice(11).split(/[;,]/, 1)[0] || "png").replace("jpeg", "jpg")
    : (src.split("?")[0].split(".").pop() ?? "").toLowerCase();
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "png";
  return `${base}.${safeExt}`;
}

function triggerAnchorDownload(href: string, name: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 图片灯箱。
 *
 * 用户口径：预览图片时**必须要能调大小**（这是最难受的缺失），并且工具栏要看得见。
 * 所以这里做三件事：
 * 1. 工具栏贴在**图片下方**（Mac 弹窗里改用右上角，见 store 的 LightboxToolbar）；
 * 2. 滚轮直接缩放（不再要求按住 Ctrl —— 灯箱是模态的，不存在"页面还要滚"的冲突），
 *    并且**以光标为锚点**缩放，指哪儿放大哪儿；
 * 3. 放大/缩小/重置/下载四个动作齐全，下载失败退化成新标签页打开。
 */
export function ImageLightbox() {
  const t = useT();
  const { src, alt, toolbar, close } = useLightbox();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  /**
   * 缩放要读"当前"值，但 wheel 监听器只挂一次 —— 用 ref 镜像，避免读到过期闭包。
   * ref 只在事件与 effect 里写：render 期写 ref 是 React 19 明确禁止的（会拿不到最新渲染）。
   */
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  useEffect(() => {
    viewRef.current = { zoom, pan };
  }, [zoom, pan]);

  useOverlayRegistration({ id: "image-lightbox", open: !!src, onClose: close, priority: 90 });

  const [activeSrc, setActiveSrc] = useState(src);
  if (src !== activeSrc) {
    setActiveSrc(src);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    if (src) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [src]);

  /** 以 (cx, cy) 为锚点缩放：锚点下的那块内容保持不动，这是"能用鼠标调大小"的关键。 */
  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const current = viewRef.current;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor));
    const ratio = next / current.zoom;
    const originX = cx ?? (typeof window === "undefined" ? 0 : window.innerWidth / 2);
    const originY = cy ?? (typeof window === "undefined" ? 0 : window.innerHeight / 2);
    const dx = originX - (typeof window === "undefined" ? 0 : window.innerWidth / 2);
    const dy = originY - (typeof window === "undefined" ? 0 : window.innerHeight / 2);
    const pan = {
      x: dx - (dx - current.pan.x) * ratio,
      y: dy - (dy - current.pan.y) * ratio,
    };
    viewRef.current = { zoom: next, pan };
    setZoom(next);
    setPan(pan);
  }, []);

  // wheel 必须是非 passive 的原生监听：React 的 onWheel 在根节点上是 passive 的，preventDefault 无效。
  useEffect(() => {
    if (!src) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.deltaY > 0 ? 1 / STEP : STEP, event.clientX, event.clientY);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [src, zoomAt]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...viewRef.current.pan };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const pan = {
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y),
    };
    // 同步写 ref：下一次 pointerdown 要读它，等 effect 落地就晚了（会跳一下）。
    viewRef.current = { zoom: viewRef.current.zoom, pan };
    setPan(pan);
  }, [isDragging]);

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  const toggleZoom = useCallback(() => {
    const current = viewRef.current.zoom;
    if (current > 1.01) {
      viewRef.current = { zoom: 1, pan: { x: 0, y: 0 } };
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    zoomAt(2);
  }, [zoomAt]);

  const resetView = useCallback(() => {
    viewRef.current = { zoom: 1, pan: { x: 0, y: 0 } };
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleDownload = useCallback(async () => {
    if (!src) return;
    const name = downloadName(src, alt);
    if (src.startsWith("data:")) {
      triggerAnchorDownload(src, name);
      return;
    }
    try {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const lease = createObjectUrlLease(blob);
      try { triggerAnchorDownload(lease.url, name); }
      finally {
        // 立刻 revoke 会让下载拿不到数据，留一段时间再回收。
        window.setTimeout(() => lease.release(), 10_000);
      }
    } catch {
      // 跨域拿不到 blob 时不要静默失败：退化成新标签页打开，用户还能自己右键保存。
      const safeSrc = safeImageSrc(src);
      if (safeSrc) window.open(safeSrc, "_blank", "noopener,noreferrer");
    }
  }, [alt, src]);

  if (!src) return null;

  return createPortal(
    <div
      className="image-lightbox-backdrop"
      data-toolbar={toolbar}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={alt || t("app.lightbox.label")}
    >
      <button
        className="image-lightbox-close"
        onClick={close}
        aria-label={t("app.lightbox.close")}
        type="button"
      >
        <X size={24} />
      </button>

      <div className="image-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="image-lightbox-img"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "zoom-in",
          }}
          onClick={toggleZoom}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          draggable={false}
        />

        {/* 工具栏：默认贴在图片下方；Mac 弹窗里由 [data-toolbar="top-right"] 挪到窗口右上角。 */}
        <div className="image-lightbox-controls" role="toolbar" aria-label={t("app.lightbox.label")}>
          <button onClick={() => zoomAt(1 / STEP)} aria-label={t("app.lightbox.zoomOut")} title={t("app.lightbox.zoomOut")} type="button">
            <ZoomOut size={18} />
          </button>
          <span className="image-lightbox-zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomAt(STEP)} aria-label={t("app.lightbox.zoomIn")} title={t("app.lightbox.zoomIn")} type="button">
            <ZoomIn size={18} />
          </button>
          <span className="image-lightbox-divider" aria-hidden />
          <button onClick={resetView} aria-label={t("app.lightbox.reset")} title={t("app.lightbox.reset")} type="button">
            <RotateCcw size={18} />
          </button>
          <button
            onClick={() => void handleDownload()}
            aria-label={t("app.lightbox.download")}
            title={t("app.lightbox.download")}
            data-testid="lightbox-download"
            type="button"
          >
            <Download size={18} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
