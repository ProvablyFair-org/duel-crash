# Module interface the audit package expects (written by the auditor, not from the casino)

Write `rng.ts` (TypeScript, strict, Node `crypto` only, no dependencies) exporting exactly these names.
Semantics come from ALGORITHM.md; this file only fixes names, types and the package's own conventions.
`drandSeed` = the drand value exactly as the casino publishes it per round (the spec says which field and encoding).

```ts
// Crash multiplier BEFORE flooring to cents, but with the spec's 1.00 lower clamp applied
// (i.e. max(1, the spec's unrounded value)).
export function computeCrashPointRaw(serverSeed: string, drandSeed: string): number;
// The crash point as the game shows it: the spec's floored-to-cents value with its 1.00 floor.
export function computeCrashPoint(serverSeed: string, drandSeed: string): number;
// Same as computeCrashPoint, with the HMAC key bytes already decoded from the server seed.
export function computeCrashPointFromBuffer(keyBuffer: Buffer, drandSeed: string): number;
// Commitment check.
export function verifyHash(serverSeed: string, serverSeedHash: string): boolean;

// Exact model helpers over the uniform 32-bit value the spec draws:
// P(displayed crash point >= x), computed exactly from the spec's formula (not an approximation).
export function survivalProbability(x: number): number;
// Return-to-player of auto-cashout target x, excluding any payout-side factor: survivalProbability(x) * x.
export function expectedRTP(cashoutTarget: number): number;
// P(displayed crash point == 1.00).
export function instantCrashProbability(): number;
```
Payout arithmetic is NOT part of this module; implement only the above.
