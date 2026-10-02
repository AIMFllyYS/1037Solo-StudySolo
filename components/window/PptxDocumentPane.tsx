"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Presentation } from "lucide-react";
import DocumentWorkspace from "@/components/window/DocumentWorkspace";
import { parsePptxSlideBytes, type PptxSlideText } from "@/lib/chat/parsePptx";
import {
  createSlideSlots,
  mountRenderedSlide,
  slideDisplayHeight,
  topmostSlotIndex,
  type PptxSlideMetrics,
} from "@/lib/chat/pptxSlideList";
import { useElementWidth } from "@/lib/hooks/useElementWidth";
import { scrollToElementTop } from "@/lib/window/scrollToElementTop";
import { translate, translateNow, useT } from "@/lib/i18n";
import { useSettings } from "@/lib/stores/settings";
import {disposePptxPreviewer,trackPptxMedia} from '@/lib/resources/pptxPreviewLease';
import {registerResourceMetrics} from '@/lib/performance/resourceMetrics';
import {DEFAULT_RESOURCE_BUDGETS} from '@/lib/performance/budgets';

/** 首帧 / 没有 ResizeObserver 时的兜底可用宽度。 */
const FALLBACK_WIDTH = 720;
/** 宽度抖动小于它就沿用当前预览器：重建要重新解析整份课件，不值得为 1px 付这个代价。 */
const WIDTH_EPSILON = 8;
/** .pptx-pages 左右各这么多 padding（见 app/styles/pptx-reader.css）。两边都要扣掉：
 *  容器是 width:max-content + border-box，槽位宽度决定容器宽度，不扣就会横向溢出。 */
const PAGES_GUTTER = 12;
/** 懒渲染提前量：视口上下各 800px 内的页提前渲染好，滚过去时不会看到空槽。 */
const PRELOAD_MARGIN = "800px 0px";
/** 「跳到第 N 页」时目标页离容器顶留这么多像素，别把页眉贴死在边上。 */
const SCROLL_TOP_OFFSET = 8;
/** 显示宽放大到渲染宽的这个倍数以上才真重建预览器；
 *  之下走 CSS scale——重建一次 = 重取 buffer + 重解析 + 逐页重渲，拖拽期绝不能随动。 */
const REBUILD_SCALE_UP = 1.5;

interface PptxDeck {
  width: number;
  height: number;
  slides: unknown[];
  medias?:Record<string,string>;
}

/** pptx-preview 1.0.7 里我们真正用到的那几个成员（发行包类型没有描述完整形状）。 */
interface PptxPreviewer {
  wrapper: HTMLElement;
  pptx?: PptxDeck;
  htmlRender: { renderSlide: (index: number) => void };
  load: (buffer: ArrayBuffer) => Promise<PptxDeck>;
  preview: (buffer: ArrayBuffer) => Promise<unknown>;
  destroy: () => void;
}

async function sourceToBuffer(src: string,signal?:AbortSignal): Promise<ArrayBuffer> {
  if (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("http://") ||
    src.startsWith("https://")
  ) {
    // data: 也走 fetch：几十兆的课件同步 atob 解码会把主线程卡住几百毫秒。
    const response = await fetch(src,src.startsWith('data:')?undefined:{signal});
    return response.arrayBuffer();
  }
  throw new Error(translateNow("panel.pptx.readFailed"));
}

function deckMetrics(deck: PptxDeck): PptxSlideMetrics {
  return { count: deck.slides.length, deckWidth: deck.width, deckHeight: deck.height };
}

/** 单页渲染失败时的文字回退卡：至少能读，不影响同列其它页。 */
function renderTextFallback(slot: HTMLElement, number: number, text: string) {
  const doc = slot.ownerDocument;
  slot.classList.add("is-text");
  // 截图不成，槽位就不该继续占着整页高度。
  slot.style.height = "auto";
  const label = doc.createElement("span");
  label.className = "pptx-page-fallback-label";
  label.textContent = `Slide ${number}`;
  const body = doc.createElement("p");
  body.textContent = text || translateNow("panel.pptx.slide", { number });
  slot.replaceChildren(label, body);
}

