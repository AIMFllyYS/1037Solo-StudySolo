# L0 · 模型目录与渠道统一

> **一句话**：把按渠道分组的模型菜单改成「内置模型 / API 调用」两类，换上新的模型目录，并把生图 / 向量 / 重排 / 联网搜索的凭证从「一个 `AI_*` 兜底」拆成各自可配。
> **Issue**：#92（模型方言）+ #75 #76（自配搜索与搜图凭证）+ **新增范围**（注册表重构、模型目录更新、能力凭证拆分、生图修复）
> **来源**：2026-09-12 用户新提的重构要求 + E15 #41 / E21 #47 的一部分
> **冲突域**：`CD-models` 为主，牵动 `CD-ui`（设置页）、`CD-satellite`（image-gen）、`CD-tools`（搜索/搜图）
> **顺序**：**在所有其他 loop 之前**（#67 收尾之后立刻做）。理由见第 1 节。
> **配套**：模型清单、真实价格与思考方言见 **`MODELS.md`**（价格口径：一律非优惠、非峰谷、阶梯取最贵档）
> **阶段数**：4（F0 实测 → F1 注册表 → F2 凭证与设置 → F3 生图）

## 1. 为什么这是一个 loop，而且必须排在最前

### 1.1 它让 L1 的 #68 从「猜」变成「结构性正确」

L1 最大的技术风险是 BYOK 判据。现在代码用 `actualProvider.isCustom`（`route.ts:195-204`），而 #68 正文明确说这个判据是错的（`custom-openai` 的 `isCustom` 是 `false` 却走平台凭证）。

**「内置模型 / API 调用」这个二分法本身就是 BYOK 判据。** 重构之后：

- 内置模型 → 一律走我们的中转 key → `pool: "platform"`
- API 调用 → 一律用用户自己的 key → 不进任何池（主模型），平台侧开销进 `pool: "byok"`

不需要再去猜 `isCustom`。如果先做 L1 后做 L0，#68 得先写一套基于 `isCustom` 的补丁逻辑，L0 落地后再删掉。

### 1.2 它会重写 L4 的战场

L4（#93 #94 #71 #72）动的是 `models.ts` / `provider.ts` / `languageModel.ts`。L0 要把 `ProviderKind`、`MODELS`、`credentialsFor` 全部重排。先做 L4 等于在即将被推翻的结构上改一遍。

**#92 因此并入 L0**：它的修法是「思考方言跟随落地端点」，而「有哪些端点、各自什么方言」正是 L0 要重写的声明。在重写注册表时顺手做对，比之后再回来改便宜。

### 1.3 #75 #76 与「能力凭证拆分」是同一件事

#75 要「用户可自配联网搜索与搜图凭证」。而真正的病根是：**除了 relay / mimo / zhipu 三个具名渠道，其余一切都塌进 `credentialsFor` 的 `default` 分支，也就是 `AI_BASE_URL` / `AI_API_KEY`**（`provider.ts:200-205`）。生图、向量、重排全都在这个兜底里。

所以「让用户能自配」和「把兜底拆开」是同一次改动。#75 #76 从 L1 移到 L0。

### 1.4 生图现在是坏的，用户已经明确反馈

第 4 节列了核实到的根因。这件事在 L0 做，因为它和能力凭证拆分是同一处代码。

## 2. 当前基线（已实地核实）

### 2.1 渠道与凭证

```6:6:lib/ai/models.ts
export type ProviderKind = "siliconflow" | "mimo" | "zhipu" | "relay";
```

```192:206:lib/ai/provider.ts
function credentialsFor(provider: ProviderKind): ProviderCredentials {
  switch (provider) {
    case "mimo":   return { baseUrl: MIMO_BASE,  apiKey: MIMO_KEY,  configured: !!(MIMO_BASE && MIMO_KEY) };
    case "zhipu":  return { baseUrl: ZHIPU_BASE, apiKey: ZHIPU_KEY, configured: !!(ZHIPU_BASE && ZHIPU_KEY) };
    case "relay":  return { baseUrl: RELAY_BASE, apiKey: RELAY_KEY, configured: !!(RELAY_BASE && RELAY_KEY) };
    default:
      return { baseUrl: BASE, apiKey: KEY, configured: !!(BASE && KEY && !BASE.includes("your-endpoint")) };
  }
}
```

**`siliconflow` 没有自己的分支，落进 `default` 用 `AI_BASE_URL` / `AI_API_KEY`。** 现网 `.env.local` 恰好是 `AI_BASE_URL=https://api.siliconflow.cn/v1`，所以看起来能用——但这是巧合，不是设计。任何人把 `AI_BASE_URL` 改指向别处，生图立刻挂。

