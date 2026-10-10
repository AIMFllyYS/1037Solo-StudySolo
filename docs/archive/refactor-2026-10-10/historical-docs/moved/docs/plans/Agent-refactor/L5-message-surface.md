# L5 · 消息呈现

> **一句话**：让一条助手消息如实呈现它真正发生过的事——来源合并成一块、中间讲解不再被折叠、能跳回任意一次提问。
> **Issue**：#87 #88 #89 #90 #91（0 个 P0；2 个 P1 + 3 个 P2）
> **来源 Epic**：E16 #42 + E17 #43 + E18 #44
> **冲突域**：`CD-chatmsg`（#87–#90）+ `CD-ui`（#91）
> **顺序**：**可与 L3 并行**。文件与 L3 不相交（都在 `components/chat/` 下但不是同一批）。这是压缩总工期最现实的一条并行车道。

## 1. 为什么这 5 个号是一个 loop

它们全部回答同一个问题：**一条助手消息里发生过的事，用户看到了多少。**

- #87 #88：来源看到的是「4 张各 5 条的卡」，而不是「实际搜到的 N 条」
- #89 #90：中间那几段讲解被折进 Trace，只有最后一段算答案
- #91：想回看第三次提问，只能手动滚

共享同一批文件与同一套数据模型（`message.parts` 的时序、`ToolPart` 的 `output-available`、`buildTrace` / `getAnswerText` 的边界）：

```
components/chat/ChatMessage.tsx           components/chat/toolCards/registry.tsx
components/chat/toolCards/ToolResultCards.tsx   components/chat/AgentTrace.tsx
components/chat/ChatThread.tsx            components/chat/WebSourceFold.tsx
lib/chat/messageParts.ts                  lib/chat/buildTrace.ts
lib/chat/traceSources.ts                  lib/chat/resolveFollowUps.ts
```

而且它们有真实的内部依赖：#88（收敛重复表面）要在 #87（合并成一块）之后才有意义；#89（交错渲染）改的是 `getAnswerText` 的边界，#90（统一 think 处理）是同一个函数的另一半。拆开做等于把同一个函数改四遍。

## 2. 当前基线（已实地核实）

### 2.1 「一次调用一张卡」的真因（#87）

不是分页，是**去重 key 缺失**。

```59:67:components/chat/toolCards/registry.tsx
export const RESULT_CARD_ORDER = [
  "searchNotes",
  "webSearch",
  "renderInteractive",
  "generateImage",
  "createQuiz",
  "searchNoteImages",
  "writeDocument",
] as const satisfies readonly StudyToolName[];
```

7 个有卡片的工具里，只有 4 个声明了 `resultKey`：`renderInteractive`（第 39 行，用 `artifactId`）、`generateImage`（44，`imageGenId`）、`createQuiz`（49，`quizId`）、`writeDocument`（53，`documentId`）。

**`searchNotes`、`webSearch`、`searchNoteImages` 三个都没有 `resultKey`**（Issue 正文只点了前两个）。而去重函数对空 key 一律放行：

```8:17:components/chat/toolCards/ToolResultCards.tsx
function dedupBy<T>(keyFn: (item: T) => string | null) {
  const seen = new Set<string>();
  return (item: T) => {
    const key = keyFn(item);
    if (!key) return true;        // ← 空 key 全部放行
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
```

于是 AI 检索 4 次 = 4 张卡。每张卡再各自被截短：`searchNotes` 把 `hits.slice(0, 5)` 给 UI 而**模型 text 里最多 8 条**；`webSearch` 默认 `numResults = 5`。CSS `.agent-fold-list { max-height: 8.25rem }` 让它看起来像固定 4–5 行。

**现成样板就在同一个文件里**——`imageSearch` 已经是「所有调用 flatMap 合成一张画廊」的写法：

```62:67:components/chat/ChatMessage.tsx
  const imageSearchSources = useMemo(() => {
    // ...
    return getToolPartsByName({ parts }, 'imageSearch').flatMap((part) =>
```

顺带注意：这一处也说明**执行契约里「`ChatMessage.tsx` 不得再出现工具名字面量（已清零）」这条其实没有保住**——`imageSearch` 被特例在 registry 之外。#87 合并来源时如果照抄这个写法，会再增加一处字面量。**正确做法是把「多调用合并」做成 registry 的一种能力**（例如加一个 `aggregate` 声明），而不是在 `ChatMessage.tsx` 里再写一个 `if`。这样 #87 顺带把 P1-68 也解决了。

