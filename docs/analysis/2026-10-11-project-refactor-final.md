# 系统性整理交付与验收

完成日期：2026-10-11。分支 refactor/studysolo-2026-10-10。运行代码候选 1345cf6f；最终文档提交 SHA 见当前 Git 历史。目标范围是准备分支、指定 UI 修复、Next 稳定升级、源码/目录/重复与死代码整理、历史归档和维护参考/SOP；master/dev 合并、生产发布与真实付费调用不在本轮范围。

## 分支与框架

最终 fetch 后，本地 master/dev 与各自 origin 均为 b87061d487ffdad4b985c9cade2375871918a3c1，两个基础分支一致；重构分支阶段提交已逐次推送。没有改写主线或部署。

2026-10-11 官方 npm latest 的 next/eslint-config-next 均为 16.4.0，项目已对齐；React 19.2.7 保持受支持的既有依赖。官方 Markdown 快照、来源与 SHA256 在 docs/vendor/nextjs/2026-10-10，阶段修改持续对照安装版 server/client、use-client、project structure、Route Handler 和 output 文档。

[16.4 官方说明](https://nextjs.org/blog/next-16-4)中的 Cache Components 为可单独迁移的 opt-in 缓存模型；本轮保留现有身份、private/no-store、静态内容及 route runtime/dynamic 契约。[官方 10/14 安全更新预告](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026)尚未发布补丁/影响版本，收尾时版本依据为当前 latest，后续发布需重新核对。

## 指定 UI

- 思考滑杆端点/标记保持在轨道范围，键盘 Home/End、当前档位与恢复默认保留。Fast 按钮在无变体模型禁用；MiMo Pro 开启 Fast 后实际使用 UltraSpeed，列表仍只有普通 Pro 行，按钮/芯片显示激活与原动画。已有注册定义复用。
- Agent 空工作区提供内部教材与项目文件入口，顶部添加菜单复用原功能。实际项目文件入口打开“先选一个项目”选择器；没有新建项目或操作真实用户文件。
- 教材正文使用 Studio 同源内容组件，目录在最右侧，正文内 tablist 为 0，题目 UI 不进入正文。实测医学细胞生物学第一节的三个原标题与完整正文可见。
- 选择器复用学期→学科树。最终验收补齐直接选择学期：更新同一 managed window reading 数据，清除旧学科/章节，保持其他选择器默认行为。
- 实际左右栏宽度记录：初始左 290 / 教材工作区 618.2；右加 16 时左仍 290，左加 16 时右仍 618.2；恢复后相同。资产路由往返后同一教材小节和 2193 字符正文恢复，左右栏保持原宽度。

截图和几何回执在忽略的 docs/plans/project-refactor/verify：final-model-fast.png、final-agent-textbook.png、final-project-file-picker.png、final-panel-widths.json。真实操作未发送付费对话、生图或私人文件。

## 架构与归档

同步/存储、chatHistory/settings/learning store、内容加载、聊天/复习 API、请求校验、模型/provider、外壳/输入器、复习/用量/预览等按真实职责拆分。真实静态/动态消费者、Worker、测试替身、CLI、Electron 与 docs 同步更新；显式接口保留必要契约，未增加另一套状态权威。

chat/layout/hooks/stores/content-data、lib/chat/auth/billing/AI、索引 IO、笔记和文档窗口按领域归类。33 个长交互、五份教材目录、交互注册、中英文业务字典与认证 CLI 分层。原内容树 JSON 254101 字节、四份字典 JSON 83425 字节完全相同；53 个交互数据/顺序/规范化动态路径一致。

最终清点 2354 源码/测试文件、1715 人工源码；即时运行时循环 0，超过 800 行人工源码 0。两处超过 500 的 sync engine/sessionStore 已拆外部适配与 IO，保留同一连续队列、owner/version/CAS/checkpoint 状态机；职责理由见当前架构。

37 份确认未使用源码及 21 份旧 hook 转发原件保留历史；内部无调用 reader/Map/旧重采样/解析包装与重复导出路径已处理。151 个有 SHA256 回执的原 Git blob 全部匹配。旧设计/执行/测量/探针与参考原件归档，交付记录纳入后为 56 份活文档、305 本地链接、0 缺失。

Knip 当前文件/依赖/unlisted/binary 为 0；130 个值、69 个类型按已有接口、协议、配置、诊断保留，1 个组件/连线颜色语义别名保留。静态工具仍退出 1，其非阻断 CI 安排保持；明细见[导出审查](2026-10-10-export-surface-audit.md)，未声称这些符号都有生产调用。

数学独立校验修复了旧 χ² 上尾连分式/大自由度 Gamma 溢出和不等方差时协方差特征向量坐标错误，会改变对应数值/椭圆方向。接口、控件与图形能力保留，变化及 NIST/MIT 依据见[概率验收](2026-10-10-probability-refactor-validation.md)。

## 最终门禁

| 检查 | 结果 |
| --- | --- |
| 完整代码 Node | 2068 项；2067 通过、0 失败、1 原有 real PostgreSQL 集成跳过 |
| 完整内容 Node | 2339 项通过 |
| 完整 React | 305 文件、1282 项通过 |
| 完整 TypeScript | 通过，隔离构建临时 include 已还原 |
| ESLint | 0 error、21 原有 warning |
| 秘密扫描 | 3391 tracked 文件通过；提交钩子通过 |
| Web archive Python | 14 项通过 |
| 教材 writer Python | 3 项临时目录检查通过 |
| prebuild | 编码/课堂/生成导航/图片/registry/索引/公式/SVG/媒体和完整代码门禁通过 |
| Registry | 0 error、94 已有 orphan 等 warning |
| 索引 freshness | 深内容 hash 与 manifest 匹配 |
| Markdown links | 56 文档、305 链接、0 缺失 |

## 构建与包内运行

Web 使用 .next-perf-refactor-20261011-final2，代码候选 24396e93，status=0，约 104 秒；之后变更仅为桌面暂存复制/测试与文档，应用代码保持。Next 生成过程为 1456 页，prerender manifest 实际静态路由 1450；运行开发 .next 未覆盖。

桌面在线档使用 .next-desktop-2026-10-10t11-39-43-210z、独立 stage 与 dist-desktop-staged-2026-10-10t11-39-43-210z。首次因 Next 新 dist/node_modules 包链接在 Windows cpSync 创建 symlink 时 EPERM；新增白名单实体复制与 junction 夹具后重新完整构建/打包通过，保留旧输出和系统权限。

在线资源 11528 文件、999678424 字节，缺失 0；包内 Worker/index/Next 和环境排除通过，Electron main/preload/keyStorage/serverEnvironment 存在，测试源未入 shell ASAR。

| 本地验收产物 | 字节 | SHA256 |
| --- | --- | --- |
| Gailvlun-portable-0.5.1.exe | 894274492 | ca6f8622f8e20b8a1e702a12477b301a4ab0a02a95051e0345dd005e5f0d9608 |
| Gailvlun-setup-0.5.1.exe | 894529388 | 5931a4960ce1944cb67dd5e0a80cbfbc331402f430406f5a59f376754cc2f67f |

包内 standalone 使用只包含必要 OS 变量的环境、临时 loopback 51104 做只读验证：首页 200/29825 字节、教材路由 200/75242 字节、索引健康 200；没有传操作者凭据、调用模型、启动供应商或停止原开发服务。测试进程停止、51104 listener 消失。包内索引 48321 chunks/45784 vectors，2537 新 chunk 为关键词覆盖；本轮没有付费补 embedding。

## 验收边界

本轮完成源码维护、功能回归、内容/安全/构建、Windows 包和包内服务运行、实际访客桌面 UI。真实账户/跨设备/供应商付费链路、生产数据库集成、Electron 原生窗口与实际 OS DPAPI 未新验；现有 CLI、协议和测试证据保持，发布前按对应 SOP 验收。没有合并主线、部署或发布 Release。

后续维护从[当前架构](../architecture.md)、[组织标准](../standards/code-organization.md)、[维护 SOP](../sop/14-project-maintenance.md)和被改领域参考进入；旧归档只解释历史。完整阶段与可复现证据见[执行记录](../plans/2026-10-10-project-refactor-execution.md)。
