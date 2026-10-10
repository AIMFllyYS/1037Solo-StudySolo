# Agent 架构深度分析报告

> 范围：StudyReview-Platform 学习助教 Agent 全链路（route → agent → tools → 模型接入 → 上下文工程），
> 并对照 DeepSeek-Harness（DSH）评估"harness 层"的工程质量。
> 代码依据：`app/api/chat/route.ts`、`lib/ai/agent/*`、`lib/ai/sdk/*`、`lib/ai/provider.ts`、
> `lib/ai/models.ts`、`lib/context/*`、`lib/ai/prompts/*`、`lib/chat/*`。

---

## 0. 一句话结论

当前架构是 **"单 HTTP 请求 / 服务端多步工具循环"** 模式：客户端每条消息发 1 次 `POST /api/chat`，
服务端用 Vercel AI SDK v7 的 `ToolLoopAgent` 做**原生 function calling 多步循环**（最多 6 步），
整条循环封装在一条 SSE 流里返回。这已经不是"提示词约定 + 输出尾部解析"的自制 Agent 协议，
而是业界规范的实现，工程质量整体偏高。主要短板在**长上下文治理（无 compaction）**和
**多租户/并发下的模块级缓存语义**。

---

## 1. 整体调用模型：单次还是多次？

### 1.1 实际调用拓扑

```
用户发送消息
  └─ 1 × POST /api/chat  ────────────────────────────── 唯一的 HTTP 请求
       └─ route.ts
            ├─ resolveLanguageModel()          解析模型 + 组装 failover 链
            ├─ ctxManager.buildContext()       构建参考材料（full / semantic）
            ├─ createStudyAgent()              创建 ToolLoopAgent
            └─ agent.stream({ messages })
                 └─ ToolLoopAgent 内部循环（对上游 LLM 的多次 API 调用）：
                      Step 0: LLM → 返回 tool_call(s)
                              → SDK 执行工具 → tool result 追加进 messages
                      Step 1: LLM（带着新上下文）→ 可能再调工具 …
                      …最多 MAX_TOOL_STEPS = 6 步（isStepCount 停止条件）
                 每步都可能触发 failoverModel 的端点切换（首字节超时/5xx）
       └─ 循环结束后（仍在同一 SSE 流内）：
            ├─ FollowUp 兜底：模型没输出 <FollowUp> 标签 → 额外 1 次轻量 generateText
            ├─ data-context-breakdown（token 分项统计）
            ├─ data-usage / message-metadata
            └─ finish
```

**结论**：
- 对客户端：**单次调用**，一条 SSE 流。
- 对上游 LLM API：**多次调用**（1～6 次主循环 + 0～1 次 FollowUp 兜底 + failover 重试）。
- 触发新调用的机制是 SDK 解析**原生 tool_calls**（不是解析文本尾部约定），
  上下文补充靠把 tool result 以标准 tool 消息追加进对话，符合 OpenAI/Anthropic 规范。

### 1.2 与"自制协议"的对比

| 维度 | 自制提示词协议（你描述的方式） | 当前实现（ToolLoopAgent） |
|---|---|---|
| 工具调用载体 | 文本约定（写在输出下方） | 原生 `tool_calls` 字段 |
| 解析可靠性 | 脆（格式漂移、截断） | SDK 结构化解析 |
| 循环驱动 | 手写解析+再请求 | `stopWhen: isStepCount(6)` |
| 步间控制 | 无 | `prepareStep` 每步动态收窄工具/强制 toolChoice |
| 流式 | 难做 | 逐步流式，reasoning/tool part 原生透出 |

### 1.3 循环内的动态控制（prepareStep）

`studyAgent.ts` 的 `prepareStep` 是这个架构里很精巧的一环：
- **生图模式**：step 0 只暴露 `generateImage` 并强制 `toolChoice`，后续步 `toolChoice: "none"`
  让模型写说明文字（避免强制选择在每步重复触发）。
- **imageSearch 配额**：`runtime.imageSearchFetchedCount >= 20` 后从 activeTools 摘除。

这是"按步数编程"的能力，未来做多阶段工作流（规划→执行→反思）也走这里。

---

## 2. 分层架构详解

### 2.1 Route 层 `app/api/chat/route.ts`（240 行，职责干净）

- `parseChatRequest`（zod schema）→ 模型解析（modelId / 旧 flash·pro 兼容 / 生图模式切换文本模型）
- 上下文构建 + 80% 软上限判定（双端：客户端 `estimateContextBudget` + 服务端 `serverSoftLimitReached`）
- **手动转发流**而非 `writer.merge`：保证 usage/breakdown/followup 严格排在正文之后；
  遇到 error/abort chunk 立即 `generationAbort.abort()`，**绝不发起第二次计费请求**（注释明确写了这条纪律）。
