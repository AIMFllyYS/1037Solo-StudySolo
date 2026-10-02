"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DocumentWorkspace, { type DocumentOutlineItem } from "@/components/window/DocumentWorkspace";
import PdfPageCanvas from "@/components/window/PdfPageCanvas";
import { useElementWidth } from "@/lib/hooks/useElementWidth";
import { scrollToElementTop } from "@/lib/window/scrollToElementTop";
import { translate, translateNow, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/stores/settings";
import {DEFAULT_RESOURCE_BUDGETS} from '@/lib/performance/budgets';

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocumentProxy = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type PdfOutlineNode = Awaited<ReturnType<PdfDocumentProxy["getOutline"]>> extends Array<infer T> | null ? T : never;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

async function sourceToData(src: string,signal?:AbortSignal): Promise<Uint8Array | { url: string }> {
  if (src.startsWith("blob:") || src.startsWith("http://") || src.startsWith("https://")) {
    return { url: src };
  }
  if (src.startsWith("data:")) {
    const response = await fetch(src,{signal});
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error(translateNow("panel.pdf.readFailed"));
}

function flattenOutline(
  nodes: PdfOutlineNode[] | null | undefined,
  pdf: PdfDocumentProxy,
): Promise<DocumentOutlineItem[]> {
  // 目录标题是「第 N 页」：纯函数里没有 hook，直接读当前语言。
  const locale = useSettings.getState().locale;
  const pageLabel = (page: number) => translate(locale, "panel.reader.page", { page });
  async function walk(items: PdfOutlineNode[], acc: DocumentOutlineItem[]): Promise<void> {
    for (const item of items) {
      let page = 1;
      try {
        const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : Array.isArray(item.dest) ? item.dest : null;
        if (dest?.[0]) page = (await pdf.getPageIndex(dest[0])) + 1;
      } catch {
        page = acc.length + 1;
      }
      acc.push({
        id: String(page),
        title: (item.title || pageLabel(page)).trim() || pageLabel(page),
        meta: pageLabel(page),
      });
      if (item.items?.length) await walk(item.items as PdfOutlineNode[], acc);
    }
  }
  if (!nodes?.length) {
    return Promise.resolve(
      Array.from({ length: pdf.numPages }, (_, index) => ({
        id: String(index + 1),
        title: pageLabel(index + 1),
      })),
    );
  }
  const acc: DocumentOutlineItem[] = [];
  return walk(nodes, acc).then(() => (acc.length ? acc : flattenOutline(null, pdf)));
}

interface PageSize {
  width: number;
  height: number;
}

interface LoadedDocument {
  pdf: PdfDocumentProxy;
  numPages: number;
  /** 首页的 1x 视口尺寸：其它页没量到之前用它估高度，滚动条长度才不会边渲染边跳。 */
  baseWidth: number;
  baseHeight: number;
}

interface LoadError {
  message: string;
  password: boolean;
}

/** 同时最多 3 页在渲染：再多就会跟滚动抢主线程，反而更卡。 */
const MAX_CONCURRENT_RENDERS = 3;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
/** 还没量到容器宽度（首帧、没有 ResizeObserver）时先按这个宽度排版。 */
const FALLBACK_BODY_WIDTH = 720;
/** 正文左右留白，别让纸张贴着滚动条。 */
const PAGE_GUTTER = 24;
/**
 * 页宽下限。必须低于「最窄真实容器 × fit-width」的结果，否则窄栏里 zoom 调到最小也装不下，
 * 页面会横向溢出且用户无法自救（Agent 右栏最窄时正文约 227px → fit-width 只有 203px）。
 * 低于下限时宁可让用户放大后自己横向滚动，也不要剥夺「适应宽度」这个能力。
 */
const MIN_DISPLAY_WIDTH = 160;
/** 视口上下各多挂 600px：滑动时下一页通常已经画好了。 */
const LAZY_ROOT_MARGIN = "600px 0px";
/** 画布驻留上限：视口(含 margin)约 2-6 页，余量覆盖快速滚动往返；超出即摘最远不可见页。 */
const MAX_MOUNTED_PAGES = 24;
/** 定位时页顶留一点空隙，免得页首文字贴着工具栏。 */
const SCROLL_TOP_OFFSET = 8;
/** 尺寸抖动小于 1% 就当没变，避免每次缩放都重渲染整条页流。 */
const SIZE_EPSILON = 0.01;
function fallbackPages(anchor:number,count:number){return new Set(Array.from({length:Math.min(count,anchor+3)-Math.max(1,anchor-2)+1},(_,index)=>Math.max(1,anchor-2)+index))}

export default function PdfDocumentPane({ src, name }: { src: string; name: string }) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const bodyWidth = useElementWidth(bodyRef);
  const [doc, setDoc] = useState<LoadedDocument | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [outline, setOutline] = useState<DocumentOutlineItem[]>([]);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(currentPage);
  useLayoutEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [mountedPages, setMountedPages] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [failedPages, setFailedPages] = useState<Record<number, string>>({});
  const pdfRef = useRef<PdfDocumentProxy | null>(null);
  const loadingTaskRef=useRef<ReturnType<PdfjsModule['getDocument']>|null>(null);
  const loadGeneration=useRef(0);
  const bitmapBytesRef=useRef(new Map<number,number>());
  const slotsRef = useRef({ active: 0, queue: [] as Array<() => void> });

  // 工具栏的百分比就是这个值的产物：屏幕上的实际宽度 ÷ 原始页宽。
  // 不再复述 pdf.js 的内部 scale，也不再有「写了 1 其实被外层压到 0.32」的读数。
  const displayWidth = Math.max(MIN_DISPLAY_WIDTH, ((bodyWidth || FALLBACK_BODY_WIDTH) - PAGE_GUTTER) * zoom);

  useEffect(() => {
    let cancelled = false;
    const generation=++loadGeneration.current,controller=new AbortController();
    let loadingTask:ReturnType<PdfjsModule['getDocument']>|null=null;
    let loadedPdf:PdfDocumentProxy|null=null;
    bitmapBytesRef.current.clear();
    const current=()=>!cancelled&&loadGeneration.current===generation;

    void (async () => {
      // 换源先把上一份的状态清干净，否则旧页码 / 旧尺寸会串到新文档上。
      setError(null);
      setDoc(null);
      setOutline([]);
      setCurrentPage(1);
      setPageSizes({});
      setMountedPages(new Set<number>());
      setFailedPages({});
      try {
        const pdfjs = await loadPdfjs();
        if(!current())return;
        const input = await sourceToData(src,controller.signal);
        if(!current())return;
        const task = pdfjs.getDocument(
          input instanceof Uint8Array
            ? { data: input, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }
            : { url: input.url, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" },
        );
        loadingTask=task;loadingTaskRef.current=task;
        const pdf = await task.promise;
        if (!current()) {
          await task.destroy().catch(()=>{});
          return;
        }
        loadingTask=null;if(loadingTaskRef.current===task)loadingTaskRef.current=null;
        loadedPdf=pdf;
        pdfRef.current = pdf;

        // 首页比例是后面所有占位高度的基准，所以先量它再宣布就绪。
        const base = (await pdf.getPage(1)).getViewport({ scale: 1 });
        const items = await flattenOutline(await pdf.getOutline(), pdf);
        if (!current()) return;
        setDoc({ pdf, numPages: pdf.numPages, baseWidth: base.width, baseHeight: base.height });
        setOutline(items);
      } catch (err) {
        if (!current()) return;
        if(loadingTask){await loadingTask.destroy().catch(()=>{});if(loadingTaskRef.current===loadingTask)loadingTaskRef.current=null;loadingTask=null}
        if(loadedPdf){await loadedPdf.destroy().catch(()=>{});if(pdfRef.current===loadedPdf)pdfRef.current=null;loadedPdf=null}
        // 加密 PDF 由 pdfjs 抛 PasswordException，给一句人能看懂的说明。
        setError({
          message: err instanceof Error ? err.message : translateNow("panel.pdf.openFailed"),
          password: (err as { name?: string } | null)?.name === "PasswordException",
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if(loadingTask){void loadingTask.destroy().catch(()=>{});if(loadingTaskRef.current===loadingTask)loadingTaskRef.current=null}
      if(loadedPdf){void loadedPdf.destroy().catch(()=>{});if(pdfRef.current===loadedPdf)pdfRef.current=null}
    };
  }, [src]);

  const acquireSlot = useCallback(() => {
    const slots = slotsRef.current;
    if (slots.active < MAX_CONCURRENT_RENDERS) {
      slots.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      // 让位时把计数加回去，release 只负责交棒。
      slots.queue.push(() => {
        slots.active += 1;
        resolve();
      });
    });
  }, []);

  const releaseSlot = useCallback(() => {
    const slots = slotsRef.current;
    slots.active = Math.max(0, slots.active - 1);
    // 卸载时不清队：排队的渲染已经作废，强行 resolve 只会让它误还一个槽位。
    slots.queue.shift()?.();
  }, []);

  const handleMeasured = useCallback((pageNumber: number, size: PageSize) => {
    setPageSizes((prev) => {
      const known = prev[pageNumber];
      if (
        known &&
        Math.abs(known.width - size.width) < known.width * SIZE_EPSILON &&
        Math.abs(known.height - size.height) < known.height * SIZE_EPSILON
      ) {
        return prev;
      }
      return { ...prev, [pageNumber]: size };
    });
  }, []);

  const handlePageError = useCallback((pageNumber: number, err: unknown) => {
    const message = err instanceof Error ? err.message : translateNow("panel.reader.unknownError");
    console.error(`[PdfDocumentPane] 第 ${pageNumber} 页渲染失败`, err);
    setFailedPages((prev) => (prev[pageNumber] === message ? prev : { ...prev, [pageNumber]: message }));
  }, []);
  const handleBitmapBytes=useCallback((pdf:PdfDocumentProxy,pageNumber:number,bytes:number)=>{
    if(pdfRef.current!==pdf)return
    if(bytes>0)bitmapBytesRef.current.set(pageNumber,bytes);else bitmapBytesRef.current.delete(pageNumber)
    const total=[...bitmapBytesRef.current.values()].reduce((sum,value)=>sum+value,0)
    if(total<=DEFAULT_RESOURCE_BUDGETS.pdfBitmapBytes)return
    setMountedPages(previous=>{
      const next=new Set(previous)
      let remaining=total
      for(const page of [...next].filter(page=>page!==currentPageRef.current&&!visiblePagesRef.current.has(page)).sort((a,b)=>Math.abs(b-currentPageRef.current)-Math.abs(a-currentPageRef.current))){
        if(remaining<=DEFAULT_RESOURCE_BUDGETS.pdfBitmapBytes)break
        next.delete(page);remaining-=bitmapBytesRef.current.get(page)??0
      }
      return next.size===previous.size?previous:next
    })
  },[]);

  // 进过视口的页才挂画布；挂载数有界——远离视口的页摘回占位（位图+textLayer 随组件卸载释放，
  // 长 PDF 的内存占用不再随页数线性增长，d5/B5-1）。可见页永不摘，避免视口里留白洞。
  const visiblePagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!doc) return;
    const body = bodyRef.current;
    const nodes = body ? Array.from(body.querySelectorAll<HTMLElement>("[data-pdf-page]")) : [];
    // Without IntersectionObserver keep a small current-page window, not every bitmap in a long PDF.
    if (!body || typeof IntersectionObserver === "undefined" || nodes.length === 0) {
      setMountedPages(fallbackPages(currentPageRef.current,doc.numPages));
      return;
    }
    const visible = visiblePagesRef.current;
    visible.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pdfPage);
          if (!Number.isFinite(pageNumber)) continue;
          if (entry.isIntersecting) visible.add(pageNumber);
          else visible.delete(pageNumber);
        }
        setMountedPages((prev) => {
          const next = new Set(prev);
          let dirty = false;
          for (const pageNumber of visible) {
            if (next.has(pageNumber)) continue;
            next.add(pageNumber);
            dirty = true;
          }
          // 超上限时摘「离当前可视区最远的不可见页」：页码距离是滚动距离的良好代理，
          // pageSizes 缓存让占位高度不变，滚动位置不跳。
          if (next.size > MAX_MOUNTED_PAGES) {
            const anchor = visible.size ? Math.min(...visible) : 1;
            const evictable = [...next]
              .filter((pageNumber) => !visible.has(pageNumber))
              .sort((a, b) => Math.abs(b - anchor) - Math.abs(a - anchor));
            while (next.size > MAX_MOUNTED_PAGES && evictable.length > 0) {
              next.delete(evictable.shift()!);
              dirty = true;
            }
          }
          return dirty ? next : prev;
        });
      },
      { root: body, rootMargin: LAZY_ROOT_MARGIN },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [doc]);

  // 当前页 = 页首离容器顶部最近的那一页；滚动事件用 rAF 节流，每帧最多算一次。
  useEffect(() => {
    if (!doc) return;
    const body = bodyRef.current;
    if (!body) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const pages = body.querySelectorAll<HTMLElement>("[data-pdf-page]");
      if (!pages.length) return;
      const bodyTop = body.getBoundingClientRect().top;
      let best = 1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const page of pages) {
        const distance = Math.abs(page.getBoundingClientRect().top - bodyTop);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = Number(page.dataset.pdfPage) || best;
      }
      setCurrentPage((prev) => (prev === best ? prev : best));
      if(typeof IntersectionObserver==='undefined')setMountedPages(fallbackPages(best,doc.numPages));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [doc]);

  const scrollToPage = useCallback((pageNumber: number) => {
    const body = bodyRef.current;
    const target = body?.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`);
    if (!body || !target) return;
    scrollToElementTop(body, target, SCROLL_TOP_OFFSET);
    // 滚动事件要等下一帧，先给工具栏一个即时反馈。
    setCurrentPage(pageNumber);
    if(doc&&typeof IntersectionObserver==='undefined')setMountedPages(fallbackPages(pageNumber,doc.numPages));
  }, [doc]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13px] font-semibold text-[var(--ink)]">
          {t(error.password ? "panel.pdf.password" : "panel.pdf.renderFailed")}
        </p>
        <p className="max-w-sm text-[12px] leading-6 text-[var(--ink-soft)]">{error.message}</p>
      </div>
    );
  }

  const pageHeight = (pageNumber: number) => {
    const size = pageSizes[pageNumber];
    const width = size?.width ?? doc?.baseWidth ?? 1;
    const height = size?.height ?? doc?.baseHeight ?? 1;
    return displayWidth * (height / width);
  };

  return (
    <DocumentWorkspace
      outline={outline}
      activeId={String(currentPage)}
      onSelect={(id) => scrollToPage(Number(id) || 1)}
      outlineLabel={t("panel.reader.outlineOf", { name })}
      layoutKey="pdf"
      bodyRef={bodyRef}
      toolbar={
        doc ? (
          <>
            <button
              type="button"
              data-no-drag
              title={t("panel.reader.prevPage")}
              disabled={currentPage <= 1}
              onClick={() => scrollToPage(currentPage - 1)}
            >
              <ChevronLeft size={13} />
            </button>
            <span>
              {currentPage} / {doc.numPages}
            </span>
            <button
              type="button"
              data-no-drag
              title={t("panel.reader.nextPage")}
              disabled={currentPage >= doc.numPages}
              onClick={() => scrollToPage(currentPage + 1)}
            >
              <ChevronRight size={13} />
            </button>
            <span className="mx-1 h-3 w-px bg-[var(--line)]" />
            <button
              type="button"
              data-no-drag
              title={t("panel.reader.zoomOut")}
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((value) => Math.max(MIN_ZOOM, Number((value - ZOOM_STEP).toFixed(2))))}
            >
              −
            </button>
            <span>{Math.round((displayWidth / doc.baseWidth) * 100)}%</span>
            <button
              type="button"
              data-no-drag
              title={t("panel.reader.zoomIn")}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((value) => Math.min(MAX_ZOOM, Number((value + ZOOM_STEP).toFixed(2))))}
            >
              +
            </button>
            <button type="button" data-no-drag title={t("panel.reader.reset")} onClick={() => setZoom(1)}>
              {t("panel.reader.reset")}
            </button>
          </>
        ) : null
      }
    >
      <div className="pdf-pages">
        {doc ? (
          Array.from({ length: doc.numPages }, (_, index) => {
            const pageNumber = index + 1;
            const failure = failedPages[pageNumber];
            const mounted = mountedPages.has(pageNumber);
            return (
              <div
                key={pageNumber}
                data-pdf-page={pageNumber}
                className={clsx("pdf-page", (!mounted || failure) && "is-placeholder")}
                style={{ width: displayWidth, height: pageHeight(pageNumber) }}
              >
                {failure ? (
                  <p className="pdf-pages-status">{t("panel.reader.pageRenderFailed", { page: pageNumber, error: failure })}</p>
                ) : mounted ? (
                  <PdfPageCanvas
                    pdf={doc.pdf}
                    pageNumber={pageNumber}
                    displayWidth={displayWidth}
                    onMeasured={handleMeasured}
                    onError={handlePageError}
                    acquireSlot={acquireSlot}
                    releaseSlot={releaseSlot}
                    onBitmapBytes={(page,bytes)=>handleBitmapBytes(doc.pdf,page,bytes)}
                  />
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="pdf-pages-status">{t("panel.pdf.loading")}</p>
        )}
      </div>
    </DocumentWorkspace>
  );
}
