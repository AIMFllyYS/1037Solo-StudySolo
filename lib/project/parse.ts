"use client";

import { fileToDocumentAttachment } from "@/lib/ai/images/imageUtils";
import { parsePptxSlideBytes } from "@/lib/chat/attachments/parsePptx";
import { extractPdfText } from "./pdfText";

/**
 * 项目文件的本地解析入口：文件 → 纯文本（切片由 slice.ts 接手，导入流程见 import.ts）。
 *
 * v1 支持（用户确认的范围）：txt / md / html / markdown / 代码类 + docx + pptx + pdf。
 * - 文本类与 docx 复用仓库既有的 fileToDocumentAttachment（不做第二套提取）；
 * - pptx 复用 parsePptxSlideBytes；pdf 走 extractPdfText（pdfjs 文本层）；
 * - 不做 OCR、不解析表格；扫描件拿不到文字时照实标「几乎没文字」。
 */

const HTML_EXTENSIONS = new Set(["html", "htm"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** 极简 HTML → 纯文本：去掉脚本样式、块级标签转换行、再去标签。只做阅读，不执行任何东西。 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(h[1-3])(?:\s[^>]*)?>/gi, "\n\n## ")
    .replace(/<\/(h[1-3])>/gi, "\n")
    .replace(/<(p|div|br|li|tr|section|article)(?:\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/\n{3,}/g, "\n\n");
}

export async function extractFileText(file: File): Promise<string> {
  const extension = extensionOf(file.name);
  if (extension === "pdf") return extractPdfText(file);
  if (extension === "pptx" || extension === "ppt") {
    const slides = parsePptxSlideBytes(new Uint8Array(await file.arrayBuffer()));
    return slides.map((slide) => `## 第 ${slide.number} 页\n\n${slide.text}`).join("\n\n");
  }
  const attachment = await fileToDocumentAttachment(file,{includePreviewUrl:false});
  return HTML_EXTENSIONS.has(extension) ? htmlToPlainText(attachment.text) : attachment.text;
}
