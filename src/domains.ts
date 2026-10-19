/**
 * Duel.com Crash — VALUE DOMAINS for every numeric leaf of the committed JSON artifacts of record
 * (`outputs/simulation-results.json`, `outputs/drand-api-verification.json`). Profile CRASH-27.
 *
 * Ported from the Duel Dice package's src/domains.ts, 2026-09-26. The SHA-256 pin (Step 17) proves the
 * bytes have not moved since we pinned them; it cannot tell a genuine figure from a physically impossible
 * one that a forger wrote and re-pinned. Step 17 therefore also validates every numeric leaf against a
 * domain declared here, in BOTH directions: every leaf satisfies its domain, and every leaf path is covered
 * by a rule (a new, undeclared numeric field fails). Every bound comes from src/ (src/loader.ts, the
 * simulation plan in tests/steps/sim-replay.ts), NEVER from the artifact being checked. The domains encode
 * physical possibility, not plausibility: nothing here rejects a value for being surprising.
 */

import { EXPECTED_ROUNDS, EXPECTED_DISTINCT_SEEDS, EXPECTED_CASHOUT_TARGETS } from './loader';
import {
  SIM_PASS1_STREAMS, SIM_PASS1_ROUNDS_EACH, SIM_PASS1_ROUNDS_TOTAL, SIM_PASS2_DRAND_PER_SEED, SIM_CASHOUT_TARGETS,
} from '../tests/steps/sim-replay';

/** Bins of the per-stream χ² in the simulation (11 edges past 1.00 → 11 bins). */
const SIM_NUM_BINS = 11;

export interface Domain {
  readonly label: string;
  readonly ok: (v: number) => boolean;
}

const D = (label: string, ok: (v: number) => boolean): Domain => ({ label, ok });

// ── Primitive domains ────────────────────────────────────────────────────────────────────────────

/** Any real number that is not NaN/Infinity. The weakest domain; used only where the quantity
 *  genuinely has no physical bound (signed z-scores). */
export const FINITE = D('a finite number', v => Number.isFinite(v));
export const NONNEG_REAL = D('a non-negative real', v => Number.isFinite(v) && v >= 0);
export const NONNEG_INT = D('a non-negative integer', v => Number.isInteger(v) && v >= 0);
export const POSITIVE_INT = D('a positive integer', v => Number.isInteger(v) && v >= 1);
export const PROBABILITY = D('a probability in [0,1]', v => Number.isFinite(v) && v >= 0 && v <= 1);
export const CORRELATION = D('a correlation in [-1,1]', v => Number.isFinite(v) && v >= -1 && v <= 1);
/** A chi-squared statistic is a sum of squares over positive expectations. */
export const CHI_SQUARED = D('a non-negative chi-squared statistic', v => Number.isFinite(v) && v >= 0);

export const exactly = (target: number, what: string): Domain =>
  D(`exactly ${target} (${what})`, v => v === target);

export const intAtMost = (max: number, what: string): Domain =>
  D(`an integer in [0, ${max}] (${what})`, v => Number.isInteger(v) && v >= 0 && v <= max);

export const intBetween = (lo: number, hi: number, what: string): Domain =>
  D(`an integer in [${lo}, ${hi}] (${what})`, v => Number.isInteger(v) && v >= lo && v <= hi);

export const realBetween = (lo: number, hi: number, what: string): Domain =>
  D(`a real in [${lo}, ${hi}] (${what})`, v => Number.isFinite(v) && v >= lo && v <= hi);

// ── The rule table ────────────────────────────────────────────────────────────────────────────────

export interface Rule {
  /** Matches a COLLAPSED leaf path: array indices are rendered as `[]`. */
  readonly path: RegExp;
  readonly domain: Domain;
}

/** Collapse `a.b[3].c` to `a.b[].c` so one rule covers every element of a list. */
export function collapsePath(path: string): string {
  return path.replace(/\[\d+\]/g, '[]');
}

