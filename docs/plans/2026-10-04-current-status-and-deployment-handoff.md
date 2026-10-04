# 当前状态与部署交接

更新时间：2026-10-04，本次用户指出 VPN 服务器用途之后。此文优先于旧执行记录中的部署候选及预检运行状态。不是生产验收完成声明。

## 必须纠正的部署路线

38.47.118.246 是用户的 VPN VPS，不再作为 StudySolo 应用预检或生产运行环境。已停止本轮新增的 studysolo-private-preview、专用 PM2 daemon 和本机 SSH forward；检查运行时无其他进程使用后，删除仅本轮新增的 /opt/studysolo-preview 和 /opt/studysolo-runtime。原配置/日志先保存本机受限备份，两份完整发布归档仍保存在本机。

实际释放 3.98 GiB，可用磁盘恢复 8.85 GiB。撤回前总内存 3912 MiB、可用 2538 MiB，预检及其 daemon 约 230 MiB RSS，24h 内无已观察到的 kernel OOM。撤回后 sing-box/nginx 均 active、32802 监听、35359 已释放；StudySolo 正式 vhost SHA256 仍 7d30ece15c25889e578ad8ad1dc978c9f4a16dc6b6203e96d64e3728a5962dba。

上述服务状态不能证明用户 VPN 客户端可用，尚未定位其故障根因。传输两个大归档可能与 VPN 竞争带宽，但目前没有证据确定因果。没有重启、修改 VPN 或 Nginx，也没有切换正式网站。不要删除服务器或用户原有服务。

后续正式部署按用户指定的 Grok BOT / Notebook Agent 流程。当前浏览器仅找到 OpenClaw 的 Assistant，未找到 Notebook Agent；原生桌面控制不可用。已请求准确网页入口，尚未向其他接收方发送部署指令。

## 代码、真实开发验收与正式上线

远端分支本次重新核对：master e78465e147c5356ae57b100fe0dcbd7d99cd522a；dev 3f2821f1cf364c477774ddbc79b1f68ddef8c8bc。此前合并验收确认二者 tree 一致。GitHub 合并不是运行中的网站更新。

| 项目 | 已完成及证据 | 尚未完成 |
|---|---|---|
| 市场与执行命名 | 原生 connector registry、连接入口、执行能力和 Skills 门禁已进入已验收代码 | 正式部署后的市场页面及登录授权验收 |
| tabs / 新对话 / 右键 | 资源窗口最近3项、溢出入口、左侧新对话、共享菜单与键盘行为已测试 | 最近3项跨刷新历史恢复未实现；当前是内存资源窗口规则，不能声称完整满足持久化要求 |
| 推理链 / 初始与完成建议 | 线条、建议卡、追问、输入小标签和输出操作已实现、实页验收 | 正式网站登录态验收 |
| 点赞 / 点踩 / 举报 | 先记录再弹窗、说明、脱敏及 owner/admin ACL；真实 HTTP、数据库计量和后台路由验收 | Landing 管理后台正式部署与浏览器验收 |
| Review 掌握度 / 错题 / 章节题 | 原题快照、attempt、分数、wrong IDs、较新正确答案消除旧错题、真实材料出题；006 已迁移，12题→错题诊断真实调用通过 | 正式网站、跨设备进度恢复验收 |
| 模式动画 / Agent 项目及状态 | 项目加号、紧邻状态点和渐隐文字、reduced-motion、默认40/60；真实拖动、折叠刷新与重开验收 | 正式运行中的阻塞/完成状态视觉验收 |
| Review 笔记 | 主区/浮窗共享学科树、Markdown、TOC；不透明背景、面包屑、overlay/Esc、旧 owner 回调拒绝、索引刷新及虚拟列表 | 正式认证云同步、所有主题、长期性能；没有测量 P95 指标 |
| Class/Review 左导航 | 统一三横线，真实展开/收起验收 | 正式发布后的桌面及移动复验 |
| 内置浏览器 | 50–200% 缩放、复位/刷新、iframe fit 上限、Electron native zoom 接口、阻止嵌入的明确边界 | 真正打包客户端缩放端测仍在修复；不能承诺绕过所有站点 CSP/XFO |
| 最新客户端 / 下载 | 0.6.0 源码及干净 Windows build、Android build/lint 已通过；签名配置及发布流水线准备；Landing 下载 manifest 验证 CI 通过 | Windows packaged UI 与 Android intent 测试曾失败，驱动修复尚未父验收/新CI；PR183未合并，未签名公开发布、未更新真实下载入口 |

任务时间主要消耗于完整 CI、真正云端依赖/隔离验收、打包兼容故障及部署通道绕行。错误在于没有更早把已验收网页交付与客户端发布解耦，以及选择 VPN VPS 预检。后续优先网页部署和正式用户授权，客户端独立推进。

## 阿里云沙箱

