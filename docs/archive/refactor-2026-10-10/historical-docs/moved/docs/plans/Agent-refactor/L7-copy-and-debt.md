# L7 · 文案、提示词与债务

> **一句话**：把「说的」和「做的」对齐，然后给这一整轮重构留下正确的测试与文档。
> **Issue**：#97 #98 #99 #100 #101（0 个 P0；4 个 P1：#97 #98 #99 #100；1 个 P2：#101）
> **来源 Epic**：E19 #45
> **冲突域**：`CD-tools`（#97 #100）+ `CD-prompt`（#98 #99）+ `CD-docs`（#101）
> **顺序**：**最后一个 loop。** #100 补测试、#101 清文档都必须对着最终状态写，提前做等于做两遍。

## 1. 为什么这 5 个号是一个 loop，而且必须放最后

它们对应审计报告第 6 节归纳的第一条结构性主线：**双源真相到处都是。**

工具说明在 `global.md` 和 `tool.ts` 各写一遍；学年科目表写死一份；配额、导出能力、搜索供应商的**文案**与**实现**分别演进。每次改实现都要人肉记得改另一处——这就是漂移的来源。#97 #98 #99 是三处已经漂移的实例，#100 #101 是「以后别再漂」的两道护栏。

**放最后的三个理由**：

1. **#100（补 execute 单测）要对着最终代码写。** L1–L6 会改动 `imageSearch`（#75/#76）、`searchNotes`（#87）、卫星路由（#95）、工具 schema（#82）。提前补的测试会被推翻两遍。
2. **#101（清过时文档）要描述最终架构。** 现在 `route.ts` 是 265 行且被 ALS 包住，L3 之后还会变。提前写等于再写一次。
3. **#97 的「导出撒谎」有一个决策点**（见 3.1），而决策依赖 L6 是否做了云同步。

反过来，#98 #99 是纯 `CD-prompt` 的小改动，与任何 loop 都不冲突，**随时可以作为空窗期的填充任务插队**。这一点写进第 8 节。

## 2. 当前基线

### 2.1 #97 三处文案与实现不符

| 问题 | 说的 | 做的 |
|---|---|---|
| **配额口径** | `lib/ai/agent/tools/imageSearch/tool.ts:15-16,25-41` 的描述与回灌文本都写「**本次对话**上限 20 张」 | `createToolRuntime()` **每请求新建** → 实际是**单次请求**配额，下一轮清零。模型按错误的预算规划 |
| **导出能力** | `lib/ai/agent/tools/writeDocument/tool.ts:8` 与 `global.md:41` 宣称「导出支持 Markdown / Word / LaTeX / PDF」 | **Markdown 已可用**；`components/chat/DocumentViewer.tsx:45-58` 的 Word 与 PDF 两个按钮是 `// TODO`（title 已写「待实现」） |
| **出题数量** | `lib/ai/prompts/global.md:40` 写「1–6 题」 | `lib/ai/agent/quizTool.ts:49` 的 schema 是 `min(1).max(12)` |

`IMAGE_SEARCH_MAX_TOTAL = 20` 在 `lib/ai/agent/tools/_shared.ts:5`。

### 2.2 #98 InteractiveVenn 生产者 / 消费者错位

`lib/ai/prompts/global.md:139` 教模型写**子节点文本**：

```
<InteractiveVenn>集合A|集合B|交集标签</InteractiveVenn>
```

而 `components/chat/ChatMessageVisualizations.tsx:81-88` 只读 props `a` / `b` / `ab`（经 `toNum` 转数值），**`childrenText` 被完全丢弃**。`VennDiagram.tsx:88-91` 的默认值是 `a = 0.6` / `b = 0.5` / `ab = 0.2`，props 里也没有标签字段，图上固定画「A」「B」。

**结果：模型完全照提示词写，画出来永远是 0.6 / 0.5 / 0.2 这三个默认数字。**

### 2.3 #99 学年科目表写死且缺 4 科

`lib/ai/prompts/global.md:30` 硬编码学年科目表，缺 `SUBJECT_REGISTRY`（`lib/content-data/subjects.registry.ts:53-70`）里已有的：**医学英语、仪器分析、医学统计学、细胞生物学实验**；大一下的「其他」也没写。

讽刺的是 `getOutline` 工具的 description 反而是从 registry **动态**拼的，比 `global.md` 准。

另：`global.md` 的工具清单里**没有 `useSkill`**（它只在 `studyAgent.ts:86-89` 动态拼进去）。

### 2.4 #100 测试缺口

