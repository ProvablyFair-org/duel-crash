/**
 * Duel.com Crash — type definitions.
 * Crash is multiplayer: no client seed, no nonce. Each round has its own
 * server seed + drand beacon. The crash point is shared by all players.
 */

export type Phase = 'A' | 'B' | 'C';

export interface CrashTiming {
  drandPublishedAt: number;       // unix seconds (drand chain formula: genesis + (round-1)*3)
  drandPublishedAtISO: string;    // ISO alias of drandPublishedAt
  commitmentBeforeDrand: number;  // milliseconds margin: drandMs - betPlacedAt (positive = bet before beacon)
  betPlacedAt: number;            // unix ms — the bet's timestamp_raw from Duel's transactions API (operator-reported, DL-2)
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
    crashPoint: number;         // the crashed event's multiplier as the capture recorded it, floor(× 100) / 100
                                // (capture/crash-capture.reference.js:172), not the served value itself
    serverSeed: string;         // revealed after crash
    serverSeedHash: string;     // the commitment; when it was first shown is not recorded (DL-2)
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
  /** INFO: an informational step's deviation (profile policy INFORMATIONAL — the live-sample fit, since
   *  2026-09-29): reported, never counted as a flag, never affects the verdict. */
  status: 'PASS' | 'FLAG' | 'FAIL' | 'INFO';
  detail: string;
  /**
   * Machine-readable measurements for this step. A measured float belongs here and never
   * inside `detail`: the reproduction gate compares the committed artifact with a fresh run
   * field by field, and a string leaf can only be compared for equality — so a float
   * rendered into prose disagrees forever on any machine whose libm differs by a unit in
   * the last place, which is exactly the reader the gate exists for. `detail` states the
   * BOUND; `data` carries the measurement.
   */
  data?: Record<string, unknown>;
}

export interface InfoItem {
  label: string;
  detail: string;
}
