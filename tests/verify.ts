/**
 * Crash audit verification suite — 18 scored steps + informational items.
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
import * as coverage    from './steps/coverage';
import * as statistical from './steps/statistical';
import * as artifacts   from './steps/artifacts';
import * as liveFit     from './steps/live-fit';
import { fieldDiff, beyondTolerance, maxima, DIFF_ATOL, DIFF_RTOL } from '../src/diff';
import { labelFor, profileCoverageBlock } from '../src/profile-map';
import { runRtpClaimGate, RTP_CLAIM_STEP } from '../src/rtp-settings';
import { rtpClaimVerdict, RTP_FIGURE_OVERSTATED, RTP_FIGURE_OVERSTATED_EXIT } from '../src/rtp-claim';

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
  ...coverage.run(ctx),      // Step  16
  ...artifacts.run(ctx),     // Step  17
  ...liveFit.run(ctx),       // Step  18
];

// ── RTP-CLAIM rule (1.2.0, Methodology v1.1; 1.0.0 adopted 2026-09-29) ──
// The per-setting exact RTP table held to the published claim (src/rtp-settings.ts). The package
// switch RTP_CLAIM_RULE_ENFORCED is true (D3, 2026-10-14). Status OVERSTATED (a house-side miss) is
// scored on the step carrying CRASH-19 as an operator-origin FLAG (the profile's policy) and the
// verdict becomes RTP FIGURE OVERSTATED, exit 5 (rtpClaimVerdict) — never NOT PROVABLY FAIR: the
// draws themselves pass. Status FAIL means the committed table no longer equals this run (or its
// pin): a reproduction failure, exit 1, whether or not the rule is enforced; no step moves for it.
// Scored here, before the step lines are displayed, so a re-scored step prints on its own line
// instead of leaving it reading ✓ under the verdict; its lines are printed further down.
const rtpClaim = runRtpClaimGate();
const rtpOverstated = rtpClaim.status === 'OVERSTATED';
if (rtpOverstated) {
  const s = (results as any[]).find(r => r.step === RTP_CLAIM_STEP);
  if (s && s.status !== 'FAIL') {
    s.status = 'FLAG'; delete s.origin;   // operator-origin: this package has no capture-origin flag
    s.detail += ` — ${RTP_FIGURE_OVERSTATED} (RTP-CLAIM enforced): ${rtpClaim.result.minimalFix}`;
  }
}

// ── Display scored steps ─────────────────────────────────────────────────

console.log('── Scored Steps ──\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'INFO' ? 'ℹ' : r.status === 'FLAG' ? '⚠' : '✗';
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

// ── RTP-CLAIM rule: its lines (scored above, before the step display) ────────────
console.log('');
for (const line of rtpClaim.lines) console.log(`  ${line}`);

// ── Summary ───────────────────────────────────────────────────────────────

const passed   = results.filter(r => r.status === 'PASS').length;
const flags    = results.filter(r => r.status === 'FLAG').length;
const hardFail = results.filter(r => r.status === 'FAIL').length;
const total    = results.length;
// INFO (profile policy INFORMATIONAL — the live-sample fit, since 2026-09-29): reported, never counted
// as a flag, never enters the verdict or the exit code.
const informational = results.filter(r => r.status === 'INFO').length;
// One summary shape across the Duel packages (since 2026-09-28). This package has no capture-origin
// flag: every FLAG makes the verdict a Conditional Pass (below), so every flag is an operator flag.
const captureFlags  = 0;
const operatorFlags = flags - captureFlags;

console.log('══════════════════════════════════════════════════════════');
console.log(`  Passed: ${passed}/${total}`);
if (flags > 0)    console.log(`  Flags:  ${flags}`);
if (hardFail > 0) console.log(`  Fails:  ${hardFail}`);
if (informational > 0) console.log(`  Informational deviations: ${informational} (reported, not counted, verdict unchanged)`);

// Ranked by the rule's rtpClaimVerdict: a failed draw check (NOT PROVABLY FAIR) > RTP FIGURE
// OVERSTATED > Conditional Pass > Full Pass. This suite has no INCOMPLETE state; every FLAG here is
// operator-origin (see above), so `flags` is the Conditional-Pass count, as before.
const ruled = rtpClaimVerdict({ fails: hardFail, complete: true, overstated: rtpOverstated, opFlags: flags });
const verdict: string = ruled.verdict;

console.log(`\n  VERDICT: ${verdict}`);
console.log('══════════════════════════════════════════════════════════\n');

// ── Write results ─────────────────────────────────────────────────────────

// Each scored step says which ProvablyFair.org Crash profile check it implements (src/profile-map.ts),
// so the conformance matrix is DERIVED from this artifact rather than written by hand. The label is
// attached to the emitted record only: the map cannot change what any step asserts. The key is `steps`
// (it was `scored` until 2026-09-26) because that is the key the framework's matrix and conformance
// checks C-02 / C-07 / C-10 read.
const output = {
  verdict,
  steps: results.map(r => ({ ...r, ...labelFor(r.step) })),
  profileCoverage: profileCoverageBlock(),
  informational: infoItems,
  summary: { passed, flags, operatorFlags, captureFlags, hardFail, verdict },
};

// A VERIFICATION RUN MUST NOT REWRITE THE ARTIFACT IT SCORES. A run that disagrees with the
// committed evidence would otherwise destroy the evidence of the disagreement, and the next run
// would compare the repo against what the failing run had just written. This run writes under
// outputs/run/ — gitignored, a run record rather than audit evidence. The committed copy in
// outputs/ is refreshed only by PF_EMIT=1.
const PF_EMIT = process.env.PF_EMIT === '1';
const RUN_DIR = path.join(outputsDir, 'run');
const RESULTS_DIR = PF_EMIT ? outputsDir : RUN_DIR;
fs.mkdirSync(outputsDir, { recursive: true });
fs.mkdirSync(RUN_DIR, { recursive: true });

fs.writeFileSync(
  path.join(RESULTS_DIR, 'verification-results.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(`  → ${PF_EMIT ? 'outputs' : 'outputs/run'}/verification-results.json written`);
if (!PF_EMIT) console.log('  Committed artifact NOT modified.');
console.log('');

// ── Reproduction gate ─────────────────────────────────────────────────────
// THE GATE IS "BEYOND TOLERANCE", NOT "ANY FIELD". Byte identity is the right bar for exact
// content — the dataset, hash-guarded above. It is the wrong bar for a DERIVED statistic:
// recomputed on other hardware a floating-point figure can move by a unit in the last place.
// Scoring that as a disagreement trains a reader to ignore the diff, which is the one outcome
// that makes it useless. The bound is declared in src/diff.ts, far below the precision of any
// figure this audit publishes; outside it is a DIFFERENT result, and the run exits 1.
let reproductionFailures = 0;
if (!PF_EMIT) {
  const readJsonOrNull = (p: string): unknown => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
  };
  const targets: { file: string; fresh: unknown }[] = [
    { file: 'verification-results.json', fresh: output },
  ];
  // test:full regenerates the simulation into outputs/run/ (src/simulate.ts writes there unless
  // PF_EMIT=1). When that regeneration is present it is field-diffed against the pinned committed
  // artifact here, so a regeneration that drifts beyond the reproduction tolerance fails the run and is
  // recorded in outputs/run/diff.json (profile CRASH-28). Plain `npm test` does not regenerate it; the
  // pinned artifact is then held by Step 17's pin and replayed by Steps 13–14.
  const runSim = readJsonOrNull(path.join(outputsDir, 'run', 'simulation-results.json'));
  if (runSim !== null) targets.push({ file: 'simulation-results.json', fresh: runSim });
  const perFile = targets.map(t => {
    const committed = readJsonOrNull(path.join(outputsDir, t.file));
    const diffs = fieldDiff(committed, t.fresh);
    return { file: t.file, readable: committed !== null, diffs, real: beyondTolerance(diffs) };
  });
  const allDiffs  = perFile.flatMap(p => p.diffs);
  const realTotal = perFile.reduce((n, p) => n + p.real.length, 0);
  const gap       = maxima(allDiffs);

  fs.writeFileSync(path.join(RUN_DIR, 'diff.json'), JSON.stringify({
    runtime: process.versions.node,
    verdict,
    tolerance: { atol: DIFF_ATOL, rtol: DIFF_RTOL, rule: '|a-b| <= atol + rtol*max(|a|,|b|); two distinct integers never agree' },
    reproduced: realTotal === 0,
    beyondToleranceCount: realTotal,
    withinToleranceCount: allDiffs.length - realTotal,
    largestGap: gap,
    note: 'Field-level diff between the COMMITTED artifact and THIS RUN. Entries marked '
      + '`withinTolerance` are the same result computed on different hardware and are recorded, '
      + 'not scored. Any entry NOT so marked means this run disagrees with the committed '
      + 'evidence — investigate it; do not re-run until it goes away, and do not regenerate the '
      + 'committed artifact to make it go away.',
    files: perFile.map(p => ({ file: `outputs/${p.file}`, committedReadable: p.readable, differences: p.diffs })),
  }, null, 2));

  console.log(`  Reproduction vs the committed artifact on Node ${process.versions.node}: `
    + `${realTotal === 0 ? 'REPRODUCED' : `${realTotal} field(s) BEYOND TOLERANCE`}`
    + `${allDiffs.length - realTotal > 0 ? ` (${allDiffs.length - realTotal} within tolerance` + (gap ? `, largest ${gap.absDiff.toExponential(2)} at ${gap.path}` : '') + ')' : ''}`);
  console.log(`  Diff written to: outputs/run/diff.json`);
  if (realTotal > 0) {
    console.log('  ⚠ THIS RUN DISAGREES WITH THE COMMITTED EVIDENCE:');
    for (const p of perFile) {
      if (!p.readable) { console.log(`      outputs/${p.file}: committed copy absent or unreadable`); continue; }
      for (const d of p.real.slice(0, 4)) {
        console.log(`      ${p.file} ${d.path}: committed ${JSON.stringify(d.committed)} vs this run ${JSON.stringify(d.thisRun)}`);
      }
    }
  }
  reproductionFailures = realTotal;
} else {
  console.log('  REPORT GENERATION (PF_EMIT=1): the committed artifact in outputs/ was rewritten.');
}

// ── Exit contract ─────────────────────────────────────────────────────────
// FAIL -> 1, RTP FIGURE OVERSTATED -> 5, FLAG -> 2, otherwise 0, so an automated caller reads the
// verdict from the exit status. A reproduction beyond tolerance is a FAIL, not a warning: a gate
// that only prints is not a gate.
if (hardFail > 0 || reproductionFailures > 0 || !rtpClaim.tableMatches) process.exit(1);
if (ruled.exit === RTP_FIGURE_OVERSTATED_EXIT) process.exit(RTP_FIGURE_OVERSTATED_EXIT);
if (flags > 0) process.exit(2);
