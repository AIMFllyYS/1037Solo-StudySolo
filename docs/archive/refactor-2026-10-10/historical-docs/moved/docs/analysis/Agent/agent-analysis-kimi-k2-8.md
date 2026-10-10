# Agent 架构全景分析报告（Kimi K2.8）

> 分析方式：全代码库源码摸底（4 路并行探索：Agent 主循环 / 上下文工程 / 模型接入层 / Harness 与工具执行层）。
> 分析约束：全程仅依据源码，未参考 `docs/analysis/Agent/` 下任何既有分析文档。
> 分析日期：以当前会话日期为准。

---

## 0. 核心结论（TL;DR）

1. **目前是多次调用，但不是"提示词约定 + 输出底部写工具调用"的手工协议。** Agent 循环基于 Vercel AI SDK v7（`ai@7.0.85`）内置的 **`ToolLoopAgent`**（`lib/ai/agent/studyAgent.ts:142`），循环体由 SDK 封装在 server 端：模型输出结构化 tool_call（JSON 参数 + zod 校验）→ SDK 并发执行工具 → 结果回灌为新 message → 再调模型，直到模型不再调工具或达到步数上限（`MAX_TOOL_STEPS = 6`）。前端只发一次 HTTP 请求并消费 SSE 流，**不驱动循环**。
2. **上下文工程是项目最成熟的板块**："稳定前缀 + 易变尾巴"单条 system（prefix cache 友好）+ 滑动窗口历史 + contextKey 去重代替截断 + BM25×向量×rerank 三级混合检索 + 客户端/服务端双轨 token 核算，且有契约测试守护。短板：无摘要压缩、无跨会话长期记忆。
3. **Harness（编排层）无同名模块，是散装整体**：装配集中、工具无副作用化（server 端工具全部只读/纯计算，危险操作延迟到前端用户批准）、错误处理哲学正确（工具不 throw、结构化结果不进模型上下文）；但无生命周期 hooks / 观测、无 per-tool 超时、无 MCP、无状态机。
4. **模型接入层扩展性设计最具前瞻性**：一切走 OpenAI 兼容网关 + 少量 Anthropic 原生协议；自定义端点零代码接入；思考链归一化管线 + failover 容灾 + 多模型路由均已落地。新增 OpenAI 兼容端点 = 零代码，内置注册模型 = 改 4~5 处，路径清晰。

---

## 1. 整体架构分层

```
前端 (components/chat + lib/chat)
  │  一次 POST /api/chat，消费 SSE 流（UIMessage Stream 协议）
  ▼
app/api/chat/route.ts              ← 编排入口（唯一 agent 触发点, runtime = "nodejs"）
  │
  ├─ lib/ai/agent/studyAgent.ts    ← ToolLoopAgent 装配（system prompt、tools、prepareStep）
  ├─ lib/ai/agent/tools/*          ← 13 个工具（进程内 TS 函数，无 MCP）
  ├─ lib/ai/sdk/*                  ← 模型适配层（failover、reasoning 归一化、SSE 心跳）
  ├─ lib/context/* + lib/ai/search/* ← 上下文管理器 + 混合检索管线
  └─ lib/ai/agent/contextBreakdown.ts ← 服务端精确 token 分项核算
```

### 1.1 请求全链路

1. 前端 `lib/chat/executeChatRequest.ts` → `createStudyChatTransport().sendMessages()` → POST `/api/chat`。
2. `lib/chat/buildRequestMessages.ts:43-74`：从历史尾部取消息，只保留 text/file parts（reasoning、tool 结果不回灌，注释见 `:22-25`），图片附件转 base64 file part。
3. `lib/chat/buildChatRequestBody.ts:44-79`：body 携带 `contextMode`、`contextTruncated`、`sessionContextBudgetTokens`、`clientContextTokens`、`globalContext`、`skills`、当前位置（subjectId/categoryId/itemId）、`customApiGroups` 等（zod 校验在 `lib/ai/agent/requestSchema.ts:49-77`）。
4. 服务端 `app/api/chat/route.ts`：
   - 参考材料：`getContextManager(contextMode ?? "full", effectiveModelId).buildContext(chatCtx, userText)`（`route.ts:147-148`）→ 产出字符串 `【参考材料】`；
   - agent 装配：`createStudyAgent()`（`route.ts:153-166`）；
   - 流执行：`bundle.agent.stream({ messages, abortSignal })`（`route.ts:170`），结果经 `result.toUIMessageStream()` 手动逐 chunk 转发（`route.ts:176-186`），结束后发 `data-followup` / `data-context-breakdown` / `data-usage` / `message-metadata` / `finish` 等 data part。
