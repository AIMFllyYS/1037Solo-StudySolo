# docs/ 总索引

> 本文件是 `docs/` 全站文档的唯一入口。任何人或 AI 智能体想知道"这份东西该写在哪、该去哪找"，先看这一页。
>
> **读文档前先分清两类**：本页「现行文档」下的内容是**现在仍然成立**的规范与现状说明，可以直接照做；本页「归档区（RETIRED）」下的内容描述的是**已经不存在的系统**，只能当历史看，**不得当成现状**。
>
> 判断某份文档是否已过时，以 [`plans/archive/00-execution-contract.md`](./plans/archive/00-execution-contract.md) 第六节「既成不变量」为准。本轮 Agent 整改入口是 [`plans/Agent-refactor/00-loop-map.md`](./plans/Agent-refactor/00-loop-map.md)。

---

## 一句话导航

| 我想... | 去哪 |
|---|---|
| 了解现在的架构/约定是什么、有哪些不能踩的红线 | [`plans/archive/00-execution-contract.md`](./plans/archive/00-execution-contract.md) 第六节 |
| 看这一轮 Agent 平台整改做了什么、按哪个 loop 跑 | [`plans/Agent-refactor/00-loop-map.md`](./plans/Agent-refactor/00-loop-map.md) |
| 按 SOP 生产内容（教材/详解/录音/题目/新学科接入…） | [`sop/`](./sop/README.md) |
| 派发一次具体的内容同步/生成任务，怎么写 prompt | [`prompt/goal-model.md`](./prompt/goal-model.md) |
| 查某个子系统当前实现的权威说明（渲染架构、存储架构等） | [`refer/`](#refer--权威参考手册活文档) |
| 看某次重构的完整过程、某轮调研/审计的结论 | [`plans/`](./plans/README.md)、[`analysis/`](#analysis--调研与审计记录按轮次存放) |
| 查与生态中央服务（额度/计费/课堂/资产索引）的对接口径 | [`central-ai-billing-20260927.md`](./central-ai-billing-20260927.md)、[`endpoint-tariffs.md`](./endpoint-tariffs.md)、[`classolo-integration-20260927.md`](./classolo-integration-20260927.md)、[`cloud-asset-index.md`](./cloud-asset-index.md) |
| 找已经完成/废弃/不再维护的旧材料 | [`archive/`](./archive/README.md)、[`plans/archive/`](./plans/archive/README.md) |
| 看未采纳的设计探索快照（**禁止作为开发参考**） | [`design-snapshots/`](./design-snapshots/README.md) |

---

## 现行文档

```
docs/
├── README.md          ← 你在这里
├── plans/                执行计划：Agent-refactor/（现行 loop）+ archive/（历史计划 01–25）
├── refer/                权威参考手册（活文档，须与代码一致）
├── sop/                  标准操作流程（活文档，13 篇编号 SOP + 新学科接入 + 索引）
├── prompt/               派发内容任务的提示词模板（Goal Model 等）
├── analysis/             历轮调研 / 性能审计 / 修复记录（按轮次存放，见下）
├── design-snapshots/     未采纳的设计探索快照（git 跟踪，但禁止开发照搬）
└── archive/              历史归档（RETIRED，见文末「归档区」）
```

### 顶层散文档（生态对接口径，2026-09-27 起）

| 文件 | 覆盖 |
|---|---|
| [`central-ai-billing-20260927.md`](./central-ai-billing-20260927.md) | AI 计费接入：`withPaidRequest` / `withProviderAdmission` 准入、预留-结算、中央钱包权威、额度与兑换 |
| [`endpoint-tariffs.md`](./endpoint-tariffs.md) | 端点价目与结算：`lib/billing/trusted-tariffs.json`、缓存/阶梯计价、服务项单价 |
| [`classolo-integration-20260927.md`](./classolo-integration-20260927.md) | Classolo / 课堂模式的接入状态、生产域名与 MFA cookie 约定 |
| [`cloud-asset-index.md`](./cloud-asset-index.md) | 普通同步产物投影到 `asset_index` 的触发器、入口路由与存储口径 |

> 这四份文件描述的是「本地已实现、待生态侧协调迁移与验收」的状态，正文自带 status 说明，读时以正文为准。

### `refer/` —— 权威参考手册（活文档）

描述"某个子系统现在具体怎么实现"，必须与代码保持一致：

| 文件 | 覆盖 |
|---|---|
| `rendering-architecture.md` | Markdown 渲染架构、指令组件、"可视化 HTML"唯一入口链路 |
| `storage-architecture.md` | Zustand + IndexedDB / localStorage 存储分层 |
| `performance-audit-report.md` | 性能审计与优化记录（2026-06 审查 + 后续订正） |
| `framework-extension.md` | 框架扩展点（新增学科/板块/工具的接入面） |
| `adding-an-agent-tool.md` | 新增一个 Agent 工具的操作指南 |
| `modern-history-textbook-format.md` | 中国近现代史纲要教材格式规范 |
| `exam-type-distribution.md` | 各科目考试题型配比（内容 Agent 维护） |
| `mineru-parsing-guide.md` | MinerU API 文档解析指南（内容 Agent 维护） |

### `analysis/` —— 调研与审计记录（按轮次存放）

不是实时镜像，**每份的成立时间看它自己的日期与文首说明**；具体子系统的现网实现优先看 `refer/`。

| 路径 | 内容 |
|---|---|
| `9-9/`（18 篇） | 2026-07-05 的全项目深度调研快照（[`overview.md`](./analysis/9-9/overview.md) 有方法论与团队分工）。其中 `03`/`06` 已按现网整篇重写，`04` 明确标注为过时快照，其余按当时状态保留、只在命中处补了「现已搬到 X」的括注 |
| `perf-audit-2026-09/`（11 篇） | 2026-09-23 的性能专项全量审查，入口 [`README.md`](./analysis/perf-audit-2026-09/README.md)；与 `refer/performance-audit-report.md` 冲突时以本报告为准 |
| `Agent/`（11 篇 + 对比页） | Agent 板块：问题总清单 [`00-agent-issues-consolidated.md`](./analysis/Agent/00-agent-issues-consolidated.md)（现行问题基线）、六份模型审查报告、上下文完整性修复、供应商扩容与多源联网搜索分析、[`01-goal-mode-runbook.md`](./analysis/Agent/01-goal-mode-runbook.md)（**第 1–3 节调度规则已被 loop 制取代，文首有提示**） |
| `Content/` | 课堂材料接入：[`2026-09-13-classroom-content-integration-plan.md`](./analysis/Content/2026-09-13-classroom-content-integration-plan.md) |
| 顶层 4 篇 | 2026-09-19/20 的定向修复记录：附件预览渲染缺陷、剩余文档格式阅读能力、笔记 Agent 与编辑器交接、Studio 笔记修复落地 |

### `plans/` —— 执行计划

存放"做一件事的完整任务书"。

- [`Agent-refactor/`](./plans/Agent-refactor/) —— **本轮 Agent 平台整改（现行）**。入口 [`00-loop-map.md`](./plans/Agent-refactor/00-loop-map.md)，可投喂的提示词 [`99-goal-mode-prompt.md`](./plans/Agent-refactor/99-goal-mode-prompt.md)，模型清单 [`MODELS.md`](./plans/Agent-refactor/MODELS.md)（文首标注了部分过时项）。
- [`archive/`](./plans/archive/) —— 已完成/被取代的计划与审计（`01`–`25`）。**历史记录，正文里的"过时路径"是历史该有的样子，不要改写**；[`archive/00-execution-contract.md`](./plans/archive/00-execution-contract.md) 第六节是唯一权威的「既成不变量」汇总，**仍然是现行的**。
- 其余散文件：右栏统一、Agent 左栏与资产、文档阅读器重建、Agent UX 收尾、笔记/闪卡云同步（0005）、昵称（0006）、Classolo/Review 目标进度、登录与人机验证面板改版规划——索引见 [`plans/README.md`](./plans/README.md)。

### `sop/` —— 标准操作流程（活文档）

内容生产的操作规范，索引见 [`sop/README.md`](./sop/README.md)（含 SOP 编号、覆盖板块、全局规范、内容路径约定表）。执行任何内容生产任务前必须先查这里定位适用的 SOP。

### `prompt/` —— 提示词模板（活文档）

派发具体内容任务时用的提示词模板，见 [`prompt/README.md`](./prompt/README.md)。与 `sop/` 的关系：`sop/` 是"应该怎么做"的规范，`prompt/` 是"怎么正确地把规范喂给一次具体任务派发"的模板。

### `design-snapshots/` —— 未采纳的设计探索快照

仍被 git 跟踪的阶段性设计系统 / 设计稿快照，但对应体系尚未成熟、未被产品采纳。**不是设计规范，新功能设计与前端开发不得直接照搬**，见 [`design-snapshots/README.md`](./design-snapshots/README.md)。当前含 2026-09 StudySolo Glass 玻璃拟态探索（设计库 + 13 屏设计稿）。

---

## 归档区（RETIRED）—— 描述的系统已不存在，不得当作现状

⛔ **这里的文档是被替换掉的历史。** 正文里的路径、命令、表名、端口、工具数量多数对不上现网代码。可以读来理解"当时为什么这么设计"，**不可以照做，也不可以作为架构现状引用**。

| 归档区 | 内容 | 索引 |
|---|---|---|
| [`archive/`](./archive/README.md) | 已退役文档总区：旧调度提示词与课堂材料讨论稿（2026-09-12 两批）、`trae-specs/`、`简化版本/`、`superpowers/`、`compose/`、`releases/`、`HANDOFF-agent-sdk-trace-ui.md`、`REWRITE-LOOP.md`、`large-assets-2026-09.md` | [`archive/README.md`](./archive/README.md)（**含"什么被什么取代"清单，先读它**） |
| [`plans/archive/`](./plans/archive/README.md) | 计划 `01`–`25` 的历史索引 | [`plans/archive/README.md`](./plans/archive/README.md) |

---

## 根目录文档

- `README.md`（仓库根）—— 项目总览、快速开始、功能特性、技术栈。
- `CHANGELOG.md`（仓库根）—— 版本变更日志。

> `REWRITE-LOOP.md` 原在仓库根目录，已随其所记录任务的完成移入 [`docs/archive/`](./archive/README.md)，不再是根目录文档。

---

## 维护规则

1. 新增文档前先看这份索引，确认放对目录：**当前实现说明**进 `refer/`，**操作步骤**进 `sop/`，**一次性任务记录**进 `plans/`，**调查/审计结论**进 `analysis/`，**过时/完成使命的材料**进 `archive/`。
2. 改动了 `18`–`24` 建立的任一约定时，同步更新 `plans/archive/00-execution-contract.md` 第六节——它是唯一权威源，不能只改局部文档。
3. 新计划完成后，在 `plans/README.md` 的文件索引表补一行、更新拓扑图状态。
4. 把文档移入归档区时：`git mv` 保留文件、在文首补一段「已归档 / 已被取代 + 现行入口」，并回到本页与 [`archive/README.md`](./archive/README.md) 的清单里登记。**不要删除文件。**
