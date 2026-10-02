/**
 * 图片附件处理工具 —— 供 AI 对话板块所有输入组件复用。
 *
 * 提供：尺寸压缩、File → base64 转换、File → AttachmentPreview 完整管线。
 * 所有函数纯客户端运行，不依赖 React，可在任意组件或 hook 中调用。
 */

import type { ChatAttachment, ChatDocumentMimeType } from "@/lib/types/chat";
import {createObjectUrlLease} from '@/lib/resources/objectUrl'

/** 单图最大体积（2 MB），超过则触发 Canvas 压缩。 */
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/** 支持的图片 MIME 类型集合。 */
export const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
/** 工作站顶部“添加文件”是完全本地的入口，允许更大的文件。 */
export const MAX_LOCAL_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_DOCUMENT_CHARACTERS = 200_000;
export const LONG_PASTE_DOCUMENT_THRESHOLD = 1_000;

export interface FileAttachmentOptions {
  /** 覆盖默认的对话附件体积上限；仅应由本地预览入口使用。 */
  maxFileSize?: number;
  /** Text-only extraction has no preview consumer and must not create a blob URL. */
  includePreviewUrl?:boolean;
}

/**
 * 文本附件白名单。不要仅依赖浏览器上报的 MIME：不同系统经常会把
 * 代码、配置和 Markdown 文件标成空字符串或 application/octet-stream。
 */
export const DOCUMENT_MIME_BY_EXTENSION = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  jsonl: "application/x-ndjson",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  css: "text/css",
  js: "text/javascript",
  jsx: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  sql: "application/sql",
  log: "text/plain",
  ini: "text/plain",
  conf: "text/plain",
  cfg: "text/plain",
  toml: "application/toml",
  py: "text/plain",
  java: "text/plain",
  c: "text/plain",
  cc: "text/plain",
  cpp: "text/plain",
  h: "text/plain",
  hpp: "text/plain",
  go: "text/plain",
  rs: "text/plain",
  sh: "application/x-sh",
  bash: "application/x-sh",
  zsh: "application/x-sh",
  ps1: "text/plain",
  bat: "text/plain",
  cmd: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const satisfies Record<string, ChatDocumentMimeType>;

export const ACCEPTED_DOCUMENT_EXTENSIONS = new Set(Object.keys(DOCUMENT_MIME_BY_EXTENSION));
export const LOCAL_PREVIEW_MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export const ACCEPTED_LOCAL_PREVIEW_EXTENSIONS = new Set(Object.keys(LOCAL_PREVIEW_MIME_BY_EXTENSION));

/** 供文件选择器复用，保证可选择范围与实际解析白名单完全一致。 */
export const ACCEPTED_DOCUMENT_FILE_TYPES = [
  ...Object.keys(DOCUMENT_MIME_BY_EXTENSION).map((extension) => `.${extension}`),
  ...Object.keys(LOCAL_PREVIEW_MIME_BY_EXTENSION).map((extension) => `.${extension}`),
  ...new Set(Object.values(DOCUMENT_MIME_BY_EXTENSION)),
  ...new Set(Object.values(LOCAL_PREVIEW_MIME_BY_EXTENSION)),
].join(",");

/** 压缩后最长边像素上限。 */
const COMPRESS_MAX_DIM = 1920;
/** 压缩质量（0–1）。 */
const COMPRESS_QUALITY = 0.85;

/** 前端预览用的中间结构，包含 blob URL 供 <img> 渲染。 */
export interface ImageAttachmentPreview {
  /** 兼容旧测试/调用方；缺省时同样按图片处理。 */
  type?: "image";
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

export interface DocumentAttachmentPreview {
  type: "document";
  file: File;
  mimeType: ChatDocumentMimeType;
  name: string;
  size: number;
  text: string;
  characterCount: number;
  /** 原始文件 object URL，供 Word 等保真预览；不进入模型请求。 */
  previewUrl?: string;
}

export interface LocalFileAttachmentPreview {
  type: "local-file";
  file: File;
  mimeType: "application/pdf" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  name: string;
  size: number;
  dataUrl: string;
}

export type AttachmentPreview = ImageAttachmentPreview | DocumentAttachmentPreview | LocalFileAttachmentPreview;

function documentExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedLocalPreview(file: File): boolean {
  return ACCEPTED_LOCAL_PREVIEW_EXTENSIONS.has(documentExtension(file));
}

function countCodePoints(text: string): number {
  let count = 0;
  for (const value of text) count += value ? 1 : 0;
  return count;
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error(`读取 ${file.name} 失败`));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error(`读取 ${file.name} 失败`));
    reader.readAsArrayBuffer(file);
  });
}

