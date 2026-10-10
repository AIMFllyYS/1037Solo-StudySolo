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
| R3 核心职责拆分 | 过长的同步、持久化、状态、API、模型与 UI 组合拆分；拥挤目录按职责归类 | 真实调用链和导入更新；定向回归；没有新循环依赖或客户端服务端泄漏 | 完成；唯一 store/queue/CAS 及两处连续引擎职责保留，R6 已通过 |
| R4 内容与可视化组织 | 人工数据模块、交互组件和工具目录有明确边界；可复用重复逻辑归一 | 内容/registry/媒体/公式检查；独立交互和阅读功能保留 | 完成；33 个长交互、教材/注册数据和生成链已分层，R6 已通过 |
| R5 文档与死代码 | 失效文档归档、引用修正、README/架构/规范/SOP 更新、可确认冗余处理 | 文档链接和事实对照；Knip 逐项核实；规范能指导下一次维护 | 完成；历史/原件/符号决定和当前参考/SOP 已核对，R6 已通过 |
| R6 总验收与交付 | 分阶段提交、最终报告、证据和局部阻塞清单 | 适用 CI 本地等价检查、生产构建与浏览器验收，清楚披露未验边界 | 完成；完整门禁、隔离 Web、Windows 包/包内服务与实际访客 UI 通过，原生窗口/DPAPI/真实账户付费/生产按边界保留 |

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

- R3l 提交后实际复核：重新加载 Agent，按学科/教材/章节/小节选择医学细胞生物学第一节，article 正文 2470 字符、3 个原正文标题、内部 tablist 为 0，截图 `project-refactor/verify/agent-textbook-after-state-move.jpg`。最后全量 TypeScript 再次通过。当前真实账号操作和付费调用未验范围沿用前述边界。

- R4a 概率交互：六个 873–999 行入口拆为 321–413 行本机状态/视图组合，数学模型、图形、控件、推导、CDF 场景/拖动及边缘分布反例分别负责一层。共享 6 组 token 相同的数值算法覆盖 11 个消费者，几何尺寸与不同近似方式不混合。以安装版 Next use-client/project structure 文档维持原客户端入口和 registry 延迟加载。修复前 906 组数值输出与旧版完全一致；独立公式测试发现旧 χ² 连分式的系数/倒数错误及大自由度 Gamma 溢出，针对修复后 824 组继续相同，82 组 χ² 结果按正确公式改变，不把这部分冒充“全部结果未变”。6 项独立数学检查、11 项 UI 回归、类型和定向 lint 通过；实际教材页通过可交互 Tab 显示正态 CDF=0.5000、方差检验 n=3/df=2 的双侧临界值 0.051 / 7.378。原图形与参数交互保留，具体数值修复及官方数学来源见 [验收记录](../analysis/2026-10-10-probability-refactor-validation.md)。

- R5a 文档入口：中英文 README、docs 总索引与 plans 索引已按源码重写；Next 16.4.0、实际路由/目录/命令、账号与文件契约和当前任务入口一致，旧 handoff/loop 不再被声明成当前任务权威。四份旧入口逐字节归档并记录 SHA256，归档说明与原件分别放置，写入新入口前核对原件和当前源，保留历史内容。五个当前入口（含 architecture）的本地链接均有效；全 docs 检查仍有 48 项缺失，主要是旧审计的对话 UUID、旧路径、未入库验收附件和示例占位链接，尚需分类归档/修正，不宣称全站链接通过。

- R5b 文档归档与 SOP：72 份旧 handoff/Agent loop/日期审计/右栏计划迁入带来源路径的历史归档，测试/存储/归档索引另存 3 份原文快照；先提供当前 model-registry，再改 Fast 注册表唯一活源码维护注释，不恢复旧任务。重写测试 SOP 和实际 owner/v3 checkpoint/storage 参考，增加项目维护 SOP；旧无归属历史、所有者、失败/恢复与完整历史规则按源码核对。Markdown 检查改为实际 AST 解析，3 项测试覆盖 code 示例/引用/图片/括号转义；当前 74 份活文档、316 个本地链接、0 缺失。归档正文与缺失旧附件没有伪造或批量回改，静态链接通过不等于全篇事实审查完成。

