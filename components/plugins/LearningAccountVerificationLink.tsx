"use client";

import { accountOrigin } from "@/lib/auth/browser/account";
import { useT } from "@/lib/i18n";

/** Account owns verification. Return only to a fixed market or Agent surface. */
export default function LearningAccountVerificationLink({ code, returnPath = "/agent/plugins", includeSignIn = false }: { code?: string | null; returnPath?: string; includeSignIn?: boolean }) {
  const t = useT();
  if (typeof window === "undefined") return null;
  const needsSignIn = includeSignIn && ["SIGN_IN_REQUIRED", "SESSION_MISSING", "SESSION_INVALID", "SESSION_EXPIRED"].includes(code ?? "");
  if (code !== "MFA_REQUIRED" && code !== "REAUTH_REQUIRED" && !needsSignIn) return null;
  const safePath = returnPath === "/agent/plugins" || returnPath === "/agent" || /^\/c\/[A-Za-z0-9_.:%-]{1,200}$/.test(returnPath) ? returnPath : "/agent/plugins";
  const returnTo = new URL(safePath, window.location.origin).toString();
  const href = new URL(code === "REAUTH_REQUIRED" ? "/reverify" : "/login", accountOrigin());
  if (code === "MFA_REQUIRED") { href.searchParams.set("step", "verify"); href.searchParams.set("redirect", returnTo); }
  else href.searchParams.set(code === "REAUTH_REQUIRED" ? "next" : "redirect", returnTo);
  return <a href={href.toString()} data-testid="connector-account-verification" data-solo-sign-in="page" className="ml-2 text-[var(--accent)] underline">{t("trace.tool.learningConnectors.verifyAccount")}</a>;
}
