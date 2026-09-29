# 项目交接：Agent 架构现代化 + 思考链 Trace UI 迁移

> **状态：已完成并被取代。** 本文描述的 Agent SDK / Trace UI 迁移已由计划 `22`（Agent 架构）、`23`（UI 层归位）、`24`（记忆卡与指令解析）完成并验收，当前实现见 `docs/plans/archive/00-execution-contract.md` 第六节与 `docs/refer/rendering-architecture.md`。本文仅作历史记录保留。

## 项目基本信息

- 工作目录：`D:\projects\Dev-Tools\StudyReview-Platform`
- 仓库远程：`https://github.com/AIMFllyYS/Notebook-MedFreshman.git`
- 包名：`gailvlun`
- 框架：Next.js 16.2.9, React 19.2.7, TypeScript 5.7.3
- 包管理器：pnpm
- Node：本地 24.15.0（目标 22+ 兼容）
- 当前分支：`feat/agent-sdk-trace-ui`（从 master 切出）
- 基线分支：`master` / `dev`（已同步推送）

---

## 核心目标

1. **后端**：用 Vercel AI SDK 7（`ToolLoopAgent` + UIMessage Stream）替代原本 738 行手写 SSE 工具循环，作为统一的 Agent 架构。保留现有 provider 系统（`lib/ai/provider.ts`, `lib/ai/models.ts`）、工具业务逻辑、上下文管理、提示词拼装。
2. **前端**：把右侧 Agent 面板从"扁平卡片堆叠"（`reasoningContent` / `toolCalls` / `content` 三个独立大块）改为类似 OpenAI/Anthropic 的**时间轴思考链**：reasoning 和 tool call 按时序排列，运行中闪烁脉冲，完成后折叠为简洁摘要，最终回答和产物卡片在链下方展示。

---

## 八阶段计划与当前进度

### Step 1：SDK 层 ✅ 已完成并提交（commit `f7b7ebdc`）

已创建文件（全部有单元测试，27/27 通过）：

- `lib/ai/sdk/languageModel.ts` — `resolveLanguageModel()` 工厂：根据 `provider.apiProtocol` 选择 `@ai-sdk/anthropic` 或 `@ai-sdk/openai-compatible`，包装 `extractReasoningMiddleware` + `reasoningNormalizingFetch`，输出 `LanguageModelV4` + `thinkingSettings` + `supportsTools`
- `lib/ai/sdk/failoverModel.ts` — `createFailoverLanguageModel()`：多端点链式 failover，首字节超时切换，不可恢复错误（401/403）直接抛出
- `lib/ai/sdk/reasoningNormalizer.ts` — `createReasoningNormalizingFetch()`：把非标准思考字段（`reasoning` / `thinking` / `reasoning_details`）归一为 `reasoning_content`
- `lib/ai/sdk/heartbeat.ts` — `withSseHeartbeat()`：给 `UIMessageStreamResponse` 包一层 SSE 心跳注释，防止代理超时断连

### Step 2：消息模型迁移 ✅ 已完成并提交（commit `90bb20bf`）

- `lib/types/chat.ts` — `ChatMessage` 改为 `extends UIMessage<StudyMessageMetadata, StudyDataParts, StudyTools>`，用有序 parts 替代扁平 `content`/`reasoningContent`/`toolCalls`。新增 `StudyDataParts`（`info` / `context-breakdown` / `usage` / `followup`）和 `ContextBreakdown` 类型
- `lib/chat/messageParts.ts` — 纯函数工具集：`getMessageText` / `getAnswerText` / `getReasoningText` / `getToolParts` / `getToolPartsByName` / `hasVisibleContent` / `createUserMessage` / `createAssistantPlaceholder`；以及 `LegacyChatMessage` → parts 的迁移函数 `migrateLegacyMessage()` 和 `normalizeStoredMessages()`
- `lib/storage/chatStorage.ts` — 读库时调用 `normalizeStoredMessages()` 懒迁移旧数据
- `lib/chat/buildRequestMessages.ts` — 改为从 parts 提取 text/file 构建请求消息
- `lib/hooks/useChatHistory.ts` — 适配新类型

### Step 3：Agent 路由 🔶 后端完成，测试待清理（未提交）

