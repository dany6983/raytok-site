/* samples/listener_ask_mic_test.js — 지명 뒤 손님 마이크 (NOW 11-04 16:00 ①②③④)
 * 실행: node samples/listener_ask_mic_test.js   (npm run test:listener-ask-mic)
 *
 * 대표님 실기 11-04 15:52 (안드로이드 크롬): 손들기 → 지명 → 마이크 표시는 보이는데 마이크 안 됨, 글자 칸만.
 *  ⓐ 인식기가 `not-allowed` → 화면(ask-status-msg)에 그 까닭 한 줄 (전에는 connLog 에만)
 *  ⓑ 「🎤 말하기」 누르기 전 start 0회 · 누른 뒤 1회 (사람 손가락 안에서 start) · 말한 문장 = 원문+언어만(P-14)
 *  ⓒ 지명되면 speechSynthesis.cancel 1회 (TTS 가 마이크를 잡고 있지 않게) · 발언권 끝나면 이어 읽기
 *  ⓓ 되돌림 실증 — ?askauto=1(옛 판: 지명 안에서 저절로 start) 은 누르기 전에 start 1회
 * 길은 진짜와 같다: 손님이 ✋ 로 올리고(가짜 릴레이) → 강사 소켓이 grant 를 보낸다 → 손님 페이지가 받는다.
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

console.log('=== 지명 뒤 손님 마이크 — 왜를 화면에 · 손가락으로 start · 말할 때 소리 끔 ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });

/* 가짜 인식기 — 진짜 규약대로(D-11): start → onstart, 거절이면 onerror('not-allowed') 뒤 onend.
   window.__recMode = 'deny' 면 거절. 가짜 TTS 는 cancel 을 센다. */
const FAKE = `
  window.__rec = { starts: 0, last: null };
  window.__recMode = 'ok';
  class FakeRec {
    constructor() { this.lang = ''; this.running = false; }
    start() {
      window.__rec.starts += 1; window.__rec.last = this;
      if (window.__recMode === 'deny') {
        setTimeout(() => { if (this.onerror) this.onerror({ error: 'not-allowed' }); if (this.onend) this.onend(); }, 10);
        return;
      }
      this.running = true; if (this.onstart) this.onstart();
    }
    stop() { if (!this.running) return; this.running = false; if (this.onend) this.onend(); }
    say(text) {
      const r = [{ 0: { transcript: text }, isFinal: true, length: 1 }];
      if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
    }
  }
  window.SpeechRecognition = FakeRec;
  window.__tts = { cancel: 0, speak: [] };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [{ lang: 'en-US', name: 'en', localService: true, default: true }],
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    speak(u) { if (u && u.text) window.__tts.speak.push(u.text); setTimeout(() => { if (u && u.onend) u.onend({}); }, 0); },
    cancel() { window.__tts.cancel += 1; }, pause() {}, resume() {} } });
  window.__sent = [];
  const os = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { window.__sent.push(JSON.parse(d)); } catch (_) {} return os.call(this, d); };
`;

async function hostRoom(port) {
  const room = relay.newRoom('lecture');
  const ws = new WebSocket(`ws://localhost:${port}/ws?room=${room.code}&role=host&token=${room.token}`);
  const got = [];
  ws.on('message', (m) => { try { got.push(JSON.parse(m.toString())); } catch (_) {} });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.send(JSON.stringify({ welcome: 1, plan: 'lecture', src_lang: 'ko', q: 1 }));
  return { room, ws, got };
}