5. 前端 `lib/chat/consumeStudyStream.ts`：`DefaultChatTransport` + `readUIMessageStream`（`:141`）把 SSE 还原成有序 parts 快照，节流写回 Zustand 聊天历史（`lib/chat/executeChatRequest.ts:37-47`）；自定义 data chunk 解析在 `consumeStudyStream.ts:112-128`。

### 1.2 循环结构

循环内一次"步" = 一次 LLM 调用 + 并发执行该步所有工具调用（SDK 内部 `Promise.all`，`node_modules/ai/dist/index.js:6261 executeTools`）+ 结果回灌（`executeToolCall`，同文件 `:3147`）。工具结果经 `toModelOutput: ({output}) => toText(output)` 转成 `{ type: "text", value }` 注入下一轮（如 `lib/ai/agent/tools/getSection/tool.ts:41`）。

每步干预钩子 `prepareStep`（`studyAgent.ts:129-140`）：
- **生图模式**：第 0 步强制 `toolChoice: { type: "tool", toolName: "generateImage" }` 且只暴露该工具；后续步 `toolChoice: "none"` 让模型纯文字收尾。
- **imageSearch 配额**：累计 ≥ 20 张（`IMAGE_SEARCH_MAX_TOTAL`）后从 `activeTools` 移除。

### 1.3 Agent 之外的辅助单轮调用（不在循环内）

- `generateFallbackFollowUps()`（`lib/ai/agent/followUps.ts:49`）：`generateText` 在模型未输出 `<FollowUp>` 标签时兜底生成追问，用轻量模型 `ENV_MODEL_FLASH`（`:51`，`maxRetries: 0`，`:61`）。
- 独立路由：`/api/chat-title`、`/api/canvas-revise`、`/api/follow-ups`、`/api/image-gen`、`/api/quiz`、`/api/artifact`、`/api/document`、`/api/record`。

### 1.4 终止 / 中断 / 人工介入

- **终止条件**：模型不再产生 tool_call（自然终止）或达到 6 步（`stopWhen: isStepCount(MAX_TOOL_STEPS)`）；`maxRetries: 0`（端点故障由 model adapter 层 failover 接管，不在 agent 层重试）。
- **Abort**：`AbortSignal.any([req.signal, generationAbort.signal])`（`route.ts:89-90`），前端断开或流中 error/abort 时 `generationAbort.abort()`（`route.ts:180-184`），防止断连后二次计费请求。
- **人工介入**：AI SDK 的 `toolApproval` 未使用。唯一硬确认点是 **generateImage**（付费 ¥0.10/张）：工具本身不调生图 API，只返回"等待批准"文本（`tools/generateImage/tool.ts:16-25`），前端批准卡片 `components/chat/ImageGenCard.tsx:43` 用户批准后才独立请求 `/api/image-gen`。这是循环外的前端门闩，不打断 agent loop。
- **上下文安全阀**：上下文达 80% 软上限时省略整个参考材料并在 system 里告知模型（`route.ts:149-151`、`studyAgent.ts:97-99`）。

---

## 2. 系统提示词组装（lib/ai/prompts）

入口：`lib/ai/prompts/index.ts` 的 `buildSystemPrompt(ctx)`（`:36-41`）。

- **静态模板**：`lib/ai/prompts/global.md`（角色「小岸」、教学法、公式规范、工具调用策略，`{subjectName}` 占位符替换）+ `lib/ai/prompts/subjects/<id>.md`（8 个学科），服务端 fs 读取，生产缓存。
- **动态拼接**（`studyAgent.ts:74-104`），刻意分层：
  1. **稳定前缀**：baseSystemPrompt（global + subject）+ `IMAGE_MODE_RULE` + 用户 globalContext + 置顶技能全文 + 技能库菜单（菜单项靠 `useSkill` 工具按需加载）——逐字节稳定，利于上游 prefix cache 命中；
  2. **易变尾部**：当前定位行（`buildLocationLine`，`prompts/index.ts:44`）+ 参考材料（上下文管理器 `buildContext()` 产出）或 80% 软上限告警文案；
  3. 合并为**单条 system**（注释 `studyAgent.ts:103`：部分模型如 Qwen3 不接受第二条 system）。

**评价**：这是踩过兼容性坑后的成熟设计——prefix cache 意识、单 system 约束、菜单式技能加载三者都是教科书级做法。

---

## 3. 工具系统（13 个工具）

注册中心：`lib/ai/agent/tools/server.ts` 的 `buildStudyTools(ctx, runtime, opts)`（`:44-88`），工厂模式以便闭包捕获请求上下文。全部是标准 AI SDK `tool({ description, inputSchema: zod, execute, toModelOutput })`。类型清单在 `tools/names.ts:16-48`。