- 13 个工具里**有 2 个有 execute 测试**（Issue 正文说只有 1 个，已过时——#57 给 `getSection` 补了一个）：
  - `lib/ai/agent/tools/getSection/tool.test.ts` —— `createGetSectionTool` + `execute`
  - `lib/ai/agent/tools.searchNotes.test.ts` —— 仅覆盖索引缺失分支

  剩 **11 个**无 execute 测。注意两个容易误判为「已有测试」的：`lib/ai/imageSearch.test.ts` 测的是底层 `searchImages` 不是工具 `execute`；`presentations.test.ts` 只断言 label。卡片的 vitest 也不算。
- `lib/ai/agent/contextBreakdown.ts` 无测试（**L3 的 #85 会补这一条**，L7 不要重复做）
- `followUps` 解析无专测
- `/api/document` 路由无测试
- `imageSearch` 配额累加与 `prepareStep` 摘除无测试
- 步数触顶无测试（**L3 的 #77 会补**）

> 本轮 #48–#66 已经加了不少测试（`usageLedger.test.ts`、`satelliteUsage.test.ts`、`aiGate.test.ts` 等），`pnpm test` 现在是 node:test 103 文件 / 727 通过 + vitest 73 文件 / 278 通过。**开工前先重新统计缺测工具**，不要照抄「12 个」这个数字。

### 2.5 #101 文档漂移

| 文档 | 问题 |
|---|---|
| `docs/analysis/9-9/04-ai-chat-system.md` §1 与 §3–§9 | 仍是 2026-07 快照：734 行 route、`anthropicAdapter`、9 个工具、`MAX_TOOL_TURNS`——生产代码里**都已不存在** |
| `lib/ai/prompts/index.ts:1-3` 注释 | 写「易变上下文放在前缀之后的**消息**里」，现网是并进同一条 system |
| `docs/plans/13-agent-sdk-known-issues.md` | 两项已修，但读起来像待办 |
| `.env.example` / CHANGELOG | 仍有 Bocha、Unsplash Demo 模式、`runImageSearch` 等已不存在的描述 |

> `.env.example` 的 Bocha / Demo 两条由 **L1 的 #76** 处理，L7 不要重复。

## 3. 分阶段实施（单阶段 D，可按需拆）

### 3.1 #97 文案对齐（含一个决策点）

- **配额**：把「本次对话」改成「本次回答」/「单次请求」。同时考虑要不要把配额真的改成会话级——**不要**，`createToolRuntime()` 每请求新建是刻意设计（工具无副作用化），改文案就好。
- **出题数量**：`global.md:40` 改成与 schema 一致的 1–12。改提示词，不要改 schema（12 是实际能力）。
- **导出能力**——这里有个决策点：

| 选项 | 代价 |
|---|---|
| A. 改文案，只承诺 Markdown | **几乎零成本**——Markdown 导出已经能用了，只要删掉 Word / LaTeX / PDF 的承诺、并把那两个 TODO 按钮移除或置灰 |
| B. 把导出补上 | Word / LaTeX / PDF 要引三个库，包体积和维护面都不小 |

  **默认走 A**。理由：L1–L6 已经让产品表面欠了很多账，此时给查看器加三种导出格式是扩大范围；而 Markdown 这一条本来就是真的，改文案后描述即准确。若用户明确要 B，那应该是一个独立 Issue，不属于「债务收口」。这个决策要在交回摘要里写清选了哪个。

### 3.2 #98 InteractiveVenn（也有决策点）

| 选项 | 说明 |
|---|---|
| A. 改提示词教 props 写法 | `<InteractiveVenn a={30} b={25} ab={10} />`。改一行提示词，组件不动 |
| B. 让组件读 children | 要改 `ChatMessageVisualizations.tsx` 的解析 + `VennDiagram` 加标签 props |

**推荐 B 或 A+B**。理由：提示词里写「集合A\|集合B\|交集标签」这种**带标签**的形式对教学场景更有用（韦恩图上画「A」「B」没有信息量）。但 B 的成本更高。

**最小可行**：先做 A（立刻止血，让模型写出来的图至少数值正确），再把「图上显示自定义标签」作为可选增强。验收标准原文是「按提示词写出的韦恩图能正确渲染出预期的集合与标签」——注意它要求了**标签**，所以纯 A 不满足验收。做 A+B：提示词改成 props 写法且支持标签 props，组件读标签 props。

### 3.3 #99 科目表

