# 项目支持的模型

> ⚠️ **部分内容已过时（2026-09-21）**：文本侧新增七牛云为第一跳、免费池 LongCat 换成
> `poolside/laguna-s-2.1-free`、Auto 改为四候选 + 豆包兜底、生图新增 ERNIE-Image-Turbo 与
> xhuoai 三个模型。本文中"首跳供应商 / 免费池 / 生图"的描述以
> `docs/analysis/Agent/02-provider-routing-and-image-2026-09.md` 为准。

> **口径**：2026-09-12 调研。**一律采用非优惠、非峰谷、非折扣的牌价**——首发优惠期的价格不用、闲时价不用、阶梯价取最贵那一档。宁可高估成本，不要低估。
> **币种**：注册表 `ModelInfo.pricing` 的单位是 **¥ / 百万 token**。美元牌价按 **1 USD = 7.00 CNY** 折算（与 `usdExchangeRate` 的默认值一致）。汇率变动时这一列要重算。
> **原始调研**：`tmp/model-research.md`（含每个模型的官方来源 URL）
> **配套**：`L0-model-catalog.md`（重构计划）

## 1. 两个顶级分类

| 分类 | 凭证 | 计费池 | 用户可见 |
|---|---|---|---|
| **内置模型** | 项目中转站的 key（`RELAY_*`） | `platform` | 只看到模型名，**不披露走哪个渠道** |
| **API 调用** | 用户自填 baseUrl + key | 主模型不进池；平台侧开销进 `byok` | 用户自己配的分组 |

## 2. 内置模型总表

价格单位 ¥ / 百万 token。`思考档位` 是我们 UI 的 `ThinkingEffort` 映射。

| 模型 id | 展示名 | 分组 | 上下文 | 输入 | 输出 | 缓存命中 | 视觉 | 思考方言 | 思考档位 |
|---|---|---|---:|---:|---:|---:|:---:|---|---|
| `deepseek/deepseek-v4.1-flash` | DeepSeek V4.1 Flash | 快速 | 1M | 2.10 | 8.40 | 0.042 | ✓ | `thinking.type` + `reasoning_effort` | low/medium/high |
| `Qwen/Qwen3.7-Flash` | Qwen3.7 Flash | 快速 | 1M | 1.20 | 4.80 | 0.24 | ✓ | `enable_thinking` + `thinking_budget` | low/medium/high/max |
| `gpt-5.6-luna` | GPT-5.6 Luna | 多模态 | 1M | 1.40 | 8.40 | 0.14 | ✓ | `reasoning_effort` | low/medium/high/max |
| `mimo-v2.5` | MiMo V2.5 | 多模态 | 1M | 1.00 | 2.00 | 0.02 | ✓ | **`thinking.type`（禁 `reasoning_effort`）** | 仅 on/off |
| `google/gemini-3.8-flash` | Gemini 3.8 Flash | 多模态 | 1M | 10.50 | 52.50 | 1.05 | ✓ | **`thinking_level`** | low/medium/high |
| `z-ai/glm-5.3-flash` | GLM-5.3 Flash | 多模态 | 1M | 0.80 | 2.80 | 0.23 | ✓ | `reasoning_effort` | low/high/max |
| `Qwen/Qwen3.8-Flash` | Qwen3.8 Flash | 多模态 | 1M | 0.80 | 2.70 | 0.10 | ✓ | `enable_thinking` + `thinking_budget` | low/medium/high/max |
| `meta/muse-spark-1.3-contributor` | Muse Spark 1.3 | 多模态 | 1M | 0.70 | 1.40 | 0.014 | ✓ | `reasoning_effort`（仅 xhigh/max） | high/max |
| `meituan/LongCat-2.0:free` | LongCat 2.0 | 免费 | 1.05M | 0 | 0 | 0 | ✗ | `reasoning_effort` | low/medium/high |
| `inclusionai/ling-3.0-flash-sante:free` | Ling 3.0 Flash Sante | 免费 | 256K | 0 | 0 | 0 | ✗ | `reasoning_effort` | low/medium/high |
| `gpt-5.6-sol` | GPT-5.6 Sol | 旗舰 | 1M | 28.00 | 140.00 | 2.80 | ✓ | `reasoning_effort` + `mode` | low/medium/high/max |
| `kimi-k3` | Kimi K3 | 旗舰 | 1M | 20.00 | 100.00 | 2.00 | ✓ | `reasoning_effort`（**禁 `thinking`**） | low/high/max |

**全局默认模型**：`deepseek/deepseek-v4.1-flash`

### 生图模型

| 模型 id | 展示名 | 渠道 | 价格 |
|---|---|---|---|
| `Tongyi-MAI/Z-Image-Turbo` | Z-Image Turbo | 硅基流动（默认，用户可改） | ¥0.10 / 张 |

