// samples/demo_flow_test.js — 데모 대본 ④ 웹 강연을 **한 번에** 돈다 (NOW 10-29 07:55 ②)
//
// 대본: raytok-engine docs/marketing/demo-script.md 「9:30–13:30 ④ 웹 강연」 (읽기만, 바꾸지 않음)
//   강사 PC: /web/host → 이용권 인증됨 → 원고 없이 강의 시작 → 「QR」(주소) → 🎤 말하기
//   손님 둘(앱 없음): QR 주소로 들어와 자기 언어 → 강사 말이 줄로 온다
//   「⏸ 쉬는 시간」 한 번 → 손님 쪽 멈춤 → 다시 → 손님 쪽 다시
//   손들기: 손님 ✋ 글 질문 둘 → 강사 대기줄 [선택] → 그 손님 「발언 중」 · [무시] → 그 손님 단추 원래대로
//   끝: 강의 끝(#step-end) → 방 닫기 → 손님에게 끝(end) — 리포트 저장은 누르지 않는다(대본)
// 단추는 **눌러서** 본다(MISTAKES #11). 강사·손님 모두 진짜 페이지, 릴레이는 samples/mock_relay(진짜 /ws 길).
// 어디서: 크로미움은 늘. 웹킷(아이폰 엔진)은 깔려 있을 때 같은 흐름을 한 번 더 — 없으면 크게 「웹킷 못 돌림」.
//         RT_REQUIRE_WEBKIT=1 이면 웹킷이 없을 때 붉다.
// 실행: node samples/demo_flow_test.js   (npm run test:demo-flow)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pw = require('playwright');
const { createMockRelay } = require('./mock_relay');

