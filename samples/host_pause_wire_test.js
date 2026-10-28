/* samples/host_pause_wire_test.js — 설계 `docs/design/host-play-pause.md` A·B
 * 실행: node samples/host_pause_wire_test.js   (npm run test:host-pause)
 *
 * 대표님 실기 10-26 19:02: ■ 멈춤을 눌러도 손님 폰은 계속 읽고, ▶ 를 다시 누르면 문단
 * **처음부터** 다시 읽었다. 마스터 행동 시험은 강사 상태만 재서 「된다」고 잘못 봤다(MISTAKES #12).
 * 그래서 이 시험은 **손님 폰의 `speechSynthesis` 호출**을 센다 — 강사 단추가 손님 소리에
 * 무엇을 했는지가 판정이다.
 *
 *  1. ▶ → 손님 speak (문단 1 첫 문장). ■ → cancel 1회 뒤 speak 0회.
 *  2. 같은 자리 ▶ → 문단 **재전송 0건**, 손님은 **멈춘 문장부터** (첫 문장 아님).
 *  3. 휴식 → cancel · speak 0 · 띠 켬. 휴식 끝 → 이어 읽기.
 *  4. ■ → ◀ 이전 → ▶ : 그 문단 전송 1건, 손님은 그 문단 첫 문장부터.
 *  5. 되돌림 실증 — 재전송 길로 되돌리면 2 가 붉다.
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

console.log('=== 설계 host-play-pause — 강사 ■·▶·휴식이 손님 폰 소리까지 ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });

/* 문단 셋 — 문장 셋씩. 손님 가짜 TTS 는 문장 하나를 400ms 에 끝낸다(그래야 「몇째 문장에서
   멈췄나」를 볼 수 있다). 강사 타이머(글자 수)는 그보다 길다 — 문단이 혼자 넘어가지 않는다. */
const PARAS = [
  'First sentence one. Second sentence one. Third sentence one. ' + 'x'.repeat(300),
  'First sentence two. Second sentence two. Third sentence two. ' + 'x'.repeat(300),
  'First sentence three. Second sentence three. Third sentence three. ' + 'x'.repeat(300)
];

const FAKE_HOST = `
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) } });
`;
/* 손님 가짜 TTS — 진짜 규약대로(D-11): speak 는 큐에 넣고 400ms 뒤 onend, cancel 은 큐를 비우고
   읽던 것에 onerror('interrupted'). 호출은 전부 센다. */
const FAKE_GUEST = `
  window.__tts = { speak: [], cancel: 0 };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } };
  (function () {
    let cur = null, timer = null;
    const S = {
      getVoices: () => [{ lang: 'en-US', name: 'en', localService: true, default: true }],
      speaking: false, pending: false, paused: false,
      onvoiceschanged: null,
      speak(u) {
        if (u.text) window.__tts.speak.push(u.text);
        if (cur) { const p = cur; cur = null; clearTimeout(timer); if (p.onerror) p.onerror({ error: 'interrupted' }); }
        cur = u; S.speaking = true;
        timer = setTimeout(() => { if (cur === u) { cur = null; S.speaking = false; if (u.onend) u.onend({}); } }, 400);
      },
      cancel() { window.__tts.cancel += 1; clearTimeout(timer); const p = cur; cur = null; S.speaking = false;
        if (p && p.onerror) p.onerror({ error: 'interrupted' }); },
      pause() {}, resume() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: S });
  })();
`;

