import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatFeedbackActions from "./ChatFeedbackActions";

const success = (feedbackType: string, revision = 1) => ({
  ok: true,
  json: async () => ({ id: "e6843916-e6b7-4db2-8b25-95d54a01d4b4", feedbackType, revision, status: "open" }),
});
const failed = (code: string) => ({ ok: false, json: async () => ({ code }) });

afterEach(() => vi.unstubAllGlobals());

describe("ChatFeedbackActions", () => {
  it("records a vote before opening the optional excerpt dialog and sends the excerpt only after opt-in", async () => {
    const user = userEvent.setup();
    let resolveVote: ((result: ReturnType<typeof success>) => void) | undefined;
    const voteWrite = new Promise<ReturnType<typeof success>>((resolve) => { resolveVote = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(voteWrite)
      .mockResolvedValueOnce(success("like", 2));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatFeedbackActions sessionId="session-a" messageId="message-a" answerText="A brief answer with user@example.invalid" />);

    await user.click(screen.getByTestId("chat-feedback-like"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveVote?.(success("like"));
    const dialog = await screen.findByRole("dialog", { name: "补充回答反馈" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "vote", sessionId: "session-a", messageId: "message-a", vote: "like",
    });

    const excerptCheckbox = screen.getByRole("checkbox", { name: /附上回答摘录/ });
    expect(excerptCheckbox).not.toBeChecked();
    expect(dialog).toHaveTextContent("[邮箱已隐藏]");
    await user.type(screen.getByTestId("chat-feedback-textarea"), "答案说明遗漏了关键数据。");
    await user.click(excerptCheckbox);
    await user.click(screen.getByRole("button", { name: "提交补充" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "update-details",
      feedbackId: "e6843916-e6b7-4db2-8b25-95d54a01d4b4",
      revision: 1,
      vote: "like",
      feedbackText: "答案说明遗漏了关键数据。",
      answerExcerpt: "A brief answer with [邮箱已隐藏]",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("chat-feedback-like")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an honest error and keeps the report form available for retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(failed("FEEDBACK_MIGRATION_PENDING")).mockResolvedValueOnce(success("report"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatFeedbackActions sessionId="session-a" messageId="message-a" answerText="Short response" />);

    await user.click(screen.getByTestId("chat-feedback-report"));
    await user.selectOptions(screen.getByRole("combobox", { name: "举报原因" }), "privacy");
    await user.type(screen.getByTestId("chat-feedback-textarea"), "这条回答泄露了隐私信息。");
    await user.click(screen.getByRole("button", { name: "提交举报" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("反馈服务尚未完成部署");
    expect(screen.getByRole("dialog", { name: "举报这个回答" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "提交举报" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "report",
      sessionId: "session-a",
      messageId: "message-a",
      reason: "privacy",
      feedbackText: "这条回答泄露了隐私信息。",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("chat-feedback-report")).toHaveAttribute("aria-pressed", "true");
  });

  it("explains a stale vote revision and lets the user close and vote again", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(success("dislike")).mockResolvedValueOnce(failed("FEEDBACK_STALE"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatFeedbackActions sessionId="session-a" messageId="message-a" answerText="Short response" />);

    await user.click(screen.getByTestId("chat-feedback-dislike"));
    await screen.findByRole("dialog", { name: "补充回答反馈" });
    await user.click(screen.getByRole("checkbox", { name: /附上回答摘录/ }));
    await user.click(screen.getByRole("button", { name: "提交补充" }));

    expect(await screen.findByRole("button", { name: "关闭并重新评价" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭并重新评价" }));
    expect(screen.getByTestId("chat-feedback-dislike")).toHaveAttribute("aria-pressed", "false");
  });
});