### 2.2 实际是 **7 处**气泡内渲染 + 2 个浮窗，不是 Issue 正文说的 6 个（#88）

| # | 文案 | 组件 | 触发 | 去重 |
|---|---|---|---|---|
| 1 | 「联网来源 · N 条」 | `WebSearchResultCard` → `WebSourceFold` | 每次 `webSearch` 调用 | 无 |
| 2 | 「参考来源 · N 条」 | `ChatMessage` → `WebSourceFold` | `source-url` parts | 无 |
| 3 | 「参考文档」 | `ChatMessage` 内联行 | `source-document` parts | 无 |
| 4 | 「引用笔记 · N 条」 | `SearchNotesResultCard` → `NoteCitationCard` | 每次 `searchNotes` 调用 | 无 |
| 5 | 「笔记图片 · N 张」 | `SearchNoteImagesResultCard` → `NoteImageGallery` | 每次 `searchNoteImages` 调用 | 无 |
| 6 | 「本次搜索图片 · N 张」 | `ChatMessage.tsx:136-144` 画廊（无 ResultCard） | 全部 `imageSearch` sources 拍平 | 无（`key={i}`，同 url 重排会错位） |
| 7 | 「来源 · N」 | `FollowUpQuestions` ← `collectMessageSources` | 聚合 | **只有这一处**：网页按 URL 去重，**笔记不按 path 去重**（`lib/chat/traceSources.ts:38-45`） |

浮窗消费者：`SourceTraceViewer`（点「来源 · N」）、`SourcePreviewViewer`（点网页条）。

**两条对 #88 很关键的新发现：**

1. **第 2、3 项其实是死路径。** 全库**没有 `sendSources`**，主循环从不下发 `source-url` / `source-document` part。UI 接好了但永远收不到数据。所以「同一个 URL 同时出现在联网来源和参考来源里」这个 Issue 正文的描述**在现网不会发生**。#88 的实际工作是：要么把这两处删掉（连同 UI），要么把 `sendSources` 打开让它们真的有数据——**先决定要哪个，再动手**。
2. **FollowUp 是双通道。** `ChatMessage` 画一枚**带 sources** 的 `FollowUpQuestions`，而 `MessageContent` 还会从正文的 `<FollowUp>` 标签再画一枚**无 sources** 的。这是 P1-54「FollowUp 四层协议」在 UI 上的投影，#88 要一起收。

### 2.3 答案边界（#89 #90）

`lib/chat/messageParts.ts:28-40` 的 `getAnswerText` 与 `lib/chat/buildTrace.ts:128-177` 用**同一条边界**：最后一个 tool part **之后**的 text 才是答案，之前的全部进 Trace 的「进展说明」。

**但两者的消费者不同**（这一点改变了 #90 的影响面，Issue 正文没写清）：

| 函数 | 谁在用 | 剥不剥 `<think>` |
|---|---|---|
| `buildTrace.answerText` | **现网气泡正文**（`ChatMessage.tsx:110-117`） | **剥**（`buildTrace.ts:164-175` 每段 text 先 `splitThinkContent`） |
| `getAnswerText` | `resolveFollowUps`、画布修订（`withAnswerText`） | **不剥** |

还有第三套剥离：`MessageContent` 的 `parseChatContent`。

所以 #90 修的不是「用户看到的答案不一致」（气泡走 buildTrace，已剥），而是**追问门控与画布修订拿到的文本可能带 `<think>` 残留**。优先级因此比 Issue 正文看起来更低，但仍要修——画布修订把带 think 的文本写回产物是实际脏数据。

数据上完全支持做得更好——`step-start` 存在且 parts 严格有序，`lib/chat/consumeStudyStream.test.ts:33-54` 已经把顺序钉死为 `['step-start','reasoning','tool-webSearch','step-start','text']`。

**必须同步处理的下游消费者**（不改会出问题，这是 #89 最容易翻车的地方）：

| 消费者 | 位置 | 风险 |
|---|---|---|
| `withAnswerText` | `lib/chat/messageParts.ts:43-52` | 画布修订会**删掉** last-tool 之后以外的全部 text part → 不改会丢内容 |
| `resolveFollowUps` 的门控 | `lib/chat/resolveFollowUps.ts:23-26` | 追问触发条件挂在答案文本上 |
| 复制按钮 | 只复制 `trace.answerText` | 交错之后要复制哪些段需要决定 |
| 「答案只出现一次」测试契约 | `components/chat/AgentTrace.test.tsx:283-289` | 交错渲染会动这条断言，**要改断言而不是绕过它** |

