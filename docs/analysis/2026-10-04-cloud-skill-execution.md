# 网页 Skills 的云端执行、成本与用户隔离分析

日期：2026-10-04。状态：架构分析与公开资料核对；没有购买云资源、申请生产权限、部署执行器或执行数据库迁移。用户已选择网页直接使用、云端隔离执行。

## 当前证据

- StudySolo 已有服务端 ToolLoopAgent、工具注册表、useSkill 和 learningConnectors。useSkill 返回技能正文，不安装脚本或依赖。writeDocument 当前明确只承诺 Markdown 导出。
- Electron main 能启动本地 Next 服务，但 preload 仅暴露桌面标志和凭证存储，没有命令执行桥梁。普通网页不能自行调用用户电脑上的系统命令；本地路线需助手或扩展加 native host。
- 线上已出现新连接管理面板，health 声明原生运行时代码存在；/api/connectors 返回 CONNECTOR_PRODUCTION_DISABLED。此证据不能证明精确部署 SHA，也不能证明生产授权已开通。
- 旧市场把第三方 Agent CLI 和未实现的通用 MCP 当作市场条目，卡片统一复制配置。当前本地草稿只列 9 个已实现服务/导出入口，移除不支持的目录，卡片使用原生授权表单并明确生产关闭原因。尚未提交或发布本次市场修正。

## Supabase 的合适职责

官方托管 Edge Functions 限制：256 MB 内存，每请求 2 秒活跃 CPU 时间，Free/Paid worker 最长 150/400 秒。等待网络不消耗同等 CPU，但不能据此把 Chromium、LibreOffice 和 PDF 渲染放进托管 Edge Function。

保留现有 RootSolo Supabase，作为控制和持久化层：Account 验证身份；Postgres 存任务归属与状态；Queues 或带租约的任务表派发；私有 Storage 存输入和产物。Edge Function 或现有 Next API 可发起短暂调度调用，不等待整份文档处理完成。已有配额内的增量成本与超额费用需按项目套餐核对，不宣称免费。

资料：
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/storage/security/access-control

## 阿里云执行层选择

| 路线 | 适配程度 | 计费注意点 | 建议 |
|---|---|---|---|
| FC 云沙箱 / FC Agent Sandbox | 支持 shell、文件操作、自定义镜像模板；更适合 Agent 工具任务 | 秒级资源计费；活跃、休眠、销毁不同；新模型有地域灰度/邀测与 SDK 接入条件 | 首选核对账号可开通范围并小规模验收 |
| 普通 FC 自定义容器 | 可预装文档处理工具，适合确定性的短/中任务 | 与云沙箱新价格不是同一模型；最小实例数为 0 才符合不常驻目标；实例复用需额外防止数据残留 | 沙箱无法开通时的备选 |
| 单台专用 ECS + 隔离任务执行器 | 完整软件环境，多个用户共用硬件 | 正常运行一直付费；普通停机仍可能计费；节省停机保留云盘/EIP费用 | 稳定用量或已有空闲执行机时比较 |

FC 云沙箱的官方迁移说明明确支持 E2B SDK 接入方式和从已有镜像构建模板。其兼容实现不支持照搬所有 E2B 分层安装 API，应先在镜像内预装系统、Node、Python、Chromium、字体等，再构建模板。使用 E2B SDK 不等于必须购买 e2b.dev 的商业服务。

中国内地官方参考单价（新计费是否对本账号生效尚未验证）：

| 计划 | 元/vCPU/小时 | 元/GiB 内存/小时 | 2 vCPU、4 GiB、15 GiB 活跃 1 小时 | 活跃 5 分钟 | 1000 次、每次活跃 5 分钟 |
|---|---:|---:|---:|---:|---:|
| Eco | 0.060 | 0.030 | 0.240 元 | 0.020 元 | 20 元 |
| Std | 0.078 | 0.039 | 0.312 元 | 0.026 元 | 26 元 |
| Pro | 0.120 | 0.060 | 0.480 元 | 0.040 元 | 40 元 |

