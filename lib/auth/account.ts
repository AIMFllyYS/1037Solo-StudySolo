import { freshAccessToken, parseBrowserSession, setAccessTokenRenewer, setBrowserSession } from "./browserSession";
import { snapshotAuthSession, type AuthSession } from "./session";
import { CANONICAL_SITE_ORIGIN, LOCAL_ACCOUNT_URL, isFirstPartyHost, isLocalDevHost, isLocalUrl } from "./authMode";
import { openSignInWindow } from "./sign-in/sign-in-window";

export const ACCOUNT_URL = process.env.NEXT_PUBLIC_ACCOUNT_URL || "https://account.1037solo.com";

/**
 * 当前页面应该去的统一账号。本机开发（localhost:35349）一律去本机 Account：
 * 线上 Account 的登录态写在 .1037solo.com，本机页面读不到，去了也登不进来。
 */
export function accountOrigin(host = typeof window !== "undefined" ? window.location.hostname : ""): string {
  if (host && isLocalDevHost(host)) return isLocalUrl(ACCOUNT_URL) ? ACCOUNT_URL : LOCAL_ACCOUNT_URL;
  return ACCOUNT_URL;
}

export function accountUrl(action: "login" | "register" | "forgot-password" | "update-password" | "security") {
  if(typeof window!=="undefined"){
    const host=window.location.hostname;
    if(!isFirstPartyHost(host)&&!isLocalDevHost(host)){
      // 历史域名（notebook1b/notebook2a.husteread.icu）不在 1037solo.com 下，
      // 拿不到 Account 写在 .1037solo.com 的共享会话，因此不再单独登录：
      // 一律去正式域名的登录页，并带上用户原本要去的地址。
      // 本机开发不属于这一类（2026-10-01 修复：此前 localhost 也被当成历史域名，
      // 点登录会直接跳到线上 studysolo.1037solo.com）。
      const next=(window.location.pathname==='/login'||window.location.pathname.startsWith('/auth/'))?'/':window.location.pathname+window.location.search;
      const url=new URL('/login',CANONICAL_SITE_ORIGIN);
      url.searchParams.set('next',next);
      return url.toString();
    }
  }
  const url = new URL(`/${action}`, accountOrigin());
  if (typeof window !== "undefined") {
    const target = new URL(window.location.href);
    if (target.pathname === "/login") target.pathname = "/";
    target.hash = "";
    url.searchParams.set(action === "security" || action === "update-password" ? "next" : "redirect", target.toString());
  }
  return url.toString();
}

/** Fired after the sign-in window reports success; useAuthSession re-restores on it. */
export const SIGNED_IN_EVENT = "1037solo:signed-in";
/** Done page copied from 1037Solo-Shared into public/ (1037Solo-Shared/scripts/sync-sign-in.mjs). */
const SIGN_IN_DONE_PATH = "/1037solo-sign-in-done.html";

/**
 * On the official host (studysolo.1037solo.com) and in local development
 * (localhost:35349 -> local Account on :3040) signing in happens in a small
 * Account window on a desktop and the page stays as it is; on the /login page
 * it then continues to the page it was protecting. Phones, in-app browsers,
 * legacy hosts and every other action keep the full-page redirect.
 */
export function redirectAccount(action: Parameters<typeof accountUrl>[0] = "login") {
  if (typeof window === "undefined") return;
  const host = window.location.hostname;
  if (action === "login" && (isFirstPartyHost(host) || isLocalDevHost(host))) {
    const target = new URL(window.location.href);
    if (target.pathname === "/login") target.pathname = "/";
    target.hash = "";
    const returnTo = target.toString();
    const signedIn = () => {
      if (window.location.pathname === "/login") window.location.assign(returnTo);
      else window.dispatchEvent(new Event(SIGNED_IN_EVENT));
    };
    openSignInWindow({ accountUrl: accountOrigin(host), returnTo, donePath: SIGN_IN_DONE_PATH, onSignedIn: signedIn, onClosed: signedIn });
    return;
  }
  window.location.assign(accountUrl(action));
}
let pending: Promise<AuthSession | null> | null = null;
export function restoreAccountSession(): Promise<AuthSession | null> {
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("/api/account/session", {method:"POST", credentials:"include", headers:{"Content-Type":"application/json"},body:"{}"});
    if (response.status === 401) { setBrowserSession(null); return null; }
    if(response.status===403){const error=await response.json().catch(()=>({}));if(error.code==="MFA_REQUIRED"){setBrowserSession(null);if(error.challenge_url==="/auth/challenge"){if(window.location.pathname!=="/auth/challenge")window.location.assign("/auth/challenge");return null;}redirectAccount("security");}throw new Error("请完成统一账号两步验证");}
    if (!response.ok) throw new Error("统一账号服务暂不可用");
    const body = await response.json();
    const session = parseBrowserSession(body);
    if (!session) throw new Error("统一账号返回的登录信息不完整");
    setBrowserSession(session);
    if(window.location.pathname==="/auth/challenge"&&typeof body.returnTo==="string"&&body.returnTo.startsWith("/")&&!body.returnTo.startsWith("//"))window.location.assign(body.returnTo);
    return snapshotAuthSession(session.user, null);
  })().finally(()=>{pending=null;});
  return pending;
}
setAccessTokenRenewer(restoreAccountSession);
export { freshAccessToken };
export async function logoutAccount() {
  const response=await fetch("/api/account/logout",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}"});
  if(!response.ok)throw new Error("暂时无法退出，请重试");
  setBrowserSession(null);
}
