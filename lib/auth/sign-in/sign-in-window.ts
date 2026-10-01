// GENERATED from 1037Solo-Shared/src/auth/sign-in-window.ts by 1037Solo-Shared/scripts/sync-sign-in.mjs. Do not edit here: edit the source and re-run the script.
/**
 * Sign in through a small 1037Solo Account window instead of leaving the page
 * (the pattern OAuth / MCP connectors use). Design + threat model:
 * 1037Solo-Accounts/docs/popup-signin-and-billing-20261001.md.
 *
 *   product page ── window.open ──> account.1037solo.com/login?display=popup&redirect=<done page>
 *        ▲                                   │ (password / 2FA / GitHub / Google, same pages as always)
 *        │   BroadcastChannel · postMessage   ▼
 *        └──────────────────── <product>/1037solo-sign-in-done.html  (closes itself)
 *
 * - The session itself travels the way it always does: the shared HttpOnly
 *   cookie on .1037solo.com. The message is only a hint ("go re-check"); it
 *   never carries a token, so a forged message can do no more than trigger a
 *   harmless session check.
 * - The done page lives on the PRODUCT's origin on purpose: after a GitHub or
 *   Google round-trip the popup can lose `window.opener` (their pages send
 *   Cross-Origin-Opener-Policy), but same-origin BroadcastChannel / storage
 *   events still reach the product tab.
 * - Touch devices, narrow screens, in-app browsers and blocked popups fall
 *   back to the full-page redirect that already works everywhere.
 *
 * Only erasable TypeScript syntax is used, so the file also runs after type stripping.
 */

export const SIGN_IN_CHANNEL = "1037solo-sign-in";
export const SIGN_IN_WINDOW_NAME = "1037solo-sign-in";
export const SIGN_IN_STORAGE_KEY = "1037solo-sign-in";
export const DEFAULT_DONE_PATH = "/1037solo-sign-in-done.html";
export const SIGN_IN_MESSAGE_TYPE = "1037solo:signed-in";

const WINDOW_WIDTH = 480;
const WINDOW_HEIGHT = 720;
/** Give up listening after this long (a sign-in that takes longer continues on the next page load). */
const LISTEN_MS = 15 * 60 * 1000;

export type SignInMessage = { type: typeof SIGN_IN_MESSAGE_TYPE; nonce: string };

/**
 * Where a popup either opens full-screen or not at all, so the full-page
 * redirect is the better experience:
 * WeChat, QQ, DingTalk, Feishu/Lark, Weibo, Alipay, Douyin, Xiaohongshu,
 * WeCom; our own Android shells (ChatSolo apps add SciChatAndroid /
 * SciChatAdminAndroid to their user agent and route new windows to the system
 * browser, which does not share the app's cookies); and any other Android
 * WebView (`; wv)` in the user agent).
 */
const IN_APP_BROWSER = /MicroMessenger|\bQQ\/|DingTalk|Lark|Feishu|Weibo|AlipayClient|aweme|BytedanceWebview|XiaoHongShu|wxwork|SciChat(?:Admin)?Android|; wv\)/i;

export function shouldUsePopup(env: { userAgent: string; finePointer: boolean; viewportWidth: number }): boolean {
  if (IN_APP_BROWSER.test(env.userAgent)) return false;
  if (!env.finePointer) return false;
  return env.viewportWidth >= 720;
}

export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Done page URL on the product's own origin; the nonce and return path ride in the fragment (never sent to a server). */
export function buildDoneUrl(productOrigin: string, donePath: string, nonce: string, returnTo: string): string {
  const url = new URL(donePath, productOrigin);
  if (url.origin !== new URL(productOrigin).origin) throw new Error("donePath must stay on the product origin");
  url.hash = new URLSearchParams({ nonce, return: returnTo }).toString();
  return url.toString();
}

export function buildSignInUrl(accountUrl: string, redirect: string, display: "popup" | "page", clientId?: string): string {
  const url = new URL("/login", accountUrl);
  if (clientId) url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect", redirect);
  if (display === "popup") url.searchParams.set("display", "popup");
  return url.toString();
}

export function isSignInMessage(data: unknown, nonce: string): boolean {
  if (!data || typeof data !== "object") return false;
  const message = data as Partial<SignInMessage>;
  return message.type === SIGN_IN_MESSAGE_TYPE && typeof message.nonce === "string" && message.nonce === nonce && nonce.length >= 16;
}

