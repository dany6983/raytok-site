/* samples/listener_tts106_test.js — 손님 듣기 = 앱 106 규칙 (NOW 11-10 12:56 ③)
 * 실행: node samples/listener_tts106_test.js   (npm run test:listener-tts106)
 *
 *  1. 셈이 앱과 같다 — 군말 빼기(앱 src/fillers.js 출력 그대로) · 배속(1.5초 1.2 · 3초 1.4) · 상한(배속 넣어)
 *  2. 진짜 길(방 → 손님 handleMessage → speak → 지킴이): 군말 빠진 글을 읽는다 · 짧은 줄 셋은 한 번에 · 밀리면 1.4배
 *  3. 앱 실기 기록(LANG-106 강연 320줄)을 같은 간격으로 흘린 숫자 — 앱 scripts/replay-tts.js 와 나란히
 *     (앱: 읽기 호출 193 · tts_jump 28 · 끝까지 79% · 밀림 p50 4.4초 p90 10.0초 — 11-10 같은 기록으로 잼)
 *  4. 되돌림(D-09): ?tts106=0(11-03 판)은 합치기·배속이 없고 끝까지 읽힌 줄이 적다
 */
const path = require('path');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');
const { run } = require('../tools/replay-tts-web.js');

let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

/* 앱 src/fillers.js dropFillers 의 실제 출력(11-10 앱 소스로 돌려 적음) — 웹 표가 어긋나면 붉다 */
const FILLER_CASES = [
  ['어, 오늘은, 음, 안전 교육입니다.', 'ko', '오늘은, 안전 교육입니다.'],
  ['Um, you know, wear a helmet.', 'en', 'wear a helmet.'],
  ['음.', 'ko', ''],
  ['그 사람이 왔다.', 'ko', '그 사람이 왔다.'],
  ['ờ, đội mũ bảo hộ.', 'vi', 'đội mũ bảo hộ.'],
  ['Hello, uh, world', 'xx', 'Hello, uh, world'],
];

const FAKE = `
  window.__said = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; } };
  (function () {
    let cur = null, timer = null, q = [];
    function next() {
      cur = q.shift() || null; S.speaking = !!cur;
      if (!cur) return;
      const u = cur; window.__said.push({ text: u.text, rate: u.rate || 1 });
      timer = setTimeout(() => { if (cur !== u) return; cur = null; if (u.onend) u.onend({}); if (!cur) next(); }, Math.round(u.text.length * 166 / (u.rate || 1)));
    }
    const S = { getVoices: () => [{ lang: 'en-US', name: 'en', localService: true, default: true }],
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      speak(u) { if (!u.text) return; q.push(u); if (!cur) next(); },
      cancel() { clearTimeout(timer); q = []; const p = cur; cur = null; if (p && p.onerror) p.onerror({ error: 'interrupted' }); },
      pause() {}, resume() {} };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: S });
  })();
`;

