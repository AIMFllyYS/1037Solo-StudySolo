import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(path), "utf8");

test("Android launcher delegates the HTTPS site to Custom Tabs without embedding web auth", () => {
  const activity = read("mobile/android/app/src/main/java/com/solo1037/studysolo/MainActivity.java");
  const site = read("mobile/android/app/src/main/java/com/solo1037/studysolo/StudySoloSite.java");
  const manifest = read("mobile/android/app/src/main/AndroidManifest.xml");
  const gradle = read("mobile/android/app/build.gradle");

  assert.match(activity, /CustomTabsIntent/);
  assert.match(activity, /StudySoloSite\.START_URL/);
  assert.match(site, /https:\/\/studysolo\.1037solo\.com\//);
  assert.match(gradle, /applicationId "com\.solo1037\.studysolo"/);
  assert.match(gradle, /package\.json/);
  assert.doesNotMatch(gradle, /signingConfig|storePassword|keyPassword|STUDYSOLO_ANDROID_/);
  assert.doesNotMatch(`${activity}\n${manifest}`, /WebView|JavascriptInterface|CookieManager|android\.webkit/);
  assert.doesNotMatch(manifest, /usesCleartextTraffic="true"/);
});

test("client CI stays secretless and release signing remains isolated from source builds", () => {
  const ci = read(".github/workflows/client-ci.yml");
  const release = read(".github/workflows/client-release.yml");
  const smoke = read("scripts/performance/smoke-packaged-desktop.mjs");
  const tagGuard = read("scripts/release/create-client-release-tag.mjs");
  const signStart = release.indexOf("  android-sign:");
  const publishStart = release.indexOf("  upload-draft:");
  assert.ok(signStart >= 0 && publishStart > signStart, "separate signing and upload jobs are required");
  const signJob = release.slice(signStart, publishStart);
  const publishJob = release.slice(publishStart);
  const signingStepStart = signJob.indexOf("      - name: Verify source metadata, align, sign, and verify APK");
  const signingStepEnd = signJob.indexOf("      - uses: actions/upload-artifact@v4", signingStepStart);
  const signingStep = signJob.slice(signingStepStart, signingStepEnd);
  const draftStepStart = publishJob.indexOf("      - name: Validate release manifests and create a draft only");
  const draftStep = publishJob.slice(draftStepStart);

  assert.doesNotMatch(ci, /\$\{\{\s*secrets\./);
  assert.match(signJob, /name:\s*studysolo-client-release/);
  assert.match(signingStep, /STUDYSOLO_ANDROID_KEYSTORE_BASE64/);
  assert.match(signingStep, /apksigner" sign/);
  assert.match(signingStep, /zipalign" -f/);
  assert.match(signingStep, /signed_bytes" -lt 2147483648/);
  assert.match(signingStep, /apk_count" -eq 1/);
  assert.match(signingStep, /\(\.artifacts \| length\) == 1/);
  assert.match(signingStep, /StudySolo-android-\$\{EXPECTED_VERSION\}\.apk/);
  assert.doesNotMatch(signJob.slice(0, signingStepStart), /STUDYSOLO_ANDROID_|\$\{\{\s*secrets\./);
  assert.doesNotMatch(signJob.slice(signingStepEnd), /STUDYSOLO_ANDROID_|\$\{\{\s*secrets\./);
  assert.doesNotMatch(signJob, /actions\/checkout|gradlew|gradle build/);
  assert.match(draftStep, /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
  assert.doesNotMatch(publishJob.slice(0, draftStepStart), /GH_TOKEN|\$\{\{\s*github\.token\s*\}\}/);
  assert.match(publishJob, /contents:\s*write/);
  assert.match(publishJob, /--draft/);
  assert.doesNotMatch(publishJob, /STUDYSOLO_ANDROID_|\$\{\{\s*secrets\./);
  assert.match(draftStep, /node scripts\/release\/create-client-release-tag\.mjs/);
  assert.match(draftStep, /gh release create[\s\S]*--verify-tag[\s\S]*--draft/);
  assert.doesNotMatch(draftStep, /gh release view|gh api .*git\/ref\/tags/);
  assert.match(tagGuard, /response\.status === 404/);
  assert.match(tagGuard, /response\.status !== 201/);
  assert.match(tagGuard, /created\?\.ref !== expectedRef/);
  assert.match(tagGuard, /created\.object\.sha\.toLowerCase\(\) !== expectedSha/);
  assert.doesNotMatch(tagGuard, /retry|RETRY/);
  assert.match(ci, /persist-credentials:\s*false/);
  assert.match(release, /persist-credentials:\s*false/);

  assert.match(smoke, /_electron as electron/);
  assert.match(smoke, /executablePath:\s*executable/);
  assert.match(smoke, /getByTestId\("chat-access-notice"\)/);
  assert.match(smoke, /getByTestId\("center-tab-browser"\)/);
  assert.match(smoke, /getZoomFactor\(\)/);
  assert.match(smoke, /browser-menu-refresh/);
  assert.match(smoke, /browser-zoom-reset/);
  assert.match(smoke, /\.screenshot\(/);
  assert.match(smoke, /app\.quit\(\)/);
  assert.match(smoke, /const secondRun = await runSmoke\(/);
  assert.match(smoke, /waitForLocalStatus\(null/);
  assert.match(smoke, /taskkill\.exe.*child\.pid/s);
  assert.match(smoke, /userDataPath\.toLowerCase\(\).*expectedUserData\.toLowerCase\(\)/);
});
