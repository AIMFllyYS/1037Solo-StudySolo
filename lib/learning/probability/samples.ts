// Shared only after token-identical implementations and dependencies were verified.
// ─── 解析样本输入 ─────────────────────────────────────────────────

export function parseSamples(text: string): number[] {
  return text
    .split(/[\s,;，；]+/)
    .map((s) => parseFloat(s.trim()))
    .filter((v) => isFinite(v));
}
