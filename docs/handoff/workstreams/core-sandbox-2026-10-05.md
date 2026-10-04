# CORE-INTEGRATION · CORE-SANDBOX 当前工作报告

日期：本机 2026-10-05（UTC+13）；只读外部盘点时间为 2026-10-04 UTC。同一 CORE-MCP worker 继续完整 Cloud 工作包，未派子、未提交、未发行。父线程独占账本、发布和独立实页验收；本报告不是完成声明。

## 当前结论与验收边界

普通独立 Agent 的纯 PubMed 请求，之前在模型开始前被 Cloud 的近期 MFA 验证阻断。实际前置路径是 `/api/agent/chat` → 共享 `/api/chat` → `sandboxScopeForChat` → `authorizeSandbox` → Account live UUID + sensitive recent MFA。开启 Cloud 不等于每条消息已要求执行云命令；原实现把建立工具上下文当成了敏感执行。已经将普通上下文改为 live 身份与准确 Agent 入口检查，敏感验证保留在每一次实际风险动作上。

当前已实现可逆代码和定向自测，尚未冻结最终候选。父线程已用正常账号完成本机公开 MCP 模型读取，原 eager REAUTH 阻断消失；真实新建/命令/技能脚本/发布下载/停止回收、正式部署版本和实际费用仍必须分别提供业务证据。没有创建新的 VM、没有购买/重建模板、没有改永久 key、没有写数据库/环境或重跑 006。MCP 草稿和 CI 合同修复已在父线程冻结并通过完整 CI；私人 OAuth grant 与联合核心验收仍未完成。

## 已确认的整包问题

1. 原 Scope 在长流开始时一次决定 `canExecute`，所有后续风险动作能沿用旧决定；当前每次模型工具动作重新 live 查询身份，再按动作核验近期 MFA，同时检查当前 owner 与原流 owner 一致。Scope 的服务器 Symbol 保留，JSON/模型不能构造权威。
2. 原 cancel/close 与 create/exec/write/publish 共用 recent gate。VM 可存在 15 分钟、命令可存在 10 分钟，近期验证也只有 10 分钟，旧设计可能阻止本人止损。当前已有本人资源的停止/关闭保留同源、准确 standalone Agent、owner/会话/提供者绑定，允许非 recent live 身份执行。
3. 原结果卡用 `window.confirm`，并将认证失败缩成布尔错误，没有准确 Account 恢复路径。当前复用共享 `components/shared/ConfirmDialog.tsx`、原 semantic 样式、Toast store 和 Account 链接；保存原请求，只有确定尚未执行的近期认证拒绝可由本人主动继续。
4. 单纯组件 local state 不能防止刷新/新 tab 重发原 exec。当前在既有加密 command 记录中保存明确 `recordType: auth-retry` 的短期票据，固定 owner、会话、原输入、15 分钟 TTL；执行前落 `started`，成功保存结果，未知保留 `uncertain`。再次提交仅取已有结果。全部 command 枚举、poll、maintenance、cleanup 都通过判别函数排除票据，旧无 discriminator 的真实 command 兼容。
5. 原 publish 先上传、后随机 UUID 登记。未知上传结果可能产生未登记对象，重试又换 UUID。当前先以 owner/session/path/内容 SHA 固定 ID，写 pending 限额占位，随后上传；未知结果保留该 ID，下一次相同 publish 先读取存储并核对完整 hash/size，再幂等恢复。ready 以前不能下载，下载后仍核对内容。20 MiB/20 个/100 MiB 限额含未确认占位。生产只用固定 private bucket，不覆盖已有对象。
6. 原 owned 查询只有最新 50 条，能漏掉同一会话旧占位/命令。当前用固定 owner/kind 有序分页完整查询，分页失败直接报存储不可用。
7. 原 unknown-create 查找只查 running，并用 SDK connect 包装结果。官方 SDK connect 可恢复 paused；当前查完整 running+paused，严格固定 application/executionId/scope metadata，只返回精确 ID 的 kill 句柄，不 connect/恢复。空列表和本地 TTL+60 秒不足以确认未知 create，保留 uncertain。旧 open 在过 TTL 后忽略 stop 仍 uncertain 并继续创建，也已修为原会话未确认停止就不另分配。长期未知需要运营精确核查，不能静默用时间估计清掉占位。
8. 原 Cloud 技能安装状态吞认证 code，过期按钮没有恢复；已保留 Account 错误和准确链接，状态刷新不会自动 POST，原 package 在本人第二次点击时重试。API 返回 ownerBinding 仅作 UI 一致性校验，实际权限仍来自 Account。owner epoch/abort 避免迟到的旧账号结果进入新账号技能列表；cookie owner 与已验证 UI owner 不一致时不水合。
9. 原技能发现/存储故障可阻断普通聊天。只对明确 VM 配置/技能存储不可用做局部提示并去掉未验证的 Cloud package 内容，保留普通聊天；不吞 Account 身份限制，不宣称技能已安装。
10. 同一 Ali provider binding 的 dev file reserve 与 prod DB reserve 独立，不能证明共享 100 元上限。已加入真实环境 reserve 的 shared authority + RootSolo DB + 已审查 import marker fail-closed 代码；未准备 marker 前明确拒绝新创建。测试 fixture 本地账本是 `NODE_ENV=test` 专用，不作为真实计费备用。
11. 真实模型 read/status/discover 卡片曾将同一大 JSON 同时放在常驻 paragraph 和闭合 details，助手消息高度2448px。当前复用原卡片及原详情，将常驻内容改为明确完成摘要、保留服务与来源，所有原始数据仅在默认闭合的 details 内。父线程实页 reload 验证消息高度770px、PMID/来源恢复正常；详情展开仍待冻结后实页检查。

