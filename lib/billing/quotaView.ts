import { z } from 'zod';

const pool = z.object({ cap: z.number().finite().nonnegative(), used: z.number().finite().nonnegative(), remaining: z.number().finite() });
export const quotaViewSchema = z.object({
  userId: z.string(), tier: z.enum(['free', 'plus', 'pro', 'pro_plus', 'ultra']),
  periodStart: z.string().datetime(), periodEnd: z.string().datetime(),
  updatedAt: z.string().datetime(), platform: pool, byok: pool, sharedWallet: z.boolean().optional(), heldCny: z.number().nonnegative().optional(),
});
export type QuotaView = z.infer<typeof quotaViewSchema>;
export const ACCOUNT_USAGE_CHANGED = 'study:account-usage-changed';

export function notifyAccountUsageChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCOUNT_USAGE_CHANGED));
}
