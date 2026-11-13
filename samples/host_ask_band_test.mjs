/* samples/host_ask_band_test.mjs — 웹 4차 (NOW 11-13 16:35 ①~④) · npm run test:host-ask-band
 *
 * 11-13 실기(방 53WK7G): 질문은 도착했는데 지명 칸이 오른쪽 단 QR·참석 **밑**이라 1568×698 창에서 안 보였다.
 * ask-flow2 는 isVisible 만 봐서 초록이었다(화면 밖이어도 visible) → 여기서는 **뷰포트 안**을 잰다.
 *  ① 질문 띠 = 진행 화면 맨 위 sticky · 질문 없으면 0높이 · 지명 칸이 뷰포트 안(1568×698 · 1280×600 · 맨 아래 스크롤) · 옛 자리(.live-side)에 없음
 *  ② 새 손 → 삑 1회(가짜 AudioContext 세기) · 띠 깜빡 · 같은 손 다시 그려도 0 · `?askbeep=0` 이면 0
 *  ③ 읽어 주기 onstart 가 5초 안에 없음 → 「🔇 눌러서 듣기」 · 누르면 다시 speak · onstart → 단추 숨김 · 기록 ask_speak_start/end
 *  ④ 🖥 PC 소리: getDisplayMedia → SpeechRecognition.start(**audioTrack**) · 기록 mic_open src=pc · 트랙 ended → 닫힘
 *     안드로이드 UA·`?pcaudio=0` 이면 단추 숨김 · 🎤 는 start() 인자 없음 · micRaw(getUserMedia 옵션) 걷힘
 *  단추는 **눌러서** 잰다(MISTAKES #11).
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

const UA_AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const HOST_FAKE = `
  window.__sent = [];
  const _send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) {
    try { if (typeof d === 'string' && d.indexOf('__ping') < 0) window.__sent.push(JSON.parse(d)); } catch (_) {}
    return _send.apply(this, arguments);
  };
  window.__starts = [];
  class FakeRecognition {
    constructor() { this.running = false; }
    start(track) { if (this.running) throw new Error('already started'); window.__starts.push(arguments.length ? (track && track.__tag) || 'arg' : 'none'); this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
    stop() { this.running = false; if (this.onend) this.onend(); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.__gum = []; window.__gdm = 0; window.__gdmAudio = true;
  function mkTrack(kind, tag) {
    const ls = [];
    return { kind, __tag: tag, readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; },
      addEventListener(n, f) { if (n === 'ended') ls.push(f); }, __end() { this.readyState = 'ended'; ls.forEach(f => f()); } };
  }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async (c) => { window.__gum.push(JSON.stringify(c)); const t = mkTrack('audio', 'mic'); return { getTracks: () => [t], getAudioTracks: () => [t] }; },
    getDisplayMedia: async (c) => { window.__gdm++; window.__gdmC = JSON.stringify(c);
      const v = mkTrack('video', 'pcv'); const a = mkTrack('audio', 'pca'); window.__pcTrack = a;
      const tracks = window.__gdmAudio ? [v, a] : [v];
      return { getTracks: () => tracks, getAudioTracks: () => tracks.filter(t => t.kind === 'audio') }; } } });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) } });
  /* ② 가짜 AudioContext — 삑 수를 센다 */
  window.__beeps = 0;
  window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { window.__beeps++; }, stop() {} }; }
    createGain() { return { gain: { value: 0 }, connect() {} }; } resume() {} };
  /* ③ 가짜 읽기 — __ttsMode: 'silent'(onstart 안 옴 = 크롬이 말을 안 함) | 'ok' */
  window.__ttsMode = 'silent'; window.__speaks = 0;
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [], speaking: false, pending: false, paused: false,
    speak(u) { window.__speaks++; if (window.__ttsMode === 'ok') setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 30); }, 10); },
    cancel() {}, pause() {}, resume() {} } });
