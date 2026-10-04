# StudySolo 完整上下文、问题盘点与无人值守交接

更新日期：2026-10-04。状态：**用户反馈产品整体不可用，交付验收未通过；当前仅整理文档和盘点。**

本文取代本轮旧的阶段日志与移交快照。当前任务状态仅维护在 [studysolo-workstreams.json](studysolo-workstreams.json)；不再在多份说明里分别维护“完成表”。代码存在、技术测试通过、Git合并、正式上线、用户可用必须分开记录。

## 1. 最新用户要求与本阶段范围

用户要求先整理正确、完整的上下文及待办交接，过期资料归档。未来通过无人值守方式由主智能体带上下文派遣子智能体；每个大板块由同一名子智能体分析、修复、自测，主智能体验收后开下一名。不要将相邻模块拆成大量原子任务。先确保基础功能、前端接口和设计一致性，不继续打磨高级UX。

最新明确问题全部保留，不以此前“已父验收”覆盖：

| 用户明确问题 | 必须落实的范围 |
|---|---|
| Studio/主项目右侧Agent顶部tab没有右键菜单 | `StudioAgentPanel` → `RightAgentHeader` 的实际会话条；不是只改独立Agent资源窗口 |
| 独立Agent输入框下的原案例被改坏 | 恢复本轮修改前认可的样式与行为，不再新增SVG卡片等新风格 |
| Studio新对话指导可以复用 | 从原独立Agent新对话案例样式提取/维护共享组件；场景只更换数据和回调，不能反过来重设计独立Agent |
| Review/复习业务都未完整跑通 | 笔记、闪卡、答题、掌握度、错题诊断、章节出题逐条完成真实用户业务闭环 |
| 自动沉淀与自动出题设计/前端接口有问题 | 模型结果→现有工具卡→确认/保存→可见结果→Review/笔记消费，核查实际网络请求和落库，不停在模拟卡片 |
| 菜单/通知未统一复用 | 直接复用当前项目菜单、portal、toast、样式变量；不得自己建立另一套外观和状态系统 |
| 连接器多个版本持续布局溢出 | 主智能体在MCP工作包里修复市场/连接/详情及错误状态的基础宽高、换行、滚动和窄屏布局 |
| 笔记目录位置 | 一级ReviewSidebar的“掌握度”下面分割线后是学科树与笔记列表；中心编辑器、右TOC，不恢复第二导航 |

早先叫作“Schedule页面”的需求仍须通过用户看到的真实入口核实。不能因没有字面`/schedule`路由就自行转移目标。最新Studio右侧tab的位置已由代码核对，不能继续混淆。

## 2. 已核实事实与证据边界

- 远端网页基线：master `b9264be04884b59df71c8adc452dccfed3f4fc9f`、dev `48b2f83186e5e558aeaee192f2291b884e917683`，此前同步时tree一致，非force push。PR184和主分支CI已通过。这些不是产品交付完成证明；继续工作必须重新fetch并核对是否有后续提交。
- 本机源码分支 `codex/unattended-agent-platform-2026-10-04` 还包含未合入master的客户端准备。不能把工作树行为自动当成正式网站行为。工作区有其他任务的会员/额度/i18n改动；不得夹带、重置、stash或覆盖。
- PR183客户端仍draft/open，冻结head `3763fb425f884e00e03c4cf1ea84995733c19f4e`。Android实际模拟器请求测试通过；Windows包能构建但实际启动检查`packaged_app_server_health_timeout`未通过，未公开发布0.6.0。最新公开桌面版此前核对为v0.5.1。
- Review一级目录修复有局部真实页面证据：1280px时256侧栏/804编辑区/220TOC，第二导航0；390px选笔记关一级抽屉、编辑区390、无重复导航按钮。证据用公开案例笔记，**不证明真实编辑、保存、云同步、刷新恢复或完整Review业务已通过**。
- 云沙箱开发链路、两个完整Skills原脚本渲染和模型完整调用存在真实技术证据；MCP七类服务存在开发账号最小读取证据。开发账号、合成SQL记录和fixture不能代替正式用户账号。
- 连接器最新一次只读正式探测：health=200、实现标记true、productionVerificationComplete=false；`/api/connectors`=401/SESSION_MISSING。按代码顺序已经越过生产关闭检查；**不表示正式用户已连接或真实调用成功**。此前403记录是历史，不要继续当实时状态。
- 用户当前明确反馈基础功能不可用，全部业务交付状态按“需返工/未完成用户验收”管理。旧技术证据不删除，但不能否定用户反馈；具体技术根因需复现，不预设为旧部署、缓存或用户环境。

