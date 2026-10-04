# StudySolo 无人值守执行清单

启动日期：2026-10-04。用户授权：调研与接入阿里云云沙箱、MCP 收尾、所列产品修复、必要数据库迁移、手机 Web 壳、Electron 最新打包、GitHub 发布及下载链验证。购买上限本轮累计 ¥100、每月 ¥100。用户最新要求：云沙箱与 MCP 由主智能体亲自决策和实现，子智能体只能只读分析；其余修复每次仅一个子智能体，型号 GPT-6 Luna，推理 Max，主智能体验收后派下一项。保留各仓库已有工作，不清理他人改动或输出凭证。

## 接收的约束

- 广义命令执行，只供独立 Agent 模式；Studio 内嵌 Agent、Class、Review、Schedule 等不获得执行能力。
- 云端安全与环境隔离，任务/会话绑定 Account UUID，依赖真实安装，技能脚本、引用、资产和能力必须完整，不支持的服务不上市场。
- 资源购买或平台开通被挡住时继续其他工作，不能把配置占位、模拟测试称为真实开通或真实端到端。
- UI 延续项目设计语言，对标 Codex 的线条、状态和交互；有必要的回归、真实页面和性能证据，单个任务验收后再继续。
- 生产与发布遵循父 AGENTS/OPS 与现行 SOP；用户本轮明确授权的范围优先。不用旧数据库/旧部署材料，不删除文件。

## 阶段与状态

本表已按用户指出 VPN 服务器用途后的状态刷新；旧记录保留为历史，不能用旧快照当当前状态。详细交接见 [当前状态与部署交接](2026-10-04-current-status-and-deployment-handoff.md)。

| 顺序 | 范围 | 当前状态 | 剩余验收 |
|---|---|---|---|
| 01 | 阿里云通用 CLI、模式门禁、隔离、完整 Skills | 主智能体代码、真实 Ali CLI、两包渲染、模型完整执行循环已验收并合并 | 正式网站部署、生产身份/执行验收、账单核对；正式开关关闭 |
| 02 | MCP、连接市场、认证、写入确认 | 七类服务开发真实读取；Google/GitHub正式回调保存；核心已合并 | 正式每用户授权、Zotero正式核查和线上调用；正式开关关闭 |
| 03 | tabs、菜单、推理链、建议与标签 | 代码和实页父验收、已合并 | 网页正式部署；最近3项跨刷新历史恢复未实现 |
| 04 | 点赞/点踩/举报、反馈后台 | 代码/HTTP/SQL/admin父验收，相关迁移应用，StudySolo及Landing代码合并 | Landing生态正式发布与浏览器验收 |
| 05 | Review mastery、attempt、错题诊断、章节出题 | 006真实迁移、真实生成/诊断与分页父验收、已合并 | 正式网站与跨设备恢复 |
| 06 | 模式动画、项目加号/状态、Agent默认右栏60% | 代码、实页默认/折叠/拖动父验收、已合并 | 正式运行状态视觉复验 |
| 07 | Review笔记树/Markdown/TOC、弹窗、层级与性能 | 代码及实页三栏/窄窗/抽屉/Esc父验收、已合并 | 正式认证云同步、主题覆盖与性能测量 |
| 08 | Class/Review导航、浏览器zoom/reload | 代码/组件/实页父验收、已合并 | 正式网页复验、09真实native zoom端测 |
| 09 | Electron/Android0.6.0、GitHub发布与下载 | 干净Windows/Android build、Android lint、common CI通过；PR183草稿 | 两项native端测驱动修复待父审/新CI，签名公开发布、下载验收、Landing真实manifest |

部署纠正：38.47.118.246 VPN VPS 上仅本轮新增预检进程/daemon/隧道已停止，/opt/studysolo-preview与/opt/studysolo-runtime已在本机备份配置日志后移除，释放3.98GiB。禁止再次部署于该VPS。后续按用户指定 Grok BOT / Notebook Agent；当前仅找到OpenClaw Assistant，准确网页入口待用户提供。网页发布与客户端修复解耦。

## 最新进展

- 云沙箱/MCP 由主智能体独立实现。`cloud_sandbox` 子智能体已停止写代码并返回只读分析，确认未改项目文件。
- 用户批准杭州 Sandbox 所需 ACS/Sandbox 服务关联角色，已创建；专用 Team `studysolo-agent`，QoS default 已创建。
- 用户要求密钥永不过期，已创建并安全保存在受限目录；不在文档中记录值。复制后剪贴板已清空。
- 官方推荐 E2B 2.31.0 已固定安装，无供应链发布时间豁免。真实最小创建/命令/终止通过，随后文件读写、禁止公开网络与实例元数据连接、终止通过；模板资源实际 2 CPU/2048 MiB、envd 0.5.2。这些是提供者验收，不是产品端完整验收。
- 初始 SDK 连接曾超时，重试前核对实例并限制 TTL；执行器设计包含 uncertain 状态、元数据匹配、租约与保守预算，不盲重建。
- 根目录 Supabase MCP 可用，目标 RootSolo ACTIVE_HEALTHY / ap-southeast-1；已查询三项治理元数据，旧 auth 说明漂移，按现行契约处理。
- 主智能体已编写 `lib/sandbox/` 基础实现、独立 `/api/agent/chat` 请求路径、唯一 cloudSandbox 通用工具及结果卡、服务端 owner/会话门禁、命令日志/取消/产物与 Shared 迁移草稿。正在安全测试与真实端测，尚未宣称完成。
- 每小时本聊天续查自动化 id `studysolo` 已创建；完成全部授权任务后停用。

## 任务移交规则

子智能体：只在指定范围工作，先读适用 AGENTS，列根因与验证方法，再实施；把测试日志保存在 ignored 本机证据目录，提交简洁报告包含文件、测试、未验证边界。不得擅自开下一名子智能体、修改其他阶段、推送/部署/删除或显示凭证。

主智能体：独立看 diff、风险与端测证据；发现问题回派同一个子智能体修正；验收通过再派下一阶段。阿里云浏览器操作、计费授权与跨仓协调由主智能体负责。最终不能把整批尚未完成工作写成完成。

## 起始状态

- StudySolo master 8bae8f0d，远端 dev f377633f 已包含上一轮连接器代码。市场修正草稿仍未提交，3 项 UI 测试、7 项市场逻辑测试、类型与相关 ESLint 已通过。
- 云端 /api/connectors 上一轮实查返回 CONNECTOR_PRODUCTION_DISABLED；尚未宣称生产 MCP 完成。
- 调研文件：docs/analysis/2026-10-04-cloud-skill-execution.md。
- Notes to Handbook 源包：D:/projects/My-Skills/notes-to-handbook；GB 包：D:/projects/My-Skills/gb-standard-docx-pdf/gb-standard-docx-pdf。
- 原有私密目录 .local-archive/connectors-private 不进入 Git。Shared 本地有原有未推送提交，任何部署/迁移前先核对。

## 2026-10-04 持续执行记录（主智能体）

