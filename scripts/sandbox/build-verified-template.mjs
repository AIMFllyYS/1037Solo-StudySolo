/** Operator CI only. Registry credentials expire with this GitHub job. */
import { mkdir, writeFile } from "node:fs/promises";
import { Template } from "e2b";

const image = process.env.STUDYSOLO_VERIFIED_IMAGE ?? "";
if (!/^ghcr\.io\/aimfllyys\/studysolo-skills@sha256:[a-f0-9]{64}$/.test(image)) {
  throw new Error("verified_image_digest_required");
}
const apiKey = process.env.STUDYSOLO_SANDBOX_BUILD_API_KEY;
const username = process.env.GITHUB_ACTOR;
const password = process.env.STUDYSOLO_REGISTRY_JOB_TOKEN;
if (!apiKey || !username || !password) throw new Error("operator_build_credentials_missing");
const alias = `studysolo-skills-oci-${image.slice(-64, -52)}`;
const directory = process.env.STUDYSOLO_TEMPLATE_EVIDENCE_DIR;
if (!directory) throw new Error("operator_evidence_directory_required");
await mkdir(directory, { recursive: true });
const options = {
  apiKey,
  apiUrl: "https://api.cn-hangzhou.sandbox.aliyuncs.com",
  domain: "cn-hangzhou.sandbox.aliyuncs.com",
  cpuCount: 2,
  memoryMB: 2048,
  requestTimeoutMs: 30_000,
  onBuildLogs: () => {},
};
let build;
const evidence = { schemaVersion: 1, alias, image, state: "not-submitted", registryCredential: "ephemeral-job-token" };
try {
  // Do not retry a create whose outcome is unknown. Inspect the Team before rerunning.
  build = await Template.buildInBackground(Template().fromImage(image, { username, password }), alias, options);
  Object.assign(evidence, { state: "submitted", templateId: build.templateId, buildId: build.buildId });
  await writeFile(`${directory}/template-build.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ state: evidence.state, alias, templateId: build.templateId }));
  const deadline = Date.now() + 9 * 60_000;
  while (Date.now() < deadline) {
    const status = await Template.getBuildStatus(build, options);
    evidence.state = status.status;
    if (status.status === "ready") break;
    if (status.status === "error") throw new Error("provider_template_build_failed");
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  if (evidence.state !== "ready") throw new Error("provider_build_pending_after_deadline");
  console.log(JSON.stringify({ state: "ready-needs-runtime-acceptance", alias, templateId: build.templateId }));
} catch (error) {
  evidence.state = build ? evidence.state : "create-outcome-unknown";
  // Provider errors can contain registry request bodies. Never export them or logs.
  console.error(JSON.stringify({ state: evidence.state, errorKind: error instanceof Error ? error.constructor.name : "unknown", inspectBeforeRetry: true }));
  process.exitCode = 1;
} finally {
  await writeFile(`${directory}/template-build.json`, JSON.stringify(evidence, null, 2));
}