## 3. 认证与配置资源盘点

### GitHub

当前个人App列表曾观察到一个`1037Solo Connectors Dev`；其设置页显示2个Client Secret、3把Private Key。开发/生产App ID、Client ID、Secret一致，有效PEM与环境base64一致；当前私钥只读GET /app=200且身份匹配。额外Secret/Key使用者未映射，尚未撤销。失败下载归档不是有效PEM，不能计作运行中的私钥。再次进入设置可能要求Confirm access/Passkey，属于安全验证，不是新建应用。

### Google

StudySolo项目列表曾观察到旧`RootSolo`（页面创建日期2026-03-29）和本轮`1037Solo Connectors Dev Web`（2026-10-03）。项目两环境使用后者，同一Project/Client/Secret。旧RootSolo具体使用者尚未完整核实，不能当重复应用删除。

两服务分别保留localhost和正式HTTPS精确callback；新增callback不代表新增应用。Google五项已批准范围是gmail.readonly、gmail.send、drive.readonly、calendar.readonly、contacts.readonly；此前核对仍Testing，未完成面向普通用户的全面生产验收。Google接入为官方API/OAuth，不是Workspace官方MCP已启用。日历写入需要增量授权，不能用readonly权限冒充写权限。

### 存放与身份

应用秘密仅在服务端环境/受限备份，用户grant加密按服务端Account UUID与provider绑定。开发文件vault与生产数据库vault分离，不复制开发token冒充生产授权。Notion/Todoist共享DCR记录按精确callback绑定，已有租约与只允许首次插入实现；不得因为压缩上下文重新注册。SSO登录、应用凭证、用户授权、安装权限、callback与密钥是不同对象。

`.env.production`本机准备文件已补ACCOUNT_BACKEND_URL/NEXT_PUBLIC_ACCOUNT_URL，并将CONNECTOR_ALLOW_PRODUCTION、CLOUD_SANDBOX_ENABLED设true；模板/Skills版本、正式地址、数据库和100元预算结构校验通过。密钥与无关值保留，Windows全局环境未更新。文件准备、实际进程环境、正式用户授权分别验收；本轮不更新环境或复制凭证。现有check-env脚本按Next优先级读取.env.local，不能把覆盖后的检查当作.env.production单文件审计。

受限资料在`.local-archive/connectors-private/`，不入Git、不输出值。授权用户UUID不接受请求JSON或模型参数；Account实时introspection是唯一身份依据，官方Supabase签发用户令牌。当前RootSolo项目为`zizaonaxfguvlzdcbxzw`，不得用退役项目或自签Account JWT。

## 4. 云沙箱与部署边界

