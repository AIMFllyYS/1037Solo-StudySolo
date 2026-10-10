# SOP 12 · 课堂四材料接入（逐字稿 / 纪要 / 可视化笔记 / 手卡 + 题）

## 适用场景

把一节课的课堂产物（由 hust-study-workflow 在云盘侧产出）接入本仓库，使其成为一个可阅读、可检索、可出题、四材料共享同一套题的课节。一节课 = 一个课节目录 + 一套题。导航上分挂两个板块：**课上录音（recording）**下挂课节父节点与「课堂原文 / 课堂笔记 / 复习手卡」3 个叶子，**课堂纪要（summary）**下挂「课堂纪要 minutes」叶子（物理文件仍统一在 `lectures/<lessonId>/` 目录，不拆分）。

与旧 `03-recording-processing.md` 的区别：03 只产出单篇课堂材料；本 SOP 面向**四材料打包接入 + 严格校验 + PR 合入**，并冻结目录形态与作者契约。

规划依据：`docs/archive/refactor-2026-10-10/historical-docs/moved/docs/analysis/Content/2026-09-13-classroom-content-integration-plan.md`（P0 契约 / P1 只读文章链 / P2 学习闭环 / P3 内容同步）。

## 输入物料

来自云盘「学习笔记/学期-课程名/」的一节课，四份原始材料（命名以 hust-study-workflow 为准）：

1. **逐字稿**（课堂录音原文，`@说话人 N HH:MM` 轮次）→ `recording.md`
2. **课堂纪要 MD**（整理后结构化纪要）→ `minutes.md`
3. **可视化笔记 HTML**（notes-to-handbook 产出，自包含静态页）→ `notes.html`
4. **复习手卡 MD**（study-notes-cards 内容版，`:::memory{...}` 块）→ `cards.md`

外加：课表推算出的**课程内累计节次**、上课日期、主题，以及按 `04-quiz-generation.md` 出的一套题。

## 执行角色分配（主控 + subagent 拆分）

- **主控**：确定 subjectId / lessonId / quizId，建目录、写 `lesson.json`，跑生成器与校验，提交 PR。
- **内容 subagent（每课一个，必要时并行）**：把四份云盘原料落到四个固定文件并做受控清洗（逐字稿只清口语噪音不改事实；HTML 去脚本/外链；手卡统一 reveal）。单 subagent 一次不超过 3-4 节课。
- **验收 subagent（视觉模型）**：本地起站，逐材料截图核对渲染（见「视觉验收」）。

## 步骤流程

### 1. 定位学科与 ID（先于一切写盘）

- 课程名 → subjectId 用 `lib/content/lectures/subjectAliases.ts` 的白名单；**分析化学 = `instrumental-analysis`，绝不能并进 `chemistry`（有机化学）**。白名单外课程（如创新管理、医学研究规范与技能）直接报错停下，先扩白名单并评审，不静默就近归类。
- lessonId：`rec-YYYY-(spring|fall)-SSS[-EEE]`，节次为**课程内累计节次**（单节 `rec-2026-fall-007`，连堂 `rec-2026-fall-007-008`）。
- quizId 与 lessonId 同名。
- 四个材料 articleId 由前缀拼出：`rec-/min-/note-/card-` + lessonId（见 `roles.ts`），作者不要自造。

### 2. 建目录并落 6 个文件

```
content/<subjectId>/lectures/<lessonId>/
├── lesson.json      # 元数据契约（schema 见 lib/content/lectures/schema.ts）
├── recording.md     # 逐字稿（受控纯文本，渲染 text）
├── minutes.md       # 课堂纪要（Markdown，渲染 markdown）
├── notes.html       # 可视化笔记（静态自包含，渲染 html）
└── cards.md         # 复习手卡（Markdown + :::memory，渲染 markdown）
content/quiz/<subjectId>/<quizId>.json   # 四材料共享的一套题
```

`lesson.json` 字段以 `exampleValidLessonManifest()`（`lib/content/lectures/schema.ts`）为准（zod strict，禁多余键）：schemaVersion(=1)、subjectId、courseInstanceId（如 `rec-2026-fall`）、lessonId、courseName、sessionRange `{start,end}`（课程内累计节次）、taughtOn(YYYY-MM-DD)、topic、revision(正整数，材料改动需 +1)、materials（四材料 file/format 冻结值）、quizId（=lessonId）、可选 sourceRef（云盘四个产物的溯源 token/链接）。lessonId 必须等于 `expectedLessonId(courseInstanceId, sessionRange)`。

