export interface PopoverPos {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
}

/** 由锚点按钮计算「在其上方弹出」的浮层位置（向上生长，靠左对齐，视口内夹取）。 */
export function computePos(anchor: HTMLElement | null): PopoverPos {
  const gap = 8;
  const margin = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const width = Math.min(352, vw - margin * 2);
  if (!anchor) {
    return { left: margin, bottom: 48, width, maxHeight: vh - 64 };
  }
  const r = anchor.getBoundingClientRect();
  let left = r.left;
  if (left + width > vw - margin) left = vw - margin - width;
  if (left < margin) left = margin;
  return {
    left,
    bottom: Math.max(margin, vh - r.top + gap),
    width,
    maxHeight: Math.max(160, r.top - gap - margin),
  };
}