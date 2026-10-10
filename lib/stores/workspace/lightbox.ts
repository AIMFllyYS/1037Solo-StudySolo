import { create } from "zustand";

/**
 * 工具栏落点。
 * - `bottom`：默认。工具栏就贴在图片下方，是"在图片下面给一条工具栏"的直译。
 * - `top-right`：Mac 弹窗里用（那边图片是窗口的一部分，底部空间属于窗口自己，压在图片下面会打架）。
 */
export type LightboxToolbar = "bottom" | "top-right";

interface LightboxState {
  src: string | null;
  alt: string;
  toolbar: LightboxToolbar;
  open: (src: string, alt?: string, options?: { toolbar?: LightboxToolbar }) => void;
  close: () => void;
}

export const useLightbox = create<LightboxState>((set) => ({
  src: null,
  alt: "",
  toolbar: "bottom",
  open: (src, alt = "", options) => set({ src, alt, toolbar: options?.toolbar ?? "bottom" }),
  close: () => set({ src: null, alt: "" }),
}));
