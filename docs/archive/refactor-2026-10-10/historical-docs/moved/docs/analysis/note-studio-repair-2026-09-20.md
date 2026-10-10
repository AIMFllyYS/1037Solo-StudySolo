# 笔记板块（Studio Notes）修复 · 落地记录

> 分支：`fix/note-studio-agent-consent`（从 `dev` = `19d027b6` 切出）
> 基线诊断：[`note-agent-editor-repair-handoff-2026-09-19.md`](./note-agent-editor-repair-handoff-2026-09-19.md)
> 日期：2026-09-20

本文件记录**实际改了什么、为什么这么改、哪些还没做**。诊断结论以交接报告为准，此处只写落地增量与偏差。

---

## 0. 交接报告结论的复核结果

报告写于 `3445f3c8`，本轮从 `19d027b6` 起。逐条复核后：**报告的判断全部仍然成立**，期间 6 个提交（右栏统一、项目文件、composer chip）没有触及笔记写入链路。

补充发现两处报告未提的问题，已一并修掉：

| 编号 | 问题 | 证据 |
|---|---|---|
| **A** | `editingUserNote` 的「不必等学生再点一次」**在主对话也生效**，不只是窗内 | `openUserNote.ts` 的 `citeUserNoteToMainAgent` 会设置 `agentEditingNoteId` → `useChat.ts` 把它塞进请求体，而主对话 `noteWindowAgent=false` |
| **B** | 窗内**追问兜底**没有笔记场景判断：即使禁止 `<FollowUp>`，服务端仍会塞 3 个教学式追问 | `app/api/chat/route.ts` 的 `generateFallbackFollowUps` 调用点只判了 `automaticModels` |

---

## 1. 阶段一：笔记写入同意链路（已完成）

### 1.1 核心改动：工具产出候选稿，不再「已完成」

`updateUserNote` 的返回类型从「`applied: boolean`」改成一份**候选稿**：

```ts
interface UpdateUserNoteOutput {
  proposalId: string;      // 幂等键 = toolCallId
  ok: boolean;             // 服务端是否产出了可确认的候选稿
  noteId: string;
  markdown: string;
  title?: string;
  action: "update" | "delete";
  sourceComplete: boolean; // 模型读到的正文是否完整
  baseDigest: string;      // 草稿依据的正文指纹
  summary: string;         // 确认卡上的一句话说明
}
```

旧的 `applied` 语义被彻底删除——它既不表示用户同意，也不表示已落盘，是最容易误导后续 Agent 的字段。

### 1.2 写入路径收口到唯一入口

- 删掉 `components/notes/UserNoteLayer.tsx` 里「遍历所有会话消息 → 自动 apply」的 effect，换成**只登记候选稿**（`collectNoteChangeProposals`，纯只读）。
- 删除 `lib/notes/applyUserNoteAgent.ts`（含模块级内存幂等集合 `appliedToolCallIds`），`selectEditingUserNote` 迁到 `lib/notes/selectEditingNote.ts`。
- 唯一写入点在 `lib/stores/noteChangeProposals.ts` 的 `approve(id)`。

**结构性保证**：只要不调用 `useUserNotes` 的 `createNote/updateNote/removeNote`，就不可能落盘、不可能进 `dirtyEditorIds`、也不可能排队云同步——`notifyUserNoteChanged` 只在这三个方法内部被调用。**未同意不落盘 / 不同步不是靠约定，是靠调用面收敛。**

### 1.3 版本校验用「正文指纹」而不是 `updatedAt`

`updatedAt` 是毫秒时间戳，候选稿生成与用户手动保存落在同一毫秒时校验会**静默失效**（写测试时真实踩到：`create` 之后立刻 `updateNote`，`updatedAt` 相同，stale 判定没拦住）。

改为 `markdownDigest()`（FNV-1a 32 位 + 长度）对**模型真正读到的那段正文**取指纹：

| 场景 | 指纹来源 |
|---|---|
| 窗内对话 / 主对话引用笔记 | 客户端送来的全文，服务端现算 |
| 主对话按目录 id 改稿 | `collectUserNoteCatalog` 在客户端按该笔记正文算好，随目录上行 |

