# 存储架构规范

> 本文档描述客户端持久化分层、水合门控、迁移策略与扩展指南。
> 任何修改存储层、新增持久化 store 的操作，都应先阅读本文档。

---

## 1. 架构总览

```
┌───────────────────────────────────────────────────────────────┐
│                    存储层 (lib/storage/)                        │
│                                                                 │
│  idbStorage.ts                                                  │
│  ├─ DB_NAME = "gailvlun-db"                                    │
│  ├─ STORE_NAME = "keyval"                                      │
│  ├─ PERSIST_KEYS = { chatHistory, chatManifest, artifacts,     │
│  │     skills, reviewCards, imageGen, billingHistory,          │
│  │     documents, reviewQuizAttempts, reviewQuizSets }         │
│  ├─ idbStorage (StateStorage 适配器)                            │
│  │   └─ getItem: 先读 IndexedDB → 回退 localStorage → 播种迁移  │
│  ├─ estimateSize(key)                                          │
│  └─ clearAll()                                                 │
│                                                                 │
│  useHydrated.ts                                                 │
│  └─ useHydrated(store) → boolean                               │
└───────────────────────────────────────────────────────────────┘
         │                                          │
    ┌────┴──────────────┐                ┌───────────┴──────────┐
    │  IndexedDB 层      │                │  localStorage 层      │
    │  (大数据、异步)     │                │  (小数据、同步)        │
    │                    │                │                       │
    │  useChatHistory    │                │  useSettings          │
    │  useArtifacts      │                │  useTheme             │
    │  useDocuments      │                │  useFloatingChats     │
    │  useImageGen       │                │  useBrowser           │
    │  useSkills         │                │  useAcademicYear      │
    │  useReviewCards    │                │  useStore（ui.ts）    │
    │  useBillingStore   │                │  useKeyboardSettings  │
    │                    │                │  quiz-progress        │
    └────────────────────┘                └───────────────────────┘
```

> `useChatHistory`、`useArtifacts` 等 6 个 IndexedDB store 与 `useSettings`/`useTheme` 等各自的持久化封装方式不同（见 §5、§6.1、§6.2），上图只标注它们落在哪一层存储，不代表实现方式相同。

### 核心原则

- **大数据走 IndexedDB**：对话历史（含 toolCalls 元数据）和交互演示 HTML（8-40KB/个）存入 IndexedDB，容量数百 MB。
- **小数据留 localStorage**：设置、主题、UI 状态、书签、成绩等 <10KB 数据保留 localStorage，同步读取无水合问题。
- **单一真相源**：DB 名、store 名、持久化 key 全部集中在 `lib/storage/idbStorage.ts` 顶部常量区。
- **SSR 安全**：所有存储操作 `typeof window === "undefined"` 守卫降级。

---

## 2. IndexedDB 存储适配器 (`lib/storage/idbStorage.ts`)

### 2.1 常量

| 常量 | 值 | 说明 |
|---|---|---|
| `DB_NAME` | `gailvlun-db` | 专属数据库，不与默认 `keyval-store` 混淆 |
| `STORE_NAME` | `keyval` | 单 object store，所有 key 共存 |
| `PERSIST_KEYS.chatHistory` | `chat-history` | 对话历史 v1（迁移后删除） |
| `PERSIST_KEYS.chatManifest` | `chat-manifest` | Storage v2 manifest |
| `PERSIST_KEYS.artifacts` | `artifacts` | 交互演示持久化 key |
| `PERSIST_KEYS.skills` | `skills` | 技能库持久化 key |
| `PERSIST_KEYS.reviewCards` | `review-cards` | 复习卡片持久化 key |
| `PERSIST_KEYS.imageGen` | `image-gen` | AI 生图会话持久化 key |
| `PERSIST_KEYS.billingHistory` | `billing-history` | 账单历史持久化 key |
| `PERSIST_KEYS.documents` | `documents` | AI 撰写文档持久化 key |
| `chat-session:{id}` | per-session | 单会话消息数组 |
| `chat-blob:{id}` | per-blob | 图片附件 data-url |
| `review-quiz-attempts:{id}` | per-attempt | 本机答案、逐题评分、未同步状态与恢复位置 |
| `review-quiz-sets:{hash}` | per-question-set | 题干/选项/答案/解析/材料定位快照，重复作答复用 |

