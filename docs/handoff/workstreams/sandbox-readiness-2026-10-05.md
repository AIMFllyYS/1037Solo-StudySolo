# CORE-SANDBOX 只读准备 · 2026-10-05

> 最新恢复：2026-10-07已授权同worker完整技术接线核查，当前事实见文末“2026-10-07 当前技术接线回执”。下方2026-10-05事实保留为历史；尤其“RPC缺失”已被本次服务端只读发现替代，禁止据旧快照重放DDL。

> 最新治理结果：2026-10-07已从准确Supabase MCP实际返回核准RPC body/签名/权限/search_path及正式history一条（version `20261005040543`）。解析缺口已离线修复，见末节“当前RPC治理与正式history已核结果”；原失败记录为历史，不再列成外部阻塞。marker/import、实际invoice和本人网页执行仍是独立pending。

> 最新预算结果：用户于2026-10-07明确免除账单/阿里登录前置，批准小规模测试。fresh条件经主独立审查后，唯一operator import已于UTC2026-10-07 03:10执行并after核准：marker1.8、run/月各2.1、cap70、原reservation1条/.3、unreleased0、session计数不变。旧“marker/import pending”和“先invoice”只保留为历史；正常本人项目登录/实际风险动作MFA与真实单VM验收仍需完成，actualBill仍unknown。

> 最新网页结果：首个正常本人VM已真实创建并完成普通CLI及Notes原render/check；publish被近期MFA前置拒绝，未产生artifact/本人浏览器下载。公开PDF已在期限前仅为运营QA保全，首资源随后已精确确认gone/closed/released，.3 reserve保留。用户MFA后第二个串行VM须主批准，不恢复旧scope、不并行、不把QA副本当publish验收。

状态：本轮准备完成，完整模块仍待第二条线实施和真实验收。由原 `/root/cloud_sandbox_sol_high` 承接；没有子执行。主独占全局账本、Git、CI和整合。本报告不把准备完成写成沙箱交付，也不改变全局 active 目标。

带时间戳的观察窗口：2026-10-04 UTC 18:00–18:03（本机 UTC+13 为2026-10-05）。分支为 `codex/unattended-agent-platform-2026-10-04`，SIMPLE UI已验基线 `18ce822974c95250b4c7d6128c5fa539c55a3c3f`。既有 `core-sandbox`、预算部署附录及环境准备回执继续保留；历史测试/现场记录与本轮 live facts 分开。

## 实际入口和复用结论

现有链为独立 `/agent` → `/api/agent/chat` →共享 `/api/chat` → `sandboxScopeForChat` →原 `cloudSandbox` 工具；本人直接控制复用 `/api/agent/sandbox`、固定 auth-retry 和鉴权 artifact 路由。原生工具步骤由已验UI包承接，本轮不改其消费者或历史tool ID。

- `lib/sandbox/actor.server.ts` 当前普通聊天Scope用 live Account 身份、精确 standalone surface，不要求近期验证；每个 open/exec/write/publish 风险动作重新核身份及 recent MFA。cancel/close保留 live本人归属与会话/提供者绑定，不因近期验证超时阻止止损。Studio、Class、笔记、plan mode不会建立可执行Scope。代码合同已存在，本轮没有运行HTTP或构造Actor证明它通过。
- `lib/sandbox/store.server.ts` 真实新准入必须 shared authority、准确 RootSolo host、reviewed fingerprint及精确legacy marker，随后调用 `ss_agent_execution_reserve_reconciled`。不能把开发local账本当真实预算fallback；fixture路径仅作隔离测试。现缺RPC/marker时应继续 fail closed。
- `instrumentation.ts` 在Node启动既有15秒maintenance；`scripts/sandbox/reap.ts`是既有维护入口。provider保留 kill超时、autoResume=false及关闭精确已知ID路径；本轮未运行任一维护命令。TTL、空列表和历史测试均不是当前取消/回收证据。
- SDK仍锁定 `e2b=2.31.0`。既有Dockerfile、依赖准备和renderer验证脚本、namespace/worker、安全隔离与完整技能包继续复用，不重新构建/上传模板。

## 当前本地配置与完整包

UTC18:00:07–18:00:57只读本地核验；环境文件正文/密钥均未输出。最初探查的 `CLOUD_SANDBOX_SKILLS_RUNTIME` 不是代码使用字段，因此该探查的false不是缺配置；随后按 `skillRuntimeReady()` 实际的VERSION/TEMPLATE合同重新核对。

| 项目 | 本轮结果 | 能证明的阶段 |
| --- | --- | --- |
| Notes to Handbook | catalog完整9文件，逐文件SHA256全部匹配 | 本地完整package，非本人已安装/真实render |
| GB Standard DOCX/PDF | catalog完整17文件，逐文件SHA256全部匹配 | 本地完整package，非Word/WPS或真实成品验收 |
| 两包runtime | `skills-runtime-v1-20261004`一致 | package metadata |
| `.env.local` / `.env.production` | 解析91 / 93字段；Cloud启用、杭州、shared authority、reviewed fingerprint、原runId、月/本轮100元及固定30元allowance均与已审方案一致 | 文件准备 |
| Skills实际字段 | `CLOUD_SANDBOX_SKILLS_VERSION`匹配catalog；`CLOUD_SANDBOX_SKILLS_TEMPLATE`与当前模板相等 | 文件绑定 |
| 原提供者与加密凭证 | 必要字段存在；没有public Cloud credential字段 | 存在性，无key值/轮换操作 |
| canonical与候选SQL | 两文件SHA256都为 `7568e61fbc2b01e0420b358e97dc4c3968bcf41df8f20d0cf7e1cc8debb57b6d` | 同字节源，不是已应用 |

没有重启或读取进程秘密，进程是否重读上述字段未验证。当前账号installed state仍须通过正常登录的Skills API/页面读取；本轮没有借历史owner、模拟Actor或复制grant来冒充已安装。

## 当前阿里云可见元数据

