# SOP 08 — 考试试卷录入与卡片化集成

## 适用场景

将某科目的**考试题 Word 文档**（`.docx`）或扫描版试卷，同步到平台对应科目的「考前模拟」或「实战演练」分类，并以项目规范的 Markdown 指令（callout 卡片、figure 图示、LaTeX 公式）呈现**题目 + 解析 + 知识回顾 + 结论速记**。

本 SOP 覆盖以下顶级科目（`other` 板块除外）：

| subjectId | 科目名称 |
|-----------|---------|
| `probability` | 概率论与数理统计 |
| `physics` | 大学物理 |
| `chemistry` | 有机化学 |
| `modern-history` | 中国近现代史纲要 |
| `maogai` | 毛泽东思想和中国特色社会主义理论体系概论 |

每科均有两个考试分类：

| categoryId | 显示名称 | 存放内容 |
|------------|---------|---------|
| `kaoqian-moni` | 考前模拟 | 模拟卷、复习卷、押题卷 |
| `shizhan-yanlian` | 实战演练 | 历届真实考试真题 |

---

## 输入物料

| 物料 | 说明 |
|------|------|
| 源 Word 文档 | `.docx` 格式的试卷（含题目、答案、解析更佳） |
| 科目与分类 | `subjectId` + `kaoqian-moni` 或 `shizhan-yanlian` |
| 试卷元信息 | 来源学校、学年学期、考试时间、满分、题型分布 |
| 结构图/示意图 | Word 内嵌图片（`word/media/`）或需生成的化学结构式 |

---

## 执行角色分配（主控 + subagent 拆分）

| 阶段 | 角色 | 类型 | 职责 |
|------|------|------|------|
| 1 | Parser | Shell subagent | 运行 `scripts/parse-docs.ts` 或 MinerU 解析 docx → 原始 Markdown |
| 2 | ImageExtractor | Shell subagent | 从 docx 提取 `word/media/` 图片；有机化学结构式用 RDKit 生成 |
| 3 | PaperWriter | GeneralPurpose subagent | **每套卷 1 个 subagent**，按本 SOP 卡片化模板重写正文 |
| 4 | Integrator | GeneralPurpose subagent | manifest 注册、路径验证、构建抽查 |

**上下文控制**：
- 单个 PaperWriter subagent **只处理 1 套试卷**
- manifest 注册由 Integrator 统一执行，不混入内容生产
- 多套卷可并行派发 PaperWriter（`dispatching-parallel-agents` skill）

### PaperWriter subagent Prompt 模板

```
你是考试试卷录入子智能体，负责 {subjectId} 的 {categoryId}，处理试卷：{paperId}。

必读文档：
1. docs/sop/08-exam-paper-integration.md — 完整卡片化规范（强制遵循）
2. content/_raw/{subject}/{原文件名}.md — 解析后的原始文本

产出要求：
- 文件路径：content/{subject}/{categoryId}/{paperId}.md
- 图片路径：public/{subject}/{categoryId}/images/
- 每道题必须有题间分隔（### 第N题）
- 所有 callout / figure 必须平铺同级，严禁嵌套（同级 ::: 不支持嵌套）
- 每道题解析末尾必须有「结论速记」卡
- 禁止纯文本堆砌、禁止题目与解析分离到卷末

完成后列出：产出 md 路径、图片清单、manifest 注册信息（id + title）。
```

---

## 步骤流程

### Step 0：判定分类与分配 ID

1. **分类判定**：
   - 模拟卷 / 押题卷 / 复习卷 → `kaoqian-moni`，文件 id 用 `sim-NN`（如 `sim-01`）
   - 历届真实考试真题 → `shizhan-yanlian`，文件 id 用 `real-NN`（如 `real-01`）
2. **查重**：在 `lib/content-data/manifest.ts` 对应科目分类的 `items` 中确认 id 不重复
3. **取号**：在已有 `sim-*` / `real-*` 中取下一个可用编号（两位数字，如 `sim-04`）

