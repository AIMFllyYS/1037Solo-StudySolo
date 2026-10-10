# perf-audit-2026-09 — 性能专项全量审查

对 StudySolo（Next.js 16 + React 19 + zustand/IndexedDB + Supabase + Electron）的**仅性能维度**全量审查。审查日 2026-09-23。

## 阅读顺序

1. **[00-summary.md](00-summary.md)** — 执行摘要 + 9 个 P0 / ~17 个 P1 / ~20 个 P2 全量清单 + 优先级矩阵 + 验收指标
2. **[measurements.md](measurements.md)** — 实测数据：构建 chunk 归因（/login eager 3.56MB 实证）、长会话读写基准、体量统计、P0 复核记录
3. 板块详单（发现均带 file:line 证据与验证方式）：
   - [d1-windowed-session.md](d1-windowed-session.md) — **旗舰**：长会话按轮窗口化（单 blob 全量 IO → v3 分块 + spine + 定位器按需加载 + 迁移方案）
   - [d2-chat-rendering.md](d2-chat-rendering.md) — 流式渲染管线（每 tick 全量 unified 重解析 O(n²) 等）
   - [d3-persistence-sync-startup.md](d3-persistence-sync-startup.md) — 持久化/云同步/启动水合/Electron
   - [d4-bundle-build.md](d4-bundle-build.md) — Bundle 与构建（MobileMiniChat 静态链实证）
   - [d5-content-readers.md](d5-content-readers.md) — 内容页/文档阅读器/交互组件（PDF 永不卸载、Quiz 秒级阻塞等）
   - [d6-search-api.md](d6-search-api.md) — 检索与 API（向量线性扫描、索引 300-450MB、TTFB 串行链）
   - [d7-memory-css.md](d7-memory-css.md) — 内存/资源/CSS（附件 object URL 结构性泄漏等）
4. **[fix-roadmap.md](fix-roadmap.md)** — 修复路线草案：B1 快赢 → B2 窗口化旗舰 → B3 渲染中央 → B4 服务端/同步 → B5 阅读器

## 方法

7 个并行只读子代理分板块静态审查 + 主代理实测复核：`npx next build` chunk/manifest 归因、合成会话基准（`scripts/perf-bench-session.ts`，200-2000 条 × 轻/重两档）、体量统计（content 685MB / .index 295MB）、全部 P0 逐条源码复核。

定级：P0 = 主路径可感知卡顿或无界放大/确定性泄漏；P1 = 明确浪费有缓解；P2 = 优化机会/防债。

## 与旧审计的关系

`docs/refer/performance-audit-report.md` 与 `docs/analysis/9-9/07-performance-optimization.md`（截至 v0.4）中多数项已落地；本报告为其**现状复审+补缺**，冲突处以本报告为准。修复完成后请回写各 d 报告状态列。
