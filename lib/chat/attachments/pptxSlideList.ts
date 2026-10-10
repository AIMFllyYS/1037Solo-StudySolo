/**
 * PPTX 纵向页列的纯逻辑 + DOM 操作。
 *
 * 只做三件不需要 React 的事：算占位高度、建槽、把库渲染好的页搬进槽。
 * 「什么时候渲染第几页」留在组件里，这里不持有任何状态，便于单独测。
 */

export interface PptxSlideMetrics {
  count: number;
  deckWidth: number;
  deckHeight: number;
}

function isUsableLength(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * 单页在给定显示宽度下的高度（CSS px），用于建占位槽。
 *
 * 与 pptx-preview 的 `renderPort.height = pptx.height × (显示宽 / pptx.width)` 同源，
 * 所以槽位高度就是真实渲染高度：懒渲染还没轮到的那一页也占着正确的位置，
 * 滚动条长度提前稳定，滚过去时不会边加载边跳。
 */
export function slideDisplayHeight(
  deckWidth: number,
  deckHeight: number,
  displayWidth: number,
): number {
  if (!isUsableLength(deckWidth) || !isUsableLength(deckHeight) || !isUsableLength(displayWidth)) {
    return 0;
  }
  return Math.round((displayWidth * deckHeight) / deckWidth);
}

/**
 * 在 container 内按顺序建 count 个 .pptx-page-slot，返回槽元素数组。
 *
 * 槽位显式写死宽高：容器是 flex 列，靠槽位自己撑出高度，库渲染出来的页才有地方落。
 */
export function createSlideSlots(
  container: HTMLElement,
  count: number,
  displayWidth: number,
  displayHeight: number,
): HTMLElement[] {
  container.replaceChildren();
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const slots: HTMLElement[] = [];
  for (let index = 0; index < total; index += 1) {
    const slot = container.ownerDocument.createElement("div");
    slot.className = "pptx-page-slot";
    // 1-based 页码：测试与「跳到第 n 页」都按人读的页码来。
    slot.dataset.pptxPage = String(index + 1);
    if (isUsableLength(displayWidth)) slot.style.width = `${displayWidth}px`;
    if (isUsableLength(displayHeight)) slot.style.height = `${displayHeight}px`;
    container.appendChild(slot);
    slots.push(slot);
  }
  return slots;
}

/**
 * 把库刚 renderSlide 出来的元素搬进第 index 个槽；返回是否成功。
 *
 * replaceChildren 会把节点从库里那棵树上摘下来，所以「搬到哪个槽」只由 index 决定，
 * 与 renderSlide 的调用顺序无关——先渲染第 8 页再渲染第 2 页也不会串位。
 */
export function mountRenderedSlide(slot: HTMLElement, wrapper: HTMLElement, index: number): boolean {
  const slide = wrapper.querySelector<HTMLElement>(`.pptx-preview-slide-wrapper-${index}`);
  if (!slide) return false;
  slot.replaceChildren(slide);
  return true;
}

/**
 * 当前最靠近容器顶部的槽下标（0-based）；slots 为空返回 0。
 * scrollTop 与槽的 offsetTop 必须同源（都取正文滚动容器与它的后代）。
 */
export function topmostSlotIndex(slots: HTMLElement[], scrollTop: number): number {
  if (slots.length === 0) return 0;
  const top = Number.isFinite(scrollTop) ? scrollTop : 0;
  let index = 0;
  for (let i = 0; i < slots.length; i += 1) {
    // +1 容错：子像素滚动时首槽的 offsetTop 可能比 scrollTop 大不到 1px。
    if (slots[i].offsetTop <= top + 1) index = i;
    else break;
  }
  return index;
}
