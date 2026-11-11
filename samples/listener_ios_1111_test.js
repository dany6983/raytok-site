/* samples/listener_ios_1111_test.js — 손님(아이폰 사파리 vi) 「한글 같이 뜸 · 화면 죽음」 가르기 (NOW 11-11 13:28 ③⑦⑧)
 * 실행: node samples/listener_ios_1111_test.js   (npm run test:listener-ios-1111)
 *
 * 11-11 실기: 아이폰 사파리 vi · 오늘 판 = 한글+vi 같이, 10~15초 뒤 화면 죽음 · `?tts106=0&trorder=0` = 4분 멀쩡·번역문만.
 * 두 스위치를 **따로** 껐다 켜(2×2) 같은 줄을 넣고 잰다 — 가짜 아이폰 UA(사파리) · 그 폰처럼 vi 목소리 없음:
 *   · 원문(한글)이 보인 줄 수 · 「…」(번역 대기)만 보인 줄 수 · 줄마다 빨간 「목소리 없음」 표
 *   · speak/cancel 수 · 배속(rate≠1) 발화 수 · 한 번에 쌓인 발화 · JS 힙 · 레이팩 받기 요청
 * 단언(고친 뒤): 네 판 모두 원문 노출 0 · 줄 표 0(⑦) · `?srcHide=0`(③ 끔)이면 원문이 보인다(D-09 거울)
 * 나란히 표는 docs/reclog/2026-11-11-web/ios-split.txt 로도 남긴다(--write).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

/* 그 아이폰처럼 — vi 목소리가 **없다**(ko·en 만). 발화는 글자 수만큼 걸려 끝난다(글자당 25ms) */
const FAKE_TTS = `(() => {
  function U(t) { this.text = t; this.lang = ''; this.voice = null; this.rate = 1; }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
  const list = ['ko-KR', 'en-US'].map((l, i) => ({ lang: l, name: 'Fake ' + l, voiceURI: 'fake:' + l, localService: true, default: i === 0 }));
  const st = window.__tts = { speak: 0, cancel: 0, fast: 0, q: [], maxQ: 0 };
  let cur = null;
  function next() {
    if (cur || !st.q.length) return;
    cur = st.q.shift();
    const u = cur;
    setTimeout(() => { if (cur !== u) return; cur = null; try { u.onend && u.onend({}); } catch (e) {} next(); }, Math.max(200, String(u.text).length * 25));
  }
  const api = {
    getVoices: () => list,
    speak: (u) => { st.speak += 1; if (u.rate && u.rate !== 1) st.fast += 1; st.q.push(u); st.maxQ = Math.max(st.maxQ, st.q.length + (cur ? 1 : 0)); next(); },
    cancel: () => { st.cancel += 1; const was = cur; cur = null; const q = st.q.splice(0);
                    [was].concat(q).forEach(u => { if (u) try { u.onerror && u.onerror({ error: 'interrupted' }); } catch (e) {} }); },
    pause: () => {}, resume: () => {}, onvoiceschanged: null,
    get speaking() { return !!cur; }, paused: false, get pending() { return st.q.length > 0; }
  };
  Object.defineProperty(window, 'speechSynthesis', { get: () => api, configurable: true });
})();`;

function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      if (raw.toString().includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'trial', src_lang: 'ko', kr: 1 }));
    });
  });
}

const LINES = ['안전모를 반드시 착용하세요', '작업 전에 장비를 점검합니다', '비상구 위치를 확인하세요', '높은 곳에서는 안전대를 겁니다',
  '전기 작업은 허가를 받고 합니다', '화학 물질은 라벨을 읽으세요', '무거운 물건은 둘이 듭니다', '쉬는 시간에는 물을 마십니다'];

