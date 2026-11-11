/* samples/ask_flow2_test.mjs — 질문 흐름 2 (NOW 11-11 15:26 ①~⑥) · npm run test:ask-flow2
 *
 * 대표님 15:04 「어떻게 쓰는지 모르겠어」 · 15:24 「2번째 화면에도 문자 쓰는 창, 말하기 버튼 작동 안 함 — 둘 다」.
 * 가짜 방: 강사 1(진짜 강사 화면) · 손님 2(안드로이드 크롬 UA en · 아이폰 사파리 UA ja). 단추는 **눌러서** 잰다(MISTAKES #11).
 *  ① 글 없이 손들기 → 강사 목록 이름·언어만 · 글 있는 질문은 **강사 말로**(받는 쪽 번역) — 번역 전 흐림
 *  ② 지명 → 원고 멈춤 · 안드로이드 화면 = 마이크 1 · 글 0 / 아이폰 = 글 1 · 마이크 0 (start 0회)
 *  ③ 말함 → 「전달 중…」→「전달됨 ✓」 · 강사 큰 칸에 번역된 질문
 *     마이크 실패(onstart·onerror 없이 3초) → 그 자리에서 글 칸 + 까닭 한 줄 · 글로 보냄
 *  ④ 「🎤 답변하기」 → 강사 🎤 켬 · 그 사이 줄은 손님 둘 다 「답변」 꼬리표 · 원문 줄(P-14)
 *  ⑤ 「질문 끝내기」 → revoke host_done · 🎤 닫힘 · 원고 다시 재생 · 손님 「질문 끝 — 감사합니다」 뒤 창 닫힘
 *  ⑥ 되돌림: `?askflow=0`(옛 판)이면 위 단언이 붉다 — 손님 화면에 글 칸·마이크 둘 다 · 강사 큰 단추 없음 · 목록 원문
 */
import path from 'path';
import assert from 'assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const UA_AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

/* 강사 쪽 가짜 — host_buttons_test 와 같은 꼴 */
const HOST_FAKE = `
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
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) } });
`;
/* 손님 쪽 가짜 인식기 — 진짜 규약대로(D-11). __recMode: ok | deny | silent(start 해도 아무 알림 없음 — 「눌러도 안 됨」) */
const GUEST_FAKE = `
  window.__rec = { starts: 0, last: null };
  window.__recMode = 'ok';
  class FakeRec {
    constructor() { this.lang = ''; this.running = false; }
    start() {
      window.__rec.starts += 1; window.__rec.last = this;
      if (window.__recMode === 'silent') return;
      if (window.__recMode === 'deny') { setTimeout(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }, 10); return; }
      this.running = true; this.onstart && this.onstart();
    }
    stop() { if (!this.running) return; this.running = false; this.onend && this.onend(); }
    abort() { this.stop(); }
    say(text) { const r = [{ 0: { transcript: text }, isFinal: true, length: 1 }]; this.onresult && this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) }); }
  }
  window.SpeechRecognition = FakeRec;
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [], speaking: false, pending: false, paused: false, onvoiceschanged: null,
    speak(u) {}, cancel() {}, pause() {}, resume() {} } });   // 끝 알림 없음 — 손님 읽기 완료(para_done)로 원고가 끝까지 달려가지 않게
  window.__sent = [];
  const os = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { window.__sent.push(JSON.parse(d)); } catch (_) {} return os.call(this, d); };
`;
/* 문단은 길게 — 질문 흐름 동안 재생이 원고 끝에 닿아 저절로 꺼지지 않게(문단 하나 ≈ 20초+) */
const LONG = ' 작업 전에는 반드시 주변을 살피고 위험 요소를 확인한 뒤 관리자에게 알리고 보호구 착용 상태를 서로 점검합니다.'.repeat(3);
const PARAS = ['첫 문단입니다 안전모를 쓰세요.' + LONG, '두 번째 문단입니다 장갑을 끼세요.' + LONG, '세 번째 문단입니다 출구를 확인하세요.' + LONG];

