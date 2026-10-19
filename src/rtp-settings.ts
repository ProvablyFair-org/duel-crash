/**
 * RTP-CLAIM wiring — Duel Crash: the per-setting exact RTP table and the claim it is held to.
 *
 * The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (its
 * SHA-256 is compared by conformance C-13), version 1.2.0 (Methodology v1.1, agreed 2026-10-14;
 * 1.0.0 agreed on Slack 2026-09-29). The enforcement switch RTP_CLAIM_RULE_ENFORCED is the
 * package's own src/rtp-claim-switch.ts, set to true (decision D3): the outcome is scored on the
 * step carrying CRASH-19, and a house-side miss makes the verdict RTP FIGURE OVERSTATED (exit 5),
 * never NOT PROVABLY FAIR. The claim names one of the rule's six places: the fairness page.
 *
 * SETTINGS. Every 0.01 cash-out target from 1.01× to RTP_GRID_MAX = 100,000× (src/loader.ts, where
 * the bound and its reason are stated — Duel declares no maximum target): 9,999,900 settings. Too
 * many rows to commit: the table carries per-decade buckets, the true min and max rows and every
 * house-side row up to RETAIN_ROWS; every setting is still scored exactly.
 * EXACT RTP. count(x) · x / 2^32, count(x) = the number of uint32 values whose displayed crash point
 * reaches x, COUNTED on the operator's per-value map by bisection (tests/steps/crash-model.ts, the
 * independent model Step 16 uses). This is the DISTRIBUTION RTP (CRASH-19's scope). Settlement is
 * stated separately: the wallet ledger credits the full amount × cashout on the 3 wins looked up
 * (MANIFEST Money Model / DL-1); the captured amountWon (×0.999) is not the credit.
 * CLAIM. Flat 0.1 % distribution edge = RTP 999/1000, shown on the fairness page: houseEdge = 0.001 in
 * the code panel of the Verify tab on Duel's Provably Fair page (src/rng.ts:43, E16, pasted from
 * duel.com 2026-09-26), and the served effectiveEdge 0.1 on all 1,100 rounds (Step 7;
 * MANIFEST.md#payouts-and-rtp; declaration gameModel.edge.claimed 0.001).
 *
 *   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
 */
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { RtpClaim, RtpClaimAccumulator, RtpClaimResult, rtpClaimTable, rtpClaimGate, RtpClaimGate } from './rtp-claim';
import { RTP_GRID_MAX } from './loader';
import { countAtOrAbove } from '../tests/steps/crash-model';

export const RTP_CLAIM: RtpClaim = {
  kind: 'flat',
  rtp: '0.999',
  source: 'fairness page: houseEdge = 0.001 in the code panel of the Verify tab on Duel\'s Provably Fair page (Provably Fair → Verify, game Crash; src/rng.ts:43, E16, pasted 2026-09-26), and effectiveEdge 0.1 served on all 1,100 rounds (Step 7; MANIFEST.md#payouts-and-rtp; declaration gameModel.edge.claimed 0.001)',
};

/** The scored step that carries the full-grid half of CRASH-19 (src/profile-map.ts). */
export const RTP_CLAIM_STEP = 16;
/** House-side rows kept in the committed table beyond the buckets and the two extremes. */
export const RETAIN_ROWS = 1000;

export const RTP_CLAIM_TABLE = path.join(__dirname, '..', 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write). */
export const RTP_CLAIM_TABLE_SHA256 = '39d3bc0f7415b97943701081c47700fef5f6baff155b77b815a859516c2c61c9';

const DECADES: Array<[number, number, string]> = ([[101, 200], [200, 1000], [1000, 10000], [10000, 100000], [100000, 1000000], [1000000, 10000001]] as const)
  .map(([lo, hi]) => [lo, hi, `${(lo / 100).toFixed(2)}× – <${(hi / 100).toFixed(2)}×`]);
const decade = (c: number): string => {
  for (const [lo, hi, name] of DECADES) if (c >= lo && c < hi) return name;
  return 'other';
};

export function computeRtpClaim(): RtpClaimResult {
  const acc = new RtpClaimAccumulator(RTP_CLAIM, { retainRows: RETAIN_ROWS });
  const D = BigInt(2 ** 32) * 100n;
  for (let c = 101; c <= RTP_GRID_MAX * 100; c++) {
    const n = countAtOrAbove(c / 100);
    acc.add(() => `cashout=${(c / 100).toFixed(2)}`, BigInt(n) * BigInt(c), D, decade(c));
  }
  return acc.result();
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'duel/crash', game: 'crash',
    settingSpace: `every 0.01 cash-out target 1.01× – ${RTP_GRID_MAX.toLocaleString('en-US')}× (9,999,900 settings; rows = extremes + house-side rows up to ${RETAIN_ROWS}, buckets = per decade)`,
    rtpMethod: 'exact rational: count(x)·x/2^32, count by bisection on the operator per-value map (distribution RTP; the wallet credits the full amount × cashout on the 3 wins looked up, MANIFEST Money Model / DL-1)',
  });
}

export function runRtpClaimGate(): RtpClaimGate {
  const r = computeRtpClaim();
  return rtpClaimGate(r, rtpClaimTableText(r), RTP_CLAIM_TABLE, RTP_CLAIM_TABLE_SHA256);
}

if (require.main === module) {
  const text = rtpClaimTableText(computeRtpClaim());
  fs.writeFileSync(RTP_CLAIM_TABLE, text);
  console.log(`wrote outputs/rtp-claim-table.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
