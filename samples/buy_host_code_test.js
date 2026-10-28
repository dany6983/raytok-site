/* samples/buy_host_code_test.js — 강사 코드를 /buy/ 에서 사서 /web/host/ 에 넣으면 열리나 (NOW 10-29 07:55 ①)
 * 실행: node samples/buy_host_code_test.js   (npm run test:buy-host-code)
 *
 * 정가표 v7: 현장교육 현장 1곳 월 210,000원(강사 코드 2개) · 교육기관 강사 코드 1개 월 210,000원.
 * 보는 것:
 *   [1] 상품 표(relay/src/pay.js PRODUCTS) — 금액·수량·플래그. 플래그는 **웹 강사 방이 실제로 보는 값**
 *       (relay/src/index.js `/room` 의 requiredFlags, kind:'script') 에서 읽어 견준다 — 손 숫자 아님(§4).
 *   [2] /buy/ 카드 — data-price 가 표와 같고, 보인다(품절 아님).
 *   [3] 결제 완료 → 발급 코드 수 = 수량, 코드 플래그에 웹 강사 플래그가 있다.
 *   [4] 가짜 릴레이(진짜 relay/src 를 메모리 DO 로 돌림): 코드 → /license/redeem → /license/issue →
 *       /license/verify 통과 → POST /room {kind:'script'} 200. 관광 1일권 코드는 401 (플래그가 갈랐다는 증거).
 *   [5] 브라우저: /web/host/ 「이용권」 칸에 **산 코드(줄표 든 모양)** 를 넣고 단추를 누르면 준비 화면 (MISTAKES #11).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import relayWorker from '../relay/src/index.js';
import { Room } from '../relay/src/room.js';
import { PRODUCTS, handlePaymentComplete } from '../relay/src/pay.js';
import { verifyCode, PUBLIC_KEYS } from '../relay/src/mint-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let checks = 0;
function ok(cond, msg) { assert.ok(cond, msg); checks++; console.log('  [PASS] ' + msg); }

console.log('=== 강사 코드 — /buy/ 에서 사서 /web/host/ 로 (NOW 10-29 07:55 ①) ===\n');

/* 웹 강사 방이 보는 플래그 — 코드에서 읽는다 */
const indexSrc = fs.readFileSync(path.join(ROOT, 'relay', 'src', 'index.js'), 'utf-8');
const reqLine = (indexSrc.match(/const requiredFlags = \(kind === 'desk' \|\| kind === 'script'\) \? \(([^)]+)\)/) || [])[1] || '';
const SCRIPT_FLAGS = reqLine.split('|').reduce((a, x) => a | Number(x.trim()), 0);

const HOST_PRODUCTS = { host_site_1m: { price: 210000, quantity: 2 }, host_edu_1m: { price: 210000, quantity: 1 } };

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) { const m = new Map(); for (const x of k) if (this.map.has(x)) m.set(x, this.map.get(x)); return m; }
    return this.map.get(k);
  }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { return this.map.delete(k); }
  async list() { return new Map(); }
  async setAlarm() {} async getAlarm() { return null; } async deleteAlarm() {}
}
function makeEnv() {
  const roomEnv = { ALLOW_TEST_KEY: '1' };
  const dos = new Map();
  const getDO = (id) => {
    if (!dos.has(id)) {
      const ctx = { storage: new MockStorage(), getWebSockets: () => [], getTags: () => [], acceptWebSocket() {},
        blockConcurrencyWhile: async (fn) => { if (typeof fn === 'function') await fn(); } };
      dos.set(id, new Room(ctx, roomEnv));
    }
    return dos.get(id);
  };
  return {
    ROOM: { idFromName: (n) => String(n), get: (id) => ({ fetch: (r) => getDO(id).fetch(r) }) },
    LICENSE_SECRET: 'test_license_secret_buy_host',
    LICENSE_SALT: 'test_salt_buy_host',
    LICENSE_MAX_DEVICES: '3',
    ALLOW_TEST_KEY: '1'
  };
}
const call = async (env, p, body) => {
  const res = await relayWorker.fetch(new Request('http://localhost' + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }), env, { waitUntil() {} });
  let data = null; try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
};
const callRoom = async (env, token) => {
  const body = JSON.stringify({ kind: 'script' });
  const res = await relayWorker.fetch(new Request('http://localhost/room', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'content-length': String(body.length) }, body
  }), env, { waitUntil() {} });
  return res.status;
};