### 2.2 StateStorage 接口

`idbStorage` 提供 `getItem`/`setItem`/`removeItem` 三个异步方法，供 zustand `createJSONStorage` 使用。

**透明迁移**：`getItem` 首次读不到 IndexedDB 时，回退读旧 localStorage 并播种到 IndexedDB，然后清除旧 key。此过程幂等，Strict Mode 双跑安全。

### 2.3 工具函数

| 函数 | 用途 |
|---|---|
| `estimateSize(key)` | 估算 IndexedDB 中某 key 的数据大小（字节） |
| `clearAll()` | 清空全部持久化数据（设置面板"清空"可复用） |

---

## 3. 水合门控 (`lib/hooks/runtime/useHydrated.ts`)

### 3.1 问题

IndexedDB 是异步存储。zustand `persist` 从 IndexedDB 恢复数据时，首屏 store 为空。若用户在此窗口期发送消息，`createSession` 会创建竞争会话，与稍后回灌的持久化会话冲突，导致活动会话/历史丢失。

### 3.2 方案

每个 IndexedDB 持久化 store 包含 `_hasHydrated: boolean` 标志，通过 `onRehydrateStorage` 回调在水合完成时置真。

`useHydrated(store)` hook 封装 `persist.onFinishHydration` / `persist.hasHydrated()` 订阅，返回 boolean。

### 3.3 消费点

| 消费方 | 门控行为 |
|---|---|
| `ChatPanel` | 未水合时显示"正在加载历史记录…"，禁用输入框 |
| `useChat.sendMessage` | 未水合时直接 return（双保险） |
| `ChatPanel` outbound effect | 未水合时不触发 sendMessage |

---

## 4. 跨 Store 孤儿清理

artifact 随会话产生但分属不同 store。删除会话时需联动清理孤儿 artifact：

- `useArtifacts.prune(keepIds: string[])`：删除不在 keepIds 中的 artifact。
- `useChatHistory.deleteSession`：删除后收集剩余会话的全部 `artifactId`，调用 `prune`。
- `useChatHistory.createSession`：最多保留 50 个会话，溢出的老会话其 artifact 一并 prune。

---

## 5. 持久化 Store 清单

> 完整清点表见 `lib/stores/README.md`（含全部 28 个 store 文件与各自 persist 方式），本节只摘录与本文档持久化分层相关的部分。

### IndexedDB 层

对话历史走 §7 描述的 Storage v2（`chatStorage.ts` 手写 IO，不经 zustand `persist`）；其余 6 个走 `createPersistedStore(..., { storage: "idb" })`（`lib/stores/_persist.ts`）：

| Store | Key | partialize | 说明 |
|---|---|---|---|
| `useChatHistory` | `chat-history` / `chat-manifest` / `chat-session:{id}` | — | 见 §7，不使用 zustand `persist` |
| `useArtifacts` | `artifacts` | `order`, `byId` | 排除 `viewerId`（临时 UI 态）、`_hasHydrated` |
| `useDocuments` | `documents` | `byId` | AI `writeDocument` 工具产物 |
| `useImageGen` | `image-gen` | `sessions` | AI 生图会话记录 |
| `useSkills` | `skills` | `skills` | 用户自定义技能库 |
| `useReviewCards` | `review-cards` | `byId`, `order` | 复习卡片（划词「记录」产生） |
| `useBillingStore` | `billing-history` | — | 账单/用量历史 |

### localStorage 层（不迁移）

