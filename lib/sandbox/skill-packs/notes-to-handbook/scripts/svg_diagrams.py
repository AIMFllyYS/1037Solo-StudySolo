# -*- coding: utf-8 -*-
"""
svg_diagrams.py — a small, reusable library of parameterized SVG generators
for handbook-style documents.

Why this exists: hand-authoring raw SVG <path> markup per diagram is slow and
produces inconsistent stroke widths, spacing, and label placement across a
document. These functions take *semantic* content (a list of labels, an
accent color) and return ready-to-embed SVG strings with consistent styling,
so every diagram in a document looks like it belongs to the same family.

Usage pattern:
    from svg_diagrams import icon, flow_diagram, pyramid_diagram
    svg = flow_diagram(["本地开发", "打包", "部署", "生产环境"], accent="#2B5C82")
    # embed `svg` directly in your HTML string

All generators return a raw `<svg ...>...</svg>` string using `viewBox` (no
fixed width/height) so they scale cleanly inside a `.diagram-frame` component
sized by CSS. Pass a hex color or a CSS `var(--accent-x)` string as `accent`
— both work since the output uses it verbatim in `fill`/`stroke` attributes.

Diagram picker — match the content shape to the generator:
  - A → B → C sequence, pipeline, or process        -> flow_diagram / vertical_flow_diagram
  - A hierarchy from small authority to large        -> pyramid_diagram
  - Two independent axes / a 2x2 classification      -> quadrant_diagram
  - Layered "foundation, then things built on it"    -> stack_diagram
  - A hub-and-spoke set of parallel, related items    -> radial_diagram

If a relationship needs more nodes than these generators comfortably fit
(more than ~6-7 per diagram), it is probably two diagrams or a table, not one
— see SKILL.md Phase 3.
"""

import math

ICON_PATHS = {
    # A small starter icon set — monoline, 24x24 viewBox, consistent
    # stroke-width/linecap/linejoin. Extend this dict per-project rather than
    # mixing icon styles within one document.
    "layers": '''
        <rect x="3" y="4.2" width="18" height="4.2" rx="1.1"/>
        <rect x="3" y="9.9" width="18" height="4.2" rx="1.1"/>
        <rect x="3" y="15.6" width="18" height="4.2" rx="1.1"/>
    ''',
    "idea": '''
        <path d="M4 5.2h16a1 1 0 011 1v9a1 1 0 01-1 1H9.2l-4 3.6v-3.6H4a1 1 0 01-1-1v-9a1 1 0 011-1z"/>
        <path d="M12 8.4l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"/>
    ''',
    "agent": '''
        <rect x="5" y="8.4" width="14" height="10.6" rx="2.4"/>
        <line x1="12" y1="8.4" x2="12" y2="4.4"/>
        <circle cx="12" cy="3.3" r="1"/>
        <circle cx="9" cy="13.2" r="1"/>
        <circle cx="15" cy="13.2" r="1"/>
        <line x1="9" y1="16.6" x2="15" y2="16.6"/>
    ''',
    "cloud": '''
        <path d="M7 18a4 4 0 01-.5-7.96A5 5 0 0116.9 9.1 4.4 4.4 0 0117 18H7z"/>
        <line x1="12" y1="15.4" x2="12" y2="8.6"/>
        <path d="M9 11.4 12 8.4 15 11.4"/>
    ''',
    "checklist": '''
        <rect x="5.2" y="4" width="13.6" height="16.6" rx="2"/>
        <path d="M9 3.3h6v2.1H9z"/>
        <path d="M8.4 12.6l2 2 4.6-4.8"/>
        <line x1="8.4" y1="17.2" x2="15.6" y2="17.2"/>
    ''',
    "window": '''
        <rect x="3.4" y="5" width="17.2" height="14" rx="1.6"/>
        <line x1="3.4" y1="9" x2="20.6" y2="9"/>
        <circle cx="5.9" cy="7" r=".55" fill="currentColor" stroke="none"/>
        <circle cx="7.7" cy="7" r=".55" fill="currentColor" stroke="none"/>
    ''',
    "brackets": '''
        <path d="M9.2 8l-4 4 4 4"/>
        <path d="M14.8 8l4 4-4 4"/>
        <line x1="13.3" y1="6.2" x2="10.7" y2="17.8"/>
    ''',
    "orbit": '''
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
        <ellipse cx="12" cy="12" rx="9" ry="3.5"/>
        <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/>
        <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/>
    ''',
    "database": '''
        <ellipse cx="12" cy="6.2" rx="7" ry="2.5"/>
        <path d="M5 6.2v11.6a7 2.5 0 0014 0V6.2"/>
        <path d="M5 12a7 2.5 0 0014 0"/>
    ''',
    "book": '''
        <path d="M4 5.4c2.4-1 5-1 8 .3v13c-3-1.3-5.6-1.3-8-.3z"/>
        <path d="M20 5.4c-2.4-1-5-1-8 .3v13c3-1.3 5.6-1.3 8-.3z"/>
    ''',
    "search": '''
        <circle cx="10.3" cy="10.3" r="6.3"/>
        <line x1="15" y1="15" x2="20.2" y2="20.2"/>
    ''',
    "check": '''
        <circle cx="12" cy="12" r="8.6"/>
        <path d="M8.2 12.3l2.5 2.5 5.1-5.4"/>
    ''',
    "warning": '''
        <path d="M12 3.6L21.4 20H2.6z" stroke-linejoin="round"/>
        <line x1="12" y1="9.4" x2="12" y2="14.4"/>
        <circle cx="12" cy="17.2" r=".2" fill="currentColor" stroke="currentColor" stroke-width="1.6"/>
    ''',
    "arrow-right": '''
        <line x1="4" y1="12" x2="19" y2="12"/>
        <path d="M14 7l5 5-5 5"/>
    ''',
}


