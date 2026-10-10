export type AttachmentPreviewKind = "image" | "pdf" | "ppt" | "html" | "markdown" | "text" | "docx";

/**
 * 按文件名 + MIME 判定本地预览类型。
 * OOXML 的 PPTX 是 `presentationml`，旧版 .ppt 才是 `ms-powerpoint`；
 * 不能把「不是 powerpoint 字符串」的 local-file 一律当成 PDF。
 */
export function attachmentPreviewKind(input: { name?: string; mimeType?: string }): AttachmentPreviewKind {
  const name = (input.name ?? "").toLowerCase();
  const mime = (input.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (isPowerpointFile(name, mime)) return "ppt";
  if (mime.includes("wordprocessing") || /\.docx?$/.test(name)) return "docx";
  if (mime === "text/html" || /\.html?$/.test(name)) return "html";
  if (mime === "text/markdown" || /\.md(?:own)?$/.test(name)) return "markdown";
  return "text";
}

/** 浏览器可还原版式的 OOXML 幻灯片（.pptx），不是二进制旧版 .ppt。 */
export function isOpenXmlPptx(input: { name?: string; mimeType?: string }): boolean {
  const name = (input.name ?? "").toLowerCase();
  const mime = (input.mimeType ?? "").toLowerCase();
  return mime.includes("presentationml") || name.endsWith(".pptx");
}

function isPowerpointFile(name: string, mime: string): boolean {
  return mime.includes("presentationml") || mime.includes("powerpoint") || /\.pptx?$/.test(name);
}
