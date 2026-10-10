# StudySolo 系统整理执行记录

日期：2026-10-10。分支：`refactor/studysolo-2026-10-10`。起点：`b87061d487ffdad4b985c9cade2375871918a3c1`。

## 目标与授权边界

本次为用户明确要求的无人值守维护。先完成指定 UI 修复，再在功能保持不变的前提下整理整个项目的文档、职责、目录与依赖，升级当前官方稳定 Next.js。常规实现选择、必要依赖更新、本地启动、检查、浏览器验收与阶段提交自主完成。当前阶段不合并 `master` / `dev`，不部署生产、不执行生产迁移、不进行未明确额度的付费模型调用。

上级入口为仓库父目录的 [生态规范](../../../AGENTS.md)。无人值守经验参考 ChatSolo `scichat/docs/standards/unattended-execution.md`，当前人类指令优先。历史计划和交接仅供解释现状，不恢复其旧执行队列。

## 必须保留的契约

- 保留 Studio、Agent、课堂、复习、搜索、教材/题目、项目文件、连接器、云沙箱与 Electron 的已有能力与 URL。
- 不改变 Supabase / Account 身份边界、所有者 UUID、统一计费、令牌和密钥的服务端归属。
- 保留账户隔离、IndexedDB 权威数据、v3 会话分片、原子 checkpoint、CAS/恢复、完整历史与同步语义。
- 保留每批/消息最多 9 个附件、单文件 25MiB、后续消息可继续附加的现行文件契约；原件与 AI 派生上下文分离。
- 保留 Web / Electron 运行和打包分界、端口 35349、KaTeX/mhchem 单例及现有安全 HTML/媒体渲染。
- 保留用户已有交互与默认布局。新增 Fast 开关选择真实模型变体，不代替思考强度，也不绕过变体价格或权限。
- 归档失效文档和淘汰源码，不销毁历史证据；仅在确认真实调用者和动态入口后处理死代码。

## 阶段和验收

| 阶段 | 交付 | 验收 | 状态 |
| --- | --- | --- | --- |
| R0 证据与规则 | 官方 Next.js 文档快照、版本回执、源码/目录/依赖基线、维护规范 | 能复现来源与 inventory；架构规则对应真实代码 | 完成；`9b5dce1b` |
| R1 指定 UI 修复 | 滑条、Fast 系列入口、Agent 教材/项目入口、完整正文和最右树、独立面板宽度 | 定向行为测试；真实浏览器检查端点、切换、正文、学期、拖动及页面恢复 | 完成；教材原子状态覆盖回归修复并已真实复核 |
| R2 框架升级 | `next` 与 `eslint-config-next` 同步到核实的稳定版，锁文件一致 | 安装、类型、lint、测试、隔离生产构建；无 canary、无既有行为降级 | 完成；Next 16.4.0 / 类型 / lint / 测试 / 1456 页生产构建通过 |
| R3 核心职责拆分 | 过长的同步、持久化、状态、API、模型与 UI 组合拆分；拥挤目录按职责归类 | 真实调用链和导入更新；定向回归；没有新循环依赖或客户端服务端泄漏 | 进行中；先分模型契约/注册数据/自定义解析，再拆同步、持久化、状态和 API |
| R4 内容与可视化组织 | 人工数据模块、交互组件和工具目录有明确边界；可复用重复逻辑归一 | 内容/registry/媒体/公式检查；独立交互和阅读功能保留 | 待 R3 |
| R5 文档与死代码 | 失效文档归档、引用修正、README/架构/规范/SOP 更新、可确认冗余处理 | 文档链接和事实对照；Knip 逐项核实；规范能指导下一次维护 | 待 R4 |
| R6 总验收与交付 | 分阶段提交、最终报告、证据和局部阻塞清单 | 适用 CI 本地等价检查、生产构建与浏览器验收，清楚披露未验边界 | 待 R5 |

## Next.js 指导的使用方式

以 npm 官方 `latest`、官方升级说明和 App Router 文档为准。2026-10-10 核对当前项目为 `16.2.9`，稳定标签为 `16.4.0`；安装前再次核实版本和运行时要求。快照集中于 `docs/vendor/nextjs/2026-10-10/`，来源索引记录 URL、获取时间与内容哈希。

每个重构阶段记录引用的官方章节、旧职责、新模块及保留的契约。Next.js 不强制一种业务目录；保留根 `app/` 路由，只按领域职责整理 `components/`、`lib/`、`classolo/` 等已有模块，避免没有收益的整体迁址。

## 验证与证据

