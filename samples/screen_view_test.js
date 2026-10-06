// 청취 페이지 큰 화면 보기(?view=screen) 시험 — 실제 브라우저로 띄워 화면에 보이는 것을 단언한다.
// 실행(저장소 루트, playwright·ws 필요):  node samples/screen_view_test.js
//   CHROME=<크롬 경로> 를 주면 그 브라우저를 쓴다 (tools/i18n_check.js 와 같은 방식).
// 보는 것: ① 최근 4줄만 ② 원문·번역 두 칸 나란히(세로 화면은 한 칸) ③ 머리줄·줄 번호·꼬리표 숨김
//          ④ 도구 막대는 숨었다가 조작하면 잠깐 보임 ⑤ 소리는 끔으로 시작 ⑥ RTL 방향 유지
//          ⑦ 보통 보기(view 없음)는 그대로 ⑧ 바깥으로 나가는 요청 0건 ⑨ pending 은 글자로만(음성 0회)
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { WebSocketServer } = require('ws');
const DIR = path.join(__dirname, '../web/listener');
const MIME = { '.html': 'text/html', '.json': 'application/json' };
const LINES = 7, SHOWN = 4;

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(DIR, p);
  if (!f.startsWith(DIR) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

function mockHost(wss) {
  wss.on('connection', (sock) => {
    sock.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (!m.hello) return;
      sock.send(JSON.stringify({ welcome: 1, src_lang: 'ko' }));
      for (let i = 1; i <= LINES; i++) {
        sock.send(JSON.stringify({ seq: i, text: `원문 문장 ${i} 입니다`, spk: 'meeting', tr: { en: `translated line ${i}`, ar: `translated line ${i}` } }));
      }
      sock.send(JSON.stringify({ pending: true, text: '말하는 중' }));   // seq 없는 중간 결과
    });
  });
}

