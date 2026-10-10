"use client";

import { useCallback } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import ChatSettings from "@/components/chat/ChatSettings";
import { useStore } from "@/lib/stores/ui";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { scaleInVariants } from "@/lib/motion";
import { useT } from "@/lib/i18n/index";

/**
 * 页面正中的 Agent 设置层：复用现有 ChatSettings 工作区，不走 ManagedWindow。
 * 左下角入口与 AI 助教「设置」共用这一层和同一份 settings store。
 * 手机铺满全屏，分类改顶部 Tab；桌面仍是居中对话框 + 左侧导航。
 */
export default function AgentSettingsOverlay() {
  const open = useStore((s) => s.agentSettingsOpen);
  const closeAgentSettings = useStore((s) => s.closeAgentSettings);
  const onClose = useCallback(() => closeAgentSettings(), [closeAgentSettings]);
  const isMobile = useIsMobile();
  const t = useT();

  // portal 常驻挂载：退出动画要靠 AnimatePresence 在 open 翻 false 之后的那一帧播放。
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className={clsx("agent-settings-overlay", isMobile && "agent-settings-overlay--mobile")}
          data-testid="agent-settings-overlay"
          data-layout={isMobile ? "mobile" : "desktop"}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            variants={scaleInVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={clsx("agent-settings-dialog", isMobile && "agent-settings-dialog--mobile")}
            role="dialog"
            aria-modal="true"
            aria-label={t("settings.overlay.aria")}
          >
            <ChatSettings onClose={onClose} navPlacement={isMobile ? "top" : "side"} />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
