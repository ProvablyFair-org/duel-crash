/**
 * Steps 13–15: Simulation & external verification for Crash.
 *   13. Simulation Pass 1 — multi-stream chi-squared + Fisher's combined test
 *   14. Simulation Pass 2 — cherry-pick screen on the cash-out targets actually played
 *   15. drand API Verification — reads pinned outputs/drand-api-verification.json
 *
 * Steps 13–14 REPLAY the simulation (./sim-replay) and score the replayed statistics. The
 * committed outputs/simulation-results.json is compared to the replay field by field — a scalar
 * that the replay does not reproduce is a FAIL — but it is never the source of a verdict. The
 * per-round simulation rows are not shipped; they do not need to be, because every simulated round
 * is a deterministic function of an HMAC-derived seed and the verifier regenerates it.
 *
 * Step 15 recomputes its verdict from the per-round records in
 * outputs/drand-api-verification.json, bound to the dataset round by round; the file's own
 * passed/failed counters are checked against that recomputation, not believed.
 */

import * as fs   from 'fs';
import * as path from 'path';
import type { VerifyContext, StepResult } from './context';
import { numbersAgree } from '../../src/diff';
import { expectedRTP, survivalProbability } from '../../src/rng';
import { EXPECTED_ROUNDS, EXPECTED_DISTINCT_SEEDS } from '../../src/loader';
import {
  replayPass1, replayPass2, PASS2_Z_CRIT, PASS2_ALPHA_EACH, PASS2_FAMILY_ALPHA,
  SIM_PASS1_STREAMS, SIM_PASS1_ROUNDS_EACH, SIM_PASS1_ROUNDS_TOTAL, SIM_PASS2_DRAND_PER_SEED, SIM_CASHOUT_TARGETS,
} from './sim-replay';

const QUICKNET_CHAIN = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const ALPHA = 0.01;
const RTP_SIGMA = 5;

/** Compare an artifact value with its replay. Integers exactly; floats at the reproduction tolerance. */
function agree(committed: unknown, replayed: number): boolean {
  return typeof committed === 'number' && numbersAgree(committed, replayed);
}