- `withSseHeartbeat` 保活；`toChatErrorMessage` 对所有错误做 **API key 脱敏**（secrets 列表过滤）。

### 2.2 Agent 层 `lib/ai/agent/studyAgent.ts`

- 每请求创建一个 ToolLoopAgent（工具以闭包捕获请求上下文，成本可忽略）——无状态共享风险，正确。
- prompt 拼装分**稳定前缀**（global + 学科 + 用户设置）与 **volatile 段**（当前定位 + 参考材料），
  合并为**单条 system**（注释：硅基流动 Qwen3 对第二条 system 报错）——逐字节稳定，利于 prefix cache。
- `maxRetries: 0`：重试完全交给 failover 链，避免整链失败后 SDK 再放大 3 倍请求（特别是本地权限/网络错误）。

### 2.3 工具层 `lib/ai/agent/tools/*`（13 个工具）

```
getCurrentPage / getOutline / getSection / searchNotes / searchNoteImages   — 内容读取
webSearch / imageSearch                                                     — 联网（enableSearch 门控）
renderInteractive / drawDiagram / generateImage                             — 可视化生成
createQuiz / writeDocument                                                  — 结构化产出
useSkill                                                                    — 技能按需加载
```

- **目录式模块**：每个工具 `tool.ts`（服务端）+ `presentation.ts`（客户端卡片）+ `types.ts`，
  服务端入口 `tools/server.ts` 明确禁止客户端导入——边界清晰。
- `StudyToolRuntime`：同一请求内跨工具的可变状态（imageSearch 计数、**contextKey 去重**——
  同一页面已在工具链注入过就只回"已加载"提示，防止重复展开全文浪费 token）。
- `useSkill` 的"菜单进 prompt、正文按需加载"模式是工具上下文工程的范本（见 §4 推广建议）。

### 2.4 模型层（本报告 §5 详述）

`languageModel.ts` 是工厂：provider.ts 解析凭证 → openai-compatible / anthropic 两种 SDK provider
→ `extractReasoningMiddleware`（抽正文内嵌 `<think>`）→ `reasoningNormalizer`（归一化非标准思考字段）
→ `failoverModel`（端点链容灾）。

---

## 3. 上下文工程（Context Engineering）评估

### 3.1 做得好的地方（保留并发扬）

1. **Prefix-cache 感知的 prompt 分层**（最亮点）
   - 稳定前缀逐字节一致：`global.md` + `subjects/<id>.md` + skills（按 createdAt 稳定排序）；
   - 易变内容（当前定位行、参考材料、截断说明）只放在前缀**末尾**；
   - 模型注册表里维护了 `cacheTtlSec` 和 `cachedInput` 定价——缓存是可观测、可计价的。
2. **单条 system 消息**：规避了部分上游（硅基流动 Qwen3）对多 system 的报错。
3. **80% 软上限双端协同**：客户端 `estimateContextBudget` 提前预警并只发最近消息；
   服务端独立再判一次（`serverSoftLimitReached`），截断时 system 里明确告知模型"本次省略参考材料"。
4. **contextKey 去重**：工具结果在同一轮工具链内不重复注入全文。
5. **ContextBreakdown 精确分项**：tools/skills/conversation/pages/webSearch 五桶 token 统计
   由服务端按真实拼装计算并回传前端看板——上下文工程可观测性的标配，很多产品没有。
6. **语义检索模式可选**：`SemanticSearchManager` 在当前页全文之上注入 hybrid search topK=5 的 chunk，
   失败静默降级（索引不可用不阻断对话）。

### 3.2 问题与风险（按严重度排序）

**P0 — 无 compaction，长对话靠硬截断**
- 历史消息全量重发（客户端剥离了 reasoning/tool parts，但正文历史仍然全量）；
  达到 80% 后策略是"只发最近消息"的**硬截断**——早期上下文直接丢失，无摘要替代。
- 对照 DSH：它有专门的 `packages/compaction` 包。建议引入滚动摘要：
  当估算超过 60% 时，后台用 flash 模型把最旧的一半历史压缩成 summary 消息替换，
  保留最近 N 轮原文。这比硬截断的体验好一个量级，且成本极低。

**P1 — 模块级单槽缓存在并发下语义错误**
- `fullContext.ts` 的 `_contextCache` / `_treeSummaryCache` 是**单槽模块级变量**：
  多用户、多标签页并发时互相覆盖，`cacheHit` 判定会抖动错报（目前只影响展示，但语义已错）。
- 建议改为以 `pageId` 为 key 的小 LRU Map（或至少 keyed by pageId 的 Map）。
- 同理 `_treeSummaryCache` 是进程级正确的（目录不变），这个没问题。

