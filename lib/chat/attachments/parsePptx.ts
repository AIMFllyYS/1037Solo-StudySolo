import { strFromU8 } from "fflate";
import { unzipWithinLimits } from "@/lib/utils/unzip";

export interface PptxSlideText {
  number: number;
  text: string;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (typeof atob === "function") {
    const binary = atob(encoded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

/**
 * 轻量、纯浏览器端的 PPTX 文本预览：只解压 OOXML 中的 a:t 节点，
 * 不执行宏、不加载外部资源。复杂版式仍保留为“文本化幻灯片”展示。
 */
export function parsePptxSlideBytes(bytes: Uint8Array): PptxSlideText[] {
  // 只解压幻灯片 XML：顺带跳过内嵌媒体等大文件，也挡住 zip bomb。
  const files = unzipWithinLimits(bytes, {
    maxFileBytes: 32 * 1024 * 1024,
    maxTotalBytes: 128 * 1024 * 1024,
    include: (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name),
  });
  const names = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)/i)?.[1] ?? 0));
  return names.map((name, index) => {
    const xml = strFromU8(files[name]);
    const text = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
      .map((match) => decodeXmlText(match[1] ?? ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { number: index + 1, text: text || "（此页没有可提取的文字）" };
  });
}

export function parsePptxSlideText(dataUrl: string): PptxSlideText[] {
  return parsePptxSlideBytes(dataUrlBytes(dataUrl));
}
