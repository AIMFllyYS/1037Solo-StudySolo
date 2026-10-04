import { z } from 'zod';

const pool = z.object({ cap: z.number().finite().nonnegative(), used: z.number().finite().nonnegative(), remaining: z.number().finite() });
// The regex must gate BigInt inside the refinement — a dirty string reaching
// BigInt throws SyntaxError, which would defeat safeParse.
const microcredits = z.string().refine(
  (value) => /^\d+$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER),
  { message: "expected decimal microcredits within the safe integer range" },
);
export const quotaViewSchema = z.object({
  userId: z.string(), tier: z.enum(['free', 'plus', 'pro', 'pro_plus', 'ultra']),
  periodStart: z.string().datetime(), periodEnd: z.string().datetime(),
  updatedAt: z.string().datetime(), platform: pool, byok: pool, sharedWallet: z.boolean().optional(), heldCny: z.number().nonnegative().optional(),
  // Exact shared-wallet microcredits (decimal strings). Present only when the
  // snapshot could read them — never synthesized as zeros.
  wallet: z.object({ available_microcredits: microcredits, held_microcredits: microcredits, charged_microcredits: microcredits }).optional(),
  monthlyMicrocredits: microcredits.optional(),
});
export type QuotaView = z.infer<typeof quotaViewSchema>;
export const ACCOUNT_USAGE_CHANGED = 'study:account-usage-changed';

export function notifyAccountUsageChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_USAGE_CHANGED));
}