export async function fileToDocumentAttachment(file: File, options: FileAttachmentOptions = {}): Promise<DocumentAttachmentPreview> {
  const extension = documentExtension(file);
  const mappedMimeType = DOCUMENT_MIME_BY_EXTENSION[extension as keyof typeof DOCUMENT_MIME_BY_EXTENSION];
  if (!mappedMimeType) {
    throw new Error(`不支持 ${file.name}，请选择文本、Markdown、HTML、代码、配置或 DOCX 文档`);
  }
  const maxFileSize = options.maxFileSize ?? MAX_DOCUMENT_SIZE;
  if (file.size > maxFileSize) {
    throw new Error(`${file.name} 超过 ${Math.round(maxFileSize / (1024 * 1024))} MB，暂时无法读取`);
  }

  let text: string;
  let mimeType: DocumentAttachmentPreview["mimeType"];
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const arrayBuffer = await readFileAsArrayBuffer(file);
    // Mammoth's browser build consumes ArrayBuffer; its Node test entry consumes Buffer.
    // The browser-field replacement keeps Buffer out of the production client path.
    const input = typeof window === "undefined"
      ? { buffer: Buffer.from(arrayBuffer) }
      : { arrayBuffer };
    const result = await mammoth.extractRawText(input);
    text = result.value;
    mimeType = mappedMimeType;
    const characterCount = countCodePoints(text);
    if (characterCount > MAX_DOCUMENT_CHARACTERS) {
      throw new Error(`${file.name} 提取后超过 20 万字，请拆分后再上传`);
    }
    let previewUrl: string | undefined;
    if(options.includePreviewUrl!==false)try{previewUrl = URL.createObjectURL(file)}catch{previewUrl=undefined}
    return { type: "document", file, mimeType, name: file.name, size: file.size, text, characterCount, previewUrl };
  } else {
    text = await readFileAsText(file);
    // HTML 等格式只读取源码文本，不插入 DOM，也不会执行其中的脚本。
    mimeType = mappedMimeType;
  }

  const characterCount = countCodePoints(text);
  if (characterCount > MAX_DOCUMENT_CHARACTERS) {
    throw new Error(`${file.name} 提取后超过 20 万字，请拆分后再上传`);
  }
  return { type: "document", file, mimeType, name: file.name, size: file.size, text, characterCount };
}

/** PDF / PowerPoint 等仅供本地查看的原始文件不会进入 AI 请求。 */
export async function fileToLocalPreviewAttachment(file: File, options: FileAttachmentOptions = {}): Promise<LocalFileAttachmentPreview> {
  const extension = documentExtension(file);
  const mimeType = LOCAL_PREVIEW_MIME_BY_EXTENSION[extension as keyof typeof LOCAL_PREVIEW_MIME_BY_EXTENSION];
  if (!mimeType) {
    throw new Error(`不支持 ${file.name} 的本地预览`);
  }
  const maxFileSize = options.maxFileSize ?? MAX_DOCUMENT_SIZE;
  if (file.size > maxFileSize) {
    throw new Error(`${file.name} 超过 ${Math.round(maxFileSize / (1024 * 1024))} MB，暂时无法预览`);
  }
  let dataUrl: string | null = null;
  try {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      dataUrl = URL.createObjectURL(file);
    }
  } catch {
    dataUrl = null;
  }
  if (!dataUrl) dataUrl = await readFileAsDataUrl(file);
  return { type: "local-file", file, mimeType, name: file.name, size: file.size, dataUrl };
}

/**
 * 用 Canvas 将图片缩放至最长边 ≤ maxDim 并输出 JPEG data-url。
 * 小图或不需压缩时直接用 FileReader 读取。
 */