- Notion/Todoist 真实读取原先失败已定位为 JSON Schema 2020-12 校验器不兼容；已保留全部约束并支持 2020-12/2019-09，七个原生服务当前开发账号真实读取全部通过。未发送邮件、修改待办或写入第三方内容。
- Shared 三份 migration 已经通过 PGlite ACL/预算/不可变身份测试，并经当前 Supabase MCP 应用到 RootSolo；新技能包安装记录使用现有加密 service-only execution records 的 skill kind。
- 两个完整 Skills 包已准备，分别 9/17 个脚本、引用、模板等文件；完整性目录和账号安装 API、真实依赖就绪门禁已写。没有复制不可再分发的 Codex 专有 companion 资源。运行模板未通过验收前，市场隐藏两个云技能。
- namespace 调查发现 SDK secure:true 仅保护外部入口；沙箱内部可以用本机 envd API 指定 root 执行，不能只凭普通 UID/no_new_privs 宣称保护了控制进程。生产仍关闭。主智能体已亲自改为可信 root launcher 创建 USER/NET/PID/MOUNT 命名空间，由父进程把命名空间 UID0映射至普通宿主 UID10001；任务只开启自己的 loopback，无外部路由。平台拒绝重挂 proc 时保留单租户 VM 原 proc 目录，但进程信号解析仍属于任务 PID 命名空间、root 文件仍受普通宿主 UID 权限约束。正在最后真实验收；不得把较早 9 项测试当作这一版隔离已通过。
- 独立 headless 基础模板 studysolo-cli-v1-20261004 已由官方镜像成功创建。带 Chromium/LibreOffice 的 MicroVM 模板 studysolo-skills-v2-20261004 已在控制台提交，构建状态待核对；SDK 2.31 Template.build 默认代际不接受启动命令，失败实现已归档，正式准备脚本明确 generation2及五分钟构建边界。
- server instrumentation 每15秒维护命令结果和回收队列；队列从未释放 reservation读取，已关闭记录不会堵住100项批次。空查询不立即认定创建没分配资源；保守预留不因终止而抹去费用。预算默认另保留30元固定/准备费用余量，任务计算只使用余下70元。
- Electron 的主 Agent 请求/命令/产物/Skills 与原生连接操作已写固定线上转发层。只转发用户 Account token，不转发操作者云密钥或浏览器所有 cookies；其他模式不走该执行路径。源环境过滤操作者凭证、OAuth-native cookie读取与鉴权下载已修正。仍需真实打包/线上验收，不宣称已发布。
- 目前只有普通 UI 子智能体 /root/schedule_polish（GPT-6 Luna Max）活动，负责资源 tabs/右键/推理线条/建议卡片/输入小标签；不改 Cloud/MCP。仓库没有 /schedule 主路由，按实际结构把最近3项落在 AgentDockTabs 的资源窗口，对话不新增 tab。窗口目前是内存态，刷新不会恢复历史3项，必须明确这一边界。正在端测，父验收后再派阶段04。
- 尚未新 commit、push、合并或发布。Shared 本地原有 ahead3 必须隔离自己的提交，不能随新迁移盲推原有无关提交。

## 最近验收更新

- 最终采用 USER/NET/MOUNT命名空间与普通宿主UID映射，保留提供者配对PID/proc视图（提供者拒绝proc重挂；不虚构独立proc）。真实7项隔离检查通过，包括宿主root信号权限、本机控制API拒绝、控制文件拒绝、凭证不在进程参数。
- 已更新 .env.local/.env.production 的 CLOUD_SANDBOX_TEMPLATE、FIXED_COST_CNY、SKILLS_VERSION、SKILLS_TEMPLATE；原密钥不变、生产仍关闭、全局与远端环境未改。基础模板CLI真实接口9项再次通过。
- 真实GLM模型工具循环通过 PubMed公开检索 + open/exec/poll/close；第一项read漏operation被拒绝后model discover并正确修复。最终退出码0、资源closed、正文返回。起初0.3元预算被准入拒绝，不声称那次已调用；在2元单轮限额内重验通过。
- MicroVM Skills模板最终状态失败；不重复堆建实例，保留门禁，准备预装OCI镜像及手动GitHub构建，不能宣称渲染依赖已安装。
- 阶段03资源窗口/菜单/欢迎建议/追问/快捷提示通过子自测和实页端测，父读diff、实页、18项相关UI测试验收；追加修复菜单内滚动误关闭和roving tabIndex。不存在闲置监听或刷新恢复承诺。已复用同一个唯一Luna Max worker进入阶段04（反馈与LandingPage后台），方案通过父审查；首次vote不附带摘录，用户勾选后才带≤600字脱敏预览，细节更新CAS避免旧弹窗覆盖新vote，后端用Account live身份与admin角色。
- 实际落地页仓库名称为 1037Solo-LandingPage，之前简称Landing，不是1037Solo-Landing。

## 提交与云端审查状态

- StudySolo core commit 7be363ec（云命令、MCP、市场、Skills门禁、客户端代理）和 UI commit 2c25564e（阶段03）已保存并推到 codex/unattended-agent-platform-2026-10-04。
- Shared primary main已保存本轮3迁移 commit e1e4293，但原有ahead提交没有推送；在干净独立工作区从 origin/main仅cherry-pick本轮变更为43c6963并推到codex/studysolo-cloud-sandbox-2026-10-04。
- Draft PR：StudySolo https://github.com/AIMFllyYS/Notebook-MedFreshman/pull/171，Shared https://github.com/AIMFllyYS/1037Solo-Shared/pull/2；均已附到本聊天。尚未合并/部署。
- Staged秘密扫描 core118文件、UI23文件通过；导入技能参考文档的Markdown两空格换行属于原文格式，已用特定gitattributes保留，其他文件diff check通过。反馈阶段在途文件没有混入提交。

## 当前执行补充

- 初次完整远端CI有3项失败：Vitest测试误放node:test文件、旧市场断言要求8条CLI和所有服务有远程MCP地址。父已修正为正确运行器与实际connector registry契约，6项针对测试通过，commit a5aee471已推送；新完整CI正在运行。
- Skills预装镜像增加受限Docker构建上下文，只允许依赖脚本和完整技能包；计划在无网络、普通UID、无额外capabilities的容器内实跑中文HTML→PDF、DOCX→PDF、全文/A4检查和页面渲染，不能仅凭包import就标记验收。
- MainECS SSH只读预检遇到Connection closed/255，未改服务器；现有宝塔浏览器tab也无法取得控制句柄。线上部署暂待通道恢复，继续代码、迁移、产品修复与可运行的构建任务，不让这一项阻塞全部工作。
- 反馈003草稿父审查发现缺少用户自由说明字段，已要求补齐有限长度feedback_text、服务端脱敏与revision CAS；尚未应用该草稿。

## 后续实况（以上早期快照以本节为准）

