# Duel.com Crash: clean-room algorithm specification

> Package copy of the ProvablyFair.org audit framework's `games/crash/ALGORITHM.md`.
> It differs from that file only where the file named locations or tracking items
> in the spec author's workspace: those now read as paths inside this package or as
> neutral wording. No rule, number, vector or source note was changed.

Written 20 Oct 2026 for the ProvablyFair.org audit of Duel.com Crash.

This document is meant to be the only input an implementer needs to rebuild
Duel Crash's crash-point derivation and settlement. It was written without
opening any Duel source code, any port of it, the code panel of Duel's Verify
page, or any `verify-tab` / `verifier-parity` capture (§8 lists every file and
URL read). Every step names its source:

- **PAGE**: Duel's public pages, quoted with location and date.
- **STANDARD**: the standard provably-fair construction (SHA-256 commitment to
  a server seed; HMAC-SHA256 keyed by the server seed; first 4 bytes read as an
  unsigned 32-bit integer; crash point = (1 − edge) / uniform, floored to the
  cent).
- **DATA**: fixed by testing candidates against the 1,100 live rounds in
  `data/crash-master-1100rounds.json`
  (captured 14–15 Apr 2026).
- **ORACLE**: black-box readings of Duel's public Verify page
  (`duel.com/provably-fair/verify`, Game = Crash, 20 Oct 2026, logged out).
  I typed inputs into its two fields and read only the displayed
  "Game Result". I did not read the page's code panel. 37 readings were taken,
  and each one counted only when it came out the same after two different
  preceding inputs. The ORACLE decided the one step that neither the standard
  construction nor the dataset could find (Step 2), and it confirmed the clamp
  and the absence of a cap.
- **DRAND**: the public drand "quicknet" API (`api.drand.sh`), which is not a
  Duel source.

The pages say what goes in. They do not say how it is combined.

---

## 1. Inputs and commitment

### 1.1 Inputs

| Input | Form | Source |
|---|---|---|
| `serverSeed` | 64 lowercase hex characters (32 bytes); one per round, revealed after the round | PAGE: E10 "Server Seed" field; E08 "Server seed - a random string provided by us". DATA: 1,100 distinct seeds, all 64 hex |
| `serverSeedHash` | 64 hex characters, shown before the round | PAGE: E10 "Server Seed Hashed"; E08 "the hex-encoded SHA-256 hash of our server seed" |
| `drandRoundId` | integer, a drand quicknet round | PAGE: E10 "Drand Round ID" (shows 27822980) |
| `drandSig` | 96 hex characters (48 bytes) | PAGE: E10 calls this field "Drand Randomness". The Verify page labels the input "Drand seed". DRAND: on all 1,100 rounds it equals the quicknet **`signature`** of `drandRoundId` (1,100/1,100). It never equals drand's own `randomness` field (0/1,100) |
| `auto_cashout` | cash-out target, a multiplier (1.1, 1.5, 2, 5, 10 captured) | PAGE: E07 "Cashout at x2". DATA: request field |
| `amount` | stake, decimal | DATA: request field |

There is **no client seed and no nonce** among the crash inputs. The Verify page
for Crash has exactly two input fields, "Drand seed" and "Server seed" (PAGE,
live Verify page, Game = Crash, 20 Oct 2026). The Dice/Blackjack form has
"Client seed", "Server seed" and "Nonce". Crash is multiplayer: one crash point
per round, shared by every player.

### 1.2 Commitment

PAGE (duel.com/provably-fair, Overview; E08, and rendered live 20 Oct 2026):

> "We then send you the hex-encoded SHA-256 hash of our server seed before you
> place your bets, to prove we won't change our minds."
> "After the game, we reveal the unhashed Server Seed. You can verify that: The
> server seed matches the original hash."

```
serverSeedHash = lowercase_hex( SHA-256( hex_decode(serverSeed) ) )
```

The hash is taken over the **32 raw bytes**, not over the 64 ASCII characters.