点「同意」时比对当前 `note.markdown` 的指纹，不等就拒绝写入并说明原因。

### 1.4 三类拒绝

| 状态 | 触发 | 用户看到 |
|---|---|---|
| `stale` | 目标已不存在 | 笔记已经不存在了 |
| `stale` | 正文指纹变了（用户中途自己改过） | 笔记已被改过，已阻止写入，可让助手重新整理 |
| `blocked` | `sourceComplete === false` | 原文过长只读到一部分，整篇替换会丢结尾 |

最后一条直接落实交接报告 §4 的「截断后整篇覆盖」：`editingUserNote` 的 8000 字截断与目录的 6000 字截断都打上 `truncated` 标记，**拒绝对截断快照做整篇替换**。

### 1.5 幂等：三层

1. **按钮**：已应用/已取消的候选稿直接短路，不重复执行。
2. **持久化账本**：`appliedIds` / `dismissedIds` 落到 IndexedDB（`note-change-proposals`），**刷新页面后仍然生效**——这是现有 memoryInbox 那套（全内存）的已知弱点，这里没有沿用。
3. **版本指纹**：即便账本丢了，正文变过也会被 stale 拦住。

历史重放（重新加载会话扫到旧的 `applied:true` 消息）**不会执行任何写入**：旧消息没有 `ok/summary/proposalId`，`isUsableOutput` 直接返回 false，连卡片都不渲染。

### 1.6 确认卡

新增 `components/notes/NoteChangeConsentCard.tsx`，作为 `updateUserNote` 的结果卡注册进 `components/chat/toolCards/registry.tsx`：

- 从 `THREAD_SILENT_TOOLS` 移除 `updateUserNote`，追加到 `RESULT_CARD_ORDER` 末尾（不重排已有项）。
- 卡片显示操作类型、目标标题、一句话说明；「查看改动」展开逐行前后对照（掐掉公共前后缀，中间即改动区间）。
- 按钮是「同意修改 / 确认删除」与「取消」——**没有权限模式、没有「以后都同意」**。
- 待确认期间不改原文、标题、更新时间，也不触发云同步；关闭卡片按取消处理。

主对话与窗内对话都走同一条链路：卡片长在发起操作的那个会话里。

---

## 2. 阶段二：独立笔记系统提示词（已完成）

### 2.1 抽取共享的正确性规范

新增 `lib/ai/prompts/correctness.md`，把 `global.md` 的「公式与排版规范」与「防幻觉与引用纪律」两节抽出来，**教学 Agent 与笔记 Agent 共用同一份**，避免正确性规范出现两份真相。

### 2.2 新增笔记角色前缀

- 新增 `lib/ai/prompts/note-agent.md`：角色、笔记体例（关键词/核心概念/短列表/必要对照表）、禁止写进笔记的内容（对话开场、思考过程、工具说明、教学追问、**不输出 `<FollowUp>`**）、改稿纪律（只动指定范围、只产出候选稿、截断不得整篇替换）、与教学场景的边界、事实纪律。
- `lib/ai/prompts/index.ts` 新增 `buildNoteSystemPrompt(ctx)`，由 `studyAgent.ts` 按 `noteWindowAgent` 分支选用。
- **不拼 `subjects/<id>.md`**：那 8 份是「讲解策略」，本体是教学口吻（引导式提问、`:::definition` 体例），拼进来等于把教学人格从后门带回去。笔记只需要知道当前是哪一科。

代价：笔记角色与教学角色各自一条 prefix cache 线，不再互相命中。这是交接报告 §5 已明确接受的取舍。

### 2.3 删掉鼓励自动改稿的指令

`lib/notes/editingUserNote.ts` 的原文：

> 先正常输出分析与讲解；再自行判断哪些要点值得写进这篇笔记。该整理就调用 updateUserNote 写回，**不必等学生再点一次**。

替换为「产出候选稿 → 学生点同意后才写入 → 未同意不得声称已保存/修改/删除」，并在正文被截断时显式加一条「不得据此整篇替换」。

