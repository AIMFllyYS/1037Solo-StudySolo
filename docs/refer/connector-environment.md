# 连接器服务端环境配置

更新：2026-10-04。本页说明应用级凭证与运行时环境的配置。环境就绪不等于用户 OAuth 已关联，也不等于 Agent 已获得工具。当前部署交接与剩余验收见[当前状态](../plans/2026-10-04-current-status-and-deployment-handoff.md)。

后续学习服务选型见 [学习连接器准备规格](../plans/2026-10-03-learning-connectors-preparation-spec.md)。Google 官方也有 Workspace MCP，但当前是有资格与公开使用限制的 Developer Preview；本页配置的是普通 API/OAuth 应用，不能据此声称对应 MCP 组件已启用。Notion / Todoist 官方托管 MCP 的动态注册与用户 token 不要求先加全局个人 API key。

## 凭证放在哪里

OAuth Client Secret、GitHub App 私钥及授权记录加密密钥只放服务端环境变量或服务端密钥挂载中，不使用 `NEXT_PUBLIC_`，不写入市场清单、前端 localStorage、消息或日志。

本机 Next.js 使用 `.env.local`；仓库同时维护本机的 `.env.production` 供生产配置准备。二者目前包含相同的 17 个连接器/配额变量，原有无关配置保持保留。云端控制台或远程运行进程的环境不会因修改本机文件而自动更新；本轮未同步远程部署配置或发布产品应用。

完整原始凭证与环境更新前的备份保存在 `.local-archive/connectors-private/`，目录由 Git 忽略，Windows 仅允许当前用户与 SYSTEM 访问。受限目录内的 `.env.connectors.local` 是同步备份，不是另一个自动加载入口。

## 变量合同

| 变量 | 用途 |
|---|---|
| `CONNECTOR_DEV_CALLBACK_ORIGIN` | 开发回调 origin，只接受 HTTP loopback，不接受路径、查询串或用户信息 |
| `CONNECTOR_CALLBACK_ORIGIN` | 生产回调 origin，只接受非 loopback 的 HTTPS origin |
| `CONNECTOR_ALLOW_PRODUCTION` | 显式生产启用开关；本机待部署配置为 true，远端尚未更新 |
| `CONNECTOR_DEV_TOKEN_ENCRYPTION_KEY` | 独立的开发授权记录加密密钥，32 字节 base64 |
| `CONNECTOR_TOKEN_ENCRYPTION_KEY` | 独立的生产授权记录加密密钥，32 字节 base64 |
| `GITHUB_CONNECTOR_APP_ID` | GitHub App 标识 |
| `GITHUB_CONNECTOR_CLIENT_ID` | GitHub OAuth 客户端标识 |
| `GITHUB_CONNECTOR_CLIENT_SECRET` | GitHub OAuth 客户端密钥 |
| `GITHUB_CONNECTOR_PRIVATE_KEY_BASE64` | PEM 私钥的 base64 表示，服务端优先使用；仍然属于明文秘密，并不是加密 |
| `GITHUB_CONNECTOR_PRIVATE_KEY_PATH` | 外部受限 PEM 文件的回退路径，仅在 BASE64 未设置时使用 |
| `GOOGLE_CONNECTOR_CLIENT_ID` | Google OAuth Web 客户端标识 |
| `GOOGLE_CONNECTOR_CLIENT_SECRET` | Google OAuth 客户端密钥 |
| `GOOGLE_CONNECTOR_PROJECT_ID` | Google Cloud 项目标识 |
| `GOOGLE_CONNECTOR_SCOPES` | 已确认的五项 Google 范围，空格分隔；配置模块拒绝新增未批准的范围 |
| `NCBI_API_KEY` | 可选公开 PubMed/E-utilities 配额 key；不是用户私有文献库授权，不使用 NEXT_PUBLIC 前缀 |
| `ZOTERO_CONNECTOR_CLIENT_KEY` | Zotero 多用户 OAuth 1.0a 应用的 Client Key |
| `ZOTERO_CONNECTOR_CLIENT_SECRET` | Zotero 多用户 OAuth 1.0a 应用 Client Secret，服务端秘密；不是个人文献库 key |

GitHub 私钥同时保留文件备份，环境使用 base64 形式，避免把 Windows 路径当作云端文件路径或把私钥文件打进桌面安装包。Next 的文件追踪规则已经排除 `.env*` 和 `.local-archive/`；新增服务端配置模块没有从客户端桶文件导出。

当前登记的开发回调为 `http://localhost:35349/api/connectors/github/callback/` 和 `http://localhost:35349/api/connectors/google/callback/`。开发与生产 origin 使用不同变量，配置模块按 `NODE_ENV` 选择；因此 `.env.local` 在生产构建中优先加载也不会把 localhost 自动当作生产回调。

用户 OAuth 的 access token / refresh token 不能放全局环境变量。新增本机开发认证入口按 Account introspection 的规范 UUID / provider 加密保存到 `.local-archive/connectors-private/development-vault/`，使用 AES-256-GCM 和包含归属的 AAD；授权 state、PKCE verifier、动态注册客户端也在此加密保存。目录继承已有受限 Windows ACL。开发记录不能作为生产授权数据库，生产构建无论开关如何均拒绝这些入口。

