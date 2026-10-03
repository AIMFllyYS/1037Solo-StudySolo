import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { requireConnectorOrigin } from "./actor.server";

test("connector origin survives internal Next URLs while requiring the configured public Host and Origin", () => {
  const env = process.env as Record<string, string | undefined>;
  const names = ["NODE_ENV", "CONNECTOR_ALLOW_PRODUCTION", "CONNECTOR_CALLBACK_ORIGIN"];
  const before = Object.fromEntries(names.map(name => [name, env[name]]));
  Object.assign(env, { NODE_ENV: "production", CONNECTOR_ALLOW_PRODUCTION: "true", CONNECTOR_CALLBACK_ORIGIN: "https://studysolo.1037solo.com" });
  const make = (host: string, origin: string) => new NextRequest("http://127.0.0.1:35349/api/connectors/", { method: "POST", headers: { host, origin, "x-forwarded-host": "studysolo.1037solo.com" } });
  try {
    assert.equal(requireConnectorOrigin(make("studysolo.1037solo.com", "https://studysolo.1037solo.com"), true), "https://studysolo.1037solo.com");
    assert.throws(() => requireConnectorOrigin(make("attacker.invalid", "https://studysolo.1037solo.com"), true), /ORIGIN_REJECTED/);
    assert.throws(() => requireConnectorOrigin(make("studysolo.1037solo.com", "https://attacker.invalid"), true), /ORIGIN_REJECTED/);
    env.CONNECTOR_ALLOW_PRODUCTION = "false";
    assert.throws(() => requireConnectorOrigin(make("studysolo.1037solo.com", "https://studysolo.1037solo.com"), true), /CONNECTOR_PRODUCTION_DISABLED/);
  } finally { for (const name of names) if (before[name] === undefined) delete env[name]; else env[name] = before[name]; }
});
