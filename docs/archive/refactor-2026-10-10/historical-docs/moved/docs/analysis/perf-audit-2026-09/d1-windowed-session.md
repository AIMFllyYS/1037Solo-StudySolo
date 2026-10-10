# D1 会话窗口化（旗舰板块）

> 对应用户核心诉求：长会话只加载最近 3-4 轮；顶部「加载更多」向前翻；左右定位器点击后按需加载对应轮次段落再拼接。
> 审查方式：SA-1 子代理静态审查 + 主代理实测校准（`measurements.md`）+ 逐条复核。

## 板块总结

当前链路在「会话」粒度做全量 IO：打开 = 整 blob `JSON.parse` + `normalizeStoredMessages` + `compactStudyMessages` 三重 O(n)；流式期每 60ms tick 全数组浅拷贝、每 800ms flush 全量 compact+stringify。DOM 层已被 `@tanstack/react-virtual` 虚拟化，所以窗口化收益**不在渲染而在**：打开耗时（O(会话)→O(尾部轮次)）、流式写放大（O(会话)/flush→O(尾块)/flush）、内存常驻（LRU=3 个全量数组→3 个窗口）。

实测校准（`measurements.md` §2）：纯 CPU 成本 ≈ serialize 1ms/MB、读路径 0.5ms/MB。纯文本会话（≤5MB）的单次开销不算大，**但成本对「内存中体积」线性**——未 stub 工具输出（`readProjectSlices`/`drawDiagram` 等）驻留的会话到 50-100MB 时，每次 flush 阻塞主线程 52-104ms，流式期每 800ms 一次。窗口化同时解决 CPU、内存与「定位器够不到未加载轮次」三个问题。

关键架构事实：
- **轮次边界干净**：`role==='user'` 起一轮；toolCalls 是 assistant 消息 `parts` 内联 part（非独立消息）；system 仅旧数据，渲染层已过滤。
- **prepend 滚动锚定不用手写**：`@tanstack/virtual-core@3.17.2` 已内置 `anchorTo`/`shouldAdjustScrollPositionOnItemSizeChange`/`takeSnapshot`+`initialMeasurementsCache`，当前未启用。
- **最大坑不在 UI**：写路径与取数路径都假设 `messagesById[sessionId] = 全量数组`——`sendMessage` 请求构造、`addMessage`/`replaceMessages` 整段回写、sync 全量 payload、GC 全量解析。窗口化必须给每条路径配「请求范围加载」或「分块回写」，否则静默丢上下文/截断历史。

## 现状机制（file:line）

| 环节 | 位置 | 机制 |
|---|---|---|
| 读 | `lib/storage/chatStorage.ts:183-196` | `getItem(chatSessionKey)` → `JSON.parse` 整 blob → `normalizeStoredMessages` → `compactStudyMessages('persist')` |
| 写 | `chatStorage.ts:198-204` | `serializeSessionMessages` = compact+stringify 全数组；`setItemLazy` 800ms 防抖（降频不降单次成本） |
| 状态 | `lib/stores/chatHistory.ts:27-28` | `MAX_LOADED_SESSIONS=3`、`MAX_SESSIONS=50`；`messagesById` 存全量数组 |
| 流式写 | `chatHistory.ts:459-488` | `updateMessage`：`prev.map` 全数组 → `saveSessionMessages` 全量序列化排队 |
| 渲染 | `components/chat/ChatThread.tsx:76-79,141` | 过滤 user/assistant → `useVirtualizer` + `measureElement`；未挂载时 fallback 前 14 条 |
| 定位器 | `components/chat/ChatMessageDots.tsx` | `USER_DOT_LIMIT=12`；只遍历**已加载** user 消息 → 无脊柱时定位器够不到未加载轮次 |
| 轮次边界先例 | `lib/context/compactChatSession.ts:15-21` | `splitChatKeptTurns`：收集 userIdx 切尾，可直接复用同一套边界规则 |
| 工具 part | `lib/chat/messageParts.ts:9-13,29-31,93-104` | `tool-<name>`/`dynamic-tool` + `step-start` 分隔，均内联于 assistant `parts` |
| 流式消息 | `messageParts.ts:129-135` + `lib/hooks/useChat.ts:196-198` | `createAssistantPlaceholder` 空 parts → 每 tick `updateMessage` 写 SDK 快照 |

## 发现清单

### [P0-1] 打开会话 = 单 blob 全量读+三重处理，成本随会话线性 — `chatStorage.ts:183-196`

