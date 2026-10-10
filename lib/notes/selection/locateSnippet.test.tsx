import { afterEach, describe, expect, it } from "vitest";
import { applyCitationHighlight, findSnippetRange, snippetNeedles } from "./locateSnippet";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("locateSnippet", () => {
  it("strips markdown and splits long snippets into distinctive needles", () => {
    const needles = snippetNeedles("**贝叶斯公式** 把\n条件概率反过来写。后面还有很多字用来撑长度。");
    expect(needles[0]).toContain("贝叶斯公式");
    expect(needles.some((needle) => needle.includes("条件概率"))).toBe(true);
  });

  it("finds a snippet across split text nodes and wraps it with a flash highlight", () => {
    document.body.innerHTML = `
      <article class="prose-notes">
        <p>前文铺垫。</p>
        <p>条件概率是<strong>贝叶斯</strong>公式的基础。</p>
      </article>
    `;
    const root = document.querySelector("article") as HTMLElement;
    expect(findSnippetRange(root, "条件概率是贝叶斯公式的基础")).not.toBeNull();
    applyCitationHighlight(root, "条件概率是贝叶斯公式的基础");
    expect(root.querySelectorAll("[data-citation-highlight]").length).toBeGreaterThan(0);
    expect(root.querySelector(".citation-flash-block")).toBeTruthy();
  });

  it("returns null when the note does not contain the snippet", () => {
    document.body.innerHTML = `<article class="prose-notes"><p>无关内容。</p></article>`;
    const root = document.querySelector("article") as HTMLElement;
    expect(findSnippetRange(root, "这段文字完全不存在于笔记里")).toBeNull();
  });
});
