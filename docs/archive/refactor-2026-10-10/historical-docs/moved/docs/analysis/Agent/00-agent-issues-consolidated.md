# Agent 板块问题总清单（六份审查报告的核验、去重与汇总）

> **生成**：2026-09-12 · **汇总方**：Claude Opus 5（主判定）+ 4 路只读核验子智能体
> **输入**：`docs/analysis/Agent/` 下 6 份独立审查报告（6 个模型 / 5 种 harness）
> **方法**：所有被采信的结论都回到源码复核过；证伪的结论单列在 §3，不进总清单
> **产物**：本文件（问题清单）+ `agent-model-comparison.html`（模型能力对比）
> **性质**：只读勘察。本文件不含任何代码修改，也不排工期。

---

## 0. 一句话结论

六份报告在**架构定性上完全一致且正确**：这是 Vercel AI SDK v7 `ToolLoopAgent` 的原生
function calling 多步循环，不是"提示词约定 + 输出尾部解析"的自制协议。

分歧不在架构，在**精度**。核验后：**2 份达到可直接施工的行级精度**（Cursor Grok、Grok CLI），
**2 份结论正确但覆盖窄**（Kimi K2.8、Kimi K3），**1 份方向对但对已损坏的机制给了好评**（Claude 4.6），
**1 份含框架性误读与可证伪断言**（Gemini）。

去重后得到 **13 项 P0 + 62 项 P1**，分布在 11 个系统。其中 P0 的绝大部分不是"架构错"，
而是**边界缺失**（无鉴权 / 无路径白名单 / 同源 sandbox）与**语义静默失败**
（第 6 步触顶无提示 / 自定义模型窗口恒 128k / GLM 降级后思考方言错配）。

---

## 1. 事实基线（本次核验直接读源码确认，作为后续一切判断的锚）

以下每条都已在当前工作区复核，冲突时以本节为准。

| # | 事实 | 证据 |
|---|---|---|
| F1 | `isStepCount(stepCount)` 的实现是 `({steps}) => steps.length === stepCount` | `node_modules/ai/dist/index.js` |
| F2 | 停止条件在**当前 step 完成、工具已执行、step 已入 `steps`之后**求值；不满足才 `streamStep(currentStep + 1)` | 同上（`isStopConditionMet` 调用点） |
| F3 | 因此 `MAX_TOOL_STEPS = 6` = **最多 6 次上游 LLM 调用**（含最终文本步），**不是**"6 轮工具 + 1 次收尾" | `_shared.ts:6` + `studyAgent.ts:147` |
| F4 | `ToolLoopAgent` 默认 `isStepCount(20)`；裸 `streamText` 默认 `isStepCount(1)` | SDK dist |
| F5 | `maxRetries: 0`（覆盖 SDK 默认 2），`temperature` 恒 0.6（路由不传） | `studyAgent.ts:150-151` |
| F6 | 提示词合并为**唯一一条** system；注释写明部分模型（硅基 Qwen3）对第二条 system 报错 | `studyAgent.ts:103-104` |
| F7 | 参考材料以 `'\n\n用户提问：' + userMessage` 结尾，再整体拼进那条 system | `fullContext.ts:59`、`semanticSearch.ts` |
| F8 | 生产 UI 两处都写死 `contextMode: 'full'`，设置面板无该开关 | `ChatPanel.tsx:30-34`、`FloatingChatBody.tsx:27` |
| F9 | 全仓库不存在 `needsApproval` / `toolApproval`；`generateImage` 立即返回文本，循环继续 | `generateImage/tool.ts:16-18` |
| F10 | 无 `middleware.ts`；`next.config.mjs` 无安全头 / CSP / CORS；所有 API 路由无鉴权无限流 | 全库检索 |

---

## 2. 六份报告的采信判定

评级依据：可核验断言的正确率、粒度（是否到 `file:line`）、独立发现的真缺陷数、是否给已损坏机制打了好评。

| 报告 | 模型 / Harness | 采信度 | 核心判定 |
|---|---|---|---|
| `agent-analysis-cursor-grok.md` | Cursor Grok 4.6 xhigh fast（主 + 14 子智能体） | **全量采信** | 抽检的断言几乎全中，含 SDK 源码级步数语义、安全面分级、持久化孤立键、四套 SSE 对照。**本清单的主干** |
| `agent-analysis-grok-cli.md` | Grok CLI / Grok 4.6（主 + 16 子智能体） | **全量采信** | 与上一份独立得出同样结论（交叉验证价值高）。另有独占发现：`AI_ENABLE_THINKING` 运行时未读、查询侧 `FailoverEmbedding` 未启用、Electron 强制选中被菜单隐藏的模型 |
| `agent-analysis-kimi-k2-8.md` | Kimi K2.8（4 路并行） | **采信，需补** | 结论正确、结构清晰。独占且正确的判断：**"工具无副作用化"** 设计原则、13 个 `tool.ts` 中 `throw` 为 0、`"upstream"` providerOptions 命名空间是隐性约定、`chat-title` 仍用旧 `CustomProvider`。缺整个安全面 |
| `agent-analysis-kimi-k3.md` | Kimi K3（单智能体） | **采信，需补** | 篇幅最小但信噪比高。独占且正确：把 **无 compaction** 列为 P0、`_contextCache` 并发语义错误、步数预算无 token 维度、引入 DeepSeek-Harness 作外部标尺 |
| `agent-analysis-cluade-4-6.md` | Claude Opus 4.6（Cursor 单智能体） | **部分采信** | 架构叙述与数据流表可用，模型矩阵准确。但对**已损坏的机制给了满分**（Prefix Cache ⭐⭐⭐⭐⭐、模型接入 ⭐⭐⭐⭐⭐），且几乎未触及安全 / 卫星路由 / 工具级缺陷 |
| `agent-analysis-gemini.md` | Gemini 3.7（单智能体） | **有限采信** | 分层图、模型接入操作指南、演进建议可用。但含一处**框架性误读**（把 Harness 解成 "H = Hybrid Search…"）与多条可证伪断言，见 §3 |

