# L1 · 计费与额度

> **一句话**：把已经写对的服务端台账接到读侧与闸门上——看板读台账、凭证归属可判、双池能扣、耗尽能降级、兑换码能核销。
> **Issue**：#67 #68 #69 #70（3 个 P0：#68 #69 #70；1 个 P1：#67）
> **来源 Epic**：E4 #30（余下的读侧） + E5 #31（额度三件）
> **冲突域**：`CD-ui`（#67）→ `CD-route`（#68 #69）+ `CD-new`（#70）
> **顺序**：**L0 之后。** #67 可以先收尾（它与 L0 文件不相交），但 #68 必须等 L0 给出凭证归属判据。
>
> **⚠️ #75 #76 已于 2026-09-12 移到 L0。** 原因：「用户自配搜索 / 搜图凭证」的病根是 `credentialsFor` 的 `default` 分支把生图 / 向量 / 重排 / 搜索全部塌进一个 `AI_*` 兜底，而拆这个兜底属于 L0 的模型渠道重构。见 `L0-model-catalog.md` 第 1.3 节。

## 1. 为什么这 4 个号是一个 loop

它们回答的是同一个问题：**这笔钱是谁的、花了多少、还剩多少、花完了怎么办。**

写侧已经在 #64–#66 做完了（`settleChatUsage` / `settleUsage` 写 `usage_ledger`，8 条花钱路由 + 4 种工具侧车全入账，按实际落地模型计价）。剩下的 4 个号全部依赖同一套认知：

- `usage_ledger` 的列语义（`pool` / `route` / `kind` / `selected_model_id` / `actual_model_id` / `cost_cny`）
- `quota_grants` 的滚动 30 天周期与 `app_users.period_*` 锚点
- 「这次调用用的是谁的凭证」这个判据（由 **L0** 提供）

#69 是 #68 的耗尽分支；#70 是往 `quota_grants` 里发额度的入口；#67 是这一切的可视化。拆开做的话，每个 A 都要重新读一遍 `usageLedger.ts` 和 `0001_init.sql`。

**#68 的关键前提来自 L0**：模型目录重构成「内置模型 / API 调用」之后，这个二分法本身就是 BYOK 判据——内置走我们的中转 key（`platform`），API 调用走用户的 key（主模型不进池，平台侧开销进 `byok`）。不必再去猜 `isCustom`。

## 2. 当前基线（已核实）

### 2.1 已落地的写侧设施（不要重写）

`lib/billing/usageLedger.ts` 导出：

| 函数 | 用途 |
|---|---|
| `settleChatUsage` | 主聊天。`bindContext: false`，只吃显式 userId |
| `settleUsage` | 卫星路由与工具侧车。会吃 ALS 上下文 |
| `runWithLedgerContext` / `withRequestLedger` / `getLedgerContext` | AsyncLocalStorage 通道，卫星路由靠它拿 userId / route / pool |
| `mapLanguageModelUsage` | 吃扁平 `LanguageModelUsage` 与嵌套 mock 两种形状 |
| `hasBillableUsage` / `hasBillableLedger` | 0 消耗不建行的判据（按 kind 分流） |
| `calcUsageCostCny` | ¥/百万 token；uncached / cacheRead / cacheWrite / output 四段 |
| `buildUsageLedgerRow` | 组行。`pool` 缺省 `"platform"` |
| `resolveActualBillingModelId` | apiModelId 能对上注册表就用它（GLM → mimo），否则回退 registryId |
| `awaitUsage` | 3s 超时等 `totalUsage` |
| `resolveLedgerUserId` | 从 Bearer 解 userId |

测试：`lib/billing/usageLedger.test.ts`、`lib/billing/satelliteUsage.test.ts`。

### 2.2 数据库（`supabase/migrations/0001_init.sql`）