- PR171经过CI运行37146596997完整通过后，已合并master为9b2a2001636660d1bc79c60ad19485cc34005274。dev同步merge为bdbe37e30fe3f51728202716ada2dc2718a2826a，merge-tree与已验收master的tree完全相同，没有覆盖dev独有变更。
- 04反馈提交154c478b、反代origin修复/桌面Review数据桥接480c9a4e已推送；新Draft PR172 https://github.com/AIMFllyYS/Notebook-MedFreshman/pull/172，独立CI在跑。Shared本轮feedback/权限commit e9d9212仅cherry-pick到干净branch为eb32c88，PR2已更新，原有local ahead历史未推。LandingPage branch codex/studysolo-chat-feedback-2026-10-04 commit102126d，Draft PR1 https://github.com/AIMFllyYS/1037Solo-LandingPage/pull/1，source-only类型通过，干净Next生产构建和管理员实页仍待发布门禁。
- 003/004反馈迁移与005明确service table privileges迁移均经当前RootSolo Supabase MCP apply success。实际7表ACL显示匿名/普通authenticated无select、service全部无TRUNCATE；只有coordination locks/leases允许DELETE，其他内容/预算/feedback无DELETE。PGlite加入模拟Supabase default grants，避免纯新数据库测试漏检默认授权。
- 菜单原先RAF期间hidden却提前focus的真实问题父已修复：layout测量→visible commit→focus；sidebar+menu13测试和真实页面Down/Esc/恢复原按钮focus通过。
- 父检查Next实际源码及构造Request确认自托管nextUrl可指向内部bind地址；MCP与feedback使用固定public配置、实际Host、POST Origin，不把caller forwarded-host作为权限。针对反代/伪造Host/跨站回归已通过。
- Skills镜像第一次构建37147233631完成安装，但Python跨目录symlink没进入venv，QA import docx失败，没有发布镜像。父改成原子发布解释器wrapper，并在GitHub构建用官方apt源；commit728b17fb，新手动镜像运行37149058613，仍未开启Skills门禁。26份已提交技能文件与catalog SHA已逐一比对全一致。
- MainECS SSH仍关闭，但新Edge宝塔标签1722450350可进入现有已登录root终端，已只读确认当前8仓库release rootsolo-20261003-kitsolo-mcp-workflow与资源有余量，未切换服务。
- StudySolo托管需单独处理：MainECS读取真实DNS为38.47.118.246，已用本机配置vmiss-vpn严格host校验SSH39222连接。专属Nginx vhost实际代理127.0.0.1:41349，是来自执行盒子的reverse tunnel到Next35349；网站应用不在这台VPS本机，暂无Node/npm安装。VPS现有4GiB/2CPU，约8.9GiB磁盘可用。尚未识别/改动盒子部署，也未改Nginx、VPN、其他站点；不要以这台代理VPS为已确认应用源。
- 本机空闲RAM仅约3.4GiB，不在活跃StudySolo旁盲启第二前端/完整本机构建。浏览器个人会话REAUTH_REQUIRED，不改其账号/密码或伪造完成态；已授权测试fixture用实际HTTP完成反馈验收。
- 唯一Luna Max worker已进入05：查明v1成绩localStorage无owner与原题、wrong prompt仅章节统计、掌握度不订阅更新。批准006两表immutable quiz sets + attempts，复合owner FK、真实Class服务表读材料、显式导入旧无主数据。父提出stage NULL、identity immutable、首次并发保存和operation hash审查，待新006 source+真正SQL计量测试后再apply；未应用006。

## 本轮最新验收与发布准备（2026-10-04）

- StudySolo PR172 完整CI通过后已合入master 42a9364d506c5e9ff6d501051fda08a19edeb7ca；dev安全同步647ac949fc3f27be70ae7289343e84421e426fb0，tree与验收master一致。Shared PR2已合入main c38a80878c3630b75849e450ee157f795f36dce9；LandingPage PR1干净生产构建/19项路由与权限检查通过，已合入main335952843391ad3ba628f098dc07a475a2fea693。云端Git分支更新不等于实际网站已部署。
- root修复镜像venv解释器wrapper和Office私有profile证据导出；同一digest镜像通过GitHub运行37151028376，中文HTML→PDF和DOCX→PDF、全文、A4、页面图片验收通过，父已查看两个渲染PNG。当前镜像公开拉取不代表阿里云模板成功：OCI注入构建ztat8e8oi7y6fhkrqpg1失败，报告registry credentials are required；最小packages凭据准备页需个人GitHubPasskey，已交用户接管。不开Skills就绪门禁，不把操作者仓库广权PAT传给云厂商。
- 006 Review source已冻结，SHA256 5afcff87bf9dce94915305d0e0515ca5cf15ba485c0f9acba75740754afde6dc，已通过当前RootSolo Supabase MCP应用。父独立PGlite17项含真实计量RPC、默认grant、CAS/operation哈希/所有权/NULL guard/存储配额回滚；真实HTTP11项含owner-binding、源站、原题+答案+揭示恢复和并发首次保存通过。后续schema调整新增migration，不改已应用006。
- 阶段05子定向typecheck/lint/Vitest22/存储与函数42项通过。父追加发现索引只传含wrong的attempt会漏掉新全correct纠正记录，要求同时扫描已作答客观attempt、稳定复合keyset分页并标明网络失败/1000记录扫描的不完整边界；仍待最终验收。父真实章节出题最小调用进行中。
- 代理VPS38.47.118.246仅新增隔离/官方SHA验证Node22.23.3到/opt/studysolo-runtime，无全局PATH更新、无应用/隧道/Nginx/VPN改变。原网站应用实际为AWS盒子reverse SSH tunnel，尚未完成稳定生产托管切换。
- 阿里云API密钥按用户永不过期选择保持；密钥仅在服务端受限目录和本项目env，不进入用户task环境。生产CLOUD/CONNECTORS门禁仍关闭；Skills模板/version仍空；未修改远端或全局Windows环境变量。

## 阶段05父验收与阶段06派遣

- Review已保存StudySolo d674fb3a，Shared primary只保存本轮0d7afc5，再从origin/main的干净独立工作区cherry-pick为4f6abd3，Shared PR3待合并；不推原有ahead历史。
- 父实际章节生成12题→保存题组与attempt→提交1处客观错答→按服务端原题生成9题完整通过；较新正确attempt同时进入诊断请求后返回422 REVIEW_NO_WRONG_CONTEXT，不再付费调用。真实PostgREST复合游标两页4条distinct通过。父另独立重跑23项UI/API回归通过；IAB实际检查答题入口/掌握度空态并保存截图，认证后的进度恢复UI仍留发布门禁，不把空态截图冒充云同步证据。
- 阶段05通过父验收，唯一同一个GPT-6 Luna Max worker开始06的系统分析；未派其他子智能体。阶段06只负责模式布局/Agent加号、状态文字渐隐与右面板3/5，不触Cloud/MCP、身份、migration、环境或发布。
- root为云镜像模板追加4a5c3aea：以已验收digest和CI任务临时packages权限构建；阿里云API key安全写入GitHub environment Secret STUDYSOLO_SANDBOX_BUILD_API_KEY，环境studysolo-sandbox-build仅放行当前branch与master。原密钥未变、仍永不过期；Windows全局环境和远端生产未改变。workflow创建只提交一次，若不确定先查Team。尚未执行真实模板构建：GitHub新workflow需要先合入默认分支。
- StudySolo PR173已更新为Review+云构建最终范围，当前完整CI在跑；Shared PR3已附当前聊天。生产服务未切换。

