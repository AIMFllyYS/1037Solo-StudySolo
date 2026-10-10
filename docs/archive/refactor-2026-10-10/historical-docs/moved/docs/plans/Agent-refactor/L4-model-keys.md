# L4 · 模型接入与密钥

> **一句话**：把「用户自己带来的模型和密钥」这条链修通——降级后方言跟着切、自定义分组的声明真的生效、密钥不再每轮全量旅行。
> **Issue**：#93 #94 #71 #72（1 个 P0：#71；2 个 P1：#93 #72；1 个 P2：#94）
> **来源 Epic**：E15 #41（余） + E6 #32
> **冲突域**：`CD-models`（#93 #94）+ `CD-client`（#71 #72）
> **顺序**：L3 之后。**不要与 L3 并行**——#93 的视觉闸门要改 `app/api/chat/route.ts`，L3 也在重度改这个文件。
>
> **⚠️ 两处前提变了（2026-09-12）**
> 1. **#92 已移到 L0。** 它的修法是「思考方言跟随落地端点」，而 L0 要重写整个模型注册表与端点声明——在重写时顺手做对最便宜。见 `L0-model-catalog.md` 第 1.2 节。
> 2. **本文档第 2 节的基线是 L0 之前的状态。** L0 会重写 `ProviderKind`、`MODELS`、`credentialsFor`，并把生图 / 向量 / 重排 / 搜索的凭证拆出来。**开工前先读 L0 的交回摘要**，以 L0 之后的代码为准；下面标了「L0 之后可能已解决」的条目要先复核还在不在。

## 1. 为什么这 4 个号是一个 loop

表面看是两组（模型接入 / 密钥治理），实际是**同一条数据链的两端**：

```
lib/stores/settings.ts          用户填的 customApiGroups（含 apiKey）
        ↓  #72 明文治理
lib/chat/buildChatRequestBody.ts   组进请求体  ← #71 停止全量上传
        ↓
lib/ai/agent/requestSchema.ts      服务端接收
        ↓
lib/ai/provider.ts  resolveProvider  ← #93 baseUrl 归一化 / 超时 / failover
        ↓
lib/ai/sdk/languageModel.ts        ← #94 双轨与 Anthropic 旁路（#92 已移交 L0）
        ↓
                                   上游
```

改任何一环都要理解整条链。#71 改「发什么」，#93 改「服务端怎么用」——同一个 `customApiGroups` 结构，拆开做等于让两个 A 各读一遍这条链。

## 2. 当前基线（已实地核实）

### 2.1 #92 降级方言 —— **已移交 L0**

这一条原本在本 loop。2026-09-12 之后归 L0：它的修法是「思考方言跟随落地端点」，而「有哪些端点、各自什么方言」正是 L0 重写注册表时要声明的东西。

完整基线（`getActualProvider` / `onLanded` / `resolveBuiltinEndpoint` 按 registryId 取方言 / 两种方言的装配形态 / 时序风险）见 **`L0-model-catalog.md` 第 2.5 节**。

L4 开工时只需确认一件事：**L0 是否已经把 `thinkingSettings` 从绑 `primary` 改成绑落地端点**。若已改，#93 的 failover 设计要与之保持一致；若 L0 选了「内置模型单端点」方案（`L0-model-catalog.md` 第 3.5 节的 A），那 failover 机制实际不触发，#93 的 failover 部分也随之失去意义。

<details>
<summary>以下是移交前的原始记录，保留备查（权威版本在 L0）</summary>

```52:52:lib/ai/sdk/languageModel.ts
  getActualProvider: () => ResolvedProvider;
```

```172:182:lib/ai/sdk/languageModel.ts
    onLanded: (_next, index) => {
      // …记录真正产出的候选
    },
    // …
    getActualProvider: () => actualProvider,
```

**但思考参数仍然绑 primary**：

```185:185:lib/ai/sdk/languageModel.ts
    thinkingSettings: (effort) => (supportsThinking ? buildThinkingSettings(primary, effort, info) : {}),
```

