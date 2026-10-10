# StudySolo — Agent 入口

最后核对：2026-10-10。本仓库的运行代码、`package.json` 与锁文件是现状依据；历史计划不能替代当前用户任务。

## 每次维护先读

- 上级生态约束：[../AGENTS.md](../AGENTS.md)。StudySolo 是独立云端产品，不在 MainECS。
- 当前架构：[docs/architecture.md](docs/architecture.md)。
- 代码组织：[docs/standards/code-organization.md](docs/standards/code-organization.md)。
- 本轮无人值守目标：[docs/plans/2026-10-10-project-refactor-execution.md](docs/plans/2026-10-10-project-refactor-execution.md)。

## Next.js 文档必须随修改查阅

框架行为以安装版本自带的 `node_modules/next/dist/docs/` 为首选；当前官方快照和来源索引见 [docs/vendor/nextjs/2026-10-10/README.md](docs/vendor/nextjs/2026-10-10/README.md)。修改路由、数据、缓存、客户端边界或构建时，先读对应章节，在阶段记录中注明采用的原则。版本以包和锁文件为准，不凭旧 README 猜。

## 按领域进入

| 改动 | 先读 |
| --- | --- |
| 内容、教材、题库、学科注册 | [docs/refer/framework-extension.md](docs/refer/framework-extension.md)、[docs/sop/subject-onboarding.md](docs/sop/subject-onboarding.md) |
| Markdown、公式、HTML、SVG、媒体 | [docs/refer/rendering-architecture.md](docs/refer/rendering-architecture.md) |
| IndexedDB、账户隔离、会话持久化和恢复 | [docs/refer/storage-architecture.md](docs/refer/storage-architecture.md) |
| Agent 工具 | [docs/refer/adding-an-agent-tool.md](docs/refer/adding-an-agent-tool.md) |
| 连接器、OAuth、MCP | [docs/refer/connector-environment.md](docs/refer/connector-environment.md)、[docs/refer/learning-connector-runtime.md](docs/refer/learning-connector-runtime.md) |
| 云沙箱 | [docs/refer/cloud-sandbox-runtime.md](docs/refer/cloud-sandbox-runtime.md) |
| 测试 | [docs/sop/07-testing.md](docs/sop/07-testing.md) 与实际测试运行器、CI |
| Web 发布 / Electron 打包 | [docs/refer/studysolo-web-release.md](docs/refer/studysolo-web-release.md)、[docs/sop/06-desktop-packaging-release.md](docs/sop/06-desktop-packaging-release.md) |
| 本地服务恢复 | [../RootSolo/docs/unattended-recovery.md](../RootSolo/docs/unattended-recovery.md)；核对实时进程和服务清单 |

## 不能在整理中丢失的边界

- 服务端凭据和 `fs` 不进入客户端导入树；客户端只引用类型、数据契约和展示模型。
- 身份、所有者 UUID、统一计费、账户存储隔离及真实上游错误语义沿用现有契约。
- 不能为缩短文件改变持久化 key、迁移次序、完整历史、CAS、取消或恢复逻辑。
- UI、store、持久化、网络和数据转换各自负责一层；`lib/` 不反向依赖 `components/`。
- 删除候选先确认真实消费者与动态入口。失效文档归档到 `docs/archive/`，淘汰代码保留可恢复历史；不得清除无关工作。
- `docs/archive/` 的内容是历史，不能据此执行 SQL、部署、旧工作队列或恢复任务。
- 检查按改动风险选择，最终构建与浏览器验收的证据范围如实报告。仅端口、HTTP 或测试替身不能证明实际界面完成。

提交只包含当前阶段文件。是否合并主线、生产迁移、部署和付费调用由当次用户授权决定。