| 表 | 客户端可达性 | 对本 loop 的意义 |
|---|---|---|
| `usage_ledger` | **`usage_ledger_select_own` → authenticated 可直读自己的行**；无 insert policy | #67 不需要新开服务端路由，浏览器带用户 JWT 直查即可 |
| `quota_grants` | `quota_grants_select_own` → 只读自己 | 剩余额度也能直读 |
| `app_users` | `select_own` + **`update_own`** | 见 2.4 的问题 |
| `redemption_codes` | **零 policy** → 客户端完全不可达 | #70 核销**必须**走服务端 service_role |
| `redemptions` | `select_own` | 已有 `unique(code_id, user_id)`，同用户重复核销由约束挡住 |

`on_auth_user_created` 触发器已在注册时建 `app_users` 行（tier=free，30 天周期）并发 `quota_grants` 一行（platform / free / ¥7）。#61 验收时已实测触发。

`pool` 列在两张表上都是 `check (pool in ('platform','byok'))`，代码里 `UsagePool` 类型也已经是这两个值。

**⚠️ 但 `pool` 已经在写了，而且用的正是 #68 点名的错判据**（`app/api/chat/route.ts:195-204`）：

```ts
const actualProvider = resolved.getActualProvider();
const actualModelId = resolveActualBillingModelId(actualProvider);
pool: actualProvider.isCustom ? "byok" : "platform",
```

这意味着 #68 不是「从零加双池」，而是**纠正一个已经在产生错数据的判定**。两个错：

1. **`custom-openai`（桌面「自由中转」）的 `isCustom` 是 `false`**，走 `RELAY_*` 平台凭证——现在会被记成 `platform`，这一条碰巧对，但判据是巧合不是设计。
2. **真 BYOK 用户的主模型消耗现在被记进 `byok` 池**。而 #68 的设计是：BYOK 主模型的钱是用户自己的，**不该进任何池**；`byok` 池只承载平台侧开销（搜索 / 搜图 / 嵌入 / 重排 / 标题生成）。所以现在的 `byok` 行语义是错的。

#68 开工时要先决定这些历史行怎么办（最省事的做法：不动历史行，在额度聚合时按 `kind` + `meta` 再判一次；或者加一次数据修正迁移）。这一点必须写进 A 的提示词。

### 2.3 读侧现状

- `components/chat/TokenDashboard.tsx`：`calcCost(prompt, completion, cached, pricing)` 用**当前选中模型**的 pricing × 会话累计 token（约 56–60 行的 `calcCost`，108 行读 `usdExchangeRate`，118 行 `pricing = modelInfo?.pricing`，412 / 429 行展示「本轮费用」「累计费用」）。换模型 → 历史金额被重算。
- `lib/stores/billing.ts`：另一套「按条定价」。`createBillingRecord` 在生图时用 `imageCount * pricing.output`（第 111 行），对话时用 `calcCost`。persist key `PERSIST_KEYS.billingHistory`，IndexedDB。
- `replaceFromLedger(records)` **已经存在**（第 141–145 行，注释「用服务端台账整表替换本地缓存（金额已是 cost_cny）」）——这是 #67 的在途 A 刚加的，接手时先确认它的调用方是否已接好。
- `lib/stores/tokenTracker.ts` + `lib/hooks/useChat.ts` 的门闩：切走活动会话时看板丢 usage，账本不丢。

### 2.4 本 loop 必须一并修掉的一个 P0（不在任何 Issue 里）

**`app_users_update_own` 让用户能自己改 `tier` 和 `period_end`。**

```sql
create policy app_users_update_own on public.app_users
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
```

RLS policy 不能限制列，而迁移里又有 `grant all on all tables in schema public to authenticated`。于是任何登录用户拿 anon key 就能 `update app_users set tier='pro', period_end=now()+interval '10 years' where id=auth.uid()`——整个额度体系直接失效。

这条必须在 #68 之前处理，否则闸门是装饰品。处理方式（按优先级）：

1. 先确认客户端**没有**任何地方写 `app_users`（预计没有，档位变更只应由 #70 的服务端核销接口写）。
2. 新增迁移 `0002_*.sql`：`drop policy app_users_update_own`。档位与周期一律 service_role 写。
3. 如果确有客户端要改的字段（例如以后加昵称），用列级 grant：先 `revoke update on public.app_users from authenticated`，再 `grant update (那几列) on public.app_users to authenticated`。
4. 补一条实测：用 anon key + 某用户 JWT 尝试改 `tier`，断言被拒。#61/#63 已经建立了这类实测的做法。

