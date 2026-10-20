// samples/listener_no_tr_test.js — 번역이 **안 온 줄**에 표시가 붙는가 (마스터 10-20 14:22 (b))
//
// 대표님 웹 실기: 손님 화면에 원문만 떴다. 번역이 실패하면 강사 쪽이 그 언어를 빼고 보내므로
// 손님은 **원문을 본다**(R-15 — 줄을 잃는 것보다 낫다). 그런데 아무 표시가 없으면 "이게
// 번역된 글인가"를 알 수 없다. 그래서 세 가지를 가린다:
//   ① 번역을 **기다리는 중**(pending) → 「번역 대기 중」
//   ② 번역이 **안 왔다**(tr 이 빈 채로 왔다) → 「번역 없음」  ← 이번에 넣은 것
//   ③ 「원문만」 모드(broadcast) · 호스트와 같은 언어 → **표시 없음**(없는 것이 맞는 자리, §20)
//
// 돌리기: node samples/listener_no_tr_test.js   (playwright 필요)
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
const { WebSocketServer } = require('ws');

console.log('=== 번역이 안 온 줄의 표시 (listener no_tr) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const DICT = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf-8')).strings;

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/' || p.endsWith('/')) p = '/web/listener/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
});

(async () => {
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((res) => wss.on('listening', res));
  const wsPort = wss.address().port;

  /* 가짜 강사 — 손님이 hello 하면 줄을 하나씩 밀어 넣는다 */
  let sock = null;
  const joined = new Promise((res) => {
    wss.on('connection', (s) => {
      sock = s;
      s.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (!m.hello) return;
        s.send(JSON.stringify({ welcome: 1, src_lang: 'ko' }));
        res();
      });
    });
  });
  const push = (o) => sock.send(JSON.stringify(o));

  const { chromium } = require('playwright');
  const chromePath = process.env.CHROME
    || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const b = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();

  const badges = (seq) => page.evaluate((s) => {
    const row = document.getElementById('msg-' + s);
    const tr = row && row.querySelector('.msg-tr');
    return {
      found: !!row,
      shown: !!tr && getComputedStyle(tr).display !== 'none',
      text: (tr && tr.textContent) || '',
      /* 빈 꼬리표(숨은 화자 칸)는 센 것이 아니다 */
      badges: tr ? [...tr.querySelectorAll('.badge')].map((x) => x.textContent.trim()).filter(Boolean) : [],
    };
  }, seq);

  try {
    await page.goto(`http://localhost:${port}/web/listener/?room=123456&auto=1&ws=${wsPort}&lang=en`, { waitUntil: 'load' });
    await page.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
    await joined;

    /* ① 번역을 기다리는 중 — 「번역 대기 중」 */
    push({ seq: 1, text: '비상구는 왼쪽입니다', pending: 1 });
    await page.waitForFunction(() => document.querySelectorAll('#chat-list > .msg-line').length >= 1, null, { timeout: 5000 });
    let b1 = await badges(1);
    ok(b1.badges.some((x) => x === DICT.badge_pending.en),
       `① 기다리는 중에는 「${DICT.badge_pending.en}」 (${JSON.stringify(b1.badges)})`);
    ok(!b1.badges.some((x) => x === DICT.badge_no_tr.en), '① 그때는 「번역 없음」이 아니다 — 올 것이 있다');

    /* ② 번역이 **안 왔다**(빈 tr) — 「번역 없음」 */
    push({ seq: 1, tr: {} });
    await page.waitForFunction((want) => {
      const row = [...document.querySelectorAll('#chat-list > .msg-line')][0];
      const tr = row && row.querySelector('.msg-tr');
      return !!tr && [...tr.querySelectorAll('.badge')].some((x) => x.textContent.trim() === want);
    }, DICT.badge_no_tr.en, { timeout: 5000 }).catch(() => {});
    b1 = await badges(1);
    ok(b1.badges.some((x) => x === DICT.badge_no_tr.en),
       `② 안 온 줄에는 「${DICT.badge_no_tr.en}」 (${JSON.stringify(b1.badges)})`);
    ok(!b1.badges.some((x) => x === DICT.badge_pending.en), '② 「번역 대기 중」은 사라진다 — 기다릴 것이 없다');
    ok(/비상구는 왼쪽입니다/.test(await page.textContent('#chat-list')),
       '② 원문은 그대로 보인다 — 줄을 잃지 않는다 (R-15)');

    /* ③ 번역이 온 줄에는 표시가 없다 */
    push({ seq: 2, text: '안전모를 쓰십시오', tr: { en: 'Please wear a hard hat' } });
    await page.waitForFunction(() => /hard hat/.test(document.getElementById('chat-list').textContent), null, { timeout: 5000 });
    const b2 = await badges(2);
    ok(!b2.badges.some((x) => x === DICT.badge_no_tr.en),
       `③ 번역이 온 줄에는 표시가 없다 (${JSON.stringify(b2.badges)})`);

    /* ④ 「원문만」 모드(broadcast)는 번역 칸 자체를 감춘다 — 표시도 없다 */
    push({ seq: 3, text: '여기는 방송 줄입니다', broadcast: true });
    await page.waitForFunction(() => /방송 줄/.test(document.getElementById('chat-list').textContent), null, { timeout: 5000 });
    const b3 = await badges(3);
    ok(!b3.shown || !b3.badges.length,
       `④ 「원문만」 모드 줄에는 번역 칸·표시가 없다 (보임=${b3.shown}, ${JSON.stringify(b3.badges)})`);

    /* ★ 되돌림 실증 — 글자가 **표에서** 온다. 손님 언어 81개에 그 칸이 있어야 한다 */
    ok(Object.keys(DICT.badge_no_tr).length === Object.keys(DICT.badge_pending).length,
       `되돌림 실증: 「번역 없음」이 손님 글자 표의 **모든 언어**에 있다 (${Object.keys(DICT.badge_no_tr).length}개)`);
    ok(DICT.badge_no_tr.ko === '번역 없음' && DICT.badge_no_tr.ne && DICT.badge_no_tr.vi,
       '되돌림 실증: ko·ne·vi 칸이 비어 있지 않다 (표에서 빼면 이 줄이 붉다)');

    console.log(`\n[OK] ${checks}개 확인 — 번역이 안 온 줄의 표시`);
  } finally {
    await b.close();
    wss.close();
    srv.close();
  }
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
