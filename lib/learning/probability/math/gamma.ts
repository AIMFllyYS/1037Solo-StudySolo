// Shared only after token-identical implementations and dependencies were verified.
// Gamma function (Lanczos approximation, for t-distribution)

const LANCZOS_SHIFT = 7;
const LANCZOS_COEFFICIENTS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function gammaLanczos(z: number): number {
  const g = LANCZOS_SHIFT;
  const c = LANCZOS_COEFFICIENTS;
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaLanczos(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/** Preserve finite Gamma arithmetic; avoid Gamma overflow for the UI's large positive degrees. */
export function logAbsGammaLanczos(z: number): number {
  const gamma = gammaLanczos(z);
  if (Number.isFinite(gamma)) return Math.log(Math.abs(gamma));
  if (z < 0.5) return Math.log(Math.abs(Math.PI / Math.sin(Math.PI * z))) - logAbsGammaLanczos(1 - z);
  const shifted = z - 1;
  let sum = LANCZOS_COEFFICIENTS[0];
  for (let i = 1; i < LANCZOS_SHIFT + 2; i++) sum += LANCZOS_COEFFICIENTS[i] / (shifted + i);
  const t = shifted + LANCZOS_SHIFT + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(Math.abs(sum));
}