开发入口：`http://localhost:35349/api/connectors/development/`。需由 RootSolo 启动 Account 与 StudySolo 并登录项目账号。Notion / Todoist 第一次发起授权时按已核实且固定的官方 metadata/DCR 端点注册本机客户端；注册结果加密保存并复用，无需新增全局 token 环境变量。Google / GitHub 复用已有应用环境变量。回调检查 HttpOnly 浏览器绑定、10 分钟 state 有效期、Account UUID 一致性；持久单次消费标记防止重放。令牌只保存于服务端，不进入 HTML、localStorage、工具历史或日志；Next 开发日志忽略带授权码的 callback 请求。

开发授权入口负责授权与身份绑定；原生 Agent 工具执行和用户凭证续期由独立运行时负责。`connections.server.ts` 在提供者返回可用 refresh token 时以用户/provider租约续期，缺少续期凭证或提供者拒绝时要求重新授权。身份回调不读取学习正文；随后七类服务已执行最小真实开发读取验收，没有发送邮件或修改真实任务。生产部署和正式用户授权仍未验收。

2026-10-03：Notion、Todoist、Google、GitHub、Zotero 的真实开发回调均已完成，Notion / Todoist / GitHub 的官方 MCP 初始化与工具列表验收通过。当前完整阶段、三个新增变量和限制见 [学习连接器开发认证记录](learning-connector-authentication.md)。

Zotero 使用单独 OAuth 1.0a 路径 `/api/connectors/zotero/connect/` 与 `/api/connectors/zotero/callback/`，HMAC-SHA1 请求签名、浏览器绑定、10 分钟有效期和一次消费守卫。只请求个人库读取，不请求笔记、写入或群组权限；`/keys/current` 复核实际权限，多出的权限会使本机授权失败并要求检查提供者 key。先前人工创建的只读 key 仅作为开发者账号的 API 测试资料保存在受限目录，不能成为多用户共用的全局环境变量。

## 配置与校验命令

```powershell
npm run connectors:configure
npm run connectors:check
npm run connectors:check -- --production
npm run connectors:check -- --live-github
```

`configure` 读取已核验的受限凭证文件与非敏感注册清单，验证 App / Client ID、Google callback、RSA 位数与登记公钥指纹，再更新实际环境文件。只管理上述变量，保留无关配置和注释；写入前保留受限备份，临时文件与最终文件同样限制权限。密钥不会通过命令参数传入。

重复运行保留现有加密密钥，不做隐式轮换；两个环境文件的加密密钥有冲突时拒绝执行。只写 Git 忽略的目标，拒绝出现连接器 `NEXT_PUBLIC_*` 密钥。Windows 路径在 env 中标准化为正斜杠，避免不同 dotenv 解析器对反斜杠处理不一致。

`check` 按 Next 文档中的优先级合并环境文件与当前进程环境，只输出非敏感状态。`--live-github` 使用 App JWT 调用 GitHub `GET /app` 验证身份，不创建安装 token，不读取仓库文件。JWT、Client Secret、完整响应体均不写日志。

服务端可复用 `lib/connectors/config.server.ts` 的 GitHub / Google 配置读取。`GET /api/health/connectors` 返回只包含可用状态与错误类别的投影，响应禁止缓存，不返回 Client Secret、私钥、加密密钥或文件路径。2026-10-04 起 `authorizationImplemented=true`、`authorizationScope=runtime_implementation`、`nativeAgentIntegrationImplemented=true` 表示代码已实现；`productionVerificationComplete=false` 表示生产验收未完成，不能推断任何个人账号已授权。当前原生合同见 [运行时](learning-connector-runtime.md)。

## 应用准备阶段的验证与生效

- `.env.local` 和 `.env.production` 原有各 58 项非连接器变量逐项比对，值全部保留。
- 开发/生产加密密钥独立，私钥 base64 还原后与已验证的 PEM 完全一致。
- 本地运行中的 Next 服务已返回 HTTP 200，GitHub / Google 均为 configured；无需本轮强制重启进程。
- GitHub 实际 `GET /app` 返回 200，App ID 与当前登记一致。
- 35 项相关测试通过，类型检查及新增代码的 ESLint 通过；没有把这些结果当作完整用户 OAuth 或生产部署验证。

2026-10-04 实查正式网站 `/api/connectors` 返回403 / `CONNECTOR_PRODUCTION_DISABLED`。Google与GitHub正式精确HTTPS回调已保存，生产vault、续期及Agent接入代码已实现；这些不等于正式用户授权。Zotero正式配置核查仍待本人登录；Notion/Todoist需正式callback对应的首次DCR及用户授权，Google仍Testing。正式部署、用户登录/连接/最小调用验收未完成，不能只把开关改为true就宣称上线。

已运行的开发服务可能自动重新加载 env；其他运行方式更改 env 后需重启或重新部署。浏览器使用的 `NEXT_PUBLIC_*` 变量会在构建时固化，所以秘密从一开始就不得放进这类变量。

依据：[Next 环境变量与加载顺序](https://nextjs.org/docs/app/guides/environment-variables)、[Google 服务端 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)。
