# Design tokens playbook — worked examples

The method is always the same: find what the content's own world already uses to mark, measure, or organize itself, and let that become the document's structural device — rather than reaching for a generic "handbook template" look. These four worked examples show the same method applied to different subject matter (the fourth is a deliberate exception to the "color = category" rule the first three establish — read it after the others), so you can pattern-match rather than reason about it from a blank page each time.

For each, note the shape of the reasoning: **subject → what that world already measures/marks → signature device → palette logic → type pairing**. The palette and type choices are downstream of the signature device, not picked independently.

---

## Example 1 — AI video-production workflow meeting (this skill's origin case)

- **Subject**: a team discussing automation pipelines for AI-generated video, obsessed with frame-level timing (multiple speakers specifically discuss the difference 0.2 seconds makes to a cut).
- **What that world already measures**: timecodes, shot lists, edit decision lists (EDLs), clapperboard/slate conventions.
- **Signature device**: chapter numbers styled as timecodes ("TC 00:03"); the table of contents laid out as an EDL table (columns: TC / chapter / one-line thesis / keywords) instead of a plain list; sprocket-hole perforation motif on the cover only (used once, not repeated everywhere — restraint).
- **Palette logic**: four category accents (blue = methodology, ochre = tooling, vermillion = problem/critique, sage = collaboration) used identically across card tabs, diagram fills, and pull-quote borders throughout — so a reader learns "vermillion = a problem being called out" by page 3 and can rely on it for the rest of the document.
- **Background/ink**: warm bone paper (`#F0EDE4`), near-black warm ink (`#1C1B17`) — deliberately not the AI-default cream+terracotta pairing, and not pure white/black.
- **Type pairing**: Noto Serif CJK SC (display, high weight, for titles/theses — carries authority) + Noto Sans CJK SC (body — stays out of the way for long reading).

## Example 2 — A legal/policy brief

- **Subject**: an internal memo synthesizing a new regulation's implications for a company's contracts team.
- **What that world already measures**: clause numbers, statute citations, effective dates, redlines (additions/deletions in a legal document).
- **Signature device**: section numbers styled like statute citations ("§ 3.2"); a running "status" tag per section styled like a redline stamp — GREEN "no action needed" / AMBER "review by [date]" / RED "blocking — escalate" — reused as the card-tab color logic so the whole document is scannable by risk level from a distance, which is exactly what a reader in a hurry needs from this genre.
- **Palette logic**: the traffic-light logic above *is* the accent system — it's not decorative, it's the document's actual finding, made visible.
- **Background/ink**: cool paper white with a hairline rule system (this is one of the three flagged "AI defaults" in frontend-design — but here it's a genuine fit, because legal documents' own visual convention already looks like this; the rule is "don't reach for it by default," not "never use it." Deliberate fit for the brief overrides the general caution.)
- **Type pairing**: a serif built for long-form legal reading (e.g. a Georgia/Source Serif-class face) for body text — readability under scrutiny matters more than personality here — with a monospace or slab face reserved only for the § citation numbers, echoing statute-book typography.

## Example 3 — A lab notebook / experimental science writeup

- **Subject**: a research group's log of a series of experiments, restructured into a "what we actually learned" document.
- **What that world already measures**: sample IDs, reagent tables, dated notebook entries, hypothesis → method → result → conclusion structure.
- **Signature device**: each chapter framed explicitly as Hypothesis / Method / Result / Conclusion (a structure already native to how scientists think, not invented for this document); a repeating "notebook margin" column running down the outer edge of each page holding dated micro-annotations, echoing a physical lab notebook's margin notes.
- **Palette logic**: two accents only (a result-positive teal, a result-negative/inconclusive amber) — deliberately restrained, because this genre's credibility comes from looking sober, not colorful. Restraint itself is the aesthetic choice here.
- **Background/ink**: graph-paper-adjacent very pale blue-white background with a faint grid texture (subtle, not a loud graph-paper cliché), dark graphite ink.
- **Type pairing**: a clean grotesque sans for both display and body (differentiated by weight, not by switching families) — echoes the plain, unfussy register of real lab documentation, where a mismatched display serif would read as over-designed for the genre.

## Example 4 — A multi-topic developer glossary (wayfinding rotation, not category color)

- **Subject**: a "field guide" reference translating ~300 software/AI-era jargon terms across nine independent topics (architecture, AI agents, deployment, testing, UI, languages, graphics, databases) for a non-technical reader — no narrative arc, no shared taxonomy across chapters, meant to be jumped around in rather than read start to finish.
- **What that world already measures**: nothing that unifies all nine topics — this is the case described in "How to use this when the subject doesn't map cleanly" below, at the *document* level rather than a single ungrounded chapter.
- **Signature device**: a distinct accent hue **per chapter** (nine total, evenly spaced around the wheel) used purely for wayfinding, not category meaning — the same color marks that chapter's header, its table headers, its diagrams, and (since this document also shipped an HTML-only search overlay and scrollspy rail — see `references/advanced-techniques.md` §7) that chapter's rail dot and search-result chip. A reader learns "this chip color = chapter 6" the way they'd learn a subway line color, purely navigational, no semantic claim attached. A radial "constellation" diagram on the cover (see `scripts/svg_diagrams.py`'s `radial_diagram`) connects all nine chapter icons around a central mark, visually previewing the whole book as one flat set — reinforcing that these are nine parallel doors in, not a sequence.
- **Palette logic**: this is the exception to Examples 1-3's rule that "the same color always means the same *thing*" — here the color's only job is disambiguation between otherwise-unrelated chapters. See `advanced-techniques.md` §8 for when to reach for this pattern instead of a 3-4 category system.
- **Background/ink**: warm paper (`#F7F5EF`) with a very faint blueprint-style grid texture on cover/divider pages only — a nod to "engineering documentation" without tipping into the flagged broadsheet/newspaper default (no hairline column rules, generous rounded card geometry instead).
- **Type pairing**: Noto Serif SC (display) + Noto Sans SC (body) + a self-hosted monospace (via `@fontsource`, see `advanced-techniques.md` §4) reserved specifically for English/technical terms and code — letting the type face itself distinguish "jargon being defined" from "prose explaining it" throughout, without extra markup styling.

---

## How to use this when the subject doesn't map cleanly

Not every input has an obvious "native visual vocabulary" (e.g. a rambling personal journal, a grab-bag brainstorm with no single domain). When that happens:
1. Look for *any* recurring structural idea in the content itself — even a loose one (e.g. the person keeps describing things in terms of "before/after," or the notes naturally cluster into a small number of repeating categories).
2. If truly nothing domain-specific presents itself, it's fine to fall back to a straightforward, restrained editorial look (generous whitespace, one confident type pairing, one accent color) rather than inventing a forced metaphor — a forced motif that doesn't actually fit the content reads worse than no motif at all.
3. Whatever you choose, still avoid the three flagged generic-AI defaults (see SKILL.md Phase 2) unless the brief specifically calls for one of them.

This is a *per-chapter* fallback for content that doesn't cohere. If the lack of coherence is structural — the whole document is a flat set of genuinely unrelated topics by design, not a failure to find a theme — that's not a fallback case at all, it's Example 4's pattern: stop looking for one unifying motif and use per-chapter wayfinding color instead (see `references/advanced-techniques.md` §8).
