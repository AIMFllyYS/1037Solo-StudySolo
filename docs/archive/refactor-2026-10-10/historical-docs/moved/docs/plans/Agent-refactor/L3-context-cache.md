# L3 · 上下文与缓存

> **一句话**：把「窗口里放什么、怎么算、放不下怎么办」这条管道一次性理顺——触顶可见、提问出 system、超限压缩而非硬切、缓存指标说真话、窗口口径两端一致。
> **Issue**：#77 #78 #79 #80 #81 #82 #83 #84 #85 #86（4 个 P0 / 6 个 P1）
> **来源 Epic**：E11 #37 + E12 #38 + E13 #39 + E14 #40
> **冲突域**：`CD-route` + `CD-context`
> **顺序**：L2 之后。**L5 可与本 loop 并行**（文件不相交）。**L4 不要与本 loop 并行**——#93 也要改 `app/api/chat/route.ts`。

## 1. 为什么这 10 个号是一个 loop

原编排把它们排成 10 环依赖链 `#77 → #78 → … → #86`，全落在两个冲突域，零并行余地。按一号一循环要串 10 次 A→B→C，单这一条链就是 6–8 小时，其中 4–5 小时是重复的固定税。

但它们在代码上其实只动 **8 个文件**：

```
lib/context/fullContext.ts          lib/context/semanticSearch.ts
lib/context/types.ts                lib/context/estimateTokens.ts
lib/ai/agent/studyAgent.ts          lib/ai/agent/contextBreakdown.ts
lib/chat/buildRequestMessages.ts    lib/chat/estimateContextBudget.ts
app/api/chat/route.ts               components/chat/TokenDashboard.tsx
```

一个 A 把这 8 个文件读懂之后，做 1 个号和做 4 个号的边际成本差别很小。**这是本次重排收益最大的一个 loop。**

更重要的是它们在语义上互相咬合，拆开做会做出互相打脸的结果：

- #78（提问移出 system）不做，#82（稳住 prefix cache）就没有意义——最大的 bust 源还在
- #79（压缩）不做，#80（粘滞 80%）修了也没用——还是会进截断态
- #84（自定义 contextK）不做，#86（双端口径统一）统一出来的是同一个错值
- #83（缓存指标改绑 cachedTokens）依赖 #78/#82 真的把命中率提上去，否则改完看板还是显示 0

## 2. 当前基线（2026-09-12 实地核实，行号已按当前代码修正）

> 审计报告 `00-agent-issues-consolidated.md` 的**行为断言全部仍然成立**，但行号普遍漂移（#48–#66 改过 route）。以下是核实过的当前状态。

### 2.1 用户提问仍拼进唯一一条 system（#78 / P0-10）

```59:59:lib/context/fullContext.ts
    const context = fullContext + '\n\n用户提问：' + userMessage;
```

```80:80:lib/context/semanticSearch.ts
    const context = parts.join('\n') + '\n\n用户提问：' + userMessage;
```

`lib/ai/agent/studyAgent.ts:96-105` 把它并进 `volatile`，再拼成单条 `instructions`：

```96:105:lib/ai/agent/studyAgent.ts
  const volatile =
    buildLocationLine(chatCtx) +
    (contextTruncated
      ? "\n\n【上下文策略】当前会话达到 80% 软上限，本次省略完整参考材料，只使用最近消息继续回答。"
      : referenceContext
        ? `\n\n【参考材料】\n${referenceContext}`
        : "");

  // 必须只有「一条」system 消息且在最前：部分模型（如硅基流动 Qwen3）会对第二条 system 报错。
  const instructions = volatile ? `${systemPrompt}\n\n${volatile}` : systemPrompt;
```

`ToolLoopAgent` 只收这一条 `instructions`（`studyAgent.ts:152`）。`route.ts:158` 把含「用户提问：」的 `ctxResult.context` 原样传进 `referenceContext`。未截断时同一句提问在 system 与 `historyMessages` 里各存一份。

**硅基 Qwen3 拒收第二条 system 的约束仍然真实存在**（注释在 `studyAgent.ts:104`）。所以 #78 不能简单「把参考材料挪到第二条 system」，只能把**提问**从参考材料里摘出来，参考材料继续留在那条 system 里。

### 2.2 窗口口径（#84 / P0-11）