当时的判断：**#92 不需要新建追踪机制，只需要把 `primary` 换成落地端点，并按落地端点重新取 `ModelInfo`。** 审计报告成文时 `getActualProvider` 还不存在，所以它估的工作量偏大。

`onLanded` 的实际触发点在 `lib/ai/sdk/failoverModel.ts:102-103`（`options.onLanded?.(candidates[i], i)`），在 failover 模型真正产出时调用。

另一半问题在 `lib/ai/provider.ts:209-232` 的 `resolveBuiltinEndpoint`——**`thinkingRequestStyle` 挂在 registry 条目上**，而它按 registryId 取 `ModelInfo`，`endpointIndex` 只换凭证与 `apiModelId`：

```209:232:lib/ai/provider.ts
function resolveBuiltinEndpoint(registryId: string, endpointIndex: number): ResolvedProvider {
  const info = getModelInfo(registryId);
  const effectiveInfo = info ?? getModelInfo(fallbackId);
  const endpoint = endpoints[idx];
  thinkingRequestStyle: effectiveInfo?.thinkingRequestStyle ?? "siliconflow",
```

两条 registry 的方言声明：

```161:174:lib/ai/models.ts
  id: "z-ai/glm-5.3-flash",
  thinkingRequestStyle: "openai-reasoning-effort",
  endpoints: [ep(RELAY, "z-ai/glm-5.3-flash"), ep(MIMO, "mimo-v2.5")],
```

```254:265:lib/ai/models.ts
  id: "mimo-v2.5",
  thinkingRequestStyle: "siliconflow",
  endpoints: [ep(MIMO, "mimo-v2.5")],
```

两种方言最终装配成什么（`languageModel.ts:125-148` 的 `buildThinkingSettings`）：

| 风格 | 下发 |
|---|---|
| `openai-reasoning-effort` | `providerOptions.upstream.reasoningEffort` |
| `siliconflow` | `providerOptions.upstream.{ enable_thinking: true, thinking_budget }` |

GLM 是**今天唯一真正有第二跳的内置模型**，而且备用是**另一个模型**（`mimo-v2.5`）不是同模型换网关。净效果：**降级后计费 id 已经正确切成 MiMo（#65 的功劳），但思考参数仍按 GLM 的 `reasoningEffort` 下发。**

`buildThinkingSettings` 经 `thinkingSettings()` 进入三处生产调用：`app/api/chat/route.ts:163`、`app/api/artifact/route.ts:37`、`app/api/record/route.ts:224`。**`/api/document` 不传思考参数**（`document/route.ts:85-104` 只加长超时）——这是 P1-46，没有对应 Issue，L0 顺手修掉。

</details>

### 2.2 #93 自定义分组的四处失效

| 问题 | 当前状态 |
|---|---|
| **无 failover** | `hasNextEndpoint`（`models.ts:456-458`）只查内置 `MODELS`；`resolveNextProvider`（`provider.ts:322-328`）据此提前返回 null。自定义路径 `endpointIndex` 恒为 0 |
| **超时写死** | `DEFAULT_CHAT_TIMEOUT_MS = 45_000`（`lib/ai/upstream.ts:23`），在 `provider.ts:275` 与 `309` 硬用 |
| **假端点占位** | `models.ts:550-551` 把 endpoints 写死成 `[{ provider: SF, apiModelId: c.id }]`。凭证实际走分组的 `baseUrl`/`apiKey`，根本不经这条链 |
| **baseUrl 不归一化** | **部分已改**，见下 |
| **视觉闸门跳过** | `app/api/chat/route.ts:139-140` 的条件含 `!provider.isCustom`；客户端 `lib/hooks/useImageAttachments.ts:80-81` 用只看内置表的 `getModelInfo` |

**baseUrl 这一条要分清**：#58 已经加了主机校验——`provider.ts:20` 引入 `assertSafeCustomBaseUrl`（`@/lib/ai/customBaseUrl`），在 263 / 301 / 380 三处调用，堵住了 SSRF。但 **`/v1` 归一化仍然没有**：