- **现状**：`loadSessionMessages` 一次性 `getItem` 整个 session JSON → `JSON.parse` → `normalize` → `compact`，然后整数组进 `messagesById`。没有任何「只读尾部」的入口。
- **影响**：读路径实测 ≈ 0.5ms/MB CPU + IDB blob 读延迟（未测，大 blob 结构化克隆+磁盘 IO 估算再 +50-150ms）；含大工具输出的会话内存可达 50-100MB 级 → 打开耗时 25-50ms CPU + 高峰内存；且**所有消息对象一经加载永不释放**（直到 LRU 整会话驱逐）。
- **方向**：会话消息按轮次分块存储（见设计方案）；打开只读 spine + 尾部 3-4 轮。
- **验证**：`perf-bench-session.ts` + DevTools IDB 读计时；打开 500 轮会话的 TTFP（time to first paint of 尾部轮次）。

### [P0-2] 每次 flush 全量 compact+stringify，流式期持续写放大 — `chatStorage.ts:198-204`、`chatHistory.ts:459-488`

- **现状**：`updateMessage` 每 tick → `saveSessionMessages` 排队 → flush 时 `compactStudyMessages` 遍历全部 parts + `JSON.stringify` 全数组。800ms 防抖只降频，单次成本 O(会话)。
- **影响**：实测 serialize ≈ 1ms/MB；50MB 会话每次 flush ~52ms、100MB ~104ms 主线程。一次 30s 流式 ≈ 37 次 flush → 重度会话累计 2-4s 主线程阻塞。
- **方向**：分块后写路径只重写「尾块」；流式期间只序列化增长中的当前轮。
- **验证**：benchmark 中 serialize 行；实施后对 100MB 会话记录 flush 耗时分布。

### [P0-3] 无脊柱索引：定位器/跳转到未加载轮次在结构上不可能 — `ChatMessageDots.tsx` + `chatStorage.ts`

- **现状**：Dots 条目完全由已加载 displayMessages 生成；会话 manifest 只有 `messageCount`/`preview`（`chatStorage.ts:17-37`），无轮次级索引。
- **影响**：这是窗口化的**前置阻塞项**——没有 spine，「点定位器加载对应段落」无法实现；「加载更多」也无从知道还有多少轮可加载。
- **方向**：新增每会话 spine（结构见设计节），不加载正文即可获得 `{turn, userMsgId, preview, startMsgIndex, msgCount}`。
- **验证**：spine 尺寸 ≤ 几十KB/会话；Dots 渲染 500 轮 spine 无卡顿。

### [P1-4] `persistManifest` 每次会话级变更整段 stringify — `chatStorage.ts:179-181`（调用点 `chatHistory.ts` addMessage/updateSessionTitle 等）

- **现状**：manifest = 50 meta × (preview≤80字 + artifactIds + readSliceIds≤200 + context)，每次会话级写整段 JSON。
- **影响**：meta 有界但不小；流式期 `updateMessage` 仅在 artifactIds 变化时写（`chatHistory.ts:483-485`，已优化）。**若 spine 挂进 SessionMeta 会放大此问题**——50 会话 × 100 轮 × ~100B ≈ 600KB 每次写。
- **方向**：spine **不进 manifest**，独立 `chat-spine:<id>` key 或折进 session head key（SA-1 结论：manifest 已是「会话级 spine」刚好够用）。
- **验证**：manifest 实测字节；打开历史面板的 parse 耗时。

### [P1-5] `pickRicherMessage` 对全同 id 集也逐条双评分 — `lib/sync/merge.ts:39-54`

- **现状**：同 id 消息 timestamp 相同仍 `semanticScore` 双算（`getAnswerText` 剥 think + 逐 part 评分 + `compactStudyMessage`×2）。
- **影响**：pull 路径（`engine.ts:845-859`）对本地已有会话全量执行 → 50 会话 × 消息数 × 双份评分，深链冷启动叠加 D3-P0。
- **方向**：「字节相等」短路（同 id + 同 timestamp + 同 payloadFingerprint 直接取一份）；评分只留真分叉。
- **验证**：merge fixture 断言评分调用次数。

### [P1-6] `hydrateAttachmentsForApi`/`extractBlobIdsFromMessages` 串行与全扫 — `chatStorage.ts:256-267,362-403`

- **现状**：附件水合逐个 `await loadBlobDataUrl` 串行（`:381`）；`extractBlobIds` 全扫 messages×attachments（GC 路径乘会话数）。
- **方向**：blobIds 进 spine/head 后 extract 退役；水合 `Promise.all`。
- **验证**：10 附件消息水合耗时。

### [P2-7] 尺寸估计/跳转精度 — `ChatThread.tsx:95-114,222-239`

