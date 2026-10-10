# 修复路线草案（fix-roadmap）

> 供下一阶段细化实施计划用。批次按「依赖 × 收益/成本」排；每项标注证据、改动面、回退点。P0/P1 条目引用 `00-summary.md` 编号与各 d 报告。

## 总原则

- 一切修复在新分支实施（从 main/development 切 `perf/*`）；本阶段不动生产代码。
- 每批次先加**回归基线**（测试/benchmark/计数器）再改代码——项目缺性能回归护栏（1228 测试只覆盖正确性）。
- 不推翻「五件套」既有优化，只补缺口。

## B1 快赢批（改动小、独立、立即可感知）

| 项 | 证据 | 改动面 | 回退 |
|---|---|---|---|
| MobileMiniChat → `dynamic(ssr:false)`（含同组 mobile-only 组件逐个评估） | D4-P0-1，/login eager 3.56MB | `AppShell.tsx:45-51` 数行；注意 ChatInput/ChatThread 仍被 ChatPanel dynamic 边界覆盖，勿双份 | 还原 import 即可 |
| 附件 object URL 泄漏：local-file/document 改「存源不存 URL」或统一 revoke 清单 | D7-P0-2 | `imageUtils.ts` 附件构造 + `WindowTaskbar`/useImageAttachments 清理路径 | 保留旧 dataUrl fallback 一读 |
| `sessionsMeta` 每 tick 门控（preview/messageCount 真变才更新引用） | D2-P1-2 | `chatHistory.ts` updateMessage 分支 | 单点改动 |
| 目录数据按需：contentTree/nav/lectures 出基础包 | D4-P1-2 | `lib/stores/ui.ts` 引用方改 lazy/分层 | JSON 仍在可回退 |
| Electron 首窗 reload 移除 | D3-P1-6 | `electron/main.js:309-328` + settings hydrate 补标志 | 保留 reload 开关 flag |
| `compactStudyParts` stub 集合补 `readProjectSlices`/`drawDiagram`/`getProjectFiles`/`proposeMemory`（含 contextKey 取回路径设计） | measurements §2 + `compactStudyParts.ts:13-36` | 一处集合+回灌语义（服务端须能按 contextKey 回灌，联动 sync/payload） | 集合可回退 |

**预期**：/login eager 3.56MB→~1MB；附件泄漏封堵；流式期侧栏重渲税去除；大输出会话内存基线下降。

## B2 旗舰：会话窗口化（v3 分块 + spine + 定位器按需加载）

依赖：B1 的 compact 补齐（降内存基线）非硬依赖可并行；**前置 spike：`anchorTo:'end'` prepend 实测无跳**（virtual-core 3.17.2 已内置，`ChatThread.tsx:185-189` 尾行保护逻辑需保留）。

| 步 | 内容 | 关键文件 |
|---|---|---|
| B2-0 | Spike：ChatThread 开 `anchorTo:'end'` + `initialMeasurementsCache`/`takeSnapshot`，验证 prepend 无跳 + 流式尾行兼容 | `ChatThread.tsx`、`ChatThread.virtual.test.tsx` |
| B2-1 | v3 存储：轮次分块 key + 独立 `chat-spine:<id>` + head（meta/blobIds/尾块引用）；写路径只重写尾块 | `chatStorage.ts` 新增模块；`idbStorage.ts` key 约定 |
| B2-2 | store 改造：`messagesById`→区间集合；`ensureSessionLoaded` 只读尾 3-4 轮；`loadOlderTurns`/`loadTurnRange` API | `chatHistory.ts` |
| B2-3 | 调用方同步改造（**防静默丢上下文，d1 §C 全表**）：sendMessage 请求范围加载、sync assemble/指纹、GC 读 head、导出 assemble | `sendMessage`/`buildRequestMessages`、`engine.ts`、`gcOrphanedChatKeys`、export |
| B2-4 | UI：顶部「加载更多」+ Dots 改吃 spine + 点击未加载轮→loadTurnRange→scrollToIndex 区段首行→精跳 | `ChatThread.tsx`、`ChatMessageDots.tsx` |
| B2-5 | 迁移：打开时 v2→v3 惰性切分（先写 chunks 再删 blob，chunks 优先读）；`storageVer` 标记 | `chatStorage.ts` migrate 段 + bootstrap 链 |

