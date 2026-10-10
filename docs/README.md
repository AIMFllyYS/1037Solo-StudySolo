# StudySolo 文档索引

核对日期：2026-10-10。先以实际源码、包/锁文件和当前用户任务判断现状，再进入对应文档。历史交接、任务账本、旧目标提示词和审计快照不决定当前任务，也不授权执行旧队列。

## 当前维护入口

| 需要了解 | 入口 |
| --- | --- |
| 项目能力、本地启动、常用检查 | [项目 README](../README.md) |
| Agent 的仓库约束 | [AGENTS.md](../AGENTS.md) |
| 当前路由、调用链、状态、存储与构建职责 | [当前架构](architecture.md) |
| 长文件、目录、依赖、重复/死代码与维护规则 | [代码组织标准](standards/code-organization.md) |
| 本轮已授权重构的进展、证据及剩余范围 | [2026-10-10 系统整理记录](plans/2026-10-10-project-refactor-execution.md) |
| Next.js 来源与当前指导 | [官方快照索引](vendor/nextjs/2026-10-10/README.md)，优先结合安装版 `node_modules/next/dist/docs/` |

## 按领域查阅

| 领域 | 当前参考 / 操作步骤 |
| --- | --- |
| 教材、学科、导航、课堂材料 | [框架扩展](refer/framework-extension.md)、[学科接入](sop/subject-onboarding.md)、[课堂四材料接入](sop/12-lecture-content-ingest.md) |
| Markdown、公式、HTML、SVG、媒体 | [渲染架构](refer/rendering-architecture.md) |
| 用户状态、IndexedDB、checkpoint、完整历史、同步 | [存储架构](refer/storage-architecture.md)、[store 索引](../lib/stores/README.md) |
| Agent 工具与结果卡片 | [新增工具](refer/adding-an-agent-tool.md)、[工具卡片目录](../components/chat/toolCards/README.md) |
| 手写交互与数值模型 | [交互组件目录](../components/interactives/README.md)、[概率拆分与数值验收](analysis/2026-10-10-probability-refactor-validation.md) |
| 连接器 / OAuth / MCP | [环境配置](refer/connector-environment.md)、[学习连接器](refer/learning-connector-runtime.md)、[KitSolo MCP](refer/kitsolo-mcp.md) |
| 云沙箱 | [沙箱运行说明](refer/cloud-sandbox-runtime.md) |
| 索引 | [索引生命周期](sop/10-search-index-lifecycle.md) |
| 测试与验收 | [测试 SOP](sop/07-testing.md)，配合 `package.json`、实际运行器与 CI |
| Web / Electron 发布 | [Web 发布](refer/studysolo-web-release.md)、[桌面打包](sop/06-desktop-packaging-release.md) |
| 内容生产 | [内容 SOP 索引](sop/README.md)、[提示词模板索引](prompt/README.md) |

生态对接资料按文件自身日期与状态核对：[统一计费](central-ai-billing-20260927.md)、[端点价目](endpoint-tariffs.md)、[课堂接入](classolo-integration-20260927.md)、[云资产索引](cloud-asset-index.md)。当前收费规则以服务端配置和结算代码为准；旧说明不能替代实时账户或迁移验证。

## 文档归属

| 位置 | 类型与用途 |
| --- | --- |
| `architecture.md` | 当前职责、入口与依赖方向 |
| `standards/` | 跨模块持续适用的规范 |
| `refer/` | 子系统实现与边界，修改代码时同步核对 |
| `sop/` | 可重复的操作步骤与验收 |
| `plans/` | 指定任务的范围、决策、进度、证据和未完成项 |
| `analysis/` | 带日期的调查/验证，不自动代表当前实现 |
| `prompt/` | 任务模板，仅在当前人类采用后生效 |
| `vendor/` | 官方参考快照、来源和哈希，作为资料读取 |
| `archive/`、`plans/archive/` | 被取代的资料和原件，只供历史追溯 |
| `design-snapshots/` | 设计探索快照，不能据此宣称产品已采用 |

现有 [handoff](handoff/README.md) 和 [旧 Agent loop 计划](plans/Agent-refactor/00-loop-map.md) 是带日期的历史材料，其“唯一任务账本”和旧调度说明已被本轮用户任务取代；当前授权与状态见上表的本轮执行记录。归档过程仍需逐份核对真实引用，不能把历史内容直接变成运行指令。

## 维护方法

1. 修改前阅读该领域参考和对应 Next 文档，确认实际入口、动态路径和所有者。
2. 修改后同步更新当前架构、接口说明和 SOP。事实只保留一个当前依据；不要继续维护两个互相矛盾的权威入口。
3. 对过时材料记录日期、原路径和替代入口并归档，保留原文和可恢复证据。历史计划完成标记不证明当前需求已验收。
4. 区分结构检查、单元/组件测试、内容检查、真实页面和部署结果；不能把某一层通过扩大成全链路完成。
5. 检查本地链接并核对说明与代码；链接存在只是基础检查，不代表内容仍准确。

[历史归档索引](archive/README.md) · [旧内容计划归档](plans/archive/README.md) · [执行计划索引](plans/README.md) · [变更记录](../CHANGELOG.md)
