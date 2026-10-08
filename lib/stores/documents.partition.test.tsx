import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { clear, createStore, get as idbGet } from "idb-keyval";
import { activateStorageOwner, ownedStorageKey } from "@/lib/storage/ownerScope";
import { __resetIdbStoragePendingForTests, PERSIST_KEYS, writeOwnedStorageItem } from "@/lib/storage/idbStorage";
import { acquireDocumentBodyLease, hydrateDocumentBody, loadDocumentFull, useDocuments } from "./documents";
import type { DocumentSpec, StoredDocument } from "@/lib/documents/types";
import { getResourceSnapshot } from "@/lib/performance/resourceMetrics";

const owner = "document-partition-owner";
const idb = createStore("gailvlun-db", "keyval");
const spec: DocumentSpec = { title: "医学讲义", format: "markdown", genre: "review-notes", brief: "复习", outline: ["第一节", "第二节"] };

beforeEach(async () => {
  await clear(idb);
  __resetIdbStoragePendingForTests();
  activateStorageOwner(owner);
  useDocuments.setState({ byId: {}, viewerId: null, _hasHydrated: true });
});
afterEach(() => {
  __resetIdbStoragePendingForTests();
  activateStorageOwner(null);
  useDocuments.setState({ byId: {}, viewerId: null, _hasHydrated: false });
});

it("persists a completed document body separately and releases closed-view markdown", async () => {
  const markdown = "显微结构与分子机制。".repeat(3000);
  useDocuments.getState().create("d1", spec);
  useDocuments.getState().setSections("d1", [{ title: "第一节", markdown, status: "done" }, { title: "第二节", markdown: "公式 $E=mc^2$", status: "done" }]);
  useDocuments.getState().setStatus("d1", "done");
  await waitFor(() => expect(useDocuments.getState().byId.d1?.bodyRef).toBe(true));
  expect(useDocuments.getState().byId.d1.sections.every((section) => !section.markdown)).toBe(true);
  expect((await loadDocumentFull("d1"))?.sections[0].markdown).toBe(markdown);
  const release = acquireDocumentBodyLease("d1");
  expect(await hydrateDocumentBody("d1")).toBe(true);
  expect(useDocuments.getState().byId.d1.sections[0].markdown).toBe(markdown);
  release();
  expect(useDocuments.getState().byId.d1.sections[0].markdown).toBeUndefined();
  expect(getResourceSnapshot().documentBodyEstimatedBytes).toBe(0);
  await waitFor(async () => {
    const raw = await idbGet<string>(ownedStorageKey(PERSIST_KEYS.documents)!, idb);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.byId.d1.sections[0].markdown).toBeUndefined();
  }, { timeout: 2000 });
});

it("migrates a legacy monolithic document after durable per-document write", async () => {
  const legacy: StoredDocument = { id: "legacy", spec, sections: [{ title: "第一节", markdown: "原始全文", status: "done" }], status: "done", createdAt: 1, updatedAt: 2 };
  expect(await writeOwnedStorageItem(owner, PERSIST_KEYS.documents, JSON.stringify({ state: { byId: { legacy } }, version: 0 }))).toBe(true);
  useDocuments.setState({ byId: {}, _hasHydrated: false });
  __resetIdbStoragePendingForTests();
  await useDocuments.persist.rehydrate();
  await waitFor(() => expect(useDocuments.getState()._hasHydrated).toBe(true));
  expect(useDocuments.getState().byId.legacy.sections[0].markdown).toBeUndefined();
  expect((await loadDocumentFull("legacy"))?.sections[0].markdown).toBe("原始全文");
});


it('a cold document requires hydration before partial edits and accepts a complete replacement', async () => {
  useDocuments.getState().create('cold', spec);
  useDocuments.setState(s => ({ byId: { ...s.byId, cold: { ...s.byId.cold, cloudRevision: 8, bodyRef: true } } }));
  expect(() => useDocuments.getState().setSectionMarkdown('cold', 0, 'partial')).toThrow(/先加载/);
  expect(useDocuments.getState().byId.cold.cloudRevision).toBe(8);
  useDocuments.getState().setSections('cold', [{ title: 'replacement', markdown: 'new-body', status: 'done' }]);
  useDocuments.getState().setStatus('cold', 'done');
  await waitFor(() => expect(useDocuments.getState().byId.cold.bodyRef).toBe(true));
  expect(useDocuments.getState().byId.cold.cloudRevision).toBeUndefined();
  expect((await loadDocumentFull('cold'))?.sections[0].markdown).toBe('new-body');
});


it('status changes do not overwrite a cold local document body', async () => {
  useDocuments.getState().create('local-cold',spec);
  useDocuments.getState().setSections('local-cold',[{title:'one',markdown:'original one',status:'done'},{title:'two',markdown:'original two',status:'done'}]);
  useDocuments.getState().setStatus('local-cold','done');
  await waitFor(()=>expect(useDocuments.getState().byId['local-cold'].bodyRef).toBe(true));
  expect(()=>useDocuments.getState().setSectionMarkdown('local-cold',0,'partial')).toThrow(/先加载/);
  expect(()=>useDocuments.getState().appendSection('local-cold',{title:'new',markdown:'new',status:'done'})).toThrow(/先加载/);
  useDocuments.getState().setStatus('local-cold','error','status only');
  expect((await loadDocumentFull('local-cold'))?.sections.map(section=>section.markdown)).toEqual(['original one','original two']);
});
