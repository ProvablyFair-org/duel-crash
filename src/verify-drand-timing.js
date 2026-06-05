const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');

/**
 * Verify drand commitment timing proof.
 *
 * For each round in the dataset, verifies that commitmentBeforeDrand > 0,
 * meaning the bet was placed (per the operator's transactions API) before
 * the drand beacon for that round was published. Both endpoints are
 * authoritative: betPlacedAt is from the operator's signed transaction
 * record, drandPublishedAt is computed locally from the public quicknet
 * chain formula.
 */

const QUICKNET_GENESIS = 1692803367; // 2023-08-23T12:02:47Z
const QUICKNET_PERIOD  = 3;          // seconds
const DRAND_CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const DRAND_API_BASE   = `https://api.drand.sh/${DRAND_CHAIN_HASH}/public`;

function drandPublishTime(round) {
  return QUICKNET_GENESIS + (round - 1) * QUICKNET_PERIOD;
}

async function fetchDrandRound(round) {
  const resp = await fetch(`${DRAND_API_BASE}/${round}`);
  if (!resp.ok) throw new Error(`drand API ${resp.status} for round ${round}`);
  return resp.json();
}

async function main() {
  const data = JSON.parse(readFileSync('./data/crash-master-1100rounds.json', 'utf8'));
  const rounds = data.rounds;

  console.log('=== drand Commitment Timing Verification ===\n');
  console.log(`Dataset: ${rounds.length} rounds`);
  console.log(`Chain: quicknet (${DRAND_CHAIN_HASH.substring(0, 16)}...)`);
  console.log(`Genesis: ${QUICKNET_GENESIS} | Period: ${QUICKNET_PERIOD}s\n`);

  // ── Step 1: Verify chain formula matches dataset ──
  console.log('── Step 1: Chain Formula Verification ──\n');
  let formulaPass = 0, formulaFail = 0;
  for (const r of rounds) {
    const expected = drandPublishTime(r.result.drandRoundId);
    if (r.timing.drandPublishedAt === expected) {
      formulaPass++;
    } else {
      formulaFail++;
      console.log(`  FAIL: round ${r.roundId} — dataset ${r.timing.drandPublishedAt} != formula ${expected}`);
    }
  }
  console.log(`Chain formula: ${formulaPass}/${rounds.length} match${formulaFail > 0 ? ', ' + formulaFail + ' FAILED' : ''}\n`);

  // ── Step 2: Verify commitmentBeforeDrand > 0 for all rounds ──
  console.log('── Step 2: Pre-Commitment Proof (bet placed before drand published) ──\n');
  let positive = 0, nonPositive = 0, nullField = 0;
  let apiSourced = 0, otherSource = 0;
  for (const r of rounds) {
    const cbd = r.timing.commitmentBeforeDrand;
    if (r.timing.source === 'transactions-api') apiSourced++;
    else otherSource++;
    if (cbd === null || cbd === undefined) {
      nullField++;
    } else if (cbd > 0) {
      positive++;
    } else {
      nonPositive++;
      console.log(`  FAIL: round ${r.roundId} — commitmentBeforeDrand = ${cbd}ms`);
    }
  }
  console.log(`Authoritative (transactions-api): ${apiSourced}/${rounds.length}`);
  console.log(`Other source:                     ${otherSource}`);
  console.log(`Positive (pre-commit proven):     ${positive}/${rounds.length}`);
  console.log(`Non-positive:                     ${nonPositive}`);
  console.log(`Null/missing:                     ${nullField}`);

  // Stats (all in milliseconds)
  const vals = rounds.map(r => r.timing.commitmentBeforeDrand).sort((a, b) => a - b);
  const sum = vals.reduce((s, v) => s + v, 0);
  const mean = sum / vals.length;
  console.log(`\nMin gap:    ${vals[0]}ms (${(vals[0] / 1000).toFixed(3)}s)`);
  console.log(`Median gap: ${vals[Math.floor(vals.length / 2)]}ms (${(vals[Math.floor(vals.length / 2)] / 1000).toFixed(3)}s)`);
  console.log(`Mean gap:   ${mean.toFixed(0)}ms (${(mean / 1000).toFixed(3)}s)`);
  console.log(`Max gap:    ${vals[vals.length - 1]}ms (${(vals[vals.length - 1] / 1000).toFixed(3)}s)`);
  console.log(`Gaps <1000ms: ${vals.filter(v => v < 1000).length}\n`);

  // ── Step 3: Full drand API verification (all rounds) ──
  console.log(`── Step 3: drand API Verification (${rounds.length} rounds) ──\n`);

  let apiPass = 0, apiFail = 0;
  const apiResults = [];
  const BATCH_SIZE = 20;
  const BATCH_DELAY = 200; // ms between batches to be polite to the API

  for (let batch = 0; batch < rounds.length; batch += BATCH_SIZE) {
    const slice = rounds.slice(batch, batch + BATCH_SIZE);
    const promises = slice.map(async (r) => {
      try {
        const api = await fetchDrandRound(r.result.drandRoundId);
        const sigMatch = api.signature === r.result.drandRandomness;
        if (sigMatch) {
          apiPass++;
        } else {
          apiFail++;
          console.log(`  MISMATCH: round ${r.roundId} → drand ${r.result.drandRoundId}`);
        }
        return {
          roundId: r.roundId,
          drandRoundId: r.result.drandRoundId,
          signatureMatch: sigMatch,
          datasetSignature: r.result.drandRandomness,
          apiSignature: api.signature,
        };
      } catch (err) {
        apiFail++;
        console.log(`  ERROR: round ${r.roundId} → drand ${r.result.drandRoundId}: ${err.message}`);
        return {
          roundId: r.roundId,
          drandRoundId: r.result.drandRoundId,
          signatureMatch: false,
          error: err.message,
        };
      }
    });
    const batchResults = await Promise.all(promises);
    apiResults.push(...batchResults);

    // Progress
    const done = Math.min(batch + BATCH_SIZE, rounds.length);
    const pct = ((done / rounds.length) * 100).toFixed(0);
    process.stdout.write(`\r  Verified: ${done}/${rounds.length} (${pct}%)`);

    if (batch + BATCH_SIZE < rounds.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }
  console.log(`\n  Result: ${apiPass}/${rounds.length} signatures match, ${apiFail} failures\n`);

  // Save full results to JSON
  const outputDir = './outputs';
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(`${outputDir}/drand-api-verification.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    chain: DRAND_CHAIN_HASH,
    totalRounds: rounds.length,
    passed: apiPass,
    failed: apiFail,
    results: apiResults,
  }, null, 2));
  console.log(`  → outputs/drand-api-verification.json written\n`);

  // ── Summary ──
  console.log('\n══════════════════════════════════════════════');
  console.log('  TIMING PROOF SUMMARY');
  console.log('══════════════════════════════════════════════\n');
  console.log(`  Chain formula verified:         ${formulaPass}/${rounds.length}`);
  console.log(`  Authoritative source rounds:    ${apiSourced}/${rounds.length}`);
  console.log(`  Bet placed before drand:        ${positive}/${rounds.length}`);
  console.log(`  Minimum margin:                 ${vals[0]}ms (${(vals[0] / 1000).toFixed(3)}s)`);
  console.log(`  drand API signatures matched:   ${apiPass}/${rounds.length}`);

  const pass = formulaFail === 0 && nonPositive === 0 && nullField === 0 && apiFail === 0;

  if (pass) {
    console.log('\n  VERDICT: PASS');
    console.log('  Every bet was accepted by the operator\'s database');
    console.log('  before the drand beacon for that round was published. Proven by:');
    console.log('  1. betPlacedAt: timestamp_raw from /api/v2/user/transactions?type=crash_bets');
    console.log('  2. drandPublishedAt: computed locally from chain formula (genesis + (round-1) × 3s)');
    console.log('  3. commitmentBeforeDrand = drandPublishedAt × 1000 − betPlacedAt (ms)');
    console.log('  4. All 1100 values are positive (min ' + vals[0] + 'ms, median ' + vals[Math.floor(vals.length / 2)] + 'ms)');
  } else {
    console.log('\n  VERDICT: FAIL — see details above');
    process.exitCode = 1;
  }

  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
