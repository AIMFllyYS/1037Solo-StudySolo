# UI-DIALOGUE 当前候选与本机证据

2026-10-05，当前唯一执行 worker `/root/simple_ui_sol_high`，GPT-6.1 Sol High。继承并核查旧 18 文件 UI 候选，保留正确部分，新增原生工具展开接线及直接阻断端测的最小 CSS 扫描修复。产品尚未完整端测/主验收，不标完成。主独占 README、handoff 正文、账本、Git/CI/PR/合并。

## 已核入口与保留候选

- Studio 公开 `/probability/detail/1.1` → StudioAgentPanel → RightAgentHeader；默认最近 5、活动旧历史可纳入 5 内、固定新建在横滚外，右键与 Shift+F10/ContextMenu 菜单沿 AgentMenuSurface。关闭其他/全部只保存 UI closedIds，历史可重开。agentTabs 使用 Account owner scoped key，批量一次写；旧无主 key 不认领。
- 独立 `/agent` 仍为认可的四行 Lucide15px 原案例（NotebookPen/Layers/MousePointerClick/Globe），NewChatSuggestions 与 Studio 初始建议共享展示，后续 FollowUpQuestions 保持原场景。项目加号与默认右工作区 60% 保留；项目状态徽标进入同一行 endAdornment。
- AgentShell/AppShell 现候选用 panel 的初始化 previousSize 与 pending 程序恢复区分用户操作，保留 autoSaveId/expandToSizes；没有另造布局 store。
- createSession 已去超过 50 条时自动删除权威历史的路径，保留 metadata/正文/附件/run 与既有热窗口；显式 deleteSession 不变。当前 Node 回归实证 51 条历史保留与热窗口约束。

## 新增原生工具接线

- 单一 `tools/types/presentation/server` 注册与 AI SDK parts 合同保留。客户端同一 TOOL_REGISTRY 新增 StepDetail 展示接口，cloudSandbox/learningConnectors/kitSolo 复用原实现作为 ToolTraceStep → AgentTraceStep 的原展开区；从 RESULT_CARD_ORDER 移除这三项，正文无第二卡。文档/出题/图片等其它产物卡保留。
- 参数、连接器结果/来源、固定 action ID 确认/取消、Anki 下载、云固定 retry 原请求预览/ConfirmDialog、进度/停止/关闭、日志、下载仍可达。现有服务端身份、认证、命令、预算、provider 逻辑及旧 Tool IDs 未改。
- 去掉卡片的独立 updated/action/error 结果 state。后续服务端事实经 ChatMessage 的 owner+epoch 捕获回调写原 toolCallId 对应 part，复用 chatHistory.updateMessage 的单消息/IDB chunk 持久化；trace/摘要/展开区共同消费该 part。只保留 busy/dialog/时钟/服务端固定请求预览等瞬态 UI 状态。流式期间禁用这些后续操作。
- domain error/非零 exit/action.result.error → error；proposed → waiting；executing/running/creating/closing → running；uncertain/未知状态 → unknown；取消 → cancelled。整条摘要和完成勾同步检查真实状态，历史运行命令不伪绿。过期候选刷新投影为失败；查询失败写同一事实并阻止确认，刷新成功再恢复。确认/取消开始时 abort 初始状态 GET，防旧 proposed 响应覆盖终态。

## 定向验证

- 当前 React：11 文件 60/60（原 trace24、registry6、云固定 retry/dialog6、连接器6、KitSolo2、native交互2、header6、welcome3、empty2、layout restore1、owner tabs2）。fixture 明确验证取消后原步骤 cancelled、命令轮询 logs+exit2 后原步骤 error、正文无重复卡；未真实启动 VM。
- 当前 Node：buildTrace14 + chatHistory.lifecycle19 = 33/33。新增 follow-up tool fact 通过真实 owner scoped IndexedDB checkpoint 更新后重新读取，日志与失败状态保留；fixture teardown 等待 checkpoints 后无旧 write failed 噪声。
- typecheck 与精确作用文件 ESLint 已通过；最终冻结检查结果由下方后续记录补齐。diff --check 通过。没有完整 CI/build/部署，没有 stage/commit/reset/stash/push/切分支。

