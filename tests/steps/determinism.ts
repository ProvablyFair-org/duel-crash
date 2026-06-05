/**
 * Steps 5–6: Determinism verification for Crash.
 *   5. Outcome Recomputation — computeCrashPoint matches all 1100 rounds
 *   6. Bet-Size Invariance — Phase C ($10) crash points recompute identically
 */

import { computeCrashPoint } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds, phaseC } = ctx;

  // Step 5: Outcome Recomputation
  {
    let match = 0;
    let mismatch = 0;
    const mismatches: string[] = [];
    for (const r of rounds) {
      const computed = computeCrashPoint(r.result.serverSeed, r.result.drandRandomness);
      if (computed === r.result.crashPoint) {
        match++;
      } else {
        mismatch++;
        if (mismatches.length < 5) {
          mismatches.push(`round ${r.roundId}: expected ${r.result.crashPoint}, got ${computed}`);
        }
      }
    }
    const detail = mismatch === 0
      ? `${match}/${rounds.length} crash points recomputed — 100% parity`
      : `${mismatch} mismatches: ${mismatches.join('; ')}`;
    results.push({
      step: 5,
      name: 'Outcome Recomputation',
      status: mismatch === 0 ? 'PASS' : 'FAIL',
      detail,
    });
  }

  // Step 6: Bet-Size Invariance
  {
    let match = 0;
    let mismatch = 0;
    for (const r of phaseC) {
      const computed = computeCrashPoint(r.result.serverSeed, r.result.drandRandomness);
      if (computed === r.result.crashPoint) match++;
      else mismatch++;
    }
    results.push({
      step: 6,
      name: 'Bet-Size Invariance',
      status: mismatch === 0 ? 'PASS' : 'FAIL',
      detail: `${match}/${phaseC.length} Phase C ($10) rounds recompute identically — crash point is independent of bet amount`,
    });
  }

  return results;
}