def icon(key, cls=""):
    """Return a standalone <svg> icon. Use `color:` in CSS to tint (uses currentColor)."""
    path = ICON_PATHS.get(key, "")
    c = f' class="{cls}"' if cls else ""
    return (f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{path}</svg>')


def _esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _multiline(x, y, text, size, weight=600, fill="currentColor", family="sans-serif", anchor="middle", lh=None):
    """Render `\\n`-separated text as centered tspans-equivalent (separate <text> elements,
    which is more reliable across renderers than <tspan dy>)."""
    lines = text.split("\n")
    lh = lh or size * 1.32
    start = y - (len(lines) - 1) * lh / 2
    out = []
    for i, ln in enumerate(lines):
        out.append(f'<text x="{x}" y="{start + i*lh:.1f}" text-anchor="{anchor}" '
                    f'font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{fill}">{_esc(ln)}</text>')
    return "".join(out)


def flow_diagram(nodes, accent, width=640, height=136, sub=None, caption=None, font="sans-serif"):
    """Horizontal chain of boxes joined by arrows — for A -> B -> C sequences/pipelines.
    nodes: list[str] (use \\n for a two-line label). sub: optional list[str], one caption
    per node, same length as nodes."""
    n = len(nodes)
    pad = 14
    arrow_w = 30
    box_w = (width - pad * 2 - arrow_w * (n - 1)) / n
    box_h = 46
    cy = height / 2 - (10 if sub else 0)
    top = cy - box_h / 2
    uid = f"fd{abs(hash(tuple(nodes))) % 100000}"
    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    svg.append(f'<defs><marker id="arrow-{uid}" viewBox="0 0 10 10" refX="8" refY="5" '
                f'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
                f'<path d="M0 0L10 5L0 10z" fill="{accent}"/></marker></defs>')
    x = pad
    for i, label in enumerate(nodes):
        svg.append(f'<rect x="{x:.1f}" y="{top:.1f}" width="{box_w:.1f}" height="{box_h}" rx="3" '
                    f'fill="#FFFFFF" stroke="{accent}" stroke-width="1.3"/>')
        svg.append(f'<rect x="{x:.1f}" y="{top:.1f}" width="{box_w:.1f}" height="3" rx="1.5" fill="{accent}"/>')
        cx = x + box_w / 2
        svg.append(_multiline(cx, cy + 4, label, 12.5, weight=700, fill=accent, anchor="middle", family=font))
        if sub and i < len(sub) and sub[i]:
            svg.append(_multiline(cx, top + box_h + 15, sub[i], 8.6, weight=500, fill="#8B8F97", anchor="middle", family=font))
        if i < n - 1:
            ax1 = x + box_w
            ax2 = ax1 + arrow_w
            svg.append(f'<line x1="{ax1+3:.1f}" y1="{cy:.1f}" x2="{ax2-6:.1f}" y2="{cy:.1f}" '
                        f'stroke="{accent}" stroke-width="1.3" marker-end="url(#arrow-{uid})"/>')
        x += box_w + arrow_w
    if caption:
        svg.append(_multiline(width/2, height - 4, caption, 8.2, weight=500, fill="#8B8F97", family=font))
    svg.append('</svg>')
    return "".join(svg)


def vertical_flow_diagram(nodes, accent, notes=None, width=420, height=None, box_h=34, gap=20, font="sans-serif"):
    """Top-to-bottom chain — for a hierarchy or sequence better read vertically
    (e.g. narrow column layouts, or a "who reports to whom" chain)."""
    n = len(nodes)
    height = height or (n * box_h + (n - 1) * gap + 24)
    box_w = width * 0.56
    x0 = 10
    uid = f"vf{abs(hash(tuple(nodes))) % 100000}"
    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    svg.append(f'<defs><marker id="arrow-{uid}" viewBox="0 0 10 10" refX="7" refY="5" '
                f'markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">'
                f'<path d="M0 0L10 5L0 10z" fill="{accent}"/></marker></defs>')
    y = 12
    for i, label in enumerate(nodes):
        svg.append(f'<rect x="{x0}" y="{y:.1f}" width="{box_w:.1f}" height="{box_h}" rx="3" '
                    f'fill="#FFFFFF" stroke="{accent}" stroke-width="1.3"/>')
        svg.append(f'<rect x="{x0}" y="{y:.1f}" width="4" height="{box_h}" rx="1.5" fill="{accent}"/>')
        svg.append(_multiline(x0 + box_w/2 + 4, y + box_h/2 + 4, label, 12, weight=700, fill=accent, family=font))
        if notes and i < len(notes) and notes[i]:
            svg.append(_multiline(x0 + box_w + 14, y + box_h/2 + 3, notes[i], 8.6, weight=500,
                                   fill="#8B8F97", anchor="start", family=font))
        if i < n - 1:
            svg.append(f'<line x1="{x0+box_w/2:.1f}" y1="{y+box_h+2:.1f}" x2="{x0+box_w/2:.1f}" y2="{y+box_h+gap-4:.1f}" '
                        f'stroke="{accent}" stroke-width="1.3" marker-end="url(#arrow-{uid})"/>')
        y += box_h + gap
    svg.append('</svg>')
    return "".join(svg)


def pyramid_diagram(layers, accent, width=480, height=250, footnote=None, font="sans-serif"):
    """layers: list of (label, sublabel) from TOP (narrow/rare) to BOTTOM (wide/foundational)
    — for "from细到粗的多层保险" style hierarchies (e.g. a testing pyramid, a maturity model)."""
    n = len(layers)
    top_w = width * 0.26
    bot_w = width * 0.94
    layer_h = (height - (30 if footnote else 8)) / n
    cx = width / 2
    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    for i, (label, sub) in enumerate(layers):
        w_top = top_w + (bot_w - top_w) * (i / n)
        w_bot = top_w + (bot_w - top_w) * ((i + 1) / n)
        y_top = i * layer_h
        y_bot = (i + 1) * layer_h
        shade = 0.10 + (i / max(n - 1, 1)) * 0.10
        pts = f"{cx - w_top/2:.1f},{y_top:.1f} {cx + w_top/2:.1f},{y_top:.1f} {cx + w_bot/2:.1f},{y_bot:.1f} {cx - w_bot/2:.1f},{y_bot:.1f}"
        svg.append(f'<polygon points="{pts}" fill="{accent}" fill-opacity="{shade:.2f}" '
                    f'stroke="{accent}" stroke-width="1.1"/>')
        ty = (y_top + y_bot) / 2
        svg.append(_multiline(cx, ty - (3 if sub else -3), label, 11.5, weight=700, fill=accent, family=font))
        if sub:
            svg.append(_multiline(cx, ty + 12, sub, 7.8, weight=500, fill="#6b6f76", family=font))
    if footnote:
        svg.append(_multiline(cx, height - 10, footnote, 8.2, weight=500, fill="#8B8F97", family=font))
    svg.append('</svg>')
    return "".join(svg)


def quadrant_diagram(x_label, y_label, corner_labels, points, accent, width=480, height=340, font="sans-serif"):
    """A 2x2 classification chart — for two genuinely independent axes (see SKILL.md's
    warning: don't force a 2x2 onto a relationship that's actually a single spectrum).
    corner_labels: (top-left, top-right, bottom-left, bottom-right).
    points: list[(x0..1, y0..1, label)]."""
    m = 56
    pw = width - m * 1.4
    ph = height - m * 1.7
    x0, y0 = m, 26
    cx, cy = x0 + pw / 2, y0 + ph / 2
    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    svg.append(f'<rect x="{x0}" y="{y0}" width="{pw}" height="{ph}" fill="none" stroke="#C6C2AF" stroke-width="1"/>')
    svg.append(f'<line x1="{cx:.1f}" y1="{y0}" x2="{cx:.1f}" y2="{y0+ph}" stroke="{accent}" stroke-width="1.1" stroke-dasharray="3 3"/>')
    svg.append(f'<line x1="{x0}" y1="{cy:.1f}" x2="{x0+pw}" y2="{cy:.1f}" stroke="{accent}" stroke-width="1.1" stroke-dasharray="3 3"/>')
    tl, tr, bl, br = corner_labels
    svg.append(_multiline(x0 + pw*0.24, y0 + 13, tl, 8, weight=600, fill="#8B8F97", family=font))
    svg.append(_multiline(x0 + pw*0.76, y0 + 13, tr, 8, weight=600, fill="#8B8F97", family=font))
    svg.append(_multiline(x0 + pw*0.24, y0 + ph - 6, bl, 8, weight=600, fill="#8B8F97", family=font))
    svg.append(_multiline(x0 + pw*0.76, y0 + ph - 6, br, 8, weight=600, fill="#8B8F97", family=font))
    svg.append(_multiline(x0 + pw/2, y0 + ph + 22, x_label, 8.6, weight=600, fill=accent, family=font))
    svg.append(f'<text x="{x0-14}" y="{y0+ph/2:.1f}" text-anchor="middle" font-family="{font}" '
                f'font-size="8.6" font-weight="600" fill="{accent}" '
                f'transform="rotate(-90 {x0-14} {y0+ph/2:.1f})">{_esc(y_label)}</text>')
    for (px, py, label) in points:
        ax = x0 + px * pw
        ay = y0 + (1 - py) * ph
        svg.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="3.4" fill="{accent}"/>')
        svg.append(_multiline(ax, ay - 8, label, 8.4, weight=700, fill="#20242B", family=font))
    svg.append('</svg>')
    return "".join(svg)


def stack_diagram(layers, accent, width=480, height=None, box_h=40, gap=10, caption=None, font="sans-serif"):
    """layers: list of (title, sublabel), first item drawn widest/on top — for
    "foundation, then things built on it" relationships (e.g. a tech-stack diagram:
    low-level API -> framework choices -> tooling built on top)."""
    n = len(layers)
    height = height or (n * box_h + (n - 1) * gap + (24 if caption else 8))
    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    y = 4
    total = n
    for i, (title, sub) in enumerate(layers):
        shrink = i * 14
        x = shrink
        w = width - shrink * 2
        opacity = 0.07 + (total - i) / total * 0.1
        svg.append(f'<rect x="{x}" y="{y:.1f}" width="{w}" height="{box_h}" rx="3" '
                    f'fill="{accent}" fill-opacity="{opacity:.2f}" stroke="{accent}" stroke-width="1.2"/>')
        svg.append(_multiline(width/2, y + box_h/2 - (3 if sub else -3), title, 11.5, weight=700, fill=accent, family=font))
        if sub:
            svg.append(_multiline(width/2, y + box_h/2 + 12, sub, 7.8, weight=500, fill="#6b6f76", family=font))
        y += box_h + gap
    if caption:
        svg.append(_multiline(width/2, height - 6, caption, 8.2, weight=500, fill="#8B8F97", family=font))
    svg.append('</svg>')
    return "".join(svg)


def radial_diagram(center_label, items, width=740, height=330, font="sans-serif"):
    """A hub-and-spoke chart for a *flat* set of parallel, related items (no inherent
    order) — good as a cover/overview graphic for a multi-chapter reference document.
    items: list of (icon_key, accent, short_label)."""
    n = len(items)
    cx, cy = width/2, height/2 + 6
    rx, ry = width*0.44, height*0.40
    svg = [f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" font-family="{font}">']
    pts = []
    for i in range(n):
        ang = -math.pi/2 + i * (2*math.pi/n)
        x = cx + rx*math.cos(ang)
        y = cy + ry*math.sin(ang)
        pts.append((x, y))
    for i in range(n):
        for j in range(i+1, n):
            svg.append(f'<line x1="{pts[i][0]:.1f}" y1="{pts[i][1]:.1f}" x2="{pts[j][0]:.1f}" y2="{pts[j][1]:.1f}" '
                        f'stroke="#C6C2AF" stroke-width="0.5" stroke-opacity="0.5"/>')
    svg.append(f'<circle cx="{cx}" cy="{cy}" r="34" fill="#F7F5EF" stroke="#20242B" stroke-width="1.2"/>')
    svg.append(_multiline(cx, cy-2, center_label, 12.5, weight=700, fill="#20242B", lh=15, family=font))
    for i, (icon_key, accent, label) in enumerate(items):
        x, y = pts[i]
        svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="19" fill="#FFFFFF" stroke="{accent}" stroke-width="1.4"/>')
        ic = ICON_PATHS.get(icon_key, "")
        svg.append(f'<g transform="translate({x-8:.1f},{y-8:.1f}) scale(0.667)" stroke="{accent}" '
                    f'fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{ic}</g>')
        ly = y + 30 if y > cy else y - 26
        svg.append(_multiline(x, ly, label, 8, weight=600, fill="#565C66", family=font))
    svg.append('</svg>')
    return "".join(svg)