| Store | Key | 原因 |
|---|---|---|
| `useSettings` | `gailvlun-settings-v1` | ~1KB，纯配置 |
| `useTheme` | `gailvlun-theme` + `gailvlun-appearance-v1` | ~10B，含 layout 内联防闪脚本 |
| `useFloatingChats` | `quickExplainWindowSize` | ~50B，仅浮窗尺寸（手写 `localStorage.getItem/setItem`，非 zustand `persist`；此 key 历史上曾挂在 `useChatUI`，现搬到本 store，key 名未改） |
| `useBrowser` | `gailvlun-browser-v1` | ~1-5KB，书签/视图模式 |
| `useAcademicYear` | `gailvlun-academic-year` | 学年选择 |
| `useStore`（`lib/stores/ui.ts`，经 `lib/store.ts` 转发） | `gailvlun-sidebar-collapsed` / `gailvlun-topbar-collapsed` | 侧栏/顶栏折叠态 |
| `useKeyboardSettings` | `gailvlun-disabled-shortcuts` | 禁用的快捷键 |
| `quiz-progress`（经 `useQuizStore` / `lib/quiz-progress.ts`） | guest `gailvlun-quiz-progress-v1`；Account owner `ss-user:{uuid}:review-quiz-progress-v2` | 每章即时汇总。旧 v1 无 owner 的数据继续作为本机历史，只有用户明确导入后才绑定账号；完整 attempt 与题组快照在 IndexedDB。 |

---

## 6. 扩展指南

### 6.1 新增 IndexedDB 持久化 store

1. 在 `idbStorage.ts` 的 `PERSIST_KEYS` 中添加新 key
2. 用 `lib/stores/_persist.ts` 的 `createPersistedStore(initializer, { name: PERSIST_KEYS.xxx, storage: "idb" })` 创建 store（内部即 `persist(fn, { storage: createJSONStorage(() => idbStorage) })`，无需自己拼装）
3. 添加 `_hasHydrated` + `onRehydrateStorage` 置真
4. 用 `partialize` 排除临时状态和 `_hasHydrated`
5. 消费方用 `useHydrated(store)` 门控
6. **`name` 必须与已上线 key 逐字相同**——改名等于让用户已存数据消失（`createPersistedStore` 的类型注释也写了这条）。

### 6.2 新增 localStorage 持久化 store

直接使用 zustand `persist` 默认的 localStorage（不传 `storage` 参数），无需走 IndexedDB。

---

## 7. Storage v2 对话分层（2026-06-28）

### 7.1 Key 契约

| Key | 内容 |
|-----|------|
| `chat-manifest` | `{ version: 2, activeSessionId, sessions: SessionMeta[] }` |
| `chat-session:{id}` | `ChatMessage[]`（附件为 `ChatAttachmentRef`） |
| `chat-blob:{id}` | 图片 data-url |
| `chat-history` | v1 遗留；`migrateFromV1IfNeeded()` 成功后删除 |

`SessionMeta` 含 `messageCount`、`preview`、`artifactIds`（冷卸载时 prune 用）。

### 7.2 模块

- `lib/storage/chatStorage.ts`：纯 IO（manifest / session / blob / 迁移 / 导出 hydrate）
- `lib/hooks/chat/useChatHistory.ts`：内存 `sessionsMeta` + `messagesById`（LRU ≤3）；**不再**使用 zustand `persist`
- `ensureChatHistoryBootstrap()`：启动时迁移 → 加载 manifest → 加载 active 会话
- `useChatReady()`：manifest 已加载且 active 会话消息就绪

### 7.3 水合

| 消费方 | 门控 |
|--------|------|
| `ChatPanel` / `FloatingChatBody` | `useChatReady()` |
| `useChat.sendMessage` | `_hasHydrated` + 会话 `messagesById` 就绪 |

`useHydrated(useChatHistory)` 仍可用（`persist` 兼容 shim）。

### 7.4 附件

发送时 `persistInlineAttachments` 将 inline base64 拆到 `chat-blob:{id}`；API 发送前 `hydrateAttachmentsForApi` 还原。

---

## 8. 禁止事项

- **不要**在 store 中硬编码 DB 名或 key 名 — 必须从 `PERSIST_KEYS` 导入
- **不要**在未水合时创建会话或发送消息 — 必须通过 `useHydrated` 门控
- **不要**持久化临时 UI 状态（如 `viewerId`）— 用 `partialize` 排除
- **不要**在 SSR 环境直接访问 `indexedDB` — 必须守卫降级
- **不要**删除 `onRehydrateStorage` 回调 — 否则 `_hasHydrated` 永远为 false，输入被永久禁用
