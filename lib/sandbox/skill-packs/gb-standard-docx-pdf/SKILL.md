---
name: gb-standard-docx-pdf
description: Package a Chinese manuscript as a professional, editable DOCX and a matching fixed-layout PDF under the applicable current Chinese national or industry standards, recipient template, academic citation rules, figure/table rules, typography, and target renderer. Survey the build toolchain first (Word/WPS, python-docx, Pandoc, XeLaTeX+ctex, Typst, HTML print) and agree on the route with the user before generating; optionally derive a standards-aware audio readout edition (有声版) from the frozen document. Use for theses, academic papers, scientific reports, official documents, institutional reports, submissions, and acceptance-ready document delivery; do not use GB/T 9704 as a universal report template.
---

# GB-standard DOCX/PDF packaging

Turn a supplied manuscript into one controlled source document, one normalized editable DOCX, and one PDF exported from that exact DOCX — or, when the user explicitly agrees on a PDF-only typesetting route such as XeLaTeX or Typst, into a single-source PDF chain. Select standards by document type, keep every citation and borrowed image traceable, and prove the final pages visually. When the contract includes it, derive an optional audio readout edition from the frozen document.

## Required companion capabilities

- Use `documents:documents` for DOCX authoring, rendering, and inspection.
- Use `pdf:pdf` for PDF inspection, rendering, PDF/A work, and verification.
- Load the bundled workspace document/PDF dependencies before generating files.
- Use a reference manager or deterministic formatter when the manuscript has a substantial bibliography; never fabricate missing bibliographic fields.

## Non-negotiable rules

1. Classify the document before choosing fonts, margins, numbering, or front matter. There is no single national layout profile for every Chinese Word/PDF document.
2. Verify the current status and implementation date of every cited standard at the National Public Service Platform for Standards Information. The snapshot in this skill was checked on 2026-08-18 and is not permanent.
3. Apply this precedence: explicit recipient/submission template and contract; applicable mandatory rules; applicable current standard; organization/discipline style; clearly labeled fallback profile. Record conflicts instead of silently blending them.
4. Treat `GB/T` and `CY/T` documents as recommended standards unless another rule, contract, or recipient makes them binding. Never claim certification or full compliance without a clause-level matrix and evidence.
5. Use `GB/T 9704` only for Party/government official-document formatting or an explicit request to follow that profile. A thesis, article, business report, competition entry, or general project report does not become an official document merely because it uses A4 and FangSong.
6. Keep formatting facts distinct: `required by standard`, `required by recipient`, `chosen fallback`, and `renderer compatibility measure` are different categories.
7. Cite ideas, wording, data, tables, and images at the point of use. A source note does not cure missing permission; permission does not replace attribution.
8. Preserve the manuscript's meaning. Flag unverifiable claims, broken references, ambiguous rights, and missing metadata; do not invent content to make the document look complete.
9. Normalize the final DOCX in the recipient's target office suite, then export the PDF from that same saved DOCX. Any later DOCX edit invalidates the PDF and its QA.
10. Structural validation and visual validation are separate. Inspect a contact sheet and every final PDF page before calling the delivery complete.
11. Never choose the production toolchain silently. Survey what the environment actually has, present concrete route options with trade-offs, and record the user's explicit choice before generating. A PDF-only route (LaTeX, Typst, HTML print) changes the deliverable set; agree on that change in advance instead of discovering it at delivery.
12. An audio readout edition is an optional derivative of the frozen document. It never substitutes for the DOCX/PDF pair, and it never supports a publication-grade audiobook claim without matching evidence.

## Workflow

Maintain this checklist:

```text
Standards-based document packaging
- [ ] 1. Lock document type, recipient contract, renderer, outputs, and archival need
- [ ] 2. Survey the build toolchain and agree on the route with the user
- [ ] 3. Verify applicable standards and create a requirements matrix
- [ ] 4. Audit manuscript structure, citations, figures, tables, rights, and missing data
- [ ] 5. Select or derive an explicit style profile
- [ ] 6. Build the composition plan; normalize text, numbering, citations, captions, tables, and cross-references
- [ ] 7. Build one source document with named styles and stable structure
- [ ] 8. Normalize in target Word/WPS and export the matching PDF
- [ ] 9. Run DOCX/PDF structural preflight
- [ ] 10. Render the PDF and inspect every page; compare against the normalized DOCX
- [ ] 11. Produce the optional audio readout edition when the contract includes it
- [ ] 12. Re-export after every change and deliver only frozen finals plus a concise conformance note
```

### 1. Lock the contract

Record internally:

- document class, audience, submission purpose, language, and confidentiality;
- controlling template or written specification, with version/date;
- requested citation system, bibliography style, and disciplinary conventions;
- target renderer: Microsoft Word, WPS, or another named suite and version;
- paper/orientation, print/binding, duplex, color, accessibility, and PDF/A requirements;
- filenames, metadata, deadline, and whether tracked changes/comments must remain;
- image ownership, licenses, permissions, redactions, and allowed transformations;
- whether an audio readout edition is requested, and its purpose (proofing, accessibility, distribution).