**P2 — `readContentMarkdown` 每次请求同步读文件**
- 每个 chat 请求都同步 fs 读当前页 markdown。建议按 (path, mtime/hash) 做内容缓存，
  生产环境可直接全量缓存（内容构建后不变），与 prompts 的 `readMd` 缓存策略对齐。

**P3 — 工具 schema 全量常驻**
- 10+ 个工具的 description + JSON schema 每次请求都发（`toolDefsTokens` 已在统计，可观察其占比）。
  目前量级可接受，但随着工具增多会成为 prefix cache 的负担前缀。
- 中期方案：把 `useSkill` 的"菜单 + 按需加载"模式推广为**工具检索**（tool search）：
  常驻 5 个核心工具 + 1 个 `discoverTools` 元工具，按需激活。DSH 的 skill 包也是类似思路。

**P4 — 步数预算无 token/成本维度**
- `MAX_TOOL_STEPS = 6` 只限步数。一个 step 可以注入整页教材（getSection 全文）。
  可在 `prepareStep` 里加"累计工具输出 token 预算"：超过阈值后收窄到只读工具或直接终止循环。

**P5 — FollowUp 双协议并存**
- 主路径靠模型自觉输出 `<FollowUp>` 标签（提示词纪律），失败后用 generateText 兜底。
  两个协议并存意味着两套解析。可以接受（兜底很便宜），但更干净的做法是：
  永远走兜底（flash 模型生成），提示词里删掉标签要求——主模型输出更自由，行为反而更稳定。

---

## 4. Harness 层评估：项目内 harness vs DeepSeek-Harness

### 4.1 项目内的 "harness"（route + studyAgent + sdk 层）做得怎么样

**总评：垂直场景里的高水准实现。** 具体亮点：

| 能力 | 实现 | 评价 |
|---|---|---|
| 流式保活 | `withSseHeartbeat` + 客户端 `createStallWatchdog` | 双端都有，生产级 |
| 错误脱敏 | `toChatErrorMessage(error, secrets)` 过滤所有 API key | 很多项目漏掉，这里做了 |
| 取消传播 | `AbortSignal.any([req.signal, generationAbort])` 一路传进 agent/工具/兜底 | 正确且彻底 |
| 容灾 | `failoverModel`：只在"未产出任何 chunk"时切换（防半截回答拼接）；首字节超时可按模型配 | 设计严谨 |
| 计费纪律 | error 后 abort + `maxRetries: 0`，绝不重复计费 | 注释里写明了意图 |
| 可观测 | usage / context-breakdown / cacheHit / duration 全部以 data part 回传 | 完备 |
| 测试 | agent/tools/sdk/context 大量 *.test.ts | 覆盖扎实 |

### 4.2 对照 DeepSeek-Harness（DSH）

DSH 是 DeepSeek 官方通用 agent harness（cordis 全插件化，~45 个包：`compaction`、`goal`、
`subagent`、`jobs`、`sandbox`、`mcp`、`skill`、`workflow`、`session`、`llm` 等）。

| 维度 | 项目内 harness | DSH |
|---|---|---|
| 定位 | 单租户学习助教，垂直 | 通用 agent runtime |
| 循环 | ToolLoopAgent 单循环，≤6 步 | 多轮 goal/subagent/ralph 多 agent |
| 上下文治理 | 软上限硬截断 | 专门 compaction 包 |
| 工具生态 | 13 个静态工具 | MCP + skill 插件市场 |
| 沙箱 | 无（不需要） | sandbox/guard 包 |
| 会话持久化 | IndexedDB（客户端） | session 包（服务端） |

**结论：不需要迁移到 DSH，但建议借鉴三样东西：**
1. **compaction**（见 §3.2 P0）——最值得引入的能力；
2. **包边界的命名/分层**——lib/ai 下 `sdk/`（模型适配）、`agent/`（循环）、`search/`（检索）
   的划分已经与 DSH 神似，保持即可；
3. **skill 系统**——项目的 useSkill 已是雏形，若未来做技能市场/共享，可参考 DSH skill 包的
   frontmatter 规范（`lib/utils/skillFrontmatter.ts` 已有解析器）。

---

## 5. 模型接入：现状机制与接入指南

### 5.1 现状机制（已经相当完善）

```
models.ts   注册表：ModelInfo { id, label, thinking, thinkingLevels, tools, vision,
            contextK, endpoints[], pricing, cacheTtlSec, timeoutMs, type, imageParams }
            + LEGACY_REGISTRY_ALIASES（旧 id 自动迁移，用户本地设置不炸）
provider.ts 凭证解析：registryId 与上游 apiModelId 分离；endpoints 链（容灾降级）；
            三选一协议 apiProtocol → 自动装配 reasoningField / thinkingRequestStyle
languageModel.ts  工厂：openai → @ai-sdk/openai-compatible；anthropic → @ai-sdk/anthropic；
            + reasoning 归一化 + failover 包装
failoverModel.ts  端点链：首字节超时/5xx/可恢复 400 → 下一端点
```

