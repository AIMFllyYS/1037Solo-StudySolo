# Agent 架构最细粒度分析

> **生成**：2026-09-12 · **作者**：Cursor Grok 4.6 xhigh fast（主智能体 + 14 路只读子智能体）  
> **模型锁定**：全部子智能体 `cursor-grok-4.6-xhigh-fast`  
> **代码依据**：当前工作区；AI SDK `ai@7.0.85` / `@ai-sdk/openai-compatible` / `@ai-sdk/anthropic`  
> **产出路径**：`docs/analysis/Agent/agent-analysis-cursor-grok.md`  
> **文档性质**：只读勘察，不含代码修改  
> **对照**：`docs/analysis/Agent/agent-analysis-grok-cli.md`（同日 CLI 线）、`docs/agent-architecture-review.md`（较粗）、`docs/analysis/9-9/04-ai-chat-system.md`（2026-07 快照，§1/§3–§9 已过时）

---

## 0. 一句话结论

客户端每次发送对应 **1 次** `POST /api/chat`（一条 SSE）。服务端用 Vercel AI SDK 的 `ToolLoopAgent` 做 **原生 function calling 多步循环**：`isStepCount(6)` = **最多 6 次上游 LLM**（含最终文本步，不是「6 轮工具再加 1 次收尾」）。工具以 OpenAI `tool_calls` / Anthropic `tool_use` 进出，**不是**「把工具写在回答最下方再二次激活」的提示词协议。

跨用户轮次则刻意退化成文本协议：历史只回灌 `text` / `file`，工具结果、思考、卡片进度全部剥掉。因此整体是 **请求内 Agent 循环 + 请求间文本记忆** 的混合体。

旁路（artifact / document / image-gen / chat-title / canvas-revise / FollowUp 兜底）是主循环之外的另一次或多次模型调用。一次「问 AI + 开搜索 + 做演示 + 写文档 + 生图」的真实账单，远大于「点一次发送」。

---

## 0.1 本报告怎么来的

14 路并行只读探查，每路绑定对应 skill。子智能体不改仓库，只回传带行号的机制。

| # | 切面 | 子智能体 | 绑定 skill |
|---|---|---|---|
| 1 | 客户端发送编排 | [Client send pipeline](fc3d17d8-af70-4c69-b87f-03942f4e10ce) | `vercel-react-best-practices` |
| 2 | 服务端主循环 | [Server agent loop](5f0ec726-7561-470d-b228-c4d97227dce4) | — |
| 3 | 上下文工程 | [Context engineering deep](ebbacb3a-baa9-4e21-bdba-17e7a9218a73) | — |
| 4 | 读取 / 检索 / 技能工具 | [Read and skill tools](d282a3e0-cfdd-4ba8-a750-d08c943d854a) | — |
| 5 | 生成 / 副作用工具 | [Generation side-effect tools](ab9340af-8680-47c9-b7b0-77ca8b2d5e54) | — |
| 6 | 联网搜索 / 搜图 | [Web search image tools](7f85a37b-6d64-42e2-9bcf-51c3196f2895) | — |
| 7 | 模型接入层 | [Model provider SDK](a379a24d-55a0-44c0-b28f-adae1a5c3ce2) | — |
| 8 | 卫星生成路由 | [Satellite generation APIs](c306edb9-7d2c-4a3d-a6a0-b9189ef05a51) | — |
| 9 | 流式 UI / Trace / 卡片 | [Stream UI and trace](30686d4d-0d09-45d3-a1c6-2a4d7ec5c956) | `vercel-react-best-practices` |
| 10 | 测试覆盖 + 文档漂移 | [Agent tests and docs drift](fa358536-5476-43ba-894a-0cab187f9081) | `webapp-testing` |
| 11 | Agent 安全面 | [Agent security surface](0d6455a8-564e-4b10-95c4-e8760c068e16) | `security-best-practices` |
| 12 | 提示词与文本协议 | [Prompt and text protocols](340d9d62-9901-4b0c-a239-2e88d24e1adc) | — |
| 13 | 检索 / RAG | [Search RAG for agent](64f16c3b-0b69-404e-bb39-972d18192da4) | — |
| 14 | 消息模型与持久化 | [Message types persistence](01c38a9a-e467-44dd-bc96-542b238363a4) | — |

主编排另读：`consulting-analysis`（报告骨架）、`parallel_orchestration`（并行切面）、`deep-research`（可追溯断言）。**不以 2026-07 快照当现状。**

---

## 1. 调用拓扑：对谁是「一次」，对谁是「多次」

```
用户点发送
  └─ 1 × POST /api/chat  ──────────────────────── 唯一的对话 HTTP
       ├─ resolveLanguageModel（failover 包装）
       ├─ ContextManager.buildContext（full | semantic）
       ├─ createStudyAgent → ToolLoopAgent.stream
       │     Step 0  上游 LLM #1  → 可能 tool_calls
       │             执行工具（可并行多个）
       │     Step 1  上游 LLM #2  → 带着 tool 消息
       │     … 最多 Step 5 = 第 6 次 LLM
       ├─ 若正文无 <FollowUp>：再 1 次 generateText（兜底追问）
       └─ data-context-breakdown / data-usage / finish

卡片旁路（同一用户动作里可能再打）
  ├─ POST /api/artifact          1 次 streamText（HTML，最长 12 min）
  ├─ POST /api/document          1 次大纲 + N 次节（节内最多 2 次续写）
  ├─ POST /api/image-gen         用户批准后 1 次 images API（不是 chat）
  ├─ POST /api/chat-title        首条消息 0～1 次
  └─ POST /api/canvas-revise     画布铅笔，每次 1 次 generateText
```

| 观察者 | 次数 |
|---|---|
| 浏览器 | 对话 = 1 条 SSE；旁路另算 |
| 上游 chat/completions 或 /messages | 主循环 1～6 次 + 可选 FollowUp 1 次 + failover 换端点 |
| 用户账单 | 上述全部 + artifact/document/title；生图另计张 |

与「提示词底部写工具」的对比：

| | 自制 XML / 尾部约定 | 本仓库（现码） |
|---|---|---|
| 载体 | 自由文本 | 原生 `tool_calls` / `tool_use` |
| 停下来 | 正则 / stop token | SDK 看 `finishReason === tool-calls` 或 `isStepCount` |
| 再调用 | 自己拼第二轮 messages | 同一次 SSE 内 `streamStep(+1)` |
| 多模型 | 每个模型都要教同一套 XML | schema 由协议适配器翻译 |
| Anthropic thinking | 很难和 block 共存 | 同轮 signature 回传已测 |
| 仍留在「文本底部」的 | — | **只有** `<FollowUp>`，不是工具循环驱动 |

证据：`global.md:29-30` 标题就是 function calling；`studyAgent.test.ts` 喂结构化 `tool-call` part；上游请求带 `tools` / `tool_choice`（`chat-sdk.test.ts:328-330`）。`<ToolCall>` 只服务历史消息渲染。

---

## 2. `isStepCount(6)` 必须先钉死

常量：`lib/ai/agent/tools/_shared.ts:6` `MAX_TOOL_STEPS = 6`。  
配置：`lib/ai/agent/studyAgent.ts:147` `stopWhen: isStepCount(MAX_TOOL_STEPS)`。

SDK `isStepCount`：`({ steps }) => steps.length === stepCount`。评估时机：当前 step **已完成、工具已执行、step 已 push 之后**，再决定要不要 `streamStep(+1)`。

`ToolLoopAgent` **自己没有循环**（`node_modules/ai/src/agent/tool-loop-agent.ts`），只把 settings 交给 `streamText`。循环在 `stream-text.ts`。

| 时刻 | `prepareStep.stepNumber` | 完成后 `steps.length` | `isStepCount(6)` |
|---|---|---|---|
| 第 1 次 LLM | 0 | 1 | false |
| 第 2 次 | 1 | 2 | false |
| 第 6 次 | 5 | 6 | **true → 没有第 7 次 LLM** |

因此：

- 一步里可以 **并行多个** tool call，仍只算一步。
- 第 6 次若仍返回 `tool-calls`：工具 **会执行**，但 **没有** 第 7 次模型去消化结果。用户可能看到工具卡片而没有最终讲解。
- 名字 `MAX_TOOL_STEPS` 容易读成「6 轮工具 + 1 次收尾 = 7」。**SDK 不是这样。**
- 纯文本步因「没有 tool call」自然停，不必等 `isStepCount`。
- 本项目 `sendFinish: false` 后自己写 `{ type: "finish" }`，**丢掉** SDK 的 `finishReason`。触顶时 UI 不知道是步数上限。
- Agent 默认 `isStepCount(20)`；裸 `streamText` 默认 `isStepCount(1)`。旁路不走 Agent。
- `maxRetries: 0`（`studyAgent.ts:150`）覆盖 SDK 默认 2：端点容灾归 `createFailoverLanguageModel`，禁止把整条失败链重放三遍。

`studyAgent.test.ts:73-74` 只证明「1 次 tool + 1 次 text = 2 steps」，**没有触顶测例**。这是关键语义空洞。

---

## 3. Harness 上半：客户端发送编排

`useChat` **没有** barrel re-export。调用方都是直接 `import { useChat } from '@/lib/hooks/useChat'`。真正的发送纯函数入口是 `lib/chat/sendMessage.ts`（8 行 facade）。

### 3.1 四条入口，最终都进 `useChat.sendMessage`

| 入口 | 位置 | 传给 sendMessage 的东西 |
|---|---|---|
| 主面板输入 | `ChatPanel.handleSend` 80–82 → `ChatInput.handleSend` 129–139 | `quotedText / enableThinking / thinkingEffort / enableSearch / attachments` |
| 主面板追问 | `ChatPanel` 84：`sendMessage(question)` | **无** sendOptions |
| 主面板划词 outbound | `ChatPanel` 69–78：`sendMessage(outbound.content)` | **无** sendOptions |
| 浮窗输入 | `FloatingChatBody.handleSend` 71–75 | 透传 ChatInput 的 opts |
| 浮窗 seed | `FloatingChatBody` 45–67 | 固定 prompt + `{ quotedText }`，**无** thinking/search |
| 浮窗追问 | 86：`sendMessage(question)` | **无** sendOptions |

**会丢掉输入栏开关的路径**：追问、划词出站、浮窗 seed。即使上一轮 globe 是开的，这些请求落到 `ChatPanel` 的 `enableSearch: false` 或浮窗的 `undefined`，zod 再收成 `false`。

### 3.2 同步阶段（`sendMessage` 返回 `true/false` 之前）

1. 空内容 / `loadingRef` → `false`。附件-only 由 ChatInput 先改成「请描述这张图片」。
2. `canSendNow`：`_hasHydrated === false` 拒；已有 session 且消息未 loaded 拒；无 session 放行。
3. `resolveRequestSettings`：模型 `ovModelId ?? settings.selectedModelId`；思考须 `enableThinking && model.thinking`；`contextMode` **只看** `options`，默认 `"full"`。sendOptions **没有** 这个字段。
4. 学年：`chatContext.academicYear ?? useAcademicYear.getState().year`。
5. 会话：`ovSessionId ?? activeSessionId`，否则 `createSession`（id = `Date.now().toString()`）。
6. 有 `quotedText` 时包成 `针对当前页面这段原文：\n\n> …\n\n${content}`。
7. 乐观写入用户消息 → `persistInlineAttachments` 把 inline `base64` 换成 `{ id: blob-… }`，`void saveBlobFromDataUrl`（**不等待**）。
8. 首条标题：本地立刻截断 + 并行 `POST /api/chat-title`（失败静默）。
9. 助手占位：`parts:[]`，metadata 带 `thinkingEnabled / searchEnabled / modelId`。
10. 预算估算：`buildRequestMessages` **不截断**；`softLimitReached = estimated/limit >= 0.8`；立刻写 `CONTEXT_WARNING`。
11. `loadingRef=true`、新建 `AbortController`、返回 `true`。网络还没发。

### 3.3 异步阶段（`executeChatRequest`）