export function run(ctx: VerifyContext): StepResult[] {
  const results: StepResult[] = [];

  const simPath = path.join(ctx.outputsDir, 'simulation-results.json');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sim: any = null;
  try { sim = JSON.parse(fs.readFileSync(simPath, 'utf8')); } catch { sim = null; }
  const p1c = sim?.pass1_fresh_seeds ?? null;
  const p2c = sim?.pass2_casino_seeds ?? null;

  // Step 13: Pass 1 — replayed, then scored
  {
    const rp = replayPass1();
    const disagree: string[] = [];
    if (!p1c) disagree.push('outputs/simulation-results.json absent, unreadable or without pass1_fresh_seeds');
    else {
      const pairs: [string, unknown, number][] = [
        ['totalRounds', p1c.totalRounds, rp.totalRounds],
        ['streams', p1c.streams, rp.streams],
        ['roundsPerStream', p1c.roundsPerStream, rp.roundsPerStream],
        ['fisherCombined.statistic', p1c.fisherCombined?.statistic, rp.fisherCombined.statistic],
        ['fisherCombined.df', p1c.fisherCombined?.df, rp.fisherCombined.df],
        ['fisherCombined.pValue', p1c.fisherCombined?.pValue, rp.fisherCombined.pValue],
        ['lag1R', p1c.lag1R, rp.lag1R],
        ['lag1Z', p1c.lag1Z, rp.lag1Z],
        ['runsP', p1c.runsP, rp.runsP],
        ['simulatedRTP', p1c.simulatedRTP, rp.simulatedRTP],
        ['theoreticalMaxRTP', p1c.theoreticalMaxRTP, 0.999],
      ];
      const sr = Array.isArray(p1c.streamResults) ? p1c.streamResults : [];
      if (sr.length !== rp.streamResults.length) disagree.push(`streamResults has ${sr.length} entries, replay ${rp.streamResults.length}`);
      rp.streamResults.forEach((r, i) => {
        pairs.push([`streamResults[${i}].chi2`, sr[i]?.chi2, r.chi2]);
        pairs.push([`streamResults[${i}].df`, sr[i]?.df, r.df]);
        pairs.push([`streamResults[${i}].pValue`, sr[i]?.pValue, r.pValue]);
      });
      const pt = p1c.perTargetRTP ?? {};
      const extraTargets = Object.keys(pt).filter(k => !(k in rp.perTargetRTP));
      if (extraTargets.length) disagree.push(`perTargetRTP carries targets the simulation does not run: ${extraTargets.join(', ')}`);
      for (const [k, v] of Object.entries(rp.perTargetRTP)) pairs.push([`perTargetRTP.${k}`, pt[k], v]);
      for (const [name, c, r] of pairs) if (!agree(c, r)) disagree.push(`${name}: artifact ${JSON.stringify(c)} vs replay ${r}`);
    }

    // Score the REPLAYED statistics.
    const fisherPass = rp.fisherCombined.pValue >= ALPHA;
    const serialPass = Math.abs(rp.lag1Z) < 3 && rp.runsP >= ALPHA;
    const belowAlpha = rp.streamResults.filter(r => r.pValue < ALPHA).length;
    // Per-target simulated RTP within 5σ of the formula RTP; σ = x·√(p(1−p)/N) for a Bernoulli
    // win at probability p paying x. A step that prints RTPs and never tests them is decoration.
    const rtpOut: string[] = [];
    const rtpZ: Record<string, number> = {};
    for (const t of SIM_CASHOUT_TARGETS) {
      const p = survivalProbability(t);
      const sigma = t * Math.sqrt(p * (1 - p) / rp.totalRounds);
      const z = (rp.perTargetRTP[String(t)] - expectedRTP(t)) / sigma;
      rtpZ[String(t)] = z;
      if (!(Math.abs(z) <= RTP_SIGMA)) rtpOut.push(`${t}×: simulated RTP ${rp.perTargetRTP[String(t)]} is ${z.toFixed(2)}σ from ${expectedRTP(t)}`);
    }
    const planOk = rp.totalRounds === SIM_PASS1_ROUNDS_TOTAL && rp.streams === SIM_PASS1_STREAMS && rp.roundsPerStream === SIM_PASS1_ROUNDS_EACH;
    const ok = fisherPass && serialPass && rtpOut.length === 0 && disagree.length === 0 && planOk;

    const problems = [
      ...(disagree.length ? [`${disagree.length} committed field(s) not reproduced by the replay: ${disagree.slice(0, 3).join('; ')}`] : []),
      ...(!fisherPass ? [`replayed Fisher's combined p below α=${ALPHA}`] : []),
      ...(!serialPass ? [`replayed serial test outside bounds (|lag-1 z| < 3 and runs p ≥ ${ALPHA} required)`] : []),
      ...rtpOut,
    ];
    results.push({
      step: 13,
      name: 'Simulation Pass 1',
      status: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? `${rp.totalRounds.toLocaleString()} rounds (${rp.streams} streams × ${rp.roundsPerStream.toLocaleString()}) REPLAYED from their HMAC seeds and every committed scalar reproduced — Fisher's combined p at or above α=${ALPHA}, ${belowAlpha}/${rp.streams} individual streams below α=${ALPHA}, |lag-1 z| below 3, runs p at or above ${ALPHA}, and simulated RTP within ${RTP_SIGMA}σ of the formula at all ${SIM_CASHOUT_TARGETS.length} targets. Statistics in this step's data block.`
        : `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`,
      data: {
        replayed: true,
        totalRounds: rp.totalRounds,
        streams: rp.streams,
        roundsPerStream: rp.roundsPerStream,
        alpha: ALPHA,
        lag1ZBound: 3,
        rtpSigmaBound: RTP_SIGMA,
        fisherCombinedP: rp.fisherCombined.pValue,
        fisherCombinedStatistic: rp.fisherCombined.statistic,
        fisherCombinedDf: rp.fisherCombined.df,
        streamsBelowAlpha: belowAlpha,
        lag1R: rp.lag1R,
        lag1Z: rp.lag1Z,
        runsP: rp.runsP,
        simulatedRTP: rp.simulatedRTP,
        perTargetRTP: rp.perTargetRTP,
        perTargetRtpZ: rtpZ,
        theoreticalMaxRTP: 0.999,
        committedFieldsNotReproduced: disagree,
      },
    });
  }

  // Step 14: Pass 2 — cherry-pick screen on the cash-out targets actually played, replayed
  {
    // Every revealed seed × SIM_PASS2_DRAND_PER_SEED reference beacons at the cash-out target its
    // round was played at; the captured round (its real beacon) is replayed and must reproduce the
    // served crash point. Pre-registered rule (tests/steps/sim-replay.ts): FAIL when the return z OR
    // the captured-vs-reference rank-sum z is below PASS2_Z_CRIT (one-sided α 0.0005 each, family
    // 0.001). Detection power is printed. This replaced a per-seed chi-squared fail count on
    // 2026-09-26 (profile CRASH-21): a distribution test on draws that never touch the played targets
    // said nothing about the return the player was exposed to.
    const seen = new Set<string>();
    const firstRounds = ctx.rounds.filter(r => (seen.has(r.result.serverSeed) ? false : (seen.add(r.result.serverSeed), true)));
    const rp = replayPass2(firstRounds.map(r => ({
      serverSeed: r.result.serverSeed, drandRandomness: r.result.drandRandomness,
      crashPoint: r.result.crashPoint, target: r.request.auto_cashout,
    })));
    const disagree: string[] = [];
    if (!p2c) disagree.push('outputs/simulation-results.json absent, unreadable or without pass2_casino_seeds');
    else {
      const pairs: [string, unknown, number][] = [
        ['seedsTested', p2c.seedsTested, rp.seedsTested],
        ['noncesPerSeed', p2c.noncesPerSeed, rp.noncesPerSeed],
        ['capturedReplayMismatches', p2c.capturedReplayMismatches, rp.capturedReplayMismatches],
        ['returnCents', p2c.returnCents, rp.returnCents],
        ['expectedReturn', p2c.expectedReturn, rp.expectedReturn],
        ['returnVariance', p2c.returnVariance, rp.returnVariance],
        ['returnZ', p2c.returnZ, rp.returnZ],
        ['capturedWins', p2c.capturedWins, rp.capturedWins],
        ['rankSumZ', p2c.rankSumZ, rp.rankSumZ],
      ];
      for (const [name, c, r] of pairs) if (!agree(c, r)) disagree.push(`${name}: artifact ${JSON.stringify(c)} vs replay ${r}`);
      const stale = ['chi2Fails', 'meanCasinoRTP'].filter(k => k in p2c);
      if (stale.length) disagree.push(`artifact still carries the retired statistic(s) ${stale.join(', ')}`);
    }
    const popOk = rp.seedsTested === EXPECTED_DISTINCT_SEEDS && ctx.rounds.length === EXPECTED_DISTINCT_SEEDS
      && rp.noncesPerSeed === SIM_PASS2_DRAND_PER_SEED;
    const returnOk = rp.returnZ >= PASS2_Z_CRIT;
    const rankOk = rp.rankSumZ >= PASS2_Z_CRIT;
    const pass = returnOk && rankOk && rp.capturedReplayMismatches === 0 && disagree.length === 0 && popOk;
    const problems = [
      ...(!popOk ? [`${rp.seedsTested} seeds replayed, ${ctx.rounds.length} rounds (${EXPECTED_DISTINCT_SEEDS} required, one round per seed) × ${rp.noncesPerSeed} beacons (${SIM_PASS2_DRAND_PER_SEED} required)`] : []),
      ...(rp.capturedReplayMismatches ? [`${rp.capturedReplayMismatches} captured round(s) not reproduced from their revealed seed and real beacon`] : []),
      ...(!returnOk ? [`return z ${rp.returnZ.toFixed(3)} below the pre-registered ${PASS2_Z_CRIT.toFixed(3)} — the seeds pay less than the exact law at the targets played`] : []),
      ...(!rankOk ? [`rank-sum z ${rp.rankSumZ.toFixed(3)} below the pre-registered ${PASS2_Z_CRIT.toFixed(3)} — captured rounds lose more often than their own seed's reference (cherry-pick signal)`] : []),
      ...(disagree.length ? [`${disagree.length} committed field(s) not reproduced: ${disagree.slice(0, 3).join('; ')}`] : []),
    ];

    results.push({
      step: 14,
      name: 'Simulation Pass 2 (Casino Seeds)',
      status: pass ? 'PASS' : 'FAIL',
      detail: pass
        ? `${rp.seedsTested}/${EXPECTED_DISTINCT_SEEDS} revealed seeds × ${rp.noncesPerSeed.toLocaleString('en-US')} reference drand values REPLAYED at the cash-out target each round was actually played at, and all ${rp.seedsTested} captured rounds reproduced from their real beacon; every committed scalar reproduced. `
          + `Pre-registered rule: FAIL if (1) the unit-stake return of the played targets, standardised by its EXACT mean Σ N·t·p(t) and variance Σ N·t²·p(1−p), or (2) the rank-sum of each captured round among its own seed's ${rp.noncesPerSeed.toLocaleString('en-US')} reference draws (exact permutation null: the captured beacon is exchangeable with the reference under no cherry-pick), falls below z = ${PASS2_Z_CRIT.toFixed(3)} (one-sided α ${PASS2_ALPHA_EACH} each, family ${PASS2_FAMILY_ALPHA}, Bonferroni). Neither does; both z and the direction split are in this step's data block. Detection power (≥ 50 %, printed rounded; exact in the data block): the rank rule detects an operator who turns ≥ ${(rp.rankDetectableLossFraction * 100).toFixed(1)} % of would-be winning captured rounds into losses; the return rule detects a ≥ ${(rp.returnDetectableShortfall * 100).toFixed(2)} % relative RTP shortfall across the seed population at the targets played.`
        : `${problems.length} problem(s): ${problems.join(' | ')}`,
      data: {
        replayed: true,
        seedsTested: rp.seedsTested,
        seedsRequired: EXPECTED_DISTINCT_SEEDS,
        noncesPerSeed: rp.noncesPerSeed,
        capturedReplayMismatches: rp.capturedReplayMismatches,
        familyAlpha: PASS2_FAMILY_ALPHA,
        alphaEach: PASS2_ALPHA_EACH,
        zCritical: PASS2_Z_CRIT,
        returnObserved: rp.returnCents / 100,
        returnExpected: rp.expectedReturn,
        returnZ: rp.returnZ,
        returnRTP: rp.returnRTP,
        expectedRTP: rp.expectedRTP,
        rankSumZ: rp.rankSumZ,
        capturedWins: rp.capturedWins,
        capturedExpectedWins: rp.capturedExpectedWins,
        capturedBelowMedian: rp.capturedBelowMedian,
        capturedAboveMedian: rp.capturedAboveMedian,
        powerRankLossFraction: rp.rankDetectableLossFraction,
        powerReturnShortfall: rp.returnDetectableShortfall,
        committedFieldsNotReproduced: disagree,
      },
    });
  }

  // Step 15: drand API Verification — recomputed from the per-round records
  {
    const drandPath = path.join(ctx.outputsDir, 'drand-api-verification.json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let drand: any = null;
    try { drand = JSON.parse(fs.readFileSync(drandPath, 'utf8')); } catch { drand = null; }
    if (!drand || !Array.isArray(drand.results)) {
      results.push({
        step: 15,
        name: 'drand API Signature Verification',
        status: 'FAIL',
        detail: 'drand-api-verification.json absent, unreadable or without per-round results — run npm run timing first (requires internet)',
      });
    } else {
      const problems: string[] = [];
      let verified = 0;
      let bound = 0;
      for (const r of ctx.rounds) {
        const hits = drand.results.filter((e: { roundId: number }) => e?.roundId === r.roundId);
        if (hits.length !== 1) { if (problems.length < 5) problems.push(`round ${r.roundId}: ${hits.length} records`); continue; }
        const e = hits[0];
        bound++;
        const sameBeacon = e.drandRoundId === r.result.drandRoundId && e.datasetSignature === r.result.drandRandomness;
        const apiMatches = typeof e.apiSignature === 'string' && /^[0-9a-f]{96}$/.test(e.apiSignature) && e.apiSignature === e.datasetSignature;
        if (sameBeacon && apiMatches) verified++;
        else if (problems.length < 5) problems.push(`round ${r.roundId}: ${!sameBeacon ? 'record is not this round\'s beacon' : 'api signature differs from the dataset'}`);
        if ((e.signatureMatch === true) !== apiMatches && problems.length < 5) problems.push(`round ${r.roundId}: signatureMatch flag ${e.signatureMatch} disagrees with the recomputed comparison`);
      }
      const strays = drand.results.length - bound;
      const countersOk = drand.totalRounds === drand.results.length && drand.passed === verified && drand.failed === drand.results.length - verified;
      const chainOk = drand.chain === QUICKNET_CHAIN;
      const ok = verified === EXPECTED_ROUNDS && bound === EXPECTED_ROUNDS && strays === 0 && countersOk && chainOk && problems.length === 0;

      results.push({
        step: 15,
        name: 'drand API Signature Verification',
        status: ok ? 'PASS' : 'FAIL',
        detail: ok
          ? `${verified}/${EXPECTED_ROUNDS} dataset rounds each have exactly one api.drand.sh record (chain: quicknet) for the same beacon round, and the API signature recorded there equals the dataset signature — recomputed per record, not re-fetched (no network in verify); the file's own counters agree`
          : `${verified}/${EXPECTED_ROUNDS} recomputed verified; ${bound} rounds bound to exactly one record, ${strays} record(s) not bound to a dataset round; `
            + `counters ${countersOk ? 'agree' : `disagree (file says total ${drand.totalRounds}, passed ${drand.passed}, failed ${drand.failed})`}; chain ${chainOk ? 'quicknet' : 'NOT quicknet'}`
            + `${problems.length ? ' — ' + problems.join('; ') : ''}`,
        data: { required: EXPECTED_ROUNDS, verified, bound, strays, countersAgree: countersOk, chainIsQuicknet: chainOk, fileCounters: { total: drand.totalRounds, passed: drand.passed, failed: drand.failed } },
      });
    }
  }

  return results;
}
