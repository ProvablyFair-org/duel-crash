/**
 * Steps 5–6: Determinism verification for Crash.
 *   5. Outcome Recomputation — computeCrashPoint matches all 1100 rounds, every recorded crash point on
 *      the declared 2-dp grid at or above 1.00, and the two ProvablyFair.org player verifiers (the
 *      docs-site derive.js and the live www.provablyfair.org/verify-bets bundle) executed from pinned
 *      bytes on every round (profile CRASH-07, CRASH-10 grid half, CRASH-24)
 *   6. Bet-Size Invariance — Phase C ($10) crash points recompute identically, Phase C is played at a
 *      target also played at the base stake, and both groups settle at the same per-unit return
 *      (profile CRASH-12)
 */

import { computeCrashPoint, computeCrashPointRaw } from '../../src/rng';
import {
  runOperatorVerifier, checkOperatorCites, operatorCents, OPERATOR_EXPECTED_LOGS, OPERATOR_VERIFIER_PROVENANCE,
} from '../../src/operator-verifier';
import type { VerifyContext, StepResult } from './context';
import {
  EXPECTED_ROUNDS, EXPECTED_PHASE_ROUNDS, BASE_STAKE, PHASE_C_STAKE, PHASE_C_TARGET,
  EXPECTED_BASE_STAKE_ROUNDS_AT_PHASE_C_TARGET, CRASH_POINT_FLOOR,
} from '../../src/loader';
import { loadSiteVerifier, crashCents, SITE_VERIFIER_PROVENANCE } from '../../src/site-verifier';
import { runLiveSiteVerifier, liveCrashCents, LIVE_SITE_PROVENANCE } from '../../src/live-site-verifier';
import { crashFromValue } from './crash-model';

