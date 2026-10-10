import assert from "node:assert/strict";
import test from "node:test";
import { analyticConvPDF, type DistParams } from "./joint/convolution";
import { conditionalXgivenY, marginalX, normalizeMatrix, INDEP_JOINT, CORR_JOINT, type Matrix3x3 } from "./joint/conditional";
import { binomPMF, poissonPMF } from "./distributions/binomial";
import { computeMLE, logLikelihood } from "./estimation/likelihood";
import { calcSeries, calcParallel } from "./foundations/reliability";
import { calcStats } from "./sampling/statistics";
import { eigen2x2 } from "./moments/covarianceMatrix";

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " != " + expected);
}

test("discrete probability masses sum to one including degenerate endpoints", () => {
  for (const n of [1, 8, 50, 200]) for (const p of [0, 0.01, 0.5, 0.93, 1]) {
    close(Array.from({ length: n + 1 }, (_, k) => binomPMF(n, p, k)).reduce((sum, pK) => sum + pK, 0), 1, 2e-12);
  }
  for (const lambda of [0.5, 2, 15]) {
    close(Array.from({ length: 150 }, (_, k) => poissonPMF(lambda, k)).reduce((sum, pK) => sum + pK, 0), 1, 2e-12);
  }
});

test("conditional distributions normalize and independent rows equal the marginal", () => {
  for (const matrix of [INDEP_JOINT, CORR_JOINT]) {
    const normalized = normalizeMatrix(matrix.map(row => row.map(value => value * 3)) as Matrix3x3);
    close(normalized.flat().reduce((sum, p) => sum + p, 0), 1);
    for (let row = 0; row < 3; row++) close(conditionalXgivenY(normalized, row).reduce((sum, p) => sum + p, 0), 1);
  }
  const marginal = marginalX(INDEP_JOINT);
  for (let row = 0; row < 3; row++) conditionalXgivenY(INDEP_JOINT, row).forEach((value, i) => close(value, marginal[i]));
  assert.deepEqual(conditionalXgivenY([[0, 0, 0], [1, 0, 0], [0, 0, 0]], 0), [0, 0, 0]);
});

test("analytic convolution is symmetric and conserves probability mass", () => {
  const cases: [DistParams, DistParams, number, number][] = [
    [{ type: "normal", p1: -1, p2: 0.7 }, { type: "normal", p1: 2, p2: 1.1 }, -12, 14],
    [{ type: "uniform", p1: -2, p2: 1 }, { type: "uniform", p1: 0, p2: 2 }, -2, 3],
    [{ type: "exponential", p1: 1, p2: 0.2 }, { type: "exponential", p1: 2, p2: 0.3 }, 0.5, 30.5],
    [{ type: "exponential", p1: 2, p2: 0 }, { type: "exponential", p1: 2, p2: 0 }, 0, 15],
  ];
  for (const [left, right, lo, hi] of cases) {
    const steps = 10000, width = (hi - lo) / steps;
    let integral = 0;
    for (let i = 0; i < steps; i++) {
      const x = lo + (i + 0.5) * width;
      const density = analyticConvPDF(x, left, right);
      assert.ok(density >= 0);
      close(density, analyticConvPDF(x, right, left));
      integral += density * width;
    }
    close(integral, 1, 5e-6);
  }
});

test("MLE maximizes likelihood around the estimate and handles an empty sample", () => {
  for (const data of [[0.5, 1.2, 2, 4], [1, 2, 3]]) {
    const estimate = computeMLE("exponential", data);
    for (const factor of [0.1, 0.9, 1.1, 2]) assert.ok(logLikelihood("exponential", estimate, data) > logLikelihood("exponential", estimate * factor, data));
    close(estimate, data.length / data.reduce((sum, x) => sum + x, 0));
  }
  const data = [1, 0, 1, 1, 0], estimate = computeMLE("bernoulli", data);
  close(estimate, 0.6);
  for (const value of [0.2, 0.59, 0.61, 0.9]) assert.ok(logLikelihood("bernoulli", estimate, data) > logLikelihood("bernoulli", value, data));
  assert.ok(Number.isNaN(computeMLE("exponential", [])));
  assert.equal(logLikelihood("bernoulli", 0, data), -Infinity);
});

test("sample variance transforms with scale but is invariant to translation", () => {
  const input = [1, 2, 4, 7], baseline = calcStats(input);
  const shifted = calcStats(input.map(x => x + 100)), scaled = calcStats(input.map(x => -3 * x));
  close(shifted.mean, baseline.mean + 100);
  close(shifted.varN1, baseline.varN1);
  close(scaled.varN1, baseline.varN1 * 9);
  close(baseline.varN1, baseline.varN * 4 / 3);
  assert.deepEqual(input, [1, 2, 4, 7]);
  close(calcStats([5]).varN1, 0);
});

test("series and parallel reliability have monotone component behavior and duality", () => {
  for (const ps of [[0, 0, 0], [1, 1, 1], [0.4, 0.7, 0.9]]) {
    close(calcParallel(ps), 1 - calcSeries(ps.map(p => 1 - p)));
    assert.ok(calcSeries(ps) <= Math.min(...ps));
    assert.ok(calcParallel(ps) >= Math.max(...ps));
  }
  assert.ok(calcSeries([0.5, 0.7]) < calcSeries([0.6, 0.7]));
  assert.ok(calcParallel([0.5, 0.7]) < calcParallel([0.6, 0.7]));
});

test("symmetric covariance eigenvectors satisfy A v = lambda v and stay orthonormal", () => {
  for (const [a, b, d] of [[4, 0.5, 1], [1, -0.5, 4], [2, 1.7, 2], [1, 1, 1], [4, 0, 1], [1, 0, 4], [2, 0, 2]]) {
    const { lambda1, lambda2, v1, v2 } = eigen2x2(a, b, d);
    close(lambda1 + lambda2, a + d);
    close(lambda1 * lambda2, a * d - b * b);
    for (const [lambda, vector] of [[lambda1, v1], [lambda2, v2]] as const) {
      close(a * vector[0] + b * vector[1], lambda * vector[0]);
      close(b * vector[0] + d * vector[1], lambda * vector[1]);
      close(Math.hypot(...vector), 1);
    }
    close(v1[0] * v2[0] + v1[1] * v2[1], 0);
  }
});