## CSS 阻断的实际定位与最小修复

- 本机 connectors health 200，但初次公开课程 500：当前 RootSolo log 指向 app/globals.css → PostCssTransformedAsset::process → evaluate_webpack_loader IPC packet-length timeout/deadline。第一次只经 Edge RootSolo 重启 StudySolo，保留缓存/其它服务，错误仍在。未把它归为新 UI TS/SSR 错误，也未清缓存。
- 主的直接 PostCSS 默认扫描亦挂住；worker 的同 globals/plugin 内存对照 source(none) 241ms/270565bytes，显式 app/components/lib/content 2209ms/367389bytes，加入 public 3842ms/367443bytes，加入真实 `/class` 消费的 classolo 后六源 6539ms/393368bytes。证据定位默认自动扫描范围，不声称已经锁定某个具体文件。未改依赖/Node/构建器/RootSolo。
- 主批准必要修复：globals source(none)+明确 app/components/lib/content/classolo/public 六个真实页面/内容源。按新源码变更经 Edge RootSolo 再次仅停/启 StudySolo；停后端口无 Listen，未起其它服务。新编译后 Chrome 自己测试 tab 1671245554 实际读到 h1=1.1随机试验与样本空间、right-agent-header=true、ready=complete、无 Turbopack error。

## 未验与下一步

- 1280 viewport 已设置；固定新建点击发生 Input.dispatchMouseEvent 超时，结果尚未确认。随后 DOM 读取与支持 AX 读取均 30s tool timeout/kernel reset；按规范重绑自己的同 Chrome tab，没有 claim 其它 agent 的 tab。主已接手 CUA 短对照，worker 暂停浏览器调用。
- 因上述控制读取未返回，1280/390 完整几何、最近 5/右键/历史重新打开/刷新、案例真实发送、拖拽折叠恢复、正常公开 PubMed/Crossref 新模型工具读取仍待端测，不冒充通过。连接器/云失败、待确认和交互证据仅为组件 fixture。
- 新服务日志另显示 `/api/account/session` 对 localhost:3041 fetch failed/503；Account 后端当时未运行，现 Chrome 登录态恢复/owner 门控需主核查。未重新授权/创建应用/复制 token/devgrant/env。
- 资源 WindowManager/AgentDockSession 仍内存，刷新资源 tab 不恢复是现边界；本包按最新排除项不新增全量资源 persist。原耐久 note/document/artifact 正文 owner stores/IDB 保留。
- 会员/额度 dirty（app/api/quota、AccountQuota/MembershipSponsorWindow及tests、lib/billing、lib/membership、i18n parts panel/settings、openMembershipSponsor）未修改。UI en.ts/zh.ts 只保留会话菜单三项。Review/后台/native/生产/服务器/SQL 均未动。

## 精确候选文件 SHA-256

以下是产品/测试 34 文件候选（18 继承 + 15 原生工具 + 1 必要 CSS），提交须以主最终验收冻结为准。本报告本身另列，不自包含 hash。