另外 `RELAY_BASE` 过了 `normalizeOpenAIBaseUrl`（补 `/v1`），而 **`BASE`（`AI_BASE_URL`）没有**（`provider.ts:22`）。用户漏写 `/v1` → `imagesGenerationsUrl` 拼出 `https://host/images/generations` → 404。

### 2.2 现有模型菜单

`MODELS`（`models.ts:143-285`）8 条，`group` 字段是 UI 分区名：

| group | 模型 |
|---|---|
| 自由中转 | `custom-openai`（picker 隐藏，桌面专用） |
| 主力模型 | `z-ai/glm-5.3-flash`（默认）、`Qwen/Qwen3.8-27B`、`google/gemini-3.7-flash`、`deepseek/deepseek-v4-flash` |
| 小米 MiMo | `mimo-v2.5-pro`、`mimo-v2.5` |
| 硅基流动生图 | `Tongyi-MAI/Z-Image-Turbo` |

`DEFAULT_MODEL_ID = "z-ai/glm-5.3-flash"`（`models.ts:287`）。

**设置页的两级措辞已经对齐用户的要求**——`ModelSection.tsx:25` 就是「内置模型（站点默认）」，另一段是「自定义 API」。`group` 是二级标签（`ModelSection.tsx:73` 渲染 `{m.group} · {m.contextK}K · ¥input/output`）。所以这次改的是 **`group` 的取值** 与 **模型清单**，不是重写 UI 骨架。

### 2.3 env 与注册表已经不一致（现网 bug）

```
AI_MODEL_PRO=deepseek/deepseek-v4.1-flash
AI_MODEL_FLASH=deepseek/deepseek-v4.1-flash
```

而 `provider.ts:71-72` 的兜底是：

```71:72:lib/ai/provider.ts
export const ENV_MODEL_PRO = process.env.AI_MODEL_PRO || "Qwen/Qwen3.8-27B";
export const ENV_MODEL_FLASH = process.env.AI_MODEL_FLASH || "z-ai/glm-5.3-flash";
```

env 已经指向 `deepseek/deepseek-v4.1-flash`，但 `MODELS` 里**没有这个 id** → `getModelInfo` 返回 undefined → 拿不到 pricing / contextK / 方言。`/api/follow-ups` 固定用 `ENV_MODEL_FLASH`，所以它现在就在打一个注册表不认识的模型。L0 正好修掉。

### 2.4 生图设置只能选模型，不能配端点

`components/chat/settings/ImageSection.tsx` 现在只有三项：默认生图模型（靠模型列表里点 ⭐）、生图模式文本模型、容灾降级模型。**没有任何地方能配生图的 baseUrl / key / API 风格**——唯一绕路是去「自定义 API」建一个 `type: "image"` 的分组。

向量、重排、联网搜索连绕路都没有，全部硬绑 env。

### 2.5 #92 的管道已经铺好一半

`#65` 为了**计费**按实际落地模型，已经加了落地端点追踪：

```52:52:lib/ai/sdk/languageModel.ts
  getActualProvider: () => ResolvedProvider;
```

```170:186:lib/ai/sdk/languageModel.ts
    onLanded: (_next, index) => {
      actualProvider = providers[index] ?? actualProvider;
    },
    thinkingSettings: (effort) => (supportsThinking ? buildThinkingSettings(primary, effort, info) : {}),
```

**但 `thinkingSettings` 仍绑 `primary`。** `onLanded` 的触发点在 `lib/ai/sdk/failoverModel.ts:102-103`（`options.onLanded?.(candidates[i], i)`），在备用模型真正产出时调用。

另一半在 `resolveBuiltinEndpoint`——**`thinkingRequestStyle` 挂在 registry 条目上**，而它按 registryId 取 `ModelInfo`，`endpointIndex` 只换凭证与 `apiModelId`：

```209:232:lib/ai/provider.ts
function resolveBuiltinEndpoint(registryId: string, endpointIndex: number): ResolvedProvider {
  const info = getModelInfo(registryId);
  const effectiveInfo = info ?? getModelInfo(fallbackId);
  const endpoint = endpoints[idx];
  thinkingRequestStyle: effectiveInfo?.thinkingRequestStyle ?? "siliconflow",
```

两条 registry 的方言声明（`models.ts:161-174` 与 `:254-265`）：GLM 是 `openai-reasoning-effort`，MiMo 是 `siliconflow`。最终装配（`languageModel.ts:125-148` 的 `buildThinkingSettings`）：

