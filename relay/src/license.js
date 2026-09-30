// Base64URL helpers
export function base64UrlEncode(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(str) {
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

export async function verifyHmac(payloadStr, sigB64, secret) {
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
 * Mint a License Bearer Token using Web Crypto API
 * @param {string} sub
 * @param {number} days
 * @param {number} flags
 * @param {string} secret
 * @returns {Promise<{ token: string, exp: number }>}
 */
export async function mintLicense(sub, days, flags, secret) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = Math.floor(iat + days * 86400);

  const payloadObj = {
    sub,
    exp,
    flags: Number(flags),
    iat
  };

  const payloadJson = JSON.stringify(payloadObj);
  const enc = new TextEncoder();
  const b64Payload = base64UrlEncode(enc.encode(payloadJson));

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(payloadJson));
  const b64Sig = base64UrlEncode(new Uint8Array(sigBytes));

  return {
    token: `${b64Payload}.${b64Sig}`,
    exp
  };
}

/**
 * Compute hashed sub from device and salt: sha256(device + LICENSE_SALT)
 * @param {string} device
 * @param {string} salt
 * @returns {Promise<string>}
 */
export async function computeSub(device, salt) {
  const input = `${device}${salt}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
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
