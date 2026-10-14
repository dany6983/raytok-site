#!/usr/bin/env node
/**
 * tools/mint-code.mjs — 128자 base32 오프라인 이용권 발급 도구 (정본 §1, §2)
 *
 * 사용법:
 *   node tools/mint-code.mjs --test --flags host --days 1 [--cust "RT0001"]        # 1일권 (정본 [3..4]=1)
 *   node tools/mint-code.mjs --key 1 --flags host --days 7 --count 20 --cust RT     # 7일권 20장 묶음
 *   node tools/mint-code.mjs --key 1 --flags host --exp 2026-11-30 [--key-file ./priv.hex]  # 기간 0 = 절대 만료만
 *
 * --days N   정본 [3..4] 기간(일, uint16 BE). 첫 등록(QR 찍기)부터 N일. 0 이면 절대 만료만 본다.
 * --exp      정본 [5..8]. 기간이 있으면 **묵힘 한도**(발급 → 첫 찍기) — 생략하면 오늘+90일(--shelf 로 바꿈).
 * --count N  같은 칸으로 N장 (묶음). cust 는 `<앞 3자><001..>` (pay.js 와 같은 모양).
 *   node tools/mint-code.mjs --verify <code> [--pub <hex>]
 *   node tools/mint-code.mjs --pubkey --key 1          # 그 개인키의 공개키 (앱 PUBLIC_KEYS 에 넣을 값)
 *   node tools/mint-code.mjs --keygen                  # 새 개인키 씨앗 32바이트(hex) — 화면에만, 저장은 사람이
 */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 순수 암호화 로직은 Worker 호환 mint-core.js 에서 가져와 재수출
export {
  PAYLOAD_LEN,
  SIG_LEN,
  CODE_BYTES,
  CODE_CHARS,
  TEST_KEY_ID,
  TEST_SEED_TEXT,
  FLAG,
  FLAG_ALIAS,
  LINK_BASE,
  PUBLIC_KEYS,
  base32Encode,
  base32Decode,
  groupCode,
  toBytes,
  privateKeyFromSeed,
  publicKeyFromHex,
  publicKeyHexOf,
  testSeed,
  buildPayload,
  mintCode,
  claimsOf,
  verifyCode,
  parseFlags,
  flagNames,
  parseExp
} from '../src/mint-core.js';

import {
  TEST_KEY_ID,
  FLAG,
  groupCode,
  privateKeyFromSeed,
  publicKeyHexOf,
  testSeed,
  mintCode,
  verifyCode,
  parseFlags,
  flagNames,
  parseExp
} from '../src/mint-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readDevVar(name) {
  const p = path.resolve(__dirname, '../.dev.vars');
  if (!fs.existsSync(p)) return undefined;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

function getProcessEnv() {
  try { return typeof process !== 'undefined' ? process.env : {}; } catch (e) { return {}; }
}

function getProcessArgv() {
  try { return typeof process !== 'undefined' ? process.argv : []; } catch (e) { return []; }
}

export function loadPrivateKey({ keyId, keyFile, test }) {
  if (test || keyId === TEST_KEY_ID) {
    if (keyId !== TEST_KEY_ID) throw new Error('--test 는 키 0 만');
    return privateKeyFromSeed(testSeed());
  }
  let hex;
  if (keyFile && fs) hex = fs.readFileSync(keyFile, 'utf8');
  else hex = getProcessEnv()[`LIC_PRIVATE_KEY_${keyId}`] || getProcessEnv().LIC_PRIVATE_KEY || readDevVar(`LIC_PRIVATE_KEY_${keyId}`);
  if (!hex) throw new Error(`키 ${keyId} 의 개인키가 없다 — --key-file <경로> 또는 LIC_PRIVATE_KEY_${keyId} (env / relay/.dev.vars)`);
  return privateKeyFromSeed(hex.trim());
}

function parseArgs(argv) {
  const o = { keyId: undefined, test: false, exp: undefined, days: undefined, shelf: 90, count: 1, flags: undefined, cust: '', keyFile: undefined, verify: undefined, pub: undefined, pubkey: false, keygen: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; if (argv[i] === undefined) throw new Error(`${a} 뒤에 값이 없다`); return argv[i]; };
    if (a === '--test') o.test = true;
    else if (a === '--key' || a === '--key-id') o.keyId = Number(next());
    else if (a === '--key-file') o.keyFile = next();
    else if (a === '--exp') o.exp = next();
    else if (a === '--days') o.days = Number(next());
    else if (a === '--shelf') o.shelf = Number(next());
    else if (a === '--count') o.count = Number(next());
    else if (a === '--flags') o.flags = next();
    else if (a === '--cust') o.cust = next();
    else if (a === '--verify') o.verify = next();
    else if (a === '--pub') o.pub = next();
    else if (a === '--pubkey') o.pubkey = true;
    else if (a === '--keygen') o.keygen = true;
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') {
      console.log(`사용법:
  node tools/mint-code.mjs --test --flags host --days 1 [--cust "RT0001"]            # 1일권
  node tools/mint-code.mjs --key 1 --flags host --days 7 --count 20 --cust RT        # 7일권 20장
  node tools/mint-code.mjs --key 1 --flags host --exp 2026-11-30 [--key-file ./priv.hex]  # 기간 0
  (--days N = 첫 등록부터 N일 · --exp = 절대 만료 또는 묵힘 한도(기본 오늘+90일, --shelf 일수))
  node tools/mint-code.mjs --verify <code> [--pub <hex>]
  node tools/mint-code.mjs --pubkey --key 1 [--key-file ./priv.hex]
  node tools/mint-code.mjs --keygen`);
      process.exit(0);
    }
  }
  return o;
}