- SOURCE: PAGE + STANDARD (SHA-256), DATA (encoding): hex-decoded
  **1,100 / 1,100**, ASCII string **0 / 1,100**. All 1,100 seeds and all
  1,100 hashes are distinct.

### 1.3 The drand value

```
drandSig = signature of quicknet round drandRoundId
quicknet chain hash 52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971
         genesis_time 1692803367, period 3 s, scheme bls-unchained-g1-rfc9380
published_time(round) = 1692803367 + (round − 1) × 3
```

- SOURCE: DRAND (`/info` and `/public/{round}`, fetched 20 Oct 2026):
  signature match **1,100 / 1,100**. The dataset's `drandPublishedAt` equals the
  schedule formula on **1,100 / 1,100**.
- In capture order, `drandRoundId` increases strictly on **1,099 / 1,099**
  transitions.
- Timing (DATA): `drandPublishedAt` is later than the bet's `betPlacedAt` on
  every round, by **404 ms to 13,779 ms**. `betPlacedAt` comes from Duel's
  transactions API, so it is operator-reported. Which drand round a crash round
  uses is chosen by Duel. No public page states the rule.

---

## 2. Crash-point derivation

PAGE gives only the inputs ("Fair result = Server seed + Client seed + Nonce",
E08). For Crash, the Verify page takes "Drand seed" + "Server seed".

### Step 1: parse both inputs as hex

```
seedBytes  = hex_decode(serverSeed)    # 32 bytes
drandBytes = hex_decode(drandSig)      # 48 bytes
```

Hex is case-insensitive. ORACLE: an upper-case drand value and an upper-case
seed each give the same result as lower case. For the real inputs (valid
lowercase hex) nothing more is needed. The page's handling of invalid hex is
described in O5.

### Step 2: build the HMAC message (the non-standard step)

```
text    = UTF8_DECODE_LOSSY(drandBytes)   # bytes -> Unicode string
message = UTF8_ENCODE(text) ++ ":0"       # bytes
```

`UTF8_DECODE_LOSSY` is the WHATWG/Unicode "maximal subpart" UTF-8 decoder,
which replaces each maximal invalid subsequence with U+FFFD. U+FFFD then
re-encodes as the 3 bytes `EF BF BD`. JavaScript's `TextDecoder('utf-8')`
(default, non-fatal) and Python's `bytes.decode('utf-8', 'replace')` both
behave this way. A BLS signature is almost never valid UTF-8: on **1,100 /
1,100** rounds this step changes the bytes. The message is 87–104 bytes long
on the vectors in §5, not 48. The ":0" suffix is the ASCII bytes `3A 30`.

- SOURCE: DATA + ORACLE. This step is not standard and no page states it:
  - DATA: message = drand **hex text** + ":0" gives **5 / 1,100** (chance).
    Message = raw drand bytes + ":0" gives rank correlation |ρ| ≈ 0.03 (none).
    The lossy-UTF-8 form gives **1,100 / 1,100** exact (§7).
  - ORACLE: how it was found. Changing the drand's **first byte** from `b1` to
    `b0` left the Verify page result unchanged (2.81×). Changing its last byte
    changed it. Both `b1` and `b0` are UTF-8 continuation bytes in lead
    position, so each decodes to the same U+FFFD.
- Candidates tried and rejected before this was found (all on the full
  dataset, scored by rank correlation of the 4-byte integer with the served
  crash point, which is mapping-agnostic, or by exact match):
  - message = the drand signature or drand's `randomness` (= SHA-256 of the
    signature bytes), each as hex text or as raw bytes, with suffixes "", ":0",
    ":0:0", ":1", ":<drandRoundId>", ":<roundId>", and others;
  - salts `crash`/`duel`/`drand`/`game`/`round`/`nonce`/`0`–`3` with 9
    separators (14,088 templates);
  - key and message swapped; plain SHA-256/SHA-512 of the concatenations;
  - HMAC over MD5, SHA-1, SHA-224, SHA-384, SHA-512, SHA3, BLAKE2;
  - XOR or integer sum of seed and drand;
  - a neighbouring drand round (offsets −3…+4, publicly fetched);
  - every 4-byte window, both endiannesses, 52-bit windows, and `u32 mod N`
    lattices.

  The best of these was |ρ| ≤ 0.10 on 1,100 rounds, or ≤ 0.30 on 150 rounds,
  which is noise. The found construction gives ρ = −0.99997.

