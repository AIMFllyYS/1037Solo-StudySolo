# 概率交互职责拆分与数值验收

日期：2026-10-10。结构比较起点：`447ad27c`。本记录是当前改动的证据，不是旧任务执行指令。

## 职责与边界

| 原入口 | 原行数 | 当前入口行数 | 独立职责 |
| --- | --- | --- | --- |
| CDFVisualizer | 999 | 321 | 分布模型、坐标、拖动、场景、SVG、状态/控件 |
| MeanTestExplorer | 931 | 333 | 均值检验模型、分布图、输入控件、推导、状态组合 |
| VarianceTestExplorer | 916 | 343 | 方差检验模型、分布图、输入控件、推导、状态组合 |
| MomentEstimator | 873 | 383 | 样本/矩估计、收敛图、推导展示、控件、状态组合 |
| SamplingDistExplorer | 917 | 337 | 三种抽样分布模型、图形、控件与状态组合 |
| MarginalExplorer | 919 | 413 | 联合/边缘模型、热力图与条图、反例展示、状态组合 |

数学位于 `lib/learning/probability/`，不导入 components 或浏览器状态。展示位于原入口的同名子目录，registry 的 ID、章节、小节、描述及动态入口不变。依据安装版 Next `use-client` 与 project structure 文档：状态/事件在客户端入口，其子树直接接收 ref/回调；纯计算不用添加客户端声明。

共享的是逐 token 相同且依赖已确认的参数化/标准正态密度、Lanczos Gamma、行/列边缘求和和样本解析，共 6 组、11 个消费者。相似 SVG 映射引用了不同尺寸，保留各自几何；不同近似算法不合并。

## 独立校验发现的 χ² 错误

旧 `regularizedGammaP` 上尾分支的初始分母、后续分母系数和最终倒数处理不符合上不完全 Gamma 的连分式，导致 CDF 跳变。旧版 `chi2Quantile(0.975, 2)` 得到约 `4`，代回旧 CDF 约 `0.8646647`，与目标概率 `0.975` 不符。修正为正确连分式和 modified Lentz 求值后，结果约 `7.377758908`。

依据：[NIST DLMF 8.9.2 上不完全 Gamma 连分式](https://dlmf.nist.gov/8.9.E2)、[DLMF 8.4.9 整数参数的闭式关系](https://dlmf.nist.gov/8.4.E9)、[NIST χ² 分布定义](https://www.itl.nist.gov/div898/handbook/eda/section3/eda3666.htm)。自由度 2 时可独立计算 `F(x)=1-exp(-x/2)`，因而该分位点等于 `-2*log(0.025)`；不依赖被测的二分/CDF 自证。

UI 支持样本量到 500，旧 `logGamma` 先求 Gamma 再取对数会在大参数溢出。共享 Gamma 模块沿用有限值的原算术；对溢出的正参数在对数域计算同一 Lanczos 展开，方差检验不再通过 Infinity 得到断裂概率。测试涵盖自由度 499 的分位点反演，以及 498 等偶数自由度的独立闭式 CDF。

这是针对已有数学功能错误的修复，会改变对应的 CDF、临界值、p 值和检验判断；函数签名、输入控件、图形能力和输出契约保留。没有把数值修复包装成纯结构变化。

## 检查与实际页面

修复前，原函数和拆分模型的 906 组确定性比较完全相同，包括尾部、分位点、曲线数组、矩、边缘、非有限值和固定随机序列。修复后 824 组继续完全相同，82 组仅在上述 χ² 修复影响范围内改变；这些比较不证明所有数学算法的独立正确性。

持久回归：

- `node --import tsx --test lib/learning/probability/probabilityModels.test.ts`：6 项通过，包括概率边界、Gamma、闭式 χ²、分位点、矩与边缘。
- `node node_modules/vitest/vitest.mjs run components/interactives/probability/probabilityInteractions.test.tsx`：11 项通过，包括 SVG 拖动/松开、检验参数、三分布切换、样本输入、反例标签，以及五个额外共享数值消费者的真实组件挂载。
- 全量 TypeScript 与受影响目录 ESLint 通过；本阶段结果不替代最终全项目生产构建和内容/组件门禁。

真实 IAB 从 `/probability/detail/2.3` 的可交互入口显示正态 CDF `0.5000` 并切换 CDF 图；从 `/probability/detail/8.3` 选择 n=3，实际 df=2，双侧临界值显示 `0.051 / 7.378`。中心 Tab 已有自动隐藏设置，使用键盘焦点展开其真实控件；未通过脚本修改页面状态或执行模型调用。

本地原始比较与截图在忽略目录 `docs/plans/project-refactor/verify/`：`probability-equivalence.json`、`cdf-after-model-split.jpg`、`variance-test-corrected-critical.jpg`。源码原件仍可从上述 Git 起点复现。
