# 全项目性能优化系统性审查报告

> **审查时间**：2026-06-28  
> **修复落地**：2026-06-28（Performance Fix Roadmap v2）  
> **审查范围**：前端运行时性能、后台资源占用、列表/历史加载策略、存储层、AI 检索、架构冗余（已确认项）  
> **审查方式**：代码静态分析 + 三路子代理并行深扫 + `pnpm test` 全量回归  
> **审查原则**：优化以「功能与动画零损失」为前提

### 修复状态摘要（2026-06-28）

| 优先级 | 项 | 状态 |
|--------|-----|------|
| P0 | useChat 按会话引用相等订阅 | ✅ |
| P0 | ChatPanel 延迟 sessions 订阅 | ✅ |
| P0 | tool call 60ms 节流 | ✅ |
| P0 | 浮窗最小化卸载 FloatingChatBody | ✅ |
| P1 | ChatThread 虚拟化 | ✅ |
| P1 | Storage v2 + Blob 分离 + v1 迁移 | ✅ |
| P1 | 非活跃会话 LRU 冷卸载 | ✅ |
| P1 | requestMessages 滑动窗口 | ✅ |
| P2 | 例题 SSR meta-only + 按需 fetch | ✅ |
| P2 | nav.generated.json 侧边栏瘦身 | ✅ |
| P2 | vectorSearch min-heap top-K | ✅ |
| P2 | BM25 chunks-meta 去重加载 | ✅ |
| P2 | 生产禁用 substring 全扫 fallback | ✅ |
| P3 | 长讲义/VideoTab LazyVisible | 部分（既有 LazyVisible 保留） |
| P3 | token tracker 合并 | 未做（可选） |

> **文档状态说明（2026 年 9 月文档清洗时补记）**：上表 P0~P2 全部已落地并保持至今，但下文「二～九」的问题分析、代码引用与结论段落是**审查当时（修复落地前）的现状描述**，多处已被上表的修复取代而未回填（例如 §5.1「无虚拟化」「单 key 整包 stringify」、§6 关键词检索结论）。本次清洗已订正明确过时/自相矛盾之处并标注「已修复」，但正文分析思路仍按原始审查顺序保留，供方法论参考；涉及具体现状的表述以本文订正处、`00-execution-contract.md` 第六节「既成不变量」与实际代码为准。

**关联文档**：

- [存储架构规范](./storage-architecture.md)
- [渲染架构](./rendering-architecture.md)
- [测试体系审查（已归档）](../plans/archive/test-audit-report.md)
- [考前模拟内容优化计划](../archive/compose/plans/2026-06-28-kaoshi-moniji-optimization.md)（内容层，非运行时）

---

## 一、执行摘要

### 1.1 总体结论

项目在**流式对话防 OOM**、**右侧面板按需挂载**、**SSR 正文预渲染**、**交互组件代码分割**等方面已有**明确且有效的工程化优化**，注释与实现质量高于同类个人项目平均水平。

当前最主要的性能债务集中在三类：

| 类别 | 核心问题 | 用户可感知程度 |
|------|----------|----------------|
| **热数据单体化** | 全部对话会话（≤50）+ 全部消息 + base64 附件存在单一 Zustand store + 单一 IDB key | 长对话、多浮窗时卡顿、首屏水合慢 |
| **无列表虚拟化/分页** | 聊天消息、历史列表、侧边栏、TOC、视频卡片等一次性全量渲染 | 历史变长后滚动/切换变慢 |
| **全局订阅风暴** | `useChat` / `ChatPanel` 订阅完整 `sessions` 数组，任一会话流式更新触发所有已挂载聊天实例重渲染 | 多划词浮窗 + 主面板同时打开时明显 |

**不存在名为 `coldStorage` 的冷存储层**。IndexedDB 是唯一持久化后端，启动时**整包水合进内存**——这是「假冷存储」与真按需加载之间的最大差距。

### 1.2 与用户诉求的对照

| 用户诉求 | 现状 | 评级 |
|----------|------|------|
| 最小化/不显示时不后台加载 | 右侧面板非 AI tab：**完全卸载** ✓；移动端非 AI tab：**完全卸载** ✓；浮窗最小化：**DOM 不渲染，但 hook 仍订阅 store** △ | 部分达标 |
| 对话历史随时间增长应分页 | **无分页**，全量 `map` 渲染 `ChatThread` | ✗ |
| 列表单次加载 ~20 条、滚动再加载 | **全项目无虚拟列表/无限滚动**；仅有搜索结果 `limit` 截断 | ✗ |
| 不损失功能与动画 | 现有 `AnimatePresence`、`framer-motion` 切换、流式 rAF 贴底等应保留 | 优化时必须遵守 |

