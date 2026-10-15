/**
 * MASTER 2026-10-14 11:10 ② — `/usage` 패키지 글자 칸.
 *
 *   · 0x10 토큰으로 GET /usage → `package: { flag:16, month, chars }` — 이번 달 /translate 글자 수.
 *   · 0x10 없는 토큰(0x02·0x01) → `package: null`.
 *   · 감시선(TRANSLATE_CAP_CHARS)은 손님 비공개 — 토큰 응답에 `cap_chars` 가 없다.
 *   · 관리자 조회(X-Admin-Secret)에는 `package` 칸 자체가 없다(토큰 소유자에게만).
 *
 * 돌리기: wrangler dev 8787 + `.dev.vars` 에 LICENSE_SECRET·LICENSE_SALT·ADMIN_SECRET(mock 엔진).
 *   node test/usage-package.mjs
 * 되돌려서 실패 확인: index.js `/usage` 의 `packageCell` 블록을 지우면 [1]·[2] 가 붉다.
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
const usage = async (headers) => {
  const r = await fetch(`${BASE_URL}/usage`, { headers });
  let d = null; try { d = await r.json(); } catch (_) {}
  return { status: r.status, d };
};
const tr = (token, text) => fetch(`${BASE_URL}/translate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
             ...(adminSecret ? { 'X-Admin-Secret': adminSecret, 'X-Translate-Engine': 'mock' } : {}) },
  body: JSON.stringify({ q: [text], source: 'ko', target: 'en' })
});

async function main() {
  console.log('=== ② /usage package cell (0x10 token only, no cap to customer) ===');
  const month = new Date().toISOString().slice(0, 7);
  const subPkg = `upkg-${rnd}`;
  const tokPkg = mintLicenseToken({ sub: subPkg, days: 1, flags: 0x10, secret });
  const tokCam = mintLicenseToken({ sub: `ucam-${rnd}`, days: 1, flags: 0x02, secret });
  const tokHost = mintLicenseToken({ sub: `uhost-${rnd}`, days: 1, flags: 0x01 | 0x02, secret });

  // [1] 0x10 토큰: 아직 0자 → package.chars 0, 그 뒤 번역(mock) 한 번 → 글자 수만큼
  let r = await usage({ Authorization: `Bearer ${tokPkg}` });
  assert.equal(r.status, 200, `[1] 200, got ${r.status}`);
  assert.ok(r.d.package && typeof r.d.package === 'object', `[1] package 칸이 있어야 한다: ${JSON.stringify(r.d.package)}`);
  assert.equal(r.d.package.flag, 0x10);
  assert.equal(r.d.package.month, month);
  assert.equal(r.d.package.chars, 0);
  if (adminSecret) {
    const text = `패키지 글자 ${rnd}`;
    const t = await tr(tokPkg, text);
    assert.equal(t.status, 200, `[1] mock translate 200, got ${t.status}`);
    await new Promise((res) => setTimeout(res, 300));
    r = await usage({ Authorization: `Bearer ${tokPkg}` });
    assert.equal(r.d.package.chars, text.length, `[1] chars = ${text.length}, got ${r.d.package.chars}`);
    console.log('[PASS] 1 0x10 token → package {flag:16, month, chars=%d}', r.d.package.chars);
  } else {
    console.log('[PASS] 1 0x10 token → package {flag:16, month, chars:0} (ADMIN_SECRET 없음 — 번역 후 증가는 건너뜀)');
  }

  // [2] 0x10 없는 토큰 → package: null (칸은 있고 값이 null)
  for (const [tok, tag] of [[tokCam, '0x02'], [tokHost, '0x01|0x02']]) {
    const x = await usage({ Authorization: `Bearer ${tok}` });
    assert.equal(x.status, 200);
    assert.ok('package' in x.d, `[2] ${tag}: package 칸이 있어야 한다`);
    assert.equal(x.d.package, null, `[2] ${tag}: package null, got ${JSON.stringify(x.d.package)}`);
  }
  console.log('[PASS] 2 tokens without 0x10 → package: null');

  // [3] 감시선 비공개 — 토큰 응답에 cap_chars 없음
  assert.equal(r.d.cap_chars, undefined, '[3] cap_chars 가 손님 응답에 있으면 안 된다');
  assert.ok(!JSON.stringify(r.d.package).includes('cap'), '[3] package 안에도 cap 없음');
  console.log('[PASS] 3 no cap in customer response');

  // [4] 관리자 조회에는 package 칸이 없다 (토큰 소유자에게만)
  if (adminSecret) {
    const a = await usage({ 'X-Admin-Secret': adminSecret });
    assert.equal(a.status, 200);
    assert.ok(!('package' in a.d), '[4] 관리자 응답에 package 칸 없음');
    console.log('[PASS] 4 admin response has no package cell');
  } else {
    console.log('[SKIP] 4 ADMIN_SECRET 없음');
  }

  console.log('\n=== ② usage-package: all PASS ===');
}

main().catch((e) => { console.error('\n*** ② usage-package FAILED ***', e.message); process.exit(1); });