export function main(argv = getProcessArgv().slice(2)) {
  const args = parseArgs(argv);

  if (args.keygen) {
    const seed = crypto.randomBytes(32);
    const priv = privateKeyFromSeed(seed);
    const pub = publicKeyHexOf(priv);
    if (args.json) {
      console.log(JSON.stringify({ seedHex: seed.toString('hex'), pubHex: pub }, null, 2));
    } else {
      console.log('새 개인키 씨앗 (32바이트 hex — 안전한 곳에 보관, 절대 커밋하지 않는다):');
      console.log(seed.toString('hex'));
      console.log('\n대응하는 공개키 (앱 PUBLIC_KEYS 에 넣을 값):');
      console.log(pub);
    }
    return;
  }

  if (args.pubkey) {
    const keyId = args.test ? TEST_KEY_ID : (args.keyId ?? 0);
    const priv = loadPrivateKey({ keyId, keyFile: args.keyFile, test: args.test });
    const pub = publicKeyHexOf(priv);
    if (args.json) console.log(JSON.stringify({ keyId, pubHex: pub }, null, 2));
    else console.log(`키 ${keyId} 공개키: ${pub}`);
    return;
  }

  if (args.verify !== undefined) {
    const keys = args.pub ? { 0: args.pub, 1: args.pub } : undefined;
    const res = verifyCode(args.verify, { keys });
    if (args.json) console.log(JSON.stringify(res, null, 2));
    else if (res.ok) {
      console.log(`✓ 유효한 코드:
  키 번호: ${res.claims.keyId}
  기간(일): ${res.claims.days || 0}${res.claims.days ? ' (첫 등록부터)' : ' (절대 만료만)'}
  ${res.claims.days ? '묵힘 한도' : '만료 시각'}: ${new Date(res.claims.exp * 1000).toISOString()} (UTC)
  플래그: 0x${res.claims.flags.toString(16).padStart(2, '0')} (${flagNames(res.claims.flags)})
  고객 메모: ${res.claims.cust || '(없음)'}`);
    } else {
      console.error(`✗ 검증 실패: ${res.why}`);
      process.exit(1);
    }
    return;
  }

  const keyId = args.test ? TEST_KEY_ID : (args.keyId ?? 0);
  const flags = parseFlags(args.flags);
  const { days, exp } = resolvePeriod(args);
  const count = Number(args.count);
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('--count 는 1..1000');

  const privateKey = loadPrivateKey({ keyId, keyFile: args.keyFile, test: args.test });
  const custs = custsFor(args.cust, count);
  const results = custs.map((cust) => ({ cust, ...mintCode({ keyId, exp, days, flags, cust, privateKey }) }));

  if (args.json) {
    const rows = results.map((r) => ({
      code: r.code, grouped: r.grouped, link: r.link, keyId, days, exp,
      expIso: new Date(exp * 1000).toISOString(), flags, flagNames: flagNames(flags), cust: r.cust,
    }));
    console.log(JSON.stringify(count === 1 ? rows[0] : rows, null, 2));
  } else if (count === 1) {
    const result = results[0];
    console.log(result.code);
    console.log('\n손입력 (4자씩):');
    console.log(result.grouped);
    console.log('\n등록 바로가기 링크:');
    console.log(result.link);
  } else {
    console.log(`# ${count}장 · 기간 ${days}일 · 플래그 0x${flags.toString(16).padStart(2, '0')} · ${days ? '묵힘 한도' : '만료'} ${new Date(exp * 1000).toISOString()}`);
    for (const r of results) console.log(`${r.cust}\t${r.code}\t${r.link}`);
  }
}

/**
 * `--days`/`--exp`/`--shelf` → 정본 칸 둘. 셋 다 없으면 던진다.
 *   --days N (--exp 없음) : days=N, exp=오늘+shelf일 (묵힘 한도)
 *   --days N --exp D      : days=N, exp=D
 *   --exp D (--days 없음) : days=0, exp=D (절대 만료만 — 전과 같다)
 */
export function resolvePeriod({ days, exp, shelf = 90 }, now = Date.now()) {
  let d = 0;
  if (days !== undefined) {
    d = Number(days);
    if (!Number.isInteger(d) || d < 0 || d > 0xffff) throw new Error('--days 는 0..65535 정수(일)');
  }
  let e;
  if (exp !== undefined) e = parseExp(exp, now);
  else if (d > 0) {
    const sh = Number(shelf);
    if (!Number.isFinite(sh) || sh <= 0) throw new Error('--shelf 는 양수(일)');
    e = Math.floor(now / 1000) + Math.round(sh * 86400);
  } else throw new Error('--days <일수> 또는 --exp <날짜|초> 가 필요하다');
  return { days: d, exp: e };
}

/** 묶음의 고객 메모 — 1장이면 그대로, N장이면 `<앞 3자><001..>` (pay.js 6-B 와 같은 모양) */
export function custsFor(cust, count) {
  const base = String(cust || '');
  if (count === 1) return [base];
  const head = (base.replace(/[^a-zA-Z0-9]/g, '') || 'RT').slice(0, 3);
  return Array.from({ length: count }, (_, i) => `${head}${String(i + 1).padStart(3, '0')}`.slice(0, 6));
}

const isDirectRun = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  try {
    main();
  } catch (err) {
    console.error(`오류: ${err.message}`);
    process.exit(1);
  }
}
