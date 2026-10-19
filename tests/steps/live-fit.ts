/**
 * Step 18 — Live-Sample Fit (profile CRASH-22). Ported from another ProvablyFair.org crash package.
 *
 * INFORMATIONAL AND VERDICT-LIGHT BY DESIGN. The 1,100 captured rounds are too few to prove a
 * distribution — Step 5's exact recomputation and the replayed 5M-round simulation (Step 13) do that —
 * but a scored step whose statistics REACT to the live sample means a corrupted or reordered sample
 * cannot pass silently. The leading uint32 each live round drew (recomputed with its own HMAC by the
 * independent model, tests/steps/crash-model.ts) is fitted to uniform with a χ² on LIVE_FIT_BINS equal
 * bins, and its serial dependence tested in capture order (lag-1 z, Wald–Wolfowitz runs). A deviation
 * (χ² p < α, |lag-1 z| ≥ 3 or runs p < α) turns the step to INFO — never to FLAG or FAIL: profile policy
 * INFORMATIONAL (Mike 2026-09-29), reported, never counted, verdict unchanged. The measured statistics
 * live in `data`; the sentence states the bounds.
 */

import type { VerifyContext, StepResult } from './context';
import { valueFromRound, TWO32 } from './crash-model';
import { chiSquaredTest, lag1Autocorrelation, runsTest } from '../../src/stats';
import { EXPECTED_ROUNDS, LIVE_FIT_BINS, LIVE_FIT_ALPHA } from '../../src/loader';

export function run(ctx: VerifyContext): StepResult[] {
  const { rounds } = ctx;
  const u = rounds.map(r => valueFromRound(r.result.serverSeed, r.result.drandRandomness) / TWO32);
  const obs = new Array(LIVE_FIT_BINS).fill(0);
  for (const x of u) obs[Math.min(LIVE_FIT_BINS - 1, Math.floor(x * LIVE_FIT_BINS))]++;
  const chi = chiSquaredTest(obs, new Array(LIVE_FIT_BINS).fill(rounds.length / LIVE_FIT_BINS));
  const lag1 = lag1Autocorrelation(u);
  const runs = runsTest(u);
  const uniformOk = chi.pValue >= LIVE_FIT_ALPHA;
  const serialOk = Math.abs(lag1.z) < 3 && runs.p >= LIVE_FIT_ALPHA;
  const popOk = rounds.length === EXPECTED_ROUNDS;
  const ok = uniformOk && serialOk && popOk;
  return [{
    step: 18,
    name: 'Live-Sample Fit (informational)',
    status: ok ? 'PASS' : 'INFO',
    detail: ok
      ? `the ${EXPECTED_ROUNDS} live rounds' recomputed leading uint32 values fit uniform on ${LIVE_FIT_BINS} equal bins (χ² p ≥ ${LIVE_FIT_ALPHA}) and show no serial dependence in capture order (|lag-1 z| < 3, runs p ≥ ${LIVE_FIT_ALPHA}); informational — the distribution is proven by Steps 5 and 13. Statistics in this step's data block.`
      : `live-sample deviation (INFO, informational — reported, not counted, verdict unchanged): ${[!popOk ? `${rounds.length} rounds, ${EXPECTED_ROUNDS} declared` : '', !uniformOk ? `χ² p below ${LIVE_FIT_ALPHA}` : '', !serialOk ? 'serial dependence beyond |lag-1 z| < 3 / runs p ≥ α' : ''].filter(Boolean).join('; ')}`,
    data: { n: rounds.length, bins: LIVE_FIT_BINS, alpha: LIVE_FIT_ALPHA, chi2: chi.chi2, df: chi.df, chi2P: chi.pValue, lag1R: lag1.r, lag1Z: lag1.z, runsZ: runs.z, runsP: runs.p },
  }];
}
