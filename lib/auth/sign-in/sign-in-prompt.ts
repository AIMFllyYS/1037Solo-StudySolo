// GENERATED from 1037Solo-Shared/src/auth/sign-in-prompt.ts by 1037Solo-Shared/scripts/sync-sign-in.mjs. Do not edit here: edit the source and re-run the script.
/**
 * Browser-only companions of sign-in-window.ts: a "sign in again" dialog and
 * progressive enhancement of existing sign-in links. Design:
 * 1037Solo-Accounts/docs/popup-signin-and-billing-20261001.md §1.
 *
 * Kept apart from sign-in-window.ts so that file stays DOM-free enough to unit
 * test in Node; the wording used here lives there (signInPromptCopy).
 */
import {
  buildSignInUrl, isFramed, openSignInWindow, signInLinkReturn, signInPromptCopy, willUsePopup,
  type SignInPromptReason, type SignInPromptState, type SignInWindowHandle, type SignInWindowOptions,
} from "./sign-in-window";

export type RequestSignInOptions = Omit<SignInWindowOptions, "onSignedIn" | "onClosed"> & {
  reason?: SignInPromptReason;
  /**
   * Asked when the window closes without a signal (the sign-in may have
   * finished in another tab, or the provider page cut the window off). Resolve
   * true when the product now has a session.
   */
  checkSession?: () => Promise<boolean>;
  /** Open straight into the "the browser blocked the window" state. */
  startBlocked?: boolean;
};

export type InterceptSignInLinksOptions = Omit<SignInWindowOptions, "returnTo" | "onSignedIn" | "onClosed"> & {
  /** Map a clicked link to the address to return to, or null to leave it alone. Defaults to links to `${accountUrl}/login`. */
  match?: (url: URL) => string | null;
  /** Signed in through the window. Re-read the session, or go to `returnTo` when it is a different page. */
  onSignedIn: (returnTo: string) => void;
  /** Window closed without a signal; re-check the session (a sign-in may have finished in another tab). */
  onClosed?: (returnTo: string) => void;
};

/**
 * Progressive enhancement for sign-in LINKS that already exist (`<a href="…/login?redirect=…">`):
 * a plain left click opens the sign-in window instead; everything else
 * (middle / modifier click, target=_blank, `data-solo-sign-in="page"`, a click
 * a handler already took over, phones, no JavaScript) keeps the ordinary
 * full-page link. Returns an uninstall function.
 */
export function interceptSignInLinks(options: InterceptSignInLinksOptions): () => void {
  const { match: customMatch, onSignedIn, onClosed, ...windowOptions } = options;
  const match = customMatch ?? ((url: URL) => signInLinkReturn(url.toString(), options.accountUrl, window.location.origin));
  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    if ((link.target && link.target !== "_self") || link.hasAttribute("download") || link.dataset.soloSignIn === "page") return;
    let url: URL;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    const returnTo = match(url);
    if (!returnTo || !willUsePopup(options.mode)) return;
    event.preventDefault();
    const handle = openSignInWindow({
      ...windowOptions,
      returnTo,
      onSignedIn: () => onSignedIn(returnTo),
      onClosed: () => onClosed?.(returnTo),
    });
    if (handle.mode === "blocked") {
      void requestSignIn({ ...windowOptions, returnTo, reason: "required", startBlocked: true }).then((ok) => { if (ok) onSignedIn(returnTo); });
    }
  }
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

function isDarkPage(): boolean {
  const root = document.documentElement;
  const explicit = root.getAttribute("data-theme") || root.getAttribute("data-solo-theme");
  if (explicit === "dark" || root.classList.contains("dark")) return true;
  if (explicit === "light" || root.classList.contains("light")) return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Styles are set through the CSSOM (element.style), which a strict
 * `style-src` CSP allows, unlike an injected <style>. Products can theme the
 * dialog with --solo-signin-* custom properties.
 */
function styled<K extends keyof HTMLElementTagNameMap>(tag: K, css: Record<string, string>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [property, value] of Object.entries(css)) el.style.setProperty(property, value);
  return el;
}

function palette(dark: boolean) {
  return dark
    ? { surface: "#292a2d", text: "#e8eaed", muted: "#bdc1c6", accent: "#8ab4f8", onAccent: "#202124", border: "#5f6368" }
    : { surface: "#ffffff", text: "#202124", muted: "#5f6368", accent: "#1a73e8", onAccent: "#ffffff", border: "#dadce0" };
}

let pendingPrompt: Promise<boolean> | null = null;

/**
 * Ask the user to sign in (again) without leaving the page: a small dialog
 * whose button opens the sign-in window (the click is the user gesture
 * browsers require). Resolves true once signed in, false if the user
 * dismisses it. Concurrent callers (several requests failing at once) share
 * one dialog. On phones and in-app browsers the button signs in on the whole
 * page instead, and the dialog says unsaved work may be lost.
 */
