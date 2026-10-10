import { beforeEach, describe, expect, it } from "vitest";
import { useSessionRuns, __resetSessionRunControllers } from "./sessionRuns";

function reset() {
  __resetSessionRunControllers();
  useSessionRuns.setState({ byId: {} });
}

describe("sessionRuns", () => {
  beforeEach(reset);

  it("markRunning 登记句柄并清掉旧终态；abortRun 触发 controller.abort", () => {
    const runs = useSessionRuns.getState();
    const c1 = new AbortController();
    runs.markRunning("s1", c1);
    expect(useSessionRuns.getState().byId.s1?.phase).toBe("running");

    useSessionRuns.getState().markError("s1", "boom", true);
    expect(useSessionRuns.getState().byId.s1?.phase).toBe("error");
    expect(useSessionRuns.getState().byId.s1?.unseen).toBe(true);

    const c2 = new AbortController();
    useSessionRuns.getState().markRunning("s1", c2);
    const run = useSessionRuns.getState().byId.s1!;
    expect(run.phase).toBe("running");
    expect(run.error).toBeUndefined();
    expect(run.unseen).toBe(false);

    useSessionRuns.getState().abortRun("s1");
    expect(c2.signal.aborted).toBe(true);
  });

  it("markDone/markError 记录 unseen；markViewed 只消 unseen", () => {
    const runs = useSessionRuns.getState();
    runs.markRunning("a", new AbortController());
    useSessionRuns.getState().markDone("a", true);
    expect(useSessionRuns.getState().byId.a).toMatchObject({ phase: "done", unseen: true });

    useSessionRuns.getState().markViewed("a");
    expect(useSessionRuns.getState().byId.a?.unseen).toBe(false);
    expect(useSessionRuns.getState().byId.a?.phase).toBe("done");
  });

  it("remove 会 abort 并抹掉记录；releaseController 按身份比对", () => {
    const runs = useSessionRuns.getState();
    const c1 = new AbortController();
    runs.markRunning("d", c1);
    const c2 = new AbortController();
    useSessionRuns.getState().releaseController("d", c2); // 不是登记的句柄，不能误删
    useSessionRuns.getState().abortRun("d");
    expect(c1.signal.aborted).toBe(true);

    const c3 = new AbortController();
    useSessionRuns.getState().markRunning("d", c3);
    useSessionRuns.getState().releaseController("d", c3);
    // release 后句柄表已无这条会话：abortRun 找不到句柄，c3 不再被中止
    useSessionRuns.getState().abortRun("d");
    expect(c3.signal.aborted).toBe(false);

    const c4 = new AbortController();
    useSessionRuns.getState().markRunning("d", c4);
    useSessionRuns.getState().remove("d");
    expect(c4.signal.aborted).toBe(true);
    expect(useSessionRuns.getState().byId.d).toBeUndefined();
  });

  it("prune 清掉不在会话清单里的终态记录，running 保留", () => {
    const runs = useSessionRuns.getState();
    runs.markRunning("keep", new AbortController());
    useSessionRuns.getState().markDone("gone", true);
    useSessionRuns.getState().markError("gone2", "x", false);
    useSessionRuns.getState().prune(new Set(["keep"]));
    const byId = useSessionRuns.getState().byId;
    expect(byId.keep?.phase).toBe("running");
    expect(byId.gone).toBeUndefined();
    expect(byId.gone2).toBeUndefined();
  });

  it("_reconcileAfterRehydrate 把 running 归一成 interrupted + unseen", () => {
    const runs = useSessionRuns.getState();
    runs.markRunning("r1", new AbortController());
    useSessionRuns.getState().markDone("r2", false);
    // 模拟盘上恢复出的 running 记录（fetch 已随页面死亡）
    useSessionRuns.getState()._reconcileAfterRehydrate();
    const byId = useSessionRuns.getState().byId;
    expect(byId.r1?.phase).toBe("interrupted");
    expect(byId.r1?.unseen).toBe(true);
    expect(byId.r2?.phase).toBe("done");
    expect(byId.r2?.unseen).toBe(false);
  });
});