1. `hydrateForRequest`：按消息、按附件 **串行 await** `loadBlobDataUrl`。没读到就丢掉该附件。blob 的 `setItemNow` 先从 `pendingValues` 删掉再 `await idbSet`——水合若在写入完成前 `getItem`，**本轮刚贴的图可能发不出去**。测试 mock 了水合，测不到。
2. 软上限：`maxTurns: 16`，`preserveAttachmentHistory: false`（早期带图消息不保）。否则不截断，默认保留历史附件。
3. `createStallWatchdog`：默认 **60s** 无 `touch`，**5s** 轮询 → 实际触发约 60–65s。心跳注释也能续期。
4. `DefaultChatTransport.sendMessages`：`api: '/api/chat'`，`chatId: sessionId`，`trigger: "submit-message"`。非 2xx 抛 `API 请求失败: ${status} … ${detail.slice(0,200)}`。
5. `consumeStudyStream`：SDK `readUIMessageStream` 还原 parts；抽 `data-*`；`onMessage` → 60ms 尾随节流。
6. `resolveFollowUps`：已有 `data-followup` 则不动；否则从正文抽 `<FollowUp>`；再不行用本地关键词兜底。
7. `finally`：`throttle.flush()` + `watchdog.stop()`。

IDB：流式 `updateMessage` 被 60ms 节流，盘写再被 **800ms** 尾随防抖。`pagehide` / `hidden` 立刻 flush。

### 3.4 请求字段对照

`buildChatRequestBody` 注释写明：字段须与 `chatRequestSchema` 对齐；**`messages` 由 transport 另传**。SDK 还会带上 schema **没有** 的 `id` / `trigger` / `messageId`（zod 丢掉）。

| 字段 | 客户端来源 | schema 默认 | 谁消费 |
|---|---|---|---|
| `messages` | `buildRequestMessages` 后的 `{id,role,parts}` | `[]` | `toModelMessages` / `lastUserText` / `hasFileParts` |
| `modelId` | `ovModelId ?? settings.selectedModelId` | optional | 选模型；生图模式服务端再换 |
| `model` | **客户端不发** | `flash\|pro` | 旧划词浮窗兼容 |
| `customApiGroups` | settings | `[]` | 自定义端点 / **明文 apiKey** |
| `customProvider` | 仅 groups 空且有 `customBaseUrl` | optional | groups 优先 |
| `imageModeTextModel` | settings | `"mimo-v2.5"` | 生图模式对话 LLM |
| `imageModeTextModelFallback` | settings | `"mimo-v2.5-pro"` | 整模型降级 |
| `disabledTools` | settings | `[]` | `buildStudyTools` |
| `enableThinking` | `requested && model.thinking` | `false` | `thinkingSettings` |
| `enableSearch` | `sendOptions ?? options` | `false` | 是否挂 web/imageSearch |
| `contextMode` | `options ?? "full"` | `"full"` | `getContextManager` |
| `contextTruncated` | `budget.softLimitReached` | `false` | 与服务端 80%/overflow **或** |
| `sessionContextBudgetTokens` | `budget.limit` | optional | 服务端软上限分母 |
| `clientContextTokens` | `budget.estimated` | optional | breakdown 对齐 |
| `globalContext` | settings | `""` | 拼进 system |
| `skills` | `useSkills` **全文** | `[]` | pinned 进 system，菜单挂 `useSkill` |
| `defaultImageModelId` | settings | null | **本路由不用**；生图 API 用 |

两端 UI **写死** `contextMode: "full"`。`SemanticSearchManager` 对生产 UI 是死代码。

### 3.5 与 vercel-react-best-practices 的偏差

**已对齐**：发送路径用 `getState()` 不订阅 settings；`loadingRef` 防重入；流式最新消息在闭包；ChatInput 开关 lazy init；标题 fire-and-forget；IDB 800ms 防抖；浮窗卸载切断订阅。

**关键偏差**：

| 优先级 | 规则 | 现网 |
|---|---|---|
| CRITICAL | waterfall / async-parallel | `hydrateAttachmentsForApi` 双重 `for` + `await`，附件串行 |
| CRITICAL | bundle-barrel-imports | `sendMessage.ts` 自己承认是 barrel；`useChatHistory.ts` 是 `export *` |
| CRITICAL | bundle-dynamic-imports | ChatPanel 静态 import Settings/History/Lightbox；`ai` SDK 打进客户端 |
| MEDIUM | rerender | `sendMessage` deps 是整个 `chatContext`；`handleSend` 不是 `useCallback`；60ms `updateMessage` 无 `startTransition` |
| — | 竞态 | 内存立刻改成 blob 引用、请求再从 IDB 水合 |

### 3.6 客户端双源速查

| 主题 | 源 A | 源 B | 后果 |
|---|---|---|---|
| contextMode | ChatPanel 写死 full | FloatingChatBody 写死 full | semantic 走不到 |
| 思考/搜索 | ChatInput 本地 state | ChatOptions 写死 false | 追问/outbound/seed 不带开关 |
| thinkingEffort 类型 | ChatInput 传 | ChatPanel.handleSend 类型丢掉 | 运行时靠多余属性 |
| CONTEXT_WARNING | `estimateContextBudget.ts:9` | `route.ts:24` | 逐字复制 |
| 80% 软上限 | 客户端按对话估算切 16 条 | 服务端按参考材料 token 标截断 | 两套尺子 |
| 追问 | 服务端 LLM 兜底 | 客户端正则模板 | 服务端失败时空回答套通用三问 |
| Token store | `useTokenTracker` | `useFloatingTokenTracker` | 切 activeSessionId 丢进行中 usage |
| 发送门控 | `canSendNow` | `useChatReady` | 条件近似但不完全同一 |
| 自定义供应商 | `customApiGroups` | 旧 `customProvider` | groups 优先 |

---

## 4. Harness 下半：`/api/chat` 从 POST 到 finish

文件：`app/api/chat/route.ts`（约 241 行）。`runtime = "nodejs"`，`dynamic = "force-dynamic"`，**无 `maxDuration`**。无 CORS、无鉴权。

### 4.1 逐步状态机

```
POST /api/chat
  ├─ [P0] parse body
  │     req.json() 失败 → {}（不 400）
  │     zod 失败 → HTTP 400 JSON，不进 SSE，无 FollowUp
  ├─ [P1] modelId = body.modelId ?? (pro→ENV_MODEL_PRO / flash→ENV_MODEL_FLASH)
  ├─ [P2] 生图换模：type==="image" → effectiveModelId = imageModeTextModel
  ├─ [P3] getIndexHealth() 动态 import，失败吞掉
  └─ [P4] createUIMessageStream → 200 SSE（withSseHeartbeat）
        ├─ resolveLanguageModel(effectiveModelId)；生图时 fallbackModelIds
        ├─ [B1] !provider.configured → writeTextPart「AI 暂未配置」→ return
        │     ※ provider 永远是 PRIMARY；主文本未配时，即使 fallback 已配也走 B1
        ├─ [B2] hasFileParts && !vision && !isCustom → throw → error chunk
        │     ※ 视觉闸门看 effectiveModelId；自定义整段跳过
        ├─ [B3] 组上下文 + createStudyAgent + agent.stream
        ├─ [B4] 手动 for-await toUIMessageStream
        │     chunk === error|abort → generationAbort.abort(); return
        ├─ [B5] generationSignal.aborted → return
        ├─ [B6] 成功：finalText 非空 AND 无 <FollowUp> → generateFallbackFollowUps
        └─ [B7] breakdown → 可选 usage → metadata → finish
```

**FollowUp 会不会跑**

| 分支 | FollowUp | finish |
|---|---|---|
| 未配置 | 否 | 无 |
| 视觉拦截 throw | 否 | 无 |
| 流内 error / abort | 否 | 无 |
| 流转完后 aborted | 否 | 无 |
| 成功且正文已有 `<FollowUp>` | 否（不再兜底） | 有 |
| 成功、`finalText` 为空 | 否 | 有 |
| 成功、无标签 | 是（0～1 次） | 有 |
| FollowUp 自己失败 / 超时 / abort | 不写 `data-followup` | **仍有** |

空标签 `<FollowUp></FollowUp>` 也算「已输出」，不兜底。标签内容服务端不解析成 `data-followup`——留给客户端从正文抽。

### 4.2 为何不用 `writer.merge`

SDK `merge` 是 fire-and-forget，不返回可 await 的完成点。若 merge 且默认 `sendFinish: true`：Agent 流会先吐自己的 `finish`；路由再写的 followup / breakdown / usage 会和子流竞态。因此必须：`for await` + `sendFinish: false` + 自己写 data + 自己写 `finish`。注释在 `route.ts:175`。这是 `docs/plans/13-agent-sdk-known-issues.md` 已修的计费 bug 的现网形态。

### 4.3 成功尾包顺序（不变量）

正文 / reasoning / tool parts → 可选 `data-followup` → `data-context-breakdown`（必有）→ 可选 `data-usage`（任一侧 >0）→ `message-metadata`（usage + `durationMs` + **用户选中** `modelId`）→ **唯一** `{ type: "finish" }`。

`chat-sdk.test.ts` 钉死：followup 在最后一个 `text-end` 之后、`finish` 之前；`finish` 恰好 1 次。

### 4.4 生图如何换 `effectiveModelId`

```
isImageMode = selectedModelInfo?.type === "image"
effectiveModelId = isImageMode ? body.imageModeTextModel : modelId
```

| 角色 | 值 |
|---|---|
| 用户菜单选中 | `modelId`（生图模型 id） |
| 对话 LLM | `imageModeTextModel`（默认 `mimo-v2.5`） |
| 整模型降级 | `imageModeTextModelFallback`（默认 `mimo-v2.5-pro`） |
| 工具卡片 / metadata | 用户选中的生图 id |

客户端 `resolveRequestSettings.effectiveModelId` **不会**换成文本模型。换模只发生在服务端。`defaultImageModelId` 在 schema 里有，**本路由不用**。

### 4.5 `toModelMessages` 三层剥离

1. **客户端** `toRequestMessage`（`buildRequestMessages.ts:26-29`）：只留 trim 非空 `text` 与 `file`；丢掉 reasoning / tool-* / data / step-start。
2. **服务端** `toModelMessages`（`route.ts:49-57`）：再滤 `text|file`，`convertToModelMessages(..., { ignoreIncompleteToolCalls: true })`。不过滤空 text。
3. **SDK**：本可以还原 tool/reasoning；本路由在调用前已剥光。

后果（刻意）：跨用户轮次工具记忆为 0。`loadedContextKeys` 每请求 `createToolRuntime()` 新建。Anthropic thinking signature 只在 **同一次** Agent 循环的 step 之间回传。

### 4.6 `createStudyAgent` 每一字段

每次请求 `new ToolLoopAgent`（工具闭包抓本次 ctx）。

| 字段 | 值 | 效果 |
|---|---|---|
| `id` | `"study-tutor"` | UA `ai-sdk-agent/tool-loop` |
| `instructions` | **一条** system | 硅基 Qwen3 拒第二条 system（`studyAgent.ts:103-104`） |
| `tools` | `modelSupportsTools ? buildStudyTools : {}` | `supportsTools = info?.tools !== false` |
| `stopWhen` | `isStepCount(6)` | 见 §2 |
| `maxRetries` | `0` | 覆盖 SDK 默认 2 |
| `temperature` | `input.temperature ?? 0.6` | 路由不传 → 恒 0.6 |
| `prepareStep` | 见下表 | 每步 LLM 前 |
| `providerOptions` | 仅思考开启时 | 不进 instructions |
| `maxOutputTokens` | 仅 Anthropic 思考路径 | `max(16000, budget+4096)` |

### 4.7 `prepareStep` 真值表

`stepNumber` **从 0**。

| # | 空 tools | 生图且有 generateImage | stepNumber | 搜图≥20 | 发给模型 | toolChoice |
|---|---|---|---|---|---|---|
| 1 | T | * | * | * | 外层（空） | auto |
| 2 | F | T | 0 | 短路 | 仅 generateImage | 强制该工具 |
| 3 | F | T | ≥1 | 短路 | **空数组** | `"none"` |
| 4 | F | F | * | T | 去掉 imageSearch | auto |
| 5 | F | F | * | F | `{}` = 全量 | auto |

SDK：`activeTools: []` 是零工具，不是「用外层全集」。`{}` 才回退外层。

生图优先于搜图配额。`isImageMode` 但用户 disable 了 `generateImage`：instructions 仍要求调用一个不存在的工具。

`imageSearchFetchedCount` 在 **execute 后**才涨，`prepareStep` 在 **下一步** LLM 前跑。同一步并行多次 `imageSearch` 可超过 20。

### 4.8 工具挂载顺序

`buildStudyTools`（`server.ts:44-87`）固定顺序（**≠** `STUDY_TOOL_NAMES`）：

`getCurrentPage → getOutline → getSection → searchNotes → searchNoteImages → renderInteractive → drawDiagram → generateImage → createQuiz → writeDocument`

然后：`enableSearch` → `webSearch, imageSearch`；有未 pin 技能名 → `useSkill`；再减 `disabledTools`。

