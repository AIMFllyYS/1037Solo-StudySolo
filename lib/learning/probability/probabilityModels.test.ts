import assert from "node:assert/strict";
import { test } from "node:test";
import { binomPMF, binomCDF, normalCDF, expCDF } from "./cumulativeDistributions";
import { computeTest } from "./meanTest";
import { chi2CDF, chi2Quantile } from "./varianceTest";
import { momentEstimate } from "./momentEstimation";
import { normalize, marginalX, marginalY } from "./marginalDistributions";
import { parseSamples } from "./samples";
import { gammaLanczos } from "./math/gamma";

test("CDF boundaries and binomial mass remain normalized", () => {
  for (const p of [0, 0.1, 0.5, 0.9, 1]) {
    const mass = Array.from({ length: 11 }, (_, k) => binomPMF(k, 10, p)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(mass - 1) < 1e-12);
    assert.equal(binomCDF(-1, 10, p), 0);
    assert.ok(Math.abs(binomCDF(10, 10, p) - 1) < 1e-12);
  }
  assert.ok(Math.abs(normalCDF(2, 2, 3) - 0.5) < 1e-6);
  assert.equal(expCDF(-1, 2), 0);
  assert.equal(expCDF(0, 2), 0);
});

test("mean tests preserve null statistic and tail probabilities", () => {
  for (const type of ["z", "t"] as const) {
    const two = computeTest(100, 100, 10, 25, "two", 0.05, type);
    const right = computeTest(100, 100, 10, 25, "right", 0.05, type);
    assert.equal(two.statistic, 0);
    assert.ok(Math.abs(two.pValue - 1) < 1e-6);
    assert.ok(Math.abs(right.pValue - 0.5) < 1e-6);
    assert.equal(two.reject, false);
    assert.ok(two.criticalLow < 0 && two.criticalHigh > 0);
  }
});

test("gamma and chi-square quantiles retain their identities", () => {
  assert.ok(Math.abs(gammaLanczos(5) - 24) < 1e-10);
  for (const df of [2, 5, 20, 499]) for (const p of [0.025, 0.5, 0.975]) {
    assert.ok(Math.abs(chi2CDF(chi2Quantile(p, df), df) - p) < 1e-5);
  }
});

test("chi-square upper branch agrees with closed-form even-degree CDFs", () => {
  // DLMF 8.4.9: P(n+1,z) = 1 - exp(-z) sum(z^k/k!, k=0..n).
  for (const x of [0.1, 1, 3.99, 4, 4.01, 6, 10, 20]) {
    assert.ok(Math.abs(chi2CDF(x, 2) - (1 - Math.exp(-x / 2))) < 1e-10);
    assert.ok(Math.abs(chi2CDF(x, 4) - (1 - Math.exp(-x / 2) * (1 + x / 2))) < 1e-10);
  }
  assert.ok(Math.abs(chi2Quantile(0.975, 2) - (-2 * Math.log(0.025))) < 1e-8);
  for (const df of [10, 498]) for (const x of [df - 0.01, df + 0.01, df + 2, 2 * df]) {
    const z = x / 2;
    let term = 1, sum = 1;
    for (let k = 1; k < df / 2; k++) { term *= z / k; sum += term; }
    assert.ok(Math.abs(chi2CDF(x, df) - (1 - Math.exp(-z) * sum)) < 1e-10);
  }
});

test("sample parsing and moment estimates preserve text and population-moment conventions", () => {
  assert.deepEqual(parseSamples("1；2，3 bad 4.5"), [1, 2, 3, 4.5]);
  assert.deepEqual(momentEstimate("exponential", [1, 2, 3]), { params: { lambda: 0.5 } });
  const normal = momentEstimate("normal", [1, 2, 3]);
  assert.equal(normal.params.mu, 2);
  assert.ok(Math.abs(normal.params.sigma2 - 2 / 3) < 1e-12);
  assert.deepEqual(momentEstimate("normal", []), { params: {} });
});

test("joint distribution marginals keep row and column orientation", () => {
  const p = normalize([[1, 2, 3], [3, 2, 1], [0, 0, 0]]);
  marginalX(p).forEach((value, index) => assert.ok(Math.abs(value - [0.5, 0.5, 0][index]) < 1e-12));
  for (const value of marginalY(p)) assert.ok(Math.abs(value - 1 / 3) < 1e-12);
  const uniform = normalize([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  assert.ok(marginalX(uniform).every(value => Math.abs(value - 1 / 3) < 1e-12));
});
