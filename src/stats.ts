/**
 * Statistical utilities for Duel Crash audit.
 * Chi-squared, autocorrelation, Wald-Wolfowitz runs test.
 */

// ── Log-gamma (Lanczos approximation) ──────────────────────────────────────

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = LANCZOS_C[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) x += LANCZOS_C[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// ── Regularized incomplete gamma (exact chi-squared p-values) ──────────────

function gammaSeries(a: number, x: number): number {
  const lna = logGamma(a);
  let sum = 1 / a;
  let term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lna) * sum;
}

function gammaCF(a: number, x: number): number {
  const lna = logGamma(a);
  let b = x + 1 - a;
  let c = 1e30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lna) * h;
}

/** Regularized lower incomplete gamma P(a, x). */
export function regularizedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  return x < a + 1 ? gammaSeries(a, x) : gammaCF(a, x);
}

/** Chi-squared survival p-value: P(X >= chi2 | df). */
export function chiSquaredPValue(chi2: number, df: number): number {
  if (df <= 0 || chi2 < 0) return 1;
  return 1 - regularizedGammaP(df / 2, chi2 / 2);
}

// ── Chi-squared goodness of fit with bin pooling ───────────────────────────

export interface ChiSquaredResult {
  chi2: number;
  df: number;
  pValue: number;
  binsOriginal: number;
  binsPooled: number;
}

/**
 * Chi-squared test with Cochran-rule bin pooling.
 * @param observed array of observed counts per bin
 * @param expected array of expected counts per bin (same length)
 */
export function chiSquaredTest(observed: number[], expected: number[]): ChiSquaredResult {
  const n = observed.length;
  if (n !== expected.length) throw new Error('observed/expected length mismatch');

  // Pool bins with expected < 5 (merge into adjacent)
  const obs: number[] = [...observed];
  const exp: number[] = [...expected];

  // Forward pass: merge front tail
  while (exp.length > 1 && exp[0] < 5) {
    exp[1] += exp[0]; exp.splice(0, 1);
    obs[1] += obs[0]; obs.splice(0, 1);
  }

  // Backward pass: merge back tail
  while (exp.length > 1 && exp[exp.length - 1] < 5) {
    const last = exp.length - 1;
    exp[last - 1] += exp[last]; exp.splice(last, 1);
    obs[last - 1] += obs[last]; obs.splice(last, 1);
  }

  let chi2 = 0;
  for (let i = 0; i < obs.length; i++) {
    if (exp[i] > 0) {
      chi2 += (obs[i] - exp[i]) ** 2 / exp[i];
    }
  }

  const df = Math.max(1, obs.length - 1);
  const pValue = chiSquaredPValue(chi2, df);

  return { chi2, df, pValue, binsOriginal: n, binsPooled: obs.length };
}

// ── Lag-1 autocorrelation ──────────────────────────────────────────────────

export function lag1Autocorrelation(values: number[]): { r: number; z: number } {
  const n = values.length;
  if (n < 3) return { r: 0, z: 0 };

  const mean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (values[i] - mean) ** 2;
    if (i < n - 1) num += (values[i] - mean) * (values[i + 1] - mean);
  }
  const r = den === 0 ? 0 : num / den;
  const z = r * Math.sqrt(n);
  return { r, z };
}

// ── Wald-Wolfowitz runs test ───────────────────────────────────────────────

export function runsTest(values: number[]): { runs: number; expected: number; z: number; p: number } {
  const n = values.length;
  if (n < 10) return { runs: 0, expected: 0, z: 0, p: 1 };

  const median = [...values].sort((a, b) => a - b)[Math.floor(n / 2)];
  const signs = values.map(v => v >= median ? 1 : 0);

  let runs = 1;
  for (let i = 1; i < n; i++) {
    if (signs[i] !== signs[i - 1]) runs++;
  }

  const n1 = signs.filter(s => s === 1).length;
  const n2 = n - n1;
  if (n1 === 0 || n2 === 0) return { runs, expected: 1, z: 0, p: 1 };

  const expectedRuns = 1 + (2 * n1 * n2) / n;
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
  const sd = Math.sqrt(variance);
  const z = sd === 0 ? 0 : (runs - expectedRuns) / sd;

  // Two-tailed p-value using normal approximation
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { runs, expected: expectedRuns, z, p };
}

/** Standard normal CDF. */
export function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inverse normal for z-critical from Bonferroni alpha. */
function inverseCriticalZ(alpha: number): number {
  // Rational approximation (Abramowitz & Stegun 26.2.23)
  const p = alpha < 0.5 ? alpha : 1 - alpha;
  const t = Math.sqrt(-2 * Math.log(p));
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  let z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  if (alpha > 0.5) z = -z;
  return z;
}
