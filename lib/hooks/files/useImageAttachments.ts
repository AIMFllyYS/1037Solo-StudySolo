/**
 * useImageAttachments —— 可复用的图片附件管理 hook。
 *
 * 统一处理 paste / drop / file-input 三种图片输入方式，
 * 内置 vision 模型守卫、压缩、预览、错误提示。
 *
 * 任何 AI 对话输入组件均可直接调用：
 * ```ts
 * const { attachments, addFiles, remove, clear, handlePaste, handleDrop, handleDragOver, error } = useImageAttachments();
 * ```
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  filesToAttachments,
  toChatAttachments,
  revokeAttachments,
  getImagesFromClipboard,
  getSupportedFilesFromDragEvent,
  LONG_PASTE_DOCUMENT_THRESHOLD,
  MAX_DOCUMENT_CHARACTERS,
  type AttachmentPreview,
} from "@/lib/ai/images/imageUtils";
import { useSettings } from "@/lib/stores/settings";
import { getModelInfoWithCustom, modelAcceptsImageInput } from "@/lib/ai/models";
import { localPathOf, recordImport, type ImportSource } from "@/lib/stores/assets/imports";
import type { ChatAttachment } from "@/lib/types/chat";
import {adoptObjectUrl} from '@/lib/resources/objectUrl'
import {getOwnerEpoch,getStorageOwner,onStorageOwnerChange} from '@/lib/storage/ownerScope'
import { MAX_ATTACHMENTS_PER_MESSAGE, type ProcessedFile } from '@/lib/files/contract';
import { uploadCloudFile } from '@/lib/files/client';
import { extractFileText } from '@/lib/project/parse';

export interface UseImageAttachmentsResult {
  processing: boolean;
  /** 当前附件预览列表（含 blob URL）。 */
  attachments: AttachmentPreview[];
  /** 添加 File 列表（自动过滤非图片、压缩、生成预览）。 */
  addFiles: (files: File[]) => Promise<void>;
  /** 移除指定索引的附件。 */
  remove: (idx: number) => void;
  /** 清空全部附件并释放 blob URL。 */
  clear: () => void;
  /** 转换为 API 发送用的 ChatAttachment[]。 */
  toChatFormat: () => ChatAttachment[] | undefined;
  /** textarea 的 onPaste 处理器——直接绑定到组件。 */
  handlePaste: (e: React.ClipboardEvent) => void;
  /** 容器的 onDrop 处理器——直接绑定到组件。 */
  handleDrop: (e: React.DragEvent) => void;
  /** 容器的 onDragOver 处理器——阻止默认行为以允许 drop。 */
  handleDragOver: (e: React.DragEvent) => void;
  /** 容器的 onDragEnter 处理器——维护拖拽计数器。 */
  handleDragEnter: (e: React.DragEvent) => void;
  /** 容器的 onDragLeave 处理器——维护拖拽计数器。 */
  handleDragLeave: (e: React.DragEvent) => void;
  /** 是否正在拖拽图片（用于 UI 高亮）。 */
  isDragging: boolean;
  /** 放下或拖离后立刻清掉虚线框，避免挡住输入。 */
  endDrag: () => void;
  /** 错误信息（3 秒后自动清除）。 */
  error: string | null;
  /** 非阻断提示，例如长文本已自动转换为 TXT。 */
  info: string | null;
  /** 手动清除错误。 */
  clearError: () => void;
}

function attachmentObjectUrl(attachment:AttachmentPreview){return attachment.type==='document'?attachment.previewUrl:attachment.type==='local-file'?attachment.dataUrl:attachment.previewUrl}

/**
 * @param options.importSource 记「本地导入记录」时标注来源（我的资产 → 文件/网址）。
 *   只记非图片：图片是对话附件，记进来会把资产页刷满。
 */
