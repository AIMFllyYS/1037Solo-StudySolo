# iOS 默认外观与 DeepSeek 官方 Fast

2026-10-11，当前重构分支上的授权追加维护。

## 行为

- 首次访问、无效外观恢复与「恢复默认外观」使用 iOS；SSR、首屏 bootstrap 和 store 共用默认值。已保存的风格 ID 继续有效。紫色风格改名「初始风格」，Codex 改名「商务」，Anthropic 改名「纸面」，中英文对应更新。
- DeepSeek V4.1 Flash 普通行通过闪电切换到平台 Fast 变体；Fast 使用 DeepSeek 官方原生 `deepseek-flash`，固定官方端点和独立的 `DEEPSEEK_API_KEY`。不开额外加速参数，不承诺供应商延迟；关闭闪电返回原普通渠道。
- 平台 Fast 价格按普通模型基础费率的 2 倍配置：输入/缓存命中/输出分别为 ¥4/¥0.08/¥16 每百万 token，预留与结算使用独立的可信渠道费率。该政策不是 DeepSeek 官方报价。
- 官方思考默认开启，因此显式关闭时发送 disabled；强度通过 SDK 的 reasoningEffort 发成上游 reasoning_effort。工具历史 reasoning_content 原样传回。原所有者、中央额度和 BYOK 契约保留。
- `.env.local` 和 `.env.production` 新增空 `DEEPSEEK_API_KEY`，由用户填写；模板同步。两个实际配置文件均被 Git 忽略，密钥不进入版本控制。

## 原则与证据

修改前查阅安装版 Next 的 `05-server-and-client-components.md`：浏览器偏好留在现有客户端 store，凭据与计费保持服务端边界；布局只引用无副作用的默认外观数据。沿用 Vercel React 的持久化 schema 与客户端边界指导，没有新增外观权威状态或修改旧存储 key。

官方来源和渠道维护步骤见 [模型注册说明](../refer/model-registry.md)。2026-10-11 实际核对官方首次调用及思考文档，没有调用真实付费接口。

- 全量代码测试：2070 项，2069 通过、0 失败、1 项原 PostgreSQL 集成环境跳过。
- 定向 React：5 文件、37 项通过，包含闪电往返、隐藏 Fast 行、保存的系列、外观重置与设置入口。
- 全量类型与定向 ESLint 通过；新增真实 SDK 请求体替身验证官方 URL/key、思考开关/强度、工具思考历史和 524 microcredits 的双倍结算。
- 隔离 Web 生产构建 `.next-perf-followup-20261011` 成功，生成 1456 页；构建后恢复 tsconfig，不覆盖开发服务输出。本次内容没有变化，沿用前一阶段内容/索引门禁；本次执行代码门禁和直接隔离 Next 编译。
- 本机浏览器确认 iOS 蓝色 token、三处命名与 DeepSeek Fast 说明/开关。截图在忽略目录 `artifacts/performance/followup-ios-appearance.png`、`followup-deepseek-fast.png`。

用户已授权完成后合并 master 与 dev；部署由用户自行完成。未执行部署、生产迁移或真实付费调用。密钥填写并重启服务后的实际官方响应仍需运行验证。
