import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAuthSessionController, type AuthRuntimeClient } from "./useAuthSession";

function mockClient(initial?: { id: string; email: string } | null): AuthRuntimeClient & {
  getSessionCalls: number;
} {
  let session = initial ? { user: initial } : null;
  const listeners = new Set<(event: string, session: import("@/lib/auth/session").AuthSessionPayload | null) => void>();
  const client: AuthRuntimeClient & { getSessionCalls: number } = {
    getSessionCalls: 0,
    auth: {
      signInWithOtp: async () => ({ error: null }),
      verifyOtp: async () => ({
        data: { user: session?.user ?? null, session },
        error: null,
      }),
      getSession: async () => {
        client.getSessionCalls += 1;
        return { data: { session }, error: null };
      },
      onAuthStateChange: (cb) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signOut: async () => {
        session = null;
        listeners.forEach((cb) => cb("SIGNED_OUT", null));
        return { error: null };
      },
    },
  };
  return client;
}

vi.mock("@/lib/auth/account",()=>({logoutAccount:vi.fn(async()=>{}),redirectAccount:vi.fn(),restoreAccountSession:vi.fn(),SIGNED_IN_EVENT:"1037solo:signed-in"}));

describe("useAuthSessionController", () => {
  it("without an injected client it follows the in-memory browser session (no SDK session)", async () => {
    const { setBrowserSession } = await import("@/lib/auth/browserSession");
    const { result, unmount } = renderHook(() => useAuthSessionController());
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    act(() => setBrowserSession({ accessToken: "a1", expiresAt: Math.floor(Date.now() / 1000) + 3600, user: { id: "u9", email: "u9@example.com", user_metadata: { display_name: "九" } } }));
    expect(result.current.userId).toBe("u9");
    expect(result.current.displayName).toBe("九");
    act(() => setBrowserSession(null));
    expect(result.current.status).toBe("signedOut");
    unmount();
  });
  it('a late initial signed-out snapshot cannot erase a newer login or cookie', async () => {
    const client = mockClient();
    let finish!: (value: Awaited<ReturnType<typeof client.auth.getSession>>) => void;
    let event!: Parameters<typeof client.auth.onAuthStateChange>[0];
    client.auth.getSession = () => new Promise((resolve) => { finish = resolve; });
    client.auth.onAuthStateChange = (callback) => { event = callback; return { data: { subscription: { unsubscribe() {} } } }; };
    const { result } = renderHook(() => useAuthSessionController(client));
    act(() => event('SIGNED_IN', { access_token: 'new-login', user: { id: 'u2', email: 'new@example.com' } }));
    act(() => event('INITIAL_SESSION', null));
    await act(async () => finish({ data: { session: null }, error: null }));
    expect(result.current.userId).toBe('u2');
    expect(document.cookie).not.toContain('new-login');
  });
  it('reconciles a login from another page on focus without overwriting a newer event', async () => {
    const client = mockClient();
    const { result, unmount } = renderHook(() => useAuthSessionController(client));
    await waitFor(() => expect(result.current.status).toBe('signedOut'));
    client.auth.getSession = vi.fn(async () => ({ data: { session: { access_token: 'external', user: { id: 'external', email: 'other@example.com' } } }, error: null }));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.userId).toBe('external'));
    unmount();
  });
  it("restores a persisted session on mount and after remount", async () => {
    const client = mockClient({ id: "u1", email: "ada@example.com" });
    const first = renderHook(() => useAuthSessionController(client));

    await waitFor(() => {
      expect(first.result.current.status).toBe("signedIn");
    });
    expect(first.result.current.email).toBe("ada@example.com");
    expect(client.getSessionCalls).toBe(1);

    first.unmount();
    const second = renderHook(() => useAuthSessionController(client));
    await waitFor(() => {
      expect(second.result.current.status).toBe("signedIn");
    });
    expect(second.result.current.email).toBe("ada@example.com");
    expect(client.getSessionCalls).toBe(2);
  });

  it("clears session on signOut", async () => {
    const client = mockClient({ id: "u1", email: "ada@example.com" });
    const { result } = renderHook(() => useAuthSessionController(client));
    await waitFor(() => {
      expect(result.current.status).toBe("signedIn");
    });

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe("signedOut");
    expect(result.current.email).toBeNull();
  });

  it("stops periodic Account reads after sign-out while retaining focus reconciliation", async () => {
    const client = mockClient({ id: "u1", email: "ada@example.com" });
    let tick: () => void = () => {};
    const realInterval = globalThis.setInterval;
    const interval = vi.spyOn(globalThis, "setInterval").mockImplementation((handler, delay, ...args) => {
      if (delay !== 300_000) return Reflect.apply(realInterval, globalThis, [handler, delay, ...args]) as ReturnType<typeof setInterval>;
      tick = handler as () => void;
      return 42 as unknown as ReturnType<typeof setInterval>;
    });
    const { result, unmount } = renderHook(() => useAuthSessionController(client));
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    try {
      await act(async () => { tick(); await Promise.resolve(); });
      expect(client.getSessionCalls).toBe(2);
      await act(async () => { await result.current.signOut(); });
      await act(async () => { tick(); await Promise.resolve(); });
      expect(client.getSessionCalls).toBe(2);
      act(() => window.dispatchEvent(new Event("focus")));
      await act(async () => { await Promise.resolve(); });
      expect(client.getSessionCalls).toBe(3);
    } finally { unmount(); interval.mockRestore(); }
  });
});
