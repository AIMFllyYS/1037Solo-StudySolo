# 云端命令与学习连接器接入报告

日期：2026-10-04。云沙箱与 MCP 的决策、实现和验收由主智能体完成；普通产品修复每次只有一个 GPT-6 Luna Max 子智能体。

## 当前实际状态

| 能力 | 验证结果 | 尚未完成 |
|---|---|---|
| 独立 Agent 通用命令 | 真实 Account → 项目接口 → 阿里云创建、文件、执行、轮询、产物鉴权下载、关闭通过 | 远端部署和费用账单核对 |
| 执行隔离 | 宿主普通 UID10001映射、控制文件拒绝、root信号拒绝、本机控制API隔离、取消/超时/日志限制/后台进程清理/越界文件拒绝通过 | 持续供应商安全更新、生产实例验收 |
| Agent 模型调用 | 真实 GLM 通过PubMed+通用CLI循环；另以选中Notes技能实际load→open→原脚本render→publish→鉴权PDF下载→close，一页A4和完整原文核对通过 | 新生产环境完整验收 |
| 原生连接器 | Notion、Todoist、GitHub、Google、Zotero、PubMed、Crossref 的开发账号真实读取通过 | 正式回调登记、多用户授权、Google Testing/验证边界、生产配置 |
| Skills 完整包 | Notes to Handbook 9 文件、GB 文档包17文件；真实OCI模板7项隔离、namespace内中文HTML/PDF、DOCX/PDF预检及页面渲染通过，父已查看实际PNG；开发Account真实安装和读回两包通过 | 生产配置/部署和正式用户安装；每篇文稿仍需自身视觉与标准验收 |
| Electron 接入 | 固定线上 Agent 转发、用户 Account/BYOK保留、操作者凭证剥离代码和协议测试通过 | 真正打包、线上和安装包验收 |

上述连接器通过网站服务端调用获授权的 HTTP/MCP 接口；云沙箱承担命令与文件生成，Agent 将两条能力串联。微软按用户要求暂不处理。市场仅列已实现服务，原来的通用 stdio/CLI 配置项已移出公开目录。

## 安全模型

一个会话使用独立的提供者沙箱，不让两个用户共享可写目录、进程或凭证。应用记录、命令和产物绑定 Account 实时验证的 UUID 和 conversationId；body里的 owner/user_id、第三方token、任意宿主路径不构成权限。只有实际 `/api/agent/chat` 入口和独立 Agent 页面获得不可由 JSON 伪造的执行 scope；Studio 内嵌助教、Class、Review、浮窗、笔记、计划和生图不获得执行能力。

发现并处理了供应商本机 envd 接口能以 root执行的问题：secure:true 能保护外部入口，但不能替代内部权限边界。现在可信父进程建立 USER/NET/MOUNT命名空间，并将任务内 UID0映射到沙箱宿主普通 UID10001。任务自己的 loopback 可用于本地预览，没有通往供应商控制接口或外部网络的路由。控制进程、请求、状态和取消文件属于宿主 root，权限目录0700；用户代码无法读写。任务的文件系统挂载私有，不影响控制进程。

当前提供者拒绝重挂 proc，因此保留单租户沙箱的配对 PID/proc视图，避免破坏 ps/psutil等通用工具；对宿主 root进程的信号仍受 UID权限拒绝，已实测。这里不声称获得了独立 proc 视图。no_new_privs、进程数/文件描述符/单文件/日志上限、固定实例生命周期进一步收紧运行。

操作者云API key、Account token、Supabase service key、MCP授权均不注入任务环境。命令、文件、工具结果和技能说明是数据，不授予第三方写入权限。邮件发送、日历/Notion/Todoist操作仍生成固定候选，用户确认后由独立服务端幂等执行。测试未对第三方实际写入或发送邮件。

文件元数据检查与监督进程也属于控制面：它们用root受信shell和绝对系统解释器`/usr/bin/python3 -I`启动，避免在任务网络命名空间外加载用户可写的Python启动模块或shell profile。真实回归在新沙箱里放置用户启动文件，再检查读/写/列目录与后续命令；未执行任务外启动代码，路径越界被拒绝，实例关闭。HTTP命令/技能JSON在读取过程中按实际字节限制，超限即取消流，不能在完整分配`request.text()`之后才拒绝。

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

较早的阿里云 MicroVM模板 `studysolo-skills-v2-20261004` 构建失败：E2B 2.31的 Template.build 默认代际不接受 startCmd，控制台二代构建也未通过。当时曾保持Skills门禁为空。后来改用已经验收的预装OCI镜像，成功结果见本节最后的最新记录，不能继续把此前失败当作当前状态。

GB原始包要求按文稿类型选标准、选择工具链、Word/WPS最终验收与逐页视觉检查。云端已实际提供LibreOffice转换和结构/PDF检查；要求Word/WPS时仍需对应应用验收，不能承诺自动国标认证。合成文稿的可运行验收不替代用户具体文稿的排版、引用和权利核对。

镜像准备流程限制 Docker 上下文，只传依赖脚本与技能资源，不发送本机环境、日志、源码归档或账号数据。构建后用普通UID10001、无网络、无额外capabilities运行合成中文文稿的HTML→PDF、DOCX→PDF、A4/全文预检与页面渲染；这些检查和云端namespace验收各自必要，不能相互替代。合成PDF与PNG作为构建证据保留。

