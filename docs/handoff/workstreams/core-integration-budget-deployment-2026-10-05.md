# CORE-INTEGRATION 预算部署准备附录

> status: draft · updated: 2026-10-05

本附录为 PR187 已冻结产品候选之外的部署准备，保持同一 CORE worker。原33个冻结文件不修改。以下迁移、操作导入和环境配置均未执行；未创建VM、未操作浏览器、未重新注册应用或key。父线程审查和外部验收仍决定后续动作，当前不能关闭CORE工作包。

## 唯一迁移来源与边界

Shared 新增唯一 canonical migration：

`1037Solo-Shared/supabase/migrations/202610050001_studysolo_reconciled_budget.sql`

其原始文件字节与冻结 StudySolo `scripts/sandbox/sql/reconciled-budget-candidate.sql` 完全一致，长度2368 bytes，SHA256：

`7568e61fbc2b01e0420b358e97dc4c3968bcf41df8f20d0cf7e1cc8debb57b6d`

以后 Shared 文件是数据库迁移真源；StudySolo候选是本次冻结代码使用的同字节审查/隔离测试输入，不能成为第二套独立迁移历史。后续若必须修RPC，应新增 Shared迁移并重新审查消费者，不修改已应用历史或让两份内容漂移。

迁移只定义 `public.ss_agent_execution_reserve_reconciled(uuid,uuid,bigint,text,text,bigint,bigint,timestamptz,text)`、精确 revoke/grant 和 COMMENT。没有新增表、改会员/额度账本、导入旧 reserve 或修改原 `ss_agent_execution_reserve`。函数 SECURITY INVOKER、search_path空，PUBLIC/anon/authenticated无execute，service_role有execute。它与原RPC使用同一capacity advisory transaction lock，事务内先确认reviewed legacy marker，再阻断所有unreleased占位（包括超过本地TTL的未知创建），随后调用原RPC保留owner/amount/上限/日期/重复ID条件。旧RPC明确只改run/month两个period，不聚合legacy marker。

Shared AGENTS、database规范、migration README和docs-governance均已阅读，现有 Supabase Postgres skill 的 advisory lock/least privilege/short transaction规范已核。Shared在途dirty为 membership相关README/package/index及会员新文件，未触碰；旧006及任何历史迁移未改。没有运行任何SQL。

## 实际迁移登记方案（待父执行）

源码文件版本 `202610050001` 与数据库未来实际applied version不是当前已执行证据。现场现有历史在 `supabase_migrations.schema_migrations`，旧StudySolo相关7条采用实际14位timestamp：isolation、vault、complete packages、feedback、report reason、service table privileges、review progress。不能按本地12位文件名判断这些旧迁移未应用，不能全目录重放。

父审通过后，只处理本次新唯一canonical文件，并采用会写入该正式history tracker的受支持迁移通道。优先使用官方migration apply通道，以name `studysolo_reconciled_budget`和canonical全文提交，读取该通道实际登记的version。若现场只能用SQL Editor执行DDL，它只完成DDL；不得立即宣称migration tracked。此时先读回精确函数definition/ACL/search_path与当前history，确认内容与本次canonical一致、没有已有同名异内容记录，再由父审确认单版本官方migration repair/登记方式。不能对未执行DDL预先stamp，不用全部 `db push` 将旧源码日期误判为pending，不猜测history列结构直接插行。

后续需要保存metadata-only应用回执，至少包含：准确RootSolo projectRef、canonical路径与SHA256、实际执行时间、实际history schema/version/name、函数签名与definition校准结果、service-only ACL结果、actor审批记录引用。若正式通道保留源码版本，则记录该版本；若生成新timestamp，则保存“canonical文件 → 实际timestamp/name”的映射，不伪造历史时间。DDL返回成功、函数读回正确、history登记成功是三个单独的事实，任何一项缺失就标pending。

