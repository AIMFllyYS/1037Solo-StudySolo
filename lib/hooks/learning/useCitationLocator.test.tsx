import React, { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useCitationLocator } from "./useCitationLocator";
import { useNoteLocator } from "../../stores/learning/noteLocator";

afterEach(() => {
  cleanup();
  useNoteLocator.setState({ request: null });
  document.body.innerHTML = "";
});

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  useCitationLocator({
    containerRef: ref,
    subjectId: "probability",
    categoryId: "detail",
    itemId: "1.4",
    enabled: true,
  });
  return (
    <div ref={ref} data-notes-root>
      <div className="prose-notes">
        <p>条件概率是贝叶斯公式的基础。</p>
      </div>
    </div>
  );
}

describe("useCitationLocator", () => {
  it("scrolls to the cited snippet and applies a crayon flash", async () => {
    useNoteLocator.getState().locate("probability/detail/1.4", "条件概率是贝叶斯公式的基础");
    render(<Harness />);
    await waitFor(() => {
      expect(document.querySelector("[data-citation-highlight]")).toBeTruthy();
      expect(document.querySelector(".citation-flash-block")).toBeTruthy();
    });
  });
});
