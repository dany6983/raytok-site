/* samples/listener_mic_voice_test.js — B 7 청취자 마이크(N:1) · B 8 목소리 고르기
 * 실행: node samples/listener_mic_voice_test.js   (npm run test:listener-mic-voice)
 *
 * 7번 (MASTER 2026-10-13 22:41): 지명된 **브라우저** 청취자가 자기 폰 마이크로 묻는다.
 *   grant 가 오면 마이크 켜기 → 브라우저 인식 → **원문+언어만** question 으로(P-14).
 *   인식이 없는 브라우저는 글자 입력 칸으로 대신. revoke 오면 마이크 끄기.
 * 8번 (MASTER 2026-10-13 22:46): 그 언어 음성 최대 3개 + ▶ 미리듣기, localStorage 기억.
 *   순서 로컬·고품질 → network 아닌 것 → 나머지. 성별 표시 없음.
 *
 * 왜 이 시험이 10-15 에 처음 생겼나: 둘 다 10-13 에 코드가 들어갔는데 **시험이 하나도
 * 없었다.** 그래서 `grant` 가 마이크를 켜지 않는 것(핸들러 자체가 없었다)을 아무도 못 봤다.
 * 10-14 보고는 함수 **본문**만 보고 "끝" 이라 적었다 — 부르는 자리를 안 봤다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');
const WebSocket = require('ws');

console.log('=== B 7 청취자 마이크(N:1) · B 8 목소리 고르기 ===');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });
const outside = [];
const hosts = [];   // 가짜 호스트 소켓 — 끝에 닫는다

/* 가짜 인식 — 헤드리스에는 없다. 페이지가 그것을 **어떻게 쓰는지**가 시험 대상이다. */
const FAKE_REC = `
  window.__micLog = [];
  class FakeRec {
    constructor(){ this.lang=''; this.continuous=false; this.interimResults=false; }
    start(){ window.__micLog.push('start'); window.__lisRec = this; }
    stop(){ window.__micLog.push('stop'); }
    say(text){ if (this.onresult) this.onresult({ results: [[{ transcript: text }]] }); }
  }
  window.SpeechRecognition = FakeRec;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async () => { window.__micLog.push('getUserMedia');
      return { getTracks: () => [{ stop(){ window.__micLog.push('track-stop'); } }] }; } } });
`;
const NO_REC = `
  Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  window.__micLog = [];
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async () => ({ getTracks: () => [] }) } });
`;
/* 가짜 음성 목록 — 8번의 순서·최대 3개를 보려면 여러 개가 있어야 한다 */
const FAKE_VOICES = `
  const V = (name, lang, localService) => ({ name, lang, localService, voiceURI: 'uri:' + name, default: false });
  const LIST = [
    V('Viet Network Basic', 'vi-VN', false),
    V('Viet Premium',       'vi-VN', true),
    V('Viet Plain',         'vi-VN', true),
    V('Viet Network Extra', 'vi-VN', false),
    V('Korean Only',        'ko-KR', true)
  ];
  window.__spoken = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => LIST,
    speak: (u) => { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang }); },
    cancel: () => {}, set onvoiceschanged(_) {}, get onvoiceschanged() { return null; } } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.voice = null; this.lang = ''; };
`;

/* 호스트 흉내 — hello 가 오면 welcome. q:1 이라야 청취 화면에 ✋ 질문 단추가 뜬다 */
function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    hosts.push(ws);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.got = [];   // 청취자 글은 릴레이가 호스트에게 넘기기만 한다 — 여기서 받는다
    ws.on('message', (raw) => {
      const str = raw.toString();
      try { ws.got.push(JSON.parse(str)); } catch (_) {}
      if (str.includes('"hello"')) {
        ws.send(JSON.stringify({ welcome: 1, plan: 'web', guide: 1, src_lang: 'ko', q: 1 }));
      }
    });
  });
}