**思考方言适配表**（5 种 ThinkingRequestStyle，这是接入国产模型最痛的点，已解决）：
`none` / `siliconflow`（enable_thinking+thinking_budget）/ `openai-reasoning-effort` /
`openrouter-reasoning` / `anthropic-thinking`（budget_tokens）。
UI 四档（low/medium/high/max）→ 上游取值由 `thinkingEffortMap` 每模型映射。

### 5.2 接入一个新模型的操作手册

**情况 A：内置模型（走项目中转站或已知供应商）**
1. 在 `models.ts` 的 `MODELS` 数组加一条 `ModelInfo`：
   - `endpoints`：有序端点链（主 + 备，provider ∈ siliconflow/mimo/zhipu/relay）；
   - 能力声明：`thinking / tools / vision / contextK`；
   - 思考方言：`thinkingRequestStyle` + `thinkingLevels` + `thinkingEffortMap`；
   - 计价与缓存：`pricing`（含 cachedInput）+ `cacheTtlSec`；
   - 慢模型（MoE 冷启动）加 `timeoutMs`。
2. 若是新供应商：在 `provider.ts` 的 `credentialsFor` 加 env 凭证分支。
3. 下架旧模型时往 `LEGACY_REGISTRY_ALIASES` 加映射，用户本地设置自动迁移。

**情况 B：用户自定义模型（无需改代码）**
- 设置里加"自定义 API 分组"（baseUrl/apiKey/models），模型上选三选一协议
  （openai / anthropic / siliconflow），其余字段自动装配；
  registryId 形如 `custom:<groupId>:<modelId>`。

**情况 C：新协议（未来如 Gemini 原生、Responses API）**
1. `models.ts`：`CustomApiProtocol` 加枚举值；
2. `provider.ts`：`autoConfigFromProtocol` 加映射；
3. `languageModel.ts`：`buildBaseModel` 加 SDK provider 分支（如 `@ai-sdk/google`）；
   思考参数在 `buildThinkingSettings` 加 style 分支。

### 5.3 面向"接入各种模型"的未来建议

1. **注册表外置**：MODELS 目前硬编码在 TS 里，模型上新/调价要发版。建议改为
   `content`-style 的 JSON/远程配置（构建时校验 + 运行时缓存），产品侧可热更新。
2. **能力探测兜底**：tools/vision/thinking 靠人工声明，声明错了体验静默劣化
   （如声明 tools=true 但上游不支持 → 400）。可在 failover 的 `isRecoverable` 里
   把"工具不支持类 400"识别为**能力降级**信号：摘掉 tools 重试并提示用户。
3. **smoke test 脚本**：scripts/ 下加一个 `check-models.ts`，对注册表每个端点发
   最小请求验证 凭证/模型名/思考参数，CI 或发版前跑。
4. **统一 usage 计价**：pricing 已在注册表、breakdown 已在回传——打通二者做
   每次对话的成本估算看板（billing store 已有雏形）。

---

## 6. 可持续性问题清单（按优先级）

| 优先级 | 问题 | 建议 |
|---|---|---|
| P0 | 长对话无 compaction，80% 后硬截断丢上下文 | 滚动摘要：60% 触发，flash 模型压缩旧历史 |
| P1 | 模块级单槽缓存（`_contextCache`）并发下 cacheHit 错报 | 改 keyed LRU Map |
| P2 | 每请求同步读页面 markdown | 内容缓存（prod 全量 / dev 按 mtime） |
| P3 | 工具 schema 全量常驻，随工具数增长拖累 prefix cache | 工具检索化（常驻核心 + discoverTools 元工具） |
| P4 | 工具循环只有步数预算，无 token 预算 | prepareStep 加累计工具输出 token 阈值 |
| P5 | FollowUp 标签协议 + generateText 兜底双协议 | 统一走兜底，删掉提示词标签要求 |
| P6 | 模型注册表硬编码 | 外置为可热更新配置 |
| P7 | 能力声明与上游实际能力可能漂移 | smoke test + 400 能力降级识别 |

---

## 7. 演进路线图建议

- **近期（1-2 周）**：P0 compaction + P1/P2 缓存修正 —— 直接改善长会话体验与正确性。
- **中期（1 个月）**：P6 注册表外置 + P3 工具检索化 + smoke test —— 为"接入各种模型"铺路。
- **远期**：评估多 agent（备课 planner / 出题 critic 分离）是否需要引入 goal/subagent 结构
  （参考 DSH 的 goal/subagent 包边界，但仍在自有 harness 内实现——
  当前 ToolLoopAgent + prepareStep 已能表达多阶段工作流，不急于上多 agent）。
