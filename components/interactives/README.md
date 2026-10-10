# `components/interactives/`

这里是**手写**的 React 交互组件注册表（见 `registry.ts`）。

- 对应内容 manifest 的 `renderType='component'`，以及右侧面板「可交互」tab。
- 由笔记里的 `::interactive{id=...}` 引用，**不是** AI 生成的 HTML。

AI 生成的 HTML 演示（Artifact / 工具 id `renderInteractive`）走全局浮窗，见 `lib/ai/agent/tools/renderInteractive/tool.ts` 的路径地图，入口是 `components/chat/products/ArtifactViewer.tsx`。不要在本目录改那个功能。不要只搜「可视化」两个字。

长组件按实际职责拆分，注册表仍指向原客户端入口。概率章节的均值/方差检验、矩估计、抽样分布、边缘分布和 CDF 入口只组合本机状态与视图；对应同名子目录维护 plot、controls、derivation、appearance 等展示，数学模型位于 `lib/learning/probability/`，不引用 React 展示层。CDF 的场景 Hook 管理计算与拖动生命周期，SVG 接收同一场景的 ref 和事件；边缘分布反例是独立的纯展示板块。

共享数值函数放在该领域的 `math/` 和 `samples.ts`，只有参数、计算次序和依赖确认相同后才复用。尺寸不同的 SVG 映射和使用不同近似方法的数值算法不能仅按函数名合并。修改数学时同时运行 `probabilityModels.test.ts` 和 `probabilityInteractions.test.tsx`；旧版输出比较不能代替独立公式校验。2026-10-10 的拆分、χ² 修复与浏览器证据见 [验收记录](../../docs/analysis/2026-10-10-probability-refactor-validation.md)。
