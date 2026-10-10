import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PdfDocumentPane from "./PdfDocumentPane";
import { useAppMode } from "@/lib/stores/appMode";
import {getResourceSnapshot} from '@/lib/performance/resourceMetrics';

const pdfState = vi.hoisted(() => ({
  numPages: 4,
  baseWidth: 600,
  baseHeight: 800,
  renders: 0,
  renderScales: [] as number[],
  rejectWith: null as { name: string; message: string } | null,
  pendingLoad:false,
  loadingDestroyed:0,
  loadingStarted:0,
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => {
  const makePage = () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: pdfState.baseWidth * scale,
      height: pdfState.baseHeight * scale,
      scale,
      rotation: 0,
      rawDims: { pageWidth: pdfState.baseWidth, pageHeight: pdfState.baseHeight, pageX: 0, pageY: 0 },
    }),
    render: (params: { viewport: { scale: number } }) => {
      pdfState.renders += 1;
      pdfState.renderScales.push(params.viewport.scale);
      return { promise: Promise.resolve(), cancel: () => {} };
    },
    streamTextContent: () => ({}),
  });

  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: () => {
      pdfState.loadingStarted+=1;
      if(pdfState.pendingLoad)return {promise:new Promise(()=>{}),destroy:()=>{pdfState.loadingDestroyed+=1;return Promise.resolve()}};
      if (pdfState.rejectWith) {
        const failure = Object.assign(new Error(pdfState.rejectWith.message), { name: pdfState.rejectWith.name });
        return { promise: Promise.reject(failure),destroy:()=>{pdfState.loadingDestroyed+=1;return Promise.resolve()} };
      }
      return {
        destroy:()=>{pdfState.loadingDestroyed+=1;return Promise.resolve()},
        promise: Promise.resolve({
          numPages: pdfState.numPages,
          getPage: () => Promise.resolve(makePage()),
          getOutline: () => Promise.resolve(null),
          destroy: () => Promise.resolve(),
        }),
      };
    },
    TextLayer: class {
      render() {
        return Promise.resolve();
      }
      cancel() {}
    },
  };
});

const SOURCE = "blob:http://localhost/lecture.pdf";

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly targets: Element[] = [];

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = (options?.root as Element | null) ?? null;
    this.rootMargin = options?.rootMargin ?? "";
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }

  trigger(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function pageElement(pageNumber: number) {
  return document.querySelector<HTMLElement>(`[data-pdf-page="${pageNumber}"]`);
}

function bodyElement() {
  return document.querySelector<HTMLElement>(".document-workspace-body");
}

/**
 * jsdom 不做排版，getBoundingClientRect 恒为 0；给目标页一个真实纵坐标才能验算落点。
 * 定位用的是 rect 差值而不是 offsetTop —— offsetTop 相对 .document-workspace-stage，
 * 会把 32px 工具栏算进去，跳到第 N 页会多滚一截。
 */
function stubTop(el: HTMLElement, top: number) {
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ top, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }),
    configurable: true,
  });
}

/** 渲染 → onMeasured → 文本层是一条异步链，等它跑完再断言，状态更新才不会落在 act 之外。 */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 3; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function renderPane({ waitForPages = true }: { waitForPages?: boolean } = {}) {
  render(<PdfDocumentPane src={SOURCE} name="讲义.pdf" />);
  await waitFor(() => expect(document.querySelectorAll("[data-pdf-page]")).toHaveLength(pdfState.numPages));
  if (waitForPages) await settle();
}