#### 已创建的新文件（untracked）

- `lib/ai/agent/studyAgent.ts`（160 行）— `createStudyAgent()` 工厂：
  - 拼装 system prompt（稳定前缀 + 易变上下文合并为单条 system，利于 prefix 缓存）
  - 技能菜单 / 固定技能 / 全局补充上下文注入
  - 生图模式硬性规则 + `prepareStep` 动态收窄工具（首步强制 `generateImage`，之后关闭工具）
  - `imageSearch` 配额耗尽后自动移除
  - `contextTruncated` 时省略参考材料
  - 返回 `StudyAgentBundle { agent: ToolLoopAgent, promptParts, tools, runtime }`

- `lib/ai/agent/tools.ts`（472 行）— `buildStudyTools()` 构建 9 个 AI SDK `tool()` 定义：
  - `getCurrentPage` / `getOutline` / `getSection` / `searchNotes` / `webSearch` / `imageSearch` / `renderInteractive` / `drawDiagram` / `generateImage` / `useSkill`
  - 每个工具有 `toModelOutput` 只回灌 `text`（其余字段供前端展示）
  - `contextKey` 去重（同一上下文二次加载只回"已加载"提示）
  - `imageSearch` 跨调用配额追踪（`IMAGE_SEARCH_MAX_TOTAL = 20`）
  - `MAX_TOOL_STEPS = 6` 安全上限

- `lib/ai/agent/requestSchema.ts`（82 行）— zod 校验 `chatRequestSchema`，宽松策略（未知字段忽略），兼容旧式 `model:'flash'/'pro'`

- `lib/ai/agent/contextBreakdown.ts`（75 行）— `computeContextBreakdown()` 按真实拼装精确计算各分项 token（tools/skills/conversation/pages/webSearch）

- `lib/ai/agent/followUps.ts`（68 行）— `generateFallbackFollowUps()` 用 `generateText` 轻量生成追问；自定义模型沿用自身，内置模型改用 flash 省钱；10s 超时 + 任何失败返回空数组

- `lib/ai/agent/studyAgent.test.ts`（152 行）— 5 个测试，**全部通过** ✅：
  1. 工具循环 → UI 流包含 reasoning / tool-input / tool-output / text，usage 跨步累加
  2. 同一 contextKey 二次加载只回"已加载"提示
  3. 生图模式首步强制 generateImage，之后关闭工具
  4. 技能菜单进入 instructions 且 useSkill 以 enum 暴露；enableSearch 控制联网工具
  5. 模型不支持工具时 tools 为空；软上限时 instructions 省略参考材料

- `lib/ai/agent/toolTypes.ts` — `StudyTools` 类型定义 + 各工具 Output 接口

#### 已修改的文件

- `app/api/chat/route.ts` — **从 738 行重写为 ~200 行**（-730 行）：
  - 用 `parseChatRequest()` 校验请求体
  - 用 `resolveLanguageModel()` 解析模型（含 failover 链）
  - 用 `createStudyAgent()` 构建 Agent
  - 用 `convertToModelMessages()` 转换历史（`ignoreIncompleteToolCalls: true`）
  - 手动转发 `toUIMessageStream()` chunk（保证 usage/breakdown/followup 等 data part 在 finish 之前）
  - `mapUsage()` 把 AI SDK v7 嵌套 usage（`inputTokens: {total, noCache, cacheRead, cacheWrite}`）映射为项目的 `UsageSummary`（`promptTokens`/`completionTokens`/`cachedTokens`/`totalTokens`）
  - `withSseHeartbeat()` 包裹响应

- `lib/ai/sdk/languageModel.ts` / `failoverModel.ts` / `failoverModel.test.ts` — 微调适配
- `lib/chat/messageParts.ts` — 修补 `getToolPartsByName` 等
- `lib/types/chat.ts` — 兼容性导出补充

### Step 4：useChat 迁移 ⬜ 未开始（17 个 TS 错误）

`lib/hooks/useChat.ts`（486 行）目前仍是**手写 SSE 解析**：

