import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowserSettingsButton from "./BrowserSettingsButton";
import { BROWSE_TAB, useBrowser } from "@/lib/stores/browser";

describe("shared browser settings menu", () => {
  beforeEach(() => {
    useBrowser.setState({ bookmarks: [], homeUrl: "", browseUrl: "https://example.com", currentUrl: "https://example.com", activeTabId: BROWSE_TAB });
  });
  afterEach(cleanup);

  it("keeps form keyboard input and Tab usable, adds a bookmark, closes, and restores focus", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(<BrowserSettingsButton onAdded={onAdded} />);
    const trigger = screen.getByTestId("browser-settings");
    await user.click(trigger);
    const [name, url] = screen.getAllByRole("textbox");
    await user.click(name);
    await user.type(name, "Public document");
    await user.tab();
    expect(url).toHaveFocus();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.type(url, "https://example.org/public");
    await user.keyboard("{Enter}");
    expect(useBrowser.getState().bookmarks).toEqual([expect.objectContaining({ name: "Public document", url: "https://example.org/public" })]);
    expect(useBrowser.getState().currentUrl).toBe("https://example.org/public");
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("saves the existing homepage setting and Escape closes through the shared menu", () => {
    render(<BrowserSettingsButton />);
    const trigger = screen.getByTestId("browser-settings");
    fireEvent.click(trigger);
    const home = screen.getAllByRole("textbox")[2];
    fireEvent.change(home, { target: { value: "https://example.net/home" } });
    fireEvent.click(screen.getByText(/^(保存|Save)$/));
    expect(useBrowser.getState().homeUrl).toBe("https://example.net/home");
    fireEvent.keyDown(home, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
