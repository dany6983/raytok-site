// samples/listener_webkit_flow_test.js — 손님 페이지 기본 흐름 + WakeLock (NOW 10-28 21:50 ④)
//
// 무엇을: 참여 → 원고 줄 받기(읽기) → 강사 ■ 멈춤 → ▶ 다시(멈춘 문장부터) → 끝.
//         WakeLock: 참여하면 잡는다 · 폰이 놓으면(release) 다시 잡는다 · 다시 잡기가 거절돼도
//         화면이 돌아오면(visibilitychange) 다시 잡는다 · 끝나면 풀고 다시 잡지 않는다.
// 어디서: 크로미움은 늘. **웹킷(아이폰 사파리 엔진)은 깔려 있을 때** 같은 흐름을 한 번 더 돈다.
//         웹킷이 없으면 크게 「웹킷 못 돌림」이라고 찍는다(조용히 건너뛰지 않는다).
//         RT_REQUIRE_WEBKIT=1 이면 웹킷이 없을 때 붉다.
// 되돌려서 실패 확인(D-09): index.src.html requestWakeLock 의 release 처리기 안 `requestWakeLock();` 를 지우면
//         [WakeLock 놓친 뒤 다시 잡기] 가 붉다 · releaseWake 의 `isSessionActive = false;` 를 지우면 [끝나면 다시 안 잡음] 이 붉다.
// 실행: node samples/listener_webkit_flow_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pw = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

console.log('=== 손님 페이지 기본 흐름 + WakeLock (크로미움 · 웹킷) ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });

/* 헤드리스에는 진짜 wakeLock·목소리가 없다 — 실제 API 꼴 그대로 흉내(D-11):
   request('screen') → 센티넬(addEventListener('release'), release() 하면 'release' 가 온다). */
const INIT = `
  window.__wake = { req: 0, deny: 0, rel: 0, cur: null };
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async (type) => {
    window.__wake.req++;
    if (window.__wake.deny > 0) { window.__wake.deny--; throw new DOMException('denied', 'NotAllowedError'); }
    const s = { type, released: false, _h: [],
      addEventListener(t, f) { if (t === 'release') this._h.push(f); },
      async release() { if (this.released) return; this.released = true; window.__wake.rel++; this._h.forEach(f => f()); } };
    window.__wake.cur = s; return s;
  } } });
  window.__utt = []; window.__cancel = 0;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [{ name: 'Viet', lang: 'vi-VN', localService: true, voiceURI: 'v', default: true }],
    speak: (u) => { if (u && u.text) window.__utt.push(u); }  /* 빈 발화(첫 탭 소리 세션 열기)는 세지 않는다 */, cancel: () => { window.__cancel++; },
    pause() {}, resume() {}, speaking: false, pending: false,
    set onvoiceschanged(_) {}, get onvoiceschanged() { return null; }, addEventListener() {} } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.voice = null; this.lang = ''; this.rate = 1; };
`;

function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      if (raw.toString().includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'trial', guide: 1, src_lang: 'ko', script: 1 }));
    });
  });
}