- 不要再硬编码。照 `getOutline` 的做法从 `SUBJECT_REGISTRY` 动态拼。
- 如果 `global.md` 是静态 md 文件不便动态插值，就在 `lib/ai/prompts/index.ts` 组装时替换一个占位符。
- 补上 `useSkill` 到工具清单（或明确说明它是动态注入的）。
- **验收标准里有一条容易漏**：「新增科目时不需要手工改提示词（**或有检查能发现不同步**）」。如果做不到动态，就写一个测试断言 `global.md` 里的科目集合 ⊇ registry 的科目集合——这样以后加科目会红。**后者更简单也更稳，推荐直接做测试**。

### 3.4 #100 补测试

1. **先重新统计**当前缺 execute 测试的工具（2.4 的注）。
2. 重点覆盖容易出错的分支，而不是追求覆盖率数字：学年过滤、路径解析、配额累加、`contextKey` 去重。
3. `imageSearch` 配额累加（`imageSearchFetchedCount` 在 execute **之后**才涨，同一步并行多次可超 20——这是 P1-6，本身没有 Issue，测试会把它暴露出来。暴露了就在交回摘要里记一笔，**不要顺手改行为**，那属于范围外）。
4. `prepareStep` 摘除 `getCurrentPage` 的行为。
5. `/api/document` 路由测试。
6. 不要为了凑数写「调用一次不报错」这种空测试。

### 3.5 #101 文档

1. `docs/analysis/9-9/04-ai-chat-system.md`：过时段落**标注**（加一个明确的「本节为 2026-07 快照，已过时，权威见 X」）比重写便宜也更诚实。只重写值得重写的部分。
2. `lib/ai/prompts/index.ts:1-3` 注释改成与现网一致。**注意**：如果 L3 的 #78/#82 已经调整了 system 组装方式，按调整后的写。
3. `docs/plans/13-agent-sdk-known-issues.md`：把已修项标 ✅ 并注明 commit。
4. **本轮新增的权威文档要挂上索引**：`docs/plans/Agent-refactor/00-loop-map.md` 应该成为「这一轮做了什么」的入口，并在 `docs/analysis/Agent/01-goal-mode-runbook.md` 顶部注明其调度规则已被 loop 制取代。
5. `docs/plans/archive/00-execution-contract.md` 第六节的不变量清单要补上本轮新增的几条（proxy matcher 字面量、服务端台账权威、ALS 通道、登录闸门无旁路）——`00-loop-map.md` 第 8 节已经写了一份，#101 把它并进执行契约。

## 4. 不变量

- **`content/**` 绝对不动。** 另一个 Agent 正在更新教学正文。#99 只改 `lib/ai/prompts/**` 和 `lib/content-data/subjects.registry.ts`（如果只读就更好），不碰 `content/`。
- **`tests/content/**` 的失败不是我方问题。** 那些断言的是另一个 Agent 正在产出的内容。记录、不修；严禁通过改 `content/**` 或放宽断言来「修复」。已知基线失败：`tests/content/sophomore-textbooks.test.ts` 的 `cell-biology/textbook/ch08-4 有图题但没有任何图片引用`。
- **`renderInteractive` 工具 id 冻结。** UI 文案统一叫「HTML 演示」，但 id 已随聊天历史持久化。
- **不要为了让测试通过而删除或 skip 测试。** 确需调整断言的必须在交回摘要里单列并说明理由。
- **`normalizeDirectiveLabels` 的 `KNOWN_ATTRS` 必须与 `remarkDirectives.ts` 读取的 `attrs.*` 同步**（当前 29 个）。#98 若给 Venn 加属性，**必须同步这个白名单**，否则该属性会被当成标题正文静默吞掉且不报错。这条是计划 24 付代价换来的，见执行契约第六节。
- **指令 registry 的环已断，不要接回去。** `QuizMarkdownBase` 不得 import `components/shared/directives/registry`；`MemoryCard` 不得改回 import `QuizMarkdown`。护栏是 `registry.evaluation-order.test.tsx`，不要削弱它。

## 5. 陷阱

1. **#98 加 props 要同步 `KNOWN_ATTRS`**（不变量第 5 条）。这是本 loop 最容易静默出错的一处。
2. **#99 的「动态拼」可能与 #82（稳住 prefix cache）冲突**——动态插入科目名正是 L3 列出的 bust 源之一。L7 在 L3 之后做，所以要**先看 L3 怎么处理了 `getOutline` 的动态 description**，与之保持一致。如果 L3 决定把动态描述改成静态，#99 也应该走「静态 + 同步测试」而不是「动态插值」。
3. **#100 不要重复 L3 做过的测试**：`contextBreakdown` 单测归 #85，步数触顶归 #77。
4. **#97 的导出决策不要偷偷扩大范围**。选 A 就删承诺，别顺手引 3 个库。
5. **#101 的「标注过时」比「重写」更值得做**。重写一份会立刻又过时的文档是负收益。
6. **knip**：#100 新增的测试文件本身就是 import 方，不会触发 knip；但如果为测试抽了 helper，helper 要被 import。
7. 不要跑 `pnpm build`；不要起 `next dev`。