`;
const GUEST_FAKE = `
  window.__rec = { starts: 0, last: null };
  class FakeRec {
    constructor() { this.lang = ''; this.running = false; }
    start() { window.__rec.starts += 1; window.__rec.last = this; this.running = true; this.onstart && this.onstart(); }
    stop() { if (!this.running) return; this.running = false; this.onend && this.onend(); }
    abort() { this.stop(); }
    say(text) { const r = [{ 0: { transcript: text }, isFinal: true, length: 1 }]; this.onresult && this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) }); }
  }
  window.SpeechRecognition = FakeRec;
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => [], speaking: false, pending: false, paused: false, speak() {}, cancel() {}, pause() {}, resume() {} } });
`;
const LONG = ' 작업 전에는 반드시 주변을 살피고 위험 요소를 확인한 뒤 관리자에게 알리고 보호구 착용 상태를 서로 점검합니다.'.repeat(3);
const PARAS = Array.from({ length: 8 }, (_, i) => `${i + 1}번째 문단입니다.` + LONG);   // 문단 여럿 — 페이지가 길어 스크롤이 생기게

async function hostUp(browser, base, extra, vp, ua) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1568, height: 698 }, locale: 'ko-KR', ...(ua ? { userAgent: ua } : {}) });
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
  await page.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'done', null, { timeout: 30000 });
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
  return { ctx, page, code: (await page.textContent('#roomCode')).trim() };
}
async function guestUp(browser, base, port, code, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA_AND, locale: 'en-US' });
  await ctx.addInitScript(GUEST_FAKE);
  const g = await ctx.newPage();
  await g.goto(`${base}/web/listener/?room=${code}&lang=en&relay=localhost:${port}`);
  await g.waitForSelector('#room-input');
  if (await g.isVisible('#name-input').catch(() => false)) await g.fill('#name-input', name);
  await g.click('#btn-join');
  await g.waitForSelector('#chat-screen', { state: 'visible' });
  await g.waitForSelector('#btn-ask', { state: 'visible', timeout: 8000 });
  return { ctx, g };
}
async function raise(G) {
  await G.g.click('#btn-ask');
  await G.g.click('#btn-ask-submit');
  await G.g.waitForFunction(() => /#\d/.test(document.getElementById('btn-ask').textContent), null, { timeout: 5000 });
}
/* 요소가 뷰포트 **안**인가 — top ≥ 0 · bottom ≤ innerHeight · 0 크기 아님 */
const inView = (p, sel) => p.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return { ok: false, why: 'none' };
  const r = e.getBoundingClientRect();
  return { ok: r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight };
}, sel);
const log = (p) => p.evaluate(() => window.rtHostAsk.log());

(async () => {
  const relay = createMockRelay({ root: ROOT });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    console.log('=== 웹 4차 — 질문 띠 맨 위 · 새 손 삑 · 읽기 확인 · PC 소리 ===');
    const H = await hostUp(browser, base);
    const P = H.page;

    console.log('\n[①] 질문 띠');
    ok(await P.evaluate(() => getComputedStyle(document.getElementById('askBox')).display === 'none' && document.getElementById('askBox').getBoundingClientRect().height === 0), '질문 없을 때 띠 0높이');
    ok(await P.evaluate(() => !document.querySelector('.live-side #askActiveArea') && !document.querySelector('.live-side #askQueueList')), '옛 자리(오른쪽 단 .live-side)에 질문 칸 없음(§5)');
    ok(await P.evaluate(() => { const b = document.getElementById('askBox'); const g = document.querySelector('#step-live .live-grid'); return getComputedStyle(b).position === 'sticky' && !!(b.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING); }), '띠 = sticky · 진행 칸(live-grid) 보다 위');
    ok(await P.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 100), `페이지가 창보다 길다(스크롤 생김) — 옛 판이 「안 보임」 났던 조건`);

    console.log('\n[②] 새 손 → 삑 1회 · 띠 깜빡');
    const A = await guestUp(browser, base, port, H.code, 'Ann');
    await raise(A);
    await P.waitForFunction(() => document.querySelectorAll('#askQueueList button').length === 2, null, { timeout: 5000 });
    ok(await P.evaluate(() => window.__beeps) === 1, `새 손 1 → 삑 ${await P.evaluate(() => window.__beeps)}회`);
    ok(await P.evaluate(() => document.getElementById('askBox').classList.contains('flash')), '띠 깜빡(flash)');
    ok((await log(P)).includes('ask_beep n=1'), '기록 ask_beep n=1');
    const qv = await inView(P, '#askBox');
    ok(qv.ok, `대기만 있어도 띠가 뷰포트 안 (top ${qv.top} · bottom ${qv.bottom} / ${qv.h})`);
    ok(await P.evaluate(() => /✋/.test(document.getElementById('askBox').textContent) && document.querySelector('#askBox #askQueueList button')), '띠 안에 「✋ 질문 n」 + 지명 단추');
    await P.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const qv2 = await inView(P, '#askBox');
    ok(qv2.ok, `맨 아래로 스크롤해도 띠가 뷰포트 안 (top ${qv2.top})`);

    console.log('\n[①] 지명 → 지명 칸이 뷰포트 안');
    await P.click('#askQueueList > div:nth-child(1) button:nth-child(1)');
    await P.waitForSelector('#askActiveArea', { state: 'visible', timeout: 5000 });
    for (const vp of [{ width: 1568, height: 698 }, { width: 1280, height: 600 }]) {
      await P.setViewportSize(vp);
      await P.evaluate(() => window.scrollTo(0, 0));
      const a = await inView(P, '#askActiveArea');
      await P.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await P.waitForTimeout(50);
      const b = await inView(P, '#askActiveArea');
      const e = await inView(P, '#btnAskEnd');
      ok(a.ok && b.ok && e.ok, `${vp.width}×${vp.height}: 지명 칸 위(${a.top}~${a.bottom}) · 맨 아래 스크롤(${b.top}~${b.bottom}) · 「질문 끝내기」 단추도 안`);
    }
    await P.setViewportSize({ width: 1568, height: 698 });

    console.log('\n[③] 읽어 주기 — onstart 없으면 「눌러서 듣기」');
    await A.g.waitForSelector('#btn-ask-mic', { state: 'visible', timeout: 5000 });
    await A.g.click('#btn-ask-mic');
    await A.g.evaluate(() => window.__rec.last.say('Is lunch included?'));
    await P.waitForFunction(() => window.rtHostAsk.log().some(l => /^ask_speak lang=/.test(l)), null, { timeout: 8000 });
    ok(!(await P.isVisible('#btnAskSoundFix')), '읽기 직후엔 단추 없음(5초 기다림)');
    ok(await P.evaluate(() => document.getElementById('btnAskSpeak').classList.contains('on')), '🔊 읽어 줌 켬 상태가 단추 on 으로 보인다');
    await P.waitForSelector('#btnAskSoundFix', { state: 'visible', timeout: 7000 });
    ok((await log(P)).includes('ask_speak_err why=no_start'), `5초 안 onstart 없음 → 「${(await P.textContent('#btnAskSoundFix')).trim()}」 · 기록 no_start`);
    const sv = await inView(P, '#btnAskSoundFix');
    ok(sv.ok, '「눌러서 듣기」 단추도 뷰포트 안');
    const sp0 = await P.evaluate(() => window.__speaks);
    await P.evaluate(() => { window.__ttsMode = 'ok'; });
    await P.click('#btnAskSoundFix');
    await P.waitForFunction(() => window.rtHostAsk.log().some(l => /^ask_speak_end ms=/.test(l)), null, { timeout: 3000 });
    ok(await P.evaluate(() => window.__speaks) === sp0 + 1 && !(await P.isVisible('#btnAskSoundFix')), '누르면 다시 speak 1회 · onstart → 단추 숨김');
    const L3 = await log(P);
    ok(L3.includes('ask_sound_fix') && L3.includes('ask_speak_start') && L3.some(l => /^ask_speak_end ms=\d+/.test(l)), '기록 ask_sound_fix · ask_speak_start · ask_speak_end ms=');

    console.log('\n[②] 같은 손 다시 그려도 삑 없음 · 둘째 손 삑');
    const B = await guestUp(browser, base, port, H.code, 'Bo');
    await raise(B);
    await P.waitForFunction(() => window.__beeps >= 2, null, { timeout: 5000 });
    await P.waitForTimeout(300);
    ok(await P.evaluate(() => window.__beeps) === 2, `둘째 손 → 삑 누계 ${await P.evaluate(() => window.__beeps)} (지명·다시 그리기로 더 나지 않음)`);
    await P.click('#btnAskEnd');
    await P.waitForSelector('#askActiveArea', { state: 'hidden', timeout: 5000 });
    ok(await P.isVisible('#askBox'), '질문 끝 뒤에도 대기(Bo)가 있으면 띠 남음');
    await P.click('#askQueueList > div:nth-child(1) button:nth-child(2)');   // 무시
    await P.waitForFunction(() => getComputedStyle(document.getElementById('askBox')).display === 'none', null, { timeout: 5000 });
    ok(true, '대기 0 · 지명 0 → 띠 다시 0높이');
    await A.ctx.close(); await B.ctx.close();

    console.log('\n[④] 🖥 PC 소리 — start(audioTrack)');
    ok(await P.isVisible('#btnPcAudio'), `크로미움 데스크톱(${await P.evaluate(() => navigator.userAgent.match(/Chrome\/\d+/)[0])}) → 단추 보임 「${(await P.textContent('#btnPcAudio')).trim()}」`);
    await P.click('#btnMic');
    await P.waitForFunction(() => window.rtHostMic.state.on, null, { timeout: 4000 });
    ok(await P.evaluate(() => window.__starts[window.__starts.length - 1] === 'none' && window.__gum[window.__gum.length - 1] === '{"audio":true}'),
      `🎤 = start() 인자 없음 · getUserMedia ${await P.evaluate(() => window.__gum[window.__gum.length - 1])} (micRaw 걷힘)`);
    await P.click('#btnPcAudio');                        // 🎤 켠 채로 누름 → 🎤 닫고 PC 로
    await P.waitForFunction(() => window.rtHostMic.state.on && window.rtHostMic.pc.track(), null, { timeout: 4000 });
    ok(await P.evaluate(() => window.__gdm === 1 && JSON.parse(window.__gdmC).audio === true), `getDisplayMedia ${await P.evaluate(() => window.__gdmC)}`);
    ok(await P.evaluate(() => window.__starts[window.__starts.length - 1] === 'pca'), `인식 start(탭 소리 트랙) — 인자 ${await P.evaluate(() => window.__starts[window.__starts.length - 1])}`);
    ok(await P.evaluate(() => window.rtHostMic.log().includes('mic_open src="pc"') && document.getElementById('btnPcAudio').classList.contains('on') && !document.getElementById('btnMic').classList.contains('on')),
      `기록 mic_open src=pc · 🖥 단추 on 「${(await P.textContent('#btnPcAudio')).trim()}」 · 🎤 off`);
    await P.evaluate(() => { window.__rec.running = false; window.__rec.onend && window.__rec.onend(); });   // 인식기가 혼자 끝남 → 다시 열기도 같은 트랙
    await P.waitForFunction(() => window.__starts.filter(x => x === 'pca').length >= 2, null, { timeout: 5000 });
    ok(true, '다시 열기(reopen)도 start(탭 소리 트랙)');
    await P.evaluate(() => window.__pcTrack.__end());   // 브라우저 막대 「공유 중지」
    await P.waitForFunction(() => !window.rtHostMic.state.on, null, { timeout: 3000 });
    ok(await P.evaluate(() => window.rtHostMic.log().some(l => /^pc_audio_ended/.test(l)) && !window.rtHostMic.pc.track() && !document.getElementById('btnPcAudio').classList.contains('on')), '공유 중지(트랙 ended) → 인식 닫힘 · 단추 off');
    await P.evaluate(() => { window.__gdmAudio = false; });
    await P.click('#btnPcAudio');
    await P.waitForFunction(() => window.rtHostMic.log().some(l => /^pc_audio_no_track/.test(l)), null, { timeout: 3000 });
    ok(!(await P.evaluate(() => window.rtHostMic.state.on)) && /탭 오디오/.test(await P.textContent('#micStatus')), `탭 소리 안 켜고 공유 → 인식 안 켬 · 「${(await P.textContent('#micStatus')).trim()}」`);
    await H.ctx.close();

    console.log('\n[④·②] 스위치·지원 안 함');
    const H2 = await hostUp(browser, base, '&pcaudio=0&askbeep=0');
    ok(!(await H2.page.isVisible('#btnPcAudio')), '되돌림 실증(D-09): ?pcaudio=0 → 🖥 단추 숨김');
    const C = await guestUp(browser, base, port, H2.code, 'Cy');
    await raise(C);
    await H2.page.waitForFunction(() => document.querySelectorAll('#askQueueList button').length === 2, null, { timeout: 5000 });
    ok(await H2.page.evaluate(() => window.__beeps) === 0 && await H2.page.isVisible('#askBox'), '되돌림 실증(D-09): ?askbeep=0 → 새 손에 삑 0 (띠는 보임)');
    await C.ctx.close(); await H2.ctx.close();
    const H3 = await hostUp(browser, base, '', { width: 390, height: 844 }, UA_AND);
    ok(!(await H3.page.isVisible('#btnPcAudio')) && await H3.page.evaluate(() => window.rtHostMic.pc.supported() === false), '안드로이드 크롬 UA → 지원 아님 · 🖥 단추 숨김(start(audioTrack) 미지원)');
    await H3.ctx.close();
  } catch (e) { console.error('[FAIL]', e && e.message || e); process.exitCode = 1; }
  finally { await browser.close(); relay.close(); }
  console.log(`\n=== ${pass} PASS ===`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
