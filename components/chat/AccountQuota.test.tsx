import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountQuota } from './AccountQuota';
import { fetchQuota } from '@/lib/billing/fetchQuota';
import type { QuotaView } from '@/lib/billing/quotaView';

let userId: string | null = 'one';
vi.mock('@/lib/hooks/useAuthSession', () => ({ useAuthSession: () => ({ userId, status: userId ? 'signedIn' : 'signedOut' }) }));
vi.mock('@/lib/billing/fetchQuota', () => ({ fetchQuota: vi.fn() }));
const value = (id: string): QuotaView => ({ userId: id, tier: 'plus' as const, periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z', platform: { cap: 70, used: 2, remaining: 68 }, byok: { cap: 70, used: 1, remaining: 69 } });
const sharedValue = (id: string, extra: Partial<QuotaView> = {}): QuotaView => ({
  userId: id, tier: 'pro_plus' as const, sharedWallet: true, heldCny: 2,
  periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z',
  // Legacy CNY pools — the shared wallet must NOT render remaining/cap as a fraction.
  platform: { cap: 999, used: 55, remaining: 12 }, byok: { cap: 999, used: 55, remaining: 12 },
  ...extra,
});
const WALLET = { wallet: { available_microcredits: '12000000', held_microcredits: '2000000', charged_microcredits: '55000000' }, monthlyMicrocredits: '50000000' };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  userId = 'one';
});
it('shows both pools and never labels the period as membership expiry', async () => {
  vi.mocked(fetchQuota).mockResolvedValue(value('one'));
  render(<AccountQuota />);
  await screen.findByText('Plus 会员');
  expect(screen.getByText('平台模型额度')).toBeTruthy();
  expect(screen.getByText('自备 API 辅助额度')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: '平台模型剩余额度' })).toHaveAttribute('data-risk-level', 'ok');
  expect(screen.queryByText(/会员到期/)).toBeNull();
});
it('reuses the colored usage bar with reversed risk semantics for low remaining quota', async () => {
  vi.mocked(fetchQuota).mockResolvedValue({
    ...value('one'),
    platform: { cap: 70, used: 65, remaining: 5 },
  });
  render(<AccountQuota />);
  const progress = await screen.findByRole('progressbar', { name: '平台模型剩余额度' });
  expect(progress).toHaveAttribute('aria-valuenow', '7');
  expect(progress).toHaveAttribute('data-risk-level', 'limit');
});
it('shared wallet shows exact credits — available/held/configured grant, never the legacy cap', async () => {
  vi.mocked(fetchQuota).mockResolvedValue(sharedValue('one', WALLET));
  render(<AccountQuota />);
  await screen.findByText('共享可用额度');
  expect(screen.getByText('12')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('本期发放标准')).toBeTruthy();
  expect(screen.getByText('50')).toBeTruthy();
  expect(screen.queryByText(/999/)).toBeNull();
  expect(screen.queryByText('自备 API 辅助额度')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});
it('shared wallet without the new fields falls back to legacy remaining + held only', async () => {
  vi.mocked(fetchQuota).mockResolvedValue(sharedValue('one'));
  render(<AccountQuota />);
  await screen.findByText('共享可用额度');
  expect(screen.getByText(/¥12/)).toBeTruthy();
  expect(screen.getByText('使用中（预留）')).toBeTruthy();
  expect(screen.getByText(/¥2/)).toBeTruthy();
  expect(screen.queryByText('本期发放标准')).toBeNull();
  expect(screen.queryByText(/999/)).toBeNull();
});
it('an older payload without heldCny shows —, never an invented ¥0', async () => {
  vi.mocked(fetchQuota).mockResolvedValue(sharedValue('one', { heldCny: undefined }));
  render(<AccountQuota />);
  await screen.findByText('共享可用额度');
  expect(screen.getByText('使用中（预留）')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.queryByText(/¥0/)).toBeNull();
});
it('discards a late old-account response and never turns errors into zero balance', async () => {
  let resolveOld!: (data: QuotaView) => void;
  vi.mocked(fetchQuota).mockImplementation((id) => id === 'one' ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.reject(new Error('暂不可用')));
  const view = render(<AccountQuota />);
  userId = 'two'; view.rerender(<AccountQuota />);
  await waitFor(() => expect(screen.getByText('暂不可用')).toBeTruthy());
  await act(async () => resolveOld(value('one')));
  expect(screen.queryByText('Plus 会员')).toBeNull();
  expect(screen.queryByText(/¥0/)).toBeNull();
  userId = null; view.rerender(<AccountQuota />);
  expect(screen.getByText('登录后查看会员与额度')).toBeTruthy();
  expect(screen.getByRole('link', { name: '会员中心' })).toBeTruthy();
});
it('the membership tag is a plain link into the unified member center', async () => {
  vi.mocked(fetchQuota).mockResolvedValue(value('one'));
  render(<AccountQuota />);
  await screen.findByText('Plus 会员');
  const tag = screen.getByRole('link', { name: '会员中心' });
  expect(tag).toHaveAttribute('href', expect.stringContaining('/membership?'));
  expect(tag.getAttribute('href')).toContain('source=studysolo');
  expect(tag).toHaveAttribute('target', '_blank');
  expect(tag).toHaveAttribute('rel', expect.stringContaining('noopener'));
});
