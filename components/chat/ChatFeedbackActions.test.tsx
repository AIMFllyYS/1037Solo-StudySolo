import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatFeedbackActions from "./ChatFeedbackActions";
import { activateStorageOwner } from "@/lib/storage/ownerScope";
import { useToast } from "@/lib/stores/toast";

const success = (feedbackType: string, revision = 1) => ({
  ok: true,
  json: async () => ({ id: "e6843916-e6b7-4db2-8b25-95d54a01d4b4", feedbackType, revision, status: "open" }),
});
const failed = (code: string) => ({ ok: false, json: async () => ({ code }) });

afterEach(() => { cleanup(); activateStorageOwner(null); useToast.getState().clear(); vi.unstubAllGlobals(); });

describe("ChatFeedbackActions", () => {
  it("restores saved vote and report details on remount; cancel and repeated vote preserve the record", async () => {
    const user = userEvent.setup();
    activateStorageOwner("owner-a");
    const items = [
      { id: "vote-id", feedbackType: "dislike", revision: 3, status: "open", feedbackText: "公开测试说明" },
      { id: "report-id", feedbackType: "report", revision: 1, status: "open", reportReason: "other", feedbackText: "公开测试举报" },
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ChatFeedbackActions sessionId="session-restore" messageId="message-restore" answerText="Public answer" />);
    await waitFor(() => expect(screen.getByTestId("chat-feedback-dislike")).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByTestId("chat-feedback-report")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("chat-feedback-dislike"));
    expect(screen.getByTestId("chat-feedback-textarea")).toHaveValue("公开测试说明");
    await user.click(screen.getByRole("button", { name: "暂不补充" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("chat-feedback-dislike")).toHaveAttribute("aria-pressed", "true");
    view.unmount();
    render(<ChatFeedbackActions sessionId="session-restore" messageId="message-restore" answerText="Public answer" />);
    await waitFor(() => expect(screen.getByTestId("chat-feedback-dislike")).toHaveAttribute("aria-pressed", "true"));
    await user.click(screen.getByTestId("chat-feedback-report"));
    expect(screen.getByRole("combobox", { name: "举报原因" })).toHaveValue("other");
    expect(screen.getByTestId("chat-feedback-textarea")).toHaveValue("公开测试举报");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: "state", sessionId: "session-restore", messageId: "message-restore" });
  });

  it("discards an old owner's delayed write and clears its open dialog", async () => {
    const user = userEvent.setup();
    activateStorageOwner("owner-a");
    let resolveVote: ((result: ReturnType<typeof success>) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      if (JSON.parse(init.body).action === "state") return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
      return new Promise(resolve => { resolveVote = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatFeedbackActions sessionId="session-owner" messageId="message-owner" answerText="Public answer" />);
    await user.click(screen.getByTestId("chat-feedback-like"));
    act(() => activateStorageOwner("owner-b"));
    await act(async () => { resolveVote?.(success("like")); });
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(screen.getByTestId("chat-feedback-like")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-feedback-like")).not.toBeDisabled();
  });

  it("does not let a delayed restoration overwrite a newly saved vote", async () => {
    const user = userEvent.setup();
    activateStorageOwner("owner-a");
    let resolveState: ((result: unknown) => void) | undefined;
    const fetchMock = vi.fn().mockReturnValueOnce(new Promise(resolve => { resolveState = resolve; })).mockResolvedValueOnce(success("like"));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatFeedbackActions sessionId="session-race" messageId="message-race" answerText="Public answer" />);
    await user.click(screen.getByTestId("chat-feedback-like"));
    await screen.findByRole("dialog");
    await act(async () => { resolveState?.({ ok: true, json: async () => ({ items: [{ id: "old-id", feedbackType: "dislike", revision: 1, status: "open" }] }) }); });
    expect(screen.getByTestId("chat-feedback-like")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chat-feedback-dislike")).toHaveAttribute("aria-pressed", "false");
  });
  it("deferred autofocus cannot steal a field after the user starts typing", async () => {
    const user = userEvent.setup();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(success("like")));
    render(<ChatFeedbackActions sessionId="session-focus" messageId="message-focus" answerText="Public synthetic response" />);
    await user.click(screen.getByTestId("chat-feedback-like"));
    await screen.findByRole("dialog", { name: "补充回答反馈" });
    const textarea = screen.getByTestId("chat-feedback-textarea");
    await user.type(textarea, "已经开始输入");
    act(() => { for (const callback of frames.splice(0)) callback(0); });
    expect(textarea).toHaveFocus();
    await user.type(textarea, "，不能抢走焦点。");
    expect(textarea).toHaveValue("已经开始输入，不能抢走焦点。");
  });

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
    expect(useToast.getState().toasts.at(-1)?.message).toContain("反馈服务尚未完成部署");
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