| 风格 | 下发 |
|---|---|
| `openai-reasoning-effort` | `providerOptions.upstream.reasoningEffort` |
| `siliconflow` | `providerOptions.upstream.{ enable_thinking: true, thinking_budget }` |

净效果：**GLM 降级到 MiMo 后，计费 id 已经正确切成 MiMo（#65 的功劳），但思考参数仍按 GLM 的 `reasoningEffort` 下发。**

`buildThinkingSettings` 经 `thinkingSettings()` 进入三处生产调用：`app/api/chat/route.ts:163`、`app/api/artifact/route.ts:37`、`app/api/record/route.ts:224`。**`/api/document` 不传思考参数**（`document/route.ts:85-104` 只加长超时）——这是 P1-46，没有对应 Issue，L0 重写方言装配时顺手修掉并记进交回摘要。

**时序风险（#92 唯一的技术难点）**：`thinkingSettings` 在**请求发出前**被调用，`onLanded` 在**落地后**才触发。第一次尝试时落地端点就是 primary，方言正确；failover 发生在第一次失败之后，SDK 重试时是否**重新取 settings** 必须实测确认，否则改了不生效。验收要用 `log/agent-lifecycle.jsonl` 看第二跳的实际请求参数，**不接受「单测过了」**。

### 2.6 免费模型的计费语义已经就绪

用户要求「免费模型只收取工具费用」。这个语义 #66 已经支持：`pricing` 全 0 → `calcUsageCostCny` 返回 0 → 主聊天那行 `cost_cny = 0`；而工具侧车（搜索 / 搜图 / 嵌入 / 重排）是**独立的 `usage_ledger` 行**，按各自的 `kind` 记账。所以免费模型只需要把 `pricing` 填 0，不需要改计费逻辑。

## 3. 目标模型目录

完整参数（价格 / 上下文 / 思考形态）见 `MODELS.md`，由联网调研填入。这里只定**结构与归属**。

### 3.1 两个顶级分类

| 分类 | 凭证 | 计费池 | 说明 |
|---|---|---|---|
| **内置模型** | 一律用项目中转站的 key（`RELAY_*`） | `platform` | **不向用户披露具体走哪个渠道** |
| **API 调用** | 用户自填 baseUrl + key | 主模型不进池；平台侧开销进 `byok` | 即现有的 `customApiGroups` |

### 3.2 内置模型的四个二级分组（`group` 字段取值）

**快速模型**

| 模型 id | 展示名 | 备注 |
|---|---|---|
| `deepseek/deepseek-v4.1-flash` | DeepSeek V4.1 Flash | **全局默认模型**，多模态 |
| `Qwen/Qwen3.7-Flash` | Qwen3.7 Flash | 非多模态（用户未列入多模态组） |

**多模态**

| 模型 id | 展示名 |
|---|---|
| `gpt-5.6-luna` | GPT-5.6 Luna |
| `mimo-v2.5` | MiMo V2.5 |
| `google/gemini-3.8-flash` | Gemini 3.8 Flash |
| `z-ai/glm-5.3-flash` | GLM-5.3 Flash |
| `Qwen/Qwen3.8-Flash` | Qwen3.8 Flash |
| `meta/muse-spark-1.3-contributor` | Muse Spark 1.3 |

**免费模型**（`pricing` 全 0，只收工具费用）

| 模型 id | 展示名 |
|---|---|
| `meituan/LongCat-2.0:free` | LongCat 2.0 |
| `inclusionai/ling-3.0-flash-sante:free` | Ling 3.0 Flash Sante |

**旗舰模型**

| 模型 id | 展示名 |
|---|---|
| `gpt-5.6-sol` | GPT-5.6 Sol |
| `kimi-k3` | Kimi K3 |

> 展示名以 `MODELS.md` 的调研结果为准；上表是按用户给的「美化一下」原则先拟的，A 落地时若调研给出官方中文名，优先用官方名。
> `:free` 后缀是上游的 id，**必须原样发给上游**，但**不要出现在展示名里**。

### 3.3 `DEFAULT_MODEL_ID`

`z-ai/glm-5.3-flash` → **`deepseek/deepseek-v4.1-flash`**。

### 3.4 生图模型

`Tongyi-MAI/Z-Image-Turbo` 保留，**默认仍走硅基流动**（用户要求 1a）。但它的 `group` 不再叫「硅基流动生图」——渠道名不对用户披露。建议归入「生图模型」这个二级分组，或继续按 `type: "image"` 单独渲染。

