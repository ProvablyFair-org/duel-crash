/**
 * Which ProvablyFair.org Crash profile check each scored step implements.
 *
 * WHY THIS FILE EXISTS. The framework's Crash profile (games/crash/profile.json, CRASH-01 … CRASH-30,
 * 1.0.3 — approved 2026-10-14, Methodology v1.1 D6) declares the checks. This suite scores 18 steps
 * under its own numbering, which every chapter cites by number and which therefore cannot be
 * renumbered to match. The mapping is declared here, emitted into `outputs/verification-results.json`
 * beside the step results, and read back by `pf-audit matrix`, which prints the conformance matrix and
 * exits 1 when a HARD_FAIL check has nothing implementing it. Ported from the Duel Dice package's
 * src/profile-map.ts, 2026-09-26.
 *
 * THIS FILE LABELS; IT DOES NOT CHECK. Nothing here can make a step pass or fail. An id claimed for a
 * step the step does not implement is a false statement in a published artifact, so the rule is the
 * profile's own `asserts` text: claim the check only if the step's assertion actually decides it. The
 * mapping was written by reading the step code as it stands on 2026-09-26.
 *
 * COVERAGE DESCRIBES THE PACKAGE, NOT THE STEP.
 *   full    — nothing the profile's `asserts` requires is unimplemented; where a check is split
 *             across several steps each says `full` and its note says which part it carries.
 *   partial — something the profile requires is implemented nowhere in this package, and the note
 *             says what. `partial` is a disclosure, never a softer word for `full`.
 * A check no step claims is absent from the matrix by construction: that is the point.
 */

export type Coverage = 'full' | 'partial';

export interface CheckClaim {
  id: string;
  coverage: Coverage;
  /** For `partial`: what the profile requires that this package does not do. */
  note?: string;
}

export interface StepClaims {
  claims: CheckClaim[];
  /** Required when `claims` is empty: why the step answers no profile check. */
  reason?: string;
}

export const PROFILE_GAME = 'crash';
export const PROFILE_VERSION = '1.0.3';

const CRASH_17_NOTE = 'CRASH-17 is carried by four steps: Step 2 (every bet accepted strictly before its drand beacon was '
  + 'published — 1,100/1,100 margins positive, min 0.404 s — bound to the population, with the capture\'s stored margin '
  + 'cross-checked), Step 3 (beacon rounds strictly increasing, 1,099 transitions bound to the population: no beacon '
  + 're-used or out of order), Step 11 (each beacon\'s publication time from the quicknet chain formula genesis + (round − 1) × 3, not a '
  + 'captured clock) and Step 15 (each round\'s drand signature bound to exactly one pinned api.drand.sh record for the '
  + 'same beacon round, the file\'s own counters recomputed). PARTIAL for one reason: the commit side of the margin is '
  + 'OPERATOR-REPORTED. betPlacedAt is Duel\'s own transactions-API timestamp_raw (a clock the operator controls), and it '
  + 'times the BET, not the moment the round\'s serverSeedHash was shown: the capture stores the hash from the '
  + 'crash_hashed_pf / crash_bet_placed / pending_drand socket events (capture/crash-capture.reference.js:153-195) with no receipt '
  + 'time, so that the commitment preceded the beacon is not measured from a clock the operator does not control. '
  + 'Disclosed as MANIFEST DL-2 and an ASSUMED premise; no step or verdict changed';