| 文件 | SHA-256 |
|---|---|
| app/globals.css | b2c79b645b4aeeacab9584d382ee0f27e0ebe30fc2d7465e17d10ff3b9b39df6 |
| app/styles/prose.css | 3cc2e5f3be4b5664bd84e59a01c2b332bfa0a4b55403cab42d87bee88a5c19f3 |
| components/chat/AgentWelcome.tsx | d67c2d1016cc09ecf9da8d66a49106cb22756547a0ea82f2b41114a055d7cb82 |
| components/chat/ChatEmptyState.tsx | fb91ba0f60a813dd9c41a62411c76cfafc2fb805794aaeec3634f645a15386a6 |
| components/chat/ChatEmptyState.test.tsx | e0191dc898fe302e8219c2fa5011cbd902c773b3fda2355142cd78586c212689 |
| components/chat/NewChatSuggestions.tsx | 961c265873d955eef1386d87b562d8e31ef673d129701b5c3b1ce0c1e8e75f5d |
| components/layout/AgentConversationSidebar.tsx | 237f872af7940e7f3dded63164fa98823c5d5996a495ddc768d8a51eff17d307 |
| components/layout/AgentShell.tsx | f8f048e00cd78390a6a76bf131a9ebfebd3d862a0fd0a6225adcfed28b9b4b1d |
| components/layout/AppShell.tsx | a1662876b77311fe5bc27e6eef53cdd6f8dc390a4b6e371f1741c425a1f41458 |
| components/layout/AgentShell.restore.test.tsx | 7bfe520a8ee7c3c176b1e819a8dfb0460b6b63a90fde504bc8547bdd42e043fb |
| components/workspace/RightAgentHeader.tsx | ea2350d74b26a42e550929b500fbbbaad28f8be4df043c88388d197e73608c6c |
| components/workspace/RightAgentHeader.test.tsx | 8834f8c8c3bb7df8322928d2ebe13bc44c7c6780511a44914ffd28871f474434 |
| lib/constants/app-mode.test.ts | 40d90d6af8aea3172b676793b552d66625761b8cb8919f89765cc280758dd922 |
| lib/i18n/messages/en.ts | 5240301311e8d2ab76b59c2bcba571b356450c23431b1665f3a070e4a2b6fe74 |
| lib/i18n/messages/zh.ts | e26a4dd61c01254a63acc7c741f713505740948f81f3f966e488266bbb5c24a8 |
| lib/stores/agentTabs.ts | d0e37575173db3cc6a1312ad6277b02ec04c443ae86ed747d26c8143cdafef9b |
| lib/stores/agentTabs.test.tsx | 2d22833b9806ae7e554b0393c5168efe1eb8df1fb565a79ba1d980bcd3572a92 |
| lib/stores/chatHistory.ts | 481b7ae5c02320844323a8099ad706f709410e19f9187aaca7c06ddbd0ad3fe2 |
| lib/stores/chatHistory.lifecycle.test.ts | cb07ebdad4fcb6df00b772a2b7844c6bfba9cd60972128cd454692ffa69d8ad7 |
| components/chat/AgentTrace.tsx | e99117666c986c5bb2c7fa7940b9f81f16baff73f533e74ae998c9fe53aa74a4 |
| components/chat/AgentTraceStep.tsx | e8796ca8a58e9c1685f6ab650fd88a5a852ea19e7476c75ee8bd7b9d8fa4bd8e |
| components/chat/ChatMessage.tsx | 6d337d0f4ec0d3f615914f97e50f6fc15affd9a404b609af7fe3f08236753b0c |
| components/chat/ToolTraceStep.tsx | 2a3ad221f580377b86a70b732f20eedb570b4889a645d842120c5de6c22a021f |
| components/chat/ToolTraceStep.interactions.test.tsx | 94f88bedce3f138f9aa1cd7594e1443914f3e8044997b6d73ba449bc34ad3e15 |
| components/chat/toolCards/cloudSandboxCard.tsx | 0ed1fcda9e8f71586a0ec0dfb29e8d506878e6075c415bfc36dec28bc21bfe86 |
| components/chat/toolCards/CloudSandboxCard.test.tsx | 524c3434cfacf8eb34fbca2854075b11a265b02e28c95462fdc775796624745e |
| components/chat/toolCards/learningConnectorsCard.tsx | 46c49707d1132bce69acb8b71f43ae2df3abd5a4bbbbca7981e750b060b70c6c |
| components/chat/toolCards/learningConnectorsCard.test.tsx | 49dd4270d713ed04bb954f937d4e3f236b8c2be6e27909ff0c872af78422bfab |
| components/chat/toolCards/kitSoloCard.tsx | aea1577035817210937a5bbb1633b4d24e0a0feb0c63a5841fc1533e1be7c959 |
| components/chat/toolCards/registry.tsx | ce5143910df3ee4908af6a72b60153fe70ddfa1ab80b2962f0aef4bf46f076c4 |
| components/chat/toolCards/registry.test.tsx | 82af0fa66ae5862b0114b0f3db0eb61f7676d27dc1093d0f4c1f1baf905bfe04 |
| lib/chat/buildTrace.ts | 89864ebb96e472696a32e53ac67366afcbc2ed3c162b7466543f569956c4c501 |
| lib/chat/buildTrace.test.ts | ee449f1ac187c7ccd9596289d36bcafd1fdad1dcdec75d52a272582db4868dc8 |
| lib/ai/agent/tools/registry.ts | 97feb6e7a87486b669e9628da6ff1ac6fee114d5c3e106c2400c05163bef0663 |

