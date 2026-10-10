# Agent 架构极细分析

> 生成：2026-09-12 · 作者：Grok CLI（主智能体 + 16 路只读子智能体）  
> 代码依据：当前 `dev` 工作区；AI SDK `ai@7.0.85` / `@ai-sdk/openai-compatible@3.0.41` / `@ai-sdk/anthropic@4.0.46` / `@ai-sdk/provider@4.0.9`  
> 产出路径：`docs/analysis/Agent/agent-analysis-grok-cli.md`  
> 对照：`docs/agent-architecture-review.md`（较粗）、`docs/analysis/9-9/04-ai-chat-system.md`（2026-07 快照，§1/§3–§9 已过时）

---

## 0. 一句话结论

客户端每次发送对应 **1 次** `POST /api/chat`（一条 SSE）。服务端用 Vercel AI SDK 的 `ToolLoopAgent` 做 **原生 function calling 多步循环**：`isStepCount(6)` = **最多 6 次上游 LLM 调用**（不是 6 次工具后再额外收尾一次）。工具以 OpenAI `tool_calls` / Anthropic `tool_use` 进出，**不是**「把工具写在回答最下方再二次激活」的提示词协议。

旁路（artifact / document / image-gen / chat-title / canvas-revise / FollowUp 兜底）是 **主循环之外的另一次或多次模型调用**。一次「问 AI + 开搜索 + 做演示 + 写文档 + 生图」的真实账单，远大于「点一次发送」。

---

## 0.1 本报告怎么来的

16 路并行只读探查，覆盖：

| # | 切面 | 子智能体焦点 |
|---|---|---|
| 1 | 主循环 + `/api/chat` | `studyAgent` / `route.ts` / `isStepCount` / 错误闸门 |
| 2 | 上下文工程 | `lib/context` / 软上限 / prefix cache / 双重注入 |
| 3 | 模型接入 | `models.ts` / `provider.ts` / failover / 思考方言 / 密钥 |
| 4 | 检索类工具 | getCurrentPage / getOutline / getSection / searchNotes / searchNoteImages |
| 5 | 联网 / 技能 | webSearch / imageSearch / useSkill |
| 6 | 生成类工具 | renderInteractive / drawDiagram / generateImage / createQuiz / writeDocument |
| 7 | 客户端发送 | `useChat` → transport → `consumeStudyStream` |
| 8 | UI 可见层 | Trace / 卡片 / FollowUp / 设置开关 |
| 9 | RAG | hybridSearch / 索引 / semantic vs searchNotes |
| 10 | SDK 内核 | `node_modules/ai` ToolLoopAgent / convertToModelMessages |
| 11 | 测试与债务 | 覆盖矩阵 / 计划 13–22 / 仍在的缺陷 |
| 12 | 状态与计费 | settings / skills / billing / token 看板 |
| 13 | 提示词 | `global.md` + 学科 md + 旁路 system |
| 14 | 旁路内循环 | document / artifact / image-gen / canvas-revise / chat-title |
| 15 | 进程边界 | Electron env / `app/api/*` / CORS |
| 16 | 类型契约 | `ChatMessage` parts / Trace / 来源窗 |

下文所有断言均可回溯到 `file:line`。过时文档会单独点名，不以 2026-07 快照当现状。

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
  ├─ POST /api/artifact          1 次 streamText（HTML）
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

| | 自制 XML/尾部约定 | 本仓库（现码） |
|---|---|---|
| 载体 | 自由文本 | 原生 `tool_calls` / `tool_use` |
| 停下来 | 正则 / stop token | SDK 看 `finishReason === tool-calls` |
| 再调用 | 自己拼第二轮 messages | `streamText` 在同一次 SSE 内 `streamStep(+1)` |
| 多模型 | 每个模型都要教同一套 XML | schema 由协议适配器翻译 |
| Anthropic thinking | 很难和 block 共存 | 同轮 signature 回传已测 |

---

## 2. `isStepCount(6)` 精确语义（必须先钉死）

常量：`lib/ai/agent/tools/_shared.ts:6` `MAX_TOOL_STEPS = 6`。  
配置：`lib/ai/agent/studyAgent.ts:147` `stopWhen: isStepCount(MAX_TOOL_STEPS)`。

SDK：

```21:29:node_modules/ai/src/generate-text/stop-condition.ts
 * Creates a stop condition that returns `true` when the number of completed
 * steps equals `stepCount`.
export function isStepCount(stepCount: number): StopCondition<any, any> {
  return ({ steps }) => steps.length === stepCount;
}
```

`ToolLoopAgent` **自己没有循环**（`tool-loop-agent.ts:261-322`），只把 settings 交给 `streamText`。循环在 `stream-text.ts`：每步 = **一次 LLM 调用**；有 tool call 就执行工具，再决定要不要 `streamStep(currentStep+1)`。

评估时机：当前 step 已完成、工具已执行之后。为真则 **不再** 开下一次 LLM。

| 时刻 | `prepareStep.stepNumber` | 完成后 `steps.length` | `isStepCount(6)` |
|---|---|---|---|
| 第 1 次 LLM | 0 | 1 | false |
| 第 2 次 | 1 | 2 | false |
| 第 6 次 | 5 | 6 | **true → 没有第 7 次 LLM** |

因此：

- 一步里可以 **并行多个** tool call，仍只算一步。
- 第 6 次若仍返回 `tool-calls`：工具 **会执行**，但 **没有** 第 7 次模型去消化结果。用户可能看到工具卡片而没有最终讲解。
- 名字 `MAX_TOOL_STEPS` 容易读成「6 轮工具 + 1 次收尾 = 7 次 LLM」。**SDK 不是这样。**
- Agent 默认 `isStepCount(20)`；裸 `streamText`/`generateText` 默认 `isStepCount(1)`。旁路路由不走 Agent，默认 1 是对的。
- 本项目 `sendFinish: false` 后自己写 `{ type: "finish" }`，**丢掉** SDK 的 `finishReason`。触顶时 UI 不知道是步数上限。

`streamText` / Agent 默认 `maxRetries` 为 2。本项目显式 `maxRetries: 0`（`studyAgent.ts:150`）：端点容灾归 `createFailoverLanguageModel`，禁止把整条失败链重放三遍。

---

## 3. `/api/chat` 从 POST 到 finish 的逐步时序

文件：`app/api/chat/route.ts`（240 行）。`runtime = "nodejs"`，`dynamic = "force-dynamic"`，**无 `maxDuration`**。

### 3.1 HTTP 解析（可 400，不进 SSE）

```70:90:app/api/chat/route.ts
  body = parseChatRequest(await req.json().catch(() => ({})));
  // 失败 → HTTP 400 JSON「请求体不合法」
  modelId = body.modelId ?? (body.model === "pro" ? ENV_MODEL_PRO : body.model === "flash" ? ENV_MODEL_FLASH : undefined);
```

| 条件 | 行为 |
|---|---|
| `req.json()` 失败 | 当成 `{}` 再 parse，**不 400** |
| zod 失败 | HTTP 400，不 fetch 上游 |
| 合法 / 缺字段 | 走默认值 |

同时建立：`effectiveCustom`、`secrets[]`（自定义 key，给错误打码）、`generationAbort` + `generationSignal = AbortSignal.any([req.signal, generationAbort])`。

### 3.2 生图判定

```92:95:app/api/chat/route.ts
  isImageMode = selectedModelInfo?.type === "image"
  effectiveModelId = isImageMode ? body.imageModeTextModel : modelId
```

