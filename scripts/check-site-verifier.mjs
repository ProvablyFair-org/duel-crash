#!/usr/bin/env node
/**
 * Is the ProvablyFair.org site's Crash verifier still the code this package vendored and proved?
 *
 *   node scripts/check-site-verifier.mjs <path-to-site>/src/components/VerifyBets/games/crash/derive.js
 *   node scripts/check-site-verifier.mjs --live       the LIVE www.provablyfair.org/verify-bets bundle:
 *                                                    delegates to scripts/check-live-site-verifier.mjs,
 *                                                    which GETs the page and each pinned chunk and
 *                                                    compares them with src/live-site-verifier.ts pins
 *
 * Hashes the given derive.js and every file it imports (resolved relative to it, `.js` appended to
 * an extensionless specifier, as the site's bundler does), and compares each with the pin in
 * src/site-verifier.ts SITE_VERIFIER_PINS — read from that file, so the pins have one home. Step 5
 * proves the VENDORED copy derives every captured crash point; this script proves the LIVE checkout is
 * that copy. Exit 0 only if the import set is the pinned one and every hash matches; exit 1 on any
 * difference, a missing file, or no argument. Read-only: it never writes to the site checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (target === '--live') {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/check-live-site-verifier.mjs'), '--live'], { stdio: 'inherit' });
  process.exit(r.status === 0 ? 0 : 1);
}
if (!target) {
  console.error('usage: node scripts/check-site-verifier.mjs <path-to-site derive.js> | --live');
  process.exit(1);
}

const pinSrc = fs.readFileSync(path.join(root, 'src/site-verifier.ts'), 'utf8');
const block = pinSrc.match(/SITE_VERIFIER_PINS[^{]*\{([\s\S]*?)\}\)/);
if (!block) { console.error('FAIL: SITE_VERIFIER_PINS not found in src/site-verifier.ts'); process.exit(1); }
const pins = Object.fromEntries([...block[1].matchAll(/'([^']+)':\s*'([0-9a-f]{64})'/g)].map(m => [m[1], m[2]]));
if (!pins['games/crash/derive.js']) { console.error('FAIL: no pin for games/crash/derive.js'); process.exit(1); }

const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const derivePath = path.resolve(target);
const siteRoot = path.resolve(path.dirname(derivePath), '../..');   // …/VerifyBets
let failures = 0;
const report = (rel, abs) => {
  const pinned = pins[rel];
  if (!fs.existsSync(abs)) { console.log(`  FAIL  ${rel}: file not found at ${abs}`); failures++; return; }
  const actual = sha(abs);
  if (!pinned) { console.log(`  FAIL  ${rel}: imported by the site but NOT pinned (sha256 ${actual})`); failures++; return; }
  const ok = actual === pinned;
  if (!ok) failures++;
  console.log(`  ${ok ? 'MATCH' : 'FAIL '} ${rel}\n        site   ${actual}\n        pinned ${pinned}`);
};

console.log(`\n  Site verifier parity check — ${derivePath}`);
report('games/crash/derive.js', derivePath);
const seen = new Set(['games/crash/derive.js']);
if (fs.existsSync(derivePath)) {
  const specs = [...fs.readFileSync(derivePath, 'utf8').matchAll(/^\s*import\b[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  for (const spec of specs) {
    const abs = path.resolve(path.dirname(derivePath), spec.endsWith('.js') ? spec : `${spec}.js`);
    const rel = path.relative(siteRoot, abs).split(path.sep).join('/');
    seen.add(rel);
    report(rel, abs);
  }
}
for (const rel of Object.keys(pins)) {
  if (!seen.has(rel)) { console.log(`  FAIL  ${rel}: pinned but no longer imported by the site derive.js`); failures++; }
}
console.log(failures === 0
  ? '  RESULT: site verifier == vendored copy (every pinned hash matches)\n'
  : `  RESULT: ${failures} difference(s) — the site verifier is NOT the code Step 5 proved; re-vendor and re-run the suite\n`);
process.exit(failures === 0 ? 0 : 1);