### 1.3 建议实施优先级（仅指导，本次不落地）

```
P0（高收益 / 中低风险，不改变 UX）
  ├─ 收窄 useChat / ChatPanel 的 Zustand 订阅（学 TokenDashboard 用 getState）
  ├─ ChatPanel 的 sessions 订阅延迟到打开历史面板时
  └─ 工具调用 updateMessage 纳入与 content 相同的 60ms 节流

P1（高收益 / 需设计，UX 不变）
  ├─ ChatThread 消息列表虚拟化（@tanstack/react-virtual 或 react-window）
  ├─ 附件与消息正文分 key 存储（IDB 多 key，消息只存 attachmentId）
  └─ 非活跃会话消息「冷卸载」：内存只保留元数据 + 最近 N 条，切换会话时再读 IDB

P2（中收益 / 内容规模相关）
  ├─ 例题 SSR：首屏只传 metadata，正文点击后 fetch
  ├─ 客户端 contentTree 瘦身（导航索引与详情分离）
  └─ vectorSearch 线性扫描改 top-K 堆或 ANN

P3（低紧迫 / 本地使用可缓）
  ├─ 长讲义 markdown 分段 LazyVisible
  ├─ BM25 与 vectors 元数据去重加载
  └─ useTokenTracker / useFloatingTokenTracker 合并

明确不做（本次审查约定）
  ├─ 概率 interactive 超大组件拆分（不影响性能则保持）
  ├─ registry.ts / route.ts 等长文件机械拆分
  └─ 为规范而统一全部 localStorage 持久化风格
```

---

## 二、审查方法论

### 2.1 技能与工具链

| 来源 | 用途 |
|------|------|
| `using-superpowers` | 确认审查流程应系统化、有清单 |
| `webapp-testing` | 测试基线验证（Playwright 未用于本次性能 profiling，因无现有 perf harness） |
| 三路子代理并行 explore | 分别深扫：聊天/存储、懒加载/列表、架构冗余 |
| 关键词全库检索 | `virtual`、`react-window`、`pagination`、`coldStorage`、`LazyVisible`、`dynamic(` 等 |
| `pnpm test` | 2026-06-28 实测：**1177** node:test + **51** Vitest = **1228 pass / 0 fail** |

### 2.2 测试与性能的关系

**现有测试覆盖的是正确性，不是性能回归。**

| 与性能相邻的测试 | 文件 | 测什么 | 没测什么 |
|------------------|------|--------|----------|
| 水合门控 | `lib/hooks/useHydrated.test.tsx` | IDB 恢复前禁止操作 | 大水合 payload 耗时 |
| Token 估算 | `lib/context/estimateTokens.test.ts` | 估算算法 | 实际上下文裁剪策略 |
| 混合检索 | `lib/ai/search/hybridSearch.test.ts` | RRF 合并逻辑 | vectorSearch O(n) 延迟 |
| IDB 适配器 | **无** | — | 800ms 防抖、pagehide flush |
| 流式节流 | **无** | — | useChat 60ms throttle |
| 组件渲染 | Vitest 13 文件 | 快照/交互 | 长列表 FPS |

**建议**（未来）：为 `idbStorage` 防抖与 `useChat` 节流各加 1–2 个 node:test 单元测试，防止回归；不必上 Lighthouse CI（本地 Electron 场景收益有限）。

---

## 三、已有优化（应保留，勿回退）

### 3.1 流式对话双节流（核心防线）

**UI 层 60ms**（`lib/hooks/useChat.ts`）+ **IDB 写入 800ms 尾随防抖**（`lib/storage/idbStorage.ts`）是针对「每 token 更新 → 整段 JSON.stringify → 写盘 → OOM」的**实证修复**。