---

## 3. 判定为错误、**不予采信**的结论（必须显式剔除）

这一节的作用是防止后人把过时或错误的断言当依据改代码。

| # | 出处 | 错误断言 | 核验结果 |
|---|---|---|---|
| E1 | Gemini §4 | 把 "Harness" 重新框定为 **"H = Hybrid Search / Human-in-the-loop / History / Heartbeat"** | 提问指的是 **Agent Harness（运行底座）**。该章是自造框架，其中的 HITL 小节直接引出 E2 |
| E2 | Gemini §4.2 | "敏感工具被触发时，Agent 能够挂起等待用户点击批准后方可继续推进" | **证伪**。全仓无 `needsApproval`/`toolApproval`；`generateImage` 只回一句"等待批准"文本，主循环**立刻继续讲解**。`buildTrace` 里的 `approval-requested` 是 SDK 自带状态，项目未启用 |
| E3 | Gemini §3.1 / Claude §2.5 | "保证前半部分在多轮对话中永远不变，最大化触发缓存命中" / "Prefix Cache 优化 ⭐⭐⭐⭐⭐，逐字节一致" | **设计意图正确，现网实现被打破**。用户提问被拼在参考材料尾部、再进同一条 system（F7），每轮 system 都变，前缀 cache 从该点起全部 miss。给满分掩盖了 P0-10 |
| E4 | Gemini §1 | "工具的入参校验由 Zod 在客户端与服务端强校验" | 工具只存在于服务端，eslint 明令禁止 `components/**`、`lib/hooks/**` import `tool.ts`/`server.ts`。客户端不做工具入参校验 |
| E5 | Gemini §1 / Claude §1.3 | "后端可能与 LLM 进行了 2~4 次往返" / "最多 6 轮工具循环" | 语义不准。见 F1–F3：是**最多 6 次 LLM**，且第 6 次若仍是 tool-calls，工具会执行但**没有第 7 次模型消化结果** |
| E6 | Gemini §4.1 图 | 向量检索标注为"智谱 Embedding" | 默认是硅基流动 `BAAI/bge-m3`；智谱只是失败后的容灾 |
| E7 | Gemini §2 | 路径 `lib/chat/useChat.ts` | 实际是 `lib/hooks/useChat.ts` |
| E8 | Kimi K2.8 §3 表 | imageSearch "会话配额 20 张" | 实为**单次 HTTP 请求**配额（`createToolRuntime()` 每请求新建）。注意：工具自身的文案也写成"本次对话"，属同源错误，见 P1-21 |
| E9 | Kimi K3 §3.1 | 把 semantic 说成"语义检索模式**可选**" | 生产 UI 写死 `full`（F8），无任何开关。`SemanticSearchManager` 对产品界面是死路径 |
| E10 | Claude §4.4 | 模型接入"可扩展性 ⭐⭐⭐⭐⭐ / 容灾降级 ⭐⭐⭐⭐" | 未发现 GLM 降级后**思考方言错配**、自定义分组**无 failover**、自定义 `contextK` **全链路失效** 三处实缺陷，评分偏高 |
| E11 | cursor-grok §14.5 **vs** grok-cli §15 | 浮窗 token 泄漏：一份列为"仍在"，一份列为"已修" | **两份都只对一半**。`FloatingChatWindow.handleClose` 确实会 `resetSession`；但键盘 Esc（`windowActions.ts`）与历史面板删除（`ChatHistoryOverlay.tsx`）直接调 store 的 `closeWindow`，绕过该 reset。真实状态是**路径分裂**，见 P1-55 |

---

## 4. 问题总清单

**优先级口径**
- **P0** — 安全边界缺失、真实费用损失、静默产生错误结果。出网或共享部署前必须先解决。
- **P1** — 一致性、体验、可维护性、可观测性。不阻断，但会持续制造认知负担与偶发故障。

**来源标记**（去重后保留一条，标注哪些 Agent 独立发现了它）
`CG`=Cursor Grok · `GC`=Grok CLI · `K2`=Kimi K2.8 · `K3`=Kimi K3 · `CL`=Claude 4.6 · `GM`=Gemini
`★` = 本次汇总核验时新确认、六份报告均未准确记录

**系统分区**

| 代号 | 系统 |
|---|---|
| S1 | Agent 循环与 Harness 编排 |
| S2 | 上下文工程 |
| S3 | 工具系统（13 工具） |
| S4 | 检索 / RAG |
| S5 | 模型接入层 |
| S6 | 卫星生成路由 |
| S7 | 提示词与文本协议 |
| S8 | 安全与边界 |
| S9 | 客户端与持久化 |
| S10 | UI 与可观测性 |
| S11 | 测试与文档 |

---

### 4.1 P0（13 项）

> **部署前提**：S8 各项的严重度取决于进程暴露面。Electron 桌面把 Next 绑在 `127.0.0.1`
> （`electron/main.js:156-157`），风险显著降低；但 `next dev` / `next start` **未钉死 hostname**，
> 一旦暴露到局域网或公网，同一套路由即为开放的、带运营者密钥的 AI 代理。

