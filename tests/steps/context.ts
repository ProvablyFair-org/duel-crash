/**
 * Shared verification context for Duel Crash.
 */

import type { CrashRound, StepResult, InfoItem } from '../../src/types';

export type { StepResult, InfoItem };

export interface VerifyContext {
  rounds: CrashRound[];
  phaseA: CrashRound[];
  phaseB: CrashRound[];
  phaseC: CrashRound[];
  outputsDir: string;
}
