"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useStore } from "@/lib/stores/ui";
import { useAuthSession } from "@/lib/hooks/auth/useAuthSession";
import LoginForm from "./LoginForm";

export default function LoginOverlay() {
  const open = useStore((s) => s.loginOverlayOpen);
  const openLoginOverlay = useStore((s) => s.openLoginOverlay);
  const closeLoginOverlay = useStore((s) => s.closeLoginOverlay);
  const { needsNewPassword } = useAuthSession();
  const onClose = useCallback(() => closeLoginOverlay(), [closeLoginOverlay]);

  useEffect(() => {
    if (needsNewPassword) openLoginOverlay();
  }, [needsNewPassword, openLoginOverlay]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="auth-overlay login-overlay"
      data-testid="login-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="auth-window login-dialog" role="dialog" aria-modal="true" aria-label="登录 StudySolo">
        <div className="auth-titlebar">
          <div className="auth-titlebar-lights">
            <button
              type="button"
              className="auth-light"
              data-tone="close"
              aria-label="关闭登录"
              title="关闭"
              onClick={onClose}
            >
              <X size={9} strokeWidth={3} />
            </button>
            <span className="auth-light" data-tone="min" aria-hidden="true" />
            <span className="auth-light" data-tone="zoom" aria-hidden="true" />
          </div>
          <div className="auth-titlebar-title">登录 StudySolo</div>
        </div>
        <LoginForm />
      </div>
    </div>,
    document.body,
  );
}
