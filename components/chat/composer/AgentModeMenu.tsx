"use client";

import { useEffect } from "react";
import { ChevronDown, ShieldCheck, Zap, Check } from "lucide-react";
import AnchoredMenu from "@/components/ui/AnchoredMenu";
import { hydrateAgentApprovalMode, useAgentApproval } from "@/lib/stores/agentApprovalMode";
import { useT } from "@/lib/i18n";

/** 执行模式选项本体：独立导出以便 ⋯ 溢出面板平铺复用（嵌套 AnchoredMenu 会被外侧 pointerdown 关闭）。 */
export function AgentModeMenuItems({ onPicked }: { onPicked?: () => void }) {
  const t = useT();
  const mode = useAgentApproval((s) => s.mode);
  const setMode = useAgentApproval((s) => s.setMode);
  useEffect(() => {
    hydrateAgentApprovalMode();
  }, []);
  return (
    <>
      <div className="app-menu-heading">{t("menu.chatInput.mode.heading")}</div>
      {(["ask", "auto"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="menuitemradio"
          aria-checked={mode === value}
          data-testid={`agent-mode-${value}`}
          className="app-menu-item"
          onClick={() => {
            setMode(value);
            onPicked?.();
          }}
        >
          <span className="app-menu-check">{value === "auto" ? <Zap size={13} /> : <ShieldCheck size={13} />}</span>
          <span>
            {t(`menu.chatInput.mode.${value}`)}
            <small>{t(`menu.chatInput.mode.${value}Hint`)}</small>
          </span>
          {mode === value && <Check size={12} />}
        </button>
      ))}
      <div className="app-menu-heading">{t("menu.chatInput.mode.autoNote")}</div>
    </>
  );
}

/** 输入框工具条里的「执行模式」：询问模式 / 完全同意模式。 */
export default function AgentModeMenu({ disabled = false }: { disabled?: boolean }) {
  const t = useT();
  const mode = useAgentApproval((s) => s.mode);
  const auto = mode === "auto";
  return (
    <AnchoredMenu
      label={t("menu.chatInput.mode.aria")}
      placement="top"
      width={286}
      disabled={disabled}
      className={`chat-input-toggle chat-input-mode${auto ? " chat-input-mode-auto" : ""}`}
      trigger={
        <>
          {auto ? <Zap size={12} aria-hidden /> : <ShieldCheck size={12} aria-hidden />}
          <span className="chat-input-toggle-text">{auto ? t("menu.chatInput.mode.auto") : t("menu.chatInput.mode.ask")}</span>
          <ChevronDown size={11} aria-hidden />
        </>
      }
    >
      {(close) => <AgentModeMenuItems onPicked={close} />}
    </AnchoredMenu>
  );
}
