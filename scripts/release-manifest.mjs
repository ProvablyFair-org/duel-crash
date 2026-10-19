#!/usr/bin/env node
/**
 * Duel Crash — generator for RELEASE-MANIFEST.json.
 *
 * Same generator as games/plinko/scripts/release-manifest.mjs, adapted only in its paths and declared
 * facts. NOTHING MEASURABLE IS TYPED: artifact hashes are computed from the bytes on disk; the verdict
 * and scored counts are read out of outputs/verification-results.json; the capture window comes from
 * the dataset itself. What stays typed is the set of facts no file supplies (the audit's identity, the
 * release, the environment, the last mutation-battery result, measured wall time) — those are DECLARED,
 * and a change to one is a visible source edit.
 *
 * Usage:
 *   node scripts/release-manifest.mjs            write RELEASE-MANIFEST.json
 *   node scripts/release-manifest.mjs --check     exit 1 if the committed file is stale or missing
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'RELEASE-MANIFEST.json');
const CHECK = process.argv.includes('--check');

/** The facts no file in this package can supply. `signature` stays null until actually signed. */
const DECLARED = {
  auditId: 'PF-2026-DL05',
  game: 'crash',
  casino: 'duel',
  release: 'v1.1.0',
  framework: '1.1',
  environmentHost: 'duel.com',
  environmentStage: 'production',
  environmentQualifier: null,
  supersedes: 'v1.0.0',
  signature: 'SHA256:gEujiJm2pRyq7lQsfYQfQ1r97H/J7GdaKHbOW8GtikY',
  pending: 'supersedes is the latest tag read from ProvablyFair-org/duel-crash on 2026-10-19 (v1.0.0, which points at commit 7350abd of 2026-09-14, not at the 2026-06-04 publication f97d5b8).',
};

/** How Pass 1 is seeded and attested — described as the package declares it (its src/ and MANIFEST.md). */
const SIMULATION = {
  seeding: 'pinned',
  seedSource: 'src/simulate.ts deterministicHex (HMAC-SHA256 streams pass1-server-stream-<s>, pass1-drand-stream-<s>, pass2-drand-<s>)',
  attestation: 'Steps 13-14 replay both passes from their seeds on every npm test and score the replay, not the file; npm run test:full regenerates the artifact into outputs/run/ and field-diffs it against the committed copy at the reproduction tolerance (outputs/run/diff.json)',
};

/** The dataset of record; its sha256 is also listed under artifacts. */
const DATASET = 'data/crash-master-1100rounds.json';

/** Every file whose bytes the release is a claim about: the dataset, the pinned config (if any) and
 * every artifact src/artifact-pins.ts pins. Order is the manifest's order. */
const ARTIFACTS = [
  DATASET,
  'outputs/drand-api-verification.json',
  'outputs/simulation-results.json',
  'outputs/rtp-convergence.html',
  'outputs/verification-results.json',
  'outputs/rtp-claim-table.json',   // RTP-CLAIM per-setting table (src/rtp-settings.ts pins it)
];

/** The capture window, read from the dataset's own fields (never typed). */
function captureWindow(dataset) {
  const meta = dataset?.meta ?? {};
  return { from: meta.createdAt ?? null, to: meta.completedAt ?? null };
}

/** The falsifiability battery. `mutations` is computed from the registry; the RUN RESULT is DECLARED
 * from the last completed `npm run mutate` (cite it in `source`) and must be refreshed by re-running
 * the battery — a generator never asserts a kill it did not run. null = not run for this manifest. */
const FALSIFIABILITY_DECLARED = { killed: 44, declaredSurvivors: 0, source: 'npm run mutate 2026-10-14 evening (Apple M2 Max, 12 cores, node v22.23.1), the whole registry (44 entries) in one run on the tree carrying the FIXPASS2 C3 entries (baseline verify exit 0, mocha exit 0): 44/44 mutations killed; the 44 kills cover 18/18 scored steps; 2026-10-15 --only M16, MC3: 6/6 killed, MC3a/MC3b exit 5' };

/** How long `npm test` takes, and on what — a property of the machine, so DECLARED from measured runs. */
const RUNTIME = {
  command: 'npm test',
  measured: [
    { date: '2026-09-28', machine: 'Apple M2 Max', cores: 12, node: '22.23.1', wallSeconds: 78, by: 'time npm test' },
  ],
};

const AUDIT_ID_DOCS = ['README.md', 'MANIFEST.md'];

const problems = [];
const fail = (m) => problems.push(m);
const abs = (rel) => path.join(ROOT, rel);
const sha256 = (rel) => { const a = abs(rel); if (!fs.existsSync(a)) { fail(`${rel} is missing`); return null; } return createHash('sha256').update(fs.readFileSync(a)).digest('hex'); };
const readJson = (rel) => { const a = abs(rel); if (!fs.existsSync(a)) { fail(`${rel} is missing`); return null; } try { return JSON.parse(fs.readFileSync(a, 'utf8')); } catch (e) { fail(`${rel} invalid JSON: ${e.message}`); return null; } };