#### S8 · 安全与边界

**P0-1 · 全部 AI 路由无鉴权、无限流** `[CG][GC]`
`app/api/{chat,chat-title,artifact,document,canvas-revise,follow-ups,image-gen,record}` 均无任何身份校验或速率限制；无 `middleware.ts`，`next.config.mjs` 无安全头 / CSP，未配置 CORS。内置模型消耗的是运营者 env 额度。`MAX_TOOL_STEPS = 6` 是模型循环上限，**不是调用方 QPS 上限**；`/api/artifact` 单请求可占用 12 分钟（`maxDuration = 720`）。

**P0-2 · 自定义 `baseUrl` 等于让服务端代打任意 URL（SSRF）** `[CG][GC]`
`resolveProvider` 对分组 `baseUrl` 只做 `.trim()`（`lib/ai/provider.ts:262`），无协议 / 主机 / 私网限制。`GET /api/can-embed?url=` 同样对任意 http(s) URL `fetch` 且 `redirect: "follow"`（`app/api/can-embed/route.ts:36-62`），不拦回环与私网。

**P0-3 · 内容路径未锁内容树、无 `..` 规范化** `[CG][GC]`
`getSection`（`tools/getSection/tool.ts:23-24`）与 `app/api/section/route.ts:24-26` 把调用方字符串交给 `readContentMarkdown` → `path.join(cwd, "content", …)` 后 `readFileSync`。`getSection` 虽调了 `findContentItem`，但 **`found === false` 仍然照读**。对照组：`readQuiz` 有 `^[a-zA-Z0-9_-]+$` 白名单（`lib/content/loader.ts:211-216`），例题有 `..` 检查——同一仓库内标准不统一。附带：`getSection` **不做学年隔离**。

**P0-4 · Artifact / 画布 iframe 与宿主同源，且 HTML 未消毒** `[CG]`
`ArtifactViewer.tsx:51-55` 与 `canvas/renderers/HtmlRenderer.tsx:44-47` 都用 `srcDoc` + `sandbox="allow-scripts allow-same-origin …"`。模型产出的 HTML 未经 DOMPurify，而 `lib/ai/artifact.ts:37` 的系统提示明确告知模型「可正常使用：CDN 引库、`fetch`、表单、弹窗、下载、**localStorage**」。与 P0-6 叠加时，同源脚本可读到 localStorage 里的明文 apiKey。

**P0-5 · 聊天 markdown 走 `rehype-raw` 且无 HTML 消毒** `[CG]`
`lib/markdown/plugins.ts:28-30` 启用 `rehypeRaw`，全仓无 `rehype-sanitize`；`mdComponents` 未禁用 `script`。注意 SVG 是**另一条**路径且**确实**过 DOMPurify（`sanitizeSvg.ts:33-38`）——不要因此误判 markdown 也安全。

**P0-6 · 自定义 apiKey 明文落 localStorage，且每次请求全量上传** `[CG][GC][K2]`
`lib/stores/settings.ts:107,254` 以明文 JSON 存 `gailvlun-settings-v1`（含 `customApiGroups[].apiKey`）。该字段随 **6 条路由**的每次 POST 全量发送：chat / artifact / document / image-gen / record / canvas-revise。长文档 1+N 次请求 = 密钥走 N+1 遍。

**P0-7 · 卫星路由回显上游原始错误体** `[CG]`
`canvas-revise` 返回 `${statusCode} ${responseBody.slice(0,300)}`（`route.ts:70-73`）、`record` 同形（`route.ts:237-239`）、`image-gen` 直接**透传上游 status**（`route.ts:92-99`）。而 `toChatErrorMessage`（会替换 secrets、打码 URL / `Bearer` / `sk-`、截断 240 字）**只有 `/api/chat` 在用**。

**P0-8 · 服务端不过滤 message role，且无任何体积上限** `[CG]`
`requestSchema.ts:26-28` 允许 `role: "system"`；`route.ts:49-56` 的 `toModelMessages` 只过滤 part 类型，**不过滤 role**。`globalContext` / `skills` / file parts 在 schema 上均无 `.max()`。官方 UI 的限制（`buildRequestMessages` 只留 user/assistant、`MAX_SKILLS = 20`）是**客户端约定，不是服务端边界**。

#### S1 · Agent 循环正确性

**P0-9 · 第 6 步触顶会静默产出"有卡片、没讲解"，且 UI 完全无从得知** `[CG][GC]`
由 F1–F3：第 6 次 LLM 若仍返回 tool-calls，工具**会执行**，但没有第 7 次模型去消化结果。后果分层：`renderInteractive`/`writeDocument`/`generateImage` 的卡片仍在但那句"请用一两句话说明…"永远不会被写；`drawDiagram` 只回灌了指南、**图不会出现**。雪上加霜的是路由用 `sendFinish: false` 后自己写 `{type:"finish"}`（`route.ts:176-226`），**丢掉了 SDK 的 `finishReason`**；客户端只看 `chunk.type === 'finish'`，`components/` 下对「步数上限」零匹配——**没有任何用户可见提示**。

#### S2 · 上下文正确性

**P0-10 · 用户提问被写进 system，每轮打爆 prefix cache，并造成双写双计** `[CG][GC]`
`fullContext.ts:59` 与 `semanticSearch.ts` 都以 `'\n\n用户提问：' + userMessage` 收尾，该串作为 `referenceContext` 进入唯一一条 system（`studyAgent.ts:95-104`）。于是：①同一句提问在 system 和 messages 里各存一份；②整条 system 每轮都变，稳定前缀的努力（排序技能、单条 system）从这一点之后全部作废；③`contextBreakdown` 把它同时计进 `pages`（volatile 整段）和 `conversation`（history 里的 user）。这正是 E3 里被两份报告打成满分的那个机制。