```30:30:lib/ai/provider.ts
export function normalizeOpenAIBaseUrl(url: string): string {
```

```65:65:lib/ai/provider.ts
const RELAY_BASE = normalizeOpenAIBaseUrl(
```

`normalizeOpenAIBaseUrl` **只作用于模块加载时的 `RELAY_BASE`**。自定义分组的 baseUrl 只过 `assertSafeCustomBaseUrl`（`lib/ai/customBaseUrl.ts:79-108`，只看字面主机不做 DNS，拒回环 / 无点主机 / `.local` / IPv4+IPv6 私网），**不补 `/v1`**。

而 Electron 的连通性测试自己有一份补全逻辑：

```362:365:electron/main.js
  const withV1 = (base) => {
    const t = String(base || "").trim().replace(/\/+$/, "");
    return /\/v1$/i.test(t) ? t : `${t}/v1`;
```

**两处各写一套 = 测试通过但运行时 404。** 这正是 #93 要消掉的根因：不是「加一个归一化」，而是**让这两处共用同一个函数**。

顺带记录：`/api/can-embed` 已经复用同一套主机校验（`guardProbeUrl` → `checkCustomBaseUrl`）且改成了 `redirect: "manual"` + 跳转目标再检——那是 #59 的成果，不要回退。

### 2.3 #94 双轨与 Anthropic 旁路

**死代码双轨**：`buildThinkingRequestParams` 仍在 `provider.ts:155-175`，**唯一引用方是 `lib/ai/provider.test.ts`**。它会把 openai 的 `max` 夹成 `high`，而且字段名是裸 `reasoning_effort`（生产的 `buildThinkingSettings` 走 `providerOptions.upstream.reasoningEffort`）——两套连字段形状都不一样，误改必错。

**Anthropic 旁路**：`languageModel.ts:76-78` 的 anthropic 分支直接返回，既不包 `createReasoningNormalizingFetch`（那是第 86 行 openai-compatible 分支的事），也不套 `extractReasoningMiddleware`（第 90 行）：

```76:78:lib/ai/sdk/languageModel.ts
  if (p.apiProtocol === "anthropic") {
    const anthropic = createAnthropic({ baseURL: normalizeAnthropicBaseUrl(p.baseUrl), apiKey: p.apiKey });
    return anthropic(p.apiModelId);
```

注意 anthropic 的**思考**参数是单独处理的（`languageModel.ts:132-136` 的 `anthropic-thinking` case 走 `providerOptions.anthropic.thinking`），所以「Anthropic 完全没有 reasoning 支持」是不准确的——缺的是**归一化与 `<think>` 抽取**这两层。#94 的结论要落在文档上（验收标准原文：「Anthropic 路径的 reasoning 行为有明确结论并落文档」）。

**配置项失效**：`AI_ENABLE_THINKING` 只出现在 `.env.example:19` 与 `electron/config.js:18`，运行时对话代码从不读取（思考开关来自请求体的 `enableThinking`）。

**另一处 env 双语义**（P1-41，无对应 Issue）：`provider.ts:22-72` 在**模块加载时**读一次 env（`BASE` / `KEY` / `MIMO_BASE` / `RELAY_KEY` / `ENV_MODEL_FLASH`），改 env 必须重启进程；而 `app/api/chat-title/route.ts:16-30` 的 `titleProvider()` 在**每次请求时**读。同一个仓库两套语义。#94 顺手统一或至少在注释里说明，记进交回摘要。

`chat-title` 还走旧 `CustomProvider` 形状（`resolveLanguageModel("custom", provider)`），不读 `customApiGroups`——这是 P1-49，也没有对应 Issue。它意味着**用户的自定义模型永远不会被用来生成标题**，标题永远花平台的钱。这一条与 L1 的 #68（BYOK 平台侧开销）直接相关，在 L4 记录、在 L1 计量。

### 2.4 #71 每轮全量上传密钥

```58:58:lib/chat/buildChatRequestBody.ts
    customApiGroups: settings.customApiGroups,
```