async function flow(name, browserType, base) {
  console.log(`\n── ${name}`);
  const browser = await browserType.launch(name === 'chromium' ? { args: ['--no-sandbox'] } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const W = () => page.evaluate(() => ({ req: window.__wake.req, rel: window.__wake.rel }));
    const said = () => page.evaluate(() => window.__utt.map(u => u.text));

    // 1. 참여
    const room = relay.newRoom('guide');
    const host = await openHost(base, room);
    await page.goto(`${base}/web/listener/?room=${room.code}&lang=vi`);
    await page.click('#btn-join');
    await page.waitForSelector('#chat-screen', { state: 'visible' });
    await page.waitForFunction(() => window.__wake.req >= 1);
    ok((await W()).req === 1, `[${name}] 참여 → WakeLock 한 번 잡는다`);

    // 2. 원고 줄 받기 → 첫 문장부터 읽는다
    host.send(JSON.stringify({ kind: 'script', para: 1, total: 2, at: 111, src: '첫 문장. 둘째 문장. 셋째 문장.', trans: { vi: 'Câu một. Câu hai. Câu ba.' } }));
    await page.waitForSelector('.msg-line');
    await page.waitForFunction(() => window.__utt.length >= 1);
    ok((await said())[0] === 'Câu một.', `[${name}] 원고 줄이 오면 화면에 줄 + 첫 문장을 읽는다 ("${(await said())[0]}")`);
    await page.evaluate(() => { const u = window.__utt[window.__utt.length - 1]; u.onend && u.onend(); });
    await page.waitForFunction(() => window.__utt.length >= 2);
    ok((await said())[1] === 'Câu hai.', `[${name}] 한 문장이 끝나면 다음 문장 ("Câu hai.")`);

    // 3. 강사 ■ 멈춤 → 소리 멈춤
    const cBefore = await page.evaluate(() => window.__cancel);
    host.send(JSON.stringify({ kind: 'pause', why: 'host' }));
    await page.waitForFunction(() => window.rtRead.state() && window.rtRead.state().paused === true);
    ok(await page.evaluate((c) => window.__cancel > c, cBefore), `[${name}] ■ 멈춤 → 손님 폰 speechSynthesis.cancel · 읽기 멈춤`);
    const nPaused = (await said()).length;

    // 4. ▶ 다시 → 멈춘 문장부터 (문단 처음이 아니다)
    host.send(JSON.stringify({ kind: 'resume' }));
    await page.waitForFunction((n) => window.__utt.length > n, nPaused);
    const after = (await said()).slice(nPaused);
    ok(after[0] === 'Câu hai.' && !(await page.evaluate(() => window.rtRead.state().paused)),
       `[${name}] ▶ 다시 → 멈춘 문장부터 ("${after[0]}") · 문단 처음("Câu một.")으로 안 돌아간다`);

    // 5. WakeLock — 폰이 놓으면 다시 잡는다
    await page.evaluate(() => window.__wake.cur.release());
    await page.waitForFunction(() => window.__wake.req >= 2);
    ok((await W()).req === 2, `[${name}] [WakeLock 놓친 뒤 다시 잡기] 폰이 놓으면(release) 곧바로 다시 잡는다`);
    //    다시 잡기가 거절되면(화면 꺼짐 등) → 화면이 돌아올 때 다시 잡는다
    await page.evaluate(() => { window.__wake.deny = 1; window.__wake.cur.release(); });
    await page.waitForFunction(() => window.__wake.req >= 3);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => window.__wake.req >= 4);
    ok(await page.evaluate(() => window.__wake.cur && !window.__wake.cur.released),
       `[${name}] [WakeLock 화면 돌아오면 다시] 거절된 뒤 visibilitychange → 다시 잡혀 있다 (요청 ${(await W()).req}번)`);

    // 6. 끝 → 풀고 다시 잡지 않는다
    const before = await W();
    host.send(JSON.stringify({ end: 1, summary: { lines: 1, minutes: 0 } }));
    await page.waitForFunction(() => window.__wake.cur.released === true, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    const end = await W();
    ok(end.rel === before.rel + 1 && end.req === before.req,
       `[${name}] [끝나면 풀기] end → release 1번 · 그 뒤 다시 안 잡음 (요청 ${before.req}→${end.req})`);
    host.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  let webkitRan = false;
  try {
    await flow('chromium', pw.chromium, base);
    let wkPath = '';
    try { wkPath = pw.webkit.executablePath(); } catch (_) {}
    if (wkPath && fs.existsSync(wkPath)) {
      await flow('webkit', pw.webkit, base);
      webkitRan = true;
    } else {
      console.log('\n  ★★ [웹킷 못 돌림] playwright 웹킷이 이 기계에 없다 (`npx playwright install webkit` — 컨테이너는 내려받기 403). 아이폰 엔진은 이번에 안 쟀다.');
      if (process.env.RT_REQUIRE_WEBKIT === '1') throw new Error('RT_REQUIRE_WEBKIT=1 인데 웹킷이 없다');
    }
  } catch (e) {
    console.error('\n[FAIL]', e.message);
    await relay.close?.();
    process.exit(1);
  }
  // 되돌림 실증 ① — 실제 손님 페이지(index.html)에서 「놓치면 다시 잡기」 한 줄을 지운 판을 띄우면 붉어야 한다
  {
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-wake-'));
    const R = path.join(__dirname, '..');
    fs.mkdirSync(path.join(tmp, 'web'), { recursive: true });
    fs.cpSync(path.join(R, 'web', 'listener'), path.join(tmp, 'web', 'listener'), { recursive: true });
    fs.cpSync(path.join(R, 'common'), path.join(tmp, 'common'), { recursive: true });
    const f = path.join(tmp, 'web', 'listener', 'index.html');
    const src = fs.readFileSync(f, 'utf-8');
    const cut = src.replace(/(addEventListener\('release', function\(\) \{\s*wakeLock = null;\s*if \(isSessionActive\) \{\s*)requestWakeLock\(\);/, '$1');
    ok(cut !== src, '되돌림 준비: 손님 페이지에서 release 뒤 requestWakeLock 한 줄을 찾아 지웠다');
    fs.writeFileSync(f, cut);
    const relay2 = createMockRelay({ root: tmp });
    const port2 = await relay2.listen();
    const b = await pw.chromium.launch({ args: ['--no-sandbox'] });
    let revertFailed = false;
    try {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
      await ctx.addInitScript(INIT);
      const page = await ctx.newPage();
      const room = relay2.newRoom('guide');
      const host = await openHost(`http://localhost:${port2}`, room);
      await page.goto(`http://localhost:${port2}/web/listener/?room=${room.code}&lang=vi`);
      await page.click('#btn-join');
      await page.waitForFunction(() => window.__wake.req >= 1);
      await page.evaluate(() => window.__wake.cur.release());
      try { await page.waitForFunction(() => window.__wake.req >= 2, null, { timeout: 1500 }); } catch (_) { revertFailed = true; }
      host.close();
    } finally { await b.close(); await relay2.close?.(); fs.rmSync(tmp, { recursive: true, force: true }); }
    ok(revertFailed === true, '되돌림 실증 ①: 「놓치면 다시 잡기」를 지운 판은 [WakeLock 놓친 뒤 다시 잡기] 가 붉다');
  }
  await relay.close?.();
  console.log(`\n전부 통과 (${passCount}건) · 웹킷 ${webkitRan ? '돌림' : '못 돌림'}`);
  process.exit(0);
})();
