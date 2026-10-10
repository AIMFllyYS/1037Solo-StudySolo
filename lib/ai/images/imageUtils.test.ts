import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_IMAGE_SIZE,
  ACCEPTED_IMAGE_TYPES,
  toChatAttachments,
  revokeAttachments,
  type AttachmentPreview,
  fileToDocumentAttachment,
  LONG_PASTE_DOCUMENT_THRESHOLD,
  ACCEPTED_DOCUMENT_EXTENSIONS,
  ACCEPTED_DOCUMENT_FILE_TYPES,
} from "./imageUtils.ts";
import { Document, Packer, Paragraph } from "docx";

test("MAX_IMAGE_SIZE 为 2MB", () => {
  assert.equal(MAX_IMAGE_SIZE, 2 * 1024 * 1024);
});

test("ACCEPTED_IMAGE_TYPES 包含 jpeg/png/gif/webp", () => {
  assert.ok(ACCEPTED_IMAGE_TYPES.has("image/jpeg"));
  assert.ok(ACCEPTED_IMAGE_TYPES.has("image/png"));
  assert.ok(ACCEPTED_IMAGE_TYPES.has("image/gif"));
  assert.ok(ACCEPTED_IMAGE_TYPES.has("image/webp"));
  assert.equal(ACCEPTED_IMAGE_TYPES.size, 4);
});

test("toChatAttachments：转换格式正确", () => {
  const previews: AttachmentPreview[] = [
    {
      file: new File([""], "a.png", { type: "image/png" }),
      previewUrl: "blob:fake",
      base64: "data:image/png;base64,AAA",
      mimeType: "image/png",
    },
    {
      file: new File([""], "b.jpg", { type: "image/jpeg" }),
      previewUrl: "blob:fake2",
      base64: "data:image/jpeg;base64,BBB",
      mimeType: "image/jpeg",
    },
  ];
  const result = toChatAttachments(previews);
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "image");
  assert.equal(result[0].mimeType, "image/png");
  assert.equal(result[0].base64, "data:image/png;base64,AAA");
  assert.equal(result[1].type, "image");
  assert.equal(result[1].mimeType, "image/jpeg");
});

test("toChatAttachments：空数组返回空数组", () => {
  assert.deepEqual(toChatAttachments([]), []);
});

test("文档附件：TXT 与 Markdown 直接提取正文和真实字数", async () => {
  const txt = await fileToDocumentAttachment(new File(["中文😀 notes"], "notes.txt", { type: "text/plain" }));
  assert.equal(txt.type, "document");
  assert.equal(txt.text, "中文😀 notes");
  assert.equal(txt.characterCount, 9);
  assert.equal(txt.mimeType, "text/plain");

  const md = await fileToDocumentAttachment(new File(["# 标题"], "outline.md", { type: "text/markdown" }));
  assert.equal(md.text, "# 标题");
  assert.equal(md.mimeType, "text/markdown");
  assert.equal(LONG_PASTE_DOCUMENT_THRESHOLD, 1_000);
});

test("文档附件：HTML 与常见文本格式按白名单读取并保留源码", async () => {
  const htmlSource = '<main data-topic="力学"><script>window.bad = true</script>复习</main>';
  const html = await fileToDocumentAttachment(new File([htmlSource], "lesson.html", { type: "text/html" }));
  assert.equal(html.text, htmlSource);
  assert.equal(html.mimeType, "text/html");

  const jsonSource = '{"chapter": 3, "done": false}';
  const json = await fileToDocumentAttachment(new File([jsonSource], "progress.json", { type: "application/json" }));
  assert.equal(json.text, jsonSource);
  assert.equal(json.mimeType, "application/json");
  assert.ok(ACCEPTED_DOCUMENT_EXTENSIONS.has("tsx"));
  assert.match(ACCEPTED_DOCUMENT_FILE_TYPES, /\.html/);
  assert.match(ACCEPTED_DOCUMENT_FILE_TYPES, /\.yaml/);
});

test("文档附件：未知或二进制扩展名仍被拒绝", async () => {
  await assert.rejects(
    () => fileToDocumentAttachment(new File([new Uint8Array([0, 1, 2])], "archive.zip", { type: "application/zip" })),
    /不支持 archive\.zip/,
  );
});

test("文档附件：DOCX 通过解析器提取正文，而不是只接受文件名", async () => {
  const document = new Document({ sections: [{ children: [new Paragraph("DOCX 正文内容")] }] });
  const buffer = await Packer.toBuffer(document);
  const bytes = Uint8Array.from(buffer);
  const attachment = await fileToDocumentAttachment(new File([bytes], "lesson.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));
  assert.match(attachment.text, /DOCX 正文内容/);
  assert.equal(attachment.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
});

test("文档纯文本抽取不创建无人接管的预览 URL",async(t)=>{
  const document=new Document({sections:[{children:[new Paragraph('仅索引正文')]}]})
  const file=new File([Uint8Array.from(await Packer.toBuffer(document))],'index.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
  const create=t.mock.method(URL,'createObjectURL',()=>{throw new Error('text-only extraction must not create a URL')})
  const attachment=await fileToDocumentAttachment(file,{includePreviewUrl:false})
  assert.match(attachment.text,/仅索引正文/)
  assert.equal(attachment.previewUrl,undefined)
  assert.equal(create.mock.callCount(),0)
})

test("revokeAttachments：释放图片预览时不抛异常", () => {
  const previews: AttachmentPreview[] = [
    {
      file: new File([""], "a.png"),
      previewUrl: "blob:fake",
      base64: "",
      mimeType: "image/png",
    } as AttachmentPreview,
  ];
  assert.doesNotThrow(() => revokeAttachments(previews));
});
