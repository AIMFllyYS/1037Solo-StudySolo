import { normalizeCapabilityEndpoints } from "@/lib/ai/endpoints/capabilityEndpoints";
import { normalizeSelectionAssistantActions } from "@/lib/notes/selection/selectionAssistant";
import { clampMaxToolRounds } from "@/lib/ai/agent/toolRounds";
import { clampTurnBudgetCredits, clampUserMaxOutputTokens } from "@/lib/ai/outputLimits";
import { clampMaxWaitMs } from "@/lib/chat/streaming/createStallWatchdog";
import { normalizeLocale } from "@/lib/i18n/types";
import type { SettingsState, SettingsSet, SettingsGet } from "./types";
import { normalizeThinkingEffort } from "./defaults";
export function createPreferenceActions(set: SettingsSet, get: SettingsGet, save: () => void): Pick<SettingsState, "setDefaultImageModel" | "setImageModeTextModel" | "setImageModeTextModelFallback" | "setCapabilityEndpoints" | "setFontScale" | "setLocale" | "setReduceMotion" | "setCenterTabsAutoHide" | "toggleTool" | "setDefaultThinking" | "setDefaultThinkingEffort" | "setDefaultSearch" | "setArtifactFullscreenTarget" | "setShowRightPanelTabBar" | "setPinChatHeader" | "setGlobalContext" | "setUsdExchangeRate" | "setRecordModelId" | "setFloatingChatModelId" | "setQuizModelId" | "setMaxToolRounds" | "setMaxOutputTokens" | "setTurnBudgetCredits" | "setMaxWaitMs" | "setSelectionAssistantEnabled" | "setSelectionAssistantAction" | "setBlockForeignSelectionAssistants"> {
    return {
        // ── 新版：生图设置 ──────────────────
        setDefaultImageModel: (modelId) => {
            set({ defaultImageModelId: modelId });
            save();
        },
        setImageModeTextModel: (modelId) => {
            set({ imageModeTextModel: modelId });
            save();
        },
        setImageModeTextModelFallback: (modelId) => {
            set({ imageModeTextModelFallback: modelId });
            save();
        },
        setCapabilityEndpoints: (patch) => {
            set((s) => ({
                capabilityEndpoints: normalizeCapabilityEndpoints({ ...s.capabilityEndpoints, ...patch }),
            }));
            save();
        },
        setFontScale: (v) => {
            set({ fontScale: Math.min(1.35, Math.max(0.85, v)) });
            save();
        },
        setLocale: (locale) => {
            set({ locale: normalizeLocale(locale) });
            save();
        },
        setReduceMotion: (v) => {
            set({ reduceMotion: v === true });
            save();
        },
        setCenterTabsAutoHide: (v) => {
            set({ centerTabsAutoHide: v !== false });
            save();
        },
        toggleTool: (name, enabled) => {
            set((s) => ({
                disabledTools: enabled
                    ? s.disabledTools.filter((t) => t !== name)
                    : Array.from(new Set([...s.disabledTools, name])),
            }));
            save();
        },
        setDefaultThinking: (v) => {
            set({ defaultThinking: v });
            save();
        },
        setDefaultThinkingEffort: (v) => {
            set({ defaultThinkingEffort: normalizeThinkingEffort(v) });
            save();
        },
        setDefaultSearch: (v) => {
            set({ defaultSearch: v });
            save();
        },
        setArtifactFullscreenTarget: (v) => {
            set({ artifactFullscreenTarget: v === "viewport" ? "viewport" : "notes" });
            save();
        },
        setShowRightPanelTabBar: (v) => {
            set({ showRightPanelTabBar: v });
            save();
        },
        setPinChatHeader: (v) => {
            set({ pinChatHeader: v });
            save();
        },
        setGlobalContext: (v) => {
            set({ globalContext: v });
            save();
        },
        setUsdExchangeRate: (v) => {
            // 单一真相源：clamp 到 [0.01, 10]，非有限数回退默认 7.00
            const safe = Number.isFinite(v) ? Math.max(0.01, Math.min(10, v)) : 7.00;
            set({ usdExchangeRate: safe });
            save();
        },
        setRecordModelId: (id) => {
            set({ recordModelId: id });
            save();
        },
        setFloatingChatModelId: (id) => {
            set({ floatingChatModelId: id });
            save();
        },
        setQuizModelId: (id) => {
            set({ quizModelId: id });
            save();
        },
        setMaxToolRounds: (v) => {
            set({ maxToolRounds: clampMaxToolRounds(v) });
            save();
        },
        setMaxOutputTokens: (v) => {
            set({ maxOutputTokens: clampUserMaxOutputTokens(v) });
            save();
        },
        setTurnBudgetCredits: (v) => {
            set({ turnBudgetCredits: clampTurnBudgetCredits(v) });
            save();
        },
        setMaxWaitMs: (v) => {
            set({ maxWaitMs: clampMaxWaitMs(v) });
            save();
        },
        setSelectionAssistantEnabled: (v) => {
            set({ selectionAssistantEnabled: v });
            save();
        },
        setSelectionAssistantAction: (action, visible) => {
            set((s) => ({
                selectionAssistantActions: {
                    ...normalizeSelectionAssistantActions(s.selectionAssistantActions),
                    [action]: visible,
                },
            }));
            save();
        },
        setBlockForeignSelectionAssistants: (v) => {
            set({ blockForeignSelectionAssistants: v });
            save();
        }
    };
}
