"use client";

import type { AttachedFileRef } from "@/lib/chat/composer/composerIntent";
import { flattenFileMentions, type FileMentionGroup } from "@/lib/chat/attachments/fileMentions";
import { AgentFileIcon } from "@/components/icons/AgentIcons";
import { useT, type Translate } from "@/lib/i18n";

/** fileMentions 给出的分组名 → 词典 key；未知分组原样显示，避免把 key 漏到界面上。 */
const GROUP_LABEL_KEYS: Record<string, string> = {
  "当前页附近": "menu.fileMention.group.nearby",
  "父层级": "menu.fileMention.group.parent",
  "匹配的笔记": "menu.fileMention.group.matched",
};

function groupLabel(t: Translate, label: string): string {
  const key = GROUP_LABEL_KEYS[label];
  return key ? t(key) : label;
}

export interface FileMentionMenuProps {
  groups: FileMentionGroup[];
  activeIndex?: number;
  onSelect: (file: AttachedFileRef) => void;
}

export default function FileMentionMenu({ groups, activeIndex = 0, onSelect }: FileMentionMenuProps) {
  const t = useT();
  const flat = flattenFileMentions(groups);
  const selectedPath = flat[activeIndex]?.path;
  return (
    <div className="file-mention-menu" data-testid="file-mention-menu" role="listbox" aria-label={t("menu.fileMention.aria")}>
      {groups.map((group) => (
        <div key={group.id}>
          <div className="app-menu-heading">{groupLabel(t, group.label)}</div>
          {group.items.map((item) => {
            return (
              <button
                key={item.path}
                type="button"
                role="option"
                aria-selected={item.path === selectedPath}
                className="app-menu-item"
                onClick={() => onSelect(item)}
              >
                <span className="app-menu-check"><AgentFileIcon size={14} /></span>
                <span>
                  {item.title}
                  <small>{item.address}</small>
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {flat.length === 0 ? <div className="app-menu-heading">{t("menu.fileMention.empty")}</div> : null}
    </div>
  );
}
