/**
 * Spec self-test — docs/ALGORITHM.md §5 vectors, §2 oracle readings, §6 O5 and the §2 Step 5 survival
 * law, run against src/rng.ts.
 *
 * Written by the clean-room implementer together with src/rng.ts, from docs/ALGORITHM.md and the module
 * interface alone (never from Duel's code). Integrated 20 Oct 2026: the checks are unchanged; only the
 * import path, the mocha wrapper and the reporting (failures and notes collected instead of printed) were
 * adapted. The last block draws 200,000 random (seed, drand) pairs with crypto.randomBytes, as the
 * implementer wrote it, so its inputs differ per run; its model check is held at 5 standard errors.
 * The §2 Step 3 note (the spec's seed=ab / drand=00 labels are swapped; the values are not) is reported,
 * not counted, as the implementer wrote it.
 */
import * as assert from 'assert';
import { createHash, createHmac, randomBytes } from "crypto";
import {
  computeCrashPointRaw,
  computeCrashPoint,
  computeCrashPointFromBuffer,
  verifyHash,
  survivalProbability,
  expectedRTP,
  instantCrashProbability,
} from "../../src/rng";


const EXPECTED_CHECKS = 87;

function runSelftest(): { pass: number; total: number; failed: string[]; notes: string[] } {
    let pass = 0;
    let total = 0;
    const failed: string[] = [];
    const notes: string[] = [];
    function check(name: string, ok: boolean, detail = ""): void {
      total++;
      if (ok) pass++;
      else failed.push(`${name}${detail ? "  " + detail : ""}`);
    }

    const TWO32 = 4294967296;
    // Recover u from the module's raw value (raw = 0.999·2^32/(u+1) is strictly decreasing in u).
    const uFromRaw = (raw: number): number => Math.round((0.999 * TWO32) / raw - 1);

    interface Vec {
      id: string;
      seed: string;
      commitment: string;
      drand: string;
      msgFullHex?: string;
      msgLen: number;
      msgSha?: string;
      hmac: string;
      u: number;
      crash: number;
    }

    // §5 V1–V5, copied from the spec.
    const vecs: Vec[] = [
      {
        id: "V1",
        seed: "3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23",
        commitment: "706bb90b571c6165c96a484580efd2f834b4f3237e7cf0f2680b26b7f4e151c0",
        drand:
          "b18fa6dc92304844fc4e868d708953e6b628b3f88d4381249d32264df1bfe5bc20aa0905e57fe54063010881767fd56d",
        msgFullHex:
          "efbfbdefbfbdefbfbddc92304844efbfbd4eefbfbdefbfbd70efbfbd53efbfbd28efbfbdefbfbdefbfbd43efbfbd24efbfbd" +
          "32264defbfbdefbfbd20efbfbd0905efbfbd7fefbfbd40630108efbfbd767fefbfbd6d3a30",
        msgLen: 87,
        hmac: "5ad96e3c81c2c80dc149a21020c367bbf680b781e9c9eb33525101d7f9df3b3c",
        u: 1524198972,
        crash: 2.81,
      },
      {
        id: "V2",
        seed: "950dded0843c08b883a5ab9ecdd15ca8886f8fe671dcdf55c077fbf921e6dd9a",
        commitment: "b2ea8da5238d1d2aa18311b89734105f34fcb8d1d52d07e686de04a76d87ea83",
        drand:
          "918678a693b86bc04d7905ffa214894efa1c4537afe46d11d6968780431899297904f95d5207b1819ff958b26ea37781",
        msgLen: 96,
        msgSha: "4c92b83e4635637df31203fd4484b85c51a4b4e0af4d1dc8ac4ba58e3a72abf0",
        hmac: "aa5843c802d96a3f39849e2833ab3c52667484c9352d022856589d2787676e75",
        u: 2857911240,
        crash: 1.5,
      },
      {
        id: "V3",
        seed: "cac8c2a9421c36c9d1a81c42f3b0b9a6bc9813e5f5e76aa2e0c1ac70e44ef613",
        commitment: "99f4e611c4e6a2148c2db77896e9e67fbf7d001f1c512f02fef30f40c2252e70",
        drand:
          "8ccc8967432651ddfdc218fa292b9e54010cc0a052eca6409ea27f2261667e5ea9fdbbf8985d5d3af579cd00a05fa72a",
        msgLen: 89,
        msgSha: "f6bad0e8c80213d256e98c92dd95382ae6e71637956f805aafee3f1cee2f0741",
        hmac: "fe8398bfc89d044c62a4a3088b6223fdf60be82478dbec4a6cbd0876891efec0",
        u: 4270037183,
        crash: 1.0,
      },
      {
        id: "V4",
        seed: "2df69d3868ea015643180e2d7afb39dfa116bc75afa7a7db05bb278b472d0c54",
        commitment: "f95068062a84776988f41f74db71226d06e4d18c2bfc8fe879292703d51de953",
        drand:
          "ab6bf01d168311b5824e4f9b0a6e6f31ff21583b64df1250de35b03fa3cb9a6f43aa1bece7e800a2328034dc3e8a7af0",
        msgLen: 90,
        msgSha: "d8bf326fbd2f96f6828bccefbb361f8618011e68d0f2b46055fde58ecf0194f3",
        hmac: "07cf652186987d450654d50f1ae861009a2c3f974c6f1e060d73b8901f28cff1",
        u: 131032353,
        crash: 32.74,
      },
      {
        id: "V5",
        seed: "bdacffda35f0fbdb36d0b6a5815c266d2d0efb44df769db717608a0ca391a43d",
        commitment: "e8ab24f7b619bcc00544b319405889ddd8db12f3275b058f99d84a832222804a",
        drand:
          "96cf6c9834d9c5d2acfc4322e1cda2116202bcba990c3d0b99f3712200c04035bef93e8acc9bd03408c56c97717d8cd5",
        msgLen: 92,
        msgSha: "7e012f194a1c9c54090ed7fdeb4deeaf030f0bb9ff18dbc2a1f4b542f519b971",
        hmac: "0004ca8515ba95597275e4ee94c3a44218a0466b5b8c2ae8c765b33c051f6700",
        u: 313989,
        crash: 13664.99,
      },
    ];

    // Spec-chain checks use a message built here with Buffer.toString (a different decoder path
    // from rng.ts's TextDecoder) so the spec's intermediate values are checked independently.
    function specMessage(drandHex: string): Buffer {
      const text = Buffer.from(drandHex, "hex").toString("utf8");
      return Buffer.concat([Buffer.from(text, "utf8"), Buffer.from(":0", "ascii")]);
    }

    for (const v of vecs) {
      check(`${v.id} commitment verifyHash true`, verifyHash(v.seed, v.commitment));
      const msg = specMessage(v.drand);
      check(`${v.id} spec-chain msg length ${v.msgLen}`, msg.length === v.msgLen, `got ${msg.length}`);
      if (v.msgFullHex) check(`${v.id} spec-chain msg bytes`, msg.toString("hex") === v.msgFullHex);
      if (v.msgSha) {
        const s = createHash("sha256").update(msg).digest("hex");
        check(`${v.id} spec-chain msg sha256`, s === v.msgSha);
      }
      const h = createHmac("sha256", Buffer.from(v.seed, "hex")).update(msg).digest();
      check(`${v.id} spec-chain HMAC`, h.toString("hex") === v.hmac);
      check(`${v.id} spec-chain u`, h.readUInt32BE(0) === v.u, `got ${h.readUInt32BE(0)}`);
      const raw = computeCrashPointRaw(v.seed, v.drand);
      check(`${v.id} rng.ts u (from raw)`, uFromRaw(raw) === v.u, `raw ${raw}`);
      const cp = computeCrashPoint(v.seed, v.drand);
      check(`${v.id} computeCrashPoint = ${v.crash}`, cp === v.crash, `got ${cp}`);
      const cb = computeCrashPointFromBuffer(Buffer.from(v.seed, "hex"), v.drand);
      check(`${v.id} computeCrashPointFromBuffer = ${v.crash}`, cb === v.crash, `got ${cb}`);
    }

    // V1, V2 and V5 settlements from §5 (win condition §3.1, tie = win). Payout is not in rng.ts.
    check("V1 win at target 1.5", computeCrashPoint(vecs[0].seed, vecs[0].drand) >= 1.5);
    check("V2 tie 1.50 >= 1.5 is a win", computeCrashPoint(vecs[1].seed, vecs[1].drand) >= 1.5);
    check("V3 loss at target 1.5", !(computeCrashPoint(vecs[2].seed, vecs[2].drand) >= 1.5));
    check("V4 win at target 10", computeCrashPoint(vecs[3].seed, vecs[3].drand) >= 10);
    check("V5 win at target 2", computeCrashPoint(vecs[4].seed, vecs[4].drand) >= 2);

    // §5 V6–V8 and §2 Step 3 oracle readings.
    const s1 = vecs[0].seed;
    {
      const raw = computeCrashPointRaw(s1, "00000f67");
      const unclamped = (0.999 * TWO32) / (4290876352 + 1);
      check("V6 unclamped raw < 1 (raw 0.99)", unclamped < 1 && Math.floor(unclamped * 100) === 99);
      check("V6 raw clamped to 1", raw === 1, `got ${raw}`);
      check("V6 computeCrashPoint = 1.00", computeCrashPoint(s1, "00000f67") === 1);
    }
    {
      const raw = computeCrashPointRaw(s1, "0029dda6");
      check("V7 rng.ts u = 513", uFromRaw(raw) === 513, `raw ${raw}`);
      check("V7 computeCrashPoint = 8347611.53", computeCrashPoint(s1, "0029dda6") === 8347611.53);
    }
    check("V8 first byte b1->b0 = 2.81", computeCrashPoint(s1, "b0" + vecs[0].drand.slice(2)) === 2.81);
    // §2 Step 3 states seed=ab/drand=00 -> 3.21 and seed=00/drand=ab -> 7.15. With the seed as
    // HMAC key (which V1–V8 require) the two values come out the other way round; an independent
    // Python HMAC gives the same. Checked here: the swap changes the result and yields exactly
    // that pair. The label mismatch is printed, not counted, and reported as a spec defect.
    {
      const a = computeCrashPoint("ab", "00");
      const b = computeCrashPoint("00", "ab");
      check("Step 3 swap changes result, values {3.21, 7.15}", a !== b && [a, b].sort().join() === "3.21,7.15", `seed=ab/drand=00 ${a}, seed=00/drand=ab ${b}`);
      if (a !== 3.21) notes.push(`NOTE spec §2 Step 3 labels: spec says seed=ab/drand=00 -> 3.21; seed-as-key gives ${a}`);
    }
    const d1 = vecs[0].drand;
    check("Step 3 seed 01 == 0100", computeCrashPointRaw("01", d1) === computeCrashPointRaw("0100", d1));
    check("Step 3 seed 01 != 0001", computeCrashPointRaw("01", d1) !== computeCrashPointRaw("0001", d1));
    check("Step 3 seed ff == ff00", computeCrashPointRaw("ff", d1) === computeCrashPointRaw("ff00", d1));
    check("Step 3 seed ff != 00ff", computeCrashPointRaw("ff", d1) !== computeCrashPointRaw("00ff", d1));
    {
      const long = "aa".repeat(65);
      const hashed = createHash("sha256").update(Buffer.from(long, "hex")).digest("hex");
      check("Step 3 65-byte key == its SHA-256", computeCrashPointRaw(long, d1) === computeCrashPointRaw(hashed, d1));
    }
    check("Step 1 upper-case drand = lower", computeCrashPoint(s1, d1.toUpperCase()) === 2.81);
    check("Step 1 upper-case seed = lower", computeCrashPoint(s1.toUpperCase(), d1) === 2.81);
    // §6 O5 Verify-page input handling (applied to the drand field here).
    {
      const a = computeCrashPointRaw(s1, "hello");
      check("O5 'hello' == 'zzzz' == '0000'", a === computeCrashPointRaw(s1, "zzzz") && a === computeCrashPointRaw(s1, "0000"));
      check("O5 '0' == ''", computeCrashPointRaw(s1, "0") === computeCrashPointRaw(s1, ""));
    }

    // Commitment negatives (§1.2).
    check("verifyHash false on tampered hash", !verifyHash(s1, "0" + vecs[0].commitment.slice(1)));
    check("verifyHash false on wrong seed", !verifyHash(vecs[1].seed, vecs[0].commitment));
    check("verifyHash false on ASCII-hash form", !verifyHash(s1, createHash("sha256").update(s1, "ascii").digest("hex")));
    check("verifyHash true on upper-case hash", verifyHash(s1, vecs[0].commitment.toUpperCase()));

    // Model helpers (§2 Step 5 survival law).
    const NUM = 999n * 4294967296n;
    const exact = (k: number): number => Number(NUM / (10n * BigInt(k))) / TWO32;
    check("instantCrashProbability ~ 0.0108911", Math.abs(instantCrashProbability() - 0.0108911) < 5e-8, `got ${instantCrashProbability()}`);
    check("survival(1.01) = 1 - instant", survivalProbability(1.01) === 1 - instantCrashProbability());
    check("survival(1) = 1 and survival(0.5) = 1", survivalProbability(1) === 1 && survivalProbability(0.5) === 1);
    check("survival(1.005) = survival(1.01)", survivalProbability(1.005) === survivalProbability(1.01));
    check("survival(1.1) uses k=110 (no float drift)", survivalProbability(1.1) === exact(110));
    for (const [x, k] of [[1.5, 150], [2, 200], [5, 500], [10, 1000], [13664.99, 1366499]] as const) {
      check(`survival(${x}) = floor(999*2^32/(10*${k}))/2^32`, survivalProbability(x) === exact(k));
    }
    check("survival(Infinity) = 0, beyond max = 0", survivalProbability(Infinity) === 0 && survivalProbability(4290672329) === 0);
    check("survival(max 4290672328.70) = 1/2^32", survivalProbability(4290672328.7) === 1 / TWO32);
    {
      let mono = true;
      let prev = 1;
      for (let k = 100; k <= 100000; k += 7) {
        const p = survivalProbability(k / 100);
        if (p > prev) mono = false;
        prev = p;
      }
      check("survival monotone non-increasing", mono);
    }
    {
      let rtpOk = true;
      for (const x of [1.01, 1.1, 1.5, 2, 5, 10, 100, 1000]) {
        const r = expectedRTP(x);
        if (!(r <= 0.999 && r > 0.998) || r !== survivalProbability(x) * x) rtpOk = false;
      }
      check("expectedRTP = survival*x, in (0.998, 0.999] for listed targets", rtpOk, `rtp(2)=${expectedRTP(2)}`);
    }

    // Range and consistency on random inputs, plus an empirical check of the model (5σ).
    {
      const N = 200000;
      const targets = [1.01, 1.5, 2, 10];
      const hits = new Array<number>(targets.length).fill(0);
      let rangeOk = true;
      let gridOk = true;
      let rawOk = true;
      let bufOk = true;
      for (let i = 0; i < N; i++) {
        const seed = randomBytes(32).toString("hex");
        const drand = randomBytes(48).toString("hex");
        const cp = computeCrashPoint(seed, drand);
        const raw = computeCrashPointRaw(seed, drand);
        if (!(cp >= 1 && cp <= 4290672328.7)) rangeOk = false;
        if (Math.round(cp * 100) / 100 !== cp) gridOk = false;
        if (!(raw >= cp && (cp === 1 || raw < cp + 0.01 + 1e-9))) rawOk = false;
        if (i < 2000 && computeCrashPointFromBuffer(Buffer.from(seed, "hex"), drand) !== cp) bufOk = false;
        targets.forEach((t, j) => {
          if (cp >= t) hits[j]++;
        });
      }
      check(`random ${N}: crash in [1.00, 4290672328.70]`, rangeOk);
      check(`random ${N}: crash on the cent grid`, gridOk);
      check(`random ${N}: raw consistent with floored value`, rawOk);
      check("random 2000: FromBuffer == computeCrashPoint", bufOk);
      targets.forEach((t, j) => {
        const p = survivalProbability(t);
        const se = Math.sqrt((p * (1 - p)) / N);
        const z = (hits[j] / N - p) / se;
        check(`empirical P(crash>=${t}) within 5 SE of model`, Math.abs(z) < 5, `emp ${(hits[j] / N).toFixed(5)} model ${p.toFixed(5)} z ${z.toFixed(2)}`);
      });
    }


    return { pass, total, failed, notes };
}

describe('Spec self-test — docs/ALGORITHM.md against src/rng.ts (clean-room, 20 Oct 2026)', function () {
  this.timeout(300_000);
  it(`all ${EXPECTED_CHECKS} spec checks pass`, () => {
    const r = runSelftest();
    for (const n of r.notes) console.log(`      ${n}`);
    assert.deepStrictEqual(r.failed, []);
    assert.strictEqual(r.total, EXPECTED_CHECKS);
    assert.strictEqual(r.pass, EXPECTED_CHECKS);
  });
});
