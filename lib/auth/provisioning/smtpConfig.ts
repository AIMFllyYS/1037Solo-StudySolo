/**
 * Supabase Auth custom SMTP via Management API.
 * Password is sent to the API only; snapshots never keep smtp_pass.
 */
import {
  EMAIL_OTP_EXPIRY_SECONDS,
  EMAIL_OTP_RESEND_INTERVAL_SECONDS,
} from "../sessions/otp.ts";
import type { SmtpEnv } from "../env.ts";

export const AUTH_CONFIG_API_PATH = "/config/auth";
export const DIRECTMAIL_SMTP_HOSTS = ["smtpdm.aliyun.com", "smtpdm.aliyuncs.com"] as const;
export const CUSTOM_SMTP_EMAIL_RATE_LIMIT = 30;

/** Default GoTrue templates omit `{{ .Token }}`; OTP login needs the code in the mail. */
export const MAILER_SUBJECT_CONFIRMATION = "{{ .Token }} · StudySolo 邮箱验证码";
export const MAILER_SUBJECT_MAGIC_LINK = "{{ .Token }} · StudySolo 登录验证码";
export const MAILER_SUBJECT_RECOVERY = "重置 StudySolo 密码";

function studysoloMailHtml(opts: {
  eyebrow: string;
  title: string;
  lead: string;
  tokenLabel: string;
  linkLabel: string;
  linkHint: string;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<body style="margin:0;padding:0;background:#0f1419;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1419;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background:#161c24;border:1px solid #2a3340;border-radius:20px;">
          <tr>
            <td style="padding:28px 28px 8px 28px;font-family:'Segoe UI',Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
              <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8ab4ff;">${opts.eyebrow}</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;color:#f3f6fb;">${opts.title}</h1>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#b7c2d0;">${opts.lead}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px 28px;">
              <p style="margin:0 0 8px 0;font-size:12px;color:#8b97a8;">${opts.tokenLabel}</p>
              <p style="margin:0;padding:16px 12px;text-align:center;font-size:32px;letter-spacing:0.28em;font-weight:700;color:#f3f6fb;background:#0f1419;border:1px solid #2a3340;border-radius:14px;">{{ .Token }}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px 28px;font-family:'Segoe UI',Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
              <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#b7c2d0;">${opts.linkHint}</p>
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#8ab4ff;color:#0f1419;font-size:13px;font-weight:700;text-decoration:none;">${opts.linkLabel}</a>
              <p style="margin:20px 0 0 0;font-size:11px;line-height:1.5;color:#6f7b8a;">如果不是你本人在 StudySolo 发起的请求，请忽略这封邮件。验证码约 10 分钟后失效。</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const MAILER_TEMPLATE_CONFIRMATION = studysoloMailHtml({
  eyebrow: "StudySolo",
  title: "确认你的邮箱",
  lead: "一人一室，把课堂变成自己的复习工作站。用下面的验证码完成注册。",
  tokenLabel: "邮箱验证码",
  linkLabel: "确认邮箱并继续",
  linkHint: "也可以点击按钮确认邮箱。链接只能使用一次。",
});

export const MAILER_TEMPLATE_MAGIC_LINK = studysoloMailHtml({
  eyebrow: "StudySolo",
  title: "登录验证码",
  lead: "有人正在用这个邮箱登录 StudySolo。验证码如下。",
  tokenLabel: "登录验证码",
  linkLabel: "一键登录",
  linkHint: "也可以点击按钮直接登录。链接即将过期，且只能使用一次。",
});

export const MAILER_TEMPLATE_RECOVERY = studysoloMailHtml({
  eyebrow: "StudySolo",
  title: "重置密码",
  lead: "你申请了重置 StudySolo 密码。验证码如下；也可以直接打开重置链接。",
  tokenLabel: "重置验证码",
  linkLabel: "设置新密码",
  linkHint: "点击按钮后返回 StudySolo，在登录弹窗里设置新密码。",
});

export interface AuthConfigSnapshot {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpSenderName: string;
  smtpAdminEmail: string;
  smtpMaxFrequency: number;
  mailerOtpExp: number;
  externalEmailEnabled: boolean;
  mailerAutoconfirm: boolean;
  customSmtpEnabled: boolean;
}

export type AuthConfigPatch = Record<string, string | number | boolean>;

export function authConfigUrl(projectRef: string): string {
  return `https://api.supabase.com/v1/projects/${projectRef}${AUTH_CONFIG_API_PATH}`;
}

export function buildAuthSmtpPatch(smtp: SmtpEnv): AuthConfigPatch {
  return {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    disable_signup: false,
    smtp_admin_email: smtp.adminEmail,
    smtp_host: smtp.host,
    smtp_port: smtp.port,
    smtp_user: smtp.user,
    smtp_pass: smtp.pass,
    smtp_sender_name: smtp.senderName,
    smtp_max_frequency: EMAIL_OTP_RESEND_INTERVAL_SECONDS,
    mailer_otp_exp: EMAIL_OTP_EXPIRY_SECONDS,
    rate_limit_email_sent: CUSTOM_SMTP_EMAIL_RATE_LIMIT,
    mailer_subjects_confirmation: MAILER_SUBJECT_CONFIRMATION,
    mailer_subjects_magic_link: MAILER_SUBJECT_MAGIC_LINK,
    mailer_subjects_recovery: MAILER_SUBJECT_RECOVERY,
    mailer_templates_confirmation_content: MAILER_TEMPLATE_CONFIRMATION,
    mailer_templates_magic_link_content: MAILER_TEMPLATE_MAGIC_LINK,
    mailer_templates_recovery_content: MAILER_TEMPLATE_RECOVERY,
  };
}

export function snapshotAuthConfig(raw: Record<string, unknown>): AuthConfigSnapshot {
  const smtpHost = String(raw.smtp_host ?? "").trim();
  return {
    smtpHost,
    smtpPort: String(raw.smtp_port ?? "").trim(),
    smtpUser: String(raw.smtp_user ?? "").trim(),
    smtpSenderName: String(raw.smtp_sender_name ?? "").trim(),
    smtpAdminEmail: String(raw.smtp_admin_email ?? "").trim(),
    smtpMaxFrequency: Number(raw.smtp_max_frequency ?? 0),
    mailerOtpExp: Number(raw.mailer_otp_exp ?? 0),
    externalEmailEnabled: Boolean(raw.external_email_enabled),
    mailerAutoconfirm: Boolean(raw.mailer_autoconfirm),
    customSmtpEnabled: smtpHost.length > 0,
  };
}

export function isAliyunDirectMailSmtp(
  config: Pick<AuthConfigSnapshot, "smtpHost" | "customSmtpEnabled">,
): boolean {
  if (!config.customSmtpEnabled) return false;
  const host = config.smtpHost.toLowerCase();
  return DIRECTMAIL_SMTP_HOSTS.some((allowed) => host === allowed);
}

/** Markers that appear in a delivered message when it left via Aliyun DirectMail. */
export const DIRECTMAIL_DELIVERY_MARKERS = [
  "smtpdm.aliyun.com",
  "smtpdm.aliyuncs.com",
  "alimail",
  "aliyun-dm",
] as const;

export function collectDirectMailDeliveryTraces(haystack: string): string[] {
  const lower = haystack.toLowerCase();
  return DIRECTMAIL_DELIVERY_MARKERS.filter((marker) => lower.includes(marker));
}

async function parseAuthResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 400);
    throw new Error(`Supabase auth config ${res.status}: ${message}`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Supabase auth config: unexpected response body");
  }
  return body as Record<string, unknown>;
}

export async function fetchAuthConfig(opts: {
  accessToken: string;
  projectRef: string;
  fetchImpl?: typeof fetch;
}): Promise<AuthConfigSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(authConfigUrl(opts.projectRef), {
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: "application/json",
    },
  });
  return snapshotAuthConfig(await parseAuthResponse(res));
}

export async function applyAuthSmtpConfig(opts: {
  accessToken: string;
  projectRef: string;
  smtp: SmtpEnv;
  fetchImpl?: typeof fetch;
}): Promise<AuthConfigSnapshot> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(authConfigUrl(opts.projectRef), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAuthSmtpPatch(opts.smtp)),
  });
  return snapshotAuthConfig(await parseAuthResponse(res));
}
