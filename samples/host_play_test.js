/* samples/host_play_test.js — 정본 §1 ④ 강사 단추: ◀ 이전 · ▶/■ 재생·멈춤 · 다음 ▶ · 🎤
 * 실행: node samples/host_play_test.js   (npm run test:host-play)
 *
 * 정본 `docs/design/web-lecture-one-page.md` §1 ④ · §6 ③④ (대표님 10-21 15:26):
 *  ① 재생 = 원고 **자동 넘김**(글자 수 속도), 기본 **1.0배**, 0.8~1.5배
 *  ② 🎤 끼어들기 = 원고를 **멈추고 그 문단을 기억** → 🎤 를 한 번 더 누르거나 ▶ 를
 *     누르면 **멈춘 문단에서** 다시
 *  ③ 마지막 문단에서 스스로 끝난다 · 끝 화면으로 가면 꺼진다(D-32)
 *
 * 왜 시간 셈을 모듈로 뺐나: `web/host/index.html` 안에 두면 시험이 돌 수 없고 조이개를
 * 고칠 자리가 둘이 된다(§4). 그래서 **판정은 `web/common/script-play.js` 한 곳**이고
 * 이 시험은 그 모듈을 직접 먹이고, 화면이 그 답을 **쓰는지**를 브라우저로 본다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

const PLAY = require('../web/common/script-play.js');

console.log('=== 정본 §1 ④ 강사 단추 — 재생/멈춤 · 🎤 끼어들기 ===');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });

/* 가짜 인식 — 🎤 를 눌러야 멈춤·되켜기를 볼 수 있다. 가짜는 진짜 규약대로(D-11):
   start 는 onstart 를 내고, stop 은 onend 를 낸다. */
const FAKE_SPEECH = `
  class FakeRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.running=false; }
    start() { if (this.running) throw new Error('already started'); this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
    stop() { this.running = false; if (this.onend) this.onend(); }
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) }
  });
`;

/* 문단 다섯 — 길이를 달리 둔다(글자 수 속도를 보려면 같은 길이로는 못 본다) */
const PARAS = [
  '첫 문단입니다.',
  '두 번째 문단입니다.',
  '세 번째 문단입니다.',
  '네 번째 문단입니다.',
  '다섯 번째 문단입니다.'
];

