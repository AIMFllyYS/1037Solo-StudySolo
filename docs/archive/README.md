# docs/archive —— 已退役文档（RETIRED）

> ⛔ **这一整个目录里的文档都是退役文档。**
>
> - 它们描述的是**已经被替换掉、今天不再存在的架构、流程与文件布局**，正文里的路径、命令、表名、端口、工具数量多数已对不上现网代码。
> - 它们**只为历史查阅保留**（"当时为什么这么设计"），**不是现行规范，也不是开发或内容生产的依据**。
> - **AI 智能体不得把这里的任何一份文档当成现状**：不要照抄其中的路径与命令，不要按其中的步骤执行任务，不要把它当作"当前架构说明"。需要现状时以 `docs/refer/`、`docs/sop/`、`docs/plans/Agent-refactor/` 与仓库代码为准。
> - 每份被移入的文件在文首都加了「已归档 / 已被取代」提示与现行入口链接；正文原则上不再回改。

从主线移入本目录的历史材料索引，见下方「归档清单」。当前文档的总入口是 [`docs/README.md`](../README.md)。

---

## 归档清单：什么被什么取代

| 归档路径 | 原位置 | 为何退役 / 被谁取代 |
|---|---|---|
| [`2026-10-04-unattended-snapshots/`](2026-10-04-unattended-snapshots/README.md)（8份） | 本轮plans/refer/analysis准备与进度快照 | 包含冲突/过时阶段状态，当前入口统一为[`../handoff/`](../handoff/README.md)，正文保留/hash可查，不再调度 |
| `2026-09-12-one-issue-per-loop/analysis/Agent/02-goal-mode-prompt.md` | `docs/analysis/Agent/02-goal-mode-prompt.md` | 「一个 Issue = 一个 loop」的旧调度提示词。2026-09-12 16:45 起被 loop 制取代（见 [`docs/plans/Agent-refactor/00-loop-map.md`](../plans/Agent-refactor/00-loop-map.md)），可直接投喂的新版是 [`docs/plans/Agent-refactor/99-goal-mode-prompt.md`](../plans/Agent-refactor/99-goal-mode-prompt.md)。**照它执行会重跑已关闭的 Issue。** |
| `2026-09-12-classroom-content-draft/2026-09-12-recording-content-pr-loop-analysis.md` | `docs/analysis/Content/2026-09-12-recording-content-pr-loop-analysis.md` | 课堂材料接四类的早期讨论稿（假设音频播放器 / PDF 必交 / PPT 转换）。被 [`2026-09-13-classroom-content-integration-plan.md`](../analysis/Content/2026-09-13-classroom-content-integration-plan.md) 整体取代。*（归档时保持原有目录深度，以便正文里的 `../../../lib/...` 相对链接继续解析）* |
| `trae-specs/`（6 篇） | `.trae/specs/*/spec.md`（Trae 私有目录，已从 git 索引移除） | 历史内容整合 / 架构升级规格，对应代码多已被计划 `18`–`24` 取代。 |
| `简化版本/`（19 篇） | `docs/简化版本/` | 概率论与数理统计的独立自学笔记草稿，与 `content/` 里课堂录音驱动的正式课件是两套体系。 |
| `superpowers/`（8 篇） | `docs/superpowers/` | 2026-06 的历史设计草案（`plans/` + `specs/`）。 |
| `compose/`（3 篇） | `docs/compose/` | 2026-06 的历史设计草案（`plans/` + `specs/`），性质同 `superpowers/`。 |
| `releases/2026-06-30-v0.3.1-critical-fixes.md` | `docs/releases/` | v0.3.1 发布说明，纯历史记录。 |
| `HANDOFF-agent-sdk-trace-ui.md` | `docs/HANDOFF-agent-sdk-trace-ui.md` | Agent SDK / Trace UI 迁移交接文档，已被计划 `22`/`23`/`24` 完成并取代。 |
| `REWRITE-LOOP.md` | 仓库根目录 | 大二上医学教材富文本改写循环的任务专属操作卡，任务已完成；可复用机制已沉淀进 [`docs/sop/00-infrastructure.md`](../sop/00-infrastructure.md)「内容生产闭环与反降质契约」及 `01`/`02`/`02b`/`03`/`04`。 |
| `large-assets-2026-09.md` | `docs/large-assets-2026-09.md` | 大体积资源归档记录。 |

> 说明：本目录里的文件**仍被 git 跟踪**（"移出主线"指不再属于现行文档体系，不是从版本库删除）。`docs/plans/archive/` 是另一套归档（计划 `01`–`25`），索引见 [`docs/plans/archive/README.md`](../plans/archive/README.md)。

---

## `2026-09-12-one-issue-per-loop/`

