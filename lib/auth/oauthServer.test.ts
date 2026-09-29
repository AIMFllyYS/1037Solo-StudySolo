import assert from "node:assert/strict";
import { test } from "node:test";
import { oauthConfig } from "./oauthServer.ts";

test("production StudySolo OAuth uses the canonical RootSolo callback when the old host is configured", () => {
  const environment = process.env as Record<string, string | undefined>;
  const keys = [
    "NODE_ENV",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_STUDYSOLO_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_OAUTH_CLIENT_ID",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, environment[key]]));
  environment.NODE_ENV = "production";
  environment.NEXT_PUBLIC_APP_URL = "https://notebook1b.husteread.icu";
  delete environment.NEXT_PUBLIC_STUDYSOLO_URL;
  environment.NEXT_PUBLIC_SUPABASE_URL = "https://zizaonaxfguvlzdcbxzw.supabase.co";
  environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  delete environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete environment.SUPABASE_OAUTH_CLIENT_ID;
  try {
    for (const legacyOrigin of ["https://notebook1b.husteread.icu", "https://notebook2a.husteread.icu"]) {
      environment.NEXT_PUBLIC_APP_URL = legacyOrigin;
      const config = oauthConfig("https://studysolo.1037solo.com");
      assert.equal(config.origin, "https://studysolo.1037solo.com");
      assert.equal(config.callback, "https://studysolo.1037solo.com/api/account/oauth/callback");
      assert.equal(config.clientId, "e469cd5c-2363-4ddd-bf5c-e36562995a9c");
      assert.equal(config.authBase, "https://zizaonaxfguvlzdcbxzw.supabase.co/auth/v1");
    }
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (typeof value === "string") environment[key] = value;
      else delete environment[key];
    }
  }
});
