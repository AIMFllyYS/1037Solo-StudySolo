# Goal 模式执行手册：Agent 板块系统性整改

> **调度规则已被 loop 制取代（2026-09-12 16:45 起）。** 不要再按本文第 1–3 节「一个 Issue = 一个 loop」切 54 个循环。权威入口：[`docs/plans/Agent-refactor/00-loop-map.md`](../../plans/Agent-refactor/00-loop-map.md)。第 0 节（Supabase / 标签 / RLS）与第 4 节（三个坑）仍然有效。
>
> **生成**：2026-09-12 · **仓库**：[AIMFllyYS/Notebook-MedFreshman](https://github.com/AIMFllyYS/Notebook-MedFreshman)
> **配套**：问题清单 `00-agent-issues-consolidated.md` · 模型对比 `agent-model-comparison.html`
> **范围**：21 个 Epic（#27–#47）+ 54 个可独立执行的子 Issue（#48–#101）

---

## 0. 已经就绪的东西

开工前不需要再准备任何环境，下面这些都已完成并验证过：

- **标签体系** 25 个：`P0/P1/P2/P3` + 17 个 `area:*` + `epic` / `good first vibe` / `needs-decision` / `serial-only`。原先那个编码损坏的 `P3` 描述也已修复。
- **Supabase 项目** `jlahwwnjbhqfnsicdjsx` 已复用并重置。原「HUST Nursing Platform」的 34 张废弃表已快照（`tmp/backup-hust-nursing.json`，177 行）后清空，项目重命名为 `StudyReview-Platform`。
- **基线 schema** 已落库，见 `supabase/migrations/0001_init.sql`：`app_users` / `quota_grants` / `usage_ledger` / `redemption_codes` / `redemptions` / `sync_documents`。
- **RLS 已实测验证**（不是「配了就假设生效」）：库里有 16 行兑换码的前提下，匿名 key 读到 **0 行**；匿名写台账被拒；service_role 正常读写。`redemption_codes` 刻意零 policy，客户端完全不可达。
- **首批兑换码** 16 个已入库：5 个 Pro 单用、10 个 Plus 单用、1 个 Plus 限 20 人核销。明文清单在 `tmp/redemption-codes.txt`。
- **`.env.local`** 已回填 `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` / `PROJECT_REF`，以及阿里云 DirectMail 的 SMTP 凭证。

---

## 1. 调度规则

不硬编码执行波次。每个 Issue 正文末尾都有一段机器可读的调度块：

```yaml
parent: #30
depends-on: [#64, #75]
conflict-domain: CD-route
verify: pnpm test
```

**选取规则**：

> 取出所有 `depends-on` 全部已关闭的 Issue，按 `conflict-domain` 加互斥锁 —— **同一冲突域同时只允许跑一个，不同域全部并行**。

冲突域按「会被同时编辑的文件」划分，这是为了让并行的子智能体不会改同一份文件：

- `CD-route` — `app/api/chat/route.ts`。争用最激烈：记账、额度闸门、finishReason、压缩注入都要动它
- `CD-context` — `lib/context/*`、`lib/ai/agent/contextBreakdown.ts`
- `CD-agent` — `lib/ai/agent/studyAgent.ts`
- `CD-chatmsg` — `components/chat/ChatMessage.tsx`
- `CD-models` — `lib/ai/models.ts`、`lib/ai/provider.ts`
- `CD-tools` — `lib/ai/agent/tools/**`
- `CD-satellite` — `app/api/{artifact,document,image-gen,canvas-revise,record,chat-title,can-embed}/route.ts`
- `CD-ui` — 聊天 UI 组件（`ChatMessage.tsx` 除外）
- `CD-client` — `lib/chat/*`、`lib/stores/*`
- `CD-prompt` — `lib/ai/prompts/**`
- `CD-docs` — 纯文档
- `CD-new` — 纯新增文件，几乎无争用，优先跑满

打了 `needs-decision` 标签的 Issue 一律跳过，等人拍板。目前**没有**这类 Issue —— 全部决策点都已解决。

---

## 2. 起跑：21 个 Issue 可立即开工，10 条并行车道

所有依赖为空的 Issue，按冲突域分组（同组内串行，跨组并行）：

- **CD-new**（5）：#48 迁移工具化 · #49 keepalive · #50 备份与容量告警 · #51 凭证扫描 · #55 沙箱换 origin
- **CD-tools**（4）：#57 内容路径白名单 · #75 自配搜索凭证 · #97 工具文案对齐 · #100 补工具单测
- **CD-models**（2）：#58 baseUrl 主机校验 · #92 GLM 降级方言错配
- **CD-satellite**（2）：#59 can-embed 收口 · #95 卫星路由脱敏
- **CD-ui**（2）：#60 markdown 消毒 · #91 对话定位导航
- **CD-prompt**（2）：#98 InteractiveVenn 字段 · #99 学年科目表
- **CD-agent**（1）：#52 SDK 生命周期钩子与 JSONL 日志
- **CD-chatmsg**（1）：#87 来源块自适应聚合
- **CD-route**（1）：#96 role 过滤与入参上限
- **CD-docs**（1）：#101 清理过时文档

### 建议第一个跑 #52

**#52（接入 SDK 生命周期钩子并落 JSONL 日志）是最长依赖链的头部。**

关键路径深度 11，整条都是上下文链：

```
#52 → #77 → #78 → #79 → #80 → #81 → #82 → #83 → #84 → #85 → #86
日志   触顶   提问   压缩   粘滞   渐进   前缀   缓存   窗口   分桶   口径
       可见   出sys        80%   披露   bust   指标   修正   修正   统一
```

这 11 个 Issue 全部落在 `CD-route` / `CD-context` 两个域，**没有任何并行余地**，是整个计划的工期瓶颈。越早启动越好。而且 #52 落地后，后面每个 Issue 的验收都能拿到真实的耗时与调用证据，而不是靠人肉观察。

其余 20 个可以同时铺开，互不干扰。

---

## 3. 子智能体 loop 契约

每个 Issue 一个 loop，三个角色，**上下文互不共享**（这是长任务不失控的关键）：

### 修复者

- **输入**：Issue 正文 + 仓库。不需要任何额外对话 —— Issue 里已写明 `file:line` 与当前行为。
- **动作**：先读 Issue 指向的位置建立上下文，再改。
- **验证**：跑 `pnpm test`。
- **不要跑 `pnpm build`** —— 它会触发 `prebuild`，扫全量 `content/` 的 8 个守卫，很重且与本次改动无关。
- **产出**：改动 + 测试结果 + 一段自述（改了什么、哪些没覆盖、有什么不确定）。

### 验收者

- **全新上下文**，只拿 Issue 的「验收标准」+ 修复者的自述。不看修复者的推理过程，避免被带偏。
- 跑 `pnpm test` + `pnpm lint`（含 knip）+ 按验收标准做端侧验证。
- **产出**：逐条通过/失败结论 + 证据。

### 返修者

- 仅在验收失败时派遣。拿失败结论修，修完**自己补完剩余验收**，闭环。

---

## 4. 三个会让 loop 翻车的坑（务必写进子智能体的提示）

**① knip 会因为「新文件没人引用」直接让 lint 失败。**
`pnpm lint` = `eslint . && knip`。knip 把 `components/` 或 `lib/` 下没有任何 entry 引用的新文件判为 unused file，具名导出无人使用判为 unused export。**每个新增模块必须同时有测试文件 import 它**，否则验收必挂。这是本次编排里最容易踩的一个坑，已写进相关 Issue 的验收标准。

**② `pnpm build` 很重，不要在修复阶段跑。**
`prebuild` 串了 8 个守卫（全量扫 `content/` 的编码、KaTeX 字符、媒体同步、注册表一致性等）+ 一轮 code 单测。修复阶段用 `pnpm test` 就够。

**③ 仓库是 PUBLIC。**
Issue 正文、PR、提交都公开可见。不得写入任何 key、内网地址、真实邮箱。`.env` 与 `.env.production` 当时**没有**被 gitignore（只有 `.env.local` 有），#51 之后已补上规则——现网 `.gitignore` 是 `.env*` + `!.env.example`，只有 `.env.example` 入库。

---

## 5. 分支策略：单条集成分支

本轮是一次整体重构，不走「一 Issue 一 PR」，**所有改动集中在一条分支**：

```
refactor/agent-platform-hardening
```

这么定的原因是依赖链最深有 11 层。如果按常规的「每个 Issue 从默认分支切、开 PR、等合并」，那么 `#78` 切分支时 `dev` 上还没有 `#77` 的代码，它依赖的 `finishReason` 根本不存在——无人值守的夜间运行会在第二个 Issue 就卡死。单条集成分支让依赖天然打通，全程不需要任何合并动作。

约定：

- 每个 Issue 完成后在该分支上提交一个 commit，message 末尾带 `Closes #<号>`
- **例外**：放弃某个 Issue 时，有保留价值的半成品可以推到 `wip/<issue号>-<slug>`
- 天亮后对这一条分支统一 review，届时再决定怎么并回 `dev`

**不变量：这条分支上 `pnpm test` 必须恒绿。** 某个 Issue 改红了又修不好，就整个回退该 Issue 的改动并记 `blocked`，不要提交红色状态——否则后面 50 个 Issue 都会在错误的基线上工作。

---

## 6. 全量索引

### Epic（#27–#47）

| Epic | # | 冲突域 | 依赖 |
|---|---|---|---|
| E1 服务端持久化地基 | #27 | CD-new | — |
| E2 结构化日志与计时 | #28 | CD-agent | — |
| E3 Supabase Auth 登录与强制闸门 | #29 | CD-new | #27 |
| E4 服务端用量台账 | #30 | CD-route | #29 |
| E5 会员额度、双池计量与兑换码 | #31 | CD-route | #30 #38 #47 |
| E6 用户自带密钥治理 | #32 | CD-client | #29 |
| E7 HTML 沙箱换 origin | #33 | CD-new | — |
| E8 路径白名单与 SSRF 收口 | #34 | CD-tools | — |
| E9 卫星路由脱敏与入参上限 | #35 | CD-satellite | — |
| E10 聊天 markdown 消毒 | #36 | CD-ui | — |
| E11 步数触顶可见化 | #37 | CD-route | #28 |
| E12 80% 自动压缩 | #38 | CD-context | #37 |
| E13 缓存命中与渐进披露 | #39 | CD-context | #38 #30 |
| E14 token 核算与预算口径 | #40 | CD-context | #39 |
| E15 模型接入层修正 | #41 | CD-models | — |
| E16 来源块自适应聚合 | #42 | CD-chatmsg | — |
| E17 多轮工具交错渲染 | #43 | CD-chatmsg | #42 |
| E18 对话定位导航 | #44 | CD-ui | — |
| E19 长尾 P1 与文档测试 | #45 | CD-mixed | #28 #40 #31 |
| E20 云端同步 | #46 | CD-new | #29 |
| E21 用户自带搜索凭证 | #47 | CD-tools | — |

### 子 Issue 分布

- **地基组** #48–#60（13）：迁移工具化、keepalive、备份告警、凭证扫描、日志三件、沙箱两件、路径与 SSRF 三件、markdown 消毒
- **身份与额度组** #61–#76（16）：登录三件、台账四件、额度三件、密钥两件、同步两件、搜索凭证两件
- **核心链路组** #77–#86（10）：触顶、压缩三件、缓存三件、核算三件 —— 全部串行
- **UI 组** #87–#91（5）：来源两件、交错渲染两件、定位导航
- **长尾组** #92–#101（10）：模型三件、安全两件、债务五件

标签分布：**37 个 P0 / 29 个 P1 / 9 个 P2**，其中 7 个标了 `good first vibe`（上下文自包含，最适合作为 loop 的首轮试跑）。

---

## 7. 建议的验证顺序

如果想先小范围验证 loop 机制本身可靠，再全量放开，推荐用这三个 `good first vibe` 起步 —— 它们改动面小、验收标准明确、彼此不在同一冲突域，可以真正并行：

- **#99** global.md 学年科目表缺 4 科（`CD-prompt`）
- **#56** artifact 提示词移除 localStorage 承诺（`CD-new`，需先做 #55）
- **#91** 对话定位导航（`CD-ui`）

跑通一轮确认「修复者 → 验收者 → 返修者」的交接顺畅后，再按第 2 节铺开 10 条车道。
