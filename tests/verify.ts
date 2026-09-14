/**
 * Crash audit verification suite — 15 scored steps + informational items.
 * Run: npm run verify
 */

import * as fs   from 'fs';
import * as path from 'path';

import { loadDataset, checkDatasetHash } from '../src/loader';
import type { StepResult, InfoItem }     from './steps/context';

import * as commitment  from './steps/commitment';
import * as determinism from './steps/determinism';
import * as payouts     from './steps/payouts';
import * as dataset     from './steps/dataset';
import * as simulation  from './steps/simulation';
import * as statistical from './steps/statistical';
import * as artifacts   from './steps/artifacts';

// ── Pre-flight: dataset hash ───────────────────────────────────────────────

const hashCheck = checkDatasetHash();
console.log('\n  Dataset hash check:');
console.log(`    Expected: ${hashCheck.expected || '(not pinned yet)'}`);
console.log(`    Actual:   ${hashCheck.actual}`);
console.log(`    Status:   ${hashCheck.match ? 'MATCH ✓' : 'MISMATCH ✗ — abort'}\n`);
if (!hashCheck.match) { process.exit(1); }

// ── Setup ─────────────────────────────────────────────────────────────────

const ds = loadDataset();
const rounds = ds.rounds;
const phaseA = rounds.filter(r => r.phase === 'A');
const phaseB = rounds.filter(r => r.phase === 'B');
const phaseC = rounds.filter(r => r.phase === 'C');
const outputsDir = path.join(__dirname, '../outputs');

console.log('══════════════════════════════════════════════════════════');
console.log('  CRASH AUDIT — VERIFICATION SUITE');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Dataset: ${rounds.length} rounds  |  ${ds.meta.createdAt} → ${ds.meta.completedAt}`);
console.log(`  Phase A: ${phaseA.length}  Phase B: ${phaseB.length}  Phase C: ${phaseC.length}\n`);

// ── Build context ─────────────────────────────────────────────────────────

const ctx = { rounds, phaseA, phaseB, phaseC, outputsDir };

// ── Run scored steps ─────────────────────────────────────────────────────

const results: StepResult[] = [
  ...commitment.run(ctx),    // Steps  1– 4
  ...determinism.run(ctx),   // Steps  5– 6
  ...payouts.run(ctx),       // Steps  7– 9
  ...dataset.run(ctx),       // Steps 10–12
  ...simulation.run(ctx),    // Steps 13–15
  ...artifacts.run(ctx),     // Step 16
];

// ── Display scored steps ─────────────────────────────────────────────────

console.log('── Scored Steps ──\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'FLAG' ? '⚠' : '✗';
  console.log(`  ${icon} Step ${String(r.step).padStart(2)}: ${r.name}`);
  console.log(`    ${r.detail}\n`);
}

// ── Run informational items ──────────────────────────────────────────────

const infoItems: InfoItem[] = statistical.run(ctx);

console.log('── Informational Context (live-bet stats — not scored) ──\n');
console.log('  ┌─────────────────────────────────────────────────────────────┐');
for (const item of infoItems) {
  console.log(`  │ ${item.label}`);
  console.log(`  │   ${item.detail}`);
}
console.log('  └─────────────────────────────────────────────────────────────┘\n');

// ── Summary ───────────────────────────────────────────────────────────────

const passed   = results.filter(r => r.status === 'PASS').length;
const flags    = results.filter(r => r.status === 'FLAG').length;
const hardFail = results.filter(r => r.status === 'FAIL').length;
const total    = results.length;

console.log('══════════════════════════════════════════════════════════');
console.log(`  Passed: ${passed}/${total}`);
if (flags > 0)    console.log(`  Flags:  ${flags}`);
if (hardFail > 0) console.log(`  Fails:  ${hardFail}`);

let verdict: string;
if (hardFail > 0) {
  verdict = 'NOT PROVABLY FAIR';
} else if (flags > 0) {
  verdict = 'PROVABLY FAIR — Conditional Pass';
} else {
  verdict = 'PROVABLY FAIR — Full Pass';
}

console.log(`\n  VERDICT: ${verdict}`);
console.log('══════════════════════════════════════════════════════════\n');

// ── Write results ─────────────────────────────────────────────────────────

if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

const output = {
  verdict,
  scored: results,
  informational: infoItems,
  summary: { passed, flags, hardFail, total },
};

fs.writeFileSync(
  path.join(outputsDir, 'verification-results.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log('  → outputs/verification-results.json written\n');

if (hardFail > 0) process.exitCode = 1;