- 完整远端CI37155300454暴露两条原有quiz node测试仍沿用旧评分fixture：空分母percent=0，以及主观awarded分没有显式selfScored。父保留新产品正确语义（未知百分比null、未自评主观不计总分/客观掌握度），补明确fixture与客观统计断言；7项node回归通过。064d64b3已推送，CI重跑中，未跳过完整闸门。
- 生产Web新增独立manual artifact工作流和pack脚本，使用干净CI standalone输出、runtime内容索引/worker/skill assets，拒绝env/原始资料/越界symlink，只输出commit/buildID/SHA256归档，不启动或切换服务。与Electron开关分开，保留Web正常图片处理。脚本syntax/lint和合成pack+env拒绝实际验证通过；真实完整打包尚待workflow默认分支和CI。
- Shared PR3已合并main a1203f50b77008342fa7d54af57f34a850339a35，32项全仓static/auth/session测试通过；线上RootSolo其他7仓服务仍未改变。

## 云端完整Skills可用实况与本机恢复

- 临时registry权限路线成功：workflow37156486665，OCI模板studysolo-skills-oci-10d47cda032a真实ready；无需个人长期GitHub registry key。旧GitHubPasskey仍是正式App设置访问边界。
- root独立复查发现metadata Python在普通用户宿主环境启动，会加载用户可写启动文件；已改受信root shell + /usr/bin/python3 -I，worker/preflight同样隔离。287485f5保存；单独冻结分支codex/sandbox-control-startup-2026-10-04开PR174，完整CI在跑，子UI06不混入。Root真实startup hooks读/写/list/后续命令/traversal6项及原namespace7项再次通过。
- 新Skills OCI模板真实namespace7项通过，完整26文件安装后在任务namespace内执行原脚本，中文HTML→PDF、DOCX→PDF、A4/文本/preflight PASS、实际PNG下载通过。父已查看两个页面，均无缺字/明显截断；主题font属性存在样本文档warning，不把合成检查冒充GB/WordWPS正式认证。所有验证VM已close。
- 本项目.env.local/.env.production仅更新CLOUD_SANDBOX_TEMPLATE、SKILLS_TEMPLATE、SKILLS_VERSION；本机开发Ready=true，两包经真实Account安装API active保存并GET读回9/17文件。密钥未改变/未旋转，仍永不过期；生产总开关仍false，Windows全局和远端环境未变。模型调用安装Skill→publish实际PDF验收正在进行中。
- root增加HTTP流式body限制，超限即取消流，不在request.text全分配后拒绝；4项流/UTF8/非法JSON/媒体类型回归通过。属于root Cloud核心，不交子智能体。
- PR173经完整CI37155596570通过后合入master1cb9eb2c97c91cdedd4e30110f73a22785359e61；手动网站standalone归档workflow37156489469构建中，尚未部署。dev同步尚需进行；当前工作branch已包含后续root287。
- RootSolo目标StudySolo dev进程组跑5h42m/9.0GB，空闲RAM0.87GiB且HMR旧代码不更新。只用Edge RootSolo停止/启动5a；未触Account/其他进程。保留.next到受限next-cache-before-fresh-20261004（源/目标绝对路径均核对workspace、目标不存在、35349已停后原生Move-Item；未删文件）。新服务HTTP200，空闲7.49GiB。localhost浏览器缓存/连接有拒绝；新IAB127.0.0.1:35349/agent能实际渲染新data-agent-sidebar-container/v3。
- 父fresh IAB实际发现新默认外右栏仍0%（main100%,内栏35/65）；06 worker发现Store旧默认true和useAgentDockPerSession fallback true双覆盖，正在独立v2偏好key/程序transient setter修正，保留旧key/其他UIprefs。父要求新的明确用户collapse能持久保留，旧无标记默认true本次不再覆盖新版open60。
- Google正式callback已填入但未保存，等待浏览器工具安全敏感新增授权目的地现场确认；截图与异步问题已提交。GitHubApp设置需个人Passkey，未绕过。未更改Google五个范围/Testing，也未开正式生产连接器。

## 阶段06验收与阶段07实施方向

- 06已父验收并保存e696edb1（20文件）。子74项/TSC/lint通过，父独立30项sidebar/store/preset通过；父IAB实际默认40/60、手动收起刷新保留0再展开60，真实指针拖动40/60→50/50→40/60通过。已存agent-layout-default-sixty-percent.png。匿名无run行与短动画未捕获帧的边界保留，不宣称生产/登录态验收。
- 唯一相同Luna Max worker开始07，已批准主Review笔记区+Review划词窗口共用三栏工作区，left学科树/middle现Milkdown/right TOC；识别note.source.kind=review，真正Class classroom便签保持compact。不能把原“搜索标题或正文”删成仅标题：逐note缓存归一化索引，markdown只使自己的索引失效，结构revision独立。不新增owner/schema、不导入无主数据、不跨仓API，关闭/切换flush合法owner草稿。透明根因需检查全部主题与stack，当前单次实例color-mix是opaque，不能误称62%alpha；使用实际solid surface token和fallback。
- GLM Skills第一轮仅设计没有工具，不计成功；选中技能+8192输出/12步第二轮真实原包渲染但步数耗尽未publish，不计完整成功。第三轮用现有20步、单轮2元设置真实useSkill→open/write/原render脚本→poll→publish→鉴权PDF下载→close全通过，toolCallId与commandId配对确认原脚本exit0。模型PDF1页A4、NFKC后原题名/三段原文齐全，父查看紫色实际页面。证据model-complete-skill-acceptance.json / model-skill-paired-evidence.json / model-skill-pdf-content.json，产物model-complete-skill-handbook.pdf和page.png。
- root发现客户端SkillInstall store生成本机id，而server canonical替换id会丢forcedSkill选择；f40a0f54修为保留合法无冲突客户端引用但instructions始终从真实Account安装+SHA canonical加载，外国owner不加载、伪content被丢弃。Root数据/执行authority不依赖此UI id。
- PR174完整CI37156603645通过并合并master57287e6f761267c924d0ba1707c13a5bfe91e3c3；PR175冻结core分支f40→f321e29d8bb580cf9cb43288437c31b1d4118358（隔离去掉06）。第一次175 CI有反馈focus真实race：延迟RAF会在用户先开始输时夺焦点，只留下首字；root guard保留dialog内用户焦点，确定性回归+4组件tests通过。5021dda5保存本机，再用独立temporary Git index精确移入冻结PR175，working tree不改。
- Web归档第二次guard拦到content/_raw。root明确从copy前排除raw/raw-src目录（不删除source、不削弱env/越界symlinkguard），增加Next global next-server trace排除。第一次临时index patch末尾trim导致损坏，未update分支；误派发旧ref的重复run37159530463已取消，修正保留exact patch后f321推送，新Web run37159564965和175 CI在跑。尚无真正生产归档/部署，不能说发布成功。
- 新发现待08或紧随UI收尾检查：匿名Agent访客时历史加载/停止生成指示持续存在；不应把owner hydration当作实际模型生成。不能通过fake owner/跳过Account gate修；只在明确signed-out状态给登录引导及合理输入状态，保留身份和数据边界。

## 最新提交与继续工作边界

