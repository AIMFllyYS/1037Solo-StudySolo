# 供应商扩容与模型路由（七牛云 / xhuoai / 免费池换血 / Auto 路由 / 生图进度）

> **日期**：2026-09-21 · **分支**：`feat/model-providers-and-routing`
> **性质**：所有外部事实都做了**实机探测**（下文标注"实测"），不是文档推断；未验证的部分单独列在 §7
> **取代**：本文覆盖 `docs/plans/Agent-refactor/MODELS.md` 中"免费池 / 首跳供应商 / 生图"的旧描述

---

## 1. 一句话总结

文本侧新增**七牛云**为第一跳（Protocom 退为容灾），免费池 LongCat 换成 `poolside/laguna-s-2.1-free`，
Auto 改成「两个免费 + DeepSeek + GLM」四选一（规则优先、豆包兜底）；生图侧新增 xhuoai 三个慢速高价模型与
硅基流动的 `baidu/ERNIE-Image-Turbo`（新默认），并给生图加上**估算进度条**。

---

## 2. 七牛云（qnaigc）：实测行为与方言实现

凭据：`QINIU_BASE_URL=https://api.qnaigc.com/v1` / `QINIU_API_KEY`（模块级读取，改 env 需重启）。

### 2.1 三个模型都是真货

`GET /v1/models` 返回 81 个模型，用户给的三个 id **逐个存在**（实测）：
`z-ai/glm-5.3-flash`、`deepseek/deepseek-v4.1-flash`、`qwen/qwen3.7-flash`（注意 **小写** `qwen/` 前缀；
`Qwen/Qwen3.7-Flash` 这种写法只在中转站成立）。附带发现：`doubao/doubao-seed-2.0-mini` 是**错的**，
正确 id 是 `doubao-seed-2.0-mini`（带前缀会 400 `model_not_found`）。

### 2.2 思考开关的真实方言（本次最关键的一组事实）