/** Scored step number → the profile checks it implements. Every step 1..18 has an entry. */
export const STEP_CLAIMS: Record<number, StepClaims> = {
  1: { claims: [{ id: 'CRASH-01', coverage: 'full',
    note: 'per-round commitment design: every one of the 1,100 rounds opened — SHA-256(hex_decode(serverSeed)) = '
      + 'serverSeedHash — the count of commitments opened bound to EXPECTED_ROUNDS in src/loader.ts; an unopened '
      + 'commitment is counted and fails the step' }] },
  2: { claims: [{ id: 'CRASH-17', coverage: 'partial', note: `commit-timing part. ${CRASH_17_NOTE}` }] },
  3: { claims: [
    { id: 'CRASH-17', coverage: 'partial', note: `beacon-order part. ${CRASH_17_NOTE}` },
    { id: 'CRASH-04', coverage: 'full',
      note: 'the round-sequence key of this design is the drand beacon round: strictly increasing in capture order over '
        + 'EXPECTED_DRAND_TRANSITIONS = 1,099 transitions (a repeat or reorder fails); the declared constant nonce 0 is '
        + 'carried by every round\'s message, witnessed by Step 5\'s exact recomputation (the message is "<drand>:0")' },
  ] },
  4: { claims: [{ id: 'CRASH-03', coverage: 'full',
    note: 'per-round design: 1,100 distinct server seeds AND 1,100 distinct commitment hashes, both compared with '
      + 'EXPECTED_DISTINCT_SEEDS in src/loader.ts rather than with the array length — one commitment per round, none reused' }] },
  5: { claims: [
    { id: 'CRASH-07', coverage: 'full',
      note: '1,100/1,100 served crash points recomputed by exact equality (no tolerance) and the matched count bound to '
        + 'EXPECTED_ROUNDS — a skipped or shortened dataset fails' },
    { id: 'CRASH-10', coverage: 'partial',
      note: 'grid-and-range part: every RECORDED crash point is asserted in its own right to be a whole number of hundredths '
        + 'at or above the declared floor 1.00 (integer hundredths via crashCents; 0 off-grid). PARTIAL: the capture stored '
        + 'floor(served multiplier × 100) / 100 (capture/crash-capture.reference.js:172), so the grid half cannot fail on a '
        + 'dataset that capture wrote and does not show whether the server sends 2-dp values; the floor half can fail (M05b). '
        + 'No cap is declared: the upper end is the map maximum (CRASH-14). The win rule and its boundary are Step 7; P(1.00) '
        + 'is Step 12' },
    { id: 'CRASH-14', coverage: 'partial',
      note: 'cap half n/a WITH EVIDENCE (rule R2): no cap on the served crash point is declared or observed; the step prints the largest served crash point '
        + '(13,664.99×) and the map maximum at v = 0 (4,290,672,328.7×, from the independent per-value model) and fails a '
        + 'served value above it. PARTIAL: the target-bounds half has nothing to check against — Duel declares no minimum or '
        + 'maximum cash-out target in the package (declaration unknowns), so "every target within the declared min/max" is '
        + 'unestablished. Payout cap: Duel cashes out every bet at 9,999.999× at most, whatever target is set ('
        + 'Duel\'s statement as relayed by Mike in Slack on 21 October 2026: auto cash-out at 9999.999x; no captured bet reached it); that caps the payout, not the served crash point (round 831375 was served 13,664.99×, '
        + 'its captured bet having cashed out at 2×). The RTP table (CRASH-19) applies it' },
    { id: 'CRASH-24', coverage: 'full',
      note: 'HASH-MATCHED AND EXECUTED, two player verifiers (ported from Duel Dice 2026-09-26). (1) DOCS SITE: VerifyBets '
        + 'games/crash/derive.js + lib/hmac-sha256.js read with git cat-file from mikepforg/pf-audit-duel origin/main @ '
        + 'bd4d59c (derive.js last changed 4aaa1b2), vendored under verifier-parity/ with both SHA-256 pinned in '
        + 'src/site-verifier.ts (d6099cd7…, bc30bfe9…); Step 5 FAILs unless the copies hash to the pins, then runs the '
        + 'site\'s own deriveCrashSync on all 1,100 rounds (bound to EXPECTED_ROUNDS) and FAILs on any crash point that '
        + 'differs from the served one or src/rng.ts, as integer hundredths. (2) LIVE SITE: the three '
        + 'www.provablyfair.org/verify-bets chunks the Duel path needs (copied byte for byte from the Duel Dice package, '
        + 'which recorded them from GETs of 2026-09-25) plus a runner ported for Crash, all four pinned in '
        + 'src/live-site-verifier.ts; the site\'s own VERIFY → verifyDuelsGame → [CRASH] method is executed on all 1,100 '
        + 'rounds and its printed crash point must equal the served one and src/rng.ts and its printed server-seed hash '
        + 'the served commitment. scripts/check-site-verifier.mjs / check-live-site-verifier.mjs re-check a site checkout / '
        + 'the live deploy against the pins at release time (the --live GET was not run in this round). FAIL probed by the '
        + 'mutation battery (tests/mutations.json M05c–M05f)' },
  ] },
  6: { claims: [{ id: 'CRASH-12', coverage: 'full',
    note: '100/100 Phase C rounds recompute identically (floor ≥ 100 met); Phase C is played at the declared elevated stake '
      + '$10 on the declared target 2×, the same target the declared 49 base-stake ($0.01) rounds play — plan in '
      + 'src/loader.ts, so stake is the only variable that moves; the 49 elevated-stake wins are counted and printed, and '
      + 'every elevated-stake and base-stake win settles at one identical per-unit return, compared as exact integer '
      + 'cross-products on the 6-dp grid (the two stakes against each other, no rule assumed)' }] },
  7: { claims: [
    { id: 'CRASH-11', coverage: 'partial',
      note: 'what IS asserted: 671/671 wins satisfy amountWon = amount × cashout × (1 − 0.1 %) EXACTLY in integer 6-dp grid '
        + 'units (no float, no tolerance), 429/429 losses record 0, the multiplier is the cash-out target, and the count of '
        + 'wins equal to amount × cashout (0/671) is recorded. PARTIAL because the profile requires a settlement rule that '
        + 'is published or operator-sourced, not fitted to the rows it is checked against, and the field this step scores is '
        + 'not the settlement: amountWon as captured carries ×0.999, while the wallet ledger looked up on 2026-09-29 credits the '
        + 'full amount × cashout on 3/3 wins (evidence/wallet-legs-2026-09-29.json; MANIFEST Money Model, DL-1). The credited '
        + 'amount is witnessed on that sample, outside the dataset this step scores' },
    { id: 'CRASH-10', coverage: 'full',
      note: 'win-rule part: isWin = (crashPoint ≥ auto_cashout) on 1,100/1,100 rounds, and the boundary is WITNESSED in the '
        + 'data and counted in the step — 4 ties (crash == target, all at 1.5×) settled as wins and 4 rounds one hundredth '
        + 'below the target settled as losses, which discriminates ≥ from >' },
    { id: 'CRASH-13', coverage: 'full',
      note: 'the expected payout uses the DECLARED edge (src/loader.ts DECLARED_EDGE_PERCENT = 0.1) and the served '
        + 'effectiveEdge field is only COMPARED with it on every round (1,100/1,100 equal; a differing field fails the '
        + 'step) — until 2026-09-26 the step read effectiveEdge into the expected payout. The crash formula\'s 0.999 is a '
        + 'constant in src/rng.ts (Steps 5, 8, 12); the payout multiplier is the cash-out target. Origin declared as '
        + 'operator-config-and-capture (the served effectiveEdge + 1,100/1,100 recomputation); no Duel-published formula '
        + 'text is vendored in the package' },
  ] },
  8: { claims: [{ id: 'CRASH-19', coverage: 'full',
    note: 'spot part: RTP at 2×, 10× and 100× from the uint32 threshold, each at or below 0.999 decided in integers; the '
      + 'full two-sided enumeration over the 0.01 grid is Step 16' }] },
  9: { claims: [{ id: 'CRASH-05', coverage: 'full',
    note: 'rounds (1,100) and per-phase counts (A 800 / B 200 / C 100) against the code constants in src/loader.ts, not the '
      + 'dataset header; seeds (1,100) are bound by Steps 1 and 4 and the beacon transitions (1,099) by Step 3. No epoch '
      + 'size exists in this design: the crash form of the shape assertion is one commitment per round (Step 4)' }] },
  10: { claims: [{ id: 'CRASH-26', coverage: 'full',
    note: 'the dataset SHA-256 equals the pin in src/loader.ts, checked in the tests/verify.ts pre-flight (process exits 1 '
      + 'before any step runs; the pin cannot be emptied — fail-open removed) and recorded here. The game has no separate '
      + 'config file the derivation reads' }] },
  11: { claims: [{ id: 'CRASH-17', coverage: 'partial', note: `publication-time part. ${CRASH_17_NOTE}` }] },
  12: { claims: [
    { id: 'CRASH-18', coverage: 'full',
      note: 'an independent per-value model (tests/steps/crash-model.ts — not the closed form) is bound to all 1,100 live '
        + 'rounds by its own HMAC, then the uint32 values reaching each of 11 targets are COUNTED from it and must equal '
        + 'src/rng.ts\'s survival × 2^32 exactly; no operator probability field exists or is read; NEGATIVE CONTROLS: '
        + 'every live crash point moved by 0.01 is rejected by the binding predicate, and the same counting run on a map '
        + 'mis-wired to edge factor 0.998 disagrees with src/rng.ts (11/11 targets) — both comparisons shown able to fail' },
    { id: 'CRASH-10', coverage: 'full',
      note: 'instant-crash part: P(crash = 1.00) = 1 − count(1.01)/2^32 counted from the independent model, equal to '
        + 'src/rng.ts instantCrashProbability() exactly, printed in the step data' },
  ] },
  13: { claims: [{ id: 'CRASH-20', coverage: 'full',
    note: '5,000,000 rounds (10 streams × 500,000) on HMAC-derived pinned seeds, REPLAYED in verify from those seeds — '
      + 'per-stream chi-squared against the exact survival law combined by Fisher, lag-1 and runs, simulated RTP within 5σ '
      + 'of the formula at 5 targets (1.5×–50×); every committed scalar compared with the replay (integers exact, floats at '
      + 'the reproduction tolerance) and the verdict taken from the replay; the artifact is pinned (Step 17) and carries '
      + 'no run metadata' }] },
  14: { claims: [{ id: 'CRASH-21', coverage: 'full',
    note: 'all 1,100 revealed server seeds × 10,000 drand values each (the profile floor), REPLAYED in verify at the cash-out '
      + 'target each round was actually played at, and every captured round recomputed from its revealed seed and real beacon '
      + '(1,100/1,100 reproduce the served crash point). Pre-registered rule (tests/steps/sim-replay.ts, 2026-09-26): FAIL if '
      + '(1) the unit-stake return of the played targets against its EXACT mean Σ N·t·p(t) and variance Σ N·t²·p(1−p) '
      + '(p = src/rng.ts survivalProbability, proven equal to the uint32 count by Step 12), or (2) the rank-sum of each '
      + 'captured round among its own seed\'s 10,000 reference draws — an EXACT permutation null, the captured beacon being '
      + 'exchangeable with the reference under no cherry-pick — is below z = −3.291 (one-sided α 0.0005 each, family 0.001). '
      + 'Measured: return z 0.286, rank-sum z 0.160. Detection power printed (≥ 50 %): turning ≥ 7.5 % of would-be winning '
      + 'captured rounds into losses, or a ≥ 0.10 % relative RTP shortfall. Committed scalars compared with the replay. '
      + 'Replaced the chi-squared fail count (MANIFEST DL-3, resolved)' }] },
  15: { claims: [{ id: 'CRASH-17', coverage: 'partial', note: `source-binding part. ${CRASH_17_NOTE}` }] },
  16: { claims: [
    { id: 'CRASH-15', coverage: 'full',
      note: 'all 5 declared cash-out targets (src/loader.ts EXPECTED_CASHOUT_TARGETS) held to the 45-round floor, an '
        + 'undeclared target in the data fails, and the claim that never-played targets carry no unverified return rests on '
        + 'the exact enumeration below, not on prose' },
    { id: 'CRASH-08', coverage: 'full',
      note: 'the draw is monotone in one uint32; at EVERY 0.01 cash-out point from 1.01× to 100,000× (9,999,900 points; bound '
        + 'and its reason stated in src/loader.ts RTP_GRID_MAX) the uint32 '
        + 'values reaching it are counted from the independent model and 0 ≤ 0.999 − RTP < x/2^32 is decided in integers, '
        + 'i.e. the survival probability is within one uint32 value (2^-32) of 0.999/x; 0 above, 0 below by a whole value. '
        + 'Beyond 100,000× not enumerated; every target from 10,000.00× up is scored at Duel\'s stated 9,999.999× cap (CRASH-19)' },
    { id: 'CRASH-19', coverage: 'full',
      note: 'the per-target effective edge over the same 9,999,900-point grid, both sides of the claimed 0.1 %, exact; '
        + 'the distribution RTP only — settlement and the Zero Edge rakeback are stated separately in MANIFEST Money Model '
        + '(the full amount × cashout credited on the 3 wins looked up, DL-1). Since 21 Oct 2026 the RTP table applies '
        + 'Duel\'s auto-cash-out cap (every bet cashes out at 9,999.999× at most, Duel\'s statement as relayed by Mike in Slack on 21 October 2026: auto cash-out at 9999.999x; no captured bet reached it): every '
        + 'target from 10,000.00× up is scored at Duel\'s stated cap, RTP 99.899936 %, so the table covers every target a player can set; '
        + 'the lowest RTP of any target is 99.899768 % (9,999.05×)' },
  ] },
  17: { claims: [{ id: 'CRASH-27', coverage: 'full',
    note: 'the three artifacts of record (drand-api-verification.json, rtp-convergence.html, simulation-results.json) match '
      + 'their SHA-256 pins in src/artifact-pins.ts (absent or altered = FAIL), each is un-ignored by name in .gitignore, none '
      + 'carries run metadata, verify writes only to outputs/run/ unless PF_EMIT=1, the derived statistics are held at the '
      + 'reproduction tolerance (tests/verify.ts diff, Steps 13–14 replay), and — added 2026-09-26, ported from Duel Dice — '
      + 'every numeric leaf of the two committed JSON artifacts is validated against a value domain in src/domains.ts '
      + '(bounds from src/loader.ts and the simulation plan, never from the artifact) in both directions: inside its domain, '
      + 'and covered by a rule. FAIL probed (M17c: an impossible χ² fail count written and re-pinned)' }] },
  18: { claims: [{ id: 'CRASH-22', coverage: 'full',
    note: 'the 1,100 live rounds\' recomputed leading uint32 values are fitted to uniform (χ², 20 bins) and tested for serial '
      + 'dependence in capture order (lag-1 z, runs); a deviation turns the step to INFO — informational (profile policy '
      + 'INFORMATIONAL, Mike 2026-09-29): reported, never counted as a flag, never a FAIL, verdict unchanged. Probed as an '
      + 'INFO (M18: the sample sorted before the test)' }] },
};