以上为公开单价的算术推演，不是实测性能、总账单或当前账号报价。假设 15 GiB 以内磁盘享受活跃免费额度；不含模型、镜像仓库、日志、产物存储、跨地域传输、额外磁盘、快照和休眠留存。实际沙箱时长包括启动、运行、上传以及等待，不只计算 shell 命令的 CPU 时间。任务实际平均时长应通过 Notes/GB 各自的样本验收获得。

新价格公告限定 E2B SDK 接入方式，地域逐步灰度。存量账号可能默认 Pro，Eco/Std 切换和新计费可用性必须核对控制台和账单，不假设默认就是 Eco。深休眠仍收磁盘费；对于一次性文档任务，外存产物后终止实例更简单。

ECS 节省停机保留数据，但云盘和 EIP 等继续付费，重新启动还有资源库存约束；不能把关闭网页或普通关机当作零费用。

资料：
- https://help.aliyun.com/zh/functioncompute/pay-as-you-go-of-fc-agent-sandbox
- https://help.aliyun.com/zh/functioncompute/cloud-sandbox-new-billing-model-online-announcement
- https://www.alibabacloud.com/help/en/agentrun/agenrun-sandbox-upgrade-fc-cloud-sandbox-scheme
- https://help.aliyun.com/zh/functioncompute/billing-overview-of-fc
- https://help.aliyun.com/zh/ecs/pay-as-you-go-1
- https://help.aliyun.com/zh/ecs/user-guide/economical-mode

## 低成本生命周期

用户打开网页、阅读或与模型聊天时不启动执行沙箱。模型整理资料和生成源文件后，只有实际调用文档渲染/检查工具时创建沙箱；一次任务复用同一沙箱完成渲染、检查和有限修正；把最终产物、必要 QA、状态存入私有外存后终止实例。成功、取消、异常和超时都必须走回收路径，另有独立过期清理器处理进程崩溃或供应商调用失败。

先共享只读模板、依赖和字体，避免每个任务重新 npm/pip/apt 安装。减少重渲染和高 DPI 全量图片上传。每账号先允许一个活跃任务、全站先限制一个或两个并发，超出排队；这是初始治理配置，不是已测容量。用任务实际开销、峰值内存和失败率调整，不能按注册人数推断并发容量。

固定机器的成本分界：若专用执行机每月新增固定成本为 F，沙箱每活跃小时成本为 R，则计算资源的简化分界为 H=F/R。必须加上运维、安全隔离、存储和网络，不能只比较主机账单。例：假设 F=100 元，Std R=0.312，则约 321 个任务活跃小时/月才到计算成本分界；100 元是假设，不是阿里云报价。现有服务器的沉没费用不意味着额外任务不会影响业务。

## 用户隔离：共享硬件，不共享运行身份

一台机器可以服务很多账号。低并发阶段不需要每用户一台 ECS，但必须把任务作为独立执行单元。对执行 AI 生成代码、用户脚本或可安装包的公开产品，只有不同目录或 Linux 用户不足；需要容器/沙箱边界。普通容器共享内核；不可信执行优先托管沙箱、gVisor 或 microVM，不能把普通 Docker 宣称为同等虚拟机边界。

| 边界 | 必须保证 |
|---|---|
| 身份 | owner 由服务端 Account introspection 的规范 UUID 得到，不接受模型、浏览器 JSON 的 owner；查询、取消和下载都复核归属 |
| 调度 | owner + project + job 固定绑定；CAS 与租约防止重复执行；重试有独立 attempt；队列投递不等于业务副作用恰好一次 |
| 进程 | 每任务独立沙箱；同一用户的续跑也校验归属；不把旧用户沙箱交给新用户 |
| 文件 | 只注入当前任务的明确输入；任务工作目录与私有产物前缀分离；防目录穿越、符号链接逃逸和解压炸弹 |
| 凭证 | 执行环境无 Supabase service_role、Account凭证、云主账号 AccessKey 或全用户 OAuth；MCP授权在现有可信服务端，由代理返回本任务允许的材料 |
| 网络 | 默认不能访问宿主、内网管理接口、实例元数据；外网访问按技能需求控制。不能假设某供应商默认阻断所有外联 |
| 资源 | CPU、内存、进程数、磁盘、输出、超时和账号额度限制；排队避免一个用户耗尽机器 |
| 产物 | 私有桶、owner检查、限时下载；日志不保存密钥和私人材料正文；HTML预览隔离，不继承应用权限 |

