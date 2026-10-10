# 执行计划与历史记录

当前已授权任务是 [2026-10-10 项目系统整理](2026-10-10-project-refactor-execution.md)。该记录维护范围、不可丢失的契约、阶段验证和剩余工作；实际 Goal 状态与当前人类指令一起决定是否继续执行。

旧 handoff 账本、旧模型派遣策略和目标模式提示词是历史材料，不能自动恢复旧任务、启动子智能体或代替本轮授权。架构现状见 [当前架构](../architecture.md)，长期组织规则见 [标准](../standards/code-organization.md)。

## 当前记录

| 文件 | 用途 |
| --- | --- |
| [项目系统整理](2026-10-10-project-refactor-execution.md) | 当前重构、框架升级、职责/目录、文档及最终验收 |
| [概率重构验收](../analysis/2026-10-10-probability-refactor-validation.md) | 已完成分层、数值修复、公式与实际页面证据 |

## 历史材料的阅读入口

以下记录解释原来为什么这样设计，状态和结论以文件日期为界；阅读它们不代表获得实施或发布授权。

| 记录 | 主题 |
| --- | --- |
| [2026-10-02 内存与性能规格](2026-10-02-memory-performance-optimization-spec.md) | 会话、存储、资源、Worker、同步与内容边界 |
| [2026-10-02 课堂修复](2026-10-02-class-systematic-repair.md) | 课堂录音、导图、材料、题答和移动工作台 |
| [右侧面板设计](agent-right-panel-unification.md)、[实施记录](agent-right-panel-unification.execution.md) | 面板统一前后的依据 |
| [Agent UX](agent-ux-finalization.md)、[实施记录](agent-ux-finalization.execution.md) | 交互变更和当时的验收边界 |
| [笔记/闪卡同步](notes-flashcards-cloud-sync.md) | 同步与历史迁移口径 |
| [课堂/复习接入](classolo-review-goal-20260929.md) | 当时的接入目标和状态 |
| [旧交接目录](../handoff/README.md) | 旧上下文、账本和工作包 |
| [旧 Agent loop](Agent-refactor/00-loop-map.md) | 2026-09 工程调研与执行历史 |
| [旧内容/工程计划](archive/README.md) | 已被取代的 01–25 计划及约定 |

历史契约中仍适用的规则，应核实代码后写入当前架构、标准或领域参考；不把归档文件重新声明成唯一现状依据。

## 新记录的要求

写明任务来源与范围、保留的契约、实际改动、检查层级和证据、已知未完成项与续接条件。更新原任务记录，不复制另一份完成表。任务完成后的过程资料归档，并将长期规则转入对应维护文档。