export default function PptxDocumentPane({ src, name }: { src: string; name: string }) {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const slotsRef = useRef<HTMLElement[]>([]);
  /** 已渲染成功的下标：IntersectionObserver 会反复回调，同一页不能渲染两次。 */
  const renderedRef = useRef<Set<number>>(new Set());
  const mountSlideRef=useRef<((index:number)=>void)|null>(null);
  /** 上一次真正建过预览器的宽度（含抖动过滤）。 */
  const widthRef = useRef(FALLBACK_WIDTH - PAGES_GUTTER * 2);
  /** 预览器实例的渲染宽：渲染一次后固定，resize 只改 CSS scale。 */
  const renderWidthRef = useRef(0);
  /** displayWidth 的 ref 镜像：重建/缩放读它，不进 effect 依赖。 */
  const displayWidthRef = useRef(FALLBACK_WIDTH - PAGES_GUTTER * 2);
  const metricsRef = useRef<PptxSlideMetrics | null>(null);
  const [rebuildToken, setRebuildToken] = useState(0);

  const measured = useElementWidth(bodyRef);
  const [displayWidth, setDisplayWidth] = useState(FALLBACK_WIDTH - PAGES_GUTTER * 2);
  const [slides, setSlides] = useState<PptxSlideText[] | null>(null);
  const [count, setCount] = useState(1);
  const [current, setCurrent] = useState(0);
  const [textStage, setTextStage] = useState(false);
  const [status, setStatus] = useState<string | null>(() => translate(locale, "panel.pptx.loading"));
  const [error, setError] = useState<string | null>(null);

  // 宽度先过一道「变化 < 8px 不动」的闸；超闸只改 CSS scale，
  // 放大超 REBUILD_SCALE_UP 才触发预览器重建（清晰度兜底）。
  const rawWidth = Math.max(160, (measured > 0 ? measured : FALLBACK_WIDTH) - PAGES_GUTTER * 2);
  useEffect(() => {
    if (Math.abs(rawWidth - widthRef.current) < WIDTH_EPSILON) return;
    widthRef.current = rawWidth;
    setDisplayWidth(rawWidth);
    const renderW = renderWidthRef.current;
    if (renderW > 0 && rawWidth / renderW > REBUILD_SCALE_UP) {
      setRebuildToken((n) => n + 1);
    }
  }, [rawWidth]);

  // resize 廉价路径：槽位跟着显示宽走，幻灯片本体在渲染宽坐标系里做 scale。
  useEffect(() => {
    displayWidthRef.current = displayWidth;
    const metrics = metricsRef.current;
    const renderW = renderWidthRef.current;
    if (!metrics || renderW <= 0) return;
    const scale = displayWidth / renderW;
    const displayH = slideDisplayHeight(metrics.deckWidth, metrics.deckHeight, displayWidth);
    for (const slot of slotsRef.current) {
      slot.style.width = `${displayWidth}px`;
      if (slot.classList.contains("is-text")) continue;
      slot.style.height = `${displayH}px`;
      const slide = slot.firstElementChild as HTMLElement | null;
      if (slide) {
        slide.style.transformOrigin = "top left";
        slide.style.transform = `scale(${scale})`;
      }
    }
  }, [displayWidth]);

  const scrollToSlide = useCallback((index: number) => {
    const body = bodyRef.current;
    const el = pagesRef.current?.children[index] as HTMLElement | undefined;
    if (body && el) scrollToElementTop(body, el, SCROLL_TOP_OFFSET);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const pages = pagesRef.current;
    const body = bodyRef.current;
    if (!host || !pages) return;

    let cancelled = false;
    const controller=new AbortController();
    let observer: IntersectionObserver | null = null;
    let previewer: PptxPreviewer | null = null;
    const rendered = renderedRef.current;
    rendered.clear();
    const visible=new Set<number>();
    const unregister=registerResourceMetrics(()=>({mountedPptxSlides:rendered.size}));
    // 重建（分栏拖拽 / 右栏展开）后要滚回原来那一页，否则用户会被甩到第 1 页。
    const restoring = slotsRef.current.length > 0;
    const restoreIndex = restoring ? topmostSlotIndex(slotsRef.current, body?.scrollTop ?? 0) : 0;
    slotsRef.current = [];

    // 渲染宽在本次实例生命周期内固定：resize 走 CSS scale，不再进本 effect。
    const renderW = displayWidthRef.current > 0 ? displayWidthRef.current : FALLBACK_WIDTH - PAGES_GUTTER * 2;
    renderWidthRef.current = renderW;

    setError(null);
    setStatus(translateNow("panel.pptx.loading"));
    setTextStage(false);

    void (async () => {
      let buffer: ArrayBuffer;
      try {
        buffer = await sourceToBuffer(src,controller.signal);
      } catch (err) {
        if (cancelled) return;
        setStatus(null);
        setError(err instanceof Error ? err.message : translateNow("panel.reader.openFailed", { name }));
        return;
      }

      // 大纲文字是离线解析的，先出来：库整体不可用时它还是唯一的读物。
      let titles: PptxSlideText[] = [];
      try {
        titles = parsePptxSlideBytes(new Uint8Array(buffer));
      } catch {
        titles = [];
      }
      if (cancelled) return;
      setSlides(titles.length ? titles : null);
      const textOf = (number: number) =>
        titles.find((slide) => slide.number === number)?.text ?? "";

      const { init } = await import("pptx-preview");
      if (cancelled) return;

      const buildSlots = (metrics: PptxSlideMetrics) =>
        createSlideSlots(
          pages,
          metrics.count,
          renderW,
          slideDisplayHeight(metrics.deckWidth, metrics.deckHeight, renderW),
        );

      // 幻灯片本体钉在渲染宽坐标系；槽位随 displayWidth 缩放（见 resize 分支）。
      const pinSlide = (slot: HTMLElement, metrics: PptxSlideMetrics) => {
        const slide = slot.firstElementChild as HTMLElement | null;
        if (!slide || slot.classList.contains("is-text")) return;
        slide.style.width = `${renderW}px`;
        slide.style.height = `${slideDisplayHeight(metrics.deckWidth, metrics.deckHeight, renderW)}px`;
        slide.style.transformOrigin = "top left";
        slide.style.transform = `scale(${displayWidthRef.current / renderW})`;
      };

      const enforceSlideBudget=(slots:HTMLElement[],metrics:PptxSlideMetrics)=>{
        if(rendered.size<=DEFAULT_RESOURCE_BUDGETS.mountedPptxSlides)return
        const anchor=topmostSlotIndex(slots,body?.scrollTop??0)
        const candidates=[...rendered].filter(index=>index!==anchor&&!visible.has(index)).sort((a,b)=>Math.abs(b-anchor)-Math.abs(a-anchor))
        for(const index of candidates){
          if(rendered.size<=DEFAULT_RESOURCE_BUDGETS.mountedPptxSlides)break
          const slot=slots[index]
          const media=slot?.querySelectorAll<HTMLMediaElement>('video,audio')??[]
          if(slot?.contains(document.activeElement)||[...media].some(item=>!item.paused||document.pictureInPictureElement===item))continue
          slot.replaceChildren();slot.classList.remove('is-text')
          slot.style.height=`${slideDisplayHeight(metrics.deckWidth,metrics.deckHeight,displayWidthRef.current)}px`
          rendered.delete(index)
        }
      }

      // A：list 模式只 load，不渲染；每一页等滚到附近再 renderSlide 进自己的槽。
      try {
        host.replaceChildren();
        const instance: PptxPreviewer = init(host, { width: renderW, mode: "list" });
        previewer = instance;
        const deck = await instance.load(buffer);
        trackPptxMedia(instance)
        if (cancelled){disposePptxPreviewer(instance);return;}

        const metrics = deckMetrics(deck);
        metricsRef.current = metrics;
        const slots = buildSlots(metrics);
        slotsRef.current = slots;

        const mountSlot = (index: number) => {
          if (index < 0 || index >= slots.length || rendered.has(index)) return;
          try {
            instance.htmlRender.renderSlide(index);
            if (!mountRenderedSlide(slots[index], instance.wrapper, index)) {
              throw new Error(`第 ${index + 1} 页没有渲染出内容`);
            }
            pinSlide(slots[index], metrics);
            rendered.add(index);
          } catch {
            // 单页失败不该拖垮整份稿件：这一页退成文字卡，其余页照旧。
            // 一并记进 rendered：观察者会反复回调，不记就会反复重试——
            // 而库里那棵树上还留着上一次的残节点，重试会把文字卡又换成坏页。
            rendered.add(index);
            renderTextFallback(slots[index], index + 1, textOf(index + 1));
          }
          enforceSlideBudget(slots,metrics)
        };
        mountSlideRef.current=mountSlot

        if (typeof IntersectionObserver === "undefined") {
          // No observer: keep initial pages readable and mount later pages on navigation/scroll.
          for (let index = 0; index < Math.min(slots.length,4); index += 1) mountSlot(index);
        } else {
          observer = new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const index=slots.indexOf(entry.target as HTMLElement)
                if(index<0)continue
                if(entry.isIntersecting){visible.add(index);mountSlot(index)}else visible.delete(index)
              }
              enforceSlideBudget(slots,metrics)
            },
            { root: body ?? null, rootMargin: PRELOAD_MARGIN },
          );
          for (const slot of slots) observer.observe(slot);
        }

        if (cancelled) return;
        setCount(Math.max(metrics.count, 1));
        setStatus(null);
        setTextStage(false);
        if (restoring) scrollToSlide(restoreIndex);
        return;
      } catch {
        observer?.disconnect();
        observer = null;
        if(previewer)disposePptxPreviewer(previewer)
        if(cancelled)return
      }

      // B：A 挂了（解析失败 / 读不出页几何）就退回库的全量渲染，仍然是 list 模式。
      try {
        if(previewer)disposePptxPreviewer(previewer)
        if(titles.length>DEFAULT_RESOURCE_BUDGETS.mountedPptxSlides)throw new Error('large deck uses text fallback after partial render failure')
        host.replaceChildren();
        const instance: PptxPreviewer = init(host, { width: renderW, mode: "list" });
        previewer = instance;
        await instance.preview(buffer);
        trackPptxMedia(instance)
        if (cancelled){disposePptxPreviewer(instance);return;}

        const deck = instance.pptx;
        if (!deck?.slides.length) throw new Error("没有可渲染的幻灯片");
        const metrics = deckMetrics(deck);
        metricsRef.current = metrics;
        const slots = buildSlots(metrics);
        slotsRef.current = slots;
        for (let index = 0; index < slots.length; index += 1) {
          if (!mountRenderedSlide(slots[index], instance.wrapper, index)) {
            renderTextFallback(slots[index], index + 1, textOf(index + 1));
          } else {
            pinSlide(slots[index], metrics);
          }
        }

        setCount(Math.max(metrics.count, 1));
        setStatus(null);
        setTextStage(false);
        if (restoring) scrollToSlide(restoreIndex);
        return;
      } catch {
        if(previewer)disposePptxPreviewer(previewer)
        previewer = null;
        if(cancelled)return
        host.replaceChildren();
      }

      // C：库整体不可用 → 文字化幻灯片舞台（老行为，至少能读）。
      if (cancelled) return;
      metricsRef.current = null;
      slotsRef.current = [];
      pages.replaceChildren();
      setCount(Math.max(titles.length, 1));
      setCurrent(0);
      setStatus(null);
      setTextStage(true);
      if (!titles.length) setError(translateNow("panel.reader.openFailed", { name }));
    })();

    return () => {
      cancelled = true;
      controller.abort();
      observer?.disconnect();
      observer = null;
      if(previewer)disposePptxPreviewer(previewer)
      previewer = null;
      rendered.clear();
      mountSlideRef.current=null
      unregister()
    };
  }, [src, name, rebuildToken, scrollToSlide]);

  // 滚动 → 当前页：rAF 节流，滚动过程中每帧最多量一次。
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const slots = slotsRef.current;
      if (!slots.length) return;
      const index=topmostSlotIndex(slots, body.scrollTop)
      if(typeof IntersectionObserver==='undefined'){for(let item=Math.max(0,index-1);item<=Math.min(slots.length-1,index+2);item++)mountSlideRef.current?.(item)}
      setCurrent(index);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [bodyRef, slotsRef]);

  const goToSlide = useCallback(
    (index: number) => {
      const target = Math.max(0, Math.min(count - 1, index));
      if(typeof IntersectionObserver==='undefined'){for(let item=Math.max(0,target-1);item<=Math.min(count-1,target+2);item++)mountSlideRef.current?.(item)}
      // 页列模式滚动到位；文字模式没有槽位，滚动是空操作，直接切页。
      scrollToSlide(target);
      setCurrent(target);
    },
    [count, scrollToSlide],
  );

  const outline = (
    slides ??
    Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      text: t("panel.pptx.slide", { number: index + 1 }),
    }))
  ).map((slide) => ({
    id: String(slide.number),
    title: slide.text.slice(0, 36) || t("panel.pptx.slide", { number: slide.number }),
    meta: `Slide ${slide.number}`,
  }));

  if (error && !slides?.length) {
    return (
      <div className="flex h-full min-h-52 flex-col items-center justify-center gap-3 px-6 text-center">
        <Presentation size={32} className="text-[var(--md-sys-color-primary)]" />
        <p className="text-[13px] font-semibold text-[var(--ink)]">{t("panel.pptx.title")}</p>
        <p className="max-w-md text-[12px] leading-6 text-[var(--ink-soft)]">{error}</p>
      </div>
    );
  }

  const currentText = slides?.find((slide) => slide.number === current + 1)?.text;

  return (
    <DocumentWorkspace
      outline={outline}
      activeId={String(current + 1)}
      onSelect={(id) => goToSlide((Number(id) || 1) - 1)}
      outlineLabel={t("panel.pptx.outline")}
      layoutKey="pptx"
      bodyRef={bodyRef}
      toolbar={
        <>
          <button type="button" data-no-drag title={t("panel.reader.prevPage")} onClick={() => goToSlide(current - 1)}>
            <ChevronLeft size={13} />
          </button>
          <span>
            {current + 1} / {count}
          </span>
          <button type="button" data-no-drag title={t("panel.reader.nextPage")} onClick={() => goToSlide(current + 1)}>
            <ChevronRight size={13} />
          </button>
        </>
      }
    >
      {/* 页列容器常驻 DOM：宽度变化重建时槽位坐标系还在原地；文字模式下用行内 display 让位。 */}
      <div
        ref={pagesRef}
        className="pptx-pages"
        style={textStage ? { display: "none" } : undefined}
      />
      {/* 库的宿主只负责「生产」幻灯片 DOM，成品会被搬进槽里，所以整块不参与排版。
          必须是 .pptx-pages 的兄弟而不是子节点，否则会占掉槽位下标。 */}
      <div ref={hostRef} className="pptx-source-host" />
      {textStage ? (
        <div className="flex min-h-full justify-center p-4">
          <article className="document-workspace-paper min-h-52 w-full max-w-3xl rounded-xl p-6">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              Slide {current + 1}
            </div>
            <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--ink)]">
              {currentText ?? t("panel.pptx.slide", { number: current + 1 })}
            </p>
          </article>
        </div>
      ) : null}
      {status ? <p className="pptx-pages-status">{status}</p> : null}
    </DocumentWorkspace>
  );
}