专用 Team、角色、基础/完整 Skills 模板与 E2B 2.31.0 已准备。主智能体亲自实现及验收 cloudSandbox 通用命令工具、文件、日志、取消、产物、回收和 Account UUID 绑定。真实模型安装技能→执行原脚本→生成/鉴权下载 PDF→回收通过，Notes to Handbook 9文件和 GB 17文件已真实安装；合成中文 HTML/PDF 与 DOCX/PDF 验收通过。

仅独立 Agent 可执行，Studio 内嵌及其他模式不能执行。使用阿里云隔离 VM + USER/NET/MOUNT namespace 和普通宿主 UID；提供者限制下保留配对 PID/proc 视图，不宣称独立 PID/proc。任务无云/Account/数据库/操作者 MCP 密钥，无一般外网出口，仅本任务 loopback。该环境支持已安装 Linux CLI，不等于所有 GUI、联网工具或任意 skill 自动兼容。

15分钟 VM TTL、10分钟命令、日志256KiB、单产物20MiB、20件/100MiB、并发1、每用户24h 10次；预算100元中预留准备费用30元，任务准入最多70元。准入预算不是已经收到的阿里云最终账单，仍需账单核对。密钥永不过期保持。

正式网站未启用：本机 .env.production CLOUD_SANDBOX_ENABLED=false；正式站点尚未部署新运行时与完成生产身份/执行验收。沙箱运行发生在阿里云，不发生在 VPN VPS。

## MCP 认证

GitHub、Notion、Todoist、Google、Zotero、PubMed、Crossref 七类服务开发账号的最小真实读取已通过。GitHub/Notion/Todoist 使用官方 MCP；其他使用相应原生服务接口，不把所有接口叫作官方 MCP。Anki 是导出能力；Microsoft 按用户要求暂不接入。

Google/GitHub 正式精确回调已按确认保存并读回，localhost 保留；Google 仍 Testing，五项既定 scope 不变。Zotero 开发只读和开发应用就绪，正式配置核查仍待本人登录。Notion/Todoist 正式域名首次连接需对应 callback 的 DCR/per-user 授权，开发 grant 不能转作正式 grant。凭证加密绑定 Account UUID，前端和任务环境不获得运营密钥；外部写入仍走具体操作确认与幂等执行，验收没有发送邮件或修改真实任务。

本机 .env.production CONNECTOR_ALLOW_PRODUCTION=false。没有把开发账号真实读取称为所有正式用户已授权。MCP HTTP/API 不依赖云电脑，云 CLI 主要补足 Skills 和通用文件/命令工作。

## 给 Notebook Agent 的具体部署交接（未发送）

用户已授权通过你负责部署 StudySolo。请先核对现有 StudySolo 自行部署的实际源、运行进程和发布方式，使用该既有部署路线；禁止在 VPN VPS 38.47.118.246 运行应用、安装运行时、修改 VPN/Nginx 或改其他服务。GitHub 已验收 master e78465e147c5356ae57b100fe0dcbd7d99cd522a 包含 Cloud/MCP 和03–08功能。最新独立 Web 候选来自 PR183 head 5cb21a6bb2a0b389dbdf2944addf8678157a4925，common CI与Web归档成功，native客户端端测尚未通过，不应阻塞已验收网页代码交付。请根据现有发布规则选择并固定可审查源码，先报告变更计划及回滚点，再由既有发布流程部署。

主智能体可提供本机受限 Web 归档、哈希与环境变量名称清单，但不通过聊天发送任何 secret。候选归档 SHA256 fc902cc63f8d04acc544153bc9fbd5566f1b5939365c8218690f78da2d6897d2，785664343 bytes，BUILD_ID FDgI9C-_xu1SeLe0bBgrq；收到后独立验签/成员边界/版本，不能直接沿用旧预检实例。生产 Cloud/MCP 总开关暂保留 false；按正式 Account UUID 登录、回调、连接、最小工具调用、独立Agent技能执行/产物/回收、其他模式执行拒绝验收后分阶段启用。RootSolo 当前数据库迁移已应用，不重复旧 SQL；Landing 后台与下载更新必须遵守其生态发布列车规则。不要覆盖任何仓库既有未提交的会员等改动。

桌面/Android0.6.0 PR183与Landing下载PR2还在独立发布门禁，尚无可宣称为新版本的正式安装包链接。先完成网页路径，不将草稿客户端当作公开发布。

## 05:22续查增量

客户端驱动父审及14定向Node/lint通过，PR183现head3763fb425f884e00e03c4cf1ea84995733c19f4e；普通CI37179807544及nativeCI37179807507运行中，不能宣称native UI成功。正式网站实时连接入口403/CONNECTOR_PRODUCTION_DISABLED，健康接口200/runtime实现true仍不表示个人连接或生产验收。部署入口仍待准确Notebook网页；未再操作VPN VPS。