工厂里 **总是创建** 全部 13 个（含 web/image/useSkill），暴露名单是另一套。

eslint：`components/**`、`lib/hooks/**` 不得 import `tool.ts` / `server.ts`。`lib/**` 不得 import `components/**`。

### 4.9 心跳

`withSseHeartbeat`（`heartbeat.ts:7-45`）：首 chunk 前每 15s 写 `: heartbeat\n\n`。SDK 解析器忽略注释，客户端字节层 `onActivity()` 能续 stall watchdog。首 chunk 后停。

响应头：`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no`。

---

## 5. 上下文工程

### 5.1 注入层清单（一次请求实际进入模型的层）

| # | 层 | 装配点 | 稳定？ | 变因 |
|---|---|---|---|---|
| 1 | `global.md` | `buildSystemPrompt` 37 | 同学期学科下稳 | `{subjectName}`；prod 文件缓存 |
| 2 | `subjects/*.md` | 38–40 | 同学稳 | 无文件则空 |
| 3 | 生图规则 | `studyAgent.ts` 83 | 模式内稳 | `isImageMode` |
| 4 | 用户全局上下文 | 84 | 设置不变则稳 | 设置编辑 |
| 5 | pinned 技能全文 | 85 | 技能集不变则稳 | `createdAt`/`id` 排序 |
| 6 | 技能菜单 | 86–89 | 同上 | `useSkill` enum 随菜单变 |
| 7 | 工具 schema | `buildStudyTools` | 开关不变则稳 | search / disabled / 技能 |
| 8 | 定位行 | `buildLocationLine` 44–47 | **换页即变** | subject/cat/item/topic |
| 9 | 参考：扁平树 | `buildTreeSummary` | 进程内内容不变 | 仅 Full；与 getOutline 不同构 |
| 10 | 参考：当前页全文 | `readContentMarkdown` | 同页稳 | Full+Semantic |
| 11 | 参考：semantic top5 | `hybridSearch` | **每问都变** | 现网不走 |
| 12 | 参考：`用户提问：` | Manager 59/80 | **每轮都变** | 截断后去掉 |
| 13 | 截断说明 | `studyAgent.ts` 97–98 | 截断后相对稳 | 替代 9–12 |
| 14 | 对话历史 | `toModelMessages` | 递增 | 80% 后 16 条硬窗 |
| 15 | 本轮 tool I/O | agent loop | 每步变 | `contextKey` 仅本请求去重 |
| 16 | usage / breakdown | data parts | 不进模型 | 只给 UI |

1–7 = 注释中的「稳定前缀」。8–13 被塞进 **同一条 system**，所以前缀 cache 最多保到「用户提问：」之前。

`prompts/index.ts:1-3` 仍写「易变由 route 放在前缀**之后的消息**里」——**与现网不符**。`studyAgent.ts:5` 写「多轮间稳定」——**假**：参考含本轮提问，每轮 system 都变。

### 5.2 Full vs semantic

产品 UI **写死 `full`**。设置里没有 `contextMode` 开关。

**Full**（`fullContext.ts`）：

- `## 课程目录` + 全树标题摘要（模块级 `_treeSummaryCache`）
- `## 当前内容：title` + `readContentMarkdown`
- `\n\n用户提问：` + `userMessage`
- **忽略** `academicYear`；含 `other`；不展开 `children`；不看 `isSearchable`
- 单槽 `_contextCache` 只驱动 UI `cacheHit`，**不是**上游 prefix cache；并发下后请求覆盖前请求会误报

**Semantic**（`semanticSearch.ts`）：

- 当前页全文 + `hybridSearch(userMessage, { topK: 5, academicYear, preferSubjectId })`
- **无目录树**；`cacheHit: false` 写死；失败吞掉
- **无** searchNotes 那种「学年 0 命中自动 all」
- **无** `queryContext` 短查询扩展

`hybridSearch` 生产调用点只有两处：SemanticSearchManager（现网走不到）与 `searchNotes` → `searchAllContent`（现网主路径）。

### 5.3 80% 软上限：两套判定，分子不同

同一阈值 `>= 0.8`，**不是同一套 token**。

| | 客户端 | 服务端 |
|---|---|---|
| 分子 | 会话对话估算，或上次 breakdown + 新问题 | `buildContext` 的 tree/页/检索 + 用户提问 |
| 分母 | 锁定的会话预算（`getModelInfoWithCustom`，**含自定义 contextK**） | `sessionContextBudgetTokens ?? ctxResult.maxTokens` |
| 动作 | 历史改为最近 16 条，丢附件历史 | **不砍 history**；省略参考材料并写策略句 |
| 合成 | `body.contextTruncated` | `clientFlag ∨ serverSoft ∨ overflow` |

长对话 100k/128k 时：客户端会截历史；服务端 `tokenCount` 可能只有数 k～十几 k，**单独算永远到不了 80%**。服务端截参考材料，主要靠 **客户端 flag**。

`createStudyAgent` 截断时 **仍算** `buildContext`（白算 I/O），但不把 `referenceContext` 写入 system。

看板环颜色（`TokenDashboard.tsx:156-159`）：`>0.7` 红、`>0.4` 黄，**不是 80%**。70%–80%：环已红，但仍发全量历史。主面板横幅才是 80%；浮窗无横幅。输入不禁用。

### 5.4 `getMaxTokens` 忽略自定义 `contextK`

`getMaxTokens`（`lib/context/types.ts:28-32`）只调 `getModelInfo`（内置表）。自定义 id 不在 `MODELS` → **恒 128_000**。`getModelInfoWithCustom` 才读 `c.contextK ?? 128`，context manager **不用它**。

自定义 32k 时：客户端按 32k 截对话；服务端 `overflow` 仍用 128k。软上限分母优先 `sessionContextBudgetTokens`（通常对）；**硬 overflow 与 `ctxResult.maxTokens` 仍错**。

会话锁定额：第一次发送锁死窗口，之后换 1M 模型分母仍是旧值。`lastBreakdownTotal` 只写不读。

### 5.5 `estimateTokens` 启发式

```
CJK 基本区（> 0x4DFF && < 0x9FFF）→ 2
拉丁字母 → 0.325
空白 → 0.2
其他（数字、ASCII 标点、emoji、全角标点、Ext A）→ 1
```

`0x9FFF` **排除**；Ext A `0x3400–0x4DBF` 当「其他」= 1。无 tiktoken、不按模型分词。`+3000` 是系统+工具虚报，无标定。

### 5.6 `contextBreakdown` 分类偏差

```
useSkill → skills
webSearch / imageSearch → webSearch
getCurrentPage / getSection / searchNotes → pages
其余 → conversation
```

**错分进 conversation**：`getOutline`、`searchNoteImages`。按 `ContextBreakdown.pages` 注释（「读页/检索类」），这两项应进 `pages`。

额外偏差：

1. 用户提问双计：未截断时 `volatile` 含 `用户提问：`（进 pages），history 又有同一条 user（进 conversation）。
2. 所有 tool **call input**、step 正文、reasoning 一律进 conversation。
3. `tools` 桶 UI 叫「系统提示词」，不含 pinned/menu（在 skills）、不含 volatile。
4. `toolDefsTokens` 依赖 `inputSchema.jsonSchema`；没有则每工具只 +20。
5. `clientContextTokens > total` 时差额垫进 conversation。

### 5.7 重复注入矩阵

| 内容 | system 参考 | user 消息 | 工具结果 | breakdown 双计 |
|---|---|---|---|---|
| 本轮提问 | ● `用户提问：` | ● role=user | — | pages + conversation |
| 划词原文 | 随提问进参考 | ● blockquote | — | 同上 |
| 当前页全文 | ● Full/Semantic | — | ● `getCurrentPage`（key 看不到 system） | pages + pages |
| 同页再 `getSection` | ● 已有全文 | — | ● 另一 key `section:` | pages + pages |
| 扁平目录 | ● Full only | — | — | pages |
| 层级大纲 | — | — | ● `getOutline` | **conversation**（错桶） |
| semantic 5 条 | ●（现网无） | — | ● `searchNotes` | pages+pages |
| 笔记图 | — | — | ● `searchNoteImages` | conversation |
| pinned 技能 | ● extras 全文 | — | ● `useSkill` 再灌 | skills + skills |

`dedupeByContextKey` **不**对 system 参考建索引。不同工具前缀不同（`page:` / `outline:` / `section:` / `search:` / `note-img:` / `skill:`），同一页用 `getCurrentPage` 再 `getSection` **不会互斥**。

### 5.8 Prefix cache vs「一条 system」

意图：稳定前缀逐字节不变 → 上游 prefix cache；硅基 Qwen3 拒第二条 system → 必须拼成一条。

张力：

1. 前缀匹配型 cache（DeepSeek/MiMo `cachedInput`）：1–7 层在同页连问时仍可命中，只有「用户提问：」之后 miss。
2. 整条 system 当 cache key：提问在 system 里 → 每轮整段 system 作废。
3. Full 把整棵扁平树 + 整页放进这条 system：换页则从定位行起整段 bust。
4. `_contextCache.cacheHit` 是单槽 MD5 展示位，与上游 cache **无关**。看板 `CacheCountdown` 是 TTL 估算，真实命中看 usage `cachedTokens`。
5. 工具集随 `enableSearch` / `disabledTools` / 技能 enum 变 → schema 前缀也会 bust。

---

## 6. 十三工具逐项

回灌模型的唯一通道是 `toModelOutput → toText(output.text)`。`artifactId` / `documentId` / `imageGenId` / `questions` / `hits` / `sources` 等字段只进 UI part。

`dedupeByContextKey`：无 key → 原样；Set 已有 → `deduped: true`，text 改成「【上下文已加载】…」，**其余字段原样保留给 UI**；否则 `Set.add`。范围是**本次请求**，不是跨轮。

`IMAGE_SEARCH_MAX_TOTAL = 20` 同文件。

### 6.1 读取 / 检索 / 技能

| | 模型 text | UI 专有 | contextKey | 缺参/失败 | 学年 | 参考材料重叠 |
|---|---|---|---|---|---|---|
| getCurrentPage | `【面包屑】`+全文或占位 | 无卡 | 总有 `page:s/c/i` | 占位，不去「未找到」 | 无 | **当前页全文** |
| getOutline | 大纲树 + path | 无卡 | 总有 `outline:year\|all` | 空串 | 默认当前，`crossYear`→all | 与 full 目录摘要粗重叠 |
| getSection | 全文 / 未找到 / 缺参 | `title, found` | 有 input 才有 `section:…` | 缺参无 key；无效路径仍去重 | **不过滤** | 当前页会与参考材料+getCurrentPage 三重叠 |
| searchNotes | 最多 8 段 + 提示 | `hits[0..5]`, diagnostics | 仅有命中 `search:query` | 索引未加载 / 无命中，无 key | 默认当前；0 命中自动 all | semantic 预检索同管道 |
| searchNoteImages | `::figure` 列表或未找到 | `images[]` | 几乎总有 `note-img:query` | 空数组仍去重 | 默认当前，**不**自动 widen | 无 |
| useSkill | 技能全文或未找到 | `skill, found` | 仅找到 `skill:id` | 无 key | 无 | 无；pinned 在 system |

**getCurrentPage**：`z.object({})`，定位完全来自请求 ctx。无 md 仍有 contextKey。设置文案「读取当前页」。未截断时与参考材料高度重复——软上限后才是补回当前页的主路径。

**getOutline**：描述列出全部有课学期，默认执行仍只返回当前学年。不能按科裁大纲。空学期 → 空串仍占去重槽。设置文案说「全部」，实际默认当前学年。跳过 `other`；只输出 `hasCapability(cat, "search")`。

**getSection**：`path` 优先（`科目/分类/内容id`，≥3 段时 `rest.join("/")` 作 itemId）；否则 `sectionId` 落到 `fallbackSubjectId` + **`detail`**。textbook / recording **不能**靠 `sectionId` 读。路径无效与正文未生成都会 occupy 同一 contextKey。学年不过滤——path 指向大一页、UI 在大二，仍可读。

**searchNotes**：先 `getIndexHealth()`，失败立刻「检索索引未加载」，不是「未检索到」。`limit: 8`，hybrid `topK=24`，UI hits 切前 5，text 仍含最多 8。`contextKey` **不含 year / subjectId**——同一 query 换范围会被去重，模型只见「已加载」，UI hits 仍是第二次的。`preferSubjectId`：未传 `subjectId` 时内部设为 `ctx.subjectId`；本科目 ≥3 条则停，否则放开学年内全科。

