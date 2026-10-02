# RootSolo Class 远端迁移记录

日期：2026-10-02。目标项目：`RootSolo`，项目 ref `zizaonaxfguvlzdcbxzw`，区域 `ap-southeast-1`。通过父目录 `.mcp.json` 的 `supabase` MCP 连接执行；`supabase-legacy` 对应两个旧项目，仅做目标辨认，未写入。

迁移前，远端已有 `ss_class_sessions`、`ss_class_transcripts`、`ss_class_outlines` 等基础表，但没有本仓库 2026-10-02 四份增量迁移对应的列、函数与纠错表，也没有 `supabase_migrations.schema_migrations`。基线行数：课堂 14、文稿片段 804、导图 12、可视化产物 41、课堂聊天 13。四份 SQL 的 PGlite 隔离回归在执行前再次通过。

按文件顺序逐个调用 MCP `apply_migration`，每一步成功后查询数据库目录确认：

| 本地 SQL 文件 | MCP 记录的迁移 version | MCP 记录的 name | 远端结构结果 |
|---|---|---|---|
| `202610020001_classroom_outline_cas.sql` | `20261002025745` | `classroom_outline_cas_202610020001` | `last_operation_key` 与 `ss_class_save_outline` 存在 |
| `202610020002_classroom_revisions.sql` | `20261002025817` | `classroom_revisions_202610020002` | `cloud_revision` 与父/子修订触发器存在 |
| `202610020003_classroom_corrections.sql` | `20261002025845` | `classroom_corrections_202610020003` | 纠错表、RLS、CAS 函数存在 |
| `202610020004_classroom_session_payload_patch.sql` | `20261002025912` | `classroom_session_payload_patch_202610020004` | 会话 payload 原子 patch 函数存在 |

最终目录复查四项全部存在，六个预期修订触发器已创建。`ss_class_corrections` 启用了 RLS；`anon` 不可执行导图 CAS，`authenticated` 不可执行纠错 CAS，`service_role` 可执行 payload patch。原有五张表的行数与迁移前一致，新纠错表为 0 行。SQL 和目录审计文件位于 `supabase/migrations/` 与 `supabase/audits/`，未读取或导出用户正文。

**迁移历史注意事项**：Supabase MCP 的 `apply_migration` 由服务端生成 version，无法指定本地文件名前缀。因此远端四条 version 与本地 `202610020001`–`004` 不同；name 后缀保留了本地编号以便一一对应。远端原先也没有迁移历史表，不能据这四条记录直接运行 `supabase db push` 以重放本仓库更早的迁移。未来若改用 CLI/CI 管理迁移，先统一建立整条基线并核对已应用结构，再修复历史映射；不要直接重放全部旧 SQL。

这份记录只证明数据库迁移和目录/权限核查。匹配的 StudySolo 前后端仍为本地提交，真实浏览器、双设备同步、计费及上线版本需要各自验收。