/**
 * Checks this casino's design makes inapplicable. Each is the result of evaluating the profile check's
 * `applies` predicate against declarations/duel.crash.json, and each reason says what witnesses it.
 */
export const NOT_APPLICABLE: Array<{ id: string; reason: string }> = [
  {
    id: 'CRASH-02',
    reason: 'applies = { commitment.chain.present, eq: true }; declared false — Duel Crash commits one fresh server seed per '
      + 'round: the dataset carries no chain-position or terminal field, and the 1,100 rounds carry 1,100 distinct seeds and '
      + '1,100 distinct commitments (Step 4). There is no chain to link or fold',
  },
  {
    id: 'CRASH-06',
    reason: 'applies = { rng.clientSeed.inMessage, eq: true }; declared false — Crash is multiplayer, the message is '
      + '"<utf8(hex_decode(drandRandomness))>:0" with no client seed, the dataset carries no client-seed field, and all 1,100 '
      + 'rounds recompute from that message (Step 5)',
  },
  {
    id: 'CRASH-16',
    reason: 'applies = { money.balanceField, notNull: true }; declared null — no round record carries a balance, balance delta '
      + 'or wallet-credit field (MANIFEST Money Model lists the fields). Wallet legs for six captured bets were looked up separately on 2026-09-29 '
      + '(evidence/wallet-legs-*.json, DL-1) and are not part of the dataset of record',
  },
];