function sentParas(room) { return (room.received || []).filter(m => m && m.kind === 'script').map(m => m.para); }
function sentKinds(room, k) { return (room.received || []).filter(m => m && m.kind === k).length; }

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  try {
    /* 강사 */
    const hctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
    await hctx.addInitScript(FAKE_HOST);
    const h = await hctx.newPage();
    h.on('pageerror', e => console.log('HOST ERROR:', e.message));
    await h.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
    await h.fill('#tokenInput', 'valid_instructor_token');
    await h.click('#btnVerifyToken');
    await h.waitForSelector('#step-prepare', { state: 'visible' });
    await h.evaluate((paras) => {
      const dt = new DataTransfer();
      dt.items.add(new File([paras.join('\n\n')], 'g.txt', { type: 'text/plain' }));
      const input = document.getElementById('fileInput');
      input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, PARAS);
    await h.waitForFunction((n) => document.querySelectorAll('.para-item').length === n, PARAS.length);
    await h.click('#btnStartLecture');
    await h.waitForSelector('#step-live', { state: 'visible' });
    await h.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
    const code = (await h.textContent('#roomCode')).trim();
    const room = relay.rooms.get(code);
    ok(!!room, `릴레이 방 ${code}`);

    /* 손님 — en. 원고 줄은 기본 소리 끔이라 소리 단추를 켠다 */
    const gctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await gctx.addInitScript(FAKE_GUEST);
    const g = await gctx.newPage();
    g.on('pageerror', e => console.log('GUEST ERROR:', e.message));
    await g.goto(`${base}/web/listener/?room=${code}&lang=en&auto=1&relay=localhost:${port}`);
    await g.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
    await h.waitForFunction(() => document.getElementById('attNow').textContent === '1', null, { timeout: 5000 });
    /* 원고 강연(welcome script:1)이면 손님이 단추를 **건드리지 않아도** 소리가 켜져 있어야 한다
       (대표님 실기 10-27 ①: 「▶ 눌러도 안 됨」 — 손님 폰이 원고 줄을 기본으로 안 읽고 있었다). */
    const ttsOn = await g.evaluate(() => typeof isTtsEnabled !== 'undefined' && isTtsEnabled);
    ok(ttsOn === true, '원고 강연이면 손님 소리가 처음부터 켜져 있다 (단추 안 건드림)');
    const tts = () => g.evaluate(() => ({ n: window.__tts.speak.length, last: window.__tts.speak[window.__tts.speak.length - 1] || '', cancel: window.__tts.cancel, st: window.rtRead.state() }));

    /* ── 1. ▶ → 손님이 문단 1 첫 문장을 읽는다 · ■ → cancel 뒤 speak 0 ── */
    console.log('\n[1] ▶ 재생 → 손님 읽기 · ■ 멈춤 → 손님도 멈춘다');
    await h.click('#btnPlay');
    await g.waitForFunction(() => window.__tts.speak.length >= 1, null, { timeout: 6000 });
    let t = await tts();
    ok(/^(\[en\] )?First sentence one\./.test(t.last), `손님이 문단 1 **첫 문장**부터 읽는다 — "${t.last.slice(0, 30)}"`);
    ok(t.st && t.st.para === 1 && t.st.n >= 3, `문장 단위로 읽는다 — 문단 1 을 ${t.st && t.st.n} 문장으로`);
    await g.waitForFunction(() => window.__tts.speak.length >= 2, null, { timeout: 3000 });   // 둘째 문장에 들어간다
    await h.click('#btnPlay');                                                                  // ■
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().paused, null, { timeout: 3000 });
    t = await tts();
    const cancelAtStop = t.cancel, spokenAtStop = t.n, idxAtStop = t.st.idx;
    ok(cancelAtStop >= 1, `■ 멈춤 → 손님 cancel ${cancelAtStop}회`);
    if (idxAtStop < 1) console.log('DEBUG', JSON.stringify(await g.evaluate(() => ({ speak: window.__tts.speak.map(x => x.slice(0, 25)), log: window.rtRead.log() }))));
    ok(idxAtStop >= 1, `멈춘 자리를 기억한다 — 문단 1 의 ${idxAtStop + 1}째 문장`);
    await g.waitForTimeout(1500);
    t = await tts();
    ok(t.n === spokenAtStop, `멈춘 뒤 1.5초 동안 손님 speak 0회 (${spokenAtStop} 그대로) — 계속 읽지 않는다`);
    ok(sentKinds(room, 'pause') >= 1, `전선에 pause 가 갔다 (${sentKinds(room, 'pause')}건)`);

    /* ── 2. 같은 자리 ▶ → 문단 재전송 0 · 멈춘 문장부터 ── */
    console.log('\n[2] 같은 자리 ▶ → 문단을 다시 보내지 않고, 멈춘 문장부터');
    const scriptsBefore = sentParas(room).length;
    await h.click('#btnPlay');
    await g.waitForFunction((n) => window.__tts.speak.length > n, spokenAtStop, { timeout: 4000 });
    t = await tts();
    ok(sentParas(room).length === scriptsBefore, `문단 재전송 0건 (${scriptsBefore} 그대로) — 처음부터 다시 읽을 일이 없다`);
    ok(sentKinds(room, 'resume') >= 1, `전선에 resume 가 갔다 (${sentKinds(room, 'resume')}건)`);
    ok(!/^(\[en\] )?First sentence one\./.test(t.last) && new RegExp('^(\\[en\\] )?' + ['First', 'Second', 'Third'][idxAtStop] + ' sentence one\\.').test(t.last),
       `손님은 **멈춘 ${idxAtStop + 1}째 문장**부터 — "${t.last.slice(0, 30)}"`);

    /* ── 3. 휴식 → 멈춤 + 띠 · 휴식 끝 → 이어 읽기 ── */
    console.log('\n[3] 휴식 → 손님 소리 멈춤 · 휴식 끝 → 이어 읽기');
    await h.click('#btnBreak');
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().paused, null, { timeout: 3000 });
    t = await tts();
    const nAtBreak = t.n, idxAtBreak = t.st.idx;
    ok(await g.evaluate(() => document.getElementById('break-band').classList.contains('on')), '손님 화면에 쉬는 시간 띠');
    await g.waitForTimeout(1200);
    t = await tts();
    ok(t.n === nAtBreak, `휴식 동안 speak 0회 (${nAtBreak} 그대로)`);
    ok(await h.evaluate(() => window.rtHostPlay.state.on) === false, '강사 재생 타이머도 꺼진다');
    await h.click('#btnBreak');                                  // 휴식 끝
    await g.waitForFunction((n) => window.__tts.speak.length > n, nAtBreak, { timeout: 4000 });
    t = await tts();
    ok(!(await g.evaluate(() => document.getElementById('break-band').classList.contains('on'))), '휴식 끝 → 띠 사라짐');
    ok(t.st === null || t.st.idx >= idxAtBreak, `휴식 끝 → 멈춘 문장부터 이어 읽는다 — "${t.last.slice(0, 30)}"`);

    /* ── 4. ■ → ◀ 이전 → ▶ : 그 문단 전송 1 · 첫 문장부터 ── */
    console.log('\n[4] ■ → ◀ 이전 → ▶ : 옮긴 문단에서');
    await h.click('#btnNext');                                   // 문단 2 로
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().para === 2, null, { timeout: 4000 });
    await h.click('#btnPlay');                                   // ▶ (지금 꺼져 있으면 켠다)
    if (!(await h.evaluate(() => window.rtHostPlay.state.on))) await h.click('#btnPlay');
    await h.click('#btnPlay');                                   // ■
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().paused, null, { timeout: 3000 });
    const before4 = sentParas(room).length;
    await h.click('#btnPrev');                                   // 문단 1
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().para === 1 && !window.rtRead.state().paused, null, { timeout: 4000 });
    ok(sentParas(room).length === before4 + 1 && sentParas(room).pop() === 1, '◀ 이전 → 문단 1 전송 1건');
    t = await tts();
    ok(/^(\[en\] )?First sentence one\./.test(t.last), `손님은 문단 1 **첫 문장**부터 — "${t.last.slice(0, 30)}"`);
    await h.click('#btnPlay');                                   // ▶ — 1 에 머문다(2 로 되튀지 않는다)
    await h.waitForTimeout(300);
    const cur4 = await h.evaluate(() => live.cur);
    ok(cur4 === 1, `▶ 뒤에도 문단 1 에 머문다 (되튀지 않는다 — NOW 4-1) cur=${cur4}`);
    await h.click('#btnPlay');

    /* ── 4-1. 손님 ✋ → 강사 「지명」 → 원고 소리 멈춤 · 「끝내기」 → 멈춘 문장부터 (대표님 10-27 13:10) ── */
    console.log('\n[4-1] 선택하면 원고가 멈추고, ▶ 면 질문을 닫고 이어 간다 (장부 60)');
    await h.click('#btnPlay');                                   // ▶ (문단 1 읽는 중)
    await g.waitForFunction(() => window.rtRead.state() && !window.rtRead.state().paused, null, { timeout: 4000 });
    await g.click('#btn-ask'); await g.fill('#ask-input-text', 'Question?'); await g.click('#btn-ask-submit');
    await h.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /^\s*(선택|Select)\s*$/.test(b.textContent) && b.offsetParent), null, { timeout: 5000 });
    await h.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*(선택|Select)\s*$/.test(x.textContent) && x.offsetParent); b.click(); });
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().paused, null, { timeout: 4000 });
    t = await tts(); const nAtGrant = t.n;
    ok(await h.evaluate(() => window.rtHostPlay.state.on) === false, '선택 → 강사 재생이 멈춘다');
    await g.waitForTimeout(1000); t = await tts();
    ok(t.n === nAtGrant, `지명 뒤 손님 speak 0회 (${nAtGrant} 그대로) — 질문 중에 원고를 읽지 않는다`);
    /* 방(가짜 릴레이)은 revoke 를 받으면 손님에게 ask_ended 를 보내고 그 손님의 발언권 표시가 지워진다 — 그것으로 잰다 */
    const askOpenBefore = await g.evaluate(() => currentActiveAskId);
    ok(!!askOpenBefore, `선택 뒤 손님 쪽에 열린 질문이 있다 (${askOpenBefore})`);
    await h.click('#btnPlay');                                   // 끝내기 단추는 없다 — ▶ 가 질문을 닫고 이어 간다
    await g.waitForFunction((n) => window.__tts.speak.length > n, nAtGrant, { timeout: 5000 });
    ok(await h.evaluate(() => window.rtHostPlay.state.on) === true, '▶ → 재생이 다시 켜진다');
    await g.waitForFunction(() => currentActiveAskId === null, null, { timeout: 4000 }).catch(() => {});
    const askOpenAfter = await g.evaluate(() => currentActiveAskId);
    ok(askOpenAfter === null, `▶ 가 열린 질문을 닫는다 (손님 쪽 ${askOpenBefore} → ${askOpenAfter}) — 손님 마이크가 열린 채 원고가 읽히지 않는다`);
    ok(sentKinds(room, 'resume') >= 2, `▶ → resume 전선 (문단 재전송 아님) ${sentKinds(room, 'resume')}건`);
    let redQ = false;
    try { assert.ok(askOpenBefore === null, '닫힘'); } catch (_) { redQ = true; }
    ok(redQ, '▶ 전에는 질문이 열려 있었다 — ▶ 가 닫은 것이다 (되돌림 실증)');
    await h.click('#btnPlay');

    /* ── 5. 되돌림 실증 — 재전송 길이면 [2] 가 붉다 ── */
    console.log('\n[5] 되돌림 실증');
    const n0 = sentParas(room).length;
    await h.evaluate(() => { window.rtHostPlay.stop('btn'); goTo(live.cur); });   // 옛 길: 같은 문단을 다시 보낸다
    await g.waitForFunction(() => window.rtRead.state() && window.rtRead.state().idx === 0 && !window.rtRead.state().paused, null, { timeout: 4000 });
    let red = false;
    try { assert.ok(sentParas(room).length === n0, '재전송 0'); } catch (_) { red = true; }
    ok(red, '옛 길(문단 재전송)로 되돌리면 [2] 가 붉어진다 — 손님이 첫 문장부터 다시 읽는다 (되돌림 실증)');

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    await relay.close();
  }
})().catch((e) => { console.error('\n*** 실패:', e.message); process.exit(1); });
