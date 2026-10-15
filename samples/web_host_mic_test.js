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
      this.running = true; window.__recLog.push('start');
      window.__rec = this;
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

async function openHost(browser, base, { speech, region, locale }) {
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

    /* 사람이 멈추면 — 다시 열지 않고 마이크·wakeLock 을 놓는다 */
    await host.page.click('#btnMic');
    await host.page.waitForTimeout(250);
    ok(await host.page.evaluate(() => window.__wakeLocks) === 0, '멈추면 wakeLock 을 놓는다');
    ok(await host.page.evaluate(() => window.__recLog.includes('track-stop')), '멈추면 마이크 트랙을 끈다');
    const startsAfterStop = await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length);
    await host.page.waitForTimeout(200);
    ok(await host.page.evaluate(() => window.__recLog.filter(x => x === 'start').length) === startsAfterStop,
       '사람이 멈춘 뒤에는 다시 열지 않는다');

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

    /* ── 6. 되돌림 실증 ──
       ⚠ 되돌림은 **제품이 만든 값**으로 한다. 시험 안에서 만든 상수로 하면 제품을
          되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검). */
    console.log('\n[6] 되돌림 실증 4건');

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

    await lisCtx.close();
    await host.ctx.close();
    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    relay.close();
  }
})().catch(err => { console.error('\n[FAIL]', err); relay.close(); process.exit(1); });