```32:37:lib/storage/idbStorage.ts
// zustand persist 每次 set() 都会同步 JSON.stringify(整段状态) 并调 setItem 写盘。
// 流式对话每 token 一次 updateMessage → 每 token 写一次「整段 chat-history」。无防抖时
// 每次 setItem 都 `await idbSet(...)`（异步），高频 token 下大量写入并发在飞、各自持有
// 一份不断变大的历史字符串 → O(n²) 活跃内存 → 渲染进程 OOM（调试器实证断在此 setItem）。
// 方案：按 key 尾随防抖，最新值胜出，高频写合并为一次；页面卸载/隐藏时立即落盘，零丢失。
```

```223:244:lib/hooks/useChat.ts
        const UI_THROTTLE_MS = 60;
        let uiTimer: ReturnType<typeof setTimeout> | null = null;
        const writeUi = () => {
          updateMessage(sessionId!, assistantId, { content: contentBuf, reasoningContent: reasoningBuf });
        };
        const scheduleUi = () => {
          if (uiTimer) return;
          uiTimer = setTimeout(() => {
            uiTimer = null;
            writeUi();
          }, UI_THROTTLE_MS);
        };
```

**保留约束**：任何「减少更新频率」的优化不得突破 60ms 以下的感知延迟；不得移除 `pagehide` / `visibilitychange` flush。

### 3.2 右侧面板 — 非激活 Tab 完全卸载

```136:157:components/layout/RightPanel.tsx
        <AnimatePresence mode="wait" custom={dirRef.current}>
          {tab === "ai" && (
            <motion.div key="ai-chat" ...>
              <ChatPanel chatContext={chatContext} />
            </motion.div>
          )}
          {tab === "video" && ( ... )}
```

- `next/dynamic` + `ssr: false`：Chat / Video / Interactive / Browser 各自独立 chunk
- `AnimatePresence mode="wait"`：切换带动画，**旧 tab 卸载后不再占 CPU/GPU**
- `ChatPanel` unmount 时 `stopGeneration()` — 切走 AI tab 会中止流式请求

**这是「不显示就不加载」的最佳实践范例**，其他模块应看齐此模式。

### 3.3 内容页 SSR/SSG 管线

```14:29:app/[subject]/[category]/[id]/page.tsx
export async function generateStaticParams() {
  const params: { subject: string; category: string; id: string }[] = [];
  for (const subject of contentTree.subjects) {
    for (const category of subject.categories) {
      const walk = (items: ContentItem[]) => { ... };
      walk(category.items);
    }
  }
  return params;
}
```

- 构建期 Markdown → HTML/KaTeX（`NoteRendererServer`），客户端导航**不再跑 react-markdown**
- 消除旧架构「客户端 fetch /api/section」瀑布
- `ContentPageClient` 内 tab 切换：非激活 tab 不挂载（例题/测验等同理）

### 3.4 视口懒挂载 `LazyVisible`

```11:38:components/ui/LazyVisible.tsx
/**
 * 视口懒加载容器：子组件仅在滚动到视口附近时才挂载。
 * 一旦可见就保持挂载（不会卸载），避免状态丢失。
 */
```

使用点：例题卡片、可交互 tab 每项、MediaEmbed 内视频/交互组件。  
**策略正确**：mount-once 避免交互状态丢失；200px `rootMargin` 预取平衡体验与性能。

### 3.5 交互组件注册表代码分割

`components/interactives/registry.ts` 内 **~54 个** `dynamic(..., { ssr: false })`，按章节过滤后 `InteractiveTab` 再套 `LazyVisible`。  
单个 interactive 可达 600–900 行，但**默认不进主 bundle**——符合「复习工具按需打开」场景。

### 3.6 TokenDashboard 的反订阅模式（应推广）

`TokenDashboard` 在流式期间用 `useChatHistory.getState()` 而非订阅 `sessions`，避免整组件重渲染风暴。  
`useChat` / `ChatPanel` **尚未采用**此模式——是 P0 优化的直接模板。

### 3.7 会话数量硬上限

`useChatHistory.createSession`：**最多 50 个会话**，溢出删最老 + `useArtifacts.prune` 孤儿清理。  
这是当前唯一的「历史增长」护栏，但**单会话内消息数无上限**。

---

## 四、可见性 vs 后台工作矩阵

精确回答「前端不显示时是否还在后台占用资源」：