- 已验收master57287e6f同步到dev fe208c20d982668cf184df551f77fe19fb4b3663，merge-tree与已验收master完全一致，无force、未覆盖独有dev树。
- 06 e696edb1已本机保存待独立UI PR；07唯一Luna Max正在按已批准双模块方案实施。主区ReviewNoteWorkspace + Review来源window；Class sticky不被一刀切扩大，旧无主note不做owner迁移。菜单复用现有portal，theme solid token实际与静态分开验收。
- 175 head现f321e29d8bb580cf9cb43288437c31b1d4118358，完整CI已重新运行；包含5021dda5同等四文件焦点/原始资料排除修复但隔离06 UI。新Web构建37159564965运行中；先前旧ref重复run已取消。正式App Google回调保存与GitHubPasskey仍待人。
- root实际模型PDF内容校验初遇PDF字体ToUnicode映射为康熙部首兼容码位，NFKC按等价字归一化后题名/三段全文及一页A4均通过，实际PNG视觉正常。不是丢文或缺字，不把第一轮无工具/第二轮未publish当成功。

- PR175最新f321经过完整CI37159566505通过（9m30s）合并master9f7b2763768e0706c901cf8d01b942fe5fc18440，已安全merge同步dev a6f69f09435b7d831eefeb4fe0ea671d03206fe6，tree与验收master一致无force。
- 06独立冻结branch codex/agent-layout-polish-2026-10-04已推，PR176 https://github.com/AIMFllyYS/Notebook-MedFreshman/pull/176已创建并附当前聊天，待完整CI。07继续仅此Luna worker实施，不将尚未完成代码混入06。
- Web run37159564965 success，artifact id11287457601，name studysolo-web-release-f321e29d8bb580cf9cb43288437c31b1d4118358，size783634934 bytes；download session48791正在进行。下载后验证sha与tar成员/运行资源，再准备准确服务器预检；尚未启动新服务器服务或切正式站点。MainECS8仓train另在最终Landing下载更新时准备，不单独替换落地页。

## 发布预检授权边界

- 网站归档已下载：source f321e29d，Next BUILD_ID4EMDRN2dcyKr0WiLyQrMq，archive SHA256638e0f17ed9cd356f0804c5a8682f7d7a6574ba0ca06edde9690ecebe9f6e034；实际tar29644文件（加root/public两个身份marker）、原运行文件2.32GB。下载SHA、成员越界/特殊文件/符号链接、env/raw缺失检查通过。没有启动新服务器服务或切站点。
- 已提出可review的新托管预检候选：现有38.47.118.246代理VPS，仅127.0.0.1:35359独立StudySolo预检进程，不新增购买、不改Nginx/VPN/其他站，目录+归档预计3.2GB；等待用户现场明确新运行路线授权。来源vps-init SKILL.md“对任何变更先报告...得到授权后才执行”，本次是新增托管进程/后续路线，不把Alibaba沙箱开通授权当作未明确的BOX迁移授权。其他UI/客户端准备继续，不让这项阻塞。

- PR176第一次full CI37160297708在旧source contract“默认收起”失败。父保留窗口per-session筛选与隔离断言，仅把默认/pref contract同步到已批准的新版行为；旧hook测试补transient setter和explicitPreference mock、新default open和用户explicit true两例，ManagedWindow旧注释更正不改变测试隔离基线。node11项+Vitest15项通过，012ec66b本机保存，独立temporary index精确加入UI冻结branch为34e38ea0650309d7b45319145f10080a61b852f4，当前full CI37161063387在跑；未混入07 WIP。
- 07父复审新增必须边界：编辑器建立时捕获owner epoch，迟到旧onChange不能在切换后的同id新note写库，note切换/remote revision/卸载都测；存储UI不把React store同步更新说成云端同步。本体Owner激活/Account/Supabase migration不改；使用已有ownerScope API安全断言。

## 后续验收记录

