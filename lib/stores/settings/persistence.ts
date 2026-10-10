import { backupSettings, normalizeStoredSettings, readSettingsBackup } from '../settingsRecovery';
import { normalizeCustomModelRegistryId, normalizeRegistryId } from "@/lib/ai/models";
import { normalizeCapabilityEndpoints } from "@/lib/ai/capabilityEndpoints";
import { normalizeSelectionAssistantActions } from "@/lib/notes/selectionAssistant";
import { clampMaxToolRounds } from "@/lib/ai/agent/toolRounds";
import { clampTurnBudgetCredits, clampUserMaxOutputTokens } from "@/lib/ai/outputLimits";

import { clampMaxWaitMs } from "@/lib/chat/createStallWatchdog";
import { normalizeLocale } from "@/lib/i18n/types";
import {
  API_SECRETS_LS_KEY,
  applyCapabilitySecrets,
  applyGroupApiKeys,
  decodeDesktopCapabilitySecrets,
  decodeDesktopSecrets,
  encodeWebSecrets,
  extractPlainCapabilityKeys,
  extractPlainGroupKeys,
  getDesktopSecretsBridge,
  splitSettingsSecrets,
  stripCapabilitySecrets,
  stripGroupApiKeys,
  type StoredApiSecrets,
} from "@/lib/stores/apiSecrets";
import type { SettingsState, Persisted } from "./types";
import { DEFAULTS, normalizeThinkingEffort } from "./defaults";
const LS_KEY = "gailvlun-settings-v1";

/** 成功写入本机设置后递增。设置页用它判断 blur 时值是否已 persist。 */
let settingsPersistGeneration = 0;
export function getSettingsPersistGeneration(): number {
  return settingsPersistGeneration;
}

