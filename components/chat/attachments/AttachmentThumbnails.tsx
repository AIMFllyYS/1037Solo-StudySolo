"use client";

import React, { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import type { AttachmentPreview, ImageAttachmentPreview } from "@/lib/ai/imageUtils";
import type { StoredChatAttachment } from "@/lib/types/chat";
import { isAttachmentRef } from "@/lib/types/chat";
import { loadBlobDataUrl } from "@/lib/storage/chatStorage";
import { attachmentPreviewKind } from "@/lib/chat/attachmentPreviewKind";
import { openAttachmentPreview } from "@/lib/chat/openAttachmentPreview";
import { useT } from "@/lib/i18n/index";
import { readCloudFileContext } from '@/lib/files/client';
import { getOwnerEpoch } from '@/lib/storage/ownerScope';

interface AttachmentThumbnailsProps {
  previews?: AttachmentPreview[];
  onRemove?: (idx: number) => void;
  readonlyAttachments?: StoredChatAttachment[];
  size?: number;
  clickable?: boolean;
  /** 输入区使用紧凑横向搁板；历史消息使用可换行展示。 */
  embedded?: boolean;
}

function formatSize(size?: number): string {
  if (size == null || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function typeLabel(name: string | undefined, mimeType: string): string {
  const extension = name?.split(".").pop()?.toUpperCase();
  if (extension === "MARKDOWN") return "MD";
  if (extension === "HTM") return "HTML";
  if (extension === "YML") return "YAML";
  if (extension) return extension;
  if (mimeType === "text/markdown") return "MD";
  if (mimeType.includes("wordprocessingml")) return "DOCX";
  return "TXT";
}

function previewKind(name: string | undefined, mimeType: string) {
  return attachmentPreviewKind({ name, mimeType });
}

function isImagePreview(attachment: AttachmentPreview): attachment is ImageAttachmentPreview {
  return attachment.type !== "document" && attachment.type !== "local-file";
}

function openPreviewItem(attachment: AttachmentPreview, key: string) {
  const name = isImagePreview(attachment) ? attachment.file.name : attachment.name;
  const content = isImagePreview(attachment)
    ? attachment.base64
    : attachment.type === "local-file"
      ? attachment.dataUrl
      : attachment.previewUrl || attachment.text;
  openAttachmentPreview(key, {
    name,
    mimeType: attachment.mimeType,
    kind: previewKind(name, attachment.mimeType),
    content,
    file: attachment.file,
  });
}

async function openStoredPreview(attachment: StoredChatAttachment, key: string, fallbackName: string) {
  const name = attachment.name ?? fallbackName;
  if (attachment.cloudFileId) {
    const epoch = getOwnerEpoch();
    const response = await fetch(`/api/files/${attachment.cloudFileId}`, { credentials: 'include' });
    if (!response.ok) return;
    const file = new File([await response.blob()], name, { type: attachment.mimeType });
    if (getOwnerEpoch() !== epoch) return;
    // 云端附件拿到了原件二进制：文本类读原文，二进制类交给预览窗自建 object URL
    // （content 的 'blob:' 前缀触发 useObjectUrl），不再渲染给 AI 用的抽取文本。
    const kindNow = previewKind(name, attachment.mimeType);
    const content = kindNow === 'html' || kindNow === 'markdown' || kindNow === 'text'
      ? await file.text()
      : 'blob:cloud';
    if (getOwnerEpoch() !== epoch) return;
    openAttachmentPreview(key, { name, mimeType: attachment.mimeType, kind: kindNow, content, file });
    return;
  }
  const content = isAttachmentRef(attachment)
    ? await loadBlobDataUrl(attachment.id)
    : attachment.type === "image"
      ? attachment.base64
      : attachment.type === "local-file"
        ? attachment.dataUrl
        : attachment.text;
  if (!content) return;
  openAttachmentPreview(key, {
    name,
    mimeType: attachment.mimeType,
    kind: previewKind(name, attachment.mimeType),
    content,
  });
}

function ReadonlyImage({ attachment }: { attachment: StoredChatAttachment }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(() => {
    if (attachment.type !== "image" || isAttachmentRef(attachment)) return null;
    return attachment.base64;
  });

  useEffect(() => {
    if (attachment.type !== "image" || !isAttachmentRef(attachment)) return;
    let cancelled = false;
    void (attachment.cloudFileId ? readCloudFileContext(attachment.cloudFileId).then(file => file.image?.dataUrl ?? null) : loadBlobDataUrl(attachment.id)).then((url) => {
      if (!cancelled && url) setSrc(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [attachment]);

  if (!src) return <span className="chat-attachment-image-placeholder" aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- IndexedDB blob/data URLs are not supported by next/image.
    <img src={src} alt={attachment.name ?? t("window.attachment.uploadedImage")} className="chat-attachment-image" />
  );
}

function DocumentCard({ name, mimeType, size, characterCount }: {
  name: string;
  mimeType: string;
  size?: number;
  characterCount?: number;
}) {
  const t = useT();
  const detail = characterCount != null
    ? t("window.attachment.charCount", { count: characterCount.toLocaleString("zh-CN") })
    : formatSize(size);
  return (
    <span className="chat-attachment-document">
      <span className="chat-attachment-document-icon" aria-hidden="true"><FileText size={17} /></span>
      <span className="chat-attachment-document-copy">
        <span className="chat-attachment-name" title={name}>{name}</span>
        <span className="chat-attachment-meta">
          <span>{typeLabel(name, mimeType)}</span>
          {detail ? <><span aria-hidden="true">·</span><span>{detail}</span></> : null}
        </span>
      </span>
    </span>
  );
}

export default function AttachmentThumbnails({
  previews,
  onRemove,
  readonlyAttachments,
  size = 56,
  clickable = true,
  embedded = false,
}: AttachmentThumbnailsProps) {
  const t = useT();
  const previewItems = previews ?? [];
  const readonlyItems = readonlyAttachments ?? [];
  if (previewItems.length === 0 && readonlyItems.length === 0) return null;

  return (
    <div
      className={`chat-attachment-shelf ${embedded ? "chat-attachment-shelf-embedded" : ""}`}
      style={{ ["--attachment-size" as string]: `${size}px` } as React.CSSProperties}
      aria-label={t("window.attachment.shelf")}
    >
      {previewItems.map((attachment, index) => {
        const name = isImagePreview(attachment) ? attachment.file.name : attachment.name;
        const key = `composer:${name}:${attachment.file.lastModified}:${attachment.file.size}:${index}`;
        return (
          <span className="chat-attachment-item" key={`${name}:${index}`}>
            <button
              type="button"
              className={`chat-attachment-preview-trigger ${clickable ? "chat-attachment-clickable" : ""}`}
              onClick={() => openPreviewItem(attachment, key)}
              aria-label={t("window.attachment.previewAttachment", { name })}
              title={t("window.attachment.preview", { name })}
              disabled={!clickable}
            >
              {!isImagePreview(attachment) ? (
                <DocumentCard {...attachment} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview.
                <img src={attachment.previewUrl} alt={name} className="chat-attachment-image" />
              )}
            </button>
            {onRemove ? (
              <button type="button" className="chat-attachment-remove" onClick={() => onRemove(index)} aria-label={t("window.attachment.removeAttachment", { name })}>
                <X size={11} />
              </button>
            ) : null}
          </span>
        );
      })}
      {readonlyItems.map((attachment, index) => {
        const key = isAttachmentRef(attachment) ? attachment.id : `${attachment.type}:${attachment.name ?? index}`;
        const name = attachment.name ?? t("window.attachment.untitled");
        return (
          <span className="chat-attachment-item" key={key}>
            <button
              type="button"
              className={`chat-attachment-preview-trigger ${clickable ? "chat-attachment-clickable" : ""}`}
              onClick={() => { void openStoredPreview(attachment, `stored:${key}`, t("window.attachment.untitled")); }}
              aria-label={t("window.attachment.previewAttachment", { name })}
              title={t("window.attachment.preview", { name })}
              disabled={!clickable}
            >
              {attachment.type !== "image" ? (
                <DocumentCard
                  name={attachment.name ?? t("window.attachment.untitledDocument")}
                  mimeType={attachment.mimeType}
                  size={attachment.size}
                  characterCount={'characterCount' in attachment ? attachment.characterCount : undefined}
                />
              ) : <ReadonlyImage attachment={attachment} />}
            </button>
          </span>
        );
      })}
    </div>
  );
}