| 工具 | 定义文件 | 作用 | 备注 |
|---|---|---|---|
| getCurrentPage | `tools/getCurrentPage/tool.ts` | 读取当前页笔记 | contextKey: `page:` |
| getOutline | `tools/getOutline/tool.ts` | 科目大纲/有效路径 | |
| getSection | `tools/getSection/tool.ts` | 按路径读任意页面正文 | contextKey: `section:` |
| searchNotes | `tools/searchNotes/tool.ts` | 笔记全文检索（top 8） | 学年无命中自动放宽跨学年（`:42-47`） |
| searchNoteImages | `tools/searchNoteImages/tool.ts` | 检索笔记配图 | |
| webSearch | `tools/webSearch/tool.ts` | 联网搜索 | 仅 `enableSearch` 时注册 |
| imageSearch | `tools/imageSearch/tool.ts` | 搜图 | 会话配额 20 张（`IMAGE_SEARCH_MAX_TOTAL`） |
| renderInteractive | `tools/renderInteractive/tool.ts` | HTML 交互组件（Artifact） | 只回 artifactId，前端走 `/api/artifact` |
| drawDiagram | `tools/drawDiagram/tool.ts` | SVG 绘图指南 | |
| generateImage | `tools/generateImage/tool.ts` | AI 生图 | 只回待批准载荷，前端批准后走 `/api/image-gen` |
| createQuiz | `tools/createQuiz/tool.ts` | 出题卡片 | |
| writeDocument | `tools/writeDocument/tool.ts` | 写文档 | 只回 docId，前端走 `/api/document` |
| useSkill | `tools/useSkill/tool.ts` | 按名加载技能全文 | contextKey: `skill:` |

过滤逻辑（`server.ts:68-87`）：`disabled`（用户禁用列表）+ `enableSearch` 开关 + 技能存在性。

**共享运行时** `StudyToolRuntime`（`tools/_shared.ts:23-30`）：`imageSearchFetchedCount`（配额）、`loadedContextKeys`（去重集合），同一请求内跨工具轮次共享。

**关键设计——工具无副作用化**：13 个 server 端工具全部只读/纯计算，有副作用的操作（生图、artifact、文档）一律延迟到前端卡片经用户动作后独立请求。这让整个 agent loop 在 server 侧没有危险面。

---

## 4. 上下文工程深度分析

### 4.1 聊天历史存储（纯客户端）

- **IndexedDB**，无服务端数据库。数据库 `gailvlun-db` / store `keyval`（idb-keyval 封装，`lib/storage/idbStorage.ts` + `lib/storage/chatStorage.ts:15-17`）。
- 三层结构（v2 manifest）：
  - manifest：`PERSIST_KEYS.chatManifest` → `{ version: 2, activeSessionId, sessions: SessionMeta[] }`（`chatStorage.ts:31-35`）；
  - 每会话消息数组：`chat-session:{id}` key 下整条 JSON（`:89-106`）；
  - 图片附件 base64 单独存 `chat-blob:{id}`（`:116-125`），消息里只留引用 id。
- Zustand store `lib/stores/chatHistory.ts`：内存最多同时保留 3 个会话（`MAX_LOADED_SESSIONS = 3`，LRU 驱逐），最多 50 个会话（`MAX_SESSIONS`），含 v1→v2 幂等迁移（`chatStorage.ts:181-218`）。localStorage 只用于设置类 store。

### 4.2 截断/压缩策略（滑动窗口，无摘要压缩）

契约测试：`tests/contextTruncationPolicy.test.ts`（源码契约测试：读源码正则断言 + 直接驱动 zustand store）。

| 测试点 | 实现 |
|---|---|
| 会话级固定 budget | `lib/stores/tokenTracker.ts:74-83`：`sessionContextBudgetTokens` 首次设定后不再随切模型改变 |
| usage 不覆盖上下文计数 | `tokenTracker.ts:53-72` `addUsage` 只记 `lastTurn/sessionTotal` |
| breakdown 驱动环形总量与警告 | `tokenTracker.ts:85-94` `setContextBreakdown`；服务端计算 `lib/ai/agent/contextBreakdown.ts` |
| route 取最后一条 user 消息 + 软截断元数据 | `app/api/chat/route.ts:37,147-151,211-214` |
| 工具 contextKey 去重 | `lib/ai/agent/tools/_shared.ts:23-52` |
| 80% 警告但不禁用输入 | `components/chat/ChatPanel.tsx:57-58,171-187` |

