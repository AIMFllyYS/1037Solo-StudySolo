"use client";

import { AgentCloseIcon, AgentFileIcon } from "@/components/icons/AgentIcons";
import {
  isForcedComposerTool,
  type AttachedFileRef,
  type ComposerForcedTool,
} from "@/lib/chat/composer/composerIntent";
import { useT } from "@/lib/i18n";
import { ForcedToolIcon, PlanModeIcon } from "./ComposerIcons";

export default function ComposerChips({
  planMode,
  forcedTool,
  forcedSkillName,
  attachedFiles,
  onClearPlan,
  onClearTool,
  onRemoveFile,
}: {
  planMode: boolean;
  forcedTool?: ComposerForcedTool;
  forcedSkillName?: string;
  attachedFiles: AttachedFileRef[];
  onClearPlan: () => void;
  onClearTool: () => void;
  onRemoveFile: (path: string) => void;
}) {
  const t = useT();
  if (!planMode && !forcedTool && attachedFiles.length === 0) return null;
  return (
    <div className="composer-chips" data-testid="composer-chips">
      {planMode ? (
        <span className="composer-chip composer-chip-plan" data-testid="composer-chip-plan">
          <PlanModeIcon />
          <span>{t("menu.composer.plan")}</span>
          <button type="button" aria-label={t("menu.composer.clearPlan")} onClick={onClearPlan}>
            <AgentCloseIcon size={12} />
          </button>
        </span>
      ) : null}
      {forcedTool ? (
        <span className="composer-chip composer-chip-tool" data-testid="composer-chip-tool">
          {isForcedComposerTool(forcedTool) ? <ForcedToolIcon tool={forcedTool} /> : null}
          <span>
            {isForcedComposerTool(forcedTool) ? t(`menu.composer.tool.${forcedTool}`) : (forcedSkillName || t("menu.composer.skill"))}
          </span>
          <button type="button" aria-label={t("menu.composer.clearTool")} onClick={onClearTool}>
            <AgentCloseIcon size={12} />
          </button>
        </span>
      ) : null}
      {attachedFiles.map((file) => (
        <span key={file.path} className="composer-chip composer-chip-file" data-testid="composer-chip-file" title={file.address}>
          <AgentFileIcon size={14} />
          <span>{file.title}</span>
          <button type="button" aria-label={t("menu.composer.removeFile", { title: file.title })} onClick={() => onRemoveFile(file.path)}>
            <AgentCloseIcon size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