### Step 1：解析 Word 文档

按 [00-infrastructure.md](./00-infrastructure.md) 执行文档解析：

```bash
# 推荐：MinerU API（输出到 content/_raw/{subject}/{原文件名}.md）
npx tsx scripts/parse-docs.ts --subject {subjectId} --files "path/to/exam.docx"
```

产出：`content/_raw/{subjectId}/{原文件名}.md`（脚本默认不分子目录）。建议手动归入 `content/_raw/{subjectId}/exam/` 以便与教材/录音原料区分。

**容灾降级**（`MinerU_API_Token` 缺失时，脚本会直接打印降级命令）：
1. DOCX → `pandoc <file> -o <output>.md --wrap=none`（脚本推荐的首选）
2. 或解压 docx（本质是 zip）读取 `word/document.xml` + `word/media/`
3. 兜底：智能体用 Read 工具直接读取 docx 转出的纯文本

### Step 2：提取与生成图片

#### 2.1 真题/扫描卷内嵌图

docx 本质是 zip，内嵌图位于 `word/media/`。**提取技术**（手动，跨科目通用）：

```powershell
# 1) 复制为 ASCII 临时 zip（规避中文路径），解压
Copy-Item "path/to/exam.docx" "$env:TEMP/exam.zip"
Expand-Archive -LiteralPath "$env:TEMP/exam.zip" -DestinationPath "$env:TEMP/exam_x" -Force
# 2) 把 word/media/* 复制到目标并按规范重命名
New-Item -ItemType Directory -Force -Path "public/{subject}/{categoryId}/images" | Out-Null
Copy-Item "$env:TEMP/exam_x/word/media/*" "public/{subject}/{categoryId}/images/"
```

> 参考实现：[`scripts/content/extract-docx-images.mjs`](../../scripts/content/extract-docx-images.mjs) 封装了上述「复制 zip → Expand-Archive → 拷贝 media」流程，但**当前为有机化学课堂纪要硬编码**（固定源目录 + `sum-NN` 映射，输出 `public/images/chemistry/{sumId}/`），不能直接用于任意试卷。如需脚本化试卷取图，应据其逻辑另写或改造，勿直接调用。

命名规范：`{paperId}-reference.png`（整卷结构参考图）或 `{paperId}-q{N}-{desc}.png`（单题配图）。

#### 2.2 有机化学结构式（模拟卷）

对无内嵌图的化学结构题，用 RDKit 批量生成键线式：

- 脚本参考：`tmp/generate_kaoshi_images.py`（若不存在则新建）
- 输出：`public/chemistry/kaoqian-moni/images/{paperId}-q{N}-{desc}.png`
- SMILES 映射表需人工校验正确性

#### 2.3 Markdown 内引用路径

**必须以 `/` 开头的 public 路径**（不含 `public` 前缀）：

```markdown
:::figure{src="/chemistry/kaoqian-moni/images/sim-04-q1-options.png" alt="选项结构" caption="各选项分子键线式"}
:::
```

### Step 3：卡片化正文编写（核心）

按以下模板将原始文本重写为规范 Markdown。**这是本 SOP 最重要的步骤。**

#### 3.1 卷头结构

```markdown
# {科目}{试卷名称}

> 来源：{学校/出处}
> 考试时间：{N} 分钟　满分：{N} 分
> 题型：{题型分布摘要}

---

## 结构式参考图

:::figure{src="/{subject}/{categoryId}/images/{paperId}-reference.png" alt="本卷结构式参考" caption="本卷涉及的主要结构式/示意图参考"}
:::

（无结构图时删除此节）
```

#### 3.2 大题分节

```markdown
## 一、单项选择题（每题 2 分，共 20 分）
```

人文科目示例：

```markdown
## 一、单项选择题（每题 1 分，共 30 分）

## 二、材料分析题（每题 10 分，共 30 分）
```

#### 3.3 单题结构（强制）

**每道题必须独立成 `### 第N题` 小节**，题与题之间用空行 + 标题分隔。