策略细节：
- 软上限 = 会话 budget 的 **80%**（`lib/chat/estimateContextBudget.ts:37`；服务端复算 `route.ts:150`）。
- 触发后客户端只发**最近 16 条** user/assistant 消息：`SOFT_LIMIT_MAX_TURNS = 16`（`lib/chat/buildRequestMessages.ts:5`），在 `lib/chat/executeChatRequest.ts:33-35` 生效，且 `preserveAttachmentHistory: false`。
- 服务端三重判定（`route.ts:151`）：`body.contextTruncated || serverSoftLimitReached || ctxResult.overflow`；截断时**省略整个参考材料**，在 system 里写入「当前会话达到 80% 软上限…」说明。
- 本地聊天历史始终完整保留；输入框不禁用，只显示警告条 + "新对话"按钮。
- **工具级去重代替截断**（`dedupeByContextKey`，`_shared.ts:37-52`）：同一请求内相同 contextKey 第二次调用只回「【上下文已加载】…不要重复展开全文」。key 生成例：`getCurrentPage/tool.ts:27`、`useSkill/tool.ts:37`、`searchNotes/tool.ts:67`、`getSection/tool.ts:25`。
- 其他硬上限：searchNotes 每次 8 条命中、imageSearch 单会话 20 张配额、工具链 ≤6 步。

### 4.3 Token 计数（双轨）

- 客户端：`lib/context/estimateTokens.ts` 启发式——CJK 字=2、ASCII 字母=0.325、空白=0.2、其他=1，取 ceil。有服务端基线时 `serverContextTokens + 新输入估算`，否则全文 + 3000 缓冲（`estimateContextBudget.ts:26-36`）。
- 服务端：请求结束后用真实拼装计算精确分项 `computeContextBreakdown`（`lib/ai/agent/contextBreakdown.ts`，按 tools/skills/pages/webSearch/conversation 五类），经 `data-context-breakdown` 回传（`route.ts:204-216`）作为下一轮客户端估算基线，且不会反向被 usage 覆盖。
- **按模型区分窗口**：`lib/ai/models.ts` 每个模型声明 `contextK`（千 token），`MODEL_TOKEN_LIMITS` 由 `contextK` 派生（`lib/context/types.ts:21-31`），缺省 128_000。

### 4.4 长期记忆 / 用户画像注入

**没有对话内容层面的长期记忆系统**（无 memory 表、无历史摘要注入）。已有持久化注入项：
- **globalContext**：设置里用户自填的全局补充文本（`lib/stores/settings.ts:69,152,412`），拼入稳定 system 前缀。
- **Skills（技能）**：用户上传的指令集（`lib/stores/skills.ts`）。pinned 技能全文常驻 system；未 pin 的只列名称+描述菜单，由模型调 `useSkill` 按需加载全文。
- `lib/notes/`（openCitedNote、locateSnippet 等）是**引用跳转**——AI 回复里的引用定位到课程页面并高亮，不注入上下文。

### 4.5 检索增强（RAG）

**完整的混合检索管线**。注意：默认 `contextMode: "full"` 下不走向量检索注入，RAG 以工具形式供模型主动调用；"semantic" 模式才自动注入。

- 离线索引：`scripts/build-index.ts` → `content/.index/`（bm25.json、chunks-meta.json、vectors.bin）；embedding 用 SiliconFlow `BAAI/bge-m3`（`lib/ai/embedding.ts:15`）。
- 核心 `lib/ai/search/hybridSearch.ts`：BM25（`bm25Store.ts`）∥ 向量 cosine（`vectorStore.ts`）→ **RRF 合并（k=60，`:77-96`）** → rerank 精排（默认 `BAAI/bge-reranker-v2-m3`，失败回退智谱 rerank，`:98-158`）→ 按 path 去重、snippet 截 400 字符（`:160-179`）。模式由 `AI_SEARCH_MODE` 控制：hybrid/vector/keyword（`:39-43`）。
- 注入路径：
  - `lib/context/semanticSearch.ts:62-78`（semantic 模式）：当前页全文 + top 5 命中片段自动拼入参考材料（按学年/科目过滤，`preferSubjectId` 优先）；
  - `tools/searchNotes/tool.ts`：模型主动检索，top 8，结果 path 可再传 `getSection` 取全文；
  - `lib/content/loader.ts:454-493 searchAllContent`：索引不可用时回退子串扫描（生产禁用）。
- 全量模式 `lib/context/fullContext.ts:82-103`：注入课程目录树摘要 + 当前页完整 markdown（模块级缓存 + md5 比对报告 `cacheHit`）。

### 4.6 上下文工程评价