**P0-11 · `getMaxTokens` 看不见自定义 `contextK`，自定义模型窗口恒为 128k** `[CG]`
`lib/context/types.ts:28-31` 只调 `getModelInfo`（内置注册表）。`custom:…` 不在 `MODELS` → 回落 `MODEL_TOKEN_LIMITS.default = 128_000`。而 `getModelInfoWithCustom`（`models.ts:585-591`，读 `c.contextK ?? 128`）**上下文管理器不用**。后果：用户配一个 32k 的自定义模型，客户端按 32k 裁历史，服务端的 `ctxResult.overflow` 仍按 128k 判——硬溢出判定永远错。

**P0-12 · 无 compaction，且软上限会"粘滞"在 80% 出不来** `[K3][K2][CG][GC]`
达到 80% 后策略是硬截断：客户端只发最近 **16 条消息**（`SOFT_LIMIT_MAX_TURNS`，是条数不是轮次）且 `preserveAttachmentHistory: false`，服务端整块丢弃参考材料。早期上下文**永久丢失，无摘要替代**。更麻烦的是 `contextBreakdown.ts:67-70`：当 `clientContextTokens > total` 时把差额垫进 `conversation` 并抬高 `total`——一旦进入截断态，估算值被垫住，**16 条策略不会自动退出**。

#### S5 · 模型接入正确性

**P0-13 · GLM 降级到 MiMo 后，思考方言不跟着切换** `[CG][GC]`
`models.ts:174`：`endpoints: [ep(RELAY, "z-ai/glm-5.3-flash"), ep(MIMO, "mimo-v2.5")]`——今天唯一真正有第二跳的内置模型，而备用是**另一个模型**，不是同模型换网关。两处机制共同导致方言不切换：①`resolveBuiltinEndpoint` 按 **registryId** 取 `ModelInfo`（`provider.ts:208-231`），仍是 GLM 的 `openai-reasoning-effort`；②`languageModel.ts:177` 的 `thinkingSettings` 永远绑 **primary**。而 MiMo 需要的是 `enable_thinking` + `thinking_budget`。即：**降级发生时思考参数是错的**。

---

### 4.2 P1（62 项）

#### S1 · Agent 循环与 Harness 编排（6）

| # | 问题 | 来源 |
|---|---|---|
| P1-1 | `route.ts`（约 240 行）集请求解析 / 模型选择 / 上下文构建 / Agent 创建 / 流转发 / FollowUp / breakdown / usage / 错误处理于一身，无 Orchestrator 分层，测试与并行开发都困难 | `CL` `CG` |
| P1-2 | 无 Agent 生命周期 hook（`onStepFinish` / `onToolCall` / `onToolResult`），日志、计费、guardrail 只能在路由末尾事后统计 | `CL` `K2` `K3` |
| P1-3 | **无 per-tool 超时**（`ToolLoopAgent` 未传 `timeout`），单个工具 hang 住会吃掉整个请求的 6 步预算 | `K2` |
| P1-4 | `MAX_TOOL_STEPS = 6` 硬编码，不按模型能力 / 场景分级。`searchNotes → getSection → 推理 → renderInteractive` 的自然链路就要 3–4 步 | `CL` `K2` `K3` `CG` |
| P1-5 | 步数预算**只有步数、没有 token 维度**：一个 step 可以靠 `getSection` 注入整页教材 | `K3` |
| P1-6 | `prepareStep` 未把已调用过的 `getCurrentPage` 从 `activeTools` 摘掉；最后一步未收敛 `toolChoice`。另：`imageSearchFetchedCount` 在 execute **之后**才涨，同一步并行多次 `imageSearch` 可超过 20 | `CG` `GC` |

#### S2 · 上下文工程（10）

| # | 问题 | 来源 |
|---|---|---|
| P1-7 | `_contextCache` 是**模块级单槽**（`fullContext.ts:32-68`），跨请求 / 跨用户 / 跨会话共享，并发下 `cacheHit` 抖动误报；且它与上游 prefix cache 毫无关系，看板却叫"上下文缓存" | `K3` `CG` `GC` |
| P1-8 | 双端 80% **分子不是同一批 token**：客户端算会话对话估算，服务端只算参考材料（`route.ts:148-151`）。长对话 + 短页时服务端单独算永远到不了 80%，实际全靠客户端 flag | `CG` `GC` |
| P1-9 | `classifyTool` 错分桶（`contextBreakdown.ts:24-28`）：`getOutline`、`searchNoteImages` 落进 `conversation` 而非 `pages`；所有 tool **input**、step 正文、reasoning 一律进 `conversation` | `CG` `GC` |
| P1-10 | `estimateTokens` 的 CJK 判定是**开区间** `code > 0x4DFF && code < 0x9FFF`：漏掉 U+9FFF 本身，扩展 A 区（U+3400–U+4DBF）按"其他 = 1"计 | `CG` `GC` |
| P1-11 | Token 环阈值 `>0.7` 红 / `>0.4` 黄（`TokenDashboard.tsx:156-159`）与 80% 软上限不一致：70–80% 时环已是红的但仍发全量历史 | `CG` `GC` |
| P1-12 | 会话预算首次发送即锁定（`sessionContextBudgetTokens`），之后换到 1M 窗口模型分母仍是旧值 | `CG` `GC` |
| P1-13 | 当前页**三重注入**：system 参考材料已含全文 + `getCurrentPage` + `getSection` 各一份；`dedupeByContextKey` **不对 system 已注入内容建索引**，且不同工具前缀不同（`page:` / `section:`）不会互斥 | `CG` `GC` |
| P1-14 | 生产 UI 写死 `contextMode: 'full'`，`SemanticSearchManager` 是死路径（要么补设置开关，要么删掉并改文档） | `CG` `GC` |
| P1-15 | 截断态下仍然执行 `buildContext`（白算一次读盘 + 检索 I/O），只是不把结果写进 system | `CG` |
| P1-16 | 无跨会话长期记忆：错题、薄弱点画像等教育场景核心数据完全不在注入链路里 | `K2` |