对话 LLM 换成文本模型（默认 `mimo-v2.5`，fallback 默认 `mimo-v2.5-pro`）。`modelId` 仍是生图模型 id，透传给 `generateImage` 卡片。`message-metadata.modelId` 成功时展示的是 **用户选的生图模型**，token 却花在文本模型上。

### 3.3 索引体检

动态 `import getIndexHealth()`，失败不阻断（`route.ts:97-102`）。检索工具仍可能被暴露。

### 3.4 SSE `execute`

| 分支 | HTTP | 流 | finish | FollowUp |
|---|---|---|---|---|
| `!provider.configured` | 200 SSE | 纯文本「AI 暂未配置」 | **无** | 无 |
| 内置模型无视觉 + 有 file part | 200 SSE | `error` | 无 | 无 |
| 自定义模型 + 图片 | **不拦截** | 继续 | — | — |
| 上游 error / abort chunk | 200 SSE | 保留部分 text + error | 无 | 被 abort 挡住 |
| 成功 | 200 SSE | start…tool…text…data…finish | 1 次 | 可能 1 次 generateText |

视觉闸门：`hasFileParts && modelInfo && !modelInfo.vision && !provider.isCustom`（`route.ts:141-143`）。自定义跳过。

### 3.5 参考材料 + 软上限（只改 system，不砍服务端 history）

```145:151:app/api/chat/route.ts
  ctxResult = await ctxManager.buildContext(chatCtx, userText)
  contextBudget = body.sessionContextBudgetTokens ?? ctxResult.maxTokens
  serverSoftLimitReached = contextBudget > 0 && ctxResult.tokenCount / contextBudget >= 0.8
  contextTruncated = body.contextTruncated || serverSoftLimitReached || ctxResult.overflow
```

三源 OR。服务端 **不** 再截 `body.messages`。历史条数只由客户端 `buildRequestMessages` 裁。

`lastUserText` 只拼 `type==="text"`，纯图提问时 `userText=""`。

### 3.6 Agent.stream 与手动转发

```168:187:app/api/chat/route.ts
  historyMessages = await toModelMessages(body.messages)
  result = await bundle.agent.stream({ messages, abortSignal: generationSignal })
  for await (chunk of result.toUIMessageStream({ sendReasoning:true, sendStart:true, sendFinish:false, onError:formatError })) {
    writer.write(chunk)
    if (chunk.type === "error" || chunk.type === "abort") {
      generationAbort.abort(); return;   // 绝不发第二次可计费 follow-up
    }
  }
  if (generationSignal.aborted) return;
```

`sendFinish: false`：丢掉 SDK 自带 finish，好在正文之后写 data parts。

空 `messages: []`（schema 默认）→ SDK `messages must not be empty`。history 含 `role: "system"` 且 `allowSystemInMessages` 默认 false → `InvalidPromptError`。schema 仍允许 system。

### 3.7 成功尾包顺序（不变量）

正文（含 tool）→ 可选 `data-followup` → `data-context-breakdown` → 可选 `data-usage` → `message-metadata` → **唯一** `finish`。

`usage` 为 0/0 时不写 `data-usage`，仍写 metadata。

### 3.8 心跳

`withSseHeartbeat`（`lib/ai/sdk/heartbeat.ts`）：首个真实 chunk 前每 15s 写 `: heartbeat\n\n`（SSE 注释，SDK 客户端忽略，但客户端字节层 `touch` 能续 stall watchdog）。首 chunk 后停。

响应头：`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no`。无 CORS。无鉴权。

---

## 4. Harness：`createStudyAgent` 每一字段

`lib/ai/agent/studyAgent.ts:61-163`。每次请求 `new` 一个实例（工具闭包捕获本次 ctx）。

| 字段 | 值 | 效果 |
|---|---|---|
| `id` | `"study-tutor"` | UA `ai-sdk-agent/tool-loop` |
| `model` | failover 包装后的 `LanguageModelV4` | 每步 `doStream` |
| `instructions` | **一条** system | 硅基 Qwen3 拒第二条 system（`studyAgent.ts:103-104`） |
| `tools` | `modelSupportsTools ? buildStudyTools : {}` | false 则空对象，不带 schema |
| `stopWhen` | `isStepCount(6)` | 见 §2 |
| `maxRetries` | `0` | 覆盖 SDK 默认 2 |
| `temperature` | `input.temperature ?? 0.6` | 路由 **不传** → 恒 0.6 |
| `prepareStep` | 见下表 | 每步 LLM 前 |
| `providerOptions` | 仅思考开启时 | 方言见 §9 |
| `maxOutputTokens` | 仅 Anthropic 思考路径 | `max(16000, budget+4096)` |
| 未设 `toolChoice` | 默认 auto | 生图由 prepareStep 覆盖 |
| 未设 `timeout` | 无 Agent 级 timeout | 首字节超时在 failover 包装器 |

### 4.1 `prepareStep` 真值表

```125:140:lib/ai/agent/studyAgent.ts
  if (toolNames.length === 0) return {};
  if (isImageMode && toolNames.includes("generateImage")) {
    return stepNumber === 0
      ? { activeTools: ["generateImage"], toolChoice: { type: "tool", toolName: "generateImage" } }
      : { activeTools: [], toolChoice: "none" };
  }
  if (runtime.imageSearchFetchedCount >= 20 && toolNames.includes("imageSearch")) {
    return { activeTools: toolNames.filter((n) => n !== "imageSearch") };
  }
  return {};
```

SDK：`activeTools == null` 才不过滤；**空数组滤成零工具**（`filter-active-tools.ts:31-37`）。`{}` 回退外层全量。

| # | 空 tools | 生图且有 generateImage | stepNumber | 搜图≥20 | 发给模型 | toolChoice |
|---|---|---|---|---|---|---|
| 1 | T | * | * | * | 无 | auto（无工具） |
| 2 | F | T | 0 | 短路 | 仅 generateImage | 强制该工具 |
| 3 | F | T | ≥1 | 短路 | **空** | none |
| 4 | F | F | * | T | 除 imageSearch | auto |
| 5 | F | F | * | F | 全量 | auto |

生图优先于搜图配额。`isImageMode` 但用户 disable 了 `generateImage`：instructions 仍要求调用一个不存在的工具。

`imageSearchFetchedCount` 在 execute 后才涨，prepareStep 在 **下一步** LLM 前跑。同一步并行多次 imageSearch 可超过 20（无锁 `+=`）。工具内另有 `already >= 20` 硬挡。

### 4.2 工具集如何挂上

`buildStudyTools`（`lib/ai/agent/tools/server.ts:44-87`）：

固定顺序（**与 `STUDY_TOOL_NAMES` 不同**）：

`getCurrentPage → getOutline → getSection → searchNotes → searchNoteImages → renderInteractive → drawDiagram → generateImage → createQuiz → writeDocument`

然后：`enableSearch` → 追加 `webSearch, imageSearch`；未 pin 技能名非空 → 追加 `useSkill`；再减 `disabledTools`。

`STUDY_TOOL_NAMES`（`names.ts:34-48`）是类型全集 13 项，含 web/image/useSkill。运行时子集由上面决定。

服务端/客户端边界：`components/**` 与 `lib/hooks/**` 禁止 import `tool.ts` / `server.ts`（eslint `no-restricted-imports`）。`tools/index.ts` 只导出类型 + presentation。卡片在 `components/chat/toolCards/`。

### 4.3 历史：UIMessage → ModelMessage（三层剥离）

1. **客户端** `toRequestMessage`（`buildRequestMessages.ts:26-37`）：只留 trim 非空 `text` 与 `file`；user attachments 再追加 file；丢掉 reasoning / tool-* / data / step-start。
2. **服务端** `toModelMessages`（`route.ts:49-56`）：再滤 `text|file`，`convertToModelMessages(..., { ignoreIncompleteToolCalls: true })`。不过滤空 text。
3. **SDK** 本可以还原 tool/reasoning；本路由在调用前已剥光，故 `ignoreIncompleteToolCalls` 基本空操作。