(async () => {
  console.log('=== 손님 듣기 = 앱 106 규칙 ===');
  const relay = createMockRelay({ root: path.join(__dirname, '..') });
  const port = await relay.listen();
  const browser = await chromium.launch();
  try {
    const room = relay.newRoom('guide');
    const hostWs = new WebSocket(`ws://localhost:${port}/ws?room=${room.code}&role=host&token=${room.token}`);
    await new Promise((res, rej) => { hostWs.on('open', res); hostWs.on('error', rej); });
    hostWs.send(JSON.stringify({ welcome: 1, plan: 'guide', guide: 1, src_lang: 'ko' }));
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAKE);
    const g = await ctx.newPage();
    await g.clock.install();
    await g.goto(`http://localhost:${port}/web/listener/?room=${room.code}&lang=en&auto=1&relay=localhost:${port}`);
    await g.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
    await g.waitForFunction(() => !!window.rtTtsGuard, null, { timeout: 5000 });

    console.log('\n[1] 셈이 앱과 같다');
    const c = await g.evaluate((cases) => ({
      f: cases.map(([t, l]) => window.rtTtsGuard.dropFillers(t, l)),
      r: [0, 1499, 1500, 2999, 3000, 9000].map((ms) => window.rtTtsGuard.catchupRate(ms)),
      cap: [window.rtTtsGuard.capMs(19), window.rtTtsGuard.capMs(60, 1.4)],
      on: window.rtTtsGuard.state().app106,
    }), FILLER_CASES);
    ok(c.on === true, '스위치 기본 켬(?tts106=0 으로 끔)');
    FILLER_CASES.forEach(([t, l, want], i) => ok(c.f[i] === want, `군말 [${l}] "${t}" → "${c.f[i]}" (앱: "${want}")`));
    ok(c.r.join(',') === '1,1,1.2,1.2,1.4,1.4', `배속 = 앱 CATCHUP_RATE_STEPS (${c.r.join(',')})`);
    ok(c.cap[0] === 6334 && c.cap[1] === 14286, `상한 = 앱 timeoutMsFor(chars, rate) (${c.cap.join(',')})`);

    console.log('\n[2] 진짜 길 — 방 → 손님 → 지킴이');
    let seq = 0;
    const line = (en) => hostWs.send(JSON.stringify({ seq: ++seq, src_lang: 'ko', text: '말 ' + seq, tr: { en } }));
    line('Um, you know, wear a helmet.');
    await g.waitForFunction(() => window.__said.length >= 1, null, { timeout: 5000 });
    let said = await g.evaluate(() => window.__said.slice());
    ok(said[0].text === 'wear a helmet.', `군말 빠진 글을 읽는다 ("${said[0].text}") — 화면 글자는 그대로`);
    /* 화면 글자는 지킴이가 손대지 않는다(읽을 글만 고친다) — 가짜 릴레이가 늦은 번역으로 줄 글을 바꾸므로 여기서는 소리만 잰다 */
    await g.clock.runFor(10000);
    await g.evaluate(() => { window.__said.length = 0; });
    // 하나를 읽는 동안 짧은 줄 셋이 오면 다음 읽기에서 한 번에
    line('First line is a little longer so that it takes a while.');
    await g.waitForFunction(() => window.__said.length >= 1, null, { timeout: 5000 });
    ['Stop.', 'Look.', 'Go.'].forEach(line);
    await new Promise((r) => setTimeout(r, 300));
    await g.clock.runFor(30000);
    said = await g.evaluate(() => window.__said.map((s) => s.text));
    ok(said.length === 2 && said[1] === 'Stop. Look. Go.', `짧은 줄 셋은 한 번에 읽는다 (${said.join(' | ')})`);
    // 밀리면 1.4배: 긴 줄 하나 읽는 동안 긴 줄 둘 → 다음은 배속
    await g.evaluate(() => { window.__said.length = 0; });
    const long = 'W'.repeat(130);
    line(long + '1');
    await g.waitForFunction(() => window.__said.length >= 1, null, { timeout: 5000 });
    line(long + '2'); line(long + '3');
    await new Promise((r) => setTimeout(r, 300));
    await g.clock.runFor(120000);
    said = await g.evaluate(() => window.__said.slice());
    ok(said.length >= 2 && said[1].rate === 1.4, `밀리면 1.4배로 읽는다 (rates ${said.map((s) => s.rate).join(',')})`);
    hostWs.close();
    await ctx.close();

    console.log('\n[3] 앱 실기 기록(LANG-106 강연 320줄)을 같은 간격으로 — 앱 replay-tts 와 나란히');
    const APP = { speaks: 193, tts_jump: 28, readUnitsPct: 79, p50: 4444, p90: 9969 };
    const now = await run({ browser });
    const old = await run({ browser, old: true });
    console.log('    | 판 | 읽기 호출 | 건너뜀(tts_jump) | 건너뛴 줄 | 끝까지 % | 배속≥1.2 % | 밀림 p50 / p90 ms |');
    console.log(`    | 앱 106 | ${APP.speaks} | ${APP.tts_jump} | 66 | ${APP.readUnitsPct} | 100 | ${APP.p50} / ${APP.p90} |`);
    for (const o of [now, old]) console.log(`    | ${o.code} | ${o.speaks} | ${o.tts_jump} | ${o.jumpedUnits} | ${o.readUnitsPct} | ${o.rateFastPct} | ${o.lagMs.p50} / ${o.lagMs.p90} |`);
    ok(Math.abs(now.readUnitsPct - APP.readUnitsPct) <= 8, `끝까지 읽힌 줄 — 웹 ${now.readUnitsPct}% ≈ 앱 ${APP.readUnitsPct}% (±8)`);
    ok(Math.abs(now.tts_jump - APP.tts_jump) <= 10, `건너뜀 — 웹 ${now.tts_jump} ≈ 앱 ${APP.tts_jump} (±10)`);
    ok(now.rateFastPct >= 90 && now.timeouts === 0, `배속이 일한다(≥1.2 ${now.rateFastPct}%) · 상한 넘음 ${now.timeouts}`);

    console.log('\n[4] 되돌림(D-09) — ?tts106=0 은 11-03 판');
    ok(old.rateFastPct === 0 && old.readUnitsPct < now.readUnitsPct,
      `되돌림 실증 — 끄면 배속 0% · 끝까지 ${old.readUnitsPct}% < ${now.readUnitsPct}% — 숫자가 규칙에서 온다`);
  } finally {
    await browser.close();
    relay.close();
  }
  console.log(`\n=== ${pass} PASS · ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('[FAIL]', e && e.stack || e); process.exit(1); });