### 3. 各材料的受控要求

- **recording.md**：保留 `@说话人 N HH:MM` 轮次与时间戳；只去明显转写噪音，不删改专业内容；不允许 Markdown 指令（它按纯文本渲染）。
- **minutes.md**：标准 Markdown，遵循既有渲染白名单。
- **notes.html**：**必须静态、自包含**——内联 CSS、无 `<script>`、无事件属性（on*）、无 `javascript:`、无任何外部 http(s)/协议相对 URL（图片/字体都内联或去掉）。校验由 `findUnsafeHtml` 强制，违规直接失败。正文必须能被 `extractHtmlText` 提取出非空文本（空壳失败）。
- **cards.md**：每张卡用 `:::memory{label="…" mode="reveal"}`（**指令真名是 `memory`，不是 memory-card**；mode 必须 `reveal`）。单卡 raw ≤ 8192 字符，超限拆卡，不靠前端有损兜底。表格/公式等整块内容放在一个 reveal 卡里一次性渲染。

### 4. 出题与题源绑定

- 每题的 `sourceRef.source` 一旦填写，只允许是 `recording` 或 `notes`（写 minutes/cards 直接校验失败），并用 blockId 指回具体发言轮次 / HTML 提取块；正式内容 PR 的题**应**通过 `contentRef` 绑定当节材料（lessonId、revision、recordingHash、notesTextHash）。`contentRef` 在实现上可选但强烈推荐：一旦填写，材料改动导致哈希或 revision 对不上即校验失败，强制重新复核题目。
- quiz JSON 结构遵循 `lib/quiz/types.ts`（QuizData.contentRef / 题目 sourceRef）。

### 5. 生成与校验（本地必须全绿才提交）

```powershell
pnpm gen:lectures     # 扫描校验并生成 lib/content-data/lectures.generated.json
pnpm gen-nav          # 课堂导航并入后重生成 nav.generated.json
pnpm check:lectures   # 课堂专项闸门（schema/安全/手卡/题源哈希/跨课节唯一与节次重叠）
pnpm check:registry   # 全局注册表一致性
pnpm test:unit        # code 单测（含 lectures/* 与 categoryKeys.lecture）
pnpm typecheck
```

- `lectures.generated.json` 与 `nav.generated.json` 都是**必须随 PR 提交**的产物；`--check` 过期会失败。
- 跨课节：同一学科 lessonId 唯一；节次区间重叠报错（防止累计节次算错）。

### 6. PR 与合入节奏（本项目当前批次约定）

- **代码基底 PR 与内容 PR 分离**：基底只含代码/测试/SOP/CI，不含任何课程正文。
- 补同步积压（如两周课程）时：**前几节课一课一个 PR** 试水，CI 全绿 + 视觉验收通过后再合；稳定后**剩余课程合并为一个 PR**。
- 每个内容 PR 必须 CI 通过（typecheck / lint / 两套单测 / build / check:lectures / check:registry），且由视觉子智能体截图确认四材料渲染无误后才合入 master。

## 产出规范（文件路径 + 命名）

| 产物 | 路径 | 渲染 | 关键约束 |
|---|---|---|---|
| 课节元数据 | `content/<s>/lectures/<lessonId>/lesson.json` | — | 严格 schema，禁多余键 |
| 课堂原文 | 同目录 `recording.md` | text | 保留说话人轮次 |
| 课堂纪要 | 同目录 `minutes.md` | markdown | 标准 MD |
| 课堂笔记 | 同目录 `notes.html` | html（沙箱 allow-popups） | 静态自包含、无脚本外链 |
| 复习手卡 | 同目录 `cards.md` | markdown | `:::memory mode=reveal`，单卡 ≤8192 |
| 题 | `content/quiz/<s>/<quizId>.json` | QuizTab | 题源仅 recording/notes + 哈希绑定 |
| 生成清单 | `lib/content-data/lectures.generated.json` | — | 自动生成，必提交 |

