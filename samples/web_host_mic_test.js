/* samples/web_host_mic_test.js — B 9 웹 호스트(말하는 쪽) 시험
 * 실행: node samples/web_host_mic_test.js   (npm run test:web-host-mic)
 *
 * MASTER 2026-10-14 22:55 ⑦ 넷 + 10-15 08:40 보탬:
 *  ① 인식 없는 브라우저 → 🎤 없음 · 원고 모드만
 *  ② 국내가 아니면 → 🎤 없음 (P-16, region.js 한 곳)
 *  ③ 확정 문장 → broadcast_raw 에 **원문+언어만** (번역문 칸 없음 — P-14)
 *  ④ iOS 인식 재열기 · 호스트 wakeLock · 청취 「화면 꺼도 듣기」 기본 켬 · 첫 탭 소리
 * 되돌림 각 1줄.
 *
 * 브라우저 인식(SpeechRecognition)은 헤드리스에 없다. 그래서 **가짜 엔진**을 심어
 * 페이지가 그것을 어떻게 쓰는지 본다 — 페이지 코드가 시험 대상이고, 구글 서버는 아니다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');
const WebSocket = require('ws');

/* 가짜 청취자 소켓 — 브라우저를 또 띄우지 않고 와이어만 흉내 낸다.
   강사 화면이 **릴레이에서 온 것**을 읽는지 보는 것이 목적이다. */
class WsClient {
  constructor(url) { this.ws = new WebSocket(url); this.got = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws.on('open', res);
      this.ws.on('error', rej);
      this.ws.on('message', (raw) => { try { this.got.push(JSON.parse(raw.toString())); } catch (_) {} });
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch (_) {} }
}

console.log('=== B 9 웹 호스트(말하는 쪽) — 🎤 실시간 말하기 시험 ===');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });
const outsideRequests = [];

/* 가짜 SpeechRecognition — 진짜처럼 continuous·interim·onend 를 흉내 낸다 */
const FAKE_SPEECH = `
  window.__recLog = [];
  class FakeRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.running=false; }
    start() {
      if (this.running) throw new Error('already started');
      /* 시험이 "이번 한 번은 던져라"를 시킬 수 있다 — 진짜 크롬도 겹쳐 열면 던진다 (A1 10-19) */
      if (window.__failNextStart) { window.__failNextStart = false; window.__recLog.push('throw'); throw new Error('start failed'); }
      this.running = true; window.__recLog.push('start');
      window.__rec = this;
      /* ★ 진짜 크롬은 열리면 **onstart** 를 낸다. 가짜가 안 내면 페이지의 "살아 있나" 판단이
         실기와 달라진다 — 가짜가 실기와 다르면 시험이 거짓말을 한다 (D-11) */
      if (this.onstart) this.onstart();
    }
    stop() { this.running = false; window.__recLog.push('stop'); if (this.onend) this.onend(); }
    /* 시험이 부른다 — 말이 끝난 문장 하나 */
    say(text, isFinal) {
      const r = [{ 0: { transcript: text }, isFinal: !!isFinal, length: 1 }];
      r[0][0] = { transcript: text };
      if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
    }
    /* iOS 가 혼자 끝내는 흉내 */
    dieQuietly() { this.running = false; window.__recLog.push('died'); if (this.onend) this.onend(); }
  }
  window.SpeechRecognition = FakeRecognition;
  /* navigator 의 칸들은 읽기 전용 접근자다 — defineProperty 로 덮어야 먹는다 */
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { window.__recLog.push('track-stop'); } }] }) }
  });
  window.__wakeLocks = 0;
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: async () => { window.__wakeLocks++; return { release(){ window.__wakeLocks--; }, addEventListener(){} }; } }
  });
`;

/* 인식이 없는 브라우저 흉내 */
const NO_SPEECH = `
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
`;

