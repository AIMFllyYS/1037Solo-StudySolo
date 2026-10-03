---
name: notes-to-handbook
description: Restructure notes into a designed HTML+PDF handbook. Use when 整理, 手册, 纪要, PDF, or the user pastes/uploads notes, a transcript, ASR dump, lecture notes, outline, or glossary and asks to organize it, summarize it into a document, or make a handbook / designed writeup — even if they never say HTML, PDF, or design. Also for long multi-topic reference docs (glossaries, FAQs) that need in-page search/nav. Do not use for grammar-only edits, filling an existing docx/pptx/slide template, or a plain markdown summary with no visual design.
metadata:
  short-description: Notes/transcripts → designed HTML+PDF handbook
---

# Notes → Handbook

Turn a pile of raw, disorganized text into a document someone would actually want to keep and re-read. This is not a formatting task ("make this text look nicer") — it is two compounded jobs done well: **re-thinking the content's structure from first principles**, then **designing a visual system that makes that structure legible**. Neither half is optional, and skipping straight to CSS before the content is actually restructured is the single most common way this goes wrong.

The pipeline has six phases, one of them optional. Each phase has a hard gate: don't move to the next one until the current one's checklist passes. This mirrors a piece of production wisdom that shows up constantly in the source material this skill was built from — validate at every step, don't let problems compound silently into the next stage.

```
source → [1] restructure → [2] design system → [3] build HTML → (3.5 optional: interactive layer)
        → [4] render PDF → [5] QA → [6] deliver
```

This file covers the core pipeline end to end. Two bundled resources back it up and are referenced inline where relevant rather than repeated here: `references/design-tokens-playbook.md` (worked design-system examples) and `references/advanced-techniques.md` (source-parsing shortcuts, the two-pass render technique, font sourcing, the interactive layer, and other patterns that came out of real runs of this skill) — skim both once before your first project, then return to specific sections as needed.

## Phase 1 — Restructure from first principles

**Read the entire source before writing anything.** Not skim — read. Messy transcripts (especially ASR output) repeat themselves, contradict themselves, and circle back to the same point from three different angles forty minutes apart. You cannot see the real structure from the first third of the document.

### Find the problems, not the timeline

The number one failure mode is producing a fancy-looking chronological recap. Nobody needs that — they were there, or the raw transcript already exists. Your value-add is answering: **what are the actual underlying questions or problems this content is wrestling with, and what does it conclude about each one?**

Concretely:
1. Do a first pass and list every distinct claim, opinion, or piece of advice you can find, in any order, without worrying about grouping yet.
2. Cluster them by the *problem they answer*, not by who said them or when. Two comments 40 minutes apart that are really both about "how do we stop the intro from being boring" belong in the same section, wherever they occurred.
3. For each cluster, write **one thesis sentence** — the single claim that section exists to support. If you can't compress a cluster to one sentence, it's probably two clusters.
4. Order the clusters/chapters so each one stands alone as an answer to one question. A reader should be able to jump to chapter 5 without having read 1-4.

If the source is genuinely just a flat list of facts with no underlying tension or question (e.g. a spec sheet, a raw data dump), first-principles restructuring may mean something lighter — grouping by category and cutting redundancy — rather than inventing thesis statements that aren't there. Don't force a "problem/thesis" frame onto content that's naturally just enumerative. Read the material and let it tell you which kind of document it wants to be.

### Route content to the right visual form

Not everything should become a paragraph. As you draft each chapter, actively decide the shape of each piece of content:

| Content shape | Use | Why |
|---|---|---|
| Cause → effect, or a repeatable step-by-step process | **SVG diagram** | Spatial relationships read faster as a diagram than as prose describing the diagram |
| 3–4 parallel, independent sub-concepts under one heading | **Card grid** | Lets a reader compare at a glance instead of parsing paragraph breaks |
| One sentence that is unusually precise, quotable, or load-bearing for the argument | **Pull quote** | Signals "this exact phrasing matters" — but see the rule below |
| An enumerable set of steps/criteria/options | **Bulleted list** | Ordinary sequence, no need for a diagram |
| Concrete next steps someone should actually go do | **Checklist** (with checkbox glyphs) | Visually distinct from descriptive content — signals "actionable," not "background" |
| Everything else — explanation, nuance, connective reasoning | **Prose paragraph** | Don't force explanation into bullets; bullets that are actually sentences with periods are a sign you should write a paragraph instead |

Default to prose. Diagrams, cards, and pull quotes should feel like relief, not wallpaper — a page that is 100% cards with no connective prose reads as a slide deck pretending to be a document. Aim for prose carrying the argument, with 1-2 visual elements per section as anchors, not the reverse.

