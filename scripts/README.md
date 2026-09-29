# scripts/

仓库脚本分三类。构建链脚本挂在 `package.json` 的 `prebuild` / 独立 npm script 上；其余默认不进入生产构建。

## 构建链脚本

`prebuild` 按顺序调用：

1. `check-content-encoding.mjs`
2. `gen-lectures-manifest.ts`
3. `check-lectures.ts`
4. `gen-nav-manifest.ts`
5. `check-registry-consistency.ts`
6. `gen-script-ids.mjs`
7. `check-katex-chars.mjs`
8. `check-recording-example-latex-escapes.mjs`
9. `check-media-sync.mjs`
10. `check-prose-svg-rules.mjs`
11. `run-unit-tests.mjs`（带 `--filter=code`，不含内容校验）

独立构建入口：

- `build-index.ts` — 语义检索索引（`pnpm build-index`）
- `build-desktop.mjs` — Electron 桌面包（`pnpm desktop:build`）
- `gen-icon.mjs` — 桌面图标生成
- `run-all-tests.mjs` — `pnpm test`：代码单测 + vitest，取最差退出码（`--include-content` 时含内容校验）

## 内容 SOP 工具（可复用）

顶层、可按 SOP 重复跑的导入/清洗/校验工具，例如：

- 教材导入：`extract-textbook-pdf.py`、`extract-scanned-textbook.py`、`ingest-sophomore-textbooks.py`、`fallback-{docx,pdf,pptx}.py`
- 图片与卡片：`propagate-images.py`、`propagate-images-chemistry.py`、`embed-missing-figures.py`、`add-knowledge-cards.py`、`add-memory-cards.py`、`enhance-medical-markdown.py`、`enrich-anatomy-textbook.py`
- 校验与渲染：`parse-docs.ts`、`verify-models.ts`、`test-render-all.mjs`、`check-physics-recording-quiz-quality.mjs`
- Markdown 修补：`fix-katex-circled-numbers.ts`、`fix-section-headings.ts`、`cleanup-noise-lines.ts`、`fix-math-entities.mjs`、`fix-math-fences.mjs`、`fix-bare-directive-labels.mjs`
- 目录/摘录：`dump-textbook-toc.py`、`build-instrumental-analysis-toc.py`、`extract_units.py`、`render_pdfs.py`、`strip-nul-titles.py`

子目录：

- `content/` — 内容抽取辅助（docx 图文、纪要）
- `media/` — 视频海报与 COS 上传
- `workflows/` — 章节生成工作流
- `legacy/` — 已弃用的构建辅助，见该目录 README

## 本地产物板块（均被 `.gitignore` 忽略，不进版本库）

约定：**日志、临时产物、归档一律归入下列板块，不再散落在仓库根目录。**

| 目录 | 用途 |
|---|---|
| `logs/` | 运行/构建/调试日志（`dev-server.log`、`.build_content*.log` 等重定向输出） |
| `archive/` | 历史一次性脚本；`archive/tmp-2026-09/` 为 2026-09-22 从根 `tmp/` 归位的历史临时产物（探针脚本、验收截图、转储、issue 草稿等） |
| `temp/` | 内容处理中途的工作目录 |
| `handoffs/` | 交接文档 |
| `pdf_extracts/` / `transcripts/` | PDF 抽取与逐字稿中间产物 |

> 运行时的 Agent 生命周期日志 `log/agent-lifecycle.jsonl` 路径由
> `lib/ai/observability/agentLog.ts` 写死为仓库根 `log/`，**不要挪动**；
> 数据库备份默认写到 `tmp/db-backups`（见 `lib/db/backup.ts`），同样保持原位。

## `one-off/`（历史任务，不保证可运行）

章节号硬编码、任务已完成的一次性脚本。计划 18 从顶层移入，共 36 个（计划原文写 35，清单实际 36：34 个脚本 + 2 个 txt）。

不保证路径、依赖或输出仍有效。若需重跑，先核对自己注释里的相对路径。
