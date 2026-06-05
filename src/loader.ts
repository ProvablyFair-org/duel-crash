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

export function checkDatasetHash(): { expected: string; actual: string; match: boolean } {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const actual = crypto.createHash('sha256').update(raw).digest('hex');
  const match = EXPECTED_HASH.length === 0 || actual === EXPECTED_HASH;
  return { expected: EXPECTED_HASH, actual, match };
}

export function loadDataset(): CrashDataset {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw) as CrashDataset;
}