If the recipient supplies a template, inspect its actual styles, sections, headers, fields, and page geometry. Do not recreate its appearance approximately when it can be preserved directly.

### 2. Survey and agree on the build toolchain

Read [references/toolchain-selection.md](references/toolchain-selection.md) completely.

- Survey the environment: office suites, typesetting engines (XeLaTeX, Typst, Pandoc), HTML print engines, DOCX libraries, installed Chinese fonts, and installation/network permissions.
- Ask the questions that decide the route: must the recipient edit the DOCX? How rigid is the layout (millimetre-level `GB/T 9704` geometry or standards-aligned neatness)? Formula/figure/bibliography profile? One-off or batch? Environment constraints? Acceptance renderer?
- Present two to four concrete routes with trade-offs, recommend one, and wait for explicit agreement. Record the toolchain, source format, who normalizes and exports, and the evidence boundary.
- Default to the editable-DOCX chain when the recipient must edit the file. Use a PDF-only route only as an explicit user decision, with the resulting DOCX deliverable change recorded.

### 3. Route to the correct standards

Read [references/standards-routing.md](references/standards-routing.md) completely. Create a private matrix:

```text
Requirement | authority/source | clause or template location | applies? | implementation | evidence | status
```

Use the current document-family route:

| Document | Primary route |
|---|---|
| Party/government official document | Current `GB/T 9704` plus actual issuing-organ rules |
| Degree thesis/dissertation | Current `GB/T 7713.1` plus the university/graduate-school template |
| Academic paper | Current `GB/T 7713.2`, target journal rules, and current `GB/T 7714` |
| Scientific/technical report | Current `GB/T 7713.3`, contract/funder template, and current `GB/T 7714` |
| Data paper | Current `GB/T 7713.4` plus repository/journal rules |
| Bound institutional / book-like report | Recipient template first; use the 书刊体 fallback in `manuscript-structure.md`; never claim thesis or official-document compliance |
| Concise formal report | Recipient template first; use declared, relevant standards selectively; do not add academic front matter to look “standard” |

Apply `GB/T 15834` for Chinese punctuation and `GB/T 15835` for numerals when relevant. Use `CY/T 171` and `CY/T 170` as the detailed figure/table publishing references for academic publications and as declared guidance elsewhere.

### 4. Audit the manuscript and assets

Create three ledgers before layout:

```text
Citation ledger: cite id | claim/quotation | source | locator | metadata complete | in-text marker | bibliography entry
Figure ledger: figure id | owner/source | license/permission | modification | in-text callout | caption | source note | alt text
Requirement ledger: requirement | authority | implementation | verification evidence | exception
```

Read [references/citations-figures-and-rights.md](references/citations-figures-and-rights.md) completely when the manuscript contains external facts, quotations, references, tables, or images. Resolve duplicate citations, uncited bibliography entries, missing locators, dead links, ambiguous authorship, “来源：网络”, and “侵删” before finalization. Do not infer permission from public availability.

### 5. Select the style profile

Read [references/typography-and-layout.md](references/typography-and-layout.md) completely before setting styles or page geometry.

Create an explicit style sheet containing page setup, front matter, title hierarchy, body, quotations, lists, captions, table text, equations, notes, references, headers/footers, and page numbering. For each value, label its source as `standard`, `recipient`, or `fallback`.

If no controlling rule specifies a value, use the conservative fallback profile in that reference and disclose that it is an editorial choice, not a national requirement.

### 6. Normalize editorial structure

Read [references/manuscript-structure.md](references/manuscript-structure.md) and produce the composition plan for this document class. Then read **only** the selected blocks in [references/component-catalog.md](references/component-catalog.md). Do not load every catalog section, and do not add 封面、扉页、目次、前言、致谢, or 后记 unless the plan includes them.

Preserve logical hierarchy with real heading styles. Use automatic multilevel numbering, captions, cross-references, footnotes/endnotes, table of contents, and page fields where the plan requires them. Do not type dynamic numbers manually.

For references, use the current applicable `GB/T 7714` edition and one consistent system—normally sequential numeric or author-year when permitted by the recipient. Verify each entry against the source itself. Include persistent identifiers and access dates when required; do not turn search-result snippets into references.

### 7. Build the source document

Read [references/docx-pdf-production.md](references/docx-pdf-production.md) completely before generation.

For the default DOCX route, use named styles and literal East Asian/Western font mappings. Keep images inline unless the layout contract truly requires floating objects. Preserve aspect ratio, use fixed table geometry, use real field codes, embed all media, add document metadata, and remove theme-font ambiguity when cross-suite fidelity matters.

