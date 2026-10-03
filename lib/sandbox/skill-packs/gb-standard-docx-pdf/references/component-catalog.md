# Component catalog (组成要素目录)

Contents:

- How to use
- Reading navigation (目次 / 编号 / 页眉)
- Page-numbering regimes (页码制度)
- Cover (封面) · Inside front cover (封二) · Title page (题名页 / 扉页) · Copyright page and declarations (版权页/声明) · Report documentation page (辑要页)
- Preface (序或前言) · Abstract page (摘要页) · Keywords (关键词) · TOC (目次) · Lists of figures and tables (插图和附表清单) · Symbols and abbreviations (符号和缩略语说明)
- Introduction (引言) · References as a component (参考文献) · Appendix (附录) · Acknowledgements (致谢) · Author information and achievements (作者简介与成果) · Postscript (后记)
- Index (索引) · Distribution list (发行列表) · Back cover (封三与封底)
- Official-document element package (GB/T 9704 only, 公文要素包)

Read [manuscript-structure.md](manuscript-structure.md) first, produce the composition plan, then open **only the selected blocks in this file**. Do not read the whole catalog, and do not treat this file as a mandatory checklist for every PDF.

Implementation details for fields, pagination, sectioning, and field codes live only in this file. The 必备/可选/不用 status of each block per document family lives only in the 选件矩阵 in `manuscript-structure.md`. Standard editions and links: see [source-register.md](source-register.md). Bibliographic format: see [citations-figures-and-rights.md](citations-figures-and-rights.md). Font sizes, margins, and body fonts: see [typography-and-layout.md](typography-and-layout.md).

Authority markers: `standard` = actionable summary of the applicable current standard; `recipient` = 校模/journal/contract; `fallback` = editorial choice when no higher authority speaks; never present it as a national-standard mandate.

## How to use

1. Jump to a section using the Chinese name from the composition plan.
2. Read **When not to use** first. If the block is ruled out, stop.
3. When the recipient template already fixes the layout, the template wins; each section here only fills in the sectioning, field codes, and metadata consistency the template left unspecified.
4. When a signature, declaration text, or issuing-agency authorization is missing, leave it blank and flag it; never fabricate.
5. The **Applies** line in each section is only a skim summary. On conflict with the 选件矩阵 in [manuscript-structure.md](manuscript-structure.md), the matrix wins.

## Reading navigation (目次 / 编号 / 页眉)

GB-standard documents have no web-style `首页 > 章 > 节` breadcrumb. The reader's path uses three devices:

