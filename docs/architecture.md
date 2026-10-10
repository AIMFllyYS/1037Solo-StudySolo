# StudySolo 当前架构

2026-10-10，系统整理进行中。实际版本见根 `package.json` 与 `pnpm-lock.yaml`；目录会随维护调整，此文必须与同一提交一致。

## 应用边界

StudySolo 是 Next.js App Router 应用，包含浏览器学习工作站、服务端 AI/文件/同步 API、可打包的 Electron 桌面能力。课堂工作区已通过 `classolo/` 进入同一应用，不是这里需要另起的独立服务。Web 和 Electron 分别有构建入口与受控能力。

根 `app/layout.tsx` 负责全局样式、metadata、主题/字体和应用外壳。`components/layout/AppShell.tsx` 组合模式、导航、工作区、全局悬浮层与必要运行器；各模块的状态和领域实现不应堆在外壳中。

## 页面与工作区

| 路由 | 领域入口 | 主要职责 |
| --- | --- | --- |
| `/`、`/[subject]/[category]/[id]` | Studio / 内容页、`components/notes/`、`lib/content/` | 教材、笔记、媒体、交互和学科内容 |
| `/agent`、`/c/[sessionId]` | `components/agent/`、聊天组件 | Agent 对话、项目、来源与右侧工作区 |
| `/agent/assets` | 资产列表与领域详情 | 原件/笔记/产物、版本、软删除和恢复 |
| `/agent/scheduled`、`/agent/plugins` | scheduler 与连接器/插件 UI | 已有调度能力和授权连接器入口 |
| `/class` | `classolo/Workbench.tsx` 与领域 features | 课堂逐字稿、笔记、材料与课堂 Agent |
| `/review`、`/[subject]/review` | `components/review-mode/`、`lib/review-mode/` | 作答、记录、评分、诊断与持久化进度 |
| `/s/[shareId]` | 分享快照 UI | 受控只读分享，不写入访问者资产 |
| `/login`、`/auth/challenge` | 统一账户接入 | 身份恢复与必要验证，不建立第二套用户身份 |

目录树、正文、答题与工作区标签是独立展示职责。教材阅读应复用内容渲染链，不复制笔记 renderer，也不通过外跳代替工作区内阅读。

## AI 调用路径

输入器和 `lib/hooks/useChat*` 使用既有 UIMessage 流协议，经 `/api/chat`（`/api/agent/chat` 有对应入口）进入请求校验、上下文/文件恢复、模型解析、身份及额度检查、`ToolLoopAgent` 和流输出。

`lib/ai/models.ts` 当前同时包含模型契约、固定注册数据和自定义 API 解析，后续按这些职责拆分。`lib/ai/provider.ts`、`lib/ai/sdk/` 和计费服务保留实际上游协议、请求和错误处理。Fast 系列选择与思考强度相互独立：前者换真实模型变体，后者沿用模型支持的上游参数。

Agent 工具位于 `lib/ai/agent/tools/<工具>/`。服务端执行和客户端 presentation/type 入口分离；结果卡片位于聊天工具展示域。工具、沙箱、连接器均沿用真实权限、所有者和计费规则。

## 数据与状态

- `lib/stores/` 持有界面和用户领域的 Zustand 状态；`lib/hooks/` 提供 React 适配与生命周期。
- 小型偏好存储于 localStorage；账户用户数据按所有者作用域进入 IndexedDB。实际 key、DB 与迁移由 `lib/storage/` 管理。
- 聊天 manifest、v3 head/chunks、turn spine、窗口物化、lease、CAS checkpoint、附件和故障恢复分别有契约；载入尾部窗口不意味着导出或同步可以只发送尾部。
- `lib/sync/` 负责 sync intent/journal、队列、限额、冲突、API 与状态适配。网络状态不是 UI 数据的第二份权威来源。
- 资产原件、外部 body、版本和回收站服务由 `lib/assets/`、`lib/files/` 与对应 API 管理。文件名不是唯一身份，签名 URL 不作为长期标识。

详见 [存储架构](./refer/storage-architecture.md)。本次整理将迁移/附件/存储引擎/界面状态等独立职责拆开，持久化格式和账户边界不变。

## 内容与渲染

`lib/content-data/subjects.registry.ts` 是学科元数据入口，manifest 组织导航，生成清单和离线索引由脚本构建。`lib/content/` 在服务端解析安全内容路径、课堂材料与题库，API 和服务端页面复用。

正文通过 `components/notes/` 与 `components/shared/` 的既有 Markdown、PlainText、HTML 沙箱和组件渲染；公式使用 KaTeX/mhchem。SVG、函数图、分子与交互 HTML 使用 `components/canvas/` 的安全边界。题目和聊天有各自语义适配，不能通过统一化丢掉评分或引用行为。

搜索分为离线 BM25/向量索引、Worker 与服务端 hybrid 检索。动态加载、取消、索引身份及生产禁止全库 substring 回退的规则保留。单元测试使用小夹具，真实内容完整性和索引验收另行执行。

## 运行、构建与发布

本地 Web 端口为 35349。现有 RootSolo 服务优先复用，检查实际 HTTP 与页面编译；出现局部中断按 [恢复约定](../../RootSolo/docs/unattended-recovery.md)处理当前服务。

`next.config.mjs` 中的 Web / Electron standalone 开关、文件 tracing、敏感文件排除、KaTeX 单例 alias 和重型依赖分界是构建契约。隔离验收使用 `.next-perf-*` 目录，保护正在运行的开发 `.next`。

CI 见 `.github/workflows/ci.yml`，包括 registry/课堂/编码、类型、ESLint、秘密扫描、代码/内容/React 测试、Web archive 验证与构建。Knip 初始是非阻断存量采集；清理时先完善动态入口解释再判断未使用项。

Web 发布说明见 [studysolo-web-release.md](./refer/studysolo-web-release.md)，Electron 打包见 [SOP 06](./sop/06-desktop-packaging-release.md)。本次重构目标不代表生产发布授权或运行版本已更新。

## 维护导航

[代码组织规范](./standards/code-organization.md)定义模块职责和拆分方式；[本轮阶段记录](./plans/2026-10-10-project-refactor-execution.md)记录进度与验收；[官方文档快照](./vendor/nextjs/2026-10-10/README.md)提供框架依据。历史计划进入归档后只保留证据价值。