## 最新冻结检查补记

2026-10-05：11 React 文件 60/60，Node 33/33，32 精确 TS/TSX 文件 ESLint exit0，diff --check exit0。最后一次标准 pnpm typecheck 在新生成 `.next/dev/types/validator.ts` 701/706 行失败：layout 验证块已结束后出现截断 `ync` 残尾，并重复 API 验证块；文件时间 04:39:22 属重启生成期。此前标准 typecheck 已 exit0，当前标准命令明确未通过；未删/手改生成文件。仅排除此一个损坏 generated validator 的内存 TS 对照结果待补，不将其冒充完整标准检查。

## 恢复后的当前结果（覆盖上条未通过状态）

主经 Edge RootSolo 仅停 StudySolo、确认35349无Listen，将损坏的3个 `.next/dev/types` 文件原样归档后再启动；其余缓存/用户数据保留。Account 1b 后端原无Listen，主经按钮启动并核/health200，未启动Account前端或其它项目。worker重新运行**完整标准 pnpm typecheck exit0**，validator尾部为完整layout验证块，没有排除任何生成文件。

恢复后本worker按fresh family确认 Chrome=3/c93d扩展、Edge=4/05ad扩展（数字已漂移）。Chrome自己的旧公开课程刷新、同Chrome新公开课创建，以及静态 `/api/health/connectors/` 创建都30s控制超时/kernel reset；静态对照也失败，不把它判成确定产品renderer循环。新server日志未见Maximum update depth/getSnapshot/ResizeObserver/新browserError记录。没有进一步盲试Chrome，没有读cookie/隐藏store/CDP。

按主允许，用独立IAB访客公开页做渲染对照（visible=false为子线程支持接口，不登录、不复制cookie）：

- 1280×800 Studio：公开课程h1正确、RightAgentHeader可见、无横向overflow；guest登录gate/disabled发送符合现合同，tabCount0，不能假装已验证正常账号最近5或初始建议。
- 390×844：响应式下一帧完整手机五段详解/复习/AI/浏览/设置；点AI后原手机AI标题、设置/历史/新对话、登录gate与disabled发送可达，无横向overflow，不强套独立Agent比例。
- 1280×800独立Agent：outer main512/dock767（默认60%），inner left179/center332。真实折叠会话栏left0，再顶栏恢复left179；真实收起工作区dock0，再顶栏按钮恢复dock767，最终原比例及无overflow保持；项目+可见。AX将aria-pressed顶栏按钮映射checkbox，按真实DOM button角色操作可恢复，不是渲染循环。
- 以上关键截图已通过支持screenshot API返回，只含公开课程或访客空Agent，未输出私有历史/账号。测试IAB viewport已reset。访客证据不代表已登录的会话/工具业务验收；Chrome正常账号菜单、原案例真实发送、最近5/历史/刷新、新PubMed/Crossref调用仍待控制连接恢复。

当前：34产品/测试hash未变，60 React/33 Node/32精确lint/diff通过，完整typecheck恢复后通过；没有完整CI/提交/部署。等待主独立验收与Chrome控制恢复决策，仍不标整包完成。

## 冻结交付与最短续测步骤

主独立复核原native trace、单registry、原part回写、MCP固定action/owner guard、Cloud固定retry/下载，以及header/tabs候选，未要求继续扩大实现。Cloud进度为用户点击“查看进度”的**手动 poll**，没有宣称后台自动轮询。当前HEAD `c63edd45` 是其他任务提交的会员修改；本包没有提交。

