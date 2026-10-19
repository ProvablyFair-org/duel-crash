/**
 * Replay of the two-pass simulation, used by Steps 13–14.
 *
 * WHY THIS EXISTS. Steps 13–14 used to score the scalars src/simulate.ts wrote into
 * outputs/simulation-results.json — Fisher's p, lag-1 z, runs p, the chi-squared failure count —
 * without recomputing any of them. Every one of those is a number a hand edit can set, and the
 * per-round rows they were computed from are not shipped. They do not need to be: every simulated
 * round is a deterministic function of an HMAC-derived seed (the same derivation src/simulate.ts
 * uses), so the verifier regenerates the rounds itself and recomputes every scored statistic from
 * them. The artifact is then compared to the replay; it is not believed.
 *
 * The replay is written here, beside the steps, and does not import src/simulate.ts: importing it
 * would run the simulator and write files. The crash-point function is src/rng.ts's, which Step 5
 * binds to all 1,100 live rounds; the statistics are src/stats.ts's.
 */

import * as crypto from 'crypto';
import { computeCrashPoint, computeCrashPointFromBuffer, survivalProbability } from '../../src/rng';
import { chiSquaredTest, chiSquaredPValue, lag1Autocorrelation, runsTest } from '../../src/stats';

/** The simulation plan of record — the constants src/simulate.ts runs with. */
export const SIM_PASS1_STREAMS = 10;
export const SIM_PASS1_ROUNDS_EACH = 500_000;
export const SIM_PASS1_ROUNDS_TOTAL = SIM_PASS1_STREAMS * SIM_PASS1_ROUNDS_EACH;
export const SIM_PASS2_DRAND_PER_SEED = 10_000;
export const SIM_CASHOUT_TARGETS: readonly number[] = Object.freeze([1.5, 2, 5, 10, 50]);

const BIN_EDGES = [1.00, 1.01, 1.10, 1.50, 2.00, 3.00, 5.00, 10.00, 20.00, 50.00, 100.00, Infinity];
const NUM_BINS = BIN_EDGES.length - 1;

function deterministicHex(seed: string, index: number, bytes: number): string {
  return crypto.createHmac('sha256', seed).update(String(index)).digest('hex').slice(0, bytes * 2);
}

function binIndex(cp: number): number {
  for (let i = 0; i < NUM_BINS; i++) if (cp < BIN_EDGES[i + 1]) return i;
  return NUM_BINS - 1;
}

function expectedFractions(): number[] {
  const f: number[] = [];
  for (let i = 0; i < NUM_BINS; i++) {
    const lo = survivalProbability(BIN_EDGES[i]);
    const hi = BIN_EDGES[i + 1] === Infinity ? 0 : survivalProbability(BIN_EDGES[i + 1]);
    f.push(lo - hi);
  }
  return f;
}

export interface ReplayPass1 {
  totalRounds: number;
  streams: number;
  roundsPerStream: number;
  streamResults: { chi2: number; df: number; pValue: number }[];
  fisherCombined: { statistic: number; df: number; pValue: number };
  lag1R: number;
  lag1Z: number;
  runsP: number;
  perTargetRTP: Record<string, number>;
  simulatedRTP: number;
}

export function replayPass1(): ReplayPass1 {
  const expFracs = expectedFractions();
  const streamResults: { chi2: number; df: number; pValue: number }[] = [];
  const all: number[] = new Array(SIM_PASS1_ROUNDS_TOTAL);
  const totalPayout: Record<number, number> = {};
  for (const t of SIM_CASHOUT_TARGETS) totalPayout[t] = 0;

  let g = 0;
  for (let s = 0; s < SIM_PASS1_STREAMS; s++) {
    const observed = new Array(NUM_BINS).fill(0);
    for (let i = 0; i < SIM_PASS1_ROUNDS_EACH; i++) {
      const cp = computeCrashPoint(
        deterministicHex(`pass1-server-stream-${s}`, i, 32),
        deterministicHex(`pass1-drand-stream-${s}`, i, 48),
      );
      observed[binIndex(cp)]++;
      all[g++] = cp;
      for (const t of SIM_CASHOUT_TARGETS) if (cp >= t) totalPayout[t] += t;
    }
    const chi2 = chiSquaredTest(observed, expFracs.map(f => f * SIM_PASS1_ROUNDS_EACH));
    streamResults.push({ chi2: chi2.chi2, df: chi2.df, pValue: chi2.pValue });
  }

  const statistic = -2 * streamResults.reduce((a, r) => a + Math.log(r.pValue), 0);
  const df = 2 * SIM_PASS1_STREAMS;
  const lag1 = lag1Autocorrelation(all);
  const runs = runsTest(all);
  const perTargetRTP: Record<string, number> = {};
  for (const t of SIM_CASHOUT_TARGETS) perTargetRTP[String(t)] = totalPayout[t] / SIM_PASS1_ROUNDS_TOTAL;

  return {
    totalRounds: SIM_PASS1_ROUNDS_TOTAL,
    streams: SIM_PASS1_STREAMS,
    roundsPerStream: SIM_PASS1_ROUNDS_EACH,
    streamResults,
    fisherCombined: { statistic, df, pValue: chiSquaredPValue(statistic, df) },
    lag1R: lag1.r,
    lag1Z: lag1.z,
    runsP: runs.p,
    perTargetRTP,
    simulatedRTP: perTargetRTP['2'],
  };
}

