"""Write textbook navigation metadata in its subject directory.

Grouping follows contiguous chapter subjects; item values and order stay intact.
This module writes metadata only. It does not ingest or replace Markdown bodies.
"""
from __future__ import annotations

import re
from pathlib import Path


CATALOG_GROUPS = {
    "histology": [("tissues", 7), ("senses-and-regulation", 13), ("visceral-organs", 19), ("embryology", None)],
    "biochemistry": [("biomolecules", 6), ("metabolism", 12), ("gene-expression", 19), ("disease-and-organs", None)],
    "instrumental-analysis": [("intro-and-electrochemistry", 2), ("spectroscopy", 9), ("mass-and-separations", None)],
    "cell-biology": [("foundations", 3), ("cell-structures", 9), ("cell-environment", 12), ("cell-life", None)],
}


def ts_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def emit_item(obj: dict, indent: int) -> str:
    sp = "  " * indent
    lines = [f"{sp}{{"]
    lines.append(f'{sp}  id: "{obj["id"]}",')
    lines.append(f'{sp}  title: "{ts_escape(obj["title"])}",')
    lines.append(f'{sp}  type: "{obj["type"]}",')
    lines.append(f'{sp}  status: "{obj["status"]}",')
    if obj.get("summary"):
        lines.append(f'{sp}  summary: "{ts_escape(obj["summary"])}",')
    if obj.get("children"):
        lines.append(f"{sp}  children: [")
        for i, child in enumerate(obj["children"]):
            chunk = emit_item(child, indent + 2)
            if i < len(obj["children"]) - 1:
                chunk = chunk.rstrip() + ","
            lines.append(chunk)
        lines.append(f"{sp}  ],")
    lines.append(f"{sp}}}")
    return "\n".join(lines)


def array_module(name: str, items: list[dict]) -> str:
    return (
        "import type { ContentItem } from '@/lib/types/content';\n\n"
        f"export const {name}: ContentItem[] = [\n"
        + ",\n".join(emit_item(item, 1) for item in items)
        + "\n];\n"
    )


def group_export(name: str) -> str:
    words = name.split("-")
    return words[0] + "".join(word.capitalize() for word in words[1:]) + "Items"


def partition_items(subject: str, items: list[dict]) -> list[tuple[str, list[dict]]]:
    groups = CATALOG_GROUPS[subject]
    result = [(name, []) for name, _ in groups]
    previous_group = 0
    for item in items:
        match = re.fullmatch(r"ch(\d+)", item["id"])
        chapter = -1 if item["id"] == "toc" else int(match.group(1)) if match else None
        if chapter is None:
            raise ValueError(f"Unexpected textbook chapter id: {item['id']}")
        index = next(i for i, (_, last) in enumerate(groups) if last is None or chapter <= last)
        if index < previous_group:
            raise ValueError("Chapter grouping would reorder navigation items")
        previous_group = index
        result[index][1].append(item)
    return result


def write_catalog(repo: Path, subject: str, export_name: str, items: list[dict]) -> list[Path]:
    folder = repo / "lib" / "content-data" / "subjects" / subject
    if not folder.resolve().is_relative_to(repo.resolve()):
        raise ValueError("Catalog path is outside the repository")
    folder.mkdir(parents=True, exist_ok=True)
    entry = folder / f"{subject}-textbook.ts"
    if subject not in CATALOG_GROUPS:
        entry.write_text(array_module(export_name, items), encoding="utf-8")
        return [entry]

    parts = partition_items(subject, items)
    part_folder = folder / "textbook"
    part_folder.mkdir(parents=True, exist_ok=True)
    imports, spreads, written = [], [], []
    for group, group_items in parts:
        name = group_export(group)
        path = part_folder / f"{group}.ts"
        path.write_text(array_module(name, group_items), encoding="utf-8")
        written.append(path)
        imports.append(f'import {{ {name} }} from "./textbook/{group}";')
        spreads.append(f"  ...{name},")
    entry.write_text(
        "import type { ContentItem } from '@/lib/types/content';\n"
        + "\n".join(imports)
        + f"\n\nexport const {export_name}: ContentItem[] = [\n"
        + "\n".join(spreads)
        + "\n];\n",
        encoding="utf-8",
    )
    return [entry, *written]