const results = readJson('outputs/verification-results.json');
const dataset = readJson(DATASET);
const mutations = fs.existsSync(abs('tests/mutations.json')) ? readJson('tests/mutations.json') : null;

const artifacts = {};
for (const rel of ARTIFACTS) { const h = sha256(rel); if (h) artifacts[rel] = h; }

// One summary shape across the Duel packages (Mike 2026-09-28, F20):
// { passed, flags, operatorFlags, captureFlags, hardFail, verdict }.
const summary = results?.summary ?? {};
const verdict = summary.verdict;
const scored = {
  passed: summary.passed,
  flags: summary.flags,
  operatorFlags: summary.operatorFlags,
  captureFlags: summary.captureFlags,
  hardFail: summary.hardFail,
};
for (const k of Object.keys(scored)) if (typeof scored[k] !== 'number') fail(`verification-results.json summary.${k} is not a number — the summary is not in the one Duel shape`);
scored.of = [scored.passed, scored.flags, scored.hardFail].every((n) => typeof n === 'number') ? scored.passed + scored.flags + scored.hardFail : undefined;
if (typeof verdict !== 'string' || !verdict) fail('verification-results.json has no summary.verdict — run npm test first');
if (scored.hardFail !== 0) fail(`the committed run has hardFail=${scored.hardFail} — a release manifest may only describe a run with no hard failures`);
if (typeof scored.flags === 'number' && scored.flags !== scored.operatorFlags + scored.captureFlags) fail(`summary.flags ${scored.flags} != operatorFlags + captureFlags`);

const capturedAt = captureWindow(dataset);
if (!capturedAt.from || !capturedAt.to) fail('the dataset does not yield a capture window (from / to)');

if (DECLARED.auditId) {
  for (const doc of AUDIT_ID_DOCS) { const a = abs(doc); if (!fs.existsSync(a)) { fail(`${doc} is missing`); continue; } if (!fs.readFileSync(a, 'utf8').includes(DECLARED.auditId)) fail(`${doc} does not carry the declared audit ID ${DECLARED.auditId}`); }
}
if (!fs.existsSync(abs('LICENSE'))) fail('LICENSE is missing');

const manifest = {
  auditId: DECLARED.auditId,
  game: DECLARED.game,
  casino: DECLARED.casino,
  release: DECLARED.release,
  framework: DECLARED.framework,
  simulation: SIMULATION,
  runtime: RUNTIME,
  datasetSha256: artifacts[DATASET] ?? null,
  artifacts,
  verdict,
  scored,
  capturedAt,
  environment: { host: DECLARED.environmentHost, stage: DECLARED.environmentStage, qualifier: DECLARED.environmentQualifier },
  supersedes: DECLARED.supersedes,
  signature: DECLARED.signature,
  falsifiability: {
    registry: mutations ? 'tests/mutations.json' : null,
    runner: fs.existsSync(abs('scripts/mutate.mjs')) ? 'scripts/mutate.mjs' : null,
    mutations: Array.isArray(mutations) ? mutations.length : (Array.isArray(mutations?.mutations) ? mutations.mutations.length : null),
    killed: FALSIFIABILITY_DECLARED.killed,
    declaredSurvivors: FALSIFIABILITY_DECLARED.declaredSurvivors,
    source: FALSIFIABILITY_DECLARED.source,
  },
  pending: DECLARED.pending,
};

if (problems.length) { console.error('  [release-manifest] cannot produce a manifest:'); for (const p of problems) console.error(`    - ${p}`); process.exit(1); }

const rendered = `${JSON.stringify(manifest, null, 2)}\n`;

if (CHECK) {
  if (!fs.existsSync(MANIFEST_PATH)) { console.error('  [release-manifest] RELEASE-MANIFEST.json missing — run npm run release-manifest'); process.exit(1); }
  if (fs.readFileSync(MANIFEST_PATH, 'utf8') !== rendered) { console.error('  [release-manifest] RELEASE-MANIFEST.json is STALE — regenerate with npm run release-manifest'); process.exit(1); }
  console.log(`  [release-manifest] OK: ${Object.keys(artifacts).length} artifact hashes match disk, verdict "${verdict}", scored ${scored.passed}/${scored.of} (flags ${scored.flags})`);
  process.exit(0);
}
fs.writeFileSync(MANIFEST_PATH, rendered);
console.log(`  [release-manifest] wrote RELEASE-MANIFEST.json — ${Object.keys(artifacts).length} artifacts, verdict "${verdict}", scored ${scored.passed}/${scored.of} (flags ${scored.flags})`);
