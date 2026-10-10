# 个人笔记 + 闪卡云同步迁移

把 `userNotes` / `reviewCards` 从「只存本机 IndexedDB」接到现有 `sync_documents` 真云同步。不新建服务端路由：浏览器带 JWT 直写，与对话 / 演示 / 长文档同一张表。

## 现状

| 产物 | 本机 persist | 上云 kind（旧） |
| --- | --- | --- |
| 对话 | `chat-session:*` | `chat-session` |
| 演示 HTML | `artifacts` | `artifact` |
| 长文档 | `documents` | `document` |
| 个人笔记 / 课堂便签 | `user-notes` | 无 |
| 复习闪卡 | `review-cards` | 无 |

设置 / skill 仍不同步。图片、PDF、API 密钥仍不上云。

## 表结构（已有）

`public.sync_documents`（`0001_init.sql`）：

| 列 | 说明 |
| --- | --- |
| `id` | uuid pk |
| `user_id` | 登录用户，RLS `auth.uid()` |
| `kind` | 枚举 |
| `client_id` | 本机笔记 / 卡 id |
| `payload` | jsonb |
| `deleted` | 软删，多端传播 |
| `updated_at` | 触发器维护 |

唯一约束 `(user_id, kind, client_id)`。

## 本轮变更（`0005_sync_user_notes_flashcards.sql`）

1. `kind` 增加 `user-note`、`review-card`。
2. 单条上限：会话 5MB、演示 1.5MB、文档 2.5MB、笔记 2MB、闪卡 256KB。
3. 账号合计 48MB。
4. **独立额度池**：笔记合计 20MB、闪卡合计 20MB（超限报 `sync_pool_limit`）。
5. payload：
   - `user-note`：`id, title, markdown, subjectId, createdAt, updatedAt, kind?, quote?, source?`
   - `review-card`：现有 `ReviewCard` 全字段（无图片）
6. 冲突：`updatedAt` last-write-wins（与 artifact / document 相同）。对话仍按消息 id 并集。

客户端入口：

- 笔记：`notifyUserNoteChanged` → `scheduleCloudUpsert("user-note")`
- 闪卡：`useReviewCards` 写入路径直接 `scheduleCloudUpsert("review-card")`

## 怎么跑迁移

仓库脚本：

```bash
pnpm exec tsx scripts/db-migrate.ts
```

或把 `supabase/migrations/0005_sync_user_notes_flashcards.sql` 贴进 Supabase SQL Editor。

幂等：`drop constraint if exists` + `create or replace function`。本地 Agent 若有 service role，可代跑；无密钥时只提交 SQL + 本文档即可。

未跑迁移时：客户端会写 `user-note` / `review-card`，云端 check 约束会拒。本机 IndexedDB 仍保留。

## 设置页额度

Agent 设置 → 云端同步：

- 总占用 / 48MB
- **笔记额度池** / 20MB
- **闪卡额度池** / 20MB
- 各 kind 分条（对话、演示、文档、个人笔记、复习闪卡）
