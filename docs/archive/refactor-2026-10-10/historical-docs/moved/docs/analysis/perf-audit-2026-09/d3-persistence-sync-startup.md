# D3 持久化 · 云同步 · 启动水合链 · Electron

> 范围：idbStorage 写模型、~40 个 store 水合、manifest、孤儿 GC、pullAndPushAll 同步、深链、启动关键路径、Electron 差异。

## 板块总结

- **云同步是最大全量放大器**：登录冷启动（`useAuthSession.tsx:233-235`）、`/c/<id>` 深链 miss（`useOpenSessionById.ts:60-62`）、资产页手动刷新（`AgentAssetsPage.tsx:99-105`）都跑整趟 `pullAndPushAll`（`engine.ts:891-929`）——一次全表 list（payload 列全量下载）+ 对每个本地实体串行 `api.get` + 每实体 3-5 次全量 stringify。N 实体 ≈ 1+2N 次网络往返，全部串行。
- **Pull 无变化检测，且把全部远端会话正文永久装进内存**：`applyChatPayloadToZustand`（`engine.ts:656-677`，主代理复核确认）把远端 messages 塞进 `messagesById` 但**不登记 `loadedSessionIds`**，`evictLoadedSessions`（`chatHistory.ts:157-164`）永远清不掉——一次 pull 常驻 ≤50 条会话全文。
- **启动水合是「模块求值即触发」的并发 parse 风暴**：~12 个 `createPersistedStore` IDB store 在模块被 import 时立刻 `getItem`+全量 `JSON.parse`（`_persist.ts:22-35`）；桌面端 `ChatPanel` 经 `useChat` import 链首屏拉起约 10 个（`useChat.ts:3-28`、`RightPanel.tsx:354-357`）；billing 上限 5 万条、imageGen b64 无限积累。
- **IDB 写模型健康但 flush 是同步串行序列化**：`flushPendingWrites`（`idbStorage.ts:95-97`）在 pagehide/beforeunload/visibilitychange→hidden 对每个 dirty key 同步执行 deferred `JSON.stringify`，多 key 同 flush 即主线程序列化风暴；engine 同时排空全部云任务（`engine.ts:263-275`）。
- **孤儿 GC 每跑一次读全部存活会话正文**：`gcOrphanedChatKeys`（`chatStorage.ts:461-510`）为收集 blob 引用对 ≤50 会话逐条 `loadMessages`（读+parse+normalize+compact），紧随水合风暴。
- **Electron 不是 file://**：固定 `127.0.0.1:35349`（`main.js:136`、`config.js:13`）origin/IDB 稳定；真实成本是 standalone server 启动 + `instrumentation.register()` 全语料分块（`indexHealth.ts:71-121` → `chunker.ts:125+`），以及 proxy 对每条付费 API 的远端 `auth.getUser` RTT（`aiGate.ts:52-66`）。

## 发现清单

### [P0-1] 登录冷启动必跑「全表 pull + 全量串行 push」 — `useAuthSession.tsx:231-240`、`sync/schedule.ts:36-46`、`engine.ts:891-929`、`sync/client.ts:25-30`

- **机制**：`status==='signedIn'` → `scheduleCloudPull()` → `requestIdleCallback(timeout 4000)` → `pullAndPushAll()`。`pullFromCloud` 一次 `api.list(CLOUD_SYNC_KINDS)` 拉回 `sync_documents` 全部 6 类行（含完整 payload），**无 updated_at 过滤/分页/增量标记**；逐行 `applyRemoteRow`（`rememberBaseline` 后仍无条件 apply）。`pushAllLocal` 遍历全部本地实体（≤50 会话 + artifacts/documents/notes/cards/projects），每个 `pushOne` 先 `api.get` 单查（串行 await）。
- **量化**：N=50 会话+30 artifacts+10 文档+20 笔记+200 闪卡+5 项目 ≈ 315 实体 → 1 次全表 list（可达 48MB 配额）+ **~315 次串行 api.get（RTT 50-150ms → 仅网络排队 15-45s）** + 每实体 3-5 次全量序列化 + N 行 apply。在 idle≤4s 启动，与 12 个 store 水合 + manifest parse + GC 撞同一主线程窗口。手动刷新/深链 miss 复用同路径，`chain` 只串行不合并。
- **方向**：①pull 加 updated_at/指纹增量过滤；②pushOne 的 api.get 改批量 head/etag 或并发池（≤6）；③apply 前字节相等短路（联动 D1-P1-5 merge 短路）；④非 active 会话正文 pull 后不入 `messagesById`（见 P0-2）。
- **验证**：DevTools Network 计数登录后 api.get 次数与总时长；模拟 300 实体。

### [P0-2] Pull 的远端会话正文不登记 `loadedSessionIds`，永久驻内存 — `engine.ts:656-677`（主代理复核）

