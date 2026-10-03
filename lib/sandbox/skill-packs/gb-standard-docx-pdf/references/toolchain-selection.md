# Build toolchain selection

Contents:

- First principle
- Survey the environment
- Ask the user and lock the decision
- Toolchain routes
- Per-route invariants
- Decision matrix
- Bounded claims per toolchain

## First principle

The default production chain in this skill is one editable DOCX, normalized in the target Word/WPS suite, with the PDF exported from that exact DOCX. It is the default because most Chinese recipients require an editable DOCX.

Other professional typesetting toolchains — LaTeX, Typst, Pandoc, HTML/CSS print engines — are legitimate, but they change the deliverable: most of them emit PDF only and cannot produce an editable DOCX. Choosing one silently is a scope change, not a style choice. Therefore: survey the environment, present concrete options, and reach explicit agreement with the user **before** generating any page. Record the agreed toolchain in the contract and in the final conformance note.

## Survey the environment

Before asking, establish what the environment actually has. Check with the tools available in the current session, or ask the user directly:

- Office suites: Microsoft Word, WPS Writer, LibreOffice — presence and version;
- Typesetting engines: `xelatex`/`latexmk` (TeX Live or MiKTeX, with the ctex collection), `typst`, `pandoc`;
- HTML print engines: WeasyPrint, Paged.js, Prince;
- DOCX libraries: Python with python-docx, Node with the `docx` package or docxtemplater;
- Chinese fonts actually installed: 宋体/SimSun, 黑体/SimHei, 楷体/KaiTi, 仿宋/FangSong (or 仿宋_GB2312), and open alternatives such as Fandol or Source Han when the recipient system is not Windows;
- Constraints: may new software be installed, may the network be used, and does the user permit command-line tools in their environment.

A route that requires a missing tool or font is not an option unless the user agrees to install or supply it. A DOCX font declaration never proves the renderer has the font.

## Ask the user and lock the decision

Ask these questions and do not assume the answers:

1. **Deliverables:** must the recipient edit the DOCX, or is a PDF enough? Both? (An editable-DOCX requirement rules out LaTeX/Typst/HTML routes as the primary chain.)
2. **Layout rigidity:** millimetre-level 公文 geometry per `GB/T 9704`, or "standards-aligned and neat"? Is there a usable Word/LaTeX template from the recipient to build on?
3. **Content profile:** formula density, figure/table complexity, and whether the bibliography must follow current `GB/T 7714` automatically.
4. **Batch or one-off:** single document, or repeated data-driven production (contracts, certificates, notices)?
5. **Environment:** Office/WPS, TeX, fonts, installation rights, network access.
6. **Acceptance:** which application and version will the recipient open or print with.

Present two to four concrete route options with their trade-offs, recommend one, and wait for explicit agreement. Record the decision: toolchain, source format, who normalizes/exports, and the evidence boundary.

## Toolchain routes

