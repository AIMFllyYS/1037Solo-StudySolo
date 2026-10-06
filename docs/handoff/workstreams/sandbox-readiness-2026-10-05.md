# CORE-SANDBOX 只读准备 · 2026-10-05

> 最新恢复：2026-10-07已授权同worker完整技术接线核查，当前事实见文末“2026-10-07 当前技术接线回执”。下方2026-10-05事实保留为历史；尤其“RPC缺失”已被本次服务端只读发现替代，禁止据旧快照重放DDL。

> 最新治理结果：2026-10-07已从准确Supabase MCP实际返回核准RPC body/签名/权限/search_path及正式history一条（version `20261005040543`）。解析缺口已离线修复，见末节“当前RPC治理与正式history已核结果”；原失败记录为历史，不再列成外部阻塞。marker/import、实际invoice和本人网页执行仍是独立pending。

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
