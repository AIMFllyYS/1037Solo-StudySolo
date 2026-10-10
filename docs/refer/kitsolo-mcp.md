# KitSolo 原生 MCP 插件

更新：2026-10-03。

插件市场的 KitSolo 条目提供原生关联按钮。点击后打开授权窗口，复用统一账号登录，在 KitSolo 确认工具范围；回到 StudySolo，下一轮主 Agent 对话自动提供 `kitSolo` 工具。查询关联状态可刷新安装提示。需要取消时去 KitSolo `/connect/` 撤销。其他市场 MCP 条目继续使用外部宿主配置流程。

`kitSolo` 接受 `action=search/open/call`。先按任务检索，读取返回的 `aiCallable/mcpName/inputSchema`；可执行时按 schema 调用，需本地文件或画布时返回工作台入口。能力从 KitSolo 远端注册表读取，新增工具无需重复修改 StudySolo。结果卡支持原始计算结果、复制与打开工作台。此工具属于已有 Agent 和计费链，没有额外模型请求。

实现路径：`lib/ai/agent/tools/kitSolo/`、`components/chat/toolCards/kitSoloCard.tsx`、`app/api/kitsolo/`、`components/plugins/KitSoloConnectButton.tsx`。展示文案进入现有中英文 trace 词典；工具开关进入现有设置注册表。只在已关联的主 Agent 对话启用，不在笔记窗和生图模式挂载。

调用身份来自服务端校验后的 Account 用户。HttpOnly `kitsolo_connected_studysolo` 仅是减少未安装用户远程查询的提示，不授予权限；KitSolo 在每轮交换中重新检查 Account UUID 与有效关联。专用 token 不进入请求 JSON、浏览器 JS、聊天历史或 localStorage；客户端使用 initialize → initialized notification → tools/call 生命周期。

服务端设置 `KITSOLO_URL`；前端还支持 `NEXT_PUBLIC_KITSOLO_URL`。生产默认 `https://kitsolo.1037solo.com`，开发默认 `http://localhost:3038`。默认回调 `/api/kitsolo/callback/`（开发 35349，生产 studysolo.1037solo.com）。Electron 的额外域名需要先在 KitSolo 的客户端白名单中登记，不自动信任任意桌面回调。

镜像客户端源文件由 KitSolo 仓库的 integrations 与其同步脚本维护。协议、配置、存储和测试边界详见 [KitSolo 接入合同](../../../1037Solo-KitSolo/docs/MCP-INTEGRATION.md)；该同步脚本属于 KitSolo 仓库。
