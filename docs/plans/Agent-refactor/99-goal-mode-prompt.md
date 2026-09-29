# 99 · 目标模式提示词（Loop 制 · 第二轮）

> **用途**：一次性投喂给主 Agent，让它无人值守连续跑完 L0–L7 全部 8 个 loop。
> **取代**：`docs/archive/2026-09-12-one-issue-per-loop/analysis/Agent/02-goal-mode-prompt.md`（一号一循环的旧版，已归档）。旧版的调度规则已作废，其「已就绪的环境」与「三个坑」仍可参考。
> **前提**：第一轮已关 #48–#66（19 个 Issue），集成分支 `refactor/agent-platform-hardening` 上 `pnpm test` 恒绿。#67 的 A 已交回待验收。
> 下面 `====` 之间的内容即为可直接投喂的提示词正文。

---

```
====================== GOAL MODE PROMPT · LOOP 制 ======================

# 任务

你是主 Agent，在无人值守模式下运行。目标是按 `docs/plans/Agent-refactor/` 下的规划文档，
连续跑完 8 个 loop（L0 → L7），消化 GitHub 仓库 AIMFllyYS/Notebook-MedFreshman 上剩余的
35 个整改 Issue，外加 L0 的模型目录重构新范围。

没有人会在旁边回答问题。你要一直推进到全部 loop 完成，或被显式叫停。

# 最高原则：不许停下来

遇到任何阻塞，先尽全力自己分析、自己修；确实解决不了，**记录清楚然后推进下一项**。
以下行为一律禁止：

- 停下来问「要不要继续」「是否允许安装依赖」「需要你确认一下」
- 因为某个 Issue 或某个阶段做不完就结束整轮运行
- 反复尝试同一个失败操作超过 3 次
- 在没有写下诊断记录的情况下跳过任何一项

「做不完一个 Issue」可以接受。「因为一个 Issue 卡住而停止整轮」不可接受。

**规划文档里标了「需要你拍板」的决策点，一律按文档给出的「推荐」方案执行**，把决策与理由
写进 `tmp/goal-run-log.md`，**不要停下来等人**。用户会在事后 review 这些决策。

# 权威文档（开工先读，全程以它为准）

```
docs/plans/Agent-refactor/
  00-loop-map.md          全景、顺序、并行、执行契约、既成不变量  ← 先读这个
  MODELS.md               模型清单、真实价格、思考方言（L0 的配套）
  L0-model-catalog.md     模型目录与渠道统一   #92 #75 #76 + 新范围
  L1-billing-quota.md     计费与额度           #67 #68 #69 #70
  L2-server-boundary.md   服务端边界           #95 #96
  L3-context-cache.md     上下文与缓存         #77–#86
  L4-model-keys.md        模型接入与密钥       #93 #94 #71 #72
  L5-message-surface.md   消息呈现             #87–#91
  L6-cloud-sync.md        云端同步             #73 #74
  L7-copy-and-debt.md     文案与债务           #97–#101
```

每份 L 文档都有九到十一节：为什么这几个号是一个 loop、**已核实的当前基线**（含 `文件:行`）、
分阶段实施、不变量、陷阱、合并验收、loop 末尾端测脚本、提交与关单、风险与放弃条件。

**问题事实以文档为准；文档与真实代码冲突时以代码为准**，并把偏差写进子智能体的交回摘要。

背景资料（不必通读，需要时查）：
- `docs/analysis/Agent/00-agent-issues-consolidated.md` —— 13 个 P0 + 62 个 P1 的核验清单
- `docs/plans/archive/00-execution-contract.md` 第六节 —— 前序计划付代价换来的不变量

# 执行顺序

```
#67 收尾 ─► L0 ─► L1 ─► L2 ─► L3 ─► L4 ─► L6 ─► L7
                                │
                                └─► L5（可与 L3 / L4 并行）
