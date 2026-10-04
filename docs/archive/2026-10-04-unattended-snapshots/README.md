# 本轮无人值守旧快照归档

归档日期：2026-10-04。**此目录不能作为当前任务状态、实现完成证明或自动派遣队列。** 当前入口是 [完整交接](../../handoff/README.md)，唯一状态在 [大板块账本](../../handoff/studysolo-workstreams.json)。

本轮将下列8份文件用Git路径移动保存，未删除。Markdown仅加归档提示，原正文保留；JSON内容保持。原正文SHA256、Git要求的LF归一化正文SHA256与原路径/归档路径/原因见 [archive-manifest.json](archive-manifest.json)，因此换行规范化后仍可验证正文。归档正文的旧相对链接、命令、工具数量、时间与状态是历史信息，不据此执行；新的归档提示链接指向现行交接。

| 原文件域 | 归档文件 | 取代原因 |
|---|---|---|
| plans | [unattended-platform-polish](plans/2026-10-04-unattended-platform-polish.md) | 追加式阶段日志混杂历史与当前，已验收标记无法反映用户反馈 |
| plans | [current-status-and-deployment-handoff](plans/2026-10-04-current-status-and-deployment-handoff.md) | 旧移交含过时SHA、部署候选与状态冲突 |
| plans | [learning-connectors-integration-execution](plans/2026-10-03-learning-connectors-integration-execution.md) | 仍保留未迁移/未实现旧状态，不能当当前事实 |
| plans | [learning-connectors-preparation-spec](plans/2026-10-03-learning-connectors-preparation-spec.md) | 早期选型/准备快照，不是用户可用与任务状态 |
| plans | [learning-connectors-catalog](plans/2026-10-03-learning-connectors-catalog.json) | 准备目录，已确认不是程序运行注册表 |
| refer | [learning-connector-authentication](refer/learning-connector-authentication.md) | 开发认证日期快照，不是正式授权与交付结果 |
| analysis | [agent-connectors-integration](analysis/2026-10-03-agent-connectors-integration.md) | 早期选型报告不应继续指挥实现 |
| analysis | [cloud-skill-execution](analysis/2026-10-04-cloud-skill-execution.md) | 早期资源选择与实现阶段报告被当前交接覆盖 |

活参考`learning-connector-runtime`、`connector-environment`、`cloud-sandbox-runtime`、`studysolo-web-release`仍在`docs/refer/`，本轮已改为技术说明与历史局部证据，并去掉冲突的固定状态。它们不维护任务完成表。

其他领域的Class、内存、内容和旧工程基线没有在本轮贸然删除。当前文档索引已经区分其用途；旧Agent loop提示加了当前调度替代说明，不据其旧Issue队列重做。
