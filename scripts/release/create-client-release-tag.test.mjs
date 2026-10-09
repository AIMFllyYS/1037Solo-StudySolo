import assert from "node:assert/strict";
import test from "node:test";
import { createVerifiedReleaseTag } from "./create-client-release-tag.mjs";

const input = {
  apiBase: "https://api.github.com",
  repository: "owner/repo",
  version: "0.6.0",
  sourceSha: "a".repeat(40),
  token: "unit-test-only",
};

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), { status });
}

function queuedFetch(responses) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

test("404-only probes then atomically creates the exact version tag for source SHA", async () => {
  const mock = queuedFetch([
    jsonResponse(404),
    jsonResponse(404),
    jsonResponse(201, {
      ref: "refs/tags/v0.6.0",
      object: { type: "commit", sha: input.sourceSha },
    }),
  ]);

  const result = await createVerifiedReleaseTag({ ...input, fetchImpl: mock.fetchImpl });

  assert.deepEqual(result, { ref: "refs/tags/v0.6.0", sha: input.sourceSha });
  assert.equal(mock.calls.length, 3);
  assert.equal(mock.calls[0].options.method, "GET");
  assert.match(mock.calls[0].url, /\/releases\/tags\/v0\.6\.0$/);
  assert.equal(mock.calls[1].options.method, "GET");
  assert.match(mock.calls[1].url, /\/git\/ref\/tags\/v0\.6\.0$/);
  assert.equal(mock.calls[2].options.method, "POST");
  assert.match(mock.calls[2].url, /\/git\/refs$/);
  assert.equal(mock.calls[2].options.headers["X-GitHub-Api-Version"], "2026-03-10");
  assert.deepEqual(JSON.parse(mock.calls[2].options.body), {
    ref: "refs/tags/v0.6.0",
    sha: input.sourceSha,
  });
  assert.equal(mock.calls[2].options.redirect, "error");
});

test("existing release or tag fails closed without attempting ref creation", async () => {
  const existingRelease = queuedFetch([jsonResponse(200)]);
  await assert.rejects(
    createVerifiedReleaseTag({ ...input, fetchImpl: existingRelease.fetchImpl }),
    /release_tag_already_exists/,
  );
  assert.equal(existingRelease.calls.length, 1);

  const existingTag = queuedFetch([jsonResponse(404), jsonResponse(200)]);
  await assert.rejects(
    createVerifiedReleaseTag({ ...input, fetchImpl: existingTag.fetchImpl }),
    /git_tag_already_exists/,
  );
  assert.equal(existingTag.calls.length, 2);
});

test("non-404 probe statuses and network errors are not treated as absence", async () => {
  for (const status of [401, 403, 500]) {
    const mock = queuedFetch([jsonResponse(status)]);
    await assert.rejects(
      createVerifiedReleaseTag({ ...input, fetchImpl: mock.fetchImpl }),
      new RegExp("release_tag_check_failed:" + status),
    );
    assert.equal(mock.calls.length, 1);
  }

  const networkFailure = queuedFetch([new Error("offline")]);
  await assert.rejects(
    createVerifiedReleaseTag({ ...input, fetchImpl: networkFailure.fetchImpl }),
    /release_tag_check_inconclusive/,
  );
  assert.equal(networkFailure.calls.length, 1);
});

test("tag creation conflict or ambiguous response stops without automatic retry", async () => {
  const conflict = queuedFetch([jsonResponse(404), jsonResponse(404), jsonResponse(422)]);
  await assert.rejects(
    createVerifiedReleaseTag({ ...input, fetchImpl: conflict.fetchImpl }),
    /tag_creation_failed_manual_check_required:422/,
  );
  assert.equal(conflict.calls.length, 3);

  const uncertain = queuedFetch([jsonResponse(404), jsonResponse(404), new Error("connection reset")]);
  await assert.rejects(
    createVerifiedReleaseTag({ ...input, fetchImpl: uncertain.fetchImpl }),
    /tag_creation_result_uncertain_manual_check_required/,
  );
  assert.equal(uncertain.calls.length, 3);
});

test("a successful HTTP response with a different ref or SHA is not accepted", async () => {
  const mock = queuedFetch([
    jsonResponse(404),
    jsonResponse(404),
    jsonResponse(201, {
      ref: "refs/tags/v0.6.0",
      object: { type: "commit", sha: "b".repeat(40) },
    }),
  ]);

  await assert.rejects(
    createVerifiedReleaseTag({ ...input, fetchImpl: mock.fetchImpl }),
    /tag_creation_response_unverified_manual_check_required/,
  );
  assert.equal(mock.calls.length, 3);
});