**优点**：分层 system（prefix cache 友好）+ 菜单式技能 + 去重代替截断 + 双轨核算 + 分级熔断 + 混合检索管线，且有契约测试守护，成熟度高于同类项目平均水平。

**薄弱点**：
1. **无摘要压缩**——纯滑动窗口意味着长会话早期内容永久丢失；模型会"忘记"对话开头用户说过什么。
2. **无跨会话长期记忆**——错题记录、用户薄弱点画像等教育场景核心数据没有进入注入链路。
3. **历史回灌丢 reasoning 与 tool 结果**（`buildRequestMessages.ts:22-25`）——截断到 16 条后，跨请求对"我之前查过什么"完全失忆（contextKey 去重只兜同一请求内）。
4. token 启发式对中文偏悲观（CJK=2，实际 bge 系分词约 1.5~1.8 token/字），软上限会偏早触发。

---

## 5. Harness（编排层）分析

代码中**没有**名为 harness 的模块（`lib/hooks/` 是 React hooks，无关）；该名字指代散装编排层整体：`app/api/chat/route.ts`（编排入口）+ `lib/ai/agent/studyAgent.ts`（agent 装配）+ `lib/ai/agent/tools/*`（工具工厂）+ `lib/ai/sdk/*`（模型适配容错）+ `lib/chat/*`（客户端流消费）。

### 5.1 工具执行位置

- 唯一触发点：`app/api/chat/route.ts:170` `bundle.agent.stream(...)`。
- **项目没有自己的 switch/map executor**——循环与并发调度都在 SDK 内部（`node_modules/ai`）。自有部分是 13 个工具工厂 + 请求级 runtime。

### 5.2 Server 端 vs Electron

**纯 server 端**。`route.ts:21` `runtime = "nodejs"`。Electron 只是加载 127.0.0.1 的壳：
- `electron/preload.js:7-9` 只暴露只读 `window.desktop = { isElectron, platform }`（内置浏览器从 iframe 切 webview）；
- IPC 仅 `setup:get-keys / setup:save / setup:test`（首次配置 API key，`electron/main.js:336-359`）；
- **没有 agent 工具的 IPC 桥**。

### 5.3 MCP

**没有**。`@modelcontextprotocol` 未出现在 package.json / pnpm-lock。工具就是进程内 TS 函数。

### 5.4 权限 / 确认机制

- 无通用权限框架，但"工具无副作用化"让 server 侧没有危险面（见 §3）。
- 暴露门控（而非运行时确认）：用户禁用工具 → `disabledTools` 过滤（`server.ts:84`）；`enableSearch` 控制联网工具；`prepareStep` 动态收窄工具集与强制 toolChoice。
- 副作用延迟到前端：generateImage / renderInteractive / writeDocument 均只回 ID/载荷，实际执行由前端卡片独立走对应路由。

### 5.5 错误处理与重试

- **工具不抛异常**：所有失败路径返回带说明文字的 output（如 `searchNotes/tool.ts:26-28` 索引未加载、`getSection/tool.ts:26-33` 未找到、`writeDocument/tool.ts:14-21` 参数校验失败），以普通文本回灌让模型自我纠正。13 个 tool.ts 中 `throw` 出现次数为 0。
- SDK 兜底：execute 真抛错时捕获生成 `tool-error` part，以 `errorMode: "text"` 把错误文本喂回模型。
- 重试：agent 级 `maxRetries: 0`；端点级 failover 在 `failoverModel.ts:80-133`（首包超时/错误时切换备用端点）。
- **超时**：`ToolLoopAgent` 未传 `timeout` → **无 per-tool 超时**；工具共享请求级 AbortSignal。另有 SSE 心跳保活（`lib/ai/sdk/heartbeat.ts`，首 chunk 前每 15s 写 `: heartbeat` 注释行防代理断连）、客户端 stall 看门狗（`lib/chat/createStallWatchdog.ts`）。
- 客户端收尾：失败/中断时把未完成 tool part 标成 `output-error` + `errorText`（`consumeStudyStream.ts:179-184`）。

### 5.6 结果回灌格式化

- **只回灌 text**：每个 output 含 `text`（`tools/_types.ts:3-4`），`toModelOutput: toText` 返回 `{ type: "text", value }`。结构化字段（hits/sources/artifactId/quiz 题等）**不进模型上下文**，只随 UI 流给前端卡片——模型上下文里只有纯文本，非常克制。
- 无按字节截断工具文本；用去重 + 配额 + 步数上限做边界。

### 5.7 生命周期 hooks