- 阿里云杭州专用Team和模板已准备，E2B 2.31.0。只有独立Agent拥有云端通用命令；Studio内嵌Agent、Class、Review、笔记、计划等不能执行。
- 一会话独立提供者VM，USER/NET/MOUNT与宿主普通UID10001映射；保留提供者配对PID/proc，不能宣称独立PID/proc。任务默认无一般外网，只自身loopback；密钥与用户授权不注入任务环境。支持已安装Linux CLI，不保证任意联网工具/GUI/Skill兼容。
- VM最多15分钟、命令最多10分钟、日志256KiB、单产物20MiB、20件/100MiB、并发1、每用户24h10次。本轮与每月新增资源均≤100元；预留30元准备费用、任务准入70元。结构准入不是账单，实际模板/存储/任务账单未核对。
- Notes to Handbook 9文件、GB包17文件完整安装和真实渲染有技术证据，正式用户安装/模型使用仍未交付；每篇文稿自身还需验收。
- 命令行与Skills指本项目Agent调用广义CLI并配合技能脚本，不是网站具备真正Codex CI或Codex客户端执行能力；不要恢复误导性名称或仅复制配置来冒充安装。
- **禁止在38.47.118.246 VPN VPS再上传/部署/启动StudySolo或改VPN/Nginx/其他服务。** 本轮预检进程/专用daemon/forward和两个新增目录已撤回，释放3.98GiB；配置日志及发布归档本机保留。不能据撤回时active状态证明用户VPN正常，也未证明故障因果。
- StudySolo网页按用户现有master/dev推送触发部署，不在MainECS。只有必要时才通过用户指定Grok BOT中的准确Notebook Agent协作，不能把OpenClaw Assistant当该接收方。原生桌面工具不可用时不绕过控制限制。
- Landing/Shared等生态发布遵守父AGENTS/OPS的原子列车规则，不擅自改其服务器、进程或单发其他站点。Supabase迁移曾应用有历史证据；执行前重新核对当前schema/权限/applied history，不重复旧SQL，不改已应用006文件。

## 5. 正确产品入口与现有组件

| 目标 | 当前源码入口与必须区分的对象 |
|---|---|
| Studio/Class共享右Agent对话顶部 | `components/layout/StudioAgentPanel.tsx` → `components/workspace/RightAgentHeader.tsx` → `components/chat/ChatPanel.tsx`；Header当前MAX_RECENT_TABS=12，没有onContextMenu，用户指出的缺失仍为待办 |
| 独立Agent资源窗口条 | `WindowTaskbar.tsx` → `AgentDockTabs.tsx`/`AgentDockTabMenus.tsx`；已有右键与最近3项，但**不能代替上面的会话条** |
| Studio右侧AI/视频/互动/浏览器切换 | `components/layout/RightPanel.tsx`；也不是会话tab或独立资源窗口条，实际交互须分别确认 |
| 独立Agent中心tab | `components/agent/AgentCenterTabs.tsx`；不能因为都叫tab就跨模块代替需求 |
| 新对话原案例 | `components/chat/AgentWelcome.tsx`、ChatPanel与chat-tools.css/prose.css；原版见下方基线，不直接照用目前改坏的SVG卡片 |
| Review主工作区 | `ReviewWorkspace.tsx`/`ReviewSidebar.tsx`/`ReviewNotesPane.tsx`/`ReviewNoteWorkspace.tsx`；一级目录+中心编辑器+右TOC；浮窗没有一级侧栏，保留自有导航 |
| 连接器布局/接口 | `app/agent/plugins`、`components/agent/plugins`与`components/plugins/Learning*`；长名称、状态/错误文案、详情、卡片、按钮和窄屏均查溢出，不能仅overflow:hidden遮掉功能 |
| Review业务 | `components/review-mode`、`lib/review-mode`、`app/api/review/{quiz,progress}`与quiz/note stores，不能只修样式 |

原案例候选基线是本轮修改之前的commit **7be363eca5c88b93d93317b369fb1e6411eb8729**（`2c25564e^`）。用`git show <该commit>:components/chat/AgentWelcome.tsx`核对原图标/文案/行为；CSS也从同一版本比对。只恢复相关welcome部分，禁止整commit回滚或覆盖整个CSS；保持后来独立且正确的功能。用户认可的是本轮前的Agent新对话输入框下样式，未来worker仍需在实际页面比对该基线。

### 基础设计复用合同

