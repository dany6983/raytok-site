/* samples/listener_tts_cap_test.js — 손님 TTS 완료 신호 감시견 (NOW 11-03 18:45 ③)
 * 실행: node samples/listener_tts_cap_test.js   (npm run test:listener-tts-cap)
 *
 * 크롬 안드로이드는 긴 발화의 `onend` 를 가끔 안 낸다 — 그러면 문단의 남은 문장을 영영 안 읽는다.
 *  1. onend 안 주는 엔진 · 발화 둘 → tts_timeout 2 · tts_rebind 1 · 셋째 문장으로 간다
 *  2. 멀쩡한 엔진(400ms onend) → tts_timeout 0 (느린 읽기를 자르지 않는다)
 *  3. 스위치 ?ttscap=0 → onend 안 오면 첫 문장에서 선다 (옛 판 = 고친 것의 거울, D-09)
 * 4. ④ 실시간 줄 큐 + 5초 건너뜀 · ?ttsq=0 거울 · 첫 화면에는 싣지 않는다(37KB)
 * 지킴은 web/common/tts-guard.js — 손님이 방에 들어갈 때 싣는다.
 * 상한 셈은 앱 src/ttsCap.js timeoutMsFor 와 같아야 한다(5~30초, 1초 6글자 × 2).
 * 시간은 손님 페이지 Playwright 시계로 앞당긴다.
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');
const WebSocket = require('ws');

console.log('=== 손님 TTS 완료 신호 감시견 ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });
const PARA = 'First sentence one. Second sentence one. Third sentence one. Fourth sentence one.';

const FAKE_HOST = `
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) } });
`;
/* mute=true 면 onend 를 **안 준다**(묶인 엔진). 아니면 400ms 뒤 onend. cancel 은 onerror('interrupted') */
const fakeGuest = (mute) => `
  window.__tts = { speak: [], empty: 0, cancel: 0, interrupted: 0, ended: 0 };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } };
  (function () {
    let cur = null, timer = null, queue = [];
    function next() {
      cur = queue.shift() || null; S.speaking = !!cur;
      if (!cur || ${mute}) return;            // 묶인 엔진 — 지금 것이 영영 안 끝난다
      const u = cur;
      timer = setTimeout(() => { if (cur !== u) return; cur = null; window.__tts.ended += 1; if (u.onend) u.onend({}); if (!cur) next(); }, 400);
    }
    const S = {
      getVoices: () => [{ lang: 'en-US', name: 'en', localService: true, default: true }],
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      speak(u) {
        if (!u.text) { window.__tts.empty += 1; return; }
        window.__tts.speak.push(u.text);
        queue.push(u);                         // 진짜 규약: speak 는 줄 세운다
        if (!cur) next();
      },
      cancel() { window.__tts.cancel += 1; clearTimeout(timer); queue = []; const p = cur; cur = null; S.speaking = false;
        if (p) { window.__tts.interrupted += 1; if (p.onerror) p.onerror({ error: 'interrupted' }); } },
      pause() {}, resume() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: S });
  })();
`;

