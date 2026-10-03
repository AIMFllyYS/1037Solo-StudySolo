# Manuscript structure and editorial normalization

Contents:

- Preserve meaning, expose structure
- Composition plan
- Choose the document family
- 选件矩阵
- Family notes
- Heading and numbering system
- Punctuation
- Numerals, dates, units, and symbols
- Lists, quotations, notes, and equations
- Cross-reference integrity
- Language quality

## Preserve meaning, expose structure

Packaging is not permission to rewrite the author's argument. Correct clear typographic/editorial defects, but surface substantive ambiguity, unsupported claims, missing sections, or inconsistent data for resolution. Maintain a change ledger when edits exceed mechanical normalization.

## Composition plan

After the document class is locked, build this internal plan **before** generating pages. Then open only the matching sections in [component-catalog.md](component-catalog.md). Do not read the whole catalog, and do not add a block just to look more “national-standard”.

```text
block | 中文名 | 状态(必备/可选/有则必备/不用) | 权威(standard/recipient/fallback) | 另页? | 页码制度 | 参考章节
```

Selection order:

1. Pages named by the recipient template or contract: include them; the catalog supplies only missing implementation detail.
2. Pages the applicable current standard marks 必备: include them when no template contradicts with declared precedence.
3. 可选 or 有则必备 pages: include only when the manuscript already has the content, the reader needs the block, or the user asked for it.
4. Never invent seals, signatures, agency marks, document numbers, empty 致谢, or a 后记 with no text.

Distinguish three easily confused blocks:

- **序或前言** introduces how and why the document was prepared. It is not 引言.
- **引言** starts the main matter. It is not 前言.
- **后记** is not a `GB/T 7713` component. Use it only on the book-like institutional profile, and only with real closing text.

## Choose the document family

Use the route in [standards-routing.md](standards-routing.md). Split general reports as follows:

- **书刊体机构报告** when the user asks for 封面/扉页/目录/前言/鸣谢/后记, or the deliverable is a bound institutional, competition, or acceptance volume. Label it `fallback`. Say `参照书刊体编排`, never `符合公文标准` or `学位论文国标认证`.
- **简明正式报告** for a memo, one-issue brief, or short decision note. Do not add academic or book-like front matter solely to appear “standard”.

## 选件矩阵

Status is the default when no template speaks. `校模` / `按刊` / `按库` means the recipient file wins. Field lists live in the catalog, not here.

| 板块 | 学位论文 | 学术论文 | 科技报告 | 数据论文 | 公文 | 书刊体机构报告 | 简明正式报告 |
|---|---|---|---|---|---|---|---|
| 封面 | 校模，通常必备 | 不用 | 必备 | 按刊/库 | 不用（走版头） | 默认纳入 | 不用，除非点名 |
| 封二 | 校模 | 不用 | 可选 | 不用 | 不用 | 通常不用 | 不用 |
| 题名页/扉页 | 校模，与封面分立 | 不用 | 可选；有则与封面一致 | 不用 | 不用 | 默认纳入 | 不用 |
| 版权/声明 | 校模；不代签 | 不用 | 不用 | 按库 | 不用 | 仅当已有文本 | 不用 |
| 辑要页 | 不用 | 不用 | 必备 | 不用 | 不用 | 不用 | 不用 |
| 序或前言 | 校模少见 | 不用 | 可选，宜另页 | 不用 | 不用 | 有撰稿说明则纳入 | 不用 |
| 摘要/关键词 | 中英常见必备 | 前置必备项目 | 摘要页可选 | 按刊/库 | 不用 | 可用内容提要 | 可用执行摘要 |
| 目次 | 通常必备 | 不用 | 必备 | 不用 | 不用 | 默认纳入 | 仅较长报告 |
| 图表清单/符号表 | 多则纳入 | 不用 | 多则纳入 | 按需 | 不用 | 多则纳入 | 按需 |
| 引言 | 正文常有 | 一般应有 | 可选 | 按体裁 | 不用 | 按需 | 按需 |
| 致谢 | 校模位置；不编造 | 有贡献则写 | 可选 | 按刊 | 不用 | 有对象或用户要求 | 不用 |
| 后记 | 不用 | 不用 | 不用 | 不用 | 不用 | 有收束文字或用户要求 | 不用 |
| 封底/书脊 | 校模 | 不用 | 封底可选 | 不用 | 不用（版记≠封底） | 可选 | 不用 |
| 公文版头/主体/版记 | 不用 | 不用 | 不用 | 不用 | 按文种全套 | 不用 | 不用 |

Body chapters (methods, results, discussion, conclusions) stay in the family notes below. They are not catalog pages.

## Family notes

