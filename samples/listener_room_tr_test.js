// samples/listener_room_tr_test.js — **방이 보낸 번역**을 손님 화면이 받는가 (NOW B 3)
// 설계: docs/design/room-translate.md · 기준: 결정장부 51(손님 폰 먼저)·43 · RULE: P-16
//
// `relay/test/room-translate.mjs` 는 **보내는 쪽**을 본다. 이 시험은 **받는 쪽**이다 —
// 그 둘을 따로 세지 않으면 10-20 과 같은 일이 난다(보내는 쪽만 맞고 받는 쪽이 다른 칸을 읽어
// 손님은 영원히 원문만 봄). 네 가지를 본다:
//   ① 늦게 온 `tr`(seq) 이 **화면에 붙는다** — 방송 줄(번역 없이 온 줄)에도 붙는다
//   ② 원고 문단은 `script_tr`+`para` 로 붙는다
//   ③ `no_tr` 이면 「번역 대기 중」이 사라진다 (기다림이 끝났다는 뜻)
//   ④ ★ 같은 줄을 **두 번 읽지 않는다** — 손님 폰 번역과 방 번역이 겹치는 자리다
//
// 돌리기: node samples/listener_room_tr_test.js
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

console.log('=== 방이 보낸 번역 — 손님 화면 (B 3) ===');
let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

const relay = createMockRelay({ root: path.join(__dirname, '..') });

function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const s = raw.toString();
      if (s.includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'trial', guide: 1, src_lang: 'ko' }));
    });
  });
}

/* 목소리 가짜 — 운영과 같은 모양(lang·name·voiceURI·localService). 읽은 것을 센다.
 *
 * ★ `SpeechSynthesisUtterance` 도 바꿔 끼운다. 까닭: 진짜 크로미움은 `uttr.voice` 에
 * **진짜 목소리 객체**만 받고, 가짜를 넣으면 거기서 **예외가 난다** — 그러면 "몇 번
 * 읽었나"를 셀 수 없다(0회로 보인다). 폰에서는 목소리가 진짜라 안 나는 일이고, 이 시험이
 * 보려는 것도 **횟수**다. 횟수를 느슨하게 만드는 쪽으로는 손대지 않는다(D-11). */
