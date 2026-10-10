import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ACCOUNT_URL, accountOrigin, redirectAccount, SIGNED_IN_EVENT } from "./account";

type Stub = { opened: string[]; assigned: string[]; events: string[] };

function stubBrowser(href: string, popup: boolean): Stub {
  const stub: Stub = { opened: [], assigned: [], events: [] };
  const url = new URL(href);
  const location = { href, origin: url.origin, hostname: url.hostname, pathname: url.pathname, search: url.search, assign: (next: string) => stub.assigned.push(next) };
  Object.assign(globalThis, {
    window: {
      location, innerWidth: 1280, screenX: 0, screenY: 0, outerWidth: 1280, outerHeight: 800,
      open: (target: string) => { stub.opened.push(target); return popup ? { closed: false, focus() {}, close() {} } : null; },
      addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
      dispatchEvent: (event: Event) => { stub.events.push(event.type); return true; },
    },
    matchMedia: () => ({ matches: true }),
    BroadcastChannel: undefined,
  });
  Object.defineProperty(globalThis, "navigator", { value: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0" }, configurable: true });
  return stub;
}

const realBroadcastChannel = globalThis.BroadcastChannel;

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).matchMedia;
  globalThis.BroadcastChannel = realBroadcastChannel;
});

test("official host: login opens the small Account window returning through the done page", () => {
  const stub = stubBrowser("https://studysolo.1037solo.com/classolo?x=1", true);
  redirectAccount("login");
  assert.equal(stub.assigned.length, 0, "the page stays");
  const target = new URL(stub.opened[0] ?? "");
  assert.equal(target.pathname, "/login");
  assert.equal(target.searchParams.get("display"), "popup");
  const done = new URL(target.searchParams.get("redirect") ?? "");
  assert.equal(done.origin, "https://studysolo.1037solo.com");
  assert.equal(done.pathname, "/1037solo-sign-in-done.html");
  assert.equal(new URLSearchParams(done.hash.slice(1)).get("return"), "https://studysolo.1037solo.com/classolo?x=1");
});

test("a blocked window falls back to the full-page sign-in", () => {
  const stub = stubBrowser("https://studysolo.1037solo.com/", false);
  redirectAccount("login");
  assert.equal(new URL(stub.assigned[0] ?? "").searchParams.get("display"), null);
});

test("legacy hosts and other actions keep their full-page redirect", () => {
  let stub = stubBrowser("https://notebook1b.husteread.icu/notes", true);
  redirectAccount("login");
  assert.equal(stub.opened.length, 0);
  assert.equal(new URL(stub.assigned[0] ?? "").origin, "https://studysolo.1037solo.com");

  stub = stubBrowser("https://studysolo.1037solo.com/", true);
  redirectAccount("register");
  assert.equal(stub.opened.length, 0);
  assert.equal(new URL(stub.assigned[0] ?? "").pathname, "/register");
});

test("local dev: login opens the LOCAL Account window, never production (regression 2026-10-01)", () => {
  const stub = stubBrowser("http://localhost:35349/classolo?x=1", true);
  redirectAccount("login");
  assert.equal(stub.assigned.length, 0, "the page stays; no jump to studysolo.1037solo.com");
  const target = new URL(stub.opened[0] ?? "");
  assert.equal(target.origin, "http://localhost:3040");
  assert.equal(target.pathname, "/login");
  const done = new URL(target.searchParams.get("redirect") ?? "");
  assert.equal(done.origin, "http://localhost:35349");
  assert.equal(done.pathname, "/1037solo-sign-in-done.html");
  assert.equal(new URLSearchParams(done.hash.slice(1)).get("return"), "http://localhost:35349/classolo?x=1");
});

test("local dev: blocked window, register and security all stay on the local Account", () => {
  let stub = stubBrowser("http://localhost:35349/login", false);
  redirectAccount("login");
  let target = new URL(stub.assigned[0] ?? "");
  assert.equal(target.origin, "http://localhost:3040");
  assert.equal(target.searchParams.get("redirect"), "http://localhost:35349/");

  stub = stubBrowser("http://localhost:35349/notes", true);
  redirectAccount("register");
  target = new URL(stub.assigned[0] ?? "");
  assert.equal(target.origin, "http://localhost:3040");
  assert.equal(target.pathname, "/register");

  stub = stubBrowser("http://localhost:35349/notes", true);
  redirectAccount("security");
  target = new URL(stub.assigned[0] ?? "");
  assert.equal(target.origin, "http://localhost:3040");
  assert.equal(target.searchParams.get("next"), "http://localhost:35349/notes");
});

test("accountOrigin: production hosts keep the configured Account, local dev never gets it", () => {
  assert.equal(accountOrigin("studysolo.1037solo.com"), ACCOUNT_URL);
  assert.equal(accountOrigin("localhost"), "http://localhost:3040");
  assert.equal(accountOrigin("127.0.0.1"), "http://localhost:3040");
});

test("the signed-in event name is stable (useAuthSession listens for it)", () => {
  assert.equal(SIGNED_IN_EVENT, "1037solo:signed-in");
});
