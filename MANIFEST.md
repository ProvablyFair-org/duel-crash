# Duel Crash — Consolidated Audit Overview

**Audit ID:** PF-2026-DL05 · **Auditor:** ProvablyFair.org · **Release:** `v1.2.3` · **Framework:** 1.1

Audit date: April 2026. Dataset of record: **1,100 rounds** captured from `2026-04-14T20:17:12.676Z` to `2026-04-15T14:21:25.365Z`. Original publication: 4 June 2026 (public commit `f97d5b8`). The public `v1.0.0` tag, set on 17 September 2026, points at commit `7350abd` of 14 September 2026: that publication plus one commit ([Release history](#release-history)). Audit report: https://audit.provablyfair.org/casino/duel/games/crash/overview. This overview consolidates the package documentation as of 4 October 2026. The machine-readable release identity is in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json), which is v1.2.3's; each earlier release's signed release identity is in the `RELEASE-MANIFEST.json` at that release's tag.

## Conclusion and scope

**PROVABLY FAIR — Full Pass:** 18 scored verification steps, 18 PASS, 0 flags, 0 hard fails. Every crash point in the 1,100-round dataset was reproduced from `(serverSeed, drandSignature)` by this package's RNG code, `src/rng.ts`, which was rebuilt from a written specification ([`docs/ALGORITHM.md`](docs/ALGORITHM.md)) by an implementer who never opened Duel's code; Duel's published Verify-tab code, run unmodified, is a second check, not the source, and agrees on every displayed crash point ([Player-verifier parity](#player-verifier-parity)). The derivation uses HMAC-SHA256 with the drand quicknet chain as external entropy, by exact equality. Every round opens its own commitment, every beacon value equals the public chain's, and every `isWin` flag follows the cash-out rule.

**The published RTP figures (99.9% distribution, 0.1% distribution edge) describe the distribution of crash points:** for any cash-out target `t`, `P(crash ≥ t) × t ≤ 99.9%`, with a flat 0.1% edge factor (0.999) and no per-target scaling. 99.9% is an upper bound, not the RTP of every target: the floor in the 2^32 count puts a target `t` below it by less than `t/2^32`. The RTP is 99.9000% (4 dp) at every target from 1.01× to 2,156.11×. Duel cashes out every bet at 9,999.999× at most (Duel's statement to ProvablyFair.org on 21 October 2026: auto cash-out at 9999.999x), so no bet pays more than 9,999.999×; at that cap the return is 99.8999% (99.899936%), and every target is within 0.1 percentage points of 99.9% (lowest 99.899768% at 9,999.05×) ([Distribution RTP](#distribution-rtp)). The cap is the operator's statement; no captured bet reached it (1 of the 1,100 rounds crashed above it, at 13,664.99× in round 831375, on a 2× bet). The wallet ledger looked up for 3 of the 671 captured wins, on the $0.01 and $10 stakes, credits the full `amount × cashout`; at that credit, a bet's expected credit is the distribution RTP of its target. Each of the six bets looked up, on the same two stakes, also carries a Zero Edge rakeback record of `0.001 × amount`; if it reaches the player, it adds 0.1 percentage point per unit staked to that target's RTP on those stakes ([Money model](#money-model)). This audit witnesses the record on six bets at those two stakes, not its payout, and does not exercise Duel's daily Zero Edge cap (DL-1).

Bet-before-beacon ordering is measured as the operator's own transactions-API bet timestamp against the beacon's chain-formula publication time: 1,100/1,100 positive. The capture recorded no receipt time for the seed hash or for the event naming the drand round, so the premises that each commitment and each drand round were fixed before the beacon published are ASSUMED (DL-2). The capture used one test account. These are recorded below as limits on what the evidence shows, not as findings against the operator.

## Contents

- [Dataset and capture](#dataset-and-capture)
- [Game and algorithm](#game-and-algorithm)
- [Payouts and RTP](#payouts-and-rtp)
- [Verification results](#verification-results)
- [Reproduce the audit](#reproduce-the-audit)
- [Verify a bet](#verify-a-bet)
- [Evidence](#evidence)
- [Limitations and trust](#limitations-and-trust)
- [Terms](#terms)
- [Release history](#release-history)

## Dataset and capture

Live round data was captured via browser session during active play on Duel.com Crash using a test account funded by ProvablyFair.org. Socket.IO messages were intercepted to record each round's commitment, crash point, revealed server seed and drand beacon metadata (E06, [capture/crash-capture.reference.js](capture/crash-capture.reference.js), a non-runnable reference record). On save, each round was matched by `round_id` to the operator's `GET /api/v2/user/transactions?type=crash_bets` record, whose `timestamp_raw` became `timing.betPlacedAt` and whose amounts supplied `amountWon` (`timing.source = transactions-api` on 1,100/1,100).

**Which script wrote the file.** The reference record holds the round-capture code only. The save step above (the transactions-API match, the `timing` block and the file download) is the `save()` of the runnable console script, `capture/crash-capture.js`. The runnable capture tools are not published, because they place bets on duel.com; the one capture file that ships is the reference record `capture/crash-capture.reference.js`. The rest of this paragraph compares the dataset with that workshop script, so it cannot be checked from this package alone: apart from the script's header comment, its body differs from the reference record only in the wrapper line and its `go`/`pause`/`save`/`status`/`clear` controls. Every one of the 1,100 round records carries the fields that `save()` writes. The file's header does not match that script: its `save()` writes `meta.schema: "duel-crash-capture"` with a `meta.enrichment` block, while the dataset of record carries `meta.schema: "duel-crash-capture-v3"` and no `enrichment` block. Neither capture file writes the `-v3` header, so the step that produced the dataset's header is not recorded in this package. The dataset is pinned by its SHA-256 (Step 10), no step reads `meta.schema`, and every round is scored on its own fields.

| Phase | Rounds | Stake | Auto-cash-out | Purpose |
|---|---:|---:|---|---|
| A | 800 | $0.01 | 1.5× | Baseline statistical coverage |
| B | 200 | $0.01 | Varied (1.1×, 2×, 5×, 10×) | Multi-target payout validation |
| C | 100 | $10.00 | 2× | High-stake bet-size invariance |

Total wagered: Phase A $8.00, Phase B $2.00, Phase C $1,000.00; $1,010.00 in all. Round IDs 829099 to 831399; drand rounds 27,798,178 to 27,819,827. 1,100 unique server seeds: one per round, no epochs, no nonces. Wins 671, losses 429. The population of record is declared as code in `src/loader.ts` (1,100 rounds; A 800 / B 200 / C 100; 1,100 distinct seeds; 1,099 drand transitions; 5 cash-out targets with a 45-round floor), and every counting step is held to it. The captured rounds are not all consecutive game rounds: 1,095 consecutive steps and 4 gaps of 19, 70, 146 and 970 rounds (DL-8).

| Input | Identity |
|---|---|
| [data/crash-master-1100rounds.json](data/crash-master-1100rounds.json) | SHA-256 `ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a` |

The verification suite checks this hash before loading (Step 10). The six wallet-ledger records used for settlement are separate evidence files, described under [Money model](#money-model).

## Game and algorithm

A multiplier starts at 1.00× and rises until it crashes (E08). A bet wins if it cashes out at or below the crash point, `auto_cashout ≤ crashPoint`; otherwise the whole stake is lost. Crash is multiplayer: every player in a round sees the same crash point, so there is no per-player client seed and no nonce counter, and the crash point is independent of who plays or how much is staked. Observed bet parameters: `amount` $0.01 and $10.00, `auto_cashout` 1.1×, 1.5×, 2×, 5× and 10×.

**Round lifecycle.** In *collecting bets* players bet; in *in progress* the multiplier rises and auto-cash-outs fire at their targets; in *crashed* the multiplier stops, and after the crash the server reveals the seed. The table lists the events the capture read or sent (E06, `capture/crash-capture.reference.js:70-103` and `:142-198`). It recorded no receipt time for any of them: each round's `at` field is the time the capture saved the round, after the crash. So the capture does not show when the commitment or the drand round was first sent (DL-2).

| Event (Socket.IO) | Direction | Fields the capture read or sent |
|---|---|---|
| `collecting-bets` | server → client | `round` (round ID) |
| `crash_hashed_pf` | server → client | `id`, `server_seed_hashed` (commitment) |
| `place bet` | player → server | `amount`, `multiplier` (auto-cash-out), `currency`, `round`, `security_token`, `coin` |
| `crash_bet_placed` | server → client | `round_id`, `id`, `transaction_id`, `effective_edge`, `server_seed_hashed`, `amount_won`, `is_win` |
| `bet` | server → client | bets of several players; for a bet whose `round_id` is the current round: `id`, `transaction_id`, `effective_edge`, `server_seed_hashed` (fallbacks) |
| `crashed` | server → client | `multiplier` (crash point) |
| `pending_drand` | server → client | `seed_index` (drand round ID), `drand_randomness`, `server_seed` (after the crash), `server_seed_hashed` (fallback) |
| `POST /api/v2/user/security/token` | REST | refresh security token |

| Property | Crash | Other Duel games (Dice, Plinko, Keno) |
|---|---|---|
| Server seed | Unique per round | Shared by the player's bets until the player rotates the seed pair (the Dice, Plinko and Keno captures rotated on their own 50-bet schedule, `BETS_PER_EPOCH` in each capture script) |
| Client seed | None (multiplayer) | Player-controlled |
| Nonce | Always 0 | Counts the bets on the current seed pair, from 0 |
| Seed reveal | At the crash | When the player rotates the seed pair |
| External entropy | drand quicknet | None |
| Output mapping | `2^32/(value+1) × 0.999` | Rejection sampling (RANGE=10001 for Dice) |

| drand quicknet parameter | Value |
|---|---|
| Chain hash | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| Genesis | 1692803367 (2023-08-23T15:09:27Z) |
| Period | 3 seconds |
| Signature | BLS threshold signature, 48 bytes (96 hex characters) |
| Public endpoint | `https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |

A beacon's publication time is `1692803367 + (drandRoundId − 1) × 3` (Step 11). The capture took the drand round from `pending_drand` (`seed_index`) with no receipt time, so it does not show the round was fixed before its beacon published (DL-2, R-1); beacon round IDs are strictly increasing (Step 3), though not every consecutive drand round is used because a game round is longer than 3 seconds.

### Crash-point algorithm

```text
1. drandBytes   = hex_decode(drandSignature)               // 48-byte BLS signature (docs/ALGORITHM.md §2 Step 1)
2. text         = UTF-8 decode of drandBytes, lossy          // each invalid byte run becomes U+FFFD (§2 Step 2)
3. message      = UTF-8 encode(text) followed by ":0"        // nonce always 0
4. digest       = HMAC-SHA256(key=hex_decode(serverSeed), message)   // §2 Step 3
5. value        = digest[0..3] as unsigned 32-bit big-endian         // §2 Step 4
6. rawResult    = 0.999 × 2^32 / (value + 1)                 // exact rational; house edge 0.1% (§2 Step 5)
7. crashPoint   = max(1.00, floor(rawResult × 100) / 100)    // cents = floor(999 × 2^32 / (10 × (value + 1)))
```

The key is the hex-decoded 32-byte seed; `Buffer.from(serverSeed, 'utf-8')` would give a 64-byte key and different output, and only the hex-decoded key matches all 1,100 rounds. Duel labels the beacon field `drandRandomness`, but it is the raw BLS signature (the quicknet API's `signature` field). Many of its bytes are not valid UTF-8 and Node.js replaces them with U+FFFD; the conversion is deterministic, so server and verifier build the same message. The floor truncates to 2 decimals, never rounding up (`raw = 2.009` gives 2.00). `max(1.00, …)` stops the crash point going below 1.00×. At `value = 0` the crash point is the 2-dp floor of 4,290,672,328.70 (the map maximum, probability 1/2³²); at `value = 4294967295`, `rawResult = 0.999` and the round crashes at 1.00×. There is no cap on the crash point (Duel states a cap on the payout, an auto-cash-out at 9,999.999×: [Distribution RTP](#distribution-rtp)).

**What the capture recorded.** The capture did not store the multiplier the server sent: it stored `floor(multiplier × 100) / 100` of the `crashed` event's `multiplier` (`capture/crash-capture.reference.js:172`). Every recorded crash point is therefore on the 2-dp grid by construction, so Step 5's grid check (a whole number of hundredths at or above 1.00) checks the recording and cannot fail on a dataset this capture wrote; it does not show whether Duel's server sends 2-dp values. Step 5's exact equality is likewise with the recorded value: a served multiplier anywhere in the same hundredth as the recomputed crash point records the same value. The win rule is unaffected, because every cash-out target is on the 2-dp grid and, for such a target `t`, `multiplier ≥ t` holds exactly when `floor(multiplier × 100) / 100 ≥ t`.

**Worked example, round 829099** (the first captured round). Server seed `3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23`, drand randomness `b18fa6dc92304844fc4e868d708953e6b628b3f88d4381249d32264df1bfe5bc20aa0905e57fe54063010881767fd56d`. HMAC = `5ad96e3c81c2c80dc149a21020c367bbf680b781e9c9eb33525101d7f9df3b3c`; `value` = bytes `5a d9 6e 3c` big-endian = 1524198972; `rawResult = 0.999 × 4294967296 / 1524198973 = 2.8150342604…`; crash point `floor(281.50…) / 100 = 2.81`, equal to the recorded 2.81. The round used drand beacon #27798178, published at 1692803367 + (27798178 − 1) × 3 = 1776197898 (2026-04-14T20:18:18.000Z).

### Instant crash and survival

The crash point floors to 1.00× when `rawResult < 1.01`, i.e. `value ≥ 4,248,190,424`: 46,776,872 of the 4,294,967,296 uint32 values, so `P(crash = 1.00) = 1.0891%`, slightly above the 0.99% a zero-edge game would give. The capture has 8 instant crashes in 1,100 rounds (0.73%) against about 12.0 expected; with a standard deviation of about 3.4, that is within 1.2 standard deviations.

For a target `x ≥ 1.01`, `P(crash ≥ x) = floor(2^32 × 0.999 / x) / 2^32`, roughly `0.999 / x`: about half of rounds crash below 2×, about 10% reach 10× and about 1% reach 100×. Captured crash points range from 1.00 (minimum) through 1.96 (median) to 13,664.99 (maximum).

### Player-verifier parity

**Origin of the RNG code.** `src/rng.ts` is rebuilt from a written specification, [`docs/ALGORITHM.md`](docs/ALGORITHM.md), by an implementer who never opened Duel's code. The specification was written from Duel's public pages, the standard provably-fair construction, the 1,100 live rounds and black-box readings of Duel's Verify page, without opening Duel's code; its §4 gives the source of every step and its §8 lists every file read. Duel's published Verify-tab code is run as a second check, not used as the source. Through v1.1.0 `src/rng.ts` was a port of that code and cited 10 of its lines; the port and the citation table were removed on 20 October 2026 ([Release history](#release-history)).

Duel's own Crash Verify-tab code (E16) was pasted by the auditor from the duel.com Verify tab on 26 September 2026 and saved verbatim. Step 5 and the unit tests execute it, with only its two input values filled in. It returns the unfloored multiplier `max(1, (2^32/(value+1))·(1−0.001))`; floored to 2 dp, its displayed crash point equals the served crash point and `src/rng.ts` exactly on 1,100/1,100 rounds. The unfloored value is reported as information only, not scored: it is bit-identical to `src/rng.ts` on 824 of 1,100 rounds, and on the other 276 the two differ by at most 2.21·10⁻¹⁶ relative, because of rounding order. Duel's expression rounds twice, `(2^32/(u+1))·(1−0.001)`; `src/rng.ts` rounds once, `0.999·2^32/(u+1)`. Of the 276, `src/rng.ts` is nearer the exact value `999·2^32/(1000·(u+1))` on 270 and Duel's on 6. Duel's code computes the crash point only and does not speak to settlement. It does not establish that the Verify button, or Duel's server, runs exactly this code.

Step 5 also executes the ProvablyFair.org docs-site Crash verifier (E13, `verifier-parity/games/crash/derive.js` + `lib/hmac-sha256.js`, origin/main @ `bd4d59c`, pinned in `src/site-verifier.ts`) and the live www.provablyfair.org/verify-bets bundle (E14, `verifier-parity/live-site/`, pinned in `src/live-site-verifier.ts`) on all 1,100 rounds: both give the served crash point on every round, and the live page prints the served commitment.

## Payouts and RTP

### Distribution RTP

For a player who always cashes out at `x`:

```text
P(crash ≥ x) = floor(2^32 × 0.999 / x) / 2^32
RTP(x)       = P(crash ≥ x) × x  ≤  0.999
```

The bound follows from the algorithm and the uniform distribution of the leading uint32, independent of any casino-supplied data; Crash has no probability table. Step 12 does not re-type this closed form. It takes the per-value mapping, confirms it reproduces all 1,100 live crash points, and at each of 11 targets counts the uint32 values whose crash point reaches the target. Every count equals `floor(2^32 × 0.999 / x)` exactly, and every counted RTP is at or below 0.999 in integer arithmetic: 99.900000% to six decimals at eight targets, 99.899999% at 50× and 100×, and 99.899992% at 1000×, the shortfall being the floor in the count. Negative controls show both comparisons can fail.

| Target | P(crash ≥ x) | RTP |
|---|---:|---:|
| 1.01× | 98.9109% | 99.9000% |
| 1.1× | 90.8182% | 99.9000% |
| 1.5× | 66.6000% | 99.9000% |
| 2× | 49.9500% | 99.9000% |
| 3× | 33.3000% | 99.9000% |
| 5× | 19.9800% | 99.9000% |
| 10× | 9.9900% | 99.9000% |
| 20× | 4.9950% | 99.9000% |
| 50× | 1.9980% | 99.9000% |
| 100× | 0.9990% | 99.9000% |
| 1000× | 0.0999% | 99.9000% |

Step 8 computes the RTP from the uint32 threshold formula at 2×, 10× and 100× in integer arithmetic (P(1.00) = 1.0891%, RTP@2× = 99.9000%, RTP@10× = 99.9000%). Step 16 extends the count to every one of the 9,999,900 points of the 0.01 grid from 1.01× to 100,000×: `P(crash ≥ x)` is within one uint32 value (2^-32) of `0.999 / x` at every one, none above and none below by a whole value. Below the cap that is the return of the target, so no target up to 9,999.99×, exercised or not, carries an unverified return; every target from 10,000.00× up is scored at Duel's stated cap (below).

**Targets below the cap.** 99.9% is an upper bound. The floor in the count puts every target `x` below it by `0 ≤ 0.999 − RTP(x) < x/2^32`, a margin that grows with the target. Computed exactly with the package's count (outside the 18 steps): the RTP rounds to 99.9000% at every target from 1.01× to 2,156.11×, 2,156.12× is 99.8999%, and the lowest of any target is 99.899768%, at 9,999.05×.

**Cash-out cap.** Duel cashes out every bet at 9,999.999× at most, whatever target is set (Duel's statement to ProvablyFair.org on 21 October 2026: auto cash-out at 9999.999x). No captured bet reached the cap: the captured targets top out at 10×. The cap limits the payout, not the crash point: Duel's Verify-tab code (E16) and [docs/ALGORITHM.md](docs/ALGORITHM.md) compute the crash point without one. Cash-out targets are on the 0.01 grid (the package's count rejects any other target, `toCents` in `tests/steps/crash-model.ts`; the captured targets are 1.1×, 1.5×, 2×, 5× and 10×), so 9,999.999× falls between the targets 9,999.99× and 10,000.00×: every target up to 9,999.99× is unaffected, and every target from 10,000.00× up is scored at Duel's stated cap. It also falls between two values of the crash-point grid: a displayed crash point reaches 9,999.999 exactly when it reaches 10,000.00, and the unfloored multiplier `0.999 × 2^32 / (v + 1)` reaches 9,999.999 for the same values `v ≤ 429,066` (10,000.0054× at `v = 429,066`, 9,999.9821× at `v = 429,067`), so a bet at the cap wins with probability 429,067 / 2^32, about 1 round in 10,010. Computed exactly with the package's own count (`countAtOrAbove`, `tests/steps/crash-model.ts`), every target at or above the cap returns 429,067 × 9,999.999 / 2^32 = 99.899936%, 0.000064 percentage point below 99.9%. With the cap applied, the lowest RTP of any target is 99.899768% (9,999.05×) and the highest 99.900000% (1.03×), all inside the 0.1 percentage point band, so the RTP-CLAIM rule, which holds every target a player can choose to the claim, passes.

**RTP claim table.** [outputs/rtp-claim-table.json](outputs/rtp-claim-table.json) scores every cash-out target against a flat 99.9% claim within a ±0.10 pp band: each target from 1.01× to 9,999.99× scored at its own value, and each from 10,000.00× up scored at Duel's stated 9,999.999× cap. Its rows run to 100,000×; every higher target scores the same as the 10,000.00× row. The figure is shown on the fairness page, one of the RTP-CLAIM rule's six places (game page, fairness page, help page, bet panel, rules, game settings): houseEdge = 0.001 in the code panel of the Verify tab on Duel's Provably Fair page (E16); effectiveEdge 0.1 is served on all 1,100 rounds. The rule (RTP-CLAIM 1.2.0, Methodology v1.1) is switched on (decision D3, 14 October 2026): the outcome is scored on Step 16, the step carrying CRASH-19, and a house-side miss would make the verdict RTP FIGURE OVERSTATED (exit 5), never NOT PROVABLY FAIR, because the draws themselves pass. Outcome: pass, true minimum 99.899768% at a 9,999.05× cash-out, true maximum 99.900000%; every row from 10,000.00× is 99.899936%; 0 targets beyond the band. [src/rtp-settings.ts](src/rtp-settings.ts) generates it and pins its SHA-256.

### Money model

**Settlement, measured from the wallet ledger (29 September 2026).** Six captured bets, one win and one loss per phase, were looked up read-only through the logged-in `/api/v2/user/transactions/{id}` endpoint of the audit account. The responses are pinned verbatim in [evidence/wallet-legs-2026-09-29.json](evidence/wallet-legs-2026-09-29.json) (wins) and [evidence/wallet-legs-losses-2026-09-29.json](evidence/wallet-legs-losses-2026-09-29.json) (losses), except the audit account's identifier: every `user_id` value (12 in the wins file, 9 in the losses file) is replaced by the string `"REDACTED-userId-1"` and no other byte changed (1 October 2026). Balances, amounts, ledger ids and timestamps are as served, so every figure in items 1 to 4 recomputes from the two files, except the `Rakeback Claim` entries in item 4 (their dates and the claim of +17.629019971819527114, ledger id `556447220`), which were read from the account ledger and are not pinned here.

1. **Winning bets are credited the full `amount × cashout`.** 3/3 wins: the payout leg (`related_transactions`) moves the balance by exactly 0.015 (`528930800`, $0.01 at 1.5×), 0.1 (`529835096`, $0.01 at 10×) and 20 (`530608943`, $10 at 2×). Each leg is dated at the April cash-out and starts at the balance the stake leg ended on.
2. **Losing bets have no payout leg.** 3/3 losses (`528938325`, `529808596`, `530608491`).
3. **Each of the six carries a Zero Edge rakeback record of exactly `0.001 × amount`** (`zero_edge_rakeback_transaction.amount_currency`: 0.00001 on the four $0.01 bets, 0.01 on the two $10 bets). The account's other rakeback field, `rakeback_transaction`, is empty on all six.
4. **The rakeback is not added to the balance at the bet.** On the one consecutive pair looked up (loss `530608491`, then win `530608943`, both $10), the loss's 0.01 rakeback record is created at 13:31:58, between the win's stake leg (13:31:57) and its payout leg (13:32:19), and the balance does not move by it. The account's ledger carries `Rakeback Claim` entries (`user_rakeback_balances`): none from 2026-04-14 03:46 (before the capture) until 2026-04-24 14:20, when a claim of +17.629019971819527114 in the capture's currency posts (ledger id `556447220`). A claim record does not say which bets or which kind of rakeback it pays, so that these claims pay the Zero Edge records is **not established** here (DL-1).

**What the dataset's `amountWon` field is.** On every won round it reads `amount × cashout × (1 − 0.1%)` exactly (671/671; 0/671 equal `amount × cashout`; 429/429 losses record 0), and the served `effectiveEdge` is 0.1 on all 1,100. Looked up again on 2026-09-29, the same field reads the full `amount × cashout` on the three wins (0.015, 0.1, 20) and `effective_edge` reads 0, while the payout leg dated April already carries the full amount. So `amountWon` as captured is not the credited amount; Step 7 scores it as the recorded field and says so. Bet `528930800` shows both: a $0.01 bet at 1.5× whose wallet payout leg is `+0.015` and whose rakeback record is `0.00001`, while its captured `amountWon` reads `0.014985` (`$0.01 × 1.5 × 0.999`). An earlier (2026-09-23) version of this section read the captured field as a second 0.1% cut on the payout and put the payout-level return at 99.8001%; the wallet ledger contradicts that reading on all three wins looked up. The house edge is in the crash point (the `0.999` factor), not a second time in the credit.

**Net return.** With the payout at the full `amount × cashout`, a bet's expected credit is the distribution RTP of its cash-out target. The Zero Edge record was looked up on the $0.01 and $10 stakes only. At those stakes, if the `0.001 × amount` record reaches the player, it adds 0.1 percentage point per unit staked to that target's RTP: the net return is then between 99.999768% and 100.000000% at every target (99.999936% at and above the cap). This audit witnesses the record on six bets at those two stakes, not its payout (item 4), and does not exercise Duel's daily Zero Edge cap.

### Recorded settlement

| Phase | Rounds | Stake | Cash-out | Wins | Losses | Wagered | Recorded return | Observed RTP |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| A | 800 | $0.01 | 1.5× | 543 | 257 | $8.00 | $8.136855 | 101.71% |
| B | 200 | $0.01 | 1.1×/2×/5×/10× | 79 | 121 | $2.00 | $1.712286 | 85.61% |
| C | 100 | $10.00 | 2× | 49 | 51 | $1,000.00 | $979.02 | 97.90% |

Returns are the captured `amountWon` values. Observed RTP by target: 1.1× (n=51) 94.81%, 1.5× (n=800) 101.71%, 2× (n=149) 97.90%, 5× (n=50) 69.93%, 10× (n=50) 79.92%; overall win rate 671/1,100 (61.00%). Phase A's figure reflects the high win rate at 1.5× (theoretical win probability 66.6%). At n=1,100 the variance of Crash outcomes far exceeds the precision needed to detect a 0.1% edge, so these are variance illustrations; the analytical count and the simulation are the RTP evidence.

### Simulation

**Why multi-stream.** Crash produces a continuous distribution, so a chi-squared test needs arbitrary bins: `[1.00, 1.01)`, `[1.01, 1.10)`, `[1.10, 1.50)`, `[1.50, 2.00)`, `[2.00, 3.00)`, `[3.00, 5.00)`, `[5.00, 10.00)`, `[10.00, 20.00)`, `[20.00, 50.00)`, `[50.00, 100.00)`, `[100.00, ∞)`, aligned with the 2-dp grid and with exact expected fractions from the survival formula. Unlike Plinko's or Keno's many configurations, Crash has one distribution, so one 5M-round stream is exposed to Monte Carlo variance: in initial testing a single stream gave `χ²(10) = 23.23, p = 0.0099`, driven by bin `[20.00, 50.00)` (10.19 of 23.23; a deficit of 1,236 counts out of about 150,000 expected, a 3.2-sigma fluctuation). A different stream gave p = 0.098, but choosing streams until the test passes would be seed shopping. Pass 1 therefore runs **10 independent streams of 500,000 rounds** (seed domains `pass1-server-stream-0` … `-9`, derived by HMAC-SHA256) and combines every stream's p-value by Fisher's method, `T = −2 Σ ln(p_i) ~ χ²(2K)`.

| Stream | χ²(10) | p |
|---:|---:|---:|
| 0 | 15.01 | 0.1318 |
| 1 | 14.86 | 0.1373 |
| 2 | 6.20 | 0.7986 |
| 3 | 8.58 | 0.5724 |
| 4 | 10.68 | 0.3833 |
| 5 | 12.07 | 0.2801 |
| 6 | 10.29 | 0.4150 |
| 7 | 11.37 | 0.3291 |
| 8 | 4.29 | 0.9335 |
| 9 | 6.75 | 0.7491 |

Fisher's combined: T = 18.75, df = 20, **p = 0.5382**; 0/10 streams below α = 0.01. On the combined 5M sequence: lag-1 r = −0.000013, z = −0.029 (|z| < 3); runs test p = 0.0436 (≥ 0.01). Simulated RTP @1.5× 99.8863%, @2× 99.8643%, @5× 99.8948%, @10× 99.9334%, @50× 99.7810%, each within 5σ of the formula. [outputs/rtp-convergence.html](outputs/rtp-convergence.html) shows convergence at the five targets from 1K to 5M rounds; the legend reads "Theoretical distribution RTP (99.9%, pre-rakeback)".

**Pass 2** asks two questions of the operator's 1,100 revealed seeds, each paired with 10,000 deterministic drand values at the cash-out target its captured round was played at (11,000,000 replayed rounds). First, does the seed population pay the exact law's return? Return of the played targets 10,989,992.10 against an exact mean of 10,988,999.998 (RTP 99.9090% vs 99.9000%): z 0.286. Second, was each captured beacon an ordinary draw for its seed? Under no cherry-pick the captured round is exchangeable with the seed's reference draws, so its rank is uniform; the rank-sum over 1,100 seeds is z 0.160 (exact permutation null). Captured rounds won 671 against 668.53 expected; 1,100/1,100 captured rounds reproduce from their real beacon. Pre-registered rule: FAIL if either z < −3.291 (one-sided α 0.0005 each, family 0.001). Detection power (≥ 50%): an operator turning ≥ 7.5% of winning captured rounds into losses, or a ≥ 0.10% relative RTP shortfall. This statistic replaced, on 26 September 2026, a count of seeds failing a chi-squared distribution test (14 at 1,000 values per seed, 15 against a threshold of 21 at 10,000; DL-3).

## Verification results

The audit evaluates the **1,100 rounds captured on 14–15 April 2026**. Its 18 scored steps report **18 PASS, 0 flags and 0 hard failures**. Each step carries its ProvablyFair.org Crash profile labels (`src/profile-map.ts`, profile 1.0.3, approved as cited by Methodology v1.1 decision D6) in `outputs/verification-results.json`.

| Step | Check | Result and scope |
|---:|---|---|
| 1 | Seed hash integrity | PASS: all 1,100 commitments required by `src/loader.ts` opened: `SHA-256(hex_decode(serverSeed)) = serverSeedHash`; 0 left unopened |
| 2 | drand bet timing | PASS: every bet accepted strictly before its beacon was published, each margin anchored to a server-side `transactions-api` timestamp and the chain formula, and the capture's stored margin checked against the recomputation; min 0.404 s, mean 12.196 s, max 13.779 s |
| 3 | drand round monotonicity | PASS: all 1,099 consecutive transitions strictly increasing, so no beacon was re-used or taken out of order. It does not show the drand round was fixed before its beacon published (DL-2); Step 14's rank statistic is the evidence against beacon selection |
| 4 | Server seed uniqueness | PASS: 1,100 distinct seeds and 1,100 distinct commitment hashes |
| 5 | Outcome recomputation | PASS: 1,100/1,100 by exact equality with the recorded crash point, held to the declared population; every recorded crash point a whole number of hundredths at or above 1.00 (the capture floored the served multiplier to 2 dp, so the grid half cannot fail on this dataset: [Crash-point algorithm](#crash-point-algorithm), "What the capture recorded"); none above the map maximum; docs-site verifier, live verify-bets bundle and Duel's Verify-tab code (the second check, compared on the displayed crash point) each agree on all 1,100 |
| 6 | Bet-size invariance | PASS: 100/100 Phase C ($10) rounds recompute identically; all 49 elevated-stake and 24 base-stake wins at 2× settle at one per-unit return, exact on the 6-dp grid |
| 7 | Payout math | PASS: 671/671 recorded `amountWon` = `amount × cashout × (1 − 0.1%)` as integer grid units, with the declared edge constant (the served `effectiveEdge`, 0.1 on 1,100/1,100, is compared, not used); 0/671 equal `amount × cashout`; 429/429 losses record 0; 1,100/1,100 `isWin` = crash ≥ target; 4 ties settled as wins, 4 rounds one hundredth below settled as losses. This is the recorded field, not the credit ([Money model](#money-model), DL-1) |
| 8 | House edge audit | PASS: RTP at 2×, 10× and 100× at or below 0.999 in integer arithmetic |
| 9 | Phase coverage | PASS: A 800, B 200, C 100, as declared in `src/loader.ts` |
| 10 | Dataset hash | PASS: SHA-256 pre-flight check |
| 11 | drand chain formula | PASS: all 1,100 publication times equal genesis + (round − 1) × 3 s |
| 12 | Anti-circularity | PASS: a per-value model separate from the closed form in `src/rng.ts` reproduces 1,100/1,100 crash points; counts at 11 targets equal `src/rng.ts`'s survival × 2³²; P(1.00) equal; negative controls (a crash point moved by 0.01; a map wired to 0.998, which disagrees at 11/11 targets) both rejected |
| 13 | Simulation Pass 1 | PASS: 5M rounds replayed from their HMAC seeds and every committed scalar reproduced; Fisher p = 0.5382, lag-1 z = −0.029, runs p = 0.0436; RTP within 5σ at all 5 targets |
| 14 | Simulation Pass 2 | PASS: 1,100 seeds × 10,000 values replayed at the played targets; return z 0.286, rank-sum z 0.160 against −3.291 |
| 15 | drand API signature verification | PASS: each of 1,100 rounds has exactly one record in `drand-api-verification.json` for its beacon round, whose api.drand.sh signature equals the dataset's (recomputed, not re-fetched); the file's own counters agree |
| 16 | Configuration coverage | PASS: all 5 targets above the 45-round floor (1.1×: 51, 1.5×: 800, 2×: 149, 5×: 50, 10×: 50); no undeclared target; `P(crash ≥ x)` within one uint32 value of `0.999 / x` at all 9,999,900 grid points to 100,000×, and every target from 10,000.00× up scored at Duel's stated 9,999.999× cap. Since 14 October 2026 (C3) only an RTP above the 0.999 ceiling fails this step; a shortfall is counted and printed and left to RTP-CLAIM, which holds every grid point (a row of the RTP table) to the claim on this step |
| 17 | Artifact integrity | PASS: 3 artifacts match their SHA-256 pins in `src/artifact-pins.ts` (a missing or altered artifact is a hard fail); all 2,317 numeric leaves of the two JSON artifacts lie in their declared domains (`src/domains.ts`) |
| 18 | Live-sample fit (informational) | PASS: recomputed uint32 values fit uniform on 20 bins (χ² p = 0.828); lag-1 z = −0.75, runs p = 0.469; a deviation would turn the step to INFO (informational: reported, not counted as a flag, verdict unchanged), never a FLAG or a hard fail |

**Timing.** `commitmentBeforeDrand = drandPublishedAt × 1000 − betPlacedAt` was positive on 1,100/1,100 rounds: minimum 0.404 s, median 12.251 s, mean 12.196 s, maximum 13.779 s. The tightest case is about 400 ms. `betPlacedAt` is the operator's transactions-API `timestamp_raw`, matched by `round_id` (not `betId`, which can drift in broadcasts carrying several players' bets); `drandPublishedAt` is recomputed from public chain constants, so a third party can recompute both without trusting a local clock. The margin times the bet, not the moment the seed hash was shown, and the bet time is the operator's own clock: see the premises table and DL-2.

**Informational context (not scored).** Instant crashes 8/1,100 (0.73%) against about 12.0 expected (1.09%), a 95% binomial interval of about [5, 19]. Overall win rate 671/1,100 (61.00%). No floating-point edge case was encountered in the floor operation over the observed range.

S5: fairness-integrity matrix; game-integrity testing not commissioned.

**Framework attack coverage.** The standardized S5 rows, each tied to the scored step or the capture that decides it; the package's own ten categories follow unchanged.

<!-- S5-MATRIX:START -->

| Test ID | Category | What Was Tested | Expected Behaviour | Result | Finding Summary |
|---------|----------|-----------------|--------------------|--------|-----------------|
| S5-1 | Seed substitution | Can a revealed server seed be swapped for a more favourable one while still matching its commitment? | A substituted seed fails `SHA-256(hex_decode(serverSeed)) == serverSeedHash`, and any seed change alters the recomputed crash point. | Pass | All 1,100 per-round commitments opened against the population in `src/loader.ts` (0 mismatches, 0 unopened), 1,100 distinct seeds and 1,100 distinct commitments; every crash point recomputes from the committed seed. Crash has no seed chain to substitute into: each round opens its own commitment. [Step 1, Step 4, Step 5] |
| S5-2 | Client-seed manipulation | Does a player client seed enter the derivation? | — | Not applicable — disclosed | Crash is multiplayer: the crash point is shared by every player in the round and the message is `<drand randomness>:0` with no client seed (all 1,100 rounds recompute from that message). The player-independent entropy that stops the operator choosing the outcome is the drand beacon, not a client seed — see S5-4. [Step 5; profile CRASH-06 n/a] |
| S5-3 | Stake-conditional outcome | Does the game produce different crash points or a different settlement at higher stakes? | Stake must affect only the payout amount, never the crash point, and must settle at the same per-unit return. | Pass | 100/100 Phase C rounds ($10, 1,000× the base stake) recompute identically; Phase C is played at 2×, the same target 49 base-stake rounds play, and all 49 elevated-stake and 24 base-stake wins settle at one identical per-unit return, exact on the 6-dp grid. The crash point is computed from `(serverSeed, drand)` alone. [Step 6] |
| S5-4 | Server-seed cherry-picking | Can the operator pre-select a server seed that produces unfavourable crash points? | The outcome must also depend on entropy the operator cannot know when it commits; a gross skew across the operator's own seeds must not exceed chance. | Pass, structural + limited-power statistical | Primary defence is structural: each crash point also depends on a drand quicknet beacon published after the bet was accepted — 1,100/1,100 margins positive on a server-side timestamp (min 0.404 s), beacon publication times from the chain formula, every signature bound to a pinned api.drand.sh record, beacon rounds strictly increasing. This rules out beacon selection only if each drand round was fixed before its beacon published, and seed selection only if each commitment was, neither of which the capture records (DL-2; a seed opening its commitment is a consistency check, not a timing check); the rank rule below is the check on beacon selection. Secondary: Pass 2 pairs all 1,100 revealed seeds with 10,000 drand values each at the cash-out target each round was played at; the return of the played targets (z 0.286 against its exact mean and variance) and the captured round's rank among its seed's reference draws (rank-sum z 0.160, exact permutation null) are held to a pre-registered −3.291 (family α 0.001), and the rank rule detects an operator turning ≥ 7.5% of winning captured rounds into losses with ≥ 50% probability. [Steps 2, 3, 11, 14, 15] |
| S5-5 | Seed-rotation race (TOCTOU) | Can a rotation concurrent with an in-flight bet change the seed a bet settles against? | — | Not applicable — disclosed | Crash has no seed rotation: each round carries its own server seed and commitment. A race on the round lifecycle itself (a bet accepted after the beacon published) is what Step 2 measures, and it found none. This single-account sequential capture exercises no concurrent interleaving. [Step 2] |
| S5-6 | Multiplier tampering | Can a win be credited against a multiplier other than the one the rule dictates? | The payout multiplier is the cash-out target; the credit must follow one rule on every win, and no operator edge field may feed the derivation. | Pass (on the recorded field) | 671/671 recorded `amountWon` values equal `amount × cashout × (1 − 0.1 %)` exactly on the 6-dp grid with the declared edge constant; the served `effectiveEdge` field (0.1 on 1,100/1,100) is compared, never used. That rule describes the captured field, not the credit: the wallet ledger looked up for 3 wins credits the full `amount × cashout` on 3/3 (MANIFEST Money Model, DL-1). [Step 7] |
| S5-7 | Nonce manipulation | Can the operator replay or reorder the sequence input? | The sequence key must be strictly ordered with no repeat. | Pass | The nonce is the constant 0 (every round recomputes with message `...:0`); the sequence key is the drand beacon round, strictly increasing across all 1,099 transitions of the declared population, so no beacon was re-used or taken out of order; beacon selection is covered by Step 14 (S5-4). [Step 3, Step 5] |
| S5-8 | Range-mapping bias | Does mapping the digest into the crash point skew the distribution? | The survival probability at every cash-out point must equal the claimed `0.999 / x` to within one uint32 value. | Pass (bias within 2^-32 at every enumerated point) | The crash map is monotone in one uint32; at every 0.01 cash-out point from 1.01× to 100,000× (9,999,900 points) the uint32 values reaching it are counted from a per-value model separate from the closed form and the RTP sits at 0.999 to within one uint32 value's worth, 0 above and 0 below. Beyond 100,000× not enumerated (bound stated in `src/loader.ts`); every target from 10,000.00× up is scored at Duel's stated 9,999.999× cap. [Step 12, Step 16] |

<!-- S5-MATRIX:END -->

| ID | Category | Result | Basis |
|---|---|---|---|
| S1 | Outcome prediction | Pass | The crash point needs the committed seed and a beacon published later; predicting it would require breaking SHA-256 preimage resistance or predicting the BLS threshold signature |
| S2 | Post-bet manipulation | Pass | Each revealed seed opens its round's commitment (a consistency check: it shows the seed is the committed one, not when the commitment was shown) and the beacon comes from a distributed threshold network; bet-to-beacon margins on the operator's clock min 0.404 s, median 12.251 s, max 13.779 s. That each commitment existed before its beacon published is ASSUMED (DL-2) |
| S3 | Seed lifecycle | Pass | No rotation epochs or `nextServerSeedHash` chain; 1,100 unique seeds |
| S4 | Nonce reuse | Pass | Nonce always 0; replay would need a reused seed, i.e. a SHA-256 collision |
| S5 | RNG bias | Pass | Fisher's combined p = 0.5382 over 10 streams × 500K, 0/10 below α = 0.01 |
| S6 | Cross-bet correlation | Pass | lag-1 z = −0.029, runs p = 0.0436 over 5M rounds |
| S7 | Timing attacks | Pass | Knowing when a beacon publishes does not reveal its content; 1,100/1,100 margins positive |
| S8 | Session manipulation | Pass | The formula takes only `serverSeed` and `drandSignature`; all 1,100 rounds recompute from those alone |
| S9 | Bet-size dependence | Pass | 100/100 Phase C ($10, 1000× the Phase A stake) rounds recompute identically |
| S10 | Account-dependent outcome | Not tested | Single account; whether different accounts see different crash points in the same round needs several funded accounts observing one round (R-MULTI) |

These checks are offline analysis and replay of the captured rounds, not attempted manipulation of the live API.

## Reproduce the audit

Use **Node.js 22.x**, pinned by `.nvmrc` and the `engines` field of `package.json` (the committed artifacts were produced on that line), and npm ≥ 9. Run from the package directory:

```sh
npm ci
npm test
```

This runs **19 Mocha tests** (RNG vectors, hash verification, survival probability, statistics; 1 runs the specification's own 87 checks against `src/rng.ts`; 3 execute Duel's own Verify-tab code as the second check), then the 18-step verifier offline, with Steps 13–14 replaying both simulation passes (verify measured at 60 s on Node 22.23.1). Expected: `Passed: 18/18`, `VERDICT: PROVABLY FAIR — Full Pass`, `Reproduction vs the committed artifact on Node 22.x.y: REPRODUCED`, exit 0.

| Command | Purpose |
|---|---|
| `npx mocha` | Unit tests only |
| `npm run verify` | The 18 scored steps, informational items and the reproduction gate |
| `npm run simulate` | Regenerate Pass 1 and Pass 2 into `outputs/run/` |
| `npm run test:full` | Unit tests → simulation → verification |
| `npm run timing` | Network: re-check the chain formula and margins, and re-fetch all 1,100 signatures from api.drand.sh into `outputs/run/` |
| `npm run mutate` | Run the mutation battery in a disposable copy |
| `node scripts/check-site-verifier.mjs <site derive.js>` | Compare a docs-site checkout with the pinned verifier |
| `node scripts/check-live-site-verifier.mjs --live` | Compare the live verify-bets deploy (GET only) with the pins |

**The gate.** `npm run verify`, `npm run simulate` and `npm run timing` write nothing into `outputs/`. Results, `diff.json` and re-simulated artifacts go to `outputs/run/` (gitignored, a run record rather than evidence), so a re-run cannot replace the evidence it scores. `outputs/run/diff.json` compares the run against the committed `outputs/verification-results.json` field by field and records the runtime. Tolerance is **1e-14 absolute + 1e-12 relative**, and two distinct integers never agree. The SHA-256 dataset guard is never rewritten to make a run agree.

| Exit | Meaning |
|---:|---|
| 0 | `PROVABLY FAIR — Full Pass`, and this run reproduces the committed artifact |
| 1 | At least one hard fail, or a reproduction difference beyond tolerance |
| 2 | At least one FLAG — `PROVABLY FAIR — Conditional Pass` |
| 5 | `RTP FIGURE OVERSTATED`: no draw check failed, but the RTP-CLAIM rule (1.2.0, switched on) found settings beyond the 0.1 pp band on the house side of the published figure. It outranks a Conditional Pass; a hard fail (exit 1) outranks it |

**Artifacts of record.** Pinned by SHA-256 in `src/artifact-pins.ts` and checked by Step 17:

| File | SHA-256 |
|------|---------|
| `outputs/drand-api-verification.json` | `6de7a635b429b9412de25999e1501a3ad8209a23cbdd0830ea89656df3c48d1c` (fetched from api.drand.sh 2026-04-20T12:14:09.491Z; that fetch time was the file's `generatedAt` key, removed 2026-09-26 as run metadata — no other byte changed) |
| `outputs/rtp-convergence.html` | `ea242a6bf421341beb0096f37edfaa962e5b377cb3090a3600d9cb10380e261b` (re-pinned 2026-09-29: legend label restored to the public wording "Theoretical distribution RTP (99.9%, pre-rakeback)"; previous pin 1d37ffe6… re-pinned 2026-09-28: Chart.js 4.4.7 inlined verbatim, no CDN script; before that e9d0a9ee…; simulation-results.json byte-identical both times) |
| `outputs/simulation-results.json` | `d78d38a7e2e98da89dd0781bfd03dba459049d0ebcf94e1614c9b48afff9d555` (re-pinned 2026-09-26, twice: Pass 2 regenerated at 10,000 drand values per seed, then rewritten to the played-target return + rank statistic (previous pin c2bcfbc3…); Pass 1 bytes unchanged both times) |

`outputs/verification-results.json` is not pinned: it is the artifact the reproduction gate scores every run against, and the one file `PF_EMIT=1 npm run verify` legitimately rewrites. `outputs/rtp-claim-table.json` is pinned in `src/rtp-settings.ts`.

**Deliberate refresh only.** `PF_EMIT=1 npm run simulate`, `PF_EMIT=1 npm run timing` and `PF_EMIT=1 npm run verify` overwrite committed outputs; a regenerated artifact of record must be re-pinned in `src/artifact-pins.ts` in the same commit. To refresh the RTP claim table after a reviewed change:

```sh
npm run rtp-claim:write
# update RTP_CLAIM_TABLE_SHA256 in src/rtp-settings.ts with the printed digest
npm run verify
npm run release-manifest
node scripts/release-manifest.mjs --check
```

The release generator requires both README.md and MANIFEST.md and checks that each carries the audit ID.

**Mutation battery.** `npm run mutate` runs the step-named registry in `tests/mutations.json` (E15) in a disposable copy; every scored step has a mutation that kills it. Re-run on 26 September 2026 after Duel's Verify-tab code was wired into Step 5: 40/40 killed, 18/18 scored steps covered. The five added entries M05g–M05k forge the operator file and re-pin it, edit it without re-pin, edit the runner without re-pin, forge the runner and re-pin it, and move a citation. Re-run on 4 October 2026, each entry through its own `--only` selector with the baseline green in every copy: 40/40 killed, 18/18 scored steps covered. Re-run on 14 October 2026 as one serial `npm run mutate` on the tree carrying RTP-CLAIM 1.2.0 switched on (baseline verify and mocha exit 0): 40/40 killed, 18/18 scored steps covered. Second pass, 14–15 October 2026 (FIXPASS2 class C3, the exit-5 entries): see the release-history entry "14 October 2026 (second pass)". On 20 October 2026 M05k, which moved a `src/rng.ts` citation, was retired with the citation table and M08 was re-anchored on the rebuilt module's edge constant; the registry holds 43 entries. One `npm run mutate` on that tree, 20 October 2026 (baseline green): 42/43 killed, 18/18 scored steps covered; M01b was cut off by the runner's 15-minute timeout while the machine was under heavy load (exit null, its marker not reached) and killed when re-run alone with `--only M01b` (1/1). The release manifest records both runs.

**Fresh-clone reproduction (26 September 2026).**

- **Committed release** — `git clone --depth 1` of `ProvablyFair-org/pf-duel-workspace` (HEAD `840c53d`; its `games/crash` tree is identical to `79aa65b`) into a scratch directory, Node v22.23.1: `npm ci` exit 0; `npm test` exit 0 (15 mocha tests passing, `Passed: 17/17`, `PROVABLY FAIR — Full Pass`, `REPRODUCED`), and the run's `outputs/run/verification-results.json` is byte-identical to the committed copy; `npm run test:full` exit 0, `REPRODUCED` with 0 differences in `verification-results.json` and in the regenerated `simulation-results.json`.
- **That day's working tree (round 2, uncommitted at the time)** — every tracked and new file copied to a scratch directory without `node_modules` or `outputs/run/`, Node v22.23.1: `npm ci` exit 0; `npm test` exit 0 (`Passed: 18/18`, Full Pass, `REPRODUCED`); `npm run test:full` exit 0, `REPRODUCED`, and the regenerated `simulation-results.json` and `rtp-convergence.html` are byte-identical to the pinned copies.
- Not run then: a clone of the commit that carries round 2.

Verify the dataset identity independently:

```sh
shasum -a 256 data/crash-master-1100rounds.json
```

Expected: `ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a`.

## Verify a bet

In order, using the field names of the round's Provably Fair panel (E11) and of this package's dataset (`result.*`):

1. **Save the commitment before you bet, then copy the revealed values.** Before you bet, save the **Server Seed Hashed** (`serverSeedHash`, the commitment) for the round you are about to play, with the time you saved it: a screenshot or a copied note. This package did not record whether or when Duel shows it before the round starts (DL-2). After the round crashes, open its Provably Fair panel (the shield icon on the Crash screen). It shows **Round ID** (`roundId`), **Server Seed Hashed**, **Server Seed** (`serverSeed`, revealed after the crash), **Drand Round ID** (`drandRoundId`) and **Drand Randomness** (`drandRandomness`). Copy all five, and note the time you placed your bet.
2. **Check the commitment.** `SHA-256(hex_decode(serverSeed))` must equal the `serverSeedHash` you saved before betting (and the panel's value). Hash the 32 decoded bytes, not the 64-character text. A PASS means hash equality: the revealed seed is the one behind that commitment. It is a consistency check, not a timing check: a seed and hash made after the round also match each other. Assurance that the commitment existed before your bet comes from your saved record, not from the match; compared only with the hash the panel shows after the crash, a PASS shows consistency alone.
3. **Check the beacon.** `drandRandomness` must be the drand quicknet signature for round `drandRoundId` (chain `52db9ba7…e971`, public at api.drand.sh), published at `1692803367 + (drandRoundId − 1) × 3` seconds, after you placed your bet.
4. **Recompute the crash point.** HMAC-SHA256 keyed by the hex-decoded seed over the drand bytes decoded as UTF-8 plus `":0"`, the first 4 bytes as a big-endian uint32 `v`, then `max(1.00, floor(100 × 0.999 × 2^32 / (v + 1)) / 100)`, computed exactly ([docs/ALGORITHM.md](docs/ALGORITHM.md) §2). The result is floored to 2 decimals, never below 1.00, and has no cap.
5. **Apply the cash-out rule.** Your bet wins if and only if the crash point is **at or above** your cash-out target; a crash point exactly equal to the target is a win (4 such ties in the captured data all settled as wins). For a win, your wallet is credited `stake × target` (the full amount on the 3 captured wins looked up in the wallet ledger, at the $0.01 and $10 stakes); the `amountWon` recorded in this capture reads `stake × target × 0.999` and is not the credited amount ([Money model](#money-model)). Duel states that it cashes out every bet at 9,999.999× at most ([Distribution RTP](#distribution-rtp)): on that statement, a target of 10,000× or more wins when the crash point reaches 9,999.999× (10,000.00× on the displayed grid) and is credited `stake × 9,999.999`. No captured bet reached the cap.

A reference implementation of step 4, written from [docs/ALGORITHM.md](docs/ALGORITHM.md) §2, using Node.js `crypto` only:

```javascript
const crypto = require('crypto');

function verifyCrashPoint(serverSeed, drandSignature) {
  const seedBytes  = Buffer.from(serverSeed, 'hex');                     // Step 1: 32 bytes
  const drandBytes = Buffer.from(drandSignature, 'hex');                 // Step 1: 48 bytes
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(drandBytes);   // Step 2: lossy, U+FFFD
  const message = Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from(':0')]);

  const digest = crypto.createHmac('sha256', seedBytes).update(message).digest();  // Step 3
  const v = digest.readUInt32BE(0);                                      // Step 4: big-endian uint32

  const cents = (999n * 2n ** 32n) / (10n * BigInt(v + 1));              // Step 5: floor(100 × 0.999 × 2^32 / (v + 1)), exact
  return Math.max(1.00, Number(cents) / 100);
}
```

A matching round verifies that crash point against the supplied inputs; it does not by itself establish when the commitment was first shown (DL-2), or how the Zero Edge record reaches the balance (DL-1).

## Evidence

The primary evidence is the 1,100-round capture of 14–15 April 2026 with its revealed seeds, beacon values and transactions-API records, plus the wallet ledger of six of those bets. Screenshots illustrate interface states; they do not replace the recorded responses or establish current live behaviour. The exhibit numbers below are the package's register; the screenshot file names carry an older numbering.

| ID | File | Evidence and role |
|---|---|---|
| E01 | [outputs/verification-results.json](outputs/verification-results.json) | All 18 scored step results with 8 informational items and the verdict; compared field by field with each fresh run |
| E02 | [outputs/simulation-results.json](outputs/simulation-results.json) | Pass 1: 5M rounds (10 streams × 500K), Fisher's combined p = 0.5382, simulated RTP @2× 99.8643% (5 targets tracked); Pass 2: 1,100 seeds × 10,000 drand values at the played targets, return z 0.286, rank-sum z 0.160; pinned |
| E03 | [outputs/rtp-convergence.html](outputs/rtp-convergence.html) | Self-contained chart of RTP convergence at 1.5×, 2×, 5×, 10× and 50× from 1K to 5M rounds; Chart.js inlined; pinned |
| E04 | [data/crash-master-1100rounds.json](data/crash-master-1100rounds.json) | Primary dataset: 1,100 rounds, phases A–C, SHA-256 `ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a` |
| E05 | [Verification results: timing](#verification-results) | The drand bet-timing method: the bet's operator timestamp against the chain-formula publication time (formerly a separate methodology chapter) |
| E06 | [capture/crash-capture.reference.js](capture/crash-capture.reference.js) | Capture method of the browser console capture script, which hooked WebSocket messages to record round data, commitments and drand metadata; reference record, not a runnable tool. It holds the round-capture code only: the save step that matched the transactions API and wrote the file is in the runnable script, not published, and the dataset's `meta.schema` (`duel-crash-capture-v3`) is not the one that script writes ([Dataset and capture](#dataset-and-capture)) |
| E07 | [outputs/drand-api-verification.json](outputs/drand-api-verification.json) | 1,100/1,100 round signatures matched against api.drand.sh, 0 failures; pinned |
| E08 | [evidence/E07-crash-game-ui.png](evidence/E07-crash-game-ui.png) | Crash game UI: bet controls, crash chart, round history bar and multiplayer player list |
| E09 | [evidence/E08-fairness-page.png](evidence/E08-fairness-page.png) | Duel.com Provably Fair overview page: the commit-reveal scheme and the server seed + client seed + nonce model of its other games |
| E10 | [evidence/E09-fairness-verify-page.png](evidence/E09-fairness-verify-page.png) | Provably Fair verify tab: calculation form with game selector, client seed, server seed and nonce fields |
| E11 | [evidence/E10-crash-provably-fair-panel.png](evidence/E10-crash-provably-fair-panel.png) | Crash Provably Fair panel: Round ID, Server Seed Hashed, Server Seed, Drand Round ID and Drand Randomness |
| E12 | [evidence/E11-duel-homepage.png](evidence/E11-duel-homepage.png) | Duel.com homepage |
| E13 | [verifier-parity/games/crash/derive.js](verifier-parity/games/crash/derive.js), [verifier-parity/lib/hmac-sha256.js](verifier-parity/lib/hmac-sha256.js) | The ProvablyFair.org docs-site Crash verifier (VerifyBets, origin/main @ bd4d59c), vendored byte for byte and pinned in `src/site-verifier.ts` (`d6099cd7…`, `bc30bfe9…`); Step 5 executes it on all 1,100 rounds |
| E14 | [verifier-parity/live-site/](verifier-parity/live-site/) | The three www.provablyfair.org/verify-bets chunks the Duel path needs and their runner, pinned in `src/live-site-verifier.ts`; Step 5 executes the page's own Duel Crash method on all 1,100 rounds |
| E15 | [tests/mutations.json](tests/mutations.json) | Step-named mutation registry run by `npm run mutate` in a disposable copy |
| E16 | [evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js](evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js) | Duel's own Crash verification code, pasted by the auditor from the duel.com Verify tab on 26 September 2026 (Provably Fair → Verify, game Crash, code panel), saved verbatim and never edited. SHA-256 `c699cd5445fb3906614a51fda58d275c9ce1caa5c6402e412dfd20264f05271d`, 2,336 bytes, 76 lines. Pinned with its runner (`verifier-parity/operator/run-operator-verifier.cjs`) in `src/operator-verifier.ts`; run by Step 5 and the unit tests as a second check, not the source of `src/rng.ts`; floored result = served crash point and `src/rng.ts` on 1,100/1,100; unfloored value bit-identical on 824/1,100 (information only) (CRASH-09) |

The wallet-ledger files [evidence/wallet-legs-2026-09-29.json](evidence/wallet-legs-2026-09-29.json) and [evidence/wallet-legs-losses-2026-09-29.json](evidence/wallet-legs-losses-2026-09-29.json) are described under [Money model](#money-model).

### Source files supporting the result

| File | Role |
|---|---|
| `src/rng.ts`, `docs/ALGORITHM.md` | HMAC-SHA256 crash algorithm and survival probability, rebuilt from the written specification `docs/ALGORITHM.md` |
| `src/loader.ts` | Dataset loader, SHA-256 guard and the population of record (declared counts, edge constant, RTP grid bound) |
| `src/artifact-pins.ts`, `src/domains.ts` | SHA-256 pins of the three artifacts of record; value domain of every numeric leaf (Step 17) |
| `src/diff.ts` | Field-level reproduction diff at tolerance (`outputs/run/diff.json`) |
| `src/stats.ts`, `src/simulate.ts` | Chi-squared, autocorrelation and runs test; the two-pass simulation |
| `src/verify-drand-timing.js` | drand timing check and signature fetch from api.drand.sh (`npm run timing`) |
| `src/site-verifier.ts`, `src/live-site-verifier.ts`, `src/operator-verifier.ts` | Pin and run the docs-site verifier, the live verify-bets bundle and Duel's Verify-tab code (Step 5) |
| `src/rtp-settings.ts`, `src/profile-map.ts` | RTP claim table generator and pin; profile labels per step |
| `tests/verify.ts`, `tests/steps/` | The 18-step orchestrator, informational items and reproduction gate; one module per step group |
| `tests/crash/crashTests.ts`, `tests/crash/RngSpecTests.ts` | The Mocha unit tests; the specification's self-test |
| `scripts/mutate.mjs`, `scripts/check-site-verifier.mjs`, `scripts/check-live-site-verifier.mjs` | Mutation runner; site-checkout and live-deploy re-checks against the pins |

## Limitations and trust

The **Full Pass** describes reproduction and consistency of the captured rounds under the published algorithm. The dual-entropy model removes server-seed cherry-picking as a practical attack, provided each commitment was fixed before its beacon published (an ASSUMED premise below, DL-2): to choose a seed by outcome the operator would then have to predict a quicknet BLS threshold signature produced by independent League of Entropy operators. On that premise, cherry-pick risk is LOW; Pass 2 found no seed-selection signal within its stated power.

### Load-bearing premises

Every premise the **Full Pass** rests on, the artifact that witnesses it, and whether the 1,100 captured rounds could have contradicted it. A premise the data **cannot** contradict carries a witness from outside this package's own pipeline, or is marked ASSUMED.

| Premise | Witness artifact | Could the captured data contradict it? |
|---------|------------------|----------------------------------------|
| Crash map: `HMAC-SHA256(key = hex_decode(serverSeed), msg = utf8(hex_decode(drandRandomness)) + ":0")`, leading uint32 `v`, `crash = max(1.00, floor(2^32/(v+1) × 0.999 × 100)/100)` | `data/crash-master-1100rounds.json` — all 1,100 rounds; Step 5 | **yes, at full strength** — 1,100/1,100 served crash points recompute by exact equality, and the ProvablyFair.org docs-site verifier and the live verify-bets bundle, executed from pinned bytes, agree on all 1,100 (Step 5). One wrong constant or encoding breaks every row |
| Each round opens its own commitment: `SHA-256(hex_decode(serverSeed)) = serverSeedHash`, one fresh seed per round | the dataset; Steps 1, 4 | **yes** — 1,100/1,100 open, 1,100 distinct seeds and 1,100 distinct commitments |
| The drand value in each round is the public quicknet beacon for its round number, published at `1692803367 + (round − 1) × 3` | `outputs/drand-api-verification.json` (one api.drand.sh record per round, pinned); Steps 11, 15 | **yes** — a signature that is not the beacon's, or a publication time off the chain formula, fails Step 15 / Step 11 on the round |
| **The round's commitment (`serverSeedHash`) existed before its drand beacon was published** — the property that stops the operator choosing a seed after seeing the beacon | ASSUMED — Step 2 measures the **bet** time `betPlacedAt`, which is Duel's own transactions-API `timestamp_raw` (operator-reported), against the beacon's chain-formula publication time: 1,100/1,100 positive, min 0.404 s. The capture stores the hash from socket events with **no receipt time** (`capture/crash-capture.reference.js:153-195`), so when the hash was shown is not recorded | **no, not from a clock the operator does not control.** A backdated `timestamp_raw`, or a hash first shown after the beacon, leaves every captured row unchanged. See DL-2 |
| **The round's drand round was fixed before its beacon was published**: the property that stops the operator choosing among published beacons for a committed seed | ASSUMED: the capture took `drandRoundId` from `pending_drand` with **no receipt time** (`capture/crash-capture.reference.js:160-168`), and the pairing rule is unpublished (R-1). Step 3 shows only that beacon rounds increase | **only statistically.** An operator choosing among beacons published after bets close leaves Steps 2, 3, 5, 11 and 15 unchanged; Step 14's rank statistic responds, within its stated power. See DL-2 |
| Win rule `isWin ⇔ crashPoint ≥ cash-out target` (ties win) | the dataset; Step 7 | **yes** — 1,100/1,100 flags follow it, and the boundary is witnessed: 4 ties (crash == target) settled as wins, 4 rounds one hundredth below the target settled as losses |
| The wallet credit on a win is the full `amount × cashout` | `evidence/wallet-legs-2026-09-29.json` — the wallet ledger of 3 of the 671 captured wins, one per phase (operator-reported records, looked up read-only 2026-09-29) | **partly.** The 1,100-round dataset holds no wallet field and cannot. The three ledger lookups could have shown `× 0.999` and show the full amount on 3/3; the other 668 wins were not looked up. See DL-1 |
| Every bet cashes out at the cap: 9,999.999× at most, whatever target is set. Step 16's RTP-CLAIM pass scores every target from 10,000.00× up at it | Duel's statement to ProvablyFair.org on 21 October 2026: auto cash-out at 9999.999x. No artifact in this package records it | **no, zero power.** No captured bet reached the cap: the captured targets top out at 10×, and the 1 round that crashed above the cap (13,664.99×, round 831375) was a 2× bet. See DL-5 |
| Stake does not move the crash point or the settlement | the dataset; Step 6 | **yes** — 100/100 Phase C ($10) rounds recompute identically, and 49 elevated-stake and 24 base-stake wins at the same 2× target settle at one identical per-unit return |
| The single test account sees the same crash point every player sees | ASSUMED — single-account capture (S10 above) | **no — zero power.** No second account observed any round |

### Declared limitations register

Everything this package knows it cannot prove, with its measured magnitude where one exists. Capture-origin items are disclosed and never counted against the operator. Rows marked RESOLVED or CLOSED are kept as the record of the change.

| # | Limitation | Magnitude (measured) | Why it is not closed here |
|---|---|---|---|
| **DL-1** | **The wallet credit is measured on a sample, and the Zero Edge rakeback's route to the balance is not established.** The dataset holds no wallet field; settlement and the rakeback record were looked up in the wallet ledger for six captured bets on 2026-09-29 ([Money model](#money-model)). | Wins: 3 of 671 looked up, 3/3 credited the full `amount × cashout`. Losses: 3 of 429 looked up, no payout leg. Zero Edge rakeback record `0.001 × amount` on 6/6. The rakeback is not added to the balance at the bet (one consecutive pair); the first `Rakeback Claim` after the capture posts on 2026-04-24. | Looking up the other 668 wins is read-only and would close the settlement sample. Which bets and which rakeback a claim pays, whether claiming needs the player, and the daily cap are not visible in the records looked up. |
| **DL-2** | **The commitment-before-beacon property is not measured, and the bet-before-beacon margin rests on operator-reported time.** Step 2's margin uses Duel's own transactions-API bet timestamp, and times the bet rather than the moment the `serverSeedHash` was shown; no client receipt time of the commitment was recorded. Likewise, no receipt time was recorded for the `pending_drand` event that names the drand round, so that the drand round was fixed before its beacon published is not shown either. | All 1,100 rounds; margins 0.404 s – 13.779 s on the operator's clock. | A client-side receipt time for the `crash_hashed_pf` and `pending_drand` events (or an independently timestamped commitment log) would be needed; the capture predates this requirement. No step changed. |
| **DL-3** | **RESOLVED 2026-09-26 — Simulation Pass 2's statistic was a distribution fail count.** Raised on 2026-09-26 from 1,000 to 10,000 drand values per revealed seed (χ² fails 14 → 15, mean RTP @2× 99.9638% → 99.9043%, threshold 21), then rewritten the same day: the statistic is now the return of the cash-out targets actually played against its exact mean and variance, plus the captured round ranked among its own seed's reference draws under an exact permutation null, with a pre-registered rule and printed detection power (profile CRASH-21). | 1,100 seeds × 10,000 = 11,000,000 replayed rounds; return z 0.286, rank-sum z 0.160, critical −3.291 each (family α 0.001); power ≥ 7.5 % of winning captured rounds turned into losses. | Kept as a record of the change; no open limitation. |
| **DL-4** | **CLOSED (2026-09-26).** This row said Duel's own crash verify code was not vendored. The auditor pasted it from the duel.com Verify tab on 2026-09-26: `evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js` (E16, SHA-256 `c699cd5445fb3906614a51fda58d275c9ce1caa5c6402e412dfd20264f05271d`), pinned in `src/operator-verifier.ts` and executed by Step 5 and the unit tests with only its two "User input values" filled in, as a second check: `src/rng.ts` is rebuilt from `docs/ALGORITHM.md`, not from this file (until 20 October 2026 it was a port that cited 10 of its lines). Floored to 2 dp, its result equals the served crash point and `src/rng.ts` on 1,100/1,100 rounds; its unfloored value is bit-identical to `src/rng.ts` on 824/1,100 and one rounding apart on 276 (information only, [Player-verifier parity](#player-verifier-parity)). It computes the crash point only — it does not speak to settlement (Money Model, DL-1). | 1,100/1,100 displayed crash points agree. | Closed for the published code. Not established: that the Verify button, or Duel's server, runs exactly this code. |
| **DL-5** | **RESOLVED 21 October 2026 — the RTP of targets above the enumerated grid.** Until 21 October 2026 the per-target RTP was enumerated from 1.01× to 100,000× and no maximum cash-out target was known. On 21 October 2026 Duel stated that every bet cashes out at 9,999.999× at most, whatever target is set (Duel's statement to ProvablyFair.org on 21 October 2026: auto cash-out at 9999.999x). | Every target from 10,000.00× up is scored at Duel's stated cap and returns 99.899936%; every target returns between 99.899768% (9,999.05×) and 99.900000% ([Distribution RTP](#distribution-rtp)). | Kept as a record of the change. Every bet cashes out at the cap on Duel's statement to ProvablyFair.org on 21 October 2026: auto cash-out at 9999.999x; no captured bet reached it (premises table). |
| **DL-6** | **CLOSED 2026-09-26 — the live sample is scored.** Step 18 fits the 1,100 live rounds' recomputed uint32 values to uniform (χ², 20 bins) and tests serial dependence in capture order; a deviation turns the step to INFO (reported, not counted as a flag, verdict unchanged). | χ² p = 0.828, lag-1 z = −0.75, runs p = 0.469. | Kept in the register as the record of the change. |
| **DL-7** | **CLOSED 2026-09-26 — value domains declared.** Step 17 validates every numeric leaf of `simulation-results.json` and `drand-api-verification.json` against `src/domains.ts` (bounds from `src/`, never from the artifact), in both directions. | every numeric leaf of the two JSON artifacts. | Kept in the register as the record of the change. |
| **DL-8** | **Capture pauses (capture-origin).** The 1,100 captured rounds are not all consecutive game rounds. | Round IDs 829099–831399: 1,095 consecutive steps and 4 gaps of 19, 70, 146 and 970 rounds. Each round opens its own commitment and beacon, so a skipped round leaves no unverifiable round in the dataset. | Auditor-side; disclosed, never counted against the operator. |
| **DL-9** | **The live-site verifier bytes were not re-fetched for this package.** The three verify-bets chunks were copied from the Duel Dice package, which recorded them from GETs of 2026-09-25. | 3 chunks, each hashing to the pin that package holds. | `node scripts/check-live-site-verifier.mjs --live` re-checks the deployed site; not run in this round. |

### Residual operator trust

- **Game-to-drand round mapping.** The rule the server uses to pair a game round with a drand round is not published. Strictly increasing drand round IDs show ordering only: no beacon re-used or taken out of order. After the fact a player can check that the announced beacon is the quicknet signature for the announced drand round (Step 15 does this for all 1,100 rounds), but cannot predict the pairing in advance, and that each drand round was fixed before its beacon published is ASSUMED (DL-2).
- **drand chain liveness.** The game depends on the League of Entropy continuing to operate the quicknet chain; an outage would need a fallback. This is an external dependency, not an operator trust issue.
- **Single account.** Whether the server gives different players different seed commitments for the same round was not tested.

### Recommendations and scope boundaries

- **R-1 (medium priority).** Publish the game-to-drand round mapping formula, or a deterministic rule, so players can predict which drand round a game round will use before it starts. This removes a trust dependency; today the pairing can be verified only after the fact.
- **R-2 (low priority).** Show the quicknet chain hash (`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`) and a link to `api.drand.sh` on the fairness verification page.
- **R-3 (low priority).** Use the drand hex string directly as the HMAC message (`drandHex + ":0"` instead of `UTF8(hexDecode(drandHex)) + ":0"`), preserving the full 384 bits of beacon entropy and avoiding any platform-dependent UTF-8 edge case. The current conversion is deterministic and both sides agree, so this is an engineering improvement, not a security finding.
- **R-4 (retired 21 October 2026).** Recommended on 19 October 2026 that Duel cap the cash-out target. Duel states that it already cashes out every bet at 9,999.999× at most (DL-5).
- **R-MULTI (future scope).** A multi-account audit would place bets from two funded accounts in the same round and compare the commitments each receives over the WebSocket.
- **R-BRACKET.** Not applicable: Crash has no bracket structure or multiplier table; the crash point comes from a continuous formula.

The HMAC-SHA256 implementation (hex key decoding), the commitment-per-round design and the flat 0.1% distribution edge embedded in the formula need no change.

## Terms

**Crash point:** the multiplier at which the round crashes and remaining bets lose; shared by all players. **Distribution RTP:** `P(crash ≥ x) × x` for a bet that cashes out at `x`; at most 99.9%. **House edge (distribution edge):** the 0.1% from the `0.999` factor applied before flooring. **Survival probability:** `P(crash ≥ x) = floor(2^32 × 0.999 / x) / 2^32`. **Anti-circularity:** deriving the RTP from the algorithm alone, here by counting uint32 values, without casino-supplied probabilities. **Zero Edge rakeback record:** the `0.001 × amount` record attached to each bet looked up; its payout route is not established. **Commit-reveal:** publish a seed's SHA-256 hash before play, reveal the seed after; here the commitment is the round's `serverSeedHash`, captured from `crash_hashed_pf` (where that event did not carry it, from `pending_drand`, `crash_bet_placed` or `bet`). **drand / quicknet:** the League of Entropy's public randomness beacon; the quicknet chain publishes a BLS threshold signature every 3 seconds. **BLS threshold signature:** a signature that needs a threshold of independent signers. **commitmentBeforeDrand:** beacon publication time minus the operator's bet timestamp, in milliseconds. **Fisher's method:** combining K independent p-values as `T = −2 Σ ln(p_i)`, χ² with 2K degrees of freedom. **Bonferroni correction:** dividing the significance level by the number of tests. **Serial independence:** no dependence between consecutive outcomes, tested by lag-1 autocorrelation and the Wald-Wolfowitz runs test.

## Release history

| Release | What changed | Verdict |
|---------|--------------|---------|
| `v1.0.0` | The audit as originally published, tagged on 17 September 2026. The tag points at public commit `7350abd` (14 September 2026), not at the 4 June 2026 publication `f97d5b8`: `7350abd` is that publication plus one commit, which bound the audited population to code and pinned the artifacts of record (Step 16, Artifact Integrity: 15 scored steps on 4 June, 16 at the tag). The dataset is byte-identical in both. | PROVABLY FAIR — Full Pass |
| `v1.1.0` | Re-certification under Framework 1.1, October 2026, below. The dataset of record is unchanged. | unchanged |
| `v1.2.0` | The RNG rebuilt from a written specification instead of ported from Duel's code; Duel's code kept as a second check (below, "20 October 2026"). Duel's 9,999.999× cash-out cap applied to the RTP table (below, "21 October 2026 — Duel's cash-out cap"); the cap's source named, a premises row added for it and its wording corrected (below, "21 October 2026 (second QA)"). | unchanged |
| `v1.2.1` | Errata: adds `.gitattributes` (`* -text`) so a Windows git clone keeps every file byte-identical; no audit content changed. | unchanged |
| `v1.2.2` | Errata: the drand quicknet genesis time 1692803367 is written as 2023-08-23T15:09:27Z, in the drand parameter table above and in a source comment in `src/verify-drand-timing.js`; it read 2023-08-23T12:02:47Z, which is not that Unix time. The value 1692803367 used by the code was right; no scored step, figure or verdict changed. | unchanged |
| `v1.2.3` | Wording errata: internal references removed; no change to data, code paths or results. `src/rtp-claim.ts` is the framework rule as it now stands, its 1.2.0 comment reworded (SHA-256 `cf9117d8…a93c`). | unchanged |

### v1.1.0 — what changed

- **Scored steps: 16 in v1.0.0, 18 now.** The verdict is unchanged, PROVABLY FAIR — Full Pass. The dataset of record is byte-identical to v1.0.0. New: Configuration Coverage (auto-cash-out target) and Live-Sample Fit (informational).
- **Money Model.** The manifest now describes settlement from the wallet ledger of six captured bets (`evidence/wallet-legs-2026-09-29.json`, `evidence/wallet-legs-losses-2026-09-29.json`, account identifier redacted): the three wins looked up were credited the full amount × cash-out. Steps 7, 8 and 12 were renamed accordingly: "Captured Payout Consistency (pre-rakeback display values)" is Payout Math, "Distribution Edge Audit (pre-rakeback)" is House Edge Audit, "Anti-Circularity (distribution edge, pre-rakeback)" is Anti-Circularity.
- **RTP claim table, scored.** `outputs/rtp-claim-table.json` scores every cash-out target from 1.01× to 100,000× against a flat 99.9% claim (houseEdge 0.001 in the Verify-tab code on Duel's fairness page; effectiveEdge 0.1 served on all 1,100 rounds); under RTP-CLAIM 1.2.0, switched on, the outcome is scored on Step 16. Outcome: pass, 0 targets beyond the band.
- **Errata (2026-09-29):** the RTP convergence chart (`outputs/rtp-convergence.html`) loaded Chart.js 4.4.7 from cdn.jsdelivr.net, so a pinned artifact depended on a third-party host. The same version is now inlined, byte for byte from the npm package pinned in package-lock.json. Every figure and data point in the chart is unchanged.
- **Documentation:** README.md and MANIFEST.md, the same two Markdown files as `v1.0.0`; this release adds no Markdown file. The working copy's 21 Markdown files (these two and 19 chapter files, none of them in `v1.0.0`) were consolidated into these two on 4 October 2026 (below).
- **Added:** `LICENSE` (MIT), `.nvmrc` (Node 22), `RELEASE-MANIFEST.json` (written by `scripts/release-manifest.mjs`) and the mutation battery (`npm run mutate`, `tests/mutations.json`).

### 4 October 2026 — consolidated documentation

The package's 21 Markdown documents were reduced to **README.md and this MANIFEST.md**. Repeated explanations were removed; the dataset, outputs, evidence files, source and tests are unchanged. Documentation references in the profile-coverage map, the RTP claim source (formerly `MANIFEST.md:22`) and source comments now point to the retained sections, so the claim table and verification result were regenerated with the package's own commands and the release manifest refreshed; every numerical result is unchanged. Where the former chapters disagreed, this overview follows the verifier output and the most recent chapter: 19 unit tests and 18 steps (not 15 and 17), a 48-byte beacon signature (not 96 bytes), a map maximum of 4,290,672,328.70× (not about 43 million), and the premises table's ASSUMED status for commitment-before-beacon (where older chapters called the ordering proven). A sentence giving a 65.3-second commitment lead for round 829099 was not carried over: the capture records no commitment receipt time (DL-2). No new capture, simulation regeneration or mutation run is asserted for this update.

### 4 October 2026 — pre-publication wording corrections

Wording only: no verdict, step status or number changed. Step 3's result now says what strictly increasing drand round IDs show: that no beacon was re-used or taken out of order. That each drand round was fixed before its beacon published is now an ASSUMED premise, because the capture recorded no receipt time for `pending_drand` (DL-2); Step 14's rank statistic is the statistical check on beacon selection. The round-lifecycle table now lists the events and fields the capture read or sent (E06); it had credited `collecting-bets` with the commitment and the drand round, which the capture did not read from that event. The money model now states that the `Rakeback Claim` entries were read from the account ledger and are not in the two pinned files. The CRASH-17 profile note no longer compares this package with another audit, and internal reference numbers were removed. `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (five text fields changed, no numeric field) and the release manifest refreshed. The mutation runner's disposable copy now includes `outputs/rtp-claim-table.json` (committed 30 September); without it the copy's baseline verify exited 1 and no entry could run. The battery was then re-run: 40/40 killed.

### 5 October 2026 — CRASH-17 note

The CRASH-17 profile note no longer states that the profile requires operator-reported commit timing not to pass; under the profile, disclosed operator-reported timing passes (DL-2). The profile labels now cite Crash profile 1.0.3-proposed, the version whose CRASH-17 states that rule. `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (the four CRASH-17 note fields and the profile version only) and the release manifest refreshed.

### 5 October 2026 — RTP above the enumerated grid

No verdict, step status or measured number changed. The README said the theoretical RTP was 99.9000% at every cash-out target, and this overview said the Zero Edge record, if paid, made the net return 100.0%. The package's own formula gives 99.9% only as an upper bound, and the claim table scores 1.01× to 100,000×, while Duel declares no maximum target. Both places now state the bound, the 1.01×–100,000× range from the claim table, and the RTP above 100,000× from the closed form (removed on 21 October 2026, when Duel's cash-out cap was applied; below); the Zero Edge record is stated as adding 0.1 percentage point to the target's RTP. DL-5 carried the same figures. The Step 16 note in `tests/steps/coverage.ts`, which said "for every cash-out target", now names the enumerated grid; `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (that note only) and the release manifest refreshed.

### 5 October 2026 — commitment timing wording

Wording only: no verdict, step status or measured number changed. A seed hashing to its commitment shows consistency, not timing: a seed and hash made after the round also match. The player steps in [Verify a bet](#verify-a-bet) and the README now tell the player to save the commitment before betting and compare the revealed seed against that saved value; a PASS means hash equality, and assurance about timing comes from the saved record. The S2 basis no longer says the seed is "locked by its commitment" as the reason post-bet manipulation passes, and S5-4 and the opening of [Limitations and trust](#limitations-and-trust) now state that the structural defence against seed selection holds only if each commitment was fixed before its beacon published (ASSUMED, DL-2). The console output of `npm run timing` (`src/verify-drand-timing.js`) no longer calls the bet-before-beacon margin a "Pre-Commitment Proof", "pre-commit proven" or "Proven by", and says that it times the bet on the operator's clock; it writes none of these strings to a file, so no artifact changed.

### 6 October 2026 — rotation, timing and stake wording

Wording only: no verdict, step status or measured number changed. The comparison table in [Game and algorithm](#game-and-algorithm) gave Duel's other games a 50-bet epoch with nonces 0–49 and a reveal after epoch rotation. The 50 is the rotation schedule of the Dice, Plinko and Keno capture scripts (`BETS_PER_EPOCH = 50`), not Duel's behaviour; the table now says a seed pair serves the player's bets until the player rotates it, and its seed is revealed then. The conclusion called the bet-timestamp measurement "commitment ordering"; it now says bet-before-beacon ordering. Step 2 is renamed from "drand Commitment Timing (Pre-Commitment)" to "drand Bet Timing (Bet Before Beacon)", and the step table and E05 follow it; the DL-2 heading now says the commitment-before-beacon property is not measured and the bet-before-beacon margin rests on operator-reported time. The residual-trust bullet on round mapping credited increasing round IDs with showing that the announced beacon was used; it now says they show ordering only and credits the beacon check to Step 15. "Cherry-pick risk is LOW" at the opening of [Limitations and trust](#limitations-and-trust) now carries its premise. The wallet-credit and Zero Edge statements in the conclusion, the money model, [Verify a bet](#verify-a-bet) and the README now name the stakes they were looked up at, $0.01 and $10, and the Step 16 sentence in [Distribution RTP](#distribution-rtp) is scoped to its grid. Source comments in `src/loader.ts`, `src/types.ts`, `tests/steps/commitment.ts` and `tests/steps/sim-replay.ts` no longer call the bet margin pre-commitment evidence or state the commitment-before-beacon premise as fact, and the console header of `npm run timing` is renamed to match Step 2. `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (the Step 2 name only) and the release manifest refreshed.

### 14 October 2026 (second pass) — an RTP miss ends RTP FIGURE OVERSTATED (FIXPASS2 class C3)

No verdict, scored step status or figure changed. `outputs/verification-results.json` was re-emitted; the Step 16 detail line and `data.flatnessBound` changed.

- **Step 16 no longer pre-empts the rule.** It failed any cash-out point whose counted RTP fell below 0.999 by a whole uint32 value, so a target paying light ended the run NOT PROVABLY FAIR (measured with MC3a on the 14 October tree: exit 1). Only the side above the ceiling (a counting-model defect) still fails; a shortfall is counted and printed and left to RTP-CLAIM, which holds every grid point (a row of the RTP table) to the claim on this step.
- **Exit-5 mutations.** `scripts/mutate.mjs` gained `regen` (in the disposable copy: the RTP table rewritten by `src/rtp-settings.ts` and re-pinned, then the committed record re-emitted with `PF_EMIT=1`), `expectExit` (an entry counts as killed only when the run also ends with that exit code) and runner `test` (mocha, then the verifier, as `npm test` runs them). New entries: MC3a (the count at the 5000.00× cash-out lowered 1 % in `tests/steps/crash-model.ts`: 98.900869 %) and MC3b (the claim raised to 100.1 %), each with the table and record regenerated and expected to end RTP FIGURE OVERSTATED, exit 5. MC3as and MC3bs make the same changes without regenerating the table and are expected to end exit 1: a committed RTP table that differs from the run, or from its pin, is a reproduction failure, miss or no miss.
- **Battery (Apple M2 Max, 12 cores, Node v22.23.1).** The whole registry (44 entries) in one `npm run mutate` on this tree, 14 October 2026 evening (baseline green): 44/44 killed, 18/18 scored steps covered. On 15 October `--only` (now taking several comma-separated substrings) reran the four C3 entries and every entry naming Step 16, the RTP-claim step (M16, M16b, MC3): 6/6 killed; MC3a and MC3b ended `VERDICT: RTP FIGURE OVERSTATED`, exit 5; MC3as and MC3bs exit 1 with the committed table reported as differing from the run.

### 14 October 2026 — Methodology v1.1

No draw check, scored step status, figure or verdict changed. The dataset and the artifacts pinned in `src/artifact-pins.ts` are unchanged; the RTP-claim table, pinned in `src/rtp-settings.ts`, was rewritten and re-pinned (below).

- **Framework 1.1.** The audit is re-certified under ProvablyFair.org Framework 1.1 (decision D1); the release manifest's `framework` field and the release row above say 1.1.
- **RTP-CLAIM 1.2.0, switched on.** `src/rtp-claim.ts` is the framework's rule 1.2.0, byte-identical to `core/rtp-claim.ts` (SHA-256 `c9a9c1c4…5f131c`), and `src/rtp-claim-switch.ts` is set to true (decision D3). The outcome is scored on Step 16 (CRASH-19): a house-side miss would be an operator-origin FLAG on that step and the verdict RTP FIGURE OVERSTATED, exit 5, never NOT PROVABLY FAIR. The claim source now names its place, the fairness page: houseEdge = 0.001 in the code panel of the Verify tab on Duel's Provably Fair page (E16). Outcome: pass, as before. In `outputs/rtp-claim-table.json` only `ruleVersion` and the source wording changed.
- **Profile.** The Crash profile version this suite cites is 1.0.3 (decision D6, approved as cited; the `-proposed` suffix is dropped, no check changed). In `outputs/verification-results.json` only `profileCoverage.profileVersion` changed.
- **S5 level.** The adversarial matrix states the S5 level received: the fairness-integrity matrix; game-integrity testing was not commissioned (decision D5).
- **Exit 5** (RTP FIGURE OVERSTATED) is added to the exit codes.
- `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned, `outputs/verification-results.json` regenerated with `PF_EMIT=1 npm run verify`, and the release manifest refreshed with `npm run release-manifest`. The mutation battery was rerun: 40/40 killed, 18/18 scored steps covered.

### 19 October 2026 — review corrections

No draw check, scored step status, measured figure or verdict changed.

- **RTP scope for high cash-out targets.** The RTP scope was stated as targets up to 100,000×, with higher targets disclosed as outside it, not a pass, and a new recommendation, R-4, that Duel cap the target. The conclusion, [Distribution RTP](#distribution-rtp), DL-5 and the README carried it until 21 October 2026, when Duel's cash-out cap replaced it (below).
- **RNG code origin.** The conclusion no longer says the crash points were "independently reproduced". [Player-verifier parity](#player-verifier-parity) then stated that `src/rng.ts`, a port at the time, was checked against Duel's published Verify-tab code and made no claim that it was written independently of it; the 20 October 2026 rebuild (below) replaced that section. The per-value model of Steps 12 and 16 is described as separate from the closed form.
- **What the capture recorded.** The capture stored the served multiplier floored to 2 dp, so Step 5's grid half cannot fail on this dataset and does not show what the server sends; [Crash-point algorithm](#crash-point-algorithm) and the Step 5 row say so, the Step 5 detail line says "recorded" for "served" where the grid is meant, and the CRASH-10 grid-and-range label is now partial.
- **Capture script.** [Dataset and capture](#dataset-and-capture) and E06 now say that the save step is in the runnable script, which is not published, and that the dataset's `meta.schema` (`duel-crash-capture-v3`) is not the one that script writes.
- **Step 18.** A deviation turns the step to INFO, as the code does; this overview and DL-6 had said FLAG.
- **`v1.0.0`.** The release history and the header now say that the public `v1.0.0` tag points at `7350abd` (14 September 2026), the 4 June 2026 publication `f97d5b8` plus one commit.
- **Wording.** The "not yet released" line and the README's draft line were removed; the v1.1.0 list no longer counts 19 added Markdown files (this release has the same two as `v1.0.0`); the CRASH-23 note lists the S5 rows as six Pass and two Not applicable, not "Pass / Not tested".
- **Code and tests.** The unit test for the instant-crash probability now requires exactly 46,776,872 / 2^32 (1.0891%); it had accepted anything within 0.1 percentage point of 0.99%. Comments in `src/types.ts`, `src/loader.ts`, `tests/steps/statistical.ts` and `tests/steps/dataset.ts` were corrected (the recorded crash point, the commitment and bet timestamps, the smallest cash-out group of 50 rounds, `amountWon` as the captured field, Step 11's name and Step 10's own hash check).
- `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (the Step 5 detail line and the CRASH-10 and CRASH-23 notes and label only) and the release manifest refreshed. The mutation entries touching the changed code, M05, M05b, MC3a and MC3as, were re-run on this tree with `npm run mutate -- --only`: 4/4 killed, MC3a exit 5.

### 20 October 2026 — RNG rebuilt from a written specification (v1.2.0)

The verdict, the scored-step statuses (18 PASS, 0 flags, 0 hard fails), every measured figure and the dataset are unchanged. Through v1.1.0, `src/rng.ts` was ported from Duel's published Verify-tab code (E16). A port can copy the casino's own mistake into the check of it, so the RNG is now rebuilt from a written specification instead.

- **Specification.** [`docs/ALGORITHM.md`](docs/ALGORITHM.md), a copy of the ProvablyFair.org framework's `games/crash/ALGORITHM.md` (SHA-256 `d487ca48…0ce2`) with the spec author's workspace paths replaced by package paths or neutral wording (its header says so). It was written from Duel's public pages, the standard provably-fair construction, the 1,100 live rounds and black-box readings of Duel's Verify page, without opening Duel's code; its §4 gives the source of every step and its §8 lists every file read. Its §2 Step 3 example for swapped inputs gives the two results under each other's labels; the values are right and the self-test reports the swap as a note. It is the package's one Markdown file besides README.md and this overview.
- **Rebuild.** `src/rng.ts` was written by an implementer who read only that specification and an interface file and never opened Duel's code or the earlier `src/rng.ts`. Its body is that implementer's file byte for byte; only a provenance header was added. It computes the displayed crash point in exact integer arithmetic, `floor(999·2^32 / (10·(u+1)))` cents, and the survival probability from the same integer count. Its self-test is now a unit test, `tests/crash/RngSpecTests.ts` (87/87).
- **Duel's code is a second check, not the source.** Step 5 and the unit tests still run Duel's Verify-tab file byte for byte on all 1,100 rounds. They now compare the displayed crash point, the floored value the game shows and pays on, exactly: 1,100/1,100 against the served crash point and against `src/rng.ts`. The unfloored value is reported as information only: bit-identical on 824/1,100; on the other 276 it differs by at most 2.21·10⁻¹⁶ relative, from rounding order (Duel's `(2^32/(u+1))·(1−0.001)` rounds twice, `src/rng.ts`'s `0.999·2^32/(u+1)` once), and `src/rng.ts` is nearer the exact value on 270 of the 276, Duel's on 6. Through v1.1.0 the unfloored value was bit-identical on 1,100/1,100 because `src/rng.ts` used Duel's expression. The 10-line citation table of the port (`OPERATOR_SOURCE_CITES`), its check, its unit test and mutation M05k are removed.
- **Three-way agreement.** Step 5 runs it on every `npm test`: `src/rng.ts` against the served crash points and commitments (1,100/1,100), Duel's Verify-tab code (1,100/1,100 displayed crash points) and both ProvablyFair.org verifiers (1,100/1,100). No step was added.
- **RTP figures unchanged.** The rebuilt survival probability gives the same count as the port at all 9,999,900 targets from 1.01× to 100,000× and the same instant-crash probability, so the claim table's outcome (pass, true maximum 99.900000%) was unchanged. The 100,000× scope and recommendation R-4 (19 October 2026) were unchanged.
- **Artifacts.** `outputs/simulation-results.json` and `outputs/rtp-convergence.html` came back byte-identical from `npm run simulate`, so their pins are unchanged. The RTP claim source now cites line 63 of the pinned Verify-tab file instead of a line of the old `src/rng.ts`; `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned (`f8d7b80f…`, previously `39d3bc0f…`; only that source text changed). `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (the Step 5 detail and operator data, the CRASH-09 and CRASH-29 notes), and the release manifest written by `npm run release-manifest` as `v1.2.0-draft`, unsigned (relabelled `v1.2.0` on 21 October 2026). M08 now forges the rebuilt module's edge constant. `npm run mutate`, the whole registry (43 entries) in one run: 42/43 killed, 18/18 scored steps covered; the one entry not killed, M01b, timed out under machine load and was killed on a re-run alone (`--only M01b`, 1/1).
- **Player-facing algorithm and the per-value model rewritten from the specification.** The [Crash-point algorithm](#crash-point-algorithm) block, its worked example, step 4 of [Verify a bet](#verify-a-bet) and the reference `verifyCrashPoint` followed Duel's Verify-tab form: the hex prefix parsed with `parseInt` and `(2^32 / (value + 1)) × 0.999` in doubles. They now follow [docs/ALGORITHM.md](docs/ALGORITHM.md) §2: the first four digest bytes as a big-endian uint32 and `cents = floor(999 × 2^32 / (10 × (value + 1)))` in exact integers. The function, taken from this file, returns the recorded crash point on 1,100/1,100 rounds (2.81 on round 829099) and the specification's two Verify-page readings with round 829099's seed (drand `00000f67` → 1.00, `0029dda6` → 8347611.53). `crashFromValue` in `tests/steps/crash-model.ts`, the per-value map Steps 12 and 16 and the RTP table count on, now computes the same exact rule instead of Duel's double expression; its counts equal the closed form at every target cited in [Distribution RTP](#distribution-rtp), Step 12 and the RTP table reproduce unchanged, and mutation M12 now edits the new line (M12, MC3a and MC3as rerun: 3/3 killed). No step, figure or verdict changed.

### 21 October 2026 — final QA corrections (v1.2.0)

No draw check, scored step status, measured figure or verdict changed.

- **E16 row.** The evidence table still said Duel's Verify-tab code was cited line by line by `src/rng.ts` (10 lines, checked verbatim) and that its unfloored result equalled `src/rng.ts` on 1,100/1,100. It now says the file is run by Step 5 and the unit tests as a second check, not the source of `src/rng.ts`; its floored result equals the served crash point and `src/rng.ts` on 1,100/1,100, and its unfloored value is bit-identical on 824/1,100 (information only), as Step 5 prints.
- **Release label.** The header, the README, the release-history row and the release manifest say `v1.2.0`; `package.json` and `package-lock.json` say 1.2.0 (they said 1.1.0).
- **RTP table method text.** The table's `rtpMethod` said the count was taken on "the operator per-value map"; it now names the per-value map of [docs/ALGORITHM.md](docs/ALGORITHM.md) §2 (`tests/steps/crash-model.ts`). `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned (`2fe1ac89…`, previously `f8d7b80f…`; only that text changed).
- **Wording.** The README's crash-point row said every served value is on the 2-dp grid; it now says every recorded value, since the capture floored the served multiplier. The 19 October 2026 entry describes the former Player-verifier parity text in the past tense. [Dataset and capture](#dataset-and-capture) now says that the runnable capture tools are not published because they place bets, and that its comparisons with that script cannot be checked from this package.
- The release manifest was regenerated with `npm run release-manifest`.

### 21 October 2026 — Duel's cash-out cap (v1.2.0)

No draw check, scored step status or verdict changed.

- **The cap.** Duel stated on 21 October 2026 that every bet auto-cashes out at 9,999.999× at most, whatever target is set. Neither Duel's Verify-tab code (E16) nor [docs/ALGORITHM.md](docs/ALGORITHM.md) has a cap: it limits the payout, not the crash point.
- **RTP table.** `src/rtp-settings.ts` now scores every target from 10,000.00× up at Duel's stated cap (`OPERATOR_STATED_CASHOUT_CAP_MILLI`), so those rows are 99.899936% and stand for every higher target. `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned (`82c7de13…`, previously `2fe1ac89…`): true minimum 99.899768% at 9,999.05×, true maximum 99.900000%, outcome PASS, 0 targets beyond the band.
- **Scope.** The scope now reads: Duel cashes out every bet at 9,999.999× at most, so no bet pays more than 9,999.999×; at that cap the return is 99.8999%, and every target is within 0.1 percentage points of 99.9%. Removed from the README and this overview: the RTP scope of targets up to 100,000×, and with it the figures and statements about targets above 10,000× scored at their own value, since every such bet cashes out at the cap on Duel's statement. DL-5 is resolved and R-4 retired. The release-history entries of 5, 19 and 20 October 2026 record the earlier scope in the past tense.
- **Text and notes.** The conclusion, [Distribution RTP](#distribution-rtp), the RTP-claim paragraph, the net return, the Step 16 and S5-8 rows, [Verify a bet](#verify-a-bet) step 5 and the README say the same. So do the CRASH-08, CRASH-14 and CRASH-19 notes in `src/profile-map.ts`, the Step 16 note in `tests/steps/coverage.ts`, comments in `src/loader.ts` and `src/rtp-settings.ts`, and the table's `settingSpace` and `rtpMethod` text: `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned again (`ab51f79b…`, previously `82c7de13…`; only those two texts changed), `outputs/verification-results.json` was regenerated with `PF_EMIT=1 npm run verify` (those four notes only) and the release manifest refreshed.
- **Mutations.** The entries that score the RTP table, rerun on this tree with `npm run mutate -- --only MC3,M16` (21 October 2026): 6/6 killed; MC3a and MC3b ended RTP FIGURE OVERSTATED, exit 5, and MC3as and MC3bs exit 1, on the first table pin and again after the second. The rest of the registry was not rerun for this change.

### 21 October 2026 (second QA) — the cap's source, premise and wording (v1.2.0)

No draw check, scored step status, measured figure or verdict changed. The cap is still 9,999.999×.

- **Source of the cap.** Every place that states the cap now names its source: Duel's statement to ProvablyFair.org on 21 October 2026: auto cash-out at 9999.999x. No artifact in this package records the statement itself.
- **Premises table.** The cap is now a row of [Load-bearing premises](#load-bearing-premises): every bet cashes out at the cap, on Duel's statement; no captured bet reached it (the captured targets top out at 10×, and the 1 round that crashed above the cap, 13,664.99× in round 831375, was a 2× bet), so the captured data cannot contradict it. DL-5 said "no open limitation"; it now states the same point.
- **Wording.** "Paid the cap" read as observed. The README's "Captured evidence" column and RTP-claim paragraph, and in this overview [Distribution RTP](#distribution-rtp), the RTP claim table paragraph, the Step 16 and S5-8 rows and DL-5, now say that every target from 10,000.00× up is scored at Duel's stated cap; [Verify a bet](#verify-a-bet) step 5 and R-4 say that Duel states the cap, and the 21 October 2026 entry above says "scores" for "pays". So do the CRASH-08, CRASH-14 and CRASH-19 notes in `src/profile-map.ts`, the Step 16 note in `tests/steps/coverage.ts`, comments in `src/loader.ts` and `src/rtp-settings.ts`, the cap row label in `src/rtp-settings.ts` (no row at or above the cap is kept in the committed table), and the table's `settingSpace` and `rtpMethod` text.
- **Regenerated.** `outputs/rtp-claim-table.json` was rewritten with `npm run rtp-claim:write` and re-pinned (`a80f359c…`, previously `ab51f79b…`; only `settingSpace` and `rtpMethod` changed), `outputs/verification-results.json` regenerated with `PF_EMIT=1 npm run verify` (those four notes only) and the release manifest refreshed with `npm run release-manifest`.
- **Mutations.** The entries that score the RTP table, rerun on this tree with `npm run mutate -- --only MC3,M16` (21 October 2026): 6/6 killed; MC3a and MC3b ended RTP FIGURE OVERSTATED, exit 5, and MC3as and MC3bs exit 1. The rest of the registry was not rerun for this change.
- **Release wording.** At tagging, the README, this overview and the release manifest stopped describing `v1.2.0` as a draft until tagged. The release manifest records `v1.2.0`, superseding `v1.1.0`, and the fingerprint of the ProvablyFair.org signing key (`signature`, `SHA256:gEujiJm2pRyq7lQsfYQfQ1r97H/J7GdaKHbOW8GtikY`), as tagged `v1.2.0`; it was refreshed with `npm run release-manifest`. No check, figure or verdict changed.

### Where the former chapters went

| Former documentation | Consolidated location |
|---|---|
| Executive summary and conclusion | Conclusion and scope; README |
| Game rules, system architecture, RNG algorithm analysis and game logic verifiability | Game and algorithm; Payouts and RTP |
| Payout verification, RTP analysis and simulation methodology | Payouts and RTP |
| Live parity testing and drand timing methodology | Dataset and capture; Verification results |
| Exploit testing and edge-case analysis | Verification results; Game and algorithm |
| Reproducibility guide | Reproduce the audit |
| "Verify one of your own rounds" | Verify a bet |
| Evidence appendix | Evidence |
| Operator trust analysis and recommendations | Limitations and trust |
| Glossary | Terms |
| Table of contents (SUMMARY.md) | Contents; README |