首先实时识别各browser family/profile与extension identity；阿里云仅绑定现有Edge，Supabase仅绑定现有Chrome。各自创建一个自有标签，未占RootSolo/他人验收标签、未拷跨agent数字ID、未读cookie/hidden stores。以下属于当前受支持浏览器UI观察。

| 事实 | 来源与时点 | 边界 |
| --- | --- | --- |
| 已有主账号会话可读 | Edge费用/Agent Sandbox页，本轮观察至UTC18:02 | 无须重新登录；不据先前Chrome未登录判断用户没权限 |
| 杭州Team及QoS | Sandbox模板页显示 `studysolo-agent default`，UTC18:00 | live UI，不是新的Team/权限配置 |
| 配置所指模板 | 模板列表 `studysolo-skills-oci-10d47cda032a`：就绪、2c / 2GB / 15GB，更新时间页面显示2026-10-04 10:55:09 | 与两env模板一致；不是本轮VM内执行 |
| 现模板列表6条 | 同页UTC18:00：主技能模板、旧CLI及code-interpreter就绪；两个旧Skills候选失败；旧 `studysolo-skills-v1-20261004`（`sbe2omn4ftftsg4mrwyf`）仍显示构建中 | 真实job状态、Owner与金额未知；未停构建/删除/重建，不按界面标志或TTL判停/释放reserve |
| 已有API Key到期标志 | API Keys页面加载完成，1条数据行、出现“永不过期”，UTC18:00:54 | 只派生boolean/count，不输出key正文；未生成/编辑/轮换 |
| 当前实例默认列表 | 沙箱实例页显示空数据，UTC18:01:41–18:02:11 | 只是当前UI默认筛选空；不是SDK完整running+paused清单或本轮回收验收 |
| 实际账单 | 费用详情 `/finance/expense-report`，本轮首次见控制台内加载错误；同一自有tab有限复核UTC18:02:35仍无账单table/金额字段，无登录提示 | invoice及本轮/月新增Sandbox费用未知。table0不是0元，也不是无权限/永久断连 |

RAM概览本轮只返回导航及内页加载错误，两个服务关联角色的当前正式定义没有重新读回；历史已配置记录保留。已有Team/模板当前可见不能替代每个角色ACL核验。没有打开个人联系资料、发票抬头、付款入口或私有账单正文。

本轮费用范围仅新增Agent Sandbox compute、相关模板/快照/存储及其依赖，不能把用户既有ECS总账混入本轮cap。预算本轮累计及月新增各≤100元。旧local1.8元+shared0.3元=2.1元属于此前UTC11:52的保守reserve记录，本轮未复核这些行，绝非invoice或真实可用余额；固定30元allowance和70元计算准入也不是消费证明。