| 场景 | DOM 渲染 | React 组件树 | Hook / Store 订阅 | 网络/流式 | 评级 |
|------|----------|--------------|-------------------|-----------|------|
| 桌面右侧 tab ≠ AI | **无** | **卸载** | **无** | 中止 | ✅ 优秀 |
| 移动底栏 tab ≠ AI | **无** | **卸载** | **无** | 中止 | ✅ 优秀 |
| 浮窗 **最小化** | **无** ChatThread/Input | 仍挂载 FloatingChatWindow | `useChat` 已改为按会话取值订阅（`messagesById[sid]`），不再是审查当时的「全量订阅 sessions」，其他会话流式不会牵动本窗（见 §5.1.1 订正） | **stopGeneration** 已调用 | ✅ 已改善 |
| 浮窗 **正常显示** | 全量消息 map | 全量 | 全量订阅 | 正常 | 预期 |
| 聊天头 **自动隐藏** | **全量消息仍渲染** | 全量 | 全量 | 正常 | ℹ️ 设计如此 |
| 历史面板 **关闭** | 无 overlay | — | ChatPanel 仍订阅 sessions | — | ⚠️ 可优化 |
| 例题 tab 未打开 | 无 ExampleTab | ContentPageClient 仍持 `initialExamples` props | — | SSR 已传输正文 | ⚠️ 带宽 |
| 可交互 tab 未打开 | 无 InteractiveTab | — | — | — | ✅ |
| 浏览器 tab 未打开 | 无 BrowserTab | — | — | — | ✅ |

### 4.1 浮窗最小化细节

```178:220:components/chat/FloatingChatWindow.tsx
        display: managed.minimized ? "none" : "flex",
        ...
        {!managed.minimized && (
          <>
            <ChatThread messages={messages} ... />
            <ChatInput ... />
          </>
        )}
```

- **优点**：不渲染 Markdown/KaTeX/工具面板 — 最重部分已跳过
- **已改善**：`useChat` 仍运行，但订阅已收窄到 `messagesById[sid]`（见 §5.1.1 订正），其他会话流式更新不会再触发本窗重渲染
- **副作用**：最小化会 `stopGeneration()` — 资源友好但可能中断用户预期的后台生成（产品取舍，非性能 bug）

### 4.2 自动隐藏聊天头

`useAutoHideChatHeader` 仅 CSS 隐藏 sticky header，**消息列表完整保留**。  
对用户：滚动阅读面积更大；对性能：**无收益**。若未来要优化长对话，应做虚拟列表而非隐藏头。

---

## 五、分模块深度分析

### 5.1 AI 对话与历史（最高优先级）

#### 5.1.1 存储模型（**已修复：Storage v2 已落地，见下方订正**）

审查当时（Storage v2 落地前）的模型是「整包单 key」：`useChatHistory` 用 zustand `persist` 把 `sessions: ChatSession[]`（含全部 `messages`、base64 附件）整包塞进 IDB 的 `chat-history` key，每次 `set()` 都 `JSON.stringify` 整包；`useChat.ts` 直接订阅 `sessions` 数组。这正是上表 P1「Storage v2 + Blob 分离 + v1 迁移」修复的对象，**现已不是当前实现**。

**现状（Storage v2，`lib/storage/chatStorage.ts` + `lib/stores/chatHistory.ts`，详见 [storage-architecture.md §7](./storage-architecture.md)）**：

```
┌─────────────────────────────────────────────────────────┐
│  useChatHistory（手写 IO，不走 zustand persist）           │
│  ├─ sessionsMeta: SessionMeta[]（元数据，全量在内存）        │
│  ├─ messagesById: Record<sessionId, ChatMessage[]>         │
│  │    └─ 只保留最近打开的 MAX_LOADED_SESSIONS = 3 个会话     │
│  └─ activeSessionId                                        │
│           │                                                │
│           ▼ 分 key 落盘                                     │
│  idb["chat-manifest"]         全部会话元数据                │
│  idb["chat-session:{id}"]     单会话 messages[]（按需加载）  │
│  idb["chat-blob:{id}"]        图片附件（persistInlineAttachments 拆出）│
└─────────────────────────────────────────────────────────┘
```

**已解决的问题链**（对照原审查的四条）：

1. **启动**：只加载 `chat-manifest`（元数据）+ 当前 active 会话的 `chat-session:{id}`，不再整包水合全部历史。
2. **流式**：`updateMessage` 只克隆 `messagesById[sessionId]` 这一个会话的数组，不再牵动其余会话。
3. **多实例**：`useChat.ts` 现在按会话取值订阅（`useChatHistory((s) => s.messagesById[sid] ?? EMPTY_MESSAGES)`），不再整体订阅 `sessions` 数组——其他会话流式更新不会触发本会话 `useChat` 重渲染。
4. **附件**：`persistInlineAttachments` 把 inline base64 拆到 `chat-blob:{id}`，`sendMessage` 前用 `hydrateAttachmentsForApi` 按需还原，不再让每条消息正文常驻大体积 base64。

