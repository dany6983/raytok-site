/**
 * 이용권 코드 발급 도구 시험 (MASTER 01:12 B 줄 5). `node --test test/mint-code.mjs` 또는 `npm run test:mint`.
 *
 * 정본은 앱 저장소 `raytok-native1/docs/samples/license-code.md` 다. 그 파일이 옆에 있으면
 * (`../../raytok-native1/...` 또는 env `LICENSE_CODE_DOC`) 벡터 넷을 거기서 읽어 **전부** 대조하고,
 * 없으면 여기 적어 둔 벡터 ① 과만 대조한다 — 정본이 바뀌면 그쪽 시험이 먼저 붉어진다.
 *
 * 되돌려서 실패 확인: `mintCode` 의 `p.writeUInt32BE(e, 5)` 를 LE 로 바꾸면 ① 이 붉어진다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mintCode, verifyCode, loadPrivateKey, privateKeyFromSeed, testSeed, publicKeyHexOf,
  parseFlags, parseExp, groupCode, base32Decode, base32Encode, PUBLIC_KEYS, CODE_CHARS, LINK_BASE,
} from '../tools/mint-code.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* 정본 벡터 ① — license-code.md §3 (키 0 · exp=1893456000 · flags=0x03 · cust="RT0001") */
const VEC1 = '00000000E3DXH003A9A30C1G66PQMK63P1PDQTQ1SNYDX9P9MYBRBKBA626VVW133ARGBWE9XCVD2CAZAQVT2V5XQGWS73NYH6GYYR34D9V2YM8V9H6Y8XJ9801EGYGA';
const FAR = 1893456000;      // 2030-01-01
const PAST = 1767225600;     // 2026-01-01
const NOW_2027 = Date.parse('2027-06-01T00:00:00Z');
const key0 = loadPrivateKey({ keyId: 0, test: true });

function readDoc() {
  const cands = [process.env.LICENSE_CODE_DOC, path.resolve(__dirname, '../../../raytok-native1/docs/samples/license-code.md')].filter(Boolean);
  for (const p of cands) if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return null;
}
const DOC = readDoc();
const DOC_CODES = DOC ? (DOC.match(/^[0-9A-HJKMNP-TV-Z]{128}$/gm) || []) : [];

test('시험 키 0 — 씨앗·공개키가 정본 §2 와 같다', () => {
  assert.equal(testSeed().toString('hex'), '09159f023beebd9bea7dfd39bd7dc795f975994502e02633df9f8a0ec8a25182');
  assert.equal(publicKeyHexOf(key0), PUBLIC_KEYS[0]);
  assert.equal(PUBLIC_KEYS[0], '182dd333afe8b85ba3c6539e2a3368cbe7295b41237d8c0eef45660483c72c01');
});

test('① 정상 — 발급한 코드가 정본 벡터와 글자까지 같다 (Ed25519 는 결정적이다)', () => {
  const r = mintCode({ keyId: 0, exp: FAR, flags: parseFlags('host,private'), cust: 'RT0001', privateKey: key0 });
  assert.equal(r.code.length, CODE_CHARS);
  assert.equal(r.code, VEC1);
  assert.equal(r.payload.toString('hex'), '0000000000' + '70dbd880' + '03' + Buffer.from('RT0001').toString('hex'));
  assert.equal(r.grouped.split('-').length, 32);
  assert.ok(r.grouped.split('-').every((g) => g.length === 4));
  assert.equal(r.link, LINK_BASE + VEC1);
  const v = verifyCode(r.code, { now: NOW_2027 });
  assert.equal(v.ok, true);
  assert.deepEqual(v.claims, { keyId: 0, exp: FAR, flags: 0x03, cust: 'RT0001' });
  assert.equal(verifyCode(r.grouped, { now: NOW_2027 }).ok, true);     // 하이픈은 버린다
});

test('② 만료 — 서명은 맞고 날짜만 지났다', () => {
  const r = mintCode({ keyId: 0, exp: PAST, flags: 0x01, cust: 'RT0002', privateKey: key0 });
  const v = verifyCode(r.code, { now: NOW_2027 });
  assert.equal(v.ok, false);
  assert.equal(v.why, 'expired');
  assert.equal(v.claims.exp, PAST);
  if (DOC_CODES[1]) assert.equal(r.code, DOC_CODES[1]);
});

