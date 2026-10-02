# StudySolo 系统内存与性能优化执行规格

> 状态：待实施规格；本文件不是已完成优化的声明。版本 1.0，2026-10-02，UTC+13。
> 执行对象：`1037Solo-StudySolo` 当前期末复习/课程工作站，含 Web、课堂模块与 Electron。不是旧名称为 StudySolo 的 StudyFlow。
> 目标：让实现 Agent 在同一轮迭代内完成下面全部 MUST 工单、兼容适配与验证，提供可恢复的代码和证据；不得只完成若干容易项便宣布结束。

## 0 执行入口与范围

先完整阅读工作区根 `AGENTS.md`、本项目 `README.md`、`docs/refer/storage-architecture.md`、`docs/refer/rendering-architecture.md`、本文件。涉及发布再读根 `OPS.md` 及其前置文档。参考上一轮 [审查报告](../../../1037Solo-Ecosystem/audit-report/16-platform-studysolo-performance-audit-2026-10-02.md)，但本文件包含进一步代码审查，不能仅照上一轮九项概述实施。

本轮交付包含会话驻留、存储原子性、资源生命周期、检索数据结构与执行线程、同步背压、客户端加载边界、运行时打包与性能门禁。继续使用 Next/React/Zustand/现有 AI SDK，不改产品信息架构、统一登录、统一计费或用户内容。

MUST：

- 归属来自 Account 规范 UUID；遵循已存在的 `ownerScope` 和认证重水合流程。不得从 localStorage 自认用户，不自验/自签用户 JWT。
- 额度、价格与预留/结算复用中央实现；取消网络不等于免费，也不等于可以释放未知结果的预留。
- 保留会话全文、附件、工具结果、例题、课堂材料和所有已持久化产物。释放内存缓存不删除权威数据；不以截断历史或关闭功能充当优化。
- 不删除工作区文件。过期文档/产物按根规则归档；本轮不重写 Git 历史。
- 执行前记录 dirty 清单。本规格编写时存在认证/同步等在途改动，禁止 reset/覆盖/擅自提交他人的工作。测试必须说明测的是 HEAD 还是包含在途改动的工作树。
- `RootSolo/AGENTS.md` 禁止 Agent 从 CLI 启动 RootSolo/dev server 和做浏览器端测；本机实现 Agent 可执行单元/协议/存储模拟/Node Worker 自检，编写用户可运行的浏览器采集脚本。浏览器结果尚未执行时明确待验，不得伪造通过。生产构建在隔离产物目录中完成，不干扰活跃开发服务。
- 不向日志、metrics、文档或 Git 写入凭证、用户正文、附件或原始 token。heap snapshot 可能含正文/凭证，只允许受限本地保存，不作公开交付证据。

代码事实审查基点为 HEAD `81df95b789e20d837bac9899d6cd820482559d87` 加当时工作树。行号仅是定位线索，实现时按符号校准。明确不存在的模块在下文标记为“拟新增”；接口和预算是目标设计，不是假称已存在。

## 1 事实、风险与已有正确实现

| 编号 | 本轮确认的代码事实 | 影响与证据边界 |
|---|---|---|
| E01 | `chatHistory.ts` 的 loadSession 从 loadedSessionIds 移除 LRU candidate，再交给只遍历该列表的 evictLoadedSessions | 被移除项不再被驱逐，正文/window/tail 可能遗留；这是确定逻辑缺陷，不是截图内存归因 |
| E02 | AgentChatCenter 来源面板、TokenDashboard 会调用 ensureSessionFullyLoaded | 侧栏访问会把历史全文重装；虚拟 DOM 不约束 store 中全文 |
| E03 | chatStorage 的 sessionWriteQueues settled 后不移除；dropSessionTailCache 又直接删 queue 条目 | 前者保留队列条目，后者可能让新写绕过未结束旧写；不能简单加一个无条件 delete |
| E04 | writeSessionV3Now 先删除旧块、再逐块和 head 写入 | 配额/事务失败时可能损坏原会话；性能改造必须同时修复原子性 |
| E05 | DeferredWindowLayers 空闲后渲染 19 层 | dynamic 导入依然整批加载；内部 null 不能消除模块加载 |
| E06 | AttachmentPreviewViewer 在 useMemo 创建 Object URL；附件转换存在异步迟到路径 | 资源创建不应放纯计算；StrictMode 可放大未接管对象的风险，实际泄漏量未测 |
| E07 | PDF 未在 loading promise 未完成时保存/销毁 loadingTask；PPTX 渐进挂载但不淘汰已看页 | 关闭/换源与长文档存在未闭合生命周期；不等于当前 PDF 所有页全量常驻 |
| E08 | 锁定 pptx-preview 1.0.7 为媒体创建 Blob URL，destroy 只清事件 | 项目 adapter 必须释放它拥有的媒体 URL，不能假定 destroy 已覆盖 |
| E09 | hybridSearch 在判断 mode 前初始化两个索引，diagnostics 也可能触发另一索引 | 关键词模式不必要加载向量，向量模式也可能意外加载 BM25 |
| E10 | v3 BM25 紧凑 numeric postings 被 parseBm25Index 展开成每 posting 的 `{id,tf}` 对象 | 磁盘紧凑不等于运行时紧凑；应保留 numeric 表示 |
| E11 | 两套索引分别解析 chunks-meta，向量 Buffer 再复制；同步 I/O/JSON/相似度计算位于主线程 | 多表示与 CPU 阻塞机制明确；优化收益仍需 profile |
| E12 | sync pull 虽分页但最终汇总全 payload；flush 的 Promise chain 可积累闭包 | 页尺寸/Map 数量不等于驻留字节边界，慢网络下需要单 drain 循环 |
| E13 | 客户端壳依赖全 contentTree；内容页下传源码+服务端树+全部例题 | 需要缩小客户端数据和 RSC 边界，不推翻服务器正文渲染 |

必须保留：Storage v3 的按轮窗口、ChatThread 虚拟列表/锚点恢复、现有写防抖、owner 重水合、PDF 的 RenderTask/TextLayer 取消及当前 24 页/3 并发机制、向量 topK 堆和范数预计算、现有播放器/编辑器动态加载、化学 KaTeX mhchem 单例副作用、现有中央收费与安全 HTML 清洗。

锁定/已安装基点：Next 16.2.9、React 19.2.7、Zustand 5.0.14、AI SDK 7.0.85、pdfjs-dist 5.5.207、pptx-preview 1.0.7、idb-keyval 6.2.5、TanStack Virtual 3.14.4。执行时以 lockfile 和 installed package 再核验，不顺手升级主要框架。

## 2 验收模型与测量契约

### 2.1 四个独立资源域

分别记录：开发 Next 进程树、生产 Node 与搜索 Worker、浏览器渲染进程、Electron 主/渲染/本地服务进程。工作台 Working Set 是进程树驻留内存，不是 JS heap。`arrayBuffers` 已包括在 Node `external` 中，不可重复相加；Worker heap 独立，RSS 属于整个进程，不可每线程 RSS 相加。[R01][R02]

本轮既有证据中的开发工作集约 2.33 GiB、向量文件约 174 MiB、BM25 JSON 约 92 MiB，不是生产预算，也不证明所有索引当时已经加载。不得承诺“降到某个 MB”或引用 Platform 首页资源大小当本项目基线。

拟新增 `lib/performance/resourceMetrics.ts`、`scripts/performance/run-node-memory.mjs`、`scripts/performance/collect-browser.mjs`。指标 API 只暴露不可变数字快照，不暴露 store/消息引用：

```ts
interface ResourceSnapshot {
  timestampMs: number;
  ownerEpoch: number; // 无 UUID、email、token
  loadedSessionCount: number;
  hotMessageEstimatedBytes: number;
  pinnedSessionCount: number;
  tailCacheCount: number;
  pendingSessionWrites: number;
  inFlightSessionWrites: number;
  activeObjectUrls: number;
  mountedPdfPages: number;
  pdfBitmapBytes: number;
  mountedPptxSlides: number;
  syncPendingKeys: number;
  syncInFlightJobs: number;
  searchWorkerCount: number;
  searchPendingJobs: number;
}
```

resource debug 仅显式测试/开发开关启用；生产不发布精细用户活动 endpoint。估计字节与 heap 实测独立标识。消息字节增量用 UTF-16 长度估算+结构开销，不在每 token 对全会话 TextEncoder/JSON.stringify。