- R5c 已确认未使用源码：正式 Knip 包含 Next proxy/instrumentation、Classolo、实际 CLI、Worker、Electron CJS 和沙箱技能脚本；server-only 按安装版 Next 官方“内部处理、安装可选”说明保留，云模板中的 Playwright 和媒体 ffmpeg 按独立运行环境解释，不混进 app 依赖。37 个已退出运行的 Classolo/OTP/旧构建/旧目录生成 DSL 原件保存为 txt；清点确认集合外静态/类型/延迟导入为 0，并核对了当前课堂 settings、ASR REST factory、公开 session/渲染入口。readLocalFile 重复内联 metadata 改为引用原 presentation 模块。删除无实际消费者的 class-variance-authority / sonner 两个直接依赖，锁文件仅对应移除。全量代码 2049 项/2048 通过/1 原跳过/0 失败，React 300 文件/1245 项通过，全量类型通过、ESLint 0 error/21 warning。Knip 文件/依赖/unlisted/binary 候选均为 0，但仍报告 137 个值导出、55 个类型，包含公共 façade/协议和待继续核实项，未伪称完整 Knip 通过。

- R3m 设置与闪卡长 UI：GlobalSettings 的成绩分组/路由转换、卡片、定位、成绩视图独立，账户/清空确认/分区和 popover 仍由一个入口负责；RecordPreviewWindow 的模式、原文/思考、修订、菜单与动作独立，流式/取消/保存处理仍在同一个窗口入口。18 项设置/手机/闪卡 React 回归、12 项处理/菜单/账户/动画 node 检查、全量类型与定向 lint 通过。位置和菜单结构检查指向新实际实现，原断言保留。实际 Agent 打开设置→成绩，空态及禁用清空正常，截图 `project-refactor/verify/global-settings-after-split.jpg`；未对真实成绩执行清空或触发付费闪卡生成。

- R3n 外壳与输入器：AppShell 拆出 TopBar 与连续的 useShellLifecycle，主入口约 447 行，保留分栏 ref/像素偏好/回写门控和原 dynamic 声明；一次挂载依然只有一个窗口会话 provider，卸载清理、模式动画取消和移动深链均沿用原逻辑。ChatInput 拆出模型覆盖、geometry/focus、单实例 session 队列、props/limits、toolbar/queue/quote，主入口约 494 行；草稿/附件/palette/发送停止门控仍在同一个控制器。采用安装版 Next server/client/use-client 与 Vercel React bundle-dynamic-imports/client-event-listeners 原则，没有新装 SWR 或声称未测量性能。类型、定向 lint、27 项 React、30 项 node 通过，新增 queue 跨会话/就绪门控和 shell 生命周期用例。实际左右分别调整时另一列值不变，恢复 290/619；资产管理路由沿用右栏收起（可见值 0），返回 Agent 恢复 619。截图 `project-refactor/verify/agent-shell-after-lifecycle-split.jpg`。

- R3o 复习/用量面板与服务：ReviewQuizPane 约 493 行、TokenDashboard 约 459 行；DTO、逐题 runner、有界 source payload、展示/估算格式、分类/行和 cache countdown 独立。13 项 node、5 项 React 与类型/lint 通过，新增 UTF-8 整题省略/去重/计数、成本展示和计时器到期/卸载用例。provider 公共 API 显式保留，拆为 contracts/credentials/protocol/reasoning/builtin/text/image；原环境常量与实时读取、用户覆盖、安全 URL、端点/超时/计费语义不变，84 项 provider/SDK/额度检查通过。迁移工具分文件/SQL分析/执行/目录比较/传输与类型，三段 SQL initializer 与原表达式完全相同，12 项 MemoryExecutor 迁移检查通过，未执行真实 SQL。Electron 密钥 IO 独立为注入式 keyStorage，保留文件名、原加密/回退、记录清理和文件权限逻辑；3 项临时目录/模拟 safeStorage 检查通过，IPC sender 检查、固定端口和主进程生命周期保留。打包 glob 排除新测试；本阶段没有启动桌面进程，OS DPAPI 和最终包验收仍属最终边界。

