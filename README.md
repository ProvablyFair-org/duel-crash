# Duel Crash — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** PF-2026-DL05 · **Release:** `v1.2.1` · **Capture:** 14–15 April 2026

**Result: PROVABLY FAIR — Full Pass.** Every crash point in the 1,100-round dataset was reproduced by exact equality from the revealed server seed and the drand quicknet beacon. The verifier reports 18 of 18 scored steps passing, no flags and no hard failures. All 1,100 drand signatures equal the public beacon's records for their rounds.

**Scope:** The crash-point distribution's theoretical RTP is **at most 99.9% at every cash-out target** (`P(crash ≥ t) × t ≤ 0.999`; flat 0.1% distribution edge, factor 0.999), an upper bound rather than the RTP of every target. It is 99.9000% (4 dp) at every target from 1.01× to 2,156.11×. Duel cashes out every bet at 9,999.999× at most (Duel's statement as relayed by Mike in Slack on 21 October 2026: auto cash-out at 9999.999x), so no bet pays more than 9,999.999×; at that cap the return is 99.8999% (99.899936%), and every target is within 0.1 percentage points of 99.9% (lowest 99.899768% at 9,999.05×) ([RTP claim table](outputs/rtp-claim-table.json), [Distribution RTP](MANIFEST.md#distribution-rtp)). The cap is the operator's statement; no captured bet reached it (1 of the 1,100 rounds crashed above it, at 13,664.99× in round 831375, on a 2× bet). The wallet ledger of 3 of the 671 captured wins, on the $0.01 and $10 stakes, shows the full `amount × cashout` credited; each of the six bets looked up, on the same two stakes, carries a Zero Edge rakeback record of `0.001 × amount` whose route to the balance is not established, and which, if paid, adds 0.1 percentage point to the target's RTP at those stakes. That each round's commitment and drand round were fixed before its beacon published is assumed: the capture shows only that each bet preceded its beacon, on the operator's clock. Theoretical RTP is not a promise about an individual session's return.

## What was verified

| Check | Captured evidence |
|---|---|
| Crash points | 1,100 of 1,100 recomputed from `(serverSeed, drandRandomness)` by exact equality; every recorded value on the 2-dp grid at or above 1.00 (the capture floored the served multiplier to 2 dp, so this half shows the recording, not what the server sends). The RNG code (`src/rng.ts`) was rebuilt from a written specification ([docs/ALGORITHM.md](docs/ALGORITHM.md)) by an implementer who never opened Duel's code; Duel's published Verify-tab code is run as a second check, not used as the source |
| Recorded payouts | 671/671 wins record `amount × cashout × (1 − 0.1%)` exactly; 429/429 losses record 0; 1,100/1,100 `isWin` flags follow `crash ≥ target`, ties witnessed |
| Wallet credit | 3 of 671 wins looked up in the wallet ledger, 3/3 credited the full `amount × cashout`; 3 of 429 losses, no payout leg |
| Commitments | 1,100 distinct server seeds, each hashing to its own commitment; one seed per round |
| drand beacon | 1,100/1,100 signatures equal the pinned api.drand.sh records; publication times follow the quicknet chain formula |
| Timing | Every bet accepted before its beacon was published on the operator's transactions-API clock (min 0.404 s, median 12.251 s, max 13.779 s) |
| Distribution RTP | At or below 99.9% at 11 counted targets; `P(crash ≥ x)` within one uint32 value of `0.999 / x` at all 9,999,900 points of the 0.01 grid from 1.01× to 100,000×; every target from 10,000.00× up scored at Duel's stated 9,999.999× cap (99.899936%) |
| Stake invariance | 100/100 Phase C ($10) rounds recompute identically; 49 elevated-stake and 24 base-stake wins at 2× settle at one per-unit return |
| Simulation | 5,000,000 Pass 1 rounds replayed (Fisher's p = 0.5382); Pass 2 with 1,100 casino seeds × 10,000 beacon values at the played targets (return z 0.286, rank-sum z 0.160) |
| Player verification | Duel's own Verify-tab code (the second check) and both ProvablyFair.org verifiers, the docs-site verifier and the live verify-bets bundle, reproduce all 1,100 displayed crash points |

The captured `amountWon` field is not the credited amount, the Zero Edge rakeback's route is not established, and when each seed hash and drand round was first shown is not recorded. These boundaries and the single test account are set out in the [overview's limitations](MANIFEST.md#limitations-and-trust).

## Run the audit

Open a terminal in the package directory. Use **Node 22.x**, as declared in [.nvmrc](.nvmrc) and [package.json](package.json).

```sh
npm ci
npm test
```

Expected: **19 unit tests pass; Passed 18/18; PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.** This recomputes every captured round offline, replays both simulation passes from their seeds (Steps 13–14; verify measured at 60 s on Node 22.23.1), checks the pinned artifacts and compares the fresh verification result with the committed one. It does not rewrite the simulation files. The exit code is the verdict: `0` PROVABLY FAIR — Full Pass · `2` PROVABLY FAIR — Conditional Pass · `5` RTP FIGURE OVERSTATED (the RTP-CLAIM rule 1.2.0 found a published RTP figure above the game's real RTP; the draws pass) · `1` NOT PROVABLY FAIR, or a reproduction difference.

**RTP claim (RTP-CLAIM 1.2.0, switched on).** Every cash-out target is held to the flat 99.9% shown on Duel's fairness page (houseEdge = 0.001 in the code panel of the Provably Fair → Verify tab, E16): each target up to 9,999.99× at its own value, and every target from 10,000.00× up scored at Duel's stated 9,999.999× cap (the table's rows run to 100,000×; every higher target scores the same). Scored on Step 16: PASS, 0 of 9,999,900 targets beyond the 0.1 pp band, lowest 99.899768% ([table](outputs/rtp-claim-table.json)).

```sh
npm run test:full                 # optional: regenerate the simulation into outputs/run/, then verify
npm run timing                    # optional, network: re-fetch every drand signature
node scripts/release-manifest.mjs --check
```

Ordinary runs write to `outputs/run/` and leave the evidence of record intact. See [reproduction details](MANIFEST.md#reproduce-the-audit) for the comparison rules, exit codes, mutation battery, verifier re-checks and the deliberate artifact-refresh procedure.

## Verify a bet

Before you bet, save the round's server seed hash (the commitment) with the time you saved it. After the round crashes, open its Provably Fair panel and copy the server seed, the drand round ID and the drand randomness. Hash the decoded seed bytes and compare the result with the hash you saved: a PASS means the two are equal, which shows the revealed seed is the committed one. It does not show when the commitment was made, since a seed and hash made after the round also match each other; that the commitment came before your bet rests on your saved record. Then check the beacon against the quicknet chain and compute the crash point from the leading uint32 of `HMAC-SHA256` over the decoded beacon read as UTF-8 plus `":0"`. The [complete verification instructions](MANIFEST.md#verify-a-bet) give the formula, a reference implementation and the cash-out rule.

## Files and evidence

There are two documentation files: this README and [MANIFEST.md — consolidated audit overview](MANIFEST.md). The written specification `src/rng.ts` is rebuilt from is [docs/ALGORITHM.md](docs/ALGORITHM.md). The overview contains the game rules, algorithm, RTP calculation, money model, verification results, evidence, limitations and release history.

- [Captured rounds](data/crash-master-1100rounds.json) — SHA-256 `ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a`.
- [Wallet ledger, wins](evidence/wallet-legs-2026-09-29.json) and [losses](evidence/wallet-legs-losses-2026-09-29.json), looked up 29 September 2026, account identifier redacted.
- [Duel's Verify-tab code](evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js) — SHA-256 `c699cd5445fb3906614a51fda58d275c9ce1caa5c6402e412dfd20264f05271d`.
- [Verification results](outputs/verification-results.json), [RTP claim table](outputs/rtp-claim-table.json), [simulation results](outputs/simulation-results.json), [drand API check](outputs/drand-api-verification.json) and [release manifest](RELEASE-MANIFEST.json).
- [Audit report](https://audit.provablyfair.org/casino/duel/games/crash/overview) · [Public repository](https://github.com/ProvablyFair-org/duel-crash) · [MIT license](LICENSE).

The consolidation of the documentation is recorded in the [release history](MANIFEST.md#release-history).
