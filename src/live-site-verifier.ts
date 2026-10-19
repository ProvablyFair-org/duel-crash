/**
 * LIVE-SITE PLAYER-VERIFIER PARITY (profile CRASH-24). Ported from Duel Dice, 2026-09-26.
 *
 * The public ProvablyFair.org verifier a player actually uses is the Next.js page
 * https://www.provablyfair.org/verify-bets. Its verification code ships in the page's JavaScript
 * chunks: chunk 34934e0e762aa37e.js carries the page module (Turbopack module 7721), whose verifier
 * class dispatches `VERIFY({ casinoName, ... })` to verifyDuelsGame for Duel.com. For Duel Crash that
 * lands in class method [n5.CRASH], which reads the round's drand randomness from the `clientSeed`
 * field, fixes the nonce at 0 itself, and returns `finalMultiplier` — the crash point as a toFixed(2)
 * string — and the server-seed hash. It computes no win flag and no payout. A player who pastes a
 * round into that page is trusting THAT code, not this package's port. Its source repository is not
 * available to this audit; the deployed bundle is.
 *
 * WHAT THIS FILE DOES.
 *   1. PINS the SHA-256 of the three site files the Duel derivations need (LIVE_SITE_PINS): the
 *      site's Turbopack runtime chunk, the chunk carrying the page module and its crypto
 *      dependencies, and the chunk carrying the `process` shim those dependencies require — plus the
 *      package's own runner (verifier-parity/live-site/run-live-verifier.cjs), so an edit to the
 *      harness is as visible as an edit to the site bytes.
 *   2. Holds byte-exact copies under verifier-parity/live-site/chunks/. The copies must hash to the pins
 *      or the parity leg FAILs before anything runs.
 *   3. EXECUTES them — not a re-typing — in a child Node process (the runner), which evaluates the
 *      chunks with the site's own Turbopack runtime, instantiates the page module, and makes on every
 *      round the call the page's "Verify Result" button makes. The runner's header lists every line of
 *      harness surface. The child process is used because the Duel path awaits WebCrypto
 *      (crypto.subtle) and the suite is synchronous.
 *
 * scripts/check-live-site-verifier.mjs re-downloads the live page and each pinned chunk (GET only) and
 * compares the bytes with these pins (exit 1 on any difference), so a site deploy that changed the
 * verifier is caught at release time. It was NOT run for this package (no network in this round).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

export const LIVE_SITE_DIR = path.join(__dirname, '../verifier-parity/live-site');
export const LIVE_SITE_RUNNER = 'run-live-verifier.cjs';

/** Path under verifier-parity/live-site → SHA-256 of the exact bytes. */
export const LIVE_SITE_PINS: Readonly<Record<string, string>> = Object.freeze({
  'chunks/turbopack-828b80f561e7c968.js': '6e8629f444df945f8fecfdfe05e24f4fa6c63b6b1ecc8f39fc45e9c4f4ecc903',
  'chunks/34934e0e762aa37e.js':           '9fb319dec0d79f9bf5851ec8e0052b6b2125e603be03d12b78a0fe99eed817d1',
  'chunks/4f34301b2f166201.js':           '8111e3f3e9a137888558f69547a19b0238d1c50a339b4c51095f9481785df0f5',
  'run-live-verifier.cjs':                '6f0709e6d749b189409faa1093e22a401df1fbbabb81d01140530750cf943f9a',
});

/** Where the pinned site bytes came from. The three chunks were copied byte for byte from the Duel Dice
 *  package's verifier-parity/live-site/chunks/ (pf-duel-workspace/games/dice), which recorded them from
 *  read-only GETs of our own public site on 2026-09-25; each copy hashes to the same pin that package
 *  holds. No network request was made for this package. */