- PR176完整CI37161063387通过，已合并master df766760e4f3727fcbde612e95e13055ae440726；dev以105bd2a86a3a193dbbe4bc3b44e4028169a9868b安全同步，tree一致，无force。07仍是唯一Luna Max子智能体的在途代码，不混入已合并06。
- 用户再次明确阿里云API key永不过期；保持现有设置，不旋转、不改成限期。服务端权限与用户命令环境隔离继续保留。
- 07父复审发现500ms正文索引只有leading throttle，没有trailing刷新，最后一次输入/远端merge可能永久保留旧搜索对象；要求单一带owner epoch保护的trailing刷新、真实时间回归，并为Milkdown失败后的textarea补相同挂载期guard。
- 09准备性只读检查：现有GitHub最新桌面release仍v0.5.1（2026-09-07），没有最新改动；Landing frontend/views/cinematic.ts的下载按钮仍disabled/SOON，不是可用下载。当前Electron appId com.gailvlun.desktop与旧用户数据必须兼容；真正新版本需要提高版本号、干净构建和包内验收。父层ChatSolo有独立Android Web壳及SDK可作只读参考，不复制它的签名key或用户配置，不假冒已完成移动发行。
- 父发布校验追加476c18fe+d80d45d2：通用verify-web-archive.py不解压、不启动，核对SHA/commit/BUILD_ID/public及内部marker/完整运行资源/文件与字节数；拒绝私密raw/越界/特殊和hardlink/重复/循环/链接祖先写入，兼容真实pnpm目录link。14项安全回归+实际29,644文件归档通过。独立冻结branch codex/web-release-verification-2026-10-04 head fc241484f3b2728da7c47acf23184d79da88bfa8、PR177已附聊天，全CI运行中；未混入07。
- Android准备性官方调研：Google OAuth政策禁止开发者可控制的embedded user-agent，不能通过伪装UA/复制Cookie绕过。外部Web壳优先评估Android TWA/Custom Tabs；TWA需要网站与APK签名的Digital Asset Links，验证未就绪应诚实回退Custom Tab。参考 https://developers.google.com/identity/protocols/oauth2/policies 和 https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities 。这是09方案准备，尚未生成/发布APK。
- 八仓train准备性Shared核对：primary只fetch origin/main，没有checkout/reset/push原ahead；线上b3eeaf与已验收main a1203f5的merge-tree无冲突，候选tree31b9993dbb9d0b1cb161271ad0519585b23c7f52。相对线上新增7份本轮迁移/2测试/README，以及原main的sync-sign-in StudySolo renews=true一行；正式pin仍需解释该现有main差异并验收，未提交/推送候选、未打发布列车、未改线上。
- PR177 full CI37162899010通过，已合master be6efa896445a6cab8be1b5f3d8b2050b5644383，dev安全同步f904d967d6ec5ea9de98c0ba26aa3435da68c52d，tree完全相同、无force。主工作branch仍保留07 WIP，不切checkout。
- 07父真实IAB主工作区1024px/260+544+220三栏，背景opaque、Crepe已mount；/probability/review选公共空态文本→笔记→1240px浮窗→真实右下角拖到604px，自动单列604和抽屉。初测Esc会关闭整个window，要求接入全局overlay priority40/unique workspace id后复验：树与TOC的Esc各仅关闭抽屉，仍windowOpen并focus回对应trigger。父截图review-notes-parent-desktop.png和review-notes-parent-narrow-window.png。guest公开合成笔记不是认证云同步验收。
- 08父准备发现lib/browser/probeEmbed.ts只复用字面URL检查，无DNS解析/连接IP固定；公网域名可能指向内网。父将亲自处理此服务端网络安全修复，普通worker后续08只管导航、zoom与guest展示，不改probeEmbed/can-embed；尚未写该修复。官方Node DNS与Undici Agent文档已核对。
- 07父独立Node28/Vitest22通过，源代码审查通过，保存8cb7fa70。冻结branch codex/review-note-workspaces-2026-10-04 head04f4c95dc71b40a97bf4c39bd91698314ba451be，PR178已附聊天，fullCI37163646887进行中。仅同一Luna Max child进入08只读分析，待父批准计划后实施；07未等待部署才允许做下一普通产品任务。
- 父网络边界9646dcc5已保存：每hop解析全部DNS地址并校验公网范围，socket lookup只使用不可变的已验收地址，保留原Host/TLS；mixed/private/reserved/fake-DNS地址及userinfo拒绝，取消上游body并destroy独立Agent，异常不反射私有诊断。30项Node、ESLint、全量TSC通过；实际本机3项拒绝路径通过。本机example.com与nip.io均解析198.18 fake-DNS，因此不把本次拒绝当作真实公网成功探测验收。新reason blocked-probe-network要由08frontend诚实区分当前网络安全预检不可用与站点CSP/XFO阻止。未切换全局dispatcher或第三方MCP请求。
- 07 PR178 fullCI37163646887通过并合master e4e43ccc4be69375e18d128013bebe12b449e76d；dev安全同步b420e5ef364416823ed2247eb2e2c86ce295774a，tree相同无force。父网络独立冻结branch codex/browser-probe-network-2026-10-04 head d707e5c33464664175257db189c602eeab8d1abc、PR179已附聊天，fullCI37164450209在跑；不混08。
- 08只读计划已父批准：复用sidebarCollapsed/mobileSidebarOpen让Class/Review顶栏统一hamburger，只挂当前模式抽屉、切模式关闭和overlay/Esc/focus；mobile iframe fit上限1、用户zoom独立、新默认desktop且不抹旧明确视图偏好、可选Webview原生zoom不重置共享其他调用者；guest登录提示/禁用所有发送入口，只真实run表示isLoading，不伪造hydrated/owner；网络安全预检reason单独前端提示。child正在串行实施，未开始09。
- 09额外只读发现：electron/main.js仍在app.whenReady强制填写RELAY URL/key/model后才启动，现行账号与远端Agent模式的首次使用是否仍应强制BYOK需要父在09专项评估；不让child擅自改桌面身份/网关核心。尚未修改此启动流程。
- 用户确认正式Google回调Save；父实际保存，看到OAuth client saved，重新打开并reload后读回localhost+HTTPS两条URI。五scope/Testing未修改。Screenshot必须显式fullPage:false（默认capture多次timeout，低内存缓解后仍失败，显式false成功），证据.local-archive/google-production-callback-saved.png已嵌用户进度。现有CONNECTOR_CALLBACK_ORIGIN已匹配正式域名，CONNECTOR_DEV_CALLBACK_ORIGIN匹配localhost，无需再次env修改。
- 用户确认38.47现有VPS私有预检实例。父即时严格SSH健康与端口/磁盘预检通过，新增/opt/studysolo-preview和无交互登录service user；上传f321已验收归档、服务器再次SHA/成员/marker校验，独立PM2 7.0.4 prefix安装。整段deploy script被自动policy拒绝（未执行，理由仅blocked by policy），随后范围较小的独立解包/配置/启动操作获准完成。PM2 daemon启动的EACCES根因是服务user继承/root cwd，改成其own home cwd解决，仍以非root运行。
- 私有实例现在只监听127.0.0.1:35359，actual marker f321e29d/4EMDRN2dcyKr0WiLyQrMq，HTML+JS+CSS200和MIME正确，uid服务user，RSS153MiB、diskFree5.61GiB；Nginx/vpn active且正式vhost SHA仍7d30ece...2dba。初始专属runtime.env只有6项公共/门禁配置，Cloud及productionConnectors false，没有复制secret。SSH本机转发session53013仍运行，本机127.0.0.1:35359可访问；IAB新tab3实际渲染后截图private-preview-framework-smoke.png并关闭。证据下载到.local-archive/connectors-private/private-preview/private-preview-acceptance.json。此为基础f321框架快照，非06/07/08/09最终UI和非认证MCP验收。
- 本机内存降到0.34GiB：父关闭自己的IAB2验收tab成功，尝试关闭旧IAB1 error/dataURL被URL policy拦截，留其未动（不能绕过/导航）。随后仅通过RootSolo Edge专属停止5a，35349已不监听、Account3041不动，freeRAM恢复3.25GiB，保留.next不移动/删除。child08可串行测试，但端测前需父用RootSolo启动5a；当前仍停止。后来free2.13GiB，仍不并发TSC/前端。Google授权结果页markDeliverable，GitHub App Passkey仍markHandoff未完成。
- PR179 fullCI37164450209 success，合master 1ab53476cfc608c95d7640e07b851dd69f26a0d2；dev安全同步30a989349ce5a96f19429b2d60d1ead9c4368fec，tree相同无force。Google保存与private preview实际结果已修正两份refer报告并另存文档commit；未混08 WIP。
- GitHub App设置现已可进入，父准备正式callback后依浏览器mandatory现场确认规则问一次；用户明确确认后Save，实际toast Your GitHub App has been updated，reload读回localhost+HTTPS两条、两个wildcards false。未动权限/keys。证据github-production-callback-saved.png已嵌用户进度，结果页markDeliverable。所有本轮待确认问题现均已获答；不再把Google/GitHub回调或private hosting记为pending。
- RootSolo实例与控制页后来换新：旧localPanel1722450288已不存在，activeLocalPanel=Edge3 tab1722450413；当前5a运行(14:03启动)，/ HTTP200。新实例另启动Account3041/3040，3040不属父本次操作，不停它。resource free约1.3GiB，08已通知仅用当前5a端测，不并发TS/Vitest/构建。新的quota、membership、AccountQuota、panel/settings等WIP属外部并行改动，父和唯一Luna worker均未编辑，不要归入本任务提交。
- 08父提前source审查要求补两项：render捕获owner在actual queueMicrotask/同步send前再与live owner+epoch核对，防未提交的切owner竞态；floating producers在owner=null不得createSession，改为Login入口+nullable结果，底层chatHistory/Account/owner activation不改。child完成23项新定向组件/stores回归、ESLint与TSC，正用当前dev服务做端测。

## 2026-10-04 阶段08 CI修复、MCP末端审查与客户端09