export function useImageAttachments(options?: { importSource?: ImportSource; reservedCount?: number; citedFileIds?: readonly string[] }): UseImageAttachmentsResult {
  const importSource = options?.importSource ?? "composer";
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const live=useRef<AttachmentPreview[]>([])
  const leases=useRef(new Map<AttachmentPreview,()=>void>())
  const mounted=useRef(false),generation=useRef(0)
  const dropControllers=useRef(new Set<AbortController>())
  const pendingCount = useRef(0);
  const reservedCount = options?.reservedCount ?? 0;
  const citedFileIds = options?.citedFileIds;
  const disposeLive=useCallback(()=>{
    for(const release of leases.current.values())release()
    leases.current.clear();live.current=[]
    for(const controller of dropControllers.current)controller.abort()
    dropControllers.current.clear()
  },[])

  // 错误 3 秒自动清除
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);

  // Committed resources belong to this mounted hook, not to a React state updater after unmount.
  useEffect(() => {
    mounted.current=true;generation.current++
    const generationRef=generation
    const unsubscribe=onStorageOwnerChange(()=>{generation.current++;disposeLive();if(mounted.current)setAttachments([])})
    return () => {mounted.current=false;generationRef.current++;unsubscribe();disposeLive()};
  }, [disposeLive]);

  /** 检查当前模型是否支持 vision，不支持则设置错误并返回 false。 */
  const checkVisionSupport = useCallback((): boolean => {
    const { selectedModelId, customApiGroups } = useSettings.getState();
    if (modelAcceptsImageInput(selectedModelId, customApiGroups)) return true;
    const info = getModelInfoWithCustom(selectedModelId, customApiGroups);
    setError(`当前模型 ${info?.label ?? selectedModelId} 不支持图片上传`);
    return false;
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0||!mounted.current) return;
      const linked = citedFileIds?.filter(id => !live.current.some(attachment => attachment.cloudFileId === id)).length ?? 0;
      const remaining = MAX_ATTACHMENTS_PER_MESSAGE - live.current.length - pendingCount.current - reservedCount - linked;
      if (files.length > remaining) { setError('单次消息最多添加 9 个附件；发送后可继续上传下一批。'); return; }
      pendingCount.current += files.length;
      setProcessing(true);
      const started=generation.current,owner=getStorageOwner(),epoch=getOwnerEpoch()
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      const otherFiles = files.filter((file) => !file.type.startsWith("image/"));
      const acceptedFiles = imageFiles.length > 0 && !checkVisionSupport() ? otherFiles : files;
      if (acceptedFiles.length === 0) { pendingCount.current -= files.length; setProcessing(pendingCount.current > 0); return; }
      const { attachments: parsedOnes, errors } = await filesToAttachments(acceptedFiles);
      const newOnes: AttachmentPreview[] = [];
      try {
        for (const attachment of parsedOnes) {
          if (!mounted.current || generation.current !== started || getOwnerEpoch() !== epoch) { revokeAttachments([attachment]); continue; }
          try {
            const processed: ProcessedFile = attachment.type === 'document'
              ? { v: 1, text: attachment.text }
              : attachment.type === 'local-file'
                ? { v: 1, text: await extractFileText(attachment.file) }
                : { v: 1, image: { dataUrl: attachment.base64, mimeType: attachment.mimeType } };
            if (!mounted.current || generation.current !== started || getStorageOwner() !== owner || getOwnerEpoch() !== epoch) { revokeAttachments([attachment]); continue; }
            const cloud = await uploadCloudFile(attachment.file, processed);
            newOnes.push({ ...attachment, cloudFileId: cloud.id });
          } catch (failure) { revokeAttachments([attachment]); errors.push(failure instanceof Error ? failure.message : '附件处理或上传失败。'); }
        }
      } finally { pendingCount.current -= files.length; if (mounted.current) setProcessing(pendingCount.current > 0); }
      if(!mounted.current||generation.current!==started||getStorageOwner()!==owner||getOwnerEpoch()!==epoch){revokeAttachments(newOnes);return}
      if (errors.length > 0) setError(errors[0]);
      if (newOnes.length > 0) {
        for(const attachment of newOnes){const url=attachmentObjectUrl(attachment);if(url?.startsWith('blob:'))leases.current.set(attachment,adoptObjectUrl(url).release)}
        live.current=[...live.current,...newOnes];setAttachments(live.current)
      }
      // 本地导入记录：只存路径与元数据，资产页「文件 / 网址」两栏据此显示（不上云）。
      for (const attachment of newOnes) {
        const file = attachment.file;
        if (file.type.startsWith("image/")) continue;
        recordImport({
          kind: "file",
          cloudFileId: attachment.cloudFileId,
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || undefined,
          absPath: localPathOf(file),
          source: importSource,
        });
      }
    },
    [checkVisionSupport, importSource, reservedCount, citedFileIds],
  );

  const remove = useCallback((idx: number) => {
    const attachment=live.current[idx]
    if(!attachment)return
    leases.current.get(attachment)?.();leases.current.delete(attachment)
    live.current=live.current.filter((_,i)=>i!==idx);if(mounted.current)setAttachments(live.current)
  }, []);

  const clear = useCallback(() => {
    generation.current++;disposeLive();if(mounted.current)setAttachments([])
  }, [disposeLive]);

  const toChatFormat = useCallback((): ChatAttachment[] | undefined => {
    if (attachments.length === 0) return undefined;
    return toChatAttachments(attachments);
  }, [attachments]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const images = getImagesFromClipboard(e);
      if (images.length > 0) {
        // 有图片时阻止默认粘贴（避免同时插入图片的文件名文本）
        e.preventDefault();
        void addFiles(images);
        return;
      }
      const pastedText = e.clipboardData.getData("text/plain");
      let characterCount = 0;
      for (const value of pastedText) characterCount += value ? 1 : 0;
      if (characterCount <= LONG_PASTE_DOCUMENT_THRESHOLD) return;
      e.preventDefault();
      if (characterCount > MAX_DOCUMENT_CHARACTERS) {
        setError('粘贴内容超过单文件处理安全上限，请分段添加。');
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = new File([pastedText], `粘贴文本-${stamp}.txt`, { type: "text/plain;charset=utf-8" });
      void addFiles([file]);
      setInfo(`已将 ${characterCount.toLocaleString("zh-CN")} 字粘贴内容转为 TXT 附件`);
    },
    [addFiles],
  );

  const endDrag = useCallback(() => {
    dragCounter.current = 0;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      endDrag();
      const files = getSupportedFilesFromDragEvent(e);
      if (files.length > 0) {
        void addFiles(files);
        return;
      }
      const uriList =
        e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (!uriList) return;
      const urls = uriList
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u && !u.startsWith("#"));
      if (urls.length === 0) return;
      if (!checkVisionSupport()) return;
      void (async () => {
        const started=generation.current,controller=new AbortController();dropControllers.current.add(controller)
        for (const url of urls) {
          if(!mounted.current||generation.current!==started||controller.signal.aborted)break
          try {
            const resp = await fetch(url,{signal:controller.signal});
            if (!resp.ok) continue;
            const blob = await resp.blob();
            if(!mounted.current||generation.current!==started||controller.signal.aborted)break
            if (!blob.type.startsWith("image/")) continue;
            const filename = url.split("/").pop()?.split("?")[0] || "image.jpg";
            const file = new File([blob], filename, { type: blob.type });
            await addFiles([file]);
          } catch {
            if(mounted.current&&generation.current===started&&!controller.signal.aborted)setError("无法获取图片，请检查网络或图片地址");
          }
        }
        dropControllers.current.delete(controller)
      })();
    },
    [addFiles, checkVisionSupport, endDrag],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // 必须 preventDefault 才能触发 drop
    e.preventDefault();
  }, []);

  // 使用 dragenter/dragleave 维护拖拽计数器（解决子元素闪烁问题）
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    processing,
    attachments,
    addFiles,
    remove,
    clear,
    toChatFormat,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    isDragging,
    endDrag,
    error,
    info,
    clearError,
  };
}