**没有**。app/、lib/ai、lib/chat、components/chat 里的 "hook" 全部是 React hooks。最接近生命周期拦截的点：`prepareStep`（每步执行前）、客户端回调注入（`executeChatRequest.ts:20-24`：`onWrite/onInfo/onContextBreakdown/onUsage/onStall`）。无 `onStepFinish`、无 instrumentation/tracing。

### 5.8 Harness 评价

**优点**：装配集中可读；`prepareStep` 用在刀刃上；工具无副作用化 + 失败文本化回灌 + 结构化结果不进上下文——三条都是正确的 harness 哲学。

**薄弱点**：
1. 无观测/追踪钩子——出问题只能靠日志与 `data-context-breakdown` 事后推断；未来加评测（eval harness）必须先补。
2. 无 per-tool 超时——单个工具 hang 住会吃掉整请求的 6 步预算。
3. 无 MCP——工具注册外部化缺位，新增工具必须改代码发版。
4. 无跨请求任务状态机——`StudyToolRuntime` 只是请求内计数器。
5. 6 步上限偏紧且不按模型能力差异化——searchNotes → getSection → 推理 → renderInteractive 的自然链路就要 3~4 步，复杂多页对比任务易触顶。

---

## 6. 模型接入层分析

### 6.1 支持的 provider 与配置

**不用各家官方 SDK，一切走 OpenAI 兼容网关 + 少量 Anthropic 原生协议**。核心注册表 `lib/ai/models.ts:143`（`MODELS` 数组），内置模型按上游凭证分 4 类（`ProviderKind`，`models.ts:6`）：

| ProviderKind | 用途 | 凭证 env（变量名） | 默认 base |
|---|---|---|---|
| `relay` | 主力对话（自有中转） | `RELAY_BASE_URL` / `RELAY_API_KEY` / `RELAY_MODEL_ID` | `https://relay.protocom.org/v1` |
| `mimo` | 小米 MiMo Token Plan | `MIMO_BASE_URL` / `MIMO_API_KEY` | `https://token-plan-cn.xiaomimimo.com/v1` |
| `siliconflow` | 生图 + embedding/rerank | `AI_BASE_URL` / `AI_API_KEY` | `https://api.siliconflow.cn/v1` |
| `zhipu` | embedding/rerank 容灾 + 联网搜索 | `ZHIPU_BASE_URL` / `ZHIPU_API_KEY` | `https://open.bigmodel.cn/api/paas/v4` |

内置模型（`models.ts:160-284`）：GLM-5.3 Flash、Qwen3.8 27B、Gemini 3.7 Flash、DeepSeek V4 Flash（走 relay）；MiMo V2.5 Pro / V2.5（走 mimo）；Z-Image Turbo（生图，siliconflow）；另有桌面端专用 `custom-openai`「自由中转」（`models.ts:97`，网页端菜单隐藏）。

**自定义 OpenAI-compatible 端点是一等公民**：设置里填多组 `CustomApiGroup`（每组独立 baseUrl/apiKey + 模型列表，`models.ts:430-438`），模型注册 id 形如 `custom:<groupId>:<modelId>`（`CUSTOM_PREFIX`，`models.ts:338`）。无本地模型（无 ollama/lmstudio 路径）。

### 6.2 自定义 provider 实现方式

装配点 `lib/ai/sdk/languageModel.ts:73-90`：

```ts
const upstream = createOpenAICompatible({
  name: UPSTREAM_PROVIDER_NAME,           // 统一叫 "upstream"
  baseURL: p.baseUrl.replace(/\/+$/, ""),
  apiKey: p.apiKey,
  includeUsage: true,
  fetch: createReasoningNormalizingFetch(p.reasoningField),  // 思考字段归一化
});
return wrapLanguageModel({
  model: upstream(p.apiModelId),
  middleware: extractReasoningMiddleware({ tagName: "think" }),  // 正文内嵌 <think> 抽取
});
// apiProtocol === "anthropic" 时走 createAnthropic (languageModel.ts:74-77)
```

- 协议三选一由 `apiProtocol`（`openai | anthropic | siliconflow`，`models.ts:405`）决定；`lib/ai/provider.ts:39-54` 的 `autoConfigFromProtocol` 自动装配思考方言。
- 思考链归一化管线（`lib/ai/sdk/reasoningNormalizer.ts`）：兼容 `thinking` / `reasoning_details` / 结构化 `{type:"thinking",thinking:"..."}` / 正文内嵌 `<think>` 标签。
- `tests/customProviderCompatibility.test.ts` 是**源码断言测试**（读文件 regex 匹配），守住的兼容性：思考链归一化管线存在；不支持 tool calling 的模型必须省略 tools；不支持思考的模型不得下发裸 `enable_thinking`/`thinking_budget`；兼容字段（`reasoningField`/`thinkingRequestStyle`/`imageApiStyle`）在设置 UI 保留。

