/**
 * Step 16: Configuration Coverage — the auto-cash-out target
 *
 * Crash has one configuration dimension: `auto_cashout`, the multiplier at which the
 * bet leaves the round. Everything else in the suite verifies the FORMULA — the uint32
 * threshold, the payout, the 0.1% edge — and a formula check is exhaustive by
 * construction, so it says nothing about whether live play actually exercised the
 * dimension. A capture that only ever cashed out at 1.5× would satisfy all of them.
 *
 * This step measures the span and holds each declared target to a round-count floor
 * from src/loader.ts, so a target reduced to a token sample fails. It also reports the
 * targets the capture never exercised, and checks the claim it makes about them: that
 * they carry no unverified return, because the theoretical RTP is flat at the house
 * ceiling across the whole cash-out range. That flatness is measured here — both sides of the
 * ceiling, exactly, from the independent per-value model — rather than taken on Step 12's word — a step that asserts something it has not checked is
 * decoration.
 */

import { countAtOrAbove, rtpDeficitUnits, deficitAsRtp, TWO32 } from './crash-model';
import type { VerifyContext, StepResult } from './context';
import { EXPECTED_CASHOUT_TARGETS, MIN_ROUNDS_PER_CASHOUT_TARGET, RTP_GRID_MAX } from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const { rounds } = ctx;

  const perTarget: Record<string, number> = {};
  for (const r of rounds) {
    const k = String(r.request.auto_cashout);
    perTarget[k] = (perTarget[k] ?? 0) + 1;
  }

  const failures: string[] = [];
  for (const t of EXPECTED_CASHOUT_TARGETS) {
    const n = perTarget[String(t)] ?? 0;
    if (n < MIN_ROUNDS_PER_CASHOUT_TARGET) {
      failures.push(`cash-out ${t}×: ${n} rounds (floor ${MIN_ROUNDS_PER_CASHOUT_TARGET})`);
    }
  }
  const declared = new Set(EXPECTED_CASHOUT_TARGETS.map(String));
  const undeclared = Object.keys(perTarget).filter(k => !declared.has(k));
  for (const k of undeclared) {
    failures.push(`cash-out ${k}× appears in the data but is not a declared target in src/loader.ts`);
  }

  // RTP flatness across the cash-out range, sampled on a grid that spans the same space
  // the formula covers. TWO-SIDED and EXACT: at each grid point the uint32 values reaching the
  // target are counted from the independent per-value model (./crash-model), and the count must
  // be the largest the 0.999 ceiling allows — RTP neither above 0.999 (deficit < 0) nor below it
  // by a whole uint32 value's worth or more (deficit ≥ one quantum, i.e. shortfall ≥ x / 2^32).
  // The old check measured the shortfall side only, against a 1e-3 bound: an RTP ABOVE the
  // ceiling passed, and so did a shortfall about 43,000 times (1e-3 against 100/2^32) the largest the formula can produce.
  //
  // The grid is every 0.01 step from 1.01× to RTP_GRID_MAX (src/loader.ts, where the bound and its reason
  // are stated): Duel declares no maximum cash-out target and no cap, so the bound is stated, not implied.
  //
  // C3 (14 Oct 2026): only the side ABOVE the ceiling fails here — a count larger than the formula's own
  // 0.999 factor allows is a counting-model defect. A shortfall (RTP below 0.999 by a whole value or
  // more) is an RTP miss, and an RTP miss is the RTP-CLAIM rule's: every grid point is a row of the RTP
  // table (src/rtp-settings.ts, the same count), held to the claim on this step, and a miss beyond the
  // band makes the verdict RTP FIGURE OVERSTATED, exit 5 — never NOT PROVABLY FAIR from this check.
  // The shortfall is still counted and printed.
  const grid: number[] = [];
  for (let c = 101; c <= RTP_GRID_MAX * 100; c++) grid.push(c / 100);
  let aboveCeiling = 0;
  let belowByQuantum = 0;
  let maxRtpShortfall = 0;
  let worstTarget = 0;
  for (const t of grid) {
    const { deficit, quantum } = rtpDeficitUnits(countAtOrAbove(t), t);
    if (deficit < 0n) {
      aboveCeiling++;
      if (aboveCeiling <= 3) failures.push(`cash-out ${t}×: theoretical RTP above the 0.999 ceiling`);
    } else if (deficit >= quantum) {
      belowByQuantum++;   // reported, not failed: scored by RTP-CLAIM (see above)
    }
    const sf = deficitAsRtp(deficit);
    if (sf > maxRtpShortfall) { maxRtpShortfall = sf; worstTarget = t; }
  }
  const quantumAtMax = grid[grid.length - 1] / TWO32;

  const ok = failures.length === 0;
  return [{
    step: 16,
    name: 'Configuration Coverage (auto-cash-out target)',
    status: ok ? 'PASS' : 'FAIL',
    detail: ok
      ? `All ${EXPECTED_CASHOUT_TARGETS.length} declared cash-out targets carry at least the `
        + `${MIN_ROUNDS_PER_CASHOUT_TARGET}-round floor from src/loader.ts, and no undeclared target appears in the data. `
        + `Targets outside the captured set carry no unverified return: at all ${grid.length} cash-out points of the 0.01 grid from 1.01× to ${grid[grid.length - 1]}× (bound stated in src/loader.ts RTP_GRID_MAX; beyond it not enumerated) `
        + (belowByQuantum === 0
          ? `the counted theoretical RTP is at 0.999 to within one uint32 value's worth (≤ ${grid[grid.length - 1]}/2^32), `
          : `the counted theoretical RTP is at most 0.999 and below it by a whole uint32 value or more at ${belowByQuantum} point(s), `)
        + `${aboveCeiling} above the ceiling and ${belowByQuantum} below it by a whole value; a shortfall is not scored here: `
        + `each grid point is a row of the RTP table, held to the claim by RTP-CLAIM on this step. `
        + `Per-target counts in this step's data block.`
      : `${failures.length} coverage failures: ${failures.slice(0, 5).join('; ')}`,
    data: {
      declaredTargets: [...EXPECTED_CASHOUT_TARGETS],
      minRoundsPerTarget: MIN_ROUNDS_PER_CASHOUT_TARGET,
      roundsPerTarget: perTarget,
      undeclaredTargetsPresent: undeclared,
      rtpGridPoints: grid.length,
      rtpGridMax: grid[grid.length - 1],
      rtpCeiling: 0.999,
      flatnessBound: 'per target: 0 <= 0.999 - RTP < x / 2^32 (one uint32 value), decided in integers; above the ceiling fails, a shortfall is reported and scored by RTP-CLAIM',
      largestQuantum: quantumAtMax,
      aboveCeiling,
      belowByQuantum,
      maxRtpShortfall,
      worstTarget,
      unverifiedRTPShare: 0,
      note: (belowByQuantum === 0
            ? 'Theoretical RTP sits at the house ceiling, to within one uint32 value, at every cash-out target of the '
            : `Theoretical RTP is below the house ceiling by a whole uint32 value or more at ${belowByQuantum} cash-out target(s) of the `)
          + `enumerated grid (1.01× to ${grid[grid.length - 1]}×), so a target in that range the capture never exercised `
          + 'carries no unverified return — only no live observation of it. Above the grid it is not enumerated here, and '
          + 'the floor in the 2^32 count lowers it at some targets (MANIFEST.md#distribution-rtp, DL-5).',
      failures,
    },
  }];
}
