import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ConnectorError } from "./actor.server";
/** Parse only text in a bounded selected PDF; no JavaScript, images or remote resources. */
export async function selectedPdfText(bytes: Uint8Array, startPage = 1, pageCount = 10) {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = pathToFileURL(createRequire(typeof __filename !== "undefined" ? __filename : import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
  const loading = getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, useSystemFonts: true });
  try {
    const pdf = await loading.promise;
    if (startPage < 1 || startPage > pdf.numPages) throw new ConnectorError("INVALID_PAGE_RANGE");
    const end = Math.min(pdf.numPages, startPage + Math.min(20, Math.max(1, pageCount)) - 1), pages: { page: number; text: string }[] = [];
    for (let index = startPage; index <= end; index++) {
      const page = await pdf.getPage(index), content = await page.getTextContent();
      pages.push({ page: index, text: content.items.map(item => "str" in item ? item.str : "").join(" ").slice(0, 12000) }); page.cleanup();
    }
    return { totalPages: pdf.numPages, pages, morePages: end < pdf.numPages };
  } finally { await loading.destroy(); }
}
