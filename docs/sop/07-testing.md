# SOP 07 — 测试与验收

核对日期：2026-10-10。以 [package.json](../../package.json)、[运行器](../../scripts/run-unit-tests.mjs)、[Vitest 配置](../../vitest.config.ts) 和 [CI](../../.github/workflows/ci.yml) 为执行依据。

## 适用场景与输入

代码、内容、架构、框架、UI 和打包修改。输入包括当前用户范围、实际调用链、被改源码、相关领域契约、原失败/行为证据，以及与内容匹配的生成清单和索引。先读 [组织标准](../standards/code-organization.md) 与相应 Next 官方章节。

## 责任与分工

当前维护者确定范围、选择检查、修复失败并核对最终证据。如当前人类任务授权并行或子智能体，可分配独立检查；不能因为旧模板列有模型或角色就自动派遣。一个检查结果由负责者解释其覆盖和未覆盖内容。

代码测试与源码同领域、同责任目录；内容/API 集成测试集中在 `tests/`。不为凑数量、锁定刚写的内部结构或机械缩短文件增加测试。

## 运行器与命名

| 类型 | 命名 / 命令 | 覆盖 |
| --- | --- | --- |
| 纯算法、服务、存储与协议 | `*.test.ts`；`node --import tsx --test <files>` | 输入/输出、边界、失败、所有者、顺序与恢复 |
| 全量代码 node:test | `pnpm test:unit` | 发现的 `.test.ts`，排除 `tests/content/`，先编译搜索 Worker |
| React / DOM | `*.test.tsx`；`pnpm test:react` 或定向 Vitest | 控件、状态、生命周期、交互与接线 |
| 内容 | `pnpm test:content` | `tests/content/` 中的真实内容检查 |
| 静态门禁 | `pnpm typecheck`、`pnpm lint:eslint`、`pnpm lint:secrets` | 类型、依赖方向、规则与秘密扫描 |
| 未使用候选 | `pnpm lint:knip` | 候选文件/导出/依赖，真实入口核实后才能淘汰 |
| 生产构建 | `pnpm build` | prebuild 与实际 Next 生产编译/生成 |

node 运行器默认最多 4 个进程，可用 `STUDYSOLO_TEST_CONCURRENCY` 设置 1–32。独立测试不能依赖其他文件的执行顺序。`.test.tsx` 由 Vitest/jsdom 执行，不混用 node:test 的发现规则。

## 检查步骤

1. **确定行为与边界**：列出此次修改影响的消费者、动态入口和契约。状态、持久化、网络、计费、题型、资源与渲染分别检查。
2. **先作窄检查**：运行类型与受影响规则、已有行为测试；新测试覆盖缺失的真实风险。结构断言在迁移后应指向实际实现并保留契约，不能只删掉失败断言。
3. **核对失败原因**：区分代码回归、旧路径、缺失 fixture、外部条件和原有缺陷。修正测试预期必须有实际行为依据；修正代码必须说明改变的行为及范围。
4. **内容与生成物**：内容改动运行 encoding、lecture、registry、媒体/公式及对应内容检查；确认生成清单和索引的来源 hash。关键词重建不代表新增向量覆盖。
5. **实际 UI**：验证用户会使用的入口、切换、尺寸、正文与恢复。自动隐藏栏、懒加载和异步内容应按真实界面状态操作。端口、HTTP 200 或 jsdom 不能代替浏览器验收。
6. **最终候选**：变化冻结后运行适用的全量门禁和隔离生产构建。通过后只在新变化、失败或未解决疑点需要时重跑，不无理由反复全量检查。

## 关键 fixture 边界

- 代码单元测试不触发真实付费调用、生产数据库或外部提交。计费/SDK 回归使用现有 [paidAiFixture](../../tests/helpers/paidAiFixture.ts) 拦截上游并建立测试账本。
- 搜索代码测试使用小型内存/临时 fixture，不加载生产大索引或触发 embedding/COS。真实内容搜索检查另行使用匹配内容的本机索引。
- 账号/存储检查包括 owner 切换、延迟 ACK、checkpoint/CAS、完整历史和写失败。内存更新、排队和 commit 成功是不同证据。
- 数学或转换算法不能只与旧版比较；需要独立公式/契约校验。原版缺陷修复要记录行为差异，不能声称所有输出未变。
- Mock 只替换必要边界，必须提供消费者实际需要的协议；不能通过空实现或虚假“保存成功”掩盖失败。

## 构建与发布边界

开发服务运行时，验收构建使用独立 `STUDYSOLO_BUILD_DIR`，例如 `.next-perf-refactor-20261010`。临时构建目录不进入共享 tsconfig 或源码引用。

`pnpm build` 的 prebuild 涵盖搜索 Worker、内容编码、课堂/导航/媒体生成及校验、registry、索引 freshness、公式/媒体/正文规则和代码测试；构建仍需实际完成。Web 归档的 Python 安全/身份测试、内容和 React 测试按 CI 各自执行，不能只运行 build 便称全部门禁通过。

Web 与 Electron 分别有运行与打包契约。Web 生产编译不证明桌面包或真实账号/云端功能通过；部署、迁移、发布和付费验证按当前用户授权决定，记录未验范围。

## 证据与交付

记录代码提交、命令、退出码、测试总数/跳过/失败、构建目录和页面场景。原始日志和截图可放任务专用忽略目录；当前文档保留结论与可复现入口。已有流程失败或缺少证据时，保持任务未完成，不将 queued、监听或测试替身升级成真实验收。

规范与操作参考：[维护 SOP](14-project-maintenance.md)、[内容集成](05-content-integration.md)、[课堂接入](12-lecture-content-ingest.md)、[索引](10-search-index-lifecycle.md)、[渲染](../refer/rendering-architecture.md)、[存储](../refer/storage-architecture.md)、[Web 发布](../refer/studysolo-web-release.md)、[桌面打包](06-desktop-packaging-release.md)。
