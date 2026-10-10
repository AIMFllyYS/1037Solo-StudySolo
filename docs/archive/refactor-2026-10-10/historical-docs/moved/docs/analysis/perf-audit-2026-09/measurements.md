# 实测数据（Phase B）

> 审查日期：2026-09-23。测试机：Windows 桌面（Node v24.15.0，tsx 运行 V8）。
> 所有数字均来自本机实测或 `.next` 产物直接统计，非估算；浏览器端耗时预计为同量级（V8 同源），IDB 磁盘读取未含在内（见文末限制）。

## 1. 生产构建与 eager chunk 归因

`npx next build`（Turbopack，编译 23.6s；typecheck 被 `scripts/archive/tmp-2026-09/` 归档脚本预存在问题挡住，与本次无关）。

- `.next/static/chunks` 总计 **12MB**（原始体积，未 gzip）。
- 每路由 `build-manifest.json` 初始文件：全部路由相同的 6 个文件 = **447KB**（框架+共享 runtime）。
- **根 layout 客户端闭包**（`page_client-reference-manifest.js` 中 `layout-router <module evaluation>`，`async:false`）：**31 个 chunk = 3,561KB**，在 `/login`、`/class`、`/agent`、`/c/[sessionId]`、`/[subject]/[category]/[id]` 上完全一致。

根 layout eager 闭包中的重型 chunk（实测文件大小）：

| chunk | 内容 | 大小 |
|---|---|---|
| `33p_gxuvkq3wy.js` | KaTeX+mhchem + micromark + react-markdown | 700KB |
| `1zwnzlpj5ztd4.js` | zod（经 `ai` SDK 链） | 326KB |
| `070ayc3s2d327.js` | @supabase/supabase-js | 217KB |
| `1vln9woc2q0sb.js` + `2ici4bo-2yr_z.js` | vidstack | 258KB |
| `0k4sau-f9-h2f.js` | RDKit 初始化模块 | 104KB |
| `11057g2ryx3ir.js` + `2gkee_3bhzj8e.js` | MobileMiniChat/聊天相关 | ~131KB |
| 其余 ~22 个 | 指令注册表/画布/UI 等 | ~1.8MB |

结论：**`AppShell → MobileMiniChat` 静态边把整套聊天渲染栈拉进所有路由的 eager 闭包**，连 `/login` 也下载+解析 3.5MB JS（SA-4 P0 由产物实证，非推断）。对照：`milkdown` chunk（966KB）不在任何路由的 eager 闭包——二段懒加载生效。

## 2. 长会话读写路径合成基准

脚本：`scripts/perf-bench-session.ts`（`npx tsx scripts/perf-bench-session.ts`，可重复）。
消息体：user ~100 字、assistant ~3.9KB 正文 + reasoning + 1/3 带工具 part（轻量档）；重度档叠加 ~12KB×9 的 webSearch/readNotes 型输出（模拟未被 stub 的工具大输出）。

### 轻量档（平均 ~4.9KB/条）

| 消息数 | JSON 体积 | serialize/flush | 读路径合计 | updateMessage map/tick |
|---|---|---|---|---|
| 200 | 0.48MB | 1.4ms | 0.6ms | ~0ms |
| 500 | 1.19MB | 1.9ms | 1.5ms | ~0ms |
| 1000 | 2.38MB | 4.0ms | 2.9ms | ~0ms |
| 2000 | 4.75MB | 8.9ms | 6.1ms | ~0ms |

### 重度档（内存中含大工具输出）

| 消息数 | 内存中 JSON 体积 | serialize/flush | 读路径合计 |
|---|---|---|---|
| 200 | 20.3MB | 21.4ms | 9.0ms |
| 500 | 50.8MB | 52.1ms | 21.0ms |
| 1000 | 101.6MB | 103.5ms | 52.8ms |

### 基准结论