**searchNoteImages**：纯内存图索引（`![alt](src)` + `::figure`，只收站内 `/images/...`）。打分：caption 3 / alt 2.5 / heading 1.5 / context 1 / title 0.8；`MIN_SCORE = 1.2`；`preferSubjectId` ×1.15。无索引体检、无自动跨学年、空结果仍设 contextKey。breakdown **未**把本工具算进 `pages`。

**useSkill**：`name` 是运行时 enum（未 pin 技能名）；有菜单才暴露工具。pinned 每轮强制注入全文，不进菜单。execute 仍在**全部** `ctx.skills` 里找（含 pinned）。`toggleable: false`。最多 20 个（仅 UI）；服务端无条数上限。

### 6.2 生成 / 副作用

| 工具 | 主循环 execute | 占主循环 LLM | 前端第二条 HTTP | 进度写回聊天 part？ | 回灌模型 |
|---|---|---|---|---|---|
| renderInteractive | 点火 | 1 | 流式中 `POST /api/artifact` | 否，只写 artifacts store | 「已开始…继续讲解」 |
| writeDocument | 校验+点火 | 1（失败重调再 +1） | 流式中 1+N 次 `POST /api/document` | 否，只写 documents store | 「任务卡片…」或校验失败 |
| generateImage | 点火 | 1 | **批准后** `POST /api/image-gen` | 否，只写 image-gen store | 「等待批准…」 |
| drawDiagram | 生成指南 | **2 才有图** | 无 | 图在 answer text | **整份指南** |
| createQuiz | 归一化参数 | 1（全丢重调 +1） | 无 | 题目在 part.output | 成功摘要 / 失败请重调 |

**renderInteractive**：`artifactId = art_${toolCallId}`。`autoStart={!!isStreaming}`；`startedRef` 保证只发一次；**cleanup 不 abort**（StrictMode 会掐死首请求）。历史消息 `autoStart=false`。生图模式写 `unsupportedReason`。思考模型若把 HTML 写进 reasoning：`artifact.ts` 会从 text / reasoning / 拼接里捞。

**writeDocument**：`validateDocumentSpec` 过了才给 `modelId`。3 节大纲 = **4 次 fetch**，请求**不带** `AbortSignal`。`create()` 用 `spec.outline` 预置 3 个 `pending` → 大纲还没回来时进度就是 `0 / 3 节`。0/N 卡死已在 `DocumentCard` 修过（cleanup 不 abort），**真机按钮未点过**。文体漂移未修：`buildOutlinePrompt` 不约束各节 `brief` 文体；`previousTail` 1200 字会把散文腔带下去；节过短不重试。校验失败的 `unsupportedReason` 只挡 JSX，挡不住 effect。导出 Word/PDF 是 TODO，文案仍写「可导出」。

**generateImage**：不是 AI SDK `needsApproval`。主循环立刻 `output-available` 并继续。用户取消只是卡片本地 `cancelled`，不写 store、不改 part。刷新后批准卡会回来。模型在用户点批准**之前**就已经继续讲了。

**drawDiagram**：纯模板，无 LLM、无 HTTP。`molecule` 整段注入 `CHEM_DRAW_GUIDE`（极长）。无 ResultCard。第 6 步调它 = 指南已回灌、没有第 7 次 LLM → 用户可能只有 Trace、没有图。

**createQuiz**：题目在**同一次 LLM 的 tool-call 参数**里已经写好。`normalizeQuiz` 最多 12 题，非法题丢掉。成功 text 含题干前 60 字，但禁止正文复述。作答只在组件 state，刷新清空。全丢无卡，只靠模型再调。`/api/quiz` 是读章节静态题库的 GET，与本工具无关。

第 6 步仍是 tool-calls 时：三条旁路 + createQuiz 的卡片/题目仍在；drawDiagram 多半没图；旁路三条的「请用一两句话说明…」不会被执行；UI 不知道是步数触顶。

下一轮用户再说话：工具结果、文档进度、生图成败、测验作答全部消失；模型只看见当时那句讲解正文。

### 6.3 联网

**两道闸**：输入栏 globe 决定「本请求是否把联网工具放进名单」；设置里的 `disabledTools` 再按名剔除。`imageSearch` 没有独立设置开关（`toggleable: false`），跟着 globe 走。

设置里关掉「联网搜索」且 globe 开着 → 名单里只剩 `imageSearch`。

**webSearch = 智谱 Web Search，不是 Bocha**。URL 写死 `https://open.bigmodel.cn/api/paas/v4/web_search`，**不用** `ZHIPU_BASE_URL`。内存 LRU，TTL 10 分钟，最多 100 条。无 key → 模型看到「联网搜索未配置…明确说明未能联网」；无用户卡片。`presentation.ts` 仍写 Bocha。

**imageSearch = Unsplash，不是智谱**。无 key / HTTP 失败 / 异常 → 一律 `[]` → 「未找到图片」。**.env.example 说的 Demo 模式是假的**。`enhanceQueryForEducation` 追加 ` diagram illustration`。`trackPhotoDownload` fire-and-forget。无 ResultCard；流结束后才出画廊。不进底部「来源 · N」条。

**配额裂缝**：文案写「本次对话上限 20」，实现是 **单次请求 runtime**。下一轮 `createToolRuntime()` 清零。历史分析把「跨轮累计」写成已实现——现网没有。同一步并行多次可超过 20。去重发生在抓取**之后**：同请求重复 query 仍会打 Unsplash 并累加计数。

纪律只在 prompt / 工具描述里，**没有**服务端强制「先教材、后外网」。开关关掉后，system 仍在教模型用这两个工具。

---

## 7. 混合检索 / RAG

**共用同一 `hybridSearch`，不共用包装。**

| | `searchNotes` | `SemanticSearchManager` |
|---|---|---|
| 是否调 hybridSearch | 是，经 `searchAllContent` | 是，直接 import |
| health 门禁 | 有 | 无 |
| `queryContext` 短查询扩展 | 有（当前页标题） | **无** |
| 学年放宽 | 有（当前学年空 → `all`） | **无** |
| 子串兜底 | 生产关、开发开 | 无；失败 catch |
| topK | 24 再截 8；hits 再截 5 | 直接 5 |
| 默认是否启用 | 是 | 否（UI 锁 full） |

### 7.1 检索参数

模式：`AI_SEARCH_MODE` = `hybrid`（默认）/ `vector` / `keyword`。桌面写死 hybrid。

| 层 | 参数 |
|---|---|
| 查询预处理 | `normalizeSearchQuery` 剥「请/讲讲/什么是」；≤2 汉字且有页标题 → 向量侧拼 `"${pageTitle} ${q}"` |
| BM25 | 中文单字 + bigram；标题重复两次入倒排；k1=1.5，b=0.75；召回 40；posting 时 `chunkInScope` 硬滤 |
| 向量 | 默认 `BAAI/bge-m3`；余弦 + size-K 最小堆；召回 40；查询维 ≠ 索引维则跳过；嵌入失败记 error，BM25 可继续 |
| RRF | k=60；按 chunk id 累加；合并后取前 40 进 rerank。**已删除** plan 15 的 `×1.12` |
| Rerank | `BAAI/bge-reranker-v2-m3`；文档 = `shortTitle + text`；`top_n = max(topK, 8)`；SF 失败再试智谱；再失败按 RRF 截 topK |
| 输出 | snippet 400 字；按 path 去重 |

`preferSubjectId`：两阶段，不是 ×1.12。先升格为硬 `subjectId` 搜一轮；命中 ≥3 就用；否则放开科目只保留学年。`chunkInScope` 里 prefer **完全不生效**（注释仍写「RRF 后轻微提升」）。

### 7.2 索引生命周期

五件套：`bm25.json` · `chunks-meta.json` · `vectors.bin` · `vectors.ids.json` · `manifest.json`。`pnpm build-index`。运行时 **不再从 COS 下载**。standalone **包含** `content/**`（plan 15 说的排除 `.index` 已改掉）。

Health：五文件齐全、`manifest.version === 2`、向量字节对齐、环境嵌入模型一致。`contentHash` 不匹配只 warn，`ok` 仍为 true。`embeddingReachable` 恒为 `null`。触发：`instrumentation.ts`、每次 `/api/chat`、`searchNotes` 执行前、`GET /api/health/search`。

空索引分层：

- 五件套缺失 → searchNotes「检索索引未加载」，模型仍可 `getOutline` / `getSection` / `getCurrentPage`
- health 通过但 0 命中 → 学年放宽再搜 all，仍空才「未检索到」
- SemanticSearchManager 无 health：两路都没有 → 只剩当前页全文，用户无提示

### 7.3 chunk 粒度

`MAX_CHUNK_TOKENS = 400`；`MIN_SPLIT_TOKENS = 100`；`TARGET_CHUNK_TOKENS = 300` **未使用**。跳过 `other`、无 search 能力、stub、toc。考前模拟 / 实战演练不入索引。

两条 chunk：正文块 `path#0…` + 标题向量块 `path#title`（`chunkIndex = -1`）。`contextPrefix` 是整页共享：`[科目/分类] 全标题 | 首页第一段前 120 字`。嵌入输入 `contextPrefix + '\n' + text`。`chunks-meta` 不存 prefix。

`getSection` **不读索引**：按 path 读磁盘 `.md` 原文。path 与 chunk path 同形，不含 `#chunkIndex`。约定：片段不够必须再调 getSection。上限 `MAX_TOOL_STEPS = 6`，典型是 searchNotes → 1–2 个 getSection。

plan 15（2026-09-08）记录的是改之前的根因。当前已落地：COS 运行时回退已删、标题入 BM25、rerank 看标题、prefer 两阶段、学年自动 all、空索引文案分开、health 端点。

---

## 8. 提示词与文本协议

### 8.1 system 字节顺序

见 §5.1。工具 schema **不进**这段文本，走 SDK 原生 function calling。

学科文件：registry **没有任何条目填 `promptFile`**。有 md 的 8 科：probability / physics / chemistry / anatomy / biochemistry / cell-biology / histology / instrumental-analysis。无 md（只用 global）：modern-history / maogai / other / medical-english / medical-statistics / cell-biology-lab。`cell-biology.md` **不会**自动给 `cell-biology-lab` 用。

人文两科内容 SOP 指令最密（`:::timeline/memory/compare`），AI 学科段却是空的。学科文件教了 global 没列的指令（`:::compare` / `:::timeline` / `:::memory` / `:::keypoint`），渲染器有、主 prompt 无。

`global.md` 瑕疵：L37/L40/L41 工具列表写成 `|-`；L30 学年科目写死且漏仪分 / 医学英语 / 医学统计 / 细胞实验。`getOutline` description 反而动态从 registry 拼，比 global 准。

### 8.2 FollowUp 四层协议

```
模型正文 <FollowUp>          ──parseChatContent──► followUps[]
        │ 若 finalText 匹配不到闭合标签
        ▼
route.ts  generateFallbackFollowUps（| 分隔，15 字，10s）──SSE data-followup──►
        │ 若仍为空
        ▼
resolveFollowUps：已有则不动 → 抽正文标签 → fallbackQuestions 正则
        ▼
ChatMessage 底部渲染；流式期间不展示
```

服务端判断极粗：`/<FollowUp>[\s\S]*?<\/FollowUp>/i`。模型写了标签但内容是「1. … 2. …」换行、无 `|` → **不会走 LLM 兜底**，前端整段当 1 题。

`/api/follow-ups` 路由自己写 JSON 数组 prompt（28 字、temp 0.8、只用 FLASH），**与** `generateFallbackFollowUps`（`|` 分隔、15 字、temp 0.5、自定义可复用）**互不兼容**。文件头声称共用。前端 **没有** `fetch('/api/follow-ups')`。

### 8.3 正文 DSL 谁生产、谁消费

三条管道：正则（FollowUp / think / 未闭合尾巴）→ `parseXmlTags`（白名单可视化标签）→ 剩余 markdown（remark-directive + rehype-raw）。

| 协议 | 失败兜底 |
|---|---|
| `<FollowUp>` | 四层，见上 |
| `<think>` | 流式进思考面板；`MessageContent` **不传** `streaming`，默认按流式剥未闭合 |
| `<SvgDiagram>` | 未闭合剥尾巴；裸 `<svg>` → sanitizeSvg；非法 mode → raw |
| `<InteractiveVenn>` | **协议对不上**：prompt 写 `集合A\|集合B\|交集` 子节点；渲染器只用 props `a/b/ab`。`childrenText` 完全丢弃。按 prompt 写 → 永远默认 0.6/0.5/0.2 |
| `::plot` | 无 fn → null；LaTeX `\frac` → 诊断「不接受 LaTeX」 |
| `::figure` | 无 src → null；加载失败 ImageOff |
| `:::definition` 等 | 未知 kind 回退 note |
| `<details>` 出题 | **没有专用解析器**；不会变成 Quiz 卡片 |
| 未知 PascalCase | 转义成文本；不在 VIZ 集 → 虚线框「不可用」 |

