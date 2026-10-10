"use client";

import { useState } from "react";
import { BookmarkCheck, MonitorPlay, ImagePlus, PieChart, BookOpen, Globe, FileDigit, FolderTree, Heart, Layers, Sparkles } from "lucide-react";
import { AgentQuizIcon } from "@/components/icons/AgentIcons";
import FileTypeIcon, { resolveFileGlyphKind } from "@/components/icons/file-types/FileTypeIcon";
import PencilSparklesIcon from "@/components/icons/PencilSparklesIcon";
import NotebookFormulaIcon from "@/components/icons/NotebookFormulaIcon";
import type { ManagedWindow } from "@/lib/stores/workspace/windowManager";

export function WindowTypeIcon({
  type,
  icon,
  data,
  size = 15,
}: {
  type: ManagedWindow["type"];
  icon?: string;
  data?: ManagedWindow["data"];
  size?: number;
}) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  if (icon && failedIcon !== icon) {
    return (
      // 动态站点 favicon 不在 next/image 的静态远程域名白名单内。
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        className="rounded-sm object-contain"
        style={{ width: size, height: size }}
        onError={() => setFailedIcon(icon)}
      />
    );
  }
  if (type === "attachment-preview") {
    const attachment = (data ?? {}) as { kind?: string; mimeType?: string; name?: string };
    return (
      <FileTypeIcon
        kind={resolveFileGlyphKind(attachment)}
        mimeType={attachment.mimeType}
        name={attachment.name}
        size={size + 2}
      />
    );
  }
  if (type === "floating-chat") return <PencilSparklesIcon size={size} />;
  if (type === "record-preview") return <BookmarkCheck size={size} />;
  if (type === "image-gen-viewer") return <ImagePlus size={size} />;
  if (type === "billing-dashboard") return <PieChart size={size} />;
  if (type === "membership-sponsor") return <Heart size={size} />;
  if (type === "document-viewer") return <FileDigit size={size} />;
  if (type === "user-note-editor" || type === "user-note-library") return <NotebookFormulaIcon size={size} />;
  if (type === "flashcard-cite-picker") return <Layers size={size} />;
  if (type === "agent-product-picker") return <FileDigit size={size} />;
  if (type === "memory-proposal") return <Sparkles size={size} />;
  if (type === "quiz-explain" || type === "quiz-dock") return <AgentQuizIcon size={size} />;
  if (type === "note-citation-viewer" || type === "source-trace-viewer") return <BookOpen size={size} />;
  if (type === "source-preview") return <Globe size={size} />;
  if (type === "project-files") return <FolderTree size={size} />;
  if (type === "textbook") return <BookOpen size={size} />;
  return <MonitorPlay size={size} />;
}