- 用 `parseSseJsonEvents<ChatSseEvent>` 手动解析旧事件类型（`content`/`reasoning`/`tool`/`usage`/`context_breakdown`/`followup`/`error`/`done`）
- 用 `contentBuf` / `reasoningBuf` / `toolCallsMap` 手动累积
- 用 `splitThinkContent` 拆内嵌 `<think>` 标签
- 用 `createStreamUiThrottle` 节流 UI 更新
- 构建旧式 `{ content, reasoningContent, toolCalls }` 消息

**需要改为：**

- 用 `DefaultChatTransport` 发送请求（自动序列化 UIMessage）
- 用 `readUIMessageStream` 解析 AI SDK UI 流 chunk（`text-delta` / `reasoning-delta` / `tool-input-available` / `tool-output-available` / `data-usage` / `data-context-breakdown` / `data-followup` 等）
- 从 UIMessage parts 构建 `ChatMessage` 快照写入 Zustand
- 保留：Zustand 作为持久化真相源、IndexedDB 存储、token tracker、billing、floating chat、stall 检测、abort、标题生成
- 保留划词浮窗 overrides 机制（`sessionId` / `modelId`）

### Step 5：Trace UI ⬜ 未开始（42 个 TS 错误）

需要新建和重写的组件：

- `lib/chat/buildTrace.ts`（新）— 从 `ChatMessage.parts` 构建时间轴步骤数组（reasoning step / tool step / text step）
- `components/chat/AgentTrace.tsx`（新）— 垂直轨道 + 圆点 + 步骤列表
- `components/chat/AgentTraceStep.tsx`（新）— 单步：运行中 shimmer/pulse，完成后折叠摘要
- 工具步骤子组件（新）— 紧凑可展开行，展示工具名/参数/结果摘要
- reasoning 步骤子组件（新）— 可折叠思考文本
- 重写 `components/chat/ChatMessage.tsx`（185 行）— 用 `AgentTrace` 替代 `ProcessingSteps` + `ReasoningBlock` + `ToolCallDashboard`
- 重写 `components/chat/ProcessingSteps.tsx`（47 行）— 可能直接删除或改为 `AgentTrace` 的薄包装
- 重写 `components/chat/ToolCallDashboard.tsx`（380 行）— 工具卡片逻辑迁入 trace 步骤
- 产物卡片（`ArtifactCard` / `ImageGenCard` / `ImageGenViewer` / `WebSearchResults`）保留，但从 trace 内部移到最终回答下方

设计要求：

- Tailwind v4 + 现有 MD3 CSS 变量（`--md-sys-color-*`）
- framer-motion 动画
- 无 shadcn 依赖
- 响应式（右侧面板 + 浮窗）
- 可访问的折叠按钮

### Step 6：其他 LLM 路由迁移 ⬜ 未开始

需要把以下路由改为用 `resolveLanguageModel()`（在协议和响应格式允许时）：

- `app/api/artifact/route.ts`
- `app/api/record/route.ts`
- `app/api/chat-title/route.ts`
- `app/api/follow-ups/route.ts`
- `app/api/canvas-revise/route.ts`

`app/api/image-gen/route.ts` 是例外——响应格式是 SiliconFlow 特有的 `images[]`，可保留专用 fetch。

### Step 7：清理与文档 ⬜ 未开始

- 删除 `lib/ai/anthropicAdapter.ts`（已被 `@ai-sdk/anthropic` 替代，确认无引用后）
- 删除 `lib/ai/agent/scratch-tool.ts`（调试用临时文件）
- 删除 `components/chat/Message.tsx`（如确认未使用）
- 清理旧 CSS（嵌套卡片样式）
- 更新 `CHANGELOG.md` / `docs/plans/13-*` / `docs/plans/README.md` / `README.md`
- 更新 `AGENTS.md`（如有）

### Step 8：全量验证 ⬜ 未开始

详见下方"深度测试要求"。

---

## 当前测试与类型状态

### TypeScript：59 个错误，全部在 Step 4/5 范围

```
23  components/chat/ChatMessage.tsx       — 还在用 content/reasoningContent/toolCalls/ToolCallBlock
17  lib/hooks/useChat.ts                  — 同上 + 手写 SSE 解析
10  components/chat/ProcessingSteps.tsx    — 同上
 9  components/chat/ToolCallDashboard.tsx  — 同上
```