34文件 SHA-256 已重新逐项校对，34/34一致，0 mismatch；截图保存于 `artifacts/performance/ui-dialogue-2026-10-05/`（忽略的本机证据目录，不随产品提交）：

- `studio-guest-1280.jpg`：公开课程桌面、header、访客登录gate。
- `studio-guest-390.jpg`：已就绪公共正文与手机壳基本无横向溢出；Next dev菜单浮层打开且AI高亮/课程正文仍显示，不支持AI面板最终状态或稳定导航选中态的证明。
- `agent-guest-1280-restored.jpg`：独立Agent 60%工作区、左右恢复终态、项目加号、访客gate。

Chrome控制恢复后直接执行：

1. 按fresh family/扩展身份绑定现Chrome，复用已有workflow-acceptance-1002登录cookie；打开本机公开概率1.1，1280下新建最多6条UI-DIALOGUE自建普通短对话（提示不得搜索/工具），核最近5、固定+、活动旧历史纳入、Shift+F10/右键关闭其他/全部。关闭只影响tabs，历史重新打开与刷新保留；不删除旧真实会话。
2. `/agent`空态核四个15px Lucide原案例；Studio空态核共享NewChatSuggestions，点击一个普通建议真实发送；回答后追问仍为FollowUpQuestions。核默认60%、项目+与状态同行、用户改宽后刷新、左右折叠恢复。390遵循现手机Studio壳入口与输入，不套桌面比例。
3. 在本worker自建独立Agent测试对话中，只要求learningConnectors通过PubMed或Crossref读取一条公开文献；不启云VM/费用动作。核同一原生step展开的input/result/source，正文无独立重复卡，刷新后消息fact不变。正常/失败真实输出以实际结果记；确认/取消、auth固定retry、日志/下载的失败/待确认组件fixture证据已存在，不冒充真实VM运行。
4. 只截上述公开材料/自建测试区，记录实际console错误类别；账号切换若无第二预授权账号，以owner fixture边界说明。端测通过后交主冻结提交；未通过继续原worker返工。

当前整包状态：**技术检查通过，部分访客布局证据，正常账号tabs/工具完整端测尚未完成，由主接手独立验收**。没有假closed、整线CI、新服务、资源创建、生产操作。

截图 SHA-256：agent-guest-1280-restored.jpg = 0c21537a9a5d7c88b36472f1416b70be688ca08444ad5bd0385b860ae2c14009

截图 SHA-256：studio-guest-1280.jpg = 11a17fdbaa4e7e7d2ddf7ec4af99e83c3cbaf0baef802e0b86d8abeb5a8ab2ab

截图 SHA-256：studio-guest-390.jpg = 82efc743f1f51fb3e2355086e35fa56c0daa7a0aa44f76ec8648dae5a798d7b1

Viewport边界：IAB临时viewport已reset；先前Chrome1280 override设置后控制超时，其reset未能确认，恢复Chrome控制时先reset再设置验收viewport。


截图证据纠正：主复核发现最初保存的studio-guest-1280.jpg实际上为账号空间加载画面，先前将其描述为就绪截图不准确。按主许可只补一次：先读DOM确认ready complete、公开h1为1.1随机试验与样本空间、RightAgentHeader=true，再覆盖该文件。最终文件为1280×720（IAB默认viewport已reset），可见公开正文/header/访客登录gate；Next dev菜单仍打开，截图只证明这些可见入口。390文件由主实际确认已就绪，但其dev菜单和AI高亮/正文组合限制上面已明确，不用它证明AI面板最终状态。agent-guest-1280-restored.jpg由主核为正常。没有为截图再重试或扩大端测。


## 主独立截图验收纠正（以本节为准）

主已实时重新读取保存文件：agent-guest-1280-restored.jpg 显示完整访客Agent/60%工作区和恢复后布局；studio-guest-390.jpg 显示公共课程正文和手机壳，但Next开发菜单浮层打开且AI高亮/正文组合不证明AI面板最终状态；studio-guest-1280.jpg最初为账号学习空间加载画面，一次补录后当前文件已显示完整公开课程正文/header/访客登录gate，主已复看确认，Next开发菜单浮层仍开。截图只能证明这些实际可见内容，不泛化成整包或登录业务端测通过。