Agent 板块整改第一轮的执行提示词（#48–#101 共 54 个子 Issue，一号一循环）。实跑 11.6 小时后被 loop 制重排取代，理由与账目记在 `docs/plans/Agent-refactor/00-loop-map.md` 第 1 节。

保留价值：其中的「起跑顺序」「放弃协议」「分支不变量」是当时真实用过的编排，可作为编排演进的对照。**注意其现状描述已过时**（例如 `.env` 当时未 gitignore、`prebuild` 当时串 8 个守卫）。

同轮的调度手册 [`docs/analysis/Agent/01-goal-mode-runbook.md`](../analysis/Agent/01-goal-mode-runbook.md) **没有归档**：它的第 1–3 节调度规则已被取代（文首有醒目提示），但第 0 节（Supabase / 标签 / RLS 现状）与第 4 节（三个坑）经评估仍然可用，因此保留在 `docs/analysis/Agent/`。

## `2026-09-12-classroom-content-draft/`

课堂材料接入的早期讨论稿。用户随后把课堂材料口径定为「录音原文、课堂纪要、HTML 笔记、富文本复习手卡」四类，明确不要音频播放器、不要求 PDF 必交、不做 PPT 转换工程，该稿的假设因此整体作废。现行方案见 `docs/analysis/Content/2026-09-13-classroom-content-integration-plan.md` 与 SOP `12`。

## `trae-specs/`

来源：`.trae/specs/*/spec.md`（Trae 工具私有目录，已从 git 索引移除）。

每个文件对应一次历史内容整合或架构升级规格，只归档 `spec.md`，不含当时的 `tasks.md` / `checklist.md`。

| 文件 | 主题 | 现状 |
|------|------|------|
| `integrate-maogai-content.md` | 毛概学科内容整合 | 内容已整合完成（`content/maogai/`）；描述的注册路径已改为 `lib/content-data/manifest.ts` 的 `contentTree` |
| `integrate-organic-chemistry-content.md` | 有机化学内容整合 | 内容已整合完成（学科目录现为 `content/chemistry/`） |
| `integrate-modern-history-content.md` | 中国近现代史纲要纪要补全 | 同上（`content/modern-history/`） |
| `quick-explain-window-upgrade.md` | 划词快捷解释浮窗升级 | 未见同名 `QuickExplainWindow` 组件，浮窗能力已收敛为 `components/window/ManagedWindow.tsx` |
| `unify-viz-and-multi-subject-sop.md` | 统一可视化与多学科 SOP 架构 | 其中的 SOP 结构已演进（现为 `docs/sop/` 的 13 篇编号 SOP + 新学科接入 + 索引） |
| `upgrade-ai-chat-and-architecture.md` | AI 对话系统升级与架构规范化 | 早于计划 `18`–`24`，工具命名（snake_case、`lib/ai/tools.ts`）整体作废 |

`.claude/workflows/*.js` 是已被 `scripts/` 取代的旧生成脚本，不归档。

## `简化版本/`

概率论与数理统计的独立自学笔记草稿（README + Lesson_01~18，共 19 个文件），与 `content/` 里课堂录音驱动的正式课件是两套体系，不受本仓库代码重构影响。原先误放在 `docs/` 根目录，现移入本目录以免与项目规范文档混淆；正文未改动。

## `superpowers/` 与 `compose/`

2026-06 的历史设计草案：`superpowers/` 为 `plans/`（4）+ `specs/`（4），`compose/` 为 `plans/`（2）+ `specs/`（1）。文件名自带日期，记录的是那个时间点的方案权衡，与 `docs/design-snapshots/` 的区别是后者是**设计视觉**快照、前者是**工程方案**草案。

## `releases/`

按版本号存档的发布说明（v0.3.1），纯历史记录。

## `REWRITE-LOOP.md`

大二上医学教材富文本改写循环的任务专属操作卡，原在仓库根目录。任务已完成（五科教材整科收口），其中可复用的反降质机制已沉淀进 `docs/sop/00-infrastructure.md`「内容生产闭环与反降质契约」及 `01`/`02`/`02b`/`03`/`04` 各自的验收细节，现移入本目录仅作历史操作记录保留，不再被其他文档引用。

## `HANDOFF-agent-sdk-trace-ui.md`

**状态：已完成并被取代。** 描述的 Agent SDK / Trace UI 迁移已由计划 `22`（Agent 架构）、`23`（UI 层归位）、`24`（记忆卡与指令解析）完成并验收，当前实现见 `docs/plans/archive/00-execution-contract.md` 第六节与 `docs/refer/rendering-architecture.md`。

## `large-assets-2026-09.md`

2026-09 大体积资源归档记录（视频 / 索引等移出版本库的处置说明）。
