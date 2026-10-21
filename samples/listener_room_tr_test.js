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
const T0 = Date.now();
/* 걸린 시간을 같이 찍는다 — 10-21 에 이 시험이 **2분 넘게** 걸려 게이트를 늦췄다.
   어느 줄이 오래 걸리는지 보이지 않으면 다음 사람도 같은 것을 다시 뒤진다. */
const ok = (c, d) => { assert(c, d); pass++; console.log(`  [PASS] (${Date.now() - T0}ms) ` + d); };

/* 가짜 방의 번역은 **끈다** — 이 시험은 방 메시지를 **손으로** 넣어 페이지가 그것을 어떻게
   다루나를 본다. 가짜까지 번역하면 손으로 넣은 것과 섞여 무엇을 보고 통과했는지 못 가른다.
   (보내는 쪽은 `relay/test/room-translate.mjs` 와 `samples/e2e_room_tr_test.js` 가 본다) */
const relay = createMockRelay({ root: path.join(__dirname, '..'), roomTranslate: false });

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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    await ctx.addInitScript(FAKE_VOICES);
    const page = await ctx.newPage();
    const logs = [];
    /* 페이지가 터지면 **시험이 터져야 한다** — 조용히 0회로 보이면 "안 읽었다"와 못 가른다.
       10-21 에 가짜 목소리가 `uttr.voice` 에서 예외를 냈고, 그 예외가 보여서 잡았다. */
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => { logs.push('PAGEERROR ' + e.message); });
    /* 폰 언어를 **한국어로** 둔다 (B 0) — 그 폰에서는 브라우저가 번역해 주지 않으므로
       방 번역이 유일한 길이고, 이 시험이 보는 것이 바로 그 길이다. */
    await page.goto(`${base}/web/listener/?room=${room.code}&lang=en`);
    await page.waitForSelector('#btn-join');
    await page.click('#btn-join');
    await page.waitForSelector('#chat-screen', { state: 'visible' });
    await sleep(200);   // 소리는 기본 켜짐(🔊)이라 따로 켜지 않는다

    /* ① 방송 줄(강사가 번역 없이 보낸 줄) → 방이 늦게 보낸 tr 이 **화면에 붙는다** */
    host.send(JSON.stringify({ seq: 1, text: '안전모를 쓰세요', src_lang: 'ko', broadcast: true }));
    await page.waitForSelector('#msg-1');
    const before1 = await page.evaluate(() => ({
      text: document.querySelector('#msg-1 .msg-tr').textContent,
      badge: !!document.querySelector('#msg-1 .badge-pending')
    }));
    /* ★ B 0 보탬: 번역이 오기 전에는 **「번역 대기 중」**이 보인다(전에는 빈칸이었다 —
       손님은 "안 되는 것"으로 읽었다). 번역문 글자는 아직 없다. */
    ok(before1.badge === true && !/Wear|helmet/.test(before1.text),
       `번역이 오기 전에는 「번역 대기 중」이 보인다 ("${before1.text}")`);

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

    /* ── ★ 정본 v1 §2 ③: 손님은 **내 언어만** 본다 (원문은 접힌 단추) ──────────────
       대표님 10-21 15:15: "청취자 화면에 원문 표시 의미없다, 못 알아듣는데 괜한 혼선".
       서버 번역 길(한국어 폰 + 영어 손님)이라 번역이 오면 **원문이 사라져야** 한다. */
    {
      const got = await page.evaluate(() => {
        const t = document.querySelector('#msg-1 .msg-text');
        const b = document.getElementById('btn-toggle-src');
        return {
          srcShown: t ? getComputedStyle(t).display !== 'none' : null,
          trText: (document.querySelector('#msg-1 .msg-tr') || {}).textContent || '',
          btnShown: b ? getComputedStyle(b).display !== 'none' : null,
          pressed: b ? b.getAttribute('aria-pressed') : null
        };
      });
      ok(got.srcShown === false && /Wear your helmet/.test(got.trText),
         `번역이 오면 **원문이 사라지고 내 언어만** 남는다 (원문 보임=${got.srcShown})`);
      ok(got.btnShown === true && got.pressed === 'false',
         `「원문 보기」는 **접힌 단추**로 있다 (보임=${got.btnShown} 눌림=${got.pressed})`);

      /* 켜면 다시 보인다 — 손님이 고르는 것이다(정본 §6 ①) */
      await page.click('#btn-toggle-src');
      await sleep(200);
      const on = await page.evaluate(() => ({
        srcShown: getComputedStyle(document.querySelector('#msg-1 .msg-text')).display !== 'none',
        pressed: document.getElementById('btn-toggle-src').getAttribute('aria-pressed')
      }));
      ok(on.srcShown === true && on.pressed === 'true', `켜면 원문이 돌아온다 (눌림=${on.pressed})`);
      await page.click('#btn-toggle-src');          // 다시 끈다(아래 단언에 영향 없게)
      await sleep(200);
    }

    /* ★ B 0 보탬: 방 번역을 기다리는 줄은 **기다린다고 보인다**(콘솔 없이 화면만으로) */
    const waitBadge = await page.evaluate(() => !!document.querySelector('#msg-1 .badge-pending'));
    ok(waitBadge === false,
       '번역이 온 뒤에는 「번역 대기 중」이 없다 (방금 왔다)');

    /* ④ 두 번 읽지 않는다 — 같은 번역이 또 와도 한 번이다 */
    host.send(JSON.stringify({ seq: 1, tr: { en: 'Wear your helmet' } }));
    await sleep(400);
    const said = await page.evaluate(() => (window.__said || []).filter((t) => t.indexOf('Wear your helmet') >= 0).length);
    ok(said === 1, `같은 줄을 **한 번만** 읽는다 (${said}회) — 손님 폰 번역과 방 번역이 겹치는 자리다`);

    /* ★ B 0 보탬 ② — **번역이 오기 전**에는 「번역 대기 중」이 보인다 */
    host.send(JSON.stringify({ seq: 9, text: '아직 번역이 안 온 줄', src_lang: 'ko', broadcast: true }));
    await page.waitForSelector('#msg-9', { timeout: 4000 });
    const waiting = await page.evaluate(() => ({
      badge: !!document.querySelector('#msg-9 .badge-pending'),
      plan: (window.rtTrPlan && window.rtTrPlan.plan()) || '?'
    }));
    ok(waiting.plan === 'server' && waiting.badge === true,
       `한국어 폰(길=${waiting.plan})에서 번역을 기다리는 줄은 **기다린다고 보인다** — 손님이 "안 되는 것"으로 읽지 않게`);
    host.send(JSON.stringify({ seq: 9, no_tr: 1, why: 'http_502' }));
    await page.waitForFunction(() => !document.querySelector('#msg-9 .badge-pending'), null, { timeout: 4000 });
    ok(true, '안 온다고 알리면(no_tr) 그 표가 사라진다 — 영원히 기다리지 않는다');

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
    /* ★ 호스트 소켓을 **닫는다**. 안 닫으면 시험이 다 통과하고도 **프로세스가 안 죽는다** —
       열린 ws 하나가 이벤트 루프를 붙잡는다. 10-21 에 `npm test` 가 바로 여기서 4분을
       서 있었다(초록을 다 찍어 놓고). 시험이 끝나는 것도 시험의 일부다. */
    /* ★ 열어 둔 소켓을 **다 닫고 끝낸다**. 안 그러면 시험이 10개 초록을 다 찍고도
       **프로세스가 안 죽는다** — 열린 소켓 하나가 이벤트 루프를 붙잡는다. 10-21 에
       `npm test` 가 바로 여기서 2분 넘게 서 있었다(본문은 1.9초에 끝나 있었다).
       **시험이 끝나는 것도 시험의 일부다**: 안 끝나는 시험은 게이트를 멈춰 세우고,
       멈춘 게이트는 빌드를 못 걸게 한다. */
    try { host.close(); } catch (_) {}
    for (const r of relay.rooms.values()) {
      for (const l of [...r.listeners.keys()]) { try { l.close(1000, 'test_end'); } catch (_) {} }
      for (const h of [...r.hosts]) { try { h.close(1000, 'test_end'); } catch (_) {} }
    }
    await browser.close();
    relay.close();
  }
  /* 그래도 남는 손잡이가 있으면 **여기서 끝낸다** — 실패 길은 아래에서 이미 그렇게 한다. */
  process.exit(0);
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