close 当前始终直接 DELETE 精确已知 providerId，不调用 connect 抓最后一段日志；保留已持久 output，未知 exitCode 不伪造。销毁前未落盘的输出可能不可用，真实回收验收必须检查定时 poll/maintenance 是否已保存所需日志。read/poll/cancel 的 getInfo→SDK connect 有供应商跨调用窗口：已知 paused 会被拒绝且测试0connect，但外部 Console 在两次调用之间并发 pause 尚无原子 no-resume 保证。按父审本轮保留此明确限制，不用 private SDK字段/constructor/debug 绕认证，不宣称测试证明任意并发下都不唤醒。

## 动作与接口合同

|动作|身份及验证|实际作用|
|---|---|---|
|普通独立聊天/纯 MCP|Account live、MFA 登录已完成、准确主 Agent 入口|建立只读 Cloud 上下文，不创建 VM|
|status/poll/read/list/已保存下载|Account live、同源/Agent surface、owner 与会话绑定|读取自己的状态/文件/结果|
|cancel/close|同上；不用 recent|停止自己的原命令/资源；不能指定外部 owner/provider identity|
|open/exec/write/publish|每次重新 Account live + 所需 recent MFA，same owner 与会话，服务端 Scope|创建/执行/写入/发布风险动作|
|skill install/uninstall|Account live + 所需 recent MFA，同源、精确技能管理页面|固定批准 package 的本人安装状态|
|auth-retry GET|live、准确当前 Agent surface、owner/会话/TTL、UI binding|读取票据固定输入与真实状态，绝不执行|
|auth-retry POST|上述条件 + 原输入动作所需 recent；固定服务端票据、lease|仅继续确定前置认证拒绝；started/unknown 不重发|

`/api/agent/sandbox` POST 保留 JSON/code/status 契约。`/api/agent/sandbox/retry/[id]` GET 使用固定 conversation query，POST 只接受 conversationId，UI 不能替换 command/path/content。`/api/agent/skills` GET/POST 返回或核对公开 owner hash。`/api/agent/sandbox/artifacts/[id]` 保留当前账号鉴权下载。现有 Desktop Cloud bridge 只补这组固定路径/owner 一致性头，目标仍固定 StudySolo，不注入或转发云/数据库秘密；未改客户端核心。

Studio/Class/Review/note/plan/image 等没有新增 Cloud Scope/执行能力。MFA 未完成的身份仍拒绝作为已登录，不因“普通聊天”豁免本人登录验证。Authentication ticket 仅在已 live 识别同 owner 的 `REAUTH_REQUIRED` 且尚未进入 operate 时生成；缺存储时只保留原错误，没有虚假可继续能力。

## 当前资源、费用、存储盘点

受限 metadata：`.local-archive/connectors-private/core-sandbox-inventory-2026-10-05.json`，观察 UTC 11:30:31；全部只读。

