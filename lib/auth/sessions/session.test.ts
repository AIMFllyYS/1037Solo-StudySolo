import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOGIN_PATH,
  readPersistedSession,
  signOutSession,
  snapshotAuthSession,
  subscribeAuthSession,
  type AuthSessionClient,
} from "./session.ts";

function mockSessionClient(opts: {
  session?: { user: { id: string; email?: string | null } } | null;
  signOutError?: string;
}): AuthSessionClient & {
  listeners: Set<(event: string, session: import("./session").AuthSessionPayload | null) => void>;
} {
  let session = opts.session ?? null;
  const listeners = new Set<(event: string, session: import("./session").AuthSessionPayload | null) => void>();
  return {
    listeners,
    auth: {
      getSession: async () => {
        return {
          data: { session },
          error: null,
        };
      },
      onAuthStateChange: (cb) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signOut: async () => {
        session = null;
        listeners.forEach((cb) => cb("SIGNED_OUT", null));
        return { error: opts.signOutError ? { message: opts.signOutError } : null };
      },
    },
  };
}

test("LOGIN_PATH is /login", () => {
  assert.equal(LOGIN_PATH, "/login");
});

test("snapshotAuthSession reads user from user or session payload", () => {
  assert.deepEqual(snapshotAuthSession({ id: "u1", email: "ada@example.com" }, null), {
    user: { id: "u1", email: "ada@example.com", displayName: null, avatarUrl: null },
  });
  assert.deepEqual(
    snapshotAuthSession(null, { user: { id: "u2", email: "bob@example.com" } }),
    { user: { id: "u2", email: "bob@example.com", displayName: null, avatarUrl: null } },
  );
  assert.equal(snapshotAuthSession(null, null), null);
  assert.equal(snapshotAuthSession({ email: "no-id@example.com" }, null), null);
  assert.deepEqual(
    snapshotAuthSession(
      {
        id: "u3",
        email: "sofia@example.com",
        user_metadata: { display_name: "Sofia", avatar_url: "https://cdn.example/a.png" },
      },
      null,
    ),
    {
      user: {
        id: "u3",
        email: "sofia@example.com",
        displayName: "Sofia",
        avatarUrl: "https://cdn.example/a.png",
      },
    },
  );
});

test("readPersistedSession returns the stored session (refresh)", async () => {
  const client = mockSessionClient({
    session: { user: { id: "u1", email: "ada@example.com" } },
  });
  const first = await readPersistedSession(client);
  const again = await readPersistedSession(client);
  assert.deepEqual(first, { user: { id: "u1", email: "ada@example.com", displayName: null, avatarUrl: null } });
  assert.deepEqual(again, first);
});

test("subscribeAuthSession and signOutSession clear the session", async () => {
  const client = mockSessionClient({
    session: { user: { id: "u1", email: "ada@example.com" } },
  });
  const seen: Array<string | null> = [];
  const unsub = subscribeAuthSession(client, (s) => seen.push(s?.user.email ?? null));
  const ok = await signOutSession(client);
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(seen, [null]);
  unsub();
});

test("signOutSession maps auth errors", async () => {
  const client = mockSessionClient({ signOutError: "network" });
  const err = await signOutSession(client);
  assert.deepEqual(err, { ok: false, message: "network" });
});