- R3p 学习记录与余下组合 UI：quiz-progress 显式 API 分出纯契约/key、IO、主动 legacy 导入、唯一事件/version 注册、成绩转换与记录/指标；learning/quiz 保留单一 store，评分、身份、会话投影和注入式 checkpoint 各自负责一层，原所有者/修订检查与延迟 ACK 行为保留。userNotes 保留一个持久化 store 与账户/节流刷新生命周期，选择器、窗口几何和契约独立。ModelMenu 分出主题分类/特征 metadata 与详情/品牌展示；ImageGenViewer 分出原加载动画；反馈 HTTP 校验、弹窗展示与原因模型独立，原 controller 仍拥有所有者、取消、修订与焦点恢复；Agent 项目行展示和纯运行徽标聚合独立。采用安装版 Next use-client/project structure 的客户端入口、纯模型和真实领域目录原则。68 项 node、64 项 React（含做题 8、笔记窗口 16、菜单/图片/侧栏/反馈 40）、全量类型与定向 ESLint 通过；反馈首轮暴露一个遗漏导入，补齐后 7 项反馈全部通过。没有向真实反馈接口提交用户数据，也没有触发生图付费请求；最终实际页面与统一全量门禁仍待后续。

- R4b 剩余长交互：26 个概率交互和一个化学构型练习拆为数学领域、图形/几何、控件、展示配置、说明和单一状态入口；原 registry/dynamic/ssr:false 保持。数学按 foundations/distributions/joint/moments/limits/sampling/estimation/testing 分组，避免新增平铺目录。初次源码对照 27 入口/698 声明的所有公式、类型与 JSX token 相同；其后 MLE 原 SVG 逐字迁移为 typed LikelihoodPlot，保留原 state/ref/鼠标触摸；独立数学检查发现旧协方差特征向量坐标错误，已修正并单独记录影响，未把数值变化冒充结构等价。13 项数学性质、39 项 React、全量类型、定向 ESLint 和文档链接通过；真实协方差滑杆更新轴向量/角度，真实 MLE 输入 1,1,1,1 得到估计 1.0000，点击图后原游标更新为 2.3450。截图 covariance-corrected-axis.png、likelihood-after-plot-split.png；详情见概率验收文档。最新静态清点 2307 源码/测试、1672 人工源码、13 个 >500、2 个 >800，即时循环 0；长度统计不是最终功能门禁。

- R4c 教材/交互目录与生成链：五份长目录按连续章节主题拆分，原导出入口只组合同学科 textbook/detail 数据；完整 contentTree JSON 254101 字节与前版完全相同。53 个交互注册项按概率/化学两份现有数据分组，原 registry 保留唯一检查与查询，types 独立；所有字段/顺序/规范化动态路径与前版一致，lazy 目标存在。发现教材接入及 NUL 清理脚本仍指向早期平铺路径，修正到 subjects/<subject>/；目录 writer 与分组规则独立，接入 CLI 复用同一 writer，四个生成教材学科再生成仍保持当前分组，其余学科输出到当前学科目录。3 项 Python 临时目录检查、41 项 React（含查询 2）、注册 0 error/94 原 warning、完整类型、定向 ESLint 通过；未运行会替换正文的真实 ingest。同步更新 subject-onboarding 和 framework-extension 的目录/维护入口，不把旧脚本说明当作当前规则。

- R3q 聊天领域目录：80 个实现/测试文件迁入 request/streaming/messages/sources/attachments/composer/feedback/session，147 个真实消费者与结构路径更新；根目录只留 sendMessage 组合和 sessionTypes 契约，既有显式公共 API 保留，没有成批转发。完整 React 304 文件/1280 项通过；完整 node 2064 项初轮 2062 通过、1 原跳过、1 结构失败：旧断言要求 RecordPreviewWindow 直接导入 AnchoredMenu，而 R3m 已由其 PreviewMoreMenu 负责；保留原断言并检查 root import/render 接线后相关 13 项全部通过。类型首轮命中忽略 tmp 中的本轮旧反馈源码备份，将该原件改为 txt 保留后完整类型通过；没有忽略或删除运行文件来逃避类型问题。完整 ESLint 0 error/21 原 warning、文档 74 份/316 链接/0 缺失、即时循环 0。最终冻结后仍统一重跑，当前结果不是生产构建或真实账号验收。