#### S3 · 工具系统（14）

| # | 问题 | 来源 |
|---|---|---|
| P1-17 | `imageSearch` 配额是**单次请求**（`createToolRuntime()` 每请求新建），但工具描述与回灌文本都写成"**本次对话**上限 20 张"（`imageSearch/tool.ts:15-16,25-41`）——模型与用户都被误导 | `CG` `GC` |
| P1-18 | `imageSearch` 无 `UNSPLASH_ACCESS_KEY` 时返回 `[]`，模型看到的是"未找到「x」的相关图片"而**不是"未配置"**，可空转耗尽 6 步 | `CG` `GC` |
| P1-19 | `imageSearch` 按 **width×height 面积**排序而非相关度（`imageSearch.ts:92-95`），中文 query 一律追加英文关键词 → 库存图不相关 | `GC` |
| P1-20 | `.env.example:54` 声称"使用 Demo 模式（50 次/小时）"——**代码中不存在** | `CG` `GC` |
| P1-21 | `webSearch` 实现是**智谱** `open.bigmodel.cn/…/web_search`，但设置面板取用的 `webSearch/presentation.ts:6` 仍写"需配置 **Bocha** key" | `CG` `GC` |
| P1-22 | `searchNotes` 的 `contextKey` 是 `search:{query}`，**不含 academicYear / subjectId**：同一 query 换搜索范围会被误判为重复，模型只看到"已加载" | `CG` `GC` |
| P1-23 | `getSection` 无效路径 / 未生成正文也会占用同一个 `contextKey`，后续正确调用被挡 | `CG` |
| P1-24 | `searchNoteImages` 不自动跨学年放宽（`searchNotes` 有）、空结果仍占 contextKey、冷启动同步读大量 md | `CG` `GC` |
| P1-25 | `createQuiz`：`global.md:40` 写"1–6 题"，schema 是 `min(1).max(12)`（`quizTool.ts:49`）——双源冲突 | `CG` `GC` |
| P1-26 | `createQuiz` 答题态只在组件 state，刷新即清空；不进 `useQuiz` store，与复习板全局进度**完全断开** | `GC` |
| P1-27 | `writeDocument` 描述与 `global.md:41` 宣称"导出支持 Markdown / **Word / LaTeX / PDF**"，而 `DocumentViewer.tsx:48-58` 两个导出按钮都是 `// TODO` | `CG` `GC` |
| P1-28 | `writeDocument` 逐节文体漂移未修：`buildOutlinePrompt` 不约束各节 `brief` 文体，`previousTail` 1200 字会把上一节腔调带下去，节过短不重试；刷新后 `0/3` 半成品**不能 resume** | `CG` `GC` |
| P1-29 | `generateImage` 不是 SDK 原生审批：主循环立刻 `output-available` 并继续，**模型在用户点批准之前就已经开始讲解**；用户取消只是卡片本地状态，刷新后批准按钮回来 | `CG` `GC` |
| P1-30 | `drawDiagram` 只出**指南**不出图（纯模板，无 LLM 无 HTTP），且无 ResultCard；与 P0-9 咬合时最容易表现为"什么都没发生" | `CG` `GC` |

#### S4 · 检索 / RAG（5）

| # | 问题 | 来源 |
|---|---|---|
| P1-31 | `contentHash` 不匹配时只 warn、`ok` 仍为 true → **可能拿过期索引继续检索** | `CG` `GC` |
| P1-32 | health 门禁比 hybrid 本身更严：缺向量文件则整个 `searchNotes` 拒绝服务，即使 BM25 仍可用 | `GC` |
| P1-33 | `SemanticSearchManager` 相比 `searchNotes` 缺三件套：无 health 门禁、无学年空结果放宽、无短查询扩展；`cacheHit` 恒 false，失败静默 `catch {}` | `CG` `GC` |
| P1-34 | 查询侧 `FailoverEmbedding` **定义了但未启用**；embedding / rerank 硬绑硅基 + 智谱两家，无本地路径 | `GC` `K2` |
| P1-35 | `TARGET_CHUNK_TOKENS` 定义未使用；`searchScope.ts` 注释仍写"RRF 之后 ×1.12"，实际已改为 preferSubject 两阶段 | `CG` `GC` |

#### S5 · 模型接入层（9）