```21:32:lib/context/types.ts
export const MODEL_TOKEN_LIMITS: Record<string, number> = Object.fromEntries([
  ...MODELS
    .filter((m) => (m.contextK ?? 0) > 0)
    .map((m) => [m.id, (m.contextK as number) * 1000]),
  ['default', 128_000],
]);

export function getMaxTokens(model: string): number {
  const k = getModelInfo(model)?.contextK;
  if (typeof k === 'number' && k > 0) return k * 1000;
  return MODEL_TOKEN_LIMITS.default;
}
```

`getModelInfo`（`models.ts:440-441`）只扫内置 `MODELS`。自定义模型的 `contextK` 只在 `customModelToInfo`（`models.ts:549` 的 `contextK: c.contextK ?? 128`）里读，而 `getModelInfoWithCustom`（`models.ts:585-591`）**上下文管理器不用**。

`route.ts:145` 虽然把 `effectiveModelId` 传给 `getContextManager`，但 manager 内部还是走 `getMaxTokens` → `getModelInfo`。客户端侧默认是 `(model?.contextK ?? 128) * 1000`（`estimateContextBudget.ts:25`）。

### 2.3 软上限与截断（#79 #80 / P0-12）

```4:5:lib/chat/buildRequestMessages.ts
export const DEFAULT_MAX_TURNS = Number.MAX_SAFE_INTEGER;
export const SOFT_LIMIT_MAX_TURNS = 16;
```

实际调用点在 `lib/chat/executeChatRequest.ts:33-35`：软上限触发时 `maxTurns: 16` + `preserveAttachmentHistory: false`。

服务端 `route.ts:143-159`：

```146:150:app/api/chat/route.ts
      const contextBudget = body.sessionContextBudgetTokens ?? ctxResult.maxTokens;
      const serverSoftLimitReached = contextBudget > 0 && ctxResult.tokenCount / contextBudget >= 0.8;
      const contextTruncated = body.contextTruncated || serverSoftLimitReached || ctxResult.overflow;
```

三重 OR。**无论客户端是否已截断，都先跑完整的 `buildContext`**（P1-15：白算一次读盘 + 检索 I/O）。

粘滞垫差额仍在：

```67:70:lib/ai/agent/contextBreakdown.ts
  if (input.clientContextTokens !== null && input.clientContextTokens > breakdown.total) {
    breakdown.conversation += input.clientContextTokens - breakdown.total;
    breakdown.total = input.clientContextTokens;
  }
```

客户端 80% 在 `estimateContextBudget.ts:37`（`estimated / limit >= 0.8`），分子是会话估算；服务端分子是 `ctxResult.tokenCount`（参考材料 + 提问）。**两端算的不是同一批 token**（#86 / P1-8）。

### 2.4 分桶与估算（#85 / P1-9 P1-10）

```24:28:lib/ai/agent/contextBreakdown.ts
function classifyTool(name: string): keyof Pick<ContextBreakdown, "skills" | "webSearch" | "pages" | "conversation"> {
  if (name === "useSkill") return "skills";
  if (name === "webSearch" || name === "imageSearch") return "webSearch";
  if (name === "getCurrentPage" || name === "getSection" || name === "searchNotes") return "pages";
  return "conversation";
}
```

13 个工具里只显式覆盖 6 个，其余（`getOutline`、`searchNoteImages`、`renderInteractive`、`drawDiagram`、`generateImage`、`createQuiz`、`writeDocument`）全部回落 `conversation`。step 正文、reasoning、所有 tool **input** 也一律进 `conversation`（`contextBreakdown.ts:55-61`）。`volatile`（定位 + 参考材料，含提问）进 `pages`（第 48 行）。

```6:8:lib/context/estimateTokens.ts
    const code = char.codePointAt(0)!;
    if (code > 0x4dff && code < 0x9fff) {
      tokens += 2;
```

开区间，漏 U+9FFF 本身；扩展 A 区 U+3400–U+4DBF 按「其他 = 1」计。

### 2.5 缓存指标（#83 / P1-7）

`_contextCache` 仍是模块级单槽，只存 `pageId` + `contentHash`，**不缓存正文**：

```32:37:lib/context/fullContext.ts
interface CacheEntry {
  pageId: string;
  contentHash: string;
}

let _contextCache: CacheEntry | null = null;
```

