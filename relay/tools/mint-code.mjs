#!/usr/bin/env node
/**
 * 이용권 코드 발급 도구 (MASTER 2026-10-08 01:12, B 줄 5) — Ed25519.
 *
 * 정본은 앱 저장소 `raytok-native1/docs/samples/license-code.md` 다. 모양은 거기 그대로:
 *   80바이트 = payload 16 + Ed25519 서명 64 → Crockford base32 128자(패딩 없음)
 *   payload[0] 키 번호 · [1..4] 예비(0) · [5..8] 만료 uint32 초 BE · [9] 플래그 · [10..15] 고객 6바이트
 *   서명은 payload 16바이트 그대로 덮는다(해시 먼저 하지 않는다).
 *
 * `mint-license.mjs`(HMAC 중계 토큰)와는 다른 물건이다 — 손대지 않는다.
 *
 * 개인키는 **환경변수·파일·`.dev.vars`** 에서만 읽는다. 저장소에 적지 않는다.
 * 키 0 = 시험 키 — 씨앗이 글(정본 §2)에서 나오므로 `--test` 로 누구나 같은 코드를 낸다.
 * 앱은 키 0 코드를 개발자 모드에서만 받는다.
 *
 * 쓰는 법
 *   node tools/mint-code.mjs --test --exp 2030-01-01 --flags host,private --cust RT0001
 *   node tools/mint-code.mjs --key 1 --days 365 --flags host --cust ACME01        # LIC_PRIVATE_KEY_1
 *   node tools/mint-code.mjs --key 1 --key-file /secure/key1.hex --exp 1893456000 --flags 0x01 --cust X
 *   node tools/mint-code.mjs --verify <code> [--pub <hex>]
 *   node tools/mint-code.mjs --pubkey --key 1          # 그 개인키의 공개키 (앱 PUBLIC_KEYS 에 넣을 값)
 *   node tools/mint-code.mjs --keygen                  # 새 개인키 씨앗 32바이트(hex) — 화면에만, 저장은 사람이
 */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

let fs, path, fileURLToPath, __dirname;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    const req = eval('require');
    fs = req('fs');
    path = req('path');
    fileURLToPath = req('url').fileURLToPath;
    __dirname = path.dirname(fileURLToPath(import.meta.url));
  } catch (e) {}
}

/* ───────────── 상수 (정본 §1) ───────────── */
export const PAYLOAD_LEN = 16;
export const SIG_LEN = 64;
export const CODE_BYTES = PAYLOAD_LEN + SIG_LEN;      // 80
export const CODE_CHARS = (CODE_BYTES * 8) / 5;       // 128
export const TEST_KEY_ID = 0;
export const TEST_SEED_TEXT = 'RayTok license test key 0 — 시험 전용';
export const FLAG = { host: 0x01, private: 0x02, meet: 0x04, desk: 0x08 };
const FLAG_ALIAS = {
  host: 'host', guide: 'host', class: 'host', tour: 'host',
  private: 'private', camera: 'private', app: 'private', personal: 'private', box: 'private',
  meet: 'meet', desk: 'desk',
};
export const LINK_BASE = 'https://raytok.kr/lic/';

/* 시험 키 0 의 공개키 — 정본 §2. 앱 `src/license.js` PUBLIC_KEYS[0] 과 같아야 한다 */
export const PUBLIC_KEYS = {
  0: '182dd333afe8b85ba3c6539e2a3368cbe7295b41237d8c0eef45660483c72c01',
};

/* ───────────── Crockford base32 (앱 `src/license.js` 와 같은 규칙) ───────────── */
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

/** 4자 × 32칸 — 손입력(마지막 수단)용 */
export const groupCode = (code) => String(code || '').replace(/(.{4})/g, '$1-').replace(/-$/, '');

/* ───────────── Ed25519 (node:crypto — 의존성 없음) ───────────── */
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

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

/** 시험 키 0 의 씨앗 — 정본 §2: sha256(글) 앞 32바이트 */
export const testSeed = () => crypto.createHash('sha256').update(TEST_SEED_TEXT, 'utf8').digest();

/* ───────────── 발급 ───────────── */

export function buildPayload({ keyId, exp, flags, cust }) {
  const p = Buffer.alloc(PAYLOAD_LEN, 0);
  const k = Number(keyId);
  if (!Number.isInteger(k) || k < 0 || k > 255) throw new Error('키 번호는 0..255');
  const e = Number(exp);
  if (!Number.isInteger(e) || e < 0 || e > 0xffffffff) throw new Error('만료는 uint32 초');
  const f = Number(flags);
  if (!Number.isInteger(f) || f < 0 || f > 255) throw new Error('플래그는 0..255');
  const c = String(cust || '');
  if (c.length > 6 || /[^\x20-\x7e]/.test(c)) throw new Error('고객은 ASCII 6자 이내');
  p[0] = k;
  p.writeUInt32BE(e, 5);
  p[9] = f;
  for (let i = 0; i < c.length; i += 1) p[10 + i] = c.charCodeAt(i);
  return p;
}