> **铁律：禁止嵌套指令。** 本项目使用 `remark-directive`，**同级 `:::` 围栏不支持可靠嵌套**（嵌套需外层用更多冒号 `::::`，而 `content/` 内容目录 0 处使用，即项目约定不嵌套）。因此「题目卡 / 图示 / 解析卡 / 知识卡片 / 结论速记卡」一律作为**平铺同级块**依次排列。**切勿**把图示或卡片写进「解析」卡内部，否则内层 `:::` 会提前闭合外层卡片、导致围栏裸露、版面坍塌。参考既有正例 `content/chemistry/kaoqian-moni/real-04.md`。

每个 `:::callout{...}` / `:::figure{...}` 块都以自己的 `:::` 单独闭合，块之间空一行：

```markdown
### 第 1 题

:::callout{kind=note label="题目"}
下列化合物中，碳原子采取 sp² 杂化的是（　　）

A. CH₄　　B. CH₂=CH₂　　C. CH≡CH　　D. CH₃OH
:::

:::figure{src="/chemistry/kaoqian-moni/images/sim-04-q1-options.png" alt="选项结构" caption="各选项分子键线式"}
:::

:::callout{kind=insight label="解析"}
**【答案】B**

CH₂=CH₂（乙烯）中碳原子形成一个 σ 键和一个 π 键，采用 sp² 杂化。

**推理过程**：
1. 数每个碳的 σ 键数与孤对电子数
2. σ 键数 3 且无孤对 → sp²；σ 键数 4 → sp³；σ 键数 2 → sp
:::

:::callout{kind=note label="知识卡片：碳的杂化类型"}
| 杂化类型 | 空间构型 | σ 键数 | 实例 |
|----------|---------|--------|------|
| sp³ | 四面体 | 4 | CH₄、CH₃OH |
| sp² | 平面三角形 | 3 | CH₂=CH₂、苯 |
| sp | 直线形 | 2 | CH≡CH |
:::

:::callout{kind=tip label="结论速记"}
乙烯中碳为 **sp² 杂化**（3 个 σ 键 + 1 个 π 键）；烷烃/醇中碳为 sp³；炔烃中碳为 sp。
:::

---

### 第 2 题
...
```

> 选择题的配图（如 `:::figure`）放在「题目」卡之后、「解析」卡之前，作为独立同级块；这与既有 `sim-01.md` 的写法一致。

#### 3.4 卡片类型选用指南

| kind | 用途 | 典型 label |
|------|------|-----------|
| `note` + label="题目" | 题干（强制） | 题目 |
| `insight` + label="解析" | 解析正文（强制，默认展开） | 解析 |
| `note` | 知识卡片、表格回顾 | 知识卡片：{主题} |
| `definition` | 关键术语定义 | {术语}定义 |
| `theorem` | 定理/公式陈述 | {定理名} |
| `pitfall` | 易错点、陷阱 | 易错警示 |
| `tip` + label="结论速记" | **每题末尾复述核心结论（强制）** | 结论速记 |
| `example` | 关联例题 | 例题回顾 |

完整 kind 列表见 [`lib/markdown/calloutTypes.ts`](../../lib/markdown/calloutTypes.ts)：
`definition` / `theorem` / `example` / `insight` / `pitfall` / `note` / `tip`

#### 3.5 公式规范

- 行内公式：`$E[X] = \sum x_i p_i$`
- 独立公式块：

```markdown
$$P(A \cup B) = P(A) + P(B) - P(AB)$$
```

- 长推导（可选折叠）：

```markdown
:::derivation{label=全概率公式推导}
由条件概率定义 ...
:::
```

#### 3.6 科目差异要点

| 科目 | 特殊要求 |
|------|---------|
| `probability` | 概率公式用 LaTeX；注意 Σ、∫、条件概率竖线 |
| `physics` | 矢量用 $\vec{F}$；单位标注；示意图用 figure |
| `chemistry` | 结构式用 figure；反应方程式可用 LaTeX 或文字 |
| `modern-history` | 材料题保留原文引用块；时间/人物/事件三元组 |
| `maogai` | 理论表述准确；材料分析题分点作答 |