| Route | Outputs | Strengths | Limits | Choose when |
|---|---|---|---|---|
| python-docx, template-driven (default) | editable DOCX + PDF via Word/WPS | full style/section/table control; the existing reference chain | pagination finalized only by Word/WPS; CJK runs need explicit `w:eastAsia` mappings | recipient must edit the DOCX (公文、学位论文、投稿) |
| Pandoc + reference.docx | DOCX; PDF via xelatex/weasyprint | Markdown authoring; `--reference-doc` style mapping; `--citeproc` with `GB/T 7714` CSL styles | layout control stops at style-mapping level; 红头线、发文机关标志、fixed line grids are not expressible from Markdown; no CSL-M (中英文"等/et al."分流不可用); do not use the archived wkhtmltopdf engine | content is规范 but layout is not extreme; a reference.docx can carry the styles |
| XeLaTeX + ctex | PDF only | best mathematics; deterministic layout; ctexart/ctexrep/ctexbook with fontset (windows/fandol/adobe); gbt7714/biblatex-gb7714 bibliography packages; thesis templates such as thuthesis; community `GB/T 9704` templates exist but are archived/unmaintained — verify before reuse | no editable DOCX; recipient editability fails; non-Windows fonts must be licensed and installed | formula-heavy thesis/report where only PDF is accepted |
| Typst | PDF only | modern syntax; very fast builds; many Chinese thesis templates; built-in `GB/T 7714—2015` bibliography styles | CJK gaps remain: punctuation compression depends on lang/font pairing, line-start prohibition holes, first-line indent after figures/equations/lists, no strict full-width page grid; no CSL-M; citation-range folding has known bugs | newly authored paper/report that accepts PDF and tolerates small CJK compromises |
| HTML/CSS print (WeasyPrint / Paged.js / Prince) | PDF only | familiar web stack; CSS Paged Media headers/footers/page numbers; Paged.js inherits Chromium's line breaking; Prince is the most complete and is commercial | WeasyPrint lacks fine CJK text controls (`line-break`, punctuation compression); deployment machine must have Chinese fonts installed | team already on a web stack; batch report PDFs |
| LibreOffice headless | PDF from DOCX | free, scriptable, server-friendly | complex Word layouts shift; missing CJK fonts render as boxes; verify with the real document | no Office available; use as fallback, never as proof of Word/WPS fidelity |
| Word/WPS COM automation | DOCX/PDF with highest fidelity | the real renderer does the export (`ExportAsFixedFormat`) | desktop-interactive only; Microsoft does not support server-side Office automation | single-machine assisted batch work with the user present |

## Per-route invariants

- The one-source invariant survives every route: whatever the source format is (`.docx`, `.md`, `.tex`, `.typ`, `.html`), the PDF must derive from the same frozen source as any delivered DOCX, and any later source edit re-triggers generation, export, and full QA.
- If the agreed route emits PDF only, the DOCX deliverable changes: either it is dropped by agreement, or a companion DOCX is produced (for example through Pandoc) and explicitly labeled as a secondary conversion, not the typeset original. State this in the contract and the conformance note.
- PDF-only routes skip the Word/WPS normalization step, but font embedding, text extraction, and full-page visual QA in [qa-and-acceptance.md](qa-and-acceptance.md) still apply in full.
- LibreOffice or headless conversion evidence never substitutes for the named recipient renderer; see [docx-pdf-production.md](docx-pdf-production.md).
- Batch template filling (docxtemplater/python-docx) is a production route, not a typesetting engine: apply the same DOCX construction rules and the same QA gates.

## Decision matrix

| Requirement profile | Recommended route |
|---|---|
| Editable DOCX required (公文、学报、甲方要改) | python-docx template-driven, or Pandoc + reference.docx for simple content; PDF from Word/WPS, or LibreOffice headless with per-document visual verification |
| Formula-heavy, deterministic layout, PDF accepted (学位论文、科技报告) | XeLaTeX + ctex or the recipient's LaTeX thesis class; gbt7714/biblatex-gb7714 for the bibliography |
| New paper, speed matters, small CJK compromises acceptable, PDF only | Typst with a modern thesis template |
| Web/HTML stack, batch report PDFs | WeasyPrint or Paged.js; Prince when publication-grade CSS Paged Media is justified |
| Bulk fill-in documents (合同、证书、通知) | docxtemplater or python-docx template filling; no typesetting engine |
| No Office, no TeX, Python-only server | python-docx for DOCX + LibreOffice headless for PDF, with the fidelity risk disclosed |

When the profile is mixed, prefer the route that satisfies the acceptance renderer and the editability requirement first; typographic elegance is never a reason to break the deliverable contract.

## Bounded claims per toolchain

- Say `由 XeLaTeX（ctex）排版，PDF 经逐页视觉检查` when that is what happened; never imply Word/WPS compatibility for a document that never passed through them.
- Say `DOCX 由 Pandoc 从同一源转换，版式以 PDF 为准` for a companion DOCX.
- Say `LibreOffice 转换，版式未在 Word/WPS 验证` when that is the evidence.
- The claims discipline in [standards-routing.md](standards-routing.md) applies unchanged: toolchain choice never upgrades a fallback into a standard.
