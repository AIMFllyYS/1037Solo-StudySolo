import assert from "node:assert/strict";
import { test } from "node:test";
import { listSessionsForCurrentClassOwner, releaseClassOwnerIfCurrent } from "../lib/session-list-owner.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("a delayed Class library read cannot put account A rows into account B", async () => {
  let owner: string | null = "A";
  const rows = deferred<string[]>();
  const loading = listSessionsForCurrentClassOwner("A", () => owner, async () => ({}), async () => rows.promise);
  owner = "B";
  rows.resolve(["A's private lesson"]);
  assert.equal(await loading, null);
});

test("a Class owner switch during database opening skips the old query", async () => {
  let owner: string | null = "A";
  const opening = deferred<object>();
  let queried = false;
  const loading = listSessionsForCurrentClassOwner("A", () => owner, () => opening.promise, async () => { queried = true; return ["private"]; });
  owner = "B";
  opening.resolve({});
  assert.equal(await loading, null);
  assert.equal(queried, false);
});

test("a return to the same Class owner cannot accept a previous login epoch's rows", async () => {
  let epoch = 1;
  const rows = deferred<string[]>();
  let queried = false;
  const loading = listSessionsForCurrentClassOwner("A", () => "A", async () => ({}), async () => { queried = true; return rows.promise; }, () => epoch);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(queried, true);
  epoch = 3;
  rows.resolve(["stale before A-B-A"]);
  assert.equal(await loading, null);
});

test("a replacement Class owner effect cancels the previous cleanup before it stops capture", async () => {
  const generation = { current: 2 };
  let stops = 0, clears = 0;
  const release = releaseClassOwnerIfCurrent({ generation, cleanupGeneration: 2, owner: "A", currentOwner: () => "A", stop: async () => { stops++; }, clear: () => { clears++; } });
  generation.current = 3;
  await release;
  assert.equal(stops, 0);
  assert.equal(clears, 0);
});

test("a late Class cleanup cannot erase the new owner after stop completes", async () => {
  const generation = { current: 2 };
  let owner: string | null = "A", clears = 0, started = false;
  const stopping = deferred<void>();
  const release = releaseClassOwnerIfCurrent({ generation, cleanupGeneration: 2, owner: "A", currentOwner: () => owner, stop: () => { started = true; return stopping.promise; }, clear: () => { clears++; } });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(started, true);
  generation.current = 3;
  owner = "B";
  stopping.resolve();
  await release;
  assert.equal(clears, 0);
});

test("an actual Class unmount stops capture and clears its own owner", async () => {
  const generation = { current: 2 };
  const events: string[] = [];
  await releaseClassOwnerIfCurrent({ generation, cleanupGeneration: 2, owner: "A", currentOwner: () => "A", stop: async () => { events.push("stop"); }, clear: () => { events.push("clear"); } });
  assert.deepEqual(events, ["stop", "clear"]);
});