### Step 3: HMAC

```
digest = HMAC-SHA256(key = seedBytes, message = message)    # 32 bytes
```

- SOURCE: STANDARD + DATA + ORACLE. ORACLE confirms that the seed is the
  **HMAC-SHA256 key**:
  - seeds `01` ≡ `0100` ≢ `0001`, and `ff` ≡ `ff00` ≢ `00ff` (an HMAC key is
    right-padded with zeros);
  - a 65-byte seed `aa…aa` gives the same result as its SHA-256 (12.97× both
    times). HMAC-SHA256 hashes keys longer than its 64-byte block;
  - swapping the two inputs changes the result (seed=`ab`/drand=`00` → 7.15×,
    seed=`00`/drand=`ab` → 3.21×), so it is not a symmetric mix such as XOR.

### Step 4: 32-bit integer

```
u = digest[0..3] read as an unsigned 32-bit BIG-ENDIAN integer    # 0 ≤ u < 2^32
```

- SOURCE: STANDARD + DATA. Only the first 4 bytes are used. There is no cursor
  or second HMAC, and no rejection loop: every u maps to a crash point.

### Step 5: crash point

```
cents      = floor( 100 × 0.999 × 2^32 / (u + 1) )     # exact rational arithmetic, then floor
crashPoint = max( 1.00, cents / 100 )                    # 2 decimals
```

- SOURCE: STANDARD (edge / uniform, floored to 0.01) + DATA for the constants:
  - 0.999 with `(u + 1)`: **1,100 / 1,100**;
  - 0.999 with `u` (no +1): 1,099 / 1,100;
  - 1.0 (no edge): 723 / 1,100;
  - 0.99: 10 / 1,100.

  The same formula in IEEE-754 double precision also gives 1,100 / 1,100 (O3).
- The clamp `max(1.00, …)` applies when u + 1 > 0.999 × 2^32, about 0.1 % of
  rounds. **0 / 1,100** captured rounds needed it. The 8 captured rounds at
  1.00 all floor to exactly 100 cents. ORACLE settles it: seed = V1's seed and
  drand = `00000f67` gives u = 4290876352, raw 0.99. Duel's Verify page shows
  **1.00×**.
- Range: 1.00 to 0.999 × 2^32 = 4,290,672,328.70 (u = 0). No cap is applied to
  the formula. ORACLE: drand = `0029dda6` with V1's seed (u = 513) shows
  **8347611.53×** on the Verify page, as this spec predicts. The largest served
  value in the dataset is 13,664.99 (V6).
- Survival law (derived from Steps 4–5, and checked by bisection on the map at
  1,105 grid points with 0 mismatches). For a target x = k/100 with k ≥ 101:
  `count(x) = #{u : crashPoint(u) ≥ x} = floor(999 × 2^32 / (10 × k))`, so
  P(crash ≥ x) = count(x) / 2^32 ≈ 0.999 / x.
  P(crash = 1.00) = 1 − count(1.01)/2^32 = 0.0108911.

---

## 3. Win condition and payout

### 3.1 Win condition

```
win  ⇔  crashPoint ≥ auto_cashout          (tie = win)
```

- SOURCE: PAGE (E07 "Cashout at") + DATA. `isWin` matches `≥` on
  **1,100 / 1,100**. Strict `>` gives 1,096 / 1,100. The tie is witnessed 4
  times, all at 1.5 and all settled as wins: rounds 829360, 829364, 829832 and
  830073.

