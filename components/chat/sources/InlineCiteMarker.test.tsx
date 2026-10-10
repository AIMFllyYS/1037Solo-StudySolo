import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CitationCatalogContext, CiteRef, InlineCiteMarker } from "./InlineCiteMarker";
import { useNoteCitations } from "@/lib/stores/noteCitations";
import { useWindowManager } from "@/lib/hooks/useWindowManager";

afterEach(() => {
  cleanup();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
  useNoteCitations.getState().closeViewer();
});

const note = {
  index: 2,
  kind: "note" as const,
  title: "被覆上皮",
  path: "histology/textbook/ch02-1",
  snippet: "单层扁平上皮覆盖血管内膜。",
};

const web = {
  index: 1,
  kind: "web" as const,
  title: "课程",
  url: "https://example.edu/a",
  snippet: "摘要",
};

describe("InlineCiteMarker", () => {
  it("renders a numbered chip and opens the textbook viewer on click", () => {
    render(<InlineCiteMarker sources={[note]} catalog={[note]} />);
    const chip = screen.getByTestId("inline-cite");
    expect(chip).toHaveTextContent("2");
    fireEvent.mouseEnter(screen.getByTestId("inline-cite-cluster"));
    const popover = screen.getByTestId("inline-cite-popover");
    expect(popover).toHaveTextContent("被覆上皮");
    expect(popover).toHaveTextContent("来源 · 1");
    expect(popover).toHaveTextContent("histology/textbook/ch02-1");
    fireEvent.click(chip);
    expect(useNoteCitations.getState().activePath).toBe("histology/textbook/ch02-1");
  });

  it("opens a web preview for http sources", () => {
    render(<InlineCiteMarker sources={[web]} catalog={[web]} />);
    fireEvent.click(screen.getByTestId("inline-cite"));
    expect(useWindowManager.getState().windows.some((win) => win.type === "source-preview")).toBe(true);
  });

  it("shows only the hovered cluster's sources, using the Agent source-card layout", () => {
    render(<InlineCiteMarker sources={[web, note]} catalog={[web, note]} />);
    expect(screen.getAllByTestId("inline-cite")).toHaveLength(2);
    fireEvent.mouseEnter(screen.getByTestId("inline-cite-cluster"));
    const popover = screen.getByTestId("inline-cite-popover");
    expect(popover).toHaveTextContent("来源 · 2");
    expect(popover).toHaveTextContent("课程");
    expect(popover).toHaveTextContent("被覆上皮");
    expect(popover).toHaveTextContent("example.edu");
    fireEvent.click(screen.getByText("课程"));
    expect(useWindowManager.getState().windows.some((win) => win.type === "source-preview")).toBe(true);
  });
});

describe("CiteRef", () => {
  it("does not leak other catalog entries into a single-number marker", () => {
    render(
      <CitationCatalogContext.Provider value={[web, note]}>
        <CiteRef indexes="1" />
      </CitationCatalogContext.Provider>,
    );
    fireEvent.mouseEnter(screen.getByTestId("inline-cite-cluster"));
    const popover = screen.getByTestId("inline-cite-popover");
    expect(popover).toHaveTextContent("课程");
    expect(popover).not.toHaveTextContent("被覆上皮");
    expect(screen.getAllByTestId("inline-cite")).toHaveLength(1);
  });
});
