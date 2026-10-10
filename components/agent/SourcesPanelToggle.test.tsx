import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SourcesPanelToggle from "./SourcesPanelToggle";
import { useAgentCenter } from "@/lib/stores/workspace/agentCenter";

afterEach(() => {
  cleanup();
  useAgentCenter.setState({ sourcesPanelOpen: true });
});

describe("SourcesPanelToggle", () => {
  it("is on by default (用户口径：默认显示)", () => {
    render(<SourcesPanelToggle />);
    expect(screen.getByTestId("agent-sources-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles the sources panel in the store", () => {
    render(<SourcesPanelToggle />);
    fireEvent.click(screen.getByTestId("agent-sources-toggle"));
    expect(useAgentCenter.getState().sourcesPanelOpen).toBe(false);
    expect(screen.getByTestId("agent-sources-toggle")).toHaveAttribute("aria-pressed", "false");
  });
});