describe("PdfDocumentPane", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    useAppMode.setState({ mode: "studio", lastStudioPath: "/", hydrated: true });
    FakeIntersectionObserver.instances = [];
    pdfState.numPages = 4;
    pdfState.baseWidth=600;pdfState.baseHeight=800;
    pdfState.renders = 0;
    pdfState.renderScales = [];
    pdfState.rejectWith = null;
    pdfState.pendingLoad=false;pdfState.loadingDestroyed=0;pdfState.loadingStarted=0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('destroys a still-loading PDF task when the viewer closes',async()=>{
    pdfState.pendingLoad=true;
    const {unmount}=render(<PdfDocumentPane src={SOURCE} name="pending.pdf"/>);
    await waitFor(()=>expect(pdfState.loadingStarted).toBe(1));
    unmount();
    expect(pdfState.loadingDestroyed).toBe(1);
  });

  it("连续页流：一次铺出全部页，每页各自挂一块画布", async () => {
    await renderPane();

    expect(screen.queryByText("正在载入 PDF…")).toBeNull();
    // Small PDFs fit within the no-IntersectionObserver current-page window.
    expect(document.querySelectorAll(".pdf-page-canvas")).toHaveLength(4);
    expect(pageElement(1)?.style.width).toBe(pageElement(4)?.style.width);
    expect(pdfState.renders).toBe(4);
  });

  it("工具栏百分比 = 屏幕实际宽度 / 原始页宽，渲染用的 scale 也是它推出来的", async () => {
    await renderPane();

    const displayWidth = Number.parseFloat(pageElement(1)!.style.width);
    const ratio = displayWidth / pdfState.baseWidth;
    expect(screen.getByText(`${Math.round(ratio * 100)}%`)).toBeVisible();
    expect(pdfState.renderScales).toHaveLength(4);
    for (const scale of pdfState.renderScales) {
      expect(scale).toBeCloseTo(ratio, 5);
    }

    const rendered = pdfState.renderScales.length;
    fireEvent.click(screen.getByTitle("放大"));
    await settle();

    const zoomed = Number.parseFloat(pageElement(1)!.style.width);
    expect(zoomed).toBeGreaterThan(displayWidth);
    expect(screen.getByText(`${Math.round((zoomed / pdfState.baseWidth) * 100)}%`)).toBeVisible();
    expect(pdfState.renderScales.length).toBeGreaterThan(rendered);
    for (const scale of pdfState.renderScales.slice(rendered)) {
      expect(scale).toBeCloseTo(zoomed / pdfState.baseWidth, 5);
    }

    fireEvent.click(screen.getByTitle("重置"));
    await settle();
    expect(pageElement(1)?.style.width).toBe(`${displayWidth}px`);
    // 「适应宽度」曾经写死 setScale(1)，是个假的适应，已经退场。
    expect(screen.queryByTitle("适应宽度")).toBeNull();
  });

  it("点大纲第 3 项：正文滚到第 3 页顶部，并把它标成当前页", async () => {
    await renderPane();

    const target = pageElement(3)!;
    stubTop(target, 512);

    fireEvent.click(screen.getByRole("button", { name: "第 3 页" }));

    expect(bodyElement()?.scrollTop).toBe(512 - 8);
    expect(screen.getByRole("button", { name: "第 3 页" }).className).toContain("is-active");
  });

  it("上一页 / 下一页也走滚动定位，页码跟着变", async () => {
    await renderPane();

    stubTop(pageElement(2)!, 256);
    fireEvent.click(screen.getByTitle("下一页"));

    expect(bodyElement()?.scrollTop).toBe(256 - 8);
    expect(screen.getByText("2 / 4")).toBeVisible();
  });

  it("加密 PDF 给一句人话，而不是 pdfjs 的原始报错", async () => {
    pdfState.rejectWith = { name: "PasswordException", message: "No password given" };
    render(<PdfDocumentPane src={SOURCE} name="锁.pdf" />);

    await waitFor(() => expect(screen.getByText("该 PDF 有密码保护，暂不支持预览")).toBeVisible());
    expect(screen.queryByText("无法渲染 PDF")).toBeNull();
  });

  it("视口外的页先不挂画布，进视口才挂", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

    await renderPane({ waitForPages: false });

    const observer = FakeIntersectionObserver.instances.at(-1);
    expect(observer?.rootMargin).toBe("600px 0px");
    expect(observer?.root).toBe(bodyElement());
    expect(observer?.targets).toHaveLength(4);
    expect(document.querySelectorAll(".pdf-page-canvas")).toHaveLength(0);

    act(() => observer!.trigger(pageElement(2)!));
    await settle();

    expect(document.querySelectorAll(".pdf-page-canvas")).toHaveLength(1);
    expect(pageElement(2)?.querySelector(".pdf-page-canvas")).not.toBeNull();
    expect(pageElement(1)?.querySelector(".pdf-page-canvas")).toBeNull();
  });
  it('keeps a 300-page PDF readable without mounting 300 bitmaps when IntersectionObserver is absent',async()=>{
    pdfState.numPages=300;
    await renderPane({waitForPages:false});
    expect(document.querySelectorAll('[data-pdf-page]')).toHaveLength(300)
    expect(document.querySelectorAll('.pdf-page-canvas').length).toBeLessThanOrEqual(4)
    fireEvent.click(screen.getByRole('button',{name:'第 300 页'}))
    await waitFor(()=>expect(pageElement(300)?.querySelector('.pdf-page-canvas')).not.toBeNull())
    expect(document.querySelectorAll('.pdf-page-canvas').length).toBeLessThanOrEqual(6)
  })
  it('evicts far bitmaps when high-DPR pages exceed the per-reader byte target',async()=>{
    pdfState.numPages=20;pdfState.baseWidth=1000;pdfState.baseHeight=1500;
    Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:3});
    try{
      await renderPane();
      await waitFor(()=>expect(getResourceSnapshot().pdfBitmapBytes).toBeLessThanOrEqual(96*1024*1024));
      expect(document.querySelectorAll('.pdf-page-canvas').length).toBeLessThanOrEqual(4)
    }finally{delete (window as {devicePixelRatio?:number}).devicePixelRatio}
  })
});
