import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";

test("connector navigation POSTs reject null, missing and cross-site Origin before Account/provider access", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("must not fetch"); });
  try {
    for (const origin of ["null", "https://attacker.example", ""]) {
      const request = new NextRequest("http://localhost:35349/api/connectors/google/connect", { method: "POST", headers: { host: "localhost:35349", cookie: "access_token=fixture", ...(origin ? { origin } : {}), accept: "text/html", "sec-fetch-mode": "navigate" } });
      const response = await proxy(request);
      assert.equal(response.status, 403); assert.equal((await response.json()).code, "ORIGIN_REJECTED");
    }
    assert.equal(requests, 0);
  } finally { t.mock.restoreAll(); }
});
