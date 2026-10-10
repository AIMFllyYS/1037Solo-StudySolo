# 执行计划

当前无人值守先读 [`../handoff/README.md`](../handoff/README.md)，任务状态只维护在机器账本。当前阶段仅文档整理；按大板块派遣，不使用旧完成表。

2026-09 Agent工程基线在 [`Agent-refactor/`](./Agent-refactor/)。入口是 [`00-loop-map.md`](./Agent-refactor/00-loop-map.md)，可投喂的目标模式提示词是 [`99-goal-mode-prompt.md`](./Agent-refactor/99-goal-mode-prompt.md)。

已完成或被取代的内容计划、工程基线与审计报告在 [`archive/`](./archive/)，仅供历史参考。当前滚动与渲染行为以现行代码及 [`../refer/rendering-architecture.md`](../refer/rendering-architecture.md) 为准。

## 现行计划

| 计划 | 说明 |
|---|---|
| [`../handoff/studysolo-unattended-handoff.md`](../handoff/studysolo-unattended-handoff.md) | 当前完整上下文、最新用户要求、代码/接口/复用与边界；不另维护完成表 |
| [`../handoff/studysolo-workstreams.json`](../handoff/studysolo-workstreams.json) | 唯一当前状态：6项大板块，统一GPT-6.1 Sol High，现为需返工/未完成用户验收 |
| [`../handoff/unattended-workstream-template.md`](../handoff/unattended-workstream-template.md) | 一大板块一名GPT-6.1 Sol High，完整分析/实施/必要自测/主验收后下一包 |
| [`2026-10-02-class-systematic-repair.md`](./2026-10-02-class-systematic-repair.md) | Class全链路修复执行计划：可靠录音与保存、增量导图、学科公式、题答视觉、笔记和移动工作台（进行中） |
| [`2026-10-02-memory-performance-optimization-spec.md`](./2026-10-02-memory-performance-optimization-spec.md) | 系统内存与性能优化执行规格：会话/存储/资源/检索Worker/同步/内容边界及验收（待实施） |
| [`agent-right-panel-unification.md`](./agent-right-panel-unification.md) | 右栏统一：现状分析与选型（改造前快照） |
| [`agent-right-panel-unification.execution.md`](./agent-right-panel-unification.execution.md) | 右栏统一的落地记录（含附一～附十一） |
| [`agent-sidebar-assets.md`](./agent-sidebar-assets.md) | Agent 左栏体系化 + 我的资产 / 项目 / 项目文件：规划 |
| [`agent-sidebar-assets.execution.md`](./agent-sidebar-assets.execution.md) | 同上：落地记录（附一～附五 + 质量门） |
| [`document-readers-rebuild.md`](./document-readers-rebuild.md) | 文档阅读器重建（PDF / DOCX / PPTX）：规划 |
| [`agent-ux-finalization.md`](./agent-ux-finalization.md) | Agent 页面 UX 收尾：来源 / 出题 / 顶栏 / i18n / 划词（规划与需求拆解） |
| [`agent-ux-finalization.execution.md`](./agent-ux-finalization.execution.md) | 同上：实施记录（落点对照 · 决定 · 验收 · 已知边界） |
| [`notes-flashcards-cloud-sync.md`](./notes-flashcards-cloud-sync.md) | 笔记 / 闪卡云同步（0005 迁移） |
| [`app-users-nickname.md`](./app-users-nickname.md) | 昵称（0006 迁移） |
| [`classolo-review-goal-20260929.md`](./classolo-review-goal-20260929.md) | Classolo 全量接入 + Review 模式 + Agent UX：可恢复的目标与进度记录（2026-09-29 起，含阶段状态与 Issue 取舍） |
| [`2026-auth-login-redesign-plan.md`](./2026-auth-login-redesign-plan.md) | 登录注册板块 + 人机验证面板改版：设计与落地规划（**主体已落地**；文首记录了与现状的偏差——登录入口已改为跳转 1037Solo 统一账号中心） |

本轮旧准备/实施/进度快照已移到 [`../archive/2026-10-04-unattended-snapshots/README.md`](../archive/2026-10-04-unattended-snapshots/README.md)。其余Class/性能/内容计划本轮未全量审查，保留作为独立资料，不据此自动启动范围外任务。