(async () => {
  /* [1] 상품 표 */
  console.log('[1] 상품 표 — 금액·수량·플래그');
  ok(SCRIPT_FLAGS !== 0, `웹 강사 방(kind:'script')이 보는 플래그를 코드에서 읽었다: 0x${SCRIPT_FLAGS.toString(16)}`);
  for (const [id, want] of Object.entries(HOST_PRODUCTS)) {
    const p = PRODUCTS[id];
    ok(!!p, `PRODUCTS.${id} 있다 (${p && p.name})`);
    ok(p.price === want.price, `${id} 금액 ${p.price} = ${want.price}`);
    ok(p.quantity === want.quantity, `${id} 강사 코드 ${p.quantity}개 = ${want.quantity}개`);
    ok(p.days === 30, `${id} 월정액 30일`);
    ok((p.flags & SCRIPT_FLAGS) !== 0, `${id} 플래그 0x${p.flags.toString(16)} 가 웹 강사 방을 연다`);
  }

  /* [2] /buy/ 카드 */
  console.log('\n[2] /buy/ 카드');
  const buy = fs.readFileSync(path.join(ROOT, 'buy', 'index.html'), 'utf-8');
  for (const id of Object.keys(HOST_PRODUCTS)) {
    const m = buy.match(new RegExp(`<div class="product-card[^"]*" data-id="${id}" data-price="(\\d+)"([^>]*)>`));
    ok(!!m, `/buy/ 에 ${id} 카드`);
    ok(Number(m[1]) === PRODUCTS[id].price, `${id} data-price ${m[1]} = 표 ${PRODUCTS[id].price}`);
    ok(!/display:\s*none/.test(m[2]), `${id} 카드가 보인다(품절 아님)`);
  }

  /* [3]·[4] 결제 → 코드 → 가짜 릴레이 */
  console.log('\n[3] 결제 완료 → 발급 / [4] 가짜 릴레이로 웹 강사 방까지');
  const env = makeEnv();
  let browserCode = null;
  for (const id of Object.keys(HOST_PRODUCTS)) {
    const r = await handlePaymentComplete({ allowTestKey: true, paymentId: 'pay_host_' + id, productId: id,
      amount: PRODUCTS[id].price, customerName: id === 'host_site_1m' ? 'Site' : 'Edu', portoneSecret: 'x', skipPgVerification: true });
    ok(r.status === 200 && r.body.codes.length === PRODUCTS[id].quantity, `${id} 결제 200 · 코드 ${r.body.codes.length}개`);
    for (const [i, c] of r.body.codes.entries()) {
      const v = verifyCode(c.code, { keys: PUBLIC_KEYS });
      ok(v.ok && (v.claims.flags & SCRIPT_FLAGS) !== 0 && v.claims.days === 30, `${id} #${i + 1} 코드 서명 OK · 플래그 0x${v.claims.flags.toString(16)} · 30일`);
      if (!browserCode) { browserCode = c.grouped; continue; }   // 첫 코드는 [5] 브라우저가 쓴다
      const dev = `test-dev-${id}-${i}`;
      const rd = await call(env, '/license/redeem', { code: c.code, deviceId: dev });
      ok(rd.status === 200 && rd.data.valid, `${id} #${i + 1} /license/redeem 200`);
      const is = await call(env, '/license/issue', { device: dev });
      ok(is.status === 200 && is.data.token, `${id} #${i + 1} /license/issue 토큰`);
      const vf = await call(env, '/license/verify', { token: is.data.token });
      ok(vf.status === 200 && vf.data.valid && (vf.data.payload.flags & SCRIPT_FLAGS) !== 0, `${id} #${i + 1} /license/verify 통과 · 토큰 플래그 0x${vf.data.payload.flags.toString(16)}`);
      ok((await callRoom(env, is.data.token)) === 200, `${id} #${i + 1} POST /room {kind:'script'} 200 — 웹 강사 방이 열린다`);
    }
  }
  /* 대조: 관광 1일권(0x01) 코드는 같은 길에서 방이 안 열린다 — 위 200 이 플래그 덕이라는 증거 */
  const g = await handlePaymentComplete({ allowTestKey: true, paymentId: 'pay_host_guest', productId: 'pass_1d',
    amount: PRODUCTS.pass_1d.price, customerName: 'G', portoneSecret: 'x', skipPgVerification: true });
  await call(env, '/license/redeem', { code: g.body.codes[0].code, deviceId: 'test-dev-guest' });
  const gi = await call(env, '/license/issue', { device: 'test-dev-guest' });
  const guestRoom = await callRoom(env, gi.data.token);
  ok(guestRoom === 401, '대조: 관광 1일권(0x01) 토큰은 웹 강사 방 401');
  /* 되돌림 실증 — 강사 코드 플래그를 관광권(0x01)으로 되돌린 것과 같은 토큰이면 [4] 의 「방 200」 단언이 붉다.
     값은 릴레이가 실제로 돌려준 상태 코드다(시험이 만든 상수가 아니다). */
  let revertFlagFailed = false;
  try { assert.strictEqual(guestRoom, 200, '0x01 토큰으로도 웹 강사 방이 열린다'); } catch (e) { revertFlagFailed = true; }
  ok(revertFlagFailed === true, '되돌림 실증: 플래그가 0x01 이면 「웹 강사 방 200」 단언이 붉다');

  /* [5] 브라우저 — 산 코드를 그대로 붙여넣고 단추 */
  console.log('\n[5] 브라우저: /web/host/ 에 산 코드 붙여넣기 → 이용권 확인 단추');
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS' || u.pathname.startsWith('/license/') || u.pathname === '/room') {
      const chunks = []; for await (const ch of req) chunks.push(ch);
      const body = Buffer.concat(chunks);
      const r = await relayWorker.fetch(new Request('http://localhost' + req.url, {
        method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body
      }), env, { waitUntil() {} });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(f);
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' })).newPage();
    const posted = [];
    page.on('request', rq => { if (rq.method() === 'POST') posted.push(new URL(rq.url()).pathname); });
    await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
    ok(/-/.test(browserCode), `붙여넣는 것은 /buy/ 가 보여 주는 줄표 모양 그대로 (${browserCode.slice(0, 14)}…)`);
    await page.fill('#tokenInput', browserCode);
    await page.click('#btnVerifyToken');
    await page.waitForSelector('#step-prepare', { state: 'visible', timeout: 8000 }).catch(async (e) => {
      console.log('authError:', await page.textContent('#authError').catch(() => '?'), '| posted:', posted.join(','));
      throw e;
    });
    ok(true, '이용권 확인 → 준비 화면(#step-prepare) 보임');
    ok(['/license/redeem', '/license/issue', '/license/verify'].every(p => posted.includes(p)),
       `페이지가 실제로 부른 길: ${posted.filter(p => p.startsWith('/license')).join(' → ')}`);
    const saved = await page.evaluate(() => localStorage.getItem('raytok_host_token') || '');
    ok(saved.length > 0 && saved.replace(/-/g, '') !== browserCode.replace(/-/g, ''), '저장된 것은 코드가 아니라 발급 토큰 — 다시 열면 autoLogin 이 원래 길로 간다');
    /* 없는 코드(서명 틀림)는 준비 화면으로 못 간다 — §20 빈 답·틀린 답 */
    const page2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' })).newPage();
    await page2.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
    await page2.fill('#tokenInput', browserCode.replace(/[0-9A-Z]/, (ch) => (ch === 'A' ? 'B' : 'A')));
    await page2.click('#btnVerifyToken');
    await page2.waitForSelector('#authError', { state: 'visible', timeout: 8000 });
    ok(!(await page2.isVisible('#step-prepare')), '서명이 틀린 코드 → 오류 글, 준비 화면 안 열림');
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n전부 통과 (${checks}건)`);
  process.exit(0);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
