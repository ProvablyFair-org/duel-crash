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

// ── POPULATION OF RECORD ─────────────────────────────────────────────────────────
// The capture plan, stated as CODE so a shrunken dataset cannot pass by agreeing with itself.
// The phase counts used to live as three inline literals inside tests/steps/payouts.ts and the
// TOTAL was never asserted at all — so nothing in src/ said how big an honest capture is, and a
// reviewer reading the source could not find the audited population anywhere. A row count is not
// an identity: re-pinning EXPECTED_HASH is exactly what a forger does, so the counts have to be
// asserted from somewhere the dataset does not control, and a mismatch must HARD FAIL.
export const EXPECTED_ROUNDS = 1100;
export const EXPECTED_PHASE_ROUNDS: Readonly<Record<string, number>> =
  Object.freeze({ A: 800, B: 200, C: 100 });

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
