# D6 检索与 API

> 范围：向量/BM25/hybrid 检索、索引构建与常驻、`/api/chat` 首 token 关键路径、流式开销、agent tools payload、观测层。

## 板块总结

- **检索链路是最大服务端开销源**：本地索引常驻 ~42,771 向量（1024 维，`vectors.bin` 175MB）；每次查询全库线性扫描，且 `preferSubjectId`/学年放宽可把一次 `searchNotes` 放大为 **3×(embedding + 全库扫描 + BM25 + rerank + 写库)**，单次工具调用最坏 ~1-4s。
- **首 token 关键路径串行**：请求体双次序列化 → Supabase 鉴权 → Auto 路由 LLM（短问题 +~1.2s）→ quota 快照 → 上下文装配（semantic 模式再打一次完整 hybridSearch）→ rehydrate 同步读文件 → 最多 3 次 agent 构造+全量 token 估算 → 截断态压缩 LLM（≤12s）。
- **索引常驻内存 ~300-450MB**（磁盘 `.index/` 实测 295MB），`chunks-meta.json`（40.7MB）被两个 store 各自 `JSON.parse` 成两份 Map。
- **观测层 `agentLog` 每生命周期事件同步 `JSON.stringify + redact + appendFileSync`**，一次 chat 约 20-40 次同步写盘，payload 含工具全量输出。
- **流式输出本身设计健康**：15s 空闲心跳、failover 仅首 chunk 前切换、`maxRetries:0`、per-token 一帧无额外放大。
- 客户端每轮请求上行全量历史+笔记/闪卡/项目切片目录（上限 800KB），服务端再做一次全量 stringify+encode 校验。

## 发现清单

### [P0-1] 向量检索全库线性扫描 + 多级放大至 3 次完整检索 — `vectorStore.ts:277-297`（复核）、`hybridSearch.ts:349-355`、`searchNotes/tool.ts:163-177`

- **机制**：`vectorSearch` 遍历全部 42,771 行，每行 `metaById.get` + `chunkInScope` + 1024 维余弦（行范数每次重算，`:53-71`）；`TopKMinHeap` 只优化 topK 收集不优化扫描。`preferSubjectId` 先按科目过滤跑一遍 `retrieve`，不足 3 条再跑第二遍全量；学年无命中再放宽 `all` 第三遍。`SemanticSearchManager` 默认带 `preferSubjectId`（`semanticSearch.ts:64-68`）。
- **量化**：单次扫描 ≈ 4,380 万次乘加 + 42,771 次 Map 查找 ≈ 30-120ms CPU；最坏一次 `searchNotes` = 3×(embedding RTT ~0.2-0.6s + 扫描 + BM25 + rerank RTT ~0.3-1.5s + `settleUsage` 写库 ~50-300ms) ≈ **1-4s + 最多 6 次网络往返**。
- **方向**：①加载时预计算行范数；②subjectId 硬过滤改按科目分桶倒排（跳过 ~90% 行）；③prefer 阶段 `Promise.all` 或小 topK 探测；④学年放宽合并为一次加权检索；⑤评估只 rerank 首遍。
- **验证**：`getLastSearchDiagnostics()`（`hybridSearch.ts:357-362`）记录 `ms`/`bm25Hits`/`vecHits`；构造 prefer<3 命中 query 观察双遍；`process.cpuUsage` 包住 `vectorSearch`。

### [P0-2] semantic 上下文模式把完整 hybridSearch 串进首 token 路径 — `semanticSearch.ts:40-78`、`api/chat/route.ts:218-219`

- **机制**：`contextMode==='semantic'` 时 `buildContext` 先同步 `readContentMarkdown` 读当前页全文，再 `await hybridSearch(userMessage,{topK:5,preferSubjectId})`——含上条全部放大，之后才进 `agent.stream`。
- **量化**：每 chat 请求 TTFB 额外 +0.5-3s（embedding+rerank RTT 主导），prefer 双遍更高；全部发生在 writer 尚未出任何 chunk 前。
- **方向**：检索结果短 TTL 进程内缓存（query+学年+页标题归一化 key）；检索与模型调起并行（先流 reasoning/工具占位）；或预取（输入即触发 debounce 检索）。
- **验证**：TTFB 分布对比 semantic vs full；`search.query` 日志 ms 字段。

