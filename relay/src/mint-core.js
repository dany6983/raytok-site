/**
 * relay/src/mint-core.js — Ed25519 라이선스 쿠폰 순수 암호화 로직 (정본 §1, §2)
 * Cloudflare Worker 호환: node:crypto, node:buffer 만 사용 (fs 일절 없음)
 */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export const PAYLOAD_LEN = 16;
export const SIG_LEN = 64;
export const CODE_BYTES = PAYLOAD_LEN + SIG_LEN;      // 80
export const CODE_CHARS = (CODE_BYTES * 8) / 5;       // 128
export const TEST_KEY_ID = 0;
export const TEST_SEED_TEXT = 'RayTok license test key 0 — 시험 전용';
export const FLAG = { host: 0x01, private: 0x02, meet: 0x04, desk: 0x08, bundle: 0x10 };
export const FLAG_ALIAS = {
  host: 'host', guide: 'host', class: 'host', tour: 'host',
  private: 'private', camera: 'private', app: 'private', personal: 'private', box: 'private',
  meet: 'meet', desk: 'desk',
  bundle: 'bundle', server_bundle: 'bundle', server: 'bundle'
};
export const LINK_BASE = 'https://raytok.kr/lic/';

/* 시험 키 0 의 공개키 — 정본 §2 */
export const PUBLIC_KEYS = {
  0: '182dd333afe8b85ba3c6539e2a3368cbe7295b41237d8c0eef45660483c72c01',
  /* 1: 운영 키 — 2026-10-13 12:24 대표님이 PC 에서 생성, 개인키는 Worker 비밀값 MINT_PRIVATE_KEY 에만 */
  1: '7c2f16c295a780459e2c86f8bbb3b4f4bf64059c3d62e6893408c93c9e07b575',
};

/* 운영은 운영 키만 — 운영 릴레이의 기본 신뢰 목록은 1번 하나. 0번(시험 키)은 개발 릴레이에서
   `ALLOW_TEST_KEY=1`(relay/.dev.vars) 일 때만 받는다. 운영 wrangler.toml 에는 넣지 않는다. */
export const PROD_KEYS = { 1: PUBLIC_KEYS[1] };
export function trustedKeys(env) {
  return env && String(env.ALLOW_TEST_KEY) === '1' ? PUBLIC_KEYS : PROD_KEYS;
}

/* Crockford base32 */
const C32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const C32_MAP = (() => {
  const m = new Map();
  for (let i = 0; i < C32.length; i += 1) m.set(C32[i], i);
  m.set('I', 1); m.set('L', 1); m.set('O', 0);
  return m;
})();

export function base32Encode(bytes) {
  let s = '', acc = 0, bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff; bits += 8;
    while (bits >= 5) { bits -= 5; s += C32[(acc >> bits) & 31]; }
  }
  if (bits) s += C32[(acc << (5 - bits)) & 31];
  return s;
}

export function base32Decode(code) {
  const s = String(code || '').replace(/[-\s]/g, '').toUpperCase();
  if (!s) return null;
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let bits = 0, acc = 0, n = 0;
  for (const ch of s) {
    const v = C32_MAP.get(ch);
    if (v === undefined) return null;
    acc = ((acc << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { bits -= 8; out[n] = (acc >> bits) & 0xff; n += 1; }
  }
  if (n !== out.length) return null;
  return out;
}

export const groupCode = (code) => String(code || '').replace(/(.{4})/g, '$1-').replace(/-$/, '');

/* Ed25519 der */
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function toBytes(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  const s = String(v || '').trim();
  if (!/^[0-9a-f]+$/i.test(s) || s.length % 2) throw new Error('hex 가 아니다');
  return Buffer.from(s, 'hex');
}

export function privateKeyFromSeed(seed) {
  const s = toBytes(seed);
  if (s.length !== 32) throw new Error('개인키 씨앗은 32바이트(hex 64자)여야 한다');
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, s]), format: 'der', type: 'pkcs8' });
}

export function publicKeyFromHex(hex) {
  const p = toBytes(hex);
  if (p.length !== 32) throw new Error('공개키는 32바이트(hex 64자)여야 한다');
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, p]), format: 'der', type: 'spki' });
}

export function publicKeyHexOf(privateKey) {
  const der = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  return Buffer.from(der.subarray(der.length - 32)).toString('hex');
}

export const testSeed = () => crypto.createHash('sha256').update(TEST_SEED_TEXT, 'utf8').digest();

/**
 * payload 16바이트 — 앱 정본 `raytok-native1/docs/samples/license-code.md` §1 과 **바이트 단위로 같다**
 * (B-2, 마스터 10-14 09:00 · 앱 `b9c0678`):
 *   [0] 키 번호 · [1..2] 예비(0) · [3..4] **기간(일) uint16 BE** · [5..8] 만료 uint32 BE(초) ·
 *   [9] 플래그 · [10..15] 고객 ASCII 6
 * 기간이 0 이면 전과 같이 절대 만료(`exp`)만 본다. 기간이 있으면 `exp` 는 **묵힘 한도**
 * (발급 → 첫 찍기, 보통 90일)이고 실제 끝은 등록 시각 + 기간일 — 셈은 앱 `effectiveExp` ·
 * 릴레이 `room.js` redeem 이 한다. `shelfLife` 는 `exp` 의 다른 이름(옛 호출 호환).
 */