console.log('=== 데모 대본 ④ 웹 강연 한 번에 (강사 시작 → QR → 멈춤/다시 → 손들기 [선택]/[무시] → 끝) ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

/* 헤드리스에는 진짜 인식·목소리·화면잠금이 없다 — 실제 API 꼴 그대로 흉내(D-11) */
const HOST_INIT = `
  window.__sent = [];
  const _send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    try { if (typeof d === 'string' && d.indexOf('__ping') < 0) window.__sent.push(JSON.parse(d)); } catch (_) {}
    return _send.apply(this, arguments);
  };
  class FakeRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.running=false; }
    start() { if (this.running) throw new Error('already started'); this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
    stop() { this.running = false; if (this.onend) this.onend(); }
    say(text) {
      const r = [{ 0: { transcript: text }, isFinal: true, length: 1 }];
      if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
    }
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) } });
`;
const GUEST_INIT = `
  window.__got = [];
  const _WS = window.WebSocket;
  window.WebSocket = function (u, p) {
    const ws = p ? new _WS(u, p) : new _WS(u);
    ws.addEventListener('message', (e) => { try { window.__got.push(JSON.parse(e.data)); } catch (_) {} });
    return ws;
  };
  window.WebSocket.prototype = _WS.prototype;
  ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { window.WebSocket[k] = _WS[k]; });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ released: false, release: async () => {}, addEventListener() {} }) } });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [], speak: () => {}, cancel: () => {}, pause() {}, resume() {}, speaking: false, pending: false,
    set onvoiceschanged(_) {}, get onvoiceschanged() { return null; }, addEventListener() {} } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
`;

async function flow(name, browserType, base) {
  console.log(`\n── ${name}`);
  const browser = await browserType.launch(name === 'chromium' ? { args: ['--no-sandbox'] } : {});
  try {
    /* ── 강사 PC ── */
    const hctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
    await hctx.addInitScript(HOST_INIT);
    const host = await hctx.newPage();
    const dialogs = [];
    host.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
    const sent = () => host.evaluate(() => window.__sent);
    const mark = () => host.evaluate(() => window.__sent.length);

    await host.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
    await host.fill('#tokenInput', 'valid_instructor_token');
    await host.click('#btnVerifyToken');
    await host.waitForSelector('#step-prepare', { state: 'visible' });
    ok(true, `[${name}] 강사: 이용권 확인 → 준비 화면 (인증됨)`);
    const chkQ = await host.$('#chkEnableQuestion');
    if (chkQ && !(await chkQ.isChecked())) await chkQ.check();
    ok(await host.isChecked('#chkEnableQuestion'), `[${name}] 강사: 질문 받기 켜짐 (손들기 장면에 필요)`);
    ok(await host.evaluate(() => document.querySelectorAll('.para-item').length === 0), `[${name}] 강사: 원고 없이 시작 (대본 「원고 없이 🎤 시작」)`);
    await host.click('#btnStartLecture');
    await host.waitForSelector('#step-live', { state: 'visible' });
    await host.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
    ok(true, `[${name}] 강사: 강의 시작 → 진행 화면 · 「연결됨」`);

    /* ── QR ── */
    const joinUrl = (await host.textContent('#joinUrl')).trim();
    const qrDrawn = await host.evaluate(() => !!document.querySelector('#qrBox svg, #qrBox canvas, #qrBox img, #qrBox table'));
    ok(qrDrawn && /\/web\/listener\/\?/.test(joinUrl) && /[?&]q=1/.test(joinUrl), `[${name}] 강사: QR 그려짐 · 주소 ${joinUrl.replace(base, '')}`);

    /* ── 손님 둘 (QR 주소 그대로 + 자기 언어) ── */
    const guests = [];
    for (const lang of ['vi', 'en']) {
      const gctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: lang === 'vi' ? 'vi-VN' : 'en-US' });
      await gctx.addInitScript(GUEST_INIT);
      const g = await gctx.newPage();
      await g.goto(joinUrl + '&lang=' + lang);
      await g.click('#btn-join');
      await g.waitForSelector('#chat-screen', { state: 'visible' });
      guests.push({ lang, g });
    }
    await host.waitForFunction(() => Number(document.getElementById('attNow').textContent) >= 2, null, { timeout: 5000 });
    ok(true, `[${name}] 손님 2명(vi·en) QR 주소로 참여 → 강사 화면 참여 ${await host.textContent('#attNow')}명`);

    /* ── 강사가 말한다 → 손님에게 줄 ── */
    /* 원고 없이 시작하면 🎤 가 저절로 켜진다(정본 §1 ②) — 이미 켜졌으면 누르지 않는다(누르면 끈다) */
    await host.waitForTimeout(300);
    const autoOn = await host.evaluate(() => !!(window.__rec && window.__rec.running));
    if (!autoOn) await host.click('#btnMic');
    ok(await host.evaluate(() => document.getElementById('btnMic').classList.contains('on')) || autoOn, `[${name}] 🎤 켜짐 (${autoOn ? '시작과 함께 저절로' : '단추로'})`);
    await host.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 4000 }).catch(async (e) => {
      console.log('micStatus:', await host.textContent('#micStatus'), '| micBox:', await host.isVisible('#micBox'), '| note:', await host.textContent('#micOffNote'));
      throw e;
    });
    await host.evaluate(() => window.__rec.say('안전모를 꼭 쓰세요.'));
    for (const { lang, g } of guests) {
      await g.waitForFunction(() => window.__got.some((m) => (m.src || m.text || '').includes('안전모')), null, { timeout: 5000 });
      await g.waitForSelector('.msg-line', { timeout: 5000 });
    }
    ok(true, `[${name}] 🎤 강사 한 문장 → 손님 둘에게 줄로 온다`);

    /* ── 멈춤 / 다시 (⏸ 쉬는 시간) ── */
    let n = await mark();
    await host.click('#btnBreak');
    ok((await sent()).slice(n).some((m) => m.kind === 'pause'), `[${name}] ⏸ 쉬는 시간 → 강사가 pause 보냄`);
    for (const { g } of guests) await g.waitForFunction(() => window.__got.some((m) => m.kind === 'pause' || (m.kind === 'break' && m.on)), null, { timeout: 5000 });
    ok(true, `[${name}] 손님 둘이 멈춤을 받았다`);
    n = await mark();
    await host.click('#btnBreak');
    ok((await sent()).slice(n).some((m) => m.kind === 'resume'), `[${name}] 다시 → 강사가 resume 보냄`);
    for (const { g } of guests) await g.waitForFunction(() => window.__got.some((m) => m.kind === 'resume' || (m.kind === 'break' && m.on === false)), null, { timeout: 5000 });
    ok(true, `[${name}] 손님 둘이 다시를 받았다`);
    /* 되돌림 실증 — 손잡이 없는 ⏸ 단추(MISTAKES #11: 그림만 있는 단추)면 위 「pause 보냄」 단언이 붉다.
       cloneNode 는 손잡이를 버린다. 확인 뒤 원래 단추를 제자리에. 값은 페이지가 실제로 보낸 것이다. */
    let revertBreakFailed = false;
    const orig = await host.evaluateHandle(() => { const b = document.getElementById('btnBreak'); const c = b.cloneNode(true); b.replaceWith(c); return b; });
    try {
      const n2 = await mark(); await host.click('#btnBreak'); await host.waitForTimeout(200);
      assert((await sent()).slice(n2).some((m) => m.kind === 'pause'));
    } catch (_) { revertBreakFailed = true; }
    await host.evaluate((b) => document.getElementById('btnBreak').replaceWith(b), orig);
    ok(revertBreakFailed === true, `[${name}] 되돌림 실증: 손잡이 없는 ⏸ 단추로는 pause 가 안 나가 단언이 붉다`);

    /* ── 손들기: 둘이 손 들고 [선택] 하나 · [무시] 하나 ── */
    const askTxt = {};
    for (const { lang, g } of guests) {
      askTxt[lang] = (await g.textContent('#btn-ask')).trim();
      await g.click('#btn-ask');
      await g.fill('#ask-input-text', lang === 'vi' ? 'Câu hỏi về mũ bảo hộ' : 'Question about gloves');
      await g.click('#btn-ask-submit');
      await g.waitForFunction((t0) => document.getElementById('btn-ask').textContent.trim() !== t0, askTxt[lang], { timeout: 3000 });
    }
    await host.waitForFunction(() => document.querySelectorAll('#askQueueList > div').length === 2, null, { timeout: 5000 });
    ok(true, `[${name}] ✋ 손님 둘 → 강사 대기줄 2줄`);

    const rowOf = (text) => host.evaluate((t) => [...document.querySelectorAll('#askQueueList > div')].findIndex((d) => d.textContent.includes(t)) + 1, text);
    n = await mark();
    await host.click(`#askQueueList > div:nth-child(${await rowOf('mũ bảo hộ')}) button:nth-child(1)`);
    const grant = (await sent()).slice(n).find((m) => m.kind === 'grant');
    ok(!!grant, `[${name}] 강사 [선택] → grant`);
    const vi = guests[0].g;
    await vi.waitForFunction((t0) => { const t = document.getElementById('btn-ask').textContent.trim(); return t !== t0 && /🎤/.test(t); }, askTxt.vi, { timeout: 5000 });
    ok(true, `[${name}] 지명된 손님(vi) 단추 「${(await vi.textContent('#btn-ask')).trim()}」 — 자기 말로 묻는 차례`);
    const en = guests[1].g;
    ok(!/🎤/.test(await en.textContent('#btn-ask')), `[${name}] 지명 안 된 손님(en) 마이크는 안 열린다`);

    n = await mark();
    await host.click(`#askQueueList > div:nth-child(${await rowOf('gloves')}) button:nth-child(2)`);
    const rv = (await sent()).slice(n).find((m) => m.kind === 'revoke' && m.reason === 'dismissed');
    ok(!!rv, `[${name}] 강사 [무시] → revoke(dismissed)`);
    await en.waitForFunction((t0) => document.getElementById('btn-ask').textContent.trim() === t0, askTxt.en, { timeout: 5000 });
    ok(true, `[${name}] 무시된 손님(en) 단추가 원래 「${askTxt.en}」 로`);
    ok(!(await sent()).some((m) => m.kind === 'answer'), `[${name}] answer 를 보낸 단추 0 (장부 60 — 선택·무시만)`);

    /* ── 끝 ── */
    await host.click('#btnEnd');
    await host.waitForSelector('#step-end', { state: 'visible' });
    ok(!(await host.isVisible('#step-live')), `[${name}] 강의 끝 → 끝 화면 (리포트 저장은 누르지 않는다 — 대본)`);
    n = await mark();
    await host.click('#btnCloseRoom');
    await host.waitForFunction(() => document.getElementById('btnCloseRoom').disabled, null, { timeout: 3000 });
    ok((await sent()).slice(n).some((m) => m.end === 1), `[${name}] 방 닫기 → end 보냄`);
    for (const { g } of guests) await g.waitForFunction(() => window.__got.some((m) => m.end), null, { timeout: 5000 });
    ok(true, `[${name}] 손님 둘이 끝(end)을 받았다`);
  } finally {
    await browser.close();
  }
}

(async () => {
  const relay = createMockRelay({ root: path.join(__dirname, '..') });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  try {
    await flow('chromium', pw.chromium, base);
    let wkPath = '';
    try { wkPath = pw.webkit.executablePath(); } catch (_) {}
    if (wkPath && fs.existsSync(wkPath)) {
      await flow('webkit', pw.webkit, base);
    } else {
      console.log('\n  ★★ [웹킷 못 돌림] playwright 웹킷이 이 기계에 없다 (`npx playwright install webkit`). 아이폰 엔진은 이번에 안 쟀다.');
      if (process.env.RT_REQUIRE_WEBKIT === '1') throw new Error('RT_REQUIRE_WEBKIT=1 인데 웹킷이 없다');
    }
  } finally {
    await relay.close();
  }
  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