### 非对话能力的默认渠道（用户可在设置页改，留空即默认）

| 能力 | 默认 | env |
|---|---|---|
| 向量 embedding | 硅基流动 `BAAI/bge-m3`，智谱 `embedding-3` 容灾 | `AI_*` + `ZHIPU_*` |
| 重排 rerank | 硅基流动 `BAAI/bge-reranker-v2-m3` | `AI_*` |
| 联网搜索 | 智谱 `web_search` | `ZHIPU_API_KEY` |
| 搜图 | Unsplash | `UNSPLASH_ACCESS_KEY` |

## 3. 价格口径逐条说明（为什么取这个数）

| 模型 | 调研查到的多档价格 | **我们采用** | 理由 |
|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` | 闲时 $0.15/$0.60 · **忙时 $0.30/$1.20** | 忙时 | 非峰谷 → 取忙时 |
| `Qwen/Qwen3.7-Flash` | ≤32K ¥0.20/¥0.80 · 32–256K ¥0.60/¥2.40 · **>256K ¥1.20/¥4.80** | >256K 档 | 阶梯价取最贵档 |
| `gpt-5.6-luna` | $0.20/$1.20（2026-07-30 降价后的现行牌价） | 现行牌价 | 只有一档；降价是永久调价不是优惠 |
| `mimo-v2.5` | ¥1.00/¥2.00（2026-05-27 永久下调） | 现行牌价 | 永久调价 |
| `google/gemini-3.8-flash` | 优惠期 $0.75/$3.75（至 2026-12-31）· **标准 $1.50/$7.50** | 标准期 | **非优惠 → 取标准价**。这是本表最贵的多模态模型 |
| `z-ai/glm-5.3-flash` | 首发半价已于 2026-09-09 到期，现行 ¥0.80/¥2.80 | 现行牌价 | 优惠已结束 |
| `Qwen/Qwen3.8-Flash` | ¥0.80/¥2.70 扁平 | 同上 | 长上下文不涨价 |
| `meta/muse-spark-1.3-contributor` | contributor $0.10/$0.20 · 标准版 $1.25/$4.25 | contributor | 我们调用的就是 contributor 这个 SKU。**但见 4.1 的隐私代价** |
| `meituan/LongCat-2.0:free` | free $0 · 标准档 $0.30/$1.20 | 0 | `:free` 就是免费档 |
| `inclusionai/ling-3.0-flash-sante:free` | free $0 · 到期转按量 | 0 | 同上。**但见 4.2 的到期风险** |
| `gpt-5.6-sol` | 标准 $4.00/$20.00 · **Fast Mode $8.00/$40.00** | 标准 | Fast 是可选模式不是默认；若以后开 Fast 要单独计价 |
| `kimi-k3` | ¥20.00/¥100.00 | 同上 | 只有一档 |

**缓存写入（`cacheWrite`）**：只有三个模型单独计价——`gpt-5.6-luna` ¥1.75、`gpt-5.6-sol` ¥35.00（均为 uncached 输入的 1.25 倍）。`mimo-v2.5` 官方写「限时免费」，按非优惠口径**不要按 0 记**，保守按未命中输入价（¥1.00）填。其余模型按未命中输入计，`cacheWrite` 留空。

## 4. 四条必须知道的风险

### 4.1 `meta/muse-spark-1.3-contributor` 用数据换价格

`contributor` 不是普通折扣，是 Meta 的**数据共享 SKU**：调用方授权 Meta 把发送的 prompt 与生成的 completion 用于后续模型训练。换来约 12–21 倍的降价（$0.10/$0.20 vs 标准版 $1.25/$4.25），代价是限流降到 100 RPM（标准版 3000 RPM）。

**这是一个产品决策，不是技术细节。** 我们的用户发的是学习内容、错题、笔记片段。上这个模型之前要想清楚：

- 要不要在模型选择处标注「该模型会将对话用于厂商模型训练」
- 还是换成标准版 `meta/muse-spark-1.3`（价格 ¥8.75/¥29.75，贵一个数量级）
- 还是干脆不上

默认建议：**上，但必须在 UI 上明示**。

### 4.2 `inclusionai/ling-3.0-flash-sante:free` 三周后到期

免费档上线 2026-09-04，**限时免费至 2026-10-04**。到期后 `:free` 路由会**停止服务**（不是自动转按量，标准 id 才转）。

也就是说这个模型在写下这份文档时距离失效只有约 3 周。落地时要么：

- 接受它会过期，并准备好到期后的下架流程（`LEGACY_REGISTRY_ALIASES` 加一条指向）
- 或者上线时就用标准 id + 真实价格

### 4.3 两个模型要求回传 `reasoning_content`，而我们的历史里没有它

**这一条与 L3 的 #81 直接冲突，必须在 L0 决策。**

| 模型 | 约束 |
|---|---|
| `mimo-v2.5` | 开启思考的多轮会话中，**若历史包含工具调用，后续请求必须完整回传上一轮的 `reasoning_content`，否则直接 400** |
| `kimi-k3` | **必须原样回传历史 assistant 消息里的 `reasoning_content`**（Preserved Thinking，思考强制常开、无法关闭） |

而本项目的既有设计是**跨轮历史只保留 `text` / `file`**，thinking 与工具结果一律丢弃（审计报告第 6 节结构性判断 ②）。L3 的 #81 还要进一步用 `pruneMessages({ reasoning: 'all' })` 把 reasoning 全部剪掉。

**后果**：按现状，`mimo-v2.5` 与 `kimi-k3` 在「多轮 + 工具」场景下会直接报 400。这不是性能问题，是**功能不可用**。

处理方向（L0 要选一个）：

1. **按模型保留 reasoning**：给 `ModelInfo` 加一个 `preservesReasoning?: boolean`，为真时历史里保留 `reasoning_content`，`pruneMessages` 也跳过它。代价是这两个模型的上下文占用更高。
2. **这两个模型禁用工具**：能用但退化成纯对话，与「学习助教要调工具」的产品定位矛盾，不推荐。
3. **不上这两个模型**：`mimo-v2.5` 是现网已有的，下架成本低；`kimi-k3` 是用户点名要的旗舰。
4. **靠中转站归一化**：如果 relay 自己会补 `reasoning_content`，问题就不存在。**这一条必须先实测确认**，它决定了要不要做方案 1。

**L0 的 A 阶段第一件事应该是拿这两个模型做一次「多轮 + 工具」的真实调用**，确认中转站行为，再决定。

### 4.4 现有注册表里有两处方言已经写错

| 模型 | 现在声明 | 调研结论 |
|---|---|---|
| `mimo-v2.5` | `thinkingRequestStyle: "siliconflow"` → 下发 `enable_thinking` + `thinking_budget` | 官方小米 API 要 `thinking: {type}`，**不支持 `reasoning_effort`**。`enable_thinking` 是**阿里云代理版**的形态。我们经 relay 调用，relay 是哪种形态要实测 |
| `google/gemini-3.7-flash`（将换成 3.8） | `thinkingRequestStyle: "openai-reasoning-effort"` → 下发 `reasoningEffort` | Gemini 要 `thinking_level`（low/medium/high），**3.8 已废弃 `minimal`**。当前 hint 文案里写的是 `thinking_level`，说明写文案的人知道，但代码发的是另一个参数 |

`ThinkingRequestStyle` 现在只有三个值（`openai-reasoning-effort` / `siliconflow` / `anthropic-thinking`），装不下这次的新方言。L0 至少要加：

- `gemini-thinking-level` → `thinking_level: low|medium|high`
- `deepseek-thinking` → `thinking: {type: enabled}` + `reasoning_effort`
- `mimo-thinking` → `thinking: {type: enabled|disabled}`，且**不许带 `reasoning_effort`**

## 5. 按模型的 `ModelInfo` 声明建议

下面是给 L0 的 A 阶段直接抄的骨架。`pricing` 已按第 3 节口径折成人民币。

| 模型 | `thinkingRequired` | `thinkingLevels` | `defaultThinkingEffort` | `vision` | `contextK` | 备注 |
|---|:---:|---|---|:---:|---:|---|
| `deepseek/deepseek-v4.1-flash` | 否（可关） | low/medium/high | medium | ✓ | 1000 | 全局默认 |
| `Qwen/Qwen3.7-Flash` | 否 | low/medium/high/max | medium | ✓ | 1000 | 混合思考，可 `/no_think` |
| `gpt-5.6-luna` | 否 | low/medium/high/max | medium | ✓ | 1000 | 支持 `none` 档，可映射到「关」 |
| `mimo-v2.5` | 否 | **不给档位**（仅 on/off） | — | ✓ | 1000 | 无 effort 概念；见 4.3 |
| `google/gemini-3.8-flash` | **是** | low/medium/high | medium | ✓ | 1000 | 思考不可关 |
| `z-ai/glm-5.3-flash` | **是** | low/high/max | max | ✓ | 1000 | 官方默认 max |
| `Qwen/Qwen3.8-Flash` | 否 | low/medium/high/max | medium | ✓ | 1000 | 长上下文不涨价 |
| `meta/muse-spark-1.3-contributor` | 否 | high/max（上游只认 xhigh/max） | high | ✓ | 1000 | `thinkingEffortMap: {high:"xhigh", max:"max"}`；见 4.1 |
| `meituan/LongCat-2.0:free` | 否 | low/medium/high | medium | ✗ | 1000 | 纯文本；20 RPM |
| `inclusionai/ling-3.0-flash-sante:free` | 否 | low/medium/high | medium | ✗ | 256 | 纯文本医疗向；见 4.2 |
| `gpt-5.6-sol` | 否 | low/medium/high/max | medium | ✓ | 1000 | `mode: pro` 暂不暴露给用户 |
| `kimi-k3` | **是**（强制常开） | low/high/max | max | ✓ | 1000 | 禁传 `thinking`；见 4.3 |

**注意 `vision` 按真实能力声明，不要按分组推断。** 用户给的分组里 `Qwen/Qwen3.7-Flash` 在「快速模型」而不在「其他多模态」，但它**实际支持图文与视频**。分组是速度定位，不是能力声明——`vision: true` 照实填。真正不支持视觉的只有两个免费模型。

## 6. 限流

| 模型 | 限流 |
|---|---|
| `meta/muse-spark-1.3-contributor` | 100 RPM（标准版 3000 RPM） |
| `meituan/LongCat-2.0:free` | 20 RPM；账号未充值满 $10 时每天 50 次，满 $10 后每天 1000 次 |
| `inclusionai/ling-3.0-flash-sante:free` | OpenRouter 20 RPM / Novita 30 RPM；同样有每日次数限制 |
| `deepseek/deepseek-v4.1-flash` | 官方并发上限 2500 |
| 其余 | 未查到明确限流 |

免费模型的每日次数限制意味着**它们不适合当默认模型或兜底模型**。`/api/follow-ups` 与 `chat-title` 这类高频小请求不要指到免费模型上。

## 7. 存疑与未查到

以下字段调研未能锁定，**落地时宁可留空也不要填猜的数字**（`pricing` 缺省时计价按 0，比记错价格安全）：

- `gpt-5.6-luna` / `gpt-5.6-sol` 的硬性最大输出 token 数在官方文档里没有单一固定常数，建议客户端显式传 `max_output_tokens` 做预算保护
- `meituan/LongCat-2.0` 是否支持视觉：公开资料与开源仓库都只强调代码与 Agent 文本能力，**暂按纯文本处理**
- `mimo-v2.5` 的 `cacheWrite` 官方写「限时免费」，没给到期时间；本表按未命中输入价保守填
- 各模型经**我们的中转站**之后，方言是否被归一化（4.3 与 4.4 的核心未知项）——**只能实测**

---

## 8. 模型菜单：思考深度与 Fast 模式注册表

模型菜单（`components/chat/ModelMenu.tsx`）的一级（分类）、二级（模型）结构不变；第三列详情里新增「思考」板块（`ThinkingDepthPanel.tsx`），触发器胶囊上同步显示当前深度。

**思考深度档位**不单独登记，完全由 `ModelInfo` 推出（`lib/ai/thinkingStops.ts`）：

| 模型能力 | 滑杆档位 |
| --- | --- |
| `thinking: false` | 不出滑杆 |
| 可关闭 + `thinkingLevels` | `关闭` + 该模型自己的档位（有的 `low~max`，有的只有 `high / max`） |
| 可关闭、无档位 | `关闭 / 开启` |
| `thinkingRequired` | 没有 `关闭`；无档位时只有一个 `开启`（滑杆不可动） |

新增或修改模型的 `thinkingLevels / thinkingRequired` 后，菜单自动跟随，**不需要改 UI**。

**Fast 模式**（板块左上角闪电）：不是计费或路由开关，而是在「标准模型 ↔ Fast 变体」两个模型 id 之间切换。只有登记在 `lib/ai/fastModeRegistry.ts` 的 `FAST_MODE_PAIRS` 里的模型闪电才可点击，其余置灰。

| 标准模型 | Fast 变体 | 备注 |
| --- | --- | --- |
| `mimo-v2.6-pro` | `xiaomi/mimo-v2.6-pro-ultraspeed` | 目前唯一一对；UltraSpeed 价格约为标准版 10 倍 |

维护规则：

1. 新增一对：在 `FAST_MODE_PAIRS` 加一行，两个 id 都必须已在 `lib/ai/models.ts` 的 `MODELS` 中，并同步更新上表；
2. 删除 / 改名其中任一模型时同步改这里和 `LEGACY_REGISTRY_ALIASES`；
3. `lib/ai/fastModeRegistry.test.tsx` 会校验每个登记 id 真实存在、且一个 id 不会出现在两个配对里。

---

<sub>本文件是模型清单的唯一真相源。加删模型必须同步更新此表与 `lib/ai/models.ts`，并在 `LEGACY_REGISTRY_ALIASES` 补别名（见 `L0-model-catalog.md` 第 6.1 节）。</sub>