| # | 问题 | 来源 |
|---|---|---|
| P1-36 | 自定义分组**无 endpoints failover**（`hasNextEndpoint` 只查内置 `MODELS`）、`timeoutMs` 写死 45s、`endpoints` 是写死的 `{provider: siliconflow}` 假占位（`models.ts:551`） | `CG` `GC` |
| P1-37 | 自定义 `baseUrl` 不做 `/v1` 归一化（`normalizeOpenAIBaseUrl` 只作用于 `RELAY_BASE`），而 Electron 的连通性测试会自己补 `/v1` → 测试通过但运行时 404 | `CG` `GC` |
| P1-38 | 视觉闸门对自定义模型**整段跳过**（`route.ts:141-143` 的 `!provider.isCustom`），客户端 `useImageAttachments` 又用只看内置表的 `getModelInfo` → 自定义 `vision` 声明全链路不生效 | `CG` |
| P1-39 | `buildThinkingRequestParams` 是**死代码**（会把 `max` 压成 `high`，仅测试引用），与生产的 `buildThinkingSettings` 构成双轨，易误改 | `CG` `GC` |
| P1-40 | Anthropic 原生路径**不经过** `createReasoningNormalizingFetch`，也不套 `extractReasoningMiddleware`（`languageModel.ts:73-89`） | `CG` |
| P1-41 | 环境凭证在**模块加载时读一次**（`provider.ts:21-71`），改 env 必须重启进程；而 `chat-title` 却在请求时读——两套语义 | `CG` `K2` |
| P1-42 | `tools` / `vision` / `thinking` 纯人工声明，无能力探测、无"上游不支持工具"类 400 的降级识别，声明错了只会静默劣化 | `K3` `K2` `GM` |
| P1-43 | `AI_ENABLE_THINKING` 写在 `.env.example` 与 `electron/config.js`，**运行时对话代码从不读取** | `GC` |
| P1-44 | `MODELS` 硬编码在 TS 里，上新模型 / 调价必须发版；且 `createOpenAICompatible` 全部命名 `"upstream"`，providerOptions 共用一个命名空间，是**靠人记住**的隐性约定 | `K3` `K2` |

#### S6 · 卫星生成路由（6）

| # | 问题 | 来源 |
|---|---|---|
| P1-45 | **四套 SSE 协议并行**：chat（`text-delta`/`finish`）、artifact+document（`status:"delta"`/`"done"`）、record（`type:"content"`/`"done"`）、纯 JSON。`parseSseJsonEvents` 不能当通用消费器，新增生成能力只能再开一条路由 | `CG` |
| P1-46 | `/api/document` 对 `thinkingRequired` 模型**只延长超时、不传思考参数**（`route.ts:84-93`），而 `/api/artifact` 会传（`route.ts:35-37`）——同类路由行为不一致 | `CG` |
| P1-47 | `/api/document` 无 `maxDuration`（artifact 有 720） | `GC` |
| P1-48 | `POST /api/follow-ups` **前端零调用**，且与生产用的 `generateFallbackFollowUps` 完全不兼容：JSON 数组 vs `\|` 分隔、28 字 vs 15 字、temp 0.8 vs 0.5、无超时 vs 10s。而 `followUps.ts` 文件头声称"共用" | `CG` `GC` |
| P1-49 | `/api/chat-title` 硬编码中转 URL 兜底，且走**旧 `CustomProvider` 形状**，不读 `customApiGroups` | `K2` `CG` `GC` |
| P1-50 | `/api/image-gen` 绕开整套 SDK（无 failover、无 reasoning 归一化、无脱敏）；旁路失败也不回写主会话，而主 Agent 已经说了"已开始生成" | `CG` `GC` |

#### S7 · 提示词与文本协议（7）

| # | 问题 | 来源 |
|---|---|---|
| P1-51 | `global.md:30` 的学年科目表写死且**漏 4 科**（医学英语 / 仪器分析 / 医学统计学 / 细胞生物学实验）。讽刺的是 `getOutline` 的 description 反而是从 registry 动态拼的，比 global 准 | `CG` `GC` |
| P1-52 | `global.md` 的工具调用策略与各 `tool.ts` 的 description **逐条重复**（双源真相）；且 global 的工具清单里**没有 `useSkill`** | `CG` `GC` |
| P1-53 | `InteractiveVenn` **生产者/消费者字段对不上**：`global.md:139` 教模型写 `<InteractiveVenn>集合A\|集合B\|交集</InteractiveVenn>` 子节点，而 `ChatMessageVisualizations.tsx:81-88` 只读 props `a`/`b`/`ab`，children 被完全丢弃 → 按提示词写永远渲染默认值 | `CG` |
| P1-54 | FollowUp **四层协议**：模型正文 XML → 服务端 `data-followup` 兜底 → 客户端正则抽取 → 本地关键词模板。且服务端检测大小写不敏感、客户端抽取 `<FollowUp\b` 大小写敏感 → 模型写 `<followup>` 时服务端以为有、客户端抽不到，最终套通用三问 | `CG` `GC` `K3` |
| P1-55 | 出题双协议：`createQuiz` 是主路径，`<details>` 折叠答案是 fallback 但**没有专用解析器**，永远不会变成 Quiz 卡片 | `CG` |
| P1-56 | 画函数曲线有**四套同构语法**（`::plot` / `:::canvas` / `SvgDiagram mode="math"` / `InlineDistribution`），模型选哪套不可预测 | `CG` |
| P1-57 | 6 个学科无 prompt md（现代史 / 毛概 / 其他 / 医学英语 / 医学统计 / 细胞实验），只吃 global；而已有的学科 md 又教了 global 未列的指令（`:::compare` / `:::timeline` / `:::memory`）。另：`ManimPlayer` 已无生成工具，属死链 | `CG` `GC` |

#### S9 · 客户端与持久化（8）

