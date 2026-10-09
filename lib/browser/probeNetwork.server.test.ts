import assert from "node:assert/strict";
import { test } from "node:test";
import type { LookupAddress, LookupOptions } from "node:dns";
import {
  BlockedProbeNetworkError,
  createPinnedProbeLookup,
  dohFakeDnsFallbackEnabled,
  fetchProbeHeaders,
  isFakeDnsAnswerSet,
  isPublicProbeAddress,
  resolveViaDoh,
  withFakeDnsFallback,
} from "./probeNetwork.server";

test("probe addresses reject private, metadata, reserved and embedded private IPv4", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1",
    "198.18.0.1", "192.0.2.1", "224.0.0.1", "255.255.255.255", "::1", "fc00::1",
    "fe80::1", "fec0::1", "100::1", "100:0:0:1::1", "64:ff9b:1::808:808",
    "2001:2::1", "2001:10::1", "3fff::1", "5f00::1", "2001:db8::1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::1", "not-an-ip"]) {
    assert.equal(isPublicProbeAddress(address), false, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "64:ff9b::808:808"]) {
    assert.equal(isPublicProbeAddress(address), true, address);
  }
});

test("a mixed public/private DNS response is wholly rejected", () => {
  assert.throws(() => createPinnedProbeLookup("public.example", [
    { address: "8.8.8.8", family: 4 }, { address: "::1", family: 6 },
  ]), BlockedProbeNetworkError);
});

test("pinned lookup copies validated addresses and never resolves a replacement host", () => {
  const answers: LookupAddress[] = [{ address: "8.8.8.8", family: 4 }];
  const pinned = createPinnedProbeLookup("public.example", answers);
  answers[0].address = "127.0.0.1";
  pinned("public.example", { all: true }, (error, result) => {
    assert.equal(error, null);
    assert.deepEqual(result, [{ address: "8.8.8.8", family: 4 }]);
    (result as LookupAddress[])[0].address = "10.0.0.1";
  });
  pinned("public.example", {} as LookupOptions, (error, address, family) => {
    assert.equal(error, null); assert.equal(address, "8.8.8.8"); assert.equal(family, 4);
  });
  pinned("other.example", {}, error => assert.ok(error instanceof BlockedProbeNetworkError));
  pinned("public.example", { family: 6 }, error => assert.ok(error instanceof BlockedProbeNetworkError));
});

test("headers-only fetch retains Host, uses a dispatcher and cancels the body", async t => {
  let cancelled = false;
  const controller = new AbortController();
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://public.example/document");
    assert.equal(init?.redirect, "manual");
    assert.ok((init as RequestInit & { dispatcher: unknown }).dispatcher);
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 200, headers: { "x-frame-options": "DENY" },
    });
  });
  const result = await fetchProbeHeaders(new URL("https://public.example/document"), controller.signal,
    { Accept: "text/html" }, async () => [{ address: "8.8.8.8", family: 4 }]);
  assert.equal(result.headers.get("x-frame-options"), "DENY");
  assert.equal(cancelled, true);
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("aborted DNS resolution cannot dispatch a later answer", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  const controller = new AbortController();
  let resolveDns: (answer: LookupAddress[]) => void = () => {};
  const pending = fetchProbeHeaders(new URL("https://public.example/"), controller.signal, {},
    () => new Promise(resolve => { resolveDns = resolve; }));
  controller.abort(new Error("synthetic-abort"));
  await assert.rejects(pending, /synthetic-abort/);
  resolveDns([{ address: "8.8.8.8", family: 4 }]);
  await Promise.resolve();
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("fake-DNS answers alone are re-resolved over DoH; mixed or public answers are untouched", async t => {
  const logs: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args.join(" ")); });
  const fake = async () => [{ address: "198.18.0.1", family: 4 }];
  let dohCalls = 0;
  const doh = async () => { dohCalls += 1; return [{ address: "3.173.21.63", family: 4 }]; };
  assert.equal(isFakeDnsAnswerSet([{ address: "198.19.255.1", family: 4 }]), true);
  assert.equal(isFakeDnsAnswerSet([{ address: "198.18.0.1", family: 4 }, { address: "10.0.0.1", family: 4 }]), false);
  assert.deepEqual(await withFakeDnsFallback(fake, doh)("api.example"), [{ address: "3.173.21.63", family: 4 }]);
  for (const answers of [
    [{ address: "10.0.0.1", family: 4 }],
    [{ address: "198.18.0.1", family: 4 }, { address: "127.0.0.1", family: 4 }],
    [{ address: "198.18.0.1", family: 4 }, { address: "8.8.8.8", family: 4 }],
    [{ address: "8.8.8.8", family: 4 }],
  ]) {
    assert.deepEqual(await withFakeDnsFallback(async () => answers, doh)("api.example"), answers);
  }
  assert.equal(dohCalls, 1);
  assert.doesNotThrow(() => createPinnedProbeLookup("api.example", [{ address: "3.173.21.63", family: 4 }]));
  assert.match(logs.join("\n"), /fake-dns-doh-fallback/);
});

