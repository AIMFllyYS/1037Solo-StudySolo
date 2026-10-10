import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AgentCenterTabs from "./AgentCenterTabs";
import { translate } from "@/lib/i18n";
import { useAgentCenter } from "@/lib/stores/workspace/agentCenter";

/** 断言直接取词典：文案措辞调整（回答/链接/来源…）不该让这个测试变成假的失败。 */
const zh = (key: string, vars?: Record<string, string | number>) => translate("zh", key, vars);

afterEach(() => {
  cleanup();
  useAgentCenter.setState({ centerTab: "answer" });
});

describe("AgentCenterTabs", () => {
  it("renders the three view tabs and starts on the answer tab", () => {
    render(<AgentCenterTabs linksCount={0} imagesCount={0} />);
    expect(screen.getByRole("tab", { name: zh("agent.center.tab.answer") })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: zh("agent.center.tab.links") })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: zh("agent.center.tab.images") })).toHaveAttribute("aria-selected", "false");
  });

  it("switches the active tab in the store when clicked", () => {
    render(<AgentCenterTabs linksCount={0} imagesCount={0} />);
    fireEvent.click(screen.getByRole("tab", { name: zh("agent.center.tab.links") }));
    expect(useAgentCenter.getState().centerTab).toBe("links");
    expect(screen.getByRole("tab", { name: zh("agent.center.tab.links") })).toHaveAttribute("aria-selected", "true");
  });

  it("only shows a count badge when there is something to count", () => {
    const { rerender } = render(<AgentCenterTabs linksCount={0} imagesCount={0} />);
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    rerender(<AgentCenterTabs linksCount={4} imagesCount={2} />);
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
  });
});