let settingsCanPersist = true;
export function load(): Persisted & { settingsLoadWarning?: string | null } {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    let raw = localStorage.getItem(LS_KEY);
    let recoveredSecrets: string | null | undefined;
    let warning: string | null = null;
    if (raw) {
      try { normalizeStoredSettings(raw); } catch {
        const backup = readSettingsBackup(localStorage);
        if (backup) { settingsCanPersist = false; raw = backup.settings; recoveredSecrets = backup.secrets; warning = '原设置无法读取，已载入本机备份；原始记录未删除。点击恢复本机备份后再保存。'; }
        else { settingsCanPersist = false; return { ...DEFAULTS, settingsLoadWarning: '设置文件无法读取。原始记录已保留，请导入旧配置恢复，勿清空浏览器数据。' }; }
      }
    }
    if (raw) {
      const parsed = { ...DEFAULTS, ...normalizeStoredSettings(raw) } as Persisted;
      // 向后兼容 1：旧版 customModelId 非空但 customModels 为空时，自动迁移
      if (parsed.customModelId && (!parsed.customModels || parsed.customModels.length === 0)) {
        parsed.customModels = [{ id: parsed.customModelId }];
      }
      if (!parsed.customModels) parsed.customModels = [];

      // 向后兼容 2：旧版单组 API → 迁移到 customApiGroups
      if (!parsed.customApiGroups || parsed.customApiGroups.length === 0) {
        const hasOldConfig =
          (parsed.customBaseUrl && parsed.customBaseUrl.trim()) ||
          (parsed.customApiKey && parsed.customApiKey.trim()) ||
          parsed.customModels.length > 0;
        if (hasOldConfig) {
          parsed.customApiGroups = [{
            id: "migrated",
            name: "我的 API",
            baseUrl: parsed.customBaseUrl || "",
            apiKey: parsed.customApiKey || "",
            models: parsed.customModels,
          }];
        } else {
          parsed.customApiGroups = [];
        }
      }
      if (!parsed.defaultImageModelId) parsed.defaultImageModelId = null;
      if (!parsed.imageModeTextModel) parsed.imageModeTextModel = "mimo-v2.6-pro";
      if (!parsed.imageModeTextModelFallback) parsed.imageModeTextModelFallback = "mimo-v2.6-pro";
      parsed.capabilityEndpoints = normalizeCapabilityEndpoints(parsed.capabilityEndpoints);
      if (typeof parsed.usdExchangeRate !== "number" || !Number.isFinite(parsed.usdExchangeRate) || parsed.usdExchangeRate <= 0) {
        parsed.usdExchangeRate = 7.00;
      }
      parsed.defaultThinkingEffort = normalizeThinkingEffort(parsed.defaultThinkingEffort);
      parsed.artifactFullscreenTarget =
        parsed.artifactFullscreenTarget === "viewport" ? "viewport" : "notes";
      parsed.selectedModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.selectedModelId),
        parsed.customApiGroups,
      );
      parsed.defaultImageModelId = parsed.defaultImageModelId
        ? normalizeCustomModelRegistryId(normalizeRegistryId(parsed.defaultImageModelId), parsed.customApiGroups)
        : null;
      parsed.imageModeTextModel = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.imageModeTextModel),
        parsed.customApiGroups,
      );
      parsed.imageModeTextModelFallback = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.imageModeTextModelFallback),
        parsed.customApiGroups,
      );
      // 摘录 / 划词助手模型同样需要归一化，防止旧版自定义模型 ID 迁移后指向失效分组。
      parsed.recordModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.recordModelId || DEFAULTS.recordModelId),
        parsed.customApiGroups,
      );
      parsed.floatingChatModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.floatingChatModelId || DEFAULTS.floatingChatModelId),
        parsed.customApiGroups,
      );
      parsed.quizModelId = normalizeCustomModelRegistryId(
        normalizeRegistryId(parsed.quizModelId || DEFAULTS.quizModelId),
        parsed.customApiGroups,
      );
      parsed.maxToolRounds = clampMaxToolRounds(parsed.maxToolRounds);
      parsed.maxOutputTokens = clampUserMaxOutputTokens(parsed.maxOutputTokens);
      parsed.turnBudgetCredits = clampTurnBudgetCredits(parsed.turnBudgetCredits);
      parsed.maxWaitMs = clampMaxWaitMs(parsed.maxWaitMs);
      parsed.selectionAssistantEnabled = parsed.selectionAssistantEnabled !== false;
      parsed.selectionAssistantActions = normalizeSelectionAssistantActions(parsed.selectionAssistantActions);
      parsed.blockForeignSelectionAssistants = parsed.blockForeignSelectionAssistants === true;
      parsed.showRightPanelTabBar = parsed.showRightPanelTabBar !== false;
      parsed.pinChatHeader = parsed.pinChatHeader === true;
      // 盘上可能是旧版本 / 手改过的语言值，不认识的一律回中文（词典真相源）。
      parsed.locale = normalizeLocale(parsed.locale);
      parsed.reduceMotion = parsed.reduceMotion === true;
      parsed.centerTabsAutoHide = parsed.centerTabsAutoHide !== false;

      let secretsRaw = recoveredSecrets;
      if (secretsRaw === undefined) {
        try { secretsRaw = localStorage.getItem(API_SECRETS_LS_KEY); } catch { settingsCanPersist = false; warning = '分组已保留，但密钥存储暂不可读取。'; }
      }
      if (secretsRaw) {
        try {
          const payload = JSON.parse(secretsRaw);
          if (!payload || payload.v !== 1 || !payload.groups || typeof payload.groups !== 'object') throw new Error('invalid secret store');
        } catch { settingsCanPersist = false; warning = '分组已保留，但旧密钥记录无法解析；已阻止覆盖，请导入备份恢复。'; }
      }
      const split = splitSettingsSecrets(
        parsed.customApiGroups,
        secretsRaw,
        parsed.customApiKey,
        parsed.capabilityEndpoints,
      );
      parsed.customApiGroups = split.groupsForMemory;
      parsed.customApiKey = split.groupsForMemory[0]?.apiKey ?? "";
      parsed.capabilityEndpoints = split.capabilityForMemory;
      let secretsSaved = !split.rewriteSecrets;
      if (split.rewriteSecrets && !warning) {
        backupSettings(localStorage);
        try {
          localStorage.setItem(API_SECRETS_LS_KEY, encodeWebSecrets(split.groupKeys, split.capabilityKeys));
          secretsSaved = true;
        } catch { warning = '密钥迁移暂未完成，旧配置和当前分组已保留；请检查浏览器存储空间。'; }
      }
      if (split.rewriteSettings && secretsSaved && !warning) {
        const disk = {
          ...parsed,
          customApiGroups: stripGroupApiKeys(parsed.customApiGroups),
          customApiKey: "",
          capabilityEndpoints: stripCapabilitySecrets(parsed.capabilityEndpoints),
        };
        try { localStorage.setItem(LS_KEY, JSON.stringify(disk)); }
        catch { warning = '设置暂不可写入，当前分组与旧配置已保留。'; }
      }
      return { ...parsed, settingsLoadWarning: warning };
    }
  } catch {
    settingsCanPersist = false;
    return { ...DEFAULTS, settingsLoadWarning: '本机设置读取失败，已阻止空配置覆盖原记录。请检查浏览器存储权限。' };
  }
  return DEFAULTS;
}