### 6.3 模型选择 / fallback / 多模型路由

- **用户选择**：全局 Zustand store（localStorage 持久化，`lib/stores/settings.ts:107`，`LS_KEY="gailvlun-settings-v1"`）的 `selectedModelId`；UI `components/chat/ModelMenu.tsx`。独立模型槽位：`recordModelId`（摘录）、`floatingChatModelId`（划词助手）、`imageModeTextModel`/`imageModeTextModelFallback`（生图模式文本）。
- **Failover**（`lib/ai/sdk/failoverModel.ts:69`）：主端点 + `endpoints` 链 + 降级模型串成一个 `LanguageModelV4`。规则：主端点在**产出首个 chunk 之前**遇到可恢复错误（502/503/504、特定 400 code、网络错误、首字节超时 `firstChunkTimeoutMs`）才切换；开始流式后不再切换（避免拼接两个半截回答）。**明确不降级：401/403/429**（`lib/ai/upstream.ts:28-37`，"换 key 无效"）。`onFailover` 经流内 `data-info` 通知前端。无同端点指数退避，"重试"即切下一候选。
- **多模型路由**已存在：追问/chat-title 固定 flash 轻量模型；artifact/生图/文档工具**锁定 tool call 创建时选中的模型**（`route.ts:163`，3 个工具 `modelId: ctx.modelId`）；embedding 容灾 SiliconFlow → Zhipu（`lib/ai/embedding.ts:120-166`）；生图模式文本模型 + fallback（`route.ts:94-95`）。
- 消费路由统一入口 `resolveLanguageModel`：`chat`、`artifact`、`document`、`record`、`canvas-revise`、`image-gen` 全部走它。

### 6.4 API key 管理

- **网页端**：全局 key 来自服务端 `.env.local`（`lib/ai/provider.ts:21-68` 读 `process.env`，仅服务端导入）。**per-user key**：自定义分组（baseUrl/apiKey）存浏览器 localStorage，随请求体明文发服务端（`customApiGroups` 字段，`buildChatRequestBody.ts:22,58`；解析 `route.ts:84-87`）；错误信息用这些 key 做脱敏（`route.ts:86-88`）。
- **Electron 端**：密钥不打包进 exe。`electron/config.js` 只烘焙非秘密字段；密钥首次运行设置窗（`electron/setup.html` + `setup-preload.js`）由用户填写，经 Electron `safeStorage`（Windows DPAPI）加密存 `userData/keys.enc`（`electron/main.js:46-77`），启动时解密注入本地 Next server 环境变量（`main.js:146-160`）。`KEY_NAMES` 在 `main.js:27-35`；设置窗有连接测试（`tryModels`，`main.js:393-399`）。

### 6.5 流式输出

- **服务端**：`createUIMessageStream` + `createUIMessageStreamResponse`；响应经 `withSseHeartbeat` 包装（`lib/ai/sdk/heartbeat.ts:7`）。
- **前端**：不用 `useChat` hook，手写薄封装——`DefaultChatTransport`（`lib/chat/consumeStudyStream.ts:6-25`，fetch 包装 `TransformStream` 做 stall 看门狗）→ `readUIMessageStream`（`:141`）→ 节流写回 Zustand。自定义 data chunk：`data-usage` / `data-context-breakdown` / `data-followup` / `data-info`（failover 提示）。

### 6.6 新增 provider 的操作路径

**接入新的 OpenAI 兼容端点（零代码）**：网页端「设置 → 自定义 API」新增分组即可。

**变成内置注册模型（4~5 处）**：
1. `lib/ai/models.ts`：`:6` `ProviderKind` 加值；`:143` `MODELS` 加模型条目（`contextK`、`endpoints` 用 `ep(KIND, "upstream/model-id")`）。
2. `lib/ai/provider.ts`：顶部加 `process.env.NEW_BASE_URL/NEW_KEY`（`:56-68` 模式）；`:191-206` `credentialsFor()` switch 加 case。
3. `.env.example` 加变量名注释。
4. Electron 端（如需桌面支持）：`main.js:27-35` `KEY_NAMES` + `:146-160` env 注入 + `setup.html` 输入框 + `config.js` 非秘密 base URL。
5. 测试：`lib/ai/provider.test.ts`、`lib/ai/models.test.ts`、`tests/customProviderCompatibility.test.ts` 补断言。

