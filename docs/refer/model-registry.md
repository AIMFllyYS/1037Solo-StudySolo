# 模型注册、思考与 Fast 维护

核对日期：2026-10-10。此文说明代码的维护入口；模型是否可用、实际端点、价格和权限以当前服务端配置、注册数据和真实请求结果为准。旧价格调研和供应商顺序快照不作为当前计费或路由依据。

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
| `lib/ai/fastModeRegistry.ts` | 普通/快速变体配对与菜单系列代表 |
| `lib/ai/provider.ts`、`sdk/languageModel.ts` | 实际供应商、凭据来源、协议、超时、参数和备用端点 |
| `lib/ai/autoRoute.ts` | 自动选择的候选及规则 |
| `lib/billing/` | 准入、真实落地模型、计费池与结算 |

客户端菜单与设置从模型/展示契约读取，不导入服务端工具定义、凭据或文件 IO。价格标签不是实际计费权威；计费必须沿用实际供应商落地及 usage ledger 的路径，不能通过切换模型规避权限或费用。

## 新增或调整内置模型

1. 在 catalog 维护 ID、显示名、能力、上下文、协议与思考支持。变更能力和价格前核对官方来源及实际供应商配置，记录时间，不能用旧调研覆盖现状。
2. 确认 provider 与 SDK 能解释该模型 ID、思考方言、工具/视觉/生图能力和超时。仅改菜单行不能建立真实上游能力。
3. 旧 ID 通过 aliases 兼容；用户自定义模型通过 custom 解析，保留其高级协议配置和按请求筛选分组的行为。
4. 自动候选、备用端点、工具准入和计费池仍按各自策略检查，不把一个能力字段扩张成任意降级许可。
5. 运行相应模型/供应商/SDK 行为测试与菜单/设置测试。没有真实请求证据时只报告配置和本机行为通过。

## Fast 系列

当前 `FAST_MODE_PAIRS` 配对：`mimo-v2.6-pro` ↔ `xiaomi/mimo-v2.6-pro-ultraspeed`。两个 ID 都已经存在于 catalog。

列表使用普通模型代表系列；闪电切换的是实际选择的模型 ID。思考强度另行保存，并按目标模型支持的档位收敛。没有配对的模型不能启用闪电；增加新系列时先确保两个真实注册 ID、能力、端点及计费可用，再登记配对。

验证入口：`lib/ai/fastModeRegistry.test.tsx`、`components/chat/composer/ModelMenu.test.tsx`、思考设置与 provider/SDK 的相应测试。不得为加入一个 Fast 变体重复增加普通模型，也不得让显示标签与请求 ID 不一致。

## 维护证据

官方 Next 指导见 [快照入口](../vendor/nextjs/2026-10-10/README.md)，模块分组和客户端/服务端依赖见 [代码组织标准](../standards/code-organization.md)。测试分层见 [SOP 07](../sop/07-testing.md)。本轮模型拆分、注册数据比较与真实菜单验收记录在 [系统整理记录](../plans/2026-10-10-project-refactor-execution.md)。
