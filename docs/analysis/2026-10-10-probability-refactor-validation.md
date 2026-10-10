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

## 第二批交互分层与协方差轴修复

第二批结构起点为 `f8e0ac1a`。26 个剩余长概率交互和一个 R/S 构型练习，按基础概率、随机变量/密度、联合分布、矩、极限、抽样、估计、检验和立体化学分组。纯计算在 lib/learning 的对应领域；绘图、几何、局部控件、展示配置和推导留在 components/interactives 的入口同名子目录。颜色与理论函数混在一起的变换配置保留为展示配置，纯计算不反向依赖它。

初次拆分对照全部 27 个原入口的 698 个非 import 声明，忽略注释/空白和新增 export 后，公式、类型及 JSX token 完全一致。此对照证明源码迁移保留，不能代替独立正确性检查。其后 MLE 的原 SVG 表达式逐字移动到 LikelihoodPlot；鼠标/触摸、ref 与数据状态仍归原控制器。R/S 的三步局部状态类型留在入口，避免为一个类型建立模块。原 registry 的 ID、章节、小节和 dynamic/ssr:false 均保持。

独立检查发现旧协方差函数将特征向量第一坐标写为 `lambda2 - a`，第二坐标为 `b`。对于矩阵 `[[a,b],[b,d]]` 且 `a !== d`，这一般不满足 `Av = lambda v`，导致椭圆与轴方向不对应真实协方差矩阵。改为归一化 `[lambda2 - d, b]`；由特征多项式 `(lambda-a)(lambda-d)=b²` 可直接验证两个坐标等式。依据为 [MIT 特征值与特征向量定义](https://math.mit.edu/~djk/18_022/chapter16/section04.html)；这里的修复结论由代入原代码及矩阵残差测试推导。

例子 `[[4,0.5],[0.5,1]]`：两个特征值保留，旧长轴向量约 `(0.160,0.987)`，修正后约 `(0.987,0.160)`。相等方差、对角矩阵、退化矩阵分支沿用原逻辑。此次会改变不等方差且非零协方差时的向量、椭圆、轴线和角度，不改变输入控件、特征值、半轴长度及交互能力。

新增 domainContracts 的 7 项性质检查覆盖离散概率归一、条件独立、卷积概率质量/交换性、似然极值、方差平移/缩放、可靠度对偶/单调性，以及协方差 `Av=lambda v`/正交/trace/determinant。修复前 6 通过、特征向量残差失败；修复后 7 通过，与第一批 6 项合计 13 项。React 新增 27 个真实入口挂载检查及 MLE 数据输入/分布切换，与原 11 项合计 39 项通过。全量类型和定向 ESLint 通过，后续统一门禁仍必需。

真实教材 `/probability/detail/4.4` 中使用原滑杆，把第一项方差 1 调到 1.05，第二项 0.5、相关系数 0.6；界面显示长轴向量约 `(0.876,0.482)` 和 `28.8°`，椭圆/轴线一致更新。另在 `/probability/detail/7.2` 输入 `1,1,1,1`，显示 MLE `1.0000` 和 logL `-4.00`；点击新图形后原游标更新为 `2.3450`，logL 约 `-5.97`。截图 `covariance-corrected-axis.png`、`likelihood-after-plot-split.png` 保存于同一忽略验收目录。访客阅读和本地参数交互未触发付费请求。
