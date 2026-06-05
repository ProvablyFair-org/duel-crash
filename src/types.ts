/**
 * Duel.com Crash — type definitions.
 * Crash is multiplayer: no client seed, no nonce. Each round has its own
 * server seed + drand beacon. The crash point is shared by all players.
 */

export type Phase = 'A' | 'B' | 'C';

export interface CrashTiming {
  drandPublishedAt: number;       // unix seconds (drand chain formula: genesis + (round-1)*3)
  drandPublishedAtISO: string;    // ISO alias of drandPublishedAt
  commitmentBeforeDrand: number;  // milliseconds margin: drandMs - betPlacedAt (positive = pre-commit)
  betPlacedAt: number;            // unix ms — when the bet was accepted server-side (from transactions API)
  betPlacedAtISO: string;         // ISO alias of betPlacedAt
  source: 'transactions-api' | 'capture-only';  // provenance of the timestamp
}

export interface CrashRound {
  at: string;
  phase: Phase;
  roundId: number;
  request: {
    amount: string;
    auto_cashout: number;
  };
  result: {
    crashPoint: number;         // server-reported crash multiplier (floored to 2dp)
    serverSeed: string;         // revealed after crash
    serverSeedHash: string;     // committed before round
    drandRoundId: number;       // drand quicknet round number
    drandRandomness: string;    // 96-char hex BLS signature
    betId: number;
    transactionId: number;
    amountWon: string;
    effectiveEdge: number;
    isWin: boolean;
  };
  timing: CrashTiming;
}

export interface CrashDataset {
  meta: {
    schema: string;
    createdAt: string;
    completedAt: string;
  };
  rounds: CrashRound[];
}

export interface StepResult {
  step: number;
  name: string;
  status: 'PASS' | 'FLAG' | 'FAIL';
  detail: string;
}

export interface InfoItem {
  label: string;
  detail: string;
}
