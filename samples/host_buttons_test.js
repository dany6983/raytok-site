/* samples/host_buttons_test.js — 강사 페이지(web/host) 단추를 **하나씩 눌러** 결과를 단언한다 (NOW 99-1, MISTAKES #11)
 * 실행: node samples/host_buttons_test.js   (npm run test:host-buttons)
 *
 * 단추마다 ① 보낸 전선 메시지(kind) ② 화면 변화 를 본다. 결과 표는 docs/web-buttons.md —
 * 이 시험의 BUTTONS 표와 같은 순서다(단추를 늘리면 둘 다).
 * 보낸 메시지는 페이지의 WebSocket.send 를 감싸 센다 — 가짜 릴레이가 무엇을 적든 **페이지가 실제로 보낸 것**.
 * 손님은 ws 손님 하나를 진짜 길(/ws?role=listener)로 붙여 질문을 넣는다(가짜가 실제와 같아야 한다, D-11).
 */
const path = require('path');
const assert = require('assert');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

console.log('=== 강사 단추 × 결과 (web/host) ===');
let passCount = 0;
const rows = [];   // [단추, 보낸 것, 화면] — 끝에 표로 찍는다
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const FAKE = `
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
const PARAS = ['첫 문단입니다.', '두 번째 문단입니다.', '세 번째 문단입니다.', '네 번째 문단입니다.'];

(async () => {
  const relay = createMockRelay({ root: path.join(__dirname, '..') });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  let guest = null;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR', acceptDownloads: true });
    await ctx.addInitScript(FAKE);
    const page = await ctx.newPage();
    page.on('pageerror', err => console.log('PAGE ERROR:', err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    const sentSince = async (n) => (await page.evaluate(() => window.__sent)).slice(n);
    const mark = () => page.evaluate(() => window.__sent.length);
    const kinds = (arr) => arr.map(m => m.kind || (m.end ? 'end' : m.welcome ? 'welcome' : '?'));
    const txt = async (sel) => (await page.textContent(sel)).trim();
    const loadParas = () => page.evaluate((paras) => {
      const dt = new DataTransfer();
      dt.items.add(new File([paras.join('\n\n')], 'g.txt', { type: 'text/plain' }));
      const input = document.getElementById('fileInput');
      input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, PARAS);
    const paraCount = () => page.evaluate(() => document.querySelectorAll('.para-item').length);

    await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);

    /* ── 준비 화면 ── */
    console.log('\n[준비]');
    await page.fill('#tokenInput', 'valid_instructor_token');
    await page.click('#btnVerifyToken');
    await page.waitForSelector('#step-prepare', { state: 'visible' });
    ok(true, 'btnVerifyToken → 준비 화면(#step-prepare) 보임');
    rows.push(['btnVerifyToken (이용권 확인)', '— (HTTP /license/verify)', '#step-prepare 보임']);

    await loadParas();
    await page.waitForFunction((n) => document.querySelectorAll('.para-item').length === n, PARAS.length);
    await page.click('#btnResetParas');
    await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 0, null, { timeout: 3000 });
    ok(dialogs.length === 1 && (await paraCount()) === 0, `btnResetParas → 확인창 1번 뒤 문단 0개 (확인창: "${dialogs[0]}")`);
    rows.push(['btnResetParas (원고 지우기)', '—', '확인창 → 문단 0']);

    await loadParas();
    await page.waitForFunction((n) => document.querySelectorAll('.para-item').length === n, PARAS.length);
    ok(!(await page.isDisabled('#btnPreTranslate')), 'btnPreTranslate 는 원고가 있으면 켜진다');
    await page.click('#btnPreTranslate');
    await page.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'done', null, { timeout: 20000 });
    ok(true, 'btnPreTranslate → rtHostReady.mode() = done');
    rows.push(['btnPreTranslate (미리 번역)', '— (HTTP /translate)', 'mode=done']);

    await page.click('#btnStartLecture');
    await page.waitForSelector('#step-live', { state: 'visible' });
    await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
    await page.waitForFunction(() => window.__sent.some(m => m.welcome), null, { timeout: 4000 });
    const k0 = kinds(await sentSince(0));
    ok(k0.indexOf('welcome') >= 0, `btnStartLecture → 진행 화면 · 연결됨 · welcome 보냄 (${k0.join(',')})`);
    rows.push(['btnStartLecture (강의 시작)', 'welcome' + (k0.indexOf('script_src') >= 0 ? ' · script_src' : ''), '#step-live · 「연결됨」']);
    const code = (await txt('#roomCode'));

    /* ── 진행 화면 ── */
    console.log('\n[진행]');
    const progress = () => txt('#liveProgress');
    let n = await mark();
    await page.click('#btnNext');
    let s = await sentSince(n);
    ok(s.some(m => m.kind === 'script' && m.para === 1) && (await progress()) === `1 / ${PARAS.length}`, `btnNext → script para=1 · 1 / ${PARAS.length}`);
    rows.push(['btnNext (다음 ▶)', 'script para=다음', '진행 n+1 / 전체']);

    n = await mark(); await page.click('#btnNext');
    ok((await sentSince(n)).some(m => m.kind === 'script' && m.para === 2), 'btnNext 한 번 더 → script para=2');
    n = await mark(); await page.click('#btnPrev');
    s = await sentSince(n);
    ok(s.some(m => m.kind === 'script' && m.para === 1) && (await progress()).startsWith('1 /'), 'btnPrev → script para=1 · 진행 1');
    rows.push(['btnPrev (◀ 이전)', 'script para=앞', '진행 n−1 (첫 문단에선 꺼짐)']);
    ok(await page.isDisabled('#btnPrev'), '첫 문단에서는 btnPrev 꺼짐');

    n = await mark(); await page.click('#btnSkip');
    s = await sentSince(n);
    ok(s.some(m => m.kind === 'skip' && m.para === 2) && !s.some(m => m.kind === 'script'), 'btnSkip → skip para=2 (script 는 안 보냄)');
    ok(await page.evaluate(() => document.getElementById('live-para-2').classList.contains('is-skipped')), 'btnSkip → 그 문단에 is-skipped');
    rows.push(['btnSkip (건너뛰기)', 'skip para=다음 (script 없음)', '문단 is-skipped']);

    n = await mark(); await page.click('#btnBreak');
    s = await sentSince(n);
    ok(kinds(s).join(',') === 'break,pause' && s[0].on === true, `btnBreak → break on=true · pause (${kinds(s).join(',')})`);
    ok((await page.evaluate(() => document.getElementById('btnBreak').classList.contains('on'))), 'btnBreak → 단추 on');
    n = await mark(); await page.click('#btnBreak');
    s = await sentSince(n);
    ok(kinds(s).join(',') === 'break,resume' && s[0].on === false, `btnBreak 다시 → break on=false · resume (${kinds(s).join(',')})`);
    /* 되돌림 실증 ① — 단추가 안 먹으면(손잡이가 빠진 단추 = MISTAKES #11) 위 단언이 붉어지는가.
       cloneNode 는 손잡이를 버린다. 확인 뒤 원래 단추를 제자리에 돌려 둔다. */
    let revertBreakFailed = false;
    const orig = await page.evaluateHandle(() => { const b = document.getElementById('btnBreak'); const c = b.cloneNode(true); b.replaceWith(c); return b; });
    try {
      const n2 = await mark(); await page.click('#btnBreak'); await page.waitForTimeout(200);
      const s2 = await sentSince(n2);
      assert(kinds(s2).join(',') === 'break,pause');
      revertBreakFailed = true;
    } catch (_) {}
    await page.evaluate((b) => document.getElementById('btnBreak').replaceWith(b), orig);
    ok(!revertBreakFailed, '되돌림 실증 ①: 손잡이 없는 btnBreak 로는 break 가 안 나가 단언이 붉다');
    rows.push(['btnBreak (쉬는 시간)', '켬: break on · pause / 끔: break off · resume', '쉬는 띠·단추 on 토글']);

    const playTxt0 = await txt('#btnPlay');
    n = await mark(); await page.click('#btnPlay');
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === true && (await txt('#btnPlay')) !== playTxt0, `btnPlay → 재생 켬 · 글자 「${await txt('#btnPlay')}」`);
    await page.click('#btnPlay');
    s = await sentSince(n);
    ok(await page.evaluate(() => window.rtHostPlay.state.on) === false && (await txt('#btnPlay')) === playTxt0 && s.some(m => m.kind === 'pause'),
       `btnPlay 다시 → 재생 끔 · 「${playTxt0}」 · pause 보냄`);
    rows.push(['btnPlay (▶ 재생 / ■ 멈춤)', '켬: (문단 넘길 때 script) / 끔: pause', '글자 ▶ 재생 ↔ ■ 멈춤']);

    const micTxt0 = await txt('#btnMic');
    await page.click('#btnMic');
    await page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 4000 });
    ok(await page.evaluate(() => document.getElementById('btnMic').classList.contains('on')) && (await txt('#btnMic')) !== micTxt0, `btnMic → 인식 켬 · 단추 on 「${await txt('#btnMic')}」`);
    await page.click('#btnMic');
    ok(await page.evaluate(() => !window.__rec.running && !document.getElementById('btnMic').classList.contains('on')), 'btnMic 다시 → 인식 끔 · 단추 off');
    rows.push(['btnMic (🎤 말하기)', '— (말한 줄이 확정되면 그때 보냄)', '인식 켬/끔 · 단추 on 토글 (국내만)']);

    const qrBtn0 = await txt('#btnToggleLicQr');
    await page.click('#btnToggleLicQr');
    ok(await page.evaluate(() => document.getElementById('hostLicQrBox').style.display === 'flex') && (await txt('#btnToggleLicQr')) !== qrBtn0, 'btnToggleLicQr → 이용권 QR 보임 · 글자 바뀜');
    ok(!(await page.isVisible('#btnLicPrev')) && !(await page.isVisible('#btnLicNext')), '이용권 코드가 하나면 ◀ ▶ 는 안 보인다');
    await page.click('#btnToggleLicQr');
    ok(await page.evaluate(() => document.getElementById('hostLicQrBox').style.display === 'none') && (await txt('#btnToggleLicQr')) === qrBtn0, 'btnToggleLicQr 다시 → 숨김 · 글자 원래대로');
    rows.push(['btnToggleLicQr (이용권 QR)', '—', 'QR 칸 보임/숨김']);
    rows.push(['btnLicPrev · btnLicNext (◀ ▶)', '—', '코드 2개 이상일 때만 보임 — 이번 시험은 1개: 안 보임 단언']);

    /* 질문 — 손님 하나를 진짜 길로 붙여 질문을 넣는다 */
    guest = new WebSocket(`ws://localhost:${port}/ws?room=${encodeURIComponent(code)}&role=listener`);
    await new Promise((res, rej) => { guest.on('open', res); guest.on('error', rej); });
    guest.send(JSON.stringify({ hello: 1, lang: 'en' }));
    guest.send(JSON.stringify({ kind: 'ask', id: 'q_a', name: 'Ann', lang: 'en', text: 'first question' }));
    guest.send(JSON.stringify({ kind: 'ask', id: 'q_b', name: 'Bob', lang: 'en', text: 'second question' }));
    await page.waitForFunction(() => document.querySelectorAll('#askQueueList button').length === 4, null, { timeout: 5000 });
    const qBtns = await page.$$eval('#askQueueList button', bs => bs.map(b => b.textContent.trim()));
    ok(qBtns.length === 4 && qBtns[0] === qBtns[2] && qBtns[1] === qBtns[3], `대기줄 항목마다 단추 둘 [${qBtns.slice(0, 2).join('] [')}]`);

    n = await mark();
    await page.click('#askQueueList > div:nth-child(1) button:nth-child(1)');
    s = await sentSince(n);
    ok(s.some(m => m.kind === 'grant' && m.id === 'q_a'), `[선택] → grant id=q_a (${kinds(s).join(',')})`);
    rows.push(['[선택] (대기줄)', 'grant id · (앞사람 있으면 revoke 먼저 · 재생 중 아니면 pause)', '지명 칸']);

    await page.waitForFunction(() => [...document.querySelectorAll('#askQueueList button')].length >= 2, null, { timeout: 3000 });
    n = await mark();
    await page.click('#askQueueList > div:last-child button:nth-child(2)');
    s = await sentSince(n);
    ok(s.some(m => m.kind === 'revoke' && m.id === 'q_b' && m.reason === 'dismissed'), `[무시] → revoke id=q_b reason=dismissed (${kinds(s).join(',')})`);
    await page.waitForFunction(() => !/second question/.test(document.getElementById('askQueueList').textContent), null, { timeout: 3000 });
    ok(true, '[무시] → 그 질문이 대기줄에서 빠진다');
    rows.push(['[무시] (대기줄)', 'revoke id reason=dismissed', '대기줄에서 빠짐']);
    const anyAnswer = (await sentSince(0)).some(m => m.kind === 'answer');
    ok(!anyAnswer, 'answer 를 보낸 단추 0 (장부 60)');

    const speakVis = await page.isVisible('#btnAskSpeak');
    if (speakVis) {
      const sp0 = await txt('#btnAskSpeak');
      await page.click('#btnAskSpeak');
      ok((await txt('#btnAskSpeak')) !== sp0 && await page.evaluate(() => localStorage.getItem('raytok_ask_speak') === '0'), `btnAskSpeak → 「${await txt('#btnAskSpeak')}」 · 저장 0`);
      await page.click('#btnAskSpeak');
      ok((await txt('#btnAskSpeak')) === sp0 && await page.evaluate(() => localStorage.getItem('raytok_ask_speak') === '1'), 'btnAskSpeak 다시 → 원래 글자 · 저장 1');
    } else {
      const r = await page.evaluate(() => { const b = document.getElementById('btnAskSpeak'); const t0 = b.textContent; b.click(); const t1 = b.textContent; const st = localStorage.getItem('raytok_ask_speak'); b.click(); return { t0, t1, st, back: b.textContent === t0 }; });
      ok(r.st === '0' && r.back, `btnAskSpeak(지명 칸 안 — 지금 숨김) 누르면 저장 0 · 다시 누르면 원래 (${r.t0.trim()} → ${r.t1.trim()})`);
    }
    rows.push(['btnAskSpeak (질문 소리)', '—', '글자 토글 · localStorage raytok_ask_speak 0/1']);

    /* ── 끝 화면 ── */
    console.log('\n[끝]');
    n = await mark(); await page.click('#btnEnd');
    await page.waitForSelector('#step-end', { state: 'visible' });
    s = await sentSince(n);
    ok(!(await page.isVisible('#step-live')) && !s.some(m => m.end), `btnEnd → 끝 화면 · 방은 아직 안 닫음(end 안 보냄) (${kinds(s).join(',') || '없음'})`);
    rows.push(['btnEnd (강의 끝)', '— (end 는 방 닫기 때)', '#step-end 보임 · 재생 끔']);

    await page.click('#btnBackLive');
    await page.waitForSelector('#step-live', { state: 'visible' });
    ok(!(await page.isVisible('#step-end')), 'btnBackLive → 진행 화면으로');
    rows.push(['btnBackLive (돌아가기)', '—', '#step-live 다시']);
    await page.click('#btnEnd');
    await page.waitForSelector('#step-end', { state: 'visible' });

    ok(!(await page.isDisabled('#btnReport')), 'btnReport 는 보낸 문단이 있으면 켜진다');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#btnReport')]);
    ok(!!dl.suggestedFilename(), `btnReport → 파일 받기 (${dl.suggestedFilename()})`);
    rows.push(['btnReport (리포트 저장)', '—', '파일 받기 1']);

    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#btnCsv')]);
    ok(/\.csv$/.test(dl2.suggestedFilename()), `btnCsv → 명단 csv 받기 (${dl2.suggestedFilename()})`);
    rows.push(['btnCsv (명단 csv)', '—', 'csv 받기 1 (닫은 뒤엔 꺼짐)']);

    const d0 = dialogs.length;
    n = await mark(); await page.click('#btnCloseRoom');
    await page.waitForFunction(() => document.getElementById('btnCloseRoom').disabled, null, { timeout: 3000 });
    s = await sentSince(n);
    ok(dialogs.length === d0 + 1 && s.some(m => m.end === 1 && m.summary), `btnCloseRoom → 확인창 · end:1 + summary 보냄`);
    ok(await page.isDisabled('#btnCsv') && !(await page.isVisible('#btnBackLive')), '닫은 뒤 btnCsv 꺼짐 · btnBackLive 숨김');
    rows.push(['btnCloseRoom (방 닫기)', 'end:1 · summary(숫자만)', '확인창 → 닫힘 · csv 꺼짐 · 돌아가기 숨김']);

    /* 단추를 빠뜨리지 않았나 — 페이지의 id 단추 전부가 표에 있어야 한다 */
    const ids = await page.$$eval('button[id]', bs => bs.map(b => b.id));
    const table = rows.map(r => r[0]).join(' ');
    const missing = ids.filter(id => table.indexOf(id) < 0);
    ok(missing.length === 0, `id 있는 단추 ${ids.length}개 전부 표에 있다${missing.length ? ' — 빠짐: ' + missing.join(',') : ''}`);

    /* 되돌림 실증 ② — 표에 없는 단추가 생기면 위 단언이 잡는가 */
    let revertTableFailed = false;
    try {
      await page.evaluate(() => { const b = document.createElement('button'); b.id = 'btnNotInTable'; document.body.appendChild(b); });
      const ids2 = await page.$$eval('button[id]', bs => bs.map(b => b.id));
      assert(ids2.filter(id => table.indexOf(id) < 0).length === 0);
      revertTableFailed = true;
    } catch (_) {}
    ok(!revertTableFailed, '되돌림 실증 ②: 표에 없는 단추(btnNotInTable)를 넣으면 「전부 표에 있다」가 붉다');

    await ctx.close();
    console.log('\n| 단추 | 보낸 메시지 | 화면 |\n|---|---|---|\n' + rows.map(r => `| ${r.join(' | ')} |`).join('\n'));
    console.log(`\n[PASS] 강사 단추 × 결과 ${passCount}개 통과`);
  } catch (e) {
    console.error('[FAIL]', e.message);
    process.exitCode = 1;
  } finally {
    try { guest && guest.close(); } catch (_) {}
    await browser.close();
    await relay.close();
  }
})();
