"use client";

import { useState } from "react";

/**
 * 处理态驱动的展开/折叠开关——业界对话 UI（思考块 / 工具调用）的标准开合行为：
 *  - 处理开始（false→true）：自动展开
 *  - 处理结束（true→false）：自动折叠
 *  - 两次跃迁之间：用户手动开合受尊重
 *
 * 用「渲染期跃迁检测」（把上一处理态存进 state，prop 变化时直接 setState）而非 useEffect——
 * 这是 React 官方推荐的「随 prop 变化调整 state」写法：同一组件渲染期 setState 会立即重渲、
 * 不提交到 DOM，故无「先渲旧态再纠正」的闪烁，也不触发 set-state-in-effect 告警。
 *
 * 返回 [open, setOpen]，setOpen 供 header 按钮手动切换。
 */
export function useProcessingDisclosure(processing: boolean, initial = false) {
  const [open, setOpen] = useState(initial || processing);
  const [prevProcessing, setPrevProcessing] = useState(processing);
  if (prevProcessing !== processing) {
    setPrevProcessing(processing);
    setOpen(processing);
  }
  return [open, setOpen] as const;
}