后果（刻意）：

- 省 token、利于把「用户/助手正文」当稳定后缀。
- **跨轮工具记忆为 0**。`loadedContextKeys` 每请求 `createToolRuntime()` 新建。
- Anthropic thinking signature 只在 **同一次** agent 循环的 step 之间回传（`chat-sdk.test.ts` 已测），不跨用户消息。
- 只有工具、没有正文的 assistant 仍会发出去，但 `parts=[]`，占软上限 16 席却几乎无信息。

user file 走 `new URL(part.url)`。附件必须是绝对 URL（含 `data:`）。非法 URL 整次转换抛错。

---

## 5. 上下文工程

### 5.1 唯一 system 的字节顺序

```
instructions
  = systemPrompt
    + (volatile ? "\n\n" + volatile : "")

systemPrompt
  = baseSystemPrompt                          // global.md（替换 {subjectName}）+ 学科 md
    [ + "\n\n---\n\n" + extras.join("---") ]

extras 顺序（有才插入）：
  1. 生图硬规则
  2. ## 全局补充上下文 + globalContext
  3. ## 已固定启用的技能 + pinned 全文
  4. ## 可调用的技能库 + 菜单（才提到 useSkill）

volatile：
  【当前位置】科目｜分类｜内容项｜主题
  + 若 truncated：【上下文策略】80% 省略参考材料
  + 否则若有参考材料：【参考材料】\n + ctxResult.context
```

`prompts/index.ts:2-3` 仍写「易变上下文放在前缀之后的**消息**里」——**已过时**。实际拼进同一条 system 尾部。测试钉死仅 1 条 system（`tests/api/chat-sdk.test.ts:101-104`）。

学科文件：`meta.promptFile ?? subjects/${id}.md`。registry **没有任何条目填 promptFile**。有 md 的 8 科：probability / physics / chemistry / anatomy / biochemistry / cell-biology / histology / instrumental-analysis。无 md（只用 global）：modern-history / maogai / other / medical-english / medical-statistics / cell-biology-lab。人文两科内容 SOP 指令最密，AI 学科段却是空的。

生产 `readMd` 用 `Map` 缓存；开发每次读盘。

### 5.2 `global.md` 信息架构（约 196 行 / 1.0–1.1 万字符）

粗算 token：Qwen 约 3.5k–4.8k；cl100k 约 5k–7k。工具策略 + 出题示例 + SVG/标签约占 70%。

| 章节 | 受众 | 问题 |
|---|---|---|
| 角色 / 教学法 / 回答结构 / 边界 | 教学 | 应留在稳定前缀 |
| 公式 KaTeX/mhchem | 渲染 | 学科 md 再重复 |
| 工具调用策略（12 项，无 useSkill） | 选工具 | **与各 `tool.ts` description 几乎逐条重复** |
| 学年科目表 | 选工具 | **写死且漏** 医学英语 / 仪分 / 医学统计 / 细胞实验 |
| 视觉优先级 | 选工具 + 渲染 | 合理，可保留短表 |
| 出题：优先 createQuiz **又** 要求 `<details>` 折叠答案 | 冲突 | L40/L65 vs L61 |
| createQuiz 1–6 题 vs schema 1–12 | 冲突 | |
| 响应标签 / `::plot` / SvgDiagram / CanvasBlock JSON | 渲染 DSL | CanvasBlock 不该出现在普通聊天前缀 |
| FollowUp「必须输出 XML」 | 控制面 | 与服务端 `data-followup` 双协议 |
| `ManimPlayer` | 过时 | 无生成工具，常死链 |
| `InteractiveVenn` / `InlineDistribution` | 概率论遗产 | 全科都能看到 |

`drawDiagram` description 只教 `mode="raw"`；chemistry / global 要求分子走 `mode="molecule"` + SMILES。

### 5.3 ContextMode

产品 UI **写死 `full`**（`ChatPanel.tsx:30-34`，`FloatingChatBody`）。semantic 全栈已通，主面板走不到。设置里 **没有** contextMode 开关。`resolveRequestSettings` 读 `options.contextMode ?? "full"`，不读 settings。

**full**（`fullContext.ts`）：

1. `## 课程目录` + 全库 `contentTree` 标题清单（模块级 `_treeSummaryCache`，合理）
2. `## 当前内容` + **当前页全文 markdown**
3. `\n\n用户提问：` + 最后一条 user 文本

**semantic**（`semanticSearch.ts`）：

1. **同样**当前页全文
2. `hybridSearch(userMessage, { topK: 5, academicYear, preferSubjectId })` → `## 语义检索相关内容`
3. 同样拼接「用户提问」
4. `cacheHit` **恒 false**；索引失败 `catch {}` 静默
5. **无**学年空结果回退（searchNotes 有）

`overflow = tokenCount > getMaxTokens`（`contextK * 1000`，缺省 128_000）。overflow **不裁剪字符串**，只置位，route 据此整段丢掉参考材料。

### 5.4 当前页双重注入 — 是

未截断时 system 已含当前页全文，`global.md` 仍要求「这一节先调 getCurrentPage」。`loadedContextKeys` **不预置**参考材料里的 key。同请求第二次才 dedupe。跨轮工具结果被剥离，下一轮再调再注入。

full 还有第三份重叠：课程目录树 vs `getOutline`。

### 5.5 80% 软上限状态机

**客户端** `estimateContextBudget`（发送前）：

```
limit = sessionContextBudgetTokens > 0 ? 已锁预算 : (contextK ?? 128) * 1000
estimated = serverContextTokens > 0
  ? lastBreakdown.total + estimateTokens(本轮用户字)
  : estimateTokens(历史文本) + 3000          // 首轮严重低估 system（global 单独 ~4k–12k 估算口径）
soft = estimated / limit >= 0.8
```

会话第一次发送锁定 `sessionContextBudgetTokens`。换到 1M 模型 **不会**升高（`tokenTracker.setCurrentContext`）。

仅当 `soft === true`：`buildRequestMessages(..., { maxTurns: 16, preserveAttachmentHistory: false })`。16 = user+assistant **条数**（约 8 轮），不是 16 轮。本地 Zustand 历史完整。

**服务端** 80% 分子是 `ctxResult.tokenCount` = **仅参考材料**（含「用户提问」），不含 global、工具 schema、对话历史。短对话 + 长教材页会过早丢掉参考材料；长对话 + 短页则完全依赖客户端。

`clientContextTokens > breakdown.total` 时把差额塞进 `conversation`（`contextBreakdown.ts:67-70`）。意图：截断后环不要「假降」。后果：**粘滞 80%**，16 条策略不会自动退出。

看板 ring **不用**上游 `usage.promptTokens`（`addUsage` 明确不覆盖 ring）。`cachedTokens` 只进费用和 TTL 倒计时，与 `breakdown.cacheHit` 无关。

### 5.6 `estimateTokens`

`lib/context/estimateTokens.ts`：CJK U+4E00–U+9FFE（**开区间，漏 U+9FFF 与扩展区**）+2；拉丁字母 +0.325；空白 +0.2；其余 +1。数字串严重高估。软上限与看板共用此函数。

### 5.7 `_contextCache` ≠ 上游 prefix cache

`fullContext.ts:37-68`：**单槽** `{ pageId, md5(fullContext) }`。`getContextManager` 每次 `new` 实例，所以用模块级变量。跨请求 / 跨用户 / 跨会话共享。并发会错报 `cacheHit`。semantic 永不命中。看板「上下文缓存」行绑的是这个布尔，不是 `usage.cachedTokens`。