**整个数组**（含每个分组的明文 `apiKey`）进请求体。

**6 个客户端构造点（已核实，这是 #71 的完整落点清单）**：

| 路由 | 客户端构造 | 服务端接收 |
|---|---|---|
| `/api/chat` | `lib/chat/buildChatRequestBody.ts:58` | `requestSchema.ts:38-57` 有 zod |
| `/api/artifact` | `components/chat/ArtifactCard.tsx:116` | `Array.isArray` 手判 |
| `/api/document` | `components/chat/DocumentCard.tsx:68` 与 `:94`（**大纲 + 每节各一次**） | `as CustomApiGroup[]` 强转 |
| `/api/image-gen` | `components/chat/ImageGenViewer.tsx:46` | 无校验 |
| `/api/record` | `lib/review/startRecord.ts:28`（`aiRequestExtras`） | 无校验 |
| `/api/canvas-revise` | `components/chat/CanvasRevisionPanel.tsx:56` | 无校验 |

**长文档 1+N 次请求 = 密钥走 N+1 遍**（`DocumentCard.tsx` 两处构造点就是大纲与每节）。

**不上送全量分组的**：`/api/chat-title`（只要 `content`）、独立 `POST /api/follow-ups`（固定 `ENV_MODEL_FLASH`）。主对话里的 FollowUp 兜底复用服务端已收到的 `custom`（`followUps.ts:53`），不额外上传。

> 服务端那一列的「无校验」是 **L2 #96 的范围**，不是 #71 的。#71 只管「少发」，#96 管「收严」。两个 loop 不要互相等。

另有一个旧通道：`buildChatRequestBody.ts:52-55` 在 `customApiGroups` 为空且填了 `customBaseUrl` 时组一个 `customProvider`（单组形态）。桌面端选「自由中转」时，body 里**仍会带上网页设置里其它分组的 key**。

### 2.5 #72 明文落盘

`lib/stores/settings.ts:107-130` 定义 `LS_KEY = "gailvlun-settings-v1"` 与 `Persisted` 类型，整份 JSON 明文写 localStorage，含 `customApiGroups[].apiKey`。

**还有一份派生副本**（`settings.ts:232-254`）：

```ts
  customApiGroups: s.customApiGroups,
  customApiKey: firstGroup?.apiKey ?? "",
  localStorage.setItem(LS_KEY, JSON.stringify(data));
```

`customApiKey` 是第一个分组 apiKey 的**冗余拷贝**，同一个密钥在同一个 JSON 里存两遍。#72 处理明文时要把这份派生字段一起收掉（或确认它还有消费者——`buildChatRequestBody.ts:52-55` 的旧 `customProvider` 通道在用它）。

**风险已经降了一档**：#55 已经把两处 AI iframe 的 `allow-same-origin` 去掉，AI 生成的 HTML 不再同源、读不到 localStorage。所以 #72 从「同源脚本可直接读走」降级为「本机其他脚本 / 扩展 / 取证可读」。它现在是 P1 而不是 P0。

桌面端已有 `safeStorage`（DPAPI）通道可参考：`electron/main.js:46-77`。

### 2.6 已经就位、会影响本 loop 的东西

| 设施 | 来自 | 影响 |
|---|---|---|
| `assertSafeCustomBaseUrl` | #58 | #93 改归一化时**不要绕过它**。顺序应是：先归一化再校验，或校验后再补 `/v1`——两者都要走到 |
| `installAiAuthFetch` + `proxy.ts` 闸门 | #63 | 8 条付费路由已强制登录。#71 精简 body 时不要碰 Bearer 注入 |
| `resolveActualBillingModelId` / `getActualProvider` | #65 | L0 的 #92 已复用它；#93 若加自定义 failover 也走同一判据 |
| `settleUsage` 的 ALS | #66 | 若 #93 给自定义分组加了 failover，落地端点要能进 `actual_model_id` |
| L1 的 BYOK 判据 | L1 的 A2 阶段 | **如果 L1 已落地，#71 精简 body 时必须保持那个判据仍能工作**——它要知道「本次用的是用户自己的 key」 |

