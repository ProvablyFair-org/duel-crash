/**
 * Duel Crash — Mocha unit tests.
 * Tests the RNG implementation, hash verification, and survival probability.
 */

import { strict as assert } from 'assert';
import { computeCrashPoint, computeCrashPointRaw, verifyHash, survivalProbability, expectedRTP, instantCrashProbability } from '../../src/rng';
import { chiSquaredTest, chiSquaredPValue, lag1Autocorrelation, regularizedGammaP } from '../../src/stats';

describe('Crash RNG', () => {
  // Real production rounds from the dataset — copy-pasted, not from memory
  const VECTORS = [
    {
      serverSeed: '3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23',
      drand:      'b18fa6dc92304844fc4e868d708953e6b628b3f88d4381249d32264df1bfe5bc20aa0905e57fe54063010881767fd56d',
      expected:   2.81,
    },
    {
      serverSeed: 'bcab4a378ed50c5ed7f11bf282989cf4e3a61a99e845d6beadf64e4259ca85b2',
      drand:      '94eb0ae0069459bae7e748c109c6955a6d2d0c87b0a239c269970dbf3ec359292f4f74abf1c63915eb01e453aa0e5ee5',
      expected:   4.63,
    },
    {
      serverSeed: '1aa2cdf89e4a343ff87506dfbb9b499d6c0d611b42c4a492d03142c5b19b15ad',
      drand:      '84bc2ddf291e7996c6c9d6d791e24d9e3aa69ea279e220d755d0a0222b900eac6c81f9473ab755d751ed07a473be98c7',
      expected:   2.64,
    },
    {
      serverSeed: 'fd73f661b53e2d73bd6a698be1e525fb196588fb4bd07e820cb4eacf0a741f8b',
      drand:      'b5b128a9365cfd446781717c4ca6bb2bbeeb734ca235ad4f2f42af5402081739677634c795e29554dadb934d649282f2',
      expected:   3.85,
    },
    {
      serverSeed: '502ff481ab3d23acbc4ee3b066e9db3e34995ebaea3f7b1a7dbeb17b7595ba56',
      drand:      '84b7b0d89e1e5cfbdb4379dc023818061cccd55cf4ac868bcd07c6af9bc06d15ebc0a3c87f5564e05747c5f932cb1824',
      expected:   1.02,
    },
  ];

  it('should compute crash points for 5 known test vectors', () => {
    for (const v of VECTORS) {
      const result = computeCrashPoint(v.serverSeed, v.drand);
      assert.strictEqual(result, v.expected, `serverSeed ${v.serverSeed.slice(0, 8)}... expected ${v.expected}, got ${result}`);
    }
  });

  it('should produce raw crash >= 1.0', () => {
    for (const v of VECTORS) {
      const raw = computeCrashPointRaw(v.serverSeed, v.drand);
      assert.ok(raw >= 1.0, `raw crash ${raw} < 1.0`);
    }
  });

  it('computeCrashPoint should floor to 2 decimal places', () => {
    for (const v of VECTORS) {
      const cp = computeCrashPoint(v.serverSeed, v.drand);
      const rounded = Math.floor(cp * 100) / 100;
      assert.strictEqual(cp, rounded, `crash point ${cp} not properly floored`);
    }
  });
});

describe('Hash Verification', () => {
  it('should verify SHA-256(hex_bytes(serverSeed)) === serverSeedHash', () => {
    // From dataset round 829099
    const serverSeed = '3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23';
    const serverSeedHash = '706bb90b571c6165c96a484580efd2f834b4f3237e7cf0f2680b26b7f4e151c0';
    assert.strictEqual(verifyHash(serverSeed, serverSeedHash), true);
  });

  it('should reject wrong hash', () => {
    const serverSeed = '3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23';
    assert.strictEqual(verifyHash(serverSeed, 'deadbeef'.repeat(8)), false);
  });
});

describe('Survival Probability & RTP', () => {
  it('P(crash >= 1.0) should be 1.0', () => {
    assert.strictEqual(survivalProbability(1.0), 1.0);
  });

  it('P(crash >= 2.0) should be ~0.4995', () => {
    const p = survivalProbability(2.0);
    assert.ok(Math.abs(p - 0.4995) < 0.001, `expected ~0.4995, got ${p}`);
  });

  it('P(crash >= 100.0) should be ~0.00999', () => {
    const p = survivalProbability(100.0);
    assert.ok(Math.abs(p - 0.00999) < 0.0001, `expected ~0.00999, got ${p}`);
  });

  it('RTP for cashout target 2x should be ~0.999', () => {
    const rtp = expectedRTP(2.0);
    assert.ok(Math.abs(rtp - 0.999) < 0.001, `expected ~0.999, got ${rtp}`);
  });

  it('RTP for any target should be <= 0.999', () => {
    for (const target of [1.01, 1.5, 2, 5, 10, 50, 100, 1000]) {
      const rtp = expectedRTP(target);
      // Exact: survival × 2^32 is an integer count; count·cents·1000 ≤ 2^32·999·100 is RTP ≤ 0.999.
      const count = BigInt(survivalProbability(target) * 2 ** 32);
      const cents = BigInt(Math.round(target * 100));
      assert.ok(count * cents * 1000n <= BigInt(2 ** 32) * 99900n, `RTP ${rtp} exceeds 0.999 for target ${target}`);
    }
  });

  it('instant crash probability is exactly 46,776,872 / 2^32 (1.0891%)', () => {
    // P(crash = 1.00) = 1 − floor(2^32 × 0.999 / 1.01) / 2^32: the values v ≥ 4,248,190,424 floor to 1.00.
    // Exact: the previous tolerance (|p − 0.0099| < 0.001) also accepted the 0.99% of a zero-edge game.
    const p = instantCrashProbability();
    assert.strictEqual(p * 2 ** 32, 46_776_872, `expected 46,776,872 / 2^32, got ${p * 2 ** 32} / 2^32`);
    assert.strictEqual((p * 100).toFixed(4), '1.0891');
  });
});