/** Centre the window over the current one (multi-monitor safe: uses the window's own screen position). */
export function windowFeatures(win: { screenX: number; screenY: number; outerWidth: number; outerHeight: number }): string {
  const left = Math.max(0, Math.round(win.screenX + (win.outerWidth - WINDOW_WIDTH) / 2));
  const top = Math.max(0, Math.round(win.screenY + (win.outerHeight - WINDOW_HEIGHT) / 2));
  return `popup=yes,width=${WINDOW_WIDTH},height=${WINDOW_HEIGHT},left=${left},top=${top}`;
}

export type SignInWindowOptions = {
  /** e.g. "https://account.1037solo.com" (http://localhost:3040 in development). */
  accountUrl: string;
  /** The product's Account client id (e.g. "platform-chat"), sent as `client_id` like the product's existing login links. */
  clientId?: string;
  /** Where to land after a full-page sign-in, and after the done page in a tab. Defaults to the current URL. */
  returnTo?: string;
  /** Path of the copied done page on this site (include the basePath, e.g. "/chat/1037solo-sign-in-done.html"). */
  donePath?: string;
  /** Signed in: re-read the session from your own server (the cookie is already set). */
  onSignedIn: () => void;
  /** The window was closed (or lost track of) before a signal arrived. Re-checking the session here is safe. */
  onClosed?: () => void;
  mode?: "auto" | "popup" | "redirect";
  /**
   * What to do when the browser blocks the window. "redirect" (default) signs in
   * on the whole page instead; "none" returns `{ mode: "blocked" }` so the caller
   * can explain it. Inside an iframe the default is "none": the Account site
   * refuses to be framed, so redirecting the frame would only show an error.
   */
  fallback?: "redirect" | "none";
};

export type SignInWindowHandle = { mode: "popup" | "redirect" | "blocked"; cancel: () => void };

/** True inside an iframe (KitSolo inside Platform, for example). A cross-origin parent throws on access, which also means framed. */
export function isFramed(): boolean {
  try { return window.top !== window.self; } catch { return true; }
}

function popupEnvironment() {
  return {
    userAgent: navigator.userAgent,
    finePointer: typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches,
    viewportWidth: window.innerWidth,
  };
}

/** Whether openSignInWindow() would use a window here (framed pages always do: they cannot redirect). */
export function willUsePopup(mode: SignInWindowOptions["mode"] = "auto"): boolean {
  if (mode === "popup") return true;
  if (mode === "redirect") return false;
  return isFramed() || shouldUsePopup(popupEnvironment());
}

const NOOP = () => undefined;
/** Only one sign-in window exists (it is a named window), so only one set of listeners may wait on it. */
let activeHandle: SignInWindowHandle | null = null;

/**
 * Call from a click handler (browsers only allow popups from a user gesture).
 * Returns which mode was used; in "redirect" mode the page is already leaving.
 */
