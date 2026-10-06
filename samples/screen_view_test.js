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

  // ── 6. 큰 화면: 방금 확정된 줄이 가장 밝다 (말하는 중인 임시 줄이 아니라) ──
  ({ p, ctx } = await open('&view=screen&lang=en', { width: 1920, height: 1080 }));
  let op = await p.evaluate(() => {
    const o = (id) => parseFloat(getComputedStyle(document.getElementById(id)).opacity);
    return { latest: o('msg-7'), older: o('msg-6'), pending: o('msg-pending'), n: document.querySelectorAll('.msg-line.is-latest').length };
  });
  console.log('[screen 밝기]', JSON.stringify(op));
  assert.strictEqual(op.latest, 1, '방금 확정된 줄은 또렷하다');
  assert(op.older < 1 && op.pending < 1, '앞 줄과 임시 줄은 흐리다');
  assert.strictEqual(op.n, 1, '가장 밝은 줄은 하나뿐');
  console.log('  [PASS] 큰 화면: 최신 확정 줄만 또렷');
  await ctx.close();

  // ── 7. 낱말 중간에서 줄이 끊기지 않는다 · 긴 낱말은 넘치지 않는다 · 화자 꼬리표는 보낸 때만 ──
  const LONG = 'https://example.com/' + 'a'.repeat(90);
  const wrapSrv = new WebSocketServer({ port: 0 });
  await new Promise(ok => wrapSrv.on('listening', ok));
  wrapSrv.on('connection', (sock) => sock.on('message', (raw) => {
    if (!JSON.parse(raw).hello) return;
    sock.send(JSON.stringify({ welcome: 1, src_lang: 'ko' }));
    sock.send(JSON.stringify({ seq: 1, text: '먼저 지난주 출하 일정부터 차례대로 하나씩 확인하겠습니다.', tr: { en: 'First, let us go over the shipping schedule from last week together, one item after another.' } }));
    sock.send(JSON.stringify({ seq: 2, text: '검사 성적서는 내일 오전까지 담당자에게 보내 드리겠습니다.', tr: { en: 'We will send the inspection report to the person in charge by tomorrow morning.' } }));
    sock.send(JSON.stringify({ seq: 3, text: '주소입니다', tr: { en: LONG } }));
    sock.send(JSON.stringify({ seq: 4, text: '회의 줄입니다', spk: 'meeting', tr: { en: 'a meeting line' } }));
  }));
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 320, height: 568 }]) {
    ctx = await b.newContext({ viewport: vp }); p = await ctx.newPage();
    await p.goto(`http://localhost:${port}/?room=123456&auto=1&ws=${wrapSrv.address().port}&lang=en`, { waitUntil: 'load' });
    await p.waitForSelector('#msg-4', { timeout: 10000 }); await p.waitForTimeout(300);
    const w = await p.evaluate(() => {
      // 낱말 하나가 두 줄에 걸치면 그 낱말의 사각형이 둘 이상이다
      const split = [];
      for (const id of ['msg-1', 'msg-2']) for (const sel of ['.msg-text', '.msg-tr']) {
        const node = document.querySelector(`#${id} ${sel}`).firstChild; const txt = node.textContent;
        const re = /\S+/g; let m, lines = new Set();
        while ((m = re.exec(txt))) {
          const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
          const rects = [...r.getClientRects()]; rects.forEach(x => lines.add(Math.round(x.top)));
          if (new Set(rects.map(x => Math.round(x.top))).size > 1) split.push(m[0]);
        }
        if (lines.size < 2) split.push(`(${id} ${sel}: 줄바꿈이 없어 시험이 헛돈다)`);
      }
      const long = document.querySelector('#msg-3 .msg-bubble').getBoundingClientRect();
      const b3 = document.getElementById('spk-badge-3'), b4 = document.getElementById('spk-badge-4');
      return { split, longRight: Math.round(long.right), vw: innerWidth, overflowX: document.documentElement.scrollWidth > innerWidth,
               badge3: getComputedStyle(b3).display, badge4: getComputedStyle(b4).display, badge4Text: b4.textContent };
    });
    console.log(`[줄바꿈 ${vp.width}x${vp.height}]`, JSON.stringify(w));
    assert.deepStrictEqual(w.split, [], '낱말 중간에서 끊긴 곳이 없다(한국어·영어)');
    assert(w.longRight <= w.vw && !w.overflowX, '긴 낱말(주소)은 화면 밖으로 넘치지 않는다');
    assert.strictEqual(w.badge3, 'none', '화자를 안 보낸 줄에는 화자 꼬리표가 없다');
    assert(w.badge4 !== 'none' && /meeting/.test(w.badge4Text), '화자를 보낸 줄에는 꼬리표가 있다');
    await ctx.close();
  }
  wrapSrv.close();
  console.log('  [PASS] 낱말 안 끊김 · 긴 낱말 안 넘침 · 화자 꼬리표는 보낸 때만 (390, 360, 320)');

  // ── 8. 시연 (?demo=1): 서버 없이 처음부터 끝까지 ──
  async function openDemo(extra, viewport, locale) {
    const c = await b.newContext({ viewport, locale });
    const pg = await c.newPage();
    const out = [];
    pg.on('request', (rq) => { const u = new URL(rq.url()); if (u.hostname !== 'localhost') out.push(rq.url()); });
    await pg.addInitScript(() => {
      window.__spoken = []; window.__ws = 0;
      const RealWS = window.WebSocket; window.WebSocket = function (...a) { window.__ws++; return new RealWS(...a); };
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      if (window.speechSynthesis) {
        window.speechSynthesis.getVoices = () => ['en-US', 'ja-JP', 'zh-CN', 'vi-VN', 'id-ID'].map(l => ({ lang: l, name: l }));
        window.speechSynthesis.speak = function (u) { if (u && u.text) window.__spoken.push(u.text); };
        window.speechSynthesis.cancel = function () {};
      }
    });
    await pg.clock.install();
    await pg.goto(`http://localhost:${port}/?demo=1${extra}`, { waitUntil: 'load' });
    await pg.waitForFunction(() => document.getElementById('lang-select').options.length > 1);
    return { pg, c, out };
  }
  const demoState = (pg) => pg.evaluate(() => ({
    inChat: document.documentElement.classList.contains('in-chat'),
    tag: [...document.querySelectorAll('.demo-tag')].filter(e => e.getBoundingClientRect().width > 0).length,  // 실제로 보이는 DEMO 표시 수
    uiLang: document.documentElement.lang,
    tagHit: (() => { const g = document.getElementById('demo-tag').getBoundingClientRect(), a = document.querySelector('.header-title').getBoundingClientRect(), z = document.getElementById('status-badge').getBoundingClientRect(); return g.width > 0 && (g.left < a.right || g.right > z.left); })(),
    opts: [...document.getElementById('lang-select').options].map(o => o.value), sel: document.getElementById('lang-select').value,
    room: document.getElementById('room-input').value,
    n: document.querySelectorAll('#chat-list > .msg-line:not(#msg-pending)').length,
    trs: [...document.querySelectorAll('#chat-list > .msg-line:not(#msg-pending) .msg-tr')].map(e => e.innerText.trim()),
    end: getComputedStyle(document.getElementById('end-modal')).display, sumLines: document.getElementById('sum-lines').textContent,
    spoken: window.__spoken, ws: window.__ws, pendingNow: (document.querySelector('#msg-pending .msg-text') || {}).textContent || '', saved: localStorage.getItem('raytok_lang'),
  }));

  // 8-1. 한국어 폰으로 열어도 번역문이 있는 언어가 골라진다 · 누르기 전에는 시작하지 않는다
  let d = await openDemo('', { width: 390, height: 844 }, 'ko-KR');
  let ds = await demoState(d.pg);
  assert.strictEqual(ds.tag, 1, 'DEMO 표시가 하나 보인다'); assert.strictEqual(ds.tagHit, false, 'DEMO 표시가 제목·상태와 겹치지 않는다');
  assert.deepStrictEqual([...ds.opts].sort(), ['en', 'id', 'ja', 'vi', 'zh-CN'], '고를 수 있는 언어는 예시 번역문이 있는 다섯');
  assert.strictEqual(ds.sel, 'en', '폰 언어에 번역문이 없으면 영어'); assert.strictEqual(ds.room, '000000');
  await d.pg.clock.runFor(5000);
  ds = await demoState(d.pg);
  assert(!ds.inChat && ds.n === 0, '참여를 누르기 전에는 시작하지 않는다');
  // 8-2. 언어를 바꾸고 참여 → 여덟 줄 → 종료 화면
  await d.pg.selectOption('#lang-select', 'vi');
  await d.pg.click('#btn-join');
  await d.pg.clock.runFor(1500);
  ds = await demoState(d.pg);
  assert(ds.inChat && ds.n === 0 && ds.pendingNow.length > 3 && '안녕하세요. 오늘 작업 전 안전교육을 시작하겠습니다.'.startsWith(ds.pendingNow), '먼저 말하는 중(임시) 글자가 보인다');
  assert.deepStrictEqual(ds.spoken, [], '임시 글자는 읽지 않는다');
  await d.pg.clock.runFor(4 * 60 * 1000);
  ds = await demoState(d.pg);
  console.log('[시연 vi]', JSON.stringify({ n: ds.n, spoken: ds.spoken.length, end: ds.end, sumLines: ds.sumLines, ws: ds.ws, first: ds.trs[0] }));
  assert.strictEqual(ds.n, 8, '여덟 줄이 다 나온다');
  assert(ds.trs.every(x => x.length > 0) && /Xin chào/.test(ds.trs[0]), '줄마다 고른 언어의 번역문이 있다');
  assert.deepStrictEqual(ds.spoken, ds.trs, '확정된 번역문만, 줄마다 한 번씩 읽는다');
  assert.strictEqual(ds.end, 'flex', '끝나면 종료 화면'); assert.strictEqual(ds.sumLines, '8');
  assert.strictEqual(ds.ws, 0, '서버에 연결하지 않는다'); assert.deepStrictEqual(d.out, [], '바깥으로 나가는 요청 0건');
  assert.strictEqual(ds.saved, null, '시연에서 고른 언어는 저장하지 않는다');
  await d.c.close();
  // 8-3. 언어마다 — 한 언어로만 확인하지 않는다
  for (const lang of ['en', 'ja', 'zh-CN', 'id']) {
    d = await openDemo(`&lang=${lang}`, { width: 390, height: 844 }, 'en-US');
    await d.pg.click('#btn-join'); await d.pg.clock.runFor(4 * 60 * 1000);
    ds = await demoState(d.pg);
    assert(ds.sel === lang && ds.n === 8 && ds.trs.every(x => x.length > 0) && ds.spoken.length === 8 && ds.end === 'flex', `시연 ${lang}`);
    await d.c.close();
  }
  // 8-3b. 좁은 폰(320)에서도 표시가 겹치지 않는다 · ?lang=ko 면 화면 글자는 한국어, 자막은 번역문이 있는 언어
  d = await openDemo('&lang=ko', { width: 320, height: 568 }, 'ko-KR');
  ds = await demoState(d.pg);
  assert.strictEqual(ds.tag, 1); assert.strictEqual(ds.tagHit, false, '320px 에서도 DEMO 표시가 겹치지 않는다');
  assert.strictEqual(ds.uiLang, 'ko', '화면 글자는 한국어'); assert.strictEqual(ds.sel, 'en', '자막은 영어');
  await d.c.close();
  // 8-4. 큰 화면 시연은 저절로 시작하고 소리는 끔
  d = await openDemo('&view=screen&auto=1&lang=en', { width: 1920, height: 1080 }, 'en-US');
  await d.pg.clock.runFor(20000);
  ds = await demoState(d.pg);
  assert(ds.inChat && ds.n >= 2, '큰 화면 시연은 저절로 시작한다'); assert.deepStrictEqual(ds.spoken, [], '큰 화면은 소리 끔');
  assert.strictEqual(ds.tag, 1, '큰 화면에도 DEMO 표시가 하나 보인다'); assert.strictEqual(ds.ws, 0);
  await d.c.close();
  // 8-5. demo 가 없으면 아무것도 달라지지 않는다
  ({ p, ctx } = await open('&lang=en', { width: 390, height: 844 }));
  assert.strictEqual(await p.evaluate(() => [...document.querySelectorAll('.demo-tag')].filter(e => e.getBoundingClientRect().width > 0).length), 0, '보통 때는 DEMO 표시가 없다');
  assert.strictEqual(await p.evaluate(() => document.getElementById('lang-select').options.length), 82, '보통 때는 언어 전부');
  await ctx.close();
  console.log('  [PASS] 시연: 서버 연결 0 · 임시는 안 읽음 · 8줄 · 언어 5개 · 종료 화면 · 큰 화면 자동 시작');

  // ── 9. 기록 저장(TXT): 받은 글만 · 고른 언어의 번역문 · 바깥 요청 0건 ──
  async function grab(pg, sel) {
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click(sel)]);
    const fs = require('fs'); const f = await dl.path();
    return { name: dl.suggestedFilename(), txt: fs.readFileSync(f, 'utf8') };
  }
  d = await openDemo('&lang=en', { width: 390, height: 844 }, 'en-US');
  await d.pg.click('#btn-join'); await d.pg.clock.runFor(4 * 60 * 1000);
  let g = await grab(d.pg, '#btn-save-end');  // 시연이 끝나 종료 화면이 덮고 있다 — 종료 화면 버튼
  assert(/^raytok_\d{8}_\d{4}_en\.txt$/.test(g.name), '파일 이름 형식: ' + g.name);
  assert(g.txt.charCodeAt(0) === 0xFEFF, 'BOM 으로 시작'); assert(g.txt.includes('\r\n'), '줄바꿈 CRLF');
  assert(/Lines: 8/.test(g.txt), '줄 수 8'); assert((g.txt.match(/^\[\d\d:\d\d:\d\d\]/gm) || []).length === 8, '시각 줄 8개');
  const trsNow = (await demoState(d.pg)).trs;
  assert(trsNow.length === 8 && trsNow.every(t => g.txt.includes(t)), '화면의 번역문이 전부 들어 있다');
  assert(!/\\r|\\n|\\u/.test(g.txt.replace(/\r\n/g, '')), '이스케이프가 글자로 새지 않는다');
  await d.pg.evaluate(() => { document.getElementById('end-modal').style.display = 'none'; });
  const g2 = await grab(d.pg, '#btn-save');  // 도구 막대 버튼도 같은 줄들
  assert.strictEqual(g2.txt.split('\r\n').filter(l => /^\[\d\d:/.test(l)).length, 8, '도구 막대 저장도 8줄');
  assert.deepStrictEqual(d.out, [], '저장 중 바깥 요청 0건'); assert.strictEqual((await demoState(d.pg)).ws, 0);
  await d.c.close();
  // 다른 언어: 그 언어 번역문
  d = await openDemo('&lang=ja', { width: 390, height: 844 }, 'en-US');
  await d.pg.click('#btn-join'); await d.pg.clock.runFor(4 * 60 * 1000);
  g = await grab(d.pg, '#btn-save-end'); const jt = (await demoState(d.pg)).trs;
  assert(/_ja\.txt$/.test(g.name) && jt.every(t => g.txt.includes(t)), 'ja 번역문 저장');
  await d.c.close();
  // 큰 화면에도 버튼이 있다 (숨었다가 조작하면 보임)
  ({ p, ctx } = await open('&view=screen&lang=en', { width: 1920, height: 1080 }));
  assert.strictEqual(await p.evaluate(() => !!document.getElementById('btn-save')), true, '큰 화면에도 저장 버튼');
  await ctx.close();
  console.log('  [PASS] 기록 저장: 파일명·BOM·줄 수·번역문·바깥 요청 0');

  await b.close(); wss.close(); srv.close();
  console.log('[PASS] 큰 화면 보기 시험 전부 통과');
})().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