只读镜像可以共享，带有用户资料的 Jupyter 状态、临时盘、home 目录、办公软件 profile 和浏览器 profile 不共享。共用主机自建时还需不挂载宿主根目录或 Docker socket，不运行特权容器，限制权限与系统调用。鉴于本项目有生产账号和数据库，不把任意执行任务直接塞进现有网站进程。

资料：
- https://help.aliyun.com/zh/functioncompute/security-isolation
- https://gvisor.dev/docs/architecture_guide/security/

## 两个 Skills 的真实安装合同

已读取源包：
- `D:/projects/My-Skills/notes-to-handbook/SKILL.md`，以及其脚本入口。
- `D:/projects/My-Skills/gb-standard-docx-pdf/gb-standard-docx-pdf/SKILL.md`，以及 toolchain-selection、QA 脚本依赖。

| 技能 | 完整任务依赖 | 上架前需验证 |
|---|---|---|
| Notes to Handbook | 正文、references、assets、scripts；Node + Playwright/Chromium；Python + numpy/pdf2image + Poppler；真实中文字体 | 真正输出 HTML/PDF、零异常空白页、页面检查和失败回收 |
| GB DOCX/PDF | 完整技能包；DOCX写入工具；选定的 PDF renderer；中文字体；结构与逐页图像验收 | 真正生成可编辑 DOCX 与同源 PDF；明确标准/模板与 renderer；Word/WPS 验证不能由 LibreOffice结果替代 |

GB 当前源包是 no-shell Office export variant：默认要求用户可见的 Word/WPS 保存和导出，还依赖宿主文档能力。不能原封不动放到 Linux 后宣称自动运行。云端版本需明确适配 `python-docx + LibreOffice headless` 或用户选定的 PDF-only 工具链，保留版本和差异说明。纯 PDF 路线不能悄悄丢掉 DOCX交付，不能宣称国标认证或未验证的 Word/WPS兼容。

安装至少包括：版本化完整包、依赖环境、平台能力映射、依赖探测、样本输出验收、可取消任务、可靠产物下载和账单测量。仅导入正文属于文本技能导入，不代表脚本能力就绪。这两份需要执行环境的技能暂不上架为可运行。

## 对现有 Agent 的接入建议

现有 Agent不重建。新增异步 `runSkillJob` / `getSkillJob` / `cancelSkillJob` 工具或等价受控 MCP操作。创建工具返回 jobId；长任务不挂住整个 /api/chat ToolLoop，网页展示任务进度与产物，后续工具读取结果并继续说明。任务授权、输入与技能版本在开始前固定，模型不能指定其他owner或任意宿主路径。

执行适配器只承担创建、上传、执行、读取输出、终止与计量；供应商选择在这个适配层完成，保持 FC云沙箱与专用 ECS worker 的替换能力。SDK兼容性、性能、隔离和费用都要在实测后确认。

## 下一步核对顺序

1. 只读核对阿里云账号当前 FC云沙箱开放地域、E2B 接入方式、计费计划和镜像模板支持，不触发购买。
2. 核对 Supabase 套餐、地域和存储配额，以及现有 ECS配置与可用资源，决定备选成本；这些都尚未现场核验。
3. 构建两个版本化环境，分别跑样本记录启动/执行/回收时长和峰值内存，读取实际账单。
4. 验证跨用户读/写/下载/取消拒绝、异常回收、并发排队、日志与产物边界。
5. 全部通过后，接 Agent异步任务工具，再将两个真实可运行Skills上架。市场修正、生产连接配置、执行器发布是独立验收项。
