import { mergeApiGroups } from '../settingsRecovery';
import { normalizeCustomModelRegistryId, normalizeRegistryId } from "@/lib/ai/models";
import type { SettingsState, SettingsSet, SettingsGet } from "./types";
import { enableSettingsPersistence } from "./persistence";
export function createApiActions(set: SettingsSet, get: SettingsGet, save: () => void): Pick<SettingsState, "importApiConfiguration" | "setSelectedModelId" | "addApiGroup" | "updateApiGroup" | "removeApiGroup" | "addModelToGroup" | "updateModelInGroup" | "removeModelFromGroup" | "setCustomProvider" | "addCustomModel" | "updateCustomModel" | "removeCustomModel"> {
    return {
        importApiConfiguration: (groups, selectedModelId) => {
            enableSettingsPersistence();
            set((s) => {
                const merged = mergeApiGroups(s.customApiGroups, groups);
                return { customApiGroups: merged, settingsLoadWarning: null,
                    selectedModelId: selectedModelId ? normalizeCustomModelRegistryId(normalizeRegistryId(selectedModelId), merged) : s.selectedModelId };
            });
            save();
        },
        setSelectedModelId: (id) => {
            set({ selectedModelId: id });
            save();
        },
        // ── 新版：API 分组管理 ──────────────
        addApiGroup: (group) => {
            set((s) => ({ customApiGroups: [...s.customApiGroups, group] }));
            save();
        },
        updateApiGroup: (id, patch) => {
            set((s) => ({
                customApiGroups: s.customApiGroups.map((g) => g.id === id ? { ...g, ...patch } : g),
            }));
            save();
        },
        removeApiGroup: (id) => {
            set((s) => ({
                customApiGroups: s.customApiGroups.filter((g) => g.id !== id),
            }));
            save();
        },
        addModelToGroup: (groupId, model) => {
            set((s) => ({
                customApiGroups: s.customApiGroups.map((g) => g.id === groupId
                    ? { ...g, models: [...g.models.filter((m) => m.id !== model.id), model] }
                    : g),
            }));
            save();
        },
        updateModelInGroup: (groupId, modelId, model) => {
            set((s) => ({
                customApiGroups: s.customApiGroups.map((g) => g.id === groupId
                    ? { ...g, models: g.models.map((m) => (m.id === modelId ? model : m)) }
                    : g),
            }));
            save();
        },
        removeModelFromGroup: (groupId, modelId) => {
            set((s) => ({
                customApiGroups: s.customApiGroups.map((g) => g.id === groupId
                    ? { ...g, models: g.models.filter((m) => m.id !== modelId) }
                    : g),
            }));
            save();
        },
        // ── 旧版 Actions（@deprecated，操作 customApiGroups[0]）──
        setCustomProvider: (p) => {
            set((s) => {
                const groups = [...s.customApiGroups];
                if (groups.length === 0) {
                    groups.push({ id: "migrated", name: "我的 API", baseUrl: "", apiKey: "", models: [] });
                }
                if (p.baseUrl !== undefined)
                    groups[0] = { ...groups[0], baseUrl: p.baseUrl };
                if (p.apiKey !== undefined)
                    groups[0] = { ...groups[0], apiKey: p.apiKey };
                return { customApiGroups: groups };
            });
            save();
        },
        addCustomModel: (model) => {
            set((s) => {
                const groups = [...s.customApiGroups];
                if (groups.length === 0) {
                    groups.push({ id: "migrated", name: "我的 API", baseUrl: "", apiKey: "", models: [] });
                }
                groups[0] = {
                    ...groups[0],
                    models: [...groups[0].models.filter((m) => m.id !== model.id), model],
                };
                return { customApiGroups: groups };
            });
            save();
        },
        updateCustomModel: (id, model) => {
            set((s) => {
                const groups = [...s.customApiGroups];
                if (groups.length === 0)
                    return s;
                groups[0] = {
                    ...groups[0],
                    models: groups[0].models.map((m) => (m.id === id ? model : m)),
                };
                return { customApiGroups: groups };
            });
            save();
        },
        removeCustomModel: (id) => {
            set((s) => {
                const groups = [...s.customApiGroups];
                if (groups.length === 0)
                    return s;
                groups[0] = {
                    ...groups[0],
                    models: groups[0].models.filter((m) => m.id !== id),
                };
                return { customApiGroups: groups };
            });
            save();
        }
    };
}
