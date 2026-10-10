/**
 * Email OTP sign-in helpers. Expiry and resend throttle are the values
 * written to GoTrue via Management API (`mailer_otp_exp`, `smtp_max_frequency`).
 */

import { sessionAccessToken } from './sessionCookie';

export const EMAIL_OTP_EXPIRY_SECONDS = 600;
export const EMAIL_OTP_RESEND_INTERVAL_SECONDS = 60;
export const EMAIL_OTP_TYPE = "email" as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthOtpClient {
  auth: {
    signInWithOtp: (opts: {
      email: string;
      options?: { shouldCreateUser?: boolean };
    }) => Promise<{ error: { message: string } | null }>;
    verifyOtp: (opts: {
      email: string;
      token: string;
      type: typeof EMAIL_OTP_TYPE;
    }) => Promise<{
      data: { user: unknown; session: unknown };
      error: { message: string } | null;
    }>;
  };
}

export type OtpFailureCode = "invalid_email" | "invalid_token" | "auth_error";

export type OtpRequestResult =
  | { ok: true; email: string }
  | { ok: false; code: OtpFailureCode; message: string };

export type OtpVerifyResult =
  | { ok: true; email: string; user: unknown; session: unknown }
  | { ok: false; code: OtpFailureCode; message: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function canResendEmailOtp(lastSentAtMs: number, nowMs: number): boolean {
  return nowMs - lastSentAtMs >= EMAIL_OTP_RESEND_INTERVAL_SECONDS * 1000;
}

export function otpExpiresAtMs(sentAtMs: number): number {
  return sentAtMs + EMAIL_OTP_EXPIRY_SECONDS * 1000;
}

export function isEmailOtpExpired(sentAtMs: number, nowMs: number): boolean {
  return nowMs >= otpExpiresAtMs(sentAtMs);
}

function authErrorCode(message: string, fallback: OtpFailureCode): OtpFailureCode {
  const lower = message.toLowerCase();
  if (lower.includes("invalid") && (lower.includes("otp") || lower.includes("token"))) {
    return "invalid_token";
  }
  return fallback;
}

export async function requestEmailOtp(
  client: AuthOtpClient,
  email: string,
  opts?: { shouldCreateUser?: boolean },
): Promise<OtpRequestResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, code: "invalid_email", message: "Invalid email" };
  }
  const { error } = await client.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: opts?.shouldCreateUser ?? true },
  });
  if (error) {
    return { ok: false, code: "auth_error", message: error.message };
  }
  return { ok: true, email: normalized };
}

export async function verifyEmailOtp(
  client: AuthOtpClient,
  email: string,
  token: string,
): Promise<OtpVerifyResult> {
  const normalized = normalizeEmail(email);
  const code = token.trim();
  if (!isValidEmail(normalized)) {
    return { ok: false, code: "invalid_email", message: "Invalid email" };
  }
  if (!code) {
    return { ok: false, code: "invalid_token", message: "OTP token is required" };
  }
  const { data, error } = await client.auth.verifyOtp({
    email: normalized,
    token: code,
    type: EMAIL_OTP_TYPE,
  });
  if (error) {
    return {
      ok: false,
      code: authErrorCode(error.message, "invalid_token"),
      message: error.message,
    };
  }
  if (!sessionAccessToken(data.session)) {
    return { ok: false, code: 'auth_error', message: '验证未返回有效登录凭证，请重新获取验证码后登录。' };
  }
  return { ok: true, email: normalized, user: data.user, session: data.session };
}
