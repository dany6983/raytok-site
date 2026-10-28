/* samples/listener_buttons_test.js — 손님 페이지 단추 × 결과 (NOW 10-22 17:55 「모든 단추 누르기」 · web-open 99-1)
 * 실행: node samples/listener_buttons_test.js   (npm run test:listener-buttons)
 * 단추를 **실제로 눌러** 화면이 바뀌거나 방에 메시지가 가는 것을 잰다. 표: docs/web-buttons.md 「손님」.
 * 보낸 메시지는 가짜 강사(ws)가 **받은 것**으로 센다(페이지가 보낸 것).
 * 폰 크기 390px · 크로미움. 웹킷은 이 상자에서 내려받기가 막혀 못 돌렸다(REPORT 에 적음).
 * 마지막 단언: 처음 HTML 의 id 있는 단추가 **전부** 이 표에 있다 — 단추를 늘리면 붉어진다.
 */
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { WebSocketServer } = require('ws');
const DIR = path.join(__dirname, '../web/listener');
const MIME = { '.html': 'text/html', '.json': 'application/json' };

let n = 0;
const ok = (c, m) => { assert(c, m); n += 1; console.log('  [PASS] ' + m); };

/* 이 시험이 누르는 단추 + 따로 시험이 맡은 단추(조건부로만 보이는 것) */
const PRESSED = ['btn-join', 'btn-toggle-tts', 'btn-toggle-src', 'btn-open-voice-picker', 'btn-close-voice-picker',
  'btn-bg-audio', 'btn-font-s', 'btn-font-m', 'btn-font-l', 'btn-ask', 'btn-ask-cancel', 'btn-ask-submit',
  'btn-save', 'btn-save-close', 'btn-save-execute', 'btn-fullscreen', 'btn-save-end'];
const ELSEWHERE = {
  'btn-tr-server': 'test:listener-browser-tr (브라우저 번역 길에서만 보인다)',
  'btn-open-chrome': 'test:open-chrome (아이폰에서만 보인다)'
};