- 日常使用针对修改范围的检查；最终冻结后统一执行本地适用门禁，避免无理由重复全量测试。
- 代码测试区分 `node:test` 和 Vitest；网络、真实付费模型与生产数据库不进入单元测试。
- UI 用当前页面状态进行真实操作和视觉检查；端口监听、HTTP 200、接口或测试替身不代表布局通过。
- 生产构建使用 `STUDYSOLO_BUILD_DIR=.next-perf-refactor-20261010`，不覆盖现有开发服务的 `.next`。
- 原始运行日志、截图、inventory 和门禁回执放入 `docs/plans/project-refactor/verify/`（现有 gitignore 忽略）；文档只留结论和可复现命令。
- 一项外部条件失败时圈定影响、有限尝试、记录替代边界，然后继续独立任务。必需功能未完成不能把整体目标标记完成。

## 当前发现

- `master` / `dev` / 重构分支在起点完全相同；起始工作区干净。
- MiMo Pro 与 UltraSpeed 定义已存在，模型菜单和系列切换展示需要归一化，不重复注册。
- 教材窗口现有树只打开外部页面，需复用 Studio 正文渲染链并保留安全规则。
- 左栏百分比布局与 ResizeObserver 像素回写造成右面板变化时的可见晃动，需从状态所有权和布局计算修正。
- 最大人工业务文件包括 `lib/sync/engine.ts`（1324 行）、`lib/storage/chatStorage.ts`（1188 行）、`lib/stores/chat/chatHistory.ts`（966 行）；有大量 600–1000 行交互组件及混合职责 UI。
- CI 当前对 Knip 非阻断，需核实入口覆盖与真实动态消费者后处理存量，不以忽略问题制造通过。
- 初始清点记录 2049 个源码/测试文件、1429 个人工源码文件，超过 500 行的 73 个、超过 800 行的 15 个。排除类型与延迟导入后，即时运行时循环为聊天渲染/工具卡片间 3 条路径。
- `node_modules/next/dist/docs/` 实际存在，后续阶段优先结合安装版本的章节，并用官方快照核对升级目标。
- 真实 IAB 端测在 `/agent` 内读取医学细胞生物学第一节完整正文；Fast 开关切换真实 UltraSpeed 展示且保留 High；左右实际拖动和右栏开合后尺寸独立，资产页返回尺寸恢复。
- IAB 和已有 Edge 本地页面均为访客态，未进行真实账号项目文件操作或 UltraSpeed 付费上游请求；不能把入口/定向测试当作这两条链路的实测。
- R1 初轮定向检查：10 个 React 文件 47 项通过、4 项 node 布局迁移测试通过。教材同事件合并与真实树回归后，2 个教材文件 9 项通过；最新全量 TypeScript、受影响 ESLint 与 diff 检查通过。
- 最终实际教材复核：一次点击第一章可展开到第一节，选中第一节后右栏收起/展开仍保留正文和父目录展开，左右宽度仍为 290/619；空态“项目文件”打开原有“先选一个项目”对话框。
- R1 截图：`project-refactor/verify/agent-textbook-desktop.jpg` 和 `project-refactor/verify/model-fast-desktop.jpg`。截图和原始验收日志仅在本地忽略目录保存。
- R2：安装后的 Next 与 ESLint 配套均为 16.4.0；React 19.2.7 满足该版本 peer 范围，沿用已有版本。稳定版手工升级，现有 proxy、异步请求 API 与 ESLint CLI 已符合官方迁移说明。
- R2 全量 React：298 文件 / 1226 项通过。代码 node 初轮暴露两个锁定旧实现的结构断言，按真实新契约改为接线/独立尺寸行为检查；生产 prebuild 最终 2038 项、2037 通过、1 跳过、0 失败。全量 ESLint 0 error / 24 个存量 warning；最终 TypeScript 通过。
- R2 隔离生产构建：`.next-perf-refactor-20261010` 编译成功，4 个 worker 完成 1456/1456 静态页；构建自动添加的临时 tsconfig include 已移除，源配置不携带本机验收路径。
- 本机原静态生成 worker 默认 31 个；Next 配置上限改为 4。node 测试默认最多 4 个进程，可用 `STUDYSOLO_TEST_CONCURRENCY` 设置 1–32。这是构建/验证资源管理，不是未测量的运行性能提升声明。
- 旧索引内容 hash 过期，原件备份在 `.local-archive/refactor-index-20261010-before-upgrade/`。离线关键词重建保留 45784/48321 已有向量；2537 个新增块只有关键词召回，未付费补向量。深 content hash 校验通过，备份 manifest hash 一致。
- Next 依赖更换导致旧开发进程退出，已通过现有 RootSolo 的本机 API 仅恢复 studysolo-web；实际 Next 16.4.0 HTTP /agent 200、浏览器完成水合。一次配置自动重启期间旧 IAB 进入连接错误页，新临时页已正常访问，未修改浏览器或系统安全设置。
- R3a 模型模块：按官方 project structure 和 server/client 边界的领域分组原则，将 996 行入口拆为 contracts / aliases / catalog / thinking / selection / custom，最大模块 475 行；公共入口用显式 re-export 保留 Node/tsx 命名导入兼容。原始模型、旧别名和菜单分组序列化结果逐字节一致；73 项模型/供应商 node 检查、20 项 React 模型菜单/Fast/设置检查、类型及定向 lint 通过。
- R3b 同步：将 1324 行 engine 拆为 740 行左右的协议/队列所有者、283 行 Zustand/持久化 adapter、载荷转换、额度快照、远端应用和共享 ownership。远端应用只通过 live stores getter、dirty 判断、基线读取与 merge 通知取得执行策略，不反向依赖 engine；保留原账户 epoch、CAS、待提交删除、冲突副本、额度与重试规则。44 项 node 同步检查、4 项版本/journal React 检查、全量类型和定向 lint 通过。
- R3c 聊天存储：1188 行混合文件拆为纯协议/键、manifest、Blob、legacy migration、保守 GC 和 619 行 session checkpoint engine；原公开函数、key、checkpoint 注入对象、写队列与恢复规则保留。ChatSession/窗口 DTO 移到 `lib/chat/sessionTypes.ts`，store 继续转出旧类型入口。64 项存储/历史/同步 node 检查、20 项来源/owner/导出 React 检查、全量类型、定向 lint、Node ESM 命名导入及 checkpoint seam 检查通过。
- R3d 历史 store：966 行原 store（DTO 提取后约 930 行）拆为 135 行组合/账户生命周期入口、完整类型、manifest 门控、window residency，以及窗口/会话/消息/项目四组 action，最大子模块 178 行。维持同一 set/get、所有者重置、lease 和资源预算。58 项相关 node 检查、35 项 owner/传输/来源/导出 React 检查、全量类型和定向 lint 通过。传输测试本来模拟 IndexedDB 可用，补齐其直接 Blob checkpoint 的 setItemNow 模拟，避免未登录测试环境抛出未处理写失败；真实存储失败规则未改写。
- R3e 设置：856 行设置 store 拆为约 60 行组合/水合入口、纯类型/default、305 行独立持久化/密钥生命周期，以及 API 分组与偏好动作。IO 通过注入 raw setter 和 hydrate 回调报告失败，不反向依赖 store；原 key、恢复保护、秘密编解码、desktop bridge 和加性水合规则不变。15 项配置/密钥 node 检查、30 项水合/持久化/模型/Fast React 检查、全量类型及定向 lint 通过。
- R3f 复习 API：678 行 progress 路由拆为 4 行 Next 适配器与 server 域的认证、限制、schema、快照/评分、repository、错误映射和 GET/POST handler；最大模块约 210 行。结合官方 Route Handler 与 server/client 边界文档，保留 runtime/dynamic、origin、Account owner、请求/响应限额、静态题库一致性、幂等/CAS 和 desktop bridge。11 项 API 行为回归、全量类型、定向 lint 和 diff 检查通过。
- R3g 复习客户端同步：766 行文件拆为 425 行队列/调度/恢复/账户入口，以及 HTTP、attempt 转换、checkpoint、事件、成绩投影和主动 legacy 导入，最大子模块 141 行。保持 CAS ACK 不回退新答案、分页不完整状态、幂等、冲突恢复及旧无归属历史必须人工触发导入。7 项相关行为检查、全量类型、定向 lint 和 diff 检查通过。

