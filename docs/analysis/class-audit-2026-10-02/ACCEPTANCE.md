# Class 修复验收记录（本地工作树）

记录日期：2026-10-02。基线 HEAD 为 `3d2133fc`；修复已提交，但本地提交不等于线上部署。原始 A01–A17 反例见 [REPORT.md](REPORT.md)，修复阶段与代码边界见 [执行规划](../../plans/2026-10-02-class-systematic-repair.md)。远端数据库迁移的独立证据见 [REMOTE-MIGRATION.md](REMOTE-MIGRATION.md)。

## 自动验收

| 范围 | 本地可重复证据 | 结果 |
|---|---|---|
| A01、A16 连续重采样/有界音频队列 | `audio-resampling`、`asr-queue`、`asr-admission` | 通过；没有真实设备时基测量 |
| A02、A03、A10、A17 文稿持久化/并发/身份 | `transcript-persistence`、`repository-races`、`snapshot-hydration` | 通过；真实离线浏览器仍待验 |
| A04–A08、A15 增量导图/来源/调度/视口/同步 | `outline-*`、`mindmap-viewport`、`silent-scheduling`、`live-sync` | 通过；跨设备接收是可见页面每10秒版本轮询 |
| A07、A12、A13 及纠错并发 SQL | `outline-cas-sql`、`cloud-revision-sql`、`correction-cas-sql` | PGlite 隔离实例通过，四个迁移已应用到 RootSolo Supabase 并完成授权/行数审计；真实双设备冲突仍待验 |
| A09 选择与开放问答 | `classroom-assessment-image`、`classroom-render-boundary` | 卡片内答案、证据归属与更正文稿失效提示通过 |
| A11、A14 失败重转/计费准入 | `recording-lifecycle`、`asr-admission`、`provider-admission` | 代码路径通过；真实供应商结果未知时仍需人工核对 |
| G3 学科/纠错/公式 | `course-*`、`term-correction`、`formula-*`、`classroom-chemistry-render` | 语文/英语/医学等分类、原文保留与有限语义检查通过；不宣称通用公式证明 |
| G4 图像/视觉 | `classroom-image-source`、`classroom-render-boundary`、已有画布/净化测试 | 相关教材图无付费调用，外部图片需中央计费；固定结果重开不发请求 |
| G5 全课笔记/闪卡 | `class-note-flashcards` | 同课笔记复用、手写保护、提案采纳/忽略和全课分批来源通过 |
| G6 工作台 | `class-workspace-tabs`、`outline-jump`、`mindmap-viewport` | 手机提问入口与按需挂载通过 JSDOM；触控和设备布局待验 |

最后一次完整 `npm test` 得到 Node 1824 pass / 0 fail / 1 opt-in 真实 PostgreSQL 跳过，React 223 文件 945 pass；结果来自含修复的工作树，日志为本目录的 `g7-final-tests.log`（`*.log` 按仓库规则不入 Git）。`npm run typecheck`、本轮修改文件的 ESLint、`npm run lint:secrets`及`npm run prebuild`通过。隔离生产构建使用 `.next-class-verify`，Next 16.2.9 构建并生成 1440 个静态页面成功；最终日志为`g7-final-build.log`（不入 Git），构建显示既有动态文件追踪与字体度量警告。全仓 `npm run lint` 在已有 Knip 未使用项清单失败，ESLint 自身为 0 错误/21 警告；本次没有通过删除文件或禁用检查掩盖清单。

## 实际环境待验

- **数据库**：`202610020001`–`004` 已按序通过 RootSolo MCP 应用，目录、RLS、RPC 授权及迁移前后行数已核查；远端 version 与本地文件名前缀不同，映射见迁移记录。仍需在受控测试账号下验证真实 PostgreSQL 冲突响应与双设备同步，然后发布匹配服务端和前端。
- **真实音频**：至少各取语文、英语、解剖/药理、数学/化学课各一段授权录音，分别测无热词/启用热词/人工纠错的 CER 或 WER、数字、单位、否定词与专业术语错误率；记录 8 秒分段端到端延迟和失败重试的计费状态。当前无这些数据，不能宣称准确率提升幅度或真正逐字流式 ASR。
- **设备与浏览器**：用户明确授权 Codex 做浏览器端测，桌面和 390×844 小屏已覆盖 Class 单页、资料框、笔记、自动题答及图片检索；真实麦克风在 Codex in-app browser 授权请求悬置，SVG Agent 一次调用仅输出字面工具文本，均未通过。跨两台设备的10秒轮询/唤醒更新、屏幕阅读器、真实 PDF/PPTX/视频和长课内存仍待验；证据矩阵见 [E2E-CLOSEOUT.md](E2E-CLOSEOUT.md)。
- **外部服务**：用受控账本核查无图库匹配时单次图片检索的预留/结算、返回状态未知时的持有、AI 题答与可视化用量；本地 mock 和模拟数据库不能代替真实供应商与生产计费验收。

本地代码验收与实际环境验收分开记录；任何远端迁移、部署或真实设备结果须在执行后追加日期、环境与证据。

2026-10-02 Codex 端测与索引补齐已追加到 [E2E-CLOSEOUT.md](E2E-CLOSEOUT.md)。此前“RootSolo 约束禁止浏览器端测”是旧 CLI Agent 条件，本次用户明确授权 Codex 覆盖该限制；上文历史测试数量仍代表旧提交，不是本轮最终测试数量。