已查 [Supabase官方migration repair说明](https://supabase.com/docs/reference/cli/supabase-migration-repair)：applied只增加history记录，不运行迁移SQL；因此它只能在本次DDL已正确应用并校准后作单版本登记，不能替代执行或提前标完成。本方案不采用文档中的清空/删除旧history示例。

应用前还应按Shared规范只读核对 `_project_registry`、MUST `_db_conventions` 与 `_project_tables_overview` 的相关元数据，注意其旧快照漂移，不因此变更本次 `ss_` 归属或恢复旧认证。当前本轮未执行这些新查询，父执行前需完成该前提。

## 旧1.8元reserve：独立操作候选，绝非DDL迁移

受限候选：

`.local-archive/connectors-private/core-sandbox-legacy-budget-import-candidate-2026-10-05.sql`

该文件从已冻结报告的import SQL原文提取，SHA256：

`992308ed23273d6bf88157d494bf6c25b0d53538e795d7a50c20b95ba176f6bf`

它只作为当前source/snapshot下的一次性operator budget adjustment候选，留在ignored受限目录，不能进入Shared迁移历史或公开发布diff。操作前必须重新冻结并核对本机账本，且父审确认实际账单与预算余量；当前检查仅验证本机仍6条、全部released、source fingerprint未变化。没有读密钥或打印owner行。

依赖的原source fingerprint：

`0594c0c9fd92462ad24a081f4e8827c67324a4d22b457ef4241a944c7422b519`

算法沿既有reconcile脚本：对每条 `[id, amount, month, run]` 排序后JSON取SHA256；不是简单把财务数当身份，也不是invoice。旧local reserve合计1,800,000 microCNY；shared合计300,000，ID重叠0、冲突0。操作不搬owner/session/grant，不删除local历史，不抹shared .3。

候选事务条件：

- 使用与准入相同的capacity advisory transaction lock。
- 首次操作要求shared reservation精确1条、同原month/run合计300000、无unreleased；run/month各reserved300000且cap70000000，正是UTC12:09:57现场snapshot。现场变化就抛错回滚，不自动改数。
- 插入唯一 `legacy:<fingerprint>` marker，reserve/cap均1800000；run/month各补1800000，必须精确更新2条。全部在同一事务里，任何失败不落部分金额。
- marker已存在时不再次增额；必须marker精确金额且两个预算period均已至少2100000、cap仍70000000，否则冲突拒绝。source变化须另报审，不生成新fingerprint来重复导入同一费用。
- marker是operator去重/审计占位，report不能把它再次与run/month总额相加。原RPC只更新明确run/month，现有cleanup/release不删budgets，live service_role也无DELETE。

成功后保守合并reserve是2.1元，不等于实际消费或真实余量。操作导入需单独保存before/after metadata及审批引用；它不生成一个名为migration的成功记录。表/RPC迁移登记和operator adjustment审计不可混为一件事。

## 后续环境与上线顺序（本轮均未执行）

候选新增变量只有服务端 `CLOUD_SANDBOX_BUDGET_AUTHORITY`、`CLOUD_SANDBOX_BUDGET_IMPORT_FINGERPRINT`；文件/作用范围为StudySolo `.env.local`、`.env.production`及后续正式既有部署项目环境，不改Windows全局。变量值由父在受限环境文件内按审查方案设置，不在报告打印环境值。保留原runID、70元计算cap、月/本轮100元上限、固定allowance、永久key、模板与加密key。

先实际invoice/Team配置与余量核查，再应用并核对新唯一canonical RPC及history，独立执行并读回reviewed import，最后配置shared authority/fingerprint并按既有正式发布链生效。任何步骤缺失，新create必须继续fail closed，不退回本地第二ledger。纯聊天/MCP及已存产物读取与本人止损不能因import尚未完成整体停死。

未来真实Cloud业务仍须用正常账号逐项验：fresh认证→open→完整skill安装/useSkill→write/原脚本render→publish→鉴权下载→cancel/timeout/后台清理/durable log/close→实例库存回收；验证跨账号/跨会话和未知创建。迁移/配置成功不等于该业务链通过，不在账单未核时创建新VM来抢跑验收。

回退只禁新create：保留预算marker、已计reserve、原local账本和正式history，禁用或不启用新authority配置；保留本人read/cancel/close与已保存下载。不能删除marker、退款式减旧reserve、重置runID、切回本地独立预算或重放006。数据库确已应用的新增RPC暂留但消费者不调用，比删除/改回历史函数更可审计。

## 新实际证据与外部待办

Chrome原批准开发测试账号在本机 standalone Agent、DeepSeek V4.1 Flash真实模型编排七服务最小read全部通过（UTC2026-10-04 12:16:12）：GitHub、Todoist、Notion、Google、Zotero、PubMed、Crossref均有成功read结果卡。首轮discover缺provider得到 `PROVIDER_REQUIRED`，模型随后按明确provider恢复；不能把该初始拒绝隐藏成首轮无错，也没有把错误当业务数据。共7张read结果卡，无外部写入、无Cloud命令、无私人payload留报告。Zotero返回空集合仍是正确成功；它与native上一轮不同查询结果不可混用。

受限metadata：`core-mcp-acceptance-2026-10-04/chrome-seven-service-model-read.json`。这是已允许测试用户的本机真实技术链，不能覆盖Edge常用账号授权差异、正式RootSolo vault/远端部署/新Google授权和生产用户验收。它补上原仅native read的证据，不需要重新OAuth或注册应用。

Chrome准确RootSolo Pro实时schema/history/budget已核，分别见 `core-sandbox-live-schema-2026-10-05.json`、`core-sandbox-live-history-2026-10-05.json`、`core-sandbox-live-budget-2026-10-05.json`。四表RLS开启，content/budget/reservation只service arw，locks arwd；相关5RPC仅service execute且security invoker，kind含skill；run/month各.3、cap70、reservation1/unreleased0，bucketprivate。旧Management API403只是独立旧通道，不能据此说用户没有RootSolo权限。

实际Ali invoice仍未读：Edge费用入口仅壳、table0不表示费用0；Chrome当前费用入口需本人登录。Team/永久key不失效设置/角色、实际本轮与月compute+template/storage费用、父审后的RPC/import/env执行、真实新Cloud全链与正式版本验收仍pending。父线程继续处理现场登录；本worker本轮没有操作浏览器。

## 本轮精确新增文件与验证

1. Shared `supabase/migrations/202610050001_studysolo_reconciled_budget.sql`（唯一新canonical迁移，待审未应用）。
2. StudySolo `docs/handoff/workstreams/core-integration-budget-deployment-2026-10-05.md`（本附录）。
3. ignored受限 `core-sandbox-legacy-budget-import-candidate-2026-10-05.sql`（独立操作候选，不入Git）。

验证仅为文件准备所需的字节/hash、source fingerprint、git差异与冻结文件完整性核对；不跑数据库迁移或SQL。原RPC候选逻辑已经被上一轮隔离PGlite和冻结CI覆盖，复制同字节不增加产品逻辑。主后续精确审查Shared单文件，不夹带其会员在途内容；原33冻结文件/PR187不修改。