/**
 * PASS 2 — CHERRY-PICK SCREEN ON THE CASH-OUT TARGETS ACTUALLY PLAYED (profile CRASH-21, rewritten
 * 2026-09-26; it replaced a per-seed chi-squared fail count).
 *
 * Crash has no nonce and no epoch: each round carries its own server seed and commitment hash (that
 * the commitment existed before the drand beacon it is combined with is ASSUMED, MANIFEST DL-2). For every revealed seed the round the casino actually
 * settled is the CAPTURED draw (its real beacon), and SIM_PASS2_DRAND_PER_SEED deterministic beacon
 * values give the reference population for the same seed at the same cash-out target — the one the
 * round was played at. Two pre-registered one-sided statistics, each at α = PASS2_ALPHA_EACH so the
 * family is at PASS2_FAMILY_ALPHA (Bonferroni):
 *
 *   (1) RETURN — the unit-stake return of the played targets over all seed × reference draws against
 *       its EXACT mean Σ N·t·p(t) and variance Σ N·t²·p(t)(1−p(t)), p(t) = src/rng.ts
 *       survivalProbability (Step 12 proves it equals the uint32 count exactly). A seed population
 *       that pays less than the law at the targets played is flagged.
 *   (2) CAPTURED vs REFERENCE — under "no cherry-pick" the captured beacon is one more draw from the
 *       same law for that seed, so the captured round's payout is EXCHANGEABLE with the seed's
 *       reference payouts and its mid-rank among the N+1 values is uniform: an EXACT permutation null
 *       per seed, no bootstrap, no assumed rate. Rank sums over seeds give Z. A seed chosen after the
 *       beacon was known (the attack a beacon design must exclude) makes captured rounds lose more
 *       often than their seed's reference, and Z goes negative.
 *
 * The replay also recomputes each captured round from its revealed seed and real beacon and requires
 * the served crash point exactly; returns are summed in integer hundredths (targets are on the 0.01
 * grid) so the observed return is exact.
 */
export const PASS2_FAMILY_ALPHA = 0.001;
export const PASS2_ALPHA_EACH = PASS2_FAMILY_ALPHA / 2;
/** One-sided critical z at PASS2_ALPHA_EACH = 0.0005: Φ⁻¹(0.0005). */
export const PASS2_Z_CRIT = -3.2905267314919255;

export interface Pass2Round {
  serverSeed: string;
  drandRandomness: string;
  crashPoint: number;
  target: number;
}

export interface ReplayPass2 {
  seedsTested: number;
  noncesPerSeed: number;
  capturedReplayMismatches: number;
  returnCents: number;
  expectedReturn: number;
  returnVariance: number;
  returnZ: number;
  returnRTP: number;
  expectedRTP: number;
  capturedWins: number;
  capturedExpectedWins: number;
  rankSumZ: number;
  capturedBelowMedian: number;
  capturedAboveMedian: number;
  rankDetectableLossFraction: number;
  returnDetectableShortfall: number;
}

/** `rounds`: one per revealed seed, in first-appearance order of the dataset, as src/simulate.ts builds them. */
export function replayPass2(rounds: Pass2Round[]): ReplayPass2 {
  const N = SIM_PASS2_DRAND_PER_SEED;
  let mismatches = 0, retCents = 0, E = 0, V = 0, capWins = 0, capExp = 0;
  let rankSum = 0, rankVar = 0, below = 0, above = 0, shiftPerUnitF = 0;
  for (let s = 0; s < rounds.length; s++) {
    const r = rounds[s];
    const key = Buffer.from(r.serverSeed, 'hex');
    const t = r.target;
    const tc = Math.round(t * 100);
    const p = survivalProbability(t);
    let wins = 0;
    for (let d = 0; d < N; d++) {
      if (computeCrashPointFromBuffer(key, deterministicHex('pass2-drand-' + s, d, 48)) >= t) wins++;
    }
    retCents += wins * tc;
    E += N * t * p;
    V += N * t * t * p * (1 - p);
    const cp0 = computeCrashPointFromBuffer(key, r.drandRandomness);
    if (cp0 !== r.crashPoint) mismatches++;
    const w0 = cp0 >= t ? 1 : 0;
    capWins += w0; capExp += p;
    // mid-ranks of a loss and a win among the N+1 values {captured} ∪ reference
    const W = wins + w0, L = N + 1 - W;
    const rl = (L + 1) / 2, rw = L + (W + 1) / 2, meanR = (N + 2) / 2;
    const r0 = w0 ? rw : rl;
    rankSum += r0 - meanR;
    rankVar += (L * (rl - meanR) ** 2 + W * (rw - meanR) ** 2) / (N + 1);
    if (r0 < meanR) below++; else if (r0 > meanR) above++;
    shiftPerUnitF += p * (rw - rl);
  }
  const returnZ = (retCents / 100 - E) / Math.sqrt(V);
  const rankSumZ = rankSum / Math.sqrt(rankVar);
  const stakes = N * rounds.length;
  return {
    seedsTested: rounds.length,
    noncesPerSeed: N,
    capturedReplayMismatches: mismatches,
    returnCents: retCents,
    expectedReturn: E,
    returnVariance: V,
    returnZ,
    returnRTP: rounds.length === 0 ? NaN : retCents / 100 / stakes,
    expectedRTP: rounds.length === 0 ? NaN : E / stakes,
    capturedWins: capWins,
    capturedExpectedWins: capExp,
    rankSumZ,
    capturedBelowMedian: below,
    capturedAboveMedian: above,
    // Power, each at ≥ 50 %: the fraction of would-be winning captured rounds turned into losses that
    // moves the expected rank sum to the critical value; and the relative RTP shortfall across the seed
    // population that moves the expected return z to it.
    rankDetectableLossFraction: (-PASS2_Z_CRIT) * Math.sqrt(rankVar) / shiftPerUnitF,
    returnDetectableShortfall: (-PASS2_Z_CRIT) * Math.sqrt(V) / E,
  };
}
