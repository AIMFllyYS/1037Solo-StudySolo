# 学习连接器选型与接入准备规格

状态：选型与开发认证已完成，原生接入代码已实施；最新验收见 [执行记录](2026-10-03-learning-connectors-integration-execution.md)。更新日期：2026-10-04。优先级是面向 StudySolo 学习场景的产品判断，不是用户使用率调查。

## 1. 决策

首批学习闭环采用 **Notion + Todoist + Google Drive + Google Calendar**：笔记与课程资料 → 学习计划 → 任务 → 时间安排 → 学习结果回写。保留已有 GitHub / Google 应用凭证；不继续 Microsoft 申请。

第二批准备 Zotero、PubMed / Crossref 和 Anki。Obsidian 放在桌面互通阶段，飞书列为国内用户候选，待专项核对接入与权限。Slack / Linear / Jira 等暂不占用首批实施资源。

一个学习功能不必对应一个独立 MCP：Google 产品可以共享账户连接、按功能请求权限；公开文献元数据可以直接调用官方 API，再由我们的工具适配；用户本机软件需要设备侧桥接。通过 API 接入的服务不能在市场里标成“官方托管 MCP”。

## 2. 当前真实状态与术语

| 阶段 | 判定 |
|---|---|
| 已选型 | 有学习场景、主来源、接入方式与边界 |
| 已发现协议 | 未认证请求与公开 OAuth 元数据已实际核对 |
| 应用配置就绪 | 本应用 Client ID / Secret / 签名凭证已配置并校验 |
| 用户已关联 | 用户从本产品发起授权、回调成功、授权记录绑定已验证 Account UUID |
| 真实调用通过 | 对指定测试数据的真实工具调用与结果核对完成 |
| 原生 Agent 可用 | 对话能披露、调用、显示结果，模式/权限/取消边界生效 |
| 生产验收完成 | 实际发布、双用户隔离、刷新、撤销和提供商资格等完成 |

GitHub / Google / Notion / Todoist / Zotero 已完成开发账号授权。新 `learningConnectors` 原生工具、连接管理与确认执行代码已落地，并通过工具循环/安全/组件回归；这不能替代真实账号新执行链和生产验收。KitSolo 保留其专用桥接，不冒充第三方通用 MCP 宿主。
机器可读目录见 [learning-connectors-catalog.json](2026-10-03-learning-connectors-catalog.json)。公开核对证据见 `artifacts/connector-analysis-2026-10-03/hosted-mcp-discovery.json`。

## 3. 服务优先级

| 优先级 | 服务 | 学习用途 | 接入路线 |
|---|---|---|---|
| P0 | Notion | 读取课程大纲、笔记、作业要求；生成候选学习页 | 官方托管 MCP + OAuth |
| P0 | Todoist | 读截止日期、拆解复习任务、追踪完成 | 官方托管 MCP + OAuth |
| P0 | Google Drive | 引用和解析用户选择的课件、讲义 | 正式产品采用官方 API；官方 MCP 预览另行评估 |
| P0 | Google Calendar | 读取课表/已有安排、提出学习时段 | 同上；写入日程须单独增量授权 |
| P1 | Zotero | 文献库、集合、条目、笔记与引用 | 官方 Web API 适配，用户范围授权 |
| P1 | PubMed / Crossref | 找论文、核对 PMID / DOI、引用元数据 | 官方公开 API 适配 |
| P1 | Anki | 把已确认闪卡交给用户既有复习系统 | 首先提供导出；设备侧 AnkiConnect 桥后续实现 |
| P1 | GitHub | 编程课程、课程项目资料、Issue / PR | 已准备凭证，继续官方远程 MCP |
| P1 | Gmail | 从相关课程邮件提取要求、截止日期 | 已准备 API/OAuth；读写/发送分开 |
| 候选 | 飞书 | 国内用户的云文档、课程/小组资料 | 专项核对官方 API、用户身份及托管 MCP 可用性 |
| P2 | Obsidian | 本机 Markdown 知识库互通 | 社区本地插件 MCP / 设备桥 |
| 暂停 | Microsoft | 邮箱、OneDrive 等 | 用户已暂停，本规格不触发申请 |