同一句在主对话也生效（发现 A），所以这一处改完两个入口都干净了。

### 2.4 窗内不再注入教学式追问（发现 B）

`app/api/chat/route.ts` 的 FollowUp 兜底加 `!body.noteWindowAgent`：笔记窗口的产出是笔记候选稿，教学式追问属于聊天套话。

### 2.5 注释与实现对齐

`updateUserNote` 的注释、`tools/server.ts` 的 `editingUserNote` 注释、`memoryCatalog` 的目录提示行原文都声称「只有打开的笔记才暴露 / 才改」，而实现允许主对话按目录 id 改任意一篇。**注释改为陈述真实行为**：两个入口都能产出候选稿，但写入一律要用户同意。

---

## 3. 阶段三：编辑器外部更新同步（已完成，MVP）

### 3.1 问题

`MilkdownNoteEditor` 只在挂载时读 `defaultValue`，effect 依赖 `[]`；唯一的刷新手段是父组件换 `key` 重挂，而自动重挂此前**只由 `NoteAgentPanel` 的 `isLoading` 边沿驱动**。

写入时机从「流式过程中」搬到「用户点同意」（此时 `isLoading` 早已是 false）之后，这条驱动链就断了——**同意后编辑器会一直显示旧正文**。

### 3.2 改法

`UserNoteEditorWindow` / `ClassroomNoteWindow` 各加一个 `lastEmitted` ref：

```tsx
const handleMarkdown = (markdown) => { lastEmitted.current = markdown; updateNote(noteId, { markdown }); };

useEffect(() => {
  if (noteMarkdown === lastEmitted.current) return;   // 用户自己打字：不重挂，不丢光标
  lastEmitted.current = noteMarkdown;
  refreshWysiwyg();                                    // 外部写入：重挂以显示新稿
}, [noteMarkdown]);
```

这区分了「用户自己打字」与「外部写入」，前者零重挂。

**没有选 `replaceAll` 的原因**：项目只直接依赖 `@milkdown/crepe`，`@milkdown/kit/*` 与 `@milkdown/preset-commonmark` 都解析不到；装 kit 会引入第二份 `@milkdown/core`，两份 core 的 slice 身份不相等，`ctx.get` 会直接抛 `contextNotFound`。零依赖路线（slice 字符串名 + `commands.call`）留给工具栏用（见 4.3），整篇替换这一阶段先走重挂。

**已知代价**：重挂会丢光标位置与撤销历史、滚动回顶部。只在外部写入时发生，可接受；后续若要做无感替换，需要先解决 kit 依赖或引入受控的 `editorViewCtx` 事务。

---

## 4. 阶段四：标题层级与格式工具栏（已完成主体）

### 4.1 根因

Crepe 出厂 `reset.css` 给的是 h1 2.625em / h2 2.25em / **h3 2em / h4 1.75em / h5 1.5em**，项目只压了 h1(1.45em) h2(1.22em)。14.5px 基准下：

| 级别 | 修复前 | 修复后 |
|---|---|---|
| h1 | 21.0px | **24.0px** |
| h2 | 17.7px | **20.5px** |
| h3 | **29.0px** ← 全篇最大 | **18.1px** |
| h4 | 25.4px | 16.2px |
| h5 | 21.8px | 15.2px |
| h6 | 16.3px | 14.4px |

### 4.2 改法：笔记作用域令牌

在 `app/styles/chat-tools.css` 内新增 `--note-h1`…`--note-h6` / `--note-heading-lh` / `--note-heading-weight`，**编辑侧（`.user-note-crepe .milkdown .ProseMirror hN`）与分栏预览侧（`.user-note-preview.prose-notes hN`）共用同一组令牌**，编辑与预览层级一致。

三点约束：

1. **用 rem 不用 em**：编辑器基准 14.5px、预览基准 16px，em 会让两边各算各的。
2. **绝不动 `prose.css` 的 `.prose-notes` 裸选择器**：那是全站教材（10 个渲染点）共用的容器，直接改会把概率论/有机化学/近现代史等教材标题一起缩小。预览侧一律带 `.user-note-preview` 前缀（特异性 (0,2,1) > (0,1,1)）。
3. 便签（`.classroom-note` / `.is-compact`）基准是 13px，阶梯收紧一档。

