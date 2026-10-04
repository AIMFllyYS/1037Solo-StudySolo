# 00 · Loop 全景与执行契约

> **本轮调度已被最新用户要求覆盖。** 这里的旧Issue/loop队列不能用于2026-10无人值守任务续接。当前入口：[大板块交接](../../handoff/README.md)。保留历史工程基线，阅读时核对代码；不要重新执行旧已关闭事项。

> **重排时间**：2026-09-12 16:45 NZST，在连续跑了 11.6 小时、关掉 #48–#66 共 19 个 Issue 之后
> **仓库**：[AIMFllyYS/Notebook-MedFreshman](https://github.com/AIMFllyYS/Notebook-MedFreshman) · 集成分支 `refactor/agent-platform-hardening`
> **问题基线**：`docs/analysis/Agent/00-agent-issues-consolidated.md`（13 P0 + 62 P1，核验过的事实）
> **被本文取代的**：`docs/analysis/Agent/01-goal-mode-runbook.md` 第 1–3 节的「一个 Issue = 一个 loop」调度规则。该文档的第 0 节（已就绪的 Supabase / 标签 / RLS）与第 4 节（三个坑）仍然有效。

---

## 1. 为什么要重排

原编排把 54 个子 Issue 当成 54 个 loop，每个都走完整的「A 修复 → B 验收 → 提交 → 关单」。实跑 11.6 小时后的账：

| 观测 | 数字 | 说明 |
|---|---|---|
| 已关 Issue | 19 / 54 | #48–#66，全部在集成分支上，`pnpm test` 恒绿 |
| 已关号平均耗时 | ~36 min | 从派出 A 到关单 |
| 其中固定税 | ~25–30 min | A 冷读简报与定位 8–15 min + B 重跑全量 `pnpm test`/`pnpm lint` 8–15 min + 提交评论关单 ~5 min |
| 与实现量的关系 | 几乎无关 | #56（改一段提示词，实现 11 min）与 #64（服务端记账，实现 40 min）付的是同一笔税 |
| 单个 A 的实测上限 | ~94 min | #66 一个 A 改 17 文件 / 673 行成功交回，这是可用的「一次能吃多少」参考 |
| 单个 A 的失败形态 | 47 min 零产出 | #67 首个 A 空转后被换掉，工作树无任何改动。任务描述不够具体时 A 会迷路 |

**结论**：瓶颈不是 Agent 板块有多大，是把一个系统切成 N 个号之后付了 N 遍税。

两个次生代价也已经真实发生：

- **拆开做会引入回归。** #63 把闸门放进 `proxy.ts`，`matcher: [...PAID_AI_API_PATHS]` 不是编译期字面量 → `next dev` 全站 500。因为端测滞后于关单，这个回归是在 #63 关掉之后才被发现的（热修 `714886e6`）。
- **依赖链把工期钉死。** #77 → #78 → … → #86 共 10 环，全在 `CD-context` / `CD-route`，按一号一循环要串 10 次，单这一条链就是 6–8 小时，其中 4–5 小时是税。

## 2. 真正的错位在哪一层

原编排有三层：**21 个 Epic（#27–#47）→ 54 个子 Issue（#48–#101）→ 执行**。

Epic 层的划分其实是对的——它就是按系统分的。错在**执行落到了子 Issue 层**。

剩余 12 个 Epic 合并成 7 个 loop 之后的映射：

| Loop | 来源 Epic | 覆盖 Issue |
|---|---|---|
| **L0 模型目录与渠道统一** | E15 #41（部分） + E21 #47 + **2026-09-12 新范围** | #92 #75 #76 + 新增 |
| L1 计费与额度 | E4 #30（余） + E5 #31 | #67 #68 #69 #70 |
| L2 服务端边界 | E9 #35 | #95 #96 |
| L3 上下文与缓存 | E11 #37 + E12 #38 + E13 #39 + E14 #40 | #77–#86 |
| L4 模型接入与密钥 | E15 #41（余） + E6 #32 | #93 #94 #71 #72 |
| L5 消息呈现 | E16 #42 + E17 #43 + E18 #44 | #87 #88 #89 #90 #91 |
| L6 云端同步 | E20 #46 | #73 #74 |
| L7 文案与债务 | E19 #45 | #97 #98 #99 #100 #101 |

合计 35 个 Issue，与「54 已关 19」对得上。

### 2026-09-12 追加：L0 与新范围

原本是 7 个 loop。当天用户提出「模型选择」板块要重构：按渠道分组（硅基流动 / 小米 / 智谱 / 自家中转）改成 **内置模型 / API 调用** 两类，换一批新模型，并让生图 / 向量 / 重排 / 联网搜索的凭证可在设置页自配、顺带修掉坏掉的生图。

这不是往某个 loop 里塞几个号，它会**重写 L1 和 L4 的前提**，所以独立成 **L0 并排在最前**：

- **#75 #76 从 L1 移到 L0** —— 「用户自配搜索凭证」的病根是 `credentialsFor` 的 `default` 分支把生图 / 向量 / 重排 / 搜索全部塌进一个 `AI_*` 兜底。「让用户能配」和「把兜底拆开」是同一次改动。
- **#92 从 L4 移到 L0** —— 它的修法是「思考方言跟随落地端点」，而「有哪些端点、各自什么方言」正是 L0 要重写的声明。在重写注册表时顺手做对最便宜。
- **L0 让 L1 的 #68 从「猜」变成「结构性正确」** —— 「内置模型 / API 调用」这个二分法本身就是 BYOK 判据，不必再去猜 `isCustom`（第 6 节第 2 项）。

详见 `L0-model-catalog.md`；模型清单与真实参数见 `MODELS.md`。

已完成的部分对应 9 个 Epic，回头看恰好是三个 loop 的形状：

| 已完成 | Epic | Issue | 集成分支 commit |
|---|---|---|---|
| 底座与可观测 | E1 #27 · E2 #28 | #48 #49 #50 #51 #52 #53 #54 | `84b4d0cf` `e502b47b` `a4712209` `0ecc1c95` `89c3d550` `c4551f2` `86d54ae9` |
| 安全边界 | E7 #33 · E8 #34 · E10 #36 | #55 #56 #57 #58 #59 #60 | `f3573282` `425a0540` `ea3fa570` `978319de` `f89383ad` `b2da0a35` |
| 鉴权 | E3 #29 | #61 #62 #63 | `620fabae` `6c3b8494` `e1c187c8`（+ 热修 `714886e6`） |
| 计费写侧 | E4 #30（部分） | #64 #65 #66 | `0dcae8f3` `b0034d29` `c11f7d1d` |

另有两个 workflow 落在 `master`：#49 的 keepalive（`f9a78f3`）、#50 的备份告警（`f586245`）。

## 3. Loop 契约

**一个 loop = 一个系统 = 一份规划文档 = 1–3 次 A 派遣 + 每次一个 B + loop 末尾一次真浏览器端测。**

### 3.1 主 Agent 的职责不变

只编排，不写业务代码。不读完整 diff。选号、派子智能体、判定交回、提交、关单、写日志、推进队列。

### 3.2 一个 loop 的流程

1. **读规划文档**（本目录下对应的 `L*.md`），拿到阶段划分、落点清单、不变量、陷阱。
2. **按阶段派 A**。每个阶段的提示词必须包含：
   - 本阶段覆盖的 Issue 号与**完整验收标准**（从 Issue 正文抄，不要转述）
   - 规划文档里那一节的**落点清单**（`文件:行` 级别）
   - 该 loop 的**不变量**（哪些既有行为不许破）
   - 本轮已落地的**前置设施**（例如 `settleUsage` 的 ALS、`aiGate` 的闸门），避免 A 重写已有基础
3. **一个阶段一个 B**。B 全新上下文，只拿合并后的验收标准 + A 的交回摘要，自己重跑 `pnpm test` 与 `pnpm lint`。
4. **B 通过就提交**。commit 按 Issue 拆或一个 commit 带多个 `Closes #N`，见 3.4。
5. **loop 末尾派端测者**，真开 `http://localhost:35349` 走该 loop 的端测脚本（每份 L 文档第 7 节）。
6. **端测通过才算 loop 完成**，写进 `tmp/goal-run-log.md`。

### 3.3 A 失败与放弃

- 每个阶段最多 A → B → C。C 之后仍不通过走放弃协议（诊断评论 + `blocked` 标签 + 半成品推 `wip/<issue>-<slug>`），**不要退回 B 反复循环**。
- **A 停滞判据**（#67 的教训）：派出 35 分钟后若 `tmp/issues/<N>-a-summary.md` 不存在**且**工作树在该阶段的落点文件上零改动，视为迷路，停掉换人。只要工作树已有相关改动就继续等（#66 的 A 等到 94 分钟才交回，是正常的）。
- 同一错误最多修 3 次。

### 3.4 提交

- 集成分支 `refactor/agent-platform-hardening`，全程不开 PR、不合并进 `master`。
- 用显式路径 `git add`，禁止 `git add -A` / `.`（仓库里另一个 Agent 在更新 `content/**`）。
- 一个阶段可以拆成多个 commit（每号一个 `Closes #N`），也可以一个 commit 带多个 `Closes`。判据：**能不能单独 revert**。能就拆。
- `git commit -F tmp/xxx` 会失败（`tmp/` 被 gitignore），用 `git commit -m`。
- Windows 上 `git status` 偶尔挂 30s+ 被标 failed，**以已打印的 commit hash 为准，不要重复提交**。

### 3.5 子智能体统一约束

写进每个 A / B / 端测者的提示词：

- 模型 `cursor-grok-4.6-xhigh-fast`，`run_in_background: true`
- 不要 commit / push / 关 Issue / 打标签 / 留 GitHub 评论（主 Agent 做）
- 不要跑 `pnpm build`（`prebuild` 会全量扫 `content/`）
- 不要动 `content/**`
- 不要起 `next dev`（35349 已有一份，留给端测者复用）
- 不要打真实付费模型，测试一律 mock usage / fetch
- **knip**：新模块必须有测试文件 import 它，否则 `pnpm lint` exit 1
- eslint 约 85 条 warning 是历史噪声，只看 exit code 与 error
- PowerShell 5.1 + GB2312：不要把中文塞进命令行参数

### 3.6 编排状态

`tmp/` 下（全部 gitignore）：

| 文件 | 作用 |
|---|---|
| `tmp/goal-run-state.json` | 当前 loop / 阶段 / 子智能体 id / lastCommit / completed |
| `tmp/goal-run-log.md` | 时间线，一行一事件 |
| `tmp/goal-shared-brief.md` | 子智能体必读的通用约束（3.5 那一份） |
| `tmp/issues/<N>.md` | Issue 正文快照 |
| `tmp/issues/<N>-a-summary.md` / `-b-verdict.md` | 交回与判定 |
| `tmp/goal-queue.json` + `tmp/parse-goal-queue.js` | 从 GitHub 重算 ready 列表 |

心跳兜底：12–20 分钟一拍 `AGENT_LOOP_WAKE_goalrun`，醒来读 state 与 log 继续推进，不要停下来问用户。

## 4. 顺序与并行

```
#67 收尾 ──► L0 模型目录 ──► L1 计费与额度 ──► L2 服务端边界 ──► L3 上下文与缓存 ──► L4 模型接入与密钥 ──► L6 云端同步 ──► L7 文案与债务
                                                                        │
                                                                        └──  L5 消息呈现（可与 L3 / L4 并行）
```

**为什么是这个顺序**

- **#67 先收尾**：它的 A 已交回，只差 B 与提交。它改的是 `TokenDashboard` / billing store，与 L0 的 `models.ts` 不相交，先清掉不留尾巴。
- **L0 紧接着做**：它重写模型注册表与凭证解析，是 L1 的 #68（BYOK 判据）和 L4 的前提。放在后面做等于让 L1/L4 在即将被推翻的结构上改一遍。生图现在是坏的，也在这个 loop 修。
- **L1 第二**：钱漏了是 P0；#68 的双池闸门要改全部 8 条花钱路由，趁热做完。拿到 L0 的归属判据之后 #68 才好写。
- **L2 紧跟 L1**：#95/#96 改的就是 L1 刚打开过的那 8 条路由（脱敏 + 入参上限）。紧接着做，A 不用重新建立路由布局的认知。这两个 loop **不能并行**，文件重度重叠。
- **L3 排第三**：#77（finishReason）、#79（压缩注入）、#81（渐进披露）都重度改 `app/api/chat/route.ts`。等 L1/L2 的路由改动落稳再动，避免三方抢同一文件。
- **L3 与 L1 有一处强耦合**：#67 会重写 `components/chat/TokenDashboard.tsx` 让它读服务端台账；而 #83（缓存指标改绑 `cachedTokens`）和 #86（环阈值对齐）还要再改这个组件。**必须 L1 先落地**，L3 在新版本上继续改。两份文档都记了这条。
- **L5 可并行**：`CD-chatmsg` + `ChatThread.tsx` 与 L3/L4 的文件完全不相交（都在 `components/chat/` 下但不是同一批文件）。想压缩总工期就把它和 L3 同时跑。
- **L4 与 L3 有一处文件冲突**：#93 的视觉闸门要改 `app/api/chat/route.ts` 里 `!provider.isCustom` 那段，而 L3 也在改这个文件。**不要并行**，或者把这一处挪进 L3 的收尾阶段。
- **L7 最后**：#100 补测试、#101 清文档，都要对着最终状态写，提前做等于白做两遍。

## 5. 被拆掉的假依赖

原编排的 `depends-on` 有一类是「后一个号需要前一个号的产物」。同一个 loop 内这个关系天然成立，**不需要等前一个号关闭**。以下依赖在 loop 制下失效，不要再拿它阻塞：

| 依赖声明 | 原因 | loop 制下 |
|---|---|---|
| #68 depends-on #75 | 双池闸门需要「用户自配凭证」这个判据 | **跨 loop 但顺序已满足**：#75 在 L0，#68 在 L1，L0 先跑。这条依赖是真的，不要打破 |
| #78 depends-on #77 | 压缩要用到 finishReason | 同属 L3，同一个 A 里顺序写 |
| #79 → #80 → #81 → #82 → #83 → #84 → #85 → #86 | 逐环递进 | 全在 L3，按阶段合并 |
| #72 depends-on #71 | 明文治理要在「不再全量上传」之后 | 同属 L4 |
| #74 depends-on #73 | 孤立键回收要在云端有权威副本之后 | 同属 L6 |
| #76 depends-on #75 | 文案对齐与凭证自配同一批文件 | 同属 L1，同一个 A |
| #88 → #89 → #90 | 来源收敛 → 交错渲染 → think 统一 | 全在 L5 |
| #93 depends-on #92 / #94 depends-on #93 | 模型层递进 | 全在 L4 |

**仍然有效的跨 loop 依赖**：#68 需要 #66（已关）的 `usage_ledger` 写侧；#73 需要 #63（已关）的登录态；L3 全链需要 #52（已关）的 JSONL 日志作为验收证据。

## 6. 重排时新发现的问题（不在任何 Issue 里）

写这套文档时重新核实了三个板块的当前代码基线（不是照抄半年前的审计，#48–#66 已让行号大面积漂移）。过程中查出 10 项审计报告没有准确记录、或本轮新引入的问题。**它们已经写进对应的 L 文档，不需要新开 Issue**，但要知道它们存在。

| # | 发现 | 严重度 | 归属 |
|---|---|---|---|
| 1 | **`app_users_update_own` 这条 RLS policy 允许登录用户用 anon key 自己改 `tier` 与 `period_end`。** RLS 不能限制列，迁移里又 `grant all ... to authenticated` → 额度体系可被绕过 | **P0** | L1 §2.4 |
| 2 | **`pool` 已经在用错判据写入。** `route.ts:195-204` 是 `actualProvider.isCustom ? "byok" : "platform"`，正是 #68 点名不能用的判据。真 BYOK 主模型消耗被错记进 byok 池 | **P0** | L1 §2.2 |
| 3 | **5 条卫星路由的入参零校验。** 只有 `/api/chat` 有 zod；`document` 是 `as CustomApiGroup[]` 强转，`image-gen`/`record`/`canvas-revise` 完全没有 | **P0** | L2 §2.2 |
| 4 | `settings.ts:232-254` 把第一个分组的 apiKey 冗余拷进 `customApiKey`，同一密钥在同一 JSON 里存两遍 | P1 | L4 §2.5 |
| 5 | `/api/document` 对 `thinkingRequired` 模型只加长超时、不传思考参数（P1-46，无 Issue） | P1 | L4 §2.1 |
| 6 | `chat-title` 走旧 `CustomProvider`、不读 `customApiGroups` → **用户的自定义模型永远不用于生成标题，标题永远花平台的钱**（P1-49，无 Issue） | P1 | L4 §2.3 + L1 |
| 7 | env 凭证读取双语义：`provider.ts:22-72` 模块加载时读一次，`chat-title` 每请求读（P1-41，无 Issue） | P2 | L4 §2.3 |
| 8 | **执行契约里「`ChatMessage.tsx` 工具名字面量已清零」这条没保住**——`imageSearch` 被特例在 registry 之外（P1-68） | P1 | L5 §2.1 |
| 9 | **`pruneMessages` 只做移除不做摘要。** #79 / #81 的正文都说「SDK 已内置，不要自己写」，但摘要那一半必须自己实现，且那个 LLM 调用要记账 | 规划风险 | L3 §3.B2 |
| 10 | 生产 UI 仍写死 `contextMode: 'full'`（`ChatPanel.tsx:33`、`FloatingChatBody.tsx:27`），`SemanticSearchManager` 是死路径（P1-14，无 Issue） | P1 | L3 §2 |
| 11 | **`source-url` / `source-document` 的 UI 接好了，但主循环从不 `sendSources`** —— 「参考来源」「参考文档」两个表面永远收不到数据，是死路径 | P2 | L5 §2.2 |
| 12 | **FollowUp 在 UI 上是双通道**：`ChatMessage` 画带 sources 的一枚，`MessageContent` 从正文标签再画无 sources 的一枚 | P2 | L5 §2.2 |
| 13 | **`sync_documents.kind` 的枚举里没有 `document`** —— `writeDocument` 的长文档产物按现有 schema 无法同步 | P2 | L6 §2.1 |
| 14 | **`kimi-k3` 与 `mimo-v2.5` 要求回传 `reasoning_content`**，而我们跨轮历史只留 `text`/`file` → 多轮 + 工具会直接 400。**与 L3 的 #81 直接冲突** | **P0（功能不可用）** | L0 §3.6(a) · `MODELS.md` §4.3 |
| 15 | `mimo-v2.5` 与 `gemini` 的思考方言在注册表里**已经写错**（前者用了阿里云代理版的 `enable_thinking`，后者该用 `thinking_level` 却发 `reasoningEffort`） | P1 | L0 §3.6(b) · `MODELS.md` §4.4 |
| 16 | **`meta/muse-spark-1.3-contributor` 是「用数据换价格」的 SKU** —— 授权厂商用 prompt 与生成内容做训练。我们用户发的是错题与笔记 | 产品决策 | L0 §3.6(c) · `MODELS.md` §4.1 |

前 3 项与第 14 项是 P0。第 14 项尤其要注意：它不是「不够好」，而是用户点名要的旗舰模型 `kimi-k3` 在带工具的多轮对话里**直接不可用**，而且修它的方向与 L3 的 #81（reasoning 不跨轮回灌）相反。**L0 的 F0 阶段必须先实测中转站行为再决定**。

## 7. 每个 loop 的文档

| 文档 | Loop | Issue | 阶段数 | P0 数 |
|---|---|---|---:|---:|
| `L0-model-catalog.md` | 模型目录与渠道统一 | #92 #75 #76 + 新范围 | 4 | 1 |
| `L1-billing-quota.md` | 计费与额度 | #67 #68 #69 #70 | 3 | 3 |
| `L2-server-boundary.md` | 服务端边界 | #95 #96 | 1 | 2 |
| `L3-context-cache.md` | 上下文与缓存 | #77–#86 | 3 | 4 |
| `L4-model-keys.md` | 模型接入与密钥 | #93 #94 #71 #72 | 2 | 1 |
| `L5-message-surface.md` | 消息呈现 | #87 #88 #89 #90 #91 | 2 | 0 |
| `L6-cloud-sync.md` | 云端同步 | #73 #74 | 1 | 0 |
| `L7-copy-and-debt.md` | 文案与债务 | #97–#101 | 1 | 0 |

另有两份配套文档：

- **`MODELS.md`** —— 项目支持的全部模型及其真实价格、上下文、思考方言。价格口径是**非优惠、非峰谷、阶梯取最贵档**。它是 L0 的配套产物，也是以后加删模型的唯一真相源。
- **`99-goal-mode-prompt.md`** —— 可直接投喂给主 Agent 的目标模式提示词，一次覆盖 L0–L7 全部 8 个 loop。取代 `docs/archive/2026-09-12-one-issue-per-loop/analysis/Agent/02-goal-mode-prompt.md`（已归档）。

## 8. 完成定义（每个 loop）

1. 覆盖的每个 Issue 的验收标准逐条通过（B 独立取证，不采信 A 的自述）
2. `pnpm test` exit 0
3. `pnpm lint` exit 0（0 error；warning 不看）
4. 每个 Issue 有一个带 `Closes #N` 的 commit 在集成分支上
5. 每个 Issue 有中文完成评论并已关闭
6. **loop 末尾的浏览器端测 PASS**（对应文档第 7 节的脚本）
7. `tmp/goal-run-log.md` 有该 loop 的起止记录

## 9. 不许退回的既成不变量

`docs/plans/archive/00-execution-contract.md` 第六节记的滚动契约、窗口层契约、Agent 与状态契约、分层契约、指令解析、布局档位全部仍然有效。本轮 #48–#66 又加了几条：

- **`proxy.ts` 的 `config.matcher` 必须是编译期字面量数组**（8 条付费路径写死）。不要改回 `[...PAID_AI_API_PATHS]` 或任何 spread / 跨模块引用——那是 `next dev` 全站 500 的直接原因。闸门逻辑仍走 `lib/auth/aiGate.ts` 的 `decideAiGate` + `isPaidAiApiPath`，两边值一致由 `lib/auth/aiGate.test.ts` 钉住。
- **服务端记账是唯一权威账本。** `lib/billing/usageLedger.ts` 的 `settleChatUsage`（主聊天）与 `settleUsage`（卫星 / 侧车）在上游返回后立即写 `usage_ledger`，不依赖客户端 SSE。abort 照常记账，0/0 不建行。客户端 IndexedDB 的 `billing-history` 只能当展示层，不得再作为任何判据。
- **计价一律按实际落地模型。** `selected_model_id` 记用户选的，`actual_model_id` 记真正打的。生图模式按 `imageModeTextModel` 的 token 单价计，不套「每张 0.1」；failover 后按落地端点计价。新增花钱调用必须带正确的 `route` 与 `kind`（`llm` / `image` / `embedding` / `rerank` / `web-search` / `image-search`）。
- **ALS 是卫星路由拿 userId 的标准通道。** `runWithLedgerContext` / `withRequestLedger` / `getLedgerContext`。新增花钱路径优先吃 ALS，不要各自再解析一遍 Bearer。
- **登录闸门不得有旁路。** exe 形态与 BYOK 用户同样强制登录。

---

<sub>本目录的 7 份 L 文档是执行依据。问题事实以 `docs/analysis/Agent/00-agent-issues-consolidated.md` 为准；与真实代码冲突时以代码为准，并把偏差写进交回摘要。</sub>