| # | 问题 | 来源 |
|---|---|---|
| P1-58 | 会话超过 `MAX_SESSIONS = 50` 淘汰时调 `deleteSessionData(d.id, [])`（`chatHistory.ts:191-205`），**空 blobIds → `chat-blob:*` 永不删除**；且 `messagesById` 不清理被淘汰的 id，若该会话仍在内存、之后又 `updateMessage`，会把 `chat-session:*` **写回 IDB**，而 manifest 已无入口 → 孤立键 | `CG` `GC` |
| P1-59 | `listAllChatKeys`（`chatStorage.ts:291-297`）**定义了从未被调用**——没有任何按 manifest 回收孤立键的 GC | `CG` `GC` |
| P1-60 | `createSession` 用 `Date.now().toString()` 当 id（`chatHistory.ts:175`），同毫秒连开两个浮窗会撞 id | `CG` |
| P1-61 | 附件水合是**双重 `for` + 串行 `await`**；且内存里先把 inline base64 换成 blob 引用、再异步 `saveBlobFromDataUrl`（不等待）→ 水合若early于写入完成，**本轮刚贴的图可能发不出去**（测试 mock 了水合，测不到） | `CG` |
| P1-62 | 追问 / 划词 outbound / 浮窗 seed 三条入口**丢掉输入栏的 thinking / search 开关**（不传 sendOptions，zod 收成 false）；`ChatPanel.handleSend` 还丢了 `thinkingEffort` 的类型 | `CG` |
| P1-63 | 扁平→parts 懒迁移按**固定顺序**"思考 → 全部工具 → 正文"重建（`messageParts.ts:209-249`），**丢失真实时序**；`legacyToolOutput` 没有 `createQuiz` / `writeDocument` / `searchNoteImages` 的专用字段 | `CG` |
| P1-64 | 浮窗 token tracker reset **路径分裂**：`FloatingChatWindow.handleClose` 会 `resetSession`，但键盘 Esc（`windowActions.ts:22-23`）与历史面板（`ChatHistoryOverlay.tsx:36`）直接调 store 的 `closeWindow`，绕过 reset → 残留会话计数 | `★` |
| P1-65 | 前端打包债：`sendMessage.ts` 自承是 barrel、`useChatHistory.ts` 是 `export *`；`ChatPanel` 静态 import Settings/History/Lightbox；`ai` SDK 被打进客户端；`lucide-react` 整包引入 | `CG` |

#### S10 · UI 与可观测性（6）

| # | 问题 | 来源 |
|---|---|---|
| P1-66 | 步数触顶无任何用户提示（P0-9 的 UI 面）；同时 `imageSearch` 空结果、failover 换端点之外的异常也都没有 `data-info` | `CG` `GC` |
| P1-67 | `imageSearch` 流式期间图廊直接返回 `[]`（`ChatMessage.tsx:62-63`），看不见图；无 ResultCard；`key={i}` 在同 url 重排时会错位 | `CG` `GC` |
| P1-68 | `ChatMessage.tsx:128-135` 仍硬编码工具名字面量，**违反自身的 `toolCards/README.md:6` 与 `00-execution-contract.md:149`**（后者写着"已清零"）。改 `RESULT_CARD_ORDER` 而不同步这两行会插队错位 | `CG` |
| P1-69 | 来源条三份并存：webSearch「联网来源」+ `source-url`「参考来源」+ FollowUp「来源 · N」；检索类卡片**按调用次数出卡**不去重 | `CG` |
| P1-70 | 除 `data-usage` / `data-context-breakdown` 外**无运行时追踪**：无 trace id、无每步耗时 / token、无端点切换事件记录 | `CL` `K2` `CG` |
| P1-71 | 助手 `file` part 无 UI；旧消息缺 quiz / document / noteImages 专用 output 时会出现"有 Trace 步、无卡片" | `CG` |

#### S11 · 测试与文档（4）

| # | 问题 | 来源 |
|---|---|---|
| P1-72 | 13 个工具中 **12 个无 execute 单测**；`contextBreakdown` / `followUps` 解析 / `/api/document` 路由 / `imageSearch` 配额 / **步数触顶** 全部无测试 | `CG` `GC` |
| P1-73 | 文档漂移：`docs/analysis/9-9/04-ai-chat-system.md` §1 与 §3–§9 仍是 2026-07 快照（734 行 route、anthropicAdapter、9 工具、`MAX_TOOL_TURNS`）；`prompts/index.ts:1-3` 注释写"易变放在后一条消息"与现网不符；`13-agent-sdk-known-issues.md` 已修却像待办；CHANGELOG / `.env.example` 仍有 Bocha / Demo / `runImageSearch` | `CG` `GC` |
| P1-74 | 无评测 harness（固定题集回归 Agent 行为），模型 / prompt 迭代没有安全网 | `K2` `K3` `GM` |
| P1-75 | 无 MCP：工具注册外部化缺位，新增工具必须改代码发版 | `K2` |

> P1 编号至 P1-75，其中 S8 无 P1 项（安全类全部升入 P0），实际计 62 条。

---

## 5. 分布速览

| 系统 | P0 | P1 | 小计 |
|---|---:|---:|---:|
| S1 Agent 循环与 Harness 编排 | 1 | 6 | 7 |
| S2 上下文工程 | 3 | 10 | 13 |
| S3 工具系统 | 0 | 14 | 14 |
| S4 检索 / RAG | 0 | 5 | 5 |
| S5 模型接入层 | 1 | 9 | 10 |
| S6 卫星生成路由 | 0 | 6 | 6 |
| S7 提示词与文本协议 | 0 | 7 | 7 |
| S8 安全与边界 | 8 | 0 | 8 |
| S9 客户端与持久化 | 0 | 8 | 8 |
| S10 UI 与可观测性 | 0 | 6 | 6 |
| S11 测试与文档 | 0 | 4 | 4 |
| **合计** | **13** | **62** | **75** |