GitHub仓库公开不等于容器镜像自动公开：[官方Container registry说明](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)指出首次发布默认private。完成镜像构建后仍须核对可见性与阿里云的实际拉取能力；不能把GITHUB_TOKEN放进运行模板。镜像只含已批准公开的运行依赖和技能文件；若使用公开拉取，先核对无秘密与许可证，再处理镜像可见性。

后续实际验证：镜像 `ghcr.io/aimfllyys/studysolo-skills:728b17fb62d307c500a1006a2b19ae684c2f50a9` 已构建并发布，digest `sha256:10d47cda032a1543deb7bfa2ef8e9d6e3d0f37320e3e84be390dc5cc546a477a`。GitHub页面实际显示Public。以该digest重新运行的验证流程37151028376成功，合成中文HTML/PDF与DOCX/PDF均通过结构、空白页和页面渲染检查，主智能体已查看两张实际页面PNG，文字无缺字/明显截断。

首次构建捕获了跨目录Python symlink绕过venv配置的问题，已改为解释器wrapper。另一处证据上传错误由Office profile权限引起，现只导出合成文档/JSON/PNG，不上传应用私有profile。此前失败不冒充成功。

从公开OCI镜像提交的一代模板 `studysolo-skills-oci-728b17fb` 构建返回“registry credentials are required”；[阿里云镜像模板文档](https://help.aliyun.com/zh/agent-sandbox/build-a-custom-image-template)说明非官方源默认需注入依赖并推送目标镜像，不能把公开源等同于无需构建凭据。GitHub最小package长期凭据准备页需要用户个人Passkey，未绕过验证。

最终采用不依赖个人长期registry凭据的构建路径：`.github/workflows/sandbox-template.yml`使用本仓库构建任务的临时`GITHUB_TOKEN`向阿里云提交镜像拉取/推送权限，任务结束后失效。该任务只能选固定StudySolo仓库的精确digest，提交一次，九分钟等待边界；失败或创建结果不确定时必须先核对Team再重跑，不盲目重复创建。只导出模板引用，不导出供应商错误正文、构建日志或凭据。新构建环境`studysolo-sandbox-build`仅允许本轮工作分支和master，环境级加密Secret名为`STUDYSOLO_SANDBOX_BUILD_API_KEY`，复用原服务端阿里云密钥；没有改变原密钥及永不过期设置。该操作没有修改Windows全局环境或生产服务进程。workflow先合入默认分支，再首次派发并获得以下实际结果。没有将个人广泛repo token发给阿里云，也没有将registry凭据注入用户命令环境。

最新实际结果：默认分支工作流37156486665成功，模板`studysolo-skills-oci-10d47cda032a`返回ready。该模板已通过7项真实隔离检查；完整两包实际安装后，在用户namespace里执行原包脚本，生成中文HTML/PDF、DOCX/PDF及两份PDF的实际页面PNG，结构预检PASS，主智能体查看了真实图片，未发现缺字/明显截断。实例均已关闭。开发Account随后通过真实项目安装API保存9/17文件两包，并通过GET读回确认。故本机开发Skills门禁现已开放；生产总开关仍关闭。

模型实际调用也已完成：使用输入框“选中技能”的相同引用协议，真实GLM调用useSkill、云沙箱open/exec/poll/write、原包render_pdf.js、publish和close；下载再次通过Account验证。按toolCallId与commandId配对确认渲染退出码0，下载内容是真实PDF。文稿为公开合成三段文本，一页A4，预检在NFKC归一化后确认标题与全部正文（PDF字体映射含康熙部首兼容码位）；主智能体查看实际页面无缺字/明显截断。较早只返回计划的一轮和达到12步上限未发布的一轮均未计为成功；完整执行使用现有20步设置，没有提高运营金额或资源上限。

## 环境与客户端

本机 `.env.local`启用基础开发运行；本机 `.env.production`仅准备配置、仍关闭。新增/管理的名称为 CLOUD_SANDBOX_ENABLED、REGION、DOMAIN、API_URL、API_KEY、TEMPLATE、APP_ORIGIN、ENCRYPTION_KEY、MONTHLY_BUDGET_CNY、RUN_BUDGET_CNY、BUDGET_RUN_ID、FIXED_COST_CNY、SKILLS_VERSION、SKILLS_TEMPLATE（均带 CLOUD_SANDBOX_前缀）。没有更新 Windows全局环境或远端进程环境，未在报告里记录任何值。

真实OCI验收后，仅将本项目两个env文件中的`CLOUD_SANDBOX_TEMPLATE`、`CLOUD_SANDBOX_SKILLS_TEMPLATE`、`CLOUD_SANDBOX_SKILLS_VERSION`更新为已验收组合。无关变量逐项保持，旧文件留在受限备份目录；原API key及加密key没有旋转，生产开关保持false。GitHub构建环境Secret是另一受限服务端配置，不是Windows全局变量或EXE内置凭据。

Electron本机服务不会携带操作者密钥。主 Agent请求、命令、产物、Skills及连接操作通过固定受信线上服务处理，仅传当前用户Account authority；用户已选择的BYOK参数保留，桌面配置的用户模型转为同等自备配置。回环/私网自定义模型地址不转发到云端。授权回调在正式网站完成，避免把共享OAuth应用secret塞进EXE。其他模式的常规请求保留既有路径。

发布前仍需完成原生服务正式回调、生产secret注入、最终版本的完整质量门禁、跨仓提交/依赖固定、部署与各客户端实际下载验收。真实渲染镜像、云模板和开发账号的模型调用已完成上述验收。不能把本机配置、真实开发调用或准备好的代码说成已上线。