这些都是因为 Step 2 把 `ChatMessage` 改成了 UIMessage parts 结构，但 Step 4/5 的消费端还没改。**不是 bug，是未完成的工作。**

### 单元测试：2189 tests, 2182 pass, 7 fail

6 个失败是**静态源码扫描测试**（用正则匹配 `route.ts` 源码字符串），断言旧实现的模式已不存在：

| 文件 | 失败数 | 原因 |
|------|--------|------|
| `tests/customProviderCompatibility.test.ts` | 4 | 断言 route.ts 含 `extractReasoningDelta` / `buildThinkingRequestParams` / `artifactModelId` / `tool_choice = isImageMode` 等旧模式。这些逻辑已迁入 `studyAgent.ts` / `languageModel.ts` |
| `tests/contextTruncationPolicy.test.ts` | 2 | 断言 route.ts 含 `clientContextTruncated` 等旧字段名 |
| `tests/content/sophomore-textbooks.test.ts` | 1 | **预存在的内容测试失败**（cell-biology/ch08-4 图题无图），与本次迁移无关，不要修 |

**这 6 个测试需要更新**：把正则改为扫描新位置（`studyAgent.ts` / `languageModel.ts`），或删除已不适用的断言。

### studyAgent.test.ts：5/5 通过 ✅

---

## 关键架构决策（必须遵守）

1. **Zustand + IndexedDB 是客户端消息真相源**——不要用 AI SDK 的 `useChat` state 替代持久化。AI SDK transport/stream 只作为集成层。
2. **旧会话必须可读**——IndexedDB 里的旧 `{ content, reasoningContent, toolCalls }` 格式通过 `migrateLegacyMessage()` 懒迁移，不要破坏性替换。
3. **provider 系统保留**——`lib/ai/provider.ts` 的 `resolveProvider` / `resolveNextProvider` / `thinkingBudget` / `chatCompletionsUrl` 和 `lib/ai/models.ts` 的模型注册表是业务基础设施，AI SDK 层是适配器不是替代品。
4. **系统提示词拼装顺序不变**——稳定前缀（global + 学科 + 用户设置）+ 易变上下文（定位 + 参考材料）合并为单条 system，多轮间逐字节一致以命中 prefix 缓存。
5. **工具 `toModelOutput` 只回灌 `text`**——output 的其余字段（`sources` / `artifactId` / `imageGenId` / `contextKey` 等）供前端展示，不回灌模型。
6. **生图模式两步走**——首步强制 `toolChoice: generateImage`，之后 `toolChoice: none` 让模型写说明文字。
7. **不要 reset 或 force-clean 仓库**——分支上有已提交的工作和未提交的 Step 3 改动。
8. **预存在的内容测试失败不要修**——`tests/content/sophomore-textbooks.test.ts` 的失败是已知问题。

---

## AI SDK v7 关键 API

已安装：`ai@7.0.85`, `@ai-sdk/anthropic@4.0.46`, `@ai-sdk/openai-compatible@3.0.41`, `zod@4.4.3`, `@ai-sdk/provider@4.0.9`

- `ToolLoopAgent` — Agent 循环（`stopWhen: isStepCount(MAX_TOOL_STEPS)`）
- `tool({ description, inputSchema, execute, toModelOutput })` — 工具定义
- `createUIMessageStream` / `createUIMessageStreamResponse` — 服务端 UI 流
- `DefaultChatTransport` — 客户端传输层
- `readUIMessageStream` — 客户端流解析
- `convertToModelMessages` — UIMessage → ModelMessage（支持 `ignoreIncompleteToolCalls`）
- `wrapLanguageModel` + `extractReasoningMiddleware` — 内嵌 `<think>` 标签抽取
- `generateText` — 非流式生成（followUps 用）
- UI 流 part 类型：`text-start/delta/end`, `reasoning-start/delta/end`, `tool-input-start/delta/end/available`, `tool-output-available/error`, `start-step`, `finish-step`, `start`, `finish`, `error`, `data-*`, `message-metadata`

**AI SDK v7 usage 是嵌套结构**：`inputTokens: { total, noCache, cacheRead, cacheWrite }`, `outputTokens: { total, text, reasoning }`。`mapUsage()` 已处理映射。

---

## 需要完成的工作（按顺序）

### 第一优先：清理 Step 3 遗留

