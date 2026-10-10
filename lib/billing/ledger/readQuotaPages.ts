/** Avoid silently summing only the first PostgREST result page. Fail closed if the safety bound is exceeded. */
export async function readQuotaPages<T>(load: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += pageSize) {
    const page = await load(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error('Quota history exceeds the supported aggregation bound');
}