#### 3.7 解析详细化最低要求

每道题解析至少包含：

1. **【答案】**：明确给出选项字母或填空答案
2. **判断依据**：为什么正确、其他选项为何错误
3. **推理/机理步骤**（适用时）：分步列出
4. **知识卡片**（适用时）：关联知识点表格或要点
5. **结论速记**（强制）：`:::callout{kind=tip label="结论速记"}` 复述一遍核心结论

### Step 4：manifest 注册

编辑 [`lib/content-data/manifest.ts`](../../lib/content-data/manifest.ts)，在对应科目对应分类的 `items` 数组末尾追加：

```typescript
{ id: 'sim-04', title: '有机化学期末模拟试卷四', type: 'document', status: 'done' },
```

**规则**：
1. 若该分类仅有 `placeholder` stub 且本次为首个真实内容 → **删除 placeholder 条目**
2. 保持 id 有序排列（`sim-01` < `sim-02` < ...）
3. `status` 设为 `'done'`（内容完成）或 `'draft'`（待完善）

### Step 5：验证

```bash
pnpm check:registry
pnpm exec tsc --noEmit
npm run check:encoding
npm run test:unit
```

浏览器抽查：

```
http://localhost:3000/{subjectId}/{categoryId}/{paperId}
```

确认：
- [ ] 题目卡、解析卡、结论速记卡正确渲染
- [ ] 图片路径无 404
- [ ] 公式 KaTeX 渲染正常
- [ ] 题间有 `### 第N题` 分隔，视觉层次清晰
- [ ] 侧边栏显示新条目

---

## 文档解析规范（引用 00-infrastructure.md）

Word 试卷解析遵循 [00-infrastructure.md](./00-infrastructure.md) 的统一流程：

1. 优先 MinerU API（`MinerU_API_Token`）
2. 降级：DOCX 用 `pandoc --wrap=none`；PDF 用 marker；兜底智能体直读
3. 解析产出存 `content/_raw/{subject}/`（建议 `exam/` 子目录），**不直接作为最终内容**
4. PaperWriter 必须基于原始文本重写为卡片化格式，不可原样粘贴

---

## 产出规范（文件路径 + 命名）

| 产出 | 路径 | 命名 |
|------|------|------|
| 原始解析文本 | `content/_raw/{subject}/{原文件名}.md`（建议归入 `exam/` 子目录） | 中间产物 |
| 最终试卷正文 | `content/{subject}/{categoryId}/{paperId}.md` | `sim-NN` 或 `real-NN` |
| 图片资产 | `public/{subject}/{categoryId}/images/` | `{paperId}-reference.png`、`{paperId}-q{N}-{desc}.png` |
| manifest 注册 | `lib/content-data/manifest.ts` | 对应科目分类 items |

### 科目路径速查

```
content/probability/kaoqian-moni/sim-01.md
content/probability/shizhan-yanlian/real-01.md
content/physics/kaoqian-moni/sim-01.md
content/chemistry/kaoqian-moni/sim-01.md      ← 现有 8 套参考
content/modern-history/shizhan-yanlian/real-01.md
content/maogai/kaoqian-moni/sim-01.md
```

---

## 正例与反例对照

### 正面标准（参考）

平移后的有机化学试卷：`content/chemistry/kaoqian-moni/`（如 `real-04.md`、`sim-01.md`）

合格特征：
- 每题独立 `### 第N题` 小节
- 题干在 `:::callout{kind=note label="题目"}`
- 解析在 `:::callout{kind=insight label="解析"}`
- 含知识卡片回顾
- 图片路径为 `/{subject}/{categoryId}/images/...`

**按本 SOP 新录入的试卷还必须额外包含「结论速记」卡**（现有平移内容未重排，不要求回溯补写）。

### 反面例子（禁止模仿）

