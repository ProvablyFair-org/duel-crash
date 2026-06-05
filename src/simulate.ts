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
 * Pass 2: All 1100 casino server seeds × 1000 random drand values each.
 *         Tests whether casino seeds produce expected distributions when
 *         combined with unknown external randomness.
 *
 * Output: outputs/simulation-results.json + outputs/rtp-convergence.html
 */

import * as crypto from 'crypto';
import * as fs     from 'fs';
import * as path   from 'path';

import { computeCrashPoint, computeCrashPointFromBuffer, survivalProbability } from './rng';
import { chiSquaredTest, chiSquaredPValue, lag1Autocorrelation, runsTest } from './stats';
import type { CrashDataset } from './types';

// ── Deterministic seed stream ─────────────────────────────────────────────

/** Derive a deterministic hex string from a domain + index. Same input → same output. */
function deterministicHex(seed: string, index: number, bytes: number): string {
  return crypto.createHmac('sha256', seed).update(String(index)).digest('hex').slice(0, bytes * 2);
}

// ── Configuration ──────────────────────────────────────────────────────────

const PASS1_STREAMS      = 10;
const PASS1_ROUNDS_EACH  = 500_000;
const PASS1_ROUNDS_TOTAL = PASS1_STREAMS * PASS1_ROUNDS_EACH;
const PASS2_DRAND_PER_SEED = 1_000;

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
  console.log('\n══ Pass 2: Casino Seeds ══');

  const dsRaw = fs.readFileSync(path.join(__dirname, '../data/crash-master-1100rounds.json'), 'utf8');
  const ds: CrashDataset = JSON.parse(dsRaw);
  const seeds = [...new Set(ds.rounds.map(r => r.result.serverSeed))];

  console.log(`  ${seeds.length} unique casino seeds × ${PASS2_DRAND_PER_SEED} random drand values each\n`);

  const expFracs = expectedFractions();
  let chi2Fails = 0;
  let totalRTP = 0;
  const startTime = Date.now();

  for (let s = 0; s < seeds.length; s++) {
    const serverSeed = seeds[s];
    const keyBuffer = Buffer.from(serverSeed, 'hex');
    const observed = new Array(NUM_BINS).fill(0);
    let payout = 0;

    for (let d = 0; d < PASS2_DRAND_PER_SEED; d++) {
      const drandSeed = deterministicHex('pass2-drand-' + s, d, 48);
      const cp = computeCrashPointFromBuffer(keyBuffer, drandSeed);

      observed[binIndex(cp)]++;
      if (cp >= 2.0) payout += 2.0;
    }

    const expected = expFracs.map(f => f * PASS2_DRAND_PER_SEED);
    const chi2 = chiSquaredTest(observed, expected);
    if (chi2.pValue < 0.01) chi2Fails++;

    totalRTP += payout / PASS2_DRAND_PER_SEED;

    if ((s + 1) % 50 === 0 || s === seeds.length - 1) {
      progressBar(s + 1, seeds.length, 'Pass 2', startTime);
    }
  }
  progressBar(seeds.length, seeds.length, 'Pass 2', startTime);
  console.log('\n');

  const meanCasinoRTP = totalRTP / seeds.length;

  console.log(`  Chi-squared failures: ${chi2Fails}/${seeds.length}`);
  console.log(`  Mean casino seed RTP @2x: ${(meanCasinoRTP * 100).toFixed(4)}%`);

  return {
    seedsTested: seeds.length,
    noncesPerSeed: PASS2_DRAND_PER_SEED,
    chi2Fails,
    meanCasinoRTP,
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
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
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

  const outPath = path.join(__dirname, '../outputs/rtp-convergence.html');
  fs.writeFileSync(outPath, html);
  console.log(`  \u2192 outputs/rtp-convergence.html written`);
}

// ── Main ───────────────────────────────────────────────────────────────────

const pass1 = runPass1();
const pass2 = runPass2();

writeConvergenceChart(pass1.convergenceData);

const outputsDir = path.join(__dirname, '../outputs');
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

const output = {
  pass1_fresh_seeds: pass1,
  pass2_casino_seeds: pass2,
};

fs.writeFileSync(
  path.join(outputsDir, 'simulation-results.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(`\n  → outputs/simulation-results.json written\n`);
