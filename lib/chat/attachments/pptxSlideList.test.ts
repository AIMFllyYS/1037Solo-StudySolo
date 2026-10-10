import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSlideSlots,
  mountRenderedSlide,
  slideDisplayHeight,
  topmostSlotIndex,
} from "./pptxSlideList.ts";

type JsdomCtor = new (html?: string) => { window: { document: Document } };

let documentPromise: Promise<Document> | null = null;

/**
 * 用真实 DOM（jsdom）而不是手搓对象：mountRenderedSlide 的关键行为
 * 是「replaceChildren 把节点从库里那棵树上搬走」，只有真 DOM 才验得出来。
 * jsdom 没有随包类型声明，所以动态取构造器，只声明用到的形状。
 */
function getDocument(): Promise<Document> {
  documentPromise ??= (async () => {
    const mod = (await import("jsdom" as string)) as { JSDOM: JsdomCtor };
    return new mod.JSDOM("<!doctype html><html><body></body></html>").window.document;
  })();
  return documentPromise;
}

/** jsdom 不做布局，offsetTop 恒为 0；这里按需要摆好槽位的纵坐标。 */
function place(el: HTMLElement, offsetTop: number): HTMLElement {
  Object.defineProperty(el, "offsetTop", { value: offsetTop, configurable: true });
  return el;
}

test("slideDisplayHeight：按稿件真实纵横比换算，不再假定 16:9", () => {
  // 4:3 稿件（旧实现按 960×540 算，会上下各裁 90px）。
  assert.equal(slideDisplayHeight(960, 720, 600), 450);
  // 16:9 稿件。
  assert.equal(slideDisplayHeight(1280, 720, 640), 360);
  // 宽高不成整数比时四舍五入到整像素。
  assert.equal(slideDisplayHeight(1000, 700, 333), 233);
});

test("slideDisplayHeight：非法输入返回 0，不产生 NaN 高度", () => {
  assert.equal(slideDisplayHeight(0, 720, 600), 0);
  assert.equal(slideDisplayHeight(960, 0, 600), 0);
  assert.equal(slideDisplayHeight(960, 720, 0), 0);
  assert.equal(slideDisplayHeight(Number.NaN, 720, 600), 0);
  assert.equal(slideDisplayHeight(960, 720, Number.NaN), 0);
  assert.equal(slideDisplayHeight(-960, 720, 600), 0);
});

test("createSlideSlots：按序建槽，带 1-based 页码与占位尺寸", async () => {
  const doc = await getDocument();
  const container = doc.createElement("div");
  container.appendChild(doc.createElement("div"));

  const slots = createSlideSlots(container as HTMLElement, 3, 600, 450);
  assert.equal(slots.length, 3);
  // 重建前先清空，避免旧页残留。
  assert.equal(container.children.length, 3);
  assert.deepEqual(
    slots.map((slot) => slot.className),
    ["pptx-page-slot", "pptx-page-slot", "pptx-page-slot"],
  );
  assert.deepEqual(
    slots.map((slot) => slot.dataset.pptxPage),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    slots.map((slot) => slot.style.height),
    ["450px", "450px", "450px"],
  );
  assert.deepEqual(
    slots.map((slot) => slot.style.width),
    ["600px", "600px", "600px"],
  );
});

test("createSlideSlots：0 页 / 非法页数就是空列", async () => {
  const doc = await getDocument();
  const container = doc.createElement("div");
  assert.deepEqual(createSlideSlots(container as HTMLElement, 0, 600, 450), []);
  assert.deepEqual(createSlideSlots(container as HTMLElement, Number.NaN, 600, 450), []);
  assert.equal(container.children.length, 0);
});

test("mountRenderedSlide：把库渲染出来的页搬进槽，节点真的换了父亲", async () => {
  const doc = await getDocument();
  const wrapper = doc.createElement("div");
  const slide = doc.createElement("div");
  slide.className = "pptx-preview-slide-wrapper pptx-preview-slide-wrapper-1";
  wrapper.appendChild(slide);
  const slot = doc.createElement("div");
  slot.className = "pptx-page-slot";

  assert.equal(mountRenderedSlide(slot as HTMLElement, wrapper as HTMLElement, 1), true);
  assert.equal(slot.children.length, 1);
  assert.equal(slot.firstElementChild, slide);
  assert.equal(wrapper.children.length, 0);
});

test("mountRenderedSlide：与 renderSlide 的调用顺序无关，按 page index 归位", async () => {
  const doc = await getDocument();
  const wrapper = doc.createElement("div");
  const [slotA, slotB] = createSlideSlots(doc.createElement("div") as HTMLElement, 2, 600, 450);
  for (const index of [1, 0]) {
    const slide = doc.createElement("div");
    slide.className = `pptx-preview-slide-wrapper pptx-preview-slide-wrapper-${index}`;
    slide.textContent = `第 ${index + 1} 页`;
    wrapper.appendChild(slide);
    assert.equal(mountRenderedSlide(index === 0 ? slotA : slotB, wrapper as HTMLElement, index), true);
  }
  assert.equal(slotA.textContent, "第 1 页");
  assert.equal(slotB.textContent, "第 2 页");
});

test("mountRenderedSlide：库没渲染出这一页时返回 false，槽位保持原样", async () => {
  const doc = await getDocument();
  const wrapper = doc.createElement("div");
  const slot = doc.createElement("div");
  slot.textContent = "占位";

  assert.equal(mountRenderedSlide(slot as HTMLElement, wrapper as HTMLElement, 0), false);
  assert.equal(slot.textContent, "占位");
});

test("topmostSlotIndex：空列返回 0", () => {
  assert.equal(topmostSlotIndex([], 0), 0);
  assert.equal(topmostSlotIndex([], 9000), 0);
});

test("topmostSlotIndex：容器顶部落在哪一槽就报哪一槽", async () => {
  const doc = await getDocument();
  const slots = createSlideSlots(doc.createElement("div") as HTMLElement, 3, 600, 450);
  place(slots[0], 12);
  place(slots[1], 476);
  place(slots[2], 940);

  assert.equal(topmostSlotIndex(slots, 0), 0);
  assert.equal(topmostSlotIndex(slots, 12), 0);
  assert.equal(topmostSlotIndex(slots, 300), 0);
  assert.equal(topmostSlotIndex(slots, 476), 1);
  assert.equal(topmostSlotIndex(slots, 900), 1);
  assert.equal(topmostSlotIndex(slots, 940), 2);
  // 滚过头（回弹 / 高度变化）仍停在最后一页，不越界。
  assert.equal(topmostSlotIndex(slots, 99999), 2);
  // 非法 scrollTop 当作 0。
  assert.equal(topmostSlotIndex(slots, Number.NaN), 0);
});