### 2.2 固定场景

| 场景 | fixture 与操作 | 主要断言 |
|---|---|---|
| S1 会话轮换 | 100 个会话，普通/代码/公式/工具大结果混合；warm 5 次后轮换 100 次 | 冷会话正文不会随累计会话数线性驻留；权威数据完整 |
| S2 长历史 | 1000 轮；尾窗、来源列、Token 面板、较早轮次跳转 | 面板不全载消息；窗口和 DOM 有界；锚点准确 |
| S3 流式取消 | 10000 个分片，中文/emoji；停止、换会话、退出、旧回调迟到 | 最终持久文本与有效分片一致；旧 epoch 不写新租户 |
| S4 文档 | 300 页 PDF、200 页 PPTX（含视频/音频）、大 DOCX；开关/换源 50 次 | URL/task/observer/count 回到基线；已浏览页可淘汰 |
| S5 搜索 | keyword/vector/hybrid，各 cold/warm，20 并发排队+取消 | 模式专属加载、队列有界、topK/过滤质量一致 |
| S6 同步 | 10000 metadata、慢请求、离线、重试、owner 切换 | pending 有界；checkpoint 正确；不误删云端/本地资料 |
| S7 构建 | 相同 commit/lockfile/Node 三轮；Web 与桌面档位分别测 | peak RSS、耗时与产物清单；不干扰现有 .next/dev |

fixtures 合成，不读取真实用户数据。Node 测试可在专用进程用 `--expose-gc` 比较 settled live heap，但不可在产品中定时 GC。浏览器必须分别记录 JS heap、detached DOM/资源计数；GC 后 RSS 不必回到初值。allocator 高水位不是泄漏。[R01][R03]

每次输出 JSON 至项目忽略的 `artifacts/performance/<run-id>/`，包含版本、dirty fingerprint（不含 patch 内容）、模式/bundler、设备、fixture hash、冷热、采样间隔、完整操作序列、peak/settled、p50/p95、事件循环延迟、错误数及测试退出码。heap 文件不进入这套公开证据。

### 2.3 目标预算

以下是首版工程默认值，集中定义在拟新增 `lib/performance/budgets.ts` 并可通过验证过的配置调整；不是新的会员额度或计费价格。

| 资源 | 默认目标 | 超限行为 |
|---|---|---|
| 非活跃已加载会话 | 最多 3 个；热正文估计总量目标 32 MiB | 驱逐最旧且无 lease 的会话；活动/流式/可见会话禁止驱逐 |
| 活动超大单轮 | 可超软预算，但显式记录 | 保留数据、持久化完成后缩窗；不静默截断 |
| PPTX mounted slides | 目标 12 页及 viewport overscan，当前可见页优先 | 淘汰远离视口且无交互 lease 的 DOM，不重解析整个文件 |
| PDF bitmap | 目标 96 MiB/阅读器，另保留页数与并发上限 | 降低非当前页分辨率/淘汰 bitmap；不可让正文不可读 |
| 同步 | 每 key 1 in-flight + 1 latest-pending；全局最多 6 请求，并有字节加权闸门 | 重试按退避，排队只存轻描述，不捕获全文副本 |
| 搜索 | 1 Worker/Node process；1 CPU 检索执行，最多 16 pending | 超限返回明确 busy；用户取消立即从 pending 删除 |
| body fallback cache | 32 MiB、短 TTL、content revision | LRU；不永久缓存全语料 |
| 首轮性能回归 | 同设备三轮 median，p95/peak 比基线增幅 >10% 需解释 | 结构性断言先硬门禁，数值未稳定前告警；不可用忽略失败完成 |

保护项使软预算无法收敛时，记录 pinned pressure 并暂停非必要预热/后台物化，不删除正在编辑/运行的内容。资源故障对当前功能明确报错；笔记阅读不因检索失败整体不可用。

## 3 目标所有权与核心接口

### 3.1 owner / session / operation 三层

owner epoch 是本次认证身份世代；session lease 是可见视图/流式/写入对会话的保留；operation generation 是一次文档加载/查询/同步的世代。所有异步任务创建时捕获 owner、epoch 与目标 id，结果应用前校验。不是仅在 Promise 创建前检查一次当前用户。

```ts
interface OperationScope {
  ownerId: string;
  ownerEpoch: number;
  targetId: string;
  generation: number;
  signal: AbortSignal;
}
interface SessionLease {
  sessionId: string;
  reason: 'visible' | 'stream' | 'write' | 'explicit-pin';
  release(): void; // 幂等
}
interface HotSessionPolicy {
  applyWindow(scope: OperationScope, load: SessionWindowLoad): void;
  acquireLease(sessionId: string, reason: SessionLease['reason']): SessionLease;
  enforceBudget(): void;
  getMetrics(): Readonly<ResourceSnapshot>;
}
```

拟新增的 cache/queue key 必须包含捕获的 owner namespace。不能异步结束时再调用全局 `ownedStorageKey` 绑定到新用户。认证现有代码由在途工作维护，本优化以适配接口连接，禁止重新写登录方案。

### 3.2 持久化与内存分离

权威全文在现有 IndexedDB/云同步；RAM 只保留 metadata、活动窗口、有限的尾块和需要的产物。derived summaries 是可重建缓存，不作为 billing receipts 或完整正文的替代。

生命周期 `cold → loading → ready → evicting → cold`；失败进入 `error` 可重试。正在写的会话可释放 UI 视图，但不能删除它的串行队列或正在提交的 tail snapshot。输出写成功再缩窗，失败保留可恢复内存并可导出。

## 4 MUST 实施工单

### SS00 基线和资源计数器

**落点**：拟新增上一节 metrics/采集模块；扩展 package scripts 但不安装新框架。先记录 S1–S7 能执行的 baseline，之后所有工单用同 fixture。若浏览器未授权/不可执行，结构性验证与浏览器待验分开列出，不停止可独立的实现。

**实现**：getter 返回数字副本；注册/注销在实际资源 owner，不能靠 UI 估计；计数清理不能为了通过测试而统一赋零。Node harness Mock AI/Embedding/Rerank、临时 index、限期任务；对缺依赖明确输出，禁止真实付费 fallback。

**验收**：JSON schema 合法；计数与 spy/实际 registry 一致；20 个生命周期结束后未持有 fixture 本体。不得把 heapUsed+external+arrayBuffers 当总内存。

### SS01 修复真正的会话驱逐与字节预算

**现有落点**：`lib/stores/chatHistory.ts`：evictLoadedSessions（约 192）、loadSession（约 326）、applySession（约 690）、create/full-load/loadEarlier。`lib/storage/chatStorage.ts`：tailCache/dropSessionTailCache。

**实施**：统一 `applySessionWindow`。先计算待保留集和 victims，再从 `Object.keys(messagesById)` 的实际驻留集合驱逐；不要只遍历已裁剪 ID。LRU identity、messagesById、sessionWindowById 和状态表必须一致。所有写入入口，包括云 pull 和 full-load，通过同一策略。bytes 用增量估算；8 个 user turns 并不能限制单轮大工具输出，保留超大轮语义并标记 soft overflow。

**不变量**：active、stream、可见窗口与写入 lease 不被驱逐；LRU 改变不删除 IDB；迟到 load 不使旧 owner 会话复活；pin 释放后重新 enforcement。evict 只请求 tail cache 释放，不能直接删 in-flight write registry。

**测试**：A/B/C/D 四会话实际 message keys 不留 victim；100 会话轮换；pull 应用 100 页不全驻留；多个 pin 压力解除后自动收敛；loadEarlier 后丢视图与正在写时驱逐；所有持久消息 hash 不变。

### SS02 来源、产物与 Token 面板读取派生摘要

**现有落点**：`components/agent/AgentChatCenter.tsx`、`components/chat/TokenDashboard.tsx`、相关 sources/products 面板与 `ensureSessionFullyLoaded` 调用点；执行时 rg 全部调用者，建立迁移清单。

**拟新增**：`lib/storage/sessionSummary.ts`，字段 `schemaVersion=1`、`sessionId`、`sourceRevision`、`sourceRefs/productRefs/imageRefs`、`tokenEstimate`、`estimatedBytes`。引用保留 message/turn/citation 的归属、去重规则与完整产物路径，不只存 URL 后丢失引用顺序。