语义模式固定 `cacheHit: false`（`semanticSearch.ts:87`）。`route.ts:235` 把它写进 breakdown。

**看板上现在有三处「缓存」，绑的不是同一个东西**——这是审计没讲清的一层：

| UI 文案 | 绑定 | 位置 |
|---|---|---|
| **上下文缓存**（命中/未命中） | `breakdown.cacheHit` ← 那个单槽 MD5 | `TokenDashboard.tsx:350-353` |
| **缓存命中**（数字） | `sessionLedger.lastTurn.cachedTokens` ← 真实上游 | `TokenDashboard.tsx:409` |
| **缓存倒计时** | `cacheTtlSec` + `lastTurn.cachedTokens` 估算 | `TokenDashboard.tsx:506-519` |

所以 #83 的实际工作是：**把第一行（假指标）去掉或改绑真实 `cachedTokens`**，并把 `_contextCache` 改成按 pageId 键控或直接删。`ContextBreakdown.cacheHit` 的类型注释（`lib/types/chat.ts:68-69`）也要同步。

### 2.6 步数与 finishReason（#77 / P0-9）

`MAX_TOOL_STEPS = 6`（`lib/ai/agent/tools/_shared.ts:6`），`stopWhen: isStepCount(MAX_TOOL_STEPS)`（`studyAgent.ts:154`）。

```177:177:app/api/chat/route.ts
          sendReasoning: true, sendStart: true, sendFinish: false, onError: formatError,
```

```251:251:app/api/chat/route.ts
      writer.write({ type: "finish" });
```

自写的 finish **不带 `finishReason`**，`message-metadata`（`route.ts:243-251`）里也没有。客户端 `lib/chat/consumeStudyStream.ts` 显式处理的 chunk 只有：`abort` / `finish`（只置 `completed = true`，不读字段）/ `data-usage` / `data-context-breakdown` / `data-followup` / `data-info`。

`components/` 下对「步数上限」「触顶」「MAX_TOOL_STEPS」「finishReason」**零匹配**。`AgentTrace.tsx:20-30` 只有「处理已停止 / 等待工具批准 / 部分步骤未完成 / 已处理 N 秒」，没有触顶文案。

### 2.7 可以直接用的既有设施

| 设施 | 来自 | 怎么用 |
|---|---|---|
| `data-info` 通道 | 已有（failover 换端点在用） | #77 的触顶提示直接走它，`consumeStudyStream` 已有 `onInfo` |
| JSONL 生命周期日志 | #52 #53 | `agentLog.ts` 已记 `onStepEnd` / `event:"llm"` / `event:"tool"` / `thinking` + `durationMs`。**L3 每个号的验收证据都该从这里取**，不要靠肉眼 |
| ALS 台账上下文 | #64–#66 | `runWithLedgerContext` 已包住 route 的 execute。#79 的摘要 LLM 调用要记账时直接吃 ALS |
| `pruneMessages` | `ai@7.0.85` | 见 3.2 |

## 3. 分阶段实施

### 阶段 B1 · #77 + #78 入口与可见性

两个号都改 `route.ts` + `studyAgent.ts` + 两个 context manager，且 #78 是 #82 的前提。

**#77 finishReason 与触顶提示**

1. 保留 SDK 的 `finishReason`。现在 `sendFinish: false` 之后自写空 finish，所以要么改成 `sendFinish: true`（注意会影响现有 metadata 写入顺序），要么在自写的 finish / `message-metadata` 上带上 `finishReason`。**推荐后者**——现有的 settle → FollowUp → breakdown → usage → metadata → finish 顺序是 #64 刚钉好的，不要为了这个号重排。
2. 触顶判定：`finishReason === 'tool-calls'`（第 6 步仍在要工具但没有第 7 次 LLM）即为触顶。
3. 触顶时通过 `data-info` 下发用户可见提示，例如「本次达到了工具调用上限，讲解可能不完整，可以再问一次让我继续」。`consumeStudyStream` 的 `onInfo` 已经通了，UI 侧确认能展示。
4. **必须新增触顶测例**（现在完全没有）：造一个第 6 步仍返回 tool-calls 的 mock，断言无第 7 次 LLM 调用、且有用户可见提示。

**#78 提问移出 system**