## 4. Notion 接入准备

### 4.1 已核实的服务合同

官方托管端点为 `https://mcp.notion.com/mcp`。官方指南支持 OAuth 授权码、PKCE、动态客户端注册；本轮公开元数据也公布了 S256、注册、刷新与客户端元数据文档能力。应使用托管服务，旧开源服务器已不再活跃维护。依据：[客户端指南](https://developers.notion.com/guides/mcp/build-mcp-client)、[连接指南](https://developers.notion.com/guides/mcp/get-started-with-mcp)。

这条路线不要求现在先填一枚全局 `NOTION_TOKEN`。动态注册返回的客户端记录需按提供商/issuer/部署/回调版本持久化，可能含 client secret；用户 access / refresh token 则按用户与工作区分开加密保存。

### 4.2 学习场景与最小工具

先用 `notion-search` / `notion-fetch` 读取选定课程资料；条件工具先查询 `notion-get-tool-access`，按套餐和参数限制披露能力。AI 跨来源搜索不作为首批必须条件。候选稿确认后才开放创建学习页、追加复习摘要等写操作。实际工具名与 schema 以本次连接的发现结果为准。依据：[工具与可用性](https://developers.notion.com/guides/mcp/mcp-supported-tools)。

不得假设授权仅覆盖一篇页面。官方说明客户端能访问用户可访问的内容；本产品需再限制课程/页面选择和自动读取范围。外部页面内容是资料，不是系统指令；写入前须审核目标与候选改动。依据：[安全说明](https://developers.notion.com/guides/mcp/mcp-security-best-practices)。

验收例：用户指定测试课程页 → 查找/读取 → 生成本地复习提纲 → 展示目标工作区、父页和内容 → 用户确认 → 创建候选学习页 → 回读核对真实页面链接。异步写操作须等提供商任务完成，不能将“已接收”显示成“已写入”。

## 5. Todoist 接入准备

官方托管端点为 `https://ai.todoist.net/mcp`，开发平台提供 API、SDK 与托管 MCP。官方 MCP 的授权范围是 `data:read_write`，不能声称服务端 token 本身只读；默认只读必须由 StudySolo 的工具策略强制执行。依据：[开发平台](https://developer.todoist.com/)、[权限说明](https://www.todoist.com/da/help/todoist/todoist-and-ai/connect-todoist-to-an-ai-assistant-xMSzFfHng)。

本轮公开发现链实际指向 `https://todoist.com` 的授权服务器，而不是 MCP 地址所在的 `ai.todoist.net`。元数据公布注册、S256、刷新和客户端元数据文档能力。未来仍按当次元数据选择注册机制与认证方式，不直接照抄 API 文档中另一组固定 URL。依据：[OAuth 与注册](https://developer.todoist.com/api/v1/)。

不将维护者的 `TODOIST_API_KEY` 填成所有用户共用的生产环境变量。官方本地服务器使用运行者的一枚 API key，适合单人本地测试；面向多人应使用各自 OAuth。依据：[官方服务器部署说明](https://github.com/Doist/todoist-mcp/blob/main/docs/mcp-server.md)。

首批读任务、项目与截止日期；创建/修改/完成任务走确认卡。删除任务、项目移动或覆盖截止日期不默认开放。

验收例：读取指定课程项目 → 生成 7 天候选复习任务 → 用户确认项目、日期和数量 → 创建 → 回读核对。保留日期与时间区别、时区、重复规则、任务原始文本和远端 ID；不能将“周五截止”自动当作“周五学习”。

授权返回可能不含某些可选字段。不得为缺失 `expires_in` 的 token 编造固定寿命，也不能仅凭 metadata 宣称实际一定收到 refresh token。认证失败既检查传输状态，也检查 MCP 工具的 `isError`，避免 HTTP 200 掩盖凭证失效。

## 6. Google 的选型补充与预览门槛

前面的 Google 方案采用 API 适配器；这次核实应补充：Google 已有 Gmail、Drive、Calendar、Docs、Sheets、Slides、Chat、People 官方远程 MCP，但截至本轮官方文档仍属 Developer Preview。普通 API 和 MCP 组件是不同开关，例如 Drive 还需要 `drivemcp.googleapis.com`，Calendar 还需要 `calendarmcp.googleapis.com`。本项目之前只启用了普通 API。依据：[Workspace MCP 配置](https://developers.google.com/workspace/guides/configure-mcp-servers)。

预览要求申请并核验 Workspace 账号和 Cloud 项目。计划条款不允许将预览功能普遍提供给域/公司之外的用户，除非获得指定许可；没有核验当前个人账号/项目的预览资格。因此公开学习产品以稳定 API 路径为默认，官方 MCP 只列入受限研发试验。不能因有一个 Gmail 账号就宣称满足 Workspace 预览资格。依据：[预览计划](https://developers.google.com/workspace/preview)。

### 6.1 普通学生的正式路径

Drive 首先由用户选择课件。生产选型优先评估 `drive.file` 与文件选择器的精确授权，避免一开始请求整个网盘；它是本轮建议，尚未加入现有五项范围，必须经增量授权。当前 `drive.readonly` 是广泛且受限的读取范围。依据：[Drive 范围](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)。

Calendar 当前只有读取范围。学习排期先生成候选时段，写入须额外核对对应工具/API 的权限并由用户授权；不能拿当前 readonly token 写日程。依据：[Calendar 范围](https://developers.google.com/workspace/calendar/api/auth)。

授权 UI 按学习功能拆分：资料库读取、日历读取、邮件读取、邮件发送分别选择。连接 Drive / Calendar 时不自动请求 Gmail 或联系人权限。Docs / Sheets / Slides 是资料能力，不必为每个都创建另一个 Google 账号连接。

### 6.2 官方 MCP 试验包

已准备端点：

| 服务 | 官方预览端点 |
|---|---|
| Drive | `https://drivemcp.googleapis.com/mcp/v1` |
| Calendar | `https://calendarmcp.googleapis.com/mcp/v1` |
| Gmail | `https://gmailmcp.googleapis.com/mcp/v1` |
| Docs | `https://docsmcp.googleapis.com/mcp/v1` |
| Sheets | `https://sheetsmcp.googleapis.com/mcp/v1` |
| Slides | `https://slidesmcp.googleapis.com/mcp/v1` |

它们的配额、工具、资格和范围需按各自参考核对。官方列表给出的所有 scope 不是让我们全部请求的指令，也不能将某个托管服务的示例功能当作 REST 路线已有能力。Drive MCP 会排除部分不符合资格的文件；网页上可见不保证 MCP 能读。依据：[Drive MCP 资格](https://developers.google.com/workspace/drive/api/guides/drive-mcp-server-file-eligibility)。

本轮没有申请预览计划、同意条款、开启 MCP API 或扩大 Google scope。

## 7. 学习特色第二批

### Zotero

文献库对论文阅读与医学学习有明确价值。官方 Web API 提供用户/群组库，官方授权是 OAuth 1.0a 的 API key 交换；不是本规格的 OAuth 2.1 注册链。先只读个人条目和集合，私人笔记/群组权限由用户明确选择。长期 key 需可撤销、按用户加密存储。没有把社区 Zotero MCP 标为官方托管服务。依据：[Zotero 授权](https://www.zotero.org/support/dev/web_api/v3/oauth)、[Web API](https://www.zotero.org/support/dev/web_api/v3/basics)。

### PubMed 与 Crossref

准备两个公开元数据适配器：查文献、核对 PMID / DOI、构造可追溯引用。PubMed 的无 key 流量和带 key 流量有不同限额；统一限流、批量查询和缓存，必要时再准备 NCBI 应用流量 key。它是公共数据流量凭证，区别于个人 Zotero 私有库授权。Crossref 公共读取无需注册，速率/并发以响应头和当前政策为准；polite 联系方式由管理员明确选择，不能自动发送账号私人邮箱。依据：[NCBI 限额](https://support.nlm.nih.gov/kbArticle/?pn=KA-05510)、[Crossref 访问](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/)。

返回作者、题名、年份、DOI / PMID、来源 URL；缺失摘要、全文或引用字段就标记缺失。元数据可用不代表可以获取或传播付费全文。

### Anki

复用本项目 `lib/stores/reviewCards.ts` 的既有闪卡。首版可先设计 TSV 导出，让用户自主导入；实时互通走用户设备上的社区 AnkiConnect。它是本地插件 API，不是已经核验的官方托管 MCP。公开 Web 服务器的 localhost 不等于用户电脑，不能把它作为云端 MCP URL。依据：[Anki 文本导入](https://docs.ankiweb.net/importing/text-files.html)、[AnkiConnect 维护者项目](https://github.com/FooSoft/anki-connect)。

实时桥需要桌面/helper 生命周期、账号归属、调用来源与动作白名单。只创建已确认的新卡，重复导出有来源标记；不改现有调度、复习历史或用户整套卡组。

### Obsidian 与国内候选

Obsidian 的社区 Local REST API 插件已带本地 MCP，适合桌面知识库用户。需要设备侧密钥与证书信任、允许 vault；它不是 Obsidian 官方云 MCP，不关闭 TLS 校验或把用户本机服务公开暴露。依据：[社区插件说明](https://community.obsidian.md/plugins/obsidian-local-rest-api)。

飞书可作为国内云文档/任务/日历候选，但本轮没有验证其托管 MCP 端点与注册资格，不能据此写入官方服务名单。TickTick 暂作为后续 Todoist 替代评估；用户本轮确认先按 Todoist。

## 8. 应该先补的共同底座

`lib/connectors/config.server.ts` 读取 GitHub / Google 应用配置。新增本机开发认证入口 `/api/connectors/development/` 支持 Notion、Todoist、Google、GitHub 的 OAuth 2 + PKCE 与 Zotero OAuth 1.0a 发起/回调、受限加密文件保存；必须先通过 Account introspection 确认当前 UUID，且生产环境强制拒绝。本轮五个提供者真实回调均已完成，Notion / Todoist / GitHub 的 authenticated initialize 和 tools/list 分别返回 44 / 47 / 22 个工具；未调用内容工具。健康接口 `authorizationImplemented=false` 仍指生产通用授权未完成，另有 `developmentAuthorizationImplemented=true`。以下生产存储、自动续期、Agent 工具和内容调用验收仍是实现目标，详见 [开发认证记录](../refer/learning-connector-authentication.md)。

### 8.1 连接注册表

新增 `lib/connectors/registry.ts`，每项声明：provider、接入类型、官方端点/来源、已核验 origin、OAuth 方式、作用域策略、云端/本机执行位置、能力域、读写策略、资格限制和真实准备阶段。编程接口示例：

```ts
type ConnectorKind = 'hosted-mcp' | 'api-adapter' | 'local-bridge';
interface ConnectorDescriptor {
  id: string;
  kind: ConnectorKind;
  issuerOrigins: readonly string[];
  capabilities: readonly string[];
  runtime: 'server' | 'device';
  requiresExternalEligibility: boolean;
}
```

市场的静态 `public/plugins/market.json` 保留作为目录。新增真实关联状态从后端获取，不能把 copied-config、application-configured、user-connected、call-verified 混为一个“已安装”。现有 GitHub 市场仍指向已归档 reference server，实施时修订该条目的来源/宿主配置说明。

### 8.2 授权、注册与持久化

新增 `lib/connectors/oauth/` 与 `repository.ts` / `tokenVault.ts`：

- 通过 Account introspection 得到规范 UUID；不以请求 JSON、自报邮箱或旧 legacy id 判归属。
- transaction 绑定 UUID、提供商、浏览器 state、PKCE、部署与精确 callback，短期且只能消费一次。回调期间换账号必须拒绝。
- 从 MCP 的 401 challenge 跟随 RFC 9728 resource metadata，再读取 RFC 8414 issuer metadata；不假设 MCP 与 issuer 同域。Notion 示例文档把 resource RFC 标为 9470，实现需以 MCP 规范与实际广告为准，不能照抄错误编号或路径。
- 全部 discovery、registration、token、redirect URL 经过提供商 origin 策略，阻止私网、任意跳转和 endpoint 混用。Notion / Todoist 本轮已核实 origin 见机器目录。
- DCR / CIMD 能力由 metadata 决定；开发优先可接受 loopback 的 DCR。CIMD 要先有真实可公开读取的 HTTPS 元数据文档，不能伪造一个 localhost client_id。
- 客户端注册缓存与用户 token 分开；用户记录至少包括 owner UUID、provider account ID、workspace/library、resource、实际 scopes、版本、撤销状态、可选 expires_at 与加密凭证。
- 刷新单连接互斥 + CAS；持久保存新 refresh token 后才能替代旧值。缺失可选字段按提供商合同处理，不造寿命。
- 断连先阻止本地新调用，再尝试远端撤销；轮换、撤销和在途调用要有明确结果，不泄露凭证。

已实现路由为 `POST /api/connectors/[provider]/connect`、`GET /api/connectors/[provider]/callback`、`GET /api/connectors`、`POST /api/connectors/[provider]/disconnect`，当前每用户/提供者保留一条活动连接。生产数据表迁移已准备，未在远程运行。

**先把回调和本地 fixture 验证做完，再带用户进授权窗口**，避免再次出现安装/授权成功后落到未实现路由的 404。

### 8.3 执行与展示

新增 `lib/connectors/mcp/` / `providers/`，使用合适版本的官方 SDK；版本协商、HTTP / SSE、工具发现与分页、响应字节限额、超时/取消、错误分类、连接 TTL 与释放一并定义。发现到的未知工具默认禁用；`readOnlyHint` 不能代替服务端策略。HTTP 200、JSON-RPC 成功、`isError=false` 和业务动作已完成分别判断。

在 `app/api/chat/route.ts` 从已验证身份加载相关连接，再由 `lib/ai/agent/tools/server.ts` 注入。更新 `names.ts`、`presentations.ts`、结果卡注册与双语文案，保持既有 Agent / 计费 / 消息持久化链。

建议稳定的领域桥接工具为 `searchConnectedSources`、`readConnectedSource`、`listStudyTasks`、`proposeExternalAction`；这些名字是目标，不是现有代码。远端 schema 按任务发现，避免把每个服务所有工具塞入每次请求。结果携带来源定位，正文分段并有上限，凭证只在执行闭包内。

### 8.4 待办、日历与定时任务

本项目 `scheduledTasks.ts` 是让 Agent 到时运行的调度记录；Todoist 是用户的学习待办，二者不替换。

统一外部任务引用至少有 `(ownerUuid, connectionId, provider, remoteProjectId, remoteTaskId)`、内容、状态、due date / datetime / timezone、来源版本。日历时段单独引用 event ID。默认按请求读取，不先做全量双向同步。

后续增加同步时，再定义来源权威、冲突、重复、断连和删除语义。当前 `SchedulerRuntime.tsx` 只在前台派发；关闭页面后的自动监控需要另建服务端队列/租约，不能用现有定时页面冒充。

### 8.5 写操作确认

所有外部写入先创建候选记录：action ID、owner、connection、具体目标、规范参数摘要、来源版本、有效期、状态。用户看见数量、日期、目标项目/页面/日历及内容，再确认。

确认 API 从服务器读取固定参数，实时确认身份与权限，action CAS 保证只执行一次。不能接受模型传来的 `confirmed:true`。计划模式下，不注册外部写入口，执行层也拒绝写调用。

跨 Todoist 与 Calendar 的计划不是跨服务事务。分别记录实际成功对象；超时后结果不确定就显示 unknown，核对或让用户处理，不能盲目重试并造出重复任务。Notion 写页面、Todoist 创建/完成任务、Calendar 插入时段各有自己的确认与错误展示。

## 9. 准备材料与环境变量

本轮不添加空白 `NOTION_TOKEN` / `TODOIST_API_KEY`，不改变已有 14 项环境变量或五项 Google scope。官方 hosted MCP 的用户 token 与动态注册记录，未来放受限的服务器数据库，不作为站点全局环境共享。

已准备的注册请求模板（不是已发送请求）：

```json
{
  "client_name": "StudySolo Learning Connectors",
  "client_uri": "https://studysolo.1037solo.com",
  "redirect_uris": ["http://localhost:35349/api/connectors/notion/callback/"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"]
}
```

Todoist 使用其 callback，认证方式与 scopes 按当次 issuer metadata / 实际合同补齐。生产登记 HTTPS callback；这两个开发路由、CIMD 端点、相关 DCR 客户端当前均未创建或注册。

每个提供商还需一份测试资产说明：指定账号/工作区、明确可写的测试页/项目、撤销入口、只读和写回验收、数据用途说明、失败反馈。不得用个人真实知识库的所有内容当作默认测试集。

## 10. 实施包与验收

| 包 | 工作与落点 | 完成标准 |
|---|---|---|
| LC00 | registry、目录、准备阶段与能力数据模型 | 区分 MCP/API/local 和所有准备阶段；不出现假 connected |
| LC01 | OAuth transaction、Vault、持久化与状态 API | Account UUID、多账户、重启、刷新竞争、撤销隔离通过 |
| LC02 | 通用 MCP client、发现与外部源结果 | Notion / Todoist 发现、schema、错误、取消、资源回收通过 |
| LC03 | Notion 最小读取与候选写页 | 两真实账号隔离；指定页读回与确认写回通过 |
| LC04 | Todoist 最小任务读取与候选写入 | 不误改已有任务；创建/完成/重试语义通过 |
| LC05 | Google 学习授权 profile、Drive / Calendar API 适配 | 不连带申请邮件；权限不足有引导，readonly 不写日程 |
| LC06 | Agent 桥、卡片、来源、模式与预算 | 主对话真实调用；计划/禁用/笔记窗/取消边界通过 |
| LC07 | Zotero、PubMed/Crossref | 引用可追溯，私库隔离，批量限流与字段缺失处理 |
| LC08 | Anki 导出与设备桥、Obsidian 后续 | 云端不访问用户 loopback；本地身份/动作/证书正确 |
| LC09 | 生产与预览分离、登记/审核和真实验收 | HTTPS、部署、双用户、凭证轮换、资格符合，关闭页面行为不夸大 |

测试至少覆盖：错误/过期 state、回调重放、登录切换、提供商混用、跨用户 connection ID、参数换包、过期确认、并发刷新、轮换失败、工具 isError、HTTP 429/5xx、异步写结果、未知 schema/工具、超大返回、注入内容、断连在途请求、时区/日期与重复规则。真实写测试只用经用户指定的可写测试资产。

准备完成、模拟测试通过、真实调用通过、原生集成完成、生产完成分别记录。此规格和协议探针不能替代这些后续工作。