1. 更新 `tests/customProviderCompatibility.test.ts` 的 4 个失败测试——把正则改为扫描 `studyAgent.ts` / `languageModel.ts` 中的新模式（`extractReasoningMiddleware` 替代 `extractReasoningDelta`、`buildThinkingSettings` 替代 `buildThinkingRequestParams`、`prepareStep` 中的 `toolChoice` 替代 `reqBody.tool_choice` 等）。或者删除不再适用的断言。
2. 更新 `tests/contextTruncationPolicy.test.ts` 的 2 个失败测试——同理。
3. 确认 `studyAgent.test.ts` 仍然 5/5 通过。
4. 运行 `pnpm test:unit` 确认只剩 1 个预存在的内容测试失败。

### 第二优先：Step 4 — useChat 迁移

1. 把 `useChat.ts` 的手写 SSE 解析替换为 `DefaultChatTransport` + `readUIMessageStream`。
2. 从 UIMessage parts 构建 `ChatMessage` 快照写入 Zustand（保留节流、stall 检测、abort）。
3. 处理 data part：`data-usage` → tokenTracker + billing；`data-context-breakdown` → tokenTracker；`data-followup` → followUpQuestions；`data-info` → 瞬时提示。
4. 保留划词浮窗 overrides（`sessionId` / `modelId`）。
5. 保留标题生成、附件水合、上下文软上限估算。
6. 解决 `useChat.ts` 的 17 个 TS 错误。

### 第三优先：Step 5 — Trace UI

1. 创建 `lib/chat/buildTrace.ts` — 从 parts 构建时间轴步骤。
2. 创建 `AgentTrace` / `AgentTraceStep` 组件族。
3. 重写 `ChatMessage.tsx` 用 `AgentTrace` 替代旧组件。
4. 重写或删除 `ProcessingSteps.tsx` / `ToolCallDashboard.tsx`。
5. 产物卡片移到最终回答下方。
6. 解决 42 个 TS 错误。
7. 添加 UI 组件测试（Vitest `.test.tsx`）。

### 第四优先：Step 6 — 其他路由迁移

### 第五优先：Step 7 — 清理与文档

### 第六优先：Step 8 — 全量验证

---

## 深度测试要求（必须执行）

在宣布任何阶段完成之前，必须执行以下全部验证：

### 1. TypeScript 严格检查

```powershell
pnpm exec tsc --noEmit
```

必须 0 错误。当前 59 个错误是 Step 4/5 未完成的预期状态，完成后必须清零。

### 2. 单元测试

```powershell
pnpm test:unit
```

即 `node scripts/run-unit-tests.mjs`，运行所有 `*.test.ts`（不含 `.test.tsx`）。

- 预期：除 `tests/content/sophomore-textbooks.test.ts` 的 1 个预存在失败外，全部通过。
- `studyAgent.test.ts` 必须 5/5。
- SDK 层测试（`failoverModel` / `heartbeat` / `languageModel` / `reasoningNormalizer`）必须全通过。
- `messageParts.test.ts` / `buildRequestMessages.test.ts` / `chatStorage.migrate.test.ts` 必须全通过。

### 3. React 组件测试

```powershell
pnpm test:react
```

即 `vitest run --passWithNoTests`，运行所有 `*.test.tsx`。
Step 5 完成后应新增 `AgentTrace` 相关组件测试。

### 4. 全量测试

```powershell
pnpm test
```

= `test:unit` + `test:react`。必须全通过（除预存在的内容测试失败）。

### 5. Lint

```powershell
pnpm lint
```

必须 0 error。

### 6. 构建

```powershell
pnpm build
```

必须成功。这会触发 Next.js 生产构建，验证服务端/客户端代码都能编译。

### 7. 端到端手动验证场景（Step 8）

在 dev server 上逐项验证：

- 主对话 + reasoning 流式展示
- 多步工具循环（`getSection` → 回答）
- `webSearch` 返回 sources 卡片
- `imageSearch` 返回图片画廊
- `searchNotes` 返回搜索结果
- `renderInteractive` 生成 artifact 卡片 + 独立生成流
- `generateImage` 批准卡片 → 用户批准 → 生图
- 附件（图片）上传 + 视觉模型识别
- Anthropic 自定义 provider（thinking + tool use）
- OpenAI-compatible 自定义 provider
- provider failover（主端点 503 → 备用）
- 划词浮窗独立对话
- 历史会话水合（旧格式懒迁移）
- 移动端 / 右侧面板布局
- 思考链完成态折叠 + 运行态 shimmer