For a PDF-only route agreed in step 2, keep the same one-source invariant in the agreed source format (`.tex`, `.typ`, `.md`, or `.html`): one frozen source, every output derived from it.

Keep the authoring source separate from the target-suite-normalized final. Do not edit the normalized file by ad hoc OOXML patching after export.

### 8. Normalize and export

This section describes the default Word/WPS route. A PDF-only toolchain replaces it with that toolchain's own compile/export step; the font-embedding, text-extraction, and visual-QA duties are unchanged.

This no-shell release variant does not ship PowerShell, Bash, or another shell export command. Read [scripts/export_office.md](scripts/export_office.md) and use the recipient's visible Word or WPS desktop interface to save a new normalized DOCX and export the PDF from that exact reopened DOCX. Record the renderer/version and any compatibility warning. Export success is not layout proof.

If long-term preservation is explicitly required, produce and validate the requested PDF/A conformance separately; ordinary “Save as PDF” output must not be called PDF/A without validation.

### 9. Preflight and visual QA

Read [references/qa-and-acceptance.md](references/qa-and-acceptance.md) completely.

Run structural preflight with document-specific expectations:

```powershell
python scripts/document_preflight.py `
  --docx final.docx --pdf final.pdf --require-a4 `
  --strict-theme-fonts --strict-tables `
  --expect "正式题名" `
  --forbid "图片来源：网络" `
  --forbid "侵删"
```

Render every PDF page:

```powershell
python scripts/render_pdf_pages.py final.pdf qa/final-run --dpi 180 --columns 4
```

Inspect the contact sheet, then every `page-*.png`. Reopen the normalized DOCX in the target suite and compare page count/order, headings, cross-references, citations, figures, tables, fonts, headers, footers, and final page against the PDF.

### 10. Produce the optional audio readout edition

Only when the contract includes it. Read [references/audio-readout.md](references/audio-readout.md) completely.

Extract the reading-order text from the frozen final DOCX, build the document-level 多音字/专名 lexicon, normalize numbers and identifiers for readout, and synthesize with the agreed engine. Then run the ASR round-trip check, human spot checks, and loudness/true-peak verification, and deliver chaptered audio with a manifest. The audio edition inherits the document's conformance note; it does not extend it.

### 11. Deliver with bounded claims

Deliver the normalized DOCX and its matching PDF, plus the audio edition when agreed. Include a concise conformance note stating:

- document class and controlling template;
- the agreed build toolchain and source format;
- standards/profile applied and the date their status was checked;
- renderer and environment actually tested;
- whether PDF/A, accessibility, font embedding, link behavior, and another office suite were tested;
- audio engine, voice, and QA evidence when an audio edition was produced;
- unresolved exceptions or rights restrictions.

Say `依据……编排并完成结构/视觉检查` when that is what the evidence supports. Say `符合` only for the exact scope verified. Never say `国标认证` unless a competent process actually issued such certification.

## Stop conditions

Pause and request direction when:

- two binding requirements conflict and neither has declared precedence;
- an institution/recipient template needed for submission is missing and fallback choices could cause rejection;
- no available toolchain can produce the required deliverables (for example, an editable DOCX is mandatory but only PDF-only engines exist) and the user has not chosen an alternative;
- a borrowed image lacks a usable license/permission and cannot safely be removed or replaced;
- citation metadata cannot be verified from the source;
- the intended TTS route's license or service terms conflict with the document's intended use;
- the target office renderer or required PDF/A validator is unavailable but the user requires verified compliance.

Otherwise continue with clearly recorded assumptions and conservative defaults.

## Resource routing

- Applicability, precedence, current standard snapshot, and compliance wording: [references/standards-routing.md](references/standards-routing.md)
- Document-family structure, composition plan, and 选件矩阵: [references/manuscript-structure.md](references/manuscript-structure.md)
- 封面、题名页/扉页、目次、前言、致谢、后记 and other block implementation: [references/component-catalog.md](references/component-catalog.md)
- Citations, quotations, bibliography, figures, tables, source notes, permissions, and copyright: [references/citations-figures-and-rights.md](references/citations-figures-and-rights.md)
- Fonts, sizes, page geometry, hierarchy, fallback profile, and accessibility: [references/typography-and-layout.md](references/typography-and-layout.md)
- Build toolchain survey, route decision matrix, and per-route invariants: [references/toolchain-selection.md](references/toolchain-selection.md)
- OOXML, Word/WPS compatibility, PDF export, font embedding, and optional PDF/A: [references/docx-pdf-production.md](references/docx-pdf-production.md)
- Optional audio readout edition (语音/有声版), TTS routes, and audio QA: [references/audio-readout.md](references/audio-readout.md)
- Structural checks, page rendering, revision loop, and acceptance gate: [references/qa-and-acceptance.md](references/qa-and-acceptance.md)
- Authoritative URLs and verification dates: [references/source-register.md](references/source-register.md)