- R3r 认证/计费/AI 目录：84 个实现/相邻测试/价格 JSON 按 browser/sessions/server/provisioning/presentation、settlement/ledger/quota/pricing 和 images/model selection/endpoints 归类；188 个真实消费者更新，没有新增转发。保持原认证来源、cookie、短期 token/服务端 refresh、共享 session DTO、预留/结算/幂等、账户额度与受信价格。完整 node 2064 项/2063 通过/1 原跳过/0 失败、React 304 文件/1280 项通过、完整类型、ESLint 0 error/21 原 warning；旧 provider 对照原件转为 txt 保留，避免忽略目录的历史源码被当作当前编译入口。文档链接与即时循环继续通过。Knip 文件/依赖/unlisted/binary 仍为 0，值/类型候选与一个语义颜色别名待继续审查；没有用泛化 ignore 制造通过。该阶段未操作真实账户、钱包或生产数据库。

- R3s 字典与认证 CLI：中英文 window 的 note/project/quiz，以及 settings 的 appearance/models/modelForm/keyboard 分为对应业务字典，四个公开命名空间形状和值不变；完整 JSON 83425 字节与前版相同，7 项翻译/键/占位符 node、6 项 DOM/外观 React、完整类型与定向 lint 通过。504 行 auth-setup CLI 保留原命令名/默认 status/main 调度，拆出路径/环境、SMTP、signup trigger、一次性邮箱和 OTP 证明流程；27 个原声明 token 保留，仅 ROOT 的父层级跟随新 helper 位置调整，路径测试确认仍为仓库根。14 项模拟 SMTP/signup/OTP/helper 检查通过，新增 helper 3 项覆盖根路径与 6–8 位码遮蔽。没有执行 status/apply-smtp/verify-trigger/verify-otp 等真实运营命令，没有发送邮件或写真实数据库。原长混合 CLI 与字典已处理，仍保留 sync/sessionStore 单一连续引擎并审查其必要性。

- R3t 剩余领域目录：46 个索引 IO/相邻测试、文档 pane 和笔记 editor/selection/library/proposals 文件迁移，78 个调用者/结构路径更新；Worker 与搜索入口、窗口生命周期、笔记 store 与身份保持原所有权。完整 React 304 文件/1280 项通过、类型通过、ESLint 0 error/21 原 warning。node 首轮 2067 项/2065 通过/1 原跳过/1 失败，是 toolbar 检查仍把 note 文案视为 window.ts 内联字面量；改为检查真实 windowZh.note 值，保留组件 key/CSS 断言，相关检查通过。最后冻结统一重跑。运行位置检查确认索引继续使用 cwd/content/.index，不因源码目录产生物理路径变化。
- R5d 符号和历史探针：删除无消费者的内部 header reader/题目 Map 包装，以及已由连续带限重采样替代的无状态线性函数、nodes-only 解析包装；真实重采样/解析/schema 保留，清理数学/parser/schema 重复转出。旧 2026-10-02 三份探针/config 和日期报告/验收/执行计划按原 Git blob 归档，保留忽略的本机日志；15 个新增原件已验证暂存 Git blob SHA256，不执行旧命令。21 项认证/快照/数学 node、14 项课堂 parser node、19 项音频/导图/公式 React 与完整类型通过。当前 70 份活文档/306 本地链接/0 缺失，Knip 文件/依赖/unlisted/binary 0，130 个值/69 类型保留为已有公开/兼容/配置/诊断表面，逐项决定见导出审查；1 个组件/连线语义颜色别名保留，不声称完整 Knip 退出 0。架构同步了目录、字典、成绩/store、生成链和最后两处连续引擎的职责理由。

