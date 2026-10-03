import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentNavRows from "./AgentNavRows";

vi.mock("next/navigation", () => ({
  usePathname: () => "/agent",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Agent navigation new-chat state", () => {
  it("keeps New Chat first and visibly marks it while the current conversation is blank", () => {
    render(<AgentNavRows onNewChat={() => {}} newChatActive />);

    const nav = screen.getByTestId("agent-nav");
    const newChat = screen.getByTestId("agent-nav-new-chat");
    expect(nav.firstElementChild).toBe(newChat);
    expect(newChat).toHaveAttribute("data-active", "true");
    expect(newChat).toHaveAttribute("aria-current", "page");
    expect(newChat.className).toContain("bg-[var(--accent-weak)]");
  });
});