### 3.2 Payout

```
win : amountWon = amount × auto_cashout × 0.999
loss: amountWon = 0
```

- SOURCE: DATA. **671 / 671** wins match exactly as decimals. amount ×
  auto_cashout without the 0.999 gives **0 / 671**. Losses pay 0 on
  **429 / 429**.
- The multiplier is the **cash-out target**, never the crash point (V5: crash
  13,664.99, target 2, pays 19.98 on 10).
- 0.999 equals 1 − `effectiveEdge`/100. That field is 0.1 on all 1,100 rounds.
  An implementation uses the constant and only **compares** the served field
  with it. This factor is applied **on top of** the 0.999 inside the crash
  point (§2 Step 5). So the distribution return is P(crash ≥ x)·x ≈ 99.9 %,
  and the return on the recorded `amountWon` is ≈ 99.8 %. Keep the two figures
  apart (profile rule `moneyModel`). The UI labels the game
  **"Zero Edge"** (E07; live crash page 20 Oct 2026).
- Rounding: not exercised. Every captured product is exact at ≤ 6 decimals
  (0.014985, 0.0999, 19.98), so floor, half-up, half-even and ceiling all give
  671/671 at 6 or 8 dp. See O2.

### 3.3 Fields an implementation must not read

`crashPoint`, `isWin`, `amountWon` and `effectiveEdge` are the operator's
claims, to be checked. The derivation reads only `serverSeed`, `drandSig`,
`auto_cashout` and `amount`. `serverSeedHash` and `drandRoundId` are used only
for the commitment and drand-binding checks.

---

## 4. Source per step (summary)

| Step | Source | Evidence |
|---|---|---|
| Inputs = server seed + drand value only | PAGE | Verify page (Crash): fields "Drand seed", "Server seed"; E10 panel fields |
| Commitment SHA-256 over hex-decoded seed | PAGE + STANDARD + DATA | 1,100/1,100 (ASCII form 0/1,100) |
| Drand value = quicknet **signature** of drandRoundId | DRAND + DATA | 1,100/1,100 (randomness field 0/1,100) |
| Hex decode, case-insensitive | ORACLE | upper/lower case give the same result |
| Message = UTF-8(lossy-UTF-8(drandBytes)) ++ ":0" | DATA + ORACLE | 1,100/1,100; hex-text form 5/1,100; first-byte invariance on the Verify page |
| HMAC-SHA256, key = seed bytes | STANDARD + DATA + ORACLE | key padding and long-key hashing reproduced on the Verify page |
| u = first 4 bytes, big-endian | STANDARD + DATA | 1,100/1,100 |
| crash = max(1, floor(100·0.999·2^32/(u+1))/100) | STANDARD + DATA + ORACLE | 1,100/1,100; clamp → 1.00× and no cap at 8,347,611.53× on the Verify page |
| win ⇔ crash ≥ target | PAGE (cash-out) + DATA | 1,100/1,100; 4 ties = wins |
| amountWon = amount × target × 0.999 | DATA | 671/671 wins; 429/429 losses = 0 |
| Spec vs Verify page | ORACLE | 37/37 readings reproduced (§7) |

---

## 5. Test vectors (from the dataset)

Copied from `crash-master-1100rounds.json`. Each `commitment` was checked:
SHA-256(hex_decode(serverSeed)) equals the served hash. `msg` is the Step 2
message; its full bytes are given for V1, and its SHA-256 for the rest.

