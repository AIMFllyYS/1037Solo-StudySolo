import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { mediaManifest } from "../../lib/content-data/media";
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

test("offline probability tier accounts for every registered video, including absent local assets", () => {
  const report = runtimeAssetInventory("desktop-offline-subjects", ["probability"]);
  const registered = mediaManifest.videos
    .filter((video) => video.subjectId === "probability")
    .map((video) => `public${video.src}`);
  assert.ok(registered.length > 0, "probability must register video assets");
  for (const relative of registered) {
    const present = fs.existsSync(path.resolve(relative));
    assert.equal(report.files.includes(relative), present, `${relative} inventory presence`);
    assert.equal(report.missing.includes(relative), !present, `${relative} missing-asset gate`);
  }
});
