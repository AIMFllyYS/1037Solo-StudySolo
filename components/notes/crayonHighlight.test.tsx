import { describe, expect, it } from "vitest";
import { unwrapMark, wrapRange } from "@/lib/notes/selection/crayonHighlight";

describe("wrapRange", () => {
  it("wraps a cross-line selection after snapshotting offsets", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>第一行均值等于方差</p><p>第二行课上强调</p>";
    document.body.appendChild(root);
    const range = document.createRange();
    range.setStart(root.querySelector("p")!.firstChild!, 3);
    range.setEnd(root.querySelectorAll("p")[1].firstChild!, 3);
    const marks = wrapRange(range);
    expect(marks.length).toBe(2);
    expect(marks.map((mark) => mark.textContent).join("")).toBe("均值等于方差第二行");
    marks.forEach(unwrapMark);
    expect(root.textContent).toBe("第一行均值等于方差第二行课上强调");
    root.remove();
  });

  it("does not walk text nodes that precede the selection", () => {
    const root = document.createElement("div");
    root.innerHTML = `${"<p>前面的填充字</p>".repeat(40)}<p>目标句线粒体</p>`;
    document.body.appendChild(root);
    const last = root.querySelector("p:last-child")!.firstChild!;
    const range = document.createRange();
    range.setStart(last, 3);
    range.setEnd(last, 6);
    const marks = wrapRange(range);
    expect(marks.map((mark) => mark.textContent).join("")).toBe("线粒体");
    marks.forEach(unwrapMark);
    expect(root.textContent?.endsWith("目标句线粒体")).toBe(true);
    root.remove();
  });
});
