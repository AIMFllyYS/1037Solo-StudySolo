"use client";

import { accountOrigin } from "@/lib/auth/account";
import { useT } from "@/lib/i18n";

/** Account owns verification. Return only to this app's fixed market route. */
export default function LearningAccountVerificationLink({ code }: { code?: string | null }) {
  const t = useT();
  if ((code !== "MFA_REQUIRED" && code !== "REAUTH_REQUIRED") || typeof window === "undefined") return null;
  const returnTo = new URL("/agent/plugins", window.location.origin).toString();
  const href = new URL(code === "REAUTH_REQUIRED" ? "/reverify" : "/login", accountOrigin());
  if (code === "MFA_REQUIRED") { href.searchParams.set("step", "verify"); href.searchParams.set("redirect", returnTo); }
  else href.searchParams.set("next", returnTo);
  return <a href={href.toString()} data-testid="connector-account-verification" data-solo-sign-in="page" className="ml-2 text-[var(--accent)] underline">{t("trace.tool.learningConnectors.verifyAccount")}</a>;
}