导航形态（跨两个板块，物理文件不拆分）：
- **recording（课上录音）**：课节是一个 `navigationOnly` 父节点（id=lessonId，不可路由、访问 404），下挂课堂原文 `rec-`、课堂笔记 `note-`、复习手卡 `card-` 三个材料叶子。
- **summary（课堂纪要）**：直接放课堂纪要 `min-` 叶子（不再建课节父节点），该叶子带 `item.layoutProfile="full"` 覆盖 summary 板块默认的 article 布局，从而显示与其他三材料共享的测验 Tab。
- 所有叶子都带 `materialRole / lessonRef / quizRef`，四材料靠同一 `quizRef` 共享一套题；文件解析（`readLectureArticle`）只按 articleId 索引，不依赖 URL 中的板块，因此 minutes 挂 summary 无需移动物理文件。
- summary 板块模板因此带 `search+quiz` 能力与 `category-item` 策略，但保留 `layoutProfile:"article"`：大一旧 `sum-XX` 文章无 item 级覆盖，仍是 article 布局、不显示测验，行为不变。

## 禁止提交项

- 音频/视频、PDF、PPTX、docx、图片二进制（正文层不落地大文件）；云盘原始录音、HTML/PDF 成品留在云盘。
- 含脚本或外链的 notes.html；超过 8192 字符的单张手卡；非 reveal 手卡。
- 题源标注为 minutes/cards 的题（`sourceRef.source` 只允许 recording/notes）；正式内容 PR 中未带 `contentRef` 哈希绑定的题（应补齐后再合入）。
- 手改的 `lectures.generated.json` / `nav.generated.json`。
- 把 `instrumental-analysis` 的内容写进 `chemistry`，或把白名单外课程就近塞进任意学科。

## AI 工具可达性验证（引用 05-content-integration.md）

- 四材料都要能被 `readContentUnified` 读到正确 `format`；检索（searchNotes/chunker）能命中逐字稿轮次与 notes 提取文本；`/api/section` 返回 `{content, format}`，引用浮窗按 text/markdown/html 正确分发。
- 验证：recording 下三份材料访问 `/<subject>/recording/<articleId>`，课堂纪要访问 `/<subject>/summary/min-<lessonId>`；分别确认正文渲染、测验 Tab 加载的是同一套题、AI 面板「这节课讲了什么」能取到当前页；旧路径 `/<subject>/recording/min-<lessonId>` 应 404。

## 视觉验收（必做）

本地 `pnpm dev`，对每节课依次打开四个材料叶子（前三个在 recording 板块，minutes 在 summary 板块）：
1. recording · 课堂原文（`/recording/rec-<lessonId>`）：说话人行高亮、等宽可读、时间戳在；
2. summary · 课堂纪要（`/summary/min-<lessonId>`）：标题/表格/公式正常，且测验 Tab 显示同一套题；
3. recording · 课堂笔记（`/recording/note-<lessonId>`）：iframe 内可视化笔记完整、无空白、无脚本请求（Network 无外链）；
4. recording · 复习手卡（`/recording/card-<lessonId>`）：reveal 卡点击逐张展开、表格/公式不串行；
5. 四材料测验 Tab 题目一致。由视觉模型子智能体截图核对，不接受「应该没问题」。

## 参考文件（相对路径链接）

- 规划：`docs/archive/refactor-2026-10-10/historical-docs/moved/docs/analysis/Content/2026-09-13-classroom-content-integration-plan.md`
- 契约/校验：`lib/content/lectures/`（roles/subjectAliases/schema/extractTranscript/extractHtml/hash/catalog/validate/paths）
- 导航适配：`lib/content-data/lectures.ts`、`lib/content-data/manifest.ts`
- 加载/渲染：`lib/content/loader.ts`、`app/[subject]/[category]/[id]/ContentPageClient.tsx`、`components/notes/PlainTextReader.tsx`
- 生成/闸门：`scripts/gen-lectures-manifest.ts`、`scripts/check-lectures.ts`、`scripts/check-registry-consistency.ts`
- 相关 SOP：`03-recording-processing.md`、`04-quiz-generation.md`、`05-content-integration.md`、`07-testing.md`
