// @vitest-environment node
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const body = vi.hoisted(() => ({ markdown: "## 正文\n\n$E=mc^2$" }));
vi.mock("@/lib/content/loader", () => ({
  readContent: () => body.markdown,
  readExamples: () => [
    { id: "ex1", title: "一", content: "first detail" },
    { id: "ex2", title: "二", content: "second detail" },
    { id: "ex3", title: "三", content: "third detail" },
  ],
}));
vi.mock("@/components/notes/NoteRendererServer", () => ({ default: () => null }));

import ContentPage from "./page";

it("server page sends a rendered markdown island and bounded example preload", async () => {
  body.markdown = "## 正文\n\n$E=mc^2$";
  const result = await ContentPage({ params: Promise.resolve({ subject: "probability", category: "detail", id: "1.1" }) });
  expect(result.props.initialContent).toBeNull();
  expect(result.props.hasInitialContent).toBe(true);
  expect(result.props.renderedNote).not.toBeNull();
  expect(result.props.contentRevision).toMatch(/^[a-f0-9]{16}$/);
  expect(result.props.initialExamples.map((example: { content: string }) => example.content)).toEqual(["first detail", "", ""]);
});

it("large material sends a content reference instead of a multi-megabyte rendered tree", async () => {
  body.markdown = "## 大型真题\n\n" + "公式 $E=mc^2$ 与解析。\n\n".repeat(5000);
  const result = await ContentPage({ params: Promise.resolve({ subject: "probability", category: "detail", id: "1.1" }) });
  expect(result.props.deferredMarkdown).toBe(true);
  expect(result.props.initialContent).toBeNull();
  expect(result.props.renderedNote).toBeNull();
  expect(result.props.contentBytes).toBeGreaterThan(50 * 1024);
});

it("an exam page defers a formula-heavy medium source before its RSC grows to megabytes", async () => {
  body.markdown = "## 试题\n\n" + "推导 $E=mc^2$。\n\n".repeat(1600);
  const result = await ContentPage({ params: Promise.resolve({ subject: "probability", category: "kaoqian-moni", id: "exam-05" }) });
  expect(result.props.deferredMarkdown).toBe(true);
  expect(result.props.renderedNote).toBeNull();
  expect(result.props.contentBytes).toBeGreaterThan(20 * 1024);
});
