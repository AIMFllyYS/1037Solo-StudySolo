# Manual DOCX normalization and PDF export

This no-shell variant intentionally contains no PowerShell, Bash, or other shell export command. Use the recipient's Word or WPS desktop application through its visible user interface, then record the renderer and version in the conformance note.

## Required output invariant

Use this sequence:

```text
draft.docx
  -> open in the recipient's target Word/WPS application
  -> update fields, table of contents, captions, and cross-references
  -> Save As a new normalized DOCX
  -> close and reopen the normalized DOCX
  -> verify no repair/font warning and stable page count
  -> Export/Save As PDF from that exact reopened DOCX
  -> freeze both files for structural and visual QA
```

Do not edit the PDF separately. Any later DOCX edit requires a new PDF export and a complete recheck.

## Microsoft Word desktop

1. Open `draft.docx` in the recipient's tested Word version.
2. If Word shows a repair, compatibility, font, or external-link warning, stop and resolve it before saving.
3. Select the whole document where appropriate and update fields. Update the table of contents, list of figures/tables, captions, cross-references, and page numbers.
4. Inspect sections, page size, orientation, margins, headers/footers, fonts, tables, figures, and final paragraph.
5. Use **File → Save As**, choose **Word Document (*.docx)**, and save to a new `final.docx` path. Do not overwrite the authoring draft.
6. Close and reopen `final.docx`. Confirm that Word does not show a repair prompt and that the page count and major pagination are stable.
7. Use **File → Export → Create PDF/XPS** or **Save As → PDF**. Export from the reopened `final.docx` to `final.pdf`.
8. Do not select PDF/A unless the archival requirement identifies the exact PDF/A part/level; a checkbox alone is not proof of conformance.

## WPS Writer desktop

1. Open `draft.docx` in the recipient's tested WPS Writer version.
2. Resolve any repair, compatibility, font, external-link, or protected-content warning before saving.
3. Update the table of contents, list of figures/tables, captions, cross-references, fields, and page numbers using WPS's update commands.
4. Inspect page setup, section transitions, fonts, tables, images, headers/footers, and the final page.
5. Use **File → Save As**, select `.docx`, and save a new `final.docx`.
6. Close and reopen `final.docx`; confirm no repair prompt and stable pagination.
7. Use **File → Export to PDF** or the equivalent WPS PDF export command to create `final.pdf` from the reopened normalized file.
8. Record that WPS was tested. WPS evidence does not establish Microsoft Word compatibility.

## Renderer record

Keep a small record beside the internal QA log:

```text
renderer: Microsoft Word or WPS Writer
version/build:
operating system:
font availability checked: yes/no
field/TOC update performed: yes/no
repair prompt: none / description
normalized DOCX:
exported PDF:
PDF/A requested: yes/no
PDF/A validator and result, if requested:
```

## Follow-up checks

After the manual export, run the Python preflight and page renderer supplied with the skill:

```text
python skill/scripts/document_preflight.py --docx final.docx --pdf final.pdf --require-a4 --strict-theme-fonts --strict-tables
python skill/scripts/render_pdf_pages.py final.pdf qa/final-run --dpi 180 --columns 4
```

The commands above are diagnostic/rendering helpers, not Office automation. Inspect the contact sheet and every rendered page. Keep the final DOCX and PDF together as one frozen delivery pair.

## Why this file exists

Some skill registries reject `.ps1` or `.sh` files even when the workflow is legitimate. This Markdown file preserves the export decision logic and safety boundaries without shipping a shell or PowerShell executor. The manual desktop workflow is the compatibility evidence; the Python helpers only perform read-oriented inspection/rendering and explicit output generation requested by the user.
