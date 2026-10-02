import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { clear, createStore, get as idbGet } from "idb-keyval";
import { waitFor } from "@testing-library/react";
import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import { __resetIdbStoragePendingForTests, PERSIST_KEYS, writeOwnedStorageItem } from "@/lib/storage/idbStorage";
import { acquireArtifactBodyLease, hydrateArtifactBody, loadArtifactFull, useArtifacts } from "./artifacts";
import { getResourceSnapshot } from "@/lib/performance/resourceMetrics";

const owner = "artifact-partition-owner";
const idb = createStore("gailvlun-db", "keyval");

beforeEach(async () => {
  await clear(idb);
  __resetIdbStoragePendingForTests();
  activateStorageOwner(owner);
  useArtifacts.setState({ order: [], byId: {}, viewerId: null, _hasHydrated: true });
});
afterEach(() => {
  __resetIdbStoragePendingForTests();
  activateStorageOwner(null);
  useArtifacts.setState({ order: [], byId: {}, viewerId: null, _hasHydrated: false });
});

it("keeps only metadata resident after a durable body write and reloads on lease", async () => {
  const html = `<html><body>${"large lesson".repeat(3000)}</body></html>`;
  useArtifacts.getState().saveDone("a1", "课程演示", html);
  await waitFor(() => expect(useArtifacts.getState().byId.a1?.bodyRef).toBe(true));
  expect(useArtifacts.getState().byId.a1.html).toBe("");
  expect((await loadArtifactFull("a1"))?.html).toBe(html);
  const release = acquireArtifactBodyLease("a1");
  expect(await hydrateArtifactBody("a1")).toBe(true);
  expect(useArtifacts.getState().byId.a1.html).toBe(html);
  release();
  expect(useArtifacts.getState().byId.a1.html).toBe("");
  expect(getResourceSnapshot().artifactBodyEstimatedBytes).toBe(0);
  await waitFor(async () => {
    const raw = await idbGet<string>(ownedStorageKey(PERSIST_KEYS.artifacts)!, idb);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.byId.a1.html).toBe("");
  }, { timeout: 2000 });
  activateStorageOwner("other-artifact-owner");
  await expect(loadArtifactFull("a1")).rejects.toThrow("artifact_owner_not_ready");
});

it("migrates a legacy monolithic artifact only after its separate body commit", async () => {
  const html = "<html><body>legacy authoritative body</body></html>";
  const legacy = { state: { order: ["old"], byId: { old: { id: "old", title: "旧演示", html, status: "done" } } }, version: 0 };
  expect(await writeOwnedStorageItem(owner, PERSIST_KEYS.artifacts, JSON.stringify(legacy))).toBe(true);
  useArtifacts.setState({ order: [], byId: {}, _hasHydrated: false });
  __resetIdbStoragePendingForTests();
  await useArtifacts.persist.rehydrate();
  await waitFor(() => expect(useArtifacts.getState()._hasHydrated).toBe(true));
  expect(useArtifacts.getState().byId.old.html).toBe("");
  expect((await loadArtifactFull("old"))?.html).toBe(html);
});
