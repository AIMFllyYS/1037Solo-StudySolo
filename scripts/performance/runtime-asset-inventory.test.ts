import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimeAssetInventory } from "./runtime-asset-inventory.ts";

test("desktop-online asset list contains runtime index/worker and excludes build inputs", () => {
  const report = runtimeAssetInventory("desktop-online");
  assert.ok(report.files.includes("content/.index/manifest.json"));
  assert.ok(report.files.includes("runtime/search-worker/search/worker/index.mjs"));
  assert.ok(report.files.some((file) => file.startsWith("content/histology/")));
  assert.ok(report.files.every((file) => !file.includes("embed-cache") && !file.includes("_raw-src") && !file.includes("/videos/") && !file.includes("dist-desktop")));
  assert.equal(report.missing.length, 0);
});

test("offline-subject inventory keeps only selected subject content and images", () => {
  const report = runtimeAssetInventory("desktop-offline-subjects", ["histology"]);
  assert.ok(report.files.some((file) => file.startsWith("public/images/histology/")));
  assert.ok(report.files.every((file) => !file.startsWith("public/images/anatomy/") && !file.startsWith("content/anatomy/")));
  assert.deepEqual(report.subjects, ["histology"]);
});

test("offline probability tier includes its registered local videos", () => {
  const report = runtimeAssetInventory("desktop-offline-subjects", ["probability"]);
  assert.ok(report.files.some((file) => file.startsWith("public/media/videos/")));
  assert.equal(report.missing.length, 0);
});
