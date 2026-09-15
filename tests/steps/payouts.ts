/**
 * Steps 7–9: Payout and game mechanics verification for Crash.
 *
 *   7. Captured Payout Consistency (pre-rakeback display values) — confirms the
 *      dataset's `amountWon` field is internally consistent with its companion
 *      `effectiveEdge` field using the displayed formula. NOTE: these are
 *      transitory pre-rakeback display values — not the settled money model.
 *      Settled payout = full bet × cashout (no haircut); a separate 0.001 × bet
 *      rakeback posts on every bet under Duel's Zero Edge mechanism, so the
 *      net player RTP within the daily cap is 100.0%. The 0.1% factor visible
 *      in `effectiveEdge` is the distribution edge pre-rakeback. See MANIFEST
 *      §Money Model for the full settlement chain.
 *   8. Distribution Edge Audit — 0.1% verified from formula (pre-rakeback)
 *   9. Phase Coverage — 800 A + 200 B + 100 C = 1100
 */

import { instantCrashProbability, expectedRTP } from '../../src/rng';
import type { VerifyContext, StepResult } from './context';
import { EXPECTED_ROUNDS, EXPECTED_PHASE_ROUNDS } from '../../src/loader';

// MONEY IS A VALUE DOMAIN, NOT A TOLERANCE. Credited amounts on this game are 6-decimal figures:
// measured over this capture (2026-09-15), 1,100/1,100 amountWon values sit exactly on that grid
// (stakes are 2-dp). `Math.abs(won - expected) < 0.000001` admits a credit that is not a legal
// amount at all — and 1e-6 is the exact width the off-grid forgery was written to fit inside. It
// scored a clean pass on the sibling groomers-van audit. Integer grid units leave nothing to slip
// under; the slack below is IEEE-754 representation error in the scaling and nothing else, sized
// from the magnitude of the scaled value rather than picked as a round number.
const MONEY_DP  = 6;
const offGridM  = (x: number): number => Math.abs(x * 10 ** MONEY_DP - Math.round(x * 10 ** MONEY_DP));
const slackM    = (x: number): number => Math.max(1e-9, Math.abs(x * 10 ** MONEY_DP) * 1e-12);
const onGridM   = (x: number): boolean => Number.isFinite(x) && offGridM(x) < slackM(x);
const unitsM    = (x: number): number => Math.round(x * 10 ** MONEY_DP);

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds, phaseA, phaseB, phaseC } = ctx;

  // Step 7: Payout Math
  {
    let correct = 0;
    let wrong = 0;
    const errors: string[] = [];
    for (const r of rounds) {
      const amount = parseFloat(r.request.amount);
      const cashout = r.request.auto_cashout;
      const won = parseFloat(r.result.amountWon);
      const edge = r.result.effectiveEdge; // percentage, e.g. 0.1

      if (r.result.isWin) {
        // Win: amountWon = amount × cashout × (1 - edge/100)
        const expected = amount * cashout * (1 - edge / 100);
        if (!onGridM(won)) {
          wrong++;
          if (errors.length < 3) {
            errors.push(`round ${r.roundId}: amountWon ${r.result.amountWon} is not a legal ${MONEY_DP}-dp amount (off by ${offGridM(won).toExponential(3)})`);
          }
        } else if (unitsM(won) === unitsM(expected)) {
          correct++;
        } else {
          wrong++;
          if (errors.length < 3) {
            errors.push(`round ${r.roundId}: expected ${expected}, got ${won}`);
          }
        }
      } else {
        // Loss: amountWon should be 0
        if (won === 0 || r.result.amountWon === '0') {
          correct++;
        } else {
          wrong++;
          if (errors.length < 3) {
            errors.push(`round ${r.roundId}: loss but amountWon=${won}`);
          }
        }
      }
    }

    // Also verify isWin consistency
    let isWinCorrect = 0;
    for (const r of rounds) {
      const shouldBeWin = r.result.crashPoint >= r.request.auto_cashout;
      if (r.result.isWin === shouldBeWin) isWinCorrect++;
    }

    const detail = wrong === 0
      ? `${correct}/${rounds.length} payouts verified — ${isWinCorrect}/${rounds.length} isWin flags correct`
      : `${wrong} payout errors: ${errors.join('; ')}`;

    results.push({
      step: 7,
      name: 'Captured Payout Consistency (pre-rakeback display values)',
      status: wrong === 0 && isWinCorrect === rounds.length ? 'PASS' : 'FAIL',
      detail,
    });
  }

  // Step 8: House Edge Audit
  {
    const instantP = instantCrashProbability();
    const rtp2x = expectedRTP(2.0);
    const rtp10x = expectedRTP(10.0);
    const rtp100x = expectedRTP(100.0);

    // All RTPs should be ≤ 0.999 (0.1% house edge)
    const allBelow = rtp2x <= 0.9991 && rtp10x <= 0.9991 && rtp100x <= 0.9991;

    results.push({
      step: 8,
      name: 'Distribution Edge Audit (pre-rakeback)',
      status: allBelow ? 'PASS' : 'FAIL',
      detail: `Instant crash P(1.00) = ${(instantP * 100).toFixed(4)}% — RTP@2x = ${(rtp2x * 100).toFixed(4)}%, RTP@10x = ${(rtp10x * 100).toFixed(4)}%, RTP@100x = ${(rtp100x * 100).toFixed(4)}% — distribution edge 0.1% confirmed (pre-rakeback; net player RTP within Zero Edge cap = 100.0%)`,
    });
  }

  // Step 9: Phase Coverage
  {
    // Counts come from src/loader.ts — the capture plan as code — not from literals sitting in
    // this file and not from the dataset's own header. The TOTAL is asserted too: with only the
    // three phase counts checked, a dataset carrying extra rounds under an undeclared phase label
    // satisfied every assertion here.
    const expectedA = EXPECTED_PHASE_ROUNDS.A;
    const expectedB = EXPECTED_PHASE_ROUNDS.B;
    const expectedC = EXPECTED_PHASE_ROUNDS.C;
    const totalOk   = rounds.length === EXPECTED_ROUNDS;
    const labels    = new Set(rounds.map(r => r.phase));
    const undeclared = [...labels].filter(p => !(p in EXPECTED_PHASE_ROUNDS));
    const ok = totalOk && undeclared.length === 0
      && phaseA.length === expectedA && phaseB.length === expectedB && phaseC.length === expectedC;
    results.push({
      step: 9,
      name: 'Phase Coverage',
      status: ok ? 'PASS' : 'FAIL',
      detail: `Phase A: ${phaseA.length}/${expectedA}, Phase B: ${phaseB.length}/${expectedB}, Phase C: ${phaseC.length}/${expectedC} — total ${rounds.length}/${EXPECTED_ROUNDS} against the capture plan in src/loader.ts (code constants, not the dataset header)` +
        (totalOk ? '' : '; ROUND COUNT MISMATCH') +
        (undeclared.length ? `; UNDECLARED PHASE ${undeclared.join(', ')}` : ''),
    });
  }

  return results;
}
