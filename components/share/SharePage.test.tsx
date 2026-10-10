import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SharePage from "./SharePage";
import { translate } from "@/lib/i18n";
import type { SharedConversationSnapshot } from "@/lib/share/types";
import { useArtifacts } from "@/lib/stores/assets/artifacts";

/**
 * SharePage：公开只读页的四件事——
 * 读不到链接（撤回 / 过期 / RPC 报错对访客是同一件事）走 notFound；
 * 读到了就画标题 + 只读标记 + 正文；
 * 页面上没有任何能写回东西的输入控件，也不渲染追问块；
 * 快照里的演示卡片只读渲染，一个字节都不许落进本机 store。
 */

vi.mock("@/lib/share/read", () => ({ readSharedConversation: vi.fn() }));

import { readSharedConversation } from "@/lib/share/read";

const SNAPSHOT = {
  v: 1,
  title: "概率论第三章复习",
  createdAt: 1_700_000_000_000,
  sourceClientId: "s1",
  meta: {
    id: "s1",
    title: "概率论第三章复习",
    createdAt: 1,
    updatedAt: 1,
    messageCount: 2,
    artifactIds: [],
  },
  messages: [
    { id: "m1", role: "user", parts: [{ type: "text", text: "什么是条件概率？" }], timestamp: 1 },
    { id: "m2", role: "assistant", parts: [{ type: "text", text: "条件概率是在已知事件发生的前提下……" }], timestamp: 2 },
  ],
  artifacts: [],
} as unknown as SharedConversationSnapshot;

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("读不到（撤回 / 过期 / 报错）时显示分享不存在", async () => {
  vi.mocked(readSharedConversation).mockResolvedValue(null);
  render(<SharePage shareId="missing12345" />);

  expect(await screen.findByTestId("share-page-notice")).toHaveTextContent(translate("zh", "share.page.notFound"));
  expect(screen.queryByTestId("share-page-title")).toBeNull();
});

it("读到快照后渲染标题、只读标记与对话正文", async () => {
  vi.mocked(readSharedConversation).mockResolvedValue(SNAPSHOT);
  render(<SharePage shareId="abcdefghijkl" />);

  expect(await screen.findByTestId("share-page-title")).toHaveTextContent("概率论第三章复习");
  expect(screen.getByTestId("share-page-badge")).toHaveTextContent(translate("zh", "share.page.badge"));
  expect(screen.getByTestId("share-page-readonly")).toHaveTextContent(translate("zh", "share.page.readonly"));
  expect(screen.getByText("什么是条件概率？")).toBeTruthy();
  expect(vi.mocked(readSharedConversation)).toHaveBeenCalledWith("abcdefghijkl");
});

it("演示卡片读快照只读渲染，绝不写访客的本地产物表", async () => {
  useArtifacts.setState({ order: [], byId: {}, viewerId: null, _hasHydrated: true });
  vi.mocked(readSharedConversation).mockResolvedValue({
    ...SNAPSHOT,
    messages: [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-renderInteractive",
            toolCallId: "t1",
            state: "output-available",
            input: { title: "可交互演示", prompt: "画一张图" },
            output: { artifactId: "art-1", title: "可交互演示", prompt: "画一张图" },
          },
        ],
        timestamp: 1,
      },
    ],
    artifacts: [{ id: "art-1", title: "可交互演示", html: "<html><body>hi</body></html>", status: "done" }],
  } as unknown as SharedConversationSnapshot);
  render(<SharePage shareId="abcdefghijkl" />);

  await screen.findByTestId("artifact-card");
  // 卡片认为产物已就绪（不是「数据缺失」），才有「打开演示」。
  expect(screen.getByTestId("artifact-open-demo")).toBeTruthy();
  // 只读纪律：快照里的产物一个字节都不许落进本机 store。
  expect(useArtifacts.getState().byId["art-1"]).toBeUndefined();
  expect(useArtifacts.getState().order).toEqual([]);
});

it("只读页没有输入区，也不渲染追问块", async () => {
  vi.mocked(readSharedConversation).mockResolvedValue({
    ...SNAPSHOT,
    messages: [
      {
        id: "m1",
        role: "assistant",
        parts: [{ type: "text", text: "答案正文" }],
        timestamp: 1,
        followUpQuestions: ["再讲讲贝叶斯公式？"],
      },
    ],
  } as unknown as SharedConversationSnapshot);
  const { container } = render(<SharePage shareId="abcdefghijkl" />);

  await screen.findByTestId("share-page-title");
  expect(screen.queryByText("再讲讲贝叶斯公式？")).toBeNull();
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.querySelector("input")).toBeNull();
});