**实施**：侧栏从 summary+分页查轮读取，不把正文写入 messagesById；Token 面板只在打开且可见时订阅当前 revision，不关闭后每 5 秒 join 全文。估算 token 标为估算，实际计费 token 从现有 receipts。旧会话摘要按 chunk 增量构建，每批 yield；owner/版本不匹配丢弃派生结果，随后重建。不在登录瞬间遍历所有正文。

**兼容**：无法解析的新工具 part 保留可展开原始来源入口；摘要失败不清除旧会话。明确需要完整导出的操作可以流式读各 chunk，不能以摘要代替正文。

**测试**：1000 轮打开来源/Token/图片面板不调用 full-load；新增/更新/撤销 message 后摘要新 revision；非标准工具、重复 citation、旧 v2/v3、身份切换；摘要与按全文计算 oracle 一致。

### SS03 会话写队列和原子 checkpoint

**现有落点**：`chatStorage.ts` enqueueSessionWrite、dropSessionTailCache、writeSessionV3Now、deleteSessionData；`idbStorage.ts` lazy writes 与 flushKey。扩展现有 migration/window/gc 测试。

**实施 A 队列**：registry key 为 owner+session。promise settled 后，仅当 registry 当前条目仍是本次 tracked promise 且无 pending job 时 compare-and-delete。drop tail 不删除串行队列。删除/归档的既有业务动作在同队列排序并设置 tombstone，晚写不得复活被用户删除会话。失败后下一写仍能继续，不让 rejected chain 毒化后续任务。

latest-wins只可合并完整checkpoint快照，不可丢弃append/delete/工具结果等有顺序的逻辑操作。所有逻辑mutation先进入同一会话version状态，再由checkpoint持久化最新完整尾块；测试写A在途→drop→追加B→追加C，三条有效消息均保留且不乱序。completed registry清理不提前清正在用的tail；字节压力仅释放已确认落盘的tail。

**实施 B 原子性**：保留现有 v3 key 结构。事务外从同 revision snapshot 规划/序列化新 chunks 与 head；一次同 objectStore readwrite transaction 提交 head、chunks 和必要 manifest 更新，事务 complete 才确认成功并更新内存 tail。旧多余 chunks 仅由现有经过验证的 GC 处理，不先删权威块。事务内不 await 网络/定时器/无关 Promise。IDB abort 时原会话可完整恢复。[R04][R05]

给v3 head增加可忽略的可选contentRevision整数（旧head按0），所有新writer在同事务递增；summary用该revision失效，不能只比较毫秒时间戳。key在事务前捕获owner namespace，transaction同时读head检查expectedrevision，冲突重新读取/合并有效逻辑操作，不以旧snapshot覆盖新写。旧代码read兼容额外字段，但旧writer不执行CAS，因此多tab更新窗口需要广播版本并提示旧tab重载，不能宣称未升级writer也完全受保护。

**实施 C 流式 checkpoint**：tail 与 head 的增量写也必须是一个 session checkpoint，不能只修 full rewrite。写防抖仍保留，但“隐藏页触发 flush”只代表调度写入，不声明 pagehide 异步必然完成。持久失败有状态与重试，不把 QuotaExceeded 转成多个 localStorage key 覆写，后者不具原子性。

**验收**：写第 N 块失败，旧 head/正文完全可读；提交后 head/chunk revision 对应；多次 drop/新写不绕过旧链；慢写+删除/账号切换；1000 会话写完成 registry 收敛；容量不足可重试/导出，无静默成功。

### SS04 全项目异步任务的 owner epoch

**落点**：`ownerScope.ts`、会话缓存、summary、sync、附件、document jobs、延迟 store 水合；保留 `useAuthSession` 现有重新绑定流程。

**实施**：在认证权威 owner 切换时增加 epoch，abort 旧 owner 网络与 CPU jobs；正在提交的旧 owner IDB transaction只提交到捕获的旧 namespace，不重绑定新 owner。清理内存视图/URL/leases，等待或观察旧写终结。资源 registry 的 disposal幂等，unsubscribe集中返回释放函数。

**测试**：A 的慢 load/preview/sync 在 B 登录后完成，B 无 A 正文、元数据、缓存 hit 或账单；退出后无后台周期网络。不得把 current_user 字段名称调整当身份迁移。

### SS05 按需窗口层与窄订阅

**落点**：`components/window/DeferredWindowLayers.tsx`、AppShell、windowManager、相关 viewerId/openEditorIds selector。

**实施**：建立模块静态可分析的 loader 映射与薄 host，按实际窗口/面板需求挂载。19 层不再因 idleReady 全部出现。轻 host 只订阅必要 primitive/set identity；Zustand 5 组合结果用稳定引用或 useShallow，不每次返回新数组造成循环更新。[R06][R07]

**状态**：关闭卸载 renderer，保留窗口 metadata与权威编辑状态；最小化可暂停媒体/昂贵计算，但窗口恢复必须恢复草稿/滚动；正在导出/生成的任务 lease 独立于 UI。预热只在明确用户意图，最多一个重功能，不 idle 全预热。

**测试**：无窗口停留 10 秒重模块无请求；分别开启各层只加载对应 chunk；打开/关闭/最小化 50 次；快捷键、会话隔离、草稿回显；任一导入失败保留 retry和安全原文展示。

### SS06 Blob URL 与附件转换的明确 owner

**落点**：`AttachmentPreviewViewer.tsx`、`lib/hooks/useImageAttachments.ts`；rg 项目全部 createObjectURL/revokeObjectURL 与 data URL 转换，登记真实资源创建者。

**拟新增**：`lib/resources/useObjectUrl.ts` / `ObjectUrlLease`。在 effect 或显式 committed job 中创建 URL，cleanup 幂等 revoke；useMemo 仅纯计算。React StrictMode 的重复计算/额外 effect cycle 是测试场景，不关闭 StrictMode逃避。[R08][R09]

**附件**：ref保存当前已接管附件；卸载直接释放，不依赖 setState updater副作用。转换任务携带 generation/signal，过期转换结果立即释放；同 URL 多视图用 refcount，最后 lease 释放才 revoke。删除 URL 不删除 Blob 权威存储。上传/请求结束释放 File 和大 ArrayBuffer 引用，保留需要的持久 ID。

**测试**：StrictMode、快速换 src、追加中卸载、失败、两视图共享、50 次开关；spy create/revoke 集合对称，引用计数归零，无迟到 setState。

### SS07 PDF loading/render/bitmap 三层释放

**落点**：`PdfDocumentPane.tsx`、`PdfPageCanvas.tsx`。

**实施**：保存 PDFDocumentLoadingTask ref，换源/关闭立即 task.destroy；loading Promise 成功/失败/finally均按 generation结束资源。只清自己的 task，不能旧 finally destroy 新文档。已经存在的 RenderTask.cancel/TextLayer.cancel 和 pdf.destroy继续保留。[R10]

**预算**：每页 bitmap 估值 width×height×4，DPR/缩放纳入。在 24 页 cap 外增加字节预算；当前/overscan页优先，远页卸载 canvas并清 width/height，释放 page/renderrefs。没有 IntersectionObserver 时也不能全页 mounted，使用明确当前页窗口；保留完整目录和页跳转。页面显示与文本选区分别测，不能只看canvas数。

**验收**：pending loading关闭后网络/Worker结束；坏 PDF 与快速 A→B 切换；高 DPR300页不全驻留；页面跳转、复制选区、缩放、滚动锚点正确；资源降到基线而不是统一计数清零。

### SS08 PPTX 与 DOCX 文档适配器

**PPTX 落点**：`PptxDocumentPane.tsx`。一份解析模型，多份有限可见 slide DOM；LRU 淘汰远页 DOM，不重新拉取/解析整个deck。原来无 IntersectionObserver/fallback 的全量preview改为受限窗口；超预算提供文字页与主动单页渲染，不能白屏或偷偷丢页。

**PPTX disposal**：adapter持有previewer及它创建的媒体 URL 清单，锁定1.0.7按实际 `pptx.medias`结构提取owned blob URLs；关闭、重建、load失败及late-load结束都幂等revoke+destroy+移除自身DOM/observer/ref。禁止猴补全局 URL，也不revoke外部共享URL。升级库时重新验证内部媒体结构。