/**
 * Every numeric leaf of each committed artifact, with the domain it physically admits.
 * Ordering matters: the FIRST matching rule wins, so narrower (anchored) patterns come first.
 */
export function domainRules(): Record<string, Rule[]> {
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A payout average at cash-out target t lies in [0, t]: each round pays t or nothing.
  const perTarget = (prefix: string): Rule[] => SIM_CASHOUT_TARGETS.map(t => ({
    path: new RegExp(`^${esc(prefix)}\\.${esc(String(t))}$`),
    domain: realBetween(0, t, `an attainable average payout at the ${t}× target`),
  }));
  return {
    // ── outputs/simulation-results.json ────────────────────────────────────────────────────────────
    'simulation-results.json': [
      { path: /^\.pass1_fresh_seeds\.totalRounds$/, domain: exactly(SIM_PASS1_ROUNDS_TOTAL, 'SIM_PASS1_ROUNDS_TOTAL') },
      { path: /^\.pass1_fresh_seeds\.streams$/, domain: exactly(SIM_PASS1_STREAMS, 'SIM_PASS1_STREAMS') },
      { path: /^\.pass1_fresh_seeds\.roundsPerStream$/, domain: exactly(SIM_PASS1_ROUNDS_EACH, 'SIM_PASS1_ROUNDS_EACH') },
      { path: /^\.pass1_fresh_seeds\.targets\[\]$/, domain: D('a declared simulation target', v => SIM_CASHOUT_TARGETS.includes(v)) },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.chi2$/, domain: CHI_SQUARED },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.df$/, domain: intBetween(1, SIM_NUM_BINS - 1, 'bins − 1 after pooling') },
      { path: /^\.pass1_fresh_seeds\.streamResults\[\]\.pValue$/, domain: PROBABILITY },
      { path: /^\.pass1_fresh_seeds\.fisherCombined\.statistic$/, domain: CHI_SQUARED },
      { path: /^\.pass1_fresh_seeds\.fisherCombined\.df$/, domain: exactly(2 * SIM_PASS1_STREAMS, '2 × streams') },
      { path: /^\.pass1_fresh_seeds\.fisherCombined\.pValue$/, domain: PROBABILITY },
      { path: /^\.pass1_fresh_seeds\.lag1R$/, domain: CORRELATION },
      { path: /^\.pass1_fresh_seeds\.lag1Z$/, domain: FINITE },
      { path: /^\.pass1_fresh_seeds\.runsP$/, domain: PROBABILITY },
      ...perTarget('.pass1_fresh_seeds.perTargetRTP'),
      { path: /^\.pass1_fresh_seeds\.simulatedRTP$/, domain: realBetween(0, 2, 'an attainable average payout at the 2× target') },
      { path: /^\.pass1_fresh_seeds\.theoreticalMaxRTP$/, domain: exactly(0.999, 'the declared 0.999 ceiling') },
      { path: /^\.pass1_fresh_seeds\.convergenceData\[\]\.rounds$/, domain: intBetween(1, SIM_PASS1_ROUNDS_TOTAL, 'a cumulative round mark') },
      ...perTarget('.pass1_fresh_seeds.convergenceData[].rtp'),
      { path: /^\.pass2_casino_seeds\.seedsTested$/, domain: exactly(EXPECTED_DISTINCT_SEEDS, 'EXPECTED_DISTINCT_SEEDS') },
      { path: /^\.pass2_casino_seeds\.noncesPerSeed$/, domain: exactly(SIM_PASS2_DRAND_PER_SEED, 'SIM_PASS2_DRAND_PER_SEED') },
      { path: /^\.pass2_casino_seeds\.capturedReplayMismatches$/, domain: intAtMost(EXPECTED_DISTINCT_SEEDS, 'a count of captured rounds') },
      { path: /^\.pass2_casino_seeds\.capturedWins$/, domain: intAtMost(EXPECTED_DISTINCT_SEEDS, 'a count of captured rounds') },
      // Return in hundredths: each of seeds × N reference draws pays 0 or its target (≤ the largest declared target).
      { path: /^\.pass2_casino_seeds\.returnCents$/, domain: intAtMost(EXPECTED_DISTINCT_SEEDS * SIM_PASS2_DRAND_PER_SEED * Math.round(Math.max(...EXPECTED_CASHOUT_TARGETS) * 100), 'an attainable return in hundredths') },
      { path: /^\.pass2_casino_seeds\.expectedReturn$/, domain: realBetween(0, EXPECTED_DISTINCT_SEEDS * SIM_PASS2_DRAND_PER_SEED * Math.max(...EXPECTED_CASHOUT_TARGETS), 'an attainable expected return') },
      { path: /^\.pass2_casino_seeds\.returnVariance$/, domain: NONNEG_REAL },
      { path: /^\.pass2_casino_seeds\.(returnZ|rankSumZ)$/, domain: FINITE },
    ],

    // ── outputs/drand-api-verification.json ────────────────────────────────────────────────────────
    'drand-api-verification.json': [
      { path: /^\.totalRounds$/, domain: exactly(EXPECTED_ROUNDS, 'EXPECTED_ROUNDS') },
      { path: /^\.passed$/, domain: intAtMost(EXPECTED_ROUNDS, 'a count within the audited rounds') },
      { path: /^\.failed$/, domain: intAtMost(EXPECTED_ROUNDS, 'a count within the audited rounds') },
      { path: /^\.results\[\]\.roundId$/, domain: POSITIVE_INT },
      { path: /^\.results\[\]\.drandRoundId$/, domain: POSITIVE_INT },
    ],
  };
}