## 3. 分阶段实施

### 阶段 A1 · #67 看板读台账（**A 已交回 DONE，待 B 验收**）

修复者交回摘要在 `tmp/issues/67-a-summary.md`。实际实现（与本文档最初的建议略有不同，但满足同样的安全意图）：

| 新增 / 改动 | 作用 |
|---|---|
| `app/api/usage/route.ts` | **只读 GET**，路由内自己做登录校验。没有走 `proxy.ts` 的付费闸门（`lib/auth/aiGate.test.ts` 加了断言确认 `/api/usage` 不是付费路径，matcher 未改） |
| `lib/billing/readUsageLedger.ts` | 服务端按登录 `user_id` 读自己的 `usage_ledger`。**service_role 不进浏览器** |
| `lib/billing/syncUsageLedger.ts` | `GET /api/usage` → 灌进 store。失败 / 未登录不动本地 |
| `lib/billing/ledgerView.ts` | `cost_cny` 映射、会话汇总、时间窗过滤、本地乐观行与台账按指纹合并 |
| `lib/stores/billing.ts` | 新增 `replaceFromLedger` |
| `components/chat/TokenDashboard.tsx` | 本轮 / 累计费用改读 store 里的已入账 cost，不再用当前模型单价 × 累计 token |
| `components/chat/BillingDashboard.tsx` | 启动时拉台账；美元 = `cost_cny / usdExchangeRate`（默认 7.00） |
| `ledgerView.test.ts` / `syncUsageLedger.test.tsx` | 换模型不改写、切会话不丢计、看板账本一致、401 不动 store |

> 本文档原先建议「浏览器带 JWT 直查 `usage_ledger`（`usage_ledger_select_own` 的 RLS 允许）」，A 选了「服务端只读路由」。两者都不把 service_role 给浏览器，安全意图一致。**保留现有实现**，不要为了对齐文档再改一遍。

**A 自认 4 条 YES**，`pnpm test` exit 0（node:test 104/737；vitest 74/281），`pnpm lint` exit 0。

**A 自报的 4 个不确定项，B 要逐条判定**（按验收标准，前两条不构成 FAIL）：

1. 未做浏览器端测 —— 按 loop 制留给第 7 节的端测者，**不判 FAIL**
2. 未登录时展示的是本地入账价（写入时定价），不是服务端行 —— 合理降级，**不判 FAIL**
3. **同一会话连续两笔 token 完全相同、且一笔只在本地时，指纹合并可能丢掉那笔乐观行** —— 这是「切会话不丢计」的边界反例，B 要实际构造这个场景取证。若确实会丢，应判 FAIL 并派 C
4. 缓存倒计时的「过期更贵」仍用当前模型单价做假想对比 —— 那是**预测**不是历史费用，与「换模型不改写历史」不冲突，**不判 FAIL**；但要记进 L3 的 #83（看板缓存那一组）一起收

提交时纳入上表 10 个文件。

### 阶段 A2 · #68 + #69 + #70 双池、耗尽降级、兑换码

先做 2.4 的迁移收紧，再做闸门。

**前提：L0 必须已经落地**，并交出了凭证归属判据（`L0-model-catalog.md` 阶段 F2 第 3 项）。没有它 #68 只能写基于 `isCustom` 的补丁，做完还要删。

**#68 双池闸门**

