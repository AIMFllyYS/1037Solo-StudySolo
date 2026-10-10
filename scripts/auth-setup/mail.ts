
export interface DisposableInbox {
  provider: string;
  email: string;
  fetchMessages: () => Promise<DeliveredMail[]>;
}

export interface DeliveredMail {
  from: string;
  subject: string;
  text: string;
  raw: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function redactOtp(text: string): string {
  return text.replace(/\b\d{6,8}\b/g, "******");
}

export function mailBlob(mail: DeliveredMail): string {
  return `${mail.from}\n${mail.subject}\n${mail.text}\n${mail.raw}`;
}

export function hasOtpToken(mail: DeliveredMail): boolean {
  return /\b\d{6,8}\b/.test(mailBlob(mail));
}

async function jsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${url} ${res.status}: ${text.slice(0, 240)}`);
  }
  return body;
}

export async function openMailTmInbox(): Promise<DisposableInbox> {
  const domains = (await jsonFetch("https://api.mail.tm/domains")) as {
    "hydra:member"?: Array<{ domain?: string }>;
  };
  const domain = domains["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("mail.tm: no domain");
  const email = `issue61otp${Date.now()}@${domain}`;
  const password = `otp-${Date.now()}-Aa1`;
  await jsonFetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  });
  const tokenBody = (await jsonFetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: email, password }),
  })) as { token?: string };
  if (!tokenBody.token) throw new Error("mail.tm: no token");
  const auth = { Authorization: `Bearer ${tokenBody.token}` };
  return {
    provider: "mail.tm",
    email,
    async fetchMessages() {
      const list = (await jsonFetch("https://api.mail.tm/messages", { headers: auth })) as {
        "hydra:member"?: Array<{ id?: string; from?: { address?: string; name?: string }; subject?: string }>;
      };
      const out: DeliveredMail[] = [];
      for (const item of list["hydra:member"] ?? []) {
        if (!item.id) continue;
        const detail = (await jsonFetch(`https://api.mail.tm/messages/${item.id}`, {
          headers: auth,
        })) as {
          from?: { address?: string; name?: string };
          subject?: string;
          text?: string;
          html?: string;
        };
        let raw = "";
        try {
          const source = await jsonFetch(`https://api.mail.tm/sources/${item.id}`, { headers: auth });
          raw = typeof source === "string" ? source : JSON.stringify(source);
        } catch {
          raw = String(detail.html ?? "");
        }
        const fromAddr = detail.from?.address ?? item.from?.address ?? "";
        const fromName = detail.from?.name ?? item.from?.name ?? "";
        out.push({
          from: fromName ? `${fromName} <${fromAddr}>` : fromAddr,
          subject: detail.subject ?? item.subject ?? "",
          text: String(detail.text ?? ""),
          raw,
        });
      }
      return out;
    },
  };
}

export async function openTempmailLolInbox(): Promise<DisposableInbox> {
  const created = (await jsonFetch("https://api.tempmail.lol/v2/inbox/create", {
    method: "POST",
  })) as { address?: string; token?: string };
  if (!created.address || !created.token) throw new Error("tempmail.lol: no inbox");
  return {
    provider: "tempmail.lol",
    email: created.address,
    async fetchMessages() {
      const inbox = (await jsonFetch(
        `https://api.tempmail.lol/v2/inbox?token=${encodeURIComponent(created.token!)}`,
      )) as {
        emails?: Array<{
          from?: string;
          subject?: string;
          body?: string;
          html?: string;
          raw?: string;
          headers?: unknown;
        }>;
      };
      return (inbox.emails ?? []).map((mail) => ({
        from: String(mail.from ?? ""),
        subject: String(mail.subject ?? ""),
        text: String(mail.body ?? ""),
        raw: [mail.raw, mail.html, JSON.stringify(mail.headers ?? {})].filter(Boolean).join("\n"),
      }));
    },
  };
}

export async function openGuerrillaInbox(): Promise<DisposableInbox> {
  const created = (await jsonFetch(
    "https://api.guerrillamail.com/ajax.php?f=get_email_address",
  )) as { email_addr?: string; sid_token?: string };
  if (!created.email_addr || !created.sid_token) throw new Error("guerrilla: no inbox");
  const sid = created.sid_token;
  return {
    provider: "guerrillamail",
    email: created.email_addr,
    async fetchMessages() {
      const checked = (await jsonFetch(
        `https://api.guerrillamail.com/ajax.php?f=check_email&sid_token=${encodeURIComponent(sid)}&seq=0`,
      )) as { list?: Array<{ mail_id?: string; mail_from?: string; mail_subject?: string }> };
      const out: DeliveredMail[] = [];
      for (const item of checked.list ?? []) {
        if (!item.mail_id || item.mail_id === "0") continue;
        const detail = (await jsonFetch(
          `https://api.guerrillamail.com/ajax.php?f=fetch_email&sid_token=${encodeURIComponent(sid)}&email_id=${encodeURIComponent(item.mail_id)}`,
        )) as { mail_from?: string; mail_subject?: string; mail_body?: string; mail_source?: string };
        out.push({
          from: String(detail.mail_from ?? item.mail_from ?? ""),
          subject: String(detail.mail_subject ?? item.mail_subject ?? ""),
          text: String(detail.mail_body ?? ""),
          raw: String(detail.mail_source ?? detail.mail_body ?? ""),
        });
      }
      return out;
    },
  };
}