test('③ 모르는 키 번호 → needs_update ("무효"가 아니다)', () => {
  const r = mintCode({ keyId: 9, exp: FAR, flags: 0x01, cust: 'RT0003', privateKey: key0 });
  const v = verifyCode(r.code, { now: NOW_2027 });
  assert.equal(v.ok, false);
  assert.equal(v.why, 'needs_update');
  assert.equal(v.claims.keyId, 9);
  if (DOC_CODES[2]) assert.equal(r.code, DOC_CODES[2]);
  // 그 키의 공개키를 알려 주면 통과한다 — 앱을 새로 받으라는 뜻이 맞다
  assert.equal(verifyCode(r.code, { now: NOW_2027, keys: { 9: PUBLIC_KEYS[0] } }).ok, true);
});

test('④ 서명 깨짐 → sig', () => {
  const r = mintCode({ keyId: 0, exp: FAR, flags: 0x01, cust: 'RT0004', privateKey: key0 });
  const bytes = Buffer.from(base32Decode(r.code));
  bytes[16] ^= 0x01;                                   // 서명 첫 바이트 한 비트 (정본 ④ 와 같은 비트)
  const bad = base32Encode(bytes);
  assert.equal(verifyCode(bad, { now: NOW_2027 }).why, 'sig');
  if (DOC_CODES[3]) assert.equal(bad, DOC_CODES[3]);
  // payload 쪽을 건드려도 서명이 안 맞는다
  const p = Buffer.from(base32Decode(r.code)); p[9] = 0x03;
  assert.equal(verifyCode(base32Encode(p), { now: NOW_2027 }).why, 'sig');
});

test('정본 파일이 옆에 있으면 벡터 넷을 전부 읽어 검사 결과까지 맞춘다', { skip: !DOC && '정본 파일 없음 — 벡터 ① 내장본만 대조' }, () => {
  assert.equal(DOC_CODES.length, 4);
  assert.equal(DOC_CODES[0], VEC1);
  assert.ok(DOC.includes(PUBLIC_KEYS[0]));
  const whys = DOC_CODES.map((c) => verifyCode(c, { now: NOW_2027 }).why);
  assert.deepEqual(whys, ['', 'expired', 'needs_update', 'sig']);
});

test('운영 키는 저장소 밖에서만 — 없으면 던지고, 파일로 주면 받는다', () => {
  delete process.env.LIC_PRIVATE_KEY; delete process.env.LIC_PRIVATE_KEY_7;
  assert.throws(() => loadPrivateKey({ keyId: 7 }), /개인키가 없다/);
  const seed = Buffer.alloc(32, 7);
  process.env.LIC_PRIVATE_KEY_7 = seed.toString('hex');
  const pk = loadPrivateKey({ keyId: 7 });
  delete process.env.LIC_PRIVATE_KEY_7;
  assert.equal(publicKeyHexOf(pk), publicKeyHexOf(privateKeyFromSeed(seed)));
  const r = mintCode({ keyId: 7, exp: FAR, flags: 0x08, cust: 'DESK01', privateKey: pk });
  assert.equal(verifyCode(r.code, { now: NOW_2027 }).why, 'needs_update');          // 앱 표에 없다
  assert.equal(verifyCode(r.code, { now: NOW_2027, keys: { 7: publicKeyHexOf(pk) } }).ok, true);
  assert.throws(() => loadPrivateKey({ keyId: 1, test: true }), /--test 는 키 0/);
});

test('입력 풀기 — 플래그 이름·숫자, 만료 날짜·초, 고객 6자', () => {
  assert.equal(parseFlags('host'), 0x01);
  assert.equal(parseFlags('camera'), 0x02);
  assert.equal(parseFlags('host,private,meet,desk'), 0x0f);
  assert.equal(parseFlags('0x03'), 3);
  assert.equal(parseFlags('3'), 3);
  assert.throws(() => parseFlags('nope'), /모르는 플래그/);
  assert.equal(parseExp('2030-01-01'), FAR);
  assert.equal(parseExp(String(FAR)), FAR);
  assert.throws(() => parseExp('2000-01-01'), /이미 지났다/);
  assert.throws(() => mintCode({ keyId: 0, exp: FAR, flags: 1, cust: 'TOOLONG', privateKey: key0 }), /6자/);
  assert.throws(() => mintCode({ keyId: 0, exp: FAR, flags: 1, cust: '한글', privateKey: key0 }), /ASCII/);
  assert.equal(groupCode('ABCDEFGH'), 'ABCD-EFGH');
});
