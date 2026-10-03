# 学习连接器开发认证记录

观察日期：2026-10-03。此记录仅说明本机开发认证与真实 API / MCP 元数据验收，不表示生产接入或聊天 Agent 工具已完成。

后续更新：2026-10-04 已实施原生连接器运行时与 Agent 工具，本文后面的“尚未实现”描述属于当日认证准备快照；最新代码与验收状态见 [运行时合同](learning-connector-runtime.md) 和 [执行记录](../plans/2026-10-03-learning-connectors-integration-execution.md)。

## 已完成

| 服务 | 开发认证结果 | 真实检查 |
|---|---|---|
| Notion | 官方 hosted MCP 动态注册客户端；OAuth + PKCE 回调完成；access / refresh token 加密保存 | initialize、notifications/initialized、tools/list 成功，44 个工具，无分页 |
| Todoist | 官方 hosted MCP 动态注册客户端；OAuth + PKCE 回调完成；access / refresh token 加密保存 | 同上，47 个工具，无分页 |
| GitHub | 复用现有只读 GitHub App 与已有用户同意；用户 OAuth + PKCE 回调完成；access / refresh token 加密保存 | 官方 remote MCP 只读 repos/issues/pull_requests 工具集初始化与列表成功，22 个工具 |
| Google Drive / Calendar / Gmail / Contacts | 复用已有 Web OAuth 客户端；五项已确认范围全部授权完成；access / refresh token 加密保存 | Gmail profile 用于身份确认；Drive about（仅 kind）与 Calendar 公共颜色元数据均 HTTP 200；不读取学习内容，不申请 Workspace MCP Developer Preview |
| Zotero | 多用户 OAuth 1.0a 开发应用注册完成；签名 request/access 交换完成；个人库只读 API key 绑定当前项目用户并加密保存 | `/keys/current` 检查本人身份，个人库读取 true，笔记、写入、群组权限均 false |
| PubMed | NCBI 公共检索配额 key 创建并写入服务端环境 | E-utilities POST 公共检索计数 HTTP 200，无私人书目访问 |
| Crossref | 无需账号或 key | DOI 公共元数据 HTTP 200；API base 为 `https://api.crossref.org` |
| Anki | 首阶段为本地导入，无需服务端账号认证 | 本轮未安装本地桥接，也未连接 AnkiWeb 或操作复习历史 |

MCP 的工具列表数量不代表所有工具都在当前套餐和权限下可执行。本次未调用内容工具，也未读取笔记、任务、邮件正文、仓库文件或私人文献条目，未执行外部内容写入。

## 用户归属与凭证

本轮使用用户允许的本机开发测试账号。所有 grant 的归属来自服务端 Account introspection 的 canonical UUID，不能从邮箱、请求 JSON 或产品 legacy id 决定。项目用户与第三方用户不是同一个身份体系；以后其他学习用户需要各自授权。

应用密钥在 `.env.local`、`.env.production` 和受限备份中。本轮新增 `NCBI_API_KEY`、`ZOTERO_CONNECTOR_CLIENT_KEY`、`ZOTERO_CONNECTOR_CLIENT_SECRET`，原有 GitHub / Google 客户端、私钥和加密密钥继续复用。未更新远程部署环境；`CONNECTOR_ALLOW_PRODUCTION=false`。

用户 access token / refresh token 不放全局环境变量。开发 grant、OAuth pending、动态注册客户端与验收记录保存在 `.local-archive/connectors-private/development-vault/`，AES-256-GCM 加密、归属上下文 AAD、继承受限 Windows ACL。开发页面不返回 token、私钥、第三方账号标识或 Account UUID。人工 Zotero 只读 key 是开发者 API 测试资料，与应用的 OAuth grant 分开，不能共享给所有用户。

## 本机入口与限制

- 认证总览：`http://localhost:35349/api/connectors/development`
- MCP 元数据验收：`http://localhost:35349/api/connectors/development/verify`
- 应用配置健康：`/api/health/connectors`，公开投影仍只报告应用配置，不公开个人连接状态。

入口全部强制仅本机开发。生产构建即使启用配置开关也拒绝这些开发路由。授权发起需精确同源 POST；callback 检查浏览器 HttpOnly 绑定、10 分钟有效期、Account UUID 与一次消费标记。开发总览使用 `strict-origin` 保留表单 POST 的 Origin，含授权码的 callback 使用 `no-referrer` 并排除 Next 开发请求日志。发起 POST 先返回安全跳转页，再使用正常链接进入官方同意页，避免表单跨站重定向的浏览器兼容问题。

Zotero 页面曾显示群组 None，但 API 返回了群组读取。显式更新权限并重新提交后，实际 API 返回与已确认范围一致；此前未通过校验的凭证不进入可用 grant。候选记录保持加密，仅允许当前用户在开发检查路径读取权限布尔值。

本机入口没有自动 refresh、生产数据库、撤销/轮换后台、通用用户连接管理 UI 或学习 Agent 执行链。access token 到期时需重新授权；续期凭证虽已保存，尚未自动使用。正式实施仍按 [准备规格](../plans/2026-10-03-learning-connectors-preparation-spec.md) 的生产 vault、工具许可、写确认和幂等要求推进。

RootSolo 本轮通过 Edge 操作，第三方登录/同意页通过 Chrome 操作。为满足内存启动闸门，先启动 Account 前端确认本机登录，再停止该前端并启动 StudySolo；Account 后端继续运行。未调整内存闸门或浏览器安全设置。

证据：`artifacts/connector-auth-2026-10-03/` 下的认证总览、MCP 验收截图与脱敏 JSON；安全测试覆盖加密上下文、错误密钥、密文篡改、生产拒绝、CSRF、未登录/伪造 callback 和 chunked SSE / JSON-RPC 错误、大小限制。实际身份与 OAuth / MCP 请求验收不能代替生产验收。
