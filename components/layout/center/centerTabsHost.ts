"use client";

import { createContext, useContext } from "react";

/**
 * 中间工作区是否在替内容页画 Tab 栏。
 *
 * 桌面 Studio 三栏里 CenterWorkspace 把「正文 / 例题 / 题目测试」和「视频 / 可交互 /
 * 浏览器」合成一条栏；移动端等没有工作区外壳的地方，内容页仍自己画栏。
 */
export const CenterTabsHostContext = createContext(false);

export function useCenterTabsHosted(): boolean {
  return useContext(CenterTabsHostContext);
}
