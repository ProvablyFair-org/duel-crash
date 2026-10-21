/**
 * Dataset loader for Duel Crash audit.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CrashDataset } from './types';

const DATA_PATH = path.join(__dirname, '../data/crash-master-1100rounds.json');

/** SHA-256 hash of the dataset file. Update after any dataset change. */
const EXPECTED_HASH = 'ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a';

// ── POPULATION OF RECORD ──────────────────────────────────────────────────────
// The capture plan stated as CODE, next to the dataset pin, so the scored steps have
// something to check the data against that the data does not control. A dataset that
// agrees with its own header proves nothing: delete rounds, edit the header to match,
// and the file is still internally consistent — and it re-pins cleanly, because
// re-pinning is what a forger does. The phase counts used to be inlined in
// tests/steps/payouts.ts, where no other step could reach them; every step that has a
// count to check now checks it against these.
export const EXPECTED_ROUNDS = 1100;
export const EXPECTED_PHASE_ROUNDS: Readonly<Record<string, number>> =
  Object.freeze({ A: 800, B: 200, C: 100 });

// Crash has no seed rotation and therefore NO EPOCHS: each round carries its own
// server seed and commitment hash, the seed revealed after the round, and all 1,100
// are distinct. There is no epoch size to assert and no next-seed chain to walk — the
// ordering property this game does have is drand round monotonicity (Step 3), which
// shows no beacon was re-used or taken out of order (beacon selection: Step 14).
export const EXPECTED_DISTINCT_SEEDS = 1100;
export const EXPECTED_DRAND_TRANSITIONS = 1099;

// Every timing margin in this capture is anchored to a server-side timestamp from the
// transactions API. A 'capture-only' timestamp is the client's own clock and is much
// weaker evidence of when the bet was placed, so the count is pinned rather than left to vary.
export const EXPECTED_TIMING_SOURCE = 'transactions-api';
export const EXPECTED_ROUNDS_WITH_SERVER_TIMESTAMP = 1100;

// auto_cashout is the one configuration dimension. The capture exercises five targets;
// the smallest groups hold 50 rounds (5× and 10×), so a floor of 45 fails on a target reduced
// to a token sample while leaving the honest capture passing.
export const EXPECTED_CASHOUT_TARGETS: readonly number[] = Object.freeze([1.1, 1.5, 2, 5, 10]);
export const MIN_ROUNDS_PER_CASHOUT_TARGET = 45;

// BET-SIZE INVARIANCE PLAN (profile CRASH-12). Phase C plays the elevated stake at ONE cash-out target
// that is also played at the base stake, so stake is the only variable that moves between the two
// groups Step 6 compares. Stated here as code so a Phase C moved to another target, or a base-stake
// group reduced to a token sample, fails Step 6 instead of passing on whatever the data holds.
export const BASE_STAKE = '0.01';
export const PHASE_C_STAKE = '10';
export const PHASE_C_TARGET = 2;
export const EXPECTED_BASE_STAKE_ROUNDS_AT_PHASE_C_TARGET = 49;

// The crash-point grid and the edge the formula carries (profile CRASH-10 / CRASH-13). The edge is a
// DECLARED constant — the 0.1 % of MANIFEST.md#game-and-algorithm step 6, which the served field reports on every round — and the served
// `effectiveEdge` field is only ever COMPARED with it, never read into a derivation.
export const CRASH_POINT_DECIMALS = 2;
export const CRASH_POINT_FLOOR = 1;
export const DECLARED_EDGE_PERCENT = 0.1;

// THE EXTENT OF THE EXACT RTP ENUMERATION (profile CRASH-08 / CRASH-19). Step 16 counts, at every 0.01
// cash-out point from 1.01× up to this bound, the uint32 values whose crash point reaches it. Duel publishes
// no maximum cash-out target and no cap on the crash point (the map's own maximum is 2^32 × 0.999 ≈
// 4,290,672,328.70×); Duel cashes out every bet at 9,999.999× at most (Duel's statement as relayed by Mike in Slack on 21 October 2026: auto cash-out at 9999.999x),
// applied to the RTP table (src/rtp-settings.ts, OPERATOR_STATED_CASHOUT_CAP_MILLI). The
// 2-dp grid to that maximum is ~4.3·10^11 points — not enumerable per verify run. 100,000× is the bound:
// more than 7× the largest crash point this capture served (13,664.99×, round 831375 — see
// MANIFEST.md#game-and-algorithm), 9,999,900 grid points, about 1.5 s. Beyond it the survival count is NOT
// enumerated, and the step says so; every target from 10,000.00× up is scored at Duel's stated cap.
export const RTP_GRID_MAX = 100_000;

// Live-sample fit (profile CRASH-22, Step 18): 20 equal bins on the recomputed uint32, family level 0.01.
export const LIVE_FIT_BINS = 20;
export const LIVE_FIT_ALPHA = 0.01;

export function checkDatasetHash(): { expected: string; actual: string; match: boolean } {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  // FAIL-OPEN REMOVED. `EXPECTED_HASH.length === 0 || …` meant that emptying the pin made every
  // dataset match — the one edit a forger would make first. An unset pin is a broken audit, not a
  // passing one.
  const match = EXPECTED_HASH.length === 64 && actual === EXPECTED_HASH;
  return { expected: EXPECTED_HASH, actual, match };
}

export function loadDataset(): CrashDataset {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw) as CrashDataset;
}