- 现有模板 live buildStatus=ready，与原配置引用一致；未重建、未发布模板。
- Running + paused 完整列表总数 0，分页完成；这证明观察时库存，不代表历史 create 已证明无分配，也不是本轮超时验收。
- Notes to Handbook 完整 9 文件、GB 完整 17 文件逐文件 hash 通过。保留原 runtime、原脚本和依赖链，不缩成 SKILL.md。
- dev 和 `.env.production` 文件配置有效、skills marker/模板一致、同一 provider binding，原 `studysolo-2026-10-04` runId 保留。生产文件准备不代表远端部署生效。
- 当前 RootSolo DB execution records 2（session 1、command 1）；该 session 可解密、绑定匹配、closed。历史开发黄金链不替代当前正常 MFA 账号业务验收。
- `ss-agent-artifacts` 现有 bucket 存在且 private；没有新上传真实业务文件。
- 只读对账 UTC 11:52:52：local6条 reserve=1.8 CNY，全已 released；shared1条=.3 CNY；ID 重叠0、身份冲突0；保守合计2.1 CNY。不是实际 bill，不由此算真实余额或宣称费用已闭环。
- shared run cap=70,000,000 microCNY（固定30元 allowance后的计算准入）；仍是 allowance，不能当 actual compute/template/storage bill。

