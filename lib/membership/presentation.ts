// GENERATED from 1037Solo-Shared/src/membership/presentation.ts by 1037Solo-Shared/scripts/sync-membership.mjs. Do not edit here: edit the source and re-run the script.
/**
 * Membership presentation contract — read-only display helpers for the
 * ecosystem's shared membership catalog.
 *
 * This module defines labels, formatting and validation for data the RootSolo
 * membership tables already decided, served through Account's public
 * GET /api/v1/membership/catalog. It defines NO price, grant, cap or billing
 * rule, and it must never carry payment state: live payments are off and
 * `payments.checkout_available` is always false in this contract.
 *
 * Products get a copy via 1037Solo-Shared/scripts/sync-membership.mjs
 * (see docs/conventions/membership-presentation.md).
 *
 * Only erasable TypeScript syntax is used, so the file also runs after type stripping.
 */

export type MembershipPlan = "free" | "pro" | "pro_plus" | "ultra";

/** Canonical plan order — the four tiers every product displays. */
export const MEMBERSHIP_PLAN_ORDER: readonly MembershipPlan[] = ["free", "pro", "pro_plus", "ultra"];

/** Display names. `pro_plus` is "Plus", never "Pro+". */
export const MEMBERSHIP_PLAN_LABELS: Record<MembershipPlan, string> = {
  free: "Free",
  pro: "Pro",
  pro_plus: "Plus",
  ultra: "Ultra",
};

/** One-line positioning for each tier — positioning only, not benefit guarantees. */
export const MEMBERSHIP_PLAN_DESCRIPTIONS: Record<MembershipPlan, string> = {
  free: "基础体验",
  pro: "日常学习与使用",
  pro_plus: "更深入的学习与工作流",
  ultra: "面向高强度使用需求",
};

export type MembershipCatalogPlan = {
  id: MembershipPlan;
  /** Byte counts and microcredit balances travel as decimal strings: they can exceed a float's exact range. */
  storage_bytes: string;
  monthly_microcredits: string;
};

export type MembershipCatalogProjectDefault = {
  plan_id: MembershipPlan;
  project_id: string;
  limits: Record<string, number>;
};

export type MembershipCatalogGift = {
  enabled: boolean;
  duration_days: number;
  initial_microcredits: string;
};

export type MembershipCatalog = {
  plans: MembershipCatalogPlan[];
  project_defaults: MembershipCatalogProjectDefault[];
  gift: MembershipCatalogGift | null;
  payments: {
    live_enabled: boolean;
    /** Always false in this release — even when the database flag allows live payments. */
    checkout_available: false;
  };
};

const MAX_SAFE_INTEGER = "9007199254740991";