export const LIVE_SITE_PROVENANCE = Object.freeze({
  page: 'https://www.provablyfair.org/verify-bets',
  chunkBase: 'https://www.provablyfair.org/_next/static/chunks/',
  fetchedOn: '2026-09-25',
  copiedFrom: 'pf-duel-workspace/games/dice/verifier-parity/live-site/chunks (2026-09-26)',
  /** SHA-256 of the page HTML as served at fetch time (recorded by the Dice package). */
  pageSha256AtFetch: 'ab20af5a6157c914e7d448a98d711851366f5a5f374335f45f0afbf852fddecd',
  pageEtagAtFetch: '"q4121ltuup261t"',
  /** Vercel deployment id written into the runtime chunk. */
  deploymentId: 'dpl_CxkerpJA9YjmxnP8qfA4d2jqFdti',
  pageModule: 7721,
});

export type LiveSiteCasino = 'Duel.com';
export interface LiveSiteRound { id: string; serverSeed: string; drandRandomness: string }

export interface LiveSiteRun {
  files: Array<{ file: string; pinned: string; actual: string | null; match: boolean }>;
  hashesMatch: boolean;
  /** id → the crash-point string the site returned (null if it returned none). */
  crashPoints: Map<string, string | null> | null;
  /** id → the server-seed hash the site printed (null if none). */
  seedHashes: Map<string, string | null> | null;
  /** Module ids the runner replaced with inert stand-ins (the page's rendering stack). */
  standIns: number[];
  error: string | null;
}

const sha256 = (b: Buffer): string => crypto.createHash('sha256').update(b).digest('hex');

/**
 * Hash the vendored files against the pins and, only if every one matches, run the site's verifier
 * on `rounds`. Never throws: a failure is returned as `error` so the calling step reports a FAIL.
 */
export function runLiveSiteVerifier(casinoName: LiveSiteCasino, rounds: LiveSiteRound[], dir = LIVE_SITE_DIR): LiveSiteRun {
  const files = Object.entries(LIVE_SITE_PINS).map(([file, pinned]) => {
    const p = path.join(dir, file);
    const actual = fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null;
    return { file, pinned, actual, match: actual === pinned };
  });
  const hashesMatch = files.every(f => f.match);
  const none = { crashPoints: null, seedHashes: null, standIns: [] as number[] };
  if (!hashesMatch) return { files, hashesMatch, ...none, error: 'vendored live-site verifier does not match its pinned SHA-256' };
  const r = spawnSync(process.execPath, [path.join(dir, LIVE_SITE_RUNNER), path.join(dir, 'chunks')], {
    input: JSON.stringify({ casinoName, rounds }),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) {
    return { files, hashesMatch, ...none,
      error: `live-site verifier runner exited ${r.status}: ${(r.stderr || String(r.error || '')).trim().slice(0, 400)}` };
  }
  try {
    const out = JSON.parse(r.stdout) as { standIns: number[]; results: Array<{ id: string; finalMultiplier: string | null; serverSeedHash: string | null }> };
    const crashPoints = new Map<string, string | null>();
    const seedHashes = new Map<string, string | null>();
    for (const x of out.results) {
      crashPoints.set(String(x.id), typeof x.finalMultiplier === 'string' ? x.finalMultiplier : null);
      seedHashes.set(String(x.id), typeof x.serverSeedHash === 'string' ? x.serverSeedHash : null);
    }
    return { files, hashesMatch, crashPoints, seedHashes, standIns: out.standIns, error: null };
  } catch (e) {
    return { files, hashesMatch, ...none, error: `live-site verifier output unreadable: ${(e as Error).message}` };
  }
}

/**
 * The page's crash-point string → integer hundredths, or null when it is not exactly the 2-dp decimal
 * form `<digits>.<2 digits>` of a value ≥ 1.00 (so the comparison stays integer equality).
 */
export function liveCrashCents(s: string | null | undefined): number | null {
  if (typeof s !== 'string' || !/^[0-9]+\.[0-9]{2}$/.test(s)) return null;
  const c = Number(s.replace('.', ''));
  return Number.isSafeInteger(c) && c >= 100 ? c : null;
}