**V1: round 829099** (Phase A, betId 1358580, win; the round also checked on Duel's Verify page)
```
serverSeed   3c9c71aa9ffa2691d29fd754cb0caf8ce1fa87d57804196967de81088fab1d23
commitment   706bb90b571c6165c96a484580efd2f834b4f3237e7cf0f2680b26b7f4e151c0
drandRoundId 27798178
drandSig     b18fa6dc92304844fc4e868d708953e6b628b3f88d4381249d32264df1bfe5bc20aa0905e57fe54063010881767fd56d
msg (87 B, 20 × U+FFFD)
  efbfbdefbfbdefbfbddc92304844efbfbd4eefbfbdefbfbd70efbfbd53efbfbd28efbfbdefbfbdefbfbd43efbfbd24efbfbd
  32264defbfbdefbfbd20efbfbd0905efbfbd7fefbfbd40630108efbfbd767fefbfbd6d3a30
HMAC         5ad96e3c81c2c80dc149a21020c367bbf680b781e9c9eb33525101d7f9df3b3c
u 1524198972 → cents 281 → crash 2.81
target 1.5, amount 0.01 → win, amountWon 0.014985
```

**V2: round 829360** (Phase A, betId 1359681, the tie: crash = target wins)
```
serverSeed   950dded0843c08b883a5ab9ecdd15ca8886f8fe671dcdf55c077fbf921e6dd9a
commitment   b2ea8da5238d1d2aa18311b89734105f34fcb8d1d52d07e686de04a76d87ea83
drandRoundId 27800557
drandSig     918678a693b86bc04d7905ffa214894efa1c4537afe46d11d6968780431899297904f95d5207b1819ff958b26ea37781
msg (96 B, 23 × U+FFFD)  sha256 4c92b83e4635637df31203fd4484b85c51a4b4e0af4d1dc8ac4ba58e3a72abf0
HMAC         aa5843c802d96a3f39849e2833ab3c52667484c9352d022856589d2787676e75
u 2857911240 → cents 150 → crash 1.50
target 1.5, amount 0.01 → win (1.50 ≥ 1.5), amountWon 0.014985
```

**V3: round 829158** (Phase A, betId 1358848, instant crash 1.00, loss)
```
serverSeed   cac8c2a9421c36c9d1a81c42f3b0b9a6bc9813e5f5e76aa2e0c1ac70e44ef613
commitment   99f4e611c4e6a2148c2db77896e9e67fbf7d001f1c512f02fef30f40c2252e70
drandRoundId 27798735
drandSig     8ccc8967432651ddfdc218fa292b9e54010cc0a052eca6409ea27f2261667e5ea9fdbbf8985d5d3af579cd00a05fa72a
msg (89 B, 20 × U+FFFD)  sha256 f6bad0e8c80213d256e98c92dd95382ae6e71637956f805aafee3f1cee2f0741
HMAC         fe8398bfc89d044c62a4a3088b6223fdf60be82478dbec4a6cbd0876891efec0
u 4270037183 → cents 100 → crash 1.00 (no clamp needed)
target 1.5, amount 0.01 → loss, amountWon 0
```

**V4: round 830182** (Phase B, betId 1361768, target 10, win)
```
serverSeed   2df69d3868ea015643180e2d7afb39dfa116bc75afa7a7db05bb278b472d0c54
commitment   f95068062a84776988f41f74db71226d06e4d18c2bfc8fe879292703d51de953
drandRoundId 27808385
drandSig     ab6bf01d168311b5824e4f9b0a6e6f31ff21583b64df1250de35b03fa3cb9a6f43aa1bece7e800a2328034dc3e8a7af0
msg (90 B, 20 × U+FFFD)  sha256 d8bf326fbd2f96f6828bccefbb361f8618011e68d0f2b46055fde58ecf0194f3
HMAC         07cf652186987d450654d50f1ae861009a2c3f974c6f1e060d73b8901f28cff1
u 131032353 → cents 3274 → crash 32.74
target 10, amount 0.01 → win, amountWon 0.0999
```

**V5: round 831375** (Phase C, betId 1363683, $10 stake, largest crash in the capture)
```
serverSeed   bdacffda35f0fbdb36d0b6a5815c266d2d0efb44df769db717608a0ca391a43d
commitment   e8ab24f7b619bcc00544b319405889ddd8db12f3275b058f99d84a832222804a
drandRoundId 27819558
drandSig     96cf6c9834d9c5d2acfc4322e1cda2116202bcba990c3d0b99f3712200c04035bef93e8acc9bd03408c56c97717d8cd5
msg (92 B, 21 × U+FFFD)  sha256 7e012f194a1c9c54090ed7fdeb4deeaf030f0bb9ff18dbc2a1f4b542f519b971
HMAC         0004ca8515ba95597275e4ee94c3a44218a0466b5b8c2ae8c765b33c051f6700
u 313989 → cents 1366499 → crash 13664.99
target 2, amount 10 → win, amountWon 19.98 (paid on the target, not the crash point)
```

**V6–V8: Verify-page-only vectors** (ORACLE, 20 Oct 2026; not dataset rounds)
```
seed = V1 serverSeed, drand "00000f67" → u 4290876352, raw cents 99 → clamp → 1.00   (page: 1.00x)
seed = V1 serverSeed, drand "0029dda6" → u 513 → 8347611.53                        (page: 8347611.53x)
seed = V1 serverSeed, drand = V1 drandSig with first byte b1→b0 → 2.81 (same lossy text) (page: 2.81x)
```

---

## 6. Open points the public sources do not settle

- **O1: the lossy UTF-8 step is a property of Duel's implementation, not a
  stated rule.** No page says the drand bytes are decoded as text. The step
  was found from data and from Verify-page behaviour. It means that every
  invalid byte sequence collapses to the same U+FFFD. In V1, the 48 signature
  bytes produce 20 replacement characters, so the message carries less of the
  beacon's entropy than the 48 bytes. Whether this matters for fairness (the
  server seed is still a full 32-byte HMAC key and is committed in advance)
  belongs to the audit, not to this spec. Two edge cases are unwitnessed:
  - A leading UTF-8 BOM (`EF BB BF`, probability 2^-24 per round). JavaScript's
    `TextDecoder` strips it by default; Node's `Buffer.toString('utf8')` and
    Python keep it.
  - Whether the server uses the same decoder as the Verify page.

  The dataset matches the Python decoder on every round.
