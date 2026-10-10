# 菜单行锚定与真实模型对照 · 2026-09-13

## 本轮实现

- 桌面二级菜单锚定所选系列行，三级菜单锚定所选模型行。解除共用底部对齐；仅在视口边缘避让。父菜单滚动、尺寸变化时合并到下一帧定位。
- 自动图标改为指南针；免费/快速/多模态/旗舰/生图分别使用礼物、闪电、图层、皇冠、图片；自定义 API 标题用插头，分组用服务器图标。保留隐藏滚动条、触摸大点击区。
- 横向键盘导航与实际展开方向一致。手机仍单面板逐层进入，不套用桌面绝对定位。
- MiMo 增加 Low / Med / High 三档，默认 medium，通过标准 OpenAI reasoning_effort 下发。三档均被真实中转接受；这不等同于保证供应商对每档使用固定推理 token 数。
- 内置 relay 直接使用 @ai-sdk/openai-compatible，不再经过为自定义厂商响应保留的 reasoningNormalizer/extractReasoningMiddleware。自定义 API 仍保留原能力。
- 保留有真实证据的 Kimi 温度=1、已知不支持强制工具选择的受限处理，不追加原厂私有请求字段。
- 模型未获凭证分组授权的 404 与“URL 不存在”分开提示，保留经脱敏的具体模型名和原因。
- 旧 verify-models.ts 强制 temperature=0、max_tokens=8、仅看 HTTP 200，不能验证真实应用。现保留入口但委托给显式 --live 的 SDK 验收脚本；--strict 对未成功结果返回非零。普通测试不会自动产生真实模型用量。

## DeepSeek 对照

使用相同环境变量端点和密钥，将 DeepSeek 分别作为内置模型与自定义 OpenAI 模型：

| 场景 | 内置 | 自定义 |
| --- | --- | --- |
| 默认参数短请求 | OK / stop | OK / stop |
| low | OK / stop | OK / stop |
| medium | OK / stop | OK / stop |
| high | OK / stop | OK / stop |
| 实际聊天路由、课程上下文、SSE 消费 | 连接成功 / stop | 连接成功 / stop |

简化内置响应路径后再次运行实际路由对照，两边输入均为 15,364 token、输出 15 token，均成功。路由脚本直接调用实际 POST 处理函数，使用无用户身份的合成测试请求，未绕改生产鉴权、未写真实用户台账；不是带真实用户登录的浏览器全链路证明。

现有代码与本机环境下没有复现用户所述“内置一直失败、自定义成功”。因此不能断言之前那次截图的唯一根因，不能以猜测继续增加参数适配。当前标准调用路径已验证，若线上仍失败，应对照实际部署版本、对应环境凭证和脱敏上游错误，不应把本机测试当成线上已部署。

## 12 个内置聊天模型真实流式结果

两轮短请求测试；最终记录验证 actualModelId 等于被测模型，不把 fallback 成功当作原模型成功。

| 模型 | 结果 |
| --- | --- |
| DeepSeek V4.1 Flash | OK / stop |
| Qwen3.7 Flash | OK / stop |
| GPT-5.6 Luna | HTTP 404：not available for this group |
| MiMo V2.5 | OK / stop |
| Gemini 3.8 Flash | OK / stop |
| GLM-5.3 Flash | OK / stop |
| Qwen3.8 Flash | OK / stop |
| Muse Spark 1.3 | OK / stop |
| LongCat 2.0 | OK / stop |
| Ling 3.0 Flash Sante | OK / stop |
| GPT-5.6 Sol | HTTP 404：not supported by any configured account in this group |
| Kimi K3 | OK / stop |

Luna/Sol 保留显示；未修改中转账户权限，也未偷偷替换模型。Qwen3.7 本轮已经可调用，但不擅自改变此前约定的自动候选策略。

DeepSeek、MiMo、Kimi 均完成标准 SDK 两步流式工具往返，测试工具返回随机业务之外的合成值 VERIFIED-42；检查一次工具实际执行及最终引用该值。MiMo 首次工具提示下询问澄清、未调用，记录为失败；将明确 key=sample 的提示写清后重测实际执行一次、返回 VERIFIED-42，未改生产行为去伪造工具调用。

本轮由用户明确允许真实调用；产生少量上游用量。未向模型发送私有笔记、旧聊天记录、认证 token，日志不打印 API 密钥。

## UI 与工程验证

- 生产页面 1280×720：快速模型行 top≈479.72px，二级菜单 top≈479.71px；子菜单确实位于该行左侧。三级较高时夹取在 viewport 内。
- MiMo 详情实际显示 Low/Med/High。
- 390×844 手机：layout=drilldown、只有一列，宽 300px，left=76、right=376，无越界。浏览器错误日志为空。
- 代码测试 992/992 通过；组件 325/325 通过。首次组件测试与生产构建并行时 3 项大模块冷加载超时，构建后 4 worker 全量重跑通过，未修改测试超时或跳过测试。
- TypeScript、ESLint、Knip、密钥扫描、git diff 检查通过。
- webpack 生产构建成功，1,219 静态页面；并行时若干静态页面首次超时，框架重试后完成。
- 本地生产服务 http://localhost:35350 已运行新版本，未提交/推送/部署线上。

## 重测入口

真实模型：`node --import tsx scripts/verify-models.ts --live --strict`。

DeepSeek/MiMo 参数矩阵：`node --import tsx scripts/verify-gateway-live.ts --live --matrix --models=deepseek/deepseek-v4.1-flash,mimo-v2.5`。

工具往返：同脚本加 `--tools --models=deepseek/deepseek-v4.1-flash,mimo-v2.5,kimi-k3`。

真实聊天路由对照：`node --import tsx scripts/verify-chat-route-live.ts --live`。

本次机器可读证据位于被忽略的 tmp/gateway-matrix.json、tmp/gateway-all-final.json、tmp/gateway-tools-final.json、tmp/mimo-tools-recheck.json。