**旧消息例外**：迁移过来的历史消息没有真实时序（`lib/chat/messageParts.ts:209-249` 固定按「思考 → 全部工具 → 正文」重建），必须保留两桶回退。

`legacyToolOutput`（`messageParts.ts:164-206`）**有**专用字段的：`sources`（含旧 imageSearch 归一）、`cacheHit`、`provider`、`hits`、`skill`、`renderInteractive`（artifactId/title/prompt/modelId/unsupportedReason）、`generateImage`（imageGenId/prompt/title/size/count/modelId）。

**缺**专用字段的：`writeDocument`（documentId/spec）、`createQuiz`（quizId/questions/intent/droppedCount）、`searchNoteImages`（images）、`getSection`（found/title）、`getOutline` 与 `getCurrentPage`（contextKey/deduped）、`drawDiagram`（只有 text）。

这就是 P1-71「有 Trace 步、无卡片」的来源——旧消息里这些工具的结果卡渲染不出来。#89 不必全补，但要在交回摘要里说明补了哪些、留了哪些。

`#90` 是同一对函数的另一半：`buildTrace` 会对 text 做 `splitThinkContent`（处理自定义端点内嵌的 `<think>`），`getAnswerText` **不会**。无工具调用时两者结果可能不同。

### 2.4 定位导航的三个硬约束（#91）

1. **列表已虚拟化。** `components/chat/ChatThread.tsx:75-81` 用 `@tanstack/react-virtual`（`getItemKey: (index) => displayMessages[index]?.id ?? index`），屏外消息**不在 DOM**，`scrollIntoView` 不可用。必须走 `virtualizer.scrollToIndex(index, { align: 'start' })`。**该调用已存在**（`ChatThread.tsx:126-136`，「回到底部」在用），直接复用。
2. **基础设施比 Issue 正文说的更齐。** 行容器已有 `data-index={virtualRow.index}` 与 `key={msg.id}`（`ChatThread.tsx:173-180`）；用户消息有稳定 UUID（`useChat.ts:51` 的 `crypto.randomUUID()`）。**缺的只有两样**：气泡根节点的 `data-message-id`，以及「跳到任意一轮」的 API。

   ```76:76:components/chat/ChatMessage.tsx
       <div className={`chat-message ${isUser ? 'user' : 'assistant'}`} data-message-role={message.role}>
   ```

   **注意 virtualizer 的 index 是 `displayMessages` 的下标**，不一定等于原始 message 数组下标——取 index 要从 `displayMessages` 里算。
3. **会被贴底逻辑拽回。** 定位前必须先 `setWantStick(false)`，否则 `lib/hooks/useStickToBottom.ts` 的 rAF 会立刻把视图拉回底部。

控件做在 `ChatThread` 则主面板与浮窗同时生效（两者共用同一组件，只是滚动 ref 归属不同）。

## 3. 分阶段实施

### 阶段 C1 · #87 + #88 来源

**#87 合并为一块自适应来源**

1. 给 `searchNotes` / `webSearch` / `searchNoteImages` 三个在 registry 里补去重能力。**推荐做成 registry 的聚合声明**（例如 `aggregate: true` + `itemKey`），让 `ToolResultCards` 把同名工具的多次调用 flatMap 成一张卡，而不是在 `ChatMessage.tsx` 里再特例。这样 `imageSearch` 也能从字面量特例收回 registry（顺带清掉 P1-68——现网 `ChatMessage.tsx:128/135` 有两段硬编码的 `names={[...]}`，不是读 `RESULT_CARD_ORDER`）。
2. UI 条数与模型看到的对齐：`searchNotes` 不再 UI 5 条 / 模型 8 条。要么都给 8 条，要么两边都改成同一个常量。
3. 折叠区高度：`.agent-fold-list` 的 `max-height: 8.25rem` 改成自适应（或给一个明显更大的上限 + 滚动），不要把长列表硬切成 4–5 行。
4. 跨调用按 URL / path 去重。

**#88 收敛 7 个表面**

1. **先做两个决定**（2.2 的发现）：
   - `source-url`「参考来源」与 `source-document`「参考文档」是死路径（主循环不 `sendSources`）。**删掉，还是打开 `sendSources` 让它们有数据？** 推荐**删**——现有的 webSearch 卡与 searchNotes 卡已经覆盖了来源展示，再开一路只会制造第 8 个表面。删的话连 UI 一起删，别留空壳。
   - FollowUp 双通道（`ChatMessage` 带 sources 的 + `MessageContent` 从标签抽的无 sources 的）保留哪个？推荐**只保留带 sources 那一枚**，正文标签里的 `<FollowUp>` 只作为数据来源、不再单独渲染。
