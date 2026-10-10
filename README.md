# StudySolo

[English](README_en.md) · 简体中文 · [文档索引](docs/README.md)

StudySolo 是面向医学、理工和人文课程的多学科学习工作站，提供教材阅读、课堂材料、题目练习、复习、Agent 对话和项目工作区。浏览器与 Electron 共用应用和领域代码，账号、云端数据和本机数据各自保持明确边界。

[线上入口](https://studysolo.1037solo.com) · [源码许可证](LICENSE) · [变更记录](CHANGELOG.md)

本文最后按代码核对于 2026-10-10。当前依赖为 Next.js **16.4.0**、React **19.2.7**；具体版本、范围和锁定结果以 [package.json](package.json) 与 [pnpm-lock.yaml](pnpm-lock.yaml) 为准。仓库中的重构版本与线上运行版本分别记录，发布状态见 [Web 发布说明](docs/refer/studysolo-web-release.md)。

## 功能与应用入口

| 入口 | 能力 |
| --- | --- |
| Studio `/`、`/[subject]/[category]/[id]` | 学期和学科树、教材/详解、课堂四材料、例题、题目、视频、手写交互、笔记与浏览器 |
| Agent `/agent`、`/c/[sessionId]` | 对话、模型/思考设置、工具轨迹、项目、来源、产物与右侧工作区 |
| 资产 `/agent/assets` | 原件、笔记、产物、版本、回收站及恢复 |
| 课堂 `/class` | 课堂录音、逐字稿、笔记、大纲/导图和课堂 Agent |
| 复习 `/review`、`/[subject]/review` | 作答、评分、记录、错题诊断和持久化进度 |
| 分享 `/s/[shareId]` | 受控的只读分享快照 |

学科和学年由 [subjects.registry.ts](lib/content-data/subjects.registry.ts) 管理，内容导航由 manifest 与生成清单组织。教材正文、题库和媒体是否齐备，以具体注册内容及检查结果为准。

Agent 工作区可以直接选择内部教材或项目文件。教材复用现有安全正文渲染，目录树在工作区右侧，学期选择复用统一文件夹树。Fast 开关仅对已注册普通/快速变体的模型系列启用，思考强度与模型变体分别选择。

## 本地运行

建议使用 Node.js 22 或更高版本、pnpm 11.7；当前 CI 使用 Node 22。环境配置从 [.env.example](.env.example) 开始，具体账号、AI、连接器与沙箱变量按对应说明配置，不把凭据写入源码或提交。

```powershell
pnpm install --frozen-lockfile
Copy-Item -LiteralPath .env.example -Destination .env.local
pnpm dev
```

本地 Web 地址为 `http://localhost:35349`。如果本机已有 RootSolo 管理的 `studysolo-web` 服务，复用该服务，按当前进程、HTTP 和页面状态判断是否需要恢复。

教材及本机索引可以从本地文件读取；对话、账号、云同步、在线服务、连接器和云沙箱需要各自的配置、网络与授权。访客可阅读公共教材，登录账号决定对话历史和用户资产的归属。

## 源码职责

| 位置 | 负责 |
| --- | --- |
| `app/` | Next 页面、布局、metadata、HTTP 与运行/缓存声明 |
| `components/` | 展示、交互和 UI 组合；聊天、布局、题目按职责分组 |
| `lib/` | 类型、算法、服务、持久化、同步和 React 适配 |
| `lib/stores/` | 唯一 Zustand 状态，按资产/对话/学习/工作区归类 |
| `lib/content-data/` | 学科、导航、媒体及人工/生成元数据；人工数据按学科归类 |
| `content/`、`public/` | 原始教材、题库和媒体资源 |
| `classolo/` | 已接入同一应用的课堂领域代码 |
| `electron/` | 桌面主进程、受控 IPC 与打包能力 |
| `scripts/` | 构建、校验、内容接入和维护 CLI |

完整调用链与边界见 [当前架构](docs/architecture.md)；拆分、目录归属、依赖和淘汰规则见 [代码组织规范](docs/standards/code-organization.md)。新增学科或 Agent 工具分别遵循 [学科接入 SOP](docs/sop/subject-onboarding.md) 与 [工具接入说明](docs/refer/adding-an-agent-tool.md)。

## 检查与构建

| 命令 | 范围 |
| --- | --- |
| `pnpm typecheck` | 全量 TypeScript |
| `pnpm lint:eslint`、`pnpm lint:secrets` | 代码规则与秘密扫描 |
| `pnpm lint:knip` | 未使用候选；先核实实际入口，CI 当前非阻断采集 |
| `pnpm test:unit`、`pnpm test:react` | node:test 代码检查与 Vitest 组件检查 |
| `pnpm test:content` | 内容检查，使用与内容一致的本机索引 |
| `pnpm check:lectures`、`pnpm check:registry` | 课堂契约、导航与注册一致性 |
| `pnpm build` | prebuild 门禁与生产构建 |
| `pnpm desktop:build:staged`、`pnpm desktop:build` | Electron 暂存构建与打包 |

搜索索引缺失或过期时按 [索引生命周期 SOP](docs/sop/10-search-index-lifecycle.md)处理。离线关键词重建可用 `pnpm build-index --bm25-only`，向量构建另有配置与调用成本；关键词检查通过不代表新增内容已有向量。

构建正在运行的开发服务旁边的验收候选时，使用独立的 `STUDYSOLO_BUILD_DIR`；避免覆盖开发 `.next`。完整检查与实际页面验收见 [测试 SOP](docs/sop/07-testing.md)，Web/Electron 发布分别遵循 [Web 发布说明](docs/refer/studysolo-web-release.md) 与 [桌面打包 SOP](docs/sop/06-desktop-packaging-release.md)。

## 维护约定

先读 [AGENTS.md](AGENTS.md) 和 [文档索引](docs/README.md)。实际代码、包/锁文件和当前任务授权决定维护范围；历史交接、旧账本与归档提示词不自动创建新任务。维护用户功能时保留账号所有者、计费、账户存储、checkpoint/CAS、完整历史、恢复、取消和文件契约。

一次消息/批次最多 9 个附件、单文件 25MiB，后续消息可以继续添加；原件与 AI 派生上下文分开保存。内容生产保持原材料可追溯，公式、HTML、SVG 和媒体遵循 [渲染规范](docs/refer/rendering-architecture.md)。

本轮系统整理的进展和未完成范围见 [执行记录](docs/plans/2026-10-10-project-refactor-execution.md)。规范和 SOP 必须随实际代码更新；过时文档进入带来源的可恢复归档。

## 许可证与贡献

源码采用 [PolyForm Noncommercial License 1.0.0](LICENSE)，具体授权、要求和限制以 LICENSE 正文为准。商业或特殊授权请联系项目维护者。

贡献前确认任务范围，使用表达类型和主题的分支名，例如 `feature/<topic>`、`fix/<topic>`、`refactor/<topic>`；按改动运行适用检查并提交可审查的变更。感谢为课程材料、学习功能和开源基础设施作出贡献的同学与维护者。