function checkAllListed(html) {
  const ids = [...html.matchAll(/<button[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  return ids.filter((id) => !PRESSED.includes(id) && !(id in ELSEWHERE));
}

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIR, p);
  if (!f.startsWith(DIR) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

(async () => {
  console.log('=== 손님 페이지 단추 × 결과 (390px · 크로미움) ===');
  const { chromium } = require('playwright');
  await new Promise((r) => srv.listen(0, r));
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.on('listening', r));
  const got = [];
  let sock = null;
  wss.on('connection', (s) => {
    sock = s;
    s.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (_) { return; }
      got.push(m);
      if (m.hello) {
        s.send(JSON.stringify({ welcome: 1, src_lang: 'ko', q: 1 }));
        for (let i = 1; i <= 3; i++) s.send(JSON.stringify({ seq: i, text: `원문 문장 ${i}`, spk: 'meeting', tr: { en: `line ${i}` } }));
      }
    });
  });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true, locale: 'en-US' });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en-a', voiceURI: 'en-a' }, { lang: 'en-GB', name: 'en-b', voiceURI: 'en-b' }];
      window.speechSynthesis.speak = function () {};
      window.speechSynthesis.cancel = function () {};
    }
  });
  const port = srv.address().port, wsPort = wss.address().port;
  await p.goto(`http://localhost:${port}/?ws=${wsPort}&lang=en`, { waitUntil: 'load' });
  const vis = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
  const txt = (sel) => p.$eval(sel, (e) => e.textContent.trim());

  // btn-join
  await p.fill('#room-input', '123456');
  await p.click('#btn-join');
  await p.waitForSelector('#msg-3', { timeout: 10000 });
  ok(got.some((m) => m.hello), 'btn-join (참여) → 방에 hello');
  ok(await vis('#chat-screen') && !(await vis('#join-screen')), 'btn-join → 듣기 화면으로');

  // btn-toggle-tts
  const t0 = await txt('#btn-toggle-tts');
  await p.click('#btn-toggle-tts');
  const t1 = await txt('#btn-toggle-tts');
  ok(t0 !== t1, `btn-toggle-tts (소리) → 글자 바뀜 (${t0} → ${t1})`);

  // btn-toggle-src (서버 번역 길에서만 보임)
  if (await vis('#btn-toggle-src')) {
    const a0 = await p.getAttribute('#btn-toggle-src', 'aria-pressed');
    await p.click('#btn-toggle-src');
    const a1 = await p.getAttribute('#btn-toggle-src', 'aria-pressed');
    ok(a0 !== a1, `btn-toggle-src (원문 보기) → aria-pressed ${a0} → ${a1}`);
  } else {
    ok(true, 'btn-toggle-src — 이 길(브라우저 번역)에서는 안 보임 (listener-state 시험이 맡음)');
  }

  // 목소리
  await p.click('#btn-open-voice-picker');
  ok(await vis('#voice-picker-modal'), 'btn-open-voice-picker (목소리) → 목소리 창 열림');
  await p.click('#btn-close-voice-picker');
  ok(!(await vis('#voice-picker-modal')), 'btn-close-voice-picker (✕) → 닫힘');

  // 화면 꺼도 듣기
  const bg0 = await p.$eval('#btn-bg-audio', (e) => e.classList.contains('active'));
  await p.click('#btn-bg-audio');
  const bg1 = await p.$eval('#btn-bg-audio', (e) => e.classList.contains('active'));
  ok(bg0 !== bg1, `btn-bg-audio (화면 꺼도 듣기) → 켬/끔 바뀜 (${bg0} → ${bg1})`);

  // 글자 크기
  const fontPx = () => p.$eval('#msg-3 .msg-bubble', (e) => parseFloat(getComputedStyle(e).fontSize));
  await p.click('#btn-font-s'); const fs_ = await fontPx();
  await p.click('#btn-font-m'); const fm = await fontPx();
  await p.click('#btn-font-l'); const fl = await fontPx();
  ok(fs_ < fm && fm < fl, `btn-font-s/m/l (작게·보통·크게) → 글자 ${fs_} < ${fm} < ${fl}px`);
  await p.click('#btn-font-m');

  // 질문
  ok(await vis('#btn-ask'), 'btn-ask 는 질문 받는 방(q:1)에서 보인다');
  await p.click('#btn-ask');
  ok(await vis('#ask-modal'), 'btn-ask (✋ 질문) → 질문 창 열림');
  await p.click('#btn-ask-cancel');
  ok(!(await vis('#ask-modal')), 'btn-ask-cancel (취소) → 닫힘');
  await p.click('#btn-ask');
  await p.fill('#ask-input-text', '질문 하나');
  const before = got.length;
  await p.click('#btn-ask-submit');
  await p.waitForTimeout(300);
  const ask = got.slice(before).find((m) => m.kind === 'ask');
  ok(!!ask && ask.text === '질문 하나' && ask.lang === 'en', 'btn-ask-submit (손들기 전송) → 방에 kind:ask(원문·언어)');
  ok(!(await vis('#ask-modal')) && (await txt('#btn-ask')) !== '✋ Ask', `btn-ask-submit → 창 닫힘 · 단추 「대기」 (${await txt('#btn-ask')})`);

  // 기록 저장
  await p.click('#btn-save');
  ok(await vis('#save-picker-modal'), 'btn-save (⬇ TXT) → 저장 창 열림');
  await p.click('#btn-save-close');
  ok(!(await vis('#save-picker-modal')), 'btn-save-close (닫기) → 닫힘');
  await p.click('#btn-save');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#btn-save-execute')]);
  ok(/\.txt$/.test(dl.suggestedFilename()), `btn-save-execute (저장) → 파일 받기 1 (${dl.suggestedFilename()})`);

  // 큰 화면(전체 화면)
  await p.click('#btn-fullscreen', { force: true }).catch(() => {});
  const fsLog = await p.evaluate(() => window.rtFullscreen && window.rtFullscreen.log());
  ok(Array.isArray(fsLog) && (fsLog.includes('fullscreen go=1') || fsLog.includes('fullscreen can=0')),
     `btn-fullscreen (⛶) → 전체 화면 요청 기록 (${fsLog && fsLog.slice(-1)})`);

  // 끝 → 기록 받기
  sock.send(JSON.stringify({ end: 1, summary: { lines: 3, minutes: 1 } }));
  await p.waitForTimeout(500);
  ok(await vis('#end-modal'), '방이 끝나면 끝 창');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#btn-save-end')]);
  ok(!!dl2.suggestedFilename(), `btn-save-end (내 기록 받기) → 파일 받기 1 (${dl2.suggestedFilename()})`);

  // 모든 단추가 표에 있다
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const missing = checkAllListed(html);
  ok(missing.length === 0, `처음 HTML 의 id 있는 단추 전부가 이 표에 있다 (빠짐: ${missing.join(', ') || '없음'})`);
  /* 되돌림 실증 — 단추 하나를 HTML 에 더하면 위 단언이 붉어야 한다 */
  const revertFailed = checkAllListed(html.replace('<button class="tool-btn" id="btn-save"', '<button id="btn-new-x"></button><button class="tool-btn" id="btn-save"')).length > 0;
  ok(revertFailed === true, '표에 없는 단추를 더하면 붉어진다 (되돌림 실증)');

  await b.close(); wss.close(); srv.close();
  console.log(`\n전부 통과 (${n}건)`);
})().catch((e) => { console.error('\n[FAIL]', e && e.message || e); process.exit(1); });