- 菜单：`components/ui/AnchoredMenu.tsx`、`components/agent/AgentMenuSurface.tsx`、`components/shared/MessageContextMenu.tsx`及`lib/hooks/useContextMenu.ts`。先核对实际消费和语义再复用；不新写平行popup/portal/Esc系统。
- 通知：`components/shared/ToastHost.tsx`＋`lib/stores/toast.ts`，保持AppShell统一挂载；不局部造新通知样式。
- 主题/基础样式：`app/styles/semantic-tokens.css`、`appearance.css`、`chat-tools.css`、`prose.css`及现有motion/i18n。禁止以未采纳的design-snapshots/Glass探索作为规范。
- 对话引导：以原AgentWelcome样式提取共享展示，Studio引导接入同一展示组件；输入数据、场景语义和onSelect回调可区分。初始建议与回答后的追问不混为同一业务阶段。
- 笔记对照：只读参考Platform `home/src/components/features/assets/notes/NotesSection.tsx`与`home/src/components/features/wiki/note/NoteWorkspace.tsx`，在StudySolo复用当前组件，不搬整套不同的状态/身份系统。
- 先基础统一、接口齐全、无溢出和业务可用。高级动画、微交互与额外美化延期，不能以“更高级”理由替换用户已认可设计。

## 6. 前端到业务接口必须闭合

| 链路 | 现有接口/存储候选 | 验收重点 |
|---|---|---|
| 连接器 | GET `/api/connectors`；provider connect/callback/disconnect；inspect；固定actions确认/取消 | 正常Account身份→点击连接→提供者同意→返回已连接→实际Agent调用→刷新保留；错误/断连可理解，前端请求实发且作用域正确 |
| 沙箱/Skills | `/api/agent/chat`、`/api/agent/sandbox`、`/api/agent/skills`、产物路由 | 正式用户命令/技能到实际执行/产物/关闭，Studio等模式拒绝；生产费用有界 |
| Review | `/api/review/quiz`、`/api/review/progress`、immutable quiz sets/attempts、wrong context | 出题→答题→分数/错题保存→刷新恢复→掌握度→诊断/章节题；不能只看fixture/空态 |
| 自动沉淀/自动出题 | `ChatQuizCard`、toolCards/createQuizCard、noteChangeProposals、userNotes/review stores | 实际模型事件→现有卡片→真实确认/保存请求→数据可见→刷新/Review消费；UI与API都要核对 |
| 反馈/举报 | `/api/feedback/chat`、反馈组件；Landing `/api/admin/feedback`与admin adapter | 先记录操作→说明提交→后台同条数据可查→Account admin隔离；不用新风格弹窗替代现有组件 |
| 客户端/下载 | electron、mobile/android、client workflows、Landing frontend/downloads.ts/manifest | 真实签名产物、正常启动/登录/数据兼容、原生浏览器控制、官方Release下载与hash/安装 |

API源码存在不代表前端接上；HTTP200/401或界面按钮存在也不代表完整业务成功。若接口缺失、请求未发、目标错、返回格式不匹配、落库失败，属于本工作包必须修复的基本功能。

## 7. 大板块任务与执行顺序

机器账本包含**6项大板块子任务，全部强制GPT-6.1 Sol High**，所有用户细项映射在每个包requirements中；它们不是新的原子派遣单。

| 包 | 责任 | 完整范围 |
|---|---|---|
| CORE-MCP | 一名GPT-6.1 Sol High | 认证/密钥收尾、市场布局溢出与设计复用、前后端连接管理、真实模型调用、正式账号授权/续期/断连 |
| CORE-SANDBOX | 一名GPT-6.1 Sol High | 云资源/模板/账单、通用命令、安全隔离、Skills实际安装与模型使用、仅独立Agent、产物/回收 |
| UI-DIALOGUE | 一名GPT-6.1 Sol High | Studio/独立Agent共享对话、正确顶部tab菜单/最近项/新对话、原案例恢复与共享引导、推理链、Agent项目/状态/布局及共享导航基础统一 |
| REVIEW-NOTES | 一名GPT-6.1 Sol High | Review全部业务、错题/章节题、自动沉淀/出题前端接口、笔记目录/富文本/TOC/弹窗/保存/同步/性能与Class/Review导航 |
| FEEDBACK-ADMIN | 一名GPT-6.1 Sol High | 输出反馈动作、记录/弹窗/接口/权限、官网主要后台展示与正式验收，保留完整跨仓链路 |
| BROWSER-CLIENTS | 一名GPT-6.1 Sol High | 浏览器基本控制及各端、手机外壳、桌面数据兼容/启动/发行、签名/版本/hash和落地页真实下载 |

