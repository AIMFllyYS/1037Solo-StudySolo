# 多供应商联网搜索（Kimi / 智谱 / Perplexity）+ 搜索子智能体

> **日期**：2026-09-21 · **性质**：三家 API 契约都是**实机探测**结论（不是照文档抄的），未验证项单列 §6
> **相关**：`docs/analysis/Agent/02-provider-routing-and-image-2026-09.md`（同一轮的供应商扩容）

---

## 1. 一句话总结

联网搜索从"只有智谱"升级成**三家可选 + 模型自己决定搜多广**：默认 Kimi > 智谱 > Perplexity，
权威性 Perplexity > Kimi > 智谱，成本（便宜到贵）智谱 > Kimi > Perplexity；
三个 API 由一层归一化 + 一个**搜索子智能体**（并行扇出 → 跨源去重 → 综述）统一起来，
用户还能在设置里分别填三家的 key。

---

## 2. 三家 API 的真实契约（实测，差异很大）

| 供应商 | 端点 | 返回 | 实测耗时 |
|---|---|---|---|
| 智谱 | `POST open.bigmodel.cn/api/paas/v4/web_search` | `{ search_result: [{ title, link, content, media, icon }] }` 结构化列表 | 1–3s |
| Perplexity | `POST api.perplexity.ai/search` | `{ id, results: [{ title, url, snippet, last_updated }] }` 结构化列表 | 2–5s |
| Perplexity（退路） | `POST api.perplexity.ai/chat/completions`，`model: sonar` | 成文答案 + `citations[]` + `search_results[]`（实测 47 条） | 5–10s |
| Kimi | `POST api.moonshot.cn/v1/chat/completions` + 内置工具 | **代理式**：模型回 tool_call，平台侧已搜完，我们回灌后模型产出带引用的结论；不返回结果列表 | 20–26s |

### 2.1 Kimi 的两个坑（都踩过并解决）

1. **声明方式**：`tools: [{ type: "builtin_function", function: { name: "$web_search" } }]`。
   `$web_search` 的 `$` 在 PowerShell 单引号里会被原样保留、双引号里会被当变量——
   本仓库用 Node 探测才避开这个坑（见 §6 的探测脚本）。
2. **回灌时 `type` 必须改成 `function`**：把模型的 tool_call 原样（`type: "builtin_function"`）回灌会得到
   `400 {"error":{"message":"Invalid request: tokenization failed"}}`；改成 `"function"` 才 200。
   同时**必须**补一条 `role: "tool"` 消息回应同一个 `tool_call_id`（缺了会 400 要求补全）。
   回灌内容就是原样的 `arguments`（形如 `{"search_result":{"search_id":...},"usage":{"total_tokens":9200}}`）。

实测 Kimi 搜索确实有效：问「2025 年诺贝尔物理学奖获奖者」时给出的答案与 Perplexity 一致
（Clarke / Devoret / Martinis），并附来源链接。问尚未公布的事实（2026 年诺奖）时它会**诚实说搜不到**，
这对我们是好事（三个源交叉后更容易识别"查无此事"）。

---

## 3. 调度策略

`lib/ai/search/policy.ts` 是三条排序的单一真相源：

| 口径 | 顺序 |
|---|---|
| 默认优先级 | Kimi > 智谱 > Perplexity |
| 权威性 | Perplexity > Kimi > 智谱 |
| 成本（便宜→贵） | 智谱 > Kimi > Perplexity |

**广度（mode）→ 供应商**：`daily` = Kimi + 智谱；`academic` = Perplexity + Kimi；
`comprehensive` = 三家全上；`auto` = 按问题性质判（学术信号 → academic，否则 daily）。
模型也可以 `providers=[...]` 显式点名。**没配 key 的源会被自动裁掉**，不会发出必然失败的请求。

---

## 4. 搜索子智能体（架构落点）

`lib/ai/search/subagent.ts`：主 Agent 只调一次 `webSearch`，内部完成

1. **选源**（policy，确定性规则，零延迟）；
2. **并行扇出**（`Promise.allSettled`）——串行要 30–60s，并行只等最慢的 Kimi（20–26s）；
3. **跨源去重**（按 URL 归一化，保留 snippet 更长的一条；多家出现时按权威性排序）；
4. **综述**：≥2 家出结果时，用七牛云 `doubao-seed-2.0-mini`（关思考、`temperature 0.2`、max_tokens 700）
   做一次**只许使用给定材料**的跨源综述，输出 3–6 条要点 + `[编号]` 引用 + 分歧说明；
5. 返回一段紧凑正文（来源清单 + 综述 + 各家结论 + 失败/未启用说明）。

为什么值得单开一层（对齐 AI SDK 的 subagent 用法）：**并行**、**上下文卸载**（三家原始结果几千字，
主 Agent 只要要点与来源）、**隔离**（Kimi 的代理式差异只在这一层处理）。
它不是完整的 ToolLoopAgent——这里不需要多轮工具探索，一次取数 + 一次综述用便宜模型直生成更省。

---

## 5. 触发与配置

- **需要搜索就自动联网**（`lib/ai/search/autoEnable.ts`）：确定性的规则判定"这问题是不是依赖外部实时信息"
  （今天/最新/汇率/天气/政策/查一下/2026 年…），命中就**客户端先开**（这样用户自备的搜索 key 能随请求上行）、
  **服务端再兜底**一次，并通过 `data-info` 明确告诉用户"已自动打开联网搜索"（搜索要花钱，必须透明）。
  纯讲解类会被排除（含"最新"但其实是"讲讲最新的研究"这种），超长请求也不自动开。
- **提示词**：`global.md` 里补齐了「联网搜索怎么用」一节——什么该搜、怎么选 mode、三家定位、引用纪律
  （正文用 [编号]、与教材区分、多源冲突要明说分歧）、没有该工具时怎么答。
- **用户自定义**：设置 → 能力端点 → 联网搜索（三家），分别对应
  `kimiSearchApiKey` / `webSearchApiKey` / `perplexitySearchApiKey`；
  不填则用站点 env `KIMI_API_KEY` / `ZHIPU_API_KEY` / `PERPLEXITY_API_KEY`。
  自备 key 的调用不计入平台池（沿用既有 `resolveSidecarBilling` 口径）。

---

## 6. 验证与未验证

**已验证**：三家真实 API 连通与形状（Node 探测脚本）、Kimi 两轮流程、Perplexity `/search` 与 sonar 退路、
智谱结构化结果；`tsc` 0 error；单元测试 **1563 项全绿**（新增 22 项：策略 16 + 子智能体 6）；
子智能体测试断言了**并发数=3**、跨源去重、Kimi 回灌 `type:"function"`、缓存命中不再打上游。

**未验证 / 风险**：

- `comprehensive` 端到端**实测 76s**（三家并行 + 综述；受 Kimi 两轮搜索拖累）：只在问题确实需要交叉验证时才该让模型选它。工具描述与提示词里写的是"约 40–80s"。
- Kimi 的搜索开销在它的 `usage.total_tokens`（实测约 9000–9300）里单独计，我们目前只记一条 `web-search` 账
  （搜索类账单按现有口径成本为 0，与改造前一致）；要精确计费需要在 `usageLedger` 里给搜索加价目表。
- 免费/慢速源的波动（如 Kimi 平台侧偶发限流）会体现为"部分来源未取到"，正文里会写明。
