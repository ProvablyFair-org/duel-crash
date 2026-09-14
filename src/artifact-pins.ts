/**
 * ARTIFACTS OF RECORD — pinned.
 *
 * These files are shipped as evidence and their figures are quoted in the report, but until this
 * pin existed nothing hashed them: emptying, duplicating or shrinking any of them left the
 * verifier reporting PROVABLY FAIR — Full Pass, exit 0. A published artifact that nothing can
 * distinguish from a rewritten one is not evidence.
 *
 * Files this verifier REWRITES on every run are deliberately absent from this list — pinning one
 * would fail on the second run. That they are rewritten at all is a separate defect.
 *
 * Regenerating an artifact legitimately means re-pinning it here, in the same commit.
 */
export const ARTIFACT_PINS: Readonly<Record<string, string>> = Object.freeze({
  'drand-api-verification.json':
    '93f149230159f427c837f8b759fa52f3169599e46815759dd225c2666edd2768',
  'rtp-convergence.html':
    '3a1af0d3836fa5c0dd82457792b0f5672886d111d20a0fe2d6648f3bdc51cbd4',
  'simulation-results.json':
    'd335fb0a6fddb1120614f6bbbc583e5bf79e71cccc3bea8e535833ecc95e1dfa',
});
