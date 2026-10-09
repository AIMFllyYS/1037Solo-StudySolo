"use client";

import { useWindowManager } from "@/lib/hooks/useWindowManager";
import TextbookWindow from "./TextbookWindow";

/** 内部教材窗层：窗口管理器里有 textbook 类型的窗口时才渲染。 */
export default function TextbookLayer() {
  const open = useWindowManager((s) => s.windows.some((win) => win.type === "textbook"));
  return open ? <TextbookWindow /> : null;
}