- **目次**: chapter/section numbers, titles, and starting page numbers; generated with a `TOC` field, see [目次](#toc-目次).
- **章节编号**: a multilevel list bound to heading styles, see the heading rules in `manuscript-structure.md`.
- **页眉章题**: body-section headers show the current chapter title (or the school name/document number the 校模 requires). 封面, 题名页, and 版权页 carry no header by default. For the 科技报告 spine, see [封三与封底](#back-cover-封三与封底).

The agent's own path is the composition plan, not a breadcrumb printed on the page.

Do not: build website-style breadcrumbs at the top of every page; fake navigation by retyping chapter numbers by hand.

## Page-numbering regimes (页码制度)

- 封面、封二、封三、封底 usually **carry no page number** (unless `recipient` or `standard` rules otherwise).
- Front matter (after the 题名页, before the body) usually uses lowercase Roman numerals `i, ii, iii…`, or another front-matter numbering the 校模 requires.
- From the first body page, use Arabic numerals `1, 2, 3…`; 附录, 参考文献, and 致谢 continue the sequence, unless the 校模 requires the 附录 to be numbered separately.
- Implement the two numbering systems with section breaks and the `PAGE` field; never type page numbers by hand.
- Page numbers listed in the 目次 must be the real page numbers after a field update.
- For duplex printing, check the binding edge, odd/even pages, and blank pages; blank pages come from odd-page section starts, not from padding with empty paragraphs.

---

## Cover (封面)

- **Alias**: do not call it 扉页 or 题名页. The 封面 is the outer surface; the 题名页 is the bibliographic-information page.
- **Purpose**: identify and protect the text; give first-screen information such as 密级, 编号, 题名, and 责任者.
- **Applies**: 科技报告 `standard` 必备; 学位论文 `recipient` usually 必备; 书刊体机构报告 `fallback` 纳入 by default; 学术论文, 公文, and 简明正式报告 are 不用 by default.
- **Authority**: 科技报告 follows current `GB/T 7713.3`; for 学位论文 the 校模 controls — `GB/T 7713.1` governs composition, not one school's cover grid; 书刊体 is `fallback`.

**Fields (科技报告, `standard`)**

- 密级: prominent position; top right corner preferred on the print copy; follow the actual secrecy rules — where there is no 密级, do not invent one.
- 科技报告编号: the number assigned by the managing agency; when several numbers coexist, all may appear and must be mutually consistent.
- 题名 and any necessary other title information.
- 责任者 and 完成机构; when the performing organization differs from the funding organization, both should appear.
- 项目/课题名称 and funding number (有则必备).
- Submission or release date, preferably `YYYY-MM-DD`.
- 出版项, ISBN/ISSN (有则).
- 发行限制, copyright, or disclaimer statements may go on the 封面 or 封二; never fabricate legal text.

**Fields (学位论文, `recipient`)**

When the 校模 provides nothing, record the gap; do not invent school-badge usage. Common items: school name, thesis type (博士/硕士 etc.), Chinese title, English title, author, student number, 学科专业, supervisor, date, 密级, 分类号. The title should generally be concise; the exact length follows the 校模 or the formal text of `GB/T 7713.1`.

**Fields (书刊体, `fallback`)**

正式题名, 副题名 (有则), author or team, organization, version or report number, date, 密级 (有则). Do not borrow 发文机关标志, and do not design it as a poster.

- **Pagination**: its own section; no page number; usually no header or footer.
- **Implementation**: align cover fields with a table or defined paragraph styles, not with spaces or stacked empty paragraphs. Embed school badges/logos only when authorized.
- **Do not**: pass a decorative poster off as an official red-header document; forge agency logos, seals, 密级, or report numbers without authorization; merge the 封面 and 题名页 into one page while still claiming both exist.
- **When not to use**: journal papers, one-issue briefs/memos, genuine official documents.

## Inside front cover (封二)

- **Alias**: inside page of the 封面. Not the 题名页.
- **Purpose**: administrative information such as remarks, distribution restrictions, copyright, and disposal notes.
- **Applies**: 科技报告 可选; 学位论文 follows the 校模; everything else is 不用 by default.
- **Authority**: `standard` / `recipient`.
- **Fields**: copyright statement, distribution scope, replacement/invalidation notes, a short funding-acknowledgement sentence, electronic-format notes. Keep consistent with information already on the 封面.
- **Pagination**: the page after the 封面; usually no page number.
- **Implementation**: its own section, or the same section as the 封面 but excluded from the 目次.
- **Do not**: stuff a 辑要页 or an authorization letter into the 封二 to fill it.
- **When not to use**: when there is no extra administrative information.

## Title page (题名页 / 扉页)

- **Alias**: 题名页 is the national-standard term; 扉页 is the common name. Never call it 封面.
- **Purpose**: provide fuller, catalogable bibliographic information than the 封面.
- **Applies**: 学位论文 `recipient`, common and separate from the 封面; 科技报告 可选 — when present, its metadata matches the 封面; 书刊体 `fallback` 纳入 by default; 学术论文, 公文, and 简明报告 are 不用.
- **Authority**: 科技报告 `GB/T 7713.3`; 学位论文 校模 + `GB/T 7713.1`; 书刊体 `fallback`.

**Fields (科技报告, 有则)**

密级, report number, report type, 题名, 责任者, 完成机构, funding organization, 项目/课题, remarks, 出版项. Any item that appears on the 封面, 题名页, and 辑要页 must be identical across all of them.

**Fields (学位论文 / 书刊体)**

Full Chinese title, English title (when required), subtitle, author, identity information, supervisor or responsible unit, organization, date, version. Do not paste a large school badge again to fake a second cover.

- **Pagination**: separate page; whether it joins the front-matter numbering follows the 校模 — absent a rule, the 题名页 may stay outside the Roman numbering or serve as its starting page, as long as the whole document is consistent.
- **Implementation**: its own section. Use styles for fields. Do not hand-type “第 1 页”.
- **Do not**: make only a decorative cover and label it “含扉页”; let the 封面 and 题名页 titles disagree.
- **When not to use**: journal papers; short reports where the user wants only a single title page; 公文.

## Copyright page and declarations (版权页/声明)

- **Alias**: 原创性声明, 使用授权书, 诚信承诺书. Not 致谢.
- **Purpose**: statements of rights and responsibilities, for degree or repository use.
- **Applies**: 学位论文 `recipient`, almost always present; 书刊体 only when the user supplies declaration text; 科技报告, 学术论文, and 公文 are 不用 by default.
- **Authority**: `recipient`. Never invent a school's legal text.
- **Fields**: follow the 校模 original wording. Two common blocks: 原创性/诚信声明; 使用授权. Leave signature and date blank or let the rights holder sign; the agent must never sign on anyone's behalf, scan someone else's signature, or use a generated signature.
- **Pagination**: separate page; usually included in front-matter numbering. For anonymous-review copies, delete or mask names as the 校模 requires.
- **Implementation**: keep the template's line breaks and signature areas. Do not reflow it into a publicity page.
- **Do not**: forge signatures; download another school's declaration, rename it, and claim it follows “本校模板”.
- **When not to use**: no authorization text exists, and the document is not a thesis submission.

## Report documentation page (辑要页)

- **Alias**: 基本信息表, 文档控制页, report documentation page. Not another name for the 摘要页, though it often contains the abstract and keywords.
- **Purpose**: record the descriptive and administrative metadata of a 科技报告 in fixed fields, for collection and retrieval.
- **Applies**: 科技报告 `standard` **必备**. All other families are 不用.
- **Authority**: `GB/T 7713.3`.
- **Fields**: 题名, 责任者, 完成机构, 编号, 密级, and date consistent with the 封面/题名页; 摘要; 关键词; page count or other control items per the contract or the standard's annex fields. When no formal annex template is available, list the required metadata above in a table and state in the conformance note “辑要页按合同/标准栏目组织，未复制标准附录图”.
- **Pagination**: separate page; front-matter numbering.
- **Implementation**: use a fixed-width table; field names are labels, not body headings. Do not replace the fields with prose.
- **Do not**: pass a single abstract paragraph off as a 辑要页; omit the report-number or 密级 fields (when there is no 密级, state “公开” or the 校模 wording explicitly instead of leaving a wrong field).
- **When not to use**: anything that is not a 科技报告.

## Preface (序或前言)

- **Alias**: 序, 前言. **Not 引言**, and not 后记.
- **Purpose**: explain why the report was written, how to use it, its conventions, and its funding background; does not expand the research process.
- **Applies**: 科技报告 可选, preferably on its own page; 书刊体 includes it when genuine preparatory notes exist; rare in 学位论文 — follow the 校模; 学术论文, 公文, and 简明报告 are 不用.
- **Authority**: 科技报告 `standard`; 书刊体 `fallback`.
- **Fields/content**: purpose of writing, readership, relation to other volumes/editions, notes on conventions, funding. No research results or conclusions.
- **Pagination**: separate page; front-matter numbering; may enter the 目次.
- **Implementation**: style the heading with a non-body level or a dedicated “前言” style, so it does not occupy “第 1 章”.
- **Do not**: rename the first chapter's 引言 as 前言; substitute a vague thank-you paragraph for the 前言 (thanks belong in 致谢).
- **When not to use**: there is no explanatory text independent of the 引言.

## Abstract page (摘要页)

- **Alias**: 中文摘要, 外文摘要, 内容提要. In an 学术论文 it is often a front item on the opening page, not necessarily a separate page.
- **Purpose**: convey purpose, methods, results, and conclusions without reading the full text.
- **Applies**: 学位论文 usually needs both Chinese and English abstracts; an 学术论文 should have an abstract; the 科技报告 摘要页 is 可选; 书刊体 may use a 内容提要; a 简明报告 may use an executive summary without borrowing academic abstract lengths; 公文 is 不用.
- **Authority**: 学术论文 `GB/T 7713.2` + `GB/T 6447`; 学位论文 `recipient`; the rest follow the document family.
- **Fields**: the abstract body; an 学术论文 should also have a foreign-language abstract. Informative abstracts run about 400 characters, informative/indicative about 300, indicative about 150 (`GB/T 7713.2`; adjust to the volume of results). Do not use figure/table numbers or non-standard abbreviations in the abstract without explanation.
- **Pagination**: in a 学位论文 the Chinese and English abstracts often each take a page or run as consecutive front-matter pages; in a journal paper the abstract follows the author information.
- **Implementation**: the abstract is not “第 0 章”. Most 校模 keep the abstract **out of the 目次**.
- **Do not**: compress the 引言 and call it an abstract; pad with empty words to reach a length.
- **When not to use**: short letters and 公文 with no standalone abstract requirement.

## Keywords (关键词)

- **Alias**: 主题词. Not the 目次.
- **Purpose**: terms for retrieval.
- **Applies**: an 学术论文 should have them; a 学位论文 usually has them; a 科技报告 often carries them together with the 摘要页 or 辑要页; others as needed.
- **Authority**: 学术论文 `GB/T 7713.2`, `CY/T 173`; the rest `recipient` / `fallback`.
- **Fields**: 3–8 per document is advisable; Chinese and English correspond; avoid overly broad words like “方法” or “研究”.
- **Pagination**: immediately after the abstract; generally not a separate chapter.
- **Implementation**: after the label “关键词：”, use the separator the recipient specifies (semicolon or space), consistently throughout.
- **Do not**: lift a whole chapter-heading sentence as a keyword.
- **When not to use**: a concise internal memo that does not require retrieval metadata.

## TOC (目次)

- **Alias**: 目录. The standard term for 科技报告 is 目次.
- **Purpose**: an ordered list of chapter/section numbers, titles, and starting page numbers; structural metadata.
- **Applies**: 科技报告 `standard` **必备**; 学位论文 usually 必备; 书刊体 纳入 by default; 简明报告 only when it is long and readers need retrieval; 学术论文 and 公文 are 不用.
- **Authority**: 科技报告 `GB/T 7713.3`; 学位论文 `recipient`; 书刊体 `fallback`.
- **Fields**: chapter/section number, title, starting page number. Coverage follows the 校模; absent a rule: body headings (usually to level three), 参考文献, 附录, 致谢; usually **excluding** the 封面, declaration pages, and Chinese/English abstracts. When figures and tables are many, make separate lists; do not pile every figure caption into the 目次.
- **Pagination**: separate page; front-matter numbering. The 目次 itself generally does not appear in the 目次.
- **Implementation**: the Word/WPS `TOC` field, based on heading outline levels. Leader dots and indentation follow the heading level. Update fields before export. PDF bookmarks match the 目次 hierarchy.
- **Do not**: hand-type page numbers; let the 目次 disagree with body headings; substitute a web breadcrumb for the 目次.
- **When not to use**: one- or two-page shorts, journal papers, 公文.

## Lists of figures and tables (插图和附表清单)

- **Alias**: 图清单, 表清单, 图表目录.
- **Purpose**: list figure/table captions and page numbers by their numbers.
- **Applies**: 科技报告, 学位论文, and 书刊体 include them when figures and tables are numerous; standalone lists are 不用 for 学术论文.
- **Authority**: `standard` / `recipient` / `fallback`.
- **Fields**: 图 x / 表 x, caption, page number. Captions must match the body word for word.
- **Pagination**: a separate page after the 目次, or directly following it when the 校模 allows.
- **Implementation**: use caption fields plus table-of-figures fields, not manual copying.
- **Do not**: list an entry the body lacks, or leave a numbered body figure out of the list.
- **When not to use**: very few figures/tables, and the 目次 already locates everything.

## Symbols and abbreviations (符号和缩略语说明)

- **Alias**: 符号表, 缩略语表.
- **Purpose**: define the document's symbols, units, and abbreviations in one place.
- **Applies**: when symbols or abbreviations are numerous; otherwise defining each at first use in the body is enough.
- **Authority**: `recipient` / `fallback`; quantities and units still follow the applicable `GB 3100/3101/3102` etc., whose details are not expanded here.
- **Fields**: symbol or abbreviation, meaning, unit (有则). Ordering follows the 校模 (alphabetical or order of appearance).
- **Pagination**: a separate front-matter page, or the last page before the body.
- **Implementation**: fixed-width table.
- **Do not**: let a symbol in the table disagree with the body.
- **When not to use**: very few symbols.

## Introduction (引言)

- **Alias**: 绪论. **Not 前言, not 摘要.**
- **Purpose**: enter the research or report body: background, problem, scope, purpose. 可选 in a 科技报告; an 学术论文 should generally have one.
- **Applies**: see the 选件矩阵. This section only handles its boundary with the 前言; it does not prescribe disciplinary writing.
- **Authority**: the body rules of each document family; pagination `recipient` / `fallback`.
- **Pagination**: start of the body section; Arabic page numbers begin here or at the 校模-designated “第 1 章”.
- **Implementation**: use Heading 1. Do not mix 引言 and 前言 at the same level as two different 第 1 章.
- **Do not**: move 前言 content (conventions, acknowledgements, volume notes) into the 引言 without updating the composition plan.
- **When not to use**: 公文; extremely short notices with no 引言 genre.

## References as a component (参考文献)

Bibliographic items and the citation system live only in [citations-figures-and-rights.md](citations-figures-and-rights.md). This section covers only its position as a block.

- **Applies**: 有则必备 whenever citations exist; a reading-type bibliography only when the recipient permits it.
- **Pagination**: a separate page or continuous after the body ends; usually enters the 目次; page numbers continue from the body.
- **Implementation**: the heading does not occupy a research chapter number (use Heading 1 unnumbered, or the 校模 “参考文献” style).
- **Do not**: repeat 7714 format rules in this section.
- **When not to use**: the whole document has no external citations and the recipient requires no bibliography.

## Appendix (附录)

- **Applies**: 有则必备.
- **Pagination**: after the 参考文献 or at the 校模-designated position; enters the 目次; numbered 附录 A, B… or the 校模 form.
- **Implementation**: give each appendix a heading style; figure/table numbers may follow the appendix (e.g. 图 A.1).
- **Do not**: move a core argument that belongs in the body wholesale into an appendix to “slim down” while still drawing conclusions in the body.
- **When not to use**: no supplementary material.

## Acknowledgements (致谢)

- **Alias**: 鸣谢. Not 前言, not 后记, not a copyright statement.
- **Purpose**: thank organizations and individuals who actually helped the research or the text.
- **Applies**: an 学术论文 includes it when there is a genuine contribution; 科技报告 可选; in a 学位论文 the position follows the 校模 (front or back); 书刊体 only when the user asks or a real object of thanks exists; 简明报告 and 公文 are 不用.
- **Authority**: `GB/T 7713.2` / `GB/T 7713.3` require objectivity, truthfulness, and appropriate wording; object types include funders, helpers, advisors, and reprint permissions (`standard`). Position is `recipient`.
- **Fields/content**: the specific parties and the type of help. No research results; do not inflate unverified contributions.
- **Pagination**: per the 校模; absent a rule, a 科技报告 may place it in front matter, and a 学位论文 most often places it at the back, after the 参考文献 or 附录. Delete it from anonymous-review copies as the 校模 requires.
- **Implementation**: its own heading; may enter the 目次. Do not put it in the footer.
- **Do not**: fabricate grant numbers or expert lists; write the 致谢 as a lyrical 后记.
- **When not to use**: no real object of thanks; review rules require removing acknowledgements.

## Author information and achievements (作者简介与成果)

- **Alias**: 简历, 攻读学位期间成果.
- **Applies**: common in 学位论文 (`recipient`); other families are 不用, unless a journal asks for an author bio.
- **Authority**: `recipient`.
- **Fields**: the 校模 fields. Record only verifiable education/work/achievements; never fabricate papers or awards.
- **Pagination**: a separate page at the back; whether it enters the 目次 follows the 校模.
- **Do not**: present unpublished results as published.
- **When not to use**: not a 学位论文, and the journal did not ask.

## Postscript (后记)

- **Alias**: 跋. The `GB/T 7713` series has **no** such component as 后记.
- **Purpose**: in 书刊体, the author's closing words after the body — process notes or reading suggestions.
- **Applies**: 书刊体 `fallback` only, and only when the user asks or the manuscript already has standalone closing text. 学位论文, 科技报告, 学术论文, 公文, and 简明报告 are 不用 by default. Close a 科技报告 with 附录/索引/封底 instead of renaming anything 后记.
- **Authority**: `fallback`. The conformance note must state “后记为书刊体编辑选择，不是国标必备项”.
- **Content**: counterparts the 前言 — the 前言 explains how to read; the 后记 explains after completion. Do not repeat the conclusions chapter.
- **Pagination**: a separate page at the back; whether it enters the 目次 is recorded in the composition plan.
- **Do not**: leave an empty “后记” chapter with no content; use a 后记 in place of 致谢 or conclusions.
- **When not to use**: the vast majority of GB document families.

## Index (索引)

- **Applies**: 科技报告 可选; 学位论文 only when the 校模 requires it.
- **Authority**: `standard` / `recipient`.
- **Implementation**: when an index exists, use fields or an updatable indexing tool; a hand-copied index must be rechecked after any repagination.
- **When not to use**: short and medium reports.

## Distribution list (发行列表)

- **Applies**: 科技报告 可选 when distribution control is needed.
- **Authority**: `standard` / `recipient`.
- **Fields**: receiving units, copy counts, 密级 control. Use only authorized lists.
- **When not to use**: public, uncontrolled distribution.

## Back cover (封三与封底)

- **Alias**: 封底, 封三. The 公文 版记 is not a 封底.
- **Purpose**: protect the text; may repeat the number, 出版项, or spine information.
- **Applies**: 科技报告 封底 可选; 学位论文 follows binding; 书刊体 可选; 公文 is 不用 for this structure.
- **Authority**: 科技报告 `standard`; spine rules, when needed, refer to `GB/T 11668` (`standard`, only when a spine genuinely exists).
- **Fields**: short title, number, and 出版项 consistent with the 封面. Spine: title and 责任者, only when thickness suffices.
- **Pagination**: no page number.
- **Do not**: draw 版记 or seal areas on the back cover to fake an official document.
- **When not to use**: electronic shorts, journal papers.

---

## Official-document element package (GB/T 9704 only, 公文要素包)

Use only for a genuine Party/government official document or an explicit user request for the official-document format. Do not move any item below into a 学位论文, 科技报告, or 书刊体.

Numeric values for type-area geometry and fonts/sizes live only in the 公文 profile of [typography-and-layout.md](typography-and-layout.md). This section covers only element identity and order.

**版头**: 份号, 密级和保密期限, 紧急程度, 发文机关标志, 发文字号, 签发人, red separator line.  
**主体**: 标题, 主送机关, 正文, 附件说明, 发文机关署名, 成文日期, 印章, 附注, 附件.  
**版记**: 抄送机关, 印发机关和印发日期, separator lines.  
**版心外**: page number (position and 一字线 form per the standard's formal text and the issuing agency's detailed rules).

- **Authority**: current `GB/T 9704` + the issuing agency's detailed rules.
- **Do not**: produce a red header, document number, seal, or 签发人 without issuing authority; replace the 版头/版记 with a 封面/扉页/目次/致谢.
- **Missing elements**: without genuine agency elements, stop and switch to another document family; do not “symbolically” fake an official document.
