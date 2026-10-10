# StudySolo 性能专项全量审查 · 汇总报告

> 日期：2026-09-23 · 范围：**仅性能**（不审正确性/安全/产品）· 方式：7 个并行只读子代理静态审查 + 主代理实测复核（`measurements.md`）。
> 子报告：[d1 会话窗口化](d1-windowed-session.md) · [d2 聊天渲染](d2-chat-rendering.md) · [d3 持久化/同步/启动](d3-persistence-sync-startup.md) · [d4 Bundle/构建](d4-bundle-build.md) · [d5 内容页/阅读器](d5-content-readers.md) · [d6 检索/API](d6-search-api.md) · [d7 内存/CSS](d7-memory-css.md) · [实测数据](measurements.md) · [修复路线](fix-roadmap.md)

## 执行摘要

本项目已有扎实性能底子（流式双节流、ChatThread 真虚拟化、LazyVisible、dynamic 分割、SSR 预渲染、存储 v2 分 key + blob 槽 + LRU），上一轮审计的多数项已落地。本次复审确认**剩余债务集中在四个"全量放大"结构**：

1. **会话粒度全量 IO**：打开=整 blob parse+三重处理、每次 flush=全量 serialize（~1ms/MB），内存常驻=全量消息数组×3 会话；含未 stub 工具输出的会话达 50-100MB → 每次 flush 52-104ms 主线程。**窗口化（按轮分块+spine）是唯一同时解决 CPU/内存/定位器可达性的方案**——设计要点已在 d1 给出（轮次边界干净、virtual-core 3.17.2 内置 prepend 锚定、spine 独立 key 不进 manifest）。
2. **根 layout 把整套聊天栈拉进全站 eager**：`AppShell→MobileMiniChat` 静态边使**每个路由（含 /login）eager 3.56MB JS**（markdown 栈 700KB、zod 326KB、supabase 217KB、vidstack 258KB）——产物 manifest 实证，一处 `dynamic()` 即可卸掉大头。
3. **渲染管线中央的 O(n²)**：`MessageContent` 每 tick 对累积全文重跑完整 unified 管线 + react-markdown 每次重建 processor；KaTeX 密集回答单 tick 估算 50-250ms。需分段 memo（已完成前缀 vs 增长尾块）。
4. **同步/检索/阅读器的无界放大**：登录冷启动 ~315 实体串行 api.get（15-45s 网络排队）；pull 的远端会话正文不登记 loadedSessionIds 永久驻内存；向量检索 42,771×1024 维线性扫描且可放大 3 遍（1-4s/次）；PDF 已渲染页永不卸载（dpr2 ~14.5MB/页，200 页 ≈2.9GB）；local-file/document 附件 object URL 全清理路径结构性跳过（确定性泄漏）；Quiz 交卷一次性 ~400 个 markdown 实例。

## 现状架构（已做对的防线）

| 层 | 机制 | 状态 |
|---|---|---|
| 渲染 | ChatThread useVirtualizer+measureElement+fallback 14 条 | ✅ 真虚拟化 |
| 流式 | streamUiThrottle 60ms trailing + finally flush | ✅ |
| 持久化 | idbStorage 800ms 防抖+惰性 stringify+pagehide/visibility flush | ✅（降频不降单次成本） |
| 存储 | v2 分 key（manifest+per-session+blob 槽）+MAX_SESSIONS=50+LRU=3 | ✅ 会话级懒，**会话内仍单 blob** |
| 懒加载 | 19 窗层 ssr:false+idle 门控；pdfjs/milkdown/interactives/讲稿全懒 | ✅ 纪律良好 |
| 内容页 | SSG + NoteRendererServer 服务端渲染正文 | ✅ |
| 服务端 | heartbeat/failover/quota TTL/contextKey 去重/maxRetries:0 | ✅ |

## 全量发现清单（按优先级）

### P0 — 主路径可感知卡顿 / 无界放大 / 确定性泄漏（9 项）

| # | 板块 | 发现 | 位置 | 一句话 |
|---|---|---|---|---|
| P0-1 | D4 | MobileMiniChat 静态链 → 全站 eager 3.56MB | `AppShell.tsx:51` | /login 也下载整套聊天栈；一处 dynamic() 卸载 |
| P0-2 | D2 | MessageContent 每 tick 全量 unified 重解析 | `MessageContent.tsx:285-308` | O(L²)，KaTeX 密集单 tick 估算 50-250ms；分段 memo |
| P0-3 | D1 | 会话单 blob 全量读+全量 serialize | `chatStorage.ts:183-204` | ~1ms/MB/flush；50-100MB 会话 52-104ms；窗口化治本 |
| P0-4 | D1 | 无 spine → 定位器/窗口化结构性不可行 | `ChatMessageDots.tsx` | 需每会话轮次级 spine（独立 key） |
| P0-5 | D3 | 登录冷启动全表 pull+串行 push ~315 RTT | `engine.ts:891-929` | 15-45s 网络排队+水合风暴同窗；增量+并发 |
| P0-6 | D3 | pull 会话正文不登记 loadedSessionIds 永久驻内存 | `engine.ts:656-677` | ≤50 会话全文常驻，LRU 无法驱逐（已复核） |
| P0-7 | D6 | 向量检索 42,771×1024 线性扫描×最多 3 遍 | `vectorStore.ts:277-297` | 单次 searchNotes 最坏 1-4s+6 RTT；分桶+范数预算 |
| P0-8 | D5/D7 | PDF mountedPages 永不卸载 | `PdfDocumentPane.tsx:223-252` | dpr2 ~14.5MB/页，200 页≈2.9GB；有界 LRU |
| P0-9 | D7 | local-file/document 附件 object URL 结构性泄漏 | `imageUtils.ts:229-230` | 所有清理路径跳过；URL→可重建源+随用随销 |