## 6. 合并验收

**文案（#97）**
- [ ] `imageSearch` 配额文案与实际作用域一致（单次请求，不是本次对话）
- [ ] 导出能力的描述与实现一致（选 A 则不再承诺 Word / LaTeX / PDF）
- [ ] 出题数量在提示词与 schema 之间一致

**提示词（#98 #99）**
- [ ] 按提示词写出的韦恩图能正确渲染出预期的集合与标签
- [ ] 提示词中的科目覆盖 registry 中的全部科目（含医学英语 / 仪器分析 / 医学统计学 / 细胞生物学实验 / 大一下「其他」）
- [ ] 新增科目时不需要手工改提示词，或有检查能发现不同步
- [ ] `useSkill` 出现在工具清单里，或明确说明其动态注入

**测试（#100）**
- [ ] 11 个缺测工具补上 execute 测试（`getSection` 与 `searchNotes` 已有；开工时再核一遍，L0–L6 可能又加了几个）
- [ ] `imageSearch` 配额行为有测试
- [ ] `/api/document` 路由有测试
- [ ] `prepareStep` 摘除行为有测试

**文档（#101）**
- [ ] 过时文档有明确标注或已重写
- [ ] 注释与现网实现一致
- [ ] `01-goal-mode-runbook.md` 顶部注明调度规则已被 loop 制取代
- [ ] 本轮新增的不变量已并入 `docs/plans/archive/00-execution-contract.md`

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0
- [ ] `tests/content/**` 的既有失败不因本 loop 增加

## 7. Loop 末尾端测脚本

本 loop 大部分改动是文案与测试，端测轻量：

1. 设置面板 → 工具说明里 `imageSearch` 的配额口径正确、搜索供应商是智谱（L1 已改，这里回归检查）。
2. 让 AI 画一个韦恩图（按新提示词）→ 图上出现预期的集合数值**与标签**，不是默认值。
3. 让 AI 出题 → 能出到 7 题以上不报错（验证提示词与 schema 一致）。
4. 问一个涉及「医学英语」或「细胞生物学实验」的问题 → 模型知道这门课存在。
5. 生成一篇文档 → 导出按钮的行为与文案一致（选 A 则只有 Markdown，且它真的能用）。
6. 控制台无报错。

端测者交回 `tmp/issues/debt-l7-e2e.md`。

## 8. 提交与关单

| commit | Closes |
|---|---|
| `docs(prompt): sync the subject table with the registry` | #99 |
| `fix(prompt): align InteractiveVenn with its renderer` | #98 |
| `docs(tools): match tool copy to actual behavior` | #97 |
| `test(tools): cover tool execute branches` | #100 |
| `docs: mark stale architecture notes and record new invariants` | #101 |

**#98 与 #99 是空窗填充任务。** 它们是纯 `CD-prompt`、无依赖、改动面小（#99 还带 `good first vibe` 标签）。如果在 L1–L6 的任何阶段出现「A 在跑、主 Agent 空闲、想并行一条车道」的情况，可以提前把这两个号单独派出去——它们不与任何 loop 抢文件。提前做的话要在 L7 开工时把它们从清单里划掉。

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| #98 加属性忘了同步 `KNOWN_ATTRS`，属性被静默吞掉且不报错 | 不变量第 5 条。必须补一条 `normalizeDirectiveLabels.test.ts` 用例 |
| #100 为凑数写空测试，给后人错误的安全感 | 验收看「覆盖了哪些分支」，不看数量。B 要抽查测试内容 |
| #101 重写文档后又立刻过时 | 优先标注而非重写 |
| #97 的导出选 B 导致范围爆炸 | 默认 A。选 B 必须先回来问 |
| #99 与 L3 的 #82 决策冲突 | 陷阱 2。先读 L3 的交回摘要 |

**整个 L7 都是可放弃的**——5 个号里没有 P0，全部是一致性与可维护性。如果时间耗尽：

- 保住 **#99**（最便宜，且「模型不知道有这门课」是用户可感知的）
- 保住 **#101** 里「注明 runbook 已被取代」那一条（否则下次接手的人会按旧调度规则再切 54 个 loop，这一轮重排的成果就丢了）
- #100 可以只补最关键的几个工具，剩下打 `blocked` 留作后续
- #97 #98 可以整个推后
