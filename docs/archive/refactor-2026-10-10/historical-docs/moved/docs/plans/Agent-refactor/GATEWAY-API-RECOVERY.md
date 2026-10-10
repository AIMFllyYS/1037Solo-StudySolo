# 中转接入、API 配置恢复与菜单修正 · 2026-09-13

本记录为 STABILIZATION / AUTH-MENU-FOLLOWUP 之后的最新补充。

## 真实接入诊断

- DeepSeek 的精确中转 ID 保持 `deepseek/deepseek-v4.1-flash`。短对话、SDK 流式、完整工具目录请求均成功。随后在强制具名工具调用场景复现 HTTP 400：`Thinking mode does not support this tool_choice`。这是 OpenAI 可选参数组合限制，不是要改回厂商私有请求格式。修复后将允许工具限制到指定项，使用支持的 auto 选择。
- Kimi K3 用旧 temperature=0.6 复现 HTTP 400：`field Temperature invalid, only 1 is allowed for this model`。内置 Kimi 在模型工厂统一使用 temperature=1，清除额外思考参数，其他采样字段使用默认。工具强制具名选择同样改用限定工具列表 + auto。不再在菜单展示实际上不下发的思考强度档位。
- MiMo 原端点 `token-plan-cn.xiaomimimo.com` 返回 HTTP 401 / `Invalid API Key`，改用 api-key 头仍失败。中转站目录包含 `mimo-v2.5`，使用现有 RELAY 凭证真实请求成功。内置 MiMo 与 GLM 的 MiMo 后备候选统一走 RELAY，未修改用户的真实密钥或环境文件。
- 所有内置聊天目录以 OpenAI 兼容字段为准；调用层不再把聊天、文档、摘要等功能内写死的温度强加给内置中转。自定义 API 的原厂协议/思考适配保留。
- HTTP 400/422 从上游 JSON 的 error.message 提取受限长度的诊断原因，经过密钥、URL 等脱敏后显示；不再只显示 `AI_APICallError`。不输出请求体或完整响应。

## 真实双轮验证

使用现有中转凭证、短的非私人测试提示词、单个本地测试工具。未发送学习笔记、未读取用户登录 token。产生少量上游模型用量，未操作真实用户的额度/兑换。

| 模型 | 非流式工具循环 | 流式工具循环 |
| --- | --- | --- |
| DeepSeek V4.1 Flash | 1 次工具执行、2 步、返回 VALIDATED-42 | 1 次工具执行、2 步、finish=stop |
| Kimi K3 | 1 次工具执行、2 步、返回 VALIDATED-42 | 带必填 key 参数的工具：1 次执行、2 步、finish=stop，返回 VALIDATED-42 |
| MiMo V2.5 | 1 次工具执行、2 步、返回 VALIDATED-42 | 1 次工具执行、2 步、finish=stop |

auto 工具选择保留模型自主决策，不表示每一句问候都强制调用工具。Kimi 曾在空参数测试提示下直接回答而没有调用，未把那次记作工具验收通过；最终用实际需读取工具返回值的带参数请求验证了完整流式循环。

## 自定义 API 升级保护

原代码将配置读取、字段迁移、密钥写入包在同一个 try/catch；可选字段异常或存储写失败会返回整个默认设置。原迁移顺序还先剥离 settings 明文，再保存 secrets，存在失败丢钥风险。

本次修复：

- 兼容平铺设置、旧 {state, version} 包裹格式、旧单组 API、字符串模型列表及无效可选模型 ID；尽量保留有效分组。
- 迁移先保存密钥，成功后才改写无密钥 settings；任何写失败仍返回已读取的分组，显示明确警告。
- 原始文件无法读取时阻止默认空状态覆盖磁盘；有本机备份时可读取，显式恢复后再保存。
- 保存前保留一份最近可用备份，凭证不新增明文副本；桌面延迟密钥读取不能覆盖期间刚编辑的新值。
- 新增导入 API 配置、导出 API 配置、恢复本机备份。备份包含可恢复密钥，仅轻量混淆，不是加密；UI 明示不要上传或分享。
- 指定自定义模型却缺失分组/密钥时明确失败，不悄悄回退到平台模型。

### 用户原配置的实际核对

通过 Chrome 对当前原站点 `https://notebook2a.husteread.icu/probability/review` 进行只读 UI 核对，仍能看到 PROTOCOM-CODEX 分组及五个模型：gpt-5.6-luna、gpt-5.6-terra、gpt-5.6-sol、gpt-5.5、gpt-6-astra。没有读取或改变密钥，没有清理该站点存储。

至少这份旧配置仍在原站点；不同域名、端口及浏览器配置使用不同存储，不能从新预览地址的空列表推断原数据已经删除。本次没有自动把真实凭证跨站复制。更新应保留原域名；换地址时使用导出/导入迁移。

## UI

- 左侧展开：左指箭头放在行首、模型图标/文字之前；右侧展开则箭头在行尾。选中勾号独立，不再拿向下箭头表示横向分支。
- Kimi 详情说明使用模型默认推理配置，不再展示无效强度选项。
- 应用 DOM 的原生滚动条统一隐藏，保留 overflow:auto、滚轮、触摸和键盘滚动。未尝试修改第三方嵌入网页内部样式。
- 浏览器读取一级、二级、三级菜单的 scrollbar-width 均为 none，webkit scrollbar display 均为 none。三级面板可滚动范围 63px，实际滚动后 scrollTop≈63.33px，证明没有关闭滚动。
- 上下文面板 scrollbar-width=none、webkit display=none、overflow-y=auto。
- 隔离本地地址完成创建无密钥测试组、添加模型、刷新、从模型菜单重新找到该模型；原站点配置未触碰。导入文件→真实 store→分组/模型选择器→安全持久化另有组件联动测试。

## 验证与交付边界

- 代码测试 989/989，通过。
- React 组件测试 323/323，通过（84 个文件）。
- TypeScript、ESLint、Knip、密钥扫描、git diff 空白检查通过。
- Next.js webpack 生产构建通过，1,219 个静态页面生成。
- 本地验收服务已在原 35350 端口重启为新构建；隔离 35351 测试服务已停止。
- 没有推送/部署线上，没有改线上配置或数据库，没有自动迁走用户真实凭证。线上标签页不等于本地工作区版本。