- **先纠正 2.2 里那个已在产生错数据的判定**（`route.ts:195-204` 的 `actualProvider.isCustom ? "byok" : "platform"`），换成 L0 给出的判据，再谈闸门。
- **BYOK 判据不能用 `isCustom`**。`custom-openai`（桌面「自由中转」）的 `isCustom` 是 `false`，走 `RELAY_*` 平台凭证且没有 pricing。L0 之后的正确判据是「这次调用属于内置模型还是 API 调用」。
- `byok` 池计量：token 量 × ¥0.5/百万 token，只承载平台侧开销（联网搜索 / 搜图 / 嵌入 / 重排 / 标题生成）。BYOK 用户的主模型消耗**不进任何池**（钱是他自己的）——所以主聊天在 BYOK 时应该**不落行**或落一个不计入额度的标记，而不是落 `pool: "byok"`。
- `buildUsageLedgerRow` 的 `pool: input.pool ?? "platform"` 是落点；调用侧（主聊天 `route.ts` + 卫星的 ALS `LedgerContext.pool`）都要传对。
- **闸门放哪里**：`proxy.ts` 的 `decideAiGate` 已经拦了 8 条付费路径，但它读不到请求体，因此无法知道本次用哪个模型、是否 BYOK。所以额度闸门要做成一个**共享 helper**，在 8 条路由各自解析完 body 之后调用一次。一个 helper，8 个调用点；不要在 8 条路由里各写一套。
- 请求前预估、上游返回后结算。预估只用于「明显已耗尽就直接拒」，不做精确预扣。
- 滚动 30 天：按 `app_users.period_start/period_end` 判当前周期，聚合该周期内 `usage_ledger` 的 `cost_cny`（按 pool 分），与 `quota_grants` 该周期的 `amount_cny` 之和比较。

需要加闸的 8 条：`chat`、`chat-title`、`image-gen`、`artifact`、`document`（每 phase）、`canvas-revise`、`record`、`follow-ups`。

**#69 耗尽降级**

- platform 池耗尽：**只**硬阻断平台模型，返回可读提示，并明示「可改用 BYOK 继续」。
- 历史会话、笔记浏览、本地检索**全部保持可用**。
- BYOK 池独立结算，不受 platform 耗尽影响。
- 前端要有对应的提示 UI（不是一个裸 500）。

**#70 兑换码核销**

- 新增服务端接口（service_role），因为 `redemption_codes` 零 policy。
- 规则：达到 `max_uses` 失效；`unique(code_id, user_id)` 挡同用户重复；绑定档位与月数，按滚动 30 天起算；同档位叠加续期，跨档位升级保留剩余天数。
- 防爆破：复用 #63 的 `lib/auth/rateLimit.ts`（30/60s per user），核销接口用更严的配额。
- 设置页兑换入口。
- **无后台面板**，码由运维写库。首批 16 个已入库。

## 4. 不变量

- **服务端台账是唯一权威。** 客户端 IndexedDB 的 `billing-history` 只能当展示层与离线兜底，不得再作为任何判据。
- **计价按实际落地模型。** 不要因为要做 pool 就改动 `resolveActualBillingModelId` 或生图 / failover 的计价口径，那是 #65 刚钉住的。
- **0/0 不建行**、**abort 照常记账**（#64 的契约），不要在加 pool 参数时破坏。
- **不要重写 `settleUsage` 的 ALS 通道。** 新增花钱路径吃 ALS，不要各自解析 Bearer。
- **不要把 `SUPABASE_SERVICE_ROLE_KEY` 带进任何客户端 bundle**（#51 的提交前扫描会拦，但别依赖它）。
- persist key 一律不得改名（`PERSIST_KEYS.billingHistory` 等），改名等于用户数据消失。

## 5. 陷阱

1. **`usage_ledger` 的 RLS 只有 SELECT。** 客户端插不了行，这是对的。#67 只读。
2. **`getModelInfoWithCustom` 才认自定义模型的 pricing**，`getModelInfo` 不认。`buildUsageLedgerRow` 已经用对了，读侧别用错。
3. **`custom-openai` 的 `isCustom === false`**。这是 #68 最容易翻车的一点。
4. **`quota_grants` 可以有多行**（signup + 多次 redemption），聚合时要按当前周期求和，不是取最新一行。
5. **knip**：新增的 pool 判定 / 额度查询模块必须被测试 import。
6. 不要跑 `pnpm build`；不要动 `content/**`；`pnpm dev` 已在 35349 跑着，不要再起。

## 6. 合并验收

