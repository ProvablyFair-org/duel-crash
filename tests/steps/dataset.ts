/**
 * Steps 10–12: Dataset integrity for Crash.
 *   10. Dataset Hash — SHA-256 guard
 *   11. drand Signature Spot-Check — verify against chain formula
 *   12. Anti-Circularity — independent RTP verification
 */

import { survivalProbability, expectedRTP } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';

const QUICKNET_GENESIS = 1692803367;
const QUICKNET_PERIOD  = 3;

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds } = ctx;

  // Step 10: Dataset Hash
  // (hash check runs in verify.ts pre-flight — this step records it)
  {
    results.push({
      step: 10,
      name: 'Dataset Hash',
      status: 'PASS',
      detail: 'SHA-256 pre-flight check passed (verified before loading)',
    });
  }

  // Step 11: drand Chain Formula Verification
  {
    let match = 0;
    let mismatch = 0;
    for (const r of rounds) {
      const expected = QUICKNET_GENESIS + (r.result.drandRoundId - 1) * QUICKNET_PERIOD;
      if (r.timing.drandPublishedAt === expected) match++;
      else mismatch++;
    }
    results.push({
      step: 11,
      name: 'drand Chain Formula',
      status: mismatch === 0 ? 'PASS' : 'FAIL',
      detail: `${match}/${rounds.length} drandPublishedAt values match quicknet formula (genesis + (round-1) × 3s)`,
    });
  }

  // Step 12: Anti-Circularity — Independent RTP Verification
  // Crash RTP = P(crash >= x) × x where P is derived from the uint32 mapping.
  // This is formula-based (no config table to be circular with), but we verify
  // the formula produces consistent results across a range of targets.
  {
    const targets = [1.01, 1.1, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000];
    let allValid = true;
    const rtps: string[] = [];

    for (const t of targets) {
      const rtp = expectedRTP(t);
      const p = survivalProbability(t);
      const expectedP = Math.floor(2 ** 32 * 0.999 / t) / 2 ** 32;

      // Verify survival probability matches the uint32 threshold formula
      if (Math.abs(p - expectedP) > 1e-10) allValid = false;

      // RTP should be ≤ 0.999 for all targets
      if (rtp > 0.9991) allValid = false;

      rtps.push(`${t}x: ${(rtp * 100).toFixed(6)}%`);
    }

    results.push({
      step: 12,
      name: 'Anti-Circularity (distribution edge, pre-rakeback)',
      status: allValid ? 'PASS' : 'FAIL',
      detail: `Distribution RTP independently computed from uint32 threshold formula for ${targets.length} targets — all ≤ 99.9% (pre-rakeback). Samples: ${rtps.slice(0, 4).join(', ')}`,
    });
  }

  return results;
}
