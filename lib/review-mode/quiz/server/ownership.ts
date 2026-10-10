import type { NextRequest } from "next/server";

import { accountBackendUrl, authModeForRequest } from "@/lib/auth/authMode";
import { extractAccessToken } from "@/lib/auth/sessionCookie";
import { failureStatus, verifyAccount } from "@/lib/auth/sign-in/account-verify";

import { ReviewQuizError } from "./errors";
import { uuid } from "./request";
export async function liveOwner(request: NextRequest): Promise<string> {
  const verified = await verifyAccount(extractAccessToken(request.headers), {
    accountBackendUrl: accountBackendUrl(authModeForRequest(request)),
    live: true,
  });
  if (verified.kind !== "ok") {
    throw new ReviewQuizError(failureStatus(verified), verified.kind === "unavailable" ? "ACCOUNT_UNAVAILABLE" : verified.code);
  }
  if (verified.identity.mfa_required) throw new ReviewQuizError(403, "MFA_REQUIRED");
  if (!uuid.safeParse(verified.identity.user_id).success) throw new ReviewQuizError(503, "ACCOUNT_ID_INVALID");
  return verified.identity.user_id;
}