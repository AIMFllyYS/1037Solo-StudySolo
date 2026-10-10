from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from textbook_catalog import CATALOG_GROUPS, partition_items, write_catalog


def item(identifier: str) -> dict:
    return {"id": identifier, "title": '教材 "引号" 与反斜线 \\', "type": "section", "status": "done"}


class TextbookCatalogTests(unittest.TestCase):
    def test_subject_output_uses_the_current_subject_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            paths = write_catalog(repo, "anatomy", "anatomyTextbookItems", [item("ch01")])
            self.assertEqual(paths, [repo / "lib/content-data/subjects/anatomy/anatomy-textbook.ts"])
            self.assertFalse((repo / "lib/content-data/anatomy-textbook.ts").exists())
            self.assertIn('title: "教材 \\"引号\\" 与反斜线 \\\\"', paths[0].read_text(encoding="utf-8"))

    def test_grouped_chapters_keep_values_order_and_nested_children(self):
        for subject in CATALOG_GROUPS:
            items = [item("toc"), *[item(f"ch{index:02d}") for index in range(29)]]
            items[1]["children"] = [item("ch00-1")]
            groups = partition_items(subject, items)
            flattened = [value for _, values in groups for value in values]
            self.assertEqual(flattened, items)
            with tempfile.TemporaryDirectory() as tmp:
                paths = write_catalog(Path(tmp), subject, "testTextbookItems", items)
                self.assertEqual(len(paths), 1 + len(groups))
                self.assertIn('id: "ch00-1"', paths[1].read_text(encoding="utf-8"))
                entry = paths[0].read_text(encoding="utf-8")
                positions = [entry.index(f"./textbook/{name}") for name, _ in groups]
                self.assertEqual(positions, sorted(positions))

    def test_invalid_group_order_and_unknown_chapter_id_are_rejected(self):
        with self.assertRaises(ValueError):
            partition_items("histology", [item("ch20"), item("ch01")])
        with self.assertRaises(ValueError):
            partition_items("cell-biology", [item("unexpected")])


if __name__ == "__main__":
    unittest.main()