1. `fullContext.ts:59` 与 `semanticSearch.ts:80` 不再拼 `'\n\n用户提问：' + userMessage`。参考材料就是参考材料。
2. 提问只保留在最后一条 user message（本来就有）。
3. **不要动「唯一一条 system」的约束**——硅基 Qwen3 的限制是真的。参考材料继续留在那条 system 里，只是不再带提问。
4. 检查下游：`contextBreakdown.ts:48` 把 `volatile` 计进 `pages`，提问摘掉之后这个数字会变小；`ctxResult.tokenCount` 也会变小，从而影响 2.3 的 80% 判定分子。**这是好事**（分子终于只含参考材料），但要在 #86 里一起把口径讲清楚。
5. 回答质量不能降：模型仍要能把参考材料和提问关联起来。参考材料的收尾可以留一句结构性引导（例如「以上是参考材料」），但不含用户原话。

**验收证据**：同页连续追问两轮，从 JSONL 与 `data-usage` 看 `cachedTokens` 是否明显上升。

### 阶段 B2 · #79 + #80 + #81 + #82 窗口管理

这一阶段是真正的算法工作，也是全 loop 风险最高的地方。

**先说清 `pruneMessages` 能做什么、不能做什么**（审计与 Issue 正文在这里含糊）。`ai@7.0.85` 确实内置了它：

```ts
// node_modules/ai/dist/index.d.ts:7123
declare function pruneMessages({ messages, reasoning, toolCalls, emptyMessages }: {
    messages: ModelMessage[];
    reasoning?: 'all' | 'before-last-message' | 'none';
    toolCalls?: 'all' | 'before-last-message' | `before-last-${number}-messages` | 'none'
      | Array<{ type: 'all' | 'before-last-message' | `before-last-${number}-messages`; tools?: string[] }>;
    emptyMessages?: 'keep' | 'remove';
}): ModelMessage[];
```

两个关键事实：

- 它吃 **`ModelMessage[]`**，不是 UIMessage。所以落点在 `route.ts` 里 `toModelMessages` 之后、`agent.stream` 之前。
- **它只做移除，不做摘要。** 所以它能完整覆盖 **#81（渐进披露：reasoning 不跨轮、旧工具结果按轮次衰减）**，但**不能**实现 #79 的「滚动摘要」。

于是 #79 拆成两半：

- **衰减移除**：用 `pruneMessages`。这部分与 #81 是同一个调用，合起来写。
- **滚动摘要**：需要自己实现——把较早的历史送给一个便宜模型总结成一段，替换原文，保留最近 N 轮原文。**这个摘要调用本身是花钱的 LLM 调用**，按 L1/#66 的契约**必须写 `usage_ledger`**（`route: "/api/chat"`, `kind: "llm"`, `meta.source: "compaction"`）。ALS 已经包住 execute，直接 `settleUsage` 即可。这一条很容易被漏掉，必须写进 A 的提示词。

**#79 滚动摘要**

- 触发点：达到软上限。不要一上来就替换全部历史，保留最近 N 轮原文（N 可配，建议从 6 起）。
- 参考材料改**分级裁剪**，不要整块 on/off。分级建议：目录 → 当前页摘要 → 当前页全文，按紧张程度逐级丢。
- 摘要要能被缓存 / 复用，不要每轮都重新总结一遍整段历史（否则 token 反而涨）。
- 压缩开销要可接受（验收标准原文），用 #52 的 JSONL `durationMs` 取证。

**#80 粘滞 80%**

- `contextBreakdown.ts:67-70` 的垫差额是为了「截断后环不要假降」。原意合理，实现制造了单向闸门。
- 正确做法：把「显示用的估算」与「判定用的实际」分开。环可以显示垫高后的值（用户感知不跳），但**软上限判定必须用未垫高的实际值**，否则永远退不出截断态。
- 验收：开新话题或对话变短后能自动恢复非截断态，且环不出现「假降」。

**#81 渐进披露**

