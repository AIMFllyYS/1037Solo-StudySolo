import { activeGrant } from "./connections.server";
import { readRecord, writeRecord, withLease } from "./persistence.server";
import { ConnectorError } from "./actor.server";
import { boundedText, providerJson, resourceId, safeArgument } from "./http.server";
import type { ConnectorId, ConnectorOperation } from "./registry";

const string = { type: "string", minLength: 1, maxLength: 4000 };
const limit = { type: "integer", minimum: 1, maximum: 20 };
const object = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({ type: "object", properties, required, additionalProperties: false });
const op = (name: string, description: string, properties: Record<string, unknown>, required: string[] = [], scope?: string, write = false): ConnectorOperation => ({ name, description, write, inputSchema: object(properties, required), scope });
const G = "https://www.googleapis.com/auth/";
export const API_OPERATIONS: Partial<Record<ConnectorId, ConnectorOperation[]>> = {
  google: [
    op("drive_search", "Find course files by name; returns file ids and links.", { query: string, limit, pageToken: string }, ["query"], `${G}drive.readonly`),
    op("drive_read", "Read a selected Google document, spreadsheet, slides, text file or PDF. PDFs/slides support page ranges; spreadsheets accept a sheet name and up to 200 rows.", { fileId: string, startPage: { type: "integer", minimum: 1 }, pageCount: { type: "integer", minimum: 1, maximum: 20 }, sheet: string, range: { type: "string", pattern: "^[A-Z]{1,3}[1-9][0-9]{0,4}:[A-Z]{1,3}[1-9][0-9]{0,4}$" } }, ["fileId"], `${G}drive.readonly`),
    op("calendar_list_events", "Read events in an explicit RFC3339 time window.", { calendarId: string, timeMin: string, timeMax: string, limit, pageToken: string }, ["timeMin", "timeMax"], `${G}calendar.readonly`),
    op("calendar_create_event", "Create a confirmed study time slot. Requires additional calendar.events consent.", { calendarId: string, summary: string, description: string, start: string, end: string, timeZone: string }, ["summary", "start", "end", "timeZone"], `${G}calendar.events`, true),
    op("gmail_search", "Find course mail metadata by Gmail query.", { query: string, limit, pageToken: string }, ["query"], `${G}gmail.readonly`),
    op("gmail_read", "Read the selected message body and headers.", { messageId: string }, ["messageId"], `${G}gmail.readonly`),
    op("gmail_send", "Send the exact confirmed plain-text email to one explicit recipient.", { to: string, subject: string, body: { type: "string", maxLength: 20000 } }, ["to", "subject", "body"], `${G}gmail.send`, true),
    op("contacts_search", "Find contacts by name for a user-requested lookup.", { query: string, limit }, ["query"], `${G}contacts.readonly`),
  ],
  zotero: [op("zotero_search", "Search personal library references; excludes private notes.", { query: string, limit }, ["query"]), op("zotero_read", "Read one reference and its abstract.", { itemKey: string }, ["itemKey"]), op("zotero_collections", "List personal library collections.", { limit }, [])],
  pubmed: [op("pubmed_search", "Find publications and verified PMID metadata.", { query: string, limit }, ["query"]), op("pubmed_read", "Read the public abstract of one PMID.", { pmid: { type: "string", pattern: "^[0-9]{1,12}$" } }, ["pmid"])],
  crossref: [op("crossref_search", "Find public DOI bibliographic metadata.", { query: string, limit }, ["query"]), op("crossref_read", "Verify one DOI and read public bibliographic metadata.", { doi: { type: "string", pattern: "^10\\.[0-9]{4,9}/.+", maxLength: 500 } }, ["doi"])],
};
const numberLimit = (value: unknown) => typeof value === "number" ? Math.min(20, Math.max(1, Math.floor(value))) : 10;
const optionalString = (value: unknown) => typeof value === "string" ? value : undefined;
const clean = (value: unknown): string => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
export function mailHtmlText(value: string): string {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|tr|li)>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(?:x([a-f0-9]+)|([0-9]+));/gi, (_all, hex: string | undefined, decimal: string | undefined) => { const code = Number.parseInt(hex ?? decimal ?? "0", hex ? 16 : 10); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }).replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim();
}
export function gmailMime(args: Record<string, unknown>, sender?: string) {
  const to = safeArgument(args.to, 320), subject = safeArgument(args.subject, 500), body = typeof args.body === "string" ? args.body : "";
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to) || /[\r\n]/.test(subject) || body.length > 20000) throw new ConnectorError("INVALID_EMAIL");
  if (sender && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)) throw new ConnectorError("INVALID_EMAIL");
  const words: string[] = []; let current = "";
  for (const char of subject) { if (Buffer.byteLength(current + char) > 42) { words.push(current); current = ""; } current += char; } if (current) words.push(current);
  const encodedSubject = words.map(word => `=?UTF-8?B?${Buffer.from(word).toString("base64")}?=`).join("\r\n ");
  const encodedBody = Buffer.from(body).toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  return Buffer.from(`${sender ? `From: ${sender}\r\n` : ""}To: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}\r\n`).toString("base64url");
}
export function eventBody(args: Record<string, unknown>, actionId: string) {
  const start = safeArgument(args.start, 80), end = safeArgument(args.end, 80), timeZone = safeArgument(args.timeZone, 100);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!iso.test(start) || !iso.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw new ConnectorError("INVALID_EVENT_TIME");
  try { new Intl.DateTimeFormat("en", { timeZone }); } catch { throw new ConnectorError("INVALID_TIME_ZONE"); }
  return { id: actionId.replace(/-/g, ""), summary: safeArgument(args.summary, 500), description: optionalString(args.description) ?? "", start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone } };
}
async function publicRate<T>(provider: "pubmed" | "crossref", work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return withLease(`rate:${provider}`, async () => {
    const timing = await readRecord<{ nextAt: number }>(`rate-clock:${provider}`);
    const wait = Math.max(0, Math.min(2000, (timing?.nextAt ?? 0) - Date.now()));
    if (wait) await new Promise(resolveWait => setTimeout(resolveWait, wait));
    signal?.throwIfAborted();
    await writeRecord(`rate-clock:${provider}`, { nextAt: Date.now() + (provider === "pubmed" ? process.env.NCBI_API_KEY ? 110 : 350 : 350) });
    return work();
  });
}
export async function callApi(owner: string, provider: ConnectorId, operation: string, args: Record<string, unknown>, actionId?: string, signal?: AbortSignal): Promise<{ data: unknown; sourceUrls?: string[] }> {
  const descriptor = API_OPERATIONS[provider]?.find(item => item.name === operation);
  if (!descriptor) throw new ConnectorError("OPERATION_NOT_ALLOWED", 403);
  if (descriptor.write && !actionId) throw new ConnectorError("WRITE_REQUIRES_CONFIRMATION", 403);
  if (provider === "google") {
    const grant = await activeGrant(owner, "google", signal), scopes = new Set(grant.scope.split(/\s+/));
    if (descriptor.scope && !scopes.has(descriptor.scope) && !(descriptor.scope.endsWith("drive.readonly") && scopes.has(`${G}drive.file`))) throw new ConnectorError("ADDITIONAL_SCOPE_REQUIRED", 403);
    const headers = { Authorization: `Bearer ${grant.accessToken}` };
    const get = (url: URL | string) => providerJson(url, { headers }, signal);
    if (operation === "drive_search") {
      const query = safeArgument(args.query, 500).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.search = new URLSearchParams({ q: `trashed = false and name contains '${query}'`, pageSize: String(numberLimit(args.limit)), fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)", ...(args.pageToken ? { pageToken: safeArgument(args.pageToken) } : {}) }).toString();
      const data = await get(url); return { data };
    }
    if (operation === "drive_read") {
      const id = resourceId(args.fileId), base = `https://www.googleapis.com/drive/v3/files/${id}`;
      const metadata = await get(`${base}?fields=id,name,mimeType,webViewLink`);
      const mime = String(metadata.mimeType), native = mime.startsWith("application/vnd.google-apps.");
      if (mime === "application/vnd.google-apps.spreadsheet") {
        const spreadsheet = await get(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId,properties(title),sheets(properties(title))`);
        const sheets = spreadsheet.sheets as { properties: { title: string } }[];
        const sheet = optionalString(args.sheet) ?? sheets[0]?.properties.title;
        if (!sheet || !sheets.some(item => item.properties.title === sheet)) throw new ConnectorError("SHEET_NOT_FOUND", 404);
        const range = optionalString(args.range) ?? "A1:Z200", match = range.match(/^([A-Z]{1,3})([1-9][0-9]{0,4}):([A-Z]{1,3})([1-9][0-9]{0,4})$/);
        const column = (value: string) => [...value].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
        if (!match || Number(match[4]) < Number(match[2]) || Number(match[4]) - Number(match[2]) >= 200 || column(match[3]) < column(match[1]) || column(match[3]) - column(match[1]) >= 50) throw new ConnectorError("SELECT_SMALLER_RANGE");
        const selected = encodeURIComponent(`'${sheet.replace(/'/g, "''")}'!${range}`);
        return { data: { ...metadata, sheet, ...await get(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${selected}?valueRenderOption=FORMATTED_VALUE`) }, sourceUrls: [String(metadata.webViewLink ?? `https://docs.google.com/spreadsheets/d/${id}/edit`)] };
      }
      if (mime === "application/vnd.google-apps.presentation") {
        const presentation = await get(`https://slides.googleapis.com/v1/presentations/${id}?fields=title,slides(pageElements(shape(text),table(tableRows(tableCells(text)))))`);
        const slides = presentation.slides as { pageElements?: { shape?: { text?: { textElements?: { textRun?: { content?: string } }[] } }; table?: { tableRows?: { tableCells?: { text?: { textElements?: { textRun?: { content?: string } }[] } }[] }[] } }[] }[];
        const begin = typeof args.startPage === "number" ? args.startPage - 1 : 0, count = typeof args.pageCount === "number" ? args.pageCount : 10;
        if (begin < 0 || begin >= slides.length) throw new ConnectorError("INVALID_PAGE_RANGE");
        const textOf = (text?: { textElements?: { textRun?: { content?: string } }[] }) => text?.textElements?.map(item => item.textRun?.content ?? "").join("") ?? "";
        const pages = slides.slice(begin, begin + count).map((slide, index) => ({ page: begin + index + 1, text: (slide.pageElements ?? []).map(item => textOf(item.shape?.text) + (item.table?.tableRows ?? []).map(row => (row.tableCells ?? []).map(cell => textOf(cell.text)).join("\t")).join("\n")).join("\n").slice(0, 12000) }));
        return { data: { ...metadata, totalPages: slides.length, pages, morePages: begin + count < slides.length }, sourceUrls: [String(metadata.webViewLink ?? `https://docs.google.com/presentation/d/${id}/edit`)] };
      }
      if (mime === "application/pdf") {
        const response = await fetch(`${base}?alt=media`, { headers, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]) });
        if (!response.ok || !response.body) throw new ConnectorError("PROVIDER_REQUEST_FAILED", 502);
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
        try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 8388608) throw new ConnectorError("SELECT_SMALLER_FILE", 413); chunks.push(next.value); } }
        finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const { selectedPdfText } = await import("./pdf.server");
        return { data: { ...metadata, ...await selectedPdfText(bytes, typeof args.startPage === "number" ? args.startPage : 1, typeof args.pageCount === "number" ? args.pageCount : 10) }, sourceUrls: [String(metadata.webViewLink ?? `https://drive.google.com/file/d/${id}/view`)] };
      }
      if (!native && !mime.startsWith("text/") && mime !== "application/json") return { data: { ...metadata, contentAvailable: false, reason: "IMPORT_FILE_FOR_BINARY_TEXT_EXTRACTION" }, sourceUrls: [`https://drive.google.com/file/d/${id}/view`] };
      const url = native ? `${base}/export?mimeType=text%2Fplain` : `${base}?alt=media`;
      const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]) });
      if (!response.ok) throw new ConnectorError("PROVIDER_REQUEST_FAILED", 502);
      const text = await boundedText(response, 1048576);
      return { data: { ...metadata, text: text.slice(0, 30000), truncated: text.length > 30000 }, sourceUrls: [String(metadata.webViewLink ?? `https://drive.google.com/file/d/${id}/view`)] };
    }
    if (operation === "calendar_list_events" || operation === "calendar_create_event") {
      const calendar = encodeURIComponent(optionalString(args.calendarId) ?? "primary");
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`);
      if (operation === "calendar_create_event") return { data: await providerJson(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(eventBody(args, actionId!)) }, signal) };
      const timeMin = safeArgument(args.timeMin, 80), timeMax = safeArgument(args.timeMax, 80);
      if (!Number.isFinite(Date.parse(timeMin)) || !Number.isFinite(Date.parse(timeMax)) || Date.parse(timeMin) >= Date.parse(timeMax)) throw new ConnectorError("INVALID_EVENT_TIME");
      url.search = new URLSearchParams({ timeMin, timeMax, maxResults: String(numberLimit(args.limit)), singleEvents: "true", orderBy: "startTime", ...(args.pageToken ? { pageToken: safeArgument(args.pageToken) } : {}) }).toString();
      return { data: await get(url) };
    }
    if (operation === "gmail_send") {
      const sender = grant.accountLabel ?? (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(grant.accountId) ? grant.accountId : undefined);
      if (!sender) throw new ConnectorError("SENDER_IDENTITY_REQUIRES_REAUTHORIZATION", 403);
      return { data: await providerJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ raw: gmailMime(args, sender) }) }, signal) };
    }
    if (operation === "gmail_search") {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.search = new URLSearchParams({ q: safeArgument(args.query, 1000), maxResults: String(numberLimit(args.limit)), ...(args.pageToken ? { pageToken: safeArgument(args.pageToken) } : {}) }).toString();
      return { data: await get(url) };
    }
    if (operation === "gmail_read") {
      const id = resourceId(args.messageId), message = await get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
      const payload = message.payload as { mimeType?: string; body?: { data?: string }; parts?: unknown[]; headers?: { name: string; value: string }[] } | undefined;
      const texts: string[] = [], htmlTexts: string[] = [];
      const visit = (part: typeof payload) => { if (!part) return; if (part.body?.data && ["text/plain", "text/html"].includes(part.mimeType ?? "")) { const text = Buffer.from(part.body.data, "base64url").toString("utf8"); if (part.mimeType === "text/plain") texts.push(text); else htmlTexts.push(mailHtmlText(text)); } for (const child of part.parts ?? []) visit(child as typeof payload); };
      visit(payload);
      return { data: { id, threadId: message.threadId, headers: payload?.headers?.filter(header => ["from", "to", "subject", "date"].includes(header.name.toLowerCase())), text: (texts.join("\n") || htmlTexts.join("\n") || String(message.snippet ?? "")).slice(0, 30000), bodySource: texts.length ? "plain-text" : htmlTexts.length ? "html-text" : "snippet" }, sourceUrls: [`https://mail.google.com/mail/u/0/#all/${id}`] };
    }
    if (operation === "contacts_search") {
      const url = new URL("https://people.googleapis.com/v1/people:searchContacts");
      url.search = new URLSearchParams({ query: safeArgument(args.query, 500), readMask: "names,emailAddresses", pageSize: String(numberLimit(args.limit)) }).toString();
      return { data: await get(url) };
    }
  }
  if (provider === "zotero") {
    const grant = await activeGrant(owner, "zotero", signal);
    if (!/^[0-9]+$/.test(grant.accountId)) throw new ConnectorError("CONNECTION_ID_INVALID", 403);
    const base = `https://api.zotero.org/users/${grant.accountId}`;
    const headers = { "Zotero-API-Key": grant.accessToken, "Zotero-API-Version": "3" };
    const url = new URL(operation === "zotero_read" ? `${base}/items/${resourceId(args.itemKey)}` : operation === "zotero_collections" ? `${base}/collections` : `${base}/items/top`);
    url.search = new URLSearchParams({ format: "json", limit: String(numberLimit(args.limit)), ...(operation === "zotero_search" ? { q: safeArgument(args.query, 500), itemType: "-note" } : {}) }).toString();
    const data = await providerJson(url, { headers }, signal);
    if (operation === "zotero_read" && (data.data as { itemType?: string } | undefined)?.itemType === "note") throw new ConnectorError("PRIVATE_NOTES_NOT_AUTHORIZED", 403);
    return { data, sourceUrls: [`https://www.zotero.org/users/${grant.accountId}/items${operation === "zotero_read" ? `/${resourceId(args.itemKey)}` : ""}`] };
  }
  if (provider === "pubmed") {
    const request = (name: string, fields: Record<string, string>) => publicRate("pubmed", () => providerJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${name}.fcgi`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ db: "pubmed", tool: "StudySolo", ...fields, ...(process.env.NCBI_API_KEY ? { api_key: process.env.NCBI_API_KEY } : {}) }) }, signal), signal);
    if (operation === "pubmed_search") {
      const found = await request("esearch", { term: safeArgument(args.query, 1000), retmax: String(numberLimit(args.limit)), retmode: "json" });
      const search = found.esearchresult as { idlist?: string[]; count?: string } | undefined;
      const ids = search?.idlist?.filter(id => /^[0-9]+$/.test(id)) ?? [];
      if (!ids.length) return { data: { count: search?.count ?? "0", papers: [] } };
      const summary = await request("esummary", { id: ids.join(","), retmode: "json" });
      const result = summary.result as Record<string, Record<string, unknown>>;
      return { data: { count: search?.count, papers: ids.map(id => ({ pmid: id, ...result[id] })) }, sourceUrls: ids.map(id => `https://pubmed.ncbi.nlm.nih.gov/${id}/`) };
    }
    const id = safeArgument(args.pmid, 12); if (!/^[0-9]+$/.test(id)) throw new ConnectorError("INVALID_PMID");
    const text = await publicRate("pubmed", async () => {
      const response = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ db: "pubmed", id, rettype: "abstract", retmode: "text", ...(process.env.NCBI_API_KEY ? { api_key: process.env.NCBI_API_KEY } : {}) }), redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]) });
      if (!response.ok) throw new ConnectorError("PROVIDER_REQUEST_FAILED", 502); return boundedText(response);
    }, signal);
    return { data: { pmid: id, abstract: text.slice(0, 30000) }, sourceUrls: [`https://pubmed.ncbi.nlm.nih.gov/${id}/`] };
  }
  if (provider === "crossref") {
    const url = new URL(operation === "crossref_read" ? `https://api.crossref.org/works/${encodeURIComponent(safeArgument(args.doi, 500))}` : "https://api.crossref.org/works");
    if (operation === "crossref_search") url.search = new URLSearchParams({ query: safeArgument(args.query, 1000), rows: String(numberLimit(args.limit)), select: "DOI,title,author,published,URL,type,container-title" }).toString();
    const response = await publicRate("crossref", () => providerJson(url, { headers: { "User-Agent": "StudySoloLearningConnectors/1.0" } }, signal), signal);
    const message = response.message as Record<string, unknown>;
    const papers = Array.isArray(message.items) ? message.items : [message];
    return { data: { total: message["total-results"], papers: papers.map(item => ({ ...item, abstract: item.abstract ? clean(item.abstract) : undefined })) }, sourceUrls: papers.map(item => typeof item.DOI === "string" ? `https://doi.org/${item.DOI}` : "").filter(Boolean) };
  }
  throw new ConnectorError("OPERATION_NOT_ALLOWED", 403);
}