export const DAYS_MAX = 0xffff;
export function buildPayload({ keyId, exp, days = 0, shelfLife, flags, cust }) {
  const p = Buffer.alloc(PAYLOAD_LEN, 0);
  const k = Number(keyId);
  if (!Number.isInteger(k) || k < 0 || k > 255) throw new Error('키 번호는 0..255');
  const d = Number(days || 0);
  if (!Number.isInteger(d) || d < 0 || d > DAYS_MAX) throw new Error('기간(일)은 0..65535');
  const e = Number(exp !== undefined ? exp : shelfLife);
  if (!Number.isInteger(e) || e < 0 || e > 0xffffffff) throw new Error('만료는 uint32 초');
  const f = Number(flags);
  if (!Number.isInteger(f) || f < 0 || f > 255) throw new Error('플래그는 0..255');
  const c = String(cust || '');
  if (c.length > 6 || /[^\x20-\x7e]/.test(c)) throw new Error('고객은 ASCII 6자 이내');
  p[0] = k;
  p.writeUInt16BE(d, 3);
  p.writeUInt32BE(e, 5);
  p[9] = f;
  for (let i = 0; i < c.length; i += 1) p[10 + i] = c.charCodeAt(i);
  return p;
}

export function mintCode({ keyId, exp, days = 0, shelfLife, flags, cust, privateKey }) {
  const payload = buildPayload({ keyId, exp, days, shelfLife, flags, cust });
  const sig = crypto.sign(null, payload, privateKey);
  if (sig.length !== SIG_LEN) throw new Error('서명 길이가 64가 아니다');
  const code = base32Encode(Buffer.concat([payload, sig]));
  if (code.length !== CODE_CHARS) throw new Error('코드가 128자가 아니다');
  return { code, grouped: groupCode(code), link: LINK_BASE + code, payload, sig };
}

/** payload → 주장. 앱 `src/license.js claimsOf` 와 같은 자리에서 같은 값을 읽는다 */
export function claimsOf(payload) {
  const days = payload.readUInt16BE(3);
  const exp = payload.readUInt32BE(5);
  let cust = '';
  for (let i = 10; i < 16; i += 1) if (payload[i]) cust += String.fromCharCode(payload[i]);
  return { keyId: payload[0], exp, days, flags: payload[9], cust };
}

export function verifyCode(code, { now = Date.now(), keys = PROD_KEYS } = {}) {
  const raw = String(code || '').replace(/[-\s]/g, '');
  if (!raw) return { ok: false, why: 'empty', claims: null };
  if (raw.length !== CODE_CHARS) return { ok: false, why: 'len', claims: null };
  const bytes = base32Decode(raw);
  if (!bytes) return { ok: false, why: 'base32', claims: null };
  if (bytes.length !== CODE_BYTES) return { ok: false, why: 'len', claims: null };
  const payload = Buffer.from(bytes.subarray(0, PAYLOAD_LEN));
  const sig = Buffer.from(bytes.subarray(PAYLOAD_LEN));
  const claims = claimsOf(payload);
  const hex = keys[claims.keyId];
  if (!hex) return { ok: false, why: 'needs_update', claims };
  let good = false;
  try { good = crypto.verify(null, payload, publicKeyFromHex(hex), sig); } catch { good = false; }
  if (!good) return { ok: false, why: 'sig', claims };
  /* 기간이 있어도 `exp`(묵힘 한도)는 본다 — 90일 묵힌 1일권이 91일째 열리면 안 된다(정본 §4-1) */
  if (now / 1000 > claims.exp) return { ok: false, why: 'expired', claims };
  return { ok: true, why: '', claims };
}

export function parseFlags(v) {
  if (v === undefined || v === null || v === '') throw new Error('--flags 가 필요하다 (host,private,meet,desk 또는 숫자)');
  const s = String(v).trim();
  if (/^(0x[0-9a-f]+|\d+)$/i.test(s)) return Number(s);
  let f = 0;
  for (const part of s.split(/[,+|\s]+/).filter(Boolean)) {
    const name = FLAG_ALIAS[part.toLowerCase()];
    if (!name) throw new Error(`모르는 플래그: ${part} (host, private|camera|app, meet, desk)`);
    f |= FLAG[name];
  }
  return f;
}

export function flagNames(f) {
  return Object.keys(FLAG).filter((k) => f & FLAG[k]).join(',') || '-';
}

export function parseExp(v, now = Date.now()) {
  const s = String(v).trim();
  if (/^\d{9,10}$/.test(s)) return Number(s);
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(t)) throw new Error(`만료를 읽을 수 없다: ${v}`);
  if (t / 1000 <= now / 1000) throw new Error('만료가 이미 지났다');
  return Math.floor(t / 1000);
}