async function openGuest(browser, base, code, port, mute, extra) {
  const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await gctx.addInitScript(fakeGuest(mute));
  const g = await gctx.newPage();
  await g.clock.install();
  g.on('pageerror', e => console.log('GUEST ERROR:', e.message));
  await g.goto(`${base}/web/listener/?room=${code}&lang=en&auto=1&relay=localhost:${port}${extra || ''}`);
  await g.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
  await g.waitForFunction(() => !!window.rtTtsGuard, null, { timeout: 5000 });   // 들어갈 때 싣는다
  return { gctx, g };
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    const hctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
    await hctx.addInitScript(FAKE_HOST);
    const h = await hctx.newPage();
    await h.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
    await h.fill('#tokenInput', 'valid_instructor_token');
    await h.click('#btnVerifyToken');
    await h.waitForSelector('#step-prepare', { state: 'visible' });
    await h.evaluate((p) => {
      const dt = new DataTransfer();
      dt.items.add(new File([p + '\n\n' + p], 'g.txt', { type: 'text/plain' }));
      const input = document.getElementById('fileInput');
      input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, PARA);
    await h.waitForFunction(() => document.querySelectorAll('.para-item').length === 2);
    await h.click('#btnStartLecture');
    await h.waitForSelector('#step-live', { state: 'visible' });
    await h.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
    const code = (await h.textContent('#roomCode')).trim();

    /* 셈이 앱과 같다 */
    const a = await openGuest(browser, base, code, port, true);
    const cm = await a.g.evaluate(() => [window.rtTtsGuard.capMs(0), window.rtTtsGuard.capMs(19), window.rtTtsGuard.capMs(500), window.rtTtsGuard.state().cap]);
    ok(cm[0] === 5000 && cm[1] === 6334 && cm[2] === 30000 && cm[3] === true,
       `상한 셈 = 앱 timeoutMsFor (0자 ${cm[0]} · 19자 ${cm[1]} · 500자 ${cm[2]}) · 기본 켬`);

    /* 1. 묶인 엔진 */
    console.log('\n[1] onend 안 주는 엔진 — 2연속 → rebind 1');
    await h.click('#btnNext');
    await a.g.waitForFunction(() => window.__tts.speak.length >= 1 && window.rtRead.state(), null, { timeout: 6000 });
    ok(await a.g.evaluate(() => window.rtRead.state().idx) === 0, '첫 문장에서 시작');
    const capOf = () => a.g.evaluate(() => window.rtTtsGuard.capMs(window.__tts.speak[window.__tts.speak.length - 1].length));
    await a.g.clock.runFor(await capOf() + 100);
    let c = await a.g.evaluate(() => ({ cap: window.rtTtsGuard.state(), st: window.rtRead.state(), n: window.__tts.speak.length }));
    ok(c.cap.timeouts === 1 && c.cap.rebinds === 0 && c.st.idx === 1, `상한 넘음 → tts_timeout 1 · 둘째 문장으로 (idx ${c.st.idx})`);
    await a.g.clock.runFor(await capOf() + 100);
    c = await a.g.evaluate(() => ({ cap: window.rtTtsGuard.state(), st: window.rtRead.state(), empty: window.__tts.empty, log: window.rtRead.log() }));
    ok(c.cap.timeouts === 2 && c.cap.rebinds === 1, `연속 2번 → tts_rebind 1 (timeouts ${c.cap.timeouts}, rebinds ${c.cap.rebinds})`);
    ok(c.empty >= 1, '되묶기 = cancel 뒤 빈 발화 하나');
    ok(c.st.idx === 2, `셋째 문장으로 넘어간다 (idx ${c.st.idx})`);
    ok(c.log.some(l => /^tts_timeout /.test(l)) && c.log.some(l => /^tts_rebind /.test(l)), '기록 tts_timeout · tts_rebind');
    await a.gctx.close();

    /* 2. 멀쩡한 엔진 */
    console.log('\n[2] 멀쩡한 엔진 — 자르지 않는다');
    const b = await openGuest(browser, base, code, port, false);
    await h.click('#btnNext');
    await b.g.waitForFunction(() => window.__tts.speak.length >= 1, null, { timeout: 6000 });
    await b.g.clock.runFor(40000);
    const bc = await b.g.evaluate(() => ({ cap: window.rtTtsGuard.state(), n: window.__tts.speak.length }));
    ok(bc.cap.timeouts === 0 && bc.cap.rebinds === 0, `onend 가 오면 tts_timeout 0 (읽은 문장 ${bc.n})`);
    ok(bc.n === 4, '네 문장 다 읽는다');
    await b.gctx.close();

    /* 3. 스위치 끔 — 옛 판은 선다 */
    console.log('\n[3] ?ttscap=0 — 옛 판은 첫 문장에서 선다 (거울)');
    const d = await openGuest(browser, base, code, port, true, '&ttscap=0');
    await h.click('#btnPrev').catch(() => {});
    await h.click('#btnNext');
    await d.g.waitForFunction(() => window.__tts.speak.length >= 1 && window.rtRead.state(), null, { timeout: 6000 });
    await d.g.clock.runFor(60000);
    const dc = await d.g.evaluate(() => ({ cap: window.rtTtsGuard.state(), st: window.rtRead.state() }));
    ok(dc.cap.cap === false && dc.st.idx === 0 && dc.cap.timeouts === 0, `되돌림 실증 ③ — 꺼진 판(?ttscap=0)은 60초가 지나도 idx ${dc.st.idx} — 그래서 감시견이 필요하다`);
    await d.gctx.close();

    /* 4. ④ 실시간 줄 — 순서대로 읽고, 5초 넘게 밀리면 최신으로 */
    console.log('\n[4] 실시간 줄 큐 + 5초 건너뜀 (④) — 들은 줄을 진짜 길(방 → 손님 speak)로');
    /* 원고 방이 아니라 들은 줄 방 — 강사 소켓을 직접 열어 확정 줄(tr)을 보낸다(end_test 와 같은 꼴) */
    let plain, hostWs, seq = 0;
    const guideRoom = async () => {
      if (hostWs) hostWs.close();
      plain = relay.newRoom('guide'); seq = 0;
      hostWs = new WebSocket(`ws://localhost:${port}/ws?room=${plain.code}&role=host&token=${plain.token}`);
      await new Promise((res, rej) => { hostWs.on('open', res); hostWs.on('error', rej); });
      hostWs.send(JSON.stringify({ welcome: 1, plan: 'guide', guide: 1, src_lang: 'ko' }));
    };
    await guideRoom();
    const line = (en) => hostWs.send(JSON.stringify({ seq: ++seq, src_lang: 'ko', text: '말 ' + seq, tr: { en } }));
    const waitN = (pg, n) => pg.waitForFunction((n) => window.__tts.speak.length >= n, n, { timeout: 5000 });
    const e = await openGuest(browser, base, plain.code, port, false);
    ['line one.', 'line two.', 'line three.'].forEach(line);
    await waitN(e.g, 1);
    await new Promise(r => setTimeout(r, 300));          // 셋 다 닿을 틈(실시간)
    await e.g.clock.runFor(2000);
    let ec = await e.g.evaluate(() => ({ s: window.__tts.speak.slice(), i: window.__tts.interrupted, q: window.rtTtsGuard.state() }));
    ok(ec.q.queue === true, '스위치 기본 켬');
    ok(ec.s.join('|') === 'line one.|line two.|line three.' && ec.i === 0, `짧은 줄 셋 — 순서대로 끝까지, 잘림 0 (${ec.s.join('|')} · interrupted ${ec.i})`);
    const long = 'L'.repeat(60);   // 1초 6글자 셈 = 10초
    await e.g.evaluate(() => { window.__tts.speak.length = 0; });
    for (let k = 1; k <= 5; k++) line(long + k);
    await waitN(e.g, 1);
    await new Promise(r => setTimeout(r, 300));
    await e.g.clock.runFor(3000);
    ec = await e.g.evaluate(() => ({ s: window.__tts.speak.slice(), q: window.rtTtsGuard.state(), log: window.rtRead.log() }));
    ok(ec.s.length === 2 && /1$/.test(ec.s[0]) && /5$/.test(ec.s[1]), `밀림 > 5초 → 첫 줄 뒤 최신(5)으로 건너뜀 (${ec.s.map(x => x.slice(-1)).join(',')})`);
    ok(ec.q.jumps === 1 && ec.log.some(l => /^tts_jump dropped=3/.test(l)), '기록 tts_jump dropped=3');
    await e.gctx.close();
    /* 거울: ?ttsq=0 — 옛 판은 새 줄마다 잘라 앞 둘이 잘린다 */
    await guideRoom();   // 새 방 — 앞 방의 링버퍼가 다시 오지 않게
    const f = await openGuest(browser, base, plain.code, port, false, '&ttsq=0');
    await f.g.evaluate(() => { window.__tts.speak.length = 0; window.__tts.interrupted = 0; });
    ['line one.', 'line two.', 'line three.'].forEach(line);
    await waitN(f.g, 3);
    await f.g.clock.runFor(2000);
    const fc = await f.g.evaluate(() => ({ i: window.__tts.interrupted, q: window.rtTtsGuard.state() }));
    ok(fc.q.queue === false && fc.i === 2, `되돌림 실증 ④ — ?ttsq=0(옛 판)은 앞 둘이 잘린다 (interrupted ${fc.i})`);
    await f.gctx.close();
    hostWs.close();
    await hctx.close();
  } finally {
    await browser.close();
    relay.close();
  }
  console.log(`\n=== ${passCount} PASS ===`);
})().catch(e => { console.error('[FAIL]', e && e.message || e); process.exit(1); });
