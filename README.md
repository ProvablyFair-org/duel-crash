# Duel Crash — Verifier

Independent verifier for the ProvablyFair.org audit of **Duel.com Crash**.

- **Audit report:** https://audit.provablyfair.org/casino/duel/games/crash/overview
- **Audit ID:** PF-2026-DL05
- **Audited:** April 2026
- **Algorithm:** HMAC-SHA256 + drand quicknet (external randomness beacon)

## What's in this repo

This is the verification codebase. It re-derives every audited crash point from the captured dataset, the published algorithm, and the drand chain. The full audit report — methodology, evidence, findings, recommendations — lives on the docusaurus page linked above.

## Reproduce

```sh
git clone git@github.com:ProvablyFair-org/duel-crash.git
cd duel-crash
npm install
npm test           # unit tests + simulation + verification (16 scored steps)
```

The repo ships `outputs/drand-api-verification.json` pre-computed (1,100 drand BLS signatures matched byte-for-byte against the public quicknet API at `api.drand.sh`), so `npm test` works **offline**. Expected: 16/16 PASS, **PROVABLY FAIR — Full Pass**.

To regenerate the drand verification artifact from scratch (requires internet, fetches all 1,100 signatures from `api.drand.sh`):

```sh
npm run timing
```

Individual scripts:

```sh
npm run timing     # drand chain formula + bet-placement margin + drand API signature verification (network)
npm run simulate   # 5M-round multi-stream simulation (10 × 500K, Fisher's method)
npm run verify     # 15-step verification of the captured dataset
```

## Dataset

- **File:** `data/crash-master-1100rounds.json`
- **SHA-256:** `ea62337a8665842ad33341a7d1b435d0c986f9feb3b03609cb0b0c868f3ef58a`
- **Rounds:** 1,100 across three capture phases (A: 800 @ 1.5×, B: 200 varied, C: 100 @ 2× / $10 stake)
- **drand range:** rounds 27,798,178 to 27,819,827

The verifier confirms the dataset hash before running any checks. Tampering with the dataset causes `npm test` to fail at startup.

## License

MIT
