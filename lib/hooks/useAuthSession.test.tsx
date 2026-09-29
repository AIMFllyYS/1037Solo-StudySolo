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

vi.mock("@/lib/auth/account",()=>({logoutAccount:vi.fn(async()=>{}),redirectAccount:vi.fn(),restoreAccountSession:vi.fn()}));

describe("useAuthSessionController", () => {
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
});
