// Base64URL helpers
function base64UrlEncode(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyHmac(payloadStr, sigB64, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const payloadBytes = enc.encode(payloadStr);
  const expectedSigBytes = await crypto.subtle.sign('HMAC', key, payloadBytes);
  const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSigBytes));
  return expectedSigB64 === sigB64;
}

/**
 * Verify License Bearer Token
 * @param {Request} request
 * @param {string} secret
 * @param {number} [requiredFlags]
 * @returns {Promise<{ valid: boolean, status?: number, error?: string, message?: string, payload?: object }>}
 */
export async function verifyLicense(request, secret, requiredFlags) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      status: 401,
      error: 'no_token',
      message: 'Missing or invalid Authorization header'
    };
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 2) {
    return {
      valid: false,
      status: 401,
      error: 'bad_token',
      message: 'Malformed token structure'
    };
  }

  const [rawPayloadB64, sigB64] = parts;

  let payloadStr;
  let payload;
  try {
    const payloadBytes = base64UrlDecode(rawPayloadB64);
    payloadStr = new TextDecoder().decode(payloadBytes);
    payload = JSON.parse(payloadStr);
  } catch (_) {
    return {
      valid: false,
      status: 401,
      error: 'bad_token',
      message: 'Failed to decode token payload'
    };
  }

  if (!secret) {
    return {
      valid: false,
      status: 500,
      error: 'upstream',
      message: 'Server LICENSE_SECRET not configured'
    };
  }

  // 1. Signature verification
  const isSigValid = await verifyHmac(payloadStr, sigB64, secret);
  if (!isSigValid) {
    return {
      valid: false,
      status: 401,
      error: 'bad_token',
      message: 'Invalid signature'
    };
  }

  // 2. Expiration check
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || nowSec > payload.exp) {
    return {
      valid: false,
      status: 401,
      error: 'expired',
      message: 'Token has expired'
    };
  }

  // 3. Flags check
  if (typeof requiredFlags === 'number') {
    const flags = typeof payload.flags === 'number' ? payload.flags : 0;
    if ((flags & requiredFlags) === 0) {
      return {
        valid: false,
        status: 403,
        error: 'not_allowed',
        message: 'Token does not have required feature flags'
      };
    }
  }

  return { valid: true, payload };
}