describe('Statistics', () => {
  it('chi-squared p-value for known values', () => {
    // chi2=3.84, df=1 → p ≈ 0.05
    const p = chiSquaredPValue(3.84, 1);
    assert.ok(Math.abs(p - 0.05) < 0.005, `expected ~0.05, got ${p}`);
  });

  it('regularized gamma P(1, 1) ≈ 0.6321', () => {
    const p = regularizedGammaP(1, 1);
    assert.ok(Math.abs(p - 0.6321) < 0.001, `expected ~0.6321, got ${p}`);
  });

  it('chi-squared test with pooling', () => {
    const obs = [100, 95, 105, 100, 100];
    const exp = [100, 100, 100, 100, 100];
    const result = chiSquaredTest(obs, exp);
    assert.ok(result.pValue > 0.05, `expected passing test, got p=${result.pValue}`);
    assert.strictEqual(result.df, 4);
  });

  it('lag-1 autocorrelation on independent data near zero', () => {
    // Use a simple LCG to generate pseudo-random data (deterministic but uncorrelated)
    let x = 12345;
    const data = Array.from({ length: 1000 }, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; });
    const { r } = lag1Autocorrelation(data);
    assert.ok(Math.abs(r) < 0.1, `expected near-zero autocorrelation, got ${r}`);
  });
});

// ── The operator's own Verify-tab code (profile CRASH-09) ─────────────────────
describe('Operator source — Duel\'s own Crash Verify-tab code, executed with only its inputs filled in (pasted 2026-09-26)', function () {
  this.timeout(300_000);
  // duel.com → Provably Fair → Verify (Crash) code panel, pasted by Paulo 2026-09-26, saved verbatim (src/operator-verifier.ts)
  const { runOperatorVerifier, checkOperatorCites, operatorCents, OPERATOR_VERIFIER_PINS, OPERATOR_VERIFIER_FILE, OPERATOR_EXPECTED_LOGS } =
    require('../../src/operator-verifier') as typeof import('../../src/operator-verifier');
  const data = require('../../data/crash-master-1100rounds.json') as { rounds: Array<{ roundId: number; result: { serverSeed: string; drandRandomness: string; crashPoint: number } }> };
  const VECTORS_FOR_OPERATOR = [
    { serverSeed: '3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23', drand: 'b18fa6dc92304844fc4e868d708953e6b628b3f88d4381249d32264df1bfe5bc20aa0905e57fe54063010881767fd56d', expected: 2.81 },
    { serverSeed: '502ff481ab3d23acbc4ee3b066e9db3e34995ebaea3f7b1a7dbeb17b7595ba56', drand: '84b7b0d89e1e5cfbdb4379dc023818061cccd55cf4ac868bcd07c6af9bc06d15ebc0a3c87f5564e05747c5f932cb1824', expected: 1.02 },
  ];
  const known = VECTORS_FOR_OPERATOR.map((v, i) => ({ id: `known${i}`, inputs: { drandSeed: v.drand, serverSeed: v.serverSeed } }));
  const captured = data.rounds.map((r, i) => ({ id: `r${i}`, inputs: { drandSeed: r.result.drandRandomness, serverSeed: r.result.serverSeed } }));
  const run = runOperatorVerifier([...known, ...captured]);

  it('the vendored operator file and its runner hash to their pins, the code ran, and as shipped it printed only its empty-input message', () => {
    assert.deepStrictEqual(run.files.map(f => f.match), [true, true]);
    assert.strictEqual(run.files[0].file, OPERATOR_VERIFIER_FILE);
    assert.strictEqual(run.files[0].actual, OPERATOR_VERIFIER_PINS[OPERATOR_VERIFIER_FILE]);
    assert.strictEqual(run.error, null);
    assert.deepStrictEqual(run.shippedLogs, [...OPERATOR_EXPECTED_LOGS]);
  });

  it('every operator line src/rng.ts cites carries the quoted text verbatim', () => {
    const c = checkOperatorCites();
    assert.deepStrictEqual(c.bad, []);
    assert.ok(c.checked > 0);
  });

  it('fixed vectors: the operator code returns the unfloored src/rng.ts value and floors to the known crash point', () => {
    VECTORS_FOR_OPERATOR.forEach((v, i) => {
      const o = run.results!.get(`known${i}`)!;
      assert.strictEqual(o.value, computeCrashPointRaw(v.serverSeed, v.drand));
      assert.strictEqual(operatorCents(o.value), Math.round(v.expected * 100));
      assert.deepStrictEqual(o.logs, [`Crash result: ${String(o.value)}`]);
    });
  });

  it('every captured round: the operator value equals src/rng.ts computeCrashPointRaw and floors to the served crash point (1,100/1,100)', () => {
    let agree = 0;
    data.rounds.forEach((r, i) => {
      const o = run.results!.get(`r${i}`)!;
      if (o.value === computeCrashPointRaw(r.result.serverSeed, r.result.drandRandomness)
        && operatorCents(o.value) === Math.round(r.result.crashPoint * 100)) agree++;
    });
    assert.strictEqual(data.rounds.length, 1100);
    assert.strictEqual(agree, 1100);
  });
});