### 3.5 一个需要你拍板的设计点

**内置模型要不要保留渠道容灾（用户不可见的第二跳）？**

今天 `z-ai/glm-5.3-flash` 的 endpoints 是 `[relay, mimo]`，是全项目唯一真正会发生 failover 的链。

| 选项 | 代价 |
|---|---|
| **A. 内置模型单端点（纯 relay）** | 最简。`hasNextEndpoint` 恒 false，failover 机制实际不再触发，#92 自然消失。但**默认模型失去容灾**，中转站抖动时直接失败 |
| **B. 保留 relay → 备用渠道 的二跳** | 保留可用性。必须在 L0 里把 #92 做对（思考方言跟随落地端点），否则降级后仍下发错参数 |

**推荐 B。** 「不向用户披露渠道」说的是不展示，不是只能有一个渠道；而默认模型失去容灾是实打实的可用性回退。选 B 则 #92 在本 loop 内解决。

### 3.6 调研查出两个会**卡住功能**的问题（A 阶段第一件事就是处理它们）

详细依据见 `MODELS.md` 第 4 节。

#### （a）`mimo-v2.5` 与 `kimi-k3` 要求回传 `reasoning_content`，我们的历史里没有

| 模型 | 约束 |
|---|---|
| `mimo-v2.5` | 开启思考的多轮会话中，**若历史包含工具调用，必须完整回传上一轮 `reasoning_content`，否则直接 400** |
| `kimi-k3` | **必须原样回传历史 assistant 的 `reasoning_content`**（Preserved Thinking，思考强制常开不可关） |

本项目既有设计是**跨轮历史只留 `text` / `file`**，thinking 一律丢弃。L3 的 #81 还要用 `pruneMessages({ reasoning: 'all' })` 进一步剪掉。

**按现状，这两个模型在「多轮 + 工具」下会直接 400 —— 不是变慢，是不可用。** 而 `kimi-k3` 是用户点名要的旗舰模型。

**A 阶段的第一个动作**：拿这两个模型各做一次「多轮 + 工具」的真实调用，确认**经过我们中转站之后**是否已被归一化（relay 可能自己补 `reasoning_content`）。

- 若 relay 已处理 → 什么都不用做，把结论写进交回摘要，并同步给 L3 的 #81
- 若 relay 没处理 → 给 `ModelInfo` 加 `preservesReasoning?: boolean`，为真时历史保留 `reasoning_content` 且 `pruneMessages` 跳过它。**这条必须同时写进 L3 的 #81 的不变量**，否则 L3 做完会把 L0 的修复推翻

#### （b）`ThinkingRequestStyle` 装不下新方言，且现有两条已经写错

```27:33:lib/ai/models.ts
export type ThinkingRequestStyle = …  // 当前只有 openai-reasoning-effort / siliconflow / anthropic-thinking
```

| 模型 | 现在声明 | 真实要求 |
|---|---|---|
| `mimo-v2.5` | `siliconflow` → 发 `enable_thinking` + `thinking_budget` | 官方小米 API 要 `thinking: {type}`，**不支持 `reasoning_effort`**。`enable_thinking` 是**阿里云代理版**的形态 |
| `google/gemini-3.8-flash` | `openai-reasoning-effort` → 发 `reasoningEffort` | 要 `thinking_level: low\|medium\|high`（3.8 已废弃 `minimal`）。现有 hint 文案写的就是 `thinking_level`，说明写文案的人知道，但**代码发的是另一个参数** |
| `deepseek/deepseek-v4.1-flash` | （新模型） | `thinking: {type: enabled}` + `reasoning_effort` 两者配合 |
| `kimi-k3` | （新模型） | `reasoning_effort`，**禁止传 `thinking` 对象**（传了直接报错），且不支持 `thinking_budget` |

至少要新增三个方言：`gemini-thinking-level`、`deepseek-thinking`、`mimo-thinking`。

**同样要先实测 relay 的归一化行为**——如果中转站统一收 `reasoning_effort` 再自己翻译，那我们只需要一个方言；如果它透传，就得按上表逐个声明。**这个实测结果决定 F1 的工作量，必须在动手写注册表之前做完。**

#### （c）两条产品层面的事要你拍板

1. **`meta/muse-spark-1.3-contributor` 是「用数据换价格」的 SKU** —— 调用方授权 Meta 把 prompt 与生成内容用于模型训练，换来约 12–21 倍降价。我们的用户发的是学习内容、错题、笔记片段。建议**上，但在模型选择处明示**；也可以换标准版 `meta/muse-spark-1.3`（贵一个数量级）。
2. **`inclusionai/ling-3.0-flash-sante:free` 的免费档 2026-10-04 到期**（距今约 3 周），到期后 `:free` 路由**停止服务**。要么接受它会过期并准备下架流程，要么上线时就用标准 id。

