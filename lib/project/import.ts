"use client";

import { recordImport } from "@/lib/stores/assets/imports";
import { useProjectFiles } from "@/lib/stores/assets/projectFiles";
import { PROJECT_LIMITS } from "./limits";
import { extractFileText } from './parse';
import { uploadCloudFile, deleteCloudFile } from '@/lib/files/client';
import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';
import { fileToAttachment } from '@/lib/ai/imageUtils';
import { sliceText } from './slice';

export interface ImportProjectFileInput {
  projectId: string;
  file: File;
  /** Electron 下才有：记进导入记录，方便「用系统打开」。 */
  absPath?: string;
}

export interface ImportProjectFileResult {
  id: string | null;
  error?: string;
  note?: string;
}

/**
 * 把一个本地文件导入项目：占位 → 本机解析（索引 + 切片）→ 落库 → 记一条导入记录。
 * 失败只影响这一个文件：条目留在库里并标 error，用户可重试或删掉。
 */
export async function importProjectFile(input: ImportProjectFileInput): Promise<ImportProjectFileResult> {
  const { projectId, file, absPath } = input;
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const previous = Object.values(useProjectFiles.getState().byId).find(entry => entry.projectId === projectId && (absPath && entry.absPath === absPath || entry.name === file.name));
  if (file.size > PROJECT_LIMITS.MAX_TEXT_BYTES) {
    const mb = Math.round(PROJECT_LIMITS.MAX_TEXT_BYTES / (1024 * 1024));
    return { id: null, error: `${file.name} 超过 ${mb} MB，先拆分再导入。` };
  }
  const id = useProjectFiles.getState().beginImport({
    projectId,
    name: file.name,
    absPath,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
    mtime: file.lastModified,
  });
  try {
    const image = file.type.startsWith('image/') ? await fileToAttachment(file, { includePreviewUrl: false }) : null;
    const text = image ? '图片保存在云端，可由支持图片的 AI 按需读取。' : await extractFileText(file);
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return { id: null, error: '账号已切换，导入已停止，未上传旧账号文件。' };
    const note = !image && /pdf$/i.test(file.name) && text.trim().length < 200 ? '这份 PDF 几乎没有可提取的文字，可能是扫描件。' : undefined;
    const cloud = await uploadCloudFile(file, image && 'base64' in image ? { v: 1, image: { dataUrl: image.base64, mimeType: image.mimeType } } : { v: 1, text, ...(note ? { note } : {}) }, projectId);
    if (image && 'previewUrl' in image && image.previewUrl) URL.revokeObjectURL(image.previewUrl);
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) return { id: null, error: '账号已切换，导入已停止。' };
    if (!useProjectFiles.getState().byId[id]) {
      await deleteCloudFile(cloud.id).catch(() => {});
      return { id: null, error: '导入已取消；如云端清理失败，可到我的资产检查该文件。' };
    }
    const parsed = sliceText(text, { name: file.name });
    useProjectFiles.getState().finishImport(id, parsed);
    useProjectFiles.setState(state => ({ byId: { ...state.byId, [id]: { ...state.byId[id]!, cloudFileId: cloud.id } } }));
    // 资产页「文件」栏据此也能看到它（只存路径与元数据）。
    recordImport({
      kind: "file",
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || undefined,
      absPath,
      projectId,
      cloudFileId: cloud.id,
      source: "project-files",
    });
    return { id, ...(note ? { note } : {}) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败";
    if (getStorageOwner() === owner && getOwnerEpoch() === epoch) {
      if (previous) useProjectFiles.setState(state => ({ byId: { ...state.byId, [id]: previous } }));
      else useProjectFiles.getState().failImport(id, message);
    }
    return { id, error: message };
  }
}