从 4 个 Issue 的验收标准去重合并（`pnpm test` / `pnpm lint` 只留一条）：

**读侧（#67）**
- [ ] 换模型不再改写历史费用
- [ ] 切走活动会话不再丢计
- [ ] 看板与账本数字一致

**额度（#68 #69 #70）**
- [ ] 平台模型消耗扣 platform 池，BYOK 平台侧开销计入 byok 池
- [ ] BYOK 平台侧开销按 ¥0.5/百万 token 计量
- [ ] `custom-openai` 不被误判为 BYOK
- [ ] 滚动 30 天周期按用户各自锚点正确重置
- [ ] platform 池耗尽后平台模型被拒且提示清晰、明确告知可改用 BYOK
- [ ] 历史会话与笔记功能不受影响；BYOK 用户在 platform 耗尽后仍可用
- [ ] 有效码可核销并正确改变档位与周期；超 `max_uses` 被拒；同用户重复核销被拒
- [ ] 兑换码不会通过任何客户端接口泄漏
- [ ] 核销有防爆破措施

**本 loop 追加（2.4）**
- [ ] 登录用户无法用 anon key 自行修改 `app_users.tier` / `period_end`（有实测证据）

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0

## 7. Loop 末尾端测脚本

真开 `http://localhost:35349`，复用用户已跑的 `pnpm dev`。不要打真实付费模型。

1. 未登录访问 `/` → 200 能渲染；未登录 POST `/api/chat` → 401（#63 的回归检查）。
2. 走 `/login` 邮箱表单：非法邮箱被拦。**不要真发验证码**。
3. 已登录态下打开计费看板：
   - 有历史台账时金额显示正常，切换模型选择后**历史金额不变**
   - 切走会话再切回，累计金额不丢
   - 控制台无 `usage_ledger` 相关报错、无 401/403
4. 设置页兑换入口：输入一个无效码 → 明确拒绝提示，不泄漏任何码信息。
5. 用一个**内置模型**发一轮 → 台账该行 `pool = platform`；再用一个**API 调用**分组发一轮 → 主模型不进池，而这轮里的联网搜索 / 嵌入落成 `pool = byok`。
6. 控制台全程无 `proxy.ts` / matcher / 500 报错。

端测者交回 `tmp/issues/billing-l1-e2e.md` + PASS/FAIL 模板。

## 8. 提交与关单

建议拆 3 个 commit（各自可单独 revert）：

| commit | 内容 | Closes |
|---|---|---|
| `feat(billing): read the server ledger in the dashboards` | #67 | `Closes #67` |
| `fix(db): stop clients from editing their own tier` | 2.4 的迁移 | 无（无对应 Issue，在 commit body 里写清原因） |
| `feat(billing): gate platform and byok quota pools` | #68 #69 #70 | 三个 `Closes` |

若 A2 一次做不完，按 #68 / #69+#70 再拆。

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| #68 的 BYOK 判据做错，把平台消耗算进 byok 池（或反过来） | 这是**记错账**，比不记账更糟。B 必须用 `custom-openai` + 真自定义分组两个场景各取一次证据 |
| 额度聚合查询在每次请求都打一次库，拖慢首字延迟 | 允许按 userId 做短 TTL 内存缓存（单进程即可），但耗尽判定要能在结算后立即失效 |
| 兑换码接口被爆破 | 必须限流 + 失败不回显码是否存在 |
| 2.4 的迁移收紧后发现客户端确实在写 `app_users` | 改用列级 grant，不要回退 policy |
| A2 三个号一次吃不下 | 拆成两次 A；#70 可以单独留到 loop 末尾，它是 `CD-new` 几乎不争用 |
| L0 还没落地就开 #68 | 那就只能基于 `isCustom` 写补丁，做完还要删。**等 L0** |

放弃协议：某个号 C 之后仍不通过，打 `blocked` 标签 + 诊断评论，半成品推 `wip/<号>-<slug>`，**其余号继续**。#70 是最适合被放弃的（不阻塞任何后续 loop）；#68 不能放弃，它是 L1 的目的。
