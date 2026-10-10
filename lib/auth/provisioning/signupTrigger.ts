/**
 * Prove `on_auth_user_created` / `handle_new_user` created app_users +
 * quota_grants, then always delete the probe user.
 */

export const SIGNUP_TRIGGER_NAME = "on_auth_user_created";
export const SIGNUP_TRIGGER_FN = "handle_new_user";
export const SIGNUP_GRANT_SOURCE = "signup";
export const SIGNUP_GRANT_AMOUNT_CNY = 7;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAuthUserId(id: string): boolean {
  return UUID_RE.test(id);
}

export interface SignupTriggerAdmin {
  createUser: (email: string) => Promise<{ id: string }>;
  deleteUser: (id: string) => Promise<void>;
}

export interface SignupTriggerStore {
  countAppUsers: (userId: string) => Promise<number>;
  countQuotaGrants: (userId: string) => Promise<number>;
}

export interface SignupTriggerProof {
  userId: string;
  email: string;
  appUsers: number;
  quotaGrants: number;
  cleanedUp: boolean;
}

export function probeSignupEmail(nowMs = Date.now()): string {
  return `issue61-trigger-${nowMs}@users.invalid`;
}

export async function verifySignupTriggerOnce(
  admin: SignupTriggerAdmin,
  store: SignupTriggerStore,
  email: string,
): Promise<SignupTriggerProof> {
  let userId = "";
  let appUsers = 0;
  let quotaGrants = 0;
  try {
    const created = await admin.createUser(email);
    userId = created.id;
    if (!isAuthUserId(userId)) {
      throw new Error("Auth admin returned a non-UUID user id");
    }
    ;[appUsers, quotaGrants] = await Promise.all([
      store.countAppUsers(userId),
      store.countQuotaGrants(userId),
    ]);
    if (appUsers < 1 || quotaGrants < 1) {
      throw new Error(
        `Signup trigger missed rows: app_users=${appUsers} quota_grants=${quotaGrants}`,
      );
    }
  } finally {
    if (userId) {
      await admin.deleteUser(userId);
    }
  }
  return { userId, email, appUsers, quotaGrants, cleanedUp: true };
}
