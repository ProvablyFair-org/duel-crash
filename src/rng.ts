/**
 * PROVENANCE (header added on integration, 20 Oct 2026; everything below this comment is the
 * clean-room module byte for byte).
 *
 * This module was REBUILT FROM A WRITTEN SPECIFICATION, not ported from Duel's code:
 *   spec      docs/ALGORITHM.md, a copy of games/crash/ALGORITHM.md in the ProvablyFair.org audit
 *             framework (pf-audit, branch clean-room-spec-2026-10-20, SHA-256 d487ca48…0ce2, not yet
 *             committed there). Written from Duel's public pages, the standard provably-fair
 *             construction, the 1,100 live rounds and black-box readings of Duel's Verify page, without
 *             opening Duel's code (its §8 lists every file read).
 *   rebuild   written by an implementer who read ONLY that spec and a module-interface file, and
 *             never opened Duel's code, its Verify-tab file, or this package's earlier src/rng.ts.
 *   self-test tests/crash/RngSpecTests.ts (the spec's §5 vectors and properties).
 *
 * Duel's published Verify-tab code (evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js, E16) is
 * NOT the source of this module. It is run byte for byte as a SECOND CHECK, by Step 5 and the unit
 * tests (src/operator-verifier.ts), next to the ProvablyFair.org docs-site and live-site verifiers.
 *
 * Three-way agreement measured on integration (20 Oct 2026, the 1,100-round capture): this module vs
 * the live rounds, crash point and commitment 1,100/1,100; vs Duel's Verify-tab code, displayed crash
 * point 1,100/1,100 (the unfloored double is bit-identical on 824/1,100 and one rounding apart on the
 * other 276: this module rounds once, 0.999·2^32/(u+1), Duel's file twice, (2^32/(u+1))·(1−0.001);
 * this module is nearer the exact value on 270 of the 276); vs the provablyfair.org live verifier,
 * crash point and printed seed hash 1,100/1,100. Step 5 of `npm run verify` re-measures all three on
 * every run.
 */
// Duel Crash crash-point derivation, written from ALGORITHM.md (clean room).
// Exports exactly the names fixed by INTERFACE.md. Node built-ins only.

import { createHash, createHmac } from "crypto";
import { TextDecoder } from "util";

// 2^32, the size of the uniform draw (ALGORITHM.md §2 Step 4).
const TWO32 = 4294967296;
const TWO32N = 4294967296n;
// Numerator of the crash formula in integer form: 100 × 0.999 × 2^32 = 999 × 2^32 / 10
// (§2 Step 5). The /10 is applied in the denominator so everything stays integral.
const NUM = 999n * TWO32N;

// Hex decoding (§2 Step 1, and O5 for malformed input).
// Pairs are read from the left; case does not matter (Step 1, ORACLE). A pair containing a
// non-hex character becomes 0x00 and a trailing odd character is dropped, which is how §6 O5
// describes the public Verify page. For valid hex this is plain hex decoding.
function hexDecode(s: string): Buffer {
  const pairs = Math.floor(s.length / 2);
  const out = Buffer.alloc(pairs);
  for (let i = 0; i < pairs; i++) {
    const pair = s.slice(2 * i, 2 * i + 2);
    out[i] = /^[0-9a-fA-F]{2}$/.test(pair) ? parseInt(pair, 16) : 0;
  }
  return out;
}

// Lossy UTF-8 decoder with WHATWG "maximal subpart" replacement (§2 Step 2).
// ignoreBOM: true keeps a leading EF BB BF as U+FEFF instead of stripping it, i.e. the
// Python / Buffer.toString behaviour that §6 O1 says the dataset matches.
const lossyUtf8 = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

// §2 Step 2: message = UTF-8(lossy-decode(drand bytes)) followed by the ASCII bytes ":0".
function buildMessage(drandSeed: string): Buffer {
  const drandBytes = hexDecode(drandSeed);
  const text = lossyUtf8.decode(drandBytes);
  return Buffer.concat([Buffer.from(text, "utf8"), Buffer.from(":0", "ascii")]);
}