### 8. 回归检查

- 旧会话（含 `content`/`reasoningContent`/`toolCalls` 的 IndexedDB 数据）能正常加载和显示。
- 划词浮窗的 token 看板不与主面板互相污染。
- 计费记录正确写入。
- 会话标题自动生成。
- 上下文软上限触发时只发最近消息。
- 生图模式不暴露 artifact 工具。

---

## 重要文件索引

### 已完成且稳定（不要改动）

- `lib/ai/sdk/languageModel.ts` — 模型工厂
- `lib/ai/sdk/failoverModel.ts` — failover 包装
- `lib/ai/sdk/reasoningNormalizer.ts` — 思考字段归一化
- `lib/ai/sdk/heartbeat.ts` — SSE 心跳
- `lib/ai/agent/studyAgent.ts` — Agent 工厂
- `lib/ai/agent/tools.ts` — 工具定义
- `lib/ai/agent/requestSchema.ts` — 请求校验
- `lib/ai/agent/contextBreakdown.ts` — 上下文统计
- `lib/ai/agent/followUps.ts` — 追问兜底
- `lib/ai/agent/toolTypes.ts` — 工具类型
- `lib/chat/messageParts.ts` — parts 工具函数
- `lib/types/chat.ts` — 消息类型
- `app/api/chat/route.ts` — 重写后的路由

### 需要修改（Step 4/5）

- `lib/hooks/useChat.ts`（486 行）— 手写 SSE → AI SDK transport
- `components/chat/ChatMessage.tsx`（185 行）— 卡片堆叠 → AgentTrace
- `components/chat/ProcessingSteps.tsx`（47 行）— 重写或删除
- `components/chat/ToolCallDashboard.tsx`（380 行）— 逻辑迁入 trace 步骤

### 需要更新测试

- `tests/customProviderCompatibility.test.ts` — 4 个失败
- `tests/contextTruncationPolicy.test.ts` — 2 个失败

### 保留不动的业务基础设施

- `lib/ai/provider.ts` — `resolveProvider` / `resolveNextProvider` / `thinkingBudget`
- `lib/ai/models.ts` — 模型注册表
- `lib/ai/tools.ts` — 旧工具定义（`studyAgent.ts`/`tools.ts` 已替代，但其他地方可能还引用）
- `lib/ai/prompts/` — `global.md` + 学科提示词
- `lib/context/` — 上下文管理器
- `lib/storage/chatStorage.ts` — IndexedDB 持久化
- `lib/hooks/useChatHistory.ts` — Zustand 会话/消息状态

### 可删除（Step 7 确认无引用后）

- `lib/ai/anthropicAdapter.ts` — 已被 `@ai-sdk/anthropic` 替代
- `lib/ai/agent/scratch-tool.ts` — 调试临时文件

---

## Git 操作注意事项

- 使用 PowerShell 语法，不要用 bash heredoc（`<<'EOF'` 在 PowerShell 会报解析错误）。如需多行 commit message，写到临时文件后 `git commit -F 文件路径`。
- 不要 reset 或 force-clean 工作区——有未提交的 Step 3 改动。
- 不要 push 除非用户明确要求。
- commit message 格式：`type(scope): 中文描述`，末尾加 Devin co-author。
- 不要修改 git config。
- 不要用 `-i` 交互式标志。

---

## 开始工作前的检查清单

1. 确认在 `feat/agent-sdk-trace-ui` 分支：`git branch --show-current`
2. 确认工作区状态：`git status --short`（应有 6 个 modified + 6 个 untracked）
3. 运行 `pnpm exec tsc --noEmit` 确认 59 个错误都在 Step 4/5 文件
4. 运行 `pnpm test:unit` 确认 7 个失败（6 个静态扫描 + 1 个预存在内容）
5. 运行 `studyAgent.test.ts` 确认 5/5 通过

然后从"第一优先：清理 Step 3 遗留"开始。
