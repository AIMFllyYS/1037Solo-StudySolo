import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  BROWSER_AUTH_OPTIONS,
  createBrowserAuthClient,
  resetBrowserDataClient,
  tryGetBrowserDataClient,
} from "./browserClient.ts";
import { createServiceAuthClient } from "./serviceClient.ts";

test("createBrowserAuthClient exposes signInWithOtp / verifyOtp", () => {
  const client = createBrowserAuthClient({
    NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  });
  assert.equal(typeof client.auth.signInWithOtp, "function");
  assert.equal(typeof client.auth.verifyOtp, "function");
});

test("the app's data client is one instance and has no SDK auth session at all", async () => {
  assert.equal(BROWSER_AUTH_OPTIONS.persistSession, false);
  assert.equal(BROWSER_AUTH_OPTIONS.autoRefreshToken, false);
  resetBrowserDataClient();
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" };
  const a = tryGetBrowserDataClient(env, async () => "access-only");
  const b = tryGetBrowserDataClient({ NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "other" });
  assert.ok(a);
  assert.equal(a, b);
  // supabase-js disables client.auth when an accessToken callback is configured:
  // nothing in the page can call setSession / refreshSession with a refresh token.
  assert.throws(() => a.auth.getSession());
  resetBrowserDataClient();
});

test("tryGetBrowserDataClient 无参时用内联 NEXT_PUBLIC_*，不访问 process.env 对象", () => {
  resetBrowserDataClient();
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc123.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  try {
    assert.ok(tryGetBrowserDataClient());
  } finally {
    resetBrowserDataClient();
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  }
});

test("no app code hands a refresh token to the Supabase SDK or reads one from a response", () => {
  const root = process.cwd();
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (["node_modules", ".next", "docs", "scripts", "tests", "classolo", "public"].includes(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
      const text = readFileSync(path, "utf8");
      if (/\.auth\.setSession\(|refreshSession\(|session\.refresh_token|getBrowserAuthClient/.test(text)) offenders.push(path.slice(root.length + 1));
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(root, dir));
  assert.deepEqual(offenders, []);
});

test("createServiceAuthClient exposes Auth Admin", () => {
  const client = createServiceAuthClient({
    NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  });
  assert.equal(typeof client.auth.admin.createUser, "function");
  assert.equal(typeof client.auth.admin.deleteUser, "function");
});