async function runCombo(browser, base, relay, q, label) {
  const room = relay.newRoom('guide');
  const host = await openHost(base, room);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', userAgent: IPHONE_UA, hasTouch: true, isMobile: true });
  await ctx.addInitScript(FAKE_TTS);
  const page = await ctx.newPage();
  const errs = [], reqs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('request', (r) => { if (/raypack|\.bin|models?\//i.test(r.url())) reqs.push(r.url()); });
  await page.goto(`${base}/web/listener/?room=${room.code}&lang=vi${q}`);
  await page.waitForSelector('#btn-join');
  await page.click('#btn-join');
  await page.waitForSelector('#chat-screen', { state: 'visible' });
  /* 줄이 보이는 동안 0.1초마다 — 원문이 한 번이라도 보였나, 번역 칸에 무엇이 있나 */
  await page.evaluate(() => {
    window.__seen = {};
    setInterval(() => {
      document.querySelectorAll('.msg-line[id^="msg-"]').forEach((d) => {
        const t = d.querySelector('.msg-text'), r = d.querySelector('.msg-tr');
        const s = window.__seen[d.id] = window.__seen[d.id] || { src: 0, wait: 0, red: 0 };
        if (t && getComputedStyle(t).display !== 'none' && t.textContent.trim()) s.src = 1;
        if (r && r.querySelector('.badge-pending')) s.wait = 1;
        if (r && Array.from(r.querySelectorAll('.badge')).some(b => /목소리|음성|giọng|voice/i.test(b.textContent) && !b.classList.contains('badge-pending'))) s.red = 1;
      });
    }, 100);
  });
  const N = 24;
  for (let i = 1; i <= N; i++) {
    const seq = 100 + i, ko = LINES[(i - 1) % LINES.length] + ' ' + i;
    host.send(JSON.stringify({ seq, text: ko, src_lang: 'ko', broadcast: true }));      // 강사 = 원문만(P-14)
    setTimeout(() => host.send(JSON.stringify({ seq, tr: { vi: 'Câu tiếng Việt số ' + i + ' về an toàn lao động' } })), 900);   // 방 번역 0.9초 뒤
    await sleep(350);
  }
  await sleep(2500);
  const r = await page.evaluate(() => {
    const seen = Object.values(window.__seen || {});
    let heap = null; try { heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null; } catch (e) {}
    return { lines: seen.length, src: seen.filter(s => s.src).length, wait: seen.filter(s => s.wait).length, red: seen.filter(s => s.red).length,
             tts: window.__tts, heap, plan: (window.rtTrPlan && window.rtTrPlan.log().filter(l => /^guest_tr_plan plan=/.test(l)).slice(-1)[0]) || '' };
  });
  const beats = (relay.rooms.get(room.code).beats || []).slice();
  host.close(); await ctx.close();
  return Object.assign({ label, errs: errs.length, raypackReq: reqs.length, beats }, r);
}

(async () => {
  console.log('=== 손님 아이폰 사파리 vi — 한글 같이 뜸 · 화면 죽음 가르기 (11-11 ③⑦) ===');
  const relay = createMockRelay({ root: path.join(__dirname, '..'), roomTranslate: false });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const rows = [];
  try {
    const combos = [['', '오늘 판(trorder 켬·tts106 켬)'], ['&tts106=0', 'tts106 만 끔'], ['&trorder=0', 'trorder 만 끔'],
                    ['&tts106=0&trorder=0', '둘 다 끔(실기 4분 멀쩡)'], ['&srcHide=0', '③ 끔(원문 숨김 끔 · 거울)'],
                    ['&tts106=1', '아이폰 106 강제 켬(거울)']];
    for (const [q, label] of combos) rows.push(await runCombo(browser, base, relay, q, label));
    const table = ['판 | 줄 | 원문 보인 줄 | 「…」 대기 | 줄마다 빨간 표 | speak | cancel | 배속 발화 | 최대 쌓임 | 힙MB | 레이팩 요청 | 페이지 오류',
      ...rows.map(r => [r.label, r.lines, r.src, r.wait, r.red, r.tts.speak, r.tts.cancel, r.tts.fast, r.tts.maxQ, r.heap, r.raypackReq, r.errs].join(' | '))];
    console.log('\n' + table.join('\n') + '\n');
    if (process.argv.includes('--write')) {
      const dir = path.join(__dirname, '..', 'docs', 'reclog', '2026-11-11-web');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'ios-split.txt'), '# node samples/listener_ios_1111_test.js --write (가짜 아이폰 UA · vi 목소리 없음 · 24줄 0.35초 간격 · 방 번역 0.9초 뒤)\n' + table.join('\n') + '\n');
    }
    for (const r of rows.slice(0, 4)) {
      ok(r.lines === 24, `${r.label}: 24줄 다 보임 (${r.lines})`);
      ok(r.src === 0, `${r.label}: 원문(한글)이 보인 줄 0 (${r.src}) — 번역 전엔 「…」`);
      ok(r.red === 0, `${r.label}: 줄마다 빨간 「목소리 없음」 표 0 (${r.red}) — 위 띠 한 번(⑦)`);
      ok(r.errs === 0, `${r.label}: 페이지 오류 0`);
    }
    ok(rows[0].raypackReq === 0 && rows[1].raypackReq === 0, `trorder 켬: 아이폰은 레이팩을 안 받는다 (${rows[0].raypackReq}·${rows[1].raypackReq})`);
    /* ④ 아이폰 숨 — 12초쯤 머문 판이면 5초마다 2번↑, seq 가 늘고 줄 수가 실린다. 개인정보 칸 없음 */
    const bt = rows[0].beats;
    ok(bt.length >= 2 && /seq=1 /.test(bt[0]) && /seq=2 /.test(bt[1]), `④ 아이폰 숨 ${bt.length}번: ${bt.slice(0, 2).join(' · ')}`);
    ok(bt.every(l => /^ios_beat id=\w{1,6} seq=\d+ lines=\d+ stage=\w* vis=[01] tts=[01]$/.test(l)), '④ 숨 한 줄 모양 — 숫자·짧은 낱말만');
    ok(/lines=(1\d|2\d)/.test(bt[bt.length - 1]), `④ 마지막 숨에 줄 수 (${bt[bt.length - 1]})`);
    const mirror = rows[4];
    ok(mirror.src > 0, `되돌림 실증(D-09): ?srcHide=0 → 원문 보인 줄 ${mirror.src} (붉음)`);
    ok(rows[0].tts.fast === 0, `오늘 판: 아이폰은 배속 발화 0 (106 끔 · ${rows[0].tts.fast})`);
    ok(rows[5].tts.fast > 0, `되돌림 실증(D-09): ?tts106=1 → 배속 발화 ${rows[5].tts.fast} (붉음)`);

    /* ④ 안드로이드는 숨을 안 보낸다 */
    {
      const room = relay.newRoom('guide');
      const host = await openHost(base, room);
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
      const page = await ctx.newPage();
      await page.goto(`${base}/web/listener/?room=${room.code}&lang=vi`);
      await page.click('#btn-join');
      await page.waitForSelector('#chat-screen', { state: 'visible' });
      await sleep(11000);
      ok(!(relay.rooms.get(room.code).beats || []).length, '④ 안드로이드 크롬 — 숨 0');
      host.close(); await ctx.close();
    }

    /* ⑤ 언어 조각 — 판 번호 주소 · 옛 조각(캐시)이 오면 쓰지 않고 캐시 무시로 한 번 더 */
    {
      const rev = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web/listener/ui-strings/_langs.json'), 'utf-8')).rev;
      const fresh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web/listener/ui-strings/vi.json'), 'utf-8'));
      const old = JSON.parse(JSON.stringify(fresh)); old.rev = 'old00000';
      for (const k of Object.keys(old.strings)) if (old.strings[k].vi) old.strings[k].vi = 'CŨ';
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
      const page = await ctx.newPage();
      const asked = [];
      let n = 0;
      await page.route(/\/web\/listener\/ui-strings\/vi\.json/, (r) => {
        asked.push(r.request().url().replace(/^.*\/ui-strings\//, '') + ' ' + (r.request().headers()['cache-control'] || ''));
        n += 1;
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(n === 1 ? old : fresh) });   // 첫 번은 캐시에 있던 옛 조각
      });
      await page.goto(`${base}/web/listener/?lang=vi`);
      await page.waitForSelector('#btn-join');
      await sleep(500);
      const r = await page.evaluate(() => ({ log: window.rtUiStrings.log(), join: document.getElementById('btn-join').textContent.trim() }));
      ok(asked[0] && asked[0].indexOf('vi.json?v=' + rev) === 0, `⑤ 판 번호 주소로 받는다 (${asked[0]})`);
      ok(r.log.some(l => /ui_strings_fail why=old lang=vi/.test(l)) && asked.length === 2, `⑤ 옛 조각 → 기록 ${JSON.stringify(r.log)} · 한 번 더 (${asked.length}번)`);
      ok(r.join && r.join !== 'CŨ' && r.join === fresh.strings.join_button.vi, `⑤ 새 조각 글자로 (「${r.join}」)`);
      await ctx.close();
    }
  } catch (e) {
    console.error('[FAIL]', e && e.message || e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    relay.close();
  }
  console.log(`\n=== ${pass} PASS ===`);
})();
