/**
 * Email + password sign-in / sign-up / reset. OTP 仍走 otp.ts。
 */

import { sessionAccessToken } from "./sessionCookie.ts";
import { isValidEmail, normalizeEmail, type OtpFailureCode } from "./otp.ts";

export const PASSWORD_MIN_LENGTH = 6;

export interface AuthPasswordClient {
  auth: {
    signInWithPassword: (opts: {
      email: string;
      password: string;
    }) => Promise<{
      data: { user: unknown; session: unknown };
      error: { message: string } | null;
    }>;
    signUp: (opts: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string };
    }) => Promise<{
      data: { user: unknown; session: unknown };
      error: { message: string } | null;
    }>;
    resetPasswordForEmail: (
      email: string,
      opts?: { redirectTo?: string },
    ) => Promise<{ error: { message: string } | null }>;
    updateUser: (opts: { password: string }) => Promise<{
      data: { user: unknown };
      error: { message: string } | null;
    }>;
  };
}

export type PasswordFailureCode = OtpFailureCode | "invalid_password" | "mismatch";

export type PasswordAuthResult =
  | { ok: true; email: string; user: unknown; session: unknown }
  | { ok: false; code: PasswordFailureCode; message: string };

export type PasswordMailResult =
  | { ok: true; email: string }
  | { ok: false; code: PasswordFailureCode; message: string };

function passwordError(message: string, fallback: PasswordFailureCode): PasswordFailureCode {
  const lower = message.toLowerCase();
  if (lower.includes("invalid") && (lower.includes("login") || lower.includes("credential") || lower.includes("password"))) {
    return "invalid_password";
  }
  if (lower.includes("already") || lower.includes("registered")) return "auth_error";
  return fallback;
}

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

export async function signInWithPasswordEmail(
  client: AuthPasswordClient,
  email: string,
  password: string,
): Promise<PasswordAuthResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, code: "invalid_email", message: "Invalid email" };
  }
  if (!isValidPassword(password)) {
    return { ok: false, code: "invalid_password", message: `密码至少 ${PASSWORD_MIN_LENGTH} 位` };
  }
  const { data, error } = await client.auth.signInWithPassword({
    email: normalized,
    password,
  });
  if (error) {
    return { ok: false, code: passwordError(error.message, "auth_error"), message: error.message };
  }
  if (!sessionAccessToken(data.session)) {
    return { ok: false, code: "auth_error", message: "登录未返回有效凭证。" };
  }
  return { ok: true, email: normalized, user: data.user, session: data.session };
}

export async function signUpWithPasswordEmail(
  client: AuthPasswordClient,
  email: string,
  password: string,
  confirm: string,
  redirectTo?: string,
): Promise<PasswordAuthResult | PasswordMailResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, code: "invalid_email", message: "Invalid email" };
  }
  if (!isValidPassword(password)) {
    return { ok: false, code: "invalid_password", message: `密码至少 ${PASSWORD_MIN_LENGTH} 位` };
  }
  if (password !== confirm) {
    return { ok: false, code: "mismatch", message: "两次密码不一致" };
  }
  const { data, error } = await client.auth.signUp({
    email: normalized,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) {
    return { ok: false, code: passwordError(error.message, "auth_error"), message: error.message };
  }
  if (sessionAccessToken(data.session)) {
    return { ok: true, email: normalized, user: data.user, session: data.session };
  }
  return { ok: true, email: normalized };
}

export async function requestPasswordReset(
  client: AuthPasswordClient,
  email: string,
  redirectTo?: string,
): Promise<PasswordMailResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return { ok: false, code: "invalid_email", message: "Invalid email" };
  }
  const { error } = await client.auth.resetPasswordForEmail(
    normalized,
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) {
    return { ok: false, code: "auth_error", message: error.message };
  }
  return { ok: true, email: normalized };
}

export async function updateAccountPassword(
  client: AuthPasswordClient,
  password: string,
  confirm: string,
): Promise<PasswordMailResult> {
  if (!isValidPassword(password)) {
    return { ok: false, code: "invalid_password", message: `密码至少 ${PASSWORD_MIN_LENGTH} 位` };
  }
  if (password !== confirm) {
    return { ok: false, code: "mismatch", message: "两次密码不一致" };
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    return { ok: false, code: passwordError(error.message, "auth_error"), message: error.message };
  }
  return { ok: true, email: "" };
}
