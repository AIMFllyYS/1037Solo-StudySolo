/** An explicit zero is a configured free rate; missing/invalid prices remain disabled. */
export function configuredUnitRate(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw.trim())) return null;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 ? rate : null;
}
