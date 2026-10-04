import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SOURCE_SHA_RE = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const API_VERSION = "2026-03-10";

function endpoint(apiBase, repository, suffix) {
  const base = apiBase.replace(/\/+$/, "");
  const path = repository.split("/").map(encodeURIComponent).join("/");
  return base + "/repos/" + path + suffix;
}

async function getMustBeMissing(fetchImpl, url, label, headers) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(label + "_check_inconclusive");
  }

  if (response.status === 404) return;
  if (response.status >= 200 && response.status < 300) {
    throw new Error(label + "_already_exists");
  }
  throw new Error(label + "_check_failed:" + response.status);
}

/**
 * Fail closed unless both resources are absent, then atomically create the
 * version ref against the exact built commit and validate GitHub's response.
 * A failed or ambiguous POST is never retried here.
 */
export async function createVerifiedReleaseTag({
  apiBase,
  repository,
  version,
  sourceSha,
  token,
  fetchImpl = fetch,
}) {
  if (!VERSION_RE.test(version || "")) throw new Error("invalid_client_version");
  if (!SOURCE_SHA_RE.test(sourceSha || "")) throw new Error("invalid_source_sha");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) throw new Error("invalid_github_repository");
  if (typeof token !== "string" || token.length === 0) throw new Error("missing_github_token");

  const api = new URL(apiBase);
  if (api.protocol !== "https:") throw new Error("invalid_github_api_origin");

  const tag = "v" + version;
  const expectedRef = "refs/tags/" + tag;
  const expectedSha = sourceSha.toLowerCase();
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": API_VERSION,
    "Content-Type": "application/json",
  };

  await getMustBeMissing(
    fetchImpl,
    endpoint(apiBase, repository, "/releases/tags/" + encodeURIComponent(tag)),
    "release_tag",
    headers,
  );
  await getMustBeMissing(
    fetchImpl,
    endpoint(apiBase, repository, "/git/ref/tags/" + encodeURIComponent(tag)),
    "git_tag",
    headers,
  );

  let response;
  try {
    response = await fetchImpl(endpoint(apiBase, repository, "/git/refs"), {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: expectedRef, sha: expectedSha }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("tag_creation_result_uncertain_manual_check_required");
  }

  if (response.status !== 201) {
    throw new Error("tag_creation_failed_manual_check_required:" + response.status);
  }

  let created;
  try {
    created = await response.json();
  } catch {
    throw new Error("tag_creation_response_unverified_manual_check_required");
  }
  if (
    created?.ref !== expectedRef
    || created?.object?.type !== "commit"
    || typeof created?.object?.sha !== "string"
    || created.object.sha.toLowerCase() !== expectedSha
  ) {
    throw new Error("tag_creation_response_unverified_manual_check_required");
  }

  return { ref: expectedRef, sha: expectedSha };
}

async function main() {
  const created = await createVerifiedReleaseTag({
    apiBase: process.env.GITHUB_API_URL || "",
    repository: process.env.GITHUB_REPOSITORY || "",
    version: process.env.REQUESTED_VERSION || "",
    sourceSha: process.env.PREFLIGHT_SOURCE_SHA || "",
    token: process.env.GH_TOKEN || "",
  });
  process.stdout.write("verified newly created " + created.ref + " -> " + created.sha + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : "release_tag_guard_failed") + "\n");
    process.exitCode = 1;
  });
}
