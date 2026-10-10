import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountDialog from "./AccountDialog";
import { useUserProfile } from "@/lib/stores/userProfile";

vi.mock("@/lib/auth/browser/browserClient", () => ({
  tryGetBrowserAuthClient: () => null,
}));

describe("AccountDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    useUserProfile.setState({ avatars: {}, nicknames: {} });
  });

  it("opens a small account window with name and local avatar copy", async () => {
    render(<AccountDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "账户信息" })).toBeInTheDocument();
    expect(screen.getByText("只保存在这台设备")).toBeInTheDocument();
    expect(screen.getByText("保存名称")).toBeInTheDocument();
    expect(screen.queryByText("设置密码")).not.toBeInTheDocument();
  });

  it("closes from the header button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AccountDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "关闭账户信息" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
