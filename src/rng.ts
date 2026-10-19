/**
 * Duel.com Crash — RNG implementation.
 *
 * Algorithm:
 *   1. drandSeed (96-char hex BLS signature) → hex-decode to bytes → UTF-8 string
 *   2. message = UTF8(drandBytes) + ":0"    (nonce is always 0)
 *   3. hash = HMAC-SHA256(key = hex_bytes(serverSeed), message)
 *   4. value = parseInt(hash[0..7], 16)     (first 4 bytes as uint32)
 *   5. rawResult = (2^32 / (value + 1)) × (1 - 0.001)
 *   6. crashPoint = max(1.00, floor(rawResult × 100) / 100)
 *
 * Key encoding: Buffer.from(serverSeed, 'hex') — hex-decoded bytes, NOT UTF-8.
 * Drand encoding: hex-decode to raw bytes, then .toString('utf-8') — lossy but
 *   deterministic (same on server and verifier). This is the BLS signature field
 *   from the drand quicknet chain.
 * House edge: 0.1% (factor 0.999).
 * Nonce: always 0 — each round has its own unique server seed.
 *
 * OPERATOR SOURCE (since 2026-09-26): Duel's own Crash Verify-tab code, pasted by Paulo from duel.com
 * Verify tab on 2026-09-26, evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js (SHA-256
 * c699cd54…5271d, pinned in src/operator-verifier.ts). "Lxx" is a line of that file. Every citation is
 * listed in OPERATOR_SOURCE_CITES and checked against the pinned bytes by Step 5 and the unit tests, and
 * Step 5 EXECUTES that file on every captured round. The file returns the UNFLOORED multiplier; the
 * 2-dp floor below (computeCrashPoint) is not in the operator file — the served crash point is on
 * that grid.
 */

import * as crypto from 'crypto';

/**
 * Each entry: a line of evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js and text that line must
 * contain verbatim. src/operator-verifier.ts checkOperatorCites reads the pinned file and FAILs any entry
 * whose line does not carry its text.
 */
export const OPERATOR_SOURCE_CITES: ReadonlyArray<{ line: number; text: string; ports: string }> = Object.freeze([
  { line: 27, text: 'const keyBytes = hexToBytes(keyHex);', ports: 'HMAC key = hex-decoded server seed' },
  { line: 33, text: "{ name: 'HMAC', hash: 'SHA-256' },", ports: 'HMAC-SHA256' },
  { line: 46, text: "return new TextDecoder('utf-8').decode(bytes);", ports: 'drand hex → bytes → UTF-8 string (lossy, deterministic)' },
  { line: 52, text: 'const NONCE = 0;', ports: 'nonce always 0' },
  { line: 54, text: 'const message = new TextEncoder().encode(`${randomness}:${NONCE}`);', ports: 'message = randomness:0' },
  { line: 60, text: 'const value = parseInt(hash.slice(0, 8), 16);', ports: 'first 4 bytes as uint32' },
  { line: 62, text: 'const MAX = 2 ** 32;', ports: 'MAX_UINT32' },
  { line: 63, text: 'const houseEdge = 0.001;', ports: 'HOUSE_EDGE' },
  { line: 64, text: 'const result = (MAX / (value + 1)) * (1 - houseEdge);', ports: 'rawResult' },
  { line: 66, text: 'return Math.max(1.0, result);', ports: 'floor at 1.0 (the 2-dp floor is not in the operator file)' },
]);

const MAX_UINT32 = 2 ** 32;   // operator L62
const HOUSE_EDGE = 0.001;     // operator L63

/**
 * Compute the crash point from a server seed and drand randomness.
 * Returns the raw (unformatted) crash multiplier.
 */
export function computeCrashPointRaw(serverSeed: string, drandSeed: string): number {
  const keyBuffer = Buffer.from(serverSeed, 'hex');
  const drandBytes = Buffer.from(drandSeed, 'hex');
  const randomness = drandBytes.toString('utf-8'); // lossy hex→bytes→utf8
  const message = `${randomness}:0`;

  const hmac = crypto.createHmac('sha256', keyBuffer).update(message).digest('hex');
  const value = parseInt(hmac.slice(0, 8), 16);

  const result = (MAX_UINT32 / (value + 1)) * (1 - HOUSE_EDGE);
  return Math.max(1.0, result);
}

/**
 * Compute the crash point formatted to 2 decimal places (floored).
 * This matches the API-reported crash point.
 */
export function computeCrashPoint(serverSeed: string, drandSeed: string): number {
  const raw = computeCrashPointRaw(serverSeed, drandSeed);
  return Math.floor(raw * 100) / 100;
}

/**
 * Compute crash point from pre-decoded buffers (for simulation hot path).
 */
export function computeCrashPointFromBuffer(keyBuffer: Buffer, drandSeed: string): number {
  const drandBytes = Buffer.from(drandSeed, 'hex');
  const randomness = drandBytes.toString('utf-8');
  const message = `${randomness}:0`;

  const hmac = crypto.createHmac('sha256', keyBuffer).update(message).digest('hex');
  const value = parseInt(hmac.slice(0, 8), 16);

  const result = (MAX_UINT32 / (value + 1)) * (1 - HOUSE_EDGE);
  return Math.max(1.0, Math.floor(result * 100) / 100);
}

/**
 * SHA-256 commit-reveal: verify SHA-256(hex_bytes(serverSeed)) === serverSeedHash.
 */
export function verifyHash(serverSeed: string, serverSeedHash: string): boolean {
  const seedBytes = Buffer.from(serverSeed, 'hex');
  const computed = crypto.createHash('sha256').update(seedBytes).digest('hex');
  return computed === serverSeedHash;
}

/**
 * Theoretical probability that crash point > x.
 * P(crash > x) ≈ (1 - houseEdge) / x  for x >= 1
 *
 * More precisely: the crash point is determined by a uniform uint32 value.
 * crash = max(1, 2^32/(value+1) * 0.999)
 * P(crash >= x) = P(value <= 2^32*0.999/x - 1)  for x > 0.999
 *               = floor(2^32*0.999/x) / 2^32
 */
export function survivalProbability(x: number): number {
  if (x <= 1.0) return 1.0;
  const threshold = Math.floor(MAX_UINT32 * (1 - HOUSE_EDGE) / x);
  return threshold / MAX_UINT32;
}

/**
 * Expected RTP for a cashout target of x.
 * RTP = P(crash >= x) × x = survivalProbability(x) × x
 * For any x, this should be ≤ 0.999 (the house always has 0.1% edge).
 */
export function expectedRTP(cashoutTarget: number): number {
  return survivalProbability(cashoutTarget) * cashoutTarget;
}

/**
 * Instant crash probability: P(crash = 1.00).
 * crash = 1.00 when raw result < 1.01 (floored to 1.00).
 * raw < 1.01 when value > 2^32*0.999/1.01 - 1
 */
export function instantCrashProbability(): number {
  const threshold = Math.floor(MAX_UINT32 * (1 - HOUSE_EDGE) / 1.01);
  return 1 - threshold / MAX_UINT32;
}