## 3. 分阶段实施

### 阶段 E1 · #93 + #94 模型接入层

两个号改的是同一个三文件组（`models.ts` / `provider.ts` / `languageModel.ts`），一个 A 顺序做完。

**开工前先读 L0 的交回摘要**，确认这三个文件在 L0 之后长什么样。下面的落点是 L0 之前的状态，逐条复核还在不在。

**#93 自定义分组**

1. **baseUrl 归一化**：让自定义 baseUrl 也过 `normalizeOpenAIBaseUrl`，并与 Electron 连通性测试的补全逻辑统一到**同一个函数**（这才是 #93 的目的——「测试通过但运行时 404」的根因是两处各补一套）。注意与 `assertSafeCustomBaseUrl` 的调用顺序。
2. **超时可配**：`CustomModelConfig` / 分组上加可选的超时字段，缺省仍是 `DEFAULT_CHAT_TIMEOUT_MS`。
3. **视觉闸门**：服务端去掉 `!provider.isCustom` 的整段跳过，改用 `getModelInfoWithCustom`；客户端 `useImageAttachments` 同样换成 `getModelInfoWithCustom`。两端都改，否则声明仍不生效。
4. **failover**：`hasNextEndpoint` 要能看见自定义分组。但**先想清楚自定义分组的 failover 语义**——`models.ts:551` 的 endpoints 是假占位，一个自定义模型只有一个端点，没有第二跳可降。所以要么（a）允许用户在分组里配多个 baseUrl 作为备用，要么（b）明确「自定义分组不支持 failover」并把假占位删掉、让 `hasNextEndpoint` 正确返回 false。**(b) 成本低得多且不误导**，推荐 (b)，把 (a) 记进交回摘要作为后续可选增强。验收标准只要求「contextK / vision / 超时声明全链路生效」，没要求必须有 failover。

**#94 清双轨**

1. 删 `buildThinkingRequestParams`（连同只引用它的测试），或把它与 `buildThinkingSettings` 合并成一条路径。**注意 knip**：删导出后如果测试还 import 会红。
2. Anthropic 路径：决定要不要套 `extractReasoningMiddleware`。Anthropic 原生返回结构化 reasoning，不走 `<think>` 内嵌，所以**大概率不需要**——但要实测确认，并把结论写进文档（`docs/refer/` 或 `languageModel.ts` 的文件头注释）。`createReasoningNormalizingFetch` 同理。
3. `AI_ENABLE_THINKING`：从 `.env.example` 与 `electron/config.js` 删掉，或真的接上。**推荐删**——思考开关已经在 UI 里了，再来一个 env 开关只会制造双源。

### 阶段 E2 · #71 + #72 密钥

**#71 停止全量上传**（P0，先做）

1. `buildChatRequestBody.ts:58` 改成只发**本次实际会用到的**那一个分组。判据：`resolved.effectiveModelId` 属于哪个分组（`findCustomModelGroup` 已有）。
2. 内置模型时一个分组都不用发。
3. 桌面「自由中转」（`customProvider` 通道）时也不要带网页设置里其它分组的 key。
4. **6 条路由的 body 组装处都要改**——先把它们找全（`chat` / `artifact` / `document` / `image-gen` / `record` / `canvas-revise`），不要只改 `chat`。
5. **不要破坏 L1 的 BYOK 判据**：服务端要能继续判断「本次用的是用户自己的 key」。精简后判据的输入变了（数组里只有一个元素），要确认那段逻辑仍成立。
6. 服务端 `requestSchema` 的 `customApiGroups` 保持数组形状（兼容旧客户端），只是实际只收到 0 或 1 个元素。

**#72 明文治理**（P1，风险已降，见 2.5）

目标是「降低明文暴露面」，不是「做到绝对安全」（浏览器里没有绝对安全）。按成本排：