Working from Chinese-language source (especially in the structured-source fast path above)? `references/advanced-techniques.md` §5 has a keyword list of Chinese bold lead-in phrases (一句话/建议/关键点/关系是, etc.) that reliably mark author-intended pull-quote sentences even when not explicitly formatted as one — useful as a first-pass detector, not a replacement for judgment.

### Integrity rules (non-negotiable)

These matter more than any design choice in this skill, because getting them wrong actively misinforms the reader:

- **Don't invent attribution.** Messy multi-speaker transcripts (especially ASR output with no diarization) often make it genuinely unclear who said what. If you're not confident, use soft framing ("有组员提到" / "one participant suggested") instead of naming a specific person. Only attribute to a named individual when the source is unambiguous about it.
- **Don't invent precision.** No fabricated timestamps, statistics, dates, or quotes that aren't actually in the source. If you're using a numbering scheme that looks like data (e.g. timecodes, page-style "TC 00:03" labels), make sure it reads as a *stylistic device*, not as a claim about when something was actually said — don't attach fake precise timestamps to specific claims.
- **Pull quotes must be real, minimally-cleaned excerpts** from the source (you may trim filler words for readability) — never a paraphrase dressed up in quotation marks.
- **Paraphrase, don't mirror.** Outside of deliberate pull quotes, rewrite in your own words rather than lightly editing the source's exact sentence structure — this is both a copyright-hygiene practice and, usually, a clarity improvement, since raw transcripts are rarely well-phrased.
- **Gate check before Phase 2:** re-read your draft chapter by chapter against the source. For each claim, ask "is this actually supported by something in the raw text, or did I smooth it into existence?" Cut or soften anything you can't point to.

**Before starting the manual read-and-restructure above**, check whether the source is actually already well-structured (real headings/tables that map cleanly onto sections — an existing spec, wiki page, or glossary rather than a raw transcript). If so, `references/advanced-techniques.md` §1 describes a faster parse-don't-paraphrase path that still owes the reader everything Phase 2 onward promises — it changes how you get through Phase 1, not whether Phases 2-6 apply.

## Phase 2 — Build a design system (before writing any code)

If this session already has a frontend-design or design-token skill loaded, read it first — it covers the general principles (token system, restraint, avoiding templated defaults). Otherwise follow this phase and `references/design-tokens-playbook.md`; do not look for a host-specific path. This skill adds one specialization on top of those principles that matters a lot for notes/handbook documents specifically:

### Ground the visual identity in the content's own world, not the topic's genre

Don't design "a nice handbook template" and pour the content into it. Ask: **what is this content's own native visual vocabulary** — its instruments, its jargon, its physical artifacts, the way its practitioners actually mark and measure things? Derive the signature structural device from there. This is the difference between a document that feels generic and one that feels made-for-this.

Worked example from this skill's own origin: a meeting about AI video-production automation was turned into a handbook using a **film-continuity / timecode motif** — chapter numbers styled as "TC 00:03", the table of contents laid out as an "EDL" (edit decision list) — because the meeting's own content kept returning to frame-level precision (multiple people specifically discuss the difference 0.2 seconds makes to a cut). The motif wasn't decorative; it was already latent in what the group cared about.

Read `references/design-tokens-playbook.md` for two more worked examples across different domains (a legal/policy brief, a lab-notebook style scientific writeup) before designing — pattern-matching from a couple of examples is more reliable than reasoning about this abstractly from scratch.

**Explicitly avoid, unless the user's brief specifically calls for it:** warm cream background + terracotta/clay accent serif (`#D97757`-adjacent); near-black background + single acid-green/vermillion accent; broadsheet hairline-rule zero-radius newspaper columns. These are the three defaults nearly every AI-generated design converges to regardless of subject — using one by default (rather than as a deliberate choice for a brief that calls for it) is the fastest way to make the document look templated.

### Build the token system

Before writing HTML, decide and write down:
- **Paper / ink**: a background color (rarely pure white — a warm or cool off-white/bone reads as more considered) and a primary text color (rarely pure black).
- **3–4 named accent colors**, each tied to a semantic role that recurs throughout the document (e.g. one per content-category if the material has natural categories — methodology / problem / tool / collaboration — used consistently as card tab colors, diagram fills, and pull-quote borders so the same color always means the same thing across 20 pages). Exception: a document that is a *flat set of genuinely independent topics* with no shared taxonomy (a multi-subject glossary, an FAQ spanning unrelated products) should use one accent **per chapter** for pure wayfinding instead of forcing a 3-4 category system onto unrelated content — see `references/advanced-techniques.md` §8 and the playbook's Example 4.
- **Type pairing**: a display face for headers with real personality, a body face for reading, both matched to the register of the content (a governance brief and a game-dev postmortem should not use the same pair). For CJK content, verify available fonts first — see Phase 3.
- **One signature structural device** — the thing a reader would point to and say "oh, that's *this* document." A numbering scheme, a recurring diagram style, a margin motif. Spend your boldness here and keep everything else disciplined, per the frontend-design skill's restraint principle.