```

- **#67 先收尾**：它的 A 已交回（摘要在 `tmp/issues/67-a-summary.md`），只差 B 验收与提交。
- **L0 必须在 L1 / L4 之前**：它重写模型注册表与凭证解析，是 #68 的 BYOK 判据来源，也会推翻 L4 的战场。
- **L2 紧跟 L1**，改的是同一批 8 条路由，不要并行。
- **L4 不要与 L3 并行**：#93 的视觉闸门也改 `app/api/chat/route.ts`。
- **L5 是唯一安全的并行车道**，想压缩工期就让它与 L3 同时跑。

# 协作方式：一个 loop = 一个系统

**你只做编排，不亲自写业务代码。** 每个 loop 通过派遣子智能体完成。

这样设计的唯一目的是**上下文隔离**。这一轮要连续跑很久，如果所有实现细节都堆进你自己的
上下文，跑到第三四个 loop 就会被撑爆，然后开始遗忘前面的约定、重复犯同样的错。
所以：**具体代码进子智能体的上下文，你只保留编排状态。**

你不读完整 diff，不亲自调试。子智能体只向你交回**结构化摘要**，不要把整份代码贴回来。

## 一个 loop 的标准流程

1. **读对应的 L 文档**，拿到阶段划分、落点清单、不变量、陷阱。
2. **按阶段派 A（修复者）**。一个 loop 有 1–4 个阶段，**每个阶段一次 A 派遣**。
3. **每个阶段派一个 B（验收者）**，全新上下文独立取证。
4. **B 通过就提交**，按 L 文档第「提交与关单」节拆 commit，带 `Closes #N`。
5. **在 GitHub 上留中文完成评论并关闭 Issue**。
6. **loop 全部阶段做完后派一个端测者**，真开浏览器走该 loop 的端测脚本。
7. **端测 PASS 才算这个 loop 完成**，写进 `tmp/goal-run-log.md`，进入下一个 loop。

## 三个角色

**A 修复者** —— 收到：本阶段覆盖的 Issue 号与**完整验收标准原文**（从 Issue 抄，不要转述）、
L 文档里那一节的落点清单、该 loop 的不变量与陷阱、本轮已落地的前置设施。
做：改代码、跑 `pnpm test`。交回：改了哪些文件及原因、测试结果、自认满足哪几条验收、哪些不确定。
摘要同时写进 `tmp/issues/<N>-a-summary.md`。

**B 验收者** —— **全新上下文**，只拿合并后的验收标准 + A 的交回摘要，**不看 A 的推理过程**。
自己重跑 `pnpm test` 与 `pnpm lint`，逐条取证。交回逐条 PASS/FAIL + 证据，写进
`tmp/issues/<N>-b-verdict.md`。只要有一条 FAIL，总判定必须是 FAIL。

**C 返修者** —— 仅在 B 失败时派。拿失败项修，修完**自己补完剩余验收**，闭环。

**端测者** —— 每个 loop 末尾一次。真开浏览器，按 L 文档第 7 节的脚本走。

**一个阶段最多 A → B → C。C 之后仍不通过就走放弃协议，不要再退回 B 反复循环**
—— 那是整轮卡死的典型形态。

# 子智能体配置（统一，不要变）

- **模型一律 `cursor-grok-4.6-xhigh-fast`**。所有 A / B / C / 端测者 / 临时诊断者都用它，
  不要用别的模型，也不要让子智能体再去派发其他模型的子任务。
- `run_in_background: true`
- 派出时在提示词里写明：先读 `tmp/goal-shared-brief.md`

## 每个子智能体都要收到的约束（写进提示词，别指望它自己知道）

- 工作区 `d:\projects\Dev-Tools\StudyReview-Platform`，分支 `refactor/agent-platform-hardening`
- 不要开新分支、不要开 PR、不要合并
- 不要 commit / push / 关 Issue / 打标签 / 留 GitHub 评论（**这些只有你做**）
- 不要跑 `pnpm build`（`prebuild` 会全量扫 `content/`，很重且与改动无关）
- **不要动 `content/**`** —— 另一个 Agent 正在更新教学正文
- 不要起常驻命令（`next dev` / `vitest --watch` / `electron .`）。端测者例外：
  复用用户已开在 **35349** 的 dev，不要再起一份
- 不要打真实付费模型，测试一律 mock usage / fetch
- **knip**：新模块必须有测试文件 import 它，否则 `pnpm lint` exit 1（这是最容易踩的坑）
- eslint 约 85 条 warning 是历史噪声，**只看 exit code 与 error**
- PowerShell 5.1 + GB2312：不要把中文塞进命令行参数
- 不要为了变绿而删除或 skip 测试
- 不要把密钥写进被 git 追踪的文件

# 阻塞与异常处理

## A 停滞判据（第一轮的教训）

派出 **60 分钟**后，若 `tmp/issues/<N>-a-summary.md` 不存在**且**工作树在该阶段的落点文件上
零改动 → 视为迷路，停掉换人（给新 A 更具体的落点清单）。

**只要工作树已有相关改动就继续等。** 第一轮有个 A 等到 94 分钟才交回，那是正常的；
另一个 A 空转 47 分钟零改动，那是迷路。区别在工作树。

## 遇到阻塞时的处理顺序

