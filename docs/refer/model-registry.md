# 模型注册、思考与 Fast 维护

核对日期：2026-10-11。此文说明代码的维护入口；模型是否可用、实际端点、价格和权限以当前服务端配置、注册数据和真实请求结果为准。旧价格调研和供应商顺序快照不作为当前计费或路由依据。

## 单一入口与职责

| 位置 | 负责 |
| --- | --- |
| `lib/ai/models.ts` | 显式公共导出，保留 Node/tsx 的命名导入契约 |
| `models/contracts.ts` | 模型、自定义 API、协议和思考类型 |
| `models/catalog.ts` | 内置模型注册数据与查找 |
| `models/aliases.ts` | 旧 ID 兼容 |
| `models/thinking.ts` | 模型支持的思考档位和映射 |
| `models/selection.ts` | 菜单分组与选择策略 |
| `models/custom.ts` | 用户自定义分组与模型解析 |
| `lib/ai/models/selection/fastModeRegistry.ts` | 普通/快速变体配对与菜单系列代表 |
| `lib/ai/provider.ts`、`sdk/languageModel.ts` | 实际供应商、凭据来源、协议、超时、参数和备用端点 |
| `lib/ai/autoRoute.ts` | 自动选择的候选及规则 |
| `lib/billing/` | 准入、真实落地模型、计费池与结算 |

客户端菜单与设置从模型/展示契约读取，不导入服务端工具定义、凭据或文件 IO。价格标签不是实际计费权威；计费必须沿用实际供应商落地及 usage ledger 的路径，不能通过切换模型规避权限或费用。

provider 公共入口显式转出 `provider/` 的类型、credentials、protocol、reasoning、builtin、text 和 image。原来加载时读取的环境常量仍只在模块加载时读取，原函数中的实时环境读取不改成缓存；其中的端点和凭据模块仍为服务端能力，不因拆文件成为客户端配置源。

## 新增或调整内置模型

1. 在 catalog 维护 ID、显示名、能力、上下文、协议与思考支持。变更能力和价格前核对官方来源及实际供应商配置，记录时间，不能用旧调研覆盖现状。
2. 确认 provider 与 SDK 能解释该模型 ID、思考方言、工具/视觉/生图能力和超时。仅改菜单行不能建立真实上游能力。
3. 旧 ID 通过 aliases 兼容；用户自定义模型通过 custom 解析，保留其高级协议配置和按请求筛选分组的行为。
4. 自动候选、备用端点、工具准入和计费池仍按各自策略检查，不把一个能力字段扩张成任意降级许可。
5. 运行相应模型/供应商/SDK 行为测试与菜单/设置测试。没有真实请求证据时只报告配置和本机行为通过。

## Fast 系列

当前 `FAST_MODE_PAIRS` 配对：

- `mimo-v2.6-pro` ↔ `xiaomi/mimo-v2.6-pro-ultraspeed`。
- `deepseek/deepseek-v4.1-flash` ↔ `deepseek/deepseek-v4.1-flash-fast`。

DeepSeek Fast 是平台的官方直连通道：上游固定为 `https://api.deepseek.com/v1/chat/completions`、模型名 `deepseek-flash`，凭据只读取服务端 `DEEPSEEK_API_KEY`，没有七牛/中转备用跳。普通模式仍沿用原渠道。Fast 不额外发送未经官方声明的加速参数，不表示官方提供独立 Fast SKU 或保证延迟。

按 2026-10-11 用户指定的平台政策，Fast 单价为普通模式的 2 倍：输入 ¥4、缓存命中 ¥0.08、输出 ¥16 / 百万 token。展示数据在 catalog，服务端预留/结算的可信渠道价格在 `lib/billing/pricing/trusted-tariffs.json` 的 `deepseek:deepseek-flash`；这是平台费率，`supplierQuoteVerified=false`，不是官方供应商报价。两层由回归测试核对，实际结算仍以返回 usage 为准。BYOK 沿用现有独立基础费率。

官方依据（2026-10-11 核对）：[首次调用](https://api-docs.deepseek.com/)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)。思考默认开启，因此关闭时必须发送 `thinking.type=disabled`；开启时发送 `enabled` 与合法的 `reasoning_effort`（SDK 选项用 `reasoningEffort`）。工具循环保留历史 `reasoning_content`。本地 `.env.local`、生产配置 `.env.production` 和模板已预留 `DEEPSEEK_API_KEY`；真实密钥不进 Git，填好后重启对应服务生效。

列表使用普通模型代表系列；闪电切换的是实际选择的模型 ID。思考强度另行保存，并按目标模型支持的档位收敛。没有配对的模型不能启用闪电；增加新系列时先确保两个真实注册 ID、能力、端点及计费可用，再登记配对。

验证入口：`lib/ai/models/selection/fastModeRegistry.test.tsx`、`components/chat/composer/ModelMenu.test.tsx`、思考设置与 provider/SDK 的相应测试。不得为加入一个 Fast 变体重复增加普通模型，也不得让显示标签与请求 ID 不一致。

## 选择器交互与动画

输入器点击模型胶囊后，只打开紧凑的思考面板：强度标签、品牌 SVG/模型名、Fast、重置与滑杆。点击模型名时保持底部锚点，以实测高度向上展开分类，内容从下向上进入；不用 FLIP 缩放反转展开方向。桌面移动鼠标到分类上才展开模型列表，避免静止指针意外触发下一级。三级列表默认按内容收紧，没有预览占位；悬停/键盘聚焦模型时在该行下方展开小详情卡，展示介绍、能力、价格和厂商训练说明。预览不改变选择，能力 SVG 紧跟名称排列。

桌面一级/二级宽 320px，三级宽 352px；窄屏、触控设备或两侧放不下三级时，使用单面板逐层进入/返回。手机先点击模型查看详情，再点击「选用此模型」。定位与可见视口处理在 `components/chat/composer/modelMenu/useMenuPosition.ts`，分类与列表展示在 `ModelPickerPanels.tsx`；主入口持有唯一选择/层级状态。

滑杆保留原生 range 的键盘与读屏语义，指针捕获提供连续拖动、边界限制和释放后档位吸附。共享 `lib/motion.ts` 的 `LAYOUT_REFLOW`、`scaleInVariants`、`fadeInUpVariants`、`AnimatedCollapse` 组件与 `useUiReducedMotion` 控制面板、行内详情、滑块和 Fast 动画。独立样式在 `app/styles/model-picker.css`；轨道 30px、滑块 26px，最左端填充宽度为零。

Ask/Full（询问/完全同意）的本机偏好与输入框是否可发送分开控制，访客或会话门控不禁用偏好入口，登录与发送校验保持原契约。窄栏复用同一组选项，三个点触发器为透明圆形按钮，弹出内容纵向排列。

交互验收涵盖先后层级、原地锚点、悬停不选用、Fast 配对、强制思考、指针取消、Esc/焦点恢复、手机预览确认与逐级返回。手机触控硬件手感与浏览器窄屏模拟是不同证据。

## 维护依据

官方 Next 指导见 [快照入口](../vendor/nextjs/2026-10-10/README.md)，模块分组和客户端/服务端依赖见 [代码组织标准](../standards/code-organization.md)。测试分层见 [SOP 07](../sop/07-testing.md)。本轮模型拆分、注册数据比较与真实菜单验收记录在 [系统整理记录](../plans/2026-10-10-project-refactor-execution.md)。
