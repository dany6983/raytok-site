/**
 * B-1 (MASTER 2026-10-14 09:00) — `/license/issue` 토큰에 이용권 플래그 0x01 이 실리는가.
 *
 * 앱은 `/license/issue` 토큰 하나로 `/translate` 와 `POST /room {kind:'guide'}` 를 다 연다.
 * `/room` 은 0x01 을 본다(index.js `/room` requiredFlags). 그래서 이용권(가이드 코드, 0x01)을
 * `/license/redeem` 으로 등록한 기기의 토큰에는 0x01 이 실려야 한다 — 안 실리면 17(폰 QR 웹 청취)
 * 전체가 401 이다.
 *
 * 돌리기: wrangler dev 가 8787 에 떠 있어야 한다 (`.dev.vars` 에 LICENSE_SECRET·LICENSE_SALT).
 *   node test/issue-flags.mjs
 * 되돌려서 실패 확인: index.js `/license/issue` 의 `flags |= licFlags` 를 지우면 [3]·[4] 가 붉다.
 */
import assert from 'node:assert/strict';
import { mintCode, privateKeyFromSeed, testSeed, FLAG } from '../src/mint-core.js';
import { base64UrlDecode } from '../src/license.js';

const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const J = { 'Content-Type': 'application/json' };

const payloadOf = (token) => JSON.parse(new TextDecoder().decode(base64UrlDecode(token.split('.')[0])));
const issue = async (device) => {
  const r = await fetch(`${BASE_URL}/license/issue`, { method: 'POST', headers: J, body: JSON.stringify({ device }) });
  assert.equal(r.status, 200, 'issue 200');
  return r.json();
};
const openRoom = async (token, kind = 'guide') => fetch(`${BASE_URL}/room`, {
  method: 'POST', headers: { ...J, Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind })
});

async function main() {
  console.log('=== B-1 /license/issue carries redeemed license flags ===');
  const device = `dev-b1-${Date.now().toString(36)}`;
  const now = Date.now();

  // [1] 이용권 등록 전: 토큰은 0x02 뿐, /room guide 는 401
  const t0 = await issue(device);
  const p0 = payloadOf(t0.token);
  assert.equal(p0.flags & FLAG.host, 0, '[1] 등록 전 토큰에 0x01 이 없어야 한다');
  const r0 = await openRoom(t0.token);
  assert.equal(r0.status, 401, '[1] 등록 전 /room guide 는 401');
  console.log('[PASS] 1 before redeem: flags=0x%s, /room=%d', p0.flags.toString(16), r0.status);

  // [2] 관광 1일권(0x01, 기간 1일)을 이 기기로 등록
  const key0 = privateKeyFromSeed(testSeed());
  const code = mintCode({ keyId: 0, days: 1, exp: Math.floor(now / 1000) + 90 * 86400, flags: FLAG.host,
    cust: 'B' + Math.random().toString(36).slice(2, 7).toUpperCase(),   // 코드는 결정적이다 — 돌릴 때마다 다른 코드
    privateKey: key0 }).code;
  const rr = await fetch(`${BASE_URL}/license/redeem`, { method: 'POST', headers: J, body: JSON.stringify({ code, deviceId: device }) });
  const rd = await rr.json();
  assert.equal(rr.status, 200, `[2] redeem 200, got ${rr.status} ${JSON.stringify(rd)}`);
  assert.equal(rd.valid, true);
  assert.equal(rd.flags & FLAG.host, FLAG.host);
  console.log('[PASS] 2 redeem ok: flags=0x%s expiresAt=%s', rd.flags.toString(16), new Date(rd.expiresAt).toISOString());

  // [3] 등록 뒤 발급: 0x01 이 실리고, 만료는 이용권 끝(1일)을 넘지 않는다
  const t1 = await issue(device);
  const p1 = payloadOf(t1.token);
  assert.equal(p1.flags & FLAG.host, FLAG.host, '[3] 등록 뒤 토큰에 0x01 이 실려야 한다');
  assert.equal(p1.flags & 0x02, 0x02, '[3] 0x02(camera) 는 그대로');
  assert.equal(p1.flags & 0x10, 0, '[3] 0x10 은 호스트 코드에 자동 포함 없음 (MASTER 09:52)');
  assert.ok(t1.exp * 1000 <= rd.expiresAt + 5000, '[3] 토큰 만료 ≤ 이용권 끝');
  assert.ok(t1.exp * 1000 > now + 23 * 3600 * 1000, '[3] 토큰 만료 ≈ 1일 뒤');
  console.log('[PASS] 3 after redeem: flags=0x%s exp=%s', p1.flags.toString(16), new Date(t1.exp * 1000).toISOString());

  // [4] 그 토큰으로 /room guide 가 열린다
  const r1 = await openRoom(t1.token);
  const d1 = await r1.json();
  assert.equal(r1.status, 200, `[4] /room guide 200, got ${r1.status} ${JSON.stringify(d1)}`);
  assert.ok(d1.code && d1.host_token);
  console.log('[PASS] 4 /room guide opened: code=%s', d1.code);

  // [5] 다른 기기는 그대로 0x02 뿐 — 색인이 기기별이다
  const t2 = await issue(`${device}-other`);
  assert.equal(payloadOf(t2.token).flags & FLAG.host, 0, '[5] 다른 기기 토큰에 0x01 이 없어야 한다');
  console.log('[PASS] 5 other device untouched');

  console.log('\n=== B-1 issue-flags: 5/5 PASS ===');
}

main().catch((e) => { console.error('\n*** B-1 issue-flags FAILED ***', e.message); process.exit(1); });
