import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { clear, createStore, get as idbGet } from "idb-keyval";
import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import { __resetIdbStoragePendingForTests, PERSIST_KEYS, writeOwnedStorageItem } from "@/lib/storage/idbStorage";
import { acquireImageGenLease, hydrateImageGenImages, loadImageGenSessionFull, useImageGen } from "./imageGen";
import { getResourceSnapshot } from "@/lib/performance/resourceMetrics";

const owner = "image-partition-owner";
const idb = createStore("gailvlun-db", "keyval");
beforeEach(async () => {
  await clear(idb);
  __resetIdbStoragePendingForTests();
  activateStorageOwner(owner);
  useImageGen.setState({ sessions: {}, openIds: [], _hasHydrated: true });
});
afterEach(() => {
  __resetIdbStoragePendingForTests();
  activateStorageOwner(null);
  useImageGen.setState({ sessions: {}, openIds: [], _hasHydrated: false });
});

it("keeps generated base64 out of the catalog after the viewer closes", async () => {
  const b64 = "a".repeat(400_000);
  useImageGen.getState().openViewer({ id: "img1", prompt: "细胞", title: "细胞图", size: "1024x1024", count: 1 });
  useImageGen.getState().updateSession("img1", { status: "done", images: [{ b64_json: b64 }] });
  await waitFor(() => expect(useImageGen.getState().sessions.img1?.bodyRef).toBe(true));
  useImageGen.getState().closeViewer("img1");
  expect(useImageGen.getState().sessions.img1.images).toEqual([]);
  expect((await loadImageGenSessionFull("img1"))?.images[0].b64_json).toBe(b64);
  const release = acquireImageGenLease("img1");
  expect(await hydrateImageGenImages("img1")).toBe(true);
  expect(useImageGen.getState().sessions.img1.images[0].b64_json).toBe(b64);
  release();
  expect(useImageGen.getState().sessions.img1.images).toEqual([]);
  expect(getResourceSnapshot().imageGenBodyEstimatedBytes).toBe(0);
  await waitFor(async () => {
    const raw = await idbGet<string>(ownedStorageKey(PERSIST_KEYS.imageGen)!, idb);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.sessions.img1.images).toEqual([]);
  }, { timeout: 2000 });
});

it("migrates a legacy image session only after its separate image payload is durable", async () => {
  const legacy = { id: "legacy", prompt: "病理", title: "旧图", size: "1024x1024", count: 1, status: "done", images: [{ b64_json: "base64-original" }], createdAt: 1 };
  expect(await writeOwnedStorageItem(owner, PERSIST_KEYS.imageGen, JSON.stringify({ state: { sessions: { legacy } }, version: 0 }))).toBe(true);
  useImageGen.setState({ sessions: {}, openIds: [], _hasHydrated: false });
  __resetIdbStoragePendingForTests();
  await useImageGen.persist.rehydrate();
  await waitFor(() => expect(useImageGen.getState()._hasHydrated).toBe(true));
  expect(useImageGen.getState().sessions.legacy.images).toEqual([]);
  expect((await loadImageGenSessionFull("legacy"))?.images[0].b64_json).toBe("base64-original");
});