/** 코드 하나를 만든다. 돌려주는 것: { code, grouped, link, payload, sig } */
export function mintCode({ keyId, exp, flags, cust, privateKey }) {
  const payload = buildPayload({ keyId, exp, flags, cust });
  const sig = crypto.sign(null, payload, privateKey);
  if (sig.length !== SIG_LEN) throw new Error('서명 길이가 64가 아니다');
  const code = base32Encode(Buffer.concat([payload, sig]));
  if (code.length !== CODE_CHARS) throw new Error('코드가 128자가 아니다');
  return { code, grouped: groupCode(code), link: LINK_BASE + code, payload, sig };
}

/* ───────────── 검사 (앱 `verifyCode` 와 같은 결과를 낸다 — devMode 는 없다, 도구는 키 0 을 그냥 받는다) ───────────── */

export function claimsOf(payload) {
  const exp = payload.readUInt32BE(5);
  let cust = '';
  for (let i = 10; i < 16; i += 1) if (payload[i]) cust += String.fromCharCode(payload[i]);
  return { keyId: payload[0], exp, flags: payload[9], cust };
}

export function verifyCode(code, { now = Date.now(), keys = PUBLIC_KEYS } = {}) {
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
  if (now / 1000 > claims.exp) return { ok: false, why: 'expired', claims };
  return { ok: true, why: '', claims };
}

/* ───────────── 입력 풀기 ───────────── */

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

/** 만료: unix 초 · YYYY-MM-DD(UTC 자정) · ISO 날짜시각 */
export function parseExp(v, now = Date.now()) {
  const s = String(v).trim();
  if (/^\d{9,10}$/.test(s)) return Number(s);
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(t)) throw new Error(`만료를 읽을 수 없다: ${v}`);
  if (t / 1000 <= now / 1000) throw new Error('만료가 이미 지났다');
  return Math.floor(t / 1000);
}

function toBytes(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  const s = String(v || '').trim();
  if (!/^[0-9a-f]+$/i.test(s) || s.length % 2) throw new Error('hex 가 아니다');
  return Buffer.from(s, 'hex');
}

function readDevVar(name) {
  const p = path.resolve(__dirname, '../.dev.vars');
  if (!fs.existsSync(p)) return undefined;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/**
 * 개인키 찾는 차례 — 저장소 밖에서만:
 *   --test(키 0) → --key-file 경로 → env LIC_PRIVATE_KEY_<id> → env LIC_PRIVATE_KEY → relay/.dev.vars LIC_PRIVATE_KEY_<id>
 */
export function loadPrivateKey({ keyId, keyFile, test }) {
  if (test || keyId === TEST_KEY_ID) {
    if (keyId !== TEST_KEY_ID) throw new Error('--test 는 키 0 만');
    return privateKeyFromSeed(testSeed());
  }
  let hex;
  if (keyFile) hex = fs.readFileSync(keyFile, 'utf8');
  else hex = process.env[`LIC_PRIVATE_KEY_${keyId}`] || process.env.LIC_PRIVATE_KEY || readDevVar(`LIC_PRIVATE_KEY_${keyId}`);
  if (!hex) throw new Error(`키 ${keyId} 의 개인키가 없다 — --key-file <경로> 또는 LIC_PRIVATE_KEY_${keyId} (env / relay/.dev.vars)`);
  return privateKeyFromSeed(hex.trim());
}

function parseArgs(argv) {
  const o = { keyId: undefined, test: false, exp: undefined, days: undefined, flags: undefined, cust: '', keyFile: undefined, verify: undefined, pub: undefined, pubkey: false, keygen: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; if (argv[i] === undefined) throw new Error(`${a} 뒤에 값이 없다`); return argv[i]; };
    if (a === '--test') o.test = true;
    else if (a === '--key' || a === '--key-id') o.keyId = Number(next());
    else if (a === '--key-file') o.keyFile = next();
    else if (a === '--exp') o.exp = next();
    else if (a === '--days') o.days = Number(next());
    else if (a === '--flags') o.flags = next();
    else if (a === '--cust') o.cust = next();
    else if (a === '--verify') o.verify = next();
    else if (a === '--pub') o.pub = next();
    else if (a === '--pubkey') o.pubkey = true;
    else if (a === '--keygen') o.keygen = true;
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') { console.log(usage()); process.exit(0); }
    else throw new Error(`모르는 인자: ${a}`);
  }
  if (o.test && o.keyId === undefined) o.keyId = TEST_KEY_ID;
  return o;
}