**DOCX 落点**：`DocxDocumentPane.tsx`。fetch绑定signal；无法硬取消的 renderAsync使用generation专属off-DOM host，过期完成只清自己的host，不写新文档容器。解析和渲染并发有界，失败保留retry/下载原件。大文件保持可阅读的分页/按需view，不每次宽度小抖动重解析。

**验收**：多媒体deck开关50次URL对称；200页滚动到底再回来，mounted DOM仍有界；DOCX A慢渲染→B快渲染后只出现B；导出/文字页完整；不以库destroy调用次数替代真实资源释放断言。

### SS09 模式专属索引与紧凑 BM25

**落点**：`hybridSearch.ts`、`bm25Store.ts`、`vectorStore.ts`、`indexIo.ts`、`lib/ai/indexing/bm25Index.ts`。

**实施**：keyword只BM25，vector只vectors，hybrid才两者；builtAt/model/diagnostics读取manifest，不通过另一 loader加载。loader有cold/loading/ready/failed和共享初始化Promise；失败可受控重试，不让_loadAttempted永久阻止恢复。

**BM25 目标**：v3的ids、docLengths和numeric postings在runtime保留，不展开每posting字符串object。内部docIndex是数值；docLengths typed array，score scratch/touched indexes、topK堆；最终topK才映射完整元数据。legacy输入有有界转换adapter，写盘格式先保留可回滚v3；新增binary格式必须独立schema兼容测试，不在本轮擅自替换所有既有产物。

**向量**：保留topK堆/范数；metadata只一份。尝试Float32Array共享Buffer时检查byteOffset、length、4字节对齐和端序，Buffer lifetime由index owner持有；条件不满足受控复制一次，不每request复制matrix。[R11]

**测试**：keyword不打开vectors.bin，vector不解析bm25.json，包括diagnostics；相同fixtureBM25score与topK满足数值容差；学年/学科/分类过滤、同分排序、空查询、legacy、坏索引；metadata加载次数1。

### SS10 一个搜索 Worker 承担 CPU 与索引所有权

**拟新增**：`lib/ai/search/searchService.ts`、`lib/ai/search/worker/*.mts`、`tsconfig.search-worker.json`；使用现有 TypeScript 编译至 `runtime/search-worker/*.mjs`。Worker模块只用Node builtins/相对带扩展名导入，不引用 @ alias、React、Next或server-only；Next只引用Facade，不在bundle内拼一个.ts Worker路径。[R02]

```ts
interface LocalSearchJob {
  jobId: string;
  indexRevision: string;
  mode: 'keyword' | 'vector' | 'hybrid';
  query: string;
  queryVector?: number[];
  filter: ExistingSearchFilter;
  topK: number;
}
interface LocalSearchResult {
  hits: ExistingScoredChunk[];
  diagnostics: SearchDiagnostics;
}
```

**所有权**：globalThis Symbol registry+singleflight保证一个Worker/Node process；仅Worker持有BM25、向量、metadata和bodycache。主线程不能再同步加载同份索引；embedding/rerank网络保留主流程并复用现有计费。主/Worker间只传小query/topK结果，不clone全matrix；不每request新Worker。

Worker是主线程响应性的隔离，不自动降低process RSS；固定线程成本纳入S7/S5，内存收益来自单份索引/紧凑表示/及时释放。不得只展示主线程heap下降而隐藏Worker增加。job还需byte预算：query沿既有normalize/clamp上限、topK在现接口允许范围内、vector长度等于manifest.dimension、filter只允许schema字段，pending总估值≤4MiB；超过明确拒绝而不是复制任意巨大对象到Worker。

**执行**：Worker一次一个检索job，最多16pending；遍历按时间片约8ms或256项yield并检查cancel，避免取消消息被长循环饿死。队列超限稳定错误search_busy；abort pending立刻remove，running job下一yield终止，clientPromise准确reject。worker crash拒绝所有inflight，singleflight重建；只可重试无付费副作用的本地步骤，不自动重发已付费embedding/rerank。

**build/runtime**：prebuild编译Worker并assert入口；Web self-host/standalone/Electron三种app-root resolver测试，NFT与桌面白名单显式包括runtime输出。dev首次无Worker产物只提示执行compile命令，不静默把全索引退回主线程。SSR正文、登录、健康不因Worker cold被阻塞。

现有desktop脚本直接`pnpm exec next build`可能绕过package prebuild，因此Web build与desktop build必须显式共用compile/assert步骤，不能只改prebuild。BM25/向量纯算法与codec提取为Worker可用的相对模块并由旧facade调用同一实现，不复制第二套排序/过滤算法；旧测试适配器不另保留一份index在主进程。global registry记录worker/pipeline/indexrevision，HMR或索引更新有受控drain/rebuild，不永久运行旧代码世代。

**测试**：20并发、取消、worker退出、坏index、coldsingleflight；handler主线程loop lag；typed arrays不被意外transfer detach；cwd不同、桌面打包路径和只读部署目录；输出与SS09oracle相同。

### SS11 轻健康检查、内容 cache 与请求局部诊断

**落点**：`indexHealth.ts`、`bodySearch.ts`、`hybridSearch.ts`、searchNotes工具与rerank调用。

**readiness**：仅检查manifest/schema/文件stat/hash摘要一致，GET health不generateChunks遍历全文。内容新鲜度deep check在build-index/构建闸门完成，显式深检在受控后台Worker跑；manifest纳入content revision和来源产物。不直接永久跳过一致性校验。

**cache**：正文fallback按subject/contentRevision key，byte+entry+TTL LRU，命中更新LRU；negative结果有短TTL。旧revision清cache；禁用fallback的测试语义保留。业务API返回 `{hits,diagnostics}`，移除并发共用getLastSearchDiagnostics依赖。

**取消**：SDK abort signal贯通 localjob、embedding、rerank与fallback；区分用户abort和上游普通error，abort后不再启动fallback/付费调用；已经消耗的provider结果遵循现有结算。超时组合signal不覆盖用户取消。

**验收**：health不调用generateChunks；多requestdiagnostics不串；contentrevision后无旧缓存；abortRerank不会触发fallback；cold失败可读明确原因，文章阅读仍可用。

### SS12 同步单 drain、分页应用与 checkpoint

**落点**：`lib/sync/client.ts`、`lib/sync/engine.ts`，只在当前认证/同步在途实现上增量适配。

**push**：每key latest-pending轻job+一个inflight，单drain loop。正在写/上传时的新版本只覆盖pending最新，不往Promise chain追加持有正文的闭包。恢复rejection后可继续；backoff有jitter/上限，offline暂停，owner切换abort。全局请求6保留但按实际payload字节加权；不可让6份巨大fullsession同驻留。streaming session跳过的现有语义保留，完整历史上行通过按块读取/manifest，不只同步尾窗。

**pull**：页读取后应用并释放，不最后累积10000 payload。优先metadata/revision/游标，再按变更取正文。checkpoint只在本页全部必要IDB提交成功后前进；部分响应不当全量快照，也不触发本地删除。支持远端legacy数组adapter，但不能冒充新cursor协议已上线；协议调整需要同时实现当前API端。

**失败**：轻job可持久重试，包含owner/revision/对象ID而非全部正文；同key幂等；版本冲突保留双方可恢复信息。pagehide只能request flush，未收到持久commit不能mark已完成。

**测试**：10s慢网下1000次同keyupdate只1+1；pull页N失败checkpoint停在N-1；retry无重复对象/收费；部分page不误删；ownerAjob不写B；hidden/online/abort重入。

### SS13 学科摘要、导航与正文传输边界

**落点**：`content-data/manifest.ts/index.ts`、`nav.generated.json`、HomeBookshelf、AppShell、SubjectSidebar与内容页page/ContentPageClient。

**目标**：首页静态学科摘要；导航按subject/year载轻metadata；path/article权限索引留server。通过现有生成器生成，不手工重复content事实。getContentItem调用迁移至轻索引/已加载subject provider；loading明确，不以返回undefined伪装无内容。增加server-only边界检查防Fs/全正文进入client。

**正文**：保留NoteRendererServer。测量源码+rendered树+例题的RSC，区分客户端必需字段。大正文只下传可定位摘要/受控contentRef；AI问答/选区需要原文时按当前item加载，校验owner和item。例题列表+有限首条，打开或hover再全文；离线桌面从本地受控同API读取。小页面预载可保留，但配置和条件统一。