2. 统一去重口径：把 `traceSources.ts:38-45` 那套按 URL 去重的逻辑抽出来，笔记按 path、网页按 URL，所有表面共用。
3. `key={i}` 改成稳定 key（用 url / path），修掉同 url 重排错位。

### 阶段 C2 · #89 + #90 + #91 时序与导航

**#90 先做**（它是 #89 的前置清理，2 行级别的改动）：让 `getAnswerText` 与 `buildTrace` 对 `<think>` 的处理一致。

**#89 交错渲染**

1. 按 `step-start` 边界把 parts 切成段，按真实时序渲染 text / tool / text / tool。
2. 逐个处理 2.3 表格里的 4 个下游消费者。**`withAnswerText` 是必改项**——不改就会在画布修订时丢中间正文。
3. 旧消息走两桶回退（没有 `step-start` 的就按老规则）。
4. 改 `AgentTrace.test.tsx:283-289` 的断言，改成「每段答案各出现一次、不重复」，不要删掉这个测试。
5. **必须保住的现有行为**：`TRACE_COLLAPSE_MS = 160`、流式自动展开 / 结束自动折叠、用户中途手动选择被尊重。

**#91 定位导航**

1. `ChatMessage.tsx:76` 补 `data-message-id`。
2. 右侧一列圆点，对应每条用户消息，当前位置有视觉标识。
3. 点击 → `setWantStick(false)` → `virtualizer.scrollToIndex(index, { align: 'start' })`。顺序不能反。
4. 长对话圆点过多时要收敛（例如超过 N 条改成分段 / 悬停展开）。这是验收标准里的一条，不要漏。
5. 控件放在 `ChatThread`，主面板与浮窗同时生效。

## 4. 不变量

来自 `docs/plans/archive/00-execution-contract.md` 第六节，本 loop 正面撞上其中三条，**必须逐条守住**：

- **滚动契约**：退出贴底跟随**只认真实用户手势**（`wheel` 的 `deltaY < 0`、下拉 `touchmove`、`PageUp`/`ArrowUp`/`Home`、滚动条拖拽）。**绝不用 `scrollTop` 位置反推「用户是否想离开底部」**——内容骤缩（Trace 折叠）会让浏览器把 `scrollTop` 夹到 0，用位置反推会把程序性下降误判成用户上滑，跟随一断整段流式都不再跟随。这正是用户当初反馈「生成时整页忽上忽下」的机制。#91 的 `setWantStick(false)` 是**显式意图**，与这条不冲突；但不要顺手改 `useStickToBottom` 的判据。
- **`AgentTrace` 折叠的 `max-height` 过渡（约 160ms）不要无故拆掉**。它是把结束帧的数百 px 单跳摊成 10–14px 台阶的关键。
- **`.chat-message` 不得使用 `content-visibility` / `contain-intrinsic-size`**（与 tanstack 的 `measureElement` 冲突）。当前是 `contain: style paint`；#91 若往消息气泡里加**非 portal** 的浮层（圆点提示气泡），需重新评估退到 `contain: style`。**圆点列本身应该放在 ChatThread 层，不要塞进气泡内部。**
- **工具 id `renderInteractive` 不得改名**（已随聊天历史持久化进 IndexedDB）。
- **`lib/**` 不得 import `components/**`**（eslint error 且零例外）。#87 如果把聚合逻辑抽出来，presentation / 纯函数放 `lib`，UI 放 `components`。
- 卡片顺序由 `RESULT_CARD_ORDER` 决定；改它要同步 `toolCards/README.md`。

## 5. 陷阱

1. **#87 照抄 `imageSearch` 的写法会再加一处工具名字面量**。做成 registry 能力，见 3.C1。
2. **`dedupBy` 对空 key 放行是刻意的**（没有 id 的工具不该被误合并）。#87 不要把这行改成「空 key 一律丢弃」——那会让没声明 `resultKey` 的工具卡片全部消失。要做的是给 searchNotes / webSearch **补上** key 或聚合声明。
3. **`withAnswerText` 会删 part**。这是 #89 最隐蔽的坑：画布修订路径调它，它会删掉 last-tool 之后以外的全部 text part。交错渲染之后「答案」不再是单段，这个函数的语义必须重新定义。
4. **`AgentTrace.test.tsx` 的「答案只出现一次」是有意的契约**，不是碍事的测试。改它要在交回摘要里说明新契约是什么。
5. **虚拟列表的 index 与 message 数组的 index 可能不同**（如果有 header / footer 占位）。#91 要用 virtualizer 的实际 index。
6. **旧消息没有 `step-start`**。两桶回退是验收标准里的一条，端测要专门找一条老会话验证。
7. **knip**：新增的聚合 / 去重模块必须被测试 import。
8. 不要跑 `pnpm build`；不要动 `content/**`；不要起 `next dev`。