- **机制**：`applyChatPayloadToZustand` 在 `withLocalApply` 内 `saveSessionMessages` + `setState({sessionsMeta, messagesById:{...,[meta.id]:messages}})`——只写 `messagesById`，不写 `loadedSessionIds`。`evictLoadedSessions` 只遍历 `loadedSessionIds` → 这些正文**永远不可驱逐**。
- **量化**：一次 pull 常驻 ≤50 条会话全文；每条按 1-5MB（含大工具输出 20MB+）→ 冷启动后内存基线可达数百 MB，且随会话增长无界。
- **方向**：pull 路径只写 manifest meta，正文按需 `ensureSessionLoaded`；或登记 loadedSessionIds 让 LRU 管理（治标）。窗口化后此问题自然消解（正文变区间）。
- **验证**：pull 前后 heap snapshot / `messagesById` key 计数。

### [P0-3] 启动水合风暴：模块求值即触发全量 parse — `lib/stores/_persist.ts:22-35` + 各 store、`useChat.ts:3-28`、`RightPanel.tsx:354-357`

- **机制**：~12 个 `createPersistedStore` 在模块 import 时立即 `getItem`+`JSON.parse`；桌面端 `ChatPanel` 经 `useChat` import 链首屏拉起约 10 个（settings、chat-history、artifacts、skills、review-cards、image-gen、billing-history、documents、user-notes、imports、project-files、noteChangeProposals、scheduled-tasks）。billing 上限 5 万行、imageGen base64 无限积累。
- **量化**：水合总成本 = Σ store JSON.parse；imageGen/billing 两个大 store 可达数十 MB parse（估算 20-100ms+）。全部并发挤在首帧前。
- **方向**：水合改显式/惰性（首屏需要的 store 白名单 hydrate-on-demand，其余 idle 或首用时）；imageGen 附件正文挪 blob key（同 chat 模式）。
- **验证**：首帧前 `performance.measure` 包住全部 hydrate；DevTools IDB key 大小清单。

### [P1-4] `flushPendingWrites` 多 key 同步 stringify 风暴 — `idbStorage.ts:95-97`、`engine.ts:263-275`

- **机制**：pagehide/beforeunload/visibilitychange→hidden 对每个 dirty key 同步 deferred stringify；engine 同刻排空全部云任务。
- **影响**：多 dirty key + 大 store 时切换/退出瞬间主线程阻塞（含大 profile/会话 blob 时百 ms 级）。
- **方向**：flush 分片/优先关键 key；大 key 平日就 lazy 化（已做）+ 限制单 flush 预算。

### [P1-5] 启动期孤儿 GC 读全部存活会话正文 — `chatStorage.ts:461-510`

- **机制**：为收集 blob 引用对 ≤50 会话逐条 `loadMessages`（读+parse+normalize+compact），紧随水合风暴。
- **方向**：blobIds 进 head/spine（联动 D1 设计）后 GC 只读 head；或 GC 用 `loadManifest`+`extractBlobIds` 按 key 前缀扫描。
- **验证**：启动 trace 中 `gcOrphanedChatKeys` 耗时。

### [P1-6] Electron 首窗前二次加载 — `electron/main.js:309-328`

- `did-finish-load` 注入 JS：读 settings，未 `_desktopCustomBound` 则改 `selectedModelId`+置标志+`location.reload()`——**整页二次加载**（SSR+hydration+水合链×2），恰逢首次打开。
- **方向**：默认模型绑定挪渲染进程（hydrate 时判标志），或 preload 在 dom-ready 前注入避免 reload。
- **验证**：首次绑定后 `did-finish-load` 计数。

### [P1-7] `userProfile` 头像 MB 级同步写；quiz-progress 可接受 — settings/userProfile store

- 头像更换瞬间主线程 stringify 可达 MB 级；建议挪 IDB blob 槽。quiz-progress 每章一条档案，频率体积均低——不动。

### [P2-8] `pickRicherMessage` 评分、`measureLocalSyncUsage`/导出全库物化、`extractBlobIds` 全扫

合并记入 D1-P1-5/P1-6/P2-9（跨板块同一问题）。

## 已确认做对（勿回归）

- `pendingValues`/`pendingTimers` 成对清理（`idbStorage.ts:82-92,102-109,178-198`），`__resetIdbStoragePendingForTests` 齐全。
- `setItem` vs `setItemLazy` 语义差异**有意**：前者真尾随防抖、后者有界 checkpoint（`:170-176`），流式期保证 ≤800ms 一次落盘不饿死。
- `ensureChatHistoryBootstrap` 顺序（`chatHistory.ts:629-668`）：migrate(2 get) → manifest(1 get+parse) → setState → ensureDefaultProjects → `ensureSessionLoaded(active)`（仅 active 一条正文）→ prune → idle GC。正文不全会载，瓶颈在 manifest 大小与后续 GC。
- `SessionMeta.preview` ≤80 字（`:155`）；`updateMessage` 仅 artifactIds 变化时 `persistManifest`（`:483-485`，已优化）。
- Electron 持久化与 Web 同源（固定端口 origin，无 file:// IDB 问题）；secrets 走主进程 DPAPI+IPC，与渲染存储无耦合。
- `useChat` 消息订阅按引用相等（`useChat.ts:57-61`）——单会话更新只重渲订阅组件。

## 未测项

- 各 IDB key 真实字节（`navigator.storage.estimate()`/DevTools）；`sync_documents` 行数与 list 传输字节（需实例抓包）；`chunker.ts` 全语料分块真实耗时（standalone 构建上测 `register()`）。