### 5.8 Prefix cache 哪些稳、哪些每轮变

相对稳定（同科目、同设置、同技能集）：global（已替换课名）+ 学科 md + extras 标题 + 工具 schema（enableSearch / disabled / 技能 enum 会 bust）。

**每个 user turn 都变**：`ctxResult.context` 永远以「用户提问：本轮问题」结尾，再塞进同一条 system。用户问题在 system **和** messages 里各一份。OpenAI/Anthropic prefix cache 从左到右：稳定段仍可命中到 volatile 之前；参考材料整段及之后全部 miss。

`getOutline` 的 description **动态插入学年科目名** → 换学年 bust 工具前缀。

正确做法（未做）：用户问题只放 user message；参考材料若进 system，不要附带「用户提问」。不要拆第二条 system（Qwen 会炸）。

### 5.9 技能

| | pinned | menu（未 pin） |
|---|---|---|
| system | 全文每轮 | 仅 `- name：description` |
| useSkill | 不进 enum；execute 仍能按名找到 | `z.enum(names)` |
| 暴露工具 | 仅当 menu 非空 | 同上 |
| 跨轮 | 不依赖历史 | 工具结果被剥离 |

**每次 `/api/chat` 上传全部技能 `content`**（`useChat.ts:47`），即使未 pin 的正文不一定进模型。上限 `MAX_SKILLS = 20`。水合前发送则 `skills: []`。`updateSkill` 不能改 content。

---

## 6. 十三工具逐项

`toModelOutput` 一律 `toText`：模型只看见 `text`。UI 另有结构化字段。`dedupeByContextKey` 只改 text，结构化 hits/sources **仍在 UI output**。五个检索工具 **阻塞主 SSE**（await 完才下一步）。生成类三件（renderInteractive / generateImage / writeDocument）主循环 **不生成内容**，只发 id。

### 6.1 getCurrentPage

- toggleable：是；无卡片
- schema：`z.object({})`
- 读 `readContentMarkdown`；无 md → 占位「尚未生成」
- **只读 .md**，html/component 页会占位
- contextKey：`page:{subject}/{category}/{item}`
- 与 global：一致；global 未写占位/html

### 6.2 getOutline

- schema：`crossYear?`；true → `outline:all`，否则 `outline:{academicYear}`
- **不读 md**，扫内存 manifest；只要 `hasCapability(cat, "search")` 的板块
- description 动态 `describeSubjectsByYear()`；global 写死且漏科
- 无 execute 单测

### 6.3 getSection

- `path`（≥3 段）或 `sectionId`（当前科目 + **写死 detail**）
- **无学年闸**：任意学年路径都能读
- 缺参：`found: false`，不去重
- contextKey：`section:{s}/{c}/{i}`；无效路径也会占 key
- 无 tool 单测；chat-sdk 用它做两轮夹具

### 6.4 searchNotes

管线见 §8。要点：

- 健康检查五件套，失败文案「检索索引未加载」（有单测）
- 学年 0 命中 **自动** `all` 并标注；global 要求显式 `crossYear`
- 模型 text 最多 8 条；卡片 hits **slice(0,5)**
- contextKey：`search:{小写压空白的原始 query}`，**不含** year/subject，也不用 `normalizeSearchQuery`
- 「核糖体」与「什么是核糖体」是两个 key
- 阻塞：embed + rerank HTTP；生产空结果不再扫盘 substring

### 6.5 searchNoteImages

- **不走** BM25/向量；内存扫全部可 search md，抽 `![]()` 与 `::figure`
- `MIN_SCORE=1.2`；当前科 ×1.15；limit 默认 6 clamp 1–12
- **不**自动跨年
- 冷启动同步读大量 md；索引不写 `.index/`
- 无 `noteImages.ts` execute 测试

### 6.6 webSearch

- 仅 `enableSearch` 暴露；toggleable 可再单独关
- `POST https://open.bigmodel.cn/api/paas/v4/web_search`，`ZHIPU_API_KEY`
- 进程内 LRU：TTL 10 min，容量 100；key = `q.lower|count|domainFilter`
- 无 query 空白折叠 → 缓存 miss 与 contextKey 不一致
- 设置文案仍写「Bocha key」——**与实现（智谱）不一致**
- 无 `webSearch.ts` 单测
- 无超时 / 不接 abortSignal

### 6.7 imageSearch

- 跟 `enableSearch`；`toggleable: false`
- Unsplash `UNSPLASH_ACCESS_KEY`；无 key 返回 `[]`，**不提示配置** → 模型可空转耗尽 6 步（空结果不加配额）
- 中文 query 一律追加 ` diagram illustration`；`selectBestImages` **按 width×height 排序，不是相关度**
- 配额 20 张 / **单次 POST**，不是「一次对话」
- 去重在 fetch/计数/`trackPhotoDownload` **之后**：同 query 第二次仍打 Unsplash、仍占配额
- 无 ResultCard；`ChatMessage.tsx` 硬编码图廊，**流式中隐藏**
- 配额累加 / prepareStep 摘除 / 并行超限 **无测试**

### 6.8 useSkill

- 仅未 pin 技能菜单非空时暴露；`toggleable: false`
- `z.enum(技能名)` 利于选名；菜单增删 bust 工具 schema cache
- 正文来自本次 POST 的 `body.skills`，不读磁盘
- contextKey：`skill:{id||name}`
- global 工具表 **没有** 这一项

### 6.9 renderInteractive

- execute 返回 `artifactId = art_${toolCallId}` + title/prompt/modelId
- 生图模式注入 `unsupportedReason`
- 前端 `autoStart={!!isStreaming}` → `POST /api/artifact`
- 旁路 1 次 `streamText`，独立 `ARTIFACT_SYSTEM`，思考用 `defaultEffortFor`（**与聊天开关无关**）
- idle 12 min，`maxDuration = 720`
- 截断只补 HTML 标签，不续写
- cleanup **不 abort**（修过 StrictMode 掐死）
- 与 `components/interactives/`（手写 React）完全不相交

### 6.10 drawDiagram

- **指南，不是生成器**。拼 SVG 编写说明
- 无卡片；图出现在后续 step 正文的 `<SvgDiagram>`
- 用户点画布铅笔才打 `/api/canvas-revise`（与本工具无自动衔接）

### 6.11 generateImage

- 只发 `imageGenId = img_${toolCallId}`；**用户批准**后 `ImageGenViewer` 才 `POST /api/image-gen`
- 生图模式 step0 强制调用，之后关工具
- 旁路是 images API，180s，1～4 张
- 工具几乎总带 `modelId=聊天模型`，viewer 把 `defaultImageModelId` 置 null → `resolveImageProvider` 可能落到 Z-Image-Turbo，**跳过用户默认生图模型**（除非当前就是生图模型）
- 取消只是卡片本地状态，刷新后批准按钮会回来

### 6.12 createQuiz

- 题目在 **tool-call 参数**里（主模型 JSON）；`normalizeQuiz` 丢弃缺选项/越界
- 上限 schema 12；global 写 1–6
- 消息内 `ChatQuizCard` 本地作答，**不打 `/api/quiz`，不进 `useQuiz` store**
- `/api/quiz` 是章节静态题库，复习 Tab 用

### 6.13 writeDocument

