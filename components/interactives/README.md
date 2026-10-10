# `components/interactives/`

这里是**手写**的 React 交互组件注册表（见 `registry.ts`）。

- 对应内容 manifest 的 `renderType='component'`，以及右侧面板「可交互」tab。
- 由笔记里的 `::interactive{id=...}` 引用，**不是** AI 生成的 HTML。

AI 生成的 HTML 演示（Artifact / 工具 id `renderInteractive`）走全局浮窗，见 `lib/ai/agent/tools/renderInteractive/tool.ts` 的路径地图，入口是 `components/chat/products/ArtifactViewer.tsx`。不要在本目录改那个功能。不要只搜「可视化」两个字。