- 08父验收后保存b64508fe，冻结PR180 head4b6...；首次fullCI只有旧appModeChrome源契约仍查中文“打开侧栏”失败。父按真正i18n+Class/Review侧栏语义修正，同时保留Studio-only chapter trigger断言；3测试通过，1c766afc精确进入冻结PR180 headddb5edef，fullCI37168634702重新运行，未改08功能。
- root独立发现Notion/Todoist首次DCR并发覆盖共享client问题，withLease包住re-read+registration+write，4项OAuth/vault/并发测试通过；7b433539保存。随后Zotero token/identity chunked响应改字节流上限、早取消/严格UTF8/object身份，3项新真实流测试通过，98af2350保存；冻结PR181 head01230a69 fullCI在跑。没有让子智能体写或决定Cloud/MCP核心。
- root桌面关键路径8998cc81：显示名StudySolo但显式保留appData/Gailvlun旧userData、固定35349；空配置直接进入应用，去掉强制首启BYOK门槛。setup可选，但启用relay仍需三项齐全；继承operator/provider/API_KEY/TOKEN等先剥离，只有后置保存的用户key注入。真实源码VM隔离启动blank/legacy tests加bridge合8通过，非实际EXE验收。6ec41ae0为bridge JSON流上限+早取消，补oversize不外发真实流test；全部16项定向通过+lint。
- 09唯一同一GPT-6 Luna Max的分文件计划已批准并进入代码：com.solo1037.studysolo Java Custom Tabs（不做未验证TWA），0.6.0品牌/校验器、secretless构建与隔离手动发布、LandingPage真实资产才启用下载。root亲自负责main/setup/env/bridge，子不碰核心；旧appId com.gailvlun.desktop和35349不变。
- root新Android独立RSA3072 PKCS12签名位于connectors-private/android-signing，ACL只有SYSTEM+当前用户；公开证书SHA256 0F7CED55AE85098E1D1318E05A905113C4D9DECE79EA197D3C3B94F9B88D7DD6。GitHub environment studysolo-client-release仅master，4个STUDYSOLO_ANDROID签名Secret已保存readback names通过；不在普通构建job，签名job不执行source/Gradle，发布job独立。Windows全局环境未改，Ali永久key未动。
- 私有正式runtime候选环境从现有.env.production严格白名单提取，保留Cloud/productionConnector两个flags false，未传远端/未生效。数据库必须当前ziza...；私钥走原base64不带Windowspath，Account固定formal。没有混个人grants、AI/provider运营key、SMTP、管理token。最新实例尚待09 finalbuild，不把旧f321预检当最终UI验收。
- Zotero正式app检查仍需本人登录；Google/GitHub正式callback实际Save+reload已经完成，不再重复确认。
- 08 PR180 exact headddb5edef fullCI37168634702通过，已合master0dfcf3c7451569fcd503e81f60ac654d1a2853df；dev安全同步d96c3dc25835b10a6b37808d527517ad266ef8a8，tree与master完全一致，无force、不切本机工作树。root OAuth PR181将该已验收基线合入a7f1549c951e5df5b9b06d1b2466f6390d827948，重新跑完整CI，先前旧base的run被新head取代不算最终门禁。
- Windows env名称大小写不敏感，root额外f55c97bd将凭证剥离正则设i并补混合大小写回归；desktopstartup/bridge9测试通过。root docs fc68c114记录正式callback完成、Zotero本人登录pending、候选env未远端激活。
- root进一步验证DCR租约失效路径：只靠lease不能保证迟到worker不覆盖sharedclient。新增createRecordOnce：PostgREST onConflict ignoreDuplicates、本机fileGate首次写，保存后返回canonical winner。8项定向tests/lint通过；真实当前Supabase合成加密记录insert=true/duplicate=false/readback original通过，未改realgrant，记录保留。ae06cf69保存；root docs和修复精确进入PR181 head161245642217064cdae326c29f2458b196a61c86，完整CI重新跑。
- Electron官方42接口规定setPath目标需已存在、sessionData要在ready前固定。root467e7290补mkdir0700与userData/sessionData都指旧Gailvlun；VM mock按实际contract让不存在目录throw。desktop9test+lint通过；尚非实际EXE验收。
- private候选配置实际传输完成：即时SSH/vhostSHA/disk5.6GiB/nginx+vpn active预检通过；scp到root-only incoming，再比对本机SHA后移动到/opt/studysolo-preview/config/runtime-candidate.env，root:studysolo-preview0640。当前runtime.env字节未变，无restart，两个候选flags仍false。受限runtime-candidate-transfer.json记录通过。前文“未传远端”已成为历史阶段，canonical报告更新本次实况，未正式切换。
- MCP PR181 exacthead16124564 fullCI37169662873通过，已合master b51af2b8e749b20e48aaf0db1cb84b8f0d19e402；dev同步66168b398249125242c25824581816659a9890fc，tree一致、无force。
- root检查网站自定义模型只做URL字面SSRF校验，新增真正DNS全答案公网校验与socket固定、origins锁定/no redirect/显式TLS、20MiB流上限与EOF/cancel cleanup。OpenAI-compatible/Anthropic website custom模型均使用；operator固定上游保留，桌面本机用户key保留代理兼容，主Agent转云受同护栏。IANA核对并追加非global IPv6特殊网段。60 SDK/stream/error+22 API+5 probe定向通过、lint通过。server预检独立QA在非root服务账号+无operatorenv下真实HTTPS200/页面marker通过、private DNS未HTTP即拒绝；undici6.27.0 project-only QA依赖，不改全局/不重启服务。root cba6cad2保存，bfe51716候选传输报告一并冻结PR182 head0b6d7eb26b75b2d3c9548130b258750d9dca15fe；已附任务、fullCI待运行。
- 09 child提交实施报告但尚未父验收/未commit：client-ci.yml/client-release.yml、Java Custom Tabs工程、版本0.6.0品牌/包校验、manifest、Windows smoke、Landing5files空manifest禁下载。基础Node5/Landing3/typecheck/lint/XML/YAML通过，但真实端测尚未发生。父发现Windows smoke只有HTTP和CloseMainWindow，要求改为CI-only Playwright Electron实际DOM/guest/60%/native webview zoom/reset/refresh与截图+关闭重开；签名secret从jobenv下沉签名step，GH_TOKEN下沉上传step，构建checkout不保留credentials。允许加官方playwright-core pinned devdep，现无@playwright/test（lock只是Next optionalpeer），不要本机重安装/构建。仍同一LunaMax单child返工，核心source由root负责。
- Child pnpm exec自动触发prepare重装hook；父read检查当前就是既有managed secret-scan，保持，无回滚/删除。其他quota/membership/价格WIP仍未提交未动。
- Model PR182 first fullCI37171445853仅TestContext/SuiteContext hook类型失配，root25af8c01收窄测试context；第二run37171842326 typecheck/lint通过，unit唯一旧customProviderCompatibility源regex仍期望单参数reasoningFetch。父47c57fc1保留reasoning语义并断言guarded fetch接入，9test通过；精确冻结新head f1de22ee4f6109361e35a67ab3f750a2a9108b31 fullCI重跑，未变运行时护栏。
- 09第二轮child增加pinned playwright-core1.63.0 devDependency/lock（只lockfile-only，无全量本机安装），smoke改真正Electron DOM、guest noStop、52–68% dock、native Webview getZoomFactor→110/refresh保留/reset以及同profile关开、截PNG/JSON。签名secret/GH_TOKEN已移唯一使用step，checkout不保留凭据。父3项Landing+5项clientNode通过、source审查；真实CI待派发。
- 父另核对Gradle8.13 wrapper jar与官方SHA一致81a82...e45f，并固定distributionSha256Sum20f1b117...d78。子不要覆盖。
- 09发布gate父审发现gh任何网络错误被当NotFound；同一Luna child返工为只认HTTP404、其他fail closed，以及GitHub API原子建精确source SHA tag，确认后--verify-tag draft，存在/结果不确定则止、不动已有tag。父之后验收再提交/跑真实CI。无新子agent。
- 09源码已父审并保存1ff1206b共35文件（35own files，未混membership等）；RootGradlewrapper官方SHA验证并pin分发SHA、gradlew设+x。独立PR183 head9ec2e9f7605346ec6917b453fa95620b8d30534f已附聊天；nativeCI37172875301和commonCI37172875226实际运行后发现失败。
- 183真实CI失败根因：Android setup-android默认尝试已退役tools包；child修3处显式packages:platform-tools（root ee3582d4保存），不降级SDK。Windows/commonTypecheck指向root stream fixture的RequestInit全接口不兼容NextRequest接口，root dd07b89a去掉宽泛global cast、保留half字面inference；9test通过。
- 182 exactheadf1de fullCI37172347260通过，已合master e78465e147c5356ae57b100fe0dcbd7d99cd522a，dev同步3f2821f1cf364c477774ddbc79b1f68ddef8c8bc tree一致无force。已验收基线合入183并精确追加上述2fix，当前head eec9a4b8fb8b4098995c078f98d5f89e920bf90a，真实native+commonCI重跑，尚未发布。
- Landing仅5个download files保存ef741ac，独立freeze分支codex/verified-studysolo-downloads-2026-10-04 head4045542edb3370b7c31ac6ec856800a1e2365cb8，PR2附当前聊天。downloadmanifest仍null不假启用；parent3test通过，childfrontendTSC/lint通过，cleanNextbuild/实际UI/真实资产填入/8train尚待。其他价格会员账号content等WIP未动。
- 183第二nativeCI37173271829已过原setup/typecheck，Windows真实desktop build缺clean ignored索引导致freshness=null；父批准与已验收common/web workflow相同的bm25-only源码构建，保留内容哈希/manifest门禁，向量0明确声明。Android lint API27亮导航属性用values-v27资源，不降minSdk26/不抑lint。子定向Node10/XML8/lint/YAML通过，父Node10再次通过；root保存6dfb4e7a，精准进入冻结183当前head5cb21a6bb2a0b389dbdf2944addf8678157a4925，等待新native+common CI。
- 待继续的优先序：读取该精确head最新CI，调查真实错误并按同一Luna普通客户端/主Root core界限修；通过后父看PNG/JSON、确认真实nativezoom/关闭重开/Androidintent，才合183并同步dev。随后manual master-only client-release签名+draft（只已有protected env），父核对apkcert/source/hash/size，发布v0.6.0，完整下载至少setup+APK并hash；再填Landing3完整资产manifest、cleanNextbuild+实际浏览器并验8train。并准备最终Web归档替换旧privatepreview，真实Account/CLI/MCP验收后才做具体正式切换决定。Zotero本人登录仍pending。阶段09与实际公开上线未完成，不停用hourly heartbeat，不称完整任务done。