- 只校验 spec + `documentId = doc_${toolCallId}`
- 前端 **总是**先 POST outline，即使 spec 已带 outline
- 旁路 LLM：\(1 + \sum(1+c_i),\ c_i\le 2\)（length 截断续写）
- **不开 thinking**；thinkingRequired 模型只加长超时到 ≥120s
- **无 `maxDuration`**（artifact 有 720）
- 无字数校验、过短不重写、`brief` 无文体约束、`previousTail` 1200 字串联 → **节漂移仍在**
- 工具 description 宣称导出 Word/LaTeX/PDF —— **实现只有 Markdown**；Viewer 按钮 TODO
- 0/N 卡死（effect cleanup abort）**代码已修**；刷新后 `0/3` 是半成品只读展示，**不能 resume**
- `consumeSection` 流结束无 `section-done` 仍标 `done` → 半截节可能当完成

---

## 7. 混合检索 / RAG

`searchNoteImages` 不是 RAG。底座是 `searchNotes` 与 semantic context。

### 7.1 searchNotes 管线（默认）

```
getIndexHealth（五件套，version===2，向量字节对齐）
  → normalizeSearchQuery
  → hybridSearch(topK=24)
       BM25 40  +  Vector 40
       preferSubject：先单科，<3 条再放开学年（不是 ×1.12）
       RRF k=60 → 40 候选
       rerank top_n=24（硅基 bge-reranker-v2-m3，失败试智谱）
       path 去重，snippet 400 字
  → subjectVisibleToAgent 再滤 → 截 8
  → 学年空 → 再搜 all
  → 卡片 5 / 模型 text 8
```

`contentHash` 不匹配只 warn，**仍检索**（可能用过期索引）。  
健康检查比 hybrid 更严：缺向量文件则整工具拒绝，即使 BM25 能搜。

短查询（1–2 个汉字）只扩展 **向量侧**（拼当前页标题），不进 BM25。

生产 `NODE_ENV===production` 禁用全库 substring。开发空结果会扫盘。

### 7.2 索引

- 构建：`pnpm build-index` → `content/.index/` 五件套；gitignore；桌面 `build-desktop.mjs` **保留** `.index`
- 运行时只读本地，无 COS 回退；换盘必须重启 Node（模块单例）
- embedding 构建仅硅基 `BAAI/bge-m3`；查询路径 `FailoverEmbedding` **未使用**
- `instrumentation.ts` 启动时 `getIndexHealth()`，不读 key
- `GET /api/health/search` 运维用，UI 不调；`embeddingReachable` 恒 null

### 7.3 semantic vs searchNotes

同一 `hybridSearch`，包装不同：semantic 用整句 `userMessage`、topK 5、无 queryContext、无健康门闩、无学年回退、每轮自动注入。semantic 下同一问题可能被搜两遍（隐式 RAG + 模型再调 searchNotes）。

计划 15（2026-09-08「未改代码」）多数阶段已落地；`searchScope.ts` 注释仍写「RRF 之后 ×1.12」——**注释过时**。

---

## 8. 模型接入

### 8.1 三层身份

`registryId`（菜单/计费）≠ `apiModelId`（上游 model 字段）≠ `endpoints[]`（容灾链）。

内置 8 条（含隐藏 `custom-openai` + 生图 Z-Image-Turbo）。主力对话走 relay；硅基只剩生图；智谱无对话模型（搜索/向量/重排仍用智谱 key）。

默认对话：`z-ai/glm-5.3-flash`。GLM 备用端点是 **MiMo V2.5 另一个模型**，不是同模型换网关。failover 后 `thinkingRequestStyle` 仍是 GLM 的 `openai-reasoning-effort`，不会变成 MiMo 的 `siliconflow`。

`LEGACY_REGISTRY_ALIASES` 把 MiniMax / 旧 GLM / 旧 Qwen / 旧 Kimi / 旧 DeepSeek / `mimo-v2-flash` 映射到现网 id。

### 8.2 ProviderKind 凭证

| Kind | base env | key env | 空串行为 |
|---|---|---|---|
| siliconflow | `AI_BASE_URL` | `AI_API_KEY` | 占位 `your-endpoint` 视为未配置 |
| mimo | `MIMO_BASE_URL`（有默认） | `MIMO_API_KEY` | 空串回落官方 URL |
| zhipu | 有默认 | `ZHIPU_API_KEY` | 同左；对话注册表已无 zhipu 端点 |
| relay | `RELAY_BASE_URL` **特殊** | `RELAY_API_KEY` | 见下 |

```62:66:lib/ai/provider.ts
// 桌面端会显式注入 RELAY_BASE_URL（可能为空字符串）。空字符串必须视为「未配置」，
// 不能回落到项目中转站。
const RELAY_BASE = normalizeOpenAIBaseUrl(
  "RELAY_BASE_URL" in process.env ? process.env.RELAY_BASE_URL || "" : "https://relay.protocom.org/v1",
);
```

| 情况 | 结果 |
|---|---|
| env **没有**该 key（网页未写） | 回落 `https://relay.protocom.org/v1` |
| env **有** key 值为 `""`（Electron 总是注入） | **不回落**，主力四模型 `configured=false` |

`AI_ENABLE_THINKING` 写在 `.env.example` / `electron/config.js`，**运行时对话代码未读**。

`custom-openai`：`apiModelId = RELAY_MODEL_ID`；空则未配置。菜单 `isPickerHiddenModel` **永远不列出**「自由中转」；桌面首次加载强制 `selectedModelId = "custom-openai"`。

### 8.3 自定义模型

id：`custom:{encodeURIComponent(groupId)}:{encodeURIComponent(modelId)}`。legacy `custom:{modelId}` 扫全部分组取第一个同名。

`apiProtocol` 三选一 → `autoConfigFromProtocol`：

| 协议 | 工厂 | 思考请求 | reasoning 字段 |
|---|---|---|---|
| openai（缺省） | openai-compatible | `reasoning_effort` | `reasoning` |
| anthropic | `@ai-sdk/anthropic` `/v1/messages` + `x-api-key` | `thinking.budget_tokens` | `thinking` |
| siliconflow | openai-compatible | `enable_thinking` + `thinking_budget` | `reasoning_content` |

另有 `openrouter-reasoning`、`none` 作高级 override。UI 不展开高级时不写入 override。

自定义超时 **写死 45s**。自定义 **无 endpoints failover**。`supportsTools = info?.tools !== false`（默认 true）。视觉闸门跳过自定义。

旧单对象 `CustomProvider`：固定 siliconflow 方言 + openai 协议。

生产路径 **不走** `buildThinkingRequestParams`（会把 max 压成 high、无视 thinkingEffortMap）。真实下发是 `buildThinkingSettings` → `providerOptions.upstream` spread 进 JSON。openai-compatible 的 `name: "upstream"` 是为了让未知键原样进 body。

### 8.4 思考 UI 档 → 上游

`thinkingBudget`：low=2000, medium=8000, high=16000, max=32000。

| 模型 | UI low | medium | high | max | 可关 |
|---|---|---|---|---|---|
| GLM-5.3 | `low` | 钳到 high | `high` | `max` | **否**（客户端强制；服务端 chat **不**强制） |
| Qwen3.8 | `low` | `medium` | `xhigh` | 钳到 high→`xhigh` | 是 |
| Gemini 3.7 | `low` | `medium` | `high` | 钳到 high | **否** |
| DeepSeek V4 | `low` | `medium` | `high` | 钳到 high | 是 |
| MiMo 两款 | budget 数字 + enable_thinking | | | | 是 |

Artifact 旁路会 `thinkingSettings(defaultEffortFor)`；chat 路由 `enableThinking ? settings : {}`。

响应归一化：`createReasoningNormalizingFetch` 把 thinking / reasoning_details / 结构化对象写成 `reasoning_content` 字符串；另 `extractReasoningMiddleware({ tagName: "think" })` 抽正文 `<think>`。**只包 OpenAI 兼容模型**。若模型同时发 reasoning 字段又在正文写 `<think>`，UI 可能两段思考。