顺带把字重（Crepe 出厂 400 vs 预览 680）与行高拉平，并给编辑侧补 `overflow-wrap: anywhere`。

新增回归测试：H1–H6 六个层级都必须落在令牌上、令牌必须单调递减、`prose.css` 不得出现 `user-note-preview`。

### 4.3 划词工具栏补标题层级

`featureConfigs[Crepe.Feature.Toolbar].buildToolbar` 追加一组「标题」：H1 / H2 / H3 / 正文，`onRun` 执行 `commands.call("WrapInHeading", level)`。

走 **slice 字符串名**而不是 `import { wrapInHeadingCommand }`：见 3.2 的依赖约束。三处防御：`try/catch` 静默降级、`active` 判定失败不影响编辑、命令名集中在一处便于将来替换。

同时把出厂 32×32 / 约 285px 宽、不换行的工具栏在笔记作用域内收窄（28×28，便签 26×26），避免便签窗（minW 280）挤爆。

### 4.4 任意字号：**未实现，且不应被描述为已实现**

CommonMark 只有标题层级，没有通用局部字号语法。要做到「重开、切源码、预览、导出后字号仍保留」，必须自定义 mark 与序列化，并确认 Milkdown 解析 / Markdown 源码往返 / ReactMarkdown 渲染 / 消毒白名单 / 导出全部保留——这是独立一轮工作，本分支没有做。

当前提供的是：**标题层级（H1–H6，真实语义、可往返）+ 编辑器标题阶梯**。它们在体验上覆盖大部分「字号」诉求，但不是任意字号。

---

## 5. 验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | **0 error** |
| `node scripts/run-unit-tests.mjs --filter=code` | **1402 pass / 0 fail** |
| `npx vitest run` | **150 files / 585 tests pass** |
| `npx eslint .` | 0 error（90 warning 均为既有） |
| `npx knip` | 与改动前基线**逐项相同**（3 unused files / 14 exports / 1 type，全部既有） |
| `check-content-encoding` / `check-katex-chars` / `check-prose-svg-rules` / `check-registry-consistency` / `check-secrets` | 全部 exit 0 |

新增/重写的测试覆盖了交接报告点名的关键场景：

- 未同意时 store、持久化、同步队列均无变更（`noteChangeProposals.test.ts`）
- 重复点击、刷新后重放、历史重放只应用一次
- 取消、目标已删除、版本冲突、截断快照四种拒绝路径
- 两个会话处理不同笔记不串单
- 笔记前缀与教学前缀不相等且各自稳定；笔记前缀含 KaTeX/防幻觉、不含教学法
- H1–H6 全覆盖、令牌单调递减、样式不泄漏到教材容器
- 工具输出文案表达「等同意」而不是「已写回」

**端测补充（2026-09-20）**：真人端测当场抓到一处自动化测不到的问题——确认卡组件写完但**一条 CSS 都没加**，卡片在页面上退回成裸文本（「同意修改取消」挤成一行）。自动化测试全绿也不能发现它，因为缺的是「类名与样式是否成对」这件事本身。已补齐 `.note-consent` 全套样式，并新增 `tests/noteConsentCardStyles.test.ts` 静态守卫：扫描卡片用到的每个 `note-consent` 类名，要求 `chat-tools.css` 里存在对应规则。

同轮还修掉两处端测可见问题：卡片标题两句同义话叠加（「请求修改这篇笔记」+「修改笔记「X」」），以及窗内笔记对话仍会渲染「你可能还想问」——上一轮只在服务端拦掉兜底追问，模型自己吐 `<FollowUp>` 时前端照样渲染，现改为 `ChatThread` / `ChatMessage` 的 `showFollowUps` 确定性抑制。

**仍未执行**：真实模型风格评测、实际云同步联调、真机窄窗溢出检查、触屏选区验证。

---

## 6. 未在本轮做的，以及为什么