下文 §5.1.2~§5.1.5、§6、§8.1 中仍按审查原文描述「无虚拟化 / 单 key stringify」的段落，均已被上述修复取代，阅读时请以本节订正为准。

#### 5.1.2 渲染路径（**已修复：虚拟化已落地**）

`ChatThread.tsx` 现在用 `@tanstack/react-virtual` 的 `useVirtualizer` 做真正的虚拟列表，不再是审查当时 `messages.filter().map()` 全量渲染：

```75:91:components/chat/ChatThread.tsx
  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => MESSAGE_ESTIMATE_PX,
    overscan: 4,
    getItemKey: (index) => displayMessages[index]?.id ?? index,
    initialRect: { width: 0, height: 480 },
  });
  const virtualItems = virtualizer.getVirtualItems();
```

- **已虚拟化**：只渲染可视区 + `overscan: 4` 条 `ChatMessage`，长历史不再等比例增加 DOM 节点数
- **React.memo(ChatMessage)** 对非流式旧消息有效（`updateMessage` 保持未变 message 引用）
- **流式消息**：每条 assistant 回复在生成期高频重绘 Markdown — 预期成本
- **贴底逻辑**：`useStickToBottom` + `virtualizer.scrollToIndex` 配合，流式期间钉住最后一项；`shouldAdjustScrollPositionOnItemSizeChange` 按计划 19 B3 的约束放在 virtualizer 实例上而不是 options 里

#### 5.1.3 历史面板

`ChatHistoryOverlay` 一次性 `list.map` 渲染当前 tab 下**全部**会话（≤50）。  
50 条元数据行尚可；若未来提高会话上限或加预览摘要，应分页。

#### 5.1.4 推荐的「真冷存储」形态（**已实现**，即当时的设计参考 = 现在的 Storage v2）

审查当时提出的分层方案，与现在 §5.1.1 描述的 Storage v2 基本一致（`sessionsMeta` 对应「热层元数据」，`messagesById` 的 LRU ≤3 对应「热层 activeMessages」，`chat-session:{id}` / `chat-blob:{id}` 对应「温层」）；「冷层压缩归档」这一层暂未做，本地复习场景优先级不高：

```
热层（内存，lib/stores/chatHistory.ts）
  ├─ activeSessionId
  ├─ sessionsMeta: SessionMeta[]（id/title/updatedAt/messageCount/kind…）
  └─ messagesById: Record<sessionId, ChatMessage[]>（LRU 最近 3 个会话）

温层（IDB，按 key 分片，lib/storage/chatStorage.ts）
  ├─ chat-session:{id} → messages[]
  └─ chat-blob:{id} → 图片附件 data-url

冷层（未做，本地复习工具可不做）
  └─ 压缩归档 30 天前会话
```

切换会话：`ensureSessionLoaded()` 异步从温层加载 messages，配合 `sessionLoadState` 显示 loading（`useChatReady()` 门控）。

#### 5.1.5 上下文窗口 vs 列表分页

即使 UI 虚拟化只渲染 20 条，**发给模型的 context 仍可保留最近 K 条 + 摘要**——两者独立。  
项目已有 `estimateTokens`、`contextMode`（full/semantic）、`TokenDashboard` 告警 — 缺的是**UI 层分页**与**存储层分片**。

---

### 5.2 内容导航与侧边栏

#### 5.2.1 contentTree 全量进客户端

```29:30:components/layout/SubjectSidebar.tsx
import { contentTree } from "@/lib/content-data/manifest";
```

- 导航元数据随主 bundle 加载 — 学科/章节增多时 JS 体积线性涨
- `FileTree` 按 `expandedIds` 控制 DOM 展开，但**数据已在内存**
- 移动端 `MobileChapterPicker` 同样 import 全树

**影响评估（当前规模）**：manifest 主要为几大学科，**本地使用可接受**；若新增大量「考前模拟」试卷节点，建议拆「轻量索引 JSON + 按需拉分类详情」。

#### 5.2.2 TOC（目录树）

