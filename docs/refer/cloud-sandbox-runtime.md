# 云端命令与学习连接器接入报告

日期：2026-10-04。云沙箱与 MCP 的决策、实现和验收由主智能体完成；普通产品修复每次只有一个 GPT-6 Luna Max 子智能体。

## 当前实际状态

| 能力 | 验证结果 | 尚未完成 |
|---|---|---|
| 独立 Agent 通用命令 | 真实 Account → 项目接口 → 阿里云创建、文件、执行、轮询、产物鉴权下载、关闭通过 | 远端部署和费用账单核对 |
| 执行隔离 | 宿主普通 UID10001映射、控制文件拒绝、root信号拒绝、本机控制API隔离、取消/超时/日志限制/后台进程清理/越界文件拒绝通过 | 持续供应商安全更新、生产实例验收 |
| Agent 模型调用 | 真实 GLM 模型通过原生学习连接器查询 PubMed，并 open→exec→poll(exit0)→close，最终回答通过 | 新生产环境完整验收 |
| 原生连接器 | Notion、Todoist、GitHub、Google、Zotero、PubMed、Crossref 的开发账号真实读取通过 | 正式回调登记、多用户授权、Google Testing/验证边界、生产配置 |
| Skills 完整包 | Notes to Handbook 9 文件、GB 文档包17文件、完整性检查、账号安装记录、服务端加载与部署门禁已实现 | 预装 Chromium/LibreOffice 的环境和真实文档渲染 |
| Electron 接入 | 固定线上 Agent 转发、用户 Account/BYOK保留、操作者凭证剥离代码和协议测试通过 | 真正打包、线上和安装包验收 |

上述连接器通过网站服务端调用获授权的 HTTP/MCP 接口；云沙箱承担命令与文件生成，Agent 将两条能力串联。微软按用户要求暂不处理。市场仅列已实现服务，原来的通用 stdio/CLI 配置项已移出公开目录。

## 安全模型

一个会话使用独立的提供者沙箱，不让两个用户共享可写目录、进程或凭证。应用记录、命令和产物绑定 Account 实时验证的 UUID 和 conversationId；body里的 owner/user_id、第三方token、任意宿主路径不构成权限。只有实际 `/api/agent/chat` 入口和独立 Agent 页面获得不可由 JSON 伪造的执行 scope；Studio 内嵌助教、Class、Review、浮窗、笔记、计划和生图不获得执行能力。

发现并处理了供应商本机 envd 接口能以 root执行的问题：secure:true 能保护外部入口，但不能替代内部权限边界。现在可信父进程建立 USER/NET/MOUNT命名空间，并将任务内 UID0映射到沙箱宿主普通 UID10001。任务自己的 loopback 可用于本地预览，没有通往供应商控制接口或外部网络的路由。控制进程、请求、状态和取消文件属于宿主 root，权限目录0700；用户代码无法读写。任务的文件系统挂载私有，不影响控制进程。

当前提供者拒绝重挂 proc，因此保留单租户沙箱的配对 PID/proc视图，避免破坏 ps/psutil等通用工具；对宿主 root进程的信号仍受 UID权限拒绝，已实测。这里不声称获得了独立 proc 视图。no_new_privs、进程数/文件描述符/单文件/日志上限、固定实例生命周期进一步收紧运行。

操作者云API key、Account token、Supabase service key、MCP授权均不注入任务环境。命令、文件、工具结果和技能说明是数据，不授予第三方写入权限。邮件发送、日历/Notion/Todoist操作仍生成固定候选，用户确认后由独立服务端幂等执行。测试未对第三方实际写入或发送邮件。

## 能力与资源边界

`cloudSandbox` 提供 status/open/exec/poll/write/read/list/cancel/publish/close。exec立即返回 commandId，后续 poll获取状态，不因网络失败自动重复执行。完整日志保存在加密服务端记录，聊天历史只保留有明确提示的摘要；关闭后仍可查询完成结果。产物为私有附件，下载再次校验 Account及会话。每会话最多20份产物/100MiB、单文件20MiB，下载访问有效期一年；没有未经同意自动删除用户文件。

默认应用同时一个活跃实例，每用户24小时最多10次新建；实例15分钟、单命令10分钟、日志256KiB。预算先保守预留，关闭只释放容量，不抹去已预留费用。45秒可续租的服务端锁与写入围栏防止旧租约覆盖新结果；本机锁原子发布完整内容，异常和租约文件留档。

server instrumentation每15秒捕获运行结果并处理回收队列；已释放 reservation不再堵住批次。close先捕获最终日志再终止，创建超时按固定元数据核对，不盲目重建。提供者 TTL是独立停止后盾；服务端完全不可用时仍不能承诺保存最终一行日志。更换 Team/API key/template必须核对旧记录，不跨绑定盲连。

## 平台与费用