## 4. 生图为什么不好使（核实到的根因）

按可能性排序。**A 阶段要先复现再修，不要照单全改。**

| # | 根因 | 证据 |
|---|---|---|
| 1 | **生图凭证没有自己的来源**，落进 `credentialsFor` 的 `default` 分支用 `AI_*`。`AI_BASE_URL` 一旦不是硅基流动（比如被指向中转站），`Tongyi-MAI/Z-Image-Turbo` 在那边不存在 → 400/404 | `provider.ts:200-205`、`provider.ts:394`（`credentialsFor(info.endpoints[0]?.provider ?? "siliconflow")`） |
| 2 | **`AI_BASE_URL` 不过 `/v1` 归一化**，漏写 `/v1` 就拼出 `https://host/images/generations` | `provider.ts:22` vs `:65`；`imagesGenerationsUrl`（`provider.ts:340`） |
| 3 | **`/api/image-gen` 已进登录闸门**（#63 把它列入 8 条付费路径）。未登录 / token 过期 → 401，而前端提示可能仍显示成生图失败 | `proxy.ts` matcher、`lib/auth/paidAiRoutes.ts` |
| 4 | **路由把上游 status 与响应体原样透传**，导致真实原因被上游文案盖住、排障困难 | `image-gen/route.ts:102-110`（`errText.slice(0,300)` + `status: res.status`）。这条同时是 L2 的 #95 |
| 5 | `imageParams.sizes` 里的尺寸预设（`720x1440` 等）若上游不接受会 400；`detectImageApiStyle` 对新模型名的推断可能落错风格 | `models.ts:283`、`image-gen/route.ts:63` |

**A 阶段第一步必须是复现并抓到真实的上游响应**（临时打日志或走 #52 的 JSONL），把根因钉到上面某一条，再动手。

## 5. 分阶段实施

### 阶段 F0 · 先实测中转站行为（**动手写代码之前**）

3.6 的（a）（b）两条决定 F1 的工作量与可行性。用一个短脚本或临时路由对**我们的 relay** 打三次真实调用：

1. `kimi-k3` 的「多轮 + 工具」→ 不回传 `reasoning_content` 会不会 400？
2. `mimo-v2.5` 同上。
3. 对 `google/gemini-3.8-flash` 发一次带 `reasoning_effort` 的请求，再发一次带 `thinking_level` 的 → relay 认哪个？

**用最短的 prompt，控制花费。** 结论写进 `tmp/issues/l0-relay-probe.md`，再进 F1。若 relay 已统一归一化，F1 的方言工作量接近零；若透传，要按 3.6(b) 的表逐个声明并新增三个方言。

### 阶段 F1 · 注册表与渠道重构（含 #92）

1. `ProviderKind` 重整。内置模型统一走 `relay`；`mimo` / `zhipu` 保留但**降级为「非对话能力」的渠道**（向量 / 重排 / 搜索）与可选的容灾第二跳。
2. `credentialsFor` 的 `default` 分支拆掉，改成**按能力显式解析**：
   - `chat`（内置）→ relay
   - `image` → 生图凭证（默认硅基流动 = 现在的 `AI_*`，建议同时支持新的 `SILICONFLOW_*` 别名并保持向后兼容）
   - `embedding` / `rerank` → 现有 `AI_*` + `ZHIPU_*` 容灾（**行为不变**，用户要求 1b）
   - `websearch` → `ZHIPU_API_KEY`（**行为不变**，用户要求 1c）
   - 每一路都要过 `normalizeOpenAIBaseUrl`（修根因 2）
