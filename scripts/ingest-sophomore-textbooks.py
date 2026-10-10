"""Split extracted textbook markdown by TOC 章/节, write content files + TS trees.

Usage (after extract-textbook-pdf.py):
    python scripts/ingest-sophomore-textbooks.py --subject anatomy
    python scripts/ingest-sophomore-textbooks.py --all      # 处理 content/_raw 下所有有 textbook.toc.json 的学科

Output:
    content/{subject}/textbook/*.md
    lib/content-data/subjects/{subject}/{subject}-textbook.ts   exporting {camelCase(subject)}TextbookItems

学科不需要在此脚本登记；导出名由 subject id 机械推导（cell-biology -> cellBiologyTextbookItems），
接入 manifest 时 import 同名即可。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from content.textbook_catalog import write_catalog

REPO = Path(__file__).resolve().parents[1]


def export_name(subject: str) -> str:
    parts = [p for p in re.split(r"[-_\s]+", subject) if p]
    camel = parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])
    return f"{camel}TextbookItems"


def discover_subjects() -> list[str]:
    raw = REPO / "content" / "_raw"
    if not raw.exists():
        return []
    return sorted(p.parent.name for p in raw.glob("*/textbook.toc.json"))

SKIP_TITLE = re.compile(
    r"(封面|书名页|版权|编委|新形态|序言|修订说明|规划教材|主编简介|副主编简介|主审简介|前言|目录|索引|参考文献)"
)
CHAPTER_RE = re.compile(r"^第\s*[0-9零〇一二三四五六七八九十百]+\s*章|^绪论$|^绪论\s")
SECTION_RE = re.compile(r"^第\s*[0-9零〇一二三四五六七八九十百]+\s*节")
SUMMARY_RE = re.compile(r"^(本章小结|思考题|复习思考题|插入框)")


def clean_title(title: str) -> str:
    return (title or "").replace("\x00", "").replace("\ufffd", "").strip()


def slug_chapter(index: int, title: str) -> str:
    if title.startswith("绪论"):
        return "ch00"
    return f"ch{index:02d}"


def load_toc(subject: str) -> dict:
    path = REPO / "content" / "_raw" / subject / "textbook.toc.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for entry in data.get("toc", []):
        entry["title"] = clean_title(entry.get("title", ""))
    return data


def load_pages(subject: str) -> dict[int, str]:
    md_path = REPO / "content" / "_raw" / subject / "textbook.md"
    if not md_path.exists():
        return {}
    text = md_path.read_text(encoding="utf-8")
    pages: dict[int, str] = {}
    current = 0
    buf: list[str] = []
    for line in text.splitlines():
        m = re.match(r"^<!-- Page (\d+) -->\s*$", line)
        if m:
            if current:
                pages[current] = "\n".join(buf).strip()
            current = int(m.group(1))
            buf = []
        else:
            buf.append(line)
    if current:
        pages[current] = "\n".join(buf).strip()
    return pages


def slice_pages(pages: dict[int, str], start: int, end: int) -> str:
    chunks = []
    for p in range(start, end + 1):
        body = pages.get(p)
        if body:
            chunks.append(body)
    return "\n\n".join(chunks).strip()


def chapter_entries(toc: list[dict]) -> list[dict]:
    """Keep real 章/绪论 entries, drop front/back matter."""
    out = []
    for e in toc:
        title = clean_title(e["title"])
        if SKIP_TITLE.search(title):
            continue
        if SUMMARY_RE.match(title):
            continue
        if CHAPTER_RE.search(title) or (e["level"] <= 2 and re.match(r"^第\d+章", title)):
            if "篇" in title and "章" not in title:
                continue
            out.append(e)
    # histology: 第1章 at L2; anatomy: 第一章 at L1; cell-bio: 第一章 at L2
    # If we collected too many (including 节), filter to chapter-like only.
    filtered = []
    for e in out:
        title = e["title"].strip()
        if SECTION_RE.match(title):
            continue
        if CHAPTER_RE.search(title) or re.match(r"^第\d+章", title):
            filtered.append(e)
    return filtered


NAV_SECTION_RE = re.compile(
    r"^第\s*[0-9零〇一二三四五六七八九十百]+\s*节|^[一二三四五六七八九十]+[、．.]"
)


def is_nav_section(title: str) -> bool:
    t = title.strip()
    if SKIP_TITLE.search(t) or SUMMARY_RE.match(t):
        return False
    if t.startswith("（") or t.startswith("("):
        return False
    return bool(NAV_SECTION_RE.match(t) or SECTION_RE.match(t))


def children_of(toc: list[dict], parent: dict, next_parent: dict | None) -> list[dict]:
    start_page = parent["page"]
    end_page = (next_parent["page"] - 1) if next_parent else 10**9
    parent_level = parent["level"]
    kids = []
    for e in toc:
        if e["page"] < start_page:
            continue
        if e["page"] > end_page:
            break
        if e["page"] == start_page and e["title"].strip() == parent["title"].strip():
            continue
        if next_parent and e["page"] >= next_parent["page"] and e["level"] <= parent_level:
            break
        title = e["title"].strip()
        if CHAPTER_RE.search(title) or re.match(r"^第\d+章", title):
            continue
        if not is_nav_section(title):
            continue
        if e["level"] > parent_level + 2:
            continue
        kids.append(e)
    seen = set()
    uniq = []
    for k in kids:
        key = (k["page"], k["title"].strip())
        if key in seen:
            continue
        seen.add(key)
        uniq.append(k)
    jie = [k for k in uniq if SECTION_RE.match(k["title"].strip()) or re.match(r"^第\s*[0-9零〇一二三四五六七八九十百]+\s*节", k["title"].strip())]
    if jie:
        return jie
    return uniq


NOISE_LINE = re.compile(
    r"^(本章数字资源|本章思维导图|数字资源|思维导图|扫一扫|扫描二维码)$"
)


def clean_body(body: str) -> str:
    kept = []
    for line in body.splitlines():
        s = line.strip()
        if NOISE_LINE.match(s):
            continue
        if re.fullmatch(r"\d{1,3}", s):
            continue
        kept.append(line)
    text = "\n".join(kept)
    # Promote 图题 to figure caption when an image sits on the next/prev line.
    text = re.sub(
        r"!\[\]\((/images/[^)]+)\)\s*\n+(图[\d\-－—]+[^\n]{0,80})",
        r'\n::figure{src="\1" caption="\2"}\n',
        text,
    )
    text = re.sub(
        r"(图[\d\-－—]+[^\n]{2,80})\n+!\[\]\((/images/[^)]+)\)",
        r'\n::figure{src="\2" caption="\1"}\n',
        text,
    )
    return text.strip()


def wrap_format(title: str, body: str) -> str:
    """Keep full prose; lightly wrap 定义/注意; keep image refs; add memory if 本章小结 exists."""
    lines = [f"# {title}", ""]
    if body:
        lines.append(clean_body(body))
    # Promote 定义 / 注意 paragraphs into callouts without deleting surrounding text.
    text = "\n".join(lines)
    text = re.sub(
        r"(^|\n)(定义[：:][^\n]+(?:\n(?!定义|[注意本节图])[^\n]+)*)",
        lambda m: f"{m.group(1)}\n:::definition{{label=\"定义\"}}\n{m.group(2).strip()}\n:::\n",
        text,
        count=12,
    )
    text = re.sub(
        r"(^|\n)((?:注意|要点)[：:][^\n]+)",
        lambda m: f"{m.group(1)}\n:::pitfall{{label=\"注意\"}}\n{m.group(2).strip()}\n:::\n",
        text,
        count=12,
    )
    summary = re.search(r"本章小结[\s\S]{20,1200}", text)
    if summary:
        bullets = re.findall(r"[。；;]\s*([^。；;\n]{8,80})", summary.group(0))
        if bullets:
            mem = "\n".join(f"- {b.strip()}" for b in bullets[:8])
            text += f"\n\n:::memory{{label=\"本节必背要点\"}}\n{mem}\n:::\n"
    return text.strip() + "\n"


def ingest_subject(subject: str) -> None:
    ts_export = export_name(subject)
    data = load_toc(subject)
    toc = data["toc"]
    total_pages = int(data["pages"])
    pages = load_pages(subject)
    chapters = chapter_entries(toc)
    print(f"\n=== {subject}: {len(chapters)} chapters, raw pages loaded={len(pages)} ===")

    out_dir = REPO / "content" / subject / "textbook"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.md"):
        old.unlink()

    items: list[dict] = [
        {
            "id": "toc",
            "title": "目录",
            "type": "document",
            "status": "done",
            "summary": "教材目录。",
        }
    ]
    toc_lines = [f"# {subject} 教材目录", ""]
    for ch in chapters:
        toc_lines.append(f"- {ch['title']}")
    (out_dir / "toc.md").write_text("\n".join(toc_lines) + "\n", encoding="utf-8")

    ch_index = 0
    for i, ch in enumerate(chapters):
        title = ch["title"].strip()
        ch_index += 1
        cid = slug_chapter(ch_index if not title.startswith("绪论") else 0, title)
        if title.startswith("绪论"):
            ch_index -= 1
            cid = "ch00"
        next_ch = chapters[i + 1] if i + 1 < len(chapters) else None
        start = ch["page"]
        end = (next_ch["page"] - 1) if next_ch else total_pages
        kids_toc = children_of(toc, ch, next_ch)

        children_items = []
        if kids_toc:
            for j, sec in enumerate(kids_toc):
                sid = f"{cid}-{j + 1}"
                s_start = sec["page"]
                s_end = (kids_toc[j + 1]["page"] - 1) if j + 1 < len(kids_toc) else end
                if s_end < s_start:
                    s_end = s_start
                body = slice_pages(pages, s_start, s_end) if pages else ""
                # Same-page TOC crumbs: fold into previous 节 rather than emit a stub.
                if (not body or sum(1 for c in body if "\u4e00" <= c <= "\u9fff") < 200) and children_items:
                    prev = out_dir / f"{children_items[-1]['id']}.md"
                    extra = wrap_format(sec["title"].strip(), body)
                    if prev.exists() and body:
                        prev.write_text(prev.read_text(encoding="utf-8") + "\n\n" + extra, encoding="utf-8")
                    continue
                md = wrap_format(sec["title"].strip(), body)
                (out_dir / f"{sid}.md").write_text(md, encoding="utf-8")
                children_items.append(
                    {
                        "id": sid,
                        "title": sec["title"].strip(),
                        "type": "document",
                        "status": "done" if body else "stub",
                    }
                )
            items.append(
                {
                    "id": cid,
                    "title": title,
                    "type": "section",
                    "status": "done",
                    "summary": title,
                    "children": children_items,
                }
            )
        else:
            body = slice_pages(pages, start, end) if pages else ""
            md = wrap_format(title, body)
            (out_dir / f"{cid}.md").write_text(md, encoding="utf-8")
            items.append(
                {
                    "id": cid,
                    "title": title,
                    "type": "document",
                    "status": "done" if body else "stub",
                    "summary": title,
                }
            )
        print(f"  {cid} {title} kids={len(children_items)} pages={start}-{end}")

    for path in write_catalog(REPO, subject, ts_export, items):
        print(f"  wrote {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", default="", help="学科 id，如 anatomy")
    parser.add_argument("--all", action="store_true", help="处理 content/_raw 下所有已抽取的教材")
    args = parser.parse_args()
    if args.subject:
        subjects = [args.subject]
    elif args.all:
        subjects = discover_subjects()
    else:
        parser.error("请指定 --subject <id> 或 --all")
    for s in subjects:
        ingest_subject(s)


if __name__ == "__main__":
    main()