| 方案 | 说明 |
|---|---|
| A. 桌面端走 `safeStorage`（DPAPI） | exe 形态可以真正加密。参考 `electron/main.js:46-77`。网页端无此通道 |
| B. 网页端把 apiKey 从 `gailvlun-settings-v1` 拆到独立 key，并做轻量混淆 | 混淆不是加密，价值主要是「不被顺手 grep 到」。要诚实标注 |
| C. 网页端改成会话内存 + 每次重填 | 最安全但体验最差，不推荐 |

**推荐 A（桌面）+ B（网页），并在设置页明确告知网页端的存储性质。** 验收标准里有一条硬要求：**「用户已保存的自定义分组能平滑迁移，不需要重新填写」**——所以必须有迁移逻辑，且 persist key 的处理要小心（见不变量）。

## 4. 不变量

- **persist 名不得改。** `gailvlun-settings-v1` 已落在所有用户的 localStorage 里。#72 如果把 apiKey 拆到新 key，**旧 key 必须保留并做一次性迁移**，不能直接改名。执行契约第六节：「改名等于让用户数据凭空消失」。
- **`assertSafeCustomBaseUrl` 不得绕过。** #58 的 SSRF 收口是 P0，#93 加归一化时只能在它前后插，不能替换掉它。
- **闸门无旁路。** 不要在精简 body 时动 `installAiAuthFetch` 或 `proxy.ts`。exe 与 BYOK 用户同样强制登录。
- **计价按实际落地模型。** 不要改动 `resolveActualBillingModelId` 的判据，那是 #65 钉住的、L0 又复用过的。
- **`custom-openai` 的 `isCustom` 是 `false`。** 这是全链最容易误判的一点（`provider.ts:221` 的 `isCustomOpenai`、234 行的 `isCustom: false`）。#71 判「本次用哪个分组」、L1 判 BYOK，都不能用 `isCustom` 一刀切。
- **客户端不得 import 任何 `tool.ts` / `server.ts`**（六处 `no-restricted-imports` 均为 error）。#71 在客户端做分组筛选时，只能用 `lib/ai/models.ts` 里的纯函数。
- **`lib/**` 不得 import `components/**`**。

## 5. 陷阱

1. **L0 可能已经改掉了 failover 的形态。** 若 L0 选了「内置模型单端点」，`hasNextEndpoint` 恒 false，#93 的 failover 部分没有意义；若选了保留二跳，#93 要与 L0 的方言跟随逻辑保持一致。**开工第一件事是读 L0 的交回摘要。**
2. **`normalizeOpenAIBaseUrl` 与 `assertSafeCustomBaseUrl` 的顺序**。补 `/v1` 之后 host 不变，所以两种顺序都安全；但要确保**两个都执行到**，别改着改着漏了一个。
3. **自定义分组的 endpoints 是假占位**。#93 如果按真 failover 去实现，会发现没有第二个端点可用。先决定语义（推荐 (b)），别写一半。
4. **删 `buildThinkingRequestParams` 会牵动测试**。删导出 + 删测试，knip 才不会红。
5. **#71 只改 `chat` 是最常见的漏**。6 条路由的组装点要找全。长文档（`document`）是「1 次大纲 + N 节」，漏了它等于 #71 的收益少了一大半。
6. **#72 的迁移如果写错，用户要重填所有 key**。这是用户可感知的最坏结果。迁移必须有单测，且要覆盖「旧 key 存在 / 新 key 已存在 / 两者都有」三种情况。
7. **视觉闸门两端都要改**。只改服务端的话，客户端仍然不让用户贴图；只改客户端的话，服务端会 throw。
8. **knip**：新增的归一化 / 分组筛选模块必须被测试 import。
9. 不要跑 `pnpm build`；不要动 `content/**`；不要起 `next dev`。

## 6. 合并验收

**自定义分组（#93）**
- [ ] 自定义模型的 vision 声明在服务端与客户端都生效
- [ ] baseUrl 归一化行为与 Electron 连通性测试一致（不再「测试通过但运行时 404」）
- [ ] 超时可按分组配置
- [ ] 自定义模型的 `contextK` 全链路生效（**与 L3 的 #84 重叠**：若 L3 已做完，这条只需回归确认）

