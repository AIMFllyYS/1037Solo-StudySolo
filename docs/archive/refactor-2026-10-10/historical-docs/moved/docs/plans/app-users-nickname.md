# app_users.nickname 迁移

给现有 `public.app_users` 加展示昵称。头像**不进云库**，只在本机 `localStorage`（`studysolo-user-profile`）persist。

## 现状

`0001_init.sql` 的 `app_users` 只有 `id / email / tier / period_*`。`0002` 已撤销 authenticated 对这张表的 INSERT/UPDATE/DELETE，防止客户端改档位。

## 本轮变更（`0006_app_users_nickname.sql`）

1. 增加可空列 `nickname text`。空或未设时，客户端用邮箱 `@` 前缀。
2. 不增加 `avatar` 列，也不走 Storage。
3. RPC `update_own_nickname(text)`：`security definer`，只改当前 `auth.uid()` 的昵称，最长 40 字。档位 / 周期仍不可被客户端改。
4. 应用读改走 `/api/profile`（会话鉴权 + service_role 只写 `nickname`）。

## 怎么跑迁移

```bash
pnpm exec tsx scripts/db-migrate.ts
```

或把 `supabase/migrations/0006_app_users_nickname.sql` 贴进 Supabase SQL Editor。幂等：`add column if not exists` + `create or replace function`。

未跑迁移时：`GET/PATCH /api/profile` 会因缺列失败；左下角仍用邮箱前缀本地显示，头像仍可本机更换。
