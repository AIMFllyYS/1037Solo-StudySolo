"use client";

import { useState, useSyncExternalStore } from "react";
import { Plug, Plus } from "lucide-react";
import { useSettings } from "@/lib/stores/settings";
import { isElectronDesktop } from "@/lib/stores/apiSecrets";
import { useT } from "@/lib/i18n";
import { inputCls, labelCls } from "./_shared";
import { ApiGroupCard } from "./_ApiGroupCard";
import { ApiConfigurationRecovery } from './ApiConfigurationRecovery';
import SettingsDisclosure from "./SettingsDisclosure";

export function ApiGroupsSection() {
  const customApiGroups = useSettings((s) => s.customApiGroups);
  const addApiGroup = useSettings((s) => s.addApiGroup);
  const updateApiGroup = useSettings((s) => s.updateApiGroup);
  const removeApiGroup = useSettings((s) => s.removeApiGroup);
  const addModelToGroup = useSettings((s) => s.addModelToGroup);
  const updateModelInGroup = useSettings((s) => s.updateModelInGroup);
  const removeModelFromGroup = useSettings((s) => s.removeModelFromGroup);
  const defaultImageModelId = useSettings((s) => s.defaultImageModelId);
  const setDefaultImageModel = useSettings((s) => s.setDefaultImageModel);
  const t = useT();
  const [customExpanded, setCustomExpanded] = useState(true);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupBaseUrl, setNewGroupBaseUrl] = useState("");
  const [newGroupApiKey, setNewGroupApiKey] = useState("");
  const desktop = useSyncExternalStore(
    () => () => {},
    () => isElectronDesktop(),
    () => false,
  );

  const handleCreateGroup = () => {
    const name = newGroupName.trim() || t("settings.apiGroups.defaultName", { index: customApiGroups.length + 1 });
    addApiGroup({
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      baseUrl: newGroupBaseUrl.trim(),
      apiKey: newGroupApiKey.trim(),
      models: [],
    });
    setNewGroupName("");
    setNewGroupBaseUrl("");
    setNewGroupApiKey("");
    setShowNewGroupForm(false);
  };

  return (
    <SettingsDisclosure expanded={customExpanded} onToggle={() => setCustomExpanded((v) => !v)}
      icon={<Plug size={14} />} title={t("settings.apiGroups.title")}
      meta={t("settings.apiGroups.meta", { count: customApiGroups.length })}>
        <div className="flex flex-col gap-2">
          <ApiConfigurationRecovery />
          <p className="text-[11.5px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            {t("settings.apiGroups.desc")}
          </p>
          <p
            data-testid="api-key-storage-notice"
            className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]"
          >
            {t(desktop ? "settings.apiGroups.keyNoticeDesktop" : "settings.apiGroups.keyNoticeWeb")}
          </p>

          {customApiGroups.map((group) => (
            <ApiGroupCard
              key={group.id}
              group={group}
              defaultImageModelId={defaultImageModelId}
              onUpdate={(patch) => updateApiGroup(group.id, patch)}
              onRemove={() => removeApiGroup(group.id)}
              onAddModel={(m) => addModelToGroup(group.id, m)}
              onUpdateModel={(modelId, m) => updateModelInGroup(group.id, modelId, m)}
              onRemoveModel={(modelId) => removeModelFromGroup(group.id, modelId)}
              onSetDefaultImage={(modelId) => setDefaultImageModel(modelId)}
            />
          ))}

          {showNewGroupForm ? (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-3">
              <span className="text-[12px] font-semibold text-[var(--md-sys-color-on-surface)]">
                {t("settings.apiGroups.newGroup")}
              </span>
              <div>
                <label className={labelCls}>{t("settings.apiGroups.name")}</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t("settings.apiGroups.namePlaceholder")}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t("settings.apiGroups.baseUrl")}</label>
                <input
                  type="url"
                  value={newGroupBaseUrl}
                  onChange={(e) => setNewGroupBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{t("settings.apiGroups.apiKey")}</label>
                <input
                  type="password"
                  value={newGroupApiKey}
                  onChange={(e) => setNewGroupApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateGroup}
                  className="press rounded-lg bg-[var(--md-sys-color-primary)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-primary)]"
                >
                  {t("settings.common.create")}
                </button>
                <button
                  onClick={() => {
                    setShowNewGroupForm(false);
                    setNewGroupName("");
                    setNewGroupBaseUrl("");
                    setNewGroupApiKey("");
                  }}
                  className="press rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-surface-variant)]"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewGroupForm(true)}
              className="press flex items-center gap-1.5 self-start rounded-lg border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-[12px] font-medium text-[var(--md-sys-color-on-surface-variant)]"
            >
              <Plus size={13} /> {t("settings.apiGroups.newGroup")}
            </button>
          )}
        </div>
    </SettingsDisclosure>
  );
}
