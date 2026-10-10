import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppearanceSection } from "./AppearanceSection";
import { useSettings } from "@/lib/stores/settings";
import { useStore } from "@/lib/stores/ui";

describe("AppearanceSection agent chrome toggles", () => {
  beforeEach(() => {
    useSettings.setState({
      showRightPanelTabBar: true,
      pinChatHeader: false,
    });
    useStore.setState({ rightTab: "video" });
  });

  afterEach(() => {
    cleanup();
    useSettings.setState({
      showRightPanelTabBar: true,
      pinChatHeader: false,
    });
    useStore.setState({ rightTab: "ai" });
  });

  it("writes both appearance flags to the shared settings store", async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);

    await user.click(screen.getByRole("switch", { name: "显示右侧栏顶部标签" }));
    expect(useSettings.getState().showRightPanelTabBar).toBe(false);
    expect(useStore.getState().rightTab).toBe("ai");

    await user.click(screen.getByRole("switch", { name: "固定 AI 助教顶部导航" }));
    expect(useSettings.getState().pinChatHeader).toBe(true);
  });
});