2026-10-04 UTC18:02重读[阿里云官方计费概述](https://help.aliyun.com/zh/agent-sandbox/product-overview/billing-overview)：官方说明总费用含算力及依赖云产品、秒级计费、每小时出账；参考价格不能代替实际账单。深休眠/快照仍有磁盘项，销毁后该实例不再计费。因此当前库存空、暂停或TTL都不能推导历史总费用。页面未返回可用更新时间字段，记录本轮读取时间而不猜发布日。

## 当前RootSolo与唯一预算缺口

Chrome现有profile新自有tab进入准确项目 `zizaonaxfguvlzdcbxzw`；页面显示RootSolo、RootSolo's Org PRO、main PRODUCTION。没有写SQL、访问用户数据表、credential页面或私人学习正文。

- UTC18:01:19函数列表已加载，按 `ss_agent_execution_reserve`过滤，现有reserve/release/lock/put/unlock/immutable identity显示Invoker；`ss_agent_execution_reserve_reconciled`当前数量0。当前事实确认新RPC缺口，不能用旧Management API403概括为用户无RootSolo权限。
- UTC18:02:11Migrations页已载入table并含旧 `studysolo_agent_execution_isolation`，未含 `studysolo_reconciled_budget`/`202610050001`。仅确认本次登记未见；未重放任何历史迁移。旧7条实际timestamp及ACL仍引用原报告的UTC12:07历史审计，不能当本轮重新验ACL。
- Shared当前canonical同字节存在，但主明确同路径有untracked状态，不能盲覆盖/stage；本worker未写Shared。marker金额、run/month及unreleased当前行未读取，仍以未应用操作导入处理，未来操作前必须重新冻结snapshot。

后续精确动作继续使用预算部署附录：在第二条线授权、实际invoice/余量确认后，只应用Shared唯一canonical，经支持迁移通道读回函数definition、service-only ACL/search_path及正式history version/name；独立reviewed import按旧source fingerprint和fresh snapshot事务处理，另留before/after审计，不当DDL migration。保留006、原runId、历史local账本、shared0.3元与legacy marker；不重置runId、不全目录db push、不减reserve、不切回独立local预算。现阶段一项也未执行。

## 本轮精确保护范围

唯一写入为本报告。保护已验UI提交、会员/额度/i18n在途、Landing dirty、core-MCP、RootSolo、环境、原key、Shared canonical及所有SIMPLE候选。

Review保护20文件：`components/chat/ChatQuizCard.tsx`、`components/chat/toolCards/createQuizCard.tsx`、`components/quiz/AgentQuizWindow.tsx`、`components/quiz/QuizRunner.tsx`、`components/review-mode/ReviewQuizPane.tsx`、`components/review-mode/ReviewMasteryOverview.tsx`、`lib/review-mode/agentQuizProgress.ts`、`lib/review-mode/progressSync.ts`、`lib/review-mode/wrongQuestions.ts`、`lib/quiz-progress.ts`、`lib/stores/memoryInbox.ts`、两份`lib/i18n/messages/parts/{zh,en}/review.ts`、`components/quiz/QuizRunner.progress.test.tsx`、`components/chat/toolCards/createQuizCard.test.tsx`、`components/review-mode/ReviewQuizPane.test.tsx`、`lib/review-mode/agentQuizProgress.test.ts`、`lib/review-mode/progressSync.test.ts`、`lib/stores/memoryInbox.test.ts`及`review-notes-2026-10-05.md`。

Feedback保护Study四文件及报告：`components/chat/ChatFeedbackActions.tsx`、同名test、`app/api/feedback/chat/route.ts`、`route.test.tsx`及`feedback-admin-2026-10-05.md`；Landing两文件`components/admin/feedback.tsx`、`app/api/admin/feedback/route.ts`及其他dirty均不触碰。

Browser保护六文件及报告：`components/browser/BrowserTab.tsx`、`BrowserSettingsButton.tsx`、`WebviewSite.tsx`、`BrowserTab.controls.test.tsx`、`BrowserSettingsButton.test.tsx`、`WebviewSite.zoom.test.tsx`及`browser-basics-2026-10-05.md`。全局JSON/README/handoff入口由主独占，不编辑。

本轮未跑全仓测试/CI、启动服务、探测Root端口、构造Actor、创建/执行/上传/停止VM、安装技能、应用SQL、改权限、生成凭证、注册/购买资源、SSH/部署/网站发布或操作VPN VPS `38.47.118.246`。既有产品历史技术证据不重做。

## 唯一下一步

交回主；SIMPLE真实验收与整线交付后，由主followup同worker恢复完整SANDBOX第二条线。首先恢复并读回限定本轮资源的真实账单金额，再按上述唯一RPC/独立导入前置推进正常账号独立Agent命令→原完整9/17技能脚本→发布/本人下载→取消/超时/日志/关闭回收。当前本轮只读准备没有扩大模块、没有替外部依赖宣布完成或全局停止。

## 2026-10-07 当前技术接线回执

同worker恢复完整CORE-SANDBOX技术核查，不派子。入场StudySolo HEAD `183103b6`、原任务分支；UI/Review的PR188已主验合入记录保留。Browser六文件、Feedback Study四文件/Landing两文件仍候选待验，不假closed、不夹带；主独占Git/全局账本/整合。先前等待SIMPLE整线的技术核查限制已由此次指令覆盖，收费运行/本人认证前置仍保持。

### 当前阻断链与最小方案

UTC2026-10-06 16:58:58服务端只读preflight，准确RootSolo host核对后使用既有service-role client只SELECT预算metadata及GET PostgREST OpenAPI，没有调用准入RPC、写SQL、创建资源或构造用户Actor：

| 前置 | 当前事实 | 下一动作边界 |
| --- | --- | --- |
| reconciled RPC | service-role OpenAPI200，路径已暴露；UTC16:59:37 body九个必填参数的名称/类型及COMMENT与canonical一致 | **不得重放旧DDL**。OpenAPI不证明definition/Invoker/search_path/全部ACL或正式history已校准 |
| reviewed marker | SELECT成功，原fingerprint对应marker不存在 | 真实create在`authorizedBudgetDb()`先报`SANDBOX_BUDGET_NOT_RECONCILED`，不能跳过marker或切local预算 |
| 原run/月 | 两period各reserved300000、cap70000000；unreleasedCount=0 | 对应env100元减30元allowance的现有机制；不跨日重置run或提高cap |
| 两env/runtime | 原run、同provider binding、shared authority、Skills VERSION/TEMPLATE均一致；Notes9/GB17逐文件hash再验全过 | 配置已准备，非进程/正常用户运行验收 |
| 当前外浏览器 | 本worker CUA只见Edge，inventory请求失败；没有Chrome/IAB可用绑定 | 只隔离Ali账单/Supabase UI/正常账号网页验收，不CLI绕控制、不借主ID或让用户重启Root |
| 当前本机API | UTC17:01:03，无cookie/Actor的GET Skills和POST sandbox status均401 `SESSION_MISSING` | 实际HTTP认证拒绝；不是正常账号网页成功，也未发送云命令 |

Management只读函数metadata通道当前403；anon OpenAPI当前401。这两项不能证明用户无RootSolo权限，也不能推定anon/authenticated当前ACL已确认。正式history、完整definition及ACL仍由主通过恢复的准确治理通道独立读回。service-role当前可读与RPC签名发现已足以推翻旧“RPC尚无”假设。

### 独立operator import的fresh条件

UTC17:00:42重新读取原local reserve并仅SELECT现shared reservations，受限metadata保存于 `.local-archive/connectors-private/sandbox-current-preflight-2026-10-07.json`，没有保存凭证、owner行或私人正文：local精确6条/all released、合计1800000，原source fingerprint仍一致；shared精确1条、同2026-10/原run、合计300000、全released；ID重叠0。结合上述marker缺、run/month各300000 cap70000000，数值条件与原reviewed候选一致。2.1元仍只是保守reserve，**actualBill未知**。

主后续必要动作：先获得限定本轮compute/相关template-storage的账单与余量，并核当前RPC definition/service-only ACL/search_path和history；核对既有operator候选与fresh快照后才批准独立import。该候选使用同capacity advisory事务锁，要求上述精确1条/.3/两period/unreleased0；插入唯一1.8 marker、精确更新两period到至少2.1，重入校准不二次增额。状态变化即拒绝并重新审查；没有现在执行DML或把它登记成DDL migration。原006、runID、local历史、shared .3及cap均不改。

### 当前consumer完整链与验证

源码现有链已完整接线，候选代码集为空，未发现需要重建或补第二实现的直接断点：

1. 正常本人Skills GET/POST→`installedPackages/manageSkillPackage`→Account owner-bound存储；`skillsForAgent`从服务端权威安装替换客户端正文，并把原SKILL与runtime adapter交给`useSkill`。仅加载正文不冒充云依赖安装。
2. standalone Scope→`cloudSandbox`→`SandboxService.open` shared reserve→provider创建/身份持久化→`initialize`检查隔离、runtime marker及完整包hash/固定目录；普通聊天不提前recent MFA，实际风险动作逐次live/recent，本人停止保留止损。
3. exec/poll→worker/namespace→工作区文件→publish固定contentHash/manifest及限额占位→存储核对恢复→ready；原artifact GET重新live鉴权、会话与hash/size校验；原生步骤已有download consumer。本轮不修改前端原生trace。
4. cancel/close、保存日志和maintenance现路径保留；未知创建/未知上传不重开、不按TTL释放hold。未运行maintenance/reap或停止现云资源。

现-source必要Node检查一次：`runtime.server.test.ts`、`budgetAuthority.server.test.ts`、`providerControl.server.test.ts`、`request.server.test.ts`，**23/23，fail0/skip0**。包括模式/归属、逐动作认证、完整package、模拟StudyAgent工具循环、publish未知恢复/鉴权下载、未知create、paused拒connect、durable日志/close及隔离PGlite候选预算；明确是fixture/模拟，不是真VM、原脚本成品或网页证明。没有整仓build/CI，无需为未改代码再造测试。

核对的12个源码SHA256完整保存于同一受限metadata `sourceHashes`（actor/store/skills/provider/service/artifacts、worker/namespace、cloudSandbox tool、Skills/sandbox/artifact三个API）。原33文件已合正确实现不重写；本轮公开写入仅此报告，受限preflight JSON为新的metadata证据，不入Git。

### 准入恢复后的最小真实验收输入

仅使用公开合成标题“沙箱公开验收20261007”和三段正文，无联网、外部写入或私人材料。由正常本人账号在独立Agent现原生步骤完成，不以服务端fixture Actor替代：

- 普通命令先验证`python --version`/`node --version`及工作区写读；保留真实sessionId/commandId/退出码，poll不重发exec。
- 选中完整Notes to Handbook并真实`useSkill`；生成包含全部公开正文的HTML，执行原 `node /opt/studysolo/skills/notes-to-handbook/scripts/render_pdf.js source.html notes.pdf`，再原 `python /opt/studysolo/skills/notes-to-handbook/scripts/check_pdf_pages.py notes.pdf`。publish并本人鉴权下载，核PDF正文/页数/图像，退出码/下载hash与内容匹配。
- 选中完整GB包并真实`useSkill`；明确准许Python-docx+LibreOffice云端路线，按原技能结构/字体/图表要求生成DOCX、实际LibreOffice导出PDF；运行原 `document_preflight.py --docx final.docx --pdf final.pdf --require-a4 --expect 沙箱公开验收20261007` 与 `render_pdf_pages.py final.pdf qa/final-run --dpi 180 --columns 4`。publish DOCX/PDF及QA产物、下载后核文件和页面；不把LibreOffice验收称作Word/WPS或标准合规最终验收。
- 用同一资源验证命令取消/限定超时、持久日志、close、精确库存回收及reservation释放；另核错误mode/会话/owner被拒且provider无访问。不在未知创建或close结果未确认时另开资源，不并行增加VM。

唯一下一步：主恢复准确账单/治理与本人认证后审查上述精确import前置，followup同worker继续正常网页的收费CLI→两个完整原脚本→下载→停止回收。当前技术链核查已收敛，真实闭环仍pending；外部接口故障不定义全局停止，准备/23项测试不定义CORE-SANDBOX交付。

### 2026-10-07 单次Supabase MCP治理前置

UTC2026-10-06 17:22:06只读父`.mcp.json`的准确`supabase`配置；没有使用`supabase-legacy`、更换provider账号、打印args/token或改配置。该服务器PAT与前述Management403凭证**不同**（仅内存相等比较）。旧`@modelcontextprotocol/sdk`直接包不存在，但项目当前声明且已安装的`@modelcontextprotocol/client 2.2.0`及`/stdio`可复用；这是现有Client，不是新安装framework。

UTC17:24:45–17:24:53只建立**一次**官方Supabase MCP会话：临时客户端增加read-only与准确RootSolo project-ref，用现本地npx入口且`--no-install`，没有修改原`.mcp.json`。会话connect、tools/list均成功；`execute_sql` schema只含必填`query:string`，没有向工具传入不存在的project参数。固定项目由本次客户端参数限制。工具正文/建议不作为指令。

仅对第一条固定pg_proc治理SELECT发起一次`callTool`尝试（限定`public.ss_agent_execution_reserve_reconciled`，目标为signature/prosrc/prosecdef/proconfig及service/anon/authenticated/PUBLIC execute metadata）。原脚本把`await callTool(...)`直接传入解析器，catch只保存安全归类；进程和会话已结束，**原result与异常对象已discard，无法再读isError、content block类型/数量、structuredContent或异常class**。因此不能区分callTool异常、tool isError还是正常execute_sql返回后的解析失败，不能声称查询未执行或真正返回了哪些行。底层HTTP状态和实际查询结果均未知，函数/ACL未提取为可核证据。最初`MCP_READ_ONLY_UNAVAILABLE`归类过强，现改为`GOVERNANCE_RESULT_NOT_EXTRACTED`，明确这是结果结构丢失的观察限制，不是MCP不可用/权限不足/403/RPC缺失结论。没有为补证重开会话或重发SQL。

history SELECT未执行；没有新会话、换旧key、helper文件、框架安装、SQL/import/权限修改、VM或维护调用。session已关闭。仅metadata回执为ignored `.local-archive/connectors-private/sandbox-mcp-governance-2026-10-07.json`；它记录连接/工具schema和失败阶段，没有凭证、owner、私人数据或原始tool文本。原预算/fingerprint/local1.8/shared.3仍保持。

唯一后续由主独立审查该单次通道结果，按恢复的准确治理入口取得definition/ACL/search_path/history。现RPC暴露与缺marker的前段服务端只读事实不因此改变；不依据本次失败重放DDL、导入marker或创建付费资源。

### 2026-10-07 主授权的有界解析补救

主明确授权在有解析修复依据后补一次纯读取，不是允许盲循环。先只读当前缓存官方Supabase server **0.13.0** 和项目Client **2.2.0** 源码：server的execute_sql输出schema为`{result:string}`，execute返回`{result:V(rows)}`，V将JSON行放在同一UUID的untrusted-data边界；Client保留CallToolResult及可选structuredContent。旧解析器遗漏structuredContent.result和content JSON的result字符串解包，已在ignored临时helper补这层；没有产品源码、权限或RPC变化。

补救helper `.local-archive/connectors-private/sandbox-mcp-governance-recovery-2026-10-07.mjs` 先通过**6项公开合成envelope检查**，涵盖上述两种result包装、直接untrusted-data、空history、isError与不匹配边界。工具文本仅作为JSON数据，不执行任何正文建议；实际结果在parse前先写safe结构metadata，治理输出只允许固定字段。

UTC2026-10-06 **17:28:46–17:28:52**，仍准确supabase、准确RootSolo、临时read-only、npx no-install，仅补一次会话和原固定治理SELECT。connect/list成功；这次`execute_sql` **确实返回**：isError=false（字段本身未出现），contentCount=1/type=text/textLength=2086，structuredContent不存在。后续本地解析失败，异常class=`Error`、parserError=`RESULT_FORMAT_UNSUPPORTED`；没有明确HTTP status、403、权限错误或timeout。**这是已证“返回后解析失败”，不再沿用前次无法区分调用/解析阶段的描述，也不是权限或MCP不可用结论。** 实际函数行仍未成功提取，definition/ACL/search_path不能称已验。

history未调用，没有第三会话/第三次SELECT、换key、新权限、安装framework或任何SQL写。失败后会话/进程已关闭，原text未存；只保留了上述safe结构metadata，不能进一步从同一已结束返回恢复行。结果回执为ignored `.local-archive/connectors-private/sandbox-mcp-governance-recovery-2026-10-07.json`。原预算/local1.8/shared.3/fingerprint及所有候选仍保持。

本次补救仍未取得治理行，交主审查当前返回格式缺口；不得用text长度/isError=false冒充RPC/ACL/history内容，也不据此重放DDL或导入marker。真实费用与正常账号云命令/两个原脚本/下载/回收仍按原前置pending。

### 2026-10-07 当前RPC治理与正式history已核结果

主授权的最后函数读取于UTC2026-10-06 **17:33:43–17:33:49**返回，实际initialize为`supabase / 0.13.0`。当前结果已先按准确配置token、Bearer/sbp_/JWT等模式脱敏，保存于专门新建的restricted ignored目录；只查询固定公有函数代码/治理字段，没有用户grant、owner行或学习内容，raw从未输出到工具/chat。

从该**同一保存结果**离线定位真实根因：官方V的说明句先行内提及与数据块相同opening marker，旧正则由说明句开头抓到真正closing，造成JSON混入说明。现枚举合法opening与同ID closing候选，只接受内部`JSON.parse`成功者，不执行preamble或row正文；object envelope递归result/data/output/rows受8层/1MiB限制，保留错误对象classification并拒绝不匹配边界。UTC17:36:13官方完整preamble等**13项公开合成检查**及真实返回准确8字段/签名schema检查通过；离线恢复未新增SQL/网络请求。

UTC17:35:18从准确返回提取RPC **1行**，主随后已独立读同一脱敏artifact并核canonical：

| 现场治理字段 | 当前结果 |
| --- | --- |
| 准确签名 | `p_id uuid, p_owner uuid, p_micro_cny bigint, p_month text, p_run text, p_month_cap bigint, p_run_cap bigint, p_expires_at timestamp with time zone, p_import_fingerprint text` |
| prosecdef | false，Invoker |
| proconfig | `search_path=""` |
| service_role EXECUTE | true |
| anon / authenticated / PUBLIC EXECUTE | 全部false |
| 函数body与Shared canonical | trim后逐字符一致 |
| body SHA256 | `375c8345b3b0df89515e206c098683f24864977f5d282c701949e67bd387a1e3` |

这核准的是本次SELECT显式读取的签名、body和治理属性；不靠旧fixture或OpenAPI冒充正式治理。该函数已存在，**不重放DDL**。正式history原本未在该会话调用，主在独立Gov审查后明确授权下一唯一history纯读，未由worker自行突破会话限制。

UTC **17:37:07–17:37:13**，另一次准确Supabase/RootSolo/read-only/no-install会话**只**执行已授权的`supabase_migrations.schema_migrations`唯一name/version过滤SELECT，未重读function。返回已先保存脱敏artifact，再用修复解析器提取**精确1条**：

- name与`studysolo_reconciled_budget`匹配：true。
- 实际正式history version：**`20261005040543`**。
- 与源码version `202610050001`相等：false；按既有正式通道方案记录“Shared canonical源码文件 → 现场timestamp/version `20261005040543`”映射，不能把12位文件名不同判为未登记，也不手工stamp/重放。

受限可审证据均在 `.local-archive/connectors-private/sandbox-mcp-final-2026-10-07/`：函数原返回`functionGovernance-original-result.redacted.json`与`receipt.json`，history原返回`formalHistory-original-result.redacted.json`与`history-receipt.json`。目录ACL仅当前执行用户、SYSTEM、Administrators，禁止继承宽泛读权限；文件继承该限制，已确认ignored。函数原返回SHA `ce0e465dc8e98ac17567974e60165231a362ff07a61bc178d856b582c95aa02e`；history原返回SHA `ea700beed357022216cb2d599ca988ca1a68f9cbd2b54a77b66505b37c7c0a53`。未打印raw、原config/token、私人字段或SQL正文。

当前Gov与正式history只读验收有真实证据，解析器问题已解决，不再列为外部配置阻塞。所有MCP会话均已关闭；没有产品/env/Shared/.mcp/权限/Git/账本变化，没有执行DDL、marker/import、收费VM或维护。marker仍以UTC16:58:58成功查询的“缺”为当前独立已观测事实，之后未DML；费用账单与正常账号近期认证也独立pending。

唯一下一步：交主核这份Gov+history结果及现fresh预算快照，再完成限定真实账单/余量与独立reviewed import决策；同worker继续正常本人网页的命令→两个完整原脚本→鉴权下载→停止/回收。不会把Gov/history已核写成完整CORE-SANDBOX交付，也不会因会话结束将目标标停止。

### 2026-10-07 用户小规模授权与预算导入已完成

用户最新指示为“当前仅云沙箱；不用核账单/不用登录阿里云，直接小规模测试，判断测试不会超过10元”。该指示覆盖旧invoice前置；不再把账单读取或阿里登录列为阻塞。原本轮/月各100元、固定30元allowance、计算cap70元、永久key、模板与`studysolo-2026-10-04` runID全部保持，actualBill未知不写0。既有operator候选注释中的旧invoice前置由用户新指示覆盖，不因此改动已审SQL字节。

UTC **03:07:59** fresh服务端只读预算核对成功，受限before为`budget-before-import.json`：local精确6条/all released/1800000、原fingerprint及月/run一致；Shared精确1条/all released/300000、同原月/run，unreleased0、ID overlap0；marker缺；run/month各300000、cap70000000。两env的shared authority/fingerprint/原run/100-30=70及同provider binding全部一致，首次导入条件逐项匹配。

主独立读before并重新hash原候选后批准唯一operator事务：`.local-archive/connectors-private/core-sandbox-legacy-budget-import-candidate-2026-10-05.sql`，SHA **`992308ed23273d6bf88157d494bf6c25b0d53538e795d7a50c20b95ba176f6bf`**。UTC **03:10:04–03:10:11**准确Supabase MCP/RootSolo会话仅为该已审事务临时不加read-only，原配置不改；先再次SELECT before，精确匹配后执行该原SQL**一次**，随即只SELECT after。未改变事务条件、重放Gov/DDL、写正式history、删除数据或创建VM。

| before/after项目 | before | after |
| --- | --- | --- |
| reviewed legacy marker reserve/cap | 不存在 | 各1800000 |
| original run reserve/cap | 300000 / 70000000 | 2100000 / 70000000 |
| 2026-10月 reserve/cap | 300000 / 70000000 | 2100000 / 70000000 |
| Shared reservation | 1条 / 合计300000 / 全released | 同一计数及合计 / 全released |
| unreleased | 0 | 0 |
| Shared session记录计数 | 1 | 1 |

`afterExact=true`，无新增session、DML attempt=1，原local6条/1.8历史未改。事务使用原capacity advisory lock，fresh状态变化会拒绝并回滚；没有因返回未知而重发。2.1元是保守reserve而非invoice，marker是operator去重占位，不能把marker金额再次和run/month总額相加。

当前after、DML、before脱敏原返回及`operator-import-receipt.json`均保存于已受限ignored的`sandbox-mcp-final-2026-10-07/`；会话已关闭。预算marker这一前置已实际准备，不能再据旧报告重复导入。服务端配置文件一致不单凭此称所有进程已生效，正常网页open还要验证实际准入。

### 当前单VM费用判断与真实执行准备

2026-10-07重读[官方Agent Sandbox计费概述](https://help.aliyun.com/zh/agent-sandbox/product-overview/billing-overview)，只核公开参考价，不登录阿里或读账单。按既有杭州Default、2c/2GB/15GB模板及最长900秒，活跃计算估算约 **0.058554元**；即按provider接受上限2c/4GB估算约 **0.078048元**。现代码按单次最多0.3元保守reserve；本次只开一个VM、串行、固定kill超时、不新模板/新依赖云资源/快照/暂停常驻。按这些明确范围，**本次新增小规模计算测试预计远低于10元**。这是参考估算和资源计划，不是已发生账单或历史总费用证明；若初始化/创建不确定，先核原资源，不能为赶测试另开VM。

UTC **03:12:10–03:13:01**本机实际重验：Study `/agent`200，Account frontend `3040/login`200，API `3041/health`200；无cookie Skills GET401 `SESSION_MISSING`。3041是后端，root/login404不作为登录前端故障。服务可达无需让用户双击或无故重启。主正协调正常本人项目登录与MFA；不使用fakeActor或复制grant。

本worker fresh浏览器inventory的Chrome/Edge控制均fetch失败，自有IAB按名字一次创建明确`Browser is not available: iab`，没有复制主browserId/循环创建/CLI绕CUA。用户已授权IAB fallback，正常网页由主当前可用实例协调，本worker继续完整模块准备与随后同包返工。

最小实际流程使用同一公开合成文稿、同一conversation、同一个session：先本人安装完整Notes9与GB17并读回服务端状态；普通Python/Node及工作区读写；真实`useSkill` Notes、原`render_pdf.js`与`check_pdf_pages.py`、publish HTML/PDF并本人下载；第二轮复用该session真实`useSkill` GB、python-docx+LibreOffice路线、原`document_preflight.py`与`render_pdf_pages.py`、publish DOCX/PDF/QA并下载；随后短cancel/timeout、日志、close、精确库存与reservation释放。原脚本命令和公开标题已在前文准备，不新建lite技能或第二卡片。跨owner/mode核拒绝，不用测试Actor冒充正常网页。超出15分钟或结果未知时止损/核原会话，不并行另建。

唯一下一步：主完成正常本人项目登录与实际风险动作MFA并核导入after；同worker继续单VM真实闭环。当前仅operator预算准备已完成，CLI/两个完整脚本/真实下载/停止回收尚未在本次正常网页执行，不宣布CORE-SANDBOX交付或目标停止。

### 2026-10-07 首个正常网页VM、期限与未publish事实

主在正常本人登录的IAB standalone对话实际执行，未读取cookie/token或构造Actor。UTC03:29:54 worker的开测只读快照仍marker1.8精确、两period各2.1/cap70、原reservation1/.3、unreleased0；SDK完整running+paused清单0条（1页完成），无connect/kill/TTL释放动作。Root所属服务再核Study `/agent`、Account `3040/login`与`3041/health`均200，保留主owned Root86702，不自行重启其他服务。

首真实会话 `df33144f-26dd-435e-8981-6c4e359ea7b8`，对话 `ae1aa42f-8788-49b5-a604-53216e7599e2`；精确provider `sbx-baf88974-1981-4300-b489-3945c8db26e7`。只从该真实reservation定位owner于内存再读本次record metadata，未把UUID当用户Actor执行、未跨cookie或读取旧私人正文。

- 本机created **03:36:45.151**，app expires **03:51:45.151**；UTC03:48:06读回剩218秒、03:49:40剩124秒。
- SDK精确getInfo返回running，application/executionId/scope全部匹配；当时provider timeout **03:52:41**。额外56秒不是app继续publish许可，没有按TTL推断已停或释放hold。
- 普通CLI command `488ab603-932c-4e90-8441-4f60e7070a45`，completed/exit0。主已核公开文件UTF-8内容**不含末尾换行**的SHA `990bd9c27b05f7e42bce39787fd0e63f953a3280fc756f06d9f9a98a4ee029bb`；旧“含末换行”描述不采用。
- Notes command `7808c543-f38a-447a-989b-e2bd9945d1bf`，completed/exit0，真实原render与check输出一页、sparse、无blank；stdout465 bytes/hash `565a116f8e4fcb281523f5d6467af66f2966ff06c6b221c11108c8f9456933d8`。
- 本人两active安装记录均为2026.10.04，Notes9/GB17及digest匹配catalog；session active建立initialize完成事实。未远程逐文件hash回读26文件，不能将本地catalog验证写成VM逐文件实测。
- Notes初轮末尾“现在publish”只是assistant文本，主查原生trace确认没有publish调用或链接。随后真实publish被`REAUTH_REQUIRED`前置拒绝；`auth-retry`票据 `da185bbd-5797-5415-a6aa-a32e213a37c3` 已真实加密落盘，03:43:47.547创建、03:58:47.547到期、snapshot state proposed/action publish；artifactCount **0**，没有pending/ready或未知上传需要重发。

worker收到主期限请求后先立即回当前record/SDK精确状态，没有kill运行中资源。主随后批准在确认running下短读公开Notes PDF保全QA，并在app到期且无MFA完成指示时精确关闭/确认停止；未批准新建VM。没有把票据TTL当原资源继续可用许可。

### 首公开PDF的运营QA与精确停止确认

UTC **03:51:27–03:51:29**（app剩17秒），在SDK running和精确metadata匹配后使用原provider公共读取路径，仅保全公开 `notes.pdf`：**181320 bytes**，SHA **`2863c415ddca6b976644ae0a61525138c6be9fdf9d8fe534a064cb05c0250d3a`**，与真实Notes日志相同。没有暂停connect或新资源、没有注入Actor。该文件是主授权运营SDK QA副本，**不是publish、artifact manifest或本人浏览器鉴权下载**。

UTC **03:52:31**，按主授权只对上述精确provider/session走原`closeExecution`路径。读前本机已经closed、provider精确getState已经gone、reservation已经released；worker幂等复核后仍gone/closed/released，保留reserved300000。`releaseVerified=true`。没有把停止归因于worker刚才kill活资源，也没有仅用TTL判回收或抹reserve；主已独立读该原receipt核准。没有并行或第二VM。

离线QA仅用既有Platform Python pypdf、系统Poppler与已有PIL，无安装/联网：PDF1页约A4（595.92×842.88pt），提取正文220字符、公开标题及三节存在。页图逐页观察中文可读、三段可见，无明显裁切、重叠或方框。提取文本与我先前拟定长prompt未建立逐字完整一致，保留`fullInputVerbatimFidelityVerified=false`，不将拟定材料当主实际输入假验忠实性。

受限ignored `qa-first-session/` 中保留 `notes.pdf`、`notes-text.txt`、`notes-page-1.png`、`qa-metadata.json`；页面图SHA **`e587523ec78ad65d30cc39b0fde9889e4b96b8c7b1b0ccbf64d2a4b4907fd47e`**。当前会话metadata、短读receipt及 `first-session-precise-close.json` 与其他受限证据同目录；没有公开私人数据。

### MFA后快速串行重做准备

源码 `toolRounds.ts` 当前默认 **6**，原UI `ToolsSection.tsx` 的 `data-testid=max-tool-rounds` number输入支持1–20，onChange用现store；原组件合同已有20保存检查。没有为本次改默认、安全边界或新卡片。Notes“现在publish”文字结束与默认6轮耗尽相符但不能仅凭此判具体finish原因；主按真实tool调用验。

主已收到快速提示：在用户MFA完成且主另批准第二串行VM后，现UI选20；两次真实useSkill加载完整Notes/GB，open恰好一个新VM；将公开HTML/DOCX写入、普通版本/读写、Notes两原脚本、LibreOffice导出及GB两原脚本合并为一次180秒以内exec；poll原command、实际publish PDF/DOCX/QA后立即close，不等下载才关闭。若仍6轮则按5–6步分阶段、同session继续，不能重开并行资源或重发未知exec。第二次仍需本人真实MFA；旧已关闭scope不恢复，旧scratch不作为执行成功。

当前已真实证明普通CLI、Notes原脚本和首资源准确回收；首轮publish/本人下载、GB真实脚本未通过，不假closed。唯一下一步由主协调用户MFA及第二串行VM授权，同worker继续整包；费用账单不再是前置，全局目标保持active。

### 正常网页第二阶段续接（2026-10-07）

主实际核Root受管句柄12796可poll，3040/3041/35349监听；新IAB页面正常恢复既有公开对话与登录。通过原账户菜单→Agent设置→Agent能力将maxToolRounds原6临时设20，验收后恢复，未改代码默认或系统环境。

原公开对话新消息e6c48102-fad3-4226-975c-c1f81d16d5e2真实加载Notes及GB两完整useSkill，末尾只有“现在打开”文本，没有open调用；轮数20不单凭此证明服务端finish原因。随后消息07fa4244-2542-4049-aa97-01f8f3a729fe实际open仅一次，返回REAUTH_REQUIRED/authenticationBlocked，没有新session/VM、exec或artifact；不重发风险动作。

同worker最新受限before-second-open.json（05:55:39UTC）核旧session closed、准确provider gone、reservation released、当前unreleased0；主独立读取。没有重放治理/history/import。主从失败原生步骤的“前往账号中心验证身份”链接打开3040/reverify，实际OTP表单存在，交本人输入。账号已登录但敏感600秒近期验证不满足；不读取验证码/cookie或伪造Actor。验证后直接续单VM脚本/publish/close，不再耗时重做已过前置。

主已独立view旧公开Notes单页QA图：中文标题/三段可读、无明显重叠裁切。仅是首SDK公开QA副本，不冒充网页download。完整目标active、唯一子执行仍CORE-SANDBOX；MCP等延期不丢失。当前无活VM等待MFA，不因worker状态推断目标完成。

本机恢复补充：后续Goal续接时Root12796实际unknown、三个监听均不存在，free13.1GB；不据此判OOM。依据已授权manifest direct fallback，主以隐藏独立进程顺序恢复Account后端/前端/StudySolo，三HTTP均200，准确listener PID为36852/50664/56624，父进程及日志存ignored受限local-cloud-runtime/。不修改Root Job语义、不新增开机自启、不接管未知进程；task-owned隐藏进程供下一轮实际续接。原验证tab因服务失联成为data错误页，新IAB tab3准确reverify可用，账号仍已登录、OTP表单待本人输入，没有新VM。

旧worker本轮恢复先返回pending_init、随后状态running但一直没有任何阶段回复；主不把idle/运行状态当验收，interrupt旧执行后用唯一sandbox_continuation_sol_high（GPT6.1 Sol High、精简当前上下文）继续同一整包的公开短脚本准备。只一子执行，不重新从历史重做核心。脚本准备和本人验证仍pending，不能据派遣写已完成。

### 2026-10-07 正常本人桌面云沙箱主链真实验收

用户回复ok且IAB实际从reverify返回原独立Agent后，主立即正常网页续接，没有复制cookie或构造Actor。新session e66191a8-c26c-490c-8ff8-5e905a8d3d1f、原公开conversation ae1aa42f-8788-49b5-a604-53216e7599e2只open一次；runtime源码HEAD f6a7fedf251f16558a8f0beac85d25f737d136c5。Cloud核心路径与origin/master一致，只有尚未发行的desktop-bridge两文件不同，本次未走该native桥接，不据此合入PR183。

实际命令94016930-4ebc-42eb-9730-ad7b45194898先生成Notes和DOCX/PDF，但GB调用参数错误、纸张为Letter。整体exit0不能证明所有子步骤成功；主保留这两类真实失败。模型同一session修正参数和A4后，最终命令9402c750-d155-4c20-a9a7-dfc708957a1b的原GB document_preflight返回PASS/exit0，render_pdf_pages返回一页/exit0，Notes原render/check也实际exit0、无blank。一开始自行尝试fitz失败不作为原技能包缺依赖结论；原GB渲染器使用pypdfium2并已成功，无安装或联网。

四次真实publish均ready：notes.pdf 56902字节、final.docx 37007、final.pdf 25012、contact-sheet.png 17084。主通过正常登录网页下载按钮和浏览器download事件得到四个Downloads文件，全部SHA与原工具日志/独立manifest一致。之后实际reload原/agent、从持久历史展开final.pdf并再次下载，仍为25012字节/hash5d75feed...。不是SDK运营复制冒充本人下载。

主用既有Platform Python离线读取四文件：两个PDF均一页A4，公开标题和三段正文逐项一致；DOCX有四个可编辑文本run。Poppler渲染两PDF全部页并逐页查看，中文可读，无明显重叠、裁切或方框。GB preflight的theme_font_attributes:4仅保留警告；本次只证明技能脚本/可编辑DOCX与PDF链路，未声称正式国标合规、PDF/A、Word/WPS端测或复杂文稿全覆盖。

模型末尾只说“立即关闭”而未实际调用，主追加明确close指令，消息3b14c330-0e80-40b9-be6b-e13f43eb8da7的实际工具返回closed。主只读精确reservation→本地加密session→配置binding→SDK getInfo独立核：provider sbx-9f97b0fa-a465-43b3-96db-c2f811adad73确实gone、record closed、reservation released。没有connect/kill/newVM或数据库写。原run及月保守reserve均2700000/70000000，单次300000保留不退款；actual invoice未知、用户免除核对，不作前置。

针对独立模式准入与跨owner/conversation拒绝的两个现有测试在当前源码通过；这些身份/provider是fixture，不冒充第二个真实账号攻击测试。实际窗口所有Cloud参数/日志/下载/关闭均在原生处理过程的同一步骤展开区，未新增独立卡片。390窗口触发了现有AppShell移动映射（/agent→Studio首页），因此那张截图改名为mobile-existing-mode-routing-observation.jpg，不假称移动Cloud工具链通过。已恢复默认视口、/agent入口和工具轮数原6。

剩余精确范围：共享Agent口头收尾漏调用（当前completionGuard对两条捕获文字实际matcher false；具体finish metadata未读，不武断认为轮数故障）、手机独立Agent入口、真实长命令cancel/timeout专项。保留当前桌面主链成功，不把整个CORE-SANDBOX包或完整目标假closed，不重做Gov/import/两个已过生成下载。辅助SolHigh worker首次返回乱码、没有可采纳候选，主未应用任何产品源码；后续只读及极小guard候选仍未返回可审结果。现有核心源码本轮未修改，环境文件/Windows全局变量未改。

唯一证据索引：artifacts/performance/cloud-sandbox-2026-10-07/second-real-loop-acceptance.json；受限second-session-close-readonly-receipt.json及qa-second-session/download-qa.json；桌面原生close截图second-session-native-close-desktop.jpg。最新动态状态以任务账本为准，不恢复旧MFA或旧未publish结论。