1. **成本与「内存中消息体积」线性**：serialize ≈ 1ms/MB，读路径 ≈ 0.5ms/MB（桌面 V8）。
2. 纯文本会话（≤5MB）的单次 parse/serialize CPU 开销本身不大；**真正的放大器是内存中保留的工具输出体量**——`readProjectSlices`、`drawDiagram`、`getProjectFiles`、`proposeMemory` 四个工具的输出**不在任何 compact stub 集合**（`lib/chat/compactStudyParts.ts:13-36`），全量驻内存并随每次 flush 全量序列化。含这类输出的会话到 50-100MB 时，每次 flush 阻塞主线程 52-104ms（流式期每 800ms 一次 = 持续可感知卡顿）。
3. `updateMessage` 的 `prev.map` 数组复制本身可忽略（2000 条 ~0ms）——其真实代价是**新数组引用触发的下游重渲与 manifest 判断**，属渲染管线问题（见 d2）。
4. 实测未含：IndexedDB blob 读延迟（大 blob 的 structured-clone + 磁盘 IO 可能再 +50-150ms）、浏览器 parse 的 GC 压力（100MB 字符串峰值驻留）。

## 3. 静态体量统计

| 项 | 体积 | 说明 |
|---|---|---|
| `content/` | 685MB | 全部课程/素材源文件（构建期消费，不发客户端） |
| `content/.index/` | **295MB** | 检索索引：`vectors.bin` 175MB + `bm25.json` 91MB + `chunks-meta.json` 40.7MB + `vectors.ids.json` 1.6MB |
| `lib/content-data/nav.generated.json` | 339KB | 经 `lib/stores/ui.ts` 静态进客户端（SA-4 P1） |
| `lib/content-data/lectures.generated.json` | 50KB | 同上 |
| `lib/content-data/media.scripts.generated.ts` | 397KB | 已二段懒加载（ids 2.8KB 静态 + 本体 dynamic）✓ |
| `lib/content-data/media.generated.ts` + `media.physics.generated.ts` | 52+83KB | 经 MediaEmbed 注册表静态进 eager 闭包 |
| `lib/i18n/` | 245KB | 双语言词典，root layout 静态引入 |
| 安装体积（参考） | pdfjs 40MB、zod 5.7MB、katex 6.8MB、milkdown ~9MB、vidstack 3.5MB | node_modules 磁盘，非 bundle 体积 |

## 4. 复核记录（主代理逐条验证的 P0）

| 发现 | 验证方式 | 结果 |
|---|---|---|
| MobileMiniChat 静态链 → 全站 eager | 源码链 + build manifest `async:false` 闭包 | ✅ 3.56MB/路由 |
| `applyChatPayloadToZustand` 不登记 `loadedSessionIds` → pull 的会话正文永久驻内存 | `lib/sync/engine.ts:656-677` 直读 | ✅ setState 只写 `messagesById`，LRU 无法驱逐 |
| `vectorSearch` 全库线性扫描 | `lib/ai/search/vectorStore.ts:277-297` 直读 | ✅ 每行 1024 维余弦，`TopKMinHeap` 只优化 topK 不优化扫描 |
| PDF `mountedPages` 只增不减 | `PdfDocumentPane.tsx:223-252` 直读 | ✅ 无移除分支；无 IO 环境退化为 `mountAll` |
| `compactStudyParts` stub 集合缺口 | `compactStudyParts.ts:13-36` 对照 `STUDY_TOOL_NAMES`（21 工具） | ✅ `readProjectSlices`/`drawDiagram`/`getProjectFiles`/`proposeMemory` 无 stub |
| virtual-core `anchorTo`/`takeSnapshot` | `@tanstack/virtual-core@3.17.2` dist 类型 | ✅ 已内置，ChatThread 未启用 |

## 5. 未测项（诚实声明）

- 浏览器内 IndexedDB 真实 key 大小与读延迟（需 DevTools/`navigator.storage.estimate()`，报告中以「需实施期补测」标注）。
- React Profiler 渲染耗时（无浏览器）；`MessageContent` 每 tick 全量重解析的 ms 数为按管线构造的工程估算（KaTeX ~1-5ms/公式为社区公认量级）。
- `sync_documents` 表行数与单次 `api.list` 传输字节（需线上/本地实例抓包）。
- Electron standalone 产物残留（需解包 `du`）。
