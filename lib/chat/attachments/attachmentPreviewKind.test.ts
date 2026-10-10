import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentPreviewKind, isOpenXmlPptx } from "./attachmentPreviewKind.ts";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

test("attachmentPreviewKind：OOXML pptx 是 ppt 而不是 pdf", () => {
  assert.equal(PPTX_MIME.includes("powerpoint"), false);
  assert.equal(attachmentPreviewKind({ name: "课.slides.pptx", mimeType: PPTX_MIME }), "ppt");
  assert.equal(isOpenXmlPptx({ name: "课.slides.pptx", mimeType: PPTX_MIME }), true);
});

test("attachmentPreviewKind：旧版 .ppt 仍是 ppt，但不是 open xml", () => {
  assert.equal(attachmentPreviewKind({
    name: "old.ppt",
    mimeType: "application/vnd.ms-powerpoint",
  }), "ppt");
  assert.equal(isOpenXmlPptx({
    name: "old.ppt",
    mimeType: "application/vnd.ms-powerpoint",
  }), false);
});

test("attachmentPreviewKind：pdf 按 mime 或扩展名识别", () => {
  assert.equal(attachmentPreviewKind({ name: "lecture.pdf", mimeType: "application/pdf" }), "pdf");
  assert.equal(attachmentPreviewKind({ name: "lecture.pdf", mimeType: "" }), "pdf");
});