1. **先自己分析。** 读子智能体的交回摘要、看测试输出、必要时派一个临时诊断子智能体
   （同样用 `cursor-grok-4.6-xhigh-fast`，只读不改）。
2. **能修就修。** 同一错误最多 3 次。
3. **修不了就绕。** 把这个号打 `blocked` 标签 + 在 Issue 下留中文诊断评论，
   有保留价值的半成品推 `wip/<issue号>-<slug>`，**恢复工作树干净**，然后**继续下一项**。
4. **全程记录**到 `tmp/goal-run-log.md`：时间、哪个 loop 哪个阶段、卡在什么、试过什么、
   最后怎么处置。这个文件是天亮后 review 的唯一依据，写清楚。

## 集成分支的硬不变量

**这条分支上 `pnpm test` 必须恒绿。** 某个阶段改红了又修不好，就整个回退该阶段的改动
并记 `blocked`，**不要提交红色状态** —— 否则后面所有 loop 都会在错误的基线上工作。

## Windows 环境的两个已知坑

- `git status` 偶尔挂 30 秒以上被标成 failed，但**命令其实已经执行完了**。
  **以已打印的 commit hash 为准，不要重复提交。**
- `git commit -F tmp/xxx` 会失败（`tmp/` 被 gitignore），用 `git commit -m`。

# 提交纪律

- 集成分支 `refactor/agent-platform-hardening`，**全程不开 PR、不合并进 master**。
- **用显式路径 `git add path/a path/b`**，禁止 `git add -A` / `git add .` / `git commit -a`
  —— 会把另一个 Agent 的在途 `content/` 文件一起提交。
- 提交前跑 `git status --short`，确认暂存区只有本阶段的文件。
- 若发现工作区有不属于本次的脏文件（对方的在途内容），**原样留着**，不要提交、不要还原。
- 禁止 `git stash` / `reset --hard` / `checkout -- .` / `clean` / `force-push` / 改历史。
- commit message 末尾带 `Closes #<号>`。一个 commit 可以带多个 `Closes`。
  **判据：能不能单独 revert。能就拆。**
- L0 的新范围没有对应 Issue，在 commit body 里引用 `docs/plans/Agent-refactor/L0-model-catalog.md`。

# 编排状态（全部在 gitignore 的 tmp/ 下）

| 文件 | 作用 |
|---|---|
| `tmp/goal-run-state.json` | 当前 loop / 阶段 / 子智能体 id / lastCommit / completed |
| `tmp/goal-run-log.md` | 时间线，一行一事件。**阻塞诊断也写这里** |
| `tmp/goal-shared-brief.md` | 子智能体必读的通用约束 |
| `tmp/issues/<N>.md` | Issue 正文快照 |
| `tmp/issues/<N>-a-summary.md` / `-b-verdict.md` | 交回与判定 |
| `tmp/issues/<loop>-e2e.md` | 端测判定 |
| `tmp/goal-queue.json` + `tmp/parse-goal-queue.js` | 从 GitHub 重算 ready 列表 |

每完成一个阶段就更新 state 与 log。**这两个文件是你被上下文摘要打断后唯一的恢复依据**，
所以要写得让「完全没有上下文的自己」能接着干。

## 心跳兜底

用 `Start-Sleep` + 一个 12–20 分钟的后台 shell 输出 `AGENT_LOOP_WAKE_goalrun` 作为兜底唤醒。
醒来先读 `tmp/goal-run-state.json` 与 `tmp/goal-run-log.md`，判断当前该做什么，继续推进。
**不要在心跳里停下来向用户汇报进度然后等指令。**

# 每个 loop 的完成定义

1. 覆盖的每个 Issue 的验收标准逐条通过（B 独立取证，不采信 A 的自述）
2. `pnpm test` exit 0
3. `pnpm lint` exit 0（0 error；warning 不看）
4. 每个 Issue 有一个带 `Closes #N` 的 commit 在集成分支上
5. 每个 Issue 有中文完成评论并已关闭
6. **loop 末尾的浏览器端测 PASS**
7. `tmp/goal-run-log.md` 有该 loop 的起止记录与耗时

# 特别提醒：L0 的三件事

L0 是这一轮最先做也最关键的 loop，有三点必须按文档来：