- **O2: payout rounding.** Every captured `amount × target × 0.999` is exact at
  ≤ 6 decimals, so the rounding mode and the money grid are not determined.
  Stakes or targets that produce more decimals (for example 0.01 × 1.37) were
  not captured. The credit that reached the wallet was not captured either.
- **O3: exact rational vs floating point.** This spec defines Step 5 in exact
  arithmetic. A float64 version of the same formula also gives 1,100 / 1,100,
  and the data cannot tell them apart. 999·2^32/(10(u+1)) is never an exact
  integer, because 5 does not divide 999·2^32. So the two can differ only
  where a rounding error crosses a cent boundary. The number of such u values
  was not enumerated. Duel's float expression and operation order are unknown.
- **O4: drand round selection.** The rule Duel uses to pick `drandRoundId` for
  a game round is not published. The data shows the round is published after
  the bet's operator-reported `betPlacedAt` on every captured round (404 ms
  minimum). No page states when `serverSeedHash` is first shown relative to the
  drand round.
- **O5: Verify-page input handling (display only).** The page decodes hex in
  pairs from the left. A pair that is not hex becomes `00` ("hello", "zzzz"
  and "0000" all give the same result). A trailing odd character is dropped
  ("0" behaves as empty). Real inputs are valid hex, so this does not affect
  any round. It is recorded so a player-side verifier can match the page.
- **O6: targets and stakes.** Only targets 1.1, 1.5, 2, 5, 10 and stakes 0.01 /
  10 were captured. The min/max cash-out target and any per-stake edge tier
  are not published on the pages read. The 0.999 payout factor is the same on
  all 1,100 rounds.
- **O7: "Zero Edge" label vs the served edge.** E07 and the live crash page
  show "Zero Edge". The data shows a 0.999 factor in the crash point and a
  second 0.999 factor in the recorded payout. I did not open the
  `/about/zero-edge` page for this spec.