- `pruneMessages({ messages, reasoning: 'all', toolCalls: 'before-last-2-messages' })` 起步，具体档位实测调。
- **但 `reasoning: 'all'` 不能无条件用**：按第 4 节的不变量，`preservesReasoning` 为真的模型（`kimi-k3` / `mimo-v2.5`）必须跳过 reasoning 剪裁，否则多轮带工具时上游直接 400。这一条要有测试覆盖。
- **HTML 产物不进上下文**：只留 id + 标题 + 摘要，模型需要时按需取回。取回通道要真的存在（工具或 part 引用），不能只是「不给了」——验收标准明确要求「模型在需要时仍能取回产物内容」。
- artifact 的 id 与标题从 `lib/stores/artifacts.ts` 侧拿，注意**不要**把 `renderInteractive` 这个工具 id 改名（已持久化进 IndexedDB，执行契约的红线）。

**#82 稳住 prefix cache**

已定位的 bust 源（提问那条由 #78 处理）：

| bust 源 | 位置 |
|---|---|
| 工具 schema 随 `enableSearch` / `disabledTools` / 技能 enum 变化 | `lib/ai/agent/tools/server.ts` |
| `getOutline` 的 description 动态插入学年科目名，换学年即 bust | `getOutline` 的 presentation / tool |
| 定位行随翻页即变 | `buildLocationLine`（`studyAgent.ts`） |
| 学科 md 随科目切换 | `lib/ai/prompts/index.ts` |

做法：稳定内容前置、易变内容后置。不要为了缓存把功能改错——换学年、换页本来就该让那部分失效，目标是**失效范围可解释**，不是零失效。

### 阶段 B3 · #83 + #84 + #85 + #86 计量与口径

四个号都小而精确，一个 A 一次做完。

**#84 自定义 contextK**（最简单，2.2 是全部背景）
- `getMaxTokens` 改用能看见自定义分组的口径。注意 `lib/context/types.ts` 现在不接收 `customGroups`，需要把它传进来（或把 `getMaxTokens` 挪到能拿到的地方）。
- 内置模型行为必须不变。

**#85 分桶与 CJK**
- `classifyTool` 把 `getOutline`、`searchNoteImages` 归进 `pages`。顺带考虑其余 7 个未覆盖的工具该落哪个桶，别再默认全进 `conversation`。
- `estimateTokens` 的 CJK 判定改成覆盖 U+4E00–U+9FFF（含端点）与扩展 A 区 U+3400–U+4DBF。
- **补 `contextBreakdown` 单测**（现在完全没有）。

**#83 缓存指标**
- 按 2.5 的三处梳理：去掉或改绑「上下文缓存」那一行。
- `_contextCache` 改按 pageId 键控或直接删。它只存 hash 不存正文，删掉的成本很低。
- 同步 `lib/types/chat.ts:68-69` 的注释。

**#86 双端口径**
- 两端 80% 用同类分子。#78 之后服务端分子已经干净（只含参考材料），要决定的是**统一到哪个口径**：建议统一成「system + 工具 schema + 参考材料 + 对话历史」的全量估算，两端用同一个函数算。
- 环阈值（`TokenDashboard.tsx:181-182` 的 `>0.7` 红 / `>0.4` 黄）与软上限 0.8（`ChatPanel.tsx:58` 的 `showWarning`）对齐，或给 70–80% 一个单独的中间态文案。
- `sessionContextBudgetTokens` 首次发送即锁定 → 换到更大窗口模型后分母要能更新。

## 4. 不变量

- **只能有一条 system 消息且在最前。** 硅基流动 Qwen3 会对第二条 system 报错（`studyAgent.ts:104` 的注释）。#78 是把提问摘出去，不是拆成两条 system。
- **`MAX_TOOL_STEPS = 6` 的语义是「最多 6 次上游 LLM 调用（含最终文本步）」**，不是「6 轮工具 + 1 次收尾」。这是读 SDK 源码核实过的（`isStepCount` 实现为 `steps.length === stepCount`，在 step 入栈之后求值）。#77 的提示文案不要写成「6 轮工具」。
- **#64 钉下的收尾顺序不要重排**：settle → FollowUp → breakdown → usage → metadata → finish。#77 在这个顺序上加字段，不要挪动它们。
- **abort 照常记账**、**0/0 不建行**（#64）。#79 的摘要调用也要遵守。
- **压缩 / 摘要产生的 LLM 调用必须入账**（#66 的契约）。
- **`renderInteractive` 工具 id 冻结**（已持久化进 IndexedDB）。
- **⚠️ 某些模型要求跨轮回传 `reasoning_content`，不能无条件剪掉 reasoning。** `kimi-k3` 与 `mimo-v2.5` 在「多轮 + 工具」场景下若历史缺 `reasoning_content` 会**直接 400**（见 `MODELS.md` 第 4.3 节）。这与 #81 的 `pruneMessages({ reasoning: 'all' })` 直接冲突。
  **L0 的 F0 阶段会实测中转站是否已归一化并给出结论**——开工前先读 `tmp/issues/l0-relay-probe.md`。若 L0 给 `ModelInfo` 加了 `preservesReasoning`，#81 的剪裁必须尊重它，**不能对这两个模型剪 reasoning**。
