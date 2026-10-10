// Shared only after token-identical implementations and dependencies were verified.
export function rowMarginals(p: number[][]): number[] {
  return p.map((row) => row.reduce((s, v) => s + v, 0));
}

export function columnMarginals(p: number[][]): number[] {
  const n = p[0].length;
  return Array.from({ length: n }, (_, j) =>
    p.reduce((s, row) => s + row[j], 0)
  );
}
