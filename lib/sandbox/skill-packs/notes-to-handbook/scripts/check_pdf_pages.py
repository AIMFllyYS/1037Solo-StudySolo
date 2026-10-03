#!/usr/bin/env python3
"""
check_pdf_pages.py — Rasterize every page of a rendered handbook PDF and flag
pages that are likely layout bugs rather than intentional content.

Usage:
    python3 check_pdf_pages.py <path/to/output.pdf> [--dpi 90] [--sparse-threshold 2.0]
                                [--save-dir /tmp/pdf_pages]

What it checks, per page:
  - "ink fraction": the percentage of pixels darker than a threshold (i.e.
    actual text/line/fill content, not paper-colored background). This is a
    much more reliable signal than "percentage of non-background pixels",
    which gets confused by textured/off-white paper backgrounds.
    Caveat: a dark-background page (e.g. a cover with a near-black background
    and light text) will show a *high* ink fraction because the background
    itself counts as "dark" — that's expected and not a bug; the script only
    ever flags pages as BLANK or sparse, never as "too dark," so this doesn't
    cause false failures, just don't be alarmed by a cover showing ~95%+.
  - BLANK  — ink fraction is ~0%. This should never happen in a finished
    document. It is almost always caused by a Playwright margin / CSS page
    height mismatch (see render_pdf.js's docstring) rather than by genuinely
    empty content — no real page of a document has *zero* dark pixels.
  - SPARSE — ink fraction is below --sparse-threshold but not zero. This is
    common and *fine* for covers and chapter-divider pages by design — the
    script flags these for your judgement rather than treating them as
    failures. If a sparse page shows up in the middle of a content chapter,
    it usually means a card, paragraph, or diagram got orphaned alone on a
    page by a spacing/page-break issue and should be tightened or merged.

Exit code is 0 if there are zero BLANK pages, 1 otherwise — safe to use in a
render-check-fix loop or a CI-style gate.

Requires: pdf2image (`pip install pdf2image --break-system-packages`) and
poppler-utils (already present in this environment).
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from pdf2image import convert_from_path


def analyze_pdf(pdf_path: str, dpi: int = 90, sparse_threshold: float = 2.0, save_dir: str = None):
    pages = convert_from_path(pdf_path, dpi=dpi)
    results = []

    save_path = Path(save_dir) if save_dir else None
    if save_path:
        save_path.mkdir(parents=True, exist_ok=True)

    for i, page in enumerate(pages):
        arr = np.array(page.convert('RGB'))
        gray = arr.mean(axis=2)
        # "ink" = pixels clearly darker than any plausible paper/card background.
        # 100/255 comfortably separates text/lines/fills from off-white or
        # pastel card backgrounds while still catching thin hairline rules.
        ink_frac = float((gray < 100).mean()) * 100.0

        status = 'ok'
        if ink_frac == 0.0:
            status = 'BLANK'
        elif ink_frac < sparse_threshold:
            status = 'sparse'

        results.append({'page': i + 1, 'ink_pct': round(ink_frac, 3), 'status': status})

        if save_path:
            page.save(save_path / f'page_{i + 1:02d}.png')

    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pdf_path', help='Path to the rendered PDF')
    parser.add_argument('--dpi', type=int, default=90, help='Rasterization DPI (default 90 — plenty for pixel-fraction analysis)')
    parser.add_argument('--sparse-threshold', type=float, default=2.0, help='Ink%% below which a page is flagged as sparse (default 2.0)')
    parser.add_argument('--save-dir', default=None, help='Optional directory to save rasterized page PNGs for visual inspection')
    args = parser.parse_args()

    if not Path(args.pdf_path).exists():
        print(f'No such file: {args.pdf_path}', file=sys.stderr)
        sys.exit(2)

    results = analyze_pdf(args.pdf_path, dpi=args.dpi, sparse_threshold=args.sparse_threshold, save_dir=args.save_dir)

    blank = [r for r in results if r['status'] == 'BLANK']
    sparse = [r for r in results if r['status'] == 'sparse']

    print(f'{args.pdf_path} — {len(results)} pages\n')
    for r in results:
        marker = {'BLANK': '  BLANK', 'sparse': '  sparse', 'ok': ''}[r['status']]
        print(f"  page {r['page']:>3}   ink {r['ink_pct']:>6.3f}%{marker}")

    print()
    if blank:
        print(f"FAIL: {len(blank)} fully blank page(s): {[r['page'] for r in blank]}")
        print("  -> Almost always a Playwright margin / CSS page-height mismatch.")
        print("     Check render_pdf.js is being used with margin:0 and footers rendered in-HTML.")
    else:
        print("PASS: no blank pages.")

    if sparse:
        print(f"NOTE: {len(sparse)} sparse page(s) worth a manual look: {[r['page'] for r in sparse]}")
        print("      Expected for covers/chapter-dividers — a problem if it's mid-chapter.")

    sys.exit(1 if blank else 0)


if __name__ == '__main__':
    main()