- persist key 一律不得改名（`sessionContextBudgetTokens` 所在的 `tokenTracker` store 等）。
- **滚动契约**：`TokenDashboard` / `AgentTrace` 的内容骤缩会牵动贴底逻辑。`AgentTrace` 折叠的 160ms 过渡（`TRACE_COLLAPSE_MS`）不要拆；不要用 `scrollHeight - scrollTop - clientHeight` 反推用户意图。详见 `docs/plans/archive/00-execution-contract.md` 第六节。

## 5. 陷阱

1. **`pruneMessages` 吃 `ModelMessage[]` 不是 UIMessage**，落点在 `toModelMessages` 之后。
2. **`pruneMessages` 不做摘要**。#79 的摘要要自己写，且要记账。
3. **截断态仍在跑 `buildContext`**（P1-15）。B2 顺手把这个白算掉——但要小心：`ctxResult.overflow` 和 `tokenCount` 参与截断判定，不能直接跳过而不给替代值。
4. **粘滞 80% 的修法不是简单删掉垫差额**。删掉之后环会「假降」，那是当初加它的原因。必须显示值与判定值分离。
5. **`getMaxTokens` 现在拿不到 `customGroups`**，改 #84 时要先把参数通道打开，这会牵动 `getContextManager` 的签名。
6. **两端 80% 统一之后，现有的「服务端永远到不了 80%」会变成「两端都会到」**。这可能让截断比现在更容易触发——B2 的压缩必须先做好，否则用户体感是「突然开始丢上下文」。这是 B2 排在 B3 之前的原因。
7. **knip**：新增的压缩 / 摘要 / 口径模块必须被测试 import。
8. 不要跑 `pnpm build`；不要动 `content/**`；不要起 `next dev`。

## 6. 合并验收

**可见性（#77）**
- [ ] 触顶时用户能看到明确提示
- [ ] `finishReason` 不再被丢弃，客户端可读
- [ ] 新增触顶测例（第 6 步仍返回 tool-calls，断言无第 7 次 LLM 且有用户提示）

**提问与缓存（#78 #82 #83）**
- [ ] system 中不再出现「用户提问：」段
- [ ] 同页连续追问时上游 `cachedTokens` 明显上升（用 JSONL / `data-usage` 取证）
- [ ] 回答质量不下降（模型仍能正确关联参考材料与提问）
- [ ] 换页 / 换学年时的失效范围可解释、可接受
- [ ] 看板缓存数字来自上游 usage 的 `cachedTokens`，不再来自单槽布尔量
- [ ] 并发请求不再互相污染缓存判定

**窗口管理（#79 #80 #81）**
- [ ] 长对话不再丢失早期上下文，模型仍能回答开头提过的信息
- [ ] 参考材料按分级裁剪而非整块丢弃
- [ ] 压缩本身的开销可接受（有 `durationMs` 证据）
- [ ] 开启新话题或对话变短后能自动恢复非截断态
- [ ] Token 环显示不出现「假降」
- [ ] HTML 产物不再常驻上下文，且模型在需要时仍能取回
- [ ] 长对话的上下文占用明显下降
- [ ] **`preservesReasoning` 的模型（`kimi-k3` / `mimo-v2.5`）在多轮 + 工具场景下不报 400**（有测试）

**计量口径（#84 #85 #86）**
- [ ] 自定义模型按其配置的 `contextK` 计算窗口与溢出；内置模型行为不变
- [ ] `getOutline` 与 `searchNoteImages` 计入 `pages` 桶
- [ ] CJK 估算覆盖 U+9FFF 与扩展 A 区
- [ ] 补上 `contextBreakdown` 的单测
- [ ] 双端软上限判定口径一致
- [ ] 环颜色与实际截断行为对得上
- [ ] 换到更大窗口模型后预算分母能更新