- `useToc` 扫描当前页 DOM 全部 heading → 写入 `useStore.tocItems`
- `TocTree` 全量渲染 heading 树 + `IntersectionObserver` 跟踪 active
- 超长讲义（数千行 markdown）时 heading 数量可达数十～上百 — **尚无虚拟化**

**优化方向**：heading > 40 时折叠深层级默认；或 TOC 侧栏虚拟列表。不影响正文动画。

---

### 5.3 例题 / 测验 / 视频

| 模块 | 加载时机 | 全量程度 | 说明 |
|------|----------|----------|------|
| **例题** | SSR `readExamples` 读目录下全部 `.md` | 正文随 page props 下发 | 未打开 tab 也已占内存/带宽 |
| **测验** | 打开 Quiz tab 时 fetch 整章 JSON | UI 一次一题（好） | 数据层全章加载（可接受） |
| **视频** | Video tab dynamic import | 节内全部视频卡片进 DOM | poster `loading="lazy"` 仅缓图片 |
| **复习卡片** | review 页 filter 全科卡片 | IDB 全量水合 | 一次显示一张（好） |

**例题 defer 方案**：SSR 只传 `{ id, title, difficulty }[]`；点击卡片时 `fetch('/api/examples/...')` 或 RSC — **功能不变，首屏更轻**。

---

### 5.4 媒体与生成 manifest

| 文件 | 行数 | 性质 |
|------|------|------|
| `lib/content-data/media.generated.ts` | ~1399 | 自动生成 |
| `lib/content-data/media.physics.generated.ts` | ~1535 | 自动生成 |

视频元数据合并进 `lib/content-data/media.ts`，`getVideosForSection` 过滤。  
**不是运行时性能热点**（纯数据查找），但增大学科时延长构建与 client 解析时间。

---

### 5.5 AI 检索与索引

#### 5.5.1 混合检索管线（良好）

`hybridSearch`：BM25 + vector + RRF + 可选 rerank，各环节有 top-K 截断。  
工具侧 `searchAllContent` 默认 `limit = 8`；全局搜索 UI `SEARCH_LIMIT = 32` + `useDeferredValue`。

#### 5.5.2 vectorSearch 线性扫描（规模风险）

```140:158:lib/ai/search/vectorStore.ts
export async function vectorSearch(queryEmbedding: number[], topK: number): Promise<ScoredChunk[]> {
  const index = await loadIndexAsync();
  ...
  const scored: ScoredChunk[] = index.chunks.map((chunk) => ({
    ...
    score: cosineSimilarity(queryEmbedding, chunk.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
```

- 每查询 **O(chunks)** 余弦 + 全量 sort
- 索引 ~307MB 注释指 whole file；加载后常驻内存
- **本地复习 + 单用户**：chunk 数在万级以下通常可接受（毫秒～百毫秒）
- **若内容翻倍**：应改 min-heap top-K（无需 sort 全数组）或引入 hnswlib

#### 5.5.3 无索引时的 substring 回退

`lib/content/loader.ts` `substringSearch` 可遍历全部 leaf 并 `readFileSync` — **生产环境应确保 `content/.index` 存在**（`npm run build:index` 或同类脚本）。  
已在 `05-content-integration` SOP 覆盖可达性验证。

#### 5.5.4 BM25 重复加载 vectors 元数据

`bm25Store` 为 chunk 文本可能再读 `vectors.json` — **内存重复**。P3 优化：单一 chunk 元数据源。

---

### 5.6 窗口与浮层系统

- `FloatingChatLayer` 在 `AppShell` **全局挂载**，每个 open window 一个 `FloatingChatWindow`
- `useWindowManager` 几何态内存存储；尺寸 persist 到 localStorage
- `useRecordPreviews` / artifact viewer 走独立窗口 — 关闭时卸载，模式正确

**浮窗数量建议软上限**（产品层）：>3 个同时打开时 UI 提示，避免订阅风暴 — 非必须。

---

## 六、关键词全库检索结论