function fail(reason: string): never {
  throw new Error(`membership catalog: ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exact non-negative integer decimal string, at most Number.MAX_SAFE_INTEGER; the return is normalized (no leading zeros). */
function integerString(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) fail(`${field} must be a non-negative integer string`);
  const number = BigInt(value);
  if (number > BigInt(MAX_SAFE_INTEGER)) fail(`${field} exceeds the safe integer range`);
  return number.toString();
}

/** Non-negative safe integer; booleans, floats and anything bigger than 2^53-1 are rejected. */
function safeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function planId(value: unknown, field: string): MembershipPlan {
  if (typeof value !== "string" || !(MEMBERSHIP_PLAN_ORDER as readonly string[]).includes(value)) {
    fail(`${field} is not a known plan id`);
  }
  return value as MembershipPlan;
}

/**
 * Validate the public catalog payload and return it in canonical shape:
 * plans sorted in MEMBERSHIP_PLAN_ORDER, every number a string.
 *
 * Fails closed — a missing plan, an unknown id, a malformed number or any
 * duplicated (plan_id, project_id) pair throws instead of being patched up.
 * A plan row's `enabled` flag is ignored: the catalog is untrusted client
 * input and never decides who may use what.
 */
export function parseMembershipCatalog(value: unknown): MembershipCatalog {
  if (!isPlainObject(value)) fail("expected an object");

  if (!Array.isArray(value.plans)) fail("plans must be an array");
  const seen = new Set<MembershipPlan>();
  const plans: MembershipCatalogPlan[] = [];
  for (const item of value.plans) {
    if (!isPlainObject(item)) fail("plan entries must be objects");
    const id = planId(item.id, "plan.id");
    if (seen.has(id)) fail(`duplicate plan ${id}`);
    seen.add(id);
    plans.push({
      id,
      storage_bytes: integerString(item.storage_bytes, `${id}.storage_bytes`),
      monthly_microcredits: integerString(item.monthly_microcredits, `${id}.monthly_microcredits`),
    });
  }
  for (const required of MEMBERSHIP_PLAN_ORDER) {
    if (!seen.has(required)) fail(`missing plan ${required}`);
  }
  plans.sort((a, b) => MEMBERSHIP_PLAN_ORDER.indexOf(a.id) - MEMBERSHIP_PLAN_ORDER.indexOf(b.id));

  if (!Array.isArray(value.project_defaults)) fail("project_defaults must be an array");
  const pairs = new Set<string>();
  const project_defaults: MembershipCatalogProjectDefault[] = [];
  for (const item of value.project_defaults) {
    if (!isPlainObject(item)) fail("project default entries must be objects");
    const plan_id = planId(item.plan_id, "project_defaults.plan_id");
    const project_id = item.project_id;
    if (typeof project_id !== "string" || !project_id.trim()) fail("project_defaults.project_id must be a non-empty string");
    if (!isPlainObject(item.limits)) fail(`limits for ${project_id} must be an object`);
    const limits: Record<string, number> = {};
    for (const key of Object.keys(item.limits)) {
      limits[key] = safeInteger(item.limits[key], `limits.${key}`);
    }
    const pair = `${plan_id} ${project_id}`;
    if (pairs.has(pair)) fail(`duplicate project default ${plan_id}/${project_id}`);
    pairs.add(pair);
    project_defaults.push({ plan_id, project_id, limits });
  }

  if (!("gift" in value)) fail("gift is missing");
  let gift: MembershipCatalogGift | null = null;
  if (value.gift !== null) {
    if (!isPlainObject(value.gift)) fail("gift must be an object or null");
    if (typeof value.gift.enabled !== "boolean") fail("gift.enabled must be a boolean");
    gift = {
      enabled: value.gift.enabled,
      duration_days: safeInteger(value.gift.duration_days, "gift.duration_days"),
      initial_microcredits: integerString(value.gift.initial_microcredits, "gift.initial_microcredits"),
    };
  }

  if (!isPlainObject(value.payments)) fail("payments must be an object");
  if (typeof value.payments.live_enabled !== "boolean") fail("payments.live_enabled must be a boolean");
  if (value.payments.checkout_available !== false) fail("payments.checkout_available must be false");

  return { plans, project_defaults, gift, payments: { live_enabled: value.payments.live_enabled, checkout_available: false } };
}

const MICRO = BigInt(1_000_000);
const GIB = BigInt(1024 ** 3);
const MIB = BigInt(1024 ** 2);
const MAX_DISPLAY_INTEGER = BigInt(MAX_SAFE_INTEGER);

/**
 * Strictly parse a displayed quantity. Anything that is not a clean
 * non-negative integer decimal string within the safe range returns null —
 * formatters render "—" for it rather than inventing a zero (a fabricated
 * balance is worse than no balance). Never throws: this runs inside React.
 */
function toBig(value: string): bigint | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= MAX_DISPLAY_INTEGER ? parsed : null;
}

/** "12345678" microcredits -> "12.34" (cut, never rounded up: a balance must not look larger than it is). Invalid input -> "—". */
export function formatMembershipCredits(value: string): string {
  const micro = toBig(value);
  if (micro === null) return "—";
  const whole = micro / MICRO;
  const cents = (micro % MICRO) / BigInt(10_000);
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === BigInt(0) ? grouped : `${grouped}.${cents.toString().padStart(2, "0")}`;
}

/** Storage in exact binary units: "1 GiB", never "1 GB". Invalid input -> "—". */
export function formatMembershipStorage(value: string): string {
  const bytes = toBig(value);
  if (bytes === null) return "—";
  if (bytes >= GIB) {
    const tenths = (bytes * BigInt(10)) / GIB;
    const text = tenths % BigInt(10) === BigInt(0)
      ? (tenths / BigInt(10)).toString()
      : `${tenths / BigInt(10)}.${tenths % BigInt(10)}`;
    return `${text} GiB`;
  }
  if (bytes >= MIB) return `${bytes / MIB} MiB`;
  if (bytes > BigInt(0)) return "不到 1 MiB";
  return "0 GiB";
}

/** Per-product limits the catalog knows about, in plain words. Unknown keys are not shown. */
export const LIMIT_LABELS: Record<string, string> = {
  workflows: "工作流数量",
  daily_chat_requests: "每日 AI 对话次数",
  daily_workflow_runs: "每日运行工作流次数",
  loop_iterations: "单次循环上限",
  concurrency: "同时运行的任务",
  concurrent_chat_runs: "同时进行的 AI 对话",
  chat_requests_per_minute: "每分钟 AI 对话次数",
};

/**
 * Limit values at or above this sentinel mean "no membership-level cap".
 * It is NOT a configurable quota: the system safety cap still applies, and
 * interfaces must say so where the sentinel is shown.
 */
export const UNLIMITED_LIMIT = 9_999_999;

export function formatMembershipLimit(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= UNLIMITED_LIMIT) return "不另设会员上限";
  return value.toLocaleString("zh-CN");
}

// ---------------------------------------------------------------------------
// URLs and fetching
// ---------------------------------------------------------------------------

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** accountUrl must be a plain http(s) origin — no credentials, no javascript:. */
function accountBase(accountUrl: string): URL {
  let base: URL;
  try {
    base = new URL(accountUrl);
  } catch {
    throw new Error("accountUrl must be a valid http(s) URL");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("accountUrl must be http(s)");
  if (base.username || base.password) throw new Error("accountUrl must not carry credentials");
  if (!base.hostname) throw new Error("accountUrl must have a host");
  return base;
}

/**
 * return_to is a link back to the product the visitor came from: https on a
 * first-party host (1037solo.com or any subdomain), or a loopback origin for
 * local development — loopback only when the Account URL is loopback too, so
 * production never emits a localhost link. Anything else is dropped.
 */
function safeReturnTo(raw: string, base: URL): string | null {
  if (/[\\\u0000-\u001f\u007f]/.test(raw) || raw !== raw.trim()) return null;
  if (raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "1037solo.com" || host.endsWith(".1037solo.com")) {
    return url.protocol === "https:" ? url.toString() : null;
  }
  if (LOCAL_HOSTNAMES.has(host) && LOCAL_HOSTNAMES.has(base.hostname.toLowerCase())) return url.toString();
  return null;
}

/**
 * The /membership page on Account, with optional context: which product sent
 * the visitor (source), where "back" goes (returnTo) and a plan they asked
 * about (plan). No amounts, currencies or billing cycles ever ride this URL.
 *
 * This validates syntax only: Account still runs its own product-registry
 * allowlist on the other end. Invalid returnTo/plan are silently omitted;
 * an invalid accountUrl throws.
 */
export function buildMembershipUrl(
  accountUrl: string,
  options?: { source?: string; returnTo?: string; plan?: MembershipPlan },
): string {
  const base = accountBase(accountUrl);
  const url = new URL("/membership", base);
  const source = options?.source;
  if (typeof source === "string" && source.trim() && !/[\\\u0000-\u001f\u007f]/.test(source)) {
    url.searchParams.set("source", source.trim());
  }
  const returnTo = options?.returnTo;
  if (typeof returnTo === "string") {
    const safe = safeReturnTo(returnTo, base);
    if (safe) url.searchParams.set("return_to", safe);
  }
  const plan = options?.plan;
  if (typeof plan === "string" && (MEMBERSHIP_PLAN_ORDER as readonly string[]).includes(plan)) {
    url.searchParams.set("plan", plan);
  }
  return url.toString();
}

/**
 * Read the public membership catalog from Account. No cookies or tokens are
 * sent, nothing is invented when the response is missing or malformed —
 * every failure throws.
 */
export async function fetchMembershipCatalog(
  accountUrl: string,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<MembershipCatalog> {
  const url = new URL("/api/v1/membership/catalog", accountBase(accountUrl));
  const doFetch = options?.fetchImpl ?? fetch;
  const response = await doFetch(url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    signal: options?.signal,
  });
  if (!response.ok) throw new Error(`membership catalog: HTTP ${response.status}`);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("membership catalog: malformed response body");
  }
  return parseMembershipCatalog(data);
}