let desktopSecretsReady = false;
function persistSecrets(groupKeys: Record<string, string>, capabilityKeys: Record<string, string>): boolean {
  try {
    localStorage.setItem(API_SECRETS_LS_KEY, encodeWebSecrets(groupKeys, capabilityKeys));
  } catch {
    return false;
  }
  const bridge = getDesktopSecretsBridge();
  if (!bridge || !desktopSecretsReady) return true;
  const payload: StoredApiSecrets = { v: 1, groups: groupKeys, capability: capabilityKeys };
  void bridge.save(payload).catch(() => {});
  return true;
}

export function persist(get: () => SettingsState, set: (partial: Partial<SettingsState>) => void, hydrate: () => void) {
  if (typeof window === "undefined") return;
  // 未水合时 store 里是 DEFAULTS：先补齐盘上配置再落盘（hydrateSettings 是加性合并，不会冲掉已改字段）。
  if (!get().hydrated) hydrate();
  if (!settingsCanPersist) return;
  const s = get();
  // 旧版字段从 customApiGroups[0] 派生，保持向后兼容；密钥不写进 settings JSON。
  const firstGroup = s.customApiGroups[0];
  const groupKeys = extractPlainGroupKeys(s.customApiGroups);
  const capabilityKeys = extractPlainCapabilityKeys(s.capabilityEndpoints);
  backupSettings(localStorage);
  if (!persistSecrets(groupKeys, capabilityKeys)) {
    set({ settingsLoadWarning: '密钥保存失败，原有分组记录未被覆盖；请检查浏览器存储空间。' });
    return;
  }
  const data: Persisted = {
    selectedModelId: s.selectedModelId,
    customApiGroups: stripGroupApiKeys(s.customApiGroups),
    defaultImageModelId: s.defaultImageModelId,
    imageModeTextModel: s.imageModeTextModel,
    imageModeTextModelFallback: s.imageModeTextModelFallback,
    capabilityEndpoints: stripCapabilitySecrets(normalizeCapabilityEndpoints(s.capabilityEndpoints)),
    recordModelId: s.recordModelId,
    floatingChatModelId: s.floatingChatModelId,
    quizModelId: s.quizModelId,
    maxToolRounds: clampMaxToolRounds(s.maxToolRounds),
    maxOutputTokens: clampUserMaxOutputTokens(s.maxOutputTokens),
    turnBudgetCredits: clampTurnBudgetCredits(s.turnBudgetCredits),
    maxWaitMs: clampMaxWaitMs(s.maxWaitMs),
    selectionAssistantEnabled: s.selectionAssistantEnabled !== false,
    selectionAssistantActions: normalizeSelectionAssistantActions(s.selectionAssistantActions),
    blockForeignSelectionAssistants: s.blockForeignSelectionAssistants === true,
    customBaseUrl: firstGroup?.baseUrl ?? "",
    customApiKey: "",
    customModelId: "",
    customModels: firstGroup?.models ?? [],
    fontScale: s.fontScale,
    disabledTools: s.disabledTools,
    defaultThinking: s.defaultThinking,
    defaultThinkingEffort: s.defaultThinkingEffort,
    defaultSearch: s.defaultSearch,
    artifactFullscreenTarget: s.artifactFullscreenTarget,
    showRightPanelTabBar: s.showRightPanelTabBar !== false,
    pinChatHeader: s.pinChatHeader === true,
    globalContext: s.globalContext,
    usdExchangeRate: s.usdExchangeRate,
    locale: normalizeLocale(s.locale),
    reduceMotion: s.reduceMotion === true,
    centerTabsAutoHide: s.centerTabsAutoHide !== false,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    settingsPersistGeneration += 1;
  } catch {
    set({ settingsLoadWarning: '当前配置尚未保存成功，请检查存储空间后重试。' });
  }
}

