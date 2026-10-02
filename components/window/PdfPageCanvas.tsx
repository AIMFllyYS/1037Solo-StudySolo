"use client";

import { useEffect, useRef } from "react";
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocumentProxy = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type PdfPageProxy = Awaited<ReturnType<PdfDocumentProxy["getPage"]>>;
type RenderTask = ReturnType<PdfPageProxy["render"]>;
type TextLayerInstance = InstanceType<PdfjsModule["TextLayer"]>;

/**
 * pdfjs legacy 包体积大且只跑在浏览器里，所以按需加载；模块级缓存保证多页共用同一次加载。
 */
let pdfjsModule: Promise<PdfjsModule> | null = null;
function loadPdfjs() {
  pdfjsModule ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsModule;
}

interface Props {
  pdf: PdfDocumentProxy;
  pageNumber: number;
  /** CSS 像素目标宽度；高度由该页自身比例决定 */
  displayWidth: number;
  onMeasured?: (pageNumber: number, size: { width: number; height: number }) => void;
  onError?: (pageNumber: number, error: unknown) => void;
  /** 并发闸门：渲染前 await acquireSlot()，渲染结束（含失败/取消）releaseSlot() */
  acquireSlot: () => Promise<void>;
  releaseSlot: () => void;
  onBitmapBytes?: (pageNumber:number,bytes:number)=>void;
}

/**
 * 连续页流里的单页：一块 canvas + 一层可选中的文本层。
 *
 * 清晰度的关键在这一层：位图按 devicePixelRatio 开，绘制指令用 pdf.js 的 transform 同步放大，
 * CSS 尺寸始终等于 CSS 像素宽度。这样外层再没有任何「把位图压小」的机会，高分屏才不会发虚。
 */
export default function PdfPageCanvas({
  pdf,
  pageNumber,
  displayWidth,
  onMeasured,
  onError,
  acquireSlot,
  releaseSlot,
  onBitmapBytes,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerRef = useRef<TextLayerInstance | null>(null);
  const textLayerHostRef = useRef<HTMLDivElement | null>(null);

  // 回调每次渲染都是新身份，进了依赖数组就会把整页渲染打成死循环；用 ref 取最新值。
  const callbacksRef = useRef({ acquireSlot, releaseSlot, onMeasured, onError,onBitmapBytes });
  useEffect(() => {
    callbacksRef.current = { acquireSlot, releaseSlot, onMeasured, onError,onBitmapBytes };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let cancelled = false;
    let holdingSlot = false;
    const unregister=registerResourceMetrics(()=>({mountedPdfPages:1,pdfBitmapBytes:canvas.width*canvas.height*4}));

    void (async () => {
      const { acquireSlot: acquire, releaseSlot: release, onMeasured: measured, onError: failed } = callbacksRef.current;
      try {
        await acquire();
        // 先记账再判取消：槽位只要拿到手就必须还回去，否则闸门会永久少一格。
        holdingSlot = true;
        if (cancelled) return;

        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: displayWidth / base.width });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);

        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        callbacksRef.current.onBitmapBytes?.(pageNumber,canvas.width*canvas.height*4);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const task = page.render({
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        measured?.(pageNumber, { width: viewport.width, height: viewport.height });

        // 文本层负责选中 / 复制 / Ctrl+F。它挂了不影响画布，所以单独兜底。
        try {
          const { TextLayer } = await loadPdfjs();
          if (cancelled) return;
          const container = document.createElement("div");
          container.className = "pdf-text-layer";
          // pdfjs 从容器上的这个变量算字号和层尺寸，不设的话文字全被算成 0 号。
          container.style.setProperty("--total-scale-factor", String(viewport.scale));
          host.appendChild(container);
          textLayerHostRef.current = container;
          const textLayer = new TextLayer({
            textContentSource: page.streamTextContent(),
            container,
            viewport,
          });
          textLayerRef.current = textLayer;
          await textLayer.render();
        } catch (textError) {
          console.debug("[PdfPageCanvas] 文本层渲染失败，仅保留画布", textError);
        }
      } catch (error) {
        // 取消是正常路径（缩放、换页、卸载都会走到这里），不往上抛。
        // 这里按 name 判断而不是 instanceof：生产包和测试桩不保证是同一个类。
        if (cancelled || (error as { name?: string } | null)?.name === "RenderingCancelledException") return;
        failed?.(pageNumber, error);
      } finally {
        if (holdingSlot) release();
      }
    })();

    return () => {
      cancelled = true;
      // 同一块 canvas 上的并发渲染会被 pdf.js 直接拒绝，重渲染前必须先取消上一次。
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerRef.current?.cancel();
      textLayerRef.current = null;
      textLayerHostRef.current?.remove();
      textLayerHostRef.current = null;
      canvas.width=0;canvas.height=0;
      callbacksRef.current.onBitmapBytes?.(pageNumber,0);
      unregister();
    };
  }, [pdf, pageNumber, displayWidth]);

  return (
    // .pdf-page 自己有相对定位，但文本层必须和画布严丝合缝，所以再包一层定位宿主。
    <div ref={hostRef} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="pdf-page-canvas" />
    </div>
  );
}
