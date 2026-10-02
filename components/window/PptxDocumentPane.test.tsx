import { act, cleanup, render,screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import PptxDocumentPane from "./PptxDocumentPane";
import { useAppMode } from "@/lib/stores/appMode";
import {getActiveObjectUrlCount} from '@/lib/resources/objectUrl';

/** 假库的状态与调用记录：断言「用哪个 API、传了什么 options」靠它。 */
const harness = vi.hoisted(() => ({
  init: vi.fn(),
  loadCalls: 0,
  previewCalls: 0,
  loadThrows: false,
  slideCount: 3,
  deckWidth: 960,
  deckHeight: 720,
  renderedIndexes: [] as number[],
  failSlideIndexes: new Set<number>(),
  mediaUrl:null as string|null,
  deferLoad:false,
  releaseLoad:null as null|(()=>void),
}));

vi.mock("pptx-preview", () => ({ init: harness.init }));

interface FakeDeck {
  width: number;
  height: number;
  slides: unknown[];
  medias?:Record<string,string>;
}

interface FakePreviewer {
  wrapper: HTMLElement;
  pptx?: FakeDeck;
  htmlRender: { renderSlide: (index: number) => void };
  load: (buffer: ArrayBuffer) => Promise<FakeDeck>;
  preview: (buffer: ArrayBuffer) => Promise<unknown>;
  destroy: () => void;
}

/** React 的 useElementWidth 与 react-resizable-panels 都建 ResizeObserver；只手动驱动正文容器那一个。 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  static triggerFor(target: Element) {
    for (const instance of FakeResizeObserver.instances) {
      if (!instance.targets.has(target)) continue;
      instance.callback(
        [{ target } as unknown as ResizeObserverEntry],
        instance as unknown as ResizeObserver,
      );
    }
  }

  static reset() {
    FakeResizeObserver.instances = [];
  }
}

/** IntersectionObserver 桩：jsdom 没有它，手动把槽位「滚进视口」。 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly targets = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords() {
    return [];
  }

  /** 把所有被观察的槽位一次性判为「进入视口」。 */
  static intersectAll() {
    for (const instance of FakeIntersectionObserver.instances) {
      if (!instance.targets.size) continue;
      const entries = [...instance.targets].map(
        (target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry,
      );
      instance.callback(entries, instance as unknown as IntersectionObserver);
    }
  }

  static showIndexes(indexes:readonly number[]){
    const visible=new Set(indexes)
    for(const instance of FakeIntersectionObserver.instances){
      if(!instance.targets.size)continue
      const entries=[...instance.targets].map((target,index)=>({target,isIntersecting:visible.has(index)}) as unknown as IntersectionObserverEntry)
      instance.callback(entries,instance as unknown as IntersectionObserver)
    }
  }

  static reset() {
    FakeIntersectionObserver.instances = [];
  }
}

function pptxFixture(count=3): ArrayBuffer {
  const names=['第一页标题','第二页标题','第三页标题']
  const files:Record<string,Uint8Array>={}
  for(let number=1;number<=count;number++)files[`ppt/slides/slide${number}.xml`]=strToU8(`<p:sld><a:t>${names[number-1]??`第${number}页标题`}</a:t></p:sld>`)
  const archive = zipSync(files);
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
}


function renderPane() {
  return render(<PptxDocumentPane src="blob:pptx-fixture" name="重点.pptx" />);
}

function slotList(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".pptx-page-slot")];
}

async function waitForSlots(container: HTMLElement, count = harness.slideCount) {
  await waitFor(() => expect(slotList(container)).toHaveLength(count));
}