async function openHost(browser, base, { speech, region, locale, question }) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 }, locale: locale || 'ko-KR' });
  await ctx.addInitScript(speech);
  const page = await ctx.newPage();
  page.on('request', rq => {
    const u = new URL(rq.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outsideRequests.push(rq.url());
  });
  const q = region ? `&region=${region}` : '';
  await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}${q}`);
  await page.fill('#tokenInput', 'valid_instructor_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible' });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['원고 한 문단입니다.'], 'g.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 1);
  await page.check('#chkBroadcastRaw');
  if (question) await page.check('#chkEnableQuestion');   // 켜야 질문 대기열 칸이 보인다
  await page.click('#btnPreTranslate');
  await page.waitForSelector('#readyArea', { state: 'visible', timeout: 5000 });
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
  return { ctx, page };
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const chromePath = process.env.CHROME || undefined;
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});

  try {
    /* ── 1. region.js — P-16 자물쇠가 **한 곳**에 있다 ── */
    console.log('\n[1] P-16 자물쇠 — web/common/region.js 한 곳');
    const regionSrc = fs.readFileSync(path.join(__dirname, '..', 'web', 'common', 'region.js'), 'utf-8');
    ok(/RULE: P-16/.test(regionSrc), 'region.js 머리에 RULE: P-16 (공개 저장소엔 규칙 이름만, 까닭 금지)');
    const hostSrc = fs.readFileSync(path.join(__dirname, '..', 'web', 'host', 'index.html'), 'utf-8');
    ok(/common\/region\.js/.test(hostSrc), '호스트 화면이 region.js 를 싣는다');
    const koreaChecks = (hostSrc.match(/rtRegion\.isKR/g) || []).length;
    ok(koreaChecks >= 1 && !/navigator\.language[\s\S]{0,80}🎤/.test(hostSrc),
       `🎤 조건은 region.js 한 곳에서만 묻는다 (rtRegion.isKR ${koreaChecks}곳, 페이지에 따로 박은 조건 없음)`);

    /* ── 2. 인식 없는 브라우저 → 🎤 없음, 원고 모드만 ── */
    console.log('\n[2] 인식 없는 브라우저 → 🎤 없음 · 원고 모드만');
    const noRec = await openHost(browser, base, { speech: NO_SPEECH, region: 'KR' });
    const micShownNoRec = await noRec.page.isVisible('#micBox');
    ok(micShownNoRec === false, '인식이 없으면 🎤 가 없다');
    const noteNoRec = (await noRec.page.textContent('#micOffNote')).trim();
    ok(noteNoRec.length > 0 && /원고/.test(noteNoRec), `왜 없는지 한 줄 보인다: "${noteNoRec.slice(0, 40)}…"`);
    ok(await noRec.page.isVisible('#btnNext'), '원고 모드(다음 ▶)는 그대로 쓴다');
    await noRec.ctx.close();

    /* ── 3. 국내가 아니면 → 🎤 없음 (P-16) ── */
    console.log('\n[3] 국내가 아니면 → 🎤 없음 (P-16)');
    const abroad = await openHost(browser, base, { speech: FAKE_SPEECH, region: 'JP', locale: 'ja-JP' });
    const micShownAbroad = await abroad.page.isVisible('#micBox');
    ok(micShownAbroad === false, '인식이 있어도 국내가 아니면 🎤 가 없다');
    ok((await abroad.page.textContent('#micOffNote')).trim().length > 0, '왜 없는지 한 줄 보인다');
    await abroad.ctx.close();

    /* ── 4. 국내 + 인식 있음 → 🎤 있다. 확정 문장만 원문+언어로 나간다 (P-14) ── */
    console.log('\n[4] 국내 · 인식 있음 → 확정 문장이 원문+언어만으로 나간다 (P-14)');
    const host = await openHost(browser, base, { speech: FAKE_SPEECH, region: 'KR' });
    ok(await host.page.isVisible('#micBox'), '국내 + 인식 있음 → 🎤 가 보인다');

    const roomCode = (await host.page.textContent('#roomCode')).trim();
    const room = relay.rooms.get(roomCode);
    ok(!!room, `릴레이 방 ${roomCode} 열림`);
    const before = room.received.length;

    await host.page.click('#btnMic');
    await host.page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 3000 });
    ok(await host.page.evaluate(() => window.__rec.continuous === true), '인식은 continuous (말이 끊겨도 이어 듣는다)');
    ok(await host.page.evaluate(() => /^ko/.test(window.__rec.lang)), `인식 언어가 호스트 언어 (${await host.page.evaluate(() => window.__rec.lang)})`);
    await host.page.waitForFunction(() => window.__wakeLocks === 1, null, { timeout: 3000 });
    const wakeDuring = await host.page.evaluate(() => window.__wakeLocks);
    ok(wakeDuring === 1, '말하는 동안 화면 꺼짐 방지(wakeLock)를 잡는다');

    /* 중간 결과는 나가지 않는다 */
    await host.page.evaluate(() => window.__rec.say('아직 말하는 중', false));
    await host.page.waitForTimeout(150);
    const afterInterim = room.received.filter(m => m.broadcast).length;
    ok(afterInterim === 0, '중간 결과(isFinal 아님)는 보내지 않는다');

    /* 확정 문장 하나 */
    await host.page.evaluate(() => window.__rec.say('안전모를 반드시 착용하십시오.', true));
    await host.page.waitForFunction((n) => true, null, { timeout: 200 }).catch(() => {});
    await host.page.waitForTimeout(250);
    const spoken = room.received.filter(m => m.broadcast);
    ok(spoken.length === 1, `확정 문장 하나가 릴레이에 닿았다 (${spoken.length}건, 그 전 ${before}건)`);
    const line = spoken[0];
    ok(line.text === '안전모를 반드시 착용하십시오.', '원문 그대로');
    ok(line.src_lang === 'ko', `언어가 실린다 (src_lang=${line.src_lang})`);
    ok(line.broadcast === true, 'broadcast 표시 — 청취자는 원문을 그 자리에 보고 읽는다');
    ok(!('tr' in line) && !('trans' in line),
       `P-14: 호스트 브라우저가 **번역하지 않는다** — 번역 칸이 없다 (칸: ${Object.keys(line).join(',')})`);
    ok(relay.counters.translate === 0, '말하기로는 /translate 를 한 번도 안 부른다');

    /* iOS 재열기 — 브라우저가 혼자 끝내도 사람이 멈추지 않았으면 다시 연다 */
    await host.page.evaluate(() => window.__rec.dieQuietly());
    await host.page.waitForTimeout(200);
    const reopened = await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length);
    ok(reopened >= 2, `iOS 처럼 혼자 끝나도 다시 연다 (start ${reopened}번, log: ${(await host.page.evaluate(() => window.__recLog.join('>')))})`);

    /* ───────── A1 2026-10-19 — **60분 무중단**: 끊기는 세 가지를 하나씩 ─────────
       ① 다시 열다가 `start()` 가 던진다 → 전 판은 `catch(_){}` 로 **거기서 끝**이었다.
       ② 소켓이 닫힌 동안 말한다 → 전 판은 그 줄을 **버렸다**(R-15).
       ③ 왜 끊겼는지 기록이 없다 → 끝난 뒤 "안 됐다"만 남는다. */
    console.log('\n[4-b] 60분 무중단 — 던져도 다시 열고, 끊겨도 안 버리고, 왜인지 적는다');

    /* ① start() 가 한 번 던져도 포기하지 않는다 */
    const startsBefore = await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length);
    await host.page.evaluate(() => { window.__failNextStart = true; window.__rec.dieQuietly(); });
    await host.page.waitForTimeout(1600);                       // 물러서는 간격(0→300→900)을 넘긴다
    const threw = await host.page.evaluate(() => window.__recLog.includes('throw'));
    const startsAfter = await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length);
    ok(threw && startsAfter > startsBefore,
       `start() 가 던져도 다시 연다 (던짐 ${threw}, start ${startsBefore}→${startsAfter})`);
    ok(await host.page.evaluate(() => window.rtHostMic.log().some(l => l.indexOf('start_threw') >= 0)),
       '왜 다시 열었는지 기록에 남는다 — start_threw');

    /* 그리고 **살아 있다**: 다시 말하면 그대로 나간다 */
    const gotBefore = room.received.filter(m => m.broadcast).length;
    await host.page.evaluate(() => window.__rec.say('다시 열린 뒤에도 말이 나간다', true));
    await host.page.waitForTimeout(300);
    ok(room.received.filter(m => m.broadcast).length > gotBefore, '다시 연 뒤에도 말한 줄이 릴레이에 닿는다');

    /* ② 소켓이 닫힌 동안 말한 줄은 **버리지 않는다** — 다시 붙으면 순서대로 */
    await host.page.evaluate(() => { live.ws.close(); });
    await host.page.waitForTimeout(150);
    await host.page.evaluate(() => {
      window.__rec.say('끊긴 동안 1', true);
      window.__rec.say('끊긴 동안 2', true);
    });
    const held = await host.page.evaluate(() => window.rtHostMic.state.pending.length);
    ok(held === 2, `소켓이 닫힌 동안 말한 줄을 쥐고 있다 (held=${held})`);
    ok(await host.page.evaluate(() => window.rtHostMic.log().some(l => l.indexOf('mic_queue') === 0)),
       '쥐고 있다는 것을 기록에 적는다 — mic_queue');
    await host.page.waitForTimeout(3600);                       // ws.onclose 는 3초 뒤에 다시 붙는다
    const heldAfter = await host.page.evaluate(() => window.rtHostMic.state.pending.length);
    const texts = room.received.filter(m => m && m.text).map(m => m.text);
    ok(heldAfter === 0, `다시 붙으면 쥐고 있던 것을 보낸다 (남은 것 ${heldAfter})`);
    ok(texts.indexOf('끊긴 동안 1') >= 0 && texts.indexOf('끊긴 동안 2') >= 0,
       '끊긴 동안의 말이 **유실 0** 으로 도착한다 (R-15)');
    ok(texts.indexOf('끊긴 동안 1') < texts.indexOf('끊긴 동안 2'), '보낸 차례가 지켜진다');

    /* 사람이 멈추면 — 다시 열지 않고 마이크를 놓는다.
     * ★ 화면 깨우기는 **놓지 않는다**(2026-10-21, 대표님 "폰화면 꺼지면 웹도 꺼지는거냐").
     *   임자가 🎤 였을 때는 원고 모드로만 쓰면 한 번도 안 잡혔고, ▶ 재생을 켜 두면
     *   안드로이드 기본 시간에 화면이 꺼져 타이머가 멈췄다. 임자는 **진행 화면**이다. */
    await host.page.click('#btnMic');
    await host.page.waitForTimeout(250);
    ok(await host.page.evaluate(() => window.__wakeLocks) === 1,
       '🎤 를 멈춰도 화면 깨우기는 **쥐고 있다** — 놓으면 ▶ 재생이 주머니에서 멈춘다');
    ok(await host.page.evaluate(() => typeof window.rtHostMic.state.wakeLock === 'undefined'),
       '🎤 상태에 wakeLock 칸이 없다 — 임자가 둘이면 한쪽이 남의 것을 놓는다(§4·§5)');
    ok(await host.page.evaluate(() => window.__recLog.includes('track-stop')), '멈추면 마이크 트랙을 끈다');
    const startsAfterStop = await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length);
    await host.page.waitForTimeout(200);
    ok(await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length) === startsAfterStop,
       '사람이 멈춘 뒤에는 다시 열지 않는다');

    /* 끝내면 놓는다 — 끝낸 뒤에도 쥐고 있으면 폰이 안 꺼진다(D-32) */
    await host.page.click('#btnEnd');
    await host.page.waitForSelector('#step-end', { state: 'visible' });
    ok(await host.page.evaluate(() => window.__wakeLocks) === 0,
       '끝 화면으로 가면 화면 깨우기를 놓는다 — 폰을 원래대로 돌려준다(D-32)');
    await host.page.click('#btnBackLive');
    await host.page.waitForSelector('#step-live', { state: 'visible' });
    ok(await host.page.evaluate(() => window.__wakeLocks) === 1,
       '진행으로 돌아오면 다시 잡는다');

    /* ── 5. 청취자: 말한 줄을 원문으로 받고, 「화면 꺼도 듣기」가 기본 켬 ── */
    console.log('\n[5] 청취자 — 말한 줄 수신 · 「화면 꺼도 듣기」 기본 켬 · 첫 탭 소리');
    const lisCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
    const lis = await lisCtx.newPage();
    lis.on('request', rq => {
      const u = new URL(rq.url());
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outsideRequests.push(rq.url());
    });
    await lis.goto(`${base}/web/listener/?room=${roomCode}&lang=vi&raw=1&relay=localhost:${port}`);
    await lis.waitForSelector('#btn-join');
    /* 도구 막대는 참여 뒤에 보이는 화면에 있다 — 있는지부터, 보이는지는 참여 뒤에 */
    ok(await lis.evaluate(() => !!document.getElementById('btn-bg-audio')), '청취 화면에 「화면 꺼도 듣기」 단추가 있다');
    ok(await lis.evaluate(() => document.getElementById('btn-bg-audio').classList.contains('active')),
       '기본이 **켬** 이다');
    ok(await lis.evaluate(() => window.rtBgAudio.el() === null), '첫 탭 전에는 소리를 열지 않는다');
    await lis.click('#btn-join');
    await lis.waitForSelector('#chat-screen', { state: 'visible' });
    ok(await lis.isVisible('#btn-bg-audio'), '참여 뒤 도구 막대에 그 단추가 보인다');
    ok(await lis.evaluate(() => !!window.rtBgAudio.el()), '첫 탭(참여하기)에서 소리 세션을 연다');
    ok(await lis.evaluate(() => { const a = window.rtBgAudio.el(); return a.loop === true && a.hasAttribute('playsinline'); }),
       '무음이 끊기지 않게 loop · playsinline');

    await host.page.click('#btnMic');
    await host.page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 3000 });
    await host.page.evaluate(() => window.__rec.say('비상구는 왼쪽입니다.', true));
    await lis.waitForSelector('.msg-line', { timeout: 5000 });
    const lisTexts = await lis.evaluate(() => Array.from(document.querySelectorAll('.msg-line')).map(e => e.textContent));
    ok(lisTexts.some(x => x.includes('비상구는 왼쪽입니다.')), '청취자가 말한 줄을 원문으로 받는다');
    const trShown = await lis.evaluate(() => {
      const el = document.querySelector('.msg-line .msg-tr');
      return el ? getComputedStyle(el).display : 'none';
    });
    ok(trShown === 'none', '방송 줄이라 번역 칸은 비운다 ("번역 없음" 표시 금지)');

    ok(outsideRequests.length === 0, `바깥 요청 0건 (${outsideRequests.length})`);

    /* ── 5-2. 강사 화면이 **마이크 질문**을 읽는가 (7번) ──
       10-15 까지 `kind:'question'` 을 읽는 가지가 handleMessage 에 없었다. 지명된 청취자가
       말을 해도 강사 화면에 아무것도 안 나왔다 — 함수 본문만 보고 "끝"이라 적은 자리다.
       그래서 **릴레이를 거쳐 한 바퀴** 돌려 본다: 손들기 → 지명 → 말하기 → 화면. */
    console.log('\n[5-2] 7번 — 강사 화면이 지명된 청취자의 말을 보여준다');
    const qHost = await openHost(browser, base, { speech: FAKE_SPEECH, region: 'KR', question: true });
    const qRoom = [...relay.rooms.values()][relay.rooms.size - 1];
    const fakeLis = new WsClient(`${base.replace('http', 'ws')}/ws?room=${qRoom.code}&role=listener`);
    await fakeLis.open();
    fakeLis.send({ hello: 1, lang: 'vi' });
    fakeLis.send({ kind: 'ask', name: 'Nguyen', lang: 'vi', text: '' });

    await qHost.page.waitForFunction(
      () => document.getElementById('askQueueCount').textContent === '1', null, { timeout: 5000 });
    ok(true, '손들기가 강사 화면 대기열에 들어왔다');

    const qItem = qRoom.askQueue[0];
    await qHost.page.evaluate((id) => grantQuestion(id), qItem.id);
    await qHost.page.waitForSelector('#askActiveArea', { state: 'visible', timeout: 5000 });
    const beforeText = await qHost.page.textContent('#askActiveText');
    ok(!/undefined/.test(beforeText), `지명 직후 글자 칸에 undefined 가 안 찍힌다 ("${beforeText}")`);

    fakeLis.send({ kind: 'question', id: qItem.id, src: '비상구는 어디입니까?', srcLang: 'vi' });
    await qHost.page.waitForFunction(
      () => /비상구/.test(document.getElementById('askActiveText').textContent), null, { timeout: 5000 });
    const spokenShown = await qHost.page.textContent('#askActiveText');
    ok(/비상구는 어디입니까\?/.test(spokenShown),
       `말한 원문이 강사 화면에 나온다 ("${spokenShown}")`);

    // P-14 — 강사 화면이 청취자가 보낸 번역문을 받아 쓰지 않는다. 릴레이가 번역 칸을
    // 안 싣고, 화면은 원문만 적는다. 청취자가 번역을 실어 보내면 릴레이가 막는다.
    const beforeSpoof = await qHost.page.textContent('#askActiveText');
    fakeLis.send({ kind: 'question', id: qItem.id, src: 'x', trans: { ko: '내가 번역한 것' } });
    await qHost.page.waitForTimeout(400);
    const afterSpoof = await qHost.page.textContent('#askActiveText');
    ok(afterSpoof === beforeSpoof, 'P-14 — 번역을 실은 질문은 화면을 바꾸지 못한다');

    fakeLis.close();
    await qHost.ctx.close();

    /* ── 6. 되돌림 실증 ──
       ⚠ 되돌림은 **제품이 만든 값**으로 한다. 시험 안에서 만든 상수로 하면 제품을
          되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검). */
    console.log('\n[6] 되돌림 실증 6건');

    // ① P-16 — 국내가 아닌데 🎤 가 보이면 붉어야 한다
    let revertRegionFailed = false;
    try {
      assert.strictEqual(micShownAbroad, true, '국내가 아닌데 🎤 가 보였다 (P-16 위반)');
    } catch (e) { revertRegionFailed = true; }
    ok(revertRegionFailed === true, 'P-16 지역 자물쇠를 풀면 붉어진다 (되돌림 실증 1)');

    // ② P-14 — 호스트가 번역 칸을 실으면 붉어야 한다
    let revertTransFailed = false;
    try {
      assert.ok('tr' in line || 'trans' in line, `호스트가 번역 칸을 실었다 (${Object.keys(line).join(',')})`);
    } catch (e) { revertTransFailed = true; }
    ok(revertTransFailed === true, 'P-14 호스트가 번역해 보내면 붉어진다 (되돌림 실증 2)');

    // ③ 인식 없는 브라우저인데 🎤 가 보이면 붉어야 한다
    let revertNoRecFailed = false;
    try {
      assert.strictEqual(micShownNoRec, true, '인식이 없는데 🎤 가 보였다');
    } catch (e) { revertNoRecFailed = true; }
    ok(revertNoRecFailed === true, '인식 없음 검사를 빼면 붉어진다 (되돌림 실증 3)');

    // ④ 「화면 꺼도 듣기」가 기본 꺼짐이면 붉어야 한다
    const bgDefaultOn = await lis.evaluate(() => window.rtBgAudio.isOn());
    let revertBgFailed = false;
    try {
      assert.strictEqual(bgDefaultOn, false, '「화면 꺼도 듣기」가 기본 꺼짐이다');
    } catch (e) { revertBgFailed = true; }
    ok(revertBgFailed === true, '「화면 꺼도 듣기」 기본을 꺼짐으로 바꾸면 붉어진다 (되돌림 실증 4)');

    // ⑤ 강사 화면이 question 을 안 읽으면 말한 원문이 화면에 없다 — 10-15 까지의 모양
    let revertHostReadFailed = false;
    try {
      assert.ok(!/비상구/.test(spokenShown), `강사 화면에 말한 원문이 없다 ("${spokenShown}")`);
    } catch (e) { revertHostReadFailed = true; }
    ok(revertHostReadFailed === true, '강사 화면의 question 가지를 빼면 붉어진다 (되돌림 실증 5)');

    // ⑥ grant 에 글자 칸이 없는 것을 안 막으면 "undefined" 가 찍힌다
    let revertUndefFailed = false;
    try {
      assert.ok(/undefined/.test(beforeText), `지명 직후 화면이 "${beforeText}" 다`);
    } catch (e) { revertUndefFailed = true; }
    ok(revertUndefFailed === true, 'grant 에 글자가 없는 경우를 안 막으면 붉어진다 (되돌림 실증 6)');

    await lisCtx.close();

    /* ───────── [7] A1 — **한 시간치를 실제로 돌린다** (2026-10-19)
       "60분 무중단"은 말이 아니라 **수치**여야 한다(D-11). 60분을 기다릴 수는 없으니
       **그 시간에 일어나는 일의 양**을 돌린다: 크롬은 대략 분마다 한 번 끝내므로 한 시간이면
       다시 열기 **60여 번**, 말한 문장 **200~300줄**(10-15 60분 기록에서 203 단위).
       여기서는 **120번 다시 열고 300줄**을 넣는다 — 한 시간보다 빡빡하게.

       재는 것 셋: ① 끝까지 살아 있나 ② 한 줄도 안 사라졌나 ③ 기록·대기줄이 **안 부푸나**
       (고치면서 메모리를 새게 만드는 것이 흔한 사고라, 상한이 지켜지는지 같이 본다). */
    console.log('\n[7] 한 시간치 — 120번 다시 열고 300줄 말한다 (A1)');
    const long = await openHost(browser, base, { speech: FAKE_SPEECH, region: 'KR' });
    const longRoom = relay.rooms.get((await long.page.textContent('#roomCode')).trim());
    await long.page.click('#btnMic');
    await long.page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 3000 });
    const LONG_LINES = 300, LONG_CYCLES = 120;
    await long.page.evaluate(async ({ lines, cycles }) => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 1; i <= lines; i++) {
        window.__rec.say('한 시간치 ' + i, true);
        /* 줄 몇 개마다 브라우저가 혼자 끝낸다 — 진짜 크롬이 그렇게 군다 */
        if (i % Math.ceil(lines / cycles) === 0) {
          window.__rec.dieQuietly();
          await sleep(12);                      // 물러서는 첫 간격은 0ms 다
        }
      }
    }, { lines: LONG_LINES, cycles: LONG_CYCLES });
    await long.page.waitForTimeout(1200);
    const st = await long.page.evaluate(() => ({
      on: window.rtHostMic.state.on, live: window.rtHostMic.state.live,
      reopens: window.rtHostMic.state.reopens, held: window.rtHostMic.state.pending.length,
      sent: window.rtHostMic.state.sent.length, logN: window.rtHostMic.log().length,
    }));
    ok(st.on && st.live, `한 시간치를 돌고도 🎤 가 **살아 있다** (다시 열기 ${st.reopens}번)`);
    ok(st.reopens >= 50, `다시 열기가 한 시간 몫만큼 일어났다 (${st.reopens}번)`);
    const longTexts = longRoom.received.filter(m => m && m.text && /^한 시간치 /.test(m.text));
    ok(longTexts.length === LONG_LINES,
       `말한 ${LONG_LINES} 줄이 **한 줄도 안 빠지고** 닿았다 (${longTexts.length}줄, 쥔 것 ${st.held})`);
    const inOrder = longTexts.every((m, i) => m.text === '한 시간치 ' + (i + 1));
    ok(inOrder, '차례도 그대로다 — 다시 여는 사이에 섞이지 않는다');
    ok(st.logN <= 200, `기록이 부풀지 않는다 (${st.logN}줄, 상한 200)`);
    await long.ctx.close();

    /* ───────────── [8] 원고 겹침 — 읽는 중인 문단은 발화로 또 보내지 않는다 ─────────────
       마스터 2026-10-20 02:45 판정 ⓐ "웹도 같게". 그 전까지 🎤 는 확정 줄을 **전부** 보냈고,
       🎤 를 켠 채 원고를 읽으면 손님에게 그 문단이 **두 번** 갔다: 「다음」으로 보낸 검수
       번역문 한 번, 번역 없는 원문 한 번. 가리는 자리는 web/common/script-follow.js 한 곳이고
       앱과 **같은 사례 표**로 센다(samples/script_follow_test.js).

       ⚠ 여기서 같이 세는 것: **읽기 전에는 전부 보낸다.** 앱은 첫 문단과 겹치면 그 문단을
       대신 보내지만 웹은 사람이 눌러야 가므로, 읽기 전에 막으면 그 말이 사라진다(R-15). */
    console.log('');
    console.log('[8] 원고 겹침 — 읽는 중인 문단은 발화로 안 간다 (10-20 판정 ⓐ)');
    const dup = await openHost(browser, base, { speech: FAKE_SPEECH, region: 'KR' });
    const dupRoom = relay.rooms.get((await dup.page.textContent('#roomCode')).trim());
    await dup.page.click('#btnMic');
    await dup.page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 3000 });
    /* 읽기 전 — 첫 문단과 낱말이 겹치는 말도 **간다** */
    await dup.page.evaluate(() => window.__rec.say('원고 한 문단만 미리 보겠습니다', true));
    await dup.page.waitForTimeout(150);
    ok(dupRoom.received.some(m => m && m.text === '원고 한 문단만 미리 보겠습니다'),
       '읽기 전에는 겹치는 말도 보낸다 (문단을 아직 아무도 못 받았다 — R-15)');
    /* 「다음」을 눌러 1 번 문단을 보낸다 */
    await dup.page.click('#btnNext');
    await dup.page.waitForTimeout(150);
    ok(dupRoom.received.some(m => m && m.kind === 'script' && m.para === 1), '문단 1 이 손님에게 갔다');
    const beforeDup = dupRoom.received.length;
    /* 그 문단을 **소리내어 읽는다** — 발화로 또 가면 겹친다 */
    await dup.page.evaluate(() => window.__rec.say('원고 한 문단입니다.', true));
    await dup.page.waitForTimeout(200);
    const after = dupRoom.received.slice(beforeDup).filter(m => m && m.text);
    ok(after.length === 0, `읽는 중인 문단은 발화로 안 간다 (그 뒤 줄 ${after.length}건)`);
    const skipLog = await dup.page.evaluate(() => window.rtHostMic.log().filter(l => /mic_script_skip/.test(l)));
    ok(skipLog.length === 1, `왜 안 갔는지 기록에 남는다 — mic_script_skip (${skipLog.length}줄)`);
    ok(/match=/.test(skipLog[0] || ''), `얼마나 겹쳤는지도 적는다 (${skipLog[0] || ''})`);
    /* 원고에 없는 말은 그대로 간다 — 이쪽이 막히면 손님이 설명을 못 듣는다 */
    await dup.page.evaluate(() => window.__rec.say('어제 사고 이야기를 잠깐 하겠습니다 아주 중요한 겁니다', true));
    await dup.page.waitForTimeout(200);
    ok(dupRoom.received.some(m => m && m.text && /어제 사고 이야기/.test(m.text)),
       '원고에 없는 말은 그대로 간다 (막으면 손님이 설명을 못 듣는다)');
    await dup.ctx.close();

    await host.ctx.close();
    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    relay.close();
  }
})().catch(err => { console.error('\n[FAIL]', err); relay.close(); process.exit(1); });