/**
 * Checks a package artifact answers rather than a scored step. `none` means the artifact does not
 * exist — recorded so the gap is machine-readable instead of merely absent.
 */
export const PACKAGE_CHECKS: Array<{ id: string; artifact: string; coverage: Coverage | 'none'; note: string }> = [
  {
    id: 'CRASH-09',
    artifact: 'docs/ALGORITHM.md + tests/crash/RngSpecTests.ts + tests/crash/crashTests.ts (Second check block) + src/operator-verifier.ts + Step 5',
    coverage: 'full',
    note: 'REWRITTEN 2026-10-20 (v1.2.0). src/rng.ts is rebuilt from a written specification, docs/ALGORITHM.md '
      + '(framework games/crash/ALGORITHM.md, SHA-256 d487ca48…), by an implementer who never opened Duel\'s code; Duel\'s '
      + 'published Verify-tab code is run as a second check, not used as the source. Through v1.1.0 src/rng.ts was a port '
      + 'of that code and cited 10 of its lines (OPERATOR_SOURCE_CITES); the port and the citation table are gone. Duel\'s own '
      + 'Crash Verify-tab code, pasted by Paulo from duel.com Verify tab 2026-09-26, is vendored verbatim at '
      + 'evidence/verify-tab/duel-verify-tab-crash-2026-09-26.js (E16, SHA-256 c699cd54…, never edited) and pinned with its runner in '
      + 'src/operator-verifier.ts. The asserts: (1) "unit tests reproduce at least one captured round … against the operator\'s '
      + 'published algorithm" — the Second check block in tests/crash/crashTests.ts EXECUTES the pinned file with only its two "User '
      + 'input values" filled in (drandSeed = the captured drandRandomness hex, serverSeed) on all 1,100 captured rounds: its displayed '
      + 'crash point floor(x·100) equals the served crash point and src/rng.ts computeCrashPoint exactly on 1,100/1,100. The unfloored '
      + 'double is reported as information only, not scored: bit-identical to src/rng.ts computeCrashPointRaw on 824/1,100, largest '
      + 'relative difference 2.21e-16 on the other 276, from rounding order (Duel\'s (2^32/(u+1))·(1−0.001) rounds twice, src/rng.ts '
      + '0.999·2^32/(u+1) once); of the 276, src/rng.ts is nearer the exact value 999·2^32/(1000·(u+1)) on 270 and Duel\'s on 6 '
      + '(Step 5 re-measures these counts; through v1.1.0 the unfloored value was bit-identical on 1,100/1,100 because src/rng.ts '
      + 'used Duel\'s expression); (2) "fixed vectors" — two known rounds (2.81, 1.02) through the same file, and '
      + 'tests/crash/RngSpecTests.ts runs the spec\'s own vectors and properties against src/rng.ts (87/87); (3) "the adapter cites the '
      + 'operator source line it ports" — superseded for this package by the 20 Oct 2026 rule that RNG code is rebuilt from a written '
      + 'spec: nothing is ported, so no operator line is cited; docs/ALGORITHM.md §4 names the source of every step instead (Duel\'s '
      + 'public pages, the standard construction, the 1,100 live rounds, or black-box readings of Duel\'s Verify page). Step 5 runs the '
      + 'same execution in the verifier. The operator code applies one 0.1 % (houseEdge 0.001, L63) to the crash point, as the spec '
      + 'does; it says nothing about settlement (MANIFEST Money Model, DL-1). FAIL probed: M05g (a line of the file changed AND '
      + 're-pinned), M05h (file byte, no re-pin), M05i (runner byte, no re-pin), M05j (runner forged AND re-pinned). Not established: '
      + 'that the Verify button, or Duel\'s server, runs exactly this code',
  },
  {
    id: 'CRASH-23', artifact: 'MANIFEST.md#verification-results', coverage: 'full',
    note: 'MANIFEST Verification results carries the standardized matrix between the S5-MATRIX:START/END markers with the framework IDs '
      + 'S5-1 … S5-8: six rows Pass (S5-1, S5-3, S5-4, S5-6, S5-7, S5-8) and two Not applicable — disclosed (S5-2, S5-5), '
      + 'each tied to a scored step or the capture; the package\'s own '
      + 'S1–S10 categories follow it unchanged',
  },
  {
    id: 'CRASH-25', artifact: 'MANIFEST.md#verify-a-bet + README.md pointer', coverage: 'full',
    note: 'an ordered five-step paste path in the dataset\'s and the Provably Fair panel\'s field names: where the seed and '
      + 'the beacon are revealed, the commitment encoding SHA-256(hex_decode(serverSeed)) = serverSeedHash, the beacon '
      + 'check (quicknet round, publication time from the chain formula after the bet), the crash-point formula with its '
      + '2-dp floor, 1.00 floor and no cap, and the cash-out rule crash ≥ target with the tie witnessed',
  },
  {
    id: 'CRASH-28', artifact: 'package.json + tests/verify.ts + src/simulate.ts', coverage: 'full',
    note: 'npm test = mocha + verify (no simulate) and writes only to outputs/run/; npm run test:full regenerates the '
      + 'simulation into outputs/run/ and verify field-diffs it against the pinned artifact at 1e-14 abs + 1e-12 rel, '
      + 'recording the diff and the runtime in outputs/run/diff.json (added 2026-09-26); engines Node 22.x + .nvmrc; audit ID '
      + 'PF-2026-DL05 assigned; step counts in README / MANIFEST / tests/verify.ts equal the suite (18); the fresh-clone run of '
      + '2026-09-26 is recorded in MANIFEST.md#reproduce-the-audit',
  },
  {
    id: 'CRASH-29', artifact: 'tests/mutations.json + scripts/mutate.mjs', coverage: 'full',
    note: 'a step-named mutation registry runs in a disposable copy via `npm run mutate`; every scored step has at least one '
      + 'mutation that kills it (the runner reads the scored steps from its own baseline run), each entry carries an '
      + '`expect` marker so the intended step fires, and re-pin forgeries are included (dataset and artifact re-pinned '
      + 'after the edit; added 2026-09-26: Duel\'s Verify-tab code and its runner forged AND re-pinned, M05g and M05j, with '
      + 'M05h and M05i; M05k, which broke a src/rng.ts citation, was retired on 20 Oct 2026 with the citation table, and M08 '
      + 'was re-anchored on the rebuilt module\'s edge constant). No declared survivors',
  },
  {
    id: 'CRASH-30', artifact: 'MANIFEST.md#limitations-and-trust + MANIFEST.md#evidence', coverage: 'full',
    note: 'MANIFEST.md carries the declared-limitations register (DL-1 …) with measured magnitude and closure evidence, and '
      + 'the Load-Bearing Premises table with the "could the captured data contradict it?" column and ASSUMED markers; '
      + 'MANIFEST Evidence numbers every exhibit from E01; no internal QA material ships in the package',
  },
];

/** The block emitted alongside the step results. */
export function profileCoverageBlock(): Record<string, unknown> {
  return {
    game: PROFILE_GAME,
    profileVersion: PROFILE_VERSION,
    notApplicable: NOT_APPLICABLE,
    packageChecks: PACKAGE_CHECKS,
  };
}

/** The label fields for one scored step, to be merged into its emitted record. */
export function labelFor(step: number): Record<string, unknown> {
  const entry = STEP_CLAIMS[step];
  if (!entry) return { profileIds: [], profileChecks: [], profileNote: 'no mapping declared for this step' };
  return entry.claims.length
    ? { profileIds: entry.claims.map(c => c.id), profileChecks: entry.claims }
    : { profileIds: [], profileChecks: [], profileNote: entry.reason ?? 'no reason given' };
}
