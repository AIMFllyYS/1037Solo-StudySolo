# 学习连接器原生运行时

更新：2026-10-04。本文说明已落地代码，不等同于真实账号端到端验收或生产发布。进度以 [执行记录](../plans/2026-10-03-learning-connectors-integration-execution.md) 为准。

## 接入与调用链

`/api/chat` 在服务端通过 Account introspection 得到规范 UUID，作为 `connectorOwner` 传入 `createStudyAgent` → `buildStudyTools` → `learningConnectors`。身份不来自模型参数、请求 JSON 或旧 legacy id。浏览器请求的续期在 Next proxy 使用 Shared 会话模块完成；产品不另签用户令牌。

`learningConnectors` 提供 status / discover / read / propose / export。status 只返回当前用户连接状态与功能范围；discover 只披露已审查操作与参数；read 使用 server-only 凭证；propose 保存候选，不写入提供者；export 引用当前复习板已完成闪卡。计划模式与笔记窗禁用 propose / export；生图模式不注入连接器；用户禁用开关继续生效。

工具反馈沿现有 UIMessage / 结果卡 / 历史和计费链传递。只有文本进入模型工具反馈；凭证和内部 owner UUID 不进入模型。启用连接器的 Agent 日志与遥测使用 metadata-only，只留耗时、用量和调用名，不复制私人笔记、邮件、联系人或候选正文。

## 服务与边界

| 服务 | 已实现 |
|---|---|
| Notion | 官方 hosted MCP：检索、读取、权限/成员/评论等审查名单；新建学习页面和追加内容走确认。整页覆盖、删除、未知新工具不自动开放 |
| Todoist | 官方 hosted MCP：任务、项目、集合与概览读取；新增、更新、完成任务走确认。更新/完成的明确任务 ID 在候选创建和执行前做状态摘要比对 |
| GitHub | 官方 remote MCP，仓库、代码、Issue、PR 只读；发送 readonly header，写工具不开放 |
| Google | 官方 API：资料搜索、选定文档/表格/幻灯片/文本/PDF、日历事件读取、课程邮件检索/正文、联系人查找；日历创建和单收件人纯文本邮件发送走确认 |
| Zotero | 官方 API：当前个人库文献、条目、集合；不绕过私人笔记、群组或写权限 |
| PubMed / Crossref | 官方公开元数据/摘要/DOI；批量与分页有界，PubMed key 只作为公开检索配额；不自动传递私人账号邮箱 |
| Anki | 既有闪卡 TSV 导出，保留来源 GUID 和完整本机内容；不安装桥接、不修改复习调度。聊天中的导出在点击时复核当前账号绑定 |

Google 连接选择功能范围，默认资料库/日历读取；请求所选范围及基本 OpenID/email 身份。现有开发五项授权继续兼容。Calendar 创建需要额外 `calendar.events`；不把 readonly token 当作写入凭证。Gmail 发件人来自提供者确认的账号标识，不能由模型自填；收件人、主题、正文在确认卡展示。MIME 处理 UTF-8、base64URL、行折叠与头注入检查。HTML 邮件只提取文字，PDF 不运行脚本，资料结果超限会明确提示分页或缩小范围。

文档/PDF/幻灯片默认按范围读取。Drive 不支持的二进制格式明确返回导入提示；不声称已解析图片、音频或任意附件。Google Workspace MCP Developer Preview 未启用。

## 凭证、刷新与断连

`persistence.server.ts` 保持旧开发密文/AAD兼容；开发只用受限目录，生产只用 Shared 的 `ss_connector_records` / `ss_connector_leases`。数据库 RLS 开启、匿名/普通用户表权限和 RPC 权限撤销，server role 访问前必须经过 Account 身份验证。

每个连接以 Account UUID / provider 归属，包含提供者账号、issuer/resource、callback、实际 scopes、可选有效期和加密 access / refresh token。AES-256-GCM 使用归属上下文 AAD。来源错配拒绝读取；密文不能复制到另一用户上下文使用。

访问凭证即将到期时刷新；每连接使用跨进程租约，旧值/新值通过版本条件更新。轮换结果先加密保留，再替换当前记录。刷新不确定或已失效时要求重新授权；限流不隐式轮换。断连先阻止本地新请求，再尝试远端撤销；Google 有撤销接口，其余返回需在提供者侧核对的明确状态。旧加密记录归档保留，不把断连误报为远端一定已撤销。

生产应用仍需数据库迁移、独立环境密钥、HTTPS callback 注册、提供者资格/审核及实际发布验收。`CONNECTOR_ALLOW_PRODUCTION=false` 保持关闭；健康接口的 `authorizationImplemented` / `nativeAgentIntegrationImplemented` 指代码实现，`productionVerificationComplete=false` 指尚未完成生产验收，不能据此推断任何个人账号连接状态。

## 外部写入确认

候选保存 action ID、owner、provider、operation、固定参数、连接签名、有效期、状态及必要的来源摘要。模型没有 execute 动作。确认/取消路由从服务器读取固定候选，实时确认账号、同源、权限和 MFA；请求体不能替换目标/正文。连接重绑、候选过期、任务来源改变时拒绝执行。

持久单次消费标记和受保护状态转换保证重复点击、并发确认与取消不会重复发出同一操作。写入传输失败、部分错误或进程未完成记录时保持 uncertain / executing；界面不自动重试，不将未知结果标成成功。Google event ID 由 action ID 固定生成。提供者本身没有原子版本接口时，执行前摘要检查不代表消除了所有外部并发编辑窗口。

## API 与界面

- `/agent/plugins`：原生连接管理；与静态外部宿主配置目录区分。
- `GET /api/connectors`：当前用户状态，不返回 token 或提供者私有标识。
- `POST /api/connectors/[provider]/connect`、callback、disconnect：关联与断连。
- `POST /api/connectors/inspect`：认证后的同一执行器接口；不接受请求中的用户归属。
- `GET /api/connectors/actions/[actionId]`、POST confirm/cancel：固定候选生命周期。
- `/api/connectors/development/native-check`：仅本机的真实读取验收，报告不保存私人材料。

所有远程执行固定于提供者审查过的 HTTPS 地址；不接受任意 MCP URL、stdio 命令、额外授权 header 或模型给的 token。`readOnlyHint` 只是提供者描述，不授予调用权限；未知工具默认不披露和不执行。
