/**
 * Duel Crash — Two-pass simulation.
 *
 * Pass 1: 5M rounds across 10 independent seed streams (500K each).
 *         Each stream gets its own chi-squared test. Results combined via
 *         Fisher's method: -2 Σ ln(p_i) ~ χ²(2K). This eliminates
 *         single-stream Monte Carlo variance as a failure mode.
 *         Serial independence tested on full 5M combined stream.
 *         RTP tracked at 5 cashout targets: 1.5×, 2×, 5×, 10×, 50×.
 *
 * Pass 2: All 1100 casino server seeds × 10,000 deterministic drand values each (raised from 1,000 on 2026-09-26 to the profile floor),
 *         each at the cash-out target its captured round was played at: the return of the played targets
 *         against its exact mean and variance, and the captured round ranked among its seed's reference
 *         draws (rewritten 2026-09-26, profile CRASH-21; it was a per-seed chi-squared fail count).
 *
 * Output: outputs/simulation-results.json + outputs/rtp-convergence.html
 */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';

// Pinned charts carry no CDN script (Mike 2026-09-28, F16): the library is inlined verbatim from the
// chart.js devDependency (exact version, package-lock.json), so the artifact renders offline, forever,
// and every byte it executes is inside the pinned file.
const CHARTJS_SOURCE = fs.readFileSync(path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js'), 'utf8');

import { computeCrashPoint, computeCrashPointFromBuffer, survivalProbability } from './rng';
import { chiSquaredTest, chiSquaredPValue, lag1Autocorrelation, runsTest } from './stats';
import type { CrashDataset } from './types';

// ── Deterministic seed stream ─────────────────────────────────────────────

/** Derive a deterministic hex string from a domain + index. Same input → same output. */
function deterministicHex(seed: string, index: number, bytes: number): string {
  return crypto.createHmac('sha256', seed).update(String(index)).digest('hex').slice(0, bytes * 2);
}

// ── Output location ────────────────────────────────────────────────────────
// A SIMULATION RUN MUST NOT REWRITE THE ARTIFACTS IT IS SCORED AGAINST. simulation-results.json
// and rtp-convergence.html are pinned by SHA-256 in src/artifact-pins.ts (Step 17) and their
// figures are quoted in the report; a routine `npm run simulate` used to overwrite both, so any
// run on any machine silently replaced the evidence. Without PF_EMIT=1 this run writes under
// outputs/run/ — gitignored, a run record. Refreshing the committed copies is the separate,
// deliberate `PF_EMIT=1 npm run simulate`, followed by re-pinning in the same commit.
const PF_EMIT    = process.env.PF_EMIT === '1';
const OUTPUTS_DIR = path.join(__dirname, '../outputs');
const EMIT_DIR    = PF_EMIT ? OUTPUTS_DIR : path.join(OUTPUTS_DIR, 'run');
const EMIT_LABEL  = PF_EMIT ? 'outputs' : 'outputs/run';

// ── Configuration ──────────────────────────────────────────────────────────

const PASS1_STREAMS      = 10;
const PASS1_ROUNDS_EACH  = 500_000;
const PASS1_ROUNDS_TOTAL = PASS1_STREAMS * PASS1_ROUNDS_EACH;
const PASS2_DRAND_PER_SEED = 10_000;

const CASHOUT_TARGETS = [1.5, 2, 5, 10, 50];

// Crash point bins for chi-squared.
// Edges at round 2dp values that align with the floored crash point distribution.
const BIN_EDGES = [1.00, 1.01, 1.10, 1.50, 2.00, 3.00, 5.00, 10.00, 20.00, 50.00, 100.00, Infinity];
const NUM_BINS = BIN_EDGES.length - 1; // 11 bins

function binIndex(crashPoint: number): number {
  for (let i = 0; i < NUM_BINS; i++) {
    if (crashPoint < BIN_EDGES[i + 1]) return i;
  }
  return NUM_BINS - 1;
}

/** Expected fraction in each bin from the theoretical distribution. */
function expectedFractions(): number[] {
  const fracs: number[] = [];
  for (let i = 0; i < NUM_BINS; i++) {
    const pAboveLow = survivalProbability(BIN_EDGES[i]);
    const pAboveHigh = BIN_EDGES[i + 1] === Infinity ? 0 : survivalProbability(BIN_EDGES[i + 1]);
    fracs.push(pAboveLow - pAboveHigh);
  }
  return fracs;
}

// ── Progress bar ───────────────────────────────────────────────────────────

function progressBar(current: number, total: number, label: string, startTime: number) {
  const pct = current / total;
  const width = 30;
  const filled = Math.round(width * pct);
  const bar = '━'.repeat(filled) + '╌'.repeat(width - filled);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const eta = pct > 0 ? ((Date.now() - startTime) / pct * (1 - pct) / 1000).toFixed(0) : '?';
  process.stdout.write(`\r  ${label} [${bar}] ${(pct * 100).toFixed(1)}% ${elapsed}s/${eta}s ETA`);
}

// ── Pass 1 ─────────────────────────────────────────────────────────────────

function runPass1() {
  console.log('\n══ Pass 1: Multi-Stream Random Seeds ══');
  console.log(`  ${PASS1_STREAMS} streams × ${PASS1_ROUNDS_EACH.toLocaleString()} rounds = ${PASS1_ROUNDS_TOTAL.toLocaleString()} total`);
  console.log(`  ${NUM_BINS} bins, ${CASHOUT_TARGETS.length} targets: ${CASHOUT_TARGETS.map(t => t + '×').join(', ')}`);
  console.log(`  Chi-squared per stream, combined via Fisher's method\n`);

  const expFracs = expectedFractions();
  const streamResults: { chi2: number; df: number; pValue: number }[] = [];

  // Aggregate accumulators across all streams
  const allCrashPoints: number[] = [];
  const totalPayout: Record<number, number> = {};
  for (const t of CASHOUT_TARGETS) totalPayout[t] = 0;

  // Convergence tracking — per target (aggregate across all streams)
  const convergencePoints = [1000, 5000, 10000, 50000, 100000, 500000, 1000000, 2000000, 5000000]
    .filter(n => n <= PASS1_ROUNDS_TOTAL);
  const convergenceData: { rounds: number; rtp: Record<number, number> }[] = [];

  const startTime = Date.now();
  let globalRound = 0;

  for (let s = 0; s < PASS1_STREAMS; s++) {
    const observed = new Array(NUM_BINS).fill(0);

    for (let i = 0; i < PASS1_ROUNDS_EACH; i++) {
      const serverSeed = deterministicHex(`pass1-server-stream-${s}`, i, 32);
      const drandSeed  = deterministicHex(`pass1-drand-stream-${s}`, i, 48);
      const cp = computeCrashPoint(serverSeed, drandSeed);

      observed[binIndex(cp)]++;
      allCrashPoints.push(cp);

      for (const t of CASHOUT_TARGETS) {
        if (cp >= t) totalPayout[t] += t;
      }

      globalRound++;
      if (convergencePoints.includes(globalRound)) {
        const snap: Record<number, number> = {};
        for (const t of CASHOUT_TARGETS) snap[t] = totalPayout[t] / globalRound;
        convergenceData.push({ rounds: globalRound, rtp: snap });
      }

      if (globalRound % 50000 === 0) progressBar(globalRound, PASS1_ROUNDS_TOTAL, 'Pass 1', startTime);
    }

    // Chi-squared for this stream
    const expected = expFracs.map(f => f * PASS1_ROUNDS_EACH);
    const chi2 = chiSquaredTest(observed, expected);
    streamResults.push({ chi2: chi2.chi2, df: chi2.df, pValue: chi2.pValue });
  }
  progressBar(PASS1_ROUNDS_TOTAL, PASS1_ROUNDS_TOTAL, 'Pass 1', startTime);
  console.log('\n');

  // Fisher's combined test: -2 Σ ln(p_i) ~ χ²(2K)
  const fisherStat = -2 * streamResults.reduce((sum, r) => sum + Math.log(r.pValue), 0);
  const fisherDf = 2 * PASS1_STREAMS;
  const fisherP = chiSquaredPValue(fisherStat, fisherDf);

  // Serial independence on combined 5M stream
  const lag1 = lag1Autocorrelation(allCrashPoints);
  const runs = runsTest(allCrashPoints);

  // Per-target final RTP
  const perTargetRTP: Record<string, number> = {};
  for (const t of CASHOUT_TARGETS) {
    perTargetRTP[String(t)] = totalPayout[t] / PASS1_ROUNDS_TOTAL;
  }

  // Per-stream report
  console.log('  Per-stream chi-squared:');
  for (let s = 0; s < PASS1_STREAMS; s++) {
    const r = streamResults[s];
    const mark = r.pValue < 0.01 ? ' ← below α' : '';
    console.log(`    Stream ${s}: chi2(${r.df})=${r.chi2.toFixed(2)}, p=${r.pValue.toFixed(4)}${mark}`);
  }
  const belowAlpha = streamResults.filter(r => r.pValue < 0.01).length;
  console.log(`  Streams below α=0.01: ${belowAlpha}/${PASS1_STREAMS}`);
  console.log(`\n  Fisher's combined: statistic=${fisherStat.toFixed(2)}, df=${fisherDf}, p=${fisherP.toFixed(6)}`);
  console.log(`  Lag-1 autocorrelation: r=${lag1.r.toFixed(6)}, z=${lag1.z.toFixed(3)}`);
  console.log(`  Runs test: p=${runs.p.toFixed(4)}`);
  console.log(`  Simulated RTP per target:`);
  for (const t of CASHOUT_TARGETS) {
    console.log(`    @${t}×: ${(perTargetRTP[String(t)] * 100).toFixed(4)}%`);
  }

  return {
    totalRounds: PASS1_ROUNDS_TOTAL,
    streams: PASS1_STREAMS,
    roundsPerStream: PASS1_ROUNDS_EACH,
    targets: CASHOUT_TARGETS,
    streamResults,
    fisherCombined: { statistic: fisherStat, df: fisherDf, pValue: fisherP },
    lag1R: lag1.r,
    lag1Z: lag1.z,
    runsP: runs.p,
    perTargetRTP,
    simulatedRTP: perTargetRTP['2'],
    theoreticalMaxRTP: 0.999,
    convergenceData,
  };
}

// ── Pass 2 ─────────────────────────────────────────────────────────────────

function runPass2() {
  console.log('\n══ Pass 2: Casino Seeds — cherry-pick screen at the targets actually played ══');

  const dsRaw = fs.readFileSync(path.join(__dirname, '../data/crash-master-1100rounds.json'), 'utf8');
  const ds: CrashDataset = JSON.parse(dsRaw);
  // One round per revealed seed, first-appearance order (all 1,100 seeds are distinct).
  const seen = new Set<string>();
  const rounds = ds.rounds.filter(r => (seen.has(r.result.serverSeed) ? false : (seen.add(r.result.serverSeed), true)));

  console.log(`  ${rounds.length} revealed seeds × ${PASS2_DRAND_PER_SEED} deterministic drand values each, at each round's own cash-out target\n`);

  // Profile CRASH-21 (2026-09-26): the statistic is the return of the cash-out targets actually played,
  // against its exact mean and variance, plus the captured round ranked among its own seed's reference
  // draws (exact permutation null). This replaced the per-seed chi-squared fail count. tests/steps/
  // sim-replay.ts recomputes every figure below independently and Step 14 scores the replay.
  let returnCents = 0, expectedReturn = 0, returnVariance = 0;
  let capturedReplayMismatches = 0, capturedWins = 0;
  let rankNumerator = 0, rankDenominator = 0;
  const startTime = Date.now();

  for (let s = 0; s < rounds.length; s++) {
    const round = rounds[s];
    const keyBuffer = Buffer.from(round.result.serverSeed, 'hex');
    const target = round.request.auto_cashout;
    const pWin = survivalProbability(target);
    let refWins = 0;

    for (let d = 0; d < PASS2_DRAND_PER_SEED; d++) {
      const drandSeed = deterministicHex('pass2-drand-' + s, d, 48);
      if (computeCrashPointFromBuffer(keyBuffer, drandSeed) >= target) refWins++;
    }

    returnCents += refWins * Math.round(target * 100);
    expectedReturn += PASS2_DRAND_PER_SEED * target * pWin;
    returnVariance += PASS2_DRAND_PER_SEED * target * target * pWin * (1 - pWin);

    const captured = computeCrashPointFromBuffer(keyBuffer, round.result.drandRandomness);
    if (captured !== round.result.crashPoint) capturedReplayMismatches++;
    const capturedWon = captured >= target;
    if (capturedWon) capturedWins++;

    // Captured value among the N+1 values (captured + reference): values are 0 (loss) or t (win), so
    // the mid-rank of the captured one is (#below) + (#equal + 1)/2 counted over the other N values.
    const n1 = PASS2_DRAND_PER_SEED + 1;
    const losses = PASS2_DRAND_PER_SEED - refWins + (capturedWon ? 0 : 1);
    const winsAll = n1 - losses;
    const midLoss = (losses + 1) / 2;
    const midWin = losses + (winsAll + 1) / 2;
    const centre = (n1 + 1) / 2;
    rankNumerator += (capturedWon ? midWin : midLoss) - centre;
    rankDenominator += (losses * (midLoss - centre) * (midLoss - centre) + winsAll * (midWin - centre) * (midWin - centre)) / n1;

    if ((s + 1) % 50 === 0 || s === rounds.length - 1) {
      progressBar(s + 1, rounds.length, 'Pass 2', startTime);
    }
  }
  progressBar(rounds.length, rounds.length, 'Pass 2', startTime);
  console.log('\n');

  const returnZ = (returnCents / 100 - expectedReturn) / Math.sqrt(returnVariance);
  const rankSumZ = rankNumerator / Math.sqrt(rankDenominator);

  console.log(`  Captured rounds reproduced: ${rounds.length - capturedReplayMismatches}/${rounds.length}`);
  console.log(`  Return at played targets: ${(returnCents / 100).toFixed(2)} vs exact ${expectedReturn.toFixed(2)} — z ${returnZ.toFixed(3)}`);
  console.log(`  Captured vs reference rank-sum z: ${rankSumZ.toFixed(3)}`);

  return {
    seedsTested: rounds.length,
    noncesPerSeed: PASS2_DRAND_PER_SEED,
    capturedReplayMismatches,
    returnCents,
    expectedReturn,
    returnVariance,
    returnZ,
    capturedWins,
    rankSumZ,
  };
}

// ── Convergence chart ──────────────────────────────────────────────────────

function writeConvergenceChart(convergenceData: { rounds: number; rtp: Record<number, number> }[]) {
  const theoretical = 99.9;
  const numTargets = CASHOUT_TARGETS.length;

  // Compute mean RTP and std error across targets at each sample point
  const chartData = convergenceData.map(d => {
    const rtpValues = CASHOUT_TARGETS.map(t => d.rtp[t] * 100);
    const mean = rtpValues.reduce((a, b) => a + b, 0) / numTargets;
    const variance = numTargets > 1
      ? rtpValues.reduce((a, b) => a + (b - mean) ** 2, 0) / (numTargets - 1)
      : 0;
    const stdErr = numTargets > 1 ? Math.sqrt(variance) / Math.sqrt(numTargets) : 0;
    const label = d.rounds >= 1_000_000 ? `${d.rounds / 1_000_000}M`
               : d.rounds >= 1000 ? `${d.rounds / 1000}K`
               : `${d.rounds}`;
    return { rounds: d.rounds, label, meanRTP: mean, stdDev: stdErr };
  });

  const finalPoint = chartData[chartData.length - 1];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DUEL.COM CRASH RTP CONVERGENCE \u2014 ${numTargets} TARGETS x ${(PASS1_ROUNDS_TOTAL / 1_000_000).toFixed(0)}M ROUNDS</title>
<!-- Chart.js 4.4.7 dist/chart.umd.js inlined verbatim from the npm package pinned in package-lock.json -->
<script>${CHARTJS_SOURCE}<\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; padding: 24px; }
  .container { max-width: 1100px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e0e0e0; padding: 32px; }
  h1 { text-align: center; font-size: 16px; font-weight: 600; color: #333; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 24px; }
  .chart-wrap { position: relative; height: 420px; }
  .final-box { display: inline-block; border: 2px solid #4caf50; border-radius: 8px; padding: 10px 20px; margin-top: 20px; }
  .final-box .label { font-size: 13px; color: #666; }
  .final-box .value { font-size: 22px; font-weight: 700; color: #2e7d32; }
  .final-box .check { color: #4caf50; font-size: 18px; }
  .legend { text-align: center; margin-top: 12px; font-size: 13px; color: #666; }
  .legend span { margin: 0 12px; }
  .legend .dot { display: inline-block; width: 12px; height: 3px; vertical-align: middle; margin-right: 4px; }
</style>
</head>
<body>
<div class="container">
  <h1>DUEL.COM CRASH RTP CONVERGENCE \u2014 ${numTargets} TARGETS x ${(PASS1_ROUNDS_TOTAL / 1_000_000).toFixed(0)}M ROUNDS</h1>
  <div class="chart-wrap"><canvas id="chart"></canvas></div>
  <div class="legend">
    <span><span class="dot" style="background:#1565c0;height:3px"></span> Mean RTP (${numTargets} targets: ${CASHOUT_TARGETS.map(t => t + '\u00d7').join(', ')})</span>
    <span><span class="dot" style="background:rgba(229,115,115,0.5);height:3px"></span> \u00b12 SE</span>
    <span><span class="dot" style="background:#e57373;border-top:2px dashed #e57373;height:0"></span> Theoretical distribution RTP (${theoretical.toFixed(1)}%, pre-rakeback)</span>
  </div>
  <div style="text-align:right; margin-top:8px;">
    <div class="final-box">
      <span class="label">Final Mean RTP:</span>
      <span class="value">${finalPoint.meanRTP.toFixed(3)}%</span>
      <span class="check">&#10003;</span>
    </div>
  </div>
</div>
<script>
const data = ${JSON.stringify(chartData.map(d => ({
    x: d.rounds, y: +d.meanRTP.toFixed(4), sd: +d.stdDev.toFixed(4), label: d.label,
  })))};
const theoretical = ${theoretical.toFixed(6)};
const labels = data.map(d => d.label);
const ctx = document.getElementById('chart').getContext('2d');
new Chart(ctx, {
  type: 'line',
  data: {
    labels,
    datasets: [
      { label: 'Upper band', data: data.map(d => d.y + d.sd * 2), borderColor: 'transparent', backgroundColor: 'rgba(229,115,115,0.08)', fill: '+1', pointRadius: 0, tension: 0.3 },
      { label: 'Lower band', data: data.map(d => d.y - d.sd * 2), borderColor: 'transparent', backgroundColor: 'rgba(229,115,115,0.08)', fill: false, pointRadius: 0, tension: 0.3 },
      { label: '\u00b12 SE (upper)', data: data.map(d => d.y + d.sd), borderColor: 'rgba(229,115,115,0.4)', borderWidth: 1, fill: false, pointRadius: 0, tension: 0.3 },
      { label: '\u00b12 SE (lower)', data: data.map(d => d.y - d.sd), borderColor: 'rgba(229,115,115,0.4)', borderWidth: 1, fill: false, pointRadius: 0, tension: 0.3 },
      { label: 'Theoretical', data: data.map(() => theoretical), borderColor: '#e57373', borderWidth: 2, borderDash: [8, 4], fill: false, pointRadius: 0 },
      { label: 'Mean RTP', data: data.map(d => d.y), borderColor: '#1565c0', borderWidth: 2.5, fill: false, pointRadius: 0, pointHoverRadius: 6, pointHoverBackgroundColor: '#1565c0', tension: 0.3 },
      { label: 'Final', data: data.map((d, i) => i === data.length - 1 ? d.y : null), borderColor: '#1565c0', backgroundColor: '#1565c0', pointRadius: 6, pointHoverRadius: 8, showLine: false },
    ],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => data[items[0].dataIndex].label + ' rounds',
          label: (item) => {
            if (item.datasetIndex === 5) return 'Mean RTP: ' + item.parsed.y.toFixed(4) + '%';
            if (item.datasetIndex === 4) return 'Theoretical: ' + theoretical.toFixed(4) + '%';
            return null;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Rounds', font: { size: 12 } }, ticks: { maxTicksLimit: 10 } },
      y: { title: { display: false }, ticks: { callback: v => v.toFixed(1) + '%' } },
    },
  },
});
<\/script>
</body>
</html>`;

  fs.mkdirSync(EMIT_DIR, { recursive: true });
  const outPath = path.join(EMIT_DIR, 'rtp-convergence.html');
  fs.writeFileSync(outPath, html);
  console.log(`  \u2192 ${EMIT_LABEL}/rtp-convergence.html written`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const pass1 = runPass1();
const pass2 = runPass2();

writeConvergenceChart(pass1.convergenceData);

fs.mkdirSync(EMIT_DIR, { recursive: true });

const output = {
  pass1_fresh_seeds: pass1,
  pass2_casino_seeds: pass2,
};

fs.writeFileSync(
  path.join(EMIT_DIR, 'simulation-results.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(`\n  → ${EMIT_LABEL}/simulation-results.json written`);
if (PF_EMIT) {
  console.log('  REPORT GENERATION (PF_EMIT=1): the committed artifacts in outputs/ were rewritten — re-pin them in src/artifact-pins.ts.\n');
} else {
  console.log('  Committed artifacts NOT modified (set PF_EMIT=1 to refresh them, then re-pin).\n');
}
