import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("SDK adapter normalizes custom reasoning and builds provider thinking settings", () => {
  const source = readWorkspaceFile("lib/ai/sdk/languageModel.ts");

  assert.match(source, /extractReasoningMiddleware\(\{ tagName: "think" \}\)/);
  assert.match(source, /createReasoningNormalizingFetch\(p\.reasoningField, observedFetch\)/);
  assert.match(source, /createPublicModelFetch\(p\.baseUrl, p\.timeoutMs\)/);
  assert.match(source, /buildThinkingSettings\(landed\.provider, effort, landed\.info\)/);
  assert.match(source, /switch \(style\)/);
  assert.doesNotMatch(source, /reqBody\.enable_thinking\s*=\s*true/);
  assert.doesNotMatch(source, /reqBody\.thinking_budget\s*=/);
  assert.match(source, /Anthropic 原生路径的 reasoning/);
  assert.match(source, /故意不套 extractReasoningMiddleware/);
});

test("思考装配只剩 buildThinkingSettings；AI_ENABLE_THINKING 已删除", () => {
  const provider = readWorkspaceFile("lib/ai/provider.ts");
  const envExample = readWorkspaceFile(".env.example");
  const electronConfig = readWorkspaceFile("electron/config.js");
  assert.doesNotMatch(provider, /buildThinkingRequestParams/);
  assert.doesNotMatch(envExample, /AI_ENABLE_THINKING/);
  assert.doesNotMatch(electronConfig, /AI_ENABLE_THINKING/);
});

test("6 条花钱路由的客户端只发本次用到的自定义分组", () => {
  const files = [
    "lib/chat/buildChatRequestBody.ts",
    "components/chat/ArtifactCard.tsx",
    "components/chat/DocumentCard.tsx",
    "components/chat/ImageGenViewer.tsx",
    "lib/review/startRecord.ts",
    "components/canvas/CanvasRevisionPanel.tsx",
  ];
  for (const file of files) {
    const source = readWorkspaceFile(file);
    assert.match(source, /selectCustomApiGroupsForRequest/, file);
    assert.doesNotMatch(source, /customApiGroups:\s*settings\.customApiGroups/, file);
  }
  const chatRoute = readWorkspaceFile("lib/ai/chat/server/generation.ts");
  assert.doesNotMatch(chatRoute, /!provider\.isCustom/);
  assert.match(chatRoute, /modelInfo && !modelInfo\.vision/);
});

test("study agent omits tools for models that do not support tool calling", () => {
  const route = readWorkspaceFile("lib/ai/chat/server/generation.ts");
  const adapter = readWorkspaceFile("lib/ai/sdk/languageModel.ts");
  const agent = readWorkspaceFile("lib/ai/agent/studyAgent.ts");

  assert.match(adapter, /const supportsTools = info\?\.tools !== false/);
  assert.match(route, /modelSupportsTools: resolved\.supportsTools/);
  assert.match(agent, /const tools = modelSupportsTools\s*\? buildStudyTools\([\s\S]*?: \{\}/);
});

test("image mode chat forces generateImage and does not expose artifact tools", () => {
  const source = readWorkspaceFile("lib/ai/agent/studyAgent.ts");

  assert.match(source, /stepNumber === 0[\s\S]*?activeTools: \["generateImage"\], toolChoice: \{ type: "tool", toolName: "generateImage" \}/);
  assert.match(source, /activeTools: \[\], toolChoice: "none"/);
  assert.match(source, /生图模式硬性规则/);
});

test("artifact and image generation use the model selected when the tool call was created", () => {
  const chatRoute = readWorkspaceFile("lib/ai/chat/server/generation.ts");
  const tools = [
    "lib/ai/agent/tools/renderInteractive/tool.ts",
    "lib/ai/agent/tools/generateImage/tool.ts",
    "lib/ai/agent/tools/writeDocument/tool.ts",
  ].map(readWorkspaceFile).join("\n");
  const artifactCard = readWorkspaceFile("components/chat/ArtifactCard.tsx");
  const imageViewer = readWorkspaceFile("components/chat/ImageGenViewer.tsx");
  const imageCard = readWorkspaceFile("components/chat/ImageGenCard.tsx");

  assert.match(chatRoute, /selectedModelId: automaticModels \? effectiveModelId : modelId \?\? effectiveModelId/);
  assert.match(tools, /unsupportedReason: ctx\.artifactUnsupportedReason/);
  assert.equal([...tools.matchAll(/modelId: ctx\.modelId/g)].length, 3);
  assert.match(artifactCard, /const artifactModelId = modelId \|\| settings\.selectedModelId/);
  assert.match(imageCard, /modelId,/);
  assert.match(imageViewer, /const imageModelId = cur\.modelId \|\| settings\.selectedModelId/);
  assert.match(imageViewer, /defaultImageModelId: cur\.modelId \? null : settings\.defaultImageModelId/);
  assert.match(imageViewer, /formatImageGenError/);
  assert.match(imageViewer, /imageGenErrorHeading/);
});

test("artifact route rejects image models before invoking html generation", () => {
  const source = readWorkspaceFile("app/api/artifact/route.ts");

  assert.match(source, /getModelInfoWithCustom\(modelId,\s*customApiGroups\)\?\.type === "image"/);
  assert.match(source, /当前生图模型不支持 HTML 交互组件生成/);
  assert.match(source, /ARTIFACT_IDLE_TIMEOUT_MS/);
  assert.match(source, /maxDuration = 720/);
});

test("image generation route honors explicit custom image API style", () => {
  const source = readWorkspaceFile("app/api/image-gen/route.ts");

  assert.match(source, /detectImageApiStyle\(provider\.apiModelId,\s*provider\.imageApiStyle\)/);
  assert.doesNotMatch(source, /function detectImageApiStyle/);
});

test("custom model settings preserve provider compatibility fields", () => {
  const source = [
    readWorkspaceFile("components/chat/settings/_shared.tsx"),
    readWorkspaceFile("components/chat/settings/ModelForm.tsx"),
  ].join("\n");

  assert.match(source, /reasoningField: m\.reasoningField \?\? ""/);
  assert.match(source, /thinkingRequestStyle: m\.thinkingRequestStyle/);
  assert.match(source, /imageApiStyle: m\.imageApiStyle \?\? "auto"/);
  // apiProtocol 三选一是新的顶层选项；老 reasoningField/thinkingRequestStyle 收进"高级"面板
  assert.match(source, /apiProtocol: f\.apiProtocol/);
  assert.match(source, /f\.showAdvanced\s*\?\s*f\.reasoningField\.trim\(\)\s*\|\|\s*undefined/);
  assert.match(source, /imageApiStyle: f\.imageApiStyle/);
  assert.match(source, /thinkingLevels: f\.thinking \? normalizeThinkingLevels\(f\.thinkingLevels\) : undefined/);
  assert.match(source, /data-testid=\{`custom-model-thinking-level-\$\{level\}`\}/);
  assert.match(source, /data-testid="custom-model-thinking-toggle"/);
});
