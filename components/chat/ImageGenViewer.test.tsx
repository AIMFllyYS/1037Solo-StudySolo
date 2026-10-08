import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImageGenViewerLayer from "./ImageGenViewer";
import { useImageGen } from "@/lib/stores/imageGen";
import { useWindowManager } from "@/lib/hooks/useWindowManager";

const INIT = { id: "img_gate", prompt: "线粒体内膜示意图", title: "示意图", size: "1024x1024", count: 1 };

beforeEach(() => {
    activateStorageOwner('generation-test-owner');
  useImageGen.setState({ openIds: [], sessions: {} });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

afterEach(() => {
    activateStorageOwner(null);
  cleanup();
  vi.restoreAllMocks();
  useImageGen.setState({ openIds: [], sessions: {} });
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

/**
 * 生图是付费动作，批准只能由用户给出。右上参考列是旁路入口 ——
 * 它建会话时不能带 approve，否则"点一下看一眼"就会直接扣费。
 */
describe("ImageGenViewer 付费闸门", () => {
  it("从参考列打开（未批准）时停在确认页，且一个生图请求都不发", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    useImageGen.getState().openViewer(INIT);
    render(<ImageGenViewerLayer />);

    expect(screen.getByTestId("image-gen-confirm-start")).toBeInTheDocument();
    expect(useImageGen.getState().sessions.img_gate?.autoStart).toBeFalsy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("在确认页点「开始生成」之后才打生图接口", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    useImageGen.getState().openViewer(INIT);
    render(<ImageGenViewerLayer />);

    fireEvent.click(screen.getByTestId("image-gen-confirm-start"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/image-gen");
  });

  it("对话卡批准（approve: true）时开窗即开跑，不再多问一次", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    useImageGen.getState().openViewer(INIT, { approve: true });
    render(<ImageGenViewerLayer />);

    expect(screen.queryByTestId("image-gen-confirm-start")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it("已批准的会话再被参考列打开时不退回确认页", () => {
    useImageGen.getState().openViewer(INIT, { approve: true });
    useImageGen.getState().closeViewer("img_gate");
    useImageGen.getState().openViewer(INIT);
    expect(useImageGen.getState().sessions.img_gate?.autoStart).toBe(true);
  });
});


it('a late image response cannot write another owner session or billing record', async () => {
  activateStorageOwner('image-owner-a');
  let resolveResponse!: (response: Response)=>void;
  const fetchSpy=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>{resolveResponse=resolve;}));
  useImageGen.getState().openViewer(INIT,{approve:true});
  render(<ImageGenViewerLayer />);
  await waitFor(()=>expect(fetchSpy).toHaveBeenCalledTimes(1));
  activateStorageOwner('image-owner-b');
  useImageGen.setState({sessions:{},openIds:[]});
  resolveResponse(new Response(JSON.stringify({images:[{b64_json:'private-a'}]})));
  await waitFor(()=>expect((fetchSpy.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true));
  expect(useImageGen.getState().sessions.img_gate).toBeUndefined();
});