笔记 **不走** `parseXmlTags`。同一段 `<SvgDiagram>` 在聊天是画布，在笔记是未知 HTML。

`ToolCall` / `Answer` / `Thinking` 仍在解析白名单，但已不在 global 教学范围。`<think>` 才是现行思考混排协议。

### 8.4 与 tool_calls 的职责划分

| 意图 | 走 tool_calls | 走正文 DSL |
|---|---|---|
| 读教材 | getCurrentPage / getOutline / getSection / searchNotes | 禁止凭记忆 |
| 引用已有插图 | searchNoteImages 取路径 | 模型写 `::figure` |
| 函数曲线 | **无工具** | `::plot` / `:::canvas` / `SvgDiagram mode="math"`（三套同构） |
| 示意图 / 分子 | drawDiagram **只出指南** | 下一轮 `<SvgDiagram>` |
| 重交互 | renderInteractive 预约 | 不要在聊天里写整页 HTML |
| 出题 | **createQuiz 主路径** | `<details>` 仅 fallback，无代码转换 |
| 追问 | **不是工具** | `<FollowUp>` + SSE + 前端规则 |
| 技能 | useSkill | pinned 已在 system |

重叠最危险的三处：画函数四套表面语法；出题卡片 vs details；FollowUp 三套生产者。

独立提示词通道（不拼 global）：Artifact HTML、画布修订 JSON、长文档 outline/section、FollowUp 兜底、划词成卡 `===FRONT===`、会话标题。

---

## 9. 模型接入层

对话主链：`resolveProvider` → `buildBaseModel` → `createFailoverLanguageModel` → `ToolLoopAgent` / `streamText`。旁路（生图、向量、联网搜索、标题）各自走另一套凭证，**不共用对话 failover**。

### 9.1 协议矩阵

| 层 | 取值 | 请求路径 | 思考装配 | 谁能用 |
|---|---|---|---|---|
| `apiProtocol` | `openai`（默认） | `@ai-sdk/openai-compatible` `/chat/completions` | `openai-reasoning-effort` | 全部内置 + 自定义默认 |
| | `siliconflow` | 同上 SDK | `enable_thinking` + `thinking_budget` | 仅自定义 |
| | `anthropic` | `@ai-sdk/anthropic` `/v1/messages` | `anthropic-thinking` | 仅自定义 |
| 生图 | `openai` / `siliconflow` | `POST {base}/images/generations` | 无 | 内置生图固定 SF |
| Embedding | SF → 智谱 | `/embeddings` | — | 检索，非对话 |
| Rerank | SF → 智谱 | `/rerank` | — | 混合检索 |
| 联网搜索 | 智谱专用 | 写死官网 `web_search` | — | webSearch 工具 |

**内置对话的 `apiProtocol` 恒为 `openai`**。硅基流动方言只出现在自定义，或内置 MiMo 的 `thinkingRequestStyle: "siliconflow"`（协议仍是 openai-compatible）。

URL 归一化裂缝：`normalizeOpenAIBaseUrl` **只作用于 `RELAY_BASE`**。自定义分组的 `baseUrl` **只 trim，不补 `/v1`**。Electron 测试连通会自己补 `/v1`，与运行时不一致。Anthropic 会补 `/v1`。

环境凭证在**模块加载时读一次**，改 env 必须重启进程。

`ProviderKind`（凭证桶，不是 HTTP 协议）：`siliconflow` | `mimo` | `zhipu` | `relay`。**MODELS 里没有任何对话端点用 zhipu**——智谱只做搜索 / embedding 容灾 / rerank 容灾。硅基流动对话模型已清空，只留生图；`AI_BASE_URL/KEY` 仍给 embedding、rerank、生图。

### 9.2 内置模型要点

`DEFAULT_MODEL_ID = "z-ai/glm-5.3-flash"`。网页菜单隐藏 `custom-openai`。

| registry id | 上游 | 思考 | 方言 | tools | vision | ctx | timeout |
|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | **① relay ② mimo-v2.5** | **不可关**；medium→high | openai-effort | ✓ | ✓ | 1M | 120s |
| `Qwen/Qwen3.8-27B` | relay | 可关；high/max→xhigh | openai-effort | ✓ | ✓ | 256K | 120s |
| `google/gemini-3.7-flash` | relay | 不可关；max→high | openai-effort | ✓ | ✓ | 1M | 120s |
| `deepseek/deepseek-v4-flash` | relay | 可关；max→high | openai-effort | ✓ | **无** | 1M | 45s |
| `mimo-v2.5` / `mimo-v2.5-pro` | mimo | 可关 | **siliconflow** | ✓ | 仅 flash 有 | 1M | 45s |
| `Tongyi-MAI/Z-Image-Turbo` | SF | 关 | — | ✗ | — | 0 | 45s |
| `custom-openai` | relay / `RELAY_MODEL_ID` | 可关 | openai-effort | ✓ | ✓ | 128K | 45s |

今天真正有第二跳的只有 **GLM-5.3 Flash：relay → mimo-v2.5**。自定义 / 自由中转 / 其余内置都是单候选。

自定义 id：`custom:${encodeURIComponent(groupId)}:${encodeURIComponent(modelId)}`。`customModelToInfo.endpoints` 写死 `{ provider: siliconflow }`——这是菜单/计费用的假端点。**自定义没有 endpoints 链 failover**。`timeoutMs` 固定 45s。

### 9.3 Failover 状态机

`shouldFailover` 全为真才切：不是最后一个候选 + 用户未 abort +（内部首字节超时 **或** 可恢复错误）。

可恢复：HTTP 502/503/504；HTTP 400 且 code ∈ `{1211, 20012, 1210}`；`fetch failed|ECONNRESET|ENOTFOUND|ECONNREFUSED`；本包装器首字节超时。

不可恢复：401/403/429/404/其它 4xx；用户取消；**已经吐出非 error 的首 chunk**（避免两段回答拼在一起）；链耗尽。

单候选且传入 `firstChunkTimeoutMs` 时仍包一层——超时后没有下一跳，等于只多一次 Timeout abort。切换时写 transient `data-info`。

对话外另一套：Embedding SF 失败 → 智谱（**查询向量禁止静默降级**，维度不同）；Rerank SF → 智谱；追问兜底内置改 flash。

### 9.4 思考方言

UI 档位：`low | medium | high | max`。预算（siliconflow / anthropic）：2000 / 8000 / 16000 / 32000。

| `thinkingRequestStyle` | 实际下发（`buildThinkingSettings`） |
|---|---|
| `none` | `{}` |
| `openai-reasoning-effort` | `providerOptions.upstream.reasoningEffort = wireThinkingEffort(...)`（可出现 `max` / `xhigh`） |
| `openrouter-reasoning` | `upstream.reasoning.effort` |
| `anthropic-thinking` + 原生 | `{ type:"enabled", budgetTokens }` + 抬高 maxOutputTokens |
| `anthropic-thinking` + 中转 | `upstream.thinking.budget_tokens` |
| `siliconflow`（default） | `enable_thinking=true, thinking_budget` |

**两套思考装配**：生产只走 `buildThinkingSettings` + `wireThinkingEffort`；`buildThinkingRequestParams` 会把 openai 的 `max` 压成 `high`，且无调用方——只出现在测试。

响应侧：`createReasoningNormalizingFetch` 包在 openai-compatible 的 `fetch` 上，别名写入 `reasoning_content`；再包 `extractReasoningMiddleware({ tagName: "think" })`。Anthropic 原生 **不走** 这层 fetch 包装。`extractReasoningDelta`（`provider.ts`）是死代码。

### 9.5 能力声明哪些不进服务端

对内置模型，服务端自己有完整能力表。对自定义，**整组配置（含 key）都会上传**，但定价、TTL、图标、hint、自定义 `contextK`、自定义 `vision` 守卫、`imageParams` 不参与对话生成。

客户端 `useImageAttachments` 用 `getModelInfo`（**不看自定义**）。服务端视觉闸门对 `isCustom` 故意跳过。

### 9.6 未来接任意厂商要改的文件

几乎必改：`models.ts`、`provider.ts`、`languageModel.ts`、`reasoningNormalizer.ts`、`failoverModel.ts`、`upstream.ts`、`errorMessage.ts` + 对应测试 + `scripts/verify-models.ts`。

自定义 UI 要暴露新协议：`ModelForm.tsx`、`_shared.tsx`、`settings.ts`。`requestSchema` 一般不用（looseObject 已透传）。

桌面：`electron/main.js`、`setup.html`、`config.js`。自由中转走 env + 内置 registry id；自定义分组走 localStorage + `custom:` id——两条线。

Google 官方 Gemini、OpenAI 官方、DeepSeek 官方若已是 OpenAI 兼容，**不必新协议**——加 `MODELS` 条目 + 凭证桶即可。要原生 Gemini/Azure/Bedrock/Ollama 专有 API，才需要改 `buildBaseModel`。

---

## 10. 卫星生成路由

`ToolLoopAgent` **只**出现在 `studyAgent.ts`，由 `/api/chat` 创建。下列全部是单次 `generateText` / `streamRouteText` / 裸 `fetch`。仓库无 `middleware.ts`。

| 项 | artifact | document | image-gen | follow-ups | chat-title | canvas-revise | record |
|---|---|---|---|---|---|---|---|
| 方法 | POST SSE | POST SSE | POST JSON | POST JSON | POST JSON | POST JSON | POST SSE |
| 入参校验 | 手写 | spec zod | 手写 | 手写 | content | 手写+英文 | 手写+400 |
| 模型 | `resolveLM` + 12min | `resolveLM` **无思考** | `resolveImageProvider` | FLASH only | 独立 env | `resolveLM` 无思考 | `resolveLM` |
| 流事件 | `artifact`+`ping` | `document`+`ping` | — | — | — | — | `reasoning/content/result/done` + `:heartbeat` |
| 超时 | 12min + maxDuration 720 | 90/120s，无 maxDuration | 180s | provider.timeoutMs | 45s | provider.timeoutMs | provider.timeoutMs |
| 错误 | SSE artifact.error | SSE document.error | `{error}` + 上游 status | `{questions:[]}` | fallback JSON | 400/422/502 + raw | SSE error+done |
| 心跳 | ping 数据全程 | ping 数据全程 | 无 | 无 | 无 | 无 | 注释至首 token |
| ToolLoopAgent | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| 密钥旅行 | groups+legacy | groups+legacy | groups | 否 | 否 | groups | groups |
| 前端调用 | ArtifactCard | DocumentCard | ImageGenViewer | **无** | kickoffSessionTitle | CanvasRevisionPanel | startRecord |

`/api/quiz`、`/api/section` 不是 Agent：GET 读盘。quiz 有标识符白名单；section **无**，query 可拼 `..`。

### 10.1 语义分叉（容易当 bug）

1. **document 对 thinkingRequired 模型不带思考参数**（route 只抬 timeout）；artifact 能想就强制开。
2. **follow-ups 路由 vs `generateFallbackFollowUps`**：JSON / `|`、28 字 / 15 字、flash only / 可复用自定义、无 10s / 有 10s。
3. **record 注释写「与 chat 一致」**，但默认 flash、无旧 customProvider、思考默认关（客户端从不传 `enableThinking`）。
4. **chat-title 硬编码中转 URL**，对话模型解析不会落到这个常量。丢弃客户端传的 subjectId。
5. **image-gen 绕开整套 SDK**（failover / reasoning / 脱敏）。
6. artifact/document 校验失败仍 200 + SSE error；record 校验失败 400/503；JSON 卫星用 400/422/502/500。

### 10.2 四套 SSE 协议并行

| 语义 | chat | artifact/document | record |
|---|---|---|---|
| 正文增量 | `text-delta` | `status:"delta"` | `type:"content"` |
| 思考增量 | `reasoning-delta` | `status:"reasoning"` | `type:"reasoning"` |
| 结束 | `finish` | `status:"done"` / `section-done` | `type:"done"`（另有 `result`） |
| 失败 | `error` | `status:"error"` | `type:"error"` |
| 保活 | `: heartbeat` | `{type:"ping"}` | `: heartbeat` |

`parseSseJsonEvents` 不能当通用消费器。UI Message transport **不能**复用到卫星。

---

## 11. 流式 UI / Trace / 卡片