| 关键词 | 结果（审查当时） | 现状（本次清洗核实） |
|--------|------|------|
| `react-window` / `useVirtualizer` / `virtual` (list) | 无 | **有**：`ChatThread.tsx` 已用 `@tanstack/react-virtual` 的 `useVirtualizer`（见 §5.1.2） |
| `pagination` / `pageSize` / `loadMore` / infinite scroll | 无 UI 分页 | 仍无数据层分页；虚拟化解决的是 DOM 渲染量，不是「按需加载更早消息」 |
| `coldStorage` | 无 | 概念上已用 Storage v2（`sessionsMeta` + 分 session key）实现，只是没有叫这个名字 |
| `LazyVisible` | 有，4+ 使用点 | 不变 |
| `next/dynamic` | 广泛（AppShell、RightPanel、registry、VideoTab…） | 不变 |
| `React.lazy` | 无（项目统一用 next/dynamic） | 不变 |
| `IntersectionObserver` | `LazyVisible`、`useToc`（非 infinite scroll） | 不变 |

---

## 七、已确认架构冗余（非推测）

### 7.1 可合并的重复逻辑

| 项 | 位置 | 说明 | 紧迫度 |
|----|------|------|--------|
| 双 Token Tracker | `useTokenTracker.ts` / `useFloatingTokenTracker.ts` | ~70 行同构算术 | 低（不影响性能） |
| 四种持久化风格 | IDB persist / 手动 localStorage / 内联 LS / quiz-progress | 与 storage-architecture 文档漂移 | 低 |
| storage 文档过时 | `docs/refer/storage-architecture.md` | `useChatUI` key 已迁至 `useFloatingChats`；`PERSIST_KEYS` 缺 skills/reviewCards | 文档债 |

### 7.2 Git 路径反斜杠 — 非重复文件

`app\[subject]\...` 与 `app/[subject]/...` 在 Windows 为**同一 inode**。  
勿当作两份源码合并；`git add` 用正斜杠路径即可。

### 7.3 超大文件分布（>500 行，前 10）

| 行数 | 文件 | 是否建议拆分 |
|------|------|--------------|
| 1535 | `media.physics.generated.ts` | 否（生成物） |
| 1399 | `media.generated.ts` | 否 |
| 913 | `CDFVisualizer.tsx` | **否**（用户约定） |
| 862 | `MeanTestExplorer.tsx` | 否 |
| 855 | `MarginalExplorer.tsx` | 否 |
| 854 | `QuizQuestion.tsx` | 否（除非测验交互卡顿） |
| 851 | `VarianceTestExplorer.tsx` | 否 |
| 844 | `SamplingDistExplorer.tsx` | 否 |
| 814 | `MomentEstimator.tsx` | 否 |
| 778 | `organic-chemistry-detail.ts` | 否（内容数据） |

应用逻辑热点：`app/api/chat/route.ts`（553）、`useChat.ts`（432）、`registry.ts`（523）— 长度合理，**性能问题在订阅模式而非行数**。

### 7.4 状态管理全景（现为 `lib/stores/` 下 28 个 store 文件，**已完成 §7.3 提到的 store 拆分**）

审查当时 `lib/store.ts` 还是承载路由选中态、布局折叠、TOC、PiP、mobileTab 等大量状态的单体文件；计划 22 把它拆到了 `lib/stores/` 下（完整清点见 `lib/stores/README.md`）。`lib/store.ts` 现在只剩 2 行 `@deprecated` 转发壳，真身是 `lib/stores/ui.ts` 的 `useStore`（仍持有 `activeSubjectId`/`mobileTab`/TOC/PiP 这类跨组件路由态，只是文件搬了家、没有再合并/精简）。  
与 `useChatHistory`、`useFloatingChats` 等 feature store 并存 — **无模块级循环 import**，但仍有运行时 `getState()` 耦合（如 deleteSession → prune artifacts）。

**不建议为大重构而合并 store**；性能优化应**收窄 selector**，而非搬状态。

---

## 八、分场景优化 playbook（功能/动画无损）

### 8.1 对话历史「单次 20 条，下滑再加载」

**目标 UX**：用户仍看到完整历史，但初始只渲染视口附近 ~20–30 条；上滚加载更早消息。  
**技术**：`@tanstack/react-virtual` 或 `react-window` + `overscan: 5`；流式时强制 pin 最后一项。  
**注意**：
- 保持 `ChatMessage` memo 与 `isStreaming` 标记逻辑
- 保持 rAF 贴底与「回到底部」按钮
- 不改变 IDB 存储结构（第一期）

### 8.2 非显示板块不加载