| 模型 | 默认 | 关思考 | 开思考 |
|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` | **思考**（不传参 reasoning 100 字） | `thinking:{type:"disabled"}` ✅ 实测 9 token 出干净结果 | `thinking:{type:"enabled"}` ✅ |
| `qwen/qwen3.7-flash` | **思考** | `thinking:{type:"disabled"}` ✅ | 默认即开 |
| `z-ai/glm-5.3-flash` | **思考** | ❌ **不可能**：传 disabled 直接 400「该模型始终思考，不支持关闭思考；请使用 low、high 或 max」 | `reasoning_effort: low/high/max` |

由此得出两条硬约束（都在代码里落实了）：

1. **`enable_thinking` 在七牛云不管用**：实测 `enable_thinking:false` 仍返回 reasoning（GLM 603 字 / DS 119 字，
   且 DS 那次正文被 max_tokens 挤空）。老的 `siliconflow` 方言绝不能用在七牛云上。
2. **"不开启"必须显式说出来**：这些模型默认就思考，不传参等于开着。所以新增方言
   `qiniu-toggle`（`lib/ai/models.ts`），并在 `languageModel.ts` 的 `prepareCall` 里补了
   「没请求思考 → 显式下发 disabled」的那一半（`QINIU_THINKING_DISABLED`）。GLM 则保持
   `thinkingRequired: true`（UI 不给关），走 `reasoning_effort`，并把 UI 的 medium 映射到 low
   （只认 low/high/max，且我们要延迟）。

**实测延迟**（同一句「用一句话解释欧姆定律」，3 次）：

| 模型 | 三次耗时 |
|---|---|
| DeepSeek（关思考，max_tokens=200） | 3638 / 3617 / 3261 ms |
| GLM（effort=low） | 4718 / 10374 / 5177 ms |
| doubao-seed-2.0-mini（关思考，8 token） | 1266 / 1167 / 1368 ms |

### 2.3 一个必须修的部署隐患

七牛云是**第一跳**。如果部署时没填 `QINIU_API_KEY`：链首"未配置"（空 apiKey）→ 请求以空 Bearer 打出去拿
**401**，而 401/403/429 属于**不降级**错误 → **所有 DeepSeek / Qwen / GLM 请求硬失败**。
因此新增 `resolveEntryProvider()`（`lib/ai/provider.ts`）：链首没配就从链上挑第一个配好的端点；
全都没配才返回链首（保留原来的"未配置"提示语义）。自动路由的可用性判定也改成 `isProviderAvailable()`
（按整链判定），否则"没填七牛云 key"会把 DeepSeek / GLM 整体误判成不可用。

---

## 3. 免费池换血

- 移除 `meituan/LongCat-2.0:free`，新增 `poolside/laguna-s-2.1-free`（Protocom 目录里实测存在）。
- `LEGACY_REGISTRY_ALIASES` 加了 LongCat → Laguna 的映射：老设置里的 id 仍然可用（有测试锁定）。
- **现状提示**：实测两个免费模型在 Protocom 上大量返回 **503 Service temporarily unavailable**
  （laguna 三次里成功一次、ling 三次全失败）。免费池仍是 Auto 的候选，但规则层对"硬任务"一律不下沉到它；
  路由器提示词里也写明了"免费池近期常 503，只在答错也不可惜的问题上用"。

---

## 4. Auto 路由：规则优先 + 快速模型兜底

候选池只有四个（`lib/ai/autoRoute.ts`）：`laguna`、`ling`（免费）+ `deepseek/deepseek-v4.1-flash`（快速）+ `z-ai/glm-5.3-flash`（强）。

**两层决策**：

1. **规则层（零额外延迟）**：带图 / 开深度思考 / 文本 > 600 字 / 命中 `HARD_TASK_RE`
   （做题、出题、`N 道题`、讲解、梳理、检索、写作、代码…）→ 直接把快速/强模型排第一，免费池只当兜底。
2. **模型兜底层（~1.2s）**：以上都不命中（短而含糊的问题）时，调七牛云的 `doubao-seed-2.0-mini`：
   `temperature 0` + `max_tokens 24` + `response_format=json_object` + **强制关思考**，
   system 是 `lib/ai/prompts/model-router.md`（含价格 / 上下文 / 实测耗时 / 擅长领域 / 硬性限制），
   只发一行任务摘要（**不带聊天历史**）。输出收窄到四个别名 `laguna/ling/ds/glm`，再叠一层正则提取
   （`parseRouterChoice`：先认 `{"m":"..."}`，退化路径取文本里最先出现的别名）。
   失败 / 超时（6s）/ 解析不出 → 静默回落到规则结果。

**实测**：`「你好」→ router → ds（1186ms，raw `{"m":"ds"}`）`；`「帮我出 5 道题」→ rules → ds（strong-task，0 额外延迟）`。

---

## 5. 标签页命名

- 新增 `lib/ai/fastModel.ts`：直接打 OpenAI 兼容 `/chat/completions`（不用 SDK，避免被思考方言/中间件改写），
  统一 `thinking:{type:"disabled"}` + `temperature 0` + `AbortSignal.timeout(6s)`，任何失败返回 `null`。
- `/api/chat-title` 优先走它（`AI_TITLE_MODEL` 默认 `doubao-seed-2.0-mini`）；未配置时回落到原来的中转路径，
  计费是尽力而为（单价表里查不到也不能让标题失败）。
- 标题纪律：`SESSION_TITLE_SYSTEM_PROMPT` 要求 **10–20 字、不要任何标点符号**；
  `sanitizeGeneratedTitle()` 再删掉所有非中日韩/字母数字字符并按码点截到 20 字（短到没信息量则退回本地标题）。
- `useChat` 不再对 Auto 走 `localOnly`：命名已不依赖主力模型，Auto 也能拿到远端标题。
- **实测**：输入"帮我看看这道仪器分析题的推导过程…" → 1137ms → `仪器分析题中萃取后测吸光度的原因探讨`（18 字、无符号）。

---

## 6. 生图：新模型 + 进度可视化

### 6.1 模型与价格（实测契约）

| 模型 | 供应商 | 单价 | 实测耗时 | 契约 |
|---|---|---|---|---|
| `baidu/ERNIE-Image-Turbo` **（新默认）** | 硅基流动 | ¥0.50/张 | 10–40s（按用户经验） | siliconflow 风格 |
| `Tongyi-MAI/Z-Image-Turbo` | 硅基流动 | ¥0.10/张 | 亚秒级 | siliconflow 风格 |
| `nano-banana` | xhuoai | ¥1.00/张 | **49s**（实测，用户经验 100–400s） | OpenAI 风格，返回 `data[].url` |
| `gpt-image-2.5` | xhuoai | ¥1.00/张 | 100–400s | OpenAI 风格 |
| `gpt-image-2` | xhuoai | ¥1.00/张 | **26s**、返回 `b64_json`（实测） | OpenAI 风格 |

配套改动：`ModelInfo` 新增 `imageApiStyle`（`nano-banana` 这个名字不匹配 `/^(gpt-image|dall-e)/`，
按名字猜会发错协议）与 `imageTimeoutMs`（慢模型 420s；原来路由写死 180s，会把慢模型稳定判成超时），
路由补 `maxDuration = 600`。默认生图模型改为 ERNIE（store 默认值 + 路由兜底都改）。

### 6.2 进度条（用户要求的"可视化进度"）

上游不回传进度（一次 POST，出图前没有响应体），所以是**诚实估算**（`lib/chat/imageGenProgress.ts`，纯函数）：

- 时间常数取模型自己声明的 `imageParams.expectedMs`（xhuoai 120–150s / ERNIE 25s / Z-Image 6s）；
- 曲线 `99 × (1 − e^{−k·t/expected})`，`k` 由**会话 id** 派生的固定随机数决定（FNV-1a）——
  重渲染/切窗口都不会跳，不同会话略有差异；
- **自己永远不走到 100%**：贴到 99% 就停住；`elapsed ≥ expected` 时标记 `stalled`并把文案换成
  "慢速模型可能要几分钟，仍在生成"；
- 真完成时 `status → done` 直接 100% 出图（提前完成不被进度条拖着）；
- 组件 `ImageGenProgressBar` 同时用在生图窗（大条）与对话卡片（紧凑条），带 `role="progressbar"`
  与 `prefers-reduced-motion` 处理。

---

## 7. 验证与已知风险

**已验证**：`tsc` 0 error；单元测试 **1541 项全绿**；vitest **174 文件 / 709 项全绿**；
`/agent` 页面 200；端到端脚本（`tmp/verify-qiniu.mts`，不提交）用**真实 SDK 路径**确认：
供应商解析落到 qnaigc、DS/Qwen 关思考后 reasoning=0 字（开思考 161 字）、GLM 走 reasoning_effort、
Auto 的 router/rules 两条分支、标题生成 18 字无符号。

**未验证 / 风险**：

- 免费池当前 503（见 §3）：Auto 若命中免费模型会先浪费 1–2 跳延迟；路由器倾向于选 `ds`，实际影响有限。
- xhuoai 的 `gpt-image-2.5` 没有实机出图（只验证了 `nano-banana` 与 `gpt-image-2`），契约按同站同名系列推断。
- 生图进度是估算：极端情况下可能长时间停在 99%（这是设计要求，不是 bug）。
- Auto 的模型兜底会给"短而含糊"的提问增加约 1.2s 的分类延迟（设计取舍：换来更合适的模型选择）。