export function openSignInWindow(options: SignInWindowOptions): SignInWindowHandle {
  const here = window.location.href;
  const returnTo = options.returnTo ?? here;
  const donePath = options.donePath ?? DEFAULT_DONE_PATH;
  const framed = isFramed();
  const fallback = options.fallback ?? (framed ? "none" : "redirect");
  const wantPopup = willUsePopup(options.mode);

  const redirect = (): SignInWindowHandle => {
    window.location.assign(buildSignInUrl(options.accountUrl, returnTo, "page", options.clientId));
    return { mode: "redirect", cancel: NOOP };
  };
  if (!wantPopup) return redirect();

  activeHandle?.cancel();
  activeHandle = null;

  const nonce = randomNonce();
  const target = buildSignInUrl(options.accountUrl, buildDoneUrl(window.location.origin, donePath, nonce, returnTo), "popup", options.clientId);
  // An iframe's own screen position is its parent window's, which is what we want to centre on.
  const popup = window.open(target, SIGN_IN_WINDOW_NAME, windowFeatures(window));
  if (!popup) return fallback === "redirect" ? redirect() : { mode: "blocked", cancel: NOOP };
  try { popup.focus(); } catch { /* cross-origin focus may throw in old engines */ }

  let finished = false;
  let reportedClosed = false;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(SIGN_IN_CHANNEL) : null;

  const cleanup = () => {
    finished = true;
    channel?.close();
    window.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
    window.clearInterval(watch);
    window.clearTimeout(expire);
  };
  const signedIn = () => {
    if (finished) return;
    cleanup();
    try { popup.close(); } catch { /* already closed */ }
    options.onSignedIn();
  };
  function onMessage(event: MessageEvent) {
    if (event.origin === window.location.origin && isSignInMessage(event.data, nonce)) signedIn();
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== SIGN_IN_STORAGE_KEY || !event.newValue) return;
    try { if (isSignInMessage({ type: SIGN_IN_MESSAGE_TYPE, ...JSON.parse(event.newValue) }, nonce)) signedIn(); } catch { /* not ours */ }
  }
  if (channel) channel.onmessage = (event) => { if (isSignInMessage(event.data, nonce)) signedIn(); };
  window.addEventListener("message", onMessage);
  window.addEventListener("storage", onStorage);

  // `closed` also turns true when a provider page severs the opener, so it is
  // reported once but does not stop listening for the done signal.
  const watch = window.setInterval(() => {
    if (finished || reportedClosed) return;
    let closed = false;
    try { closed = popup.closed; } catch { closed = true; }
    if (closed) { reportedClosed = true; options.onClosed?.(); }
  }, 600);
  const expire = window.setTimeout(cleanup, LISTEN_MS);

  const handle: SignInWindowHandle = {
    mode: "popup",
    cancel: () => {
      if (finished) return;
      cleanup();
      try { popup.close(); } catch { /* ignore */ }
    },
  };
  activeHandle = handle;
  return handle;
}

// ---------------------------------------------------------------------------
// Pure helpers shared with sign-in-prompt.ts (unit-tested without a DOM)
// ---------------------------------------------------------------------------

/**
 * If `href` is a link to the Account sign-in page whose return address is on
 * this page's origin, give that return address; otherwise null. Links to
 * another product, to /register and to anything else keep navigating normally
 * (register continues through an email link, which a small window cannot follow).
 */
export function signInLinkReturn(href: string, accountUrl: string, pageOrigin: string): string | null {
  let url: URL;
  try { url = new URL(href, pageOrigin); } catch { return null; }
  if (url.origin !== new URL(accountUrl).origin || url.pathname.replace(/\/+$/, "") !== "/login") return null;
  const raw = url.searchParams.get("redirect");
  if (!raw) return pageOrigin + "/";
  try {
    const target = new URL(raw, pageOrigin);
    return target.origin === pageOrigin ? target.toString() : null;
  } catch { return null; }
}

export type SignInPromptReason = "expired" | "required";
export type SignInPromptState = "ask" | "waiting" | "blocked";
export type SignInPromptCopy = { title: string; body: string; primary: string; secondary: string; alternative: string | null };

/** All user-facing wording of the sign-in dialog, in one place (plain Chinese, no engineering terms). */
export function signInPromptCopy(reason: SignInPromptReason, state: SignInPromptState, popup: boolean, framed: boolean): SignInPromptCopy {
  const title = reason === "expired" ? "登录已过期" : "需要登录";
  const lead = reason === "expired" ? "为了保护你的账号，需要重新登录。" : "登录 1037Solo 统一账号后才能继续。";
  const primary = reason === "expired" ? "重新登录" : "登录";
  if (state === "waiting") {
    return { title, body: "请在弹出的 1037Solo 统一账号小窗口里完成登录，完成后这里会自动继续。找不到窗口？点下面的按钮再打开一次。", primary: "重新打开登录窗口", secondary: "取消", alternative: null };
  }
  if (state === "blocked") {
    return framed
      ? { title, body: "浏览器拦截了登录小窗口。请在地址栏右侧允许本站弹出窗口，然后再试一次。", primary: "再试一次", secondary: "取消", alternative: null }
      : { title, body: "浏览器拦截了登录小窗口。可以允许本站弹出窗口后再试一次，也可以直接在当前页登录。", primary: "再试一次", secondary: "取消", alternative: "在当前页登录" };
  }
  const tail = popup ? "登录会在一个小窗口里完成，这个页面和上面的内容都会保留。" : "登录后会回到这个页面，还没保存的内容可能会丢失。";
  return { title, body: lead + tail, primary, secondary: "稍后再说", alternative: null };
}