export function compressImage(file: File, maxDim = COMPRESS_MAX_DIM): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const lease=createObjectUrlLease(file)
    img.onload = () => {
      try{
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if(!ctx)throw new Error('Canvas unavailable')
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", COMPRESS_QUALITY));
      }catch(error){reject(error)}finally{lease.release()}
    };
    img.onerror = ()=>{lease.release();reject(new Error('图片解码失败'))};
    try{img.src = lease.url}catch(error){lease.release();reject(error)}
  });
}

/** 将 File 读取为 data-url（base64）。 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 将单个图片 File 转换为 AttachmentPreview（含压缩、base64、blob 预览 URL）。
 * 非 image/* 文件抛出 Error。
 */
export async function fileToAttachment(file: File, options: FileAttachmentOptions = {}): Promise<AttachmentPreview> {
  if (!file.type.startsWith("image/")) {
    throw new Error("仅支持图片文件（JPG/PNG/GIF/WebP）");
  }
  const maxFileSize = options.maxFileSize;
  if (maxFileSize !== undefined && file.size > maxFileSize) {
    throw new Error(`${file.name} 超过 ${Math.round(maxFileSize / (1024 * 1024))} MB，暂时无法读取`);
  }
  const needsCompress = file.size > MAX_IMAGE_SIZE;
  const base64 = needsCompress
    ? await compressImage(file)
    : await readFileAsDataUrl(file);
  const previewUrl = URL.createObjectURL(file);
  const mimeType = needsCompress ? "image/jpeg" : file.type;
  return { type: "image", file, previewUrl, base64, mimeType };
}

/**
 * 批量将 File 列表转换为 AttachmentPreview 列表。
 * 非图片文件会被跳过并收集错误信息。
 */
export async function filesToAttachments(
  files: File[],
  options: FileAttachmentOptions = {},
): Promise<{ attachments: AttachmentPreview[]; errors: string[] }> {
  const attachments: AttachmentPreview[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const att = file.type.startsWith("image/")
        ? await fileToAttachment(file, options)
        : isSupportedLocalPreview(file)
          ? await fileToLocalPreviewAttachment(file, options)
          : await fileToDocumentAttachment(file, options);
      attachments.push(att);
    } catch (e) {
      errors.push((e as Error).message || `处理 ${file.name} 失败`);
    }
  }
  return { attachments, errors };
}

/** 从 ClipboardEvent 中提取所有图片 File。 */
export function getImagesFromClipboard(e: React.ClipboardEvent | ClipboardEvent): File[] {
  const items = "clipboardData" in e ? e.clipboardData?.items : null;
  if (!items) return [];
  const files: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

/** 从拖放事件提取项目支持的图片和文档；非法文件交由处理管线生成可读错误。 */
export function getSupportedFilesFromDragEvent(e: React.DragEvent | DragEvent): File[] {
  const dt = "dataTransfer" in e ? e.dataTransfer : null;
  return dt ? Array.from(dt.files || []) : [];
}

/** 将 AttachmentPreview[] 转换为发送给 API 的 ChatAttachment[]。 */
export function toChatAttachments(previews: AttachmentPreview[]): ChatAttachment[] {
  return previews.map((attachment) => {
    if (attachment.type === "document") {
      return {
        type: "document" as const,
        mimeType: attachment.mimeType,
        name: attachment.name,
        text: attachment.text,
        size: attachment.size,
        characterCount: attachment.characterCount,
      };
    }
    if (attachment.type === "local-file") {
      return {
        type: "local-file" as const,
        mimeType: attachment.mimeType,
        dataUrl: attachment.dataUrl,
        name: attachment.name,
        size: attachment.size,
      };
    }
    return {
        type: "image" as const,
        mimeType: attachment.mimeType,
        base64: attachment.base64,
        name: attachment.file.name,
        size: attachment.file.size,
      };
  });
}

/** 释放一组 AttachmentPreview 的 blob URL，防止内存泄漏。 */
export function revokeAttachments(previews: AttachmentPreview[]): void {
  previews.forEach((attachment) => {
    // document 的 previewUrl 与 local-file 的 dataUrl 同样是 createObjectURL 产物，
    // 以前被豁免 = 确定性泄漏。预览窗现在经 data.file 自建 URL（借据模型），
    // 这里的 URL 归 composer 独有，可以无条件回收。
    const url =
      attachment.type === "document"
        ? attachment.previewUrl
        : attachment.type === "local-file"
          ? attachment.dataUrl
          : attachment.previewUrl;
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  });
}
