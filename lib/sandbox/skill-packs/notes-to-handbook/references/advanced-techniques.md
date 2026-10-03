# Advanced techniques — lessons from production runs

This doc collects techniques that come up often enough to document once,
rather than re-derive per project. Each section says what problem it solves
and when to reach for it. None of these are mandatory for every document —
match them to the brief, same as everything else in this skill.

## Contents

- [1. When the source is already structured: skip manual rewriting](#1-when-the-source-is-already-structured-skip-manual-rewriting)
- [2. Two-pass rendering for forward references (accurate TOC page numbers)](#2-two-pass-rendering-for-forward-references-accurate-toc-page-numbers)
- [3. Auto-flowing pagination vs manual page-per-div — pick one deliberately](#3-auto-flowing-pagination-vs-manual-page-per-div--pick-one-deliberately)
- [4. Sourcing non-CJK display/mono fonts in this sandbox](#4-sourcing-non-cjk-displaymono-fonts-in-this-sandbox)
- [5. CJK callout-detection heuristics (for the structured-source fast path)](#5-cjk-callout-detection-heuristics-for-the-structured-source-fast-path)
- [6. Build a search index as a side effect of rendering, not a second pass](#6-build-a-search-index-as-a-side-effect-of-rendering-not-a-second-pass)
- [7. Optional interactive layer for HTML-only delivery](#7-optional-interactive-layer-for-html-only-delivery)
- [8. Palette pattern #4: wayfinding-only rotation (flat multi-chapter references)](#8-palette-pattern-4-wayfinding-only-rotation-flat-multi-chapter-references)
- [9. Programmatic SVG diagrams instead of hand-authored paths](#9-programmatic-svg-diagrams-instead-of-hand-authored-paths)
- [10. Expect large PDF file sizes for CJK documents — this is normal](#10-expect-large-pdf-file-sizes-for-cjk-documents--this-is-normal)

---

## 1. When the source is already structured: skip manual rewriting

Phase 1 of `SKILL.md` assumes the default case — raw transcript/notes with no
inherent structure, requiring you to read everything and manually derive
chapters and thesis statements. But sometimes the input is **already
reasonably structured**: existing Markdown with real headings, tables, and
bullet lists that map cleanly onto sections (a spec doc, an existing wiki
page, a glossary, a numbered outline someone already wrote).

Forcing that kind of source through full manual Phase-1 rewriting wastes
time and risks introducing errors (a hand-transcribed 30-term glossary table
*will* have typos a parser won't). When you recognize this case:

1. **Confirm it's genuinely structured, not just formatted-looking.** Read
   enough of it to check the headings really do correspond to independent
   sections and the tables have consistent column meaning throughout. If the
   "structure" is inconsistent or the real content is buried in prose between
   headers, fall back to the manual Phase 1 pipeline instead.
2. **Build a small parser instead of transcribing by hand**: Python's
   `markdown` library (`extensions=['tables','fenced_code','sane_lists']`) to
   convert Markdown → HTML fragments, then `BeautifulSoup` to post-process —
   add component classes to tables, detect callout-worthy paragraphs (see
   §5), wrap fenced code blocks, assign ids for cross-references. This is
   dramatically faster than rewriting every sentence, and — critically —
   **cannot introduce the "invented precision" integrity violation** from
   Phase 1, since every fact is a direct pass-through from source rather than
   a paraphrase.
3. **Your editorial judgment still matters** — just applied differently: not
   "what does this paragraph mean, how do I phrase it," but "does this
   already-written section deserve a diagram/card/callout instead of staying
   a table row," "is this table's column semantics worth a sub-heading,"
   "does this document's structure actually read well as-is, or does it need
   re-ordering." Content-routing (Phase 1's "route content to the right
   visual form" table) still fully applies — only the *prose-rewriting* step
   is what you're allowed to skip.
4. This path still owes the reader everything Phase 2+ promises: a real
   design system, diagrams, consistent components. "Structured source" is a
   Phase-1 shortcut, not a license to skip the rest of the pipeline and ship
   a reskinned table.

Rule of thumb: **if you can point at a specific existing paragraph/table row
for every sentence in your draft, you're in this fast path — parse, don't
paraphrase. If you're synthesizing "what does this cluster of scattered
comments actually conclude," you're in the standard Phase 1 path — you
cannot parse your way to a thesis statement that doesn't exist yet in the
source.**

---

## 2. Two-pass rendering for forward references (accurate TOC page numbers)

A TOC that lists real page numbers is much more useful than one that doesn't
— but at the moment you're generating the TOC, later chapters haven't been
paginated yet. There's no way to know chapter 7's starting page without
having already rendered the whole document. The fix is a **two-pass render**:

1. Give every chapter's opening element a unique, greppable marker in the
   rendered output — the simplest is a running header/eyebrow string that's
   unique per chapter (e.g. `"PART 03"`) and appears on that chapter's first
   page. Insert a placeholder token in the TOC instead of a real number
   (e.g. `{{PAGE_03}}`).
2. Render the PDF once (pass 1).
3. Locate each chapter's first page by scanning the rendered PDF's extracted
   text per page for that chapter's marker string:

   ```python
   import re, pdfplumber
   marks = {}
   with pdfplumber.open(pdf_path) as pdf:
       for i, pg in enumerate(pdf.pages, start=1):
           text = pg.extract_text() or ""
           for m in re.finditer(r'PART\s+(\S+)', text):
               key = m.group(1).lower().strip(".,、")
               marks.setdefault(key, i)
   ```

   Two gotchas worth knowing in advance:
   - **CJK glyph re-encoding**: some CJK fonts cause `pdfplumber`/`pdfminer`
     to extract a visually-identical but different Unicode codepoint for the
     same character (e.g. a CJK-radical variant instead of the standard
     character). Don't match on exact CJK strings if you can anchor on a
     Latin/numeral marker instead (like `"PART 03"` above) — much more
     robust than matching `"第三章"` or similar.
   - **`text-transform: uppercase` in CSS changes the extracted text**,
     since the browser renders (and therefore the PDF encodes) the visually
     transformed glyphs, not the original DOM text. If your marker has mixed
     case in the DOM (e.g. chapter id `"03b"`) but is styled
     `text-transform: uppercase`, match case-insensitively and normalize
     before using it as a dict key.

4. Substitute the real page numbers into the placeholder tokens in the HTML
   source and render again (pass 2, the final artifact). Any unmatched
   placeholder should get an explicit fallback character (e.g. `—`) rather
   than silently leaking `{{PAGE_XX}}` into the delivered document — always
   assert this didn't happen before presenting the files.

This same two-pass pattern generalizes to any forward reference: "see
chapter 5" cross-links, a computed "reading time" that depends on final
layout, etc. — render once, extract the fact you need from the render
itself, substitute, render again.

This technique is compatible with using Playwright's `headerTemplate` /
`footerTemplate` for automatic running headers and page numbers (as an
alternative to this skill's default of baking page numbers into the HTML —
see `scripts/render_pdf.js`'s docstring). If you do use Playwright's
built-in header/footer with non-zero margins, make sure your CSS `.page`
sizing accounts for the reserved margin space (page content height =
nominal page height − `margin.top` − `margin.bottom`) — this is the same
overflow failure mode `render_pdf.js` warns about, just triggered by
`headerTemplate`/`footerTemplate` margins instead of manual footer markup.

---

## 3. Auto-flowing pagination vs manual page-per-div — pick one deliberately

`assets/template.html` uses **manual pagination**: one `div.page` per
intended physical page, sized to the full page height, content hand-fit to
each div. This gives exact control and is the right default for this skill
because notes-to-handbook documents are usually short-to-medium (5-20 pages)
and benefit from deliberate per-page composition (a chapter opener page that
is *exactly* one page, not "however much the browser decides to fit").

For longer, denser documents (30+ pages, especially reference material like
a glossary or FAQ where content length per section is unpredictable and
variable), consider the alternative: **auto-flowing pagination**. Instead of
sizing divs to page height, let content flow naturally and control breaks
declaratively:

```css
.chapter-open   { break-before: page; }   /* force a new page only where you want one */
.no-break       { break-inside: avoid; }  /* keep a table row, card, or block intact */
table thead     { display: table-header-group; }  /* repeat table headers across pages */
```

Trade-offs:
- **Manual page-per-div** (this skill's default): predictable, WYSIWYG, but
  brittle if content length turns out to be wrong for the estimated page —
  this is what causes the blank/overflow-page bug `check_pdf_pages.py` was
  built to catch.
- **Auto-flow**: the browser's print engine paginates for you, so there's no
  "will this fit on one page" guessing — but you give up exact per-page
  composition, and you must be deliberate with `break-before`/`break-inside`
  or you'll get ugly mid-table or mid-paragraph splits instead.

Whichever you choose, apply it for the *whole* document — mixing manual
page-divs with auto-flow content inside them is what actually causes most
overflow bugs in practice (a manually-sized div whose content silently grows
past its own declared height because a sub-element wasn't accounted for).

---

## 4. Sourcing non-CJK display/mono fonts in this sandbox

`fc-list :lang=zh` reliably finds Noto Serif/Sans CJK SC pre-installed in
this environment (see Phase 3). For a **non-CJK display or monospace face**
(wanting something with more character than DejaVu/Liberation for Latin
headings, code, or English terms mixed into CJK body text), Google Fonts'
CDN (`fonts.googleapis.com`) is **not reachable** from this sandbox's network
allowlist. Instead:

```bash
npm install @fontsource/<font-name>          # e.g. @fontsource/jetbrains-mono
```

`@fontsource` packages (on the npm registry, which *is* reachable) bundle
self-hosted `.woff2` files per weight/subset under
`node_modules/@fontsource/<name>/files/`. Copy the `latin` (and `latin-ext`
if needed) weights you need into your project's asset folder and write
`@font-face` rules pointing at the local files — this is the same mechanism
as any self-hosted webfont, just sourced via npm instead of a font CDN.

For a **standalone HTML deliverable** (a single `.html` file the person can
open or share without its asset folder), inline these fonts as base64 data
URIs instead of relative `url()` paths as a final delivery step:

```python
import base64, pathlib
data = pathlib.Path("font.woff2").read_bytes()
uri = "data:font/woff2;base64," + base64.b64encode(data).decode("ascii")
html = html.replace("url('assets/fonts/font.woff2')", f"url('{uri}')")
```

Keep a separate, non-inlined build for iterating (asset references are
easier to debug and don't bloat every rebuild) and only produce the inlined
standalone version as the final delivery step.

---

## 5. CJK callout-detection heuristics (for the structured-source fast path)

When using the §1 fast path on Chinese-language source material, this
keyword list catches most sentences the author intended as a "pull quote /
takeaway," even when they aren't marked as an explicit blockquote — bold
lead-in phrases at the start of a paragraph:

```
一句话 / 一句话记忆 / 一句话总结
建议 / 实用建议 / 给新手的建议
判断标准
核心是 / 核心问题
关键点
关系是
三者… / 两者…（用于总结多个概念的关系）
这解决的问题是 / 问题在于
为什么要…（反问式小标题，常引出一段结论性说明）
```

Detection pattern: a paragraph whose *first* inline element is `<strong>`
and whose bold text starts with one of the above → promote to a pull-quote/
callout component. Always also promote real `<blockquote>` source elements
regardless of keyword match. This is a heuristic, not a guarantee — spot
check the result; false positives (an ordinary bold-led definition getting
turned into a callout) are usually harmless over-emphasis, but review
callout density per page — more than 2-3 per page dilutes the effect (see
Phase 1's "diagrams/cards/quotes should feel like relief, not wallpaper").

---

## 6. Build a search index as a side effect of rendering, not a second pass

If the HTML deliverable will include the optional interactive search layer
(§7), don't write a separate traversal to extract searchable content after
the fact. Instead, have the same functions that render each component (a
table row, an article section, a chapter header) push an entry into a shared
list at the moment they assign that component's DOM `id`:

```python
SEARCH_INDEX = []

def render_table_row(term, desc, row_id, chapter_meta):
    SEARCH_INDEX.append({
        "id": row_id, "kind": "term", "title": term,
        "snippet": desc[:60], "chapter": chapter_meta["title"],
    })
    return f'<tr id="{row_id}">...</tr>'
```

This guarantees the index and the document can never drift out of sync (a
separate post-hoc scraper can silently miss content if the DOM structure
changes), and it's essentially free — you were already generating an `id`
for every addressable element for the two-pass forward-reference technique
in §2, or should be, for exactly this reason.

---

## 7. Optional interactive layer for HTML-only delivery

The HTML and PDF outputs don't have to be visually identical. The PDF is
fixed by definition; the HTML is a live document and can offer navigation
the PDF can't. Two components worth adding when the document is long enough
or reference-like enough that readers will search/jump around rather than
read start-to-front (a glossary, FAQ, API reference, multi-topic handbook —
less useful for a short linear meeting recap):

- **A scrollspy chapter rail**: a fixed-position vertical strip (usually
  screen-right) with one marker per chapter, highlighting the current
  section via `IntersectionObserver` as the reader scrolls, clickable to
  jump. Reuse the same accent-per-chapter color from the design system so
  the rail visually ties back into the document (see §8).
- **A command-palette-style search overlay**: a small fixed button
  (screen corner) that opens a centered modal with a text input and live-
  filtered results from the `SEARCH_INDEX` built in §6, with keyboard
  navigation (arrow keys + Enter) and a click/Enter action that scrolls to
  and briefly highlights the target element. Bind `Cmd/Ctrl+K` as a shortcut
  — a familiar convention worth matching rather than reinventing.

**Both must be hidden in print** — this is not optional:

```css
@media print {
  .side-index, .search-fab, .search-overlay { display: none !important; }
}
```

Verify this actually holds by re-running `check_pdf_pages.py` after adding
either component — a leaked fixed-position element will show up as
unexpected ink on every page, not as a blank-page bug, so the checker's
per-page ink percentage is still a useful sanity signal even though it
won't flag this specific mistake by name.

Build cost is real (a few hundred lines of vanilla JS/CSS) — only add this
when the document's length/structure actually rewards search-and-jump
reading. Don't add it reflexively to every handbook. A ready-to-adapt
starting point for both components (CSS + HTML + vanilla JS) lives in
`assets/interactive-nav.html` — copy the relevant blocks into your document
rather than writing this from scratch.

---

## 8. Palette pattern #4: wayfinding-only rotation (flat multi-chapter references)

`references/design-tokens-playbook.md`'s three worked examples all use 3-4
accent colors tied to a **semantic category** that recurs across chapters
(methodology/tooling/problem/collaboration, a traffic-light risk system,
etc.) — the color means something every time it appears.

Some documents don't have that kind of cross-cutting category structure:
a flat collection of independent, roughly-equal-weight topics with no
shared taxonomy (a multi-subject glossary, an encyclopedia, a FAQ spanning
unrelated products). Forcing a 3-4 category system onto genuinely
independent chapters produces meaningless color-coding (chapter 5 is
"blue" for no reason connected to its content).

For this shape of document, use a **wayfinding-only rotation** instead: one
distinct accent color per chapter (as many as there are chapters, not capped
at 3-4), whose *only* job is "instantly tell the reader which chapter
they're in" — reused consistently for that chapter's header, table headers,
diagrams, and (if using §7's interactive layer) its rail-dot and search-
result chip color, but carrying no cross-chapter semantic meaning. This
matters most exactly when §7's search/rail features are in play, since the
color becomes part of the navigation system, not just decoration — a reader
learns "the teal chip in search results is always chapter 6" the same way
they'd learn a subway line's color.

Practical color-selection note: pick hues spread around the wheel at roughly
even intervals, all similar in saturation/lightness so none visually
dominates. 7-10 chapters is about the practical limit before adjacent hues
become hard to tell apart at small sizes (rail dots, table-header text);
beyond that, group chapters into parts/sections and rotate within each part
instead of using one flat 12+ color palette. See `references/design-tokens-
playbook.md`'s Example 4 for a worked instance of this pattern.

---

## 9. Programmatic SVG diagrams instead of hand-authored paths

Hand-writing raw `<path>` coordinates per diagram is slow and produces
visibly inconsistent stroke widths, arrow styles, and label spacing across a
document — small inconsistencies that are individually minor but collectively
read as "not quite designed." `scripts/svg_diagrams.py` bundles a small
library of parameterized generators (`flow_diagram`, `vertical_flow_diagram`,
`pyramid_diagram`, `quadrant_diagram`, `stack_diagram`, `radial_diagram`)
that take semantic content — a list of labels, an accent color — and return
a ready-to-embed SVG string with consistent styling. Pick the generator that
matches the content's actual shape (see the picker guide in that file's
module docstring); don't force a relationship into a diagram type that
doesn't fit it just because a generator exists for it.

This also makes diagrams trivially re-themeable: change one accent color
variable and every diagram using it updates together, versus hunting through
several hand-authored SVGs for hardcoded hex values.

---

## 10. Expect large PDF file sizes for CJK documents — this is normal

A CJK-heavy document with embedded Noto Serif/Sans CJK fonts (required for
portability — the PDF must carry the glyphs it uses) commonly produces
multi-megabyte files (single digits of MB is typical for a 40-60 page
document) purely from font embedding, not from a bug. Don't chase this down
as a problem unless the person specifically asks for a smaller file — full
CJK charset embedding is inherently heavy, and subsetting to only the
characters actually used is a real but rarely-worth-it optimization for a
one-off document.
