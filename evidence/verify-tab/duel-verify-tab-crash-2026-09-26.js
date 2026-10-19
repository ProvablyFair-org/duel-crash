// Code written in JavaScript

// User input values
const drandSeed = '';
const serverSeed = '';

// Converts a hex string (e.g. "deadbeef") into a Uint8Array of bytes
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Converts a Uint8Array of bytes back into a hex string (e.g. [222, 173, 190, 239] → "deadbeef")
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Computes a HMAC-SHA256 using the Web Crypto API
// keyHex: hex-encoded key (e.g. server seed)
// message: Uint8Array to be signed
async function generateHMAC_SHA256(keyHex, message) {
  const keyBytes = hexToBytes(keyHex);

  // Import raw key for HMAC use
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Generate HMAC signature
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return bytesToHex(new Uint8Array(signature)); // Return signature as hex
}

// Converts a hex-encoded public seed into a UTF-8 string
function hexToUtf8String(publicSeed) {
  const bytes = hexToBytes(publicSeed);
  return new TextDecoder('utf-8').decode(bytes);
}

// The actual fairness verification function
const validateCrashResult = async (serverSeed, drandSeed) => {
// Prepare input message for HMAC: public seed + nonce
  const NONCE = 0;
  const randomness = hexToUtf8String(drandSeed);
  const message = new TextEncoder().encode(`${randomness}:${NONCE}`);

  // Compute HMAC hash
  const hash = await generateHMAC_SHA256(serverSeed, message);

  // Use first 4 bytes of hash for entropy
  const value = parseInt(hash.slice(0, 8), 16);

  const MAX = 2 ** 32;
  const houseEdge = 0.001;
  const result = (MAX / (value + 1)) * (1 - houseEdge);

  return Math.max(1.0, result);
};

// Run the validateCrashResult function if input values are provided
if (serverSeed && serverSeed.trim() !== '' && drandSeed && drandSeed.trim() !== '') {
  validateCrashResult(serverSeed, drandSeed).then(result => {
    console.log("Crash result:", result);
  });
} else {
  console.log("Please fill in the drandSeed and serverSeed values.");
}