- **O8: the public page names no algorithm.** "Fair result = Server seed +
  Client seed + Nonce" does not describe Crash, which has no client seed or
  nonce. Steps 2–5 rest on STANDARD + DATA + ORACLE, not on a written Duel
  rule.

---

## 7. Reproduction of this spec

The spec was implemented, independently of any audit package, in throwaway
scripts outside the repo (the spec author's check scripts `spec_check.py` and
`oracle_check.py`). They were run on every round (20 Oct 2026). Below is an excerpt
of the real output; the per-rounding-mode payout lines (all 671/671) are left
out:

```
commitment SHA256(hexdecode(serverSeed)) == serverSeedHash: 1100/1100  (SHA256 of ASCII hex: 0/1100)
distinct serverSeeds: 1100, distinct hashes: 1100
drandRandomness == public quicknet signature of drandRoundId: 1100/1100; == public randomness field: 0/1100
drandRoundId strictly increasing in capture order: 1099/1099 transitions
crashPoint = max(1, floor(100*0.999*2^32/(u+1))/100), u = u32BE(HMAC-SHA256(seed bytes, utf8(lossy_utf8(drand bytes)) + ":0")): 1100/1100 mismatches=[]
  rounds whose drand bytes are not valid UTF-8 (lossy step changes the message): 1100/1100
  control, message = drand hex text + ":0": 5/1100
  rounds where the clamp to 1.00 was exercised (raw value < 1): 0; crashPoint == 1 in data: 8
  map variant exact 0.999*2^32/(u+1): 1100/1100
  map variant exact 0.999*2^32/u: 1099/1100
  map variant float64 0.999*2^32/(u+1): 1100/1100
  map variant exact 1.0*2^32/(u+1) (no edge): 723/1100
  map variant exact 0.99*2^32/(u+1): 10/1100
isWin == (crashPoint >= auto_cashout): 1100/1100; == (crashPoint > auto_cashout): 1096/1100; ties crash==target: [(829360, True), (829364, True), (829832, True), (830073, True)]
losses with amountWon == 0: 429/429
  wins: amount*cashout*0.999 exact: 671/671
  wins: amount*cashout (no 0.999): 0/671
Verify-page readings reproduced by the spec: 37/37
count(x)=floor(999*2^32/(10k)) for x=k/100, checked 1105 grid points, mismatches 0
```

---

## 8. Files and URLs read while writing this spec

Read:
- `evidence/` E07, E08, E09, E10 (PNG). E09 shows
  the Verify page with Game = Blackjack; only its input-value lines are visible
  and no code was read.
- `data/crash-master-1100rounds.json`.
- the audit framework's `games/crash/profile.json`. Its reference text
  mentions "message = drand + ':0'" and a 0.999 constant. It was not used to
  choose: the literal hex-text reading of that phrase scores 5/1,100.
- the audit framework's `games/dice/ALGORITHM.md` (model of shape).
- Live, logged out, 20 Oct 2026:
  - `duel.com/provably-fair` (Overview text);
  - `duel.com/crash` (game page text, chat excluded);
  - `duel.com/provably-fair/verify`: form labels, game list, and the displayed
    "Game Result" for typed inputs, never the code panel;
  - `duel.com/economics-changelog`, which redirected to `/blackjack` when
    logged out.
- `api.drand.sh` quicknet `/info` and `/public/{round}` for every dataset
  round, ±3/+4 around the first 150.

Not opened: any `verify-tab`, `verifier-parity`, `src/`, `tests/`,
`scripts/`, `capture/`, `verify.js`, `test.js`, `MANIFEST.md` or `README.md`
of any Duel package, any saved Duel JS bundle, the Verify page's code panel,
E11, the `wallet-legs-*.json` captures, `CHANGES.md` / `status.json`, or
`/about/zero-edge`.