3. 写入 3.2 的 12 个模型 + 3.4 的生图模型，`group` 用新的四个二级分组。
4. `DEFAULT_MODEL_ID` 改 `deepseek/deepseek-v4.1-flash`。
5. `ENV_MODEL_PRO` / `ENV_MODEL_FLASH` 的兜底值改成新注册表里存在的 id（`provider.ts:71-72`）。
6. **`LEGACY_REGISTRY_ALIASES` 全量重算**（见第 6 节，这是本 loop 最容易出事的一处）。
7. `imageModeTextModelFallback` 的默认值 `mimo-v2.5-pro` 指向一个即将被删的模型 → 改掉（`requestSchema.ts:60`，以及 `lib/stores/settings.ts` 里的同名默认）。
8. 若选 3.5 的 B 方案：把 `thinkingSettings` 从绑 `primary` 改为绑 `getActualProvider()` 的落地端点，并按落地端点重取 `ModelInfo`（复用 `resolveActualBillingModelId` 的判据，抽成共享函数）。**这就是 #92。**
9. 按 F0 的实测结论决定是否新增 `gemini-thinking-level` / `deepseek-thinking` / `mimo-thinking` 三个方言，并修掉 3.6(b) 里已经写错的两条。
10. 若 F0 确认 relay 不补 `reasoning_content`：给 `ModelInfo` 加 `preservesReasoning`，历史组装与 `pruneMessages` 都要尊重它。**同时把这条写进 L3 的 #81 不变量**，否则 L3 会推翻它。
11. `pricing` 按 `MODELS.md` 第 2 节的人民币数字填，**逐个核对第 3 节的口径说明**（非优惠、非峰谷、阶梯取最贵）。`MODELS.md` 第 7 节列的存疑字段**留空，不要填猜的数字**。
12. `vision` 按真实能力填，不要按分组推断——`Qwen/Qwen3.7-Flash` 虽在「快速模型」组但支持图文视频；真正无视觉的只有两个免费模型。

### 阶段 F2 · 能力凭证的设置页 + #75 #76

1. 设置页新增「能力端点」区（或扩展现有 `ImageSection`），允许用户自配：
   - **生图**：baseUrl / apiKey / 模型 id / API 风格（auto·openai·siliconflow）
   - **向量 embedding**：baseUrl / apiKey / 模型 id
   - **重排 rerank**：baseUrl / apiKey / 模型 id
   - **联网搜索**：凭证（#75）
   - **搜图**：Unsplash access key 或替代源（#75）
2. **每一项都要「留空 = 用平台默认」**，默认行为与现在完全一致（用户要求 1）。
3. 产出 #68 要用的归属判据：一个纯函数，输入「这次调用用的是平台凭证还是用户凭证」，输出 `UsagePool`。放 `lib/billing/` 下并被测试 import。
4. #76 的文案：`webSearch/presentation.ts:6` 的「需配置 Bocha key」改成智谱；`imageSearch` 缺 key 时返回明确的「未配置」而不是空数组伪装成「没搜到」；`.env.example` 删掉不存在的 Demo 模式。
5. 每一项配好之后要能**当场测连通**（生图尤其需要，见第 4 节根因 3——测试按钮能把「没登录」和「端点错」区分开）。

### 阶段 F3 · 生图修复与验证

1. 先复现，抓真实上游响应，钉住第 4 节的根因。
2. 按根因修。F1 已经修掉 1 和 2；3 需要前端把 401 与生图失败区分开；4 留给 L2 的 #95（但本 loop 至少要让错误信息足够排障，别把真实原因吃掉）。
3. **必须真开浏览器生成一张图**才算完（见第 9 节端测）。

## 6. 不变量（本 loop 的高危区）

### 6.1 `LEGACY_REGISTRY_ALIASES` 必须全量重算，且不能留悬空指向

用户的 `selectedModelId` / `imageModeTextModel` / `excerptModelId` 等都持久化在 localStorage 里。删模型必须配别名，否则用户打开就是「模型不存在」。

**当前 alias 表里已经有指向即将被删 id 的条目**（`models.ts:109-123`）：

| 现有 alias | 指向 | 问题 |
|---|---|---|
| `MiniMaxAI/MiniMax-M3` → `Qwen/Qwen3.8-27B` | 27B 被删 | **悬空**，要改指向 `Qwen/Qwen3.8-Flash` |
| `MiniMaxAI/MiniMax-M2.5` → `Qwen/Qwen3.8-27B` | 同上 | 悬空 |
| `Qwen/Qwen3.6-35B-A3B` → `Qwen/Qwen3.8-27B` | 同上 | 悬空 |
| `Qwen/Qwen3.6-27B` → `Qwen/Qwen3.8-27B` | 同上 | 悬空 |
| `moonshotai/Kimi-K2.7-Code` → `Qwen/Qwen3.8-27B` | 同上 | 悬空 |
| `Pro/moonshotai/Kimi-K2.6` → `google/gemini-3.7-flash` | 3.7 被删 | 悬空（可顺势改指 `kimi-k3`） |
| `deepseek-ai/DeepSeek-V4-Pro` → `deepseek/deepseek-v4-flash` | v4-flash 被删 | 悬空 → `deepseek/deepseek-v4.1-flash` |
| `deepseek-ai/DeepSeek-V4-Flash` → `deepseek/deepseek-v4-flash` | 同上 | 悬空 |