**本 loop 追加**
- [ ] 压缩 / 摘要产生的 LLM 调用有 `usage_ledger` 记录（`meta.source` 可识别）

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0

## 7. Loop 末尾端测脚本

真开 `http://localhost:35349`。**不要打真实付费模型**——本 loop 的端测可以用自备的自定义分组，或把断言集中在「不崩 + 数字自洽」上。

1. 打开一篇笔记，同页连续追问 3 轮 → 看板「缓存命中」数字应逐轮上升；「上下文缓存」那行不再是假指标。
2. 灌长对话到软上限以上（可以用较小 `contextK` 的自定义模型快速逼近）→ 断言：
   - 模型仍能回答第一轮提过的信息（压缩生效，不是硬切）
   - Token 环不假降
   - 新开一个短话题后自动退出截断态
3. 换到一个 `contextK` 明确不同的自定义模型 → 看板分母跟着变。
4. 构造一次触顶（连续要求多个工具动作）→ 出现用户可见提示，不是静默「有卡片没讲解」。
5. 生成一个 artifact，然后继续追问 → 上下文占用不因 HTML 暴涨；再问一句需要产物内容的问题，模型能取回。
6. 检查 `log/agent-lifecycle.jsonl`：有 `event:"llm"` 的 `durationMs`；若触发了压缩，能看到摘要调用那一次。
7. 控制台无 500、无 `proxy.ts` / matcher 报错。

端测者交回 `tmp/issues/context-l3-e2e.md`。

## 8. 提交与关单

按阶段拆，每号一个 `Closes`（这 10 个号的改动都能单独 revert）：

| 阶段 | commit | Closes |
|---|---|---|
| B1 | `feat(agent): surface the step limit and keep finishReason` | #77 |
| B1 | `fix(context): keep the user question out of the system prompt` | #78 |
| B2 | `feat(context): compact old turns instead of hard truncation` | #79 |
| B2 | `fix(context): let the session leave the truncated state` | #80 |
| B2 | `feat(context): prune reasoning and large artifacts from the window` | #81 |
| B2 | `perf(context): order the prompt so the prefix stays cacheable` | #82 |
| B3 | `fix(ui): bind the cache metric to upstream cachedTokens` | #83 |
| B3 | `fix(context): honor contextK for custom models` | #84 |
| B3 | `fix(context): correct token buckets and CJK estimation` | #85 |
| B3 | `fix(context): align the soft-limit ratio across client and server` | #86 |

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| **#79 的摘要让回答质量下降**（本 loop 最大风险） | 摘要只替换较早历史，最近 N 轮必须保留原文。端测第 2 项要同时检查「能回忆开头」与「当前轮回答质量」。宁可少压一点 |
| 摘要调用把成本反向推高 | 摘要要能复用，不要每轮重算。必须入账，然后从 `usage_ledger` 里看 `meta.source="compaction"` 的实际花费 |
| #86 统一口径后截断触发变频繁 | B2 必须先落地。若 B3 做完发现截断变频，把软上限比例从 0.8 上调，而不是回退口径 |
| **#81 把 `kimi-k3` / `mimo-v2.5` 的 reasoning 剪掉，多轮带工具直接 400** | 第 4 节的不变量。开工前读 `tmp/issues/l0-relay-probe.md`；B 必须用这两个模型各跑一次「多轮 + 工具」取证 |
| #78 之后模型分不清参考材料与提问 | 参考材料保留结构性收尾句（不含用户原话）。端测第 1 项顺便看回答质量 |
| #82 为了缓存把动态 description 写死，导致换学年后工具描述不准 | 目标是「失效范围可解释」，不是零失效。宁可不改 `getOutline` 的动态描述 |
| B2 一个 A 吃不下 4 个号 | 拆成 B2a（#79 #80，压缩与退出）+ B2b（#81 #82，披露与前缀）。#81 依赖 #79 的分级裁剪结构，顺序不要反 |

**放弃优先级**（从最可放弃到不可放弃）：#82（缓存优化，纯收益型）→ #83（指标展示）→ #81 → #79。**#77 / #78 / #84 / #85 / #86 不应放弃**——它们是「结果错了」而不是「不够好」。
