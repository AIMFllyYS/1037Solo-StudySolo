# SOP 体系索引

> 本目录包含「期末复习工作站」所有内容板块的标准化操作流程。
> 任何 AI 智能体（含 Cursor Agent、Workflow subagent）执行内容生产时，必须先阅读本文件确定适用的 SOP，再按对应文档逐步操作。

---

## 目录

| 编号 | 文件 | 覆盖板块 | 简述 |
|------|------|---------|------|
| 00 | [00-infrastructure.md](./00-infrastructure.md) | 基础设施 | MinerU 文档解析脚本、环境变量、subagent 调度规范 |
| 01 | [01-textbook-processing.md](./01-textbook-processing.md) | 教材 | PDF/PPT → 结构化教材 Markdown |
| 02 | [02-detail-generation.md](./02-detail-generation.md) | 详解（理工科） | 融合教材+录音+自查 → 原创讲义 |
| 02b | [02b-detail-generation-humanities.md](./02b-detail-generation-humanities.md) | 详解（人文科） | 人文类课程专用详解模板 |
| 03 | [03-recording-processing.md](./03-recording-processing.md) | 课堂录音+纪要 | 逐字稿清洗 + 结构化纪要生成 |
| 04 | [04-quiz-generation.md](./04-quiz-generation.md) | 题目测试 | AI 出题 + 组卷 + 评分规范 |
| 05 | [05-content-integration.md](./05-content-integration.md) | 集成验证 | manifest 注册 + AI 工具可达性校验 |
| 06 | [06-desktop-packaging-release.md](./06-desktop-packaging-release.md) | 桌面打包/发布 | Windows exe 打包 + GitHub Release 新建/更新（node_modules 双层坑、两道护栏、密钥安全、版本策略） |
| 07 | [07-testing.md](./07-testing.md) | 测试体系 | 双运行器架构（node:test + Vitest）、测试分层、命名约定、prebuild 集成 |
| 08 | [08-exam-paper-integration.md](./08-exam-paper-integration.md) | 考前模拟/实战演练 | Word 试卷 → 卡片化 Markdown 录入与 manifest 注册 |
| 09 | [09-english-unit-content.md](./09-english-unit-content.md) | 大学英语 Unit | 课文精读、例题与 Quiz 内容生成和注册 |
| 10 | [10-search-index-lifecycle.md](./10-search-index-lifecycle.md) | 检索索引 | 重建、随部署分发、health 冒烟与回滚 |
| 12 | [12-lecture-content-ingest.md](./12-lecture-content-ingest.md) | 课堂四材料接入 | 逐字稿/纪要/可视化笔记/手卡+题打包接入、严格校验与 PR 节奏 |
| — | [subject-onboarding.md](./subject-onboarding.md) | 新学科接入 | 从零接入一个新科目的端到端流程 |

---

## 全局规范