本节每条都经过"是不是真问题 / 该不该现在做"的复核，结论与处置一并写明。**不要只看标题就复述成缺陷**——第 3、4 条经复核都不是活 bug。

1. **任意局部字号**（见 4.4）→ **已挂 issue [#132](https://github.com/AIMFllyYS/Notebook-MedFreshman/issues/132)**（P2 / enhancement / area:ui）。
   是真需求（交接报告 §6 明确列为待交付），但**不是回归**：它是从未存在的能力。要动 `lib/markdown/sanitizeSchema.ts` 的**安全白名单**，且编辑器侧缺少可用的 mark 依赖 → 典型的该单独排期。
2. **无感外部替换**（见 3.2）→ **已挂 issue [#133](https://github.com/AIMFllyYS/Notebook-MedFreshman/issues/133)**（P3 / enhancement / area:ui）。
   是真体验问题，但影响面比直觉小：触发时机是"用户刚点完同意"或"云端回灌"，此时用户并不在编辑器里打字；当前重挂**数据正确**，丢的是光标/滚动/撤销上下文。
3. **`memoryInbox.ingestCommit` 的"串单风险"——复核后确认不可达，不是活 bug。**
   交接报告 §3 与首轮子智能体都把它描述成「并发整理两篇笔记会串单」，本文件上一版也照抄了这个结论。**自读代码复核后更正：这条路径走不通。**
   - `shouldAcceptProposal`（`lib/memory/memoryLoop.ts:89-96`）+ `liveKinds`（`lib/stores/memoryInbox.ts:57-62`）保证**全局同时只有一个 `committing` 的同 kind 提议**（live 含 proposed 与 committing），所以 `ingestCommit` 里 `find(status==="committing" && kind===…)` 必然唯一命中自己。
   - `ingestCommit` 只有两个调用点：`memoryInbox.ts:155`（`startMemoryCommit`，紧邻的 `:135` 已断言同一个 id 是 `committing` 且中间无 await）；`memoryInbox.ts:341`（`syncMemoryInboxFromSessions`，要命中需线程里存在 `commitNotes` 的 tool part，但旁路是 `persistToThread: false`，`commitMessage` 只被 `MemoryProposalCloud` 读取展示、从不写进 `chatHistory.messagesById`）。
   - 「取消 A 后再开 B，A 的迟到响应落到 B」被 `:135` 的 `status !== "committing"` 早退挡住（`dismiss` 会把状态置为 `dismissed`）。

   因此它是**潜在耦合**（正确性依赖另一个模块维护的不变量），不是可达缺陷。若要硬化，成本是给 `ingestCommit` 多传一个 proposal id，约 2 行。**把它当 P0 会误导排期**——它现在是一条 P3/needs-decision 的耦合硬化，见 **issue [#134](https://github.com/AIMFllyYS/Notebook-MedFreshman/issues/134)**。
4. **新建笔记的授权时点：决定不做，也决定不建 issue。**
   交接报告 §3 给的选项是"收口为『候选稿 → 一次确认 → 保存』**或**明确保留原先『同意整理并保存』的授权语义"。本轮核实后确认**保留原语义**：
   - 现有流程 `proposeMemory → 通知云「整理成笔记？」→ 点「整理」→ 生成正文 → 保存` **只有一次授权**，不存在"叠两次相同确认"。
   - 与改稿路径的差别只是授权发生在**生成之前**（用户批准"整理这件事"，看不到正文）。
   - 新建**不覆盖任何既有内容**，风险远低于改稿——改稿会覆盖用户已写的正文，所以必须看草稿；新建没有这个前提。
   - 事后用户可随意编辑，笔记会直接打开编辑器。
   若将来要统一两边的授权粒度，那是**产品体验决策**（让新建也多一步看草稿），不是修 bug，需要单独立项。
5. **条目滚动历史中的旧卡片**：刷新后滚到历史消息仍会渲染确认卡（可点、但有版本指纹与持久化账本双重保护）。是否需要隐藏历史卡，取决于产品对「历史记录」的期望。
6. 各学科 `subjects/*.md` 中的教学体例未做笔记场景精选（当前做法是整份不拼）。
