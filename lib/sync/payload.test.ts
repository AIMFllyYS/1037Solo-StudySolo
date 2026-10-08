import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatMessage } from "@/lib/types/chat";
import type { SessionMeta } from "@/lib/storage/chatStorage";
import {
  __setSyncLimitsForTests,
  buildArtifactPayload,
  buildChatSessionPayload,
  formatKindLimitMessage,
  formatUserLimitMessage,
  payloadLooksUnsafe,
  preparePayload,
  redactMediaString,
  stripForbiddenFields,
} from "./payload.ts";
import { MAX_USER_SYNC_BYTES } from "./types.ts";

function meta(id: string): SessionMeta {
  return {
    id,
    title: id,
    createdAt: 1,
    updatedAt: 2,
    messageCount: 1,
    artifactIds: [],
  };
}

function msg(id: string, extra?: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hi" }],
    timestamp: 1,
    ...extra,
  };
}

test("buildChatSessionPayload strips inline base64 and keeps blob id refs", () => {
  const payload = buildChatSessionPayload(meta("s1"), [
    msg("m1", {
      attachments: [
        { type: "image", mimeType: "image/png", base64: "data:image/png;base64,AAAA" },
        { type: "image", mimeType: "image/jpeg", id: "blob-1" },
      ],
    }),
  ]);
  const json = JSON.stringify(payload);
  assert.equal(payloadLooksUnsafe(payload), false);
  assert.equal(json.includes("AAAA"), false);
  assert.equal(json.includes("data:image"), false);
  assert.equal(json.includes('"base64"'), false);
  assert.equal(json.includes("blob-1"), true);
  assert.deepEqual(Object.keys(payload).sort(), ["messages", "meta", "v"]);
});

test("buildChatSessionPayload strips inline document text but preserves document metadata", () => {
  const payload = buildChatSessionPayload(meta("docs"), [msg("m-doc", {
    attachments: [{
      type: "document", mimeType: "text/markdown", name: "notes.md",
      text: "private document body", size: 21, characterCount: 21,
    }],
  })]);
  const attachment = payload.messages[0].attachments?.[0];
  assert.ok(attachment && attachment.type === "document" && "id" in attachment);
  assert.equal(JSON.stringify(payload).includes("private document body"), false);
  assert.equal(attachment?.name, "notes.md");
  assert.equal(attachment?.characterCount, 21);
});

test("buildChatSessionPayload keeps local PDF metadata but never syncs its bytes", () => {
  const payload = buildChatSessionPayload(meta("pdf"), [msg("m-pdf", {
    attachments: [{
      type: "local-file", mimeType: "application/pdf", name: "private.pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0xLjc=", size: 14,
    }],
  })]);
  const json = JSON.stringify(payload);
  const attachment = payload.messages[0].attachments?.[0];
  assert.ok(attachment && attachment.type === "local-file" && "id" in attachment);
  assert.equal(json.includes("JVBERi0xLjc"), false);
  assert.equal(json.includes("data:application/pdf"), false);
  assert.equal(attachment?.name, "private.pdf");
});

test("stripForbiddenFields drops apiKey and data URLs", () => {
  const stripped = stripForbiddenFields({
    html: '<img src="data:image/png;base64,QUJDRA==" />',
    apiKey: "sk-secret",
    nested: { base64: "QUJDRA==", text: "ok" },
  }) as { html: string; nested: { text: string } };
  assert.equal("apiKey" in (stripped as object), false);
  assert.equal("base64" in stripped.nested, false);
  assert.equal(stripped.nested.text, "ok");
  assert.equal(stripped.html.includes("data:image"), false);
  assert.equal(payloadLooksUnsafe(stripped), false);
});

test("preparePayload rejects oversized artifacts with a readable limit", () => {
  __setSyncLimitsForTests({ kind: { artifact: 256 } });
  const html = "x".repeat(300);
  const result = preparePayload("artifact", buildArtifactPayload({
    id: "a1",
    title: "big",
    html,
    status: "done",
  }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "kind-limit");
  assert.match(formatKindLimitMessage("artifact", result.bytes, result.limit), /未上传云端/);
  assert.match(formatUserLimitMessage(MAX_USER_SYNC_BYTES), /上限/);
  __setSyncLimitsForTests(null);
});

test("sanitizeChatMessages 同步 JSON 不含笔记全文 / 技能正文 / data URL", () => {
  const note = "线粒体是细胞的能量工厂。".repeat(80);
  const payload = buildChatSessionPayload(meta("s-note"), [{
    id: "a1",
    role: "assistant",
    timestamp: 1,
    parts: [
      { type: "reasoning", text: "很长的思考过程用于验证只留预览。".repeat(5), state: "done" },
      {
        type: "tool-getCurrentPage",
        toolCallId: "c1",
        state: "output-available",
        input: {},
        output: { text: `【细胞】\n\n${note}`, contextKey: "page:cell/textbook/ch1" },
      },
      {
        type: "tool-useSkill",
        toolCallId: "c2",
        state: "output-available",
        input: { name: "Bayes" },
        output: { text: "【技能：Bayes】\n步骤一不要上传", contextKey: "skill:s1", skill: "Bayes", found: true },
      },
      { type: "text", text: "线粒体负责供能。", state: "done" },
    ],
  }]);
  const json = JSON.stringify(payload);
  assert.equal(json.includes(note), false);
  assert.equal(json.includes("步骤一不要上传"), false);
  assert.equal(json.includes("data:image"), false);
  assert.match(json, /线粒体负责供能/);
  assert.match(json, /page:cell\/textbook\/ch1/);
});

test("redactMediaString leaves ordinary text and https images", () => {
  const src = "see https://example.com/a.png and data:image/png;base64,AAAA";
  const out = redactMediaString(src);
  assert.equal(out.includes("https://example.com/a.png"), true);
  assert.equal(out.includes("data:image"), false);
});


test('private completed HTML retains embedded image bytes while removing credential fields', () => {
  const html = '<img src="data:image/png;base64,QUJDRA==">';
  const prepared = preparePayload('artifact', buildArtifactPayload({ id:'embedded',title:'embedded',html,status:'done',apiKey:'secret' } as never));
  assert.equal(prepared.ok,true);
  if(prepared.ok) { assert.equal((prepared.payload as {html:string}).html,html);assert.equal(JSON.stringify(prepared.payload).includes('secret'),false); }
});