**本次新增要删的 id，都要补 alias**：

| 被删 | 建议指向 |
|---|---|
| `Qwen/Qwen3.8-27B` | `Qwen/Qwen3.8-Flash` |
| `google/gemini-3.7-flash` | `google/gemini-3.8-flash` |
| `deepseek/deepseek-v4-flash` | `deepseek/deepseek-v4.1-flash` |
| `mimo-v2.5-pro` | `mimo-v2.5`（同厂同系）或 `kimi-k3`（同为旗舰） |

**必须补一个测试**：遍历 `LEGACY_REGISTRY_ALIASES` 的所有 value，断言每一个都能被 `getModelInfo` 查到。这条测试能一次性挡住所有悬空别名，且以后加删模型都受保护。

### 6.2 其他不变量

- **persist key 一律不得改名**（`gailvlun-settings-v1` 等）。新增能力端点配置项只能**加字段**，不能改结构导致旧数据读不出来。
- **`renderInteractive` 工具 id 冻结**（与本 loop 无关但别顺手动）。
- **默认行为不变**（用户要求 1）：生图默认硅基流动、向量与重排默认现有、联网搜索默认现有。留空即默认。
- **`:free` 后缀必须原样发给上游**，只在展示层隐藏。
- **不要把用户的 apiKey 写进任何被 git 追踪的文件**。新增的能力端点配置里有 key，#72 的明文治理适用同样约束。
- **免费模型的 `pricing` 必须显式写 0**，不能省略。省略 → `calcUsageCostCny` 里 `pricing` 为 undefined → 直接 return 0，看起来一样；但 `getModelInfo(...)?.pricing` 在看板与额度聚合处会走不同分支。显式 0 更安全。
- **不要动 `content/**`**。

## 7. 陷阱

1. **别名悬空**（6.1）。这是本 loop 最可能直接打到用户脸上的 bug：打开应用发现模型没了、或者默认模型选不中。
2. **`imageModeTextModelFallback` 默认值指向被删模型**（`requestSchema.ts:60` + settings store 的默认）。两处都要改。
3. **`ENV_MODEL_FLASH` 的兜底值**（`provider.ts:72`）指向被删的 `z-ai/glm-5.3-flash`？——注意 GLM **保留**在多模态组，所以这一条其实安全；但 `ENV_MODEL_PRO` 的兜底 `Qwen/Qwen3.8-27B` 会悬空。
4. **`AI_BASE_URL` 现在同时承担「生图」与「向量/重排」两个角色**。拆分时不要把 embedding/rerank 的行为改了（用户要求 1b 明确说保持）。
5. **生图不要在没复现的情况下乱改**（第 4 节）。五条根因里有三条要改不同文件，猜错就是白做一轮。
6. **`build-index` 脚本也用 embedding**（`scripts/build-index.ts` 走 `SiliconFlowEmbedding`）。改 embedding 凭证解析时，要确认离线建索引脚本仍能跑——它没有用户上下文，只能用 env。
7. **knip**：新增的能力凭证解析模块、pool 判据模块必须被测试 import。
8. 不要跑 `pnpm build`（`prebuild` 会全量扫 `content/`）；不要起 `next dev`（35349 已有一份）。

## 8. 合并验收

**模型目录**
- [ ] 设置页与模型菜单只有「内置模型」与「API 调用」两个顶级分类，不再出现渠道名（硅基流动 / 小米 / 智谱 / 中转）
- [ ] 内置模型按 快速 / 多模态 / 免费 / 旗舰 四个二级分组展示，模型与 3.2 一致
- [ ] 展示名是美化后的名字，`:free` 后缀不出现在 UI 上
- [ ] 全局默认模型是 `deepseek/deepseek-v4.1-flash`
- [ ] 免费模型的对话费用为 0，但其触发的工具调用照常入账
- [ ] `MODELS.md` 里每个模型的价格 / 上下文 / 思考形态与注册表里的声明一致

**兼容**
- [ ] `LEGACY_REGISTRY_ALIASES` 的每一个 value 都能被 `getModelInfo` 查到（有测试）
- [ ] 升级前选中已删除模型的用户，打开后被平滑迁移到新模型，不报错、不空白
- [ ] 已保存的自定义 API 分组不受影响