export interface DomainViolation {
  path: string;
  value: number;
  expected: string;
}

/** Collect every numeric leaf of `doc` as `[collapsedPath, value]`. */
export function numericLeaves(doc: unknown, path = '', out: [string, number][] = []): [string, number][] {
  if (typeof doc === 'number') { out.push([collapsePath(path), doc]); return out; }
  if (doc === null || typeof doc !== 'object') return out;
  if (Array.isArray(doc)) {
    doc.forEach((v, i) => numericLeaves(v, `${path}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) numericLeaves(v, `${path}.${k}`, out);
  return out;
}

/**
 * Validate every numeric leaf of `doc` against `rules`.
 *
 * A leaf matched by NO rule is a violation in its own right (`uncovered`). That is deliberate: an
 * unbounded new field is precisely how this class reopens, and a silent fallback to "must be finite"
 * would have accepted the impossible.
 */
export function validateDomains(doc: unknown, rules: Rule[]): { violations: DomainViolation[]; uncovered: string[]; checked: number } {
  const violations: DomainViolation[] = [];
  const uncovered: string[] = [];
  const leaves = numericLeaves(doc);
  for (const [p, v] of leaves) {
    const rule = rules.find(r => r.path.test(p));
    if (!rule) {
      if (!uncovered.includes(p)) uncovered.push(p);
      continue;
    }
    if (!rule.domain.ok(v)) violations.push({ path: p, value: v, expected: rule.domain.label });
  }
  return { violations, uncovered, checked: leaves.length };
}

/** One-line summaries for a step's detail string. */
export function describeDomainFailures(artifact: string, r: { violations: DomainViolation[]; uncovered: string[] }): string[] {
  const out: string[] = [];
  for (const v of r.violations.slice(0, 4)) {
    out.push(`${artifact}${v.path} = ${v.value} is not ${v.expected}`);
  }
  if (r.violations.length > 4) out.push(`${artifact}: +${r.violations.length - 4} more impossible value(s)`);
  for (const p of r.uncovered.slice(0, 4)) {
    out.push(`${artifact}${p} has no declared value domain (add one in src/domains.ts)`);
  }
  if (r.uncovered.length > 4) out.push(`${artifact}: +${r.uncovered.length - 4} more undeclared field(s)`);
  return out;
}