// §2 Steps 3 and 4: HMAC-SHA256 keyed by the server seed bytes, then the first four digest
// bytes as an unsigned big-endian integer. No cursor, no rejection loop.
function drawU(key: Buffer, drandSeed: string): number {
  const digest = createHmac("sha256", key).update(buildMessage(drandSeed)).digest();
  return digest.readUInt32BE(0);
}

// §2 Step 5 in exact integer arithmetic: cents = floor(999 × 2^32 / (10 × (u + 1))).
// BigInt division truncates, which equals floor for these positive operands.
function centsFromU(u: number): bigint {
  return NUM / (10n * BigInt(u + 1));
}

// §2 Step 5, clamp: the displayed value is never below 1.00.
function displayedFromU(u: number): number {
  return Math.max(1, Number(centsFromU(u)) / 100);
}

/** Crash multiplier before flooring to cents, with the 1.00 clamp applied (§2 Step 5). */
export function computeCrashPointRaw(serverSeed: string, drandSeed: string): number {
  const u = drawU(hexDecode(serverSeed), drandSeed);
  return Math.max(1, (0.999 * TWO32) / (u + 1));
}

/** Displayed crash point: floored to the cent, clamped at 1.00 (§2 Steps 1–5). */
export function computeCrashPoint(serverSeed: string, drandSeed: string): number {
  return computeCrashPointFromBuffer(hexDecode(serverSeed), drandSeed);
}

/** As computeCrashPoint, with the HMAC key bytes already decoded (§2 Step 3). */
export function computeCrashPointFromBuffer(keyBuffer: Buffer, drandSeed: string): number {
  return displayedFromU(drawU(keyBuffer, drandSeed));
}

/** Commitment check: SHA-256 over the hex-decoded seed bytes, not the ASCII text (§1.2). */
export function verifyHash(serverSeed: string, serverSeedHash: string): boolean {
  const h = createHash("sha256").update(hexDecode(serverSeed)).digest("hex");
  return h === serverSeedHash.toLowerCase();
}

// Smallest integer cent count k whose displayed value k/100 is >= x, using the same double
// comparison a win check makes (§3.1, crashPoint >= target). Avoids float artefacts such as
// 1.1 × 100 = 110.00000000000001.
function minCentsReaching(x: number): number {
  let k = Math.round(x * 100);
  while (k / 100 < x) k++;
  while ((k - 1) / 100 >= x) k--;
  return k;
}

/**
 * P(displayed crash point >= x), exact over the 2^32 equally likely u (§2 Step 5 survival law).
 * cents(u) >= k  <=>  u + 1 <= 999·2^32 / (10k), so the count is floor(999·2^32 / (10k)).
 * Any x <= 1.00 is always reached because of the clamp.
 */
export function survivalProbability(x: number): number {
  if (Number.isNaN(x)) throw new RangeError("survivalProbability: x is NaN");
  if (x <= 1) return 1;
  if (x === Infinity) return 0;
  const k = minCentsReaching(x);
  if (k <= 100) return 1;
  let count = NUM / (10n * BigInt(k));
  if (count > TWO32N) count = TWO32N;
  // count < 2^53 and the divisor is a power of two, so this division is exact.
  return Number(count) / TWO32;
}

/** Distribution return of auto-cashout target x, no payout-side factor (§3.2 keeps them apart). */
export function expectedRTP(cashoutTarget: number): number {
  return survivalProbability(cashoutTarget) * cashoutTarget;
}

/** P(displayed crash point == 1.00) = 1 − count(1.01) / 2^32 (§2 Step 5). */
export function instantCrashProbability(): number {
  const reaches101 = NUM / 1010n;
  return Number(TWO32N - reaches101) / TWO32;
}
