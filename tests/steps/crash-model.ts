/**
 * An INDEPENDENT model of the crash distribution, used by Steps 12 and 16.
 *
 * Step 12 used to compare src/rng.ts's survivalProbability() against
 * `Math.floor(2 ** 32 * 0.999 / t) / 2 ** 32` — the same expression, re-typed. That comparison
 * can only fail on a typo; it cannot catch a closed-form formula that is wrong about the game.
 *
 * This module does not use the closed form. It takes the per-value mapping the game applies to
 * each uint32 (the published algorithm, steps 5–7 in MANIFEST.md#game-and-algorithm), binds that mapping to the
 * captured rounds by recomputing each round's uint32 with its own HMAC call, and then COUNTS the
 * uint32 values whose crash point reaches a target. The count is an integer, so it is compared
 * with the closed form exactly, and RTP against the 0.999 ceiling is decided in integers too.
 *
 * Counting: crashFromValue(v) is non-increasing in v (2^32/(v+1) decreases, and floor and max
 * preserve order), so {v : crash(v) >= x} is a prefix [0, k) and k is found by bisection.
 */

import * as crypto from 'crypto';

export const TWO32 = 2 ** 32;
const TWO32N = BigInt(TWO32);

/** The per-value mapping: uint32 → displayed (2-dp floored) crash point. */
export function crashFromValue(v: number): number {
  const raw = (TWO32 / (v + 1)) * 0.999;
  return Math.max(1, Math.floor(Math.max(1, raw) * 100) / 100);
}

/** The uint32 a live round drew: first 4 bytes of HMAC-SHA256(hex(serverSeed), utf8(hex(drand)) + ':0'). */
export function valueFromRound(serverSeed: string, drandRandomness: string): number {
  const msg = Buffer.from(drandRandomness, 'hex').toString('utf-8') + ':0';
  return crypto.createHmac('sha256', Buffer.from(serverSeed, 'hex')).update(msg).digest().readUInt32BE(0);
}

/** Number of uint32 values v with crashFromValue(v) >= x. */
export function countAtOrAbove(x: number): number {
  return countAtOrAboveWith(crashFromValue, x);
}

/**
 * The same count for any non-increasing map. Exported so Step 12's negative control can run the
 * counting machinery on a deliberately wrong map and show the comparison it feeds is able to fail.
 */
export function countAtOrAboveWith(map: (v: number) => number, x: number): number {
  if (map(0) < x) return 0;
  if (map(TWO32 - 1) >= x) return TWO32;
  let lo = 0;            // map(lo) >= x
  let hi = TWO32 - 1;    // map(hi) <  x
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (map(mid) >= x) lo = mid; else hi = mid;
  }
  return lo + 1;
}

/** A 2-dp cash-out target as integer hundredths. Throws on a target that is not on the 2-dp grid. */
export function toCents(x: number): bigint {
  const c = Math.round(x * 100);
  if (Math.abs(c - x * 100) > 1e-9) throw new Error(`cash-out ${x} is not a 2-dp value`);
  return BigInt(c);
}

/**
 * RTP(x) = count·x / 2^32 against the 0.999 ceiling, in integers:
 *   deficit = 2^32·999·100 − count·cents·1000   (units of 1 / (2^32·100·1000))
 * deficit < 0 → RTP above 0.999. One uint32 value at target x is worth cents·1000 units, so
 * 0 ≤ deficit < cents·1000 means the count is the largest the 0.999 ceiling allows: RTP is at the
 * ceiling to within one value's worth, x / 2^32.
 */
export function rtpDeficitUnits(count: number, x: number): { deficit: bigint; quantum: bigint } {
  const cents = toCents(x);
  return { deficit: TWO32N * 999n * 100n - BigInt(count) * cents * 1000n, quantum: cents * 1000n };
}

/** The deficit expressed as an RTP shortfall (0.999 − RTP). For reporting only; the verdict is the integer. */
export function deficitAsRtp(deficit: bigint): number {
  return Number(deficit) / (TWO32 * 100 * 1000);
}