已开通杭州 Agent Sandbox 所需两个服务关联角色、专用 Team `studysolo-agent`、default QoS和永不过期服务端 API key。已有真实可用的 headless基础模板 `studysolo-cli-v1-20261004`，固定官方兼容镜像；E2B版本锁定2.31.0。

阿里云[官方计费概述](https://help.aliyun.com/zh/agent-sandbox/product-overview/billing-overview)支持秒级按量计费。按文档中国内地 default价格，2CPU/2GiB、15GiB活跃磁盘的计算估算约0.234元/小时，10分钟约0.039元，15分钟约0.0585元。其他存储、快照、网络、日志由各产品规则决定；这些是估算，不是已读取的账单金额。

用户授权本轮新增累计≤100元、月预算≤100元。应用配置不能提高到此上限以上，另默认保留30元准备/存储余量，计算预留使用余下70元；每个15分钟会话按最高1元/小时再加0.05元余量保守预留0.30元。实际账单仍要核对；不把预留视为用户钱包收费或 measured成本。

Supabase继续承担 PostgreSQL状态、权限、预算与私有产物存储。它没有承担任意命令进程的执行。已将 Shared三份连接器/执行/技能安装迁移经当前 Supabase MCP应用到 RootSolo，ACL、不可变owner、围栏、预算在 PostgreSQL/PGlite验证。PGlite为单连接验证，不代表多连接生产压测。

## Skills 环境与开通准备

两份用户 My-Skills包的脚本、模板、引用全部保留，额外提供本平台的能力适配说明，并按逐文件SHA256固定完整性。没有复制不可再分发的 Codex专有 companion材料。安装记录是账号服务端记录；开启会话时才把完整包放进不可写的 `/opt/studysolo/skills`，输出写到用户工作区。仅导入 SKILL.md不冒充脚本依赖已经安装。

阿里云 MicroVM模板 `studysolo-skills-v2-20261004` 的构建已失败，尚未获得可运行的完整渲染环境。E2B 2.31的 Template.build 默认代际不接受 startCmd；直接控制台二代构建也未通过。因此保持 CLOUD_SANDBOX_SKILLS_VERSION/TEMPLATE为空，市场隐藏两项云技能。`scripts/sandbox/prepare-template.ts`、固定依赖安装脚本、Dockerfile和手动触发的镜像构建流程已准备；预装镜像需通过真实CLI/中文字体/HTML→PDF/DOCX→PDF/页面检查后才能启用。

GB原始包要求按文稿类型选标准、选择工具链、Word/WPS最终验收与逐页视觉检查。云端可提供 LibreOffice转换和结构/PDF检查；要求Word/WPS时仍需对应应用验收，不能承诺自动国标认证。当前未宣称两份技能已经能完成真实文档交付。

镜像准备流程限制 Docker 上下文，只传依赖脚本与技能资源，不发送本机环境、日志、源码归档或账号数据。构建后用普通UID10001、无网络、无额外capabilities运行合成中文文稿的HTML→PDF、DOCX→PDF、A4/全文预检与页面渲染；这些检查和云端namespace验收各自必要，不能相互替代。合成PDF与PNG作为构建证据保留。

GitHub仓库公开不等于容器镜像自动公开：[官方Container registry说明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)指出首次发布默认private。完成镜像构建后仍须核对可见性与阿里云的实际拉取能力；不能把GITHUB_TOKEN放进运行模板。镜像只含已批准公开的运行依赖和技能文件；若使用公开拉取，先核对无秘密与许可证，再处理镜像可见性。

## 环境与客户端

本机 `.env.local`启用基础开发运行；本机 `.env.production`仅准备配置、仍关闭。新增/管理的名称为 CLOUD_SANDBOX_ENABLED、REGION、DOMAIN、API_URL、API_KEY、TEMPLATE、APP_ORIGIN、ENCRYPTION_KEY、MONTHLY_BUDGET_CNY、RUN_BUDGET_CNY、BUDGET_RUN_ID、FIXED_COST_CNY、SKILLS_VERSION、SKILLS_TEMPLATE（均带 CLOUD_SANDBOX_前缀）。没有更新 Windows全局环境或远端进程环境，未在报告里记录任何值。

Electron本机服务不会携带操作者密钥。主 Agent请求、命令、产物、Skills及连接操作通过固定受信线上服务处理，仅传当前用户Account authority；用户已选择的BYOK参数保留，桌面配置的用户模型转为同等自备配置。回环/私网自定义模型地址不转发到云端。授权回调在正式网站完成，避免把共享OAuth应用secret塞进EXE。其他模式的常规请求保留既有路径。

发布前仍需完成原生服务正式回调、生产secret注入、真实渲染镜像、完整质量门禁、跨仓提交/依赖固定、部署与各客户端实际下载验收。不能把本机配置、真实开发调用或准备好的代码说成已上线。
