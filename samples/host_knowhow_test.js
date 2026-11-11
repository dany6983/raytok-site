/* samples/host_knowhow_test.js — 웹 강사: 앱 노하우 옮기기 (NOW 11-03 18:45 ①②⑥)
 * 실행: node samples/host_knowhow_test.js   (npm run test:host-knowhow)
 *
 *  ① 「final 없음 15초」 감시견 — interim 만 20초 → stop 1 + 줄 1 · 조용한 20초 → stop 0
 *     · final 이 중간에 오면 시계를 처음부터 · 스위치 ?nofinal=0 이면 안 끊는다
 *  ② 확정 줄 원장(localStorage) — 메모리 비우고 원장 49줄 → 리포트 49줄 · 방 닫으면 지운다
 *  ⑥ ?soak=1 이면 5분마다 soak 한 줄, 기본은 없음
 *
 * 시간은 Playwright 시계(clock)로 앞당긴다 — 페이지 코드는 진짜 Date.now·setInterval 을 쓴다.
 * 인식기는 가짜다(헤드리스에 없다). 가짜는 web_host_mic_test.js 와 같은 꼴(D-11).
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const FAKE_SPEECH = `
  window.__recLog = [];
  class FakeRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.running=false; }
    start() {
      if (this.running) throw new Error('already started');
      this.running = true; window.__recLog.push('start'); window.__rec = this;
      if (this.onstart) this.onstart();
    }
    stop() { this.running = false; window.__recLog.push('stop'); if (this.onend) this.onend(); }
    say(text, isFinal) {
      const r = [{ 0: { transcript: text }, isFinal: !!isFinal, length: 1 }];
      if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
    }
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
  });
`;

async function openHost(browser, base, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 }, locale: 'ko-KR' });
  await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  await page.clock.install();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR${extra || ''}`);
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
  await page.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'raw', null, { timeout: 5000 });
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
  const code = (await page.textContent('#roomCode')).trim();
  return { ctx, page, code, logs };
}

const stops = (page) => page.evaluate(() => window.__recLog.filter(x => x === 'stop').length);
const notes = (page, k) => page.evaluate((k) => window.rtHostMic.log().filter(l => l.indexOf(k + ' ') === 0).length, k);

(async () => {
  console.log('=== 웹 강사 — 앱 노하우 ①②⑥ ===');
  const relay = createMockRelay({ root: path.join(__dirname, '..') });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    /* ── ① 감시견 ── */
    console.log('\n[①] final 없음 15초 감시견');
    /* 11-11 13:28 ①(interim 확정)이 15초 감시견을 대체 — 옛 15초 판은 스위치를 끈 판에서 잰다. 새 판은 host_mic_commit_test.js */
    const h = await openHost(browser, base, '&interimCommit=0');
    const room = relay.rooms.get(h.code);
    await h.page.click('#btnMic');
    await h.page.waitForFunction(() => window.rtHostMic.state.live === true);
    ok(await h.page.evaluate(() => window.rtHostMic.noFinal.on === true), '스위치 기본 켬');

    // 조용한 20초 — interim 0 → 건드리지 않는다
    const s0 = await stops(h.page);
    await h.page.clock.runFor(20000);
    ok(await stops(h.page) === s0, `말 없는 20초 → stop 0 (살아 있는 인식기 안 건드림)`);
    ok(await notes(h.page, 'no_final') === 0, '기록 no_final 없음');

    // final 이 중간에 오면 시계를 처음부터 — interim 10초 + final + interim 10초 → stop 0
    await h.page.evaluate(() => window.__rec.say('첫 말', false));
    await h.page.clock.runFor(10000);
    await h.page.evaluate(() => window.__rec.say('첫 말 끝.', true));
    await h.page.evaluate(() => window.__rec.say('둘째', false));
    await h.page.clock.runFor(10000);
    ok(await stops(h.page) === s0, 'final 이 중간에 오면 시계가 처음부터 (stop 0)');
    await h.page.evaluate(() => window.__rec.say('둘째 끝.', true));

    // interim 만 20초 (5초마다 자람) → stop 1 + 줄 1
    await new Promise(r => setTimeout(r, 300));   // 앞 final 이 릴레이에 닿을 때까지
    const beforeLines = room.received.filter(m => m.broadcast).length;
    let txt = '끝맺지 않는 말';
    for (let i = 0; i < 4; i++) {
      await h.page.evaluate((t) => window.__rec.say(t, false), txt);
      await h.page.clock.runFor(5000);
      txt += ' 계속';
    }
    await h.page.clock.runFor(1000);
    ok(await stops(h.page) === s0 + 1, `interim 만 20초 → stop 1 (${await stops(h.page) - s0})`);
    ok(await notes(h.page, 'no_final') === 1, '기록 no_final 1줄: ' +
       (await h.page.evaluate(() => window.rtHostMic.log().find(l => l.indexOf('no_final') === 0))));
    await new Promise(r => setTimeout(r, 300));
    const got = room.received.filter(m => m.broadcast).slice(beforeLines);
    ok(got.length === 1, `마지막 interim 이 확정 줄로 1개 나갔다 (${got.length})`);
    ok(got[0] && /^끝맺지 않는 말/.test(got[0].text), `버리지 않는다 R-15: "${got[0] && got[0].text}"`);
    ok(await h.page.evaluate(() => window.__recLog.filter(x => x === 'start').length) >= 2, 'stop 뒤 다시 연다');
    // 다시 연 뒤에도 감시견이 다시 잰다 — 조용하면 그대로
    const s1 = await stops(h.page);
    await h.page.clock.runFor(20000);
    ok(await stops(h.page) === s1, '다시 연 뒤 조용한 20초 → stop 0');

    // 시계: interim 이 한 번 오고 그 뒤로 아무것도 안 온다(멈춘 인식기) → 지킴이가 잡는다
    await h.page.evaluate(() => window.__rec.say('한 번만 온 말', false));
    await h.page.clock.runFor(19000);
    ok(await stops(h.page) === s1 + 1, 'interim 한 번 뒤 조용 → 지킴이(3초 간격)가 15초 넘으면 끊는다');
    await new Promise(r => setTimeout(r, 300));
    ok(room.received.some(m => m.broadcast && m.text === '한 번만 온 말'), '그 interim 도 나간다');
    await h.ctx.close();

    // D-09 거울: 스위치를 끄면 붉어야 할 자리 — 꺼진 판은 끊지 않는다
    const off = await openHost(browser, base, '&nofinal=0&interimCommit=0');
    await off.page.click('#btnMic');
    await off.page.waitForFunction(() => window.rtHostMic.state.live === true);
    const so = await stops(off.page);
    for (let i = 0; i < 5; i++) { await off.page.evaluate(() => window.__rec.say('꺼진 판', false)); await off.page.clock.runFor(5000); }
    ok(await stops(off.page) === so, '되돌림 실증 ① — ?nofinal=0(옛 판) 은 interim 25초에도 끊지 않는다');
    await off.ctx.close();

    /* ── ② 원장 ── */
    console.log('\n[②] 확정 줄 원장');
    const g = await openHost(browser, base);
    const key = await g.page.evaluate(() => window.rtHostLedger && window.rtHostLedger.key());
    ok(key === 'raytok_host_ledger_' + g.code, `원장 이름 ${key}`);
    await g.page.click('#btnNext');
    await g.page.waitForFunction(() => window.rtHostLedger.read().length === 1);
    const one = await g.page.evaluate(() => window.rtHostLedger.read()[0]);
    ok(one && one.seq === 1 && one.text && one.para === 1 && Number.isFinite(one.t), `보낸 줄이 즉시 원장에 ${JSON.stringify(one)}`);
    ok(!('tr' in one) || typeof one.tr === 'object', 'tr 은 있으면 객체');
    // 49줄 원장 + 메모리 비움 → 리포트 49줄
    const n = await g.page.evaluate((k) => {
      const rows = [];
      for (let i = 1; i <= 49; i++) rows.push({ seq: i, t: 1700000000000 + i * 1000, text: '줄 ' + i, para: 1 });
      localStorage.setItem(k, JSON.stringify(rows.reverse()));   // 순서가 섞여 있어도 seq 로
      window.rtHostLedger.forgetMemory();
      return window.rtHostLedger.reportLines().length;
    }, key);
    ok(n === 49, `메모리 비우고 원장 49줄 → 리포트 ${n}줄`);
    const firstText = await g.page.evaluate(() => window.rtHostLedger.reportLines()[0].text);
    ok(firstText === '줄 1', `seq 순서 (${firstText})`);
    // 상한 3000 — 넘치면 앞부터
    const cap = await g.page.evaluate(() => {
      for (let i = 0; i < 3005; i++) window.rtHostLedger.add({ para: 1, src: 'x' + i, at: Date.now() });
      const r = window.rtHostLedger.read();
      return { len: r.length, first: r[0].text };
    });
    ok(cap.len === 3000 && cap.first !== 'x0', `상한 3000 · 앞부터 버림 (${cap.len}, 첫 줄 ${cap.first})`);
    // 서버로 안 간다 (P-14) — 원장 키를 담은 메시지 0
    const rr = relay.rooms.get(g.code);
    ok(!rr.received.some(m => JSON.stringify(m).indexOf('ledger') >= 0), '원장은 릴레이로 안 간다');
    // 방 닫기 → 지운다
    await g.page.click('#btnEnd');
    g.page.once('dialog', d => d.accept());
    await g.page.click('#btnCloseRoom');
    await g.page.waitForFunction(() => document.getElementById('endStatus').textContent.length > 0);
    ok(await g.page.evaluate((k) => localStorage.getItem(k) === null, key), '방을 닫으면 원장을 지운다');
    await g.ctx.close();

    // 되돌림 실증 ② — ?ledger=0(옛 판)은 디스크에 아무것도 안 남긴다 → 메모리를 비우면 리포트가 빈다
    const g0 = await openHost(browser, base, '&ledger=0');
    await g0.page.click('#btnNext');
    await g0.page.waitForFunction(() => document.querySelectorAll('.para-item').length >= 1);
    await new Promise(r => setTimeout(r, 300));
    const off2 = await g0.page.evaluate((code) => {
      const k = 'raytok_host_ledger_' + code;
      const had = localStorage.getItem(k);
      window.rtHostLedger.forgetMemory();
      return { had, lines: window.rtHostLedger.reportLines().length };
    }, g0.code);
    ok(off2.had === null && off2.lines === 0, `되돌림 실증 ② — 원장 끈 판은 탭이 죽으면 리포트 ${off2.lines}줄 (그래서 원장)`);
    await g0.ctx.close();

    /* ── ⑥ 소크 ── */
    console.log('\n[⑥] 소크 한 줄 (?soak=1)');
    const k0 = await openHost(browser, base);
    await k0.page.clock.runFor(300000 + 1000);
    ok(!k0.logs.some(l => /\[mic\] soak /.test(l)), '기본(꺼짐) → soak 줄 없음');
    await k0.ctx.close();
    const k1 = await openHost(browser, base, '&soak=1');
    await k1.page.click('#btnMic');
    await k1.page.clock.runFor(600000 + 1000);
    const soak = k1.logs.filter(l => /\[mic\] soak /.test(l));
    ok(soak.length === 2, `?soak=1 → 5분마다 한 줄 (10분에 ${soak.length}줄)`);
    ok(/reopens=\d+ no_final=\d+ pending=\d+ lines=\d+/.test(soak[0] || ''), `모양: ${soak[0]}`);
    await k1.ctx.close();
  } finally {
    await browser.close();
    await relay.close();
  }
  console.log(`\n=== ${passCount} PASS ===`);
})().catch(e => { console.error('[FAIL]', e && e.message || e); process.exit(1); });