### P1 — 明确浪费但有缓解（17 项，节选）

| 板块 | 发现 | 位置 |
|---|---|---|
| D1 | persistManifest 每次会话级变更整段 stringify | `chatStorage.ts:179-181` |
| D1 | pickRicherMessage 全同 id 也双评分 | `sync/merge.ts:39-54` |
| D1 | 附件水合串行 / extractBlobIds 全扫 | `chatStorage.ts:256-267,362-403` |
| D2 | updateMessage 每 tick 重建 sessionsMeta 全量重渲 | `chatHistory.ts` updateMessage 路径 |
| D2 | AgentChatCenter 三派生 hook 每 tick 全扫 parts | `AgentChatCenter.tsx` |
| D2 | ArtifactCard 自带 SSE 绕过节流 | ArtifactViewer 相关 |
| D3 | flushPendingWrites 多 key 同步 stringify 风暴 | `idbStorage.ts:95-97` |
| D3 | 孤儿 GC 读全部会话正文 | `chatStorage.ts:461-510` |
| D3 | ~12 store 模块求值即水合风暴 | `_persist.ts:22-35` |
| D4 | ui.ts 静态吃 contentTree+nav(339KB)+lectures(50KB) | `lib/stores/ui.ts` |
| D4 | i18n 双词典 245KB + supabase 进 root | `app/layout.tsx` 链 |
| D4 | 全局 CSS ~300KB 级（KaTeX/Vidstack 样式无条件下发） | `app/styles/` |
| D5 | PPTX 宽度 ≥8px 变化即整包重解析 | `PptxDocumentPane.tsx` |
| D5 | 笔记 split 每按键四连（序列化/TOC/全文预览） | `MilkdownNoteEditor` 链 |
| D5 | LazyVisible 假虚拟化普遍（挂载不卸载） | `LazyVisible.tsx` 各使用点 |
| D6 | 索引常驻 ~300-450MB + chunks-meta 双份 parse | `.index/` 实测 295MB |
| D6 | semantic 模式 hybridSearch 进 TTFB（+0.5-3s） | `semanticSearch.ts:40-78` |

> 完整 P1/P2 条目见各 d 报告；P2 共 ~20 项（跳转精度、死 CSS、浮窗上限、文档续写重送、outline 重建、构建 NFT 过追踪等）。

## 优先级矩阵（建议实施顺序，详见 fix-roadmap）

| 批次 | 项 | 理由 |
|---|---|---|
| **B1 快赢**（改动小收益大） | P0-1 MobileMiniChat dynamic() · P0-9 附件 URL 泄漏 · D3-P1 Electron reload · D2-P1 sessionsMeta 门控 · D4-P1-2 目录数据按需 | 均<1天级，立即可感知 |
| **B2 旗舰**（用户核心诉求） | P0-3+P0-4 会话窗口化（v3 分块+spine+Dots 按需加载+prepend 锚定） | 最大单项；需先 spike anchorTo 验证 |
| **B3 渲染中央** | P0-2 分段 markdown memo + KaTeX 缓存 | 流式卡顿主因；与 B2 解耦可并行 |
| **B4 服务端/同步** | P0-5 pull 增量+并发 · P0-6 内存登记 · P0-7 向量分桶 · D6-P1 agentLog 异步 | 独立后端域 |
| **B5 阅读器** | P0-8 PDF LRU · D5-P1 PPTX resize · P0-quiz 分页 · D5-P1-4 笔记 split | 按使用频率排 |

## 风险与依赖

- **窗口化最大坑在调用方**：`sendMessage` 请求构造、sync payload、GC、导出都假设全量数组——d1 §C 已列全部改造点，漏改=静默丢上下文。
- `anchorTo:'end'` 未实证（库已内置），prepend spike 是 B2 前置。
- `compactStudyParts` stub 缺口（`readProjectSlices`/`drawDiagram`/`getProjectFiles`/`proposeMemory`）独立于窗口化也可先补——降低大输出会话的内存基线。
- Electron/standalone 产物残留与 NFT 过追踪未实测（P2，实施期 `du` 验证）。

## 验收指标建议（写入实施计划）

- 打开 500 轮会话：TTFP(尾部轮次) < 300ms；内存增量 < 20MB
- 流式期：每 tick 渲染数 = 1 条流式消息+尾块；单次 flush < 10ms（分块后）
- `/login` eager JS < 1.2MB（修复后）
- PDF 滚 200 页：canvas 常驻 ≤ ~20 页；heap 增量 < 300MB
- 登录冷启动：api.get 次数 < 20（增量+并发后）；pull 后 `messagesById` 不持有非 active 正文
- `searchNotes` p95 < 500ms（单遍扫描+分桶后）