- R3h 内容与轨迹：645 行 content loader 拆为导航、受保护 IO、正文、例题、题库、搜索与纯类型，保持正文回退、Unicode 例题路径、安全路径和静态资源 tracing 注释。29 项内容/API 检查、37 项轨迹/消息 React 检查、全量类型与定向 lint 通过。通用轨迹展示接受可选 StepDetail，内联工具面板不再加载专业卡片注册表；专业工具消息保留原细节。Git 已跟踪源码重新清点确认即时运行时循环从 3 降为 0，超过 800 行文件从 15 降为 10（统计不代表完整功能验收）。采用安装版 Next Route Handler、project structure 与 server/client 文档的窄入口和领域分组原则。
- R3i 聊天 API 与请求校验：Next 入口保留 nodejs/force-dynamic 和付费包装的 POST；消息压缩/回灌与请求门控、顺序生成流程、纯输入契约分开。生成流程保持原取消、工具续写、Local continuation、usage settlement 与 finish 排序。555 行 Zod 文件拆出共享限额/小 schema、聊天、卫星请求、安全错误和 parser，原公共 API、默认值、字节/附件限制不变。60 项聊天 SDK/额度/请求/上下文/供应商检查、全量类型、定向 lint 通过；测试上游全部为拦截 fixture，没有真实付费调用。结构断言转到新的实际实现位置，未删掉原断言。