- R5e 文档事实收尾（2026-10-11）：追加归档 16 份旧设计/执行/测量及编辑器审查，更新历史索引链接；长期资源/检索/完整历史约定从当前源码重建，旧测量保留原日期。云沙箱参考重写为来源/授权/action/状态/配置/资源指南，移除旧任务账本/指定模型派遣的当前权威措辞，近期授权按当前 12 小时源码；连接器配置区分实现/授权/历史证据。渲染说明核对 14 指令及 raw→sanitize→KaTeX→显式语法高亮，取消已不存在的指令 barrel 步骤。桌面 SOP 核对固定 35349、自由中转首启条件、可选 provider、自定义秘密、OS 加密/既有回退、keyStorage 与测试排除。4 个原参考快照和 16 个移动原件的 Git blob 哈希通过；当前 55 活文档/299 本地链接/0 缺失，剩余 3 个 literal code 路径均明确描述已删除的旧路径。npm 官方 next/eslint-config-next latest 再查仍是 16.4.0；官方 Cache Components 的 opt-in 与本项目身份/缓存保留决定，以及 10/14 尚未发布的安全更新预告记录在 vendor 来源索引。当前进入 R6，代码冻结后统一门禁与实际界面验收。

## 局部阻塞

R6 实际页面复核发现教材选择器的学期行只有展开动作，直接点学期后正文目录仍属于上一学期。已为 YearSubjectFolderTree 增加仅教材调用者传入的可选 onSelectYear，更新同一 reading/managed window 的 yearId 并清除旧学科/选择/展开键；其他主体选择器仍只展开并按学科选择。11 项教材/共享树回归通过，包含直接选学期和重挂载、默认共享树行为。此前 web 隔离构建已通过；修复后重新冻结并复核门禁/构建，不能用修复前 artifact 代替最终候选。

R6 Windows 桌面构建的 Next 编译/1456 静态页通过，shell 暂存遇到新的 dist/node_modules/sharp-* 包链接；原 cpSync 尝试新建符号链接出现 EPERM。白名单 shell 复制提取为 standalone-shell 并解引用实际目标，保留顶层 pnpm materialize、源输出、旧包与环境文件排除。真实目录 junction 夹具验证目标内容为实体目录，server/package 保留，秘密/顶层依赖/segments 排除；1 项回归通过。随后使用新的独立输出重新打包，不更改系统权限或复用不完整包。


尚无已确认的整体阻塞。后续按任务、症状、证据、尝试、影响、替代及恢复条件记录。

## 完成检查点

R0–R6 已按本轮维护边界完成。指定 UI/系统分层/归档及最终补齐的学期选择、Windows Next 嵌套包实体复制均已提交同名云端分支；运行代码候选 `1345cf6f`，最终文档 SHA 见 Git 历史。交付记录位于 docs/analysis/2026-10-11-project-refactor-final.md。

维护回看：

1. 后续改动从 AGENTS/当前架构/标准/SOP 与实际消费者进入；保留单一 store、queue、owner/revision/CAS、完整历史和原件契约。已经完成的分层不按行数重复重切。
2. χ² 与协方差轴修复的触发、数值变化和独立依据已记录；其他数学算法保留各自精度/边界。元数据和字典保持原 JSON/顺序，生成链跟随当前目录。
3. Knip 的 130 值/69 类型和语义颜色别名保留现有接口/诊断；文件/依赖/unlisted/binary 为 0。缩减接口应另查真实契约，静态报告继续保留非阻断安排。
4. 当前文档与归档按原日期解释；原件 Git blob 哈希已验。后续框架更新核对 npm 最新稳定和官方说明，10/14 的预告不代表本次已有该补丁。
5. 本轮代码/内容/组件、Web、Windows 包/包内服务与访客 UI 验收完成。原生窗口/OS DPAPI、真实账户/跨设备/供应商付费与生产发布的实际边界单列，后续按当次授权与发布 SOP 处理。

最终 inventory 2354 源码/测试文件、1715 人工源码、2 个超过 500 行、0 个超过 800 行，即时循环为 0。两处连续引擎的状态所有权和保留理由写入架构；保留接口的 Knip 诊断单列，当前 56 活文档/305 链接/0 缺失，151 原 Git blob 哈希匹配。最终 fetch 确认 master/dev 与各自 origin 仍同为 b87061d4，重构提交已同步；RootSolo 原开发服务 /35349 保持，新增临时服务已停，隔离构建的 tsconfig 变更还原。