(async () => {
  const { chromium } = require('playwright');
  await new Promise(ok => srv.listen(0, ok));
  const port = srv.address().port;
  const wss = new WebSocketServer({ port: 0 });
  await new Promise(ok => wss.on('listening', ok));
  const wsPort = wss.address().port;
  mockHost(wss);   // 두 언어를 다 실어 보낸다(받는 쪽이 자기 언어만 쓴다)

  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const base = `http://localhost:${port}/?room=123456&auto=1&ws=${wsPort}`;

  async function open(extra, viewport) {
    const ctx = await b.newContext({ viewport });
    const p = await ctx.newPage();
    const outside = [];
    p.on('request', (rq) => { const u = new URL(rq.url()); if (u.hostname !== 'localhost') outside.push(rq.url()); });
    await p.addInitScript(() => {
      window.__spoken = 0;
      // 머리 없는 브라우저엔 음성이 없어 페이지가 아예 읽지 않는다 → 가짜 음성 둘을 준다(읽기 횟수를 세려고)
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      if (window.speechSynthesis) {
        window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en' }, { lang: 'ar-SA', name: 'ar' }];
        window.speechSynthesis.speak = function (u) { if (u && u.text) window.__spoken++; };
        window.speechSynthesis.cancel = function () {};
      }
    });
    await p.goto(base + extra, { waitUntil: 'load' });
    await p.waitForSelector('#msg-pending', { timeout: 10000 });
    await p.waitForTimeout(300);
    return { p, ctx, outside };
  }
  const state = (p) => p.evaluate(() => {
    const cs = (el) => getComputedStyle(el);
    const lines = [...document.querySelectorAll('#chat-list > .msg-line')];
    const shown = lines.filter(l => cs(l).display !== 'none');
    const lastReal = document.getElementById('msg-7');
    const bubble = lastReal.querySelector('.msg-bubble');
    const bar = document.querySelector('.tool-bar').getBoundingClientRect();
    return {
      cls: document.documentElement.className,
      total: lines.length, shown: shown.length, shownIds: shown.map(l => l.id),
      cols: cs(bubble).gridTemplateColumns.split(' ').length, display: cs(bubble).display,
      font: parseFloat(cs(bubble).fontSize),
      header: cs(document.querySelector('.header')).display,
      srcRow: cs(lastReal.querySelector('.msg-src')).display,
      badge: (() => { const x = document.querySelector('#msg-pending .badge'); return x ? cs(x).display : 'none'; })(),
      barTop: bar.top, vh: innerHeight,
      trDir: lastReal.querySelector('.msg-tr').getAttribute('dir'), trText: lastReal.querySelector('.msg-tr').innerText.trim(),  // 보이는 글자만(숨긴 꼬리표 제외)
      textX: lastReal.querySelector('.msg-text').getBoundingClientRect().left, trX: lastReal.querySelector('.msg-tr').getBoundingClientRect().left,
      textY: lastReal.querySelector('.msg-text').getBoundingClientRect().top, trY: lastReal.querySelector('.msg-tr').getBoundingClientRect().top,
      ttsActive: document.getElementById('btn-toggle-tts').classList.contains('active'),
      spoken: window.__spoken, overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });

  // ── 1. 큰 화면, 가로 1920×1080 ──
  let { p, ctx, outside } = await open('&view=screen&lang=en', { width: 1920, height: 1080 });
  let s = await state(p);
  console.log('[screen 1920x1080]', JSON.stringify({ shown: s.shown, total: s.total, cols: s.cols, font: s.font, header: s.header, srcRow: s.srcRow, barTop: s.barTop, spoken: s.spoken }));
  assert(/\bview-screen\b/.test(s.cls) && /\bin-chat\b/.test(s.cls), 'view-screen·in-chat 표시');
  assert.strictEqual(s.total, LINES + 1, '줄은 다 받는다(확정 7 + 임시 1)');
  assert.strictEqual(s.shown, SHOWN, `보이는 줄은 최근 ${SHOWN}줄`);
  assert.deepStrictEqual(s.shownIds, ['msg-5', 'msg-6', 'msg-7', 'msg-pending'], '가장 최근 줄들이 보인다');
  assert.strictEqual(s.display, 'grid'); assert.strictEqual(s.cols, 2, '원문·번역 두 칸');
  assert(Math.abs(s.textY - s.trY) < 2 && s.trX > s.textX + 200, '두 칸이 같은 높이에 나란히');
  assert(s.font >= 40, `글씨가 크다(${s.font}px)`);
  assert.strictEqual(s.header, 'none', '머리줄 숨김'); assert.strictEqual(s.srcRow, 'none', '줄 번호 줄 숨김'); assert.strictEqual(s.badge, 'none', '꼬리표 숨김');
  assert(s.barTop >= s.vh - 1, '도구 막대는 화면 밖');
  assert.strictEqual(s.trText, 'translated line 7');
  assert.strictEqual(s.ttsActive, true, '소리 끔으로 시작'); assert.strictEqual(s.spoken, 0, '음성 0회(끔 + pending 은 글자로만)');
  assert.strictEqual(s.overflowX, false, '가로 넘침 없음');
  assert.deepStrictEqual(outside, [], '바깥으로 나가는 요청 0건');
  await p.mouse.move(300, 300); await p.waitForTimeout(400);
  s = await state(p);
  assert(s.barTop < s.vh - 20, '조작하면 도구 막대가 보인다');
  console.log('  [PASS] 최근 4줄 · 두 칸 · 큰 글씨 · 머리줄/꼬리표 숨김 · 도구 막대 숨김→보임 · 음성 0 · 외부 요청 0');
  await ctx.close();

  // ── 2. 큰 화면, 세로 1080×1920 → 한 칸 ──
  ({ p, ctx } = await open('&view=screen&lang=en', { width: 1080, height: 1920 }));
  s = await state(p);
  assert.strictEqual(s.cols, 1, '세로 화면은 한 칸'); assert(s.trY > s.textY, '번역이 원문 아래');
  assert.strictEqual(s.shown, SHOWN); assert.strictEqual(s.overflowX, false);
  console.log('  [PASS] 세로 화면: 한 칸, 위아래');
  await ctx.close();

  // ── 3. 큰 화면, RTL(ar) ──
  ({ p, ctx } = await open('&view=screen&lang=ar', { width: 1920, height: 1080 }));
  s = await state(p);
  assert.strictEqual(s.trDir, 'rtl', '번역 칸 방향 rtl 유지'); assert.strictEqual(s.trText, 'translated line 7'); assert.strictEqual(s.cols, 2);
  assert(s.trX < s.textX, 'rtl 에서는 칸 순서가 뒤집힌다(번역이 왼쪽)');
  console.log('  [PASS] RTL: 번역 칸 dir=rtl, 칸 순서 뒤집힘');
  await ctx.close();

  // ── 4. 보통 보기는 그대로 ──
  ({ p, ctx } = await open('&lang=en', { width: 390, height: 844 }));
  s = await state(p);
  console.log('[normal 390x844]', JSON.stringify({ shown: s.shown, total: s.total, display: s.display, font: s.font, header: s.header, srcRow: s.srcRow, spoken: s.spoken }));
  assert(!/\bview-screen\b/.test(s.cls), '보통 보기엔 view-screen 없음');
  assert.strictEqual(s.shown, LINES + 1, '보통 보기는 전 줄'); assert.strictEqual(s.display, 'block'); assert.strictEqual(s.font, 15);
  assert.notStrictEqual(s.header, 'none'); assert.notStrictEqual(s.srcRow, 'none');
  assert.strictEqual(s.ttsActive, false, '소리 켬으로 시작');
  assert.strictEqual(s.spoken, LINES, '확정 줄만 읽는다(7회) — pending 은 읽지 않는다');
  console.log('  [PASS] 보통 보기: 전 줄 · 15px · 머리줄 보임 · 확정 줄만 음성(pending 0)');
  await ctx.close();

  // ── 5. 보통 보기, 줄이 많을 때: 새 줄이 화면 안에 있고 도구 막대가 제자리 ──
  //   (v1.1.0 까지는 문서 전체가 길어져 최신 줄이 화면 아래로 밀렸다 — 30줄에서 y=3130)
  const many = new WebSocketServer({ port: 0 });
  await new Promise(ok => many.on('listening', ok));
  many.on('connection', (sock) => sock.on('message', (raw) => {
    if (!JSON.parse(raw).hello) return;
    sock.send(JSON.stringify({ welcome: 1, src_lang: 'ko' }));
    for (let i = 1; i <= 30; i++) sock.send(JSON.stringify({ seq: i, text: `원문 문장 ${i} 입니다`, spk: 'meeting', tr: { en: `translated line ${i}` } }));
  }));
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    ctx = await b.newContext({ viewport: vp }); p = await ctx.newPage();
    await p.goto(`http://localhost:${port}/?room=123456&auto=1&ws=${many.address().port}&lang=en`, { waitUntil: 'load' });
    await p.waitForSelector('#msg-30', { timeout: 10000 }); await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const last = document.getElementById('msg-30').getBoundingClientRect(), bar = document.querySelector('.tool-bar').getBoundingClientRect();
      const list = document.getElementById('chat-list');
      return { docH: document.documentElement.scrollHeight, vh: innerHeight, lastTop: Math.round(last.top), lastBottom: Math.round(last.bottom),
               barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom), listScrolls: list.scrollHeight > list.clientHeight,
               atBottom: Math.abs(list.scrollHeight - list.clientHeight - list.scrollTop) < 2 };
    });
    console.log(`[normal ${vp.width}x${vp.height} · 30줄]`, JSON.stringify(m));
    assert(m.docH <= m.vh + 1, '문서가 화면보다 길어지지 않는다');
    assert(m.listScrolls && m.atBottom, '목록이 안에서 구르고 맨 아래에 있다');
    assert(m.lastTop >= 0 && m.lastBottom <= m.barTop + 1, '최신 줄이 화면 안, 도구 막대 위');
    assert(m.barBottom <= m.vh + 1 && m.barTop < m.vh, '도구 막대가 화면 안');
    await ctx.close();
  }
  many.close();
  console.log('  [PASS] 보통 보기 30줄: 최신 줄 보임 · 목록만 구름 · 도구 막대 제자리 (390×844, 360×640)');

  await b.close(); wss.close(); srv.close();
  console.log('[PASS] 큰 화면 보기 시험 전부 통과');
})().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