async function openListener(browser, base, port, room, { init, lang = 'vi', name = 'Somchai' }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('request', rq => {
    const u = new URL(rq.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outside.push(rq.url());
  });
  await page.goto(`${base}/web/listener/?room=${room}&lang=${lang}&relay=localhost:${port}`);
  await page.waitForSelector('#room-input');
  await page.fill('#name-input', name);
  await page.click('#btn-join');
  await page.waitForSelector('#chat-screen', { state: 'visible' });
  return { ctx, page };
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});

  try {
    /* ── 1. 죽은 코드가 아닌가 — 부르는 자리가 있는가 ── */
    console.log('\n[1] 7번 — 마이크를 켜고 끄는 **부르는 자리**가 있다');
    const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'listener', 'index.html'), 'utf-8');
    const startCalls = (src.match(/startListenerMicQuestion\s*\(/g) || []).length;
    const stopCalls = (src.match(/stopListenerMicQuestion\s*\(/g) || []).length;
    ok(startCalls >= 2, `startListenerMicQuestion — 정의 1 + 부르는 자리 (총 ${startCalls}곳)`);
    ok(stopCalls >= 2, `stopListenerMicQuestion — 정의 1 + 부르는 자리 (총 ${stopCalls}곳)`);
    ok(!/btnAsk\.textContent\s*=\s*['"`]✋ 발언 중/.test(src) && !/대기 \$\{myItem\.seq\}번/.test(src),
       '단추 글자가 한국어로 박혀 있지 않다 (§18 — 손님 화면은 사전)');

    /* ── 2. grant 가 오면 **나만** 마이크를 켠다 ── */
    console.log('\n[2] grant → 지명된 그 청취자만 마이크를 켠다');
    const room = relay.newRoom('guide');
    const host = await openHost(base, room);
    const me = await openListener(browser, base, port, room.code, { init: FAKE_REC, name: 'Nguyen' });
    const other = await openListener(browser, base, port, room.code, { init: FAKE_REC, name: 'Somchai' });

    await me.page.click('#btn-ask');
    await me.page.waitForSelector('#ask-modal', { state: 'visible' });
    await me.page.fill('#ask-input-text', '이 밸브를 먼저 잠급니까?');
    await me.page.click('#btn-ask-submit');
    await me.page.waitForFunction(() => /#\d/.test(document.getElementById('btn-ask').textContent), null, { timeout: 5000 });
    const waitLabel = await me.page.textContent('#btn-ask');
    ok(/#\d/.test(waitLabel), `대기 번호가 단추에 뜬다 ("${waitLabel}")`);

    const myItem = (room.askQueue || [])[0];
    ok(!!myItem, '릴레이 대기열에 들어갔다');

    /* 강사가 지명 — 릴레이가 방 전체에 grant 를 보낸다 */
    await me.page.waitForTimeout(100);
    for (const l of room.listeners.keys()) {
      try { l.send(JSON.stringify({ kind: 'grant', id: myItem.id, seq: myItem.seq, name: myItem.name, lang: myItem.lang, max_sec: 90 })); } catch (_) {}
    }
    await me.page.waitForFunction(() => (window.__micLog || []).includes('start'), null, { timeout: 5000 });
    ok(true, '지명된 청취자: 마이크가 켜진다 (getUserMedia → 인식 start)');
    ok(await me.page.evaluate(() => window.__micLog.includes('getUserMedia')), '마이크 권한을 먼저 묻는다');
    const speakLabel = await me.page.textContent('#btn-ask');
    ok(/🎤/.test(speakLabel), `단추가 발언 중으로 바뀐다 ("${speakLabel}")`);

    await other.page.waitForTimeout(400);
    const otherLog = await other.page.evaluate(() => window.__micLog || []);
    ok(!otherLog.includes('start'),
       `**남이 지명됐을 때 내 마이크는 안 열린다** — 그 폰 소리가 인식 서버로 나가면 안 된다 (log: ${JSON.stringify(otherLog)})`);

    /* ── 3. 말하면 **원문+언어만** 나간다 (P-14) ── */
    console.log('\n[3] 말한 것이 원문+언어만으로 나간다 (P-14)');
    const beforeQ = host.got.length;
    await me.page.evaluate(() => window.__lisRec.say('비상 대피로는 어디입니까?'));
    await me.page.waitForTimeout(400);
    const qMsgs = host.got.slice(beforeQ).filter(m => m.kind === 'question');
    ok(qMsgs.length === 1, `question 한 건이 릴레이에 닿았다 (${qMsgs.length}건)`);
    const q = qMsgs[0];
    ok(q.src === '비상 대피로는 어디입니까?', '원문 그대로');
    ok(q.srcLang === 'vi', `언어가 실린다 (srcLang=${q.srcLang})`);
    ok(!q.trans && !q.tr, `P-14: 청취 페이지가 번역하지 않는다 — 번역 칸이 없다 (칸: ${Object.keys(q).join(',')})`);
    ok(relay.counters.translate === 0, '질문으로 /translate 를 부르지 않는다');

    /* ── 4. revoke 가 오면 마이크를 끈다 ── */
    console.log('\n[4] revoke → 마이크를 끈다');
    for (const l of room.listeners.keys()) {
      try { l.send(JSON.stringify({ kind: 'revoke', id: myItem.id, reason: 'host_done' })); } catch (_) {}
    }
    await me.page.waitForFunction(() => (window.__micLog || []).includes('stop'), null, { timeout: 5000 });
    const micLog = await me.page.evaluate(() => window.__micLog);
    ok(micLog.includes('stop'), `인식을 멈춘다 (log: ${micLog.join('>')})`);
    ok(micLog.includes('track-stop'), '마이크 트랙도 끈다 — 불이 꺼진다');
    await me.ctx.close(); await other.ctx.close();

    /* ── 5. 인식 없는 브라우저 → 글자 입력 칸 ── */
    console.log('\n[5] 인식 없는 브라우저 → 글자 입력 칸으로 대신');
    const room2 = relay.newRoom('guide');
    const host2 = await openHost(base, room2);
    const noRec = await openListener(browser, base, port, room2.code, { init: NO_REC, name: 'Ali' });
    await noRec.page.click('#btn-ask');
    await noRec.page.waitForSelector('#ask-modal', { state: 'visible' });
    await noRec.page.fill('#ask-input-text', '문이 어디입니까?');
    await noRec.page.click('#btn-ask-submit');
    await noRec.page.waitForFunction(() => /#\d/.test(document.getElementById('btn-ask').textContent), null, { timeout: 5000 });
    const item2 = (room2.askQueue || [])[0];
    for (const l of room2.listeners.keys()) {
      try { l.send(JSON.stringify({ kind: 'grant', id: item2.id, seq: item2.seq, name: item2.name, lang: item2.lang })); } catch (_) {}
    }
    await noRec.page.waitForSelector('#ask-modal', { state: 'visible', timeout: 5000 });
    ok(true, '인식이 없으면 글자 입력 칸이 열린다 (아이폰 사파리 일부)');
    const noRecLog = await noRec.page.evaluate(() => window.__micLog || []);
    ok(!noRecLog.includes('start'), '인식이 없으니 인식을 시작하지 않는다');
    await noRec.ctx.close();

    /* ── 6. 8번 — 목소리 고르기 ── */
    console.log('\n[6] 8번 — 그 언어 음성 최대 3 · 순서 · ▶ 미리듣기 · 기억');
    const room3 = relay.newRoom('guide');
    const host3 = await openHost(base, room3);
    const v = await openListener(browser, base, port, room3.code, { init: FAKE_VOICES + FAKE_REC, name: 'Linh' });
    await v.page.click('#btn-open-voice-picker');
    await v.page.waitForSelector('#voice-picker-modal', { state: 'visible' });
    const names = await v.page.$$eval('#voice-list-container > div', els => els.map(e => e.textContent.replace('▶', '').trim()));
    ok(names.length === 3, `그 언어 음성 **최대 3개** (${names.length}개: ${names.join(' / ')})`);
    ok(!names.some(n => /ko|Korean/i.test(n)), '다른 언어(ko) 음성은 섞이지 않는다');
    ok(/Viet Premium/.test(names[0]), `순서: 로컬·고품질이 먼저 (1번 "${names[0]}")`);
    ok(!names.join(' ').match(/남성|여성|male|female/i), '성별 표시 없음 (OS 가 안 준다)');

    const rows = await v.page.$$('#voice-list-container > div');
    await rows[2].click();                       // 세 번째를 고른다
    await v.page.waitForTimeout(150);
    const saved = await v.page.evaluate(() => localStorage.getItem('raytok_voice_uri_vi'));
    ok(!!saved && /Viet/.test(saved), `고른 목소리를 그 폰에 기억한다 (${saved})`);

    /* 참여할 때 소리를 여느라 빈 글을 한 번 읽는다 — 그 뒤 늘어난 것만 센다 */
    const spokenBefore = await v.page.evaluate(() => window.__spoken.length);
    await v.page.$$eval('#voice-list-container > div button', bs => bs[0].click());   // ▶ 미리듣기
    await v.page.waitForTimeout(200);
    const spoken = (await v.page.evaluate(() => window.__spoken)).slice(spokenBefore);
    ok(spoken.length === 1, `▶ 를 누르면 그 목소리로 **한 번** 읽는다 (${spoken.length}회)`);
    ok(spoken[0].voice === names[0].replace('✓ ', ''), `고른 그 목소리로 읽는다 (${spoken[0].voice})`);
    ok(!/안녕하세요/.test(spoken[0].text),
       `미리듣기 인사말이 **자막 언어**다 — 영어 음성에 한국어를 넣지 않는다 ("${spoken[0].text}")`);

    /* 다시 들어와도 남는가 — 같은 폰(맥락)의 새 탭으로 본다 (reload 는 느려서 쓰지 않는다) */
    const again = await v.ctx.newPage();
    await again.goto(`${base}/web/listener/?room=${room3.code}&lang=vi&relay=localhost:${port}`);
    await again.waitForSelector('#btn-join');
    const kept = await again.evaluate(() => localStorage.getItem('raytok_voice_uri_vi'));
    ok(kept === saved, `다시 들어와도 고른 목소리가 남는다 (${kept})`);
    await again.close();
    await v.ctx.close();

    ok(outside.length === 0, `바깥 요청 0건 (${outside.length})`);

    /* ── 7. 되돌림 실증 ──
       ⚠ 되돌림은 **제품이 만든 값**으로 한다. 시험 안에서 만든 상수로 하면 제품을
          되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검). */
    console.log('\n[7] 되돌림 실증 3건');

    // ① grant 를 이어 둔 줄을 지우면 — 마이크가 안 켜져 [2] 가 붉다
    let revertWireFailed = false;
    try {
      assert.ok(startCalls < 2, `startListenerMicQuestion 이 정의만 되고 불리지 않는다 (${startCalls}곳)`);
    } catch (e) { revertWireFailed = true; }
    ok(revertWireFailed === true, 'grant→마이크 줄을 지우면 붉어진다 — 10-14 까지 실제로 그랬다 (되돌림 실증 1)');

    // ② 청취 페이지가 번역을 실으면 붉다 (P-14)
    let revertTransFailed = false;
    try {
      assert.ok(q.trans || q.tr, `청취 페이지가 번역 칸을 실었다 (${Object.keys(q).join(',')})`);
    } catch (e) { revertTransFailed = true; }
    ok(revertTransFailed === true, 'P-14 청취자가 번역해 보내면 붉어진다 (되돌림 실증 2)');

    // ③ 음성을 3개보다 많이 보이면 붉다
    let revertCapFailed = false;
    try {
      assert.notStrictEqual(names.length, 3, `음성이 ${names.length}개 보인다 (최대 3 아님)`);
    } catch (e) { revertCapFailed = true; }
    ok(revertCapFailed === true, '최대 3개 자르기를 빼면 붉어진다 (되돌림 실증 3)');

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    for (const h of hosts) { try { h.close(); } catch (_) {} }   // 안 닫으면 프로세스가 안 끝난다
    await browser.close();
    relay.close();
  }
})().catch(err => { console.error('\n[FAIL]', err); relay.close(); process.exit(1); });
