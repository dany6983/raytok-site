/* samples/raypack_one_path_1111_test.mjs — 손님 크롬 레이팩: 한 줄 = 번역 길 하나 · 멈춤 감지 이어받기 (NOW 11-11 13:28 ⑥⑧)
 * 실행: node samples/raypack_one_path_1111_test.mjs   (npm run test:raypack-one-path)
 *
 *  [1] getPack — 받다가 멈춘다(0바이트) → 멈춤 상한 뒤 끊고 `Range: bytes=<받은 수>-` 로 이어받는다 · 바이트 그대로
 *      · 서버가 206 을 안 주면 처음부터 · 이어받기 상한을 넘으면 실패(무한히 돌지 않는다)
 *  [2] 손님 화면 — 레이팩이 준비된 폰에서 서버 번역이 **먼저** 와도 그 줄은 레이팩 글 하나(읽기 1번, 기록 한 줄)
 *      · 레이팩이 빈 답이면 쥐고 있던 서버 글로(R-15) · 레이팩 받는 중 줄은 서버 글
 *  거울(D-09): `?trone=0` 이면 [2] 가 서버 글을 보인다(붉음) · LIMIT.resumes=0 이면 [1] 실패
 *
 * 레이팩 엔진은 가짜 모듈로 바꿔 낀다(헤드리스에 모델 60MB 를 받지 않는다) — 바꾸는 것은 `raypack.js` 하나,
 * 손님 페이지 코드는 진짜다.
 */
import http from 'http';
import path from 'path';
import assert from 'assert';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 팩 흉내 서버 — 첫 요청은 stallAt 바이트 뒤 멈춘다(연결은 열어 둔 채). Range 를 받으면 그 뒤를 준다 */
function packServer(body, { stallAt, range = true }) {
  const seen = [];
  const srv = http.createServer((q, r) => {
    const rg = q.headers.range;
    seen.push(rg || 'full');
    const m = range && rg && /^bytes=(\d+)-$/.exec(rg);
    if (m) {
      const from = Number(m[1]);
      r.writeHead(206, { 'content-length': body.length - from, 'content-range': `bytes ${from}-${body.length - 1}/${body.length}` });
      return r.end(body.subarray(from));
    }
    r.writeHead(200, { 'content-length': body.length });
    if (seen.length === 1) { r.write(body.subarray(0, stallAt)); return; }   // 멈춤 — 끝내지 않는다
    r.end(body);
  });
  return new Promise((res) => srv.listen(0, () => res({ srv, seen, url: `http://127.0.0.1:${srv.address().port}` })));
}

async function part1() {
  console.log('\n[1] getPack 멈춤 감지 · 이어받기');
  const probe = await import(pathToFileURL(path.join(ROOT, 'web/raypack-probe/probe.js')).href);
  ok(probe.LIMIT.stall === 10000, `멈춤 상한 10초 (${probe.LIMIT.stall}ms) — 전체 시간 상한이 아니다`);
  probe.LIMIT.stall = 400;                                   // 시험은 짧게
  const body = Buffer.alloc(300000); for (let i = 0; i < body.length; i++) body[i] = (i * 7) & 255;
  {
    const s = await packServer(body, { stallAt: 120000 });
    const got = await probe.getPack({ file: 'p.zip', bytes: body.length }, { base: s.url, useCache: false });
    ok(Buffer.from(got.bytes).equals(body), `멈춘 뒤 이어받아 바이트 그대로 (${got.bytes.length}B)`);
    ok(s.seen.length === 2 && s.seen[1] === 'bytes=120000-', `둘째 요청 = Range ${s.seen[1]}`);
    s.srv.close(); s.srv.closeAllConnections && s.srv.closeAllConnections();
  }
  {
    const s = await packServer(body, { stallAt: 50000, range: false });
    const got = await probe.getPack({ file: 'p.zip', bytes: body.length }, { base: s.url, useCache: false });
    ok(Buffer.from(got.bytes).equals(body), '서버가 206 을 안 주면 처음부터 받아 그대로');
    s.srv.close(); s.srv.closeAllConnections && s.srv.closeAllConnections();
  }
  {
    const keep = probe.LIMIT.resumes; probe.LIMIT.resumes = 0;   // 거울: 이어받기 없으면 멈춤에서 실패
    const s = await packServer(body, { stallAt: 50000 });
    let err = null;
    try { await probe.getPack({ file: 'p.zip', bytes: body.length }, { base: s.url, useCache: false }); } catch (e) { err = e; }
    ok(err && /멈췄다/.test(err.message), `되돌림 실증: 이어받기 0 → 실패 (${err && err.message.slice(0, 30)})`);
    probe.LIMIT.resumes = keep;
    s.srv.close(); s.srv.closeAllConnections && s.srv.closeAllConnections();
  }
}

/* 가짜 레이팩 — 준비됨 · 한 줄 300ms. window.__rpMode='empty' 면 빈 답 */
const FAKE_RP = `export function createRaypack(o) {
  return { want: () => { (window.__rpWant = (window.__rpWant || 0) + 1); },
           ready: () => window.__rpMode !== 'loading', state: () => window.__rpMode === 'loading' ? 'loading' : 'ready',
           translate: (t) => { window.__rpCalls = (window.__rpCalls || 0) + 1;
             return new Promise(r => setTimeout(() => r(window.__rpMode === 'empty' ? null : 'RP:' + t), 300)); } };
}`;
const FAKE_TTS = `(() => {
  function U(t) { this.text = t; this.lang = ''; this.voice = null; }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
  const list = [{ lang: 'vi-VN', name: 'Fake vi', voiceURI: 'fake:vi', localService: true, default: true }];
  const api = { getVoices: () => list, speak: (u) => { (window.__said = window.__said || []).push(String(u.text)); setTimeout(() => u.onend && u.onend({}), 30); },
                cancel: () => {}, pause: () => {}, resume: () => {}, onvoiceschanged: null, speaking: false, paused: false, pending: false };
  Object.defineProperty(window, 'speechSynthesis', { get: () => api, configurable: true });
})();`;

function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => { if (raw.toString().includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'trial', src_lang: 'ko', kr: 1 })); });
  });
}

async function guest(browser, base, relay, q, mode) {
  const room = relay.newRoom('guide');
  const host = await openHost(base, room);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  await ctx.addInitScript(FAKE_TTS + `;window.__rpMode=${JSON.stringify(mode)};`);
  await ctx.route(/\/web\/listener\/raypack\.js/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_RP }));
  const page = await ctx.newPage();
  await page.goto(`${base}/web/listener/?room=${room.code}&lang=vi${q}`);
  await page.click('#btn-join');
  await page.waitForSelector('#chat-screen', { state: 'visible' });
  await page.waitForFunction(() => window.__rpWant > 0, null, { timeout: 5000 });
  host.send(JSON.stringify({ seq: 7, text: '안전모를 쓰세요', src_lang: 'ko', broadcast: true }));
  await sleep(80);
  host.send(JSON.stringify({ seq: 7, tr: { vi: 'SRV:Đội mũ bảo hộ' } }));    // 서버 글이 레이팩보다 먼저 온다
  await sleep(900);
  const r = await page.evaluate(() => ({
    tr: (document.querySelector('#msg-7 .msg-tr') || {}).textContent || '',
    said: (window.__said || []).filter(Boolean), calls: window.__rpCalls || 0,
    plan: window.rtTrPlan.log().filter(l => /seq=7\b/.test(l)) }));
  host.close(); await ctx.close();
  return r;
}

async function part2() {
  console.log('\n[2] 손님 화면 — 한 줄 = 번역 길 하나');
  const relay = createMockRelay({ root: ROOT, roomTranslate: false });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    const a = await guest(browser, base, relay, '', 'ready');
    ok(/^RP:안전모를 쓰세요/.test(a.tr) && !/SRV/.test(a.tr), `서버 글이 먼저 와도 화면은 레이팩 글 하나 ("${a.tr}")`);
    ok(a.said.length === 1 && /^RP:/.test(a.said[0]), `읽기 1번 — 레이팩 글 (${JSON.stringify(a.said)})`);
    ok(a.plan.length === 1 && /plan=raypack/.test(a.plan[0]), `기록 한 줄 ${JSON.stringify(a.plan)}`);
    const b = await guest(browser, base, relay, '', 'empty');
    ok(/SRV:/.test(b.tr) && b.said.length === 1 && /SRV:/.test(b.said[0]), `레이팩 빈 답 → 쥐고 있던 서버 글 ("${b.tr}" · 읽기 ${b.said.length})`);
    ok(b.plan.length === 1 && /plan=server .*why=empty/.test(b.plan[0]), `기록 한 줄 ${JSON.stringify(b.plan)}`);
    const c = await guest(browser, base, relay, '', 'loading');
    ok(/SRV:/.test(c.tr) && c.calls === 0, `레이팩 받는 중 → 그 줄은 서버 글 · 레이팩 안 부름 (${c.calls})`);
    const m = await guest(browser, base, relay, '&trone=0', 'ready');
    ok(/SRV:/.test(m.tr), `되돌림 실증(D-09): ?trone=0 → 서버 글이 남는다 ("${m.tr}") — 두 길이 같이 돈다`);
  } finally {
    await browser.close();
    relay.close();
  }
}

(async () => {
  console.log('=== 레이팩 — 한 줄 = 길 하나 · 멈춤 감지 이어받기 (11-11 ⑥) ===');
  try { await part1(); await part2(); }
  catch (e) { console.error('[FAIL]', e && e.message || e); process.exitCode = 1; }
  console.log(`\n=== ${pass} PASS ===`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
