/**
 * 读设置代理可能写入的计划模式门控。
 * 设置页表单由另一代理维护；字段尚未出现时 UI 自行决定，默认允许、不强制。
 */

export interface PlanModeSettingsSlice {
  planMode?: boolean;
  planModeAllowed?: boolean;
  allowPlanMode?: boolean;
  planModeForced?: boolean;
  forcePlanMode?: boolean;
  agentPlanMode?: {
    allowed?: boolean;
    forced?: boolean;
    defaultOn?: boolean;
  };
}

export interface PlanModeGate {
  /** 设置是否允许打开计划模式。 */
  allowed: boolean;
  /** 设置是否强制本轮走计划模式。 */
  forced: boolean;
  /** 输入框初始是否点亮计划芯片。 */
  defaultOn: boolean;
}

export function readPlanModeGate(settings?: object | null): PlanModeGate {
  const slice = (settings ?? {}) as PlanModeSettingsSlice;
  const nested = slice.agentPlanMode;
  const allowed = (nested?.allowed ?? slice.planModeAllowed ?? slice.allowPlanMode) !== false;
  const forced = nested?.forced === true
    || slice.planModeForced === true
    || slice.forcePlanMode === true;
  const defaultOn = forced || nested?.defaultOn === true || slice.planMode === true;
  return {
    allowed,
    forced: allowed && forced,
    defaultOn: allowed && defaultOn,
  };
}

export function resolvePlanMode(uiOn: boolean, settings?: object | null): boolean {
  const gate = readPlanModeGate(settings);
  if (!gate.allowed) return false;
  if (gate.forced) return true;
  return uiOn;
}