export function hydrateDesktopSecrets(
  set: (partial: Partial<SettingsState> | ((s: SettingsState) => Partial<SettingsState>)) => void,
  get: () => SettingsState,
) {
  const bridge = getDesktopSecretsBridge();
  if (!bridge) return;
  const initialGroups = extractPlainGroupKeys(get().customApiGroups);
  const initialCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
  void (async () => {
    try {
      const stored = await bridge.load();
      const desktopKeys = decodeDesktopSecrets(stored);
      const desktopCapability = decodeDesktopCapabilitySecrets(stored);
      const currentGroups = extractPlainGroupKeys(get().customApiGroups);
      const liveCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
      for (const id of Object.keys(desktopKeys)) if (currentGroups[id] !== initialGroups[id]) delete desktopKeys[id];
      for (const id of Object.keys(desktopCapability)) if (liveCapability[id] !== initialCapability[id]) delete desktopCapability[id];
      desktopSecretsReady = true;
      const hasDesktopGroups = Object.keys(desktopKeys).length > 0;
      const hasDesktopCapability = Object.keys(desktopCapability).length > 0;
      if (hasDesktopGroups || hasDesktopCapability) {
        set((s) => {
          const nextGroups = hasDesktopGroups
            ? applyGroupApiKeys(s.customApiGroups, { ...desktopKeys, ...extractPlainGroupKeys(s.customApiGroups) })
            : s.customApiGroups;
          const nextCapability = hasDesktopCapability
            ? applyCapabilitySecrets(
              s.capabilityEndpoints,
              { ...desktopCapability, ...extractPlainCapabilityKeys(s.capabilityEndpoints) },
            )
            : s.capabilityEndpoints;
          return {
            customApiGroups: nextGroups,
            customApiKey: nextGroups[0]?.apiKey ?? "",
            capabilityEndpoints: nextCapability,
          };
        });
        const memoryGroups = extractPlainGroupKeys(get().customApiGroups);
        const memoryCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
        const backfillGroups = !hasDesktopGroups && Object.keys(memoryGroups).length > 0;
        const backfillCapability = !hasDesktopCapability && Object.keys(memoryCapability).length > 0;
        if (backfillGroups || backfillCapability) {
          await bridge.save({
            v: 1,
            groups: hasDesktopGroups ? desktopKeys : memoryGroups,
            capability: hasDesktopCapability ? desktopCapability : memoryCapability,
          });
        }
        return;
      }
      const current = extractPlainGroupKeys(get().customApiGroups);
      const currentCapability = extractPlainCapabilityKeys(get().capabilityEndpoints);
      if (Object.keys(current).length > 0 || Object.keys(currentCapability).length > 0) {
        await bridge.save({ v: 1, groups: current, capability: currentCapability });
      }
    } catch {
      /* ignore */
    }
  })();
}
export function enableSettingsPersistence(): void { settingsCanPersist = true; }