**接入非 OpenAI/Anthropic 兼容的新协议**（如 Gemini 原生）：还需 `lib/ai/sdk/languageModel.ts:73-90` 的 `buildBaseModel` 加分支 + `models.ts:405` `apiProtocol` 联合类型 + `provider.ts:39` `autoConfigFromProtocol` 登记。

### 6.7 模型接入层评价与薄弱点

**优点**：网关归一化 + 一等公民自定义端点 + 思考链归一化 + failover + 多模型路由 + 密钥管理（DPAPI / 脱敏），"未来接入各种模型"的诉求在架构上已被正面回答。

**薄弱点**：
1. **隐性约定**：`languageModel.ts:35` 把所有 `createOpenAICompatible` 实例统一命名 `"upstream"`，providerOptions 共用同一命名空间——新增协议风格必须走 `buildThinkingSettings`（`:115-148`）分支，否则思考参数会下发到错误的 namespace。靠人记住，建议加断言或类型约束。
2. 无本地模型路径；embedding/rerank 绑定 SiliconFlow/Zhipu 两家。
3. 步数上限不随模型能力差异化。
4. 辅助路由新旧 provider 形状并存（如 `app/api/chat-title/route.ts:45` 还用旧 `CustomProvider`），存量清理值得做一次。

---

## 7. 可持续性总评与建议优先级

**总体判断**：架构方向健康——站在 AI SDK `ToolLoopAgent` 的规范抽象上（而非自造文本协议），工具无副作用化、上下文分层、provider 归一化、failover 均为教科书式做法。技术债主要不在"架构错"，而在"纵深不够"：可观测性、摘要压缩、长期记忆、评测体系四层缺位。

| 优先级 | 事项 | 理由 | 涉及区域 |
|---|---|---|---|
| P0 | 会话摘要压缩（滚动 summarize 老消息） | 纯滑动窗口是长会话体验天花板 | `lib/chat/buildRequestMessages.ts`、`lib/ai/agent/` |
| P0 | per-tool timeout + `onStepFinish` 观测钩子 | 生产稳定性与可调试性基础 | `studyAgent.ts`、`lib/ai/sdk/` |
| P1 | 评测 harness（固定题集回归 agent 行为） | 模型/提示词迭代目前没有安全网 | 新建 `tests/agent-evals/` |
| P1 | `prepareStep` 按模型能力差异化步数上限 | 强模型 6 步偏紧 | `studyAgent.ts`、`tools/_shared.ts` |
| P2 | MCP 支持（工具注册外部化） | 决定未来工具生态扩展成本 | 新建 `lib/ai/agent/mcp/` |
| P2 | 跨会话长期记忆（错题/画像注入） | 教育场景核心差异化能力 | `lib/context/`、`lib/stores/` |
| P2 | 新旧 provider 形状统一 + `"upstream"` 命名空间约束加固 | 降低接入新模型的认知负担 | `lib/ai/sdk/languageModel.ts`、`app/api/chat-title/` 等 |

---

## 附：关键文件索引

| 关注点 | 文件 |
|---|---|
| Agent 编排入口 | `app/api/chat/route.ts` |
| Agent 装配 | `lib/ai/agent/studyAgent.ts` |
| 工具注册 | `lib/ai/agent/tools/server.ts` |
| 工具共享 runtime / 步数上限 | `lib/ai/agent/tools/_shared.ts` |
| 系统提示词 | `lib/ai/prompts/index.ts`、`lib/ai/prompts/global.md`、`lib/ai/prompts/subjects/*.md` |
| 上下文管理器 | `lib/context/`（`fullContext.ts`、`semanticSearch.ts`、`estimateTokens.ts`） |
| 混合检索 | `lib/ai/search/hybridSearch.ts`、`bm25Store.ts`、`vectorStore.ts` |
| 客户端请求组装 | `lib/chat/buildRequestMessages.ts`、`buildChatRequestBody.ts`、`executeChatRequest.ts`、`consumeStudyStream.ts` |
| 历史存储 | `lib/storage/chatStorage.ts`、`lib/stores/chatHistory.ts`、`lib/stores/tokenTracker.ts` |
| 模型注册表 | `lib/ai/models.ts` |
| 模型装配 / failover / 归一化 | `lib/ai/sdk/languageModel.ts`、`failoverModel.ts`、`reasoningNormalizer.ts`、`heartbeat.ts` |
| provider 凭证 | `lib/ai/provider.ts`、`lib/ai/upstream.ts` |
| 契约测试 | `tests/contextTruncationPolicy.test.ts`、`tests/customProviderCompatibility.test.ts` |
| Electron 密钥 | `electron/main.js`（KEY_NAMES :27-35、safeStorage :46-77、env 注入 :146-160） |