**能力凭证**
- [ ] 生图 / 向量 / 重排 / 联网搜索 / 搜图 都能在设置页自配
- [ ] 全部留空时行为与改动前完全一致（生图走硅基流动、向量与重排走现有、搜索走智谱）
- [ ] 自配后该部分不计入平台额度（判据函数已就绪，供 L1 的 #68 使用）
- [ ] 缺搜图 key 时模型收到的是「未配置」而不是「没搜到」
- [ ] 设置面板显示的搜索供应商与实际一致（智谱，不是 Bocha）
- [ ] `.env.example` 删掉不存在的 Demo 模式描述

**生图（#4 的修复）**
- [ ] 默认配置下能真实生成图片
- [ ] 自配生图端点后也能生成
- [ ] 生图失败时错误信息能区分「未登录」「端点不对」「上游拒绝」三类

**方言（#92，若选 3.5 的 B）**
- [ ] 降级到备用渠道后思考参数按落地端点的方言下发
- [ ] 主端点行为不变
- [ ] 有降级路径的测试

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0

## 9. Loop 末尾端测脚本

真开 `http://localhost:35349`。**这个 loop 的端测权重最高**——模型菜单和生图都是用户天天看见的东西。

1. 打开设置 → 只有「内置模型」「API 调用」两类；内置下是四个二级分组；没有任何「硅基流动 / 小米 / 智谱 / 中转」字样。
2. 模型菜单默认选中 **DeepSeek V4.1 Flash**。
3. 逐个切换 12 个内置模型，各发一句极短的话（例如「你好」）→ 都能出答案，不报「模型不存在」。**用最便宜的问题，别刷额度。**
4. 选一个免费模型发一轮 → 计费看板显示 ¥0；再让它联网搜一次 → 出现一条工具费用记录。
5. **生图**：默认配置下让 AI 生成一张图 → 真的出图。
6. 设置页自配一个生图端点（可以填错的，用来看报错）→ 报错能看出是端点问题，不是一句「生图失败」。再填对 → 出图。
7. 向量 / 重排留空 → 笔记检索仍正常（回归，不能因为拆凭证把检索弄坏）。
8. **降级方言**（若选 B）：临时把 relay 的 key 改坏 → 从 `log/agent-lifecycle.jsonl` 看第二跳的请求参数是备用渠道的方言。
9. **旧数据迁移**：手动把 localStorage 的 `selectedModelId` 改成 `Qwen/Qwen3.8-27B`（已删）→ 刷新 → 平滑落到 `Qwen/Qwen3.8-Flash`，不空白不报错。
10. 控制台无 500、无 `proxy.ts` / matcher 报错。

端测者交回 `tmp/issues/model-l0-e2e.md`，**附模型菜单与生图结果的截图**。

## 10. 提交与关单

| 阶段 | commit | Closes |
|---|---|---|
| F1 | `refactor(model): unify the catalog into builtin and byok tiers` | 无（新范围，在 body 里说明） |
| F1 | `fix(model): switch thinking dialect with the landed endpoint` | `Closes #92` |
| F2 | `feat(settings): let users configure image, embedding, rerank and search endpoints` | `Closes #75` |
| F2 | `docs(tools): align search tool copy with the real provider` | `Closes #76` |
| F3 | `fix(image): resolve image credentials independently of AI_BASE_URL` | 无（新范围） |

新范围的三个 commit 没有对应 Issue。**建议在 GitHub 上补一个 Issue 记录这次模型目录重构**，让 commit 有可追溯的出处；或者在 commit body 里引用本文档路径。

## 11. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| **别名悬空导致用户打开就选不中模型**（最高风险） | 6.1 的遍历测试是必过项；端测第 9 项专门验证 |
| 调研查不到某些模型的真实价格，A 拿假数字填 `pricing` | **宁可留空也不要编。** `pricing` 缺省时计费记 0，比记错价格安全。`MODELS.md` 里要明确标注哪些是未证实的 |
| 拆能力凭证时把向量 / 重排弄坏，笔记检索失效 | 用户要求 1b 是「行为不变」。端测第 7 项 |
| 生图没复现就乱改，五条根因改错三条 | F3 第一步强制先复现 |
| 选了 3.5 的 A 方案，默认模型失去容灾 | 推荐 B。若选 A，要接受中转站抖动即失败 |
| 12 个内置模型逐个试一遍会花钱 | 端测第 3 项用极短提问；免费模型优先。旗舰模型可以只测一个 |

**可放弃的部分**：F2 里的向量 / 重排自配（默认行为不变即可，用户自配这两项的实际需求最低）。**不可放弃**：F1 的注册表重构与别名兼容、F3 的生图修复——前者不做整个 loop 没意义，后者是用户明确提的坏功能。
