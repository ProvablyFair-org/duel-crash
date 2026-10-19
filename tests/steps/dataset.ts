/**
 * Steps 10–12: Dataset integrity for Crash.
 *   10. Dataset Hash — SHA-256 guard
 *   11. drand Chain Formula — every round's drandPublishedAt equals genesis + (round − 1) × 3 s
 *       (the signatures themselves are Step 15)
 *   12. Anti-Circularity — RTP counted from an independent per-value model, bound to live rounds,
 *       instant-crash probability counted, and negative controls on both comparisons
 */

import { survivalProbability, instantCrashProbability } from '../../src/rng';
import { crashFromValue, valueFromRound, countAtOrAbove, countAtOrAboveWith, rtpDeficitUnits, deficitAsRtp, TWO32 } from './crash-model';
import type { VerifyContext, StepResult } from './context';
import { checkDatasetHash, EXPECTED_ROUNDS } from '../../src/loader';

const QUICKNET_GENESIS = 1692803367;
const QUICKNET_PERIOD  = 3;

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds } = ctx;

  // Step 10: Dataset Hash
  // (verify.ts also checks the hash before loading; this step recomputes it on its own, so a verifier
  // whose pre-flight abort was removed still fails a changed dataset — mutation M10)
  {
    const h = checkDatasetHash();
    results.push({
      step: 10,
      name: 'Dataset Hash',
      status: h.match ? 'PASS' : 'FAIL',
      detail: h.match
        ? 'SHA-256 pre-flight check passed (verified before loading)'
        : 'SHA-256 of the dataset does not match the pin in src/loader.ts',
      data: { expected: h.expected, actual: h.actual, match: h.match },
    });
  }

  // Step 11: drand Chain Formula Verification
  // Bound to the declared population: with one round, "0 mismatches" was free.
  {
    let match = 0;
    const mismatches: string[] = [];
    for (const r of rounds) {
      const expected = QUICKNET_GENESIS + (r.result.drandRoundId - 1) * QUICKNET_PERIOD;
      if (r.timing.drandPublishedAt === expected) match++;
      else mismatches.push(`round ${r.roundId}: drandPublishedAt ${r.timing.drandPublishedAt} != ${expected}`);
    }
    const popIssues: string[] = [];
    if (match !== EXPECTED_ROUNDS) popIssues.push(`rounds matching the chain formula ${match} != ${EXPECTED_ROUNDS}`);

    const ok = mismatches.length === 0 && popIssues.length === 0;
    results.push({
      step: 11,
      name: 'drand Chain Formula',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `All ${EXPECTED_ROUNDS} rounds required by src/loader.ts: drandPublishedAt equals the quicknet chain formula, genesis + (round − 1) × 3s`
        : popIssues.length > 0
          ? `POPULATION MISMATCH vs src/loader.ts: ${popIssues.join('; ')}`
          : `${mismatches.length} drandPublishedAt values do not match the quicknet chain formula`,
      data: { matched: match, mismatched: mismatches.length, populationIssues: popIssues, failures: mismatches.slice(0, 10) },
    });
  }

  // Step 12: Anti-Circularity — Independent RTP Verification
  // The survival probability and RTP are derived WITHOUT the closed form in src/rng.ts: the
  // per-value mapping in ./crash-model is first bound to every captured round (its own HMAC,
  // its own mapping, compared with the live crash point), then the uint32 values reaching each
  // target are COUNTED. src/rng.ts must produce the same integer count, and each RTP is held to
  // the 0.999 ceiling in integer arithmetic — no tolerance, no ceiling padding.
  {
    const targets = [1.01, 1.1, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000];
    const failures: string[] = [];

    // (a) bind the independent mapping to the live population
    let liveBound = 0;
    const liveMismatch: string[] = [];
    for (const r of rounds) {
      const cp = crashFromValue(valueFromRound(r.result.serverSeed, r.result.drandRandomness));
      if (cp === r.result.crashPoint) liveBound++;
      else if (liveMismatch.length < 3) liveMismatch.push(`round ${r.roundId}: model ${cp} vs live ${r.result.crashPoint}`);
    }
    if (liveBound !== EXPECTED_ROUNDS) {
      failures.push(`independent mapping reproduces ${liveBound}/${EXPECTED_ROUNDS} live crash points (population of record)${liveMismatch.length ? ': ' + liveMismatch.join('; ') : ''}`);
    }

    // (b) counted survival vs src/rng.ts, exact; (c) RTP vs the 0.999 ceiling, exact
    const perTarget: Record<string, { counted: number; rngCount: number; rtp: number; shortfall: number }> = {};
    let countMismatches = 0;
    let aboveCeiling = 0;
    for (const t of targets) {
      const counted = countAtOrAbove(t);
      const rngCount = survivalProbability(t) * TWO32;
      if (!Number.isInteger(rngCount) || rngCount !== counted) {
        countMismatches++;
        failures.push(`${t}×: src/rng.ts survival × 2^32 = ${rngCount}, counted from the per-value mapping = ${counted}`);
      }
      const { deficit } = rtpDeficitUnits(counted, t);
      if (deficit < 0n) {
        aboveCeiling++;
        failures.push(`${t}×: counted RTP ${counted * t / TWO32} is above the 0.999 ceiling`);
      }
      perTarget[`${t}x`] = { counted, rngCount, rtp: counted * t / TWO32, shortfall: deficitAsRtp(deficit) };
    }

    // (d) instant-crash probability (CRASH-10): P(crash = 1.00) = 1 − count(1.01) / 2^32, counted from
    // the independent model and required to equal src/rng.ts instantCrashProbability() exactly.
    const instantCount = TWO32 - countAtOrAbove(1.01);
    const instantP = instantCount / TWO32;
    if (instantP !== instantCrashProbability()) {
      failures.push(`instant-crash probability: counted ${instantP} vs src/rng.ts ${instantCrashProbability()}`);
    }

    // (e) NEGATIVE CONTROLS (CRASH-18). A predicate that cannot fail proves nothing, so both
    // comparisons this step rests on are shown to reject a corruption: the live-binding equality
    // must reject every live crash point moved by one hundredth, and the count comparison must
    // disagree with src/rng.ts at some target when the map's edge factor is mis-wired to 0.998.
    let corruptAccepted = 0;
    for (const r of rounds) {
      const cp = crashFromValue(valueFromRound(r.result.serverSeed, r.result.drandRandomness));
      if (cp === Math.round(r.result.crashPoint * 100 + 1) / 100) corruptAccepted++;
    }
    const wrongMap = (v: number): number => Math.max(1, Math.floor(Math.max(1, (TWO32 / (v + 1)) * 0.998) * 100) / 100);
    const wrongMapCaught = targets.filter(t => countAtOrAboveWith(wrongMap, t) !== survivalProbability(t) * TWO32).length;
    if (corruptAccepted > 0) failures.push(`negative control: ${corruptAccepted} live crash point(s) moved by 0.01 were still accepted`);
    if (wrongMapCaught === 0) failures.push('negative control: a map with edge factor 0.998 produced the same counts as src/rng.ts at every target');

    results.push({
      step: 12,
      name: 'Anti-Circularity',
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      detail: failures.length === 0
        ? `Independent per-value model reproduces ${liveBound}/${EXPECTED_ROUNDS} live crash points; at ${targets.length} cash-out targets the uint32 values reaching each target were counted from that model and equal src/rng.ts's survival × 2^32 exactly (${countMismatches} mismatches), and every counted RTP is at or below 0.999 in integer arithmetic (${aboveCeiling} above); the instant-crash probability counted from the model equals src/rng.ts exactly. Negative controls: ${rounds.length - corruptAccepted}/${rounds.length} live crash points moved by 0.01 rejected, and a map mis-wired to edge factor 0.998 disagrees with src/rng.ts at ${wrongMapCaught}/${targets.length} targets. Per-target counts and P(1.00) in this step's data block.`
        : `${failures.length} anti-circularity failures: ${failures.slice(0, 3).join('; ')}`,
      data: {
        targetsTested: targets.length,
        liveRoundsReproduced: liveBound,
        instantCrashCount: instantCount,
        instantCrashProbability: instantP,
        negativeControlCorruptAccepted: corruptAccepted,
        negativeControlWrongMapTargetsCaught: wrongMapCaught,
        countMismatches,
        aboveCeiling,
        rtpCeiling: 0.999,
        perTarget,
        failures,
      },
    });
  }

  return results;
}