原 `content/other/kaoshi-moniji/` 早期风格（已废弃，勿复制）：

| 反面特征 | 问题 | 修正方式 |
|---------|------|---------|
| 题目全部堆在卷首、解析全部堆在卷末 | 无法边做边对 | 改为「一题一节」垂直流 |
| 纯 Markdown 文本无 callout | 视觉平淡、无层次 | 强制使用 callout 卡片 |
| 题与题之间无 `###` 分隔 | 难以定位、难看 | 每题 `### 第N题` + 空行 |
| 解析无知识卡片 | 无法复习关联知识 | 加 `知识卡片` callout |
| 解析末尾无结论复述 | 关键点不突出 | 加 `结论速记` tip 卡 |
| 公式用纯文本（如 x^2） | 无法正确渲染 | 改用 `$x^2$` 或 `$$...$$` |
| 图片路径写错前缀 | 404 | 统一 `/{subject}/{categoryId}/images/` |

---

## AI 工具可达性验证（引用 05-content-integration.md）

按 [05-content-integration.md](./05-content-integration.md) 执行基础验证：

### 当前行为说明

考前模拟和实战演练板块默认没有 `search` 能力，因此默认不进入 AI 语义检索索引；页面正文仍可通过 `getCurrentPage` 读取。

### 验证项

| 工具 | 验证方式 | 预期 |
|------|---------|------|
| `getCurrentPage` | 浏览试卷页 → AI Tab 问「第一题答案是什么」 | 能读取当前页内容 |
| `getOutline` | AI 调用 getOutline | 目录按板块能力决定是否包含试卷分类 |
| `searchNotes` | 搜索试卷内关键词 | 仅在板块声明 `search` 能力并重建索引后命中 |

### 可选增强：让试卷可被 AI 检索

如需让试卷参与 AI 检索，在 `lib/content-data/category-templates.ts` 给对应模板的 `capabilities` 加上 `'search'`，然后重跑索引（需 Embedding API）：

```bash
pnpm build-index
```

---

## 禁止事项

- ✗ 不要将试卷写入 `content/other/`（已废弃 `kaoshi-moniji` 分类）
- ✗ 不要原样粘贴 Word 解析文本，必须经过卡片化重写
- ✗ 不要使用项目未注册的 Markdown 指令（仅 callout / figure / derivation）
- ✗ 不要在单题解析中省略【答案】
- ✗ 不要省略「结论速记」卡（新录入试卷强制）
- ✗ 不要将图片放在 `content/` 目录（必须放 `public/`）
- ✗ 不要硬编码 API Token
- ✗ 不要在没有 manifest 注册的情况下仅写文件（侧边栏不可见）

---

## 参考文件

| 文件 | 用途 |
|------|------|
| [lib/content-data/manifest.ts](../../lib/content-data/manifest.ts) | 内容目录树注册 |
| [lib/content/loader.ts](../../lib/content/loader.ts) | 路径解析 `readContentMarkdown()` |
| [lib/markdown/calloutTypes.ts](../../lib/markdown/calloutTypes.ts) | callout kind 定义 |
| [components/shared/directives/Callout.tsx](../../components/shared/directives/Callout.tsx) | callout 渲染组件 |
| [content/chemistry/kaoqian-moni/](../../content/chemistry/kaoqian-moni/) | 现有试卷参考（平移后） |
| [docs/archive/compose/specs/2026-06-28-kaoshi-moniji-optimization-design.md](../archive/compose/specs/2026-06-28-kaoshi-moniji-optimization-design.md) | 卡片化设计文档 |
| [docs/sop/00-infrastructure.md](./00-infrastructure.md) | 文档解析基础设施 |
| [docs/sop/05-content-integration.md](./05-content-integration.md) | manifest 注册与验证 |
| [docs/sop/07-testing.md](./07-testing.md) | 测试体系 |
| [docs/refer/exam-type-distribution.md](../refer/exam-type-distribution.md) | 各科目题型配比 |
