import { quotaViewSchema, type QuotaView } from './quotaView';

const pending = new Map<string, Promise<QuotaView>>();
/** Only in-flight work is shared. No account balance is persisted on the device. */
export function fetchQuota(userId: string): Promise<QuotaView> {
  const existing = pending.get(userId);
  if (existing) return existing;
  const promise = (async () => {
    const response = await fetch('/api/quota', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? '请重新登录后查看额度。' : '额度暂不可用，请稍后刷新。');
    const value = quotaViewSchema.parse(await response.json());
    if (value.userId !== userId) throw new Error('账户已切换，请刷新额度。');
    return value;
  })().finally(() => { if (pending.get(userId) === promise) pending.delete(userId); });
  pending.set(userId, promise);
  return promise;
}