### 8.5 Failover

可恢复：502/503/504；400 + 智谱 1211 / 硅基 20012 / 1210；`fetch failed|ECONNRESET|ENOTFOUND|ECONNREFUSED`；内部首字节超时。

不可恢复：401/403/429；用户 abort；链尾。

`doStream` **窥探第一个 chunk**（HTTP 200 后错误可能藏在 SSE error part）。一旦开始输出就不再切，避免两段半截拼在一起。

`includeUsage: true` 必须保持，否则流式 usage 经常为 0，`data-usage` 被跳过。

Anthropic 现只发 `x-api-key`，**不再**像旧 adapter 那样同时发 Bearer。只认 Bearer 的 One-API 可能 401。

### 8.6 接入新模型操作（压缩版）

**内置：** 在 `MODELS` 加完整 `ModelInfo` → 选 ProviderKind 与 endpoints → 填思考方言/档位/map → timeout/定价/icon → 下架写入 `LEGACY_REGISTRY_ALIASES` → 同步 `models.test.ts` → `npx tsx scripts/verify-models.ts`（只测非流式 8 token，主端点成功跳过备用，生图 skip）。内置不能走 anthropic 原生协议。

**用户分组：** 设置 → 自定义 API → name/baseUrl/apiKey → 添加模型（协议三选一 + 能力勾选）。请求体每次带上 **全部组的 apiKey**。

`scripts/verify-models.ts` 是「密钥+id 能否 chat」探针，不是能力矩阵。不要和内容树的 `check-registry-consistency.ts` 搞混。

---

## 9. 客户端发送管线

`lib/hooks/useChat.ts`（119 行编排）+ `lib/chat/executeChatRequest.ts`。

同步门控：空内容 / `loadingRef` / `canSendNow`（未水合、浮窗 session 未 loaded 拒绝）。

落库顺序：user 消息 → 首条则 `kickoffSessionTitle`（本地兜底 + 异步 `/api/chat-title`）→ 空 parts 的 assistant 占位（metadata 记下思考/搜索/模型）。

然后估预算、设 warning、`AbortController`、异步 `executeChatRequest`：

1. `hydrateForRequest`：IDB blob → data URL；abort 只拒绝等待，hydrate 仍跑完
2. 软上限则砍到 16 条、不捞早期附件
3. **此时才**建 60s stall watchdog（水合不算 60s）；每 5s 轮询；字节层 touch（含心跳注释）
4. `DefaultChatTransport` POST JSON：`{ ...ChatRequestBody, id: sessionId, messages, trigger, messageId }`
5. `consumeStudyStream`：自己持有 reader；`readUIMessageStream` 取消输出 **不会**关网，故 `source.cancel()` 关网
6. 60ms 尾随节流写 Zustand；finally flush
7. 成功则 `resolveFollowUps`（已有 followup 不动；否则抽标签；再否则本地模板）
8. error/abort **不跑**客户端追问兜底

`onUsage` 只在 consume finally 且解析到 usage 时一次。切走主会话仍记账。用户停止且从未收到 usage → 不计费；abort 前已有 usage → **仍计费**。

浮窗：`overrides.sessionId/modelId` 复用同一 hook；token 走 `useFloatingTokenTracker`；最小化卸载会 `stopGeneration`。

自定义 fetch 先于 SDK 检查 `!response.ok`；`abortSignal` 原样给 fetch，故 `abort()` **会取消 HTTP**。

---

## 10. UI：一条 assistant 消息的渲染树

`buildTrace` 原则：最后一个 tool part **之前**的 text 进思考链「进展说明」；之后才是答案。reasoning / `<think>` 永远进 trace。投影不是第二份消息库。

```
ChatMessage.assistant
├─ AgentTrace（流式自动展开，结束 160ms 折叠）
│    ├─ ReasoningTraceStep / 进展说明
│    └─ ToolTraceStep（默认跑时不展开详情）
├─ MessageContent(answerText)  ← 剥 FollowUp / think / 未闭合标签
├─ ToolResultCards: searchNotes, webSearch
├─ source-url → WebSourceFold
├─ source-document chip
├─ ToolResultCards: renderInteractive, generateImage, createQuiz, searchNoteImages, writeDocument
├─ imageSearch ImageStrip（非流式、非 registry）
└─ FollowUpQuestions（结束 + 160ms）
```

`RESULT_CARD_ORDER`（7 张，不是 `STUDY_TOOL_NAMES` 顺序）：

`searchNotes → webSearch → renderInteractive → generateImage → createQuiz → searchNoteImages → writeDocument`

无卡片、只在 trace：getCurrentPage / getOutline / getSection / drawDiagram / useSkill。imageSearch 有图廊无卡。

`TOGGLEABLE_TOOLS` 默认全开（`disabledTools: []`）。输入栏「联网搜索」默认 **关**（`defaultSearch: false`），管 webSearch+imageSearch 是否暴露。设置里 webSearch 可再单独关；imageSearch 不能。

窗口：artifact-viewer / document-viewer / image-gen-viewer / note-citation-viewer / source-trace-viewer（单例覆盖）/ source-preview（一 URL 一窗）。

来源追踪只收集 searchNotes hits + webSearch sources + source-url。**不收集** imageSearch、searchNoteImages、getSection。笔记从「来源」点是 `router.push` 笔记页；卡片「查看」是 citation 浮窗 —— 两条栈不同步。

`parseChatContent` 用 `/<FollowUp>…/` 抽出标签；检测在服务端是大小写不敏感，客户端抽取是 `<FollowUp\b` 敏感。模型若写 `<followup>`，服务端以为有标签、客户端抽不到，再走本地泛问模板。

---

## 11. 旁路生成：主循环次数 vs 旁路次数

一次「模型调用该工具一次」的典型账（不含用户重试）：

| 工具 | 主循环 LLM | execute 内 LLM | 旁路 |
|---|---|---|---|
| renderInteractive | ≥1 填参 + ≥1 说明（上限 6） | 0 | **1** streamText |
| drawDiagram | ≥1 指南 + ≥1 写 SVG | 0 | 0；铅笔才 +1 generateText |
| generateImage | ≥1 填参 + ≥1 说明 | 0 | 批准后 **1** images API |
| createQuiz | 出题那一步（参数即内容）+ 引导 | 0 | 0 |
| writeDocument | ≥1 填 spec + ≥1 说明 | 0 | **1+N+续写** |

旁路与主 Agent **提示词不共享**。文档 = 写作引擎；artifact = HTML 生成器；canvas-revise = JSON canvas block；chat-title = 20 字标题。

`POST /api/follow-ups` **生产客户端零调用**；主路径是 chat 路由内 `generateFallbackFollowUps`。两套解析器：chat 用 `|` 分隔，独立路由用 JSON 数组。

刷新：

- document：IDB 半成品只读，**不 resume**
- artifact：完成可恢复；进行中丢失，有重试按钮
- image-gen：`openIds` 不持久；`loading` 不自动重打
- title：只有首条触发

无登录鉴权。凭证 = 服务端 env 或 body 里的 `customApiGroups`。

---

## 12. 类型契约要点

`ChatMessage = UIMessage<StudyMessageMetadata, StudyDataParts, StudyTools>` + timestamp / followUpQuestions / attachments。

`StudyDataParts`：`info` / `context-breakdown` / `usage` / `followup` → `data-*`。`data-info` 标 `transient`，不落库。

风险（按严重度）：

