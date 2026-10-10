import { costCnyToUsd } from '@/lib/billing/ledger/ledgerView';

import { translateNow } from "@/lib/i18n/index";

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function fmtCost(yuan: number): string {
  if (yuan < 0.0001) return '¥0';
  if (yuan < 0.01) return `¥${yuan.toFixed(4)}`;
  return `¥${yuan.toFixed(2)}`;
}

export function fmtUsd(yuan: number, rate: number): string {
  const usd = costCnyToUsd(yuan, rate);
  if (usd < 0.0001) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function fmtMoneyPair(yuan: number, rate: number): string {
  return `${fmtCost(yuan)} / ${fmtUsd(yuan, rate)}`;
}

export function fmtDuration(sec: number): string {
  if (sec <= 0) return translateNow('panel.token.expired');
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function calcCost(
  prompt: number, completion: number, cached: number,
  pricing?: { input: number; cachedInput: number; output: number },
): number {
  if (!pricing) return 0;
  const uncached = Math.max(0, prompt - cached);
  return (uncached * pricing.input + cached * pricing.cachedInput + completion * pricing.output) / 1_000_000;
}