**测试**：首页client依赖无全manifest正文路径；科目切换/学年过滤/课堂四材料/链接深跳；stub与dynamicParams=false404；例题与划词/来源不退化；registry/generatedfreshness闸门继续通过。

### SS14 流式渲染、高亮与派生大 store

**落点**：ChatThread、MessageContent、shared plugins、artifacts/documents/imageGen等产品store。前置清单区分确实全水合的store和已经分页的store，不因名称相似全部重写。

**流式**：只活动消息订阅高频delta，已完成消息memo/稳定引用，按帧合批UI，final/abort强制flush。网络/工具事件保持及时，不能用显示throttle丢掉工具调用或usage终态。token频率不触发全产品列表JSON.stringify。

**高亮**：`subset`不裁语言bundle，显式deepgrammar+languages；detect:false保留。SSR和client共享插件语义、sanitize顺序、mhchem单例；KaTeX不进入optimizePackageImports。[R12]

**产品store**：列表 metadata与当前打开artifact正文分开，有限bodycache；浏览器小UIstate继续localStorage，大HTML/doc/imagepayload继续IDB，不为了优化统一同步全store。下载/导出读取完整权威对象；关闭视图后bodylease释放。

**验收**：1000轮historyDOM有界；停止显示后全文落盘一致；formula/chemistry/unknownlanguage/原始HTML清洗回归；仅开产品列表不加载所有正文；用户保存的HTML、图片和documents可完整恢复。

### SS15 运行时资产白名单与档位

**落点**：next.config、build-desktop、electron-builder、索引生成与媒体清单。此项为降低部署/启动加载风险的配套，不将磁盘节省当作RAM节省。

**实施**：声明Web、desktop-online、desktop-offline-subjects三档。只复制实际运行时正文/例题/必要index/prompts/Worker；排除_raw-src与embed-cache等build输入，保留可追溯原件。在线档media走已配置CDN；离线档由学科manifest决定，不伪称所有本地video不需要。只有spec命名的资源目录允许打包，禁止trace把旧Classolo、archive、dist-desktop递归带入。

**恢复**：新staging构建，旧包按项目规则归档，不能执行旧脚本的rm作为本轮步骤。依赖实体化/standalone冒烟/预取段cache策略保留；检查asar与standalone重复依赖，确认Electron壳需要哪些再裁，不盲删Next原生包。[R13]

**验收**：打包清单包含Worker/必须media/index，排除buildcache和旧项目；在线、离线、路径重定位、无外网启动受控测试；至少一次新包内依赖完整性。未运行真实Electron/browser只标待验。

### SS16 媒体解码、图片与解析预算

**落点**：ContentImage/附件图片、视频组件、内容素材生成流程；以现有实现具体符号定位，不凭空认定已有CDN失效。

**实施**：大原图保留，展示图按尺寸生成衍生资源并记录width/height、原件ref和格式；高DPR解码以实际展示尺寸为预算。视频未播放时明确preload策略，PIP有独立lease，离页不错误停止正在PIP的播放。所有新的解析队列按bytes与并发控制，不能以“文件数≤N”替代内存边界。

**验收**：病理/公式/教材图片可读性，打开原图可达；大量图片滚动释放offscreen解码引用；PIP跨页面恢复；不能把图压模糊换得好看的指标。

### SS17 开发/生产构建配置实验

**实施**：不直接降低max-old-space-size。先识别本版bundler、默认cache/root/worker行为；逐项配置实验，记录coldcompile、HMR、buildpeak和耗时。Webpack专用flag不用于Turbopack。减少目录watch/导入范围必须有有效resolver/tsconfig证据；旧Classolo已排除，不重复宣称修复。[R14]

**产物**：添加稳定执行入口 `perf:node`、`perf:contracts`、`compile:search-worker`，文档说明环境/不启动服务器。productionbuild在隔离snapshot，包含授权的dirty源而不是误测纯HEAD；不将.env复制到被跟踪/公开目录。

**验收**：三轮可复验；配置无吞类型/构建错误；同mode比较。任何只减cache但显著增加CPU/首编延迟的方案明确tradeoff，不默认推广。

### SS18 测试、发布前兼容门禁与完成记录

**必须新增/扩展测试组**：session-lru、session-summary、owner-epoch、session-atomic-checkpoint、session-write-queue、document-resource-lifecycle、pptx-media-disposal、search-mode-isolation、bm25-compact-oracle、search-worker-lifecycle、sync-backpressure、content-client-boundary、stream-finalization。

测试不得镜像实现细节：LRU看真实keys和持久hash，原子性用真实语义的IDB事务测试替身/隔离浏览器，不用只模拟Map成功；worker跑实际Node线程与编译产物；URL spy是结构证据，真实retainedheap另采。需要添加测试依赖时精确锁定并更新lockfile，不下载产品资产或安装新运行框架。

保留既有 `pnpm check:encoding`、`check:lectures`、`check:registry`、`typecheck`、`lint:eslint`、`lint:secrets`、`test:unit`、`test:content`、`test:react`、`build`。以package scripts当时定义为准，不能通过删测试、改passWithNoTests掩盖失败。重型build只能在安全隔离路径执行。

## 5 依赖顺序与一次性交付计划

```text
SS00
 ├─ SS03 → SS04 → SS01 → SS02
 ├─ SS06 → SS07 / SS08 → SS05
 ├─ SS09 → SS10 → SS11
 └─ SS12（与SS03/04协同）
SS01/02/05/11 → SS13/14
SS10/13 → SS15 → SS16
SS17贯穿；SS18最终闭环
```

第一提交组：生命周期与数据正确性（SS01–04、06–08）。第二组：索引/Worker与同步（09–12）。第三组：加载/内容/渲染/产物（05、13–17）。第四组：全契约与证据。可以一次Agent任务连续完成，不等于必须一个巨型commit；在途工作仍由原owner维护。提交/推送/部署只在当次用户授权范围内执行。

不得因中间性能看起来改善而跳过SS03数据安全、SS04归属、SS15Worker打包或SS18完整验证。无需先问用户每个可逆设计选择；接口冲突按当前代码与本文件已定义不变量解决，并记录理由。

## 6 失败恢复与兼容

1. IDB格式保留v3 keys，额外summary独立可重建；升级失败继续读既有权威数据，不能清空库。
2. Worker unavailable返回明确search能力错误；不得自动在主线程复制整个索引。文章/会话/已保存产物仍可用。
3. URL cleanup、owner epoch、真正LRU修复是正确性基础，不能回滚成旧泄漏路径；若某renderer虚拟窗口有问题可恢复其显示策略，保持loading取消与disposal。
4. 云同步协议保持读旧数据adapter；新分页checkpoint只在提交成功推进。禁止将部分同步当完整删除快照。
5. 产物回滚保留旧发布包与index manifest，校验内容版本。StudySolo独立云端发布，不能使用MainECS全包脚本误部署本项目。
6. 不能用删除用户附件、降低模型能力/上下文到不可用、关闭公式/来源/Undo等功能实现数字目标。

## 7 完成定义与执行 Agent 总指令

代码完成和用户环境验收是两项独立状态。最终应更新本文件末尾执行记录，逐SS工单列实际文件/测试、已完成/待验/受阻原因，并链接ignored evidence目录的安全摘要。

- [ ] SS00–SS18全部实现或明确已满足的代码证据，不能泛写“建议后续优化”。
- [ ] 各类资源有唯一owner、boundedpolicy和幂等dispose，所有迟到回调有epoch。
- [ ] 不丢正文、不串用户、IDB事务失败可恢复、云同步版本确认正确。
- [ ] 搜索CPU离开主线程，索引只一份/进程，模式专属初始化，Worker产物已可定位。
- [ ] 必要自动检查通过，未执行浏览器/云端项目逐项列明。
- [ ] 无新增泄露/错误价格/认证旁路/未授权删除；原dirty保留。
- [ ] 优化前后同fixture证据；无真实测量项不声称百分比收益或泄漏已经修复。

可直接交给执行 Agent 的指令：