1. `isChatToolPart` 用 `isToolUIPart`，会把 `dynamic-tool` 断言成静态 `ToolUIPart<StudyTools>`
2. 旧迁移把任意 `tool-${name}` 写成 ChatMessagePart
3. `source-url`/`source-document` 有 UI、route **未开** `sendSources`（默认 false）
4. `imageSearch` 渲染与 registry 分叉
5. `file` 用户图在 attachments 不在 parts；纯图消息 `hasVisibleContent` 可能 false
6. `StudyTools` 类型永远 13 个，运行时是子集
7. `classifyTool`：getOutline / searchNoteImages 进 conversation 不是 pages
8. 窗口 `SourceTraceViewerData.sources` 是 `unknown[]`
9. `sendFinish: false` + 中途 return → 部分正文一直 `streaming`，历史 trace 显示 interrupted（设计如此）

---

## 13. 状态、计费、密钥

| Store | persist name | 介质 | 含密钥？ |
|---|---|---|---|
| settings | `gailvlun-settings-v1` | localStorage 明文 JSON | **是**（customApiGroups[].apiKey + 派生 customApiKey） |
| skills | `skills` | IDB | 技能全文 |
| billing | `billing-history` | IDB | 否 |
| artifacts / documents / image-gen | 各 name | IDB | 否 |
| chatHistory | manifest + session/blob | IDB 自管 | 附件 blob |
| tokenTracker / floating | 不持久 | 内存 | 否 |

计费 **纯客户端**：SSE `data-usage` → `createBillingRecord`。服务端不算账。FollowUp 兜底 token **不进** `totalUsage`。`custom-openai` / 无 pricing → cost=0。生图把 `pricing.output` 当「每张价」。上限 50000 条 FIFO。汇率只影响看板美元面。

**密钥两条通道：**

1. env（桌面 `keys.enc` DPAPI → Next 子进程；Web `.env.local`）——不进 chat body
2. 请求体 `customApiGroups[].apiKey` —— **每轮 chat / artifact / document / image-gen / record / canvas-revise 全量上传所有组**

错误脱敏：`toChatErrorMessage` 替换 secrets，不序列化 requestBody/headers。不能阻止密钥出现在请求体、代理日志、localStorage、Electron `[server]` stderr。

桌面选 `custom-openai` 时 body 仍可能带上网页设置里其它分组的 key（无条件附带 `customApiGroups`）。

---

## 14. 进程与 API 边界

Agent **不是独立进程**。它是 Next Node 里一次 `ToolLoopAgent`。渲染进程不直连上游 LLM。

Electron：主进程 spawn standalone `server.js`，注入 BAKED URL + 用户 `RELAY_*`。空 `RELAY_BASE_URL` 切断项目中转回落。菜单隐藏自由中转，setup 却强制选中它。主力模型 `endpoints.provider=relay` 在桌面会打到 **用户自己的网关**，apiModelId 仍是 `z-ai/glm-5.3-flash` 等，网关上不一定有。

`instrumentation.ts`：仅 Node 启动扫索引，不读 key。

无 CORS、无 Next middleware、无登录。能访问 `127.0.0.1:35349` 的本机进程都能打这些 API，并用 env 里的中转密钥。

一次「问 AI + 开搜索 + 演示 + 生图」可能打到的端点见 §1 拓扑 + Unsplash + 智谱 web_search + embeddings/rerank。

`/api/follow-ups` 与 `/api/health/search` 对 Agent 运行时非必要。chat-title **不吃** body 自定义密钥，走 `AI_TITLE_*` → RELAY → 硅基。

---

## 15. 测试覆盖与已知债

主循环 / 流 / failover / Anthropic 签名 / 软上限 / consumeStudyStream / 浮窗隔离：**有测试，且修过真实事故**（流内 error 仍追问、缺 academicYear 400）。

明显缺口：

| 行为 | 测试 |
|---|---|
| `isStepCount(6)` 触顶、无用户 info | 无 |
| imageSearch 配额 / prepareStep 摘除 / 并行超限 / 面积排序 | 无 |
| getCurrentPage/getOutline/getSection/useSkill/drawDiagram execute | 无专用 |
| webSearch.ts / followUps.ts / contextBreakdown.ts / document.ts / quizTool.ts / noteImages.ts | 无 |
| `/api/document` 路由 | 无 |
| 内置模型 FollowUp 改用 FLASH | 无 |
| `!provider.configured` 无 finish | 无 |
| 无视觉 + file 闸门 | 无 |
| writeDocument 节漂移 / 字数 / 续写 | 无 |
| 真机 13 工具 | 计划 22 明文未做 |
| 孤立会话 GC | `listAllChatKeys` **定义了从未调用** |

生产已无 `MAX_TOOL_TURNS`、`anthropicAdapter.ts`、单文件 `lib/ai/agent/tools.ts`。文档大量仍写它们（`docs/analysis/9-9/04-ai-chat-system.md` §1/§3–§9、计划 16/17 正文、CHANGELOG）。

### 仍在的用户可见债

1. writeDocument 逐节文体漂移 + 导出撒谎 + 无 resume  
2. 孤立 `chat-session:*` 无 GC  
3. imageSearch 无关库存图（强制英文 illustration + 按像素选）  
4. 无 compaction，80% 硬切 16 条且粘滞  
5. `_contextCache` 单槽跨用户  
6. FollowUp 三层协议（XML + data-followup + 本地模板）  
7. 步数上限无提示  
8. imageSearch 配额只在单次 POST  
9. 无 `getQuizData`；Agent 题不进全局进度  
10. CJK token 开区间漏字  
11. 浮窗/顶栏「全屏」撞名  
12. writeDocument 真机按钮未点  
13. global 学年表过时；工具说明双源  
14. 用户提问双写进 system，打爆 prefix 后半  
15. 当前页预注入 + getCurrentPage 双份全文  
16. GLM→MiMo failover 方言错配  
17. 自定义密钥每轮上传 + localStorage 明文  
18. 第 6 步 tool-calls 无收尾讲解  

已修、不要再当开项：流内错误追问、academicYear 400、adapter、单文件 tools、ChatMessage 七段硬编码分发（imageSearch 画廊除外）、DocumentCard create() abort、浮窗关闭 token 泄漏（窗口层已 reset）、手写双份 `MODEL_TOKEN_LIMITS`。

---

## 16. 可持续性路线图（按杠杆，不是按框架热情）

**不要做：** 退回 XML 工具协议；把 artifact/长文档塞回主 ToolLoop 同步生成；为「更 Agent」上多 Agent 编排框架；改 `renderInteractive` 这个 id（已进 IndexedDB）。

### P0 — 上下文从堆变成管

1. `FullContextManager.buildContext` / `SemanticSearchManager.buildContext`：**不要拼接「用户提问」**。提问只存在最后一条 user。  
2. 预注入与 getCurrentPage **二选一**：要么预写 `loadedContextKeys`，要么 full 只留目录强制走工具。  
3. 软上限改成分级裁剪（先丢课程树，再丢 semantic hits，最后才丢当前页），不要整块参考材料 on/off。  
4. 删除或反转 `clientContextTokens > total` 垫高，避免粘滞 80%。服务端 80% 分子改成 system+tools+history 同类总量。  
5. 跨轮保留最近一次 getSection/searchNotes/useSkill 的 **text 摘要**（仍不回灌完整 tool JSON），或会话级 compact 笔记。空 `parts=[]` 的 tool-only assistant 不应占 16 席。

### P1 — 补全 harness