export function requestSignIn(options: RequestSignInOptions): Promise<boolean> {
  if (pendingPrompt) return pendingPrompt;
  if (typeof document === "undefined" || typeof HTMLDialogElement === "undefined") return Promise.resolve(false);
  pendingPrompt = new Promise<boolean>((resolve) => {
    const { reason = "expired", checkSession, startBlocked, ...windowOptions } = options;
    const framed = isFramed();
    const popup = willUsePopup(options.mode);
    const dark = isDarkPage();
    const c = palette(dark);
    const returnTo = options.returnTo ?? window.location.href;
    const fullPage = () => window.location.assign(buildSignInUrl(options.accountUrl, returnTo, "page", options.clientId));
    let state: SignInPromptState = startBlocked ? "blocked" : "ask";
    let handle: SignInWindowHandle | null = null;
    let settled = false;

    const dialog = styled("dialog", {
      "box-sizing": "border-box", width: "min(400px, calc(100vw - 32px))", padding: "24px", border: "0", "border-radius": "20px",
      background: `var(--solo-signin-surface, ${c.surface})`, color: `var(--solo-signin-text, ${c.text})`,
      "box-shadow": "0 12px 40px rgba(0,0,0,.28)", font: "inherit", "font-size": "15px", "line-height": "1.6",
      "color-scheme": dark ? "dark" : "light",
    });
    dialog.setAttribute("aria-labelledby", "solo-signin-title");
    dialog.setAttribute("aria-describedby", "solo-signin-body");
    dialog.dataset.soloSignInPrompt = reason;
    const heading = styled("h2", { margin: "0 0 8px", "font-size": "20px", "font-weight": "600", "line-height": "1.4" });
    heading.id = "solo-signin-title";
    const body = styled("p", { margin: "0 0 20px", color: `var(--solo-signin-muted, ${c.muted})` });
    body.id = "solo-signin-body";
    body.setAttribute("aria-live", "polite");
    const actions = styled("div", { display: "flex", "flex-wrap": "wrap", gap: "8px", "justify-content": "flex-end" });
    const button = (primary: boolean) => {
      const el = styled("button", {
        font: "inherit", "font-size": "14px", "font-weight": "600", "min-height": "40px", padding: "0 20px", "border-radius": "999px", cursor: "pointer",
        border: primary ? "0" : `1px solid var(--solo-signin-border, ${c.border})`,
        background: primary ? `var(--solo-signin-accent, ${c.accent})` : "transparent",
        color: primary ? `var(--solo-signin-on-accent, ${c.onAccent})` : `var(--solo-signin-accent, ${c.accent})`,
        "outline-offset": "2px",
      });
      el.type = "button";
      el.addEventListener("focus", () => el.style.setProperty("outline", `2px solid var(--solo-signin-accent, ${c.accent})`));
      el.addEventListener("blur", () => el.style.removeProperty("outline"));
      return el;
    };
    const secondaryButton = button(false);
    const alternativeButton = button(false);
    const primaryButton = button(true);
    actions.append(secondaryButton, alternativeButton, primaryButton);
    dialog.append(heading, body, actions);

    const render = () => {
      const copy = signInPromptCopy(reason, state, popup, framed);
      heading.textContent = copy.title;
      body.textContent = copy.body;
      primaryButton.textContent = copy.primary;
      secondaryButton.textContent = copy.secondary;
      alternativeButton.textContent = copy.alternative ?? "";
      alternativeButton.hidden = !copy.alternative;
      dialog.dataset.state = state;
    };

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (!value) handle?.cancel();
      try { dialog.close(); } catch { /* already closed */ }
      dialog.remove();
      pendingPrompt = null;
      resolve(value);
    };

    const open = () => {
      handle = openSignInWindow({
        ...windowOptions,
        mode: framed ? "popup" : options.mode,
        fallback: "none",
        onSignedIn: () => finish(true),
        onClosed: () => {
          if (!checkSession) return;
          void checkSession().then((ok) => { if (ok) finish(true); }).catch(() => undefined);
        },
      });
      state = handle.mode === "blocked" ? "blocked" : "waiting";
      render();
      primaryButton.focus();
    };

    // Phones / in-app browsers cannot use the window: sign in on the whole page.
    primaryButton.addEventListener("click", () => (popup || framed ? open() : fullPage()));
    alternativeButton.addEventListener("click", fullPage);
    secondaryButton.addEventListener("click", () => finish(false));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });

    render();
    document.body.append(dialog);
    dialog.showModal();
    primaryButton.focus();
  });
  return pendingPrompt;
}
