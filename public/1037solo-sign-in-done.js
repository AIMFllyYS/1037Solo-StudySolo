/* Done page for openSignInWindow() (@1037solo/shared src/auth/sign-in-window.ts).
 * Runs on the PRODUCT's origin inside the sign-in window: tells the product
 * tab "signed in, re-check your session", then closes. Carries no token.
 * External file (not inline) so a `script-src 'self'` CSP allows it. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.hash.slice(1));
  var nonce = params.get("nonce") || "";
  var next = "/";
  try {
    var target = new URL(params.get("return") || "/", location.origin);
    if (target.origin === location.origin) next = target.pathname + target.search + target.hash;
  } catch (e) { /* keep "/" */ }
  // Drop the nonce from the address bar and history.
  try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }

  var message = { type: "1037solo:signed-in", nonce: nonce };
  try { if (window.opener && !window.opener.closed) window.opener.postMessage(message, location.origin); } catch (e) { /* opener severed */ }
  try { var channel = new BroadcastChannel("1037solo-sign-in"); channel.postMessage(message); channel.close(); } catch (e) { /* no BroadcastChannel */ }
  try {
    localStorage.setItem("1037solo-sign-in", JSON.stringify({ nonce: nonce, at: Date.now() }));
    localStorage.removeItem("1037solo-sign-in");
  } catch (e) { /* storage blocked */ }

  var link = document.getElementById("solo-done-continue");
  if (link) link.setAttribute("href", next);
  setTimeout(function () { window.close(); }, 120);
  // Opened as a normal tab (popup blocked into a tab, mobile): continue here instead.
  setTimeout(function () { location.replace(next); }, 1500);
})();