1. `prepareStep`：已调用的 getCurrentPage 从 activeTools 拿掉；最后一步 `toolChoice: "none"` 或只留 createQuiz；步数触顶写 `data-info`。  
2. 工具结果 compaction：getSection 过长时后续步只留摘要 + path。  
3. 旁路失败回主会话 data part（artifact 失败时主 Agent 已说「开始生成」）。  
4. `MAX_TOOL_STEPS` 按模型档位可配；文档改口「最多 6 次 LLM」。  
5. `_contextCache` 改 LRU Map 或删除；看板「缓存」绑 `usage.cachedTokens`。

### P1 — 提示词分层

稳定前缀只留：角色 + 教学法 + 公式硬约束 + 边界。  
工具细则只活在 `tool.ts` description/schema（单一真相）；global 留 5 行决策树。  
渲染 DSL 按学科动态注入；CanvasBlock JSON 踢出聊天。  
FollowUp：**停止要求模型输出 XML**，服务端统一 `data-followup`。  
学年表从 global 删除。人文两科补学科 md。imageSearch 限额写进 global 或只信 tool。drawDiagram description 与 chemistry 的 molecule mode 对齐。  
createQuiz 题数 global 与 schema 对齐；删 `<details>` 长示例（工具关掉再注入）。

### P2 — 模型接入产品化

1. 新供应商只加凭证 + endpoints，不改 `studyAgent`。  
2. 思考方言冻结现有五种。  
3. 自定义模型首次对话探测 tools/vision/reasoning，写回分组。  
4. GLM 备用链若换模型，方言必须跟着变，或备用改为同模型换网关。  
5. 密钥离开 chat 请求体（桌面已有 env 通道；Web BYOK 至少不要每轮传 **全部组**）。  
6. 弱工具模型减少 schema；`verify-models` 增加 stream/tools 探测。  
7. Anthropic 中转若只认 Bearer，恢复双头或文档写清。  
8. generateImage 的 `modelId` 不要用聊天模型覆盖默认生图模型。

### P3 — 旁路质量

1. writeDocument：brief 文体约束、短节重写、resume、`maxDuration`、导出或改描述。  
2. document 旁路 thinkingRequired 模型应传 thinking settings 或明确降级。  
3. 孤立会话按 manifest GC。  
4. imageSearch：相关度而不是面积；无 key 明示；配额改会话级或改文案。  
5. Agent quiz 与复习板的关系要产品决策（现在完全断开）。

### P4 — 文档与测试还债

把 `docs/analysis/9-9/04-ai-chat-system.md` §1/§3–§9 标过时或重写。计划 16/17 路径校准。补：触顶、imageSearch 配额、document 路由、followUps 解析、contextBreakdown 分桶、各 tool execute 最小夹具。

计划 22 收的是 **文件放哪**。本报告收的是 **循环语义、上下文、多模型**。下一份执行计划应叫「23+ 上下文与 harness」，不要再拆 ChatSettings。

---

## 附录 A. 关键文件地图

| 层 | 路径 |
|---|---|
| 路由 | `app/api/chat/route.ts` |
| Agent | `lib/ai/agent/studyAgent.ts` |
| Schema | `lib/ai/agent/requestSchema.ts` |
| 工具挂载 | `lib/ai/agent/tools/server.ts` `_shared.ts` `names.ts` |
| 工具实现 | `lib/ai/agent/tools/<name>/tool.ts` |
| 卡片 | `components/chat/toolCards/` |
| 提示词 | `lib/ai/prompts/global.md` `subjects/*.md` `index.ts` |
| 上下文 | `lib/context/*` |
| 模型 | `lib/ai/models.ts` `provider.ts` `upstream.ts` |
| SDK 包装 | `lib/ai/sdk/languageModel.ts` `failoverModel.ts` `heartbeat.ts` `errorMessage.ts` `reasoningNormalizer.ts` `routeGeneration.ts` |
| 客户端 | `lib/hooks/useChat.ts` `lib/chat/*` |
| 类型 | `lib/types/chat.ts` |
| 检索 | `lib/ai/search/*` `lib/ai/indexing/*` `lib/ai/embedding.ts` |
| 旁路 | `lib/ai/artifact.ts` `lib/ai/document.ts` `lib/documents/prompts.ts` |
| SDK 内核 | `node_modules/ai/src/agent/tool-loop-agent.ts` `generate-text/stop-condition.ts` `generate-text/stream-text.ts` |

## 附录 B. 常量表

| 名 | 值 | 位置 |
|---|---|---|
| `MAX_TOOL_STEPS` | 6（次 LLM） | `_shared.ts` |
| Agent 默认（未覆盖） | 20 | SDK ToolLoopAgent |
| 裸 streamText 默认 | 1 | SDK |
| `IMAGE_SEARCH_MAX_TOTAL` | 20 / 单次 POST | `_shared.ts` |
| `SOFT_LIMIT_MAX_TURNS` | 16 条 | `buildRequestMessages.ts` |
| 软上限 | 80% | 双端 |
| stall | 60s / 轮询 5s | `createStallWatchdog` |
| UI 节流 | 60ms | `streamUiThrottle` |
| SSE 心跳 | 15s | `heartbeat.ts` |
| temperature | 0.6 | studyAgent |
| FollowUp 兜底 | 10s / max 200 tokens / Flash 或 custom | `followUps.ts` |
| Artifact idle | 12 min / maxDuration 720 | `artifact.ts` |
| 生图 HTTP | 180s | `image-gen/route.ts` |
| 文档续写 | 最多 2 次/节，尾 1200 字 | `document.ts` |
| webSearch LRU | 10 min / 100 条 | `webSearch.ts` |
| MAX_SKILLS | 20 | `skills.ts` |
| 默认模型 | `z-ai/glm-5.3-flash` | `models.ts` |

## 附录 C. 与已有分析文档的关系

| 文档 | 关系 |
|---|---|
| `docs/agent-architecture-review.md` | 同主题较粗；结论一致（多步原生 FC）；缺工具逐项、RAG 分数、旁路次数公式、测试矩阵、密钥路径、isStepCount 第 6 步无收尾 |
| `docs/analysis/9-9/04-ai-chat-system.md` | §2.0 目录已校准；§1/§3–§9 仍是自制循环 / adapter / 734 行 route / 9 工具，**不要当现状** |
| `docs/plans/22-plan-agent-architecture.md` | 代码结构收敛，已执行；循环语义不在其范围 |
| `docs/plans/13-agent-sdk-known-issues.md` | 两项已修，现码仍成立 |
| `docs/refer/adding-an-agent-tool.md` | 新增工具步骤仍准；「ChatMessage 无工具名字面量」过严（imageSearch 画廊、两段 names 插队仍在） |

---

## 附录 D. 主循环 vs 旁路：一次学习动作的上限清单

```
浏览器 → POST /api/chat
浏览器 → POST /api/chat-title
  Next  → POST {relay|mimo|custom}/chat/completions     × 1–6（主循环）
  Next  → POST {flash|custom}/chat/completions          × 0–1（FollowUp）
  Next  → POST {AI_BASE}/embeddings + /rerank           （searchNotes / semantic）
  Next  → POST https://open.bigmodel.cn/api/paas/v4/web_search
  Next  → GET  https://api.unsplash.com/search/photos
浏览器 → POST /api/artifact
  Next  → POST {chat}/chat/completions                  × 1
浏览器 → POST /api/document                             × 1+N
  Next  → chat completions                              × 1+N+续写
浏览器 → POST /api/image-gen
  Next  → POST {AI_BASE|custom}/images/generations      × 1
浏览器 → GET  /api/section                              （点引用）
```

这就是「用了 Agent 架构」在本仓库里的全部含义： **单 HTTP 会话、多 LLM step、原生 tool_calls、旁路再调模型、跨轮主动失忆。** 可持续性的下一刀在上下文与 prepareStep，不在换框架。