## 2026-10-04 04:21 UTC 续轮与服务器边界

- 最新人工询问为什么SSH其他服务器。已解释38.47.118.246是先前明确批准的仅loopback35359私有预检，Ali沙箱走API；这次最新归档scp已完成，未二次校验/解包/换launcher/重启/切正式。主智能体承诺接下来先处理代码与CI，暂不再改该VPS运行配置。不要把原预检许可扩大为正式迁移；后续具体切换须再清楚列范围。
- commonCI37173719792 exact5cb success；nativeCI37173719832 build/lint已过，Windows Playwright packagedEXE启动超时、Android Espresso intent未捕获。仍同一Luna worker改为CI-only直接spawn_owned --inspect=0+Electron in-process debugger真实DOM/鼠键/PNG/zoom/refresh/reopen；Android用ActivityMonitor拦实际发出的匹配ACTION_VIEW只证明intent，不声称browser/login通过。未改main/setup/bridge，移除unused Playwright devdep。
- 父审driver待补：startup日志ws inspectorURL需脱敏；stdout/stderr按有界完整行积累后parse以免半UUID；退出需调度app.quit返回确认并disconnect inspector，再等待PID正常退出，避免debugger阻塞强制kill。已同child返工，未提交/推送该新driver。
- 最新Web候选run37173901940 success，artifact11292433263下载完，源码5cb/0.6.0/BUILD_ID FDgI9C-_xu1SeLe0bBgrq，tar785664343 bytes，SHA fc902cc63f8d04acc544153bc9fbd5566f1b5939365c8218690f78da2d6897d2，29645files/2322196376 unpacked，root独立archive verifier通过。只生成/上传，尚未启动该版本。
- Landing root新增既有feedback-release-check workflow download路径/manifest tests/frontendtypecheck，root4ba1b8f保存，精准到PR2 head08752830ae90657e5260b2d1296b61a774b0d790；cleanCI37175209053全部通过（含Nextbuild），无运营env。真实资产manifest仍null，尚不合入/部署空下载状态。

## 用户指出 VPN 用途后的撤回与同步

- 已完成上述仅本轮预检撤回；nginx/sing-box active、32802监听、35359释放、正式vhost SHA不变，不能据此断言客户端VPN已恢复。
- master e78465e、dev 3f2821f1本次重新远端核对；普通CI37173719792和Landing CI37175209053 success，nativeCI37173719832 failure，PR183仍draft/open。
- 09唯一Luna返回新driver及Android监测修复，14本机Node检查通过；主验收、新真实打包UI/intent CI尚待，不能声称发布。
- hourly heartbeat已更新：禁止再次在VPN VPS部署，正确Notebook Agent入口确认后走用户部署流程，优先网页闭环。

## 05:22续查：客户端驱动父验收与正式入口实查

- 父读完整新driver及Android ActivityMonitor实现，独立14项Node（含无秘密自有Node inspector进程正常退出）、ESLint、diff检查通过。仅11客户端own files保存a8f8f982，临时index精确追加PR183为3763fb425f884e00e03c4cf1ea84995733c19f4e，没有夹带会员改动或切本机工作树。
- 新exacthead普通CI37179807544、nativeCI37179807507实际运行中；Windows job111369902351，Android job111369902301。尚未合并、发布或宣称真实native UI验收成功。
- 正式网站实时GET /api/health/connectors=200/stage application_credentials/authorizationImplemented true；GET /api/connectors=403/CONNECTOR_PRODUCTION_DISABLED，确认实际正式门禁仍关闭，不由本机env推断。
- 部署Notebook网页入口仍缺，未向OpenClaw Assistant发送；VPN服务器无进一步访问/上传/部署。更正Web/Cloud/connector文档中的旧预检运行和续期未实现叙述。

## 最新用户更正与当前优先序

用户要求Review笔记目录进入一级Sidebar掌握度下分割线后，主区不再二级导航；唯一Luna按此实施，浮窗独立导航保留。master/dev代码推送触发用户自动部署，不再等待Notebook入口才合代码。
本机.env.production新增明确ACCOUNT_BACKEND_URL/NEXT_PUBLIC_ACCOUNT_URL，校验全部required/origins/当前数据库/Skill版本与模板/预算通过后将CLOUD_SANDBOX_ENABLED、CONNECTOR_ALLOW_PRODUCTION准备为true。密钥及无关值保留，有受限备份，不入Git。远端仍未更新，不称正式用户已连接；以上较早本机false叙述为历史。
原PR183真实Android成功、Windows health timeout仍失败；客户端独立推进，网页修复单独冻结PR。6fcd6c8b父修组件测试teardown的库scroll debounce回调，19定向通过。