官方 [Ali 计费说明](https://help.aliyun.com/zh/agent-sandbox/product-overview/billing-overview) 与 [生命周期说明](https://help.aliyun.com/en/agent-sandbox/user-guide/lifecycle) 已核；暂停/模板存储不等于零费用，connect 可恢复实例。Supabase [Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes) 用于区分明确 NoSuchKey 与 bucket/网络错误；不将所有错误当对象不存在。

现有支持 CUA 的 Ali 页面读取尝试失败（inventory 可见 RAM overview，后续受支持状态/新 tab 调用超时）。未读 key/邮箱/账单账户正文，已将 CUA 独占交回父线程。父线程继续只读账单和普通 MCP 模型验收；本 worker 未再次控制浏览器。

## 外部配置与预算候选（未执行，等待父审）

所有新创建在当前 marker 未准备时 fail closed。拟生效范围仅 StudySolo server `.env.local`、`.env.production` 及后续正式既有部署项目环境；不改 Windows 全局、不把秘密发给 VM/模型。

候选变量名：`CLOUD_SANDBOX_BUDGET_AUTHORITY`、`CLOUD_SANDBOX_BUDGET_IMPORT_FINGERPRINT`。保留现有 `CLOUD_SANDBOX_BUDGET_RUN_ID`、月/本轮预算、固定 allowance、API key、模板和加密 key。当前没有写这些变量。

对应 marker 首次读取位于 `PersistentExecutionStore.authorizedBudgetDb()`：要求明确 shared 模式、固定 RootSolo host、64hex 已审查 source fingerprint，查询 `period_key=legacy:<fingerprint>` 且 reserve/cap 都精确1,800,000；失败拒绝创建。实际准入改调新增候选 `ss_agent_execution_reserve_reconciled`，其内部在同一 capacity advisory transaction lock 下重新核对 marker 与任意 unreleased 资源（包括过本地 TTL 的未知创建），再调用原 RPC；JS 预查不作为并发权威。release/close 不要求 marker，以免阻碍止损。DB 不可用没有第二份本地真实预算 fallback。

本机现有 Management API 通道仍403（UTC11:58:40，metadata `core-sandbox-schema-audit-2026-10-05.json`），但父线程已恢复 Chrome4 的准确 RootSolo Pro SQL编辑器，完成真实只读 schema/ACL/history 审计。这不是用户缺权限：绝大多数登录在 Chrome，早先只有 Edge 的错误组织账号与扩展连接缺失造成 UI不可用。

现场 `core-sandbox-live-schema-2026-10-05.json`（UTC12:07:31）确认四表 RLS=true；records/budgets/reservations 的 service_role 为 SELECT/INSERT/UPDATE、无DELETE，locks含DELETE；5个相关RPC仅postgres/service_role execute、security_definer=false；kind实际含skill；当前旧 reserve 仍按 expires_at 筛选，capacity advisory锁精确匹配新候选。budget只在明确run/month period增加，legacy marker不会参与该聚合；现有回收与release不删budgets，service_role也无DELETE。

现场 `core-sandbox-live-history-2026-10-05.json`（UTC12:07:52）含实际timestamp：20261003161359 isolation、161717 vault、165536 complete_skill_packages、190412 feedback、190900 report reason、191211 table privileges、202046 review progress。不能按源码文件日期当成未应用。006/后续 ACL正确部分不修改、不重放。以下 import DML和新增RPC仍需父审及实际账单核对，未执行。

```sql
-- Candidate operational budget import only. NOT executed; no historical SQL replay.
-- Prerequisites: current RootSolo schema/history/ACL, actual invoice, and frozen
-- original local source fingerprint must be reviewed before this transaction.
begin;
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('ss_agent_execution_capacity', 0));
do $$
declare n integer;
begin
  if exists(select 1 from public.ss_agent_execution_budgets
    where period_key='legacy:0594c0c9fd92462ad24a081f4e8827c67324a4d22b457ef4241a944c7422b519') then
    if not exists(select 1 from public.ss_agent_execution_budgets
      where period_key='legacy:0594c0c9fd92462ad24a081f4e8827c67324a4d22b457ef4241a944c7422b519'
        and reserved_micro_cny=1800000 and cap_micro_cny=1800000) then
      raise exception 'legacy_marker_conflict';
    end if;
    if (select count(*) from public.ss_agent_execution_budgets
      where period_key in ('month:2026-10','run:studysolo-2026-10-04')
        and reserved_micro_cny>=2100000 and cap_micro_cny=70000000) <> 2 then
      raise exception 'legacy_budget_conflict';
    end if;
    return;
  end if;
  if exists(select 1 from public.ss_agent_execution_reservations where released_at is null)
    then raise exception 'unresolved_capacity'; end if;
  if (select count(*) from public.ss_agent_execution_reservations) <> 1
    or (select coalesce(sum(reserved_micro_cny),0) from public.ss_agent_execution_reservations
      where month_key='2026-10' and run_key='studysolo-2026-10-04') <> 300000 then
    raise exception 'reservation_snapshot_changed';
  end if;
  if (select count(*) from public.ss_agent_execution_budgets
    where period_key in ('month:2026-10','run:studysolo-2026-10-04')
      and reserved_micro_cny=300000 and cap_micro_cny=70000000) <> 2 then
    raise exception 'budget_snapshot_changed';
  end if;
  insert into public.ss_agent_execution_budgets(period_key,reserved_micro_cny,cap_micro_cny)
  values('legacy:0594c0c9fd92462ad24a081f4e8827c67324a4d22b457ef4241a944c7422b519',1800000,1800000);
  update public.ss_agent_execution_budgets set reserved_micro_cny=reserved_micro_cny+1800000
    where period_key in ('month:2026-10','run:studysolo-2026-10-04');
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'budget_period_missing'; end if;
end $$;
commit;
```

这个 fingerprint 是已冻结六条 local reserve 的公开去重身份，不是 invoice/身份凭据。source ID 没有搬进 shared 用户/执行表，原 local账本保留；shared .3 没减也没双记。marker 是 operator adjustment，不属于普通 run/month 预算求和；报表必须按 period 类型解释。实时 schema/RPC 聚合如不兼容本约定，则先重写方案，不强行复用表。

配套精确新增 RPC 候选位于 `scripts/sandbox/sql/reconciled-budget-candidate.sql`：新函数signature为 `(uuid,uuid,bigint,text,text,bigint,bigint,timestamptz,text)`，security invoker/search_path空、仅service_role execute。锁与旧RPC完全同key，事务内先检查marker再阻断所有unreleased；同一reservationId重入仍由原RPC校验 owner/amount/原限额条件，不双计。未应用时真实 reserve fail closed。已在隔离 PGlite fixture 验 marker缺失/不匹配、过TTL未release仍阻止、确认release后可下一占位、重复ID不双计、authenticated无execute、marker原金额不被普通reserve改变；不是远端迁移结果。

回退：禁新 create（不准备/移除新 authority配置），保留现有预算/import marker/历史 local ledger，继续对已有本人实例执行 read/cancel/close。不能删除 marker、减旧 reserve或回到 local 独立准入。这只回退执行入口，不能把已计成本退成未发生。

## 定向检查与剩余验收

Node 最终定向30项全通过（pass30/fail0/skip0）：实际 Scope/Action-time验证、未完成MFA拒绝、owner改变、输入/隔离、固定预算/加密、未知创建、已知paused0connect、durable日志、不伪造未采集final log、完整包、真实 StudyAgent 模拟工具协议、auth票据并发/重载/TTL/跨owner与会话、publish未知上传与hash恢复、鉴权下载、固定 Desktop bridge、新 shared预算failclosed与候选事务RPC。候选SQL只运行在隔离PGlite，未触碰真实RootSolo。

React 四组32项全通过：Cloud结果卡6项、完整已有MCP市场18项、技能安装恢复/owner3项、学习服务卡5项。它们是自动化本机测试，模拟模型/提供者不能作为用户真实模型/命令成功。

最终 `npm run typecheck` 通过；相关eslint通过（0error/0warning），本包diff --check通过。此前测试 import 大小写不一致、缺 pinned fixture、FakeProvider state字段与新方法同名以及历史tool part缺input兼容已修，最终相关测试/类型检查通过。

父独立正常账号 Agent→status→discover→PubMed read→final 已真实成功（UTC12:01:18，DeepSeek V4.1 Flash，PMID42825759/公开来源，无REAUTH，禁web search/CLI/私人读取）。metadata `core-mcp-acceptance-2026-10-04/standalone-model-public-read-passed.json`；属于本机真实模型链，不是正式生产验收。结果卡摘要已由父实页reload检查，不把770px当所有窄屏/details验收。

外部尚未完成：Google正确5 scope实际 OAuth→grant→模型→刷新→断连；Ali Chrome费用页现需本人登录，Edge费用壳table0不能判0成本，实际本轮与月 compute+template/storage bill未读；Team/永久key不失效配置/角色当前尚未实页核；父审后的预算import、新RPC与环境生效；真实 VM→完整9/17技能→useSkill→open/write/原脚本render/publish→本人鉴权下载→cancel/timeout/后台清理/durable final日志/回收；两租户/两会话/未知请求及正式运行版本。RootSolo实时schema/ACL/history已核，不再列为全面阻碍；旧API403仍是独立通道限制。本工作包仍 pending。

账号分层：Chrome本机当前是原批准开发测试账号，市场UI实际显示Notion/Todoist/Google/GitHub/Zotero已关联、Google5项true；它不能被Edge常用账号的disconnected状态覆盖。其已有grant最小native执行当前由父在同tab核对，导航超时尚无结果，不重复请求、不重复OAuth或注册应用。Edge常用账号先前未保存私人grant，正式RootSolo vault盘点是另一个环境/账号维度。本报告不把所有账号概括为五服务none，也不将开发grant复制成正式用户授权。
该开发测试账号 native read 已在UTC12:12:07实际全通过：3官方MCP discovery true，GitHub search source1、Todoist find-projects true、Notion get-tool-access true，Google drive/calendar/gmail read true，Zotero collections source1，PubMed/Crossref各source1。受限 metadata `core-mcp-acceptance-2026-10-04/chrome-existing-grants-native-read.json`；externalWrites=false、privatePayloadStored=false。它建立已授权测试用户技术链，不代表常用账号新授权/正式vault/生产部署，也不单凭native执行冒充这些私人服务的模型编排完成。

UTC12:09:57父从准确RootSolo现场读回run/month各reserved300000、cap70000000，reservation1条/合计300000/unreleased0，artifact bucket存在private，符合候选import的固定前提（`core-sandbox-live-budget-2026-10-05.json`）。该证据不是invoice，执行候选前仍需再核并父审。

## 冻结文件集（本 worker 产品/报告）

- `app/api/chat/route.ts`
- `app/api/agent/sandbox/route.ts`
- `app/api/agent/sandbox/retry/[id]/route.ts`
- `app/api/agent/skills/route.ts`
- `components/agent/plugins/SkillInstallButton.tsx`
- `components/agent/plugins/SkillInstallButton.test.tsx`
- `components/agent/plugins/SkillPackagesContext.tsx`
- `components/chat/toolCards/cloudSandboxCard.tsx`
- `components/chat/toolCards/CloudSandboxCard.test.tsx`
- `components/chat/toolCards/learningConnectorsCard.tsx`
- `components/chat/toolCards/learningConnectorsCard.test.tsx`
- `components/plugins/LearningAccountVerificationLink.tsx`
- `lib/ai/agent/tools/cloudSandbox/tool.ts`
- `lib/i18n/messages/parts/en/trace.ts`
- `lib/i18n/messages/parts/zh/trace.ts`
- `lib/sandbox/actor.server.ts`
- `lib/sandbox/artifacts.server.ts`
- `lib/sandbox/budgetAuthority.server.test.ts`
- `lib/sandbox/cleanup.server.ts`
- `lib/sandbox/config.server.ts`
- `lib/sandbox/desktop-bridge.server.ts`
- `lib/sandbox/maintenance.server.ts`
- `lib/sandbox/provider.server.ts`
- `lib/sandbox/providerControl.server.test.ts`
- `lib/sandbox/runtime.server.test.ts`
- `lib/sandbox/service.server.ts`
- `lib/sandbox/skills.server.ts`
- `lib/sandbox/store.server.ts`
- `lib/sandbox/types.ts`
- `scripts/sandbox/sql/reconciled-budget-candidate.sql`（未执行的精确候选）
- `docs/refer/cloud-sandbox-runtime.md`
- `docs/handoff/workstreams/core-mcp-2026-10-04.md`（当前联合事实追加）
- `docs/handoff/workstreams/core-sandbox-2026-10-05.md`

其他membership/quota/panel/settings文件不是本包，不stage/stash/reset。私有盘点脚本与metadata留在ignored受限目录，不能加入公开diff。
