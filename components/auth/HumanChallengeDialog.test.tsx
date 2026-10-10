import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HumanChallengeDialog from "./HumanChallengeDialog";
import { MEDICINE_CANONICAL_ORDER } from "@/lib/auth/presentation/humanChallenge";

describe("HumanChallengeDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("reveals answers only after submit and cools down 10s on failure", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onPassed = vi.fn();
    render(<HumanChallengeDialog open onClose={() => {}} onPassed={onPassed} />);

    await user.click(screen.getByRole("tab", { name: "理科" }));
    await user.click(screen.getByLabelText("y = 2x + 1"));
    expect(screen.queryByTestId("human-challenge-reveal")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(screen.getByTestId("human-challenge-reveal")).toHaveTextContent("x² + 1");
    expect(onPassed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
    expect(screen.getByText(/冷却中/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled();
  });

  it("passes 医科 when the central-dogma tiles are in order", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onPassed = vi.fn();
    render(<HumanChallengeDialog open onClose={() => {}} onPassed={onPassed} />);
    await user.click(screen.getByRole("tab", { name: "医科" }));

    const titleOf = {
      replication: "复制",
      transcription: "转录",
      processing: "加工",
      translation: "翻译",
    } as const;

    for (const [index, id] of MEDICINE_CANONICAL_ORDER.entries()) {
      const title = titleOf[id];
      for (let safety = 0; safety < 8; safety += 1) {
        const items = screen.getAllByRole("listitem");
        const at = items.findIndex((item) => item.textContent?.includes(title));
        if (at === index) break;
        if (at < 0) throw new Error(`missing ${title}`);
        if (at > index) await user.click(screen.getByRole("button", { name: `上移 ${title}` }));
        else await user.click(screen.getByRole("button", { name: `下移 ${title}` }));
      }
    }

    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(onPassed).toHaveBeenCalled();
  });

  it("passes 其他 after three correct answers", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onPassed = vi.fn();
    render(<HumanChallengeDialog open onClose={() => {}} onPassed={onPassed} />);
    await user.click(screen.getByRole("tab", { name: "其他" }));
    await user.click(screen.getByLabelText("入点 / 出点"));
    await user.click(screen.getByLabelText("九宫格"));
    await user.click(screen.getByLabelText("未通过身份认证"));
    await user.click(screen.getByRole("button", { name: "提交" }));
    expect(onPassed).toHaveBeenCalled();
  });
});