当前只整理，不派新实现。后续先核对共同的Account/接口/运行版本问题，建立CORE-MCP与CORE-SANDBOX正常用户的最小成功路径；普通大板块可先做不依赖未就绪服务的分析，但缺真实验收时不能关闭。相关内容一次性交给同一个worker，遇到同模块返工继续原worker，不把同模块上下文拆散。新的大板块只有前一包主验收结束后才开启新worker；最多一名子执行。

用户最新要求已撤销Cloud/MCP必须由主本人写代码的限制；这两个包的分析、决策、核心实现和已授权配置也交给GPT-6.1 Sol High子智能体，主智能体负责范围协调、方案审查、验收和整合。主与子不能同时改相同共享文件。菜单等共享接口先约定；次包消费已稳定接口，不各建平行组件。Feedback可消费Dialogue动作位但自己拥有反馈生命周期；Clients只改Landing下载域，Feedback只改后台域。

## 8. 不失忆、不重复和验收合同

- 状态只写机器账本；本文与refer不另维护完成表。归档只供历史/基线，不读取其中“待办/已验收”决定下一任务。
- 每包保留：用户要求、真实入口、owner、范围/排除、相关组件/接口、证据类别、用户可用结论、剩余问题、唯一下一步、实际提交/运行版本。压缩后重读这些字段与最新人类消息。
- 技术证据保留。Review一级目录位置局部已修复，不因整包未过就重建编辑器；用户新问题只定位具体失败范围。关闭的需求只有出现具体回归证据才能重开，并记录原因。
- 先分析根因，再完整实施、简单必要自测和真实页面流程；主必须看设计规范/复用、接口请求、持久结果和发布版本，不能只数测试。
- 不给可逆小改写镜像实现的无效测试，不无理由反复跑全仓。必要定向检查＋该包核心真实流程＋规定CI；新变化/失败才增加检查。
- 用户正常入口验收：登录→操作→真实结果→保存→刷新/重开→恢复。匿名案例截图不证明保存；开发授权不证明生产授权；包构建不证明可启动；合并不证明正式部署。
- 写操作保持候选/确认/幂等，不为验收发送无关邮件或修改无关真实内容。日志只存必要metadata，不能保存个人学习正文/联系方式/密钥。
- 登录/MFA由用户操作，不索要密码/验证码。常规已授权可逆实现不反复问；浏览器明确要求现场确认的动作仍遵守规则。
- 受阻时记录具体缺口，继续同包可独立部分；不随意扩到其他板块绕过困难，不将缺验收标成完成。

## 9. 仓库、证据和交接限制

StudySolo为当前仓库；Accounts负责身份，Shared负责契约/迁移，Landing负责官网后台与下载。Platform是笔记/样式参考。保护各仓原有会员等在途工作，不替他人提交。

局部本机证据：`.local-archive/review-primary-navigation-acceptance.json`、`credential-audit-public-2026-10-04.json`、`connectors-private/production-environment-audit.json`及此前render/model资料。证据路径可能仅在此电脑存在；新worker核对存在性，缺证据就明确缺失，不能编造。

Google/GitHub回调已观察保存，密钥多条/GoogleTesting/正式用户授权仍需收尾；微软按用户要求暂不处理，Anki当前仅TSV导出。不要新加未授权服务或将所有普通API叫官方MCP。

本轮旧8份快照已归档到`docs/archive/2026-10-04-unattended-snapshots/`，附原内容hash/迁移索引。无文件删除、无凭证迁移；未审查完的其他Class/性能/内容计划保留，不可据它们自动扩展本轮范围。