async function guestGranted(browser, base, port, extra) {
  const h = await hostRoom(port);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await ctx.addInitScript(FAKE);
  const g = await ctx.newPage();
  g.on('pageerror', e => console.log('GUEST ERROR:', e.message));
  await g.goto(`${base}/web/listener/?room=${h.room.code}&lang=en&relay=localhost:${port}${extra || ''}`);
  await g.waitForSelector('#room-input');
  await g.click('#btn-join');
  await g.waitForSelector('#chat-screen', { state: 'visible' });
  await g.click('#btn-ask');
  await g.fill('#ask-input-text', 'hand up');
  await g.click('#btn-ask-submit');
  const ask = await (async () => { for (let i = 0; i < 50; i++) { const a = h.got.find(m => m.kind === 'ask'); if (a) return a; await new Promise(r => setTimeout(r, 100)); } return null; })();
  assert(ask && ask.id, '손님 ✋ 가 강사에게 닿았다');
  const cancelBefore = await g.evaluate(() => window.__tts.cancel);
  h.ws.send(JSON.stringify({ kind: 'grant', id: ask.id, seq: 1 }));
  await g.waitForSelector('#ask-modal', { state: 'visible' });
  return { ctx, g, h, ask, cancelBefore };
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    /* ⓑⓒ 기본 — 단추 */
    console.log('\n[ⓑⓒ] 지명 → 「🎤 말하기」 단추 · 누르기 전 start 0 · 소리 끔');
    const A = await guestGranted(browser, base, port);
    await A.g.waitForSelector('#btn-ask-mic', { state: 'visible', timeout: 5000 });
    const label = (await A.g.textContent('#btn-ask-mic')).trim();
    ok(label === '🎤 Speak', `단추 글자는 손님 말 표에서 (${label})`);
    ok(/🎤 Tap Speak/.test(await A.g.textContent('#ask-status-msg')), '안내 한 줄: 단추를 누르고 말하라');
    ok(await A.g.evaluate(() => window.__rec.starts) === 0, '누르기 전 start 0회 — 지명 메시지 안에서 저절로 열지 않는다');
    ok(await A.g.evaluate(() => window.__tts.cancel) - A.cancelBefore >= 1, `지명되면 소리를 끈다 (cancel ${await A.g.evaluate(() => window.__tts.cancel) - A.cancelBefore}회)`);
    A.h.ws.send(JSON.stringify({ seq: 99, src_lang: 'ko', text: '지명 중.', tr: { en: 'During floor.' } }));
    await A.g.waitForTimeout(400);
    ok(!(await A.g.evaluate(() => window.__tts.speak)).includes('During floor.'), '발언권 동안 들은 줄은 소리 내지 않는다 (글자만)');
    await A.g.click('#btn-ask-mic');
    ok(await A.g.evaluate(() => window.__rec.starts) === 1, '누른 뒤 start 1회 (사람 손가락 안에서)');
    ok(/Speak now/.test(await A.g.textContent('#ask-status-msg')), '열리면 「말씀하세요」');
    await A.g.evaluate(() => window.__rec.last.say('Is lunch included?'));
    await A.g.waitForTimeout(200);
    const q = (await A.g.evaluate(() => window.__sent)).filter(m => m.kind === 'question');
    ok(q.length === 1 && q[0].src === 'Is lunch included?' && q[0].srcLang === 'en' && q[0].id === A.ask.id && !q[0].tr && !q[0].trans,
       '말한 문장 = 원문+언어만 (P-14)');
    await A.g.evaluate(() => window.__rec.last.stop());
    ok((await A.g.textContent('#btn-ask-mic')).trim() === '🎤 Speak again', '끝나면 「다시 말하기」 (저절로 다시 열지 않는다)');
    // 발언권 끝 — 단추 숨김 · 이어 읽기
    A.h.ws.send(JSON.stringify({ kind: 'revoke', id: A.ask.id }));
    await A.g.waitForSelector('#btn-ask-mic', { state: 'hidden', timeout: 3000 });
    ok(true, '발언권이 끝나면 단추를 숨긴다');
    // 발언권 끝난 뒤 들은 줄은 다시 소리 낸다 (지명 동안은 막았다)
    const spokeBefore = await A.g.evaluate(() => window.__tts.speak.length);
    A.h.ws.send(JSON.stringify({ seq: 1, src_lang: 'ko', text: '다음입니다.', tr: { en: 'Next.' } }));
    await A.g.waitForFunction((n) => window.__tts.speak.length > n, spokeBefore, { timeout: 3000 });
    ok(true, '발언권이 끝나면 다시 읽는다');
    await A.ctx.close(); A.h.ws.close();

    /* ⓐ 거절 → 화면에 까닭 */
    console.log('\n[ⓐ] not-allowed → 화면에 까닭');
    const B = await guestGranted(browser, base, port);
    await B.g.waitForSelector('#btn-ask-mic', { state: 'visible', timeout: 5000 });
    await B.g.evaluate(() => { window.__recMode = 'deny'; });
    await B.g.click('#btn-ask-mic');
    await B.g.waitForFunction(() => /permission/i.test(document.getElementById('ask-status-msg').textContent), null, { timeout: 3000 });
    const msg = (await B.g.textContent('#ask-status-msg')).trim();
    ok(/Mic permission is off — tap 🔒/.test(msg), `거절 까닭이 화면에: "${msg}"`);
    ok(await B.g.isVisible('#ask-input-text'), '글자 칸은 그대로 — 말할 길이 남는다 (R-15)');
    ok((await B.g.textContent('#btn-ask-mic')).trim() === '🎤 Speak again', '「다시 말하기」 — 권한을 켠 뒤 다시 누를 수 있다');
    await B.ctx.close(); B.h.ws.close();

    /* ⓓ 되돌림 실증 — 옛 판(지명 안에서 저절로) */
    console.log('\n[ⓓ] ?askauto=1 — 옛 판은 누르기 전에 start');
    const C = await guestGranted(browser, base, port, '&askauto=1');
    await C.g.waitForFunction(() => window.__rec.starts >= 1, null, { timeout: 5000 });
    ok(await C.g.evaluate(() => window.__rec.starts) === 1, '되돌림 실증 ② — 자동 판은 단추를 안 눌러도 start 1회 (실기에서 깨진 길)');
    await C.ctx.close(); C.h.ws.close();
  } finally {
    await browser.close();
    relay.close();
  }
  console.log(`\n=== ${passCount} PASS ===`);
})().catch(e => { console.error('[FAIL]', e && e.message || e); process.exit(1); });
