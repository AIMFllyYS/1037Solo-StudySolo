# L6 · 云端同步与本地回收

> **一句话**：让对话与产物跟人走，同时把「本地只增不减」的垃圾清掉。
> **Issue**：#73 #74（0 个 P0；#73 是 P2，#74 是 P1）
> **来源 Epic**：E20 #46
> **冲突域**：`CD-new`（#73）+ `CD-client`（#74）
> **顺序**：L4 之后。原因见第 5 节——#72 会改 `lib/stores/settings.ts` 的存储通道，#73 的 `settings` kind 同步要建立在它之上。

## 1. 为什么这 2 个号是一个 loop

#74 的正文自己就写了理由：**「云端有权威副本后，本地淘汰可以更激进」**。

反过来说：在没有云端副本之前，本地 GC 只能小心翼翼（删错了数据就真没了）；有了云端副本，`MAX_SESSIONS = 50` 的淘汰可以放心删本地、需要时从云端拉回。两个号共享同一个判据——「这条数据在云上还有没有」。拆开做的话 #74 只能做一个保守版本，等 #73 落地还要回头再改一次。

它们也共享同一批文件：`lib/stores/chatHistory.ts`、`lib/storage/chatStorage.ts`、`lib/stores/artifacts.ts`。

这个 loop 很小，**一个 A 阶段**，但它是本轮唯一涉及「双向数据流 + 冲突合并」的号，实现难度不低。

## 2. 当前基线（已核实）

### 2.1 云端表已就位

`supabase/migrations/0001_init.sql:113-124`：

```sql
create table if not exists public.sync_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_users (id) on delete cascade,
  kind       text        not null check (kind in ('chat-session', 'artifact', 'settings', 'skill')),
  client_id  text        not null,
  payload    jsonb       not null,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, kind, client_id)
);
create index if not exists sync_documents_user_kind_idx on public.sync_documents (user_id, kind, updated_at desc);
```

**RLS 是 `for all`**，这是全库唯一允许客户端写的表：

```sql
create policy sync_documents_all_own on public.sync_documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

含义：**同步不需要新开服务端路由**，浏览器带用户 JWT 直接读写即可。`deleted` 列是软删标记（给多端删除传播用），`updated_at` 有自动维护触发器（`sync_documents_touch`）。

**全库除迁移测试外没有任何 `.from('sync_documents')`** —— 表建好了，客户端零写入。云同步现在是 schema 债，不是已上线能力。

**⚠️ `kind` 的枚举里没有 `document`。** 而项目有三个产物 store：

| 产物 | store | persist key |
|---|---|---|
| Artifact（HTML） | `lib/stores/artifacts.ts` | `"artifacts"` |
| Document（长文档） | `lib/stores/documents.ts` | `"documents"` |
| 生图会话 | `lib/stores/imageGen.ts` | `"image-gen"` |

`writeDocument` 的产物按现有枚举**无法同步**。#73 要么加一次迁移把 `document` 加进 `check` 约束，要么明确「文档不同步」并写进交回摘要。推荐前者——长文档是用户花了钱生成的，换设备丢了最可惜。生图会话不要同步（图片不上云的延伸）。

### 2.2 本地存储布局

`lib/storage/idbStorage.ts:17-37`：

```ts
export const PERSIST_KEYS = {
  chatHistory: "chat-history",
  chatManifest: "chat-manifest",
  artifacts: "artifacts",
  skills: "skills",
  reviewCards: "review-cards",
  imageGen: "image-gen",
  billingHistory: "billing-history",
  documents: "documents",
} as const;

