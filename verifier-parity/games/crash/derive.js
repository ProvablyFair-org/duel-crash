import { hmacSha256Hex, hexToBytes } from '../../lib/hmac-sha256';

/**
 * Crash RNG — port of Duel's drand + HMAC-SHA256 algorithm.
 *
 * Source of truth (audit repo):
 *   https://github.com/ProvablyFair-org/duel-crash/blob/main/src/rng.ts
 *
 * Crash is structurally different from every other Duel game. There is NO
 * client seed and NO nonce. Instead, each round mixes:
 *
 *   - A per-round serverSeed (revealed after the round)
 *   - drand randomness — a 48-byte BLS signature from the drand quicknet
 *     public beacon (96 hex chars), also revealed after the round
 *
 * Algorithm:
 *
 *   1. drandBytes = hexToBytes(drandRandomness)
 *   2. randomness = utf8(drandBytes)                        ; lossy hex→bytes→utf8
 *   3. message    = randomness + ":0"                       ; nonce always 0
 *   4. hmac       = HMAC-SHA256(hexBytes(serverSeed), message)
 *   5. value      = parseInt(hmac[0..7], 16)                ; first 4 bytes as uint32
 *   6. raw        = (2^32 / (value + 1)) × 0.999            ; 0.1% house edge
 *   7. crash      = max(1.00, floor(raw × 100) / 100)       ; floored to 2dp
 *
 * The "lossy utf8" encoding in step 2 is a quirk inherited from Duel's
 * server implementation. Hex-decoded BLS signature bytes are not valid
 * UTF-8, so Buffer.from(bytes).toString('utf-8') produces a string with
 * U+FFFD replacement characters in place of invalid byte sequences. This
 * is deterministic — identical bytes produce identical strings — but it
 * means we can't simplify the encoding without breaking parity. Don't.
 *
 * Verified against all 1,100 captured crash rounds in the audit dataset:
 *   - crash points: 1100 / 1100 — exact match
 */

const MAX_U32 = 2 ** 32;
const HOUSE_EDGE_FACTOR = 0.999;

/**
 * Synchronous variant — used for the React render path.
 *
 * Non-hex tolerance: matches the other Duel games. If the inputs aren't
 * valid hex, fall back to UTF-8 byte encoding so the verifier still
 * produces a deterministic result (the shell shows a soft warning that
 * the result won't match a real Duel round). This makes the verifier
 * usable for testing/exploration with arbitrary strings.
 */
export function deriveCrashSync({ serverSeed, drandRandomness }) {
  const key = bytesFromInput(serverSeed);
  const drandBytes = bytesFromInput(drandRandomness);
  const randomness = utf8Decode(drandBytes);
  const message = `${randomness}:0`;

  const hmac = hmacSha256Hex(key, message);
  const uintValue = parseInt(hmac.slice(0, 8), 16);
  const crashPointRaw = (MAX_U32 / (uintValue + 1)) * HOUSE_EDGE_FACTOR;
  const crashPoint = Math.max(1.0, Math.floor(crashPointRaw * 100) / 100);

  return {
    crashPoint,
    crashPointRaw,
    uintValue,
    hmac,
  };
}

/**
 * Convert an input string to bytes. Prefers hex decoding when the string
 * is valid hex (even-length, all hex chars); otherwise falls back to UTF-8.
 * Same pattern used by the other Duel games' derive functions for
 * non-hex test seeds.
 */
function bytesFromInput(s) {
  if (!s) return new Uint8Array(0);
  if (s.length > 0 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s)) {
    return hexToBytes(s);
  }
  return utf8Bytes(s);
}

function utf8Bytes(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

/**
 * Match Node's Buffer.from(bytes).toString('utf-8') behavior, which
 * substitutes U+FFFD for invalid UTF-8 sequences. The browser's
 * TextDecoder default does the same thing.
 */
function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  return String.fromCharCode.apply(null, Array.from(bytes));
}
