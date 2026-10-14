/**
 * B-3 정정판 (대표님 2026-10-14 08:39·08:41, MASTER 09:50·09:52) — `/translate` 는 0x10 패키지만.
 *
 *   · 0x10(인터넷 번역 패키지) 없는 토큰 → 403 not_allowed, why=no_package. 무료 한도 없음.
 *   · 호스트 코드(0x01) 에 0x10 자동 포함 없음 — /license/issue 가 주는 토큰(0x02[+0x01]) 도 403.
 *   · Desk(0x04|0x08) 는 시간 묶음 상품이라 지금처럼 지나간다.
 *   · 글자 세기(TRANSLATE_CAP_CHARS)는 패키지 안에서만 — 거절된 요청은 사용량에 안 쌓인다.
 *
 * 돌리기: wrangler dev 8787 + `.dev.vars` 에 LICENSE_SECRET·LICENSE_SALT·ADMIN_SECRET (mock 엔진은 admin 만).
 *   node test/translate-pkg.mjs
 * 되돌려서 실패 확인: index.js 의 `TRANSLATE_PKG_FLAG | TRANSLATE_DESK_FLAGS` 를 옛 `0x02 | 0x04 | 0x10` 으로
 * 돌리면 [1]·[2] 가 붉다(0x02 가 200 으로 열린다).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const devVars = (() => {
  const p = path.resolve(__dirname, '../.dev.vars');
  const o = {};
  if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); }
  return o;
})();
const secret = process.env.LICENSE_SECRET || devVars.LICENSE_SECRET;
const adminSecret = process.env.ADMIN_SECRET || devVars.ADMIN_SECRET;
assert.ok(secret, 'LICENSE_SECRET 필요');

const rnd = Math.random().toString(36).slice(2);
const tr = async (token, text = `패키지 시험 ${rnd}`) => {
  const res = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
               ...(adminSecret ? { 'X-Admin-Secret': adminSecret, 'X-Translate-Engine': 'mock' } : {}) },
    body: JSON.stringify({ q: [text], source: 'ko', target: 'en' })
  });
  let data = null; try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
};
const usedChars = async (sub) => {
  const month = new Date().toISOString().slice(0, 7);
  const r = await fetch(`${BASE_URL}/usage?month=${month}&sub=${encodeURIComponent(sub)}`,
    { headers: adminSecret ? { 'X-Admin-Secret': adminSecret } : {} });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.subs && d.subs[sub]) ? (d.subs[sub].total_chars || 0) : (d.total_chars || 0);
};

async function main() {
  console.log('=== B-3 /translate requires 0x10 package (Desk 0x04|0x08 kept) ===');
  const mk = (flags, tag) => mintLicenseToken({ sub: `pkg-${tag}-${rnd}`, days: 1, flags, secret });

  // [1] 0x02 (camera, /license/issue 기본) → 403 no_package
  const r1 = await tr(mk(0x02, 'cam'));
  assert.equal(r1.status, 403, `[1] 0x02 → 403, got ${r1.status} ${JSON.stringify(r1.data)}`);
  assert.equal(r1.data.error, 'not_allowed');
  assert.equal(r1.data.why, 'no_package');
  console.log('[PASS] 1 0x02 camera-only → 403 no_package');

  // [2] 0x01|0x02 (호스트 코드 등록한 기기의 issue 토큰 모양) → 403 — 0x10 자동 포함 없음
  const r2 = await tr(mk(0x01 | 0x02, 'host'));
  assert.equal(r2.status, 403, `[2] 0x01|0x02 → 403, got ${r2.status}`);
  assert.equal(r2.data.why, 'no_package');
  console.log('[PASS] 2 host 0x01|0x02 → 403 (0x10 은 별도 구매)');

  // [3] 토큰 없음 → 401 (전과 같다 — 403 보다 먼저)
  const r3 = await fetch(`${BASE_URL}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: ['x'], target: 'en' }) });
  assert.equal(r3.status, 401);
  console.log('[PASS] 3 no token → 401');

  if (!adminSecret) {
    console.log('[SKIP] 4~6: ADMIN_SECRET 없음 — mock 엔진을 못 켠다 (0x10·Desk 200 경로는 건너뜀)');
    console.log('\n=== B-3 translate-pkg: 3/3 PASS (3 skipped) ===');
    return;
  }

  // [4] 0x10 만 → 200
  const r4 = await tr(mk(0x10, 'pkg'));
  assert.equal(r4.status, 200, `[4] 0x10 → 200, got ${r4.status} ${JSON.stringify(r4.data)}`);
  assert.ok(Array.isArray(r4.data.t) && r4.data.t.length === 1);
  console.log('[PASS] 4 0x10 package → 200');

  // [5] Desk 0x08 · Meet 0x04 → 200 (지금처럼)
  for (const [f, tag] of [[0x08, 'desk'], [0x04, 'meet'], [0x04 | 0x08, 'deskmeet']]) {
    const r = await tr(mk(f, tag));
    assert.equal(r.status, 200, `[5] 0x${f.toString(16)} → 200, got ${r.status} ${JSON.stringify(r.data)}`);
  }
  console.log('[PASS] 5 Desk 0x04/0x08 → 200 (kept)');

  // [6] 글자 세기는 패키지 안에서만 — 거절된 0x02 요청의 sub 는 사용량 0, 0x10 은 글자가 쌓인다
  const text = `글자 세기 ${rnd} 가나다라`;
  const subCam = `pkg-count-cam-${rnd}`, subPkg = `pkg-count-pkg-${rnd}`;
  await tr(mintLicenseToken({ sub: subCam, days: 1, flags: 0x02, secret }), text);
  await tr(mintLicenseToken({ sub: subPkg, days: 1, flags: 0x10, secret }), text);
  await new Promise((r) => setTimeout(r, 300));
  const uc = await usedChars(subCam), up = await usedChars(subPkg);
  if (uc === null || up === null) {
    console.log('[SKIP] 6: /usage 를 못 읽었다');
  } else {
    assert.equal(uc, 0, `[6] 거절된 0x02 sub 사용량 0, got ${uc}`);
    assert.equal(up, text.length, `[6] 0x10 sub 사용량 = 글자 수 ${text.length}, got ${up}`);
    console.log('[PASS] 6 chars counted only inside the package (cam=%d, pkg=%d)', uc, up);
  }

  console.log('\n=== B-3 translate-pkg: all PASS ===');
}

main().catch((e) => { console.error('\n*** B-3 translate-pkg FAILED ***', e.message); process.exit(1); });