## 用户明确继续后的实时探测与交回

用户明确继续：外部步骤阻塞不停止整个任务。2026-10-05本worker恢复原UI包，读取最新报告与账本后保持34产品/测试候选不变，不重跑既有60 React/33 Node/type/lint、不新增样式，不提交。

本轮**实时**Chrome探测：用c93d扩展身份成功绑定当前Chrome（family=chrome，当前id=3），随后支持API的`nameSession → 本worker tabs.list`组合调用在30.2s超时/kernel reset；未取得可操作tab或DOM，不能确认当前登录态或执行账号流程。不能从这一次结果判断永久失效，也不能精确归因到组合中的某一个调用。本轮未继续30秒失败循环，没有跨claim主ownedtab、复制cookie、读隐藏store或改环境。

该组合控制步骤单独隔离，不代表Chrome整体不可控。正常账号最近5/固定新建/右键CloseOther/All/历史重开/刷新，原案例与共享引导真实发送，公开PubMed或Crossref原生工具新读取尚未由本worker完成；失败/待确认/恢复等组件fixture和此前独立检查保留为各自层级证据，不冒充真实VM。最短续测步骤沿本报告前述四步执行，不重新授权现有应用。

本轮返回状态仍为**技术检查通过、部分访客布局证据、正常账号端测未完成**。UI不假closed、不提交；没有自行转入整个任务停止或要求人类处理所有后续工作。

最新实时事实（以此覆盖“Chrome整体阻塞”的旧判断）：主直接通过`cua.createBrowserTab('chrome', 本机概率1.1, { sessionName })`在2.17s成功，随后只读DOM在0.167s成功，RightAgentHeader=true、loading=false、loginGate=false、会话2条。**当前Chrome整体可控**；本worker的失败只发生在可选`nameSession → tabs.list`组合，不能声称未执行的DOM检查失败或浏览器连接不可用。主使用自己的新tab1671245560独立完成账号UI端测，不跨占worker tab。worker停止重复探测，准确返回本轮partial；主验后继续后续独立包。


## 主真实Chrome刷新发现与同包最小修复

主在可控Chrome自己的本机公开课创建5条UI-DIALOGUE短对话并收到真实模型回答：标签数遵循上限5；右键菜单4项可用，关闭其他后切到own3。刷新后当前正文却是own5、tab数2。主通过UI历史按已知唯一测试标题重开own3，确认测试正文存在，没有删历史证据。

确定根因：`chatHistory.switchSession`此前只更新内存activeSessionId并加载正文，不调用原persistManifest。CloseOthers因此刷新恢复此前persisted own5；Header把active强制可见并reopen，保留own3外又重开own5，形成2个tab。关闭瞬间仍5个DOM节点可以是退出动画，不据此判菜单未生效。

仅修复`lib/stores/chatHistory.ts`的switchSession：set回调内调用`persistManifest(state, manifestOf(state, { activeSessionId: id }))`，复用已有_hasHydrated、Account owner key、写防抖与离页flush链。没有新store/API，没有改账号、同步、IDB架构或其他包。

新增有意义Node回归：closeTabs former-active/other → switchSession target → flush →同owner重新水合 →恢复目标active及正文、全部metadata保留；header既有reopen(active)语义不会重开旧active。新增case调用真实bootstrap，需要测试teardown activateStorageOwner(null)清理memo，避免后续旧fixture人为_hasHydrated=false与已完成memo冲突；产品bootstrap不改。

受影响Node lifecycle **20/20通过**；两文件ESLint及作用diff --check exit0；必要完整`pnpm typecheck` exit0。34文件名单不扩，仅上表chatHistory及lifecycle两项SHA已更新。主热更新后重新点击已知own3触发新持久化分支，再真实reload复验；此前选中不会因热更新自动补写。

