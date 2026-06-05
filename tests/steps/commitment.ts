/**
 * Steps 1–4: Commitment verification for Crash.
 *   1. Seed Hash Integrity — SHA256(serverSeed) === serverSeedHash
 *   2. drand Commitment Timing — drandPublishedAt*1000 - betPlacedAt > 0 for all rounds
 *   3. drand Round Monotonicity — drand rounds strictly increasing
 *   4. Server Seed Uniqueness — all seeds distinct
 */

import { verifyHash } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds } = ctx;

  // Step 1: Seed Hash Integrity
  {
    let pass = 0;
    let fail = 0;
    for (const r of rounds) {
      if (verifyHash(r.result.serverSeed, r.result.serverSeedHash)) pass++;
      else fail++;
    }
    results.push({
      step: 1,
      name: 'Seed Hash Integrity',
      status: fail === 0 ? 'PASS' : 'FAIL',
      detail: `${pass}/${rounds.length} hashes verified — SHA-256(serverSeed_bytes) === serverSeedHash`,
    });
  }

  // Step 2: drand Commitment Timing (pre-commitment)
  // Recomputes the margin from raw authoritative fields — drandPublishedAt (seconds,
  // from drand chain formula) and betPlacedAt (milliseconds, from transactions API).
  // Does NOT rely on the precomputed commitmentBeforeDrand field.
  {
    let positive = 0;
    let nonPositive = 0;
    let minMarginMs = Infinity;
    let maxMarginMs = -Infinity;
    let sumMs = 0;
    for (const r of rounds) {
      const cbd = r.timing.drandPublishedAt * 1000 - r.timing.betPlacedAt;  // milliseconds
      if (cbd > 0) {
        positive++;
        if (cbd < minMarginMs) minMarginMs = cbd;
        if (cbd > maxMarginMs) maxMarginMs = cbd;
        sumMs += cbd;
      } else {
        nonPositive++;
      }
    }
    const medianMs = sumMs / Math.max(1, positive);
    results.push({
      step: 2,
      name: 'drand Commitment Timing (Pre-Commitment)',
      status: nonPositive === 0 ? 'PASS' : 'FAIL',
      detail: `${positive}/${rounds.length} rounds — bet placed before drand published (min margin: ${(minMarginMs/1000).toFixed(3)}s, mean: ${(medianMs/1000).toFixed(3)}s, max: ${(maxMarginMs/1000).toFixed(3)}s; via authoritative transactions-API timestamp + drand chain formula)`,
    });
  }

  // Step 3: drand Round Monotonicity
  {
    let monotonic = true;
    let violations = 0;
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i].result.drandRoundId <= rounds[i - 1].result.drandRoundId) {
        monotonic = false;
        violations++;
      }
    }
    results.push({
      step: 3,
      name: 'drand Round Monotonicity',
      status: monotonic ? 'PASS' : 'FAIL',
      detail: monotonic
        ? `${rounds.length} rounds — drand round IDs strictly increasing (monotonic — no replays or reordering)`
        : `${violations} monotonicity violations detected`,
    });
  }

  // Step 4: Server Seed Uniqueness
  {
    const seeds = new Set(rounds.map(r => r.result.serverSeed));
    const hashes = new Set(rounds.map(r => r.result.serverSeedHash));
    const allUnique = seeds.size === rounds.length && hashes.size === rounds.length;
    results.push({
      step: 4,
      name: 'Server Seed Uniqueness',
      status: allUnique ? 'PASS' : 'FAIL',
      detail: `${seeds.size} unique seeds, ${hashes.size} unique hashes out of ${rounds.length} rounds`,
    });
  }

  return results;
}