**风险**：sync 双端版本不一致期（旧端全量 payload vs 新端分块）——保留 v2 读写兼容一个周期；迁移中途崩溃→chunks 优先+旧 blob 保留。
**验收**：500 轮会话 TTFP<300ms、内存增量<20MB、Dots 全轮可点、prepend 无跳（录屏/trace）、flush<10ms。

## B3 渲染中央：流式 markdown 分段（可与 B2 并行）

| 步 | 内容 |
|---|---|
| B3-0 | 护栏：`ReactMarkdown` 执行计数 + `runSync` 耗时打点（测试环境 mock 记数）；基线「每 tick 渲染=1 条流式消息+尾块」 |
| B3-1 | `parseChatContent` 拆「已完成前缀」与「增长尾块」；前缀每 block 包 `React.memo<MarkdownBlock>`，尾块独立 ReactMarkdown |
| B3-2 | KaTeX 内容寻址缓存 `Map<tex,html>`（math 节点级）；评估 rehype-katex 惰性 |
| B3-3 | 放大器：AgentChatCenter 派生 hook 增量聚合；ArtifactCard SSE 接入节流；浮窗 `onFollowUpClick` 稳定引用；`useChatReady` 加 selector |

**风险**：分段边界遇不完整 markdown（未闭合围栏/公式）→ 尾块判定以「最后一个完整顶层块」为准，宁可多划进尾块。**勿依赖** `useMemo([parts])` 流式期不重算的偶然正确（d2 已警示）。

## B4 服务端/同步（独立域，可并行）

| 步 | 内容 |
|---|---|
| B4-1 | pull 增量：`sync_documents` 加 updated_at/指纹过滤 + apply 字节相等短路（联动 merge.ts:39-54）；`pushOne` api.get 改批量/并发池≤6 |
| B4-2 | pull 正文登记 `loadedSessionIds` 或只写 meta（B2 后自然消解；B2 前先治） |
| B4-3 | 向量检索：行范数预算 + subjectId 分桶倒排 + prefer/学年放宽合并为加权单遍 |
| B4-4 | semantic 检索短 TTL 缓存 + 与模型调起并行；Auto 路由规则优先 |
| B4-5 | agentLog 异步批量写；上行历史 ≤800KB 改请求范围（联动 B2-3） |

## B5 阅读器与内容页

| 步 | 内容 |
|---|---|
| B5-1 | PDF `mountedPages` 有界 LRU（近 ~15-20 页留 canvas，远页回占位/位图置 1×1）；zoom 重渲峰值同步受控 |
| B5-2 | PPTX resize 改 CSS 缩放不重建（档位阈值才重渲） |
| B5-3 | Quiz 评分分页/虚拟化（首屏+IO 逐步），或单 processor+分段 memo |
| B5-4 | 笔记 split：预览分块 memo（复用 B3-1 方案）+ TOC 增量 |
| B5-5 | 统一「有界驻留」抽象：LazyVisible 加 `maxMounted`（例题/交互/附件预览通用） |

## 跨批公共

- **性能回归护栏**（B1 起逐步）：`perf-bench-session.ts` 入 CI；ReactMarkdown 计数测试；`data-render-count` 基线；`navigator.storage.estimate` 采样脚本；build manifest 断言（/login eager 不含 markdown/supabase chunk）。
- **未实测项**（实施期 DevTools/实例补测）：IDB 真实 key 大小、sync 表行数与传输字节、standalone 残留、PDF/quiz/split 真实帧耗、index RSS。
- **文档**：修复后回写各 d 报告状态列；`docs/refer/performance-audit-report.md` 标记 superseded 段落。

## 依赖关系图（简化）

```
B1(快赢) ──┐
           ├─→ B2 窗口化(旗舰) ──→ 验收: 长会话打开/定位器/写放大
B3 分段渲染 ┤        └─→ B2-3 联动 sendMessage/sync/GC
B4 同步/检索┘
B5 阅读器（独立，按使用频排）
```

**建议执行顺序**：B1 →（B2 spike 先行）→ B2 与 B3/B4 并行 → B5 穿插。每批独立可发布，回退点均为「还原该批文件」粒度。