### [P1-3] 检索索引常驻 ~300-450MB，`chunks-meta.json` 双份 parse — `.index/`（实测 295MB）、两个 store 的加载点

- `vectors.bin` 175MB + `bm25.json` 91MB + `chunks-meta.json` 40.7MB + ids 1.6MB；BM25 与 meta 各进一份 Map；`chunks-meta` 被两处各自 `JSON.parse` → 两份 Map 常驻。
- **方向**：meta 单例共享（一个 store 注入另一个）；BM25 按需加载/分段；评估 mmap/流式读 vectors.bin；Electron 服务端常驻可接受但要入预算表。
- **验证**：启动前后 RSS；`getLastSearchDiagnostics` 内存字段。

### [P1-4] `agentLog` 每生命周期事件同步写盘 — agentLog/`appendFileSync` 路径

- 每次 chat 约 20-40 次 `JSON.stringify+redact+appendFileSync`，payload 含工具全量输出；位于事件调用点同步执行。
- **方向**：换异步批量写（队列+定时 flush/进程退出 flush）；redact 提前截断大 output；日志级别抽样式记录。
- **验证**：`agent-lifecycle.jsonl` 单 chat 行数/字节；`appendAgentLog` 耗时分布。

### [P1-5] 请求体双序列化 + 上行 800KB 上限 — client `sendMessage`/`hydrateForRequest` 与 `api/chat` 入口

- 客户端每轮上行全量历史+目录（≤800KB），服务端再全量 stringify+encode 校验。
- **方向**：上行历史与显示窗口解耦（联动 D1 请求范围加载）；校验改采样/边界检查。

### [P1-6] Auto 路由 LLM 与 quota/rehydrate/agent 构造的串行链 — `api/chat/route.ts` 编排段

- 短问题 Auto 路由多一次 LLM（+~1.2s）；quota 快照（5s TTL+inflight 合并，已缓解）；rehydrate 同步读文件；最多 3 次 agent 构造+token 估算；截断态压缩 LLM ≤12s。
- **方向**：路由判定改规则优先（短问题启发式）或 fast-model；agent 构造缓存（按 context 指纹）；压缩触发率统计。

### [P2-7] `document` 两阶段 + 续写重送 ~1200 字；`canvas-revise` 非流式 — `api/document`、`api/canvas-revise/route.ts:68-97`

- 长文档最多 3 次全量 prompt；续写已部分只送 tail；canvas-revise `maxOutputTokens:6000` 非流式 → 可流式化降感知时延。

### [P2-8] `getMultiSubjectOutline` 每次重建全树文本 — `loader.ts:366-399`、`getOutline/tool.ts:18-24`、`rehydrateStudyParts.ts:59-65`

- 工具调用与 rehydrate 每轮重拼全树 outline 字符串（内容运行时不变）→ 按 scope 模块级缓存（`_treeSummaryCache` 先例 `fullContext.ts:15-29`）。

### [P2-9] `webSearch` preliminary 帧全量重发 sources — `webSearch/tool.ts:104-168`

- 每 provider 返回 yield 累积全量清单（~KB×事件数）；改增量帧或只末帧带全量。

### [P2-10] `chat-title`/`follow-ups` 卫星调用设计合理 — `kickoffSessionTitle.ts:35-39`、`api/chat-title`、`api/follow-ups`

- 标题走 `requestIdleCallback` + `callFastModel`（1800 字截断/48 tokens）；follow-ups 独立 200 tokens。仅确认前端不同时走两条 follow-ups 路径。

## 已确认做对（勿回归）

- 心跳仅空闲写注释、不随 token 放大（`heartbeat.ts:48-71`）；failover 仅首 chunk 前切且复用模型超时（`failoverModel.ts:106-175`）；prompt 文件缓存+稳定前缀利 prefix cache（`prompts/index.ts:21-36`）；quota 5s TTL+inflight 合并（`quotaGate.ts:104-105,371-382`）；`contextKey` 去重防重复回灌（`tools/_shared.ts:60-76`）；`maxRetries:0`（`studyAgent.ts:234`）。

## 未测项（优先级前三）

1. 单次 `hybridSearch` 端到端 ms（`search.query` 日志已有字段）；
2. 首次查询前后 RSS 差值（验证 300-450MB 估算）；
3. `agent-lifecycle.jsonl` 单 chat 行数/字节与 append 耗时分布。