### Component vocabulary

Reuse this set of components across the document rather than inventing new patterns per section — consistency is what makes a long document feel designed rather than assembled:

- **Cover** — title, one-line thesis, metadata block (date/source/participants/doc type)
- **TOC** — chapter list with a one-line thesis per chapter, not just a title (a reader should be able to decide what to read from the TOC alone)
- **Chapter opener** — running header (breadcrumb-style), big chapter number, title, a boxed/ruled **thesis statement** (one sentence, visually distinct — this is the chapter's whole argument in one line)
- **Section head** — a small marker (dot, rule, numeral) + heading, used consistently
- **Card** — a colored top tab (category color) + eyebrow label + heading + short body; grid 1-2 columns
- **Pull quote** — left border in the accent color, larger display-face type, attribution line below
- **Diagram frame** — bordered box around an inline SVG, with a captioned label below (e.g. "图 2.1 — ...") — see SVG guidance in Phase 3
- **Checklist** — checkbox glyph + bold action + one-line elaboration, for the closing action-items section
- **Footer wayfinding** — small persistent doc-title / chapter / page marker

`assets/template.html` contains a ready-to-customize skeleton with all of these components already built as generic CSS classes (using CSS custom properties for every color/font so re-skinning is a find-and-replace on the `:root` block). Start from it rather than writing this CSS from scratch each time — copy it into your working directory and fill in content + token values.

## Phase 3 — Build the HTML

- Page geometry: A4 is `210mm × 297mm`. Each "page" is a `div.page` with `width:210mm; min-height:297mm` (use `min-height`, not `height` — never clip content, let it grow and paginate naturally). See Phase 4 for why the padding inside this div has to be chosen carefully relative to how you render.
- **CJK content**: verify fonts before assuming availability — run `fc-list :lang=zh` in bash. `Noto Serif CJK SC` (display) and `Noto Sans CJK SC` (body) are reliably present in this environment and pair well for an editorial look. Don't assume a Western font stack renders CJK at all. For a non-CJK display/mono face (e.g. code or English terms need something better than the DejaVu/Liberation defaults), Google Fonts' CDN is unreachable from this sandbox — use `npm install @fontsource/<name>` instead to get self-hostable `.woff2` files; see `references/advanced-techniques.md` §4.
- **SVG diagrams**: keep them simple and legible at print size — 2-5 labeled shapes with clear arrows, not dense infographics. Use `var(--accent-name)` for fill/stroke so diagrams automatically stay in sync with the token system. Every diagram gets a caption below the frame. If a relationship needs more than ~6 nodes to explain, it's probably two diagrams or a table, not one diagram. Rather than hand-authoring raw `<path>` markup per diagram, use `scripts/svg_diagrams.py` — a small library of parameterized generators (flow chain, pyramid, quadrant, layered stack, radial hub-and-spoke) that keeps stroke widths, arrow styles, and label spacing consistent across every diagram in the document; see the picker guide in that file's module docstring and `references/advanced-techniques.md` §9.
- Build iteratively: draft the full HTML in one pass since the structure is now known from Phase 1-2, then move to rendering and let the QA loop in Phase 5 drive refinement — don't hand-tune spacing before you've seen it rendered even once.

## Phase 3.5 — Optional: interactive layer for the HTML deliverable (skip by default)

The HTML and PDF outputs don't have to be identical — the PDF is fixed, the HTML is live. For documents long or reference-like enough that readers will search and jump around rather than read start-to-finish (a glossary, FAQ, API reference — **not** a short linear meeting recap, where this adds cost without benefit), consider adding:

- A **scrollspy chapter rail** (fixed vertical strip, usually screen-right, highlighting the current chapter as the reader scrolls, click to jump).
- A **Cmd/Ctrl-K search overlay** (Spotlight-style modal, live-filtered results, keyboard nav, click-to-scroll-and-highlight).

A ready-to-adapt implementation of both (CSS + HTML + vanilla JS) lives in `assets/interactive-nav.html` — copy it in rather than writing from scratch. Both components **must be hidden in print** (`@media print { display:none !important }` — the asset file already includes this; don't remove it). Full guidance, including how to build the search index as a side effect of rendering instead of a separate pass, is in `references/advanced-techniques.md` §§6-7. Default to skipping this phase entirely unless the document's shape specifically rewards it.

## Phase 4 — Render to PDF

Use `scripts/render_pdf.js` (Playwright + Chromium, already available in this environment):

```bash
node scripts/render_pdf.js <input.html> <output.pdf>
```

### The one bug that will bite you if you skip this paragraph

Playwright's `page.pdf({ margin: {...} })` **shrinks the printable content area** below the nominal page size. If your CSS sizes `.page` divs at the full `297mm` but you also pass a non-zero `margin.bottom`/`margin.top` to Playwright, every single page's usable height is actually `297mm − margins`, while your div still claims the full 297mm. The result: every page overflows by exactly the margin amount, and once any chapter's content gets close to filling a page, that overflow sliver gets promoted to its own **fully blank page** in the output PDF — often several of them, scattered through the document, each contributing nothing.

The fix used in `scripts/render_pdf.js`: set all Playwright margins to `0mm` and do all page-number/footer rendering **inside the HTML itself** (an absolutely-positioned element within each `.page` div, well clear of the bottom edge), rather than via Playwright's `headerTemplate`/`footerTemplate`. This makes the CSS page size and the PDF page size agree exactly, which eliminates the phantom blank pages at the source instead of papering over them with spacing tweaks.

If you inherited HTML that used Playwright header/footer templates with non-zero margins, converting to this pattern is the first thing to try before touching any CSS spacing.

**Want real page numbers in the TOC** (e.g. "chapter 5 .......... p.12"), not just chapter titles? That requires knowing a later chapter's page number *before* that page has been rendered — solved with a two-pass render (render once with placeholder tokens, locate each chapter's first page from the pass-1 output, substitute, render again). This is optional polish, not required by default — see `references/advanced-techniques.md` §2 for the full technique and two CJK-specific gotchas in the page-detection step.

## Phase 5 — QA: the hard-gate check before delivery

Don't eyeball a 15-20 page PDF page by page and call it done — that's slow and unreliable. Run the bundled checker, which rasterizes every page and flags the two failure modes that actually matter:

```bash
python3 scripts/check_pdf_pages.py <output.pdf>
```

It reports, per page, the fraction of dark (ink) pixels, and flags:
- **Blank pages** (~0% ink) — always a bug (the margin/height mismatch above is the most common cause). Zero tolerance: a finished document should have zero of these.
- **Sparse pages** (low ink %, below a threshold) — flagged for your judgment, not auto-failed. A chapter-opener/title page or a cover is *supposed* to be sparse; a page that sparse in the middle of a content flow usually means a card or paragraph got orphaned alone on a page by a spacing/page-break issue and should be tightened (reduce margins on `.cardgrid`/`h3`/`.diagram`/paragraphs) or merged back.

**Acceptance checklist before presenting the files:**
- [ ] Checker reports zero blank pages
- [ ] Every flagged "sparse" page is deliberately sparse (cover/chapter-divider), not an accident
- [ ] Every chapter's thesis statement is one sentence and actually summarizes that chapter
- [ ] No invented attribution, timestamps, or stats (re-check against Phase 1's integrity rules)
- [ ] Color-coding is consistent: the same accent color means the same category everywhere it appears (cards, diagrams, quotes) — or, if using the wayfinding-rotation pattern (§8 of advanced-techniques.md), the same chapter's accent is used identically across its own header/tables/diagrams/rail-dot/search-chip
- [ ] CJK text actually renders in the intended font (spot-check a rasterized page, don't just trust the CSS)
- [ ] Diagrams are legible at the rendered size — check the raster, not just the source SVG viewBox

Fix issues and re-render; repeat until the checklist passes. This loop (render → check → fix → re-render) is the same "don't pass a broken step downstream" discipline this skill's Phase 1 asks you to apply to content — apply it to the artifact too.

## Phase 6 — Deliver

Save both the `.html` source and the rendered `.pdf` to the outputs directory and present both — the HTML is a legitimate, editable deliverable on its own, not just an intermediate file. Give a short conversational handoff (what the chapters are, one or two notable design choices and why), not a long postamble walking through everything you did. If the person wants changes, expect to edit the HTML and re-run Phases 4-5, not start over.

Two things worth knowing before presenting files:
- If the HTML needs to work as a single portable file (opened or shared without its asset folder), inline any locally-hosted font files as base64 data URIs as a final delivery step — keep a non-inlined version for iterating, only inline for the final artifact. See `references/advanced-techniques.md` §4.
- A CJK document with embedded Noto Serif/Sans CJK fonts commonly produces a multi-megabyte PDF purely from font embedding — this is normal, not a bug, and not worth chasing down unless the person specifically asks for a smaller file (see §10 of the same doc).
