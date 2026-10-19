/**
 * Steps 7–9: Payout and game mechanics verification for Crash.
 *   7. Payout Math — recorded amountWon vs amount × cashout × (1 − declared edge), exact on the 6-dp grid;
 *      win rule and its boundary witnessed in data
 *   8. House Edge Audit — 0.1% edge verified from formula
 *   9. Phase Coverage — 800 A + 200 B + 100 C = 1100
 */

import { instantCrashProbability, expectedRTP, survivalProbability } from '../../src/rng';
import { rtpDeficitUnits, TWO32 } from './crash-model';
import type { VerifyContext, StepResult } from './context';
import { EXPECTED_ROUNDS, EXPECTED_PHASE_ROUNDS, DECLARED_EDGE_PERCENT } from '../../src/loader';

// MONEY IS A VALUE DOMAIN, NOT A TOLERANCE. Credited amounts on this game are 6-decimal figures:
// measured over this capture, 1,100/1,100 amountWon values sit exactly on that grid (stakes are
// 2-dp). `Math.abs(won - expected) < 0.000001` admitted a credit that is not a legal amount at
// all — and 1e-6 is the exact width an off-grid forgery would be written to fit inside. Every money
// string is parsed to integer grid units (BigInt, no float) and compared with no tolerance; a string
// that is not a legal 6-dp amount is off the grid and fails the step.
const MONEY_DP = 6;
function units6(s: string): bigint | null {
  const m = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(s);
  if (!m) return null;
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(MONEY_DP, '0'));
}

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];
  const { rounds, phaseA, phaseB, phaseC } = ctx;

  // Step 7: Payout Math
  // What this step measures is the dataset's `amountWon` field against amount × cashout × (1 − edge),
  // with the edge the DECLARED constant (src/loader.ts DECLARED_EDGE_PERCENT, the 0.1 % of MANIFEST.md#game-and-algorithm), never
  // the served `effectiveEdge` field: that field is only COMPARED with the declared constant, on every
  // round (profile CRASH-13 — no operator-supplied edge feeds a derivation). The comparison is exact
  // integer arithmetic on the 6-dp money grid: won_units · 100 · 1000 === stake_units · cashout_cents ·
  // (1000 − edge·10). It also counts the won rounds whose amountWon equals amount × cashout — the "no
  // haircut" settlement a rakeback money model would put there — so the step records which of the two
  // formulas the captured field follows rather than assuming it. The capture carries no balance or
  // rakeback record, so the credited amount is not something this step can see; it scores the
  // recorded field, and says so. The wallet ledger, looked up separately for six captured bets, credits
  // the full amount × cashout on 3/3 wins (MANIFEST Money Model, DL-1).
  //
  // The win rule (profile CRASH-10) is checked on every round — isWin ⇔ crashPoint ≥ auto_cashout — and
  // its boundary is WITNESSED from the data: rounds whose crash point equals the target exactly (ties)
  // and rounds exactly one hundredth below it are counted, with how each settled.
  {
    const edgeMilli = BigInt(Math.round(DECLARED_EDGE_PERCENT * 10));          // 0.1 % → 1 per mille
    let wonOk = 0, won = 0, lostOk = 0, lost = 0, fullBetModel = 0, offGrid = 0, edgeFieldDiffers = 0;
    const errors: string[] = [];
    for (const r of rounds) {
      if (r.result.effectiveEdge !== DECLARED_EDGE_PERCENT) {
        edgeFieldDiffers++;
        if (errors.length < 3) errors.push(`round ${r.roundId}: served effectiveEdge ${r.result.effectiveEdge} is not the declared ${DECLARED_EDGE_PERCENT}`);
      }
      const stake = units6(r.request.amount);
      const wonU = units6(r.result.amountWon);
      const cents = BigInt(Math.round(r.request.auto_cashout * 100));
      if (stake === null || wonU === null || Number(cents) / 100 !== r.request.auto_cashout) {
        offGrid++;
        if (errors.length < 3) errors.push(`round ${r.roundId}: amount ${r.request.amount} / amountWon ${r.result.amountWon} / cashout ${r.request.auto_cashout} not on the declared grids`);
        continue;
      }
      if (r.result.isWin) {
        won++;
        if (wonU * 100n === stake * cents) fullBetModel++;
        if (wonU * 100n * 1000n === stake * cents * (1000n - edgeMilli)) wonOk++;
        else if (errors.length < 3) errors.push(`round ${r.roundId}: amountWon ${r.result.amountWon} is not ${r.request.amount} × ${r.request.auto_cashout} × (1 − ${DECLARED_EDGE_PERCENT}%)`);
      } else {
        lost++;
        if (wonU === 0n) lostOk++;
        else if (errors.length < 3) errors.push(`round ${r.roundId}: loss but amountWon=${r.result.amountWon}`);
      }
    }

    let isWinCorrect = 0, ties = 0, tiesWon = 0, justBelow = 0, justBelowLost = 0;
    for (const r of rounds) {
      const shouldBeWin = r.result.crashPoint >= r.request.auto_cashout;
      if (r.result.isWin === shouldBeWin) isWinCorrect++;
      const cp = Math.round(r.result.crashPoint * 100), tg = Math.round(r.request.auto_cashout * 100);
      if (cp === tg) { ties++; if (r.result.isWin) tiesWon++; }
      if (cp === tg - 1) { justBelow++; if (!r.result.isWin) justBelowLost++; }
    }

    const wrong = (won - wonOk) + (lost - lostOk) + offGrid + edgeFieldDiffers;
    const popOk = rounds.length === EXPECTED_ROUNDS && won + lost + offGrid === EXPECTED_ROUNDS;
    const ok = wrong === 0 && isWinCorrect === rounds.length && popOk && won > 0;
    const summary = `${wonOk}/${won} won rounds: amountWon equals amount × cashout × (1 − ${DECLARED_EDGE_PERCENT}%) exactly on the ${MONEY_DP}-dp grid, `
      + `with the edge the declared constant, not the served field (${fullBetModel}/${won} equal amount × cashout); `
      + `${rounds.length - edgeFieldDiffers}/${rounds.length} served effectiveEdge fields equal the declared ${DECLARED_EDGE_PERCENT}; `
      + `${lostOk}/${lost} lost rounds record 0; ${isWinCorrect}/${rounds.length} isWin flags equal crashPoint ≥ auto_cashout `
      + `(population of record ${EXPECTED_ROUNDS}); boundary witnessed in data: ${ties} tie(s) crash == target, ${tiesWon} settled as a win; `
      + `${justBelow} round(s) one hundredth below the target, ${justBelowLost} settled as a loss`;

    results.push({
      step: 7,
      name: 'Payout Math',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok ? summary : `${summary}${errors.length ? ' — ' + errors.join('; ') : ''}`,
      data: {
        wonRounds: won, wonMatchDisplayFormula: wonOk, wonMatchAmountTimesCashout: fullBetModel, lostRounds: lost, lostZero: lostOk,
        isWinCorrect, declaredEdgePercent: DECLARED_EDGE_PERCENT, servedEdgeFieldDiffers: edgeFieldDiffers, offGrid,
        boundaryTies: ties, boundaryTiesWon: tiesWon, boundaryJustBelow: justBelow, boundaryJustBelowLost: justBelowLost,
      },
    });
  }

  // Step 8: House Edge Audit
  // The RTPs are measured floats and go in `data`, not in the sentence: the reproduction
  // gate can only compare a string leaf for equality, so a figure printed into prose
  // disagrees forever on a machine whose last bit differs. The sentence states the BOUND.
  // The ceiling is the claimed 0.999 itself, decided in integers: survival × 2^32 is an integer
  // count, and count · cents · 1000 ≤ 2^32 · 999 · 100 is RTP ≤ 0.999 with no float in the way.
  // (It used to be `rtp <= 0.9991`, which admitted an edge of 0.09% under a 0.1% claim.)
  {
    const instantP = instantCrashProbability();
    const targets = [2.0, 10.0, 100.0];
    const over: string[] = [];
    const rtps: number[] = [];
    for (const t of targets) {
      const count = survivalProbability(t) * TWO32;
      const rtp = expectedRTP(t);
      rtps.push(rtp);
      if (!Number.isInteger(count)) { over.push(`${t}×: survival × 2^32 = ${count} is not an integer count`); continue; }
      const { deficit } = rtpDeficitUnits(count, t);
      if (deficit < 0n) over.push(`${t}×: RTP ${rtp} above 0.999`);
    }
    const allBelow = over.length === 0;

    results.push({
      step: 8,
      name: 'House Edge Audit',
      status: allBelow ? 'PASS' : 'FAIL',
      detail: allBelow
        ? `RTP computed from the uint32 threshold formula at 2×, 10× and 100× — every value at or below 0.999, decided in integer arithmetic, confirming the 0.1% house edge. Figures in this step's data block.`
        : `RTP above the 0.999 ceiling: ${over.join('; ')}`,
      data: {
        rtpCeiling: 0.999,
        instantCrashProbability: instantP,
        rtpAt2x: rtps[0],
        rtpAt10x: rtps[1],
        rtpAt100x: rtps[2],
      },
    });
  }

  // Step 9: Phase Coverage
  // The expected counts used to be inlined here, out of reach of every other step. They
  // live in src/loader.ts now, beside the dataset pin, where the rest of the suite reads
  // them too — one declared population rather than one per file.
  {
    const counts: Record<string, number> = { A: phaseA.length, B: phaseB.length, C: phaseC.length };
    const popIssues: string[] = [];
    for (const [p, n] of Object.entries(EXPECTED_PHASE_ROUNDS)) {
      if ((counts[p] ?? 0) !== n) popIssues.push(`phase ${p} ${counts[p] ?? 0} != ${n}`);
    }
    if (rounds.length !== EXPECTED_ROUNDS) popIssues.push(`rounds ${rounds.length} != ${EXPECTED_ROUNDS}`);

    results.push({
      step: 9,
      name: 'Phase Coverage',
      status: popIssues.length === 0 ? 'PASS' : 'FAIL',
      detail: popIssues.length === 0
        ? `${rounds.length} rounds across phases A, B and C exactly as declared in src/loader.ts (code constants, not the dataset header)`
        : `POPULATION MISMATCH vs the capture plan in src/loader.ts: ${popIssues.join('; ')}`,
      data: { phaseRounds: counts, totalRounds: rounds.length, populationIssues: popIssues },
    });
  }

  return results;
}
