/** Operator fixture checks only: no private library items or user content are retrieved. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const privateRoot = resolve(root, ".local-archive/connectors-private");
const safeFetch = (url, init) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
const report = { observedAtUtc: new Date().toISOString(), userContentRead: false, nativeIntegrated: false, providers: {} };
try {
  const ncbi = JSON.parse(readFileSync(resolve(privateRoot, "ncbi-credentials.json"), "utf8"));
  const response = await safeFetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ db: "pubmed", term: "learning", retmax: "0", retmode: "json", api_key: ncbi.api_key, tool: "StudySoloDevelopment" }) });
  const data = await response.json();
  report.providers.pubmed = { quotaCredentialVerified: response.ok && !data.error && !!data.esearchresult, httpStatus: response.status, query: "public metadata count only", keyCreated: true };
} catch { report.providers.pubmed = { quotaCredentialVerified: false, reason: "quota_check_unavailable" }; }
try {
  const zotero = JSON.parse(readFileSync(resolve(privateRoot, "zotero-development-key.json"), "utf8"));
  const response = await safeFetch("https://api.zotero.org/keys/current", { headers: { "Zotero-API-Key": zotero.api_key, "Zotero-API-Version": "3" } });
  const data = await response.json();
  const user = data.access?.user;
  const groups = data.access?.groups ?? {};
  const readonly = user?.library === true && !user?.notes && !user?.write && Object.keys(groups).length === 0;
  report.providers.zotero = { operatorDevelopmentKeyVerified: response.ok && data.userID === zotero.user_id && readonly, httpStatus: response.status, permissions: { libraryRead: user?.library === true, notes: user?.notes === true, write: user?.write === true, groups: Object.keys(groups).length > 0 }, userContentRead: false, userConnectedToStudySolo: false };
} catch { report.providers.zotero = { operatorDevelopmentKeyVerified: false, reason: "identity_check_unavailable" }; }
const directory = resolve(root, "artifacts/connector-auth-2026-10-03");
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, "learning-credential-verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.providers).some(item => item.quotaCredentialVerified === false || item.operatorDevelopmentKeyVerified === false)) process.exitCode = 1;