## 6. 合并验收

**来源（#87 #88）**
- [ ] 多次检索的来源合并为一块，不再按调用次数分卡
- [ ] 跨调用按 URL / path 去重
- [ ] UI 条数与模型 text 条数一致（`searchNotes` 不再 UI 5 条 / 模型 8 条）
- [ ] 折叠区高度不再把长列表硬切成 4–5 行
- [ ] 同一来源不在多处重复展示
- [ ] 笔记来源也按 path 去重

**时序（#89 #90）**
- [ ] 多轮对话按真实时序展示中间讲解与工具
- [ ] 画布修订不再丢失中间正文
- [ ] 旧迁移消息仍能正常渲染（两桶回退生效）
- [ ] Trace 自动展开/折叠与手动选择行为不变
- [ ] `getAnswerText` 与 `buildTrace` 在同一输入上得到一致的答案文本

**导航（#91）**
- [ ] 点击圆点能准确跳到对应用户消息，包括当前不在 DOM 里的屏外消息
- [ ] 跳转后不会被贴底逻辑拽回底部
- [ ] 主面板与浮窗都可用
- [ ] 长对话下圆点数量过多时有合理的收敛显示

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0

## 7. Loop 末尾端测脚本

本 loop 是纯 UI，端测的权重比其他 loop 更高——**测试绿不代表看起来对**。

1. 发一个会触发多次检索的问题（例如需要跨章节对比的）→ 来源是**一块**、条数等于实际搜到的数量，不是 4 张「来源 · 5 条」。
2. 同一个 URL 出现在网页搜索与参考来源两处时 → 只显示一次。
3. 发一个会走 `tools → text → tools → text` 的问题 → 中间那段讲解**可见**，不是只在 Trace 里。
4. 对第 3 步的消息点「复制」→ 复制到的内容包含各段答案，且不含 Trace 噪声。
5. 打开一条**老会话**（迁移过来的历史消息）→ 仍正常渲染，没有空白、没有重复答案。
6. 生成中途：Trace 自动展开；生成结束：自动折叠；手动展开后不被自动折叠覆盖。
7. 长对话（20+ 轮）→ 右侧圆点列出现且有收敛；点最上面那个 → 跳到第一条提问且**不被拽回底部**；在浮窗里重复一次。
8. 流式生成过程中滚动到中间再停 → 不出现「整页忽上忽下」（滚动契约回归检查）。
9. 控制台无 React key 警告、无 500。

端测者交回 `tmp/issues/surface-l5-e2e.md`，**并附截图**（本 loop 的判定离不开视觉）。

## 8. 提交与关单

| 阶段 | commit | Closes |
|---|---|---|
| C1 | `feat(ui): merge tool sources into one adaptive block` | #87 |
| C1 | `refactor(ui): unify dedup across source surfaces` | #88 |
| C2 | `fix(chat): align think handling in trace and answer text` | #90 |
| C2 | `feat(ui): render multi-step tools in real order` | #89 |
| C2 | `feat(ui): add dot navigation for user messages` | #91 |

注意 #90 的 commit 排在 #89 之前（它是前置清理），与 Issue 编号顺序相反，这是对的。

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| **#89 打破滚动契约**，重现「生成时整页忽上忽下」 | 端测第 8 项是必过项。不要碰 `useStickToBottom` 的判据，不要拆 `TRACE_COLLAPSE_MS` 过渡 |
| #89 的 `withAnswerText` 改错，画布修订丢正文 | 验收必须专门走一次画布修订，不能只看单测 |
| #87 把没声明 `resultKey` 的工具卡片误删 | 陷阱 2。B 要逐个工具确认卡片仍在 |
| #91 的圆点列引入非 portal 浮层，触发 `contain` 冲突 | 圆点列放 `ChatThread` 层，不进气泡 |
| 旧消息回退被忽略，历史会话渲染异常 | 端测第 5 项。这是最容易漏测的一项 |

**放弃优先级**：#91（P2，纯新增体验）→ #88（P2，收敛）→ #90（P2，一致性）。**#87 与 #89 是本 loop 的目的**，不应放弃——用户当初的原始抱怨就是「来源怎么按 5 条一块出现」和「中间讲解不见了」。