**双轨清理（#94）**
- [ ] 思考参数装配只剩一条生产路径
- [ ] Anthropic 路径的 reasoning 行为有明确结论并落文档
- [ ] 不生效的配置项（`AI_ENABLE_THINKING`）被移除或接上

**密钥（#71 #72）**
- [ ] 请求体中不再出现与本次调用无关的分组密钥（**6 条路由逐条取证**）
- [ ] 自定义模型功能不受影响
- [ ] 密钥不再以可直接读取的明文形式长期驻留 localStorage
- [ ] 用户已保存的自定义分组能平滑迁移，不需要重新填写

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0

## 7. Loop 末尾端测脚本

**需要一个真实可用的自定义分组**（用户自己的 key），因为本 loop 的核心就是这条链。不要打真实付费的平台模型。

1. 设置页加一个自定义分组（OpenAI-compatible），**baseUrl 故意不带 `/v1`** → 连通性测试通过，且实际对话也能通（不再 404）。这是 #93 最关键的一项。
2. 用这个自定义模型发一轮对话 → 打开 DevTools Network，检查 `/api/chat` 的请求体：`customApiGroups` 里**只有这一个分组**。
3. 再加第二个自定义分组（填一个假 key 就行），重复第 2 步 → 请求体里**没有**第二个分组的 key。
4. 让这个自定义模型生成一篇长文档（触发 `/api/document` 的 1+N 次请求）→ 每次请求的 body 都只带一个分组。
5. 给自定义模型声明 `vision: true`，贴一张图 → 客户端允许贴、服务端不 throw、模型真的收到图。
6. 用 GLM（默认模型）发一轮，制造 primary 失败（临时把 relay 的 env 改坏，或在设置里选一个会失败的路径）→ 从 `log/agent-lifecycle.jsonl` 看第二跳的请求参数是 MiMo 方言，不是 GLM 方言。
7. 检查 localStorage：`gailvlun-settings-v1` 里不再有可直接读到的 apiKey 明文；刷新页面后自定义分组仍然可用（迁移成功）。
8. 控制台无 500、无 `proxy.ts` / matcher 报错。

端测者交回 `tmp/issues/model-l4-e2e.md`。

## 8. 提交与关单

| 阶段 | commit | Closes |
|---|---|---|
| E1 | `fix(model): honor custom group baseUrl, timeout and vision` | #93 |
| E1 | `refactor(model): drop the dead thinking path and document anthropic reasoning` | #94 |
| E2 | `fix(security): send only the credential this request needs` | #71 |
| E2 | `fix(security): stop keeping api keys in plaintext localStorage` | #72 |

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| **#72 的迁移写错，用户要重填所有 key**（本 loop 最坏结果） | 迁移必须有单测覆盖三种情况；端测第 7 项是必过项。宁可不做 #72，也不能做错 |
| 在 L0 之前动手，改的是即将被推翻的结构 | 陷阱 1。L0 未落地就不要开 L4 |
| #93 的 baseUrl 归一化破坏了现有能用的分组（有人填的 URL 本来就带 `/v1`） | 归一化必须幂等。要覆盖「带 `/v1`」「不带」「带尾斜杠」「带 `/anthropic` 后缀」四种 |
| #71 漏改某条路由，密钥继续从那条泄漏 | 端测第 2–4 项逐条覆盖。6 条路由要在交回摘要里逐条列出改动位置 |
| #93 的 failover 按 (a) 实现导致范围爆炸 | 走 (b)。选 (a) 必须先回来问 |
| 视觉闸门只改了一端 | 陷阱 7 |

**放弃优先级**：#94（P2，纯清理）→ #72（P1，风险已降且有迁移风险）→ #93 的 failover 部分。

**#71 不应放弃**：密钥每轮全量旅行是 P0 级的实际错误，而不是不够好。#93 的 vision / baseUrl 两项也应保住——它们是「用户填了声明但不生效」，属于结果错。