test("DoH fallback never bypasses validation and keeps the rejected answer on failure", async t => {
  const logs: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args.join(" ")); });
  const fake = [{ address: "198.18.0.1", family: 4 }];
  for (const blocked of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "198.18.0.2"]) {
    const answers = await withFakeDnsFallback(async () => fake, async () => [{ address: blocked, family: 4 }])("api.example");
    assert.throws(() => createPinnedProbeLookup("api.example", answers), BlockedProbeNetworkError, blocked);
  }
  const failed = await withFakeDnsFallback(async () => fake, async () => { throw new Error("offline"); })("api.example");
  assert.deepEqual(failed, fake);
  assert.throws(() => createPinnedProbeLookup("api.example", failed), BlockedProbeNetworkError);
  assert.match(logs.join("\n"), /fake-dns-doh-failed/);
});

test("DoH parser keeps only A records, tries Cloudflare after Google, and rejects empty or failed answers", async () => {
  const reply = (body: unknown, status = 200) => async () => Response.json(body, { status });
  assert.deepEqual(await resolveViaDoh("api.example", reply({
    Status: 0,
    Answer: [{ type: 5, data: "alias.example." }, { type: 1, data: "3.173.21.63" }, { type: 1, data: "not-ip" }],
  })), [{ address: "3.173.21.63", family: 4 }]);
  await assert.rejects(resolveViaDoh("api.example", reply({ Status: 3 })));
  await assert.rejects(resolveViaDoh("api.example", reply({ Status: 0, Answer: [{ type: 5, data: "alias.example." }] })));
  await assert.rejects(resolveViaDoh("api.example", reply({}, 502)));

  const calls: string[] = [];
  const failover = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("accept"), "application/dns-json");
    if (String(input).includes("dns.google")) return new Response("no", { status: 502 });
    return Response.json({ Status: 0, Answer: [{ type: 1, data: "1.1.1.1" }] });
  };
  assert.deepEqual(await resolveViaDoh("api.example", failover), [{ address: "1.1.1.1", family: 4 }]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /dns\.google/);
  assert.match(calls[1], /cloudflare-dns\.com/);
});

test("STUDYSOLO_DOH_FAKE_DNS_FALLBACK can disable the fallback without weakening pinned checks", async () => {
  assert.equal(dohFakeDnsFallbackEnabled({}), true);
  assert.equal(dohFakeDnsFallbackEnabled({ STUDYSOLO_DOH_FAKE_DNS_FALLBACK: "true" }), true);
  assert.equal(dohFakeDnsFallbackEnabled({ STUDYSOLO_DOH_FAKE_DNS_FALLBACK: "false" }), false);
  assert.equal(dohFakeDnsFallbackEnabled({ STUDYSOLO_DOH_FAKE_DNS_FALLBACK: "0" }), false);
  assert.equal(dohFakeDnsFallbackEnabled({ STUDYSOLO_DOH_FAKE_DNS_FALLBACK: "off" }), false);
  let dohCalls = 0;
  const fake = [{ address: "198.18.0.1", family: 4 }];
  const result = await withFakeDnsFallback(async () => fake, async () => {
    dohCalls += 1;
    return [{ address: "8.8.8.8", family: 4 }];
  }, () => false)("api.example");
  assert.deepEqual(result, fake);
  assert.equal(dohCalls, 0);
  assert.throws(() => createPinnedProbeLookup("api.example", result), BlockedProbeNetworkError);
});