> **反降质契约（强制，优先级最高）**：所有内容生产类 SOP（`01`/`02`/`02b`/`03`/`04`）的执行子智能体，必须先读 [00-infrastructure.md「内容生产闭环与反降质契约」](./00-infrastructure.md#内容生产闭环与反降质契约) 再开工。核心是三条：**禁止用脚本批量生成/patch 正文或题目**；**一个执行子智能体对一个完整内容单元（章/讲/专题）从读原料到验收通过全程闭环负责**，不按流水线角色拆散责任；**验收分机械层+视觉层两层，缺一不可**，不接受"已完成"这句话本身作为验收依据。下面的规范是这份契约在具体执行细节上的补充，不是替代。

### 1. SOP 文件固定章节结构

每个 SOP 文件必须包含以下章节（可根据需要增加，但不可缺少）：

```
# SOP 标题
## 适用场景
## 输入物料
## 执行角色分配（主控 + subagent 拆分）
## 步骤流程
## 文档解析规范（引用 00-infrastructure.md）
## 产出规范（文件路径 + 命名）
## AI 工具可达性验证（引用 05-content-integration.md）
## 参考文件（相对路径链接）
```

### 2. Subagent 分工铁律

**核心目的**：防止单个智能体上下文过长导致质量下降。

规则：
1. **单个 subagent 处理不超过 3-4 章/讲**
2. **文档解析** 由独立 Shell subagent 完成（运行 `scripts/parse-docs.ts`），不混入内容生产
3. **manifest 注册** 由专门的集成 subagent 在所有内容生产完成后统一执行
4. **并行化**：无依赖的章节可通过 `dispatching-parallel-agents` skill 分派多个 subagent 同时处理

#### Subagent 调度模板

主控智能体在执行任何 SOP 时，按以下模板拆分任务：

```
阶段 1 — 文档解析（Shell subagent）
  └── 运行 scripts/parse-docs.ts --subject {X} --files "..."
  └── 产出：content/_raw/{subject}/*.md

阶段 2 — 内容生产（N 个 GeneralPurpose subagent，并行）
  └── 每个 subagent 接收：
      - 当前 SOP 文档路径
      - 分配的章节范围
      - 阶段 1 产出的原始 markdown 路径
  └── 每个 subagent 产出：对应章节的最终 .md / .json 文件

阶段 3 — 集成验证（GeneralPurpose subagent）
  └── 按 05-content-integration.md 执行 manifest 注册 + 验证
```

#### Subagent Prompt 模板

给每个内容生产 subagent 的 prompt 中必须包含：

```
你是内容生产子智能体，负责 {科目} 的 {板块}，处理范围：{章节范围}。

必读文档：
1. docs/sop/{对应SOP文件} — 完整操作规范
2. {输入文件路径列表}

产出要求：
- 文件路径：{具体路径}
- 格式规范：{摘要}

注意：
- 仅处理分配给你的章节，不要越界
- 完成后列出所有产出文件的路径和对应 manifest ID
```

### 3. 环境变量引用规范

所有需要 API Token 的脚本通过 `.env.local` 环境变量获取，绝不硬编码：

| 变量名 | 用途 | 引用方式 |
|--------|------|---------|
| `MinerU_API_Token` | MinerU 文档解析 API | `process.env.MinerU_API_Token` |
| `AI_API_KEY` | AI 模型调用 | `process.env.AI_API_KEY` |
| `AI_BASE_URL` | AI 模型端点 | `process.env.AI_BASE_URL` |

### 4. 内容路径约定

| 板块 | 最终产出路径 | 能力（capabilities） | manifest 注册位置 |
|------|-------------|---------------------|-------------------|
| 教材 | `content/{subject}/textbook/{chapterId}.md` | `examples`, `quiz`, `search` | `contentTree.subjects[x].categories[textbook].items[]` |
| 详解 | `content/{subject}/detail/{itemId}.md`（概率论例外：`content/chapters/`） | `examples`, `quiz`, `search`, `media` | `contentTree.subjects[x].categories[detail].items[]` |
| 录音 | `content/{subject}/recording/rec-XX.md` | `examples`, `quiz`, `search` | `contentTree.subjects[x].categories[recording].items[]` |
| 课堂课节（四材料） | `content/{subject}/lectures/<lessonId>/{recording.md,minutes.md,notes.html,cards.md}` + `lesson.json` | recording 板块 `examples`,`quiz`,`search`（能力在板块上） | 由 `pnpm gen:lectures` 扫描生成，经 manifest 适配层并入 recording，禁止手写注册（见 SOP 12） |
| 纪要 | `content/{subject}/summary/sum-XX.md` | `search` | `contentTree.subjects[x].categories[summary].items[]` |
| 题目 | `content/quiz/{subject}/{chapterId}.json` | — | 前端 QuizTab 直接读取（无需 manifest） |
| 例题 | `content/examples/{subject}/{chapterId}/{sectionId}/` | — | 通过 `readExamples()` 自动发现 |
| 考前模拟 | `content/{subject}/kaoqian-moni/{paperId}.md` | — | `contentTree.subjects[x].categories[kaoqian-moni].items[]` |
| 实战演练 | `content/{subject}/shizhan-yanlian/{paperId}.md` | — | `contentTree.subjects[x].categories[shizhan-yanlian].items[]` |
| 试卷图片 | `public/{subject}/{categoryId}/images/` | — | Markdown 内 `/{subject}/{categoryId}/images/...` 引用 |

`other` 学科目前有 4 个私有板块，能力以 manifest 中的完整声明为准：

| 板块 | 内容路径 | 能力（capabilities） |
|------|---------|---------------------|
| `english` | `content/other/english/unit-X.md` | `examples`, `quiz` |
| `misc` | `content/other/misc/exam-source.html` | — |
| `gongshi` | `content/other/gongshi/gongshi.html` | — |
| `guihua` | `content/other/guihua/schedule.html` | — |

### 5. AI 工具可达性要求

每个 SOP 执行完毕后，必须确保产出内容对右侧 AI 面板可见：

- AI 通过 `getCurrentPage` 工具调用 `readContentMarkdown(subjectId, categoryId, itemId)` 读取当前页
- AI 通过 `getOutline` 获取课程大纲树（遍历 `contentTree`）
- AI 通过 `getSection` 按 ID 跨小节读取内容
- AI 通过 `searchNotes` 全文检索笔记

**验证方法**：在浏览器中访问 `/{subject}/{category}/{itemId}`，切到 AI Tab，发送"这一节讲了什么"，确认 AI 能调用 `getCurrentPage` 并返回正确内容。

### 6. 参考文件索引

| 文件 | 用途 |
|------|------|
| `docs/refer/exam-type-distribution.md` | 各科目考试题型配比（04-quiz 引用） |
| `docs/refer/mineru-parsing-guide.md` | MinerU API 完整文档（00-infrastructure 引用） |
| `docs/refer/rendering-architecture.md` | Markdown 渲染架构（02-detail 引用） |
| `.env.local` | 环境变量（Token 等，脚本运行时引用） |
| `lib/content-data/manifest.ts` | 内容目录树（当前实际路径） |
| `lib/ai/agent/tools/` | AI 工具定义（22 个目录；其中 21 个是可注册工具，每个含 `types.ts`/`presentation.ts`/`tool.ts`，`projectFiles/` 是共享辅助目录；工具名全集见 `names.ts` 的 `STUDY_TOOL_NAMES`；05-integration 验证目标） |
| `lib/content/loader.ts` | 内容加载器（路径解析逻辑） |

### 7. 容灾降级策略

当 MinerU API 不可用时，所有依赖文档解析的 SOP（00/01/03）自动降级到本地开源方案。完整降级链路和各文件类型的替代工具详见 [00-infrastructure.md 容灾降级机制](./00-infrastructure.md#容灾降级机制)。

降级优先级摘要：
```
MinerU API → marker（Python 开源） → 按类型选库 → 智能体直读
```

### 8. 新增板块

- 标准板块：在 `lib/content-data/category-templates.ts` 的 `STANDARD_CATEGORIES` 增加模板，并同步加入 `STANDARD_CATEGORY_ORDER`。
- 学科私有板块：直接在 `lib/content-data/manifest.ts` 写完整 Category 对象，明确声明 `capabilities` / `keyStrategy`。
- 例题、Quiz、搜索是否生效由板块的 `capabilities` 决定；不要新增 `categoryId` 硬编码开关。
- 所有 SOP 的集成验证统一执行 `pnpm check:registry`，再按对应 SOP 补充专项检查。