- `roleSizeRef` 均值估计按会话重置（`:105-108`）；prepend 未加载段全靠估计→实测补偿；`jumpToUserMessage` 8 次 rAF refine + 库内 reconcile 5s 兜底。窗口化下「跳到刚加载的区段」首次偏移误差 = Σ(估计-实测)，可能一次可见回弹。
- **方向**：`takeSnapshot` 存 head（`virtual-core index.d.ts:188`）+ `initialMeasurementsCache` 恢复实测行高；jump 先 `scrollToIndex` 到区段首行，测量稳定后精跳。

### [P2-8] `consumeStudyStream` 两次 structuredClone — `consumeStudyStream.ts:126,205-221`

- O(消息体)×2/次发送，可忽略；`latest={...snapshot}` 快照保留全部 parts 属必要。仅记录，不动。

### [P2-9] `measureLocalSyncUsage`/`loadAllSessionsForExport` 全库物化 — `engine.ts:219-246`、`chatStorage.ts:344-360`

- 低频路径，现状可接受；分块后成本不变（assemble 全部块）。用量测量可缓存 per-chunk bytes。

## 窗口化设计方案（审查结论，供修复计划细化）

### A. 存储格式 v3：轮次分块 + 独立 spine

- **轮定义**：一轮 = 一条 `role==='user'` 消息 + 其后至下一条 user 前的全部 assistant 消息（复用 `splitChatKeptTurns` 边界，`compactChatSession.ts:15-21`）。`compact-user-*/compact-assistant-*` 压缩摘要天然计一轮（`:31-46`）；system 不进 spine；孤儿 assistant 归入下一轮。
- **键布局**：`chat-session:<id>` → session head（meta + spine + blobIds + 尾块内联或引用）；`chat-session:<id>:chunk:<n>` → 每块 N 轮（建议 8-16 轮/块，按字节 ~200-400KB 目标切块而非固定轮数——工具输出大的轮单独成块）。
- **spine 条目**：`{turn, userMsgId, preview(≤48字), startMsgIndex, msgCount, estBytes}`——Dots、加载更多计数、跳转寻址全靠它；每会话一份几十KB，随头块读写。
- **写路径**：`updateMessage`/`addMessage` 只重写尾块（或按轮 upsert）；spine 只在轮边界变化时重写。

### B. 窗口状态机

- `messagesById[id]` 改为「已加载区间集合」（如 `[lo..hi]` 消息索引区间数组）+ spine；store 暴露 `loadOlderTurns(id, k)`、`loadTurnRange(id, turnRange)`。
- 初始：`ensureSessionLoaded` 读 head+spine+尾部 3-4 轮。
- 顶部「加载更多」：prepend 前一段 → 需 `anchorTo:'end'`/scroll 锚定防跳动。
- Dots：由 spine 渲染全部轮次；点击未加载轮 → `loadTurnRange` → 插入区间 → `scrollToIndex` 区段首行 → 测量稳定精跳（P2-7）。
- 流式追加：当前轮永远属于已加载尾块，与窗口模型天然兼容。

### C. 必须同步改造的调用方（防静默丢上下文）

| 路径 | 现状假设 | 改造要求 |
|---|---|---|
| `sendMessage`/`buildRequestMessages` | `messagesById` 全量 | 按请求范围加载（最近 K 轮 + 已 pin），**不是**显示窗口 |
| sync `pushOne`/`pull` | 全量 payload | 分块 assemble/按块指纹增量 |
| `gcOrphanedChatKeys` | `loadMessages` 全量 | 读 head 的 blobIds |
| 导出 | 全量 | assemble 全部块 |
| `hydrateAttachmentsForApi` | `messageIds` 限域 | 保持，无需动 |

### D. 迁移 v2→v3

- 惰性迁移：打开会话时若读到 v2 单 blob → 按轮切分写 chunk keys + spine → 删旧 blob（保留 tombstone 防中途失败）。
- `manifestFrom`/SessionMeta 加 `storageVer: 2|3` 或独立 version key；`loadSessionMessages` 保留 v2 fallback 一段时间（供 sync/导出兼容）。
- 风险点：迁移中崩溃 → 双写窗口期保护（先写 chunks 再删 blob，读时 chunks 优先）。

## 未验证项（实施期补测）

- IDB 大 blob 真实读延迟（DevTools）；分块后 per-chunk 读延迟对比。
- `anchorTo:'end'` prepend 实测无跳（`shouldAdjustScrollPositionOnItemSizeChange` 与流式尾行 `return false` 逻辑需保留，`ChatThread.tsx:185-189`）。
- spine 在 500 轮会话下的序列化体积与 Dots 渲染帧耗。