流式链路是 **SDK 还原有序 `parts`，项目只适配 data/metadata 与生命周期**，不维护第二份聊天历史。

```
SSE 字节 → DefaultChatTransport → UIMessageChunk
  → consumeStudyStream 旁路摘 data-* / abort / finish
  → readUIMessageStream 还原 ChatMessage.parts
  → executeChatRequest 60ms 节流 writeUi
  → Zustand updateMessage → IDB 800ms 防抖
  → ChatMessage: buildTrace + 卡片 + 引用条 + FollowUp
```

### 11.1 `consumeStudyStream` 显式分支只有 6 种

`start` / `data-info` / `data-followup` / `data-context-breakdown` / `data-usage` / `abort` / `finish`；其余一律 `enqueue` 给 SDK。

`data-info`：`transient: true` **不落 parts**。`data-usage` **只在 finally 结算一次**。占位 `id` 不被服务端 `start.messageId` 覆盖。

停止：text/reasoning **保持 `streaming`**；未完成工具保持 `input-*`（不伪装成功）；`classifySendError` 对 abort 返回 `null`（无红条）。服务端 error：部分正文可读；未完成工具 → `output-error`。

### 11.2 Trace 投影

`buildTrace` **不是第二份消息库**：从后往前找最后一个 tool；`partIndex <= lastToolIndex` 的 text → Trace「进展说明」；其后 text → `answerText`。无工具时全部 text 都是答案。流式中途又来工具：先前「答案」会搬进 Trace。

`step-start` / `data-*` / `source-*` / `file` 不成步。

状态机：`output-error`/`denied` → error；`output-available && !preliminary` → complete；`approval-requested` → waiting；其余 + 流式 → running；其余 + 历史 → **interrupted**（禁止转圈）。

`AgentTrace`：开始自动展开，结束自动折；用户中途选择被尊重。无 steps + 流式：只显示「正在思考…」。无 steps + 非流式：`null`。结束标题不说「已思考」。`TRACE_COLLAPSE_MS = 160`，FollowUp 用同一窗口错开。

工具默认折起；reasoning 传 `expandWhileRunning`。展开后才挂 `useStickToBottom` rAF，避免折起思考拖住长流式贴底。

### 11.3 卡片 registry

`RESULT_CARD_ORDER`（7 项，**不是** `STUDY_TOOL_NAMES`）：

`searchNotes → webSearch → renderInteractive → generateImage → createQuiz → searchNoteImages → writeDocument`

无卡：`getCurrentPage` / `getOutline` / `getSection` / `imageSearch` / `drawDiagram` / `useSkill`。

去重：`resultKey` 返回空 → 不去重（每条 toolCall 都出卡）；有 key → Set 第一次保留。因此同一 `artifactId` / `imageGenId` / `quizId` / `documentId` 只出一张；检索类卡 **按调用次数出卡**。

`ChatMessage` 把 7 张卡拆成两段，中间插来源条。README 说不要在 ChatMessage 写工具名字面量，但 **128、135 行仍硬编码**。改 `RESULT_CARD_ORDER` 而不改这两段会插队错位。

imageSearch 图廊：`isStreaming` 时直接 `[]`，流式中看不见图。`key={i}` 同 url 重排会错位。

### 11.4 已知 UI 缺陷

1. imageSearch 流式中隐藏图廊 + 无 ResultCard。
2. 70% 红环 vs 80% 才截断。
3. FollowUp 三层协议；`MessageContent` 不传 `streaming`。
4. 来源条双份：webSearch「联网来源」+ `source-url`「参考来源」+ FollowUp「来源 · N」。
5. 检索类卡不去重；FollowUp 笔记 hits 也不按 path 去重。
6. 助手 `file` part 无 UI。
7. `drawDiagram` 无卡。
8. `createQuiz` 答题态不持久。
9. `AgentFoldHeader` 双按钮无 `aria-controls`。
10. 懒迁移 running → `output-error`，现网 abort → `interrupted`：同一「停了」两种文案。
11. 旧消息缺 quiz/document/noteImages 专用 output：可能有 Trace 步、无卡。
12. webSearch 设置文案仍写 Bocha。
13. 步数上限 / imageSearch 空结果无用户 info。
14. `MessageContent` 流式每 60ms 整解析 XML/KaTeX。
15. TokenDashboard / FollowUpQuestions 整包 `lucide-react`。

---

## 12. 消息模型与持久化

真相是 **AI SDK `UIMessage.parts`**。本仓库加 `timestamp` / `attachments` / `followUpQuestions`。

### 12.1 类型树（压缩）

`ChatMessage extends UIMessage<StudyMessageMetadata, StudyDataParts, StudyTools>`。

parts：`text` / `reasoning`（`state: streaming|done`）/ `file` / `step-start` / `source-url` / `source-document` / `dynamic-tool` / `tool-{13名}` / `data-{info|context-breakdown|usage|followup}`。

`StudyMessageMetadata`：`thinkingEnabled` / `searchEnabled` / `cacheHit` / `modelId` / `usage` / `durationMs`。

`hasVisibleContent` 只认非空 text/reasoning、file、任意 tool part。空 assistant 占位 `parts:[]` 为 false，不会进请求。

### 12.2 存储 key

| Key | 内容 | 写入 |
|---|---|---|
| `chat-manifest` | `{ version:2, activeSessionId, sessions: SessionMeta[] }` | create / delete / addMessage / artifactIds 变 / 改标题 |
| `chat-session:{id}` | `ChatMessage[]` JSON | addMessage / updateMessage；流式 800ms 防抖 |
| `chat-blob:{id}` | 图片 data URL | `persistInlineAttachments` |
| `chat-history` | v1 整包 | **只读迁移**；成功后删除 |

`useChatHistory` **不走 zustand persist**，内存态 + 手动 IO。`MAX_LOADED_SESSIONS = 3`，LRU 驱逐只清内存，不删 IDB。

### 12.3 两层迁移

v1→v2：已有合法 manifest 则跳过；拆 session + blob；任一次失败保留 legacy。**不按 50 封顶**。

扁平→parts（读时懒迁移）：有字符串 `content` 且没有 `parts` 数组。固定顺序 **思考 → 全部工具 →（step-start）正文**。`running` → `output-error`「生成被中断」。**丢失时序**。`legacyToolOutput` **没有** createQuiz / writeDocument / searchNoteImages 专用字段。下次保存自然写回 parts，无单独 schema 版本。

### 12.4 哪些回灌模型

| 数据 | 落库 | 下一轮模型 | 当轮模型 | UI |
|---|---|---|---|---|
| `text`（非空） | 是 | 是 | 是 | 工具后为答案气泡 |
| `file` / hydrate 后的附件 | blob + ref | 是 | 是 | 缩略图 |
| `reasoning` | 是 | 否 | 否（当轮进 UI 流） | Trace「思考」 |
| `tool-*` 全量 | 是 | 否 | 仅 `output.text` | Trace + 卡片 |
| `data-info` | 否 | 否 | 否 | 瞬时 info |
| `data-context-breakdown` | 可能在 parts；看板不持久化 | 否 | 否 | 上下文看板 |
| `data-usage` | `metadata.usage` | 否 | 否 | 用量 / 计费 |
| `followUpQuestions` | 是 | 否 | 否 | 追问条 |

### 12.5 会话 50 上限与孤立 session

`MAX_SESSIONS = 50`。超限 `slice(0, 50)` 对 dropped 调 `deleteSessionData(id, [])`——**只删 session，blobIds 为空则不删 blob**。不从 `messagesById` 清掉 dropped；若该会话仍在内存且之后 `updateMessage`，会把 session **写回去**，而 manifest 已无入口 → 孤立 key。

`listAllChatKeys` **定义了从未调用**——没有「按 manifest 回收孤立 session/blob」。计划 22 端测见 `chat-session:*` 53 键、manifest 只列 3 条。现网仍未做。pin 只防 LRU，**不能免于 50 封顶淘汰**。浮窗与主会话共用同一个 50。`createSession` 用 `Date.now()` 当 id，同毫秒双开会撞。

---

## 13. Agent 安全面

对照 `security-best-practices`：`NEXT-AUTH-001` / `NEXT-SSRF-001` / `NEXT-PATH-001` / `NEXT-DOS-001` / `REACT-XSS` / `JS-STORAGE-001`。仓库内**没有** `middleware.ts`，`next.config.mjs` **没有**安全头或 CSP。

威胁模型要拆开：Electron 把 Next 绑在 `127.0.0.1:35349`；`next dev` / `next start` **未钉死 hostname**。若把带 `AI_*` / `RELAY_*` 的服务暴露到局域网或公网，同一套路由就是开放面。官方 UI 的限制（技能 20 个、只发 user/assistant）**不是**服务端边界。

### 13.1 按严重度

**Critical / High（视部署是否出网）**

1. **无鉴权的昂贵 AI 面** — 全部 `app/api/{chat,chat-title,artifact,document,canvas-revise,follow-ups,image-gen,record}`。内置模型花运营者 env 额度。`MAX_TOOL_STEPS = 6` 是模型循环上限，不是调用方 QPS 上限。Artifact 单请求可占 12 分钟。
2. **自定义 `baseUrl` = 服务端代打任意 URL** — `resolveProvider` 原样 `trim()` 使用，没有协议/主机/私网限制。`normalizeOpenAIBaseUrl` 只补 `/v1`，不做安全校验。`GET /api/can-embed?url=` 对任意 http(s) `fetch`，`redirect: "follow"`，不拦私网。
3. **内容路径未锁清单** — `getSection` 与 `/api/section` 用调用方字符串拼 `path.join` 后 `readFileSync`。未要求路径在 `contentTree` 内，也未规范化/`..` 检查。`findContentItem` 失败也返回原始三段并读盘。对照：`readQuiz` 有 `^[a-zA-Z0-9_-]+$`；`isSafeExampleId` 拒 `..`。学年隔离不作用于 `getSection`。
4. **Artifact / 画布 `srcdoc` + `allow-scripts` + `allow-same-origin`** — 与宿主同源。`ARTIFACT_SYSTEM` 写明可用 `fetch`、表单、弹窗、下载、localStorage。HTML 未做 DOMPurify。可摸到 localStorage 里的自定义 apiKey。新标签用 blob + noopener，比 iframe 浮窗安全。聊天 `rehype-raw` 无 HTML 消毒，`mdComponents` 没禁掉 `script`。

**Medium**

5. 自定义 `apiKey` 明文 `gailvlun-settings-v1` + 几乎所有 AI POST 以 JSON 发送。长文档 N+1 次 POST，密钥走 N+1 遍。
6. `globalContext` / `skills` / `role:system` 服务端无条数、无正文长度。schema 允许 `system` role；`toModelMessages` 不过滤 role。直打 API 的调用方可以任意覆盖。`academicYear` 有白名单；官方 UI 不发 system role、技能上限 20——这些都挡不住直打。
7. 卫星路由错误回显上游 body / `err.message`（尤其 `canvas-revise` 502 带 `responseBody.slice(0,300)`、`record` 同形、`image-gen` 透传上游 status）。只有 `/api/chat` 走 `toChatErrorMessage` + 动态 `secrets`（含 resolve 后的 env key）。
8. 聊天 `rehype-raw` 无 HTML 消毒，与密钥存储叠加。
9. `/api/can-embed` 开放 URL 探测（私网未拦）。
10. 无应用级限流；file part / 技能正文无服务端体积上限（费用 / 内存）。

**Low / 信息性**

11. 学年隔离不作用于 `getSection`（产品边界，除非把「别的学年笔记」当敏感资产）。
12. `/api/health/search` 暴露索引元数据。
13. 无 CSP / 安全头。
14. Prompt 注入面：用户消息既在 messages 又在【参考材料】；技能 / 全局上下文 / 当前页 / 联网结果都没有「不可执行指令」分隔。注入成功后可驱动 `getSection`（扩大读盘）、`webSearch`（花 env 额度）、`renderInteractive`（产出同源 HTML）。`generateImage` 需前端再批一次，但 `/api/image-gen` 本身无用户会话校验。

### 13.2 已有防护（不要误判为「没做」）

- chat 错误：`toChatErrorMessage` 不序列化 requestBody / 响应体 / 头；按 cause 链映射固定文案；`secrets` 整段替换为 `[已隐藏]`；再打 URL、`Bearer`、`sk-*`、`api_key=`；只留首行、最多 240 字。
- 内置模型不把 env key 发到用户 URL。
- 官方 UI 不发 `system` role；技能 UI 上限 20。
- `academicYear` 白名单；quiz / exampleId 有穿越检查。
- 生图工具需前端二次请求；思考/工具 part 不回灌历史。
- 读盘失败吞掉异常，不回路径。
- Electron：环回绑定 + `safeStorage` 存内置密钥。
- 新标签打开 HTML 用 blob + noopener。
- SVG 有 DOMPurify；webSearch / imageSearch 打固定官方 API，不是用户 URL。
- Next 16.2.9 高于 react2shell 补丁线。