export const CHAT_SESSION_KEY_PREFIX = "chat-session:";
export const CHAT_BLOB_KEY_PREFIX = "chat-blob:";
```

Storage v2 的形态：manifest（`chat-manifest`）+ 分片（`chat-session:<id>`）+ 附件正文（`chat-blob:<id>`）。`chat-history` 键不存在是**预期形态**，不是数据丢失（见 `docs/plans/archive/00-execution-contract.md` 的 Agent 与状态契约）。

### 2.3 三个已核实的本地泄漏

| 位置 | 现状 |
|---|---|
| `lib/stores/chatHistory.ts:22` | `const MAX_SESSIONS = 50;` |
| `lib/stores/chatHistory.ts:190-194` | 超限淘汰时 `void deleteSessionData(d.id, [])` —— **blobIds 传空数组** |
| `lib/stores/chatHistory.ts:232-233` | **对比组**：用户主动删除会话时会先 `listBlobIdsForSession` 再传给 `deleteSessionData`，blob 删得干净。所以不是「不会删」，是**淘汰路径漏了**——同一个文件里两种写法 |
| `lib/storage/chatStorage.ts:127` | `deleteSessionData(sessionId, blobIds = [])` 只删传进来的 blob |
| `lib/storage/chatStorage.ts:291` | `async function listAllChatKeys()` —— **模块私有且全库零调用**，没有任何按 manifest 回收孤立键的 GC |
| `lib/stores/chatHistory.ts` 的 `createSession` | 用 `Date.now().toString()` 当 id，同毫秒连开两个浮窗会撞 id |

后果链：淘汰会话 → 分片可能删了但 `chat-blob:*` 永远留着 → 浏览器存储只增不减。另外 `messagesById` 不清理被淘汰的 id，若该会话仍在内存、之后又 `updateMessage`，会把 `chat-session:*` 写回 IDB 而 manifest 已无入口 → 孤立键。

### 2.4 前置条件都已满足

- 登录态：#61–#63 已落地。`lib/hooks/useAuthSession.ts` 有会话状态，`installAiAuthFetch` 会给请求补 Bearer。
- `app_users` 行在注册时自动建好（`on_auth_user_created`），`sync_documents.user_id` 的外键有目标。

## 3. 分阶段实施（单阶段 A）

### 3.1 #73 云端同步

**同步什么**：对话纯文本（`chat-session:*` 的文本部分）、artifact HTML 产物。

**明确不同步**（写进 A 的提示词，这是硬边界）：

- 用户上传的图片 —— 继续本地解析，留在 `chat-blob:*`。**图片绝对不上云**（免费层 5 GB 出流，一张图就能把它吃掉）
- 任何笔记内容 —— `content/` 是随包分发的静态资源

**容量硬约束**：免费层 500 MB 库 + 5 GB 出流。按「对话文本 + artifact HTML」估约 2 MB/用户 → 约 250 人。所以：

- 单条 artifact 必须有体积上限（建议先量一下现网 artifact 的 HTML 中位与最大值再定数字）
- 单用户总量必须有上限
- 超限要有明确的用户可见提示，不能静默丢弃

**冲突合并**：多端编辑同一会话。`unique (user_id, kind, client_id)` 决定了同一个 `client_id` 只有一行，所以必须有合并策略。最简可行方案：

- 以 `updated_at` 做 last-write-wins，但**写入前先拉一次**，若远端 `updated_at` 比本地已知的基线新，则把两边的消息按 id 并集合并（对话是 append-only 的，消息按 id 去重后按时序排列，语义上安全）
- 合并结果要能被用户看见，**不能静默丢消息**（验收标准原文：「多端编辑同一会话有明确的合并结果，不会静默丢数据」）

**删除传播**：用 `deleted` 软删列，不要物理删（否则另一端无法区分「对方删了」与「我还没拉到」）。

### 3.2 #74 本地孤立键回收

1. `chatHistory.ts:194` 的淘汰路径改成先取出该会话的 blobIds 再 `deleteSessionData(id, blobIds)`——**照抄同文件 232-233 行主动删除路径的写法**，那里已经做对了。
2. 让 `listAllChatKeys` 真正被用上：写一个按 manifest 比对的 GC——枚举所有 `chat-session:*` 与 `chat-blob:*`，凡是 manifest 里没有入口的就删。
3. GC 的触发时机：不要在启动关键路径同步跑（会拖慢首屏）。建议空闲时或会话淘汰之后异步跑一次。
4. `messagesById` 在淘汰时一并清理被淘汰的 id，断掉「写回已淘汰分片」的路径。
5. `createSession` 的 id 换成 `crypto.randomUUID()`（`lib/stores/billing.ts` 里已经在用这个，形态一致）。
6. 云端有权威副本之后，本地淘汰可以更激进——但**这一步要保守**：确认 #73 的上行确实成功之后才允许激进删除，否则就是用云同步的名义丢数据。建议本 loop 只做「不再泄漏 + 回收孤立键」，「更激进的淘汰」写进交回摘要的「未覆盖」留到以后。

## 4. 不变量

- **persist key 一律不得改名。** `PERSIST_KEYS` 里的 8 个键、`chat-session:` / `chat-blob:` 两个前缀，全部已落在用户的 IndexedDB 里。改名 = 用户数据凭空消失。
- **`chat-history` 键不存在是预期形态**（v2 是 manifest + 分片），不要把它当数据丢失去「修复」。
- **图片不上云。** 这不是优化取舍，是容量硬约束。
- **`sync_documents` 是全库唯一客户端可写的表。** 不要顺手给别的表加 `for all` policy。
- **不要物理删云端行**，用 `deleted` 软删。
- store 清点口径 28 个（见执行契约），新增 store 要按那个口径记。

## 5. 与其他 loop 的耦合

- **L4 的 #72（apiKey 明文治理）会改 `lib/stores/settings.ts` 的存储通道。** 而 `sync_documents.kind` 支持 `'settings'`。如果 L6 先做并把设置也同步上云，而 #72 之后又改了设置的落盘形态，就要迁移两次。**所以 L6 排在 L4 之后**，并且本 loop 建议**先不同步 `settings` kind**（只做 `chat-session` 与 `artifact`），把 `settings` / `skill` 留到以后。这一点要明确写进 A 的提示词。
- **绝对不能同步 apiKey。** 即使以后做 settings 同步，`customApiGroups[].apiKey` 必须排除在 payload 之外。

## 6. 合并验收

**#73**
- [ ] 换设备登录后能看到历史对话与 artifact 产物
- [ ] `sync_documents.kind` 的处置有明确结论（加 `document` 枚举，或写清文档不同步）
- [ ] 图片与笔记内容确认未上云（用 Supabase 侧直接查 `sync_documents` 取证，断言 payload 里没有 base64、没有笔记正文）
- [ ] 单条 artifact 与单用户总量都有上限保护，超限有可读提示
- [ ] 多端编辑同一会话有明确的合并结果，不会静默丢数据

**#74**
- [ ] 淘汰会话时其图片一并删除
- [ ] 孤立键能被回收，`listAllChatKeys` 真正被使用
- [ ] session id 不会因同毫秒创建而碰撞

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0

## 7. Loop 末尾端测脚本

1. 登录态下发一轮对话 + 生成一个 artifact。
2. 在 Supabase 侧确认 `sync_documents` 出现了对应的 `chat-session` 与 `artifact` 行，且 `payload` 里**没有** base64 图片。
3. **模拟换设备**：清掉 IndexedDB（DevTools → Application → IndexedDB 删库）后刷新、重新登录 → 历史对话与 artifact 回来了。
4. 贴一张图片发一轮 → 确认图片仍在本地 `chat-blob:*`，云端没有。
5. 造孤立键：手动往 IndexedDB 写一个 manifest 里不存在的 `chat-session:zzz` → 触发 GC → 该键被删。
6. 快速连点两次「新建会话」→ 两个会话 id 不同。
7. 控制台无 403（RLS 拒绝）、无 500。

端测者交回 `tmp/issues/sync-l6-e2e.md`。

## 8. 提交与关单

| commit | 内容 | Closes |
|---|---|---|
| `feat(sync): mirror chat text and artifacts to the cloud` | #73 | `Closes #73` |
| `fix(storage): reclaim orphaned chat keys on eviction` | #74 | `Closes #74` |

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| **同步把用户数据搞丢**（本 loop 最大风险） | 合并策略必须是「并集 + 按 id 去重」，不是覆盖。端测第 3 项（清库重登）是必过项 |
| 图片意外上云，出流被吃干 | 端测第 2 / 4 项直接取证。payload 组装处要有显式的 blob 引用剥离，并有单测 |
| GC 删掉了还在用的键 | GC 必须以 manifest 为唯一真相源；删除前先确认该键不在 manifest 的任何入口下。要有单测覆盖「manifest 有入口的键不被删」 |
| 云端体积上限判断错误，写入被 Postgres 拒绝导致同步静默失败 | 上限在客户端先判，拒绝时给可读提示；同步失败要有可见状态（不是静默 catch） |

**这是最适合被放弃的 loop。** #73 是 P2、#74 是 P1，都不阻塞任何其他 loop，且 #73 的实现复杂度（双向同步 + 冲突合并）明显高于其余号。如果 C 之后仍不通过：

- 优先保住 #74（纯本地 GC，风险低、收益确定）
- #73 打 `blocked` + 诊断评论，半成品推 `wip/73-cloud-sync`
- 不要为了让 #73 过而放宽「不丢数据」的验收标准
