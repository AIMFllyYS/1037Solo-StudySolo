import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PdfPageCanvas from "./PdfPageCanvas";

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocumentProxy = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;

const pdfState = vi.hoisted(() => ({
  renders: [] as Array<Record<string, unknown>>,
  cancels: 0,
  getPageCalls: 0,
  textLayerCancels: 0,
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  // 文本层只桩到「不炸」这一层：这里验的是 DPR、取消、闸门，不是 pdfjs 的排版算法。
  TextLayer: class {
    render() {
      return Promise.resolve();
    }
    cancel() {
      pdfState.textLayerCancels += 1;
    }
  },
}));

const BASE_WIDTH = 300;
const BASE_HEIGHT = 400;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createPdf(render?: () => { promise: Promise<void>; cancel: () => void }) {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: BASE_WIDTH * scale,
      height: BASE_HEIGHT * scale,
      scale,
      rotation: 0,
      rawDims: { pageWidth: BASE_WIDTH, pageHeight: BASE_HEIGHT, pageX: 0, pageY: 0 },
    }),
    render: (params: Record<string, unknown>) => {
      pdfState.renders.push(params);
      return render ? render() : { promise: Promise.resolve(), cancel: () => { pdfState.cancels += 1; } };
    },
    streamTextContent: () => ({}),
  };
  const pdf = {
    getPage: () => {
      pdfState.getPageCalls += 1;
      return Promise.resolve(page);
    },
  };
  return pdf as unknown as PdfDocumentProxy;
}

function renderPage(overrides: Partial<Parameters<typeof PdfPageCanvas>[0]> = {}) {
  return render(
    <PdfPageCanvas
      pdf={createPdf()}
      pageNumber={1}
      displayWidth={BASE_WIDTH}
      acquireSlot={async () => {}}
      releaseSlot={() => {}}
      {...overrides}
    />,
  );
}

describe("PdfPageCanvas", () => {
  beforeEach(() => {
    pdfState.renders.length = 0;
    pdfState.cancels = 0;
    pdfState.getPageCalls = 0;
    pdfState.textLayerCancels = 0;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("2x 屏：位图开两倍、CSS 尺寸仍是 CSS 像素、缩放交给 pdf.js 的 transform", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const onMeasured = vi.fn();
    const { container } = renderPage({ onMeasured });

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(Math.floor(BASE_WIDTH * 2));
    expect(canvas.height).toBe(Math.floor(BASE_HEIGHT * 2));
    expect(canvas.style.width).toBe(`${BASE_WIDTH}px`);
    expect(canvas.style.height).toBe(`${BASE_HEIGHT}px`);
    expect(pdfState.renders[0].transform).toEqual([2, 0, 0, 2, 0, 0]);
    await waitFor(() => expect(onMeasured).toHaveBeenCalledWith(1, { width: BASE_WIDTH, height: BASE_HEIGHT }));
  });

  it("1x 屏不加 transform，位图就是 CSS 像素", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const { container } = renderPage();

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(BASE_WIDTH);
    expect(canvas.style.width).toBe(`${BASE_WIDTH}px`);
    expect(pdfState.renders[0].transform).toBeUndefined();
  });

  it("devicePixelRatio 到 3 就封顶，不让 4x 屏把位图开到 4 倍", async () => {
    vi.stubGlobal("devicePixelRatio", 4);
    const { container } = renderPage();

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));

    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(BASE_WIDTH * 3);
    expect(pdfState.renders[0].transform).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it("文本层容器带上 --total-scale-factor，否则 pdfjs 算不出字号", async () => {
    const { container } = renderPage({ displayWidth: BASE_WIDTH * 2 });

    await waitFor(() => expect(container.querySelector(".pdf-text-layer")).not.toBeNull());

    const textLayer = container.querySelector<HTMLElement>(".pdf-text-layer");
    expect(textLayer?.style.getPropertyValue("--total-scale-factor")).toBe("2");
  });

  it("卸载时取消还在跑的 render task", async () => {
    const task = deferred<void>();
    const view = renderPage({ pdf: createPdf(() => ({ promise: task.promise, cancel: () => { pdfState.cancels += 1; } })) });

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));
    view.unmount();

    expect(pdfState.cancels).toBe(1);
  });

  it("渲染被取消（RenderingCancelledException）时不上报错误", async () => {
    const task = deferred<void>();
    const onError = vi.fn();
    renderPage({
      onError,
      pdf: createPdf(() => ({ promise: task.promise, cancel: () => { pdfState.cancels += 1; } })),
    });

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));
    await act(async () => {
      task.reject(Object.assign(new Error("Rendering cancelled, page 1"), { name: "RenderingCancelledException" }));
      await Promise.resolve();
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("并发闸门：拿到槽位前不碰 pdf，渲染结束才还槽位", async () => {
    const gate = deferred<void>();
    const acquireSlot = vi.fn(() => gate.promise);
    const releaseSlot = vi.fn();
    renderPage({ acquireSlot, releaseSlot });

    expect(acquireSlot).toHaveBeenCalledTimes(1);
    expect(pdfState.getPageCalls).toBe(0);

    await act(async () => {
      gate.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));
    await waitFor(() => expect(releaseSlot).toHaveBeenCalledTimes(1));
  });

  it("单页渲染失败：上报 onError，槽位照还", async () => {
    const task = deferred<void>();
    const onError = vi.fn();
    const releaseSlot = vi.fn();
    renderPage({
      onError,
      releaseSlot,
      pdf: createPdf(() => ({ promise: task.promise, cancel: () => {} })),
    });

    await waitFor(() => expect(pdfState.renders).toHaveLength(1));
    const failure = new Error("页面损坏");
    await act(async () => {
      task.reject(failure);
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(1, failure);
    expect(releaseSlot).toHaveBeenCalledTimes(1);
  });

  it("拿到槽位后立刻被取消：也不能把槽位吞掉", async () => {
    const gate = deferred<void>();
    const releaseSlot = vi.fn();
    const view = renderPage({ acquireSlot: () => gate.promise, releaseSlot });

    view.unmount();
    await act(async () => {
      gate.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(releaseSlot).toHaveBeenCalledTimes(1));
    expect(pdfState.getPageCalls).toBe(0);
  });
});
