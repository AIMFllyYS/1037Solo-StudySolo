import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROWSER_AUTH_OPTIONS,
  createBrowserAuthClient,
  getBrowserAuthClient,
  resetBrowserAuthClient,
  tryGetBrowserAuthClient,
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

test("browser client uses Account transport without standalone persisted sessions", () => {
  assert.equal(BROWSER_AUTH_OPTIONS.persistSession, false);
  assert.equal(BROWSER_AUTH_OPTIONS.autoRefreshToken, false);
  resetBrowserAuthClient();
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  };
  const a = getBrowserAuthClient(env);
  const b = tryGetBrowserAuthClient({
    NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "other",
  });
  assert.equal(a, b);
  resetBrowserAuthClient();
});

test("tryGetBrowserAuthClient 无参时用内联 NEXT_PUBLIC_*，不访问 process.env 对象", () => {
  resetBrowserAuthClient();
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc123.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  try {
    const client = tryGetBrowserAuthClient();
    assert.ok(client);
    assert.equal(typeof client?.auth.signInWithOtp, "function");
  } finally {
    resetBrowserAuthClient();
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  }
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