/** A decimal money string → integer units at 6 dp (the game's money grid), or null off the grid. */
function units6(s: string): bigint | null {
  const m = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(s);
  if (!m) return null;
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
}

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

    // ── Recorded grid and range (CRASH-10, grid half) ──────────────────────────
    // Asserted from the RECORDED crash point in its own right, not left implicit to the recomputation: a
    // recorded crash point must be a whole number of hundredths at or above the declared floor 1.00.
    // The capture stored floor(served multiplier × 100) / 100 (capture/crash-capture.reference.js:172),
    // so on a dataset that capture wrote the grid half cannot fail: it guards the dataset file (an edited
    // value off the grid fails), not whether Duel's server sends 2-dp values. The floor half can fail
    // (mutation M05b). (Duel declares no cap — the range's upper end is the map's own maximum, CRASH-14.)
    let offGrid = 0;
    const gridFirst: string[] = [];
    for (const r of rounds) {
      const c = crashCents(r.result.crashPoint);
      if (c === null || c < CRASH_POINT_FLOOR * 100) {
        offGrid++;
        if (gridFirst.length < 3) gridFirst.push(`round ${r.roundId}: served crash point ${r.result.crashPoint} is not a 2-dp value ≥ ${CRASH_POINT_FLOOR.toFixed(2)}`);
      }
    }

    // ── Upper bound (CRASH-14, rule R2) ─────────────────────────────────────────
    // Duel declares no cap, so the cap half is n/a WITH EVIDENCE: the largest served crash point and the
    // map's own maximum (v = 0, from the independent per-value model) are printed, and no served value may
    // exceed that maximum.
    const maxServed = rounds.reduce((m, r) => Math.max(m, r.result.crashPoint), 0);
    const mapMaximum = crashFromValue(0);
    const aboveMapMax = rounds.filter(r => r.result.crashPoint > mapMaximum).length;
    if (aboveMapMax > 0) { offGrid += aboveMapMax; gridFirst.push(`${aboveMapMax} served crash point(s) above the map maximum ${mapMaximum}`); }

    // ── Docs-site leg: the ProvablyFair.org VerifyBets derive.js (CRASH-24) ────────
    // games/crash/derive.js + its one import lib/hmac-sha256.js, read from the docs site's origin/main,
    // vendored under verifier-parity/ and pinned in src/site-verifier.ts. Its own deriveCrashSync is
    // EXECUTED on every round; its crash point, as integer hundredths, must equal the served one AND
    // src/rng.ts's.
    const siteIssues: string[] = [];
    const sv = loadSiteVerifier();
    let siteChecked = 0, siteVsServed = 0, siteVsRng = 0, siteThrew = 0;
    const siteFirst: string[] = [];
    if (!sv.deriveCrash) {
      siteIssues.push(`docs-site verifier: ${sv.error ?? 'not loaded'}`);
    } else {
      for (const r of rounds) {
        let out;
        try { out = sv.deriveCrash({ serverSeed: r.result.serverSeed, drandRandomness: r.result.drandRandomness }); }
        catch { siteThrew++; continue; }
        siteChecked++;
        const site = crashCents(out.crashPoint);
        const served = crashCents(r.result.crashPoint);
        const mine = crashCents(computeCrashPoint(r.result.serverSeed, r.result.drandRandomness));
        if (site === null || site !== served) { siteVsServed++; if (siteFirst.length < 3) siteFirst.push(`round ${r.roundId}: site ${out.crashPoint} vs served ${r.result.crashPoint}`); }
        if (site === null || site !== mine) { siteVsRng++; if (siteFirst.length < 3) siteFirst.push(`round ${r.roundId}: site ${out.crashPoint} vs src/rng.ts`); }
      }
      if (siteThrew > 0) siteIssues.push(`docs-site verifier threw on ${siteThrew} round(s)`);
      if (siteChecked !== EXPECTED_ROUNDS) siteIssues.push(`docs-site verifier ran on ${siteChecked} rounds, ${EXPECTED_ROUNDS} declared`);
      if (siteVsServed + siteVsRng > 0) {
        siteIssues.push(`docs-site verifier disagrees: vs served ${siteVsServed}, vs src/rng.ts ${siteVsRng} (${siteFirst.join('; ')})`);
      }
    }

    // ── Live-site leg: www.provablyfair.org/verify-bets (CRASH-24) ──────────────────
    // The deployed bundle (3 chunks) vendored byte for byte and pinned with the runner in
    // src/live-site-verifier.ts; the site's own code (VERIFY → verifyDuelsGame → the Duel Crash method,
    // WebCrypto HMAC-SHA-256) is EXECUTED on every round. Its printed crash point (a toFixed(2) string,
    // parsed to integer hundredths — anything else is off-grid) must equal the served crash point and
    // src/rng.ts, and the server-seed hash it prints must equal the served commitment.
    const liveIssues: string[] = [];
    const live = runLiveSiteVerifier('Duel.com', rounds.map((r, i) => ({
      id: String(i), serverSeed: r.result.serverSeed, drandRandomness: r.result.drandRandomness,
    })));
    let liveChecked = 0, liveVsServed = 0, liveVsRng = 0, liveOffGrid = 0, liveHash = 0, liveMissing = 0;
    const liveFirst: string[] = [];
    if (live.error || !live.crashPoints || !live.seedHashes) {
      liveIssues.push(`live-site verifier: ${live.error ?? 'no result'}`);
    } else {
      rounds.forEach((r, i) => {
        const s = live.crashPoints!.get(String(i));
        if (s === undefined || s === null) { liveMissing++; return; }
        liveChecked++;
        const c = liveCrashCents(s);
        if (c === null) liveOffGrid++;
        const mine = crashCents(computeCrashPoint(r.result.serverSeed, r.result.drandRandomness));
        if (c !== crashCents(r.result.crashPoint)) { liveVsServed++; if (liveFirst.length < 3) liveFirst.push(`round ${r.roundId}: site ${s} vs served ${r.result.crashPoint}`); }
        if (c !== mine) { liveVsRng++; if (liveFirst.length < 3) liveFirst.push(`round ${r.roundId}: site ${s} vs src/rng.ts`); }
        if (live.seedHashes!.get(String(i)) !== r.result.serverSeedHash) liveHash++;
      });
      if (liveMissing > 0) liveIssues.push(`live-site verifier returned no crash point for ${liveMissing} round(s)`);
      if (liveChecked !== EXPECTED_ROUNDS) liveIssues.push(`live-site verifier ran on ${liveChecked} rounds, ${EXPECTED_ROUNDS} declared`);
      if (liveVsServed + liveVsRng + liveOffGrid + liveHash > 0) {
        liveIssues.push(`live-site verifier disagrees: vs served ${liveVsServed}, vs src/rng.ts ${liveVsRng}, off the 2-dp grid `
          + `${liveOffGrid}, server-seed hash vs served commitment ${liveHash} (${liveFirst.join('; ')})`);
      }
    }

    // ── Operator leg: THE OPERATOR'S OWN Verify-tab code (CRASH-09) ──────────────────────────────
    // Duel's Crash code panel, pasted by Paulo from the Verify tab on 2026-09-26, vendored verbatim under
    // evidence/verify-tab/ and pinned in src/operator-verifier.ts. The pinned runner fills in the file's
    // two "User input values" (drandSeed = the round's drandRandomness as captured, serverSeed) and runs
    // it, as a player would. Its validateCrashResult returns the UNFLOORED multiplier; it must equal
    // src/rng.ts computeCrashPointRaw EXACTLY (the same double), floor(x·100) must equal the served crash
    // point in hundredths, and what it prints must equal what it returns. HARD FAIL otherwise, on a pin
    // mismatch, on a count other than EXPECTED_ROUNDS, or on a citation that does not carry its text.
    // The file's houseEdge is 0.001 (L63), applied once, to the crash point. It says nothing about the
    // settlement (MANIFEST Money Model, DL-1).
    const opIssues: string[] = [];
    const op = runOperatorVerifier(rounds.map((r, i) => ({ id: String(i), inputs: { drandSeed: r.result.drandRandomness, serverSeed: r.result.serverSeed } })));
    const opCites = checkOperatorCites();
    let opChecked = 0, opVsServed = 0, opVsRaw = 0, opPrinted = 0, opErrors = 0;
    const opFirst: string[] = [];
    if (!op.results) {
      opIssues.push(`operator Verify-tab code: ${op.error}`);
    } else {
      const logsOk = op.shippedLogs.length === OPERATOR_EXPECTED_LOGS.length && op.shippedLogs.every((l, i) => l === OPERATOR_EXPECTED_LOGS[i]);
      if (!logsOk) opIssues.push(`operator Verify-tab code printed ${JSON.stringify(op.shippedLogs).slice(0, 200)} as shipped — not only its empty-input message`);
      rounds.forEach((r, i) => {
        const o = op.results!.get(String(i));
        if (o === undefined) return;
        opChecked++;
        if (o.value === null || o.error) { opErrors++; if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: ${o.error ?? 'no value'}`); return; }
        if (o.value !== computeCrashPointRaw(r.result.serverSeed, r.result.drandRandomness)) { opVsRaw++; if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: operator ${o.value} vs src/rng.ts raw ${computeCrashPointRaw(r.result.serverSeed, r.result.drandRandomness)}`); }
        if (operatorCents(o.value) !== crashCents(r.result.crashPoint)) { opVsServed++; if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: operator ${o.value} vs served ${r.result.crashPoint}`); }
        if (o.logs.length === 1 && o.logs[0] === `Crash result: ${String(o.value)}`) opPrinted++;
        else if (opFirst.length < 3) opFirst.push(`round ${r.roundId}: printed ${JSON.stringify(o.logs).slice(0, 100)}`);
      });
      if (opChecked !== EXPECTED_ROUNDS) opIssues.push(`operator Verify-tab code ran on ${opChecked} rounds, ${EXPECTED_ROUNDS} declared`);
      if (opVsServed + opVsRaw + opErrors > 0 || opPrinted !== opChecked) {
        opIssues.unshift(`operator Verify-tab code disagrees: floor(x·100) vs the served crash point on ${opVsServed}, unfloored value vs `
          + `src/rng.ts computeCrashPointRaw on ${opVsRaw}, ${opErrors} run error(s), printed ≠ returned on ${opChecked - opErrors - opPrinted} (${opFirst.join('; ')})`);
      }
    }
    if (opCites.bad.length > 0 || opCites.checked === 0) opIssues.push(`src/rng.ts operator citations: ${opCites.bad.slice(0, 2).join('; ')}`);

    // Bound to the population of record: on an empty or shortened dataset "0 mismatches" was free.
    const recomputeOk = mismatch === 0 && match === EXPECTED_ROUNDS;
    const ok = recomputeOk && offGrid === 0 && siteIssues.length === 0 && liveIssues.length === 0 && opIssues.length === 0;
    const detail = ok
      ? `${match}/${EXPECTED_ROUNDS} crash points recomputed (population of record in src/loader.ts) — 100% parity by exact `
        + `equality with the recorded crash point; every recorded crash point is a whole number of hundredths at or above ${CRASH_POINT_FLOOR.toFixed(2)} (${offGrid} off the grid; the capture floored the served multiplier to 2 dp, so the grid half cannot fail on this dataset and does not show what the server sends); `
        + `no cap is declared — the largest served crash point is ${maxServed}× and none exceeds the map maximum ${mapMaximum}× (v = 0). `
        + `Player-verifier parity (CRASH-24): the ProvablyFair.org docs-site verifier (VerifyBets games/crash/derive.js + `
        + `lib/hmac-sha256.js, ${SITE_VERIFIER_PROVENANCE.ref} @ ${SITE_VERIFIER_PROVENANCE.head.slice(0, 7)}, `
        + `${sv.files.filter(f => f.match).length}/${sv.files.length} SHA-256 pins MATCH) executed on ${siteChecked}/${EXPECTED_ROUNDS} `
        + `rounds: crash point equal to the served one and src/rng.ts on every round (${siteVsServed} / ${siteVsRng} differ). `
        + `Live-site parity (CRASH-24): the deployed ${LIVE_SITE_PROVENANCE.page} bundle (3 chunks + runner, `
        + `${live.files.filter(f => f.match).length}/${live.files.length} SHA-256 pins MATCH) executed on ${liveChecked}/${EXPECTED_ROUNDS} `
        + `rounds: printed crash point equal to the served one and src/rng.ts on every round (${liveVsServed} / ${liveVsRng} differ, `
        + `${liveOffGrid} off-grid), printed server-seed hash equal to the served commitment on every round (${liveHash} differ). `
        + `Operator-code parity (CRASH-09): Duel's own Crash Verify-tab code (${OPERATOR_VERIFIER_PROVENANCE.savedAs}, `
        + `${OPERATOR_VERIFIER_PROVENANCE.from}, SHA-256 ${OPERATOR_VERIFIER_PROVENANCE.sha256.slice(0, 16)}…, pinned) executed with only its two `
        + `"User input values" filled in (drandSeed = the captured drandRandomness hex, serverSeed) on ${opChecked}/${EXPECTED_ROUNDS} rounds: `
        + `its unfloored result equals src/rng.ts computeCrashPointRaw as the same double on every round (${opVsRaw} differ) — the operator `
        + `code's formula (2^32/(value+1))·(1−0.001), one 0.1 % on the crash point, is the formula the package recomputes; floor(x·100) `
        + `equals the served crash point on every round (${opVsServed} differ); printed = returned on ${opPrinted}/${opChecked}; operator lines `
        + `cited by src/rng.ts ${opCites.checked - opCites.bad.length}/${opCites.checked} verbatim. The code computes the crash point only; `
        + `it says nothing about settlement (MANIFEST Money Model, DL-1)`
      : !recomputeOk
        ? `${match} recomputed matches of ${EXPECTED_ROUNDS} required, ${mismatch} mismatches${mismatches.length ? ': ' + mismatches.join('; ') : ''}`
        : [
            offGrid > 0 ? `SERVED GRID (CRASH-10): ${offGrid} served crash point(s) off the 2-dp grid, below ${CRASH_POINT_FLOOR.toFixed(2)} or above the map maximum — ${gridFirst.join('; ')}` : '',
            siteIssues.length > 0 ? `SITE VERIFIER PARITY (CRASH-24): ${siteIssues.join('; ')}` : '',
            liveIssues.length > 0 ? `LIVE-SITE VERIFIER PARITY (CRASH-24): ${liveIssues.join('; ')}` : '',
            opIssues.length > 0 ? `OPERATOR VERIFY-TAB CODE PARITY (CRASH-09): ${opIssues.join('; ')}` : '',
          ].filter(Boolean).join(' | ');
    results.push({
      step: 5,
      name: 'Outcome Recomputation',
      status: ok ? 'PASS' : 'FAIL',
      detail,
      data: {
        matched: match, mismatched: mismatch, required: EXPECTED_ROUNDS, servedOffGrid: offGrid,
        maxServedCrashPoint: maxServed, mapMaximum, servedAboveMapMaximum: aboveMapMax,
        siteVerifier: {
          files: sv.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, vendoredSha256: f.actual, match: f.match })),
          provenance: SITE_VERIFIER_PROVENANCE, roundsExecuted: siteChecked,
          differsFromServed: siteVsServed, differsFromRng: siteVsRng, threw: siteThrew, issues: siteIssues,
        },
        liveSiteVerifier: {
          files: live.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, vendoredSha256: f.actual, match: f.match })),
          provenance: LIVE_SITE_PROVENANCE, roundsExecuted: liveChecked,
          differsFromServed: liveVsServed, differsFromRng: liveVsRng, offGrid: liveOffGrid,
          seedHashDiffers: liveHash, missing: liveMissing, standIns: live.standIns.length, issues: liveIssues,
        },
        operatorVerifier: {
          files: op.files.map(f => ({ file: f.file, pinnedSha256: f.pinned, actualSha256: f.actual, match: f.match })),
          provenance: OPERATOR_VERIFIER_PROVENANCE, roundsExecuted: opChecked, differsFromServed: opVsServed,
          differsFromRngRaw: opVsRaw, printedEqualsReturned: opPrinted, errors: opErrors,
          citesChecked: opCites.checked, citesBad: opCites.bad.length, issues: opIssues,
        },
      },
    });
  }

  // Step 6: Bet-Size Invariance
  // Three things, each against the plan in src/loader.ts rather than the data: (1) every Phase C round
  // recomputes identically — the crash point takes no stake argument; (2) Phase C is played at the
  // declared elevated stake on the declared target, and that same target is played at the declared base
  // stake by the declared number of rounds, so stake is the only variable that moves; (3) every win in
  // the two groups settles at the SAME per-unit return, compared as exact integer cross-products on the
  // 6-dp grid (won_a × stake_b === won_b × stake_a) — the two groups are compared with each other, not
  // with a rule this step would have to assume. The elevated-stake wins are counted and printed.
  {
    let match = 0;
    let mismatch = 0;
    for (const r of phaseC) {
      const computed = computeCrashPoint(r.result.serverSeed, r.result.drandRandomness);
      if (computed === r.result.crashPoint) match++;
      else mismatch++;
    }
    const required = EXPECTED_PHASE_ROUNDS.C;
    const planIssues: string[] = [];
    const offPlanC = phaseC.filter(r => r.request.amount !== PHASE_C_STAKE || r.request.auto_cashout !== PHASE_C_TARGET).length;
    if (offPlanC > 0) planIssues.push(`${offPlanC} Phase C round(s) not at stake ${PHASE_C_STAKE} / target ${PHASE_C_TARGET}×`);
    const base = ctx.rounds.filter(r => r.phase !== 'C' && r.request.auto_cashout === PHASE_C_TARGET);
    const offStakeBase = base.filter(r => r.request.amount !== BASE_STAKE).length;
    if (base.length !== EXPECTED_BASE_STAKE_ROUNDS_AT_PHASE_C_TARGET) {
      planIssues.push(`base-stake rounds at ${PHASE_C_TARGET}× ${base.length} != ${EXPECTED_BASE_STAKE_ROUNDS_AT_PHASE_C_TARGET}`);
    }
    if (offStakeBase > 0) planIssues.push(`${offStakeBase} non-Phase-C round(s) at ${PHASE_C_TARGET}× not at the base stake ${BASE_STAKE}`);

    // Per-unit return, compared between the two stakes as exact integer cross-products.
    const wins = [...phaseC, ...base].filter(r => r.result.isWin);
    const elevatedWins = phaseC.filter(r => r.result.isWin).length;
    const baseWins = base.filter(r => r.result.isWin).length;
    let ratioDiffers = 0, offGridMoney = 0;
    const ref = wins.find(r => r.phase !== 'C');
    const refWon = ref ? units6(ref.result.amountWon) : null;
    const refStake = ref ? units6(ref.request.amount) : null;
    for (const r of wins) {
      const w = units6(r.result.amountWon), a = units6(r.request.amount);
      if (w === null || a === null || refWon === null || refStake === null) { offGridMoney++; continue; }
      if (w * refStake !== refWon * a) ratioDiffers++;
    }
    if (!ref) planIssues.push(`no base-stake win at ${PHASE_C_TARGET}× to compare the elevated stake with`);
    if (elevatedWins === 0) planIssues.push('no elevated-stake win — the payout path at the elevated stake is unexercised');

    const ok = mismatch === 0 && match === required && planIssues.length === 0 && ratioDiffers === 0 && offGridMoney === 0;
    results.push({
      step: 6,
      name: 'Bet-Size Invariance',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${match}/${required} Phase C ($${PHASE_C_STAKE}) rounds recompute identically — crash point is independent of bet amount; `
          + `Phase C is played at ${PHASE_C_TARGET}×, the same target ${base.length} base-stake ($${BASE_STAKE}) rounds play (plan in src/loader.ts), `
          + `and all ${elevatedWins} elevated-stake and ${baseWins} base-stake wins settle at one identical per-unit return, exact on the 6-dp grid `
          + `(${ratioDiffers} differ)`
        : `${match} Phase C rounds recompute identically of ${required} required (src/loader.ts), ${mismatch} mismatches`
          + `${planIssues.length ? `; PLAN: ${planIssues.join('; ')}` : ''}`
          + `${ratioDiffers || offGridMoney ? `; SETTLEMENT: ${ratioDiffers} win(s) at a per-unit return different from the other stake, ${offGridMoney} off the 6-dp grid` : ''}`,
      data: {
        matched: match, mismatched: mismatch, required,
        phaseCStake: PHASE_C_STAKE, phaseCTarget: PHASE_C_TARGET, baseStake: BASE_STAKE,
        baseStakeRoundsAtTarget: base.length, elevatedStakeWins: elevatedWins, baseStakeWins: baseWins,
        perUnitReturnDiffers: ratioDiffers, offGridMoney, planIssues,
      },
    });
  }

  return results;
}
