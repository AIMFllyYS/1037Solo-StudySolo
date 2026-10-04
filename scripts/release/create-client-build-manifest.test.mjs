import assert from "node:assert/strict";
import test from "node:test";
import { createClientBuildManifest, expectedClientArtifacts } from "./create-client-build-manifest.mjs";

const sourceSha = "a".repeat(40);
const digest = "b".repeat(64);

test("windows manifest binds both exact StudySolo filenames to source and version", () => {
  const names = expectedClientArtifacts("windows", "0.6.0");
  assert.deepEqual(names, ["StudySolo-setup-0.6.0.exe", "StudySolo-portable-0.6.0.exe"]);
  const manifest = createClientBuildManifest({
    platform: "windows",
    version: "0.6.0",
    sourceSha,
    artifacts: names.map((name) => ({ name, bytes: 1024, sha256: digest })),
  });
  assert.equal(manifest.sourceSha, sourceSha);
  assert.equal(manifest.version, "0.6.0");
  assert.equal(manifest.signed, false);
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.name), names);
});

test("Android build manifest is explicitly unsigned and versioned", () => {
  const [name] = expectedClientArtifacts("android", "0.6.0");
  const manifest = createClientBuildManifest({
    platform: "android",
    version: "0.6.0",
    sourceSha,
    artifacts: [{ name, bytes: 1200, sha256: digest }],
  });
  assert.equal(name, "StudySolo-android-0.6.0-unsigned.apk");
  assert.equal(manifest.signed, false);
});

test("rejects mismatched source metadata, file names, hashes, duplicates, and oversize assets", () => {
  const names = expectedClientArtifacts("windows", "0.6.0");
  const valid = names.map((name) => ({ name, bytes: 1024, sha256: digest }));

  assert.throws(() => createClientBuildManifest({ platform: "windows", version: "0.6", sourceSha, artifacts: valid }), /invalid_client_version/);
  assert.throws(() => createClientBuildManifest({ platform: "windows", version: "0.6.0", sourceSha: "bad", artifacts: valid }), /invalid_source_sha/);
  assert.throws(() => createClientBuildManifest({ platform: "windows", version: "0.6.0", sourceSha, artifacts: [{ ...valid[0], name: "Gailvlun-setup-0.6.0.exe" }, valid[1]] }), /unexpected_client_artifact/);
  assert.throws(() => createClientBuildManifest({ platform: "windows", version: "0.6.0", sourceSha, artifacts: [valid[0], { ...valid[1], sha256: "nope" }] }), /invalid_client_artifact_sha256/);
  assert.throws(() => createClientBuildManifest({ platform: "windows", version: "0.6.0", sourceSha, artifacts: [valid[0], { ...valid[1], bytes: 2 * 1024 * 1024 * 1024 }] }), /client_artifact_size_out_of_range/);
});