**读法**：S8 全是 P0 且没有 P1——安全面不存在"轻微问题"，只有"这个部署形态下是否暴露"。
S3 有 14 条 P1 却 0 条 P0，恰好印证 Kimi K2.8 那条独占判断：**13 个服务端工具全部只读 / 纯计算，
有副作用的操作一律延迟到前端用户动作后独立请求**，所以工具层缺陷密度高但危害面窄。

---

## 6. 结构性判断（不是单点缺陷，是会持续复发的模式）

单点问题修完还会长回来的地方，有五条主线：

**① 双源真相到处都是。** 工具说明在 `global.md` 和 `tool.ts` 各写一遍（P1-52）；学年科目表写死一份
（P1-51）；FollowUp 有四个生产者（P1-54）；出题、画函数各有两到四套语法（P1-55、P1-56）；
配额、导出能力、搜索供应商的**文案**与**实现**分别演进（P1-17、P1-21、P1-27）。
每次改实现都要人肉记得改另一处，这就是漂移的来源。

**② 跨轮记忆为 0 是刻意的，但代价没有被补偿。** 历史被剥到只剩 `text` / `file`，
工具结果、思考、卡片进度全部丢弃。省 token 是对的，但由此产生：模型每轮重新 `getCurrentPage`
（叠加 P1-13 的三重注入）、旁路生成的进度永远回不到模型视野（P1-50）、
第 6 步点着的火没人收尾（P0-9）。

**③ 一条 system 的约束和 prefix cache 的目标正在互相抵消。** 因为硅基 Qwen3 拒收第二条 system，
所有内容被迫拼进一条；而把提问也塞进去（P0-10）就让这条 system 每轮都变。
两个正确的局部决定，合成一个错误的整体结果。

**④ 主循环有纪律，卫星路由没有。** `/api/chat` 有脱敏、有 abort 传播、有"绝不二次计费"的注释纪律；
六条卫星路由则各写一套 SSE、各写一套错误处理、各自决定要不要传思考参数（P1-45~P1-50）。
新增一个生成能力的默认路径是"再开一条路由"，债务按路由数线性增长。

**⑤ 安全边界的缺失是系统性的，不是遗漏。** 无鉴权、无路径白名单、无 URL 白名单、无 HTML 消毒、
无体积上限、密钥明文旅行——这些不是六个独立 bug，是**从未设定过"不可信输入"边界**。
在 Electron 环回部署下它们都不致命，所以一直没人付这笔账；但"接入各种各样的模型"
（自定义 baseUrl + 用户 key）恰恰是把这条边界推到最前线的方向。

---

## 附录 A · 常量基线

| 常量 | 位置 | 值 |
|---|---|---|
| `MAX_TOOL_STEPS` | `tools/_shared.ts:6` | 6（**次 LLM 调用**，含最终文本步） |
| `IMAGE_SEARCH_MAX_TOTAL` | `tools/_shared.ts:5` | 20（**单次请求**，非会话） |
| `QUIZ_MAX_QUESTIONS` | `agent/quizTool.ts:12` | 12（global.md 写 1–6） |
| Agent `temperature` / `maxRetries` | `studyAgent.ts:150-151` | 0.6 / 0 |
| `SOFT_LIMIT_MAX_TURNS` | `buildRequestMessages.ts:5` | 16（**消息条数**） |
| 软上限比例 | 双端 | 0.8 |
| Token 环阈值 | `TokenDashboard.tsx:156-159` | >0.4 黄 / >0.7 红 |
| `MAX_SESSIONS` / `MAX_LOADED_SESSIONS` | `chatHistory.ts:21-22` | 50 / 3 |
| `MAX_SKILLS` | `stores/skills.ts:8` | 20（**仅客户端**） |
| 默认上下文窗口 | `context/types.ts` | 128_000（自定义模型恒取此值） |
| `DEFAULT_MODEL_ID` | `models.ts` | `z-ai/glm-5.3-flash` |
| 自定义模型超时 | `provider.ts:271-275` | 45s（写死） |
| SSE 心跳 / UI 节流 / IDB 防抖 | 各处 | 15s / 60ms / 800ms |
| Stall watchdog | `createStallWatchdog.ts` | 60s，5s 轮询 |
| FollowUp 兜底 | `followUps.ts` | 10s / temp 0.5 / 15 字 / `\|` 分隔 |
| Artifact / 生图 / 文档续写 | 各路由 | 12min（maxDuration 720） / 180s / 每节最多 2 次 |

## 附录 B · 源报告索引

| 文件 | 模型 | Harness | 定位 |
|---|---|---|---|
| `agent-analysis-cursor-grok.md` | Grok 4.6 xhigh fast | Cursor IDE，主 + 14 只读子智能体 | 主干；粒度最细，安全 / 持久化 / UI 专节 |
| `agent-analysis-grok-cli.md` | Grok 4.6 | Grok CLI，主 + 16 只读子智能体 | 交叉验证；独占若干 env / Electron 发现 |
| `agent-analysis-kimi-k2-8.md` | Kimi K2.8 | 4 路并行探索 | 架构判断力强（工具无副作用化） |
| `agent-analysis-kimi-k3.md` | Kimi K3 | 单智能体 | 最简洁；compaction 议题 + DSH 外部标尺 |
| `agent-analysis-cluade-4-6.md` | Claude Opus 4.6 | Cursor IDE 单智能体 | 架构叙述与数据流表可用 |
| `agent-analysis-gemini.md` | Gemini 3.7 | 单智能体 | 分层图与接入指南可用；§4 与 HITL 结论不可用 |