const vis = (p, sel) => p.isVisible(sel);
const txt = async (p, sel) => ((await p.textContent(sel)) || '').trim();
/* 질문 창 안에서 **보이는** 조작 단추·글 칸 수 */
const askControls = (p) => p.evaluate(() => {
  const shown = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
  return { mic: shown('btn-ask-mic') ? 1 : 0, text: shown('ask-input-text') ? 1 : 0, send: shown('btn-ask-submit') ? 1 : 0, write: shown('btn-ask-write') ? 1 : 0 };
});

async function hostUp(browser, base, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
  await ctx.addInitScript(HOST_FAKE);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('HOST ERROR:', e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR${extra || ''}`);
  await page.fill('#tokenInput', 'valid_instructor_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible' });
  await page.evaluate((paras) => {
    const dt = new DataTransfer();
    dt.items.add(new File([paras.join('\n\n')], 'g.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, PARAS);
  await page.waitForFunction((n) => document.querySelectorAll('.para-item').length === n, PARAS.length);
  await page.click('#btnPreTranslate');
  await page.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'done', null, { timeout: 20000 });
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
  const code = (await page.textContent('#roomCode')).trim();
  return { ctx, page, code };
}

async function guestUp(browser, base, port, code, ua, lang, name, extra) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, locale: lang === 'ja' ? 'ja-JP' : 'en-US' });
  await ctx.addInitScript(GUEST_FAKE);
  const g = await ctx.newPage();
  g.on('pageerror', e => console.log(`GUEST(${lang}) ERROR:`, e.message));
  await g.goto(`${base}/web/listener/?room=${code}&lang=${lang}&relay=localhost:${port}${extra || ''}`);
  await g.waitForSelector('#room-input');
  if (name && await g.isVisible('#name-input').catch(() => false)) await g.fill('#name-input', name);
  await g.click('#btn-join');
  await g.waitForSelector('#chat-screen', { state: 'visible' });
  await g.waitForSelector('#btn-ask', { state: 'visible', timeout: 8000 });
  return { ctx, g };
}

const queueText = (h) => h.page.evaluate(() => document.getElementById('askQueueList').textContent);

(async () => {
  const relay = createMockRelay({ root: ROOT });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    console.log('=== 질문 흐름 2 — 손들기 · 지명 뒤 하나만 · 전달됨 · 답변 꼬리표 · 질문 끝내기 ===');
    const H = await hostUp(browser, base);
    const A = await guestUp(browser, base, port, H.code, UA_AND, 'en', 'Ann');
    const B = await guestUp(browser, base, port, H.code, UA_IOS, 'ja', 'Bo');

    /* ① 손들기 */
    console.log('\n[①] 손들기 — 글 없이도 · 강사 목록은 강사 말로');
    await H.page.click('#btnPlay');       // 원고 재생 중에 손이 오른다
    ok(await H.page.evaluate(() => window.rtHostPlay.state.on), '원고 재생 중');
    await A.g.click('#btn-ask');
    ok(await A.g.evaluate(() => document.getElementById('ask-input-text').style.height === '34px'), '손들기 창의 글 칸은 한 줄로 접힘(선택)');
    await A.g.click('#btn-ask-submit');   // 글 없이
    await A.g.waitForFunction(() => /#\d/.test(document.getElementById('btn-ask').textContent), null, { timeout: 5000 });
    ok(/Waiting #1/.test(await txt(A.g, '#btn-ask')), `글 없이 손들기 → 「${await txt(A.g, '#btn-ask')}」`);
    const askA = (await A.g.evaluate(() => window.__sent)).find(m => m.kind === 'ask');
    ok(askA && askA.text === '' && !askA.tr && !askA.trans, '보낸 ask = 글 빈칸 · 번역 칸 없음(P-14)');
    /* 강사 쪽 /translate 를 0.8초 늦춘다 — 번역 전 흐림을 실제로 본다 */
    await H.page.route('**/translate', async (route) => { await sleep(800); route.continue(); });
    await B.g.click('#btn-ask');
    await B.g.fill('#ask-input-text', 'Where is the exit?');
    await B.g.click('#btn-ask-submit');
    await H.page.waitForFunction(() => document.querySelectorAll('#askQueueList button').length === 4, null, { timeout: 5000 });
    await H.page.waitForFunction(() => /Where is the exit/.test(document.getElementById('askQueueList').textContent), null, { timeout: 5000 });
    const dimSeen = await H.page.evaluate(() => [...document.querySelectorAll('#askQueueList .ask-q-text')].some(s => s.style.opacity === '0.5' && /Where is the exit/.test(s.textContent)));
    await H.page.waitForFunction(() => /\[ko\] Where is the exit\?/.test(document.getElementById('askQueueList').textContent), null, { timeout: 5000 });
    const q1 = await queueText(H);
    ok(/1\. Ann \[[^\]]*en\]/.test(q1) && !/Ann[^2]*— "/.test(q1.split('2.')[0]), `글 없는 손 = 이름·언어만 (${q1.split('2.')[0].replace(/선택|무시/g, '').trim()})`);
    ok(/\[ko\] Where is the exit\?/.test(q1) && !/— "Where is the exit\?"/.test(q1), '글 있는 질문 = 강사 말로 번역(받는 쪽, /translate) · 원문 대신');
    ok(dimSeen && !(await H.page.evaluate(() => [...document.querySelectorAll('#askQueueList .ask-q-text')].some(s => s.style.opacity === '0.5'))), '번역 전엔 원문 흐리게 → 번역 뒤 또렷하게 바뀜');
    await H.page.unroute('**/translate');
    ok(!(await H.page.evaluate(() => window.__sent)).some(m => m.kind === 'ask' || m.trans || (m.kind === 'grant' && m.trans)), '강사 기기가 번역문을 보내지 않는다(P-14)');

    /* ② 지명 — 안드로이드 */
    console.log('\n[②] 지명 → 안드로이드 화면 = 마이크 하나');
    let n = await H.page.evaluate(() => window.__sent.length);
    await H.page.click('#askQueueList > div:nth-child(1) button:nth-child(1)');
    await A.g.waitForSelector('#btn-ask-mic', { state: 'visible', timeout: 5000 });
    await A.g.waitForFunction(() => window.rtAskMic && window.rtAskMic.mode() === 'mic', null, { timeout: 5000 });
    const cA = await askControls(A.g);
    ok(cA.mic === 1 && cA.text === 0 && cA.send === 0, `안드로이드 지명 화면: 마이크 ${cA.mic} · 글 칸 ${cA.text} · 보내기 ${cA.send} (작은 글로 쓰기 ${cA.write})`);
    ok(await A.g.evaluate(() => window.__rec.starts) === 0, '누르기 전 인식 start 0회(손가락 안에서만)');
    ok(!(await H.page.evaluate(() => window.rtHostPlay.state.on)), '지명 → 원고 자동 멈춤');
    ok(await H.page.isVisible('#btnAskAnswer') && await H.page.isVisible('#btnAskEnd'), `강사 큰 단추 둘: 「${await txt(H.page, '#btnAskAnswer')}」「${await txt(H.page, '#btnAskEnd')}」`);
    const cBidle = await askControls(B.g);
    ok(!(await vis(B.g, '#ask-modal')) || (cBidle.mic === 0), '지명 안 된 아이폰 손님은 마이크가 안 열린다');

    /* ③ 말함 → 전달 중 → 전달됨 */
    console.log('\n[③] 말함 → 「전달 중…」→「전달됨 ✓」 · 강사 큰 칸');
    await A.g.click('#btn-ask-mic');
    ok(await A.g.evaluate(() => window.__rec.starts) === 1, '「🎤 말하기」 → start 1회');
    await A.g.evaluate(() => { window.__statusSeen = []; const st = document.getElementById('ask-status-msg'); new MutationObserver(() => window.__statusSeen.push(st.textContent)).observe(st, { childList: true, characterData: true, subtree: true }); });
    await A.g.evaluate(() => window.__rec.last.say('Is lunch included?'));
    await A.g.waitForFunction(() => /Sent to the instructor/.test(document.getElementById('ask-status-msg').textContent), null, { timeout: 5000 });
    ok((await A.g.evaluate(() => window.__statusSeen)).some(t => /Sending/.test(t)), '「Sending…」 를 거쳐 「Sent to the instructor ✓」');
    const qA = (await A.g.evaluate(() => window.__sent)).filter(m => m.kind === 'question');
    ok(qA.length === 1 && qA[0].src === 'Is lunch included?' && !qA[0].tr && !qA[0].trans, '보낸 질문 = 원문+언어만(P-14)');
    await H.page.waitForFunction(() => /\[ko\] Is lunch included\?/.test(document.getElementById('askActiveText').textContent), null, { timeout: 5000 });
    ok(await H.page.evaluate(() => document.getElementById('askActiveText').style.fontSize) === '1.15rem', `강사 큰 칸에 번역된 질문 「${await txt(H.page, '#askActiveText')}」`);
    await B.g.waitForFunction(() => [...document.querySelectorAll('.msg-line')].some(d => /Is lunch included/.test(d.textContent)), null, { timeout: 5000 });
    ok(true, '다른 손님(아이폰)도 말한 질문 줄을 받는다 — 지명 때 빈 글 뒤 말한 글로 채움');
    ok(!(await B.g.evaluate(() => [...document.querySelectorAll('.msg-line')].some(d => d.querySelector('.msg-text') && d.querySelector('.msg-text').textContent.trim() === '' && /✋/.test(d.textContent)))), '빈 질문 줄 0');

    // 마이크 실패 → 글 칸
    await A.g.evaluate(() => window.__rec.last.stop());
    await A.g.waitForFunction(() => /again/i.test(document.getElementById('btn-ask-mic').textContent), null, { timeout: 3000 });
    await A.g.evaluate(() => { window.__recMode = 'silent'; });
    await A.g.click('#btn-ask-mic');
    await A.g.waitForSelector('#ask-input-text', { state: 'visible', timeout: 5000 });
    const cFail = await askControls(A.g);
    const failMsg = await txt(A.g, '#ask-status-msg');
    ok(cFail.text === 1 && cFail.send === 1 && /nostart/.test(failMsg), `마이크가 아무 알림 없이 안 열림(3초) → 글 칸 + 까닭 「${failMsg}」`);
    ok((await txt(A.g, '#btn-ask-submit')) === 'Send', '보내기 단추 글자 = 손님 말(Send)');
    ok(await A.g.evaluate(() => window.__rec.starts) === 2, '실패 뒤 쥔 인식기를 놓았다(다음 누름이 무시되지 않게)');
    await A.g.fill('#ask-input-text', 'And dinner?');
    await A.g.click('#btn-ask-submit');
    await A.g.waitForFunction(() => /Sent to the instructor/.test(document.getElementById('ask-status-msg').textContent) && window.__sent.filter(m => m.kind === 'question').length === 2, null, { timeout: 5000 });
    ok(await vis(A.g, '#ask-modal'), '글로 보내도 창은 그대로 — 「전달됨 ✓」');

    /* ④ 답변 */
    console.log('\n[④] 「🎤 답변하기」 → 손님 줄에 「답변」 꼬리표');
    await H.page.click('#btnAskAnswer');
    await H.page.waitForFunction(() => window.rtHostMic.state.on, null, { timeout: 4000 });
    ok(/■/.test(await txt(H.page, '#btnAskAnswer')), `답변하기 → 강사 🎤 켬 · 단추 「${await txt(H.page, '#btnAskAnswer')}」`);
    n = await H.page.evaluate(() => window.__sent.length);
    ok(await H.page.evaluate(() => window.rtHostMic.send('점심은 회사 식당에서 무료로 제공됩니다')), '답변 한 줄 보냄');
    const ansSent = (await H.page.evaluate(() => window.__sent)).slice(n).filter(m => m.text);
    ok(ansSent.length === 1 && !ansSent[0].tr && !ansSent[0].trans, '답변 = 원문 줄(P-14 — 번역문 안 보냄)');
    for (const [who, P] of [['안드로이드', A.g], ['아이폰', B.g]]) {
      await P.waitForFunction(() => [...document.querySelectorAll('.msg-line')].some(d => /점심은 회사/.test(d.textContent) || d.querySelector('.ans-tag')), null, { timeout: 5000 });
      const tag = await P.evaluate(() => { const d = [...document.querySelectorAll('.msg-line')].pop(); const t = d && d.querySelector('.ans-tag'); return t ? t.textContent.trim() : ''; });
      ok(!!tag, `${who} 손님: 답변 줄에 꼬리표 「${tag}」`);
    }

    /* ⑤ 질문 끝내기 */
    console.log('\n[⑤] 「질문 끝내기」');
    n = await H.page.evaluate(() => window.__sent.length);
    await H.page.click('#btnAskEnd');
    const sEnd = (await H.page.evaluate(() => window.__sent)).slice(n);
    ok(sEnd.some(m => m.kind === 'revoke' && m.id === askA.id && m.reason === 'host_done'), `질문 끝내기 → revoke host_done (${sEnd.map(m => m.kind || '?').join(',')})`);
    ok(!(await H.page.evaluate(() => window.rtHostMic.state.on)), '답변 🎤 도 같이 닫힘');
    ok(await H.page.evaluate(() => window.rtHostPlay.log().some(l => /^play_on why=ask_end/.test(l))) && sEnd.some(m => m.kind === 'resume' || m.kind === 'script'),
       '원고 다시 재생(멈춘 문장부터 — askPausedPlay · play_on why=ask_end)');
    await A.g.waitForFunction(() => /Question ended/.test(document.getElementById('ask-status-msg').textContent), null, { timeout: 3000 }).catch(async (e) => { console.log('DBG', await A.g.evaluate(() => [document.getElementById('ask-status-msg').textContent, document.getElementById('ask-modal').style.display, JSON.stringify(window.__sent.slice(-3)), window.rtAskMic.log().slice(-6).join(' / ')])); throw e; });
    ok(true, `손님 「${await txt(A.g, '#ask-status-msg')}」`);
    await A.g.waitForSelector('#ask-modal', { state: 'hidden', timeout: 4000 });
    ok(true, '잠깐 뒤 창 닫힘');
    n = await H.page.evaluate(() => window.__sent.length);
    if (await H.page.evaluate(() => window.rtHostPlay.state.on)) await H.page.click('#btnPlay');       // 재생을 멈추고(원고 겹침 판정을 피해) 강사 말 한 줄
    ok(await H.page.evaluate(() => window.rtHostMic.send('그럼 쉬는 시간 뒤에 모이겠습니다 여러분')), '질문 뒤 강사 말 한 줄 보냄');
    await A.g.waitForFunction(() => [...document.querySelectorAll('.msg-line')].some(d => /쉬는 시간 뒤에/.test(d.textContent)), null, { timeout: 5000 });
    ok(!(await A.g.evaluate(() => [...document.querySelectorAll('.msg-line')].some(d => /쉬는 시간 뒤에/.test(d.textContent) && d.querySelector('.ans-tag')))), '질문이 끝난 뒤 줄에는 꼬리표 없음');

    /* ② 지명 — 아이폰 */
    console.log('\n[②] 지명 → 아이폰 화면 = 글 칸 하나');
    await H.page.waitForFunction(() => document.querySelectorAll('#askQueueList button').length === 2, null, { timeout: 5000 });
    await H.page.click('#askQueueList > div:nth-child(1) button:nth-child(1)');
    await B.g.waitForSelector('#ask-input-text', { state: 'visible', timeout: 5000 });
    await B.g.waitForFunction(() => window.rtAskMic && window.rtAskMic.mode() === 'text', null, { timeout: 5000 });
    await B.g.waitForFunction(() => document.getElementById('btn-ask-submit').textContent.trim() === '送信', null, { timeout: 4000 });
    const cB = await askControls(B.g);
    ok(cB.text === 1 && cB.send === 1 && cB.mic === 0 && cB.write === 0, `아이폰 지명 화면: 글 칸 ${cB.text} · 보내기 ${cB.send}(送信) · 마이크 ${cB.mic}`);
    ok(await B.g.evaluate(() => window.__rec.starts) === 0, '아이폰은 인식기를 안 연다(start 0)');
    await B.g.fill('#ask-input-text', 'ヘルメットはどこ?');
    await B.g.click('#btn-ask-submit');
    await B.g.waitForFunction(() => /✓/.test(document.getElementById('ask-status-msg').textContent), null, { timeout: 5000 });
    ok(true, `아이폰 글로 보냄 → 「${await txt(B.g, '#ask-status-msg')}」`);
    await H.page.waitForFunction(() => /\[ko\] ヘルメットはどこ/.test(document.getElementById('askActiveText').textContent), null, { timeout: 5000 });
    ok(true, '강사 큰 칸에 아이폰 질문(강사 말로)');
    await H.page.click('#btnAskEnd');
    await B.g.waitForSelector('#ask-modal', { state: 'hidden', timeout: 5000 });
    ok(true, '아이폰도 끝 → 창 닫힘');
    await Promise.all([A.ctx.close(), B.ctx.close(), H.ctx.close()]);

    /* ⑥ 되돌림 — 옛 판(?askflow=0) 이면 위 단언이 붉다 */
    console.log('\n[⑥] 되돌림 실증 — ?askflow=0');
    const H0 = await hostUp(browser, base, '&askflow=0');
    const A0 = await guestUp(browser, base, port, H0.code, UA_AND, 'en', 'Old', '&askflow=0');
    const B0 = await guestUp(browser, base, port, H0.code, UA_IOS, 'ja', 'OldB', '&askflow=0');
    await A0.g.click('#btn-ask'); await A0.g.click('#btn-ask-submit');
    await sleep(500);
    ok(!(await A0.g.evaluate(() => window.__sent)).some(m => m.kind === 'ask'), '옛 판: 글 없이 손들기 안 됨 → ① 단언이 붉다');
    await A0.g.fill('#ask-input-text', 'Old way?'); await A0.g.click('#btn-ask-submit');
    await B0.g.click('#btn-ask'); await B0.g.fill('#ask-input-text', 'Where is the exit?'); await B0.g.click('#btn-ask-submit');
    await H0.page.waitForFunction(() => document.querySelectorAll('#askQueueList button').length === 4, null, { timeout: 5000 });
    await sleep(800);
    ok(!/\[ko\]/.test(await queueText(H0)), '옛 판: 강사 목록이 손님 말 원문 → 번역 단언이 붉다');
    await H0.page.click('#askQueueList > div:nth-child(1) button:nth-child(1)');
    await A0.g.waitForSelector('#btn-ask-mic', { state: 'visible', timeout: 5000 });
    const c0 = await askControls(A0.g);
    ok(c0.mic === 1 && c0.text === 1, `옛 판: 안드로이드 지명 화면에 마이크 ${c0.mic} + 글 칸 ${c0.text} 둘 다 → 「하나만」 단언이 붉다`);
    ok(!(await H0.page.isVisible('#btnAskAnswer')) && !(await H0.page.isVisible('#btnAskEnd')), '옛 판: 강사 답변·끝내기 단추 없음 → ④⑤ 단언이 붉다');
    await Promise.all([A0.ctx.close(), B0.ctx.close(), H0.ctx.close()]);
  } finally {
    await browser.close();
    relay.close();
  }
  console.log(`\n=== ${pass} PASS ===`);
})().catch(e => { console.error('[FAIL]', e && e.message || e); process.exit(1); });