### Degree thesis/dissertation

Follow the current university template and `GB/T 7713.1` for which of the matrix rows are actually submitted. Do not invent declaration text or signatures. Exact cover grids, statement wording, and binding marks are `recipient`.

### Academic paper

Apply `GB/T 7713.2` and the target journal. Front matter is usually 题名、作者信息、摘要、关键词、基金等 on the opening pages, not a separate 封面 or 目次. Include 致谢 only when there is a real contribution to record.

### Scientific/technical report

Apply `GB/T 7713.3` and the funder/client template. The matrix already marks 封面、辑要页、目次 as 必备. Keep identifiers, security markings, and performing-organization names only when they are real.

### Data paper

Apply `GB/T 7713.4` plus repository/journal metadata. Prefer the repository’s article shell over book-like front matter.

### Party/government official document

Use only the `GB/T 9704` element package in the catalog. Do not improvise official marks, numbers, addressees, seals, copy recipients, or edition records.

### 书刊体机构报告

Bound institutional volume. Default to 封面、题名页/扉页、目次, plus 前言/致谢/后记 only when content exists. This profile is `fallback`, not a national layout standard.

### 简明正式报告

Title/metadata, executive summary if needed, scope, evidence, findings, conclusions, references, appendices as needed. Do not import 封面、扉页、版权页, or 后记 to decorate a short report.

## Heading and numbering system

- Represent hierarchy semantically with heading styles.
- Select a numbering system permitted by the recipient/genre and apply it consistently.
- Link numbering to styles and cross-references.
- Keep heading text concise and parallel at the same level.
- Do not leave a heading as the last line on a page.
- Update the table of contents and bookmarks from fields after pagination stabilizes.

## Punctuation

Apply current `GB/T 15834` to Chinese prose when the recipient has no contrary house style. Review:

- full-width Chinese punctuation versus half-width Western punctuation in the correct language context;
- quotation marks and nested quotation marks;
- book-title marks, parentheses, brackets, ellipses, dashes, hyphens, and ranges;
- punctuation around citations, equations, units, URLs, code, and bilingual text;
- sentence-final punctuation after displayed lists, captions, and notes as required by their grammar.

Do not perform a blind global replacement: punctuation inside URLs, DOI strings, code, formulas, file paths, bibliographic fields, and quoted source text may require exact preservation.

## Numerals, dates, units, and symbols

Apply current `GB/T 15835` for numeral choice and representation. Preserve conventional Arabic numerals in measurements, statistics, dates, times, percentages, identifiers, and technical contexts. Use Chinese numerals where the semantic convention requires them. Keep one date format within the same role and distinguish human-readable dates from machine identifiers.

For scientific/technical material:

- preserve a space between a quantity value and its unit where the applicable notation requires it;
- use correct SI symbols, capitalization, prefixes, and mathematical signs;
- distinguish a hyphen, minus sign, range dash, and negative value;
- keep decimal precision meaningful and consistent with the data;
- define symbols and abbreviations on first use or in a dedicated list;
- do not substitute letter `O` for zero or letter `l` for one.

Use the current applicable standards for quantities, units, symbols, and numerical rounding when the subject requires exact compliance. Do not assume the historical edition referenced by an older industry standard remains current.

## Lists, quotations, notes, and equations

- Use list styles rather than manual bullets/spaces.
- Keep list grammar and terminal punctuation consistent.
- Distinguish direct quotations from paraphrases; preserve exact wording and locator.
- Use real footnotes/endnotes when required, with one numbering sequence per rule.
- Create equations with an equation object or stable math representation, not a screenshot.
- Number equations automatically when referenced; keep number placement and chapter/continuous system consistent with the recipient rule.

## Cross-reference integrity

Create fields/bookmarks for references to headings, pages, figures, tables, equations, appendices, and notes. Before export:

1. update all fields;
2. search for broken-field messages;
3. verify that each textual callout points to the intended target;
4. verify that numbering remains consecutive after deletions or moves;
5. update the TOC and lists of figures/tables;
6. confirm PDF links/bookmarks if required.

## Language quality

Perform separate passes:

1. **Meaning:** no claim became stronger, narrower, or causally different.
2. **Terminology:** names, abbreviations, translations, capitalization, and symbols are consistent.
3. **Evidence:** claims, quotations, statistics, figures, and tables have the correct sources.
4. **Mechanics:** punctuation, numerals, units, spacing, and typography are correct.
5. **Structure:** headings, lists, captions, notes, and references are semantically encoded.
6. **Readability:** sentences and paragraphs remain clear at final page width.

Never alter a quotation, legal name, standard number, DOI, URL, code, equation, or data value as a mere style cleanup without verification.
