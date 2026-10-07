import type { TextToolOutput } from "@/lib/ai/agent/tools/_types";

/** 随请求上行的项目文件目录（不含正文）。 */
export interface ProjectSliceIndexItem {
  sliceId: string;
  title: string;
  chars: number;
  summary: string;
}

export interface ProjectStudioRefPayload {
  path: string;
  title: string;
  address: string;
}

export interface ProjectFileCatalogItem {
  cloudFileId?: string;
  fileId: string;
  name: string;
  kind: "imported" | "studio-ref";
  status: "indexed" | "parsing" | "error";
  error?: string;
  studioRef?: ProjectStudioRefPayload;
  slices: ProjectSliceIndexItem[];
}

/** 本轮「带入对话」的切片正文。 */
export interface ProjectSlicePayload {
  fileId: string;
  sliceId: string;
  title: string;
  text: string;
}

export interface GetProjectFilesInput {
  /** 只看某个文件；不传就列整个项目的文件树。 */
  fileId?: string;
  /** 按文件名 / 切片标题 / 摘要粗筛。 */
  query?: string;
}

export interface GetProjectFilesOutput extends TextToolOutput {
  found: boolean;
  fileCount: number;
  sliceCount: number;
}

export interface ReadProjectSlicesInput {
  offset?: number;
  fileId: string;
  /** 要读的切片 id（来自 getProjectFiles 的索引）。 */
  sliceIds?: string[];
  /** 或者给关键词，按标题 / 摘要挑片。 */
  query?: string;
}

export interface ReadProjectSlicesOutput extends TextToolOutput {
  image?: { dataUrl: string; mimeType: string };
  found: boolean;
  sliceIds: string[];
}