浏览器跨站 JSON POST 通常会被 CORS 预检挡住（仓库未放开 CORS）。**非浏览器客户端不受此限制。** Cookie 鉴权不存在，CSRF 不是主矛盾。

---

## 14. 测试覆盖与文档漂移

现网分层（对照 `webapp-testing`：本仓没有提交的 Agent Playwright 套件，验收日志在 gitignore 的 `tmp/agent-sdk/`）：

1. node:test 行为单测（`lib/ai/agent`、`lib/ai/sdk`、`lib/chat` 纯函数）
2. 源码契约扫描（`contextTruncationPolicy`、`customProviderCompatibility`）
3. 路由集成（`tests/api/chat-sdk.test.ts`、`sdk-routes.test.ts`）
4. Vitest UI（`AgentTrace.test.tsx`、toolCards、ChatPanel、`useChat.test.tsx`）

### 14.1 覆盖矩阵

| 模块 | 单测 |
|---|---|
| `studyAgent.ts` | **有**（5 条：循环 / 去重 / 生图 / 技能门 / 无工具+软上限） |
| `requestSchema.ts` | **有**（仅学年） |
| `followUps.ts` | **无专测**；经 chat-sdk 间接 |
| `contextBreakdown.ts` | **无** |
| `documentTool.ts` / `quizTool.ts` | **无** |
| `tools/server.ts` | **无专测** |
| `_shared.ts` 去重/配额 | **间接** |
| `searchNotes` execute | **有**（仅索引缺失） |
| 其余 12 个 `tool.ts` execute | **无** |
| `lib/ai/prompts/**` | **无** |
| SDK 六文件 | **全有** |
| `models.ts` / `provider.ts` | **有** |
| chat 纯函数（buildTrace / consume / messageParts / buildRequestMessages / resolveFollowUps 等） | **有** |
| `executeChatRequest.ts` / `hydrateForRequest.ts` | **无专测**（useChat.test 间接） |
| `openSourceTrace.ts` | **无** |
| `/api/chat` | **有** chat-sdk（12 条） |
| artifact / record / chat-title / follow-ups / canvas-revise | **有** sdk-routes |
| `/api/image-gen` | **仅源码扫描** |
| `/api/document` | **无路由测** |
| `AgentTrace.tsx` | **有** |
| `AgentTraceStep.tsx` | **无专测** |
| toolCards registry + 七张卡 | **有**（薄：标题/条数，不测展开/批准/生成） |

**一句话**：SDK / 流消费 / Trace 投影 / sendMessage 纯函数较厚；**工具 execute、quiz/document 归一化、contextBreakdown、followUps 解析、imageSearch 配额、步数上限提示**是最大空洞。

### 14.2 `studyAgent.test.ts` 每个用例证明了什么

| # | 证明 | 没证明 |
|---|---|---|
| 工具循环 → UI 流 | reasoning / tool-input / tool-output / 最终 text；usage 跨步累加；第二步 tool result 只有 text | 步数触顶；真实读页 |
| 同 contextKey 二次 | `deduped===true` 且文案含「已加载」 | 跨请求（runtime 每请求新建） |
| 生图模式 | 第 0 步强制 generateImage；第 1 步 tools 空 | 用户 disable 了 generateImage |
| 技能 + 联网门 | 有菜单才有 useSkill；enableSearch 控制 web/image | 技能排序；pin+menu 同时调 useSkill |
| 无工具 + 软上限 | `modelSupportsTools:false` → tools `{}`；截断后参考消失 | `overflow` / 客户端 flag 与服务端 0.8 的 OR |

### 14.3 主循环路由测试缺口

- 未配置 → 友好文本、无 FollowUp、无 finish
- 视觉拦截：内置无 vision + file → throw；自定义 + 无 vision + file → **放行**
- 主文本模型未配、fallback 已配 → 仍「未配置」
- 客户端断开 / FollowUp 进行中 abort → 仍成功 finish
- `imageModeTextModelFallback` 真的发生整模型切换
- `messages: []` / `role:"system"` 进 SSE 后的错误形态
- **`isStepCount(6)` 触顶：第 6 步仍 tool-calls、无第 7 次、无最终文本**
- `prepareStep` 搜图配额摘除
- 心跳与真实 `/api/chat` 包一层的集成测

### 14.4 过时文档清单

| 文档 | 状态 |
|---|---|
| `docs/plans/13-agent-sdk-known-issues.md` | 标题已写「已修复」。两项**现网已修**（流内 error 仍追问；省略 academicYear 400）。易被当成待办 |
| `docs/plans/13-agent-sdk-trace-ui.md` | 仍把 known-issues 写成未修；验收数字是历史快照 |
| `docs/archive/HANDOFF-agent-sdk-trace-ui.md` | 文首写「已完成并被取代」，正文仍停在 9 工具、手写 SSE、59 个 TS 错误 |
| `docs/plans/22-plan-agent-architecture.md` | 「现状」是执行前快照；验收「七个工具目录内有 ResultCard」已随计划 23 搬到 `components/chat/toolCards/` |
| `docs/research/04` 与 `docs/analysis/9-9/04` | §2.0 已校准；**§1 与 §3–§9 仍是 2026-07 快照**：734 行 route、anthropicAdapter、9 工具、`MAX_TOOL_TURNS`、`useChat` 543 行、`type:"content"` 事件。§2.0、§3.1 三协议、§3.3 调度语义大体仍准 |
| `docs/refer/framework-extension.md` | 仍写旧 chat 事件 `{ type: "followup" }`；现网是 `data-followup` |
| `prompts/index.ts:1-3` | 「易变放在后一条消息」——现网并进同一条 system |
| `CHANGELOG` / `.env.example` / `sop/00` | Unsplash Demo、Bocha、`runImageSearch`、智谱同时提供图片搜索——均已不存在 |
| `webSearch/presentation.ts` | 仍写 Bocha |

### 14.5 已知未修问题（不是 13-known-issues）

**04 §7 对照现网仍成立**

1. 浮窗 token 泄漏：`closeWindow` 不调用 `useFloatingTokenTracker.resetSession`
2. 工具步数达上限无提示
3. `estimateTokens` CJK 开区间，Ext A 未计入
4. `imageSearch` 计数只在单次请求（文案写成「本次对话」）
5. `/api/follow-ups` 前端无调用
6. 前端追问仍是硬编码正则，无学科定制

**计划 22 端测遗留**

1. `writeDocument` 逐节文体漂移
2. IndexedDB 孤立 `chat-session:*`
3. imageSearch 库存图质量
4. HTML 演示进 React 树的 script 警告
5. 关思考后 Qwen 仍出英文思考步
6. 浮窗全屏 title「窗口全屏」未改
7. writeDocument「查看文档」真机未点（单测已绿）

**本报告新标出、文档未列**

- `getMaxTokens` 看不见自定义 `contextK`
- `classifyTool` 把 `getOutline` / `searchNoteImages` 扫进 conversation
- `InteractiveVenn` 生产/消费字段不一致
- 水合与 blob 写入竞态
- 追问/outbound/seed 丢掉输入栏开关
- document 路由对 thinkingRequired 模型不带思考
- `getSection` / `/api/section` 路径未锁清单
- Artifact sandbox same-origin + scripts
- 自定义 baseUrl = SSRF
- 全 API 无鉴权

---

## 15. 可持续性与可用性评估

### 15.1 已经立住的

1. **请求内原生 tool loop**：不再维护手写 turn 循环 / anthropicAdapter / 自建 SSE 事件名。`route.ts` 从 734 行收到 ~241 行。
2. **服务端 / 客户端边界**：工具一目录、eslint 禁 import `tool.ts`、卡片在 `components/`。计划 22/23 把 `useChat` 收到 120 行、`sendMessage` 拆纯函数。
3. **流式契约**：SDK 还原 parts；项目只适配 data/metadata；Trace 按「最后工具」切开答案与过程；停止 flush 末帧并保留已收内容。
4. **模型注册表**：registry id ≠ 上游 id；LEGACY aliases；自定义 `custom:组:模型`；思考方言表；GLM 的 relay→mimo 是唯一真 failover。
5. **检索可运维**：五件套 + health +「索引未加载」与「未检索到」分开；标题入 BM25 / rerank；学年自动 widen。
6. **错误收尾**：流内 error 不再二次计费 FollowUp；`toChatErrorMessage` 对 chat 路径脱敏；`maxRetries: 0` 禁止整链重放。

### 15.2 不可持续的裂缝（按杠杆，不是按框架热情）

| 杠杆 | 现状 | 若不修的后果 |
|---|---|---|
| **跨轮记忆为 0** | 历史剥光 tool/reasoning | 模型每轮重新 getCurrentPage；旁路进度永不回灌；第 6 步点着火没有「一两句话」 |
| **一条 system 钉提问** | 与 prefix cache 设计打架 | 每轮 bust 尾巴；自定义小窗 overflow 失效 |
| **Harness 碎片** | 主循环 + 6 条卫星，四套 SSE | 新生成能力只能再开一条路由；思考/超时/脱敏各写一遍 |
| **协议双轨** | tool_calls + 正文 DSL + FollowUp 四层 | 模型不遵守标签时行为不可预测；InteractiveVenn 已对不上 |
| **UI 写死 full** | SemanticSearchManager 是死代码 | 文档与代码互相否定；检索只靠模型是否调 searchNotes |
| **安全默认开放** | 无鉴权 / 自定义 URL / srcdoc 同源 | 桌面本机可接受；一旦出网就是开放代理 + 密钥面 |
| **测试偏适配、偏业务** | 12/13 工具无 execute 测 | 学年/path/配额/触顶全靠人工 |
| **文档半新半旧** | 04 §3–§9、HANDOFF、Bocha/Demo | 后人按过时断言改代码 |

### 15.3 对原问题的直接回答

**「目前是单次调用还是多次调用？」**

- 对浏览器：一次发送 = **1 次** `POST /api/chat` SSE。
- 对上游 LLM：同一次 SSE 内 **1～6 次** chat completions / messages，外加 0～1 次 FollowUp，外加卡片旁路各自再打。
- 不是「正文底部写工具 → 停 → 再激活」的提示词协议；是 SDK 看 `tool_calls` 后在同流内 `streamStep(+1)`。
- 跨用户轮次：**没有**把上一轮工具结果带回去，所以跨轮更像「带文本记忆的单次调用」，不像持续 Agent。

**「上下文工程怎么样？」**

- Full 预注入（扁平全年目录 + 当前页全文 + 把提问再写进 system）能让短问答少调工具，但造成双写、每轮 system 变、prefix cache 打折。
- 80% 不是双端同判：客户端裁历史，服务端裁参考，分子不是同一批 token。
- semantic / 预注入 hybridSearch 已实现、被 UI 锁死。
- `getMaxTokens` 看不见自定义 contextK；breakdown 把大纲/笔记图算成「对话」。

**「Harness 做得怎么样？」**

- 主聊天 harness（`createStudyAgent` + `/api/chat` + `useChat`/`lib/chat/*`）结构清楚：门控 → 乐观落库 → 水合 → 截断 → stall → 流消费 → 追问三层。
- 弱在：卫星各写一套 SSE/思考/脱敏；客户端水合竞态；追问不继承开关；触顶无 UI；跨轮剥光使旁路成为「模型看不见的副作用」。
- 对照 vercel-react-best-practices：状态读取和 IDB 防抖做得对；附件串行、barrel、无 startTransition、整包 lucide 是债。

**「模型接入未来怎么接各种各样的模型？」**

- 已 OpenAI 兼容 / Anthropic 原生 / 硅基思考方言：加 `MODELS` 条目或自定义分组即可。
- 要原生 Google / Azure / Bedrock / Ollama：改 `buildBaseModel` + `ProviderKind` + 思考装配 + failover 可恢复码 + Electron 密钥注入。
- 不要指望动态能力探测——`thinking` / `tools` / `vision` 是注册表声明；自定义 vision 服务端不拦、客户端附件钩子也不看自定义。
- 自定义密钥随请求旅行、baseUrl 服务端代打：接「各种各样」之前应先收紧这两条，否则每多一个协议就多一条开放代理。

---

## 16. 路线图（按杠杆）