const FAKE_VOICES = `(() => {
  function U(t) { this.text = t; this.lang = ''; this.voice = null; }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
  const list = ['en-US', 'ko-KR'].map((l, i) => ({ lang: l, name: 'Fake ' + l, voiceURI: 'fake:' + l, localService: true, default: i === 0 }));
  const api = {
    getVoices: () => list,
    speak: (u) => { (window.__said = window.__said || []).push(String(u && u.text || '')); },
    cancel: () => {}, pause: () => {}, resume: () => {},
    onvoiceschanged: null, speaking: false, paused: false, pending: false
  };
  Object.defineProperty(window, 'speechSynthesis', { get: () => api, configurable: true });
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  try {
    const room = relay.newRoom('guide');
    const host = await openHost(base, room);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAKE_VOICES);
    const page = await ctx.newPage();
    const logs = [];
    /* 페이지가 터지면 **시험이 터져야 한다** — 조용히 0회로 보이면 "안 읽었다"와 못 가른다.
       10-21 에 가짜 목소리가 `uttr.voice` 에서 예외를 냈고, 그 예외가 보여서 잡았다. */
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); });
    await page.goto(`${base}/web/listener/?room=${room.code}&lang=en`);
    await page.waitForSelector('#btn-join');
    await page.click('#btn-join');
    await page.waitForSelector('#chat-screen', { state: 'visible' });
    await sleep(200);   // 소리는 기본 켜짐(🔊)이라 따로 켜지 않는다

    /* ① 방송 줄(강사가 번역 없이 보낸 줄) → 방이 늦게 보낸 tr 이 **화면에 붙는다** */
    host.send(JSON.stringify({ seq: 1, text: '안전모를 쓰세요', src_lang: 'ko', broadcast: true }));
    await page.waitForSelector('#msg-1');
    const trBefore = await page.textContent('#msg-1 .msg-tr');
    ok(!trBefore, `번역이 오기 전에는 번역 칸이 비어 있다 ("${trBefore}")`);

    host.send(JSON.stringify({ seq: 1, tr: { en: 'Wear your helmet' } }));
    await page.waitForFunction(() => {
      const el = document.querySelector('#msg-1 .msg-tr');
      return el && el.textContent.indexOf('Wear your helmet') >= 0;
    }, null, { timeout: 4000 });
    const shown = await page.evaluate(() => {
      const el = document.querySelector('#msg-1 .msg-tr');
      return { text: el.textContent, vis: getComputedStyle(el).display };
    });
    ok(shown.vis !== 'none', '방송 줄에도 번역 칸이 **보인다** — 숨겨 두면 소리는 영어, 화면은 한국어가 된다');
    ok(shown.text.indexOf('Wear your helmet') >= 0, `늦게 온 번역이 화면에 붙었다 ("${shown.text}")`);

    /* ④ 두 번 읽지 않는다 — 같은 번역이 또 와도 한 번이다 */
    host.send(JSON.stringify({ seq: 1, tr: { en: 'Wear your helmet' } }));
    await sleep(400);
    const said = await page.evaluate(() => (window.__said || []).filter((t) => t.indexOf('Wear your helmet') >= 0).length);
    ok(said === 1, `같은 줄을 **한 번만** 읽는다 (${said}회) — 손님 폰 번역과 방 번역이 겹치는 자리다`);

    /* ② 원고 문단 — para 로 짝을 맞춘다 */
    host.send(JSON.stringify({ kind: 'script', para: 3, total: 10, src: '오늘 일정은 셋입니다', srcLang: 'ko' }));
    await page.waitForFunction(() => document.querySelectorAll('.msg-script').length === 1, null, { timeout: 4000 });
    host.send(JSON.stringify({ kind: 'script_tr', para: 3, trans: { en: 'There are three items today' } }));
    await page.waitForFunction(() => {
      const el = document.querySelector('.msg-script .msg-tr');
      return el && el.textContent.indexOf('three items') >= 0;
    }, null, { timeout: 4000 });
    ok(true, '원고 문단의 번역이 script_tr + para 로 붙는다 (문단은 seq 가 없다)');

    /* 짝이 안 맞는 para 는 조용히 버린다 — 남의 문단에 붙이지 않는다 */
    host.send(JSON.stringify({ kind: 'script_tr', para: 99, trans: { en: 'WRONG PARA' } }));
    await sleep(300);
    const wrong = await page.evaluate(() => document.body.textContent.indexOf('WRONG PARA') >= 0);
    ok(wrong === false, '없는 문단 번호의 번역은 아무 데도 붙지 않는다');

    /* ③ no_tr — 기다림을 끝낸다 */
    host.send(JSON.stringify({ seq: 2, text: '번역이 안 되는 줄', src_lang: 'ko', pending: 1 }));
    await page.waitForSelector('#msg-2 .badge-pending', { timeout: 4000 });
    ok(true, '번역을 기다리는 줄에는 「번역 대기 중」이 보인다');
    host.send(JSON.stringify({ seq: 2, no_tr: 1, why: 'http_502' }));
    await page.waitForFunction(() => !document.querySelector('#msg-2 .badge-pending'), null, { timeout: 4000 });
    ok(true, 'no_tr 이 오면 「번역 대기 중」이 사라진다 — 영원히 기다리지 않는다 (D-139 ⑤)');

    /* 되돌림 실증 (D-09) — 번역 칸을 **다른 언어 코드**로 보내면 붙지 않는다.
       붙는다면 코드를 느슨하게 찾는 것이고, 그러면 `lang_table_test` 의 자물쇠가 헛것이 된다. */
    host.send(JSON.stringify({ seq: 3, text: '코드가 한 글자 다르면', src_lang: 'ko', broadcast: true }));
    await page.waitForSelector('#msg-3');
    host.send(JSON.stringify({ seq: 3, tr: { 'en-US': 'loose match?' } }));
    await sleep(400);
    const loose = await page.textContent('#msg-3 .msg-tr');
    ok(!loose || loose.indexOf('loose match') < 0,
       `'en' 손님에게 'en-US' 칸으로 보내면 **붙지 않는다** ("${loose}") — 그래서 보내는 쪽이 글자를 그대로 써야 한다 (되돌림 실증)`);

    const errs = logs.filter((l) => l.startsWith('PAGEERROR'));
    ok(errs.length === 0, `페이지에서 예외가 하나도 안 났다 (${errs.slice(0, 2).join(' | ') || '없음'})`);

    console.log(`\n[OK] ${pass}개 확인 — 방이 보낸 번역 (손님 화면)`);
    await ctx.close();
  } finally {
    await browser.close();
    relay.close();
  }
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