## 主独立真实原生工具验收（最新证据）

主在自己的真实Chrome独立Agent测试对话中，执行公开PubMed status/discover/search/read并读取PMID42791080。同一原生tool step展开区可见参数、section detail、result toggle与source URL，正文没有独立重复卡。又用不存在的Crossref DOI进行只读调用，返回PROVIDER_REQUEST_FAILED；原step呈红色error、自动展开参数及错误，同样没有重复卡。以上是主真实浏览器回传的公开测试证据，不是组件fixture，也没有启动收费VM。

主保存公开测试截图于同一证据目录：`artifacts/performance/ui-dialogue-2026-10-05/native-public-read.png`、`native-public-failure.png`。这两项更新了原“正常工具端测未完成”的旧状态：原生工具正常读取和失败展示已经主独立验收；switchSession修复后的真实刷新、CloseAll和最终桌面/窄屏等会话UI验收仍由主继续。worker不重复工具调用或测试、不再改产品、不自行判断整任务完成。

## 主最终本机验收（2026-10-05，以本节和账本为准）

主直接创建Chrome本机页成功并复用已有登录态；可选nameSession/list超时不能概括为Chrome全局不可控。自建5条普通短对话，顶部超过5条记录仍最多5；右键四菜单与Shift+F10均实际打开。CloseOthers刷新缺口由原worker按原manifest链最小修复，主重验刷新后仅1目标tab、目标自建正文仍在；CloseAll刷新后1空白tab且0用户消息。历史中唯一已知测试标题可准确重开，后续历史总数由6→7保留，无删除操作。

独立Agent原四条案例/15px图标实际可见；Studio共享初始三行引导真实点击提交并产生回答。1280桌面Header/固定加号无横溢；390稳定手机AI面板、设置/历史/新对话、输入框和共享引导已实页验证且无横溢，干净截图studio-authenticated-390.png。独立Agent默认60%及左右折叠恢复沿用worker实际公开访客测量与主截图检查，不谎称主重复了所有动作。

主真实模型PubMed完成status/discover/search/read，公开PMID42791080；原步骤内input、原detail、结果toggle和来源可用。另一次刻意不存在Crossref DOI的只读调用失败为PROVIDER_REQUEST_FAILED，原步骤error并展开参数/错误，无正文重复卡。两张原生截图见native-public-read.png/native-public-failure.png。没有云命令或收费VM；云确认/取消/下载额外证据为已有组件验证，真实云闭环留第二条线。

最终定向React60、Node34（trace14+lifecycle20）、精确ESLint及完整标准typecheck通过；34产品/测试文件冻结清单继续有效（刷新缺口更新2个hash）。主diff/hash/复用及本机关键流程验收通过，允许本包任务分支commit。未运行整线完整CI、未同步主/dev、未部署网站。一次后续Chrome导航CDP超时保留为控制限制，不据此停目标或推翻已实际取得的证据。
## 2026-10-07 Agent入口观察复核：无源码改动

本轮主正常导航/agent时先看到AuthProvider的默认SSR“正在打开账号专属学习空间…”；随后主实际AX确认URL回到公开概率1.1。主当时viewport默认702，属于mobile。源码AppShell的mobile effect明确将普通/agent经hrefForMobileAppMode('agent', lastStudioPath)映射回Studio，保留/c深链与plugins例外；app-mode.ts明确手机Agent使用Studio五段壳，不套桌面左右工作区。这与既有UI手机合同一致，不能把回跳判成auth永久阻断。

主将viewport设1280后正常导航/agent，DOM与AX均恢复正常Agent访客界面。无cookie带Origin的Account session请求由主核401/251ms，服务器未hang；本轮没有store hydration rejection证据。未绕身份、复制cookie或借主IAB ID；没有修改AuthProvider/Account/timeout/安全逻辑，没有新增测试或重跑已验UI。桌面入口仍为app/agent/page.tsx→AgentChatCenter；主继续核实际Browser consumer。本轮no-change，其他在途Browser/Feedback/Landing/sandbox/Shared/env保持原样。