不改 `ToolLoopAgent` / `stopWhen` / 步数上限——计划 22 已把这些列为非目标。下面只列**不推翻现架构**就能提高可持续性的切口。

### P0 · 出网或共享部署前

1. API 鉴权或至少共享口令 + 限流；Electron 可继续环回豁免。
2. 自定义 `baseUrl` 主机允许名单 / 禁私网；`/api/can-embed` 同样收。
3. `getSection` / `/api/section` 必须 `findContentItem` 成功才读盘；标识符白名单对齐 quiz。
4. Artifact / 画布 iframe 去掉 `allow-same-origin`，或改 blob URL；`ARTIFACT_SYSTEM` 禁止 localStorage。
5. 卫星错误一律走 `toChatErrorMessage`；禁止回传 `responseBody`。

### P1 · 正确性与可观测

6. 给 `isStepCount(6)` 触顶加测 + `data-info`「可能未完成」。
7. `getMaxTokens` 改走 `getModelInfoWithCustom`；`classifyTool` 把 `getOutline` / `searchNoteImages` 进 pages。
8. `contextMode` 要么做设置开关，要么删 SemanticSearchManager 死路径并改文档。
9. imageSearch 文案改为「本请求」；缺 Unsplash key 对模型说「未配置」，不要伪装成「没图」。
10. 追问 / outbound / seed 继承输入栏 thinking/search；`ChatPanel.handleSend` 补上 `thinkingEffort` 类型。
11. document 路由对 `thinkingRequired` 模型带上 `thinkingSettings`（与 artifact 对齐）。
12. 修 `InteractiveVenn` 字段，或改 global.md 教 props。
13. 按 manifest GC 孤立 `chat-session:*` / `chat-blob:*`。

### P2 · 上下文与协议收敛

14. 把「用户提问：」移出 system（或截断后不再双写），让稳定前缀真的稳定。
15. `dedupeByContextKey` 对 system 已注入的当前页建索引，避免未截断时再灌一遍。
16. FollowUp 收敛到一层：要么只信 `data-followup`，要么只信标签；删死卫星 `/api/follow-ups` 或让前端用它。
17. `writeDocument` 文体：outline brief 约束 + 节过短重试；导出按钮不要写「可导出」直到真做完。
18. 补 12 个工具的 execute 单测（学年、path、配额、widen、enum）。
19. 重写 `docs/analysis/9-9/04` §3–§9，或在文首加「以本报告 / grok-cli 为准」的硬跳转。

### P3 · 体验

20. imageSearch 流式中出画廊或给 ResultCard；来源条去重。
21. 水合 `Promise.all`；blob 写入完成后再改内存引用。
22. 6 个人文/医学缺省学科补 prompt（至少教 `:::memory` / `:::timeline`）。
23. Token 环阈值与 80% 软上限对齐，或给 70–80% 单独文案。
24. 自定义 vision / contextK 全链路打通（附件钩子 + 服务端闸门 + getMaxTokens）。

---

## 附录 A. 关键文件地图

| 层 | 路径 |
|---|---|
| 主循环 | `app/api/chat/route.ts` · `lib/ai/agent/studyAgent.ts` · `lib/ai/agent/requestSchema.ts` · `lib/ai/agent/followUps.ts` |
| 工具装配 | `lib/ai/agent/tools/server.ts` · `names.ts` · `_shared.ts` · `presentations.ts` · `index.ts` |
| 十三工具 | `lib/ai/agent/tools/<name>/{types,tool,presentation}.ts` |
| 上下文 | `lib/context/{fullContext,semanticSearch,factory,types,estimateTokens}.ts` · `lib/ai/agent/contextBreakdown.ts` |
| 提示词 | `lib/ai/prompts/global.md` · `lib/ai/prompts/subjects/*.md` · `lib/ai/prompts/index.ts` |
| 模型 | `lib/ai/models.ts` · `lib/ai/provider.ts` · `lib/ai/sdk/{languageModel,failoverModel,reasoningNormalizer,heartbeat,errorMessage,routeGeneration}.ts` |
| 检索 | `lib/ai/search/hybridSearch.ts` · `lib/ai/indexing/chunker.ts` · `lib/ai/embedding.ts` · `lib/content/loader.ts` |
| 客户端编排 | `lib/hooks/useChat.ts` · `lib/chat/{sendMessage,executeChatRequest,buildRequestMessages,buildChatRequestBody,consumeStudyStream,estimateContextBudget,resolveFollowUps}.ts` |
| UI | `components/chat/{ChatMessage,AgentTrace,AgentTraceStep,ChatPanel,FloatingChatBody,TokenDashboard}.tsx` · `components/chat/toolCards/` |
| 持久化 | `lib/types/chat.ts` · `lib/chat/messageParts.ts` · `lib/stores/chatHistory.ts` · `lib/storage/{chatStorage,idbStorage}.ts` |
| 卫星 | `app/api/{artifact,document,image-gen,follow-ups,chat-title,canvas-revise,record,quiz,section}/route.ts` |

---

## 附录 B. 常量表

| 常量 | 位置 | 值 |
|---|---|---|
| `MAX_TOOL_STEPS` | `_shared.ts:6` | 6（含最终文本步） |
| `IMAGE_SEARCH_MAX_TOTAL` | `_shared.ts:5` | 20（**单请求**） |
| Agent `temperature` | `studyAgent.ts:151` | 0.6 |
| Agent `maxRetries` | `studyAgent.ts:150` | 0 |
| Agent `id` | `studyAgent.ts:143` | `"study-tutor"` |
| `SOFT_LIMIT_MAX_TURNS` | `buildRequestMessages.ts` | 16 |
| 软上限比例 | `estimateContextBudget.ts` / `route.ts` | 0.8 |
| UI 节流 | `streamUiThrottle.ts` | 60ms |
| IDB 防抖 | `idbStorage.ts` | 800ms |
| Stall | `createStallWatchdog.ts` | 60s / 5s 轮询 |
| 心跳 | `heartbeat.ts` | 15s，首 chunk 后停 |
| FollowUp 超时 | `followUps.ts:9` | 10s |
| FollowUp temp / tokens | `followUps.ts:59-60` | 0.5 / 200 |
| Artifact 空闲 | `artifact.ts:61` | 12 min；`maxDuration=720` |
| 文档续写 | `document.ts` | `CONTINUATION_MAX=2` |
| 生图超时 | `image-gen/route.ts` | 180s |
| `MAX_SESSIONS` | `chatHistory.ts:22` | 50 |
| `MAX_LOADED_SESSIONS` | `chatHistory.ts:21` | 3 |
| `MAX_SKILLS` | `skills.ts` | 20（仅 UI） |
| `DEFAULT_MODEL_ID` | `models.ts` | `z-ai/glm-5.3-flash` |
| `DEFAULT_ACADEMIC_YEAR` | `academic-year.ts:54` | `"sophomore-1"` |
| `PREFER_SUBJECT_MIN_HITS` | `hybridSearch.ts` | 3 |
| BM25 k1 / b | `bm25Store.ts` | 1.5 / 0.75 |
| RRF k | `hybridSearch.ts` | 60 |
| snippet | `hybridSearch.ts` | 400 字 |
| Token 环 | `TokenDashboard.tsx` | >0.4 黄 / >0.7 红 |
| `TRACE_COLLAPSE_MS` | `AgentTrace.tsx` | 160 |

---

## 附录 C. 与已有分析文档的关系

| 文档 | 关系 |
|---|---|
| `docs/analysis/Agent/agent-analysis-grok-cli.md` | 同日 CLI 线 16 路探查。结论一致；本报告多了 skill 绑定、安全专节、持久化孤立 session、vercel-react 偏差、InteractiveVenn 字段裂缝、卫星四套 SSE 对照表 |
| `docs/analysis/Agent/agent-analysis-gemini.md` | 偏架构叙事与演进规划，粒度较粗，且把 `MAX_TOOL_STEPS=6` 写成「6 轮工具」——以本报告 §2 为准 |
| `docs/analysis/Agent/agent-analysis-cluade-4-6.md` | 同样把循环写成「6 步工具循环」；数据流表可用，步数语义以本报告为准 |
| `docs/agent-architecture-review.md` | 较粗的全局评；P5 FollowUp 双协议、cacheHit 单槽误报已在本报告展开 |
| `docs/analysis/9-9/04-ai-chat-system.md` | 2026-07 快照。§2.0 目录校准仍准；§1/§3–§9 不要当现码 |
| `docs/refer/adding-an-agent-tool.md` | 现网工具目录约定，仍然有效 |
| `docs/plans/13-agent-sdk-known-issues.md` | **已修复档案**，不是待办 |
| `docs/plans/22-plan-agent-architecture.md` | 执行记录有效；端测遗留仍开；「不改 studyAgent 循环」仍是约束 |
| `docs/sop/10-search-index-lifecycle.md` | 与当前索引运维一致 |
| `docs/plans/15-search-index-distribution-and-rag-quality.md` | 改前根因；现网已落地多段，以本报告 §7 为准 |

---

## 附录 D. 主循环 vs 旁路：一次学习动作的上限清单

用户点一次发送，理论上限：

| 调用 | 次数上限 | 是否占 `MAX_TOOL_STEPS` |
|---|---|---|
| `/api/chat` 上游 LLM | 6 | 是 |
| FollowUp `generateText` | 0～1 | 否 |
| failover 换端点 | 0～1（现网仅 GLM） | 否（同一 step 重试形态） |
| `/api/chat-title` | 0～1（首条） | 否 |
| `/api/artifact` | 每张卡 1 次，最长 12 min | 否 |
| `/api/document` | 1 + N 节 + 每节最多 2 次续写 | 否 |
| `/api/image-gen` | 批准后 1 次 | 否 |
| 智谱 web_search | 每步可并行多次，无条数帽 | 占发出 call 的那一步 |
| Unsplash | 文案 20 张 / 请求；并行可超 | 占发出 call 的那一步 |
| `/api/canvas-revise` | 每次点铅笔 1 次 | 否（不在发送路径） |
| `/api/record` | 划词成卡，独立 | 否 |

**第 6 步若仍是 tool-calls**：卡片/题目/生图批准/文档任务仍在；drawDiagram 多半没图；「一两句话说明」不会被写；UI 不知道触顶。

---

## 附录 E. 子智能体产出索引

每条可回溯到对应探查线程。断言冲突时以源码行号为准，不以子智能体互相转述为准。

1. [Client send pipeline](fc3d17d8-af70-4c69-b87f-03942f4e10ce) — 发送时序、字段表、vercel-react 偏差、水合竞态  
2. [Server agent loop](5f0ec726-7561-470d-b228-c4d97227dce4) — 状态机、`isStepCount`、为何不用 merge、FollowUp 门闩  
3. [Context engineering deep](ebbacb3a-baa9-4e21-bdba-17e7a9218a73) — 注入层、双套 80%、`getMaxTokens`、breakdown 错分  
4. [Read and skill tools](d282a3e0-cfdd-4ba8-a750-d08c943d854a) — 六工具 schema / key / 学年  
5. [Generation side-effect tools](ab9340af-8680-47c9-b7b0-77ca8b2d5e54) — 点火 vs 生成、0/3、文体漂移、6 步咬合  
6. [Web search image tools](7f85a37b-6d64-42e2-9bcf-51c3196f2895) — globe 链路、20 张语义、Bocha/Demo 谎言  
7. [Model provider SDK](a379a24d-55a0-44c0-b28f-adae1a5c3ce2) — 协议矩阵、failover、思考方言、接厂清单  
8. [Satellite generation APIs](c306edb9-7d2c-4a3d-a6a0-b9189ef05a51) — 七路由对照、四套 SSE、密钥旅行  
9. [Stream UI and trace](30686d4d-0d09-45d3-a1c6-2a4d7ec5c956) — chunk 映射、卡片去重、40/70 vs 80  
10. [Agent tests and docs drift](fa358536-5476-43ba-894a-0cab187f9081) — 覆盖矩阵、04 过时断言、13-known-issues 已修  
11. [Agent security surface](0d6455a8-564e-4b10-95c4-e8760c068e16) — 鉴权/SSRF/路径/sandbox（无利用步骤）  
12. [Prompt and text protocols](340d9d62-9901-4b0c-a239-2e88d24e1adc) — 拼装顺序、DSL 清单、InteractiveVenn、学科缺口  
13. [Search RAG for agent](64f16c3b-0b69-404e-bb39-972d18192da4) — hybrid 参数、health、chunk、与 getSection  
14. [Message types persistence](01c38a9a-e467-44dd-bc96-542b238363a4) — 类型树、懒迁移、50 封顶孤立 key  

以上为只读勘察，未改仓库源代码。