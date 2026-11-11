/* samples/listener_1111c_test.mjs — 웹 3차 손님 쪽 (NOW 11-11 14:59 ②③④)
 * 실행: node samples/listener_1111c_test.mjs   (npm run test:listener-1111c)
 *
 *  [②] 레이팩 준비된 손님 → 방에 `tr_need srv:0` 한 번(서버 번역 필요 없음) · 받는 중이면 안 보냄
 *       · 레이팩이 줄을 놓치면(빈 답) `srv:1 seq:n` → 방이 보낸 그 줄 서버 글이 화면에(R-15)
 *       거울: `?rpNoSrv=0` 이면 tr_need 0
 *  [③] 확인 카드 — 처음엔 접힌 띠 한 줄(확인 단추 숨김) · 번역 목록 높이 ≥ 화면 반 · 누르면 펼침(단추 보임) · 펼쳐도 ≥ 반
 *       거울: `?cfFold=0` 이면 처음부터 펼침(붉음)
 *  [④] 가짜 iOS(wakeLock 거절) → 소리 없는 영상 play 1회 · 기록 `wake ios=1 api=fail video=play`
 *       · iOS + wakeLock 됨 → 그래도 영상(둘 다) · 안드로이드 + wakeLock 됨 → 영상 0 · 안드로이드 거절 → 영상
 *       거울: `?wakeBoth=0` 이면 iOS 거절에서 영상 0
 * 레이팩은 가짜 모듈(raypack_one_path_1111 과 같은 꼴), 손님 페이지 코드는 진짜다.
 */
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FAKE_RP = `export function createRaypack(o) {
  return { want: () => { (window.__rpWant = (window.__rpWant || 0) + 1); if (window.__rpMode !== 'loading') setTimeout(() => o.log('raypack_state ready me=vi v=t'), 50); },
           ready: () => window.__rpMode !== 'loading', state: () => window.__rpMode === 'loading' ? 'loading' : 'ready',
           translate: (t) => new Promise(r => setTimeout(() => r(window.__rpMode === 'empty' ? null : 'RP:' + t), 200)) };
}`;
const FAKE_TTS = `(() => {
  function U(t) { this.text = t; this.lang = ''; this.voice = null; }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
  const list = [{ lang: 'vi-VN', name: 'Fake vi', voiceURI: 'fake:vi', localService: true, default: true }];
  const api = { getVoices: () => list, speak: (u) => { setTimeout(() => u.onend && u.onend({}), 30); },
                cancel: () => {}, pause: () => {}, resume: () => {}, onvoiceschanged: null, speaking: false, paused: false, pending: false };
  Object.defineProperty(window, 'speechSynthesis', { get: () => api, configurable: true });
})();`;
/* 영상 play 를 센다 — 헤드리스는 data: mp4 를 못 틀 수 있어 늘 됨으로 */
const COUNT_PLAY = `(() => { window.__plays = 0; HTMLMediaElement.prototype.play = function () { if (this.tagName === 'VIDEO') window.__plays++; return Promise.resolve(); }; })();`;
const WAKE = (mode) => `(() => {
  const m = ${JSON.stringify(mode)};
  if (m === 'none') { try { delete Navigator.prototype.wakeLock; } catch (e) {} return; }
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => m === 'ok'
    ? Promise.resolve({ addEventListener() {}, release() { return Promise.resolve(); } })
    : Promise.reject(new Error('NotAllowedError')) } });
})();`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => { if (raw.toString().includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'trial', src_lang: 'ko', kr: 1 })); });
  });
}

async function guest(browser, base, relay, { q = '', rp = 'ready', ua = ANDROID, wake = 'ok' } = {}) {
  const room = relay.newRoom('guide');
  const host = await openHost(base, room);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', userAgent: ua });
  await ctx.addInitScript(FAKE_TTS + COUNT_PLAY + WAKE(wake) + `;window.__rpMode=${JSON.stringify(rp)};`);
  await ctx.route(/\/web\/listener\/raypack\.js/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_RP }));
  const page = await ctx.newPage();
  await page.goto(`${base}/web/listener/?room=${room.code}&lang=vi${q}`);
  await page.click('#btn-join');
  await page.waitForSelector('#chat-screen', { state: 'visible' });
  return { room, host, ctx, page };
}

async function partRp(browser, base, relay) {
  console.log('\n[②] 레이팩 손님 — 서버 번역 필요 없음 알림 · 놓친 줄만 청함');
  {
    const g = await guest(browser, base, relay, { rp: 'ready' });
    await g.page.waitForFunction(() => window.__rpWant > 0, null, { timeout: 5000 });
    await sleep(400);
    ok(JSON.stringify(g.room.trNeed || []) === JSON.stringify([{ srv: 0 }]), `준비됨 → tr_need srv:0 한 번 (${JSON.stringify(g.room.trNeed || [])})`);
    const log = await g.page.evaluate(() => window.rtTrPlan.log().filter((l) => /^tr_need/.test(l)));
    ok(log.length === 1 && /tr_need srv=0 why=state/.test(log[0]), `기록 ${JSON.stringify(log)}`);
    g.host.close(); await g.ctx.close();
  }
  {
    const g = await guest(browser, base, relay, { rp: 'loading' });
    await g.page.waitForFunction(() => window.__rpWant > 0, null, { timeout: 5000 });
    await sleep(400);
    ok(!(g.room.trNeed || []).length, '받는 중 → tr_need 0 (방 기본 = 서버 번역 필요)');
    g.host.close(); await g.ctx.close();
  }
  {
    const g = await guest(browser, base, relay, { rp: 'empty' });
    await g.page.waitForFunction(() => window.__rpWant > 0, null, { timeout: 5000 });
    await sleep(300);
    g.host.send(JSON.stringify({ seq: 7, text: '안전모를 쓰세요', src_lang: 'ko', broadcast: true }));
    await sleep(500);
    const need = g.room.trNeed || [];
    ok(need.length === 2 && need[1].srv === 1 && need[1].seq === 7, `레이팩 빈 답 → srv:1 seq:7 (${JSON.stringify(need)})`);
    g.host.send(JSON.stringify({ seq: 7, tr: { vi: 'SRV:Đội mũ bảo hộ' } }));   // 방이 그 줄만 사서 보낸다
    await sleep(300);
    const tr = await g.page.evaluate(() => (document.querySelector('#msg-7 .msg-tr') || {}).textContent || '');
    ok(/SRV:/.test(tr), `그 줄 서버 글이 화면에 — 유실 0 ("${tr}")`);
    g.host.close(); await g.ctx.close();
  }
  {
    const g = await guest(browser, base, relay, { rp: 'ready', q: '&rpNoSrv=0' });
    await g.page.waitForFunction(() => window.__rpWant > 0, null, { timeout: 5000 });
    await sleep(400);
    ok(!(g.room.trNeed || []).length, '되돌림 실증(D-09): ?rpNoSrv=0 → tr_need 0 (옛 길 — 방이 계속 산다)');
    g.host.close(); await g.ctx.close();
  }
}

async function cardGeo(page) {
  return page.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && e.offsetHeight > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const list = document.getElementById('chat-list');
    const band = document.getElementById('cf-band');
    return { head: vis('cf-head'), btn: vis('btn-confirm'), priv: vis('cf-privacy'),
             band: band ? Math.round(band.getBoundingClientRect().height) : 0,
             list: Math.round(list.getBoundingClientRect().height), vh: window.innerHeight,
             next: band && band.nextElementSibling ? band.nextElementSibling.id : '' };
  });
}

async function partCard(browser, base, relay) {
  console.log('\n[③] 확인 카드 — 접힌 띠 한 줄');
  const g = await guest(browser, base, relay, { rp: 'loading' });
  for (let i = 1; i <= 12; i++) g.host.send(JSON.stringify({ seq: i, text: '줄 ' + i, src_lang: 'ko', broadcast: true }));
  g.host.send(JSON.stringify({ kind: 'confirm_open' }));
  await g.page.waitForFunction(() => { const b = document.getElementById('cf-band'); return b && getComputedStyle(b).display !== 'none' && document.getElementById('cf-head').offsetHeight > 0; }, null, { timeout: 8000 });
  await sleep(200);
  const a = await cardGeo(g.page);
  ok(a.head && !a.btn && !a.priv, `처음엔 머리 한 줄만 — 확인 단추·안내 숨김 (띠 ${a.band}px)`);
  ok(a.next === 'chat-list', '구조: #cf-band 는 #chat-list 바로 앞 형제(덮지 않는다 §12)');
  ok(a.list >= a.vh / 2, `접힘: 번역 목록 ${a.list}px ≥ 화면 반 ${a.vh / 2}px`);
  const headTxt = await g.page.textContent('#cf-head');
  const dict = require(path.join(ROOT, 'web/listener/ui-strings.json')).strings;
  ok(headTxt.startsWith(dict.cf_btn.vi), `머리 글자 = 기존 손님 말 cf_btn(vi) — 새 글자 0 ("${headTxt}")`);
  await g.page.click('#cf-head');
  await sleep(100);
  const b = await cardGeo(g.page);
  ok(b.btn && b.priv && (await g.page.getAttribute('#cf-head', 'aria-expanded')) === 'true', '누르면 펼침 — 안내·확인 단추 보임');
  ok(b.list >= b.vh / 2, `펼침: 번역 목록 ${b.list}px ≥ 화면 반 ${b.vh / 2}px (띠 ${b.band}px)`);
  await g.page.click('#cf-head');
  ok(!(await cardGeo(g.page)).btn, '다시 누르면 접힘');
  g.host.close(); await g.ctx.close();

  const m = await guest(browser, base, relay, { rp: 'loading', q: '&cfFold=0' });
  m.host.send(JSON.stringify({ kind: 'confirm_open' }));
  await m.page.waitForFunction(() => { const e = document.getElementById('btn-confirm'); return e && e.offsetHeight > 0; }, null, { timeout: 8000 });
  const c = await cardGeo(m.page);
  ok(!c.head && c.btn, '되돌림 실증(D-09): ?cfFold=0 → 처음부터 펼친 카드(접힌 띠 없음)');
  m.host.close(); await m.ctx.close();
}

async function wakeRun(browser, base, relay, ua, wake, q) {
  const g = await guest(browser, base, relay, { rp: 'loading', ua, wake, q: q || '' });
  await g.page.waitForFunction(() => window.rtWake && window.rtWake.log().length > 0, null, { timeout: 5000 });
  const r = await g.page.evaluate(() => ({ plays: window.__plays, log: window.rtWake.log() }));
  g.host.close(); await g.ctx.close();
  return r;
}

async function partWake(browser, base, relay) {
  console.log('\n[④] 아이폰 자동 잠금 — 둘 다 걸기');
  const a = await wakeRun(browser, base, relay, IPHONE, 'fail');
  ok(a.plays === 1 && a.log[0] === 'wake ios=1 api=fail video=play', `iOS · wakeLock 거절 → 영상 play 1회 (${a.plays} · ${a.log[0]})`);
  const b = await wakeRun(browser, base, relay, IPHONE, 'ok');
  ok(b.plays === 1 && b.log[0] === 'wake ios=1 api=ok video=play', `iOS · wakeLock 됨 → 그래도 영상 (둘 다) (${b.log[0]})`);
  const c = await wakeRun(browser, base, relay, ANDROID, 'ok');
  ok(c.plays === 0 && c.log[0] === 'wake ios=0 api=ok video=off', `안드로이드 · wakeLock 됨 → 영상 0 (${c.log[0]})`);
  const d = await wakeRun(browser, base, relay, ANDROID, 'fail');
  ok(d.plays === 1 && d.log[0] === 'wake ios=0 api=fail video=play', `안드로이드 · 거절 → 영상으로 넘어감 (${d.log[0]})`);
  const m = await wakeRun(browser, base, relay, IPHONE, 'fail', '&wakeBoth=0');
  ok(m.plays === 0, `되돌림 실증(D-09): ?wakeBoth=0 → iOS 거절에도 영상 0 (옛 길 — ${m.log[0]})`);
}

(async () => {
  console.log('=== 웹 3차 손님 — 레이팩 서버 끄기 · 접힌 확인 띠 · 아이폰 잠금 (11-11 ②③④) ===');
  const relay = createMockRelay({ root: ROOT, roomTranslate: false });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try { await partRp(browser, base, relay); await partCard(browser, base, relay); await partWake(browser, base, relay); }
  catch (e) { console.error('[FAIL]', e && e.message || e); process.exitCode = 1; }
  finally { await browser.close(); relay.close(); }
  console.log(`\n=== ${pass} PASS ===`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
