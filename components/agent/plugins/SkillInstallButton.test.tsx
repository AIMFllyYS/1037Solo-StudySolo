import "fake-indexeddb/auto";
import React from "react";
import { createHash, webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateStorageOwner } from "@/lib/storage/ownerScope";
import { setBrowserSession } from "@/lib/auth/sessions/browserSession";
import { useSkills } from "@/lib/stores/skills";
import { SkillPackagesProvider, useSkillPackages } from "./SkillPackagesContext";
import SkillInstallButton from "./SkillInstallButton";
import type { SkillMarketEntry } from "@/lib/plugins/market";
vi.mock("@/lib/hooks/runtime/useHydrated", () => ({ useHydrated: () => true }));
const owner = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const binding = (id: string) => createHash("sha256").update(id).digest("hex");
const entry = { id: "notes-to-handbook", name: "Notes to Handbook", runtime: "cloud", version: "1", path: "/fixture" } as SkillMarketEntry;
const session = (id: string) => ({ accessToken: "fixture-session", expiresAt: 2000000000, user: { id, email: null, user_metadata: {} } });
const status = (id = owner, installed: { packageId: string; version: string; digest: string }[] = []) => Response.json({ ownerBinding: binding(id), ready: true, installed });
function Probe() { const state = useSkillPackages(); return <span data-testid="status">{state.error ?? "ready"}:{state.installed.map(item => item.packageId).join(",")}</span>; }
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); activateStorageOwner(owner); setBrowserSession(session(owner)); useSkills.setState({ skills: [] }); window.history.replaceState(null,"","/agent/plugins"); });
afterEach(() => { cleanup(); activateStorageOwner(null); setBrowserSession(null); vi.unstubAllGlobals(); });
it("keeps the original package after a recent-auth refusal and installs only on the user's second click", async () => {
  let installed = false, verified = false;
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (!init?.method) return status(owner, installed ? [{ packageId: entry.id, version: "1", digest: "fixture" }] : []);
    expect(JSON.parse(init.body as string)).toEqual({ packageId: entry.id, action: "install" });
    expect(new Headers(init.headers).get("x-studysolo-owner-binding")).toBe(binding(owner));
    if (!verified) return Response.json({ code: "REAUTH_REQUIRED" }, { status: 403 });
    installed = true; return Response.json({ content: "---\nname: Handbook\ndescription: Handbook\n---\nServer skill" });
  });
  vi.stubGlobal("fetch", fetch);
  render(<SkillPackagesProvider><SkillInstallButton entry={entry}/></SkillPackagesProvider>);
  await waitFor(() => expect(screen.getByTestId(`skill-install-${entry.id}`)).not.toBeDisabled());
  fireEvent.click(screen.getByTestId(`skill-install-${entry.id}`));
  const verify = await screen.findByTestId("connector-account-verification"); expect(new URL(verify.getAttribute("href")!).pathname).toBe("/reverify");
  expect(useSkills.getState().skills).toHaveLength(0);
  verified = true; act(() => setBrowserSession(session(owner)));
  await waitFor(() => expect(screen.getByTestId(`skill-install-${entry.id}`)).not.toBeDisabled());
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  fireEvent.click(screen.getByTestId(`skill-install-${entry.id}`)); await screen.findByTestId(`skill-update-${entry.id}`);
  expect(useSkills.getState().skills[0].sourceId).toBe(entry.id); expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
});
it("rejects cookie-owner metadata while the verified UI owner is still another account", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => status(other, [{ packageId: entry.id, version: "1", digest: "fixture" }])));
  render(<SkillPackagesProvider><Probe/></SkillPackagesProvider>);
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent(/^ACCOUNT_CHANGED:$/));
});
it("does not hydrate an old owner's delayed installed result after an owner switch", async () => {
  let resolveOld!: (response: Response) => void, calls = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ++calls === 1 ? new Promise<Response>(resolve => { resolveOld = resolve; }) : status(other)));
  render(<SkillPackagesProvider><Probe/></SkillPackagesProvider>);
  await waitFor(() => expect(calls).toBe(1)); act(() => { activateStorageOwner(other); setBrowserSession(session(other)); });
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent(/^ready:$/));
  await act(async () => { resolveOld(status(owner, [{ packageId: entry.id, version: "1", digest: "fixture" }])); });
  expect(screen.getByTestId("status")).toHaveTextContent(/^ready:$/);
});