describe("PptxDocumentPane", () => {
  beforeEach(() => {
    harness.init.mockReset();
    harness.loadCalls = 0;
    harness.previewCalls = 0;
    harness.loadThrows = false;
    harness.slideCount = 3;
    harness.renderedIndexes = [];
    harness.failSlideIndexes.clear();
    harness.mediaUrl=null;harness.deferLoad=false;harness.releaseLoad=null;
    FakeResizeObserver.reset();
    FakeIntersectionObserver.reset();
    useAppMode.setState({ mode: "studio", lastStudioPath: "/", hydrated: true });

    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => pptxFixture(harness.slideCount) })),
    );

    harness.init.mockImplementation((host: HTMLElement) => {
      const wrapper = host.ownerDocument.createElement("div");
      wrapper.className = "pptx-preview-wrapper";
      host.appendChild(wrapper);
      const instance: FakePreviewer = {
        wrapper,
        htmlRender: {
          renderSlide(index: number) {
            if (harness.failSlideIndexes.has(index)) throw new Error(`slide ${index} 渲染失败`);
            const slide = host.ownerDocument.createElement("div");
            slide.className = `pptx-preview-slide-wrapper pptx-preview-slide-wrapper-${index}`;
            wrapper.appendChild(slide);
            harness.renderedIndexes.push(index);
          },
        },
        async load() {
          harness.loadCalls += 1;
          if (harness.loadThrows) throw new Error("课件解析失败");
          if(harness.deferLoad)await new Promise<void>(resolve=>{harness.releaseLoad=resolve})
          instance.pptx = {
            width: harness.deckWidth,
            height: harness.deckHeight,
            slides: Array.from({ length: harness.slideCount }, (_, index) => ({ index })),
            medias:harness.mediaUrl?{slide:harness.mediaUrl}:{},
          };
          return instance.pptx;
        },
        async preview() {
          harness.previewCalls += 1;
          instance.pptx = {
            width: harness.deckWidth,
            height: harness.deckHeight,
            slides: Array.from({ length: harness.slideCount }, (_, index) => ({ index })),
          };
          for (let index = 0; index < harness.slideCount; index += 1) {
            instance.htmlRender.renderSlide(index);
          }
          return instance.pptx;
        },
        destroy: vi.fn(),
      };
      return instance;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("list 模式初始化：不传 height（传了会被库写成固定高度 + overflow）", async () => {
    renderPane();
    await waitFor(() => expect(harness.init).toHaveBeenCalled());

    const [, options] = harness.init.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(options.mode).toBe("list");
    expect(options).not.toHaveProperty("height");
    expect(typeof options.width).toBe("number");
  });

  it("先 load 建槽（页数 = 页数），没有进视口的页先不渲染", async () => {
    const { container } = renderPane();
    await waitForSlots(container);

    expect(harness.loadCalls).toBe(1);
    expect(harness.previewCalls).toBe(0);
    expect(slotList(container).map((slot) => slot.dataset.pptxPage)).toEqual(["1", "2", "3"]);
    // 懒渲染：观察者还没报告可见，一页都不该画。
    expect(harness.renderedIndexes).toEqual([]);

    await act(async () => {
      FakeIntersectionObserver.intersectAll();
    });
    expect(harness.renderedIndexes).toEqual([0, 1, 2]);
    for (const index of [0, 1, 2]) {
      expect(
        slotList(container)[index].querySelector(`.pptx-preview-slide-wrapper-${index}`),
      ).not.toBeNull();
    }
  });

  it("4:3 稿件按真实纵横比留位：960×720 的页在 696 宽下是 522 高", async () => {
    const { container } = renderPane();
    await waitForSlots(container);
    const [, options] = harness.init.mock.calls[0] as [HTMLElement, { width: number }];
    expect(slotList(container)[0].style.height).toBe(`${Math.round((options.width * 720) / 960)}px`);
    // 库自己的 wrapper 高度也必须等于槽位高度，页面才不会被裁。
    expect(slotList(container)[0].style.height).not.toBe("540px");
  });

  it("单页渲染失败只降级那一页：该槽变文字卡，其它页照旧", async () => {
    harness.failSlideIndexes.add(1);
    const { container } = renderPane();
    await waitForSlots(container);

    await act(async () => {
      FakeIntersectionObserver.intersectAll();
    });

    const slots = slotList(container);
    expect(slots[0].querySelector(".pptx-preview-slide-wrapper-0")).not.toBeNull();
    expect(slots[1].classList.contains("is-text")).toBe(true);
    expect(slots[1].querySelector(".pptx-page-fallback-label")?.textContent).toBe("Slide 2");
    expect(slots[1].textContent).toContain("第二页标题");
    expect(slots[2].querySelector(".pptx-preview-slide-wrapper-2")).not.toBeNull();
  });

  it("没有 IntersectionObserver 时全部挂载（jsdom / 老浏览器不留空槽）", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = renderPane();
    await waitForSlots(container);

    await waitFor(() => expect(harness.renderedIndexes).toEqual([0, 1, 2]));
    expect(slotList(container)[2].querySelector(".pptx-preview-slide-wrapper-2")).not.toBeNull();
  });

  it("load 失败退回全量 preview（仍然 list 模式），槽位照常铺满", async () => {
    harness.loadThrows = true;
    const { container } = renderPane();
    await waitForSlots(container);

    expect(harness.loadCalls).toBe(1);
    expect(harness.previewCalls).toBe(1);
    expect(harness.init).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".pptx-page-slot .pptx-preview-slide-wrapper-1")).not.toBeNull();
  });

  it("宽度变化走 CSS 缩放不重建；放大超阈值才真重建预览器", async () => {
    const { container } = renderPane();
    await waitForSlots(container);
    await act(async () => {
      FakeIntersectionObserver.intersectAll();
    });
    const [firstCall] = harness.init.mock.calls as [HTMLElement, { width: number }][];
    const renderW = firstCall[1].width;

    const body = container.querySelector<HTMLElement>(".document-workspace-body");
    expect(body).not.toBeNull();
    // 876 相对渲染宽 < 1.5×：不重建，槽位跟宽、幻灯片 CSS scale。
    Object.defineProperty(body, "clientWidth", { value: 900, configurable: true });
    await act(async () => {
      FakeResizeObserver.triggerFor(body as HTMLElement);
    });

    await waitFor(() => expect(slotList(container)[0].style.width).toBe(`${900 - 24}px`));
    expect(harness.init).toHaveBeenCalledTimes(1);
    const slide = slotList(container)[0].querySelector<HTMLElement>(".pptx-preview-slide-wrapper-0");
    expect(slide?.style.transform).toBe(`scale(${(900 - 24) / renderW})`);

    // 放大超阈值才真重建（清晰度兜底），且按新宽度重铺。
    Object.defineProperty(body, "clientWidth", { value: Math.ceil(renderW * 1.6) + 24, configurable: true });
    await act(async () => {
      FakeResizeObserver.triggerFor(body as HTMLElement);
    });
    await waitFor(() => expect(harness.init).toHaveBeenCalledTimes(2), { timeout: 3000 });
    const calls = harness.init.mock.calls as [HTMLElement, { width: number }][];
    expect(calls[1][1].width).not.toBe(renderW);
    await waitForSlots(container);
  });
  it('keeps a 200-slide deck to a bounded rendered DOM while revisiting distant slides',async()=>{
    harness.slideCount=200
    const {container}=renderPane()
    await waitForSlots(container,200)
    await act(async()=>{FakeIntersectionObserver.showIndexes([0,1,2])})
    for(let start=3;start<198;start+=3){
      await act(async()=>{FakeIntersectionObserver.showIndexes([start,start+1,start+2])})
      expect(container.querySelectorAll('.pptx-preview-slide-wrapper').length).toBeLessThanOrEqual(12)
    }
    await act(async()=>{FakeIntersectionObserver.showIndexes([0,1,2])})
    expect(container.querySelectorAll('.pptx-preview-slide-wrapper').length).toBeLessThanOrEqual(12)
    expect(harness.loadCalls).toBe(1)
  })
  it('opens a distant slide without an observer while keeping only a small slide window',async()=>{
    vi.stubGlobal('IntersectionObserver',undefined)
    harness.slideCount=200
    const {container}=renderPane()
    await waitForSlots(container,200)
    expect(container.querySelectorAll('.pptx-preview-slide-wrapper').length).toBeLessThanOrEqual(4)
    const target=container.querySelector<HTMLElement>('.pptx-page-slot[data-pptx-page="200"]')
    expect(target).not.toBeNull()
    await waitFor(()=>expect(screen.getByText('1 / 200')).toBeVisible())
    await act(async()=>screen.getByRole('button',{name:/第200页标题/}).click())
    await waitFor(()=>expect(target?.querySelector('.pptx-preview-slide-wrapper-199')).not.toBeNull())
    expect(container.querySelectorAll('.pptx-preview-slide-wrapper').length).toBeLessThanOrEqual(12)
  })
  it('releases a media URL created by a PPTX load that finishes after unmount',async()=>{
    harness.mediaUrl='blob:late-pptx-media';harness.deferLoad=true
    const original=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL'),revoke=vi.fn()
    Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke})
    try{
      const {unmount}=renderPane()
      await waitFor(()=>expect(harness.releaseLoad).not.toBeNull())
      unmount()
      await act(async()=>{harness.releaseLoad?.();await Promise.resolve()})
      expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:late-pptx-media')
      expect(getActiveObjectUrlCount()).toBe(0)
    }finally{if(original)Object.defineProperty(URL,'revokeObjectURL',original);else delete (URL as {revokeObjectURL?:unknown}).revokeObjectURL}
  })
});