> 阅读并执行本规格的全部 MUST 工单。先核验代码与版本、记录当前dirty和baseline，然后依依赖顺序实施；保留现有统一认证、中央计费、权威全文与离线功能。每步提供结果导向测试，完成Worker打包与存储兼容，不在阶段间反复询问可逆实现选择。遵守RootSolo的服务/浏览器限制，准备用户可运行的剩余端测。只在实际通过的范围声明完成；修复失败并继续，不用空TODO、关闭功能、删历史或堆大heap代替优化。最终给逐工单矩阵、证据、剩余环境验收和恢复方法。

## 8 官方依据与调研方法

本规格来自本地代码逐路径审查、上一轮采集和官方资料核查。代码事实与工程目标分开；没有运行浏览器、生产负载或付费服务。API语义由对应官方来源支持，版本能力由当前installed types/source再次核对；优化预算是本项目拟定值，不能引用资料冒充实测收益。

| 引用 | 来源与支持范围（访问日期2026-10-02） |
|---|---|
| R01 | [Node process.memoryUsage](https://nodejs.org/api/process.html#processmemoryusage)：RSS/heap/external/arrayBuffers的含义与重复统计边界 |
| R02 | [Node Worker threads](https://nodejs.org/api/worker_threads.html)：CPU任务池、独立heap、Buffer transfer/share与生命周期 |
| R03 | [MDN measureUserAgentSpecificMemory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory)：兼容与隔离前置；不为测量全站加COOP/COEP破坏登录弹窗 |
| R04 | [IndexedDB标准](https://www.w3.org/TR/IndexedDB/)：transaction complete/abort、原子提交与active状态 |
| R05 | [idb-keyval官方仓库](https://github.com/jakearchibald/idb-keyval)：batch/update原子语义，单独get/set非原子read-modify-write |
| R06 | [Zustand useShallow](https://zustand.docs.pmnd.rs/reference/hooks/use-shallow)：稳定组合selector与浅比较 |
| R07 | [Zustand v5迁移](https://github.com/pmndrs/zustand/blob/main/docs/reference/migrations/migrating-to-v5.md)：稳定selector输出和旧equality接口差异 |
| R08 | [React useMemo](https://react.dev/reference/react/useMemo)：纯计算与StrictMode开发双调用 |
| R09 | [React useEffect](https://react.dev/reference/react/useEffect)：setup/cleanup对称和重复cycle |
| R10 | [PDF.js LoadingTask](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html)：destroy终止loading请求/Worker，本地5.5.207接口已核对 |
| R11 | [Node Buffer](https://nodejs.org/docs/latest-v24.x/api/buffer.html)：共享底层buffer必须正确byteOffset/length；以运行Node版再验证 |
| R12 | [rehype-highlight](https://github.com/rehypejs/rehype-highlight#options)：subset与languages/detect区别 |
| R13 | [Next output/文件追踪](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)：standalone资源需要显式补充，不能假设动态Worker自动追踪 |
| R14 | [Next内存指引](https://nextjs.org/docs/app/guides/memory-usage)：诊断与bundler专属配置tradeoff，最新版参数不直接套锁定版本 |
| R15 | [Next lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)：client条件挂载与第三方模块边界 |
| R16 | [MDN Object URL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)：资源创建和释放责任 |
| R17 | [Zustand持久化](https://github.com/pmndrs/zustand/blob/main/docs/reference/integrations/persisting-store-data.md)：异步水合、版本与显式控制 |
| R18 | [MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)：同步存储与大数据处理边界 |

## 9 执行记录

2026-10-02 启动记录：在Class修复提交 `441c6f77e6e10a31363eb2837535b2245a9545df` 后开始，`git status --short`为空；此处测量的是该HEAD加本轮逐步修改的工作树。Node v24.15.0，已安装Next 16.2.9、React 19.2.7、Zustand 5.0.14、AI SDK 7.0.85；锁文件和依赖后续保持原主要版本。RootSolo约束不启动dev server/浏览器实测，浏览器采集脚本交付后仍需在用户环境执行。上一轮Class日志不是本轮SS00基线，不能据其推断性能收益。

| 工单 | 当前状态 | 本轮证据/边界 |
|---|---|---|
| SS00 | 本机结构完成/浏览器待验 | S1真实IDB前后、S2构建RSC、S3/S4文档资源测试、S5真实Worker合成、S6展示图与产物正文、S7慢网同键同步均有固定fixture/数值或结构证据；数字getter与预算已建。真实浏览器retained heap、long task与Electron RSS因RootSolo限制未采 |
| SS01 | 进行中 | 真正的resident LRU、32MiB软预算、活动/运行/写入/窗口lease及释放收敛已落；云pull也走同一applySessionWindow，100会话逐页入窗后metadata保留、实际resident/window keys≤5；长课/跨设备浏览器场景仍待验 |
| SS02 | 本机结构完成/浏览器待验 | 可重建的sessionSummary按8轮读取，source/product/image refs与逐轮Token估算随contentRevision失效；Agent/Token侧栏不再调用full-load，历史quiz/image点击按轮回读；未知工具part保留来源入口、展开时只回读归属轮原始记录；聊天完整备份按8轮读取，支持文件流时逐段写出，账号或会话revision变化则中止不提交；旧浏览器Blob下载仍会驻留输出字节。1000轮测试不物化messagesById，真实浏览器内存待验 |
| SS03 | 本机结构完成/多标签验收待做 | full与tail已改为head/chunks单事务CAS；1000次完整checkpoint合并、失败保旧/显式重试、删除tombstone和owner命名空间测试通过；含共同基线的full冲突三方合并与尾部纯append冲突回放经真实IDB竞态验证；同ID分歧不猜测覆盖而另存owner-scoped草稿，刷新后可见恢复入口并导出。真实双标签浏览器竞态待验 |
| SS04 | 进行中 | owner epoch/AbortSignal与会话/存储、同步推拉、附件、文档、摘要任务迟到结果隔离已接入；完整备份和冲突草稿导出增加owner快照校验，账号切换时中止文件流；登出停止Account五分钟轮询，focus/登录事件仍校验；Class侧栏异步读取复查owner+epoch、capabilities请求可取消，旧effect清理不再清掉新owner。其他异步任务仍需清点 |
| SS05 | 本机结构完成/浏览器待验 | 19层改为实际打开才挂载，后台笔记候选/记忆收件箱移到轻runtime；50次开关后挂载viewer归零，真实chunk请求/快捷键回归待浏览器验收 |
| SS06 | 本机结构完成/浏览器待验 | Blob URL lease、附件迟到转换/StrictMode、任务栏遗留URL、DOCX纯文本抽取、图片解码失败及下载URL回收已处理；真实retained URL数待浏览器验收 |
| SS07 | 进行中 | PDF loadingTask取消、300页fallback窗口、位图字节预算/卸载归零已接入；真实浏览器选区与缩放待验 |
| SS08 | 进行中 | PPTX媒体URL回收、200页DOM上限/无IO入口、DOCX串行离屏渲染/迟到结果隔离已接入；真实多媒体课件待验 |
| SS09 | 本机索引完整/部署待验 | 模式专属加载、v3数值posting、共享metadata、对齐向量Buffer借用及重试状态机已实现；用户授权后以专用测试账号补齐1228向量，当前45845/45845，深哈希与Worker双模式各8命中，39批中央账本结算0 microcredits；COS/线上尚未更新 |
| SS10 | 本机结构完成/运行待验 | 单Worker持索引、16job/4MiB队列、取消/退出重建、shared core及真实线程测试已落；Web/online/offline路径与包内Worker实体核对通过，实际Electron启动/进程内存待验 |
| SS11 | 本机结构完成/真实provider待验 | health仅stat/manifest并保留显式深检及prebuild闸门；旧索引过期已离线重建，当前contentHash深检通过且API显式报告vectorCoverage；正文fallback有revision/TTL/32MiB LRU，诊断随请求返回、abort贯通，取消rerank不会调用备用计费端点的测试通过；真实供应商取消/结算待集成验收 |
| SS12 | 进行中 | 同键single-drain、稳定id分页、逐页应用/页失败不推进、owner隔离、6MiB加权push、只持久化key的失败重试与SHA-256短指纹已实现；1000次慢上传、分页失败、A/B账号、失败tombstone防复活测试通过；跨设备大payload仍需审查 |
| SS13 | 进行中 | 首页改用生成学科摘要；共享客户端getter改用无正文导航，文章服务端走full manifest；Markdown不重复下传原文、例题只预载首题；超大正文提供受控contentRef点击加载/失败重试，TOC等异步渲染后补建。1430条Web RSC产物总量635.5→318.9MiB，同一路由普通小节188.3→188.4KiB；浏览器划词/可读性仍待验 |
| SS14 | 进行中 | 流式短文本按约16ms合批，停止立即显示全文；显式高亮grammar/aliases和mhchem/sanitize回归通过；artifact/document/imageGen正文迁到owner-scoped逐件IDB，旧根blob确认另存后才缩成metadata，查看窗口lease释放正文，分享/同步按需读完整权威对象且缺正文不误发tombstone；图库生成图按可见tile租约读取。大量卡片DOM/真实堆验收仍待处理 |
| SS15 | 进行中 | 默认desktop:build已切安全staging+package入口，不删除旧产物；online暂存含181展示图；offline-probability档只预渲染该科内容、选科正文/154视频/17MB专属索引且无环境副本。Electron Builder非发布打出portable+NSIS，win-unpacked依赖/Worker/索引及SHA256检查通过；真实Electron启动/浏览器离线验收仍待用户环境，旧破坏性脚本未运行 |
| SS16 | 进行中 | 视频仅点击后挂载；inline播放触发加载、PiP独立eager lease；181张大图衍生2048长边WebP共23.5MiB，原图可点开、失败回退。理论RGBA由3912MiB降为1885MiB（并非同时驻留）；真实病理字迹/滚动解码待浏览器验收 |
| SS17 | 本机生产构建完成/HMR待验 | perf:node/perf:contracts/perf:assets/perf:images/perf:web稳定入口已落；Turbopack宽追踪警告16→10→3→0，最终Web隔离构建status=0、约171秒，online/offline desktop stage与离线Electron包通过。不同源版本耗时不可当受控加速结论，HMR/峰值RSS因RootSolo禁dev server未采 |
| SS18 | 本机门禁完成/部分浏览器端测 | 原始阶段Node1872通过/1可选跳过、React992通过、内容2311；本轮新增Class/索引后隔离Web build通过，完整测试及性能门禁的最终数值见文末补充。Codex浏览器已验证Class单页、题答、图片检索和跨学年Agent；真实ASR、普通Agent SVG、多设备、PDF/PPTX/视频、Electron运行及内存指标仍待验 |

SS00首批基线：`scripts/performance/run-node-memory.mjs`以100个合成会话、每课2条混合消息、先warm5再轮换100的S1固定fixture运行3次（commit均为`441c6f77`、fixture hash `b08bd1ed123b4ffc82e68194ce7c27f4324b81f38b59e95f60575865744ddbc4`，数据在忽略目录`artifacts/performance/`）。三次最终真实`messagesById` resident均为100，`loadedSessionIds`却只有3，`tailCache`为100；这直接确认E01，不以RSS波动推断泄漏大小。Node `--expose-gc`下最终heapUsed约27.66–27.93MiB，RSS约123–140MiB，仅代表本合成localStorage-fallback进程，不是浏览器/生产基线；arrayBuffers包含于external，未相加。数字getter和20次资源注册/释放测试通过；浏览器collector已准备但未执行。S2–S7及真实IDB/浏览器/桌面数值场景随对应工单补充。

SS03修复前回归：`lib/storage/chatStorage.atomic.test.ts`使用fake-indexeddb 6.2.5模拟第二块写入QuotaExceeded，旧会话预期20条，当前实现只能恢复前16条，测试按预期失败；这证明现有先删旧块再写入的路径可损坏权威内容。依赖已精确固定至devDependency并更新lockfile。修复后必须用同一测试证明旧数据完整且新数据仅在事务complete后可见。

阶段性修复证据：同一失败测试现在旧20条/`contentRevision=1`保持可读，显式重试后22条完整；尾段新chunk失败时旧head仍指向16条，重试后18条完整。`chatStorage.queue.test.ts`验证drop不断写链、删除后晚写不复活、1000次完整checkpoint只执行至多一个在途加一个最新快照且registry归零。`chatStorage.owner-epoch.test.ts`验证A排队追加在切B后落回A命名空间。相关老v2/v3测试已改用fake-indexeddb的真实事务替身，Node代码单测在首次原子修复后为1828通过/1可选跳过；后续新改动仍需阶段全量复跑。

SS01结构结果：修复前`chatHistory.lru.test.ts`实际resident 4而LRU仅3，预期失败；修复后以真实keys驱逐并保留IDB全文。初始S1在localStorage fallback里轮换100后resident=100、LRU=3；同fixture改用fake-indexeddb后、修SS01前仍为resident=100。当前策略上限为活动会话+3个非活动窗口（另有显式lease），复测100轮可收敛到4；字节预算保护活动/写入/可见内容，lease释放后压力消退。两套存储后端的heap/RSS不能交叉算百分比，且RSS仍受allocator高水位影响，数值结论待同模式三轮median。

资源生命周期阶段：`ObjectUrlLease`提供refcount与幂等释放，预览组件不再在render/useMemo创建URL；附件hook以当前已接管附件ref为owner，卸载/clear/账号切换释放，迟到转换直接回收。DOCX仅抽文字时不建预览URL，图片解码失败也回收临时URL。PDF当前loadingTask可在换源/关闭时destroy；300页无IntersectionObserver仍只挂当前页窗口，高DPR位图超96MiB时先淘汰不可见远页，canvas卸载归零。PPTX 1.0.7的`pptx.medias` Blob URL由adapter显式回收，200页滚动DOM仍≤12页，迟到load媒体同样回收；DOCX fetch带signal，renderAsync经离屏host和单队列防A/B串写。上述为JSDOM/模拟件结构验收，真PDF选区、真实课件音视频和浏览器retained heap尚未采集。

2026-10-02中途证据（最终结果见末尾）：`perf:contracts`当时编译真实Worker并运行Node 53/53、Vitest 40/40；早期`npm test`为Node1853通过/1可选跳过、React969通过。该阶段`lint:eslint`为0 error/18存量warning，`lint:secrets`对当时2539个tracked文件通过，`check:registry`为0 error/94存量warning。`perf:node`同fixture轮换100会话后resident=4；S5 Worker合成2000行cold约155ms、warm约3ms，RSS从约145MB到185MB；Worker线程成本不能误称RSS优化。所有JSON在ignored `artifacts/performance/`，不含真实付费请求。

构建追踪事件：首轮Next编译/静态页完成，但NFT把仓库根、旧包和一份`.env.production`副本带进standalone；复制到2.8GB时主动中止。仅对本轮生成的两份环境文件副本覆写脱敏，原项目环境文件未动。第二/三轮把dynamic fs标注并改用严格白名单暂存，第三轮online stage完成（当时清单11321文件/约958MB），staging根只有8项、无`.env*`、旧包、旧项目、embed-cache或本地视频。第三轮报告`artifacts/performance/desktop-stage-2026-10-01t23-22-06-390z/build-report.json`。这些数字是打包/构建证据，不是运行时堆。未运行Electron或浏览器，也未声称离线档已通过启动验收。

第四轮追踪补完`lib/content/lectures/paths.ts`后Turbopack宽追踪警告为0；在线stage见`artifacts/performance/desktop-stage-2026-10-01t23-48-14-438z/build-report.json`，Next构建130665ms、总173085ms，清单11502文件/约982MB，含181张展示图。Next原始standalone仍自动带一份`.env.production`，脚本即时将本轮生成副本脱敏且严格白名单不把它复制到stage；原项目环境文件未改。stage核验：无`.env*`、旧Classolo、旧安装包、embed-cache与本地视频，Worker/index/181展示图齐全。相比第三轮Next构建162319ms/总223725ms有改善，但源码和生成资产同时变化，不能据两次值断言一般性提速；缺乏同mode三轮median及峰值RSS。旧失败暂存留在ignored目录，v1展示图移入`.local-archive`，均未删除用户文件。

离线概率论档全链路证据：`desktop:build:staged -- --offline --subjects=probability`独立构建成功，133静态页中概率论内容112、解剖学0；stage约967MB，资源白名单经专属索引替换后约391MB。`content/.index/manifest.json`只含probability，2523 chunks/2523向量（约17MB），Worker关键词/向量各8命中；stage有154个登记视频、无其他学科正文或`.env*`。随后在同一stage上运行`electron-builder --win --publish never`退出0，产出便携EXE约370MB、NSIS约631MB。`perf:package-check`核对`win-unpacked`内server.js/实体Next依赖/Worker/专属索引、127预渲染路由及无环境文件，记录两个EXE的SHA256在ignored `artifacts/performance/package-offline-check.json`。未运行真实Electron进程或浏览器，因此不能声称离线启动、播放与交互验收完成。

SS13正文传输实测：两次`perf:web`均从同一工作树采用独立`.next-perf-web-*`输出且均构建成功。原阈值版本（只延迟>50KiB）对1430个非segment RSC文件合计481.1MiB，最终阈值（考前模拟/实战>20KiB，其他>35KiB）为318.9MiB；与本轮改动前同模式完整页面输出635.5MiB比较，静态RSC总字节减少约49.8%。代表路由`probability/shizhan-yanlian/real-02`从13547.9KiB到29KiB、`real-07`从7684.5KiB到29KiB、`probability/kaoqian-moni/exam-05`从5195.5KiB到29KiB；普通`probability/detail/1.1`为188.3→188.4KiB。此统计是构建产物同路由文件之和，不代表单个用户一次下载318.9MiB；大正文用户点击后仍需从受控`/api/section`取原文并在客户端渲染，必须在浏览器验证首屏/划词/公式与滚动体验。

索引新鲜度闸门先报旧manifest与当前内容不一致。只读cache覆盖核对为45845 chunks、44617已有向量、1228新增无向量、已有向量哈希变化0。`scripts/performance/rebuild-index-offline.ts`只重建BM25/metadata并原样复用逐一验证过的向量，未调用供应商；stage经深度hash、健康文件stat、Worker关键词/向量各8命中通过后，将旧`content/.index`完整移入`.local-archive/index-before-offline-refresh-2026-10-02`，新索引移入原路径。默认`check:index-freshness`现通过，prebuild/staging也包含此门禁。当前`vectorCoverage=44617/45845≈97.32%`，1228新增chunk仅关键词检索可命中；不可宣称全量语义向量完成，未来增量embed是可能计费的独立工作。

SS14对象驻留合成S6：`scripts/performance/run-product-memory.mjs`用固定fixture 50件HTML演示、20篇长文、10次base64生图，save/IDB确认后`artifactBodyEstimatedBytes=documentBodyEstimatedBytes=imageGenBodyEstimatedBytes=0`（fixture hash与RSS在`artifacts/performance/product-memory.json`）。fake IDB仍在该Node进程里持有持久化替身字节，所以该结果只证明Zustand热对象释放，不推断浏览器或Electron进程RSS百分比。迁移测试验证旧根blob在逐件正文确认落盘前不被缩减，viewer/detail/图库的lease释放后恢复为metadata；真实图片滚动与持久恢复待浏览器验收。

SS05/09阶段：DeferredWindowLayers移除idle后全部挂载，按管理窗类型及各store的原始布尔状态条件挂对应dynamic组件；笔记候选与记忆收件箱的后台effect独立常驻，关闭可卸载viewer。关键词检索不触发向量/embedding，向量检索不触发BM25（含diagnostics）；v3 BM25解析保留`Uint32Array`数值posting和docLengths，topK堆/过滤与旧格式同fixture分数一致。BM25/向量共用按文件revision缓存的metadata Map，向量Buffer在对齐/长度/端序允许时零拷贝借用，否则复制一次；加载器支持cold/loading/ready/failed、单飞行与受控重试。S5合成2000行、8维索引首轮主线程基线与迁移后Worker同fixture hit ID完全一致，关键词/向量cold/warm没有调用付费provider；Worker cold启动与线程RSS成本已一并记录。

最终本机验收：最新`npm test`为Node1866通过/1可选跳过、Vitest986通过；`test:content`2311通过；最新`perf:contracts`为Node75与Vitest56通过，包含真实Worker、三方CAS、100页云pull、逐件正文迁移、延迟图库、未知工具按轮回读、rerank取消与大型RSC门禁。`typecheck`与`lint:eslint`退出0（17条存量warning），`check:encoding`3651篇合法UTF-8、`check:lectures`56节、`check:registry`0 error/94存量warning、`check:display-images`181对和`check:index-freshness`深度哈希均通过。最终`perf:web`隔离构建status=0、用时165123ms、不启动服务；其1430条非segment RSC合计318.9MiB。`perf:package-check`离线概率论便携版/NSIS实包结构与SHA256通过。最终staged文件密钥扫描（2611个tracked文件）与`git diff --cached --check`均通过，提交钩子复扫171个代码文件也通过。所有未运行的浏览器/进程级验收、未补齐的1228向量及构建耗时不可比的限制仍按上表保留，不将其写成通过。

14dda6ac提交后的完成度复核：发现`exportAllChats`仍一次装配所有会话及附件，且导出期间账号切换可能得到跨owner的混合JSON；已改为按8轮读取并逐段序列化，浏览器支持File System Access时直写用户选择的文件，owner或会话revision变化就abort部分文件。无该API时仍使用Blob下载，逐轮读取但输出字节必须留在内存，不能称为完全流式写盘。冲突草稿导出也做owner epoch复查。另发现`useAuthSession`在登出后仍每5分钟POST账号会话接口，现只在已登录时轮询；focus和登录事件仍可重建会话。新增4个导出回归、1个登出轮询回归；最新`npm test`为Node1866通过/1跳过、Vitest991通过，`perf:contracts`为Node75+Vitest66通过，typecheck与ESLint退出0（17条既有warning）。这轮尚需当前源码的Web构建和最终暂存扫描，真实浏览器/生产级验收限制不变。

同轮后续收口：Class Workbench的旧owner侧栏读取原先只在完成时检查“当前是否有任意owner”，可把A的课程列表写回B；现每次捕获owner与owner epoch，数据库打开后及查询完成后均复查。capabilities请求换号时abort且解析后再复查owner；旧effect的迟到清理不再停止或清空新owner，真正卸载时仍停止采集并清理本账号。`classolo/tests/session-list-owner.test.ts`以延迟数据库打开、延迟查询、A→B→A epoch变化、旧清理迟到及真实卸载6个场景验证。聊天导出另区分用户取消文件选择、无数据和真实失败，设置页不再把版本冲突误报为“暂无数据”。当前源码`npm test`为Node1872通过/1可选跳过、Vitest992通过，`perf:contracts`为Node81+Vitest67通过；typecheck与ESLint退出0（17条既有warning）。最终隔离Web build status=0、用时222039ms、不启动服务，1430个非segment RSC文件合计318.9MiB。未执行真实浏览器/Electron、多账号云端联调与1228个可能计费的增量向量，仍属待验/待授权项；无这些证据不能标记整个目标完成。

2026-10-02 Codex 补充验收（覆盖上表旧状态，不改写历史测量）：用户明确授权浏览器端测和专用测试账号调用模型。Class 导入→自动导图→刷新持久、单页桌面/390×844 小屏、笔记保存、自动出题与参考答案、课堂 Agent 引用本课文稿，以及跨学年 `getOutline`/`getSection` 真实工具调用均通过。显式 `imageSearch` 在修复自动联网判定后实际返回图片与来源；相关性仍需优化。普通 Agent 一次 SVG 请求输出字面工具调用文本，未形成图；真实麦克风授权在 Codex in-app browser 悬置，ASR 端到端未通过，已修复无法取消的启动状态。SS09 的 1228 条缺失向量在独立 stage 经专用账号中央账本 39 批调用补齐，结算 0 microcredits；深哈希、Worker 双模式各 8 命中后本地归档旧索引并提升新索引。当前为 45845/45845、缺失/变化哈希均 0。完整端测与未验边界见 `docs/analysis/class-audit-2026-10-02/E2E-CLOSEOUT.md`。Electron 真实运行、跨设备同步、浏览器 retained heap 与长课性能仍未有数值证据。

该补充的最终自动门禁：`npm test` Node1877通过/1可选跳过、Vitest1001通过；`perf:contracts` Node82+Vitest67、`test:content`2311、typecheck、index深哈希、密钥扫描与隔离`perf:web`构建均通过；ESLint 0 error/17 条既有 warning。Web构建用时406089ms且`serverStarted=false`，不能与旧源码构建用时直接计算优化收益。
