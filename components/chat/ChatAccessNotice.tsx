"use client";

import { LogIn, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function ChatAccessNotice({
  status,
  onOpenLogin,
  onClose,
}: {
  status: "signedOut" | "checking" | "ownerChanged";
  onOpenLogin?: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const signedOut = status === "signedOut";

  return (
    <section
      data-testid="chat-access-notice"
      className="mx-auto my-auto flex max-w-[420px] flex-col items-center gap-3 px-6 py-8 text-center"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--ink-soft)]">
        {signedOut ? <LogIn size={19} /> : <ShieldCheck size={19} />}
      </div>
      <div>
        <h2 className="text-[14px] font-semibold text-[var(--ink)]">
          {t(status === "signedOut" ? "menu.chatInput.access.signedOutTitle" : status === "ownerChanged" ? "menu.chatInput.access.ownerChangedTitle" : "menu.chatInput.access.checkingTitle")}
        </h2>
        <p role="status" aria-live="polite" className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">
          {t(status === "signedOut" ? "menu.chatInput.access.signedOutBody" : status === "ownerChanged" ? "menu.chatInput.access.ownerChangedBody" : "menu.chatInput.access.checkingBody")}
        </p>
      </div>
      {signedOut && onOpenLogin ? (
        <button
          type="button"
          onClick={onOpenLogin}
          className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-[12.5px] font-medium text-[var(--md-sys-color-on-primary)]"
        >
          {t("menu.chatInput.access.signIn")}
        </button>
      ) : null}
      {status === "ownerChanged" && onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="press inline-flex h-9 items-center rounded-full border border-[var(--line)] px-4 text-[12.5px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]"
        >
          {t("menu.chatInput.access.closeWindow")}
        </button>
      ) : null}
    </section>
  );
}