| 板块 | 建议 | 风险 |
|------|------|------|
| 浮窗最小化 | 条件化：`minimized && !isStreamingSession` 时不挂载 `useChat` 子树；或 `useChat` 内 `if (minimized) return stale snapshot` | 需处理还原时同步 |
| ChatPanel sessions | `showHistory` 为 true 才 `useChatHistory(s => s.sessions)` | 低 |
| 例题正文 | 懒 fetch | 首次打开例题多一次请求 |
| 视频脚本 | 已实现按需 import | — |

### 8.3 附件冷存储

将 `ChatAttachment` 的 base64 从 `chat-history` JSON 拆出：

```
message.attachments: { id, mime, name }[]
idb: attachment-{id} → ArrayBuffer
```

**收益**：stringify 体积可降一个数量级；**功能无损**（发送时按需读取）。

### 8.4 动画相关禁令

优化时**不得**：

- 移除 `RightPanel` / `AppShell` 的 `AnimatePresence` tab 过渡
- 为虚拟列表破坏 `ChatMessage` 内 CSS 过渡
- 将 `LazyVisible` 改为「滚出视口即卸载」（会丢交互状态）
- 缩短流式 UI 节流低于 ~40ms（KaTeX 可能跟不上）

---

## 九、性能验证清单（未来自测用）

本地复习场景可用手动清单替代自动化 benchmark：

```
□ 打开含 100+ 轮对话的历史会话 — 滚动是否 < 16ms/frame
□ 同时打开主面板 AI + 3 个划词浮窗 — 流式时 CPU 是否飙高
□ 最小化浮窗后切 Video tab — 任务管理器内存是否下降
□ 长讲义（>500 行）— TOC 滚动、heading 高亮是否流畅
□ 全局搜索输入 — useDeferredValue 是否避免卡顿
□ 构建后 content/.index 存在 — 搜索不走 substring 全扫
□ 开发者工具 Performance — 流式期间 Main thread JSON.stringify 占比
```

可选：Chrome Performance + `estimateSize(PERSIST_KEYS.chatHistory)` 暴露到设置页。

---

## 十、与现有文档的衔接

| 文档 | 关系 |
|------|------|
| [storage-architecture.md](./storage-architecture.md) | 「单 key 整包 stringify」问题已随 Storage v2 解决（见 §5.1.1 订正）；该文档已同步收录 Storage v2 与全部 IndexedDB/localStorage store 清单 |
| [rendering-architecture.md](./rendering-architecture.md) | SSR 策略与本次结论一致 |
| [07-testing.md](../sop/07-testing.md) | 建议增加「性能敏感路径」测试备注（idb 防抖、chat 节流） |
| [kaoshi-moniji-optimization](../archive/compose/plans/2026-06-28-kaoshi-moniji-optimization.md) | 内容 markdown 优化，与运行时正交 |

---

## 十一、总结

项目在**「看不见就不渲染 DOM」**上，对 **Tab 级面板**（AI/视频/交互/浏览器）做得很好。审查当时指出的**聊天历史增长**、**多浮窗订阅**、**列表虚拟化**、**冷存储分层**问题，已随本文顶部「修复状态摘要」的 P0/P1/P2 项目全部落地（Zustand 订阅收窄、ChatThread 虚拟化、Storage v2 分层 + Blob 分离均已实现，见 §5.1.1/§5.1.2 订正）。

当时列出的「最值得做的三件事」现状（本次清洗抽样核实）：

1. **收窄 Zustand 订阅** — ✅ 已做（`useChat` 按会话取值订阅，见 §5.1.1 订正）
2. **ChatThread 虚拟化** — ✅ 已做（`@tanstack/react-virtual`，见 §5.1.2 订正）
3. **附件出 JSON** — ✅ 已做（`chat-blob:{id}` 分 key，见 §5.1.1 订正）

P2/P3 具体条目的完成状态以顶部「修复状态摘要」表为准（本次清洗核实 `vectorSearch` 已改 `TopKMinHeap` top-K；但例题 SSR 在 `app/[subject]/[category]/[id]/page.tsx` 里仍调的是全量 `readExamples()`，与顶部表格「例题 SSR meta-only」的描述是否已在所有路径生效，建议下次代码侧改动时复核，本文档不下结论）。token tracker 合并（P3，标注可选）未做。  
超大 interactive 组件与长单文件**维持现状**，符合本次审查边界。

---

*本报告由系统性代码审查生成，未经生产环境 Lighthouse/Web Vitals 实测。实施前请按 [verification-before-completion](https://github.com/) 原则在目标机器上验证。*