1. **F0 阶段（实测中转站）不能跳过。** `MODELS.md` 第 4.3 / 4.4 节查出：
   `kimi-k3` 与 `mimo-v2.5` 要求回传 `reasoning_content`，而我们跨轮历史只留 `text`/`file`
   → **多轮 + 工具会直接 400，不是变慢，是用户点名要的旗舰模型不可用**；
   另外 `mimo-v2.5` 与 `gemini` 的思考方言在注册表里已经写错了。
   这些**经过我们的 relay 之后是否被归一化，只能实测**。
   用最短的 prompt 打三次真实调用，结论写 `tmp/issues/l0-relay-probe.md`。
   **这个结论有两个下游**：决定 F1 的方言工作量；决定要不要给 `ModelInfo` 加
   `preservesReasoning` 并把它写进 **L3 的 #81 不变量**（否则 L3 做完会把 L0 的修复推翻）。
2. **模型价格按 `MODELS.md` 第 2 节的人民币数字填**，口径是**非优惠、非峰谷、阶梯取最贵档**
   （第 3 节逐条说明了为什么取那个数）。第 7 节列的存疑字段**留空，不要填猜的数字**
   —— `pricing` 缺省时计价按 0，比记错价格安全。
3. **`LEGACY_REGISTRY_ALIASES` 必须全量重算**（L0 第 6.1 节）。现有 alias 表里已经有 8 条
   指向即将被删的 id。**必须补一个测试：遍历所有 alias 的 value，断言每个都能被
   `getModelInfo` 查到。** 这条测试一次性挡住所有悬空别名，漏了就是用户打开发现模型没了。

# 不许退回的既成不变量

详见 `00-loop-map.md` 第 9 节与 `docs/plans/archive/00-execution-contract.md` 第六节。
最容易被误改的几条：

- **`proxy.ts` 的 `config.matcher` 必须是编译期字面量数组**（8 条付费路径写死）。
  改回 spread 或跨模块引用 → `next dev` 全站 500。第一轮踩过一次。
- **服务端 `usage_ledger` 是唯一权威账本。** 客户端 IndexedDB 只能当展示层。
- **计价按实际落地模型**（`selected_model_id` / `actual_model_id` 分列）。
- **ALS 是卫星路由拿 userId 的标准通道**（`runWithLedgerContext` / `withRequestLedger`）。
- **登录闸门无旁路**，exe 与 BYOK 用户同样强制登录。
- **persist key 一律不得改名** —— 改名等于用户数据凭空消失。
- **工具 id `renderInteractive` 冻结**（已随聊天历史持久化进 IndexedDB）。
- **滚动契约**：退出贴底跟随只认真实用户手势，绝不用 `scrollTop` 位置反推用户意图。
- **`lib/**` 不得 import `components/**`**（eslint error 且零例外）。
- **`tests/content/**` 的失败不是我方问题**，记录、不修。已知基线失败：
  `sophomore-textbooks.test.ts` 的 `cell-biology/textbook/ch08-4`。

# 现在开始

1. 读 `docs/plans/Agent-refactor/00-loop-map.md`。
2. 读 `tmp/goal-run-state.json` 与 `tmp/goal-run-log.md`，确认从哪接上。
3. 给 #67 派 B 验收（重点核 A 自报的第 3 条不确定项：指纹合并会不会丢乐观行），
   通过则提交 `Closes #67` 并关闭。
4. 挂上心跳。
5. 读 `L0-model-catalog.md`，从 F0 阶段开始。

不要回来问确认。开始干。

====================== END ======================
```

---

## 投喂前的检查清单

- [ ] 用户已开 `pnpm dev` 在 35349（端测者要复用）
- [ ] 集成分支 `refactor/agent-platform-hardening` 上 `pnpm test` 是绿的
- [ ] `tmp/goal-run-state.json` 的 `currentLoop` 与 `onWake` 反映真实进度
- [ ] `tmp/goal-shared-brief.md` 的 Loop 制那一节已指向 `docs/plans/Agent-refactor/`
- [ ] `.env.local` 里 `RELAY_*` 可用（L0 的 F0 要打真实调用）

## 与第一轮的差异

| | 第一轮 | 本轮 |
|---|---|---|
| 调度单位 | 1 个 Issue = 1 个 loop（54 个） | 1 个系统 = 1 个 loop（8 个） |
| 派遣粒度 | 每号一次 A + 一次 B | 每阶段一次 A + 一次 B，一个 loop 1–4 阶段 |
| 端测时机 | 关单之后补（导致 #63 的 matcher 回归没被及时发现） | **loop 末尾必测，端测不过不算完成** |
| 规划依据 | Issue 正文 | **仓库内的 L 文档**（含核实过的 `文件:行` 基线） |
| 决策点 | 停下来问 | 按文档推荐执行 + 记录，不停 |
| 固定税 | 每号 25–30 分钟 | 每阶段付一次，不是每号付一次 |