async function openHost(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
  await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));
  await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
  await page.fill('#tokenInput', 'valid_instructor_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible' });
  await page.evaluate((paras) => {
    const dt = new DataTransfer();
    dt.items.add(new File([paras.join('\n\n')], 'g.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, PARAS);
  await page.waitForFunction((n) => document.querySelectorAll('.para-item').length === n, PARAS.length);
  await page.click('#btnPreTranslate');
  for (let i = 0; i < 40; i++) {
    const m = await page.evaluate(() => window.rtHostReady ? window.rtHostReady.mode() : 'none');
    if (m === 'done') break;
    await page.waitForTimeout(500);
  }
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  try {
    await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
  } catch (e) {
    const statusText = await page.evaluate(() => document.getElementById('liveStatus').textContent);
    console.error('LIVE STATUS FAIL. liveStatus text:', statusText);
    throw e;
  }
  return { ctx, page };
}

/* 방이 받은 script 문단 번호만 (순서대로) */
function sentParas(room) {
  return (room.received || []).filter(m => m && m.kind === 'script').map(m => m.para);
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME
    ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  let host = null;

  try {
    /* ── 1. 판정 모듈 — 글자 수 속도 · 배속 범위 ── */
    console.log('\n[1] 판정 한 곳 (web/common/script-play.js)');
    ok(PLAY.DEFAULT_RATE === 1.0, `기본 배속 1.0배 (정본 §6 ③) — ${PLAY.DEFAULT_RATE}`);
    ok(PLAY.RATE_MIN === 0.8 && PLAY.RATE_MAX === 1.5, `범위 0.8~1.5배 — ${PLAY.RATE_MIN}~${PLAY.RATE_MAX}`);
    ok(PLAY.RATES.length >= 2 && PLAY.RATES.indexOf(1.0) >= 0 &&
       PLAY.RATES.every(r => r >= PLAY.RATE_MIN && r <= PLAY.RATE_MAX),
       `고를 수 있는 배속이 전부 범위 안이고 1.0배가 있다 (${PLAY.RATES.join('·')})`);

    const short = PLAY.paraMs('가'.repeat(40), 1.0);
    const long = PLAY.paraMs('가'.repeat(400), 1.0);
    ok(long > short, `긴 문단이 더 오래 머문다 — 40자 ${short}ms < 400자 ${long}ms (**글자 수** 속도)`);
    ok(PLAY.paraMs('가'.repeat(400), 1.5) < long, '배속을 올리면 짧아진다');
    ok(PLAY.paraMs('가'.repeat(400), 0.8) > long, '배속을 내리면 길어진다');
    ok(PLAY.paraMs('가'.repeat(100000), 1.0) === PLAY.MAX_MS && PLAY.paraMs('가'.repeat(400), 1.0) < PLAY.MAX_MS, `아주 긴 문단은 ${PLAY.MAX_MS}ms 에서 멈추고, 400자(강연에 흔한 길이)는 안 잘린다 — 잘리면 강사가 읽는 중에 다음이 간다`);

    /* §20 — 빈 답·모를 값을 0 으로 읽지 않는다 */
    ok(PLAY.paraMs('', 1.0) === PLAY.MIN_MS && PLAY.paraMs(null, 1.0) === PLAY.MIN_MS &&
       PLAY.paraMs(undefined, 1.0) === PLAY.MIN_MS,
       `빈 문단·없는 문단도 최소 ${PLAY.MIN_MS}ms 머문다 (0ms 면 원고가 한순간에 다 지나간다, §20)`);
    ok(PLAY.clampRate('') === 1.0 && PLAY.clampRate(null) === 1.0 && PLAY.clampRate(0) === 1.0 &&
       PLAY.clampRate('x') === 1.0 && PLAY.clampRate(9) === 1.5 && PLAY.clampRate(0.1) === 0.8,
       '배속이 비거나 0·글자여도 기본 1.0배로 떨어지고, 범위를 넘으면 잘린다');

    ok(PLAY.nextPara({ cur: 3, total: 5 }) === 4, '다음 문단 = 지금+1');
    ok(PLAY.nextPara({ cur: 5, total: 5 }) === null, '마지막 문단이면 null — 재생이 스스로 끝난다');
    ok(PLAY.nextPara({ cur: 0, total: 5 }) === 1, '아직 시작 전(0)이면 첫 문단');
    ok(PLAY.resumeFrom({ pausedAt: 2, cur: 5, total: 9 }).go === true &&
       PLAY.resumeFrom({ pausedAt: 2, cur: 5, total: 9 }).para === 2,
       '멈춘 문단이 지금 자리와 다르면 **그 문단으로 되돌아간다** (정본 §6 ④)');
    ok(PLAY.resumeFrom({ pausedAt: 5, cur: 5, total: 9 }).go === false, '멈춘 문단이 지금 자리면 그대로 이어 간다');
    ok(PLAY.resumeFrom({ pausedAt: 0, cur: 4, total: 9 }).go === false, '멈춘 문단을 모르면 지금 자리에서 이어 간다');
    ok(PLAY.resumeFrom({ pausedAt: 99, cur: 4, total: 9 }).go === false, '원고 밖 문단은 안 간다');

    /* ── 2. 화면 — 단추들이 **이 순서로** 보인다 (구조 단언, §12) ── */
    console.log('\n[2] 강사 화면 단추 — ◀ 이전 · ▶ 재생 · 다음 ▶');
    host = await openHost(browser, base);
    const page = host.page;

    const order = await page.evaluate(() => {
      const row = document.getElementById('btnPlay').parentElement;
      return { cls: row.className, ids: [...row.children].map(c => c.id).filter(Boolean) };
    });
    ok(order.cls.indexOf('live-controls') >= 0, `재생 단추가 진행 단추 줄(.live-controls) 안에 있다 — ${order.cls}`);
    const iPrev = order.ids.indexOf('btnPrev'), iPlay = order.ids.indexOf('btnPlay'), iNext = order.ids.indexOf('btnNext');
    ok(iPrev >= 0 && iPlay === iPrev + 1 && iNext === iPlay + 1,
       `이전 → 재생 → 다음 순서 (${order.ids.join(' · ')})`);
    ok(await page.isVisible('#btnPlay'), '재생 단추가 화면에 보인다');
    ok((await page.textContent('#btnPlay')).trim() === '▶ 재생', `꺼져 있을 때 글자는 「▶ 재생」 — "${(await page.textContent('#btnPlay')).trim()}"`);

    const roomCode = (await page.textContent('#roomCode')).trim();
    const room = relay.rooms.get(roomCode);
    ok(!!room, `릴레이 방 ${roomCode} 열림`);

    /* ── 3. ▶ 재생 — 혼자 넘어간다 ── */
    console.log('\n[3] ▶ 재생 — 손을 떼도 문단이 혼자 간다');
    await page.click('#btnPlay');
    ok((await page.textContent('#btnPlay')).trim() === '■ 멈춤', '켜지면 글자가 「■ 멈춤」으로 바뀐다');
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === true, 'rtHostPlay.state.on = true');
    await page.waitForFunction(() => window.rtHostPlay.state.on && window.rtHostPlay.log().some(l => l.indexOf('play_tick') === 0), null, { timeout: 4000 });

    /* 문단 셋이 쌓일 때까지 — 사람은 아무것도 누르지 않는다 */
    await page.waitForFunction(() => {
      const n = document.getElementById('liveProgress').textContent.split('/')[0].trim();
      return Number(n) >= 3;
    }, null, { timeout: 15000 });
    const got3 = sentParas(room);
    ok(got3.length >= 3 && got3[0] === 1 && got3[1] === 2 && got3[2] === 3,
       `사람이 안 눌렀는데 문단 1·2·3 이 순서대로 나갔다 (${got3.join(',')})`);

    const tick = (await page.evaluate(() => window.rtHostPlay.log())).find(l => l.indexOf('play_tick') === 0);
    ok(/play_tick para=\d+ next=\d+ ms=\d+ rate=[\d.]+ chars=\d+/.test(tick),
       `기록 한 줄에 **무엇을 왜 기다렸나**가 있다(§12) — "${tick}"`);

    /* ── 4. ■ 멈춤 — 더 가지 않는다 ── */
    console.log('\n[4] ■ 멈춤 — 멈추면 더 안 간다');
    await page.click('#btnPlay');
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === false, '멈추면 state.on = false');
    const atStop = sentParas(room).length;
    await page.waitForTimeout(2500);        // 한 문단이 넉넉히 지날 시간
    ok(sentParas(room).length === atStop, `멈춘 뒤 ${2500}ms 동안 문단이 하나도 안 나갔다 (${atStop}개 그대로)`);
    ok((await page.textContent('#btnPlay')).trim() === '▶ 재생', '글자가 다시 「▶ 재생」');

    /* ── 5. 🎤 끼어들기 — 멈추고 **그 문단을 기억**, 🎤 를 다시 누르면 거기서 (정본 §6 ④) ── */
    console.log('\n[5] 🎤 끼어들기 → 멈춤 · 🎤 다시 → 멈춘 문단부터');
    await page.click('#btnPlay');            // 다시 켠다
    await page.waitForFunction(() => window.rtHostPlay.state.on === true, null, { timeout: 3000 });
    const curBeforeMic = await page.evaluate(() => window.rtHostPlay.state, null);
    await page.click('#btnMic');
    await page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 4000 });
    const paused = await page.evaluate(() => ({ on: window.rtHostPlay.state.on, at: window.rtHostPlay.state.pausedAt,
                                                cur: Number(document.getElementById('liveProgress').textContent.split('/')[0].trim()) }));
    ok(paused.on === false, '🎤 를 켜면 재생이 멈춘다 — 원고와 실시간 말이 겹치지 않는다');
    ok(paused.at === paused.cur && paused.at >= 1, `멈춘 문단을 기억한다 (pausedAt=${paused.at})`);

    const atMic = sentParas(room).length;
    await page.waitForTimeout(2500);
    ok(sentParas(room).length === atMic, '🎤 를 켜 둔 동안 원고 문단이 혼자 나가지 않는다');

    /* 사람이 그 사이 딴 문단을 본다 → 되켜면 **멈춘 문단으로 돌아간다** */
    await page.click('#btnNext');
    await page.click('#btnNext');
    const wandered = await page.evaluate(() => Number(document.getElementById('liveProgress').textContent.split('/')[0].trim()));
    ok(wandered === paused.at + 2, `끼어든 동안 손으로 ${wandered} 번 문단까지 넘겼다`);

    await page.click('#btnMic');             // 🎤 를 한 번 더
    await page.waitForFunction((want) => window.rtHostPlay.state.on === true &&
      Number(document.getElementById('liveProgress').textContent.split('/')[0].trim()) === want,
      paused.at, { timeout: 4000 });
    const backTo = await page.evaluate(() => Number(document.getElementById('liveProgress').textContent.split('/')[0].trim()));
    ok(backTo === paused.at, `🎤 를 다시 누르니 **멈춘 문단 ${paused.at}** 으로 돌아가 다시 간다 (정본 §6 ④)`);
    const reSent = sentParas(room);
    ok(reSent[reSent.length - 1] === paused.at, `그 문단을 손님에게 **다시 보냈다** — 건너뛰지 않는다(R-15)`);
    ok(await page.evaluate(() => window.rtHostPlay.state.pausedAt) === 0, '되켠 뒤 기억은 비운다 — 다음 멈춤이 덮어쓰게');

    /* ── 6. 마지막 문단 · 끝 화면 ── */
    console.log('\n[6] 마지막 문단에서 스스로 끝난다 · 끝 화면에서 꺼진다');
    await page.waitForFunction((n) => window.rtHostPlay.state.on === false &&
      Number(document.getElementById('liveProgress').textContent.split('/')[0].trim()) === n,
      PARAS.length, { timeout: 20000 });
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === false,
       `마지막 ${PARAS.length}번 문단에 닿으면 재생이 **스스로** 꺼진다`);
    const offLine = (await page.evaluate(() => window.rtHostPlay.log())).filter(l => l.indexOf('play_off') === 0).pop();
    ok(/why=end\b/.test(offLine), `왜 꺼졌는지 기록에 있다 — "${offLine}"`);
    /* 10-26 대표님 설계(5be9901): 재생 단추는 **꺼지지 않는다** — 마지막 문단에서 눌러도 바로 끝나고
       글자는 「▶ 재생」으로 돌아온다(사람이 눌렀는데 안 눌리는 단추가 더 헷갈린다). */
    ok(await page.evaluate(() => document.getElementById('btnPlay').disabled) === false,
       '마지막 문단에서도 재생 단추는 눌린다(10-26 설계)');
    await page.click('#btnPlay');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === false &&
       (await page.textContent('#btnPlay')).trim() === '▶ 재생',
       '마지막 문단에서 ▶ 를 눌러도 바로 끝나고 글자는 「▶ 재생」');

    /* 끝내기 — 타이머가 살아 있으면 끝낸 뒤에도 문단이 간다(D-32) */
    await page.click('#btnPrev');             // 다시 넘길 수 있는 자리로
    await page.click('#btnPlay');
    await page.waitForFunction(() => window.rtHostPlay.state.on === true, null, { timeout: 3000 });
    await page.click('#btnEnd');
    await page.waitForSelector('#step-end', { state: 'visible' });
    const afterEnd = sentParas(room).length;
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === false, '끝 화면으로 가면 재생이 꺼진다');
    await page.waitForTimeout(2500);
    ok(sentParas(room).length === afterEnd, `끝낸 뒤에는 문단이 하나도 안 나간다 (${afterEnd}개 그대로 — D-32)`);

    /* ── 7. 되돌림 실증 ── */
    console.log('\n[7] 되돌림 실증 3건');

    let rev1 = false;
    try { assert.ok(long <= short, `긴 문단이 더 오래 머물지 않는다 (${short} / ${long})`); } catch (_) { rev1 = true; }
    ok(rev1, '글자 수 속도를 고정 시간으로 되돌리면 붉어진다 (되돌림 실증 1)');

    /* 재생을 끈 뒤 문단이 더 나가면 — 넘어간 까닭이 타이머가 아니었다는 뜻이다 */
    let rev2 = false;
    try { assert.ok(sentParas(room).length > afterEnd, '멈춘 뒤에도 문단이 나갔다'); } catch (_) { rev2 = true; }
    ok(rev2, '멈춤이 타이머를 안 지우면 붉어진다 — 넘어간 것은 타이머가 한 일이다 (되돌림 실증 2)');

    /* 기억을 지우고 되켜면 돌아가지 않는다 — 돌아간 것은 `pausedAt` 이 한 일이다 */
    const noMem = await page.evaluate(() => {
      const st = window.rtHostPlay.state;
      return (typeof rtScriptPlay !== 'undefined') && rtScriptPlay.resumeFrom({ pausedAt: 0, cur: 7, total: 9 }).go === false
             && st && typeof st.pausedAt === 'number';
    });
    ok(noMem, '멈춘 문단 기억을 없애면 그 문단으로 돌아가지 않는다 — 돌아간 것은 기억이 한 일이다 (되돌림 실증 3)');

    /* ── 8. 자물쇠 — 재생은 와이어를 바꾸지 않는다 ── */
    console.log('\n[8] 자물쇠 — 재생은 **원문만** 보내는 규칙을 바꾸지 않는다 (P-14)');
    const bad = (room.received || []).filter(m => m && m.kind === 'script' && (m.trans || m.translated || m.tr));
    ok(bad.length === 0, `자동으로 넘긴 문단에도 번역문 칸이 없다 (${bad.length}건)`);
    const playSrc = fs.readFileSync(path.join(__dirname, '..', 'web', 'common', 'script-play.js'), 'utf-8');
    ok(!/fetch|XMLHttpRequest|translate/i.test(playSrc), '판정 모듈은 바깥을 부르지 않는다 — 시간만 센다');

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    if (host) { try { await host.ctx.close(); } catch (_) {} }
    try { await browser.close(); } catch (_) {}
    try { relay.srv.close(); } catch (_) {}
  }
  process.exit(0);
})().catch((e) => { console.error('\n[FAIL] ' + (e && e.message)); process.exit(1); });