function usage() {
  return [
    '이용권 코드 발급 (Ed25519, 정본 raytok-native1/docs/samples/license-code.md)',
    '',
    '  --test                       시험 키 0 (씨앗을 글에서 뽑는다 — 개발자 모드 앱만 받는다)',
    '  --key <n>                    키 번호 (운영은 1부터). 개인키: --key-file | env LIC_PRIVATE_KEY_<n> | relay/.dev.vars',
    '  --key-file <경로>            개인키 씨앗 hex 64자 파일',
    '  --exp <YYYY-MM-DD|unix초>    만료 (UTC)      --days <n>  지금부터 n일',
    '  --flags <host,private,meet,desk | 0x03>   호스트 0x01 · 카메라/앱 개인(private|camera|app) 0x02 · Meet 0x04 · Desk 0x08',
    '  --cust <ASCII 6자 이내>      고객',
    '  --verify <code> [--pub <hex>]  코드 검사 (키 0 은 내장, 운영 키는 --pub 또는 env LIC_PUBLIC_KEY_<n>)',
    '  --pubkey [--key n]           개인키의 공개키 hex (앱 PUBLIC_KEYS 에 넣는 값)',
    '  --keygen                     새 씨앗 32바이트 hex — 화면에만. 저장은 사람이 .dev.vars/wrangler secret 에',
    '  --json                       JSON 한 줄로',
  ].join('\n');
}

function keysForVerify(pub, keyId) {
  const keys = { ...PUBLIC_KEYS };
  const env = typeof process !== 'undefined' ? process.env : {};
  for (const [k, v] of Object.entries(env)) {
    const m = k.match(/^LIC_PUBLIC_KEY_(\d+)$/);
    if (m) keys[Number(m[1])] = v.trim();
  }
  if (pub) keys[keyId] = pub;
  return keys;
}

export function main(argv = typeof process !== 'undefined' ? process.argv.slice(2) : []) {
  const o = parseArgs(argv);
  if (o.keygen) {
    const seed = crypto.randomBytes(32);
    const pk = privateKeyFromSeed(seed);
    console.log(`개인키 씨앗(비밀 — 저장소에 넣지 말 것): ${seed.toString('hex')}`);
    console.log(`공개키: ${publicKeyHexOf(pk)}`);
    return;
  }
  if (o.verify !== undefined) {
    const raw = String(o.verify).replace(/[-\s]/g, '');
    const peek = base32Decode(raw);
    const keyId = peek && peek.length === CODE_BYTES ? peek[0] : undefined;
    const r = verifyCode(o.verify, { keys: keysForVerify(o.pub, keyId) });
    if (o.json) { console.log(JSON.stringify(r)); }
    else {
      console.log(`ok=${r.ok} why=${r.why || '-'}`);
      if (r.claims) {
        const c = r.claims;
        console.log(`keyId=${c.keyId} exp=${c.exp} (${new Date(c.exp * 1000).toISOString()}) flags=0x${c.flags.toString(16).padStart(2, '0')} (${flagNames(c.flags)}) cust=${c.cust}`);
      }
    }
    if (typeof process !== 'undefined') process.exitCode = r.ok ? 0 : 2;
    return;
  }
  if (o.keyId === undefined) throw new Error('--key <n> 또는 --test 가 필요하다');
  const privateKey = loadPrivateKey(o);
  if (o.pubkey) { console.log(publicKeyHexOf(privateKey)); return; }

  let exp;
  if (o.exp !== undefined) exp = parseExp(o.exp);
  else if (o.days !== undefined && Number.isFinite(o.days) && o.days > 0) exp = Math.floor(Date.now() / 1000 + o.days * 86400);
  else throw new Error('--exp 또는 --days 가 필요하다');
  const flags = parseFlags(o.flags);
  const r = mintCode({ keyId: o.keyId, exp, flags, cust: o.cust, privateKey });
  const claims = claimsOf(r.payload);
  if (o.json) {
    console.log(JSON.stringify({ code: r.code, grouped: r.grouped, link: r.link, ...claims }));
    return;
  }
  console.log(`keyId=${claims.keyId} exp=${claims.exp} (${new Date(claims.exp * 1000).toISOString()}) flags=0x${claims.flags.toString(16).padStart(2, '0')} (${flagNames(claims.flags)}) cust=${claims.cust}`);
  console.log('');
  console.log(r.code);
  console.log('');
  console.log(r.grouped);
  console.log('');
  console.log(r.link);
}

if (typeof process !== 'undefined' && process.argv && process.argv[1] && typeof fileURLToPath !== 'undefined' && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { main(); } catch (err) { console.error(err.message); process.exit(1); }
}
