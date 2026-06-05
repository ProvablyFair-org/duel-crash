# Manifest — Duel Crash Audit

- **Audit ID:** PF-2026-DL05
- **Publication date:** 4 June 2026
- **Audit report:** https://audit.provablyfair.org/casino/duel/games/crash/overview
- **Auditor:** ProvablyFair.org

## Algorithm

HMAC-SHA256 combining the server seed (committed before the round) with the drand quicknet BLS signature (published on a fixed 3-second schedule). No client seed (Crash is multiplayer; all players in a round share the same crash point).

```
1. drandBytes   = hex_decode(drandSignature)         // 48-byte BLS signature
2. randomness   = drandBytes.toString('utf-8')        // lossy but deterministic
3. message      = randomness + ":0"                   // nonce always 0
4. hmac         = HMAC-SHA256(key=hex_decode(serverSeed), message)
5. value        = parseInt(hmac[0..7], 16)             // first 4 bytes as uint32
6. rawResult    = (2^32 / (value + 1)) × 0.999        // house edge 0.1%
7. crashPoint   = max(1.00, floor(rawResult × 100) / 100)
```

For any cashout target `t`, the theoretical **distribution RTP** is `P(crash ≥ t) × t ≤ 99.9%`. **Distribution edge:** flat 0.1% (factor 0.999) — no per-target scaling. This 0.1% is the pre-rakeback distribution edge audited by this repo.

## Money Model

The published RTP figures (99.9% distribution, 0.1% distribution edge) describe **the random-variable distribution of pre-rakeback payouts**. The settled money flow is different:

1. **Settled payout on a winning bet** = `full bet × cashout` (no haircut at settlement).
2. **Separately**, a flat `0.001 × bet` rakeback posts on every bet under Duel's **Zero Edge mechanism**.
3. **Net player RTP within the daily Zero Edge cap = 100.0%** (the rakeback exactly offsets the 0.1% distribution edge per bet).
4. **Above-cap behaviour** is operator-disclosed and is **NOT exercised by this audit** — once a player exceeds the cap, the rakeback no longer posts and the 0.1% distribution edge becomes the realised edge.

The dataset's `amountWon` and `effectiveEdge` fields are **transitory pre-rakeback display values** — they reflect the distribution-edge formula at settlement time, not the final money flow after rakeback credits. Step 7 verifies these display fields are internally consistent with the formula; the money model itself is documented here.

## Dataset

- **File:** `data/crash-master-1100rounds.json`
- **SHA-256:** `ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a`
- **Total rounds:** 1,100
- **Server seeds:** 1,100 unique (one per round — no epochs, no nonces)
- **drand beacons:** rounds 27,798,178 to 27,819,827
- **Phases:**
  - A — 800 rounds · $0.01/bet · 1.5× auto-cashout — baseline statistical coverage
  - B — 200 rounds · $0.01/bet · varied (1.1×, 2×, 5×, 10×) — multi-target payout validation
  - C — 100 rounds · $10.00/bet · 2× auto-cashout — high-stake bet-size invariance
- **Capture window:** 2026-04-14T20:17:12.676Z to 2026-04-15T14:21:25.365Z
- **Total wagered:** $1,010.00

## Verification

- **Verification steps:** 15 scored steps in `tests/verify.ts`
- **drand commitment timing:** 1,100/1,100 bets placed before drand publication (min margin: 0.404 s, median: 12.251 s, max: 13.779 s — authoritative transactions-API timestamp + drand chain formula)
- **Unit tests:** Mocha (`tests/**/*Tests.ts`)
- **Simulation:** 5,000,000 rounds (10 streams × 500K, Fisher's combined p = 0.5382)
- **Simulation Pass 2:** 1,100 casino seeds × 1,000 drand values per seed
- **Expected `npm test` result:** all green, 0 failures

## Reproducibility

Cloning this repo at the publication commit and running `npm install && npm test` reproduces the entire audit pipeline. The dataset hash is verified at startup; the verifier recomputes every crash point from `(serverSeed, drandSignature)`; the drand commitment timing is reproduced from the public quicknet chain formula (`publish_time = genesis + (round − 1) × 3`, `genesis = 1692803367`).