- R3j 复习出题与题目 UI：521 行 quiz API 拆出有界请求、实时所有者、原错题、课程/课堂材料、预算 prompt 与付费 handler，6 项 API 回归通过。955 行 QuizQuestion 拆为约 100 行组合入口和明确展示/作答职责，最大子文件约 325 行，保留 ssr:false 的视频延迟加载；11 项既有题目/解释/进度/Agent UI 回归与新增 8 项九种题型答案行为检查通过，全量类型和定向 lint 通过。新增测试按真实“正确 √ / 错误 ×”标签以及单行 input 行为修正了测试预期，运行代码未因此改动。

- R3k UI 目录：128 个实现/测试文件按 composer、messages、trace、sources、products、attachments、billing、floating、navigation、mobile、settings 迁移；137 个调用者/替身/路径更新，延迟入口和相邻相对导入同时改到真实模块，未建立成批转发。chat/layout 根人工组件分别降至 10/12 个。全量类型通过，React 299 文件/1234 项通过，ESLint 0 error/23 warning。代码全量 2038 项初轮 2032 通过、1 跳过、5 个结构检查仍读旧路径；两个涉及 R3 存储拆分，其余为迁移路径，保留断言并指向真实实现后相关 16 项全部通过。最终冻结后仍需全量重跑。真实 Agent 重新打开医学细胞生物学第一节正文成功，截图 `project-refactor/verify/agent-textbook-after-directory-move.jpg`；访客未进行付费对话或私有文件操作。React 注册兜底迁到 components/content，沿用原行为并修正 lib/UI 边界；lint 的 chat 限制扩大到子目录，避免迁移使规则失效。

- R3l 状态/hooks/内容目录：143 个实现/测试/元数据文件迁移，374 个真实静态/动态/测试消费者更新；21 个 deprecated 单行 hook 转发原件归档为 txt，所有仓库导入改用同一 store 实例，没有另建状态或改持久化 key。hooks 根目录不再堆平铺运行文件，stores/content-data 根目录均低于 30 个运行文件。迁移前 Git 元数据重建的 contentTree 序列化与新树逐字节相同；registry 0 error/94 存量 warning。全量代码 2040 项、2039 通过、1 跳过、0 失败，React 299 文件/1234 项全部通过。迁移让原来直接访问产物 store 的全局 Agent picker 被 notes 边界规则正确识别；将 picker 归到 agent 域，沿用全局窗口层及延迟加载，7 项窗口放置检查与全量 ESLint 0 error/23 warning 通过。独立 Knip 完整入口审计已包含 classolo、Worker 和沙箱脚本，输出 44 个候选文件、134 个导出和 55 个类型待逐项核实；这些不是删除清单。

## 局部阻塞


尚无已确认的整体阻塞。后续按任务、症状、证据、尝试、影响、替代及恢复条件记录。

## 续接检查点

已完成 R0/R1/R2 与 R3a–R3g，当前提交 `35df9920` 已同步至同名云端重构分支，工作区干净，整体 Goal 仍 active。不要将这份阶段记录解释为全项目重构完成。

下一阶段仍需：

1. 拆分 content loader、其余复习/聊天 API、长 UI 组合及题型/设置展示等实际混合职责文件。
2. 整理拥挤的 chat/layout/hooks/stores/content-data 目录，更新真实 import、动态入口和测试引用；处理聊天渲染/工具卡片的 3 条初始即时循环。
3. 完成剩余长人工交互文件审查，区分数学/绘图/控制和纯目录数据，保持精度、交互及注册功能。
4. 核实 Knip 的 classolo/worker/CLI/skill-pack 入口后清理可确认死代码；不得依据初轮 false positive 删除实际依赖。
5. 归档旧执行队列/过时说明，重写 docs 总入口，更新 README、rendering/storage/extension 与测试/维护 SOP；文档断链初轮 34 项需分类修正。
6. 最终候选统一运行适用 gate、全量类型/lint/代码/内容/React 与隔离生产构建，并复核实际浏览器与既有交互；报告真实账号、付费请求及向量新增覆盖的未验边界。

代码职责和原始算法已经分离，R3a–R3g 的定向结果不替代最终全量验收。RootSolo 当前服务是 studysolo-web / 35349、Next 16.4.0；使用时重新核对实时健康，不盲目重复启动。
