// samples/e2e_room_tr_test.js — **끝까지**: 진짜 방 코드 → 손님 셋이 각자 언어로 받는다 (NOW B 5)
//
// 기준: 결정장부 51(손님 폰이 먼저, 방이 보조)·43(강사는 원문만) · RULE: P-16
// 설계: docs/design/room-translate.md
//
// 다른 시험과 무엇이 다른가: 여기서는 **릴레이 `Room` 클래스를 그대로** 돌린다(가짜 방이
// 아니다, D-11). 작은 ws 다리가 브라우저 소켓을 `room.webSocketMessage` 에 그대로 넘긴다.
// 그래서 보는 것이 "우리 코드가 보낸 것을 우리 페이지가 받는가" 자체다:
//
//   강사(원문만) → 진짜 Room → /translate(목, 운영 규약) → 손님 en·zh-CN·ne 각자 언어
//
// ⚠ **웹킷은 이 기계에 없다**(`/opt/pw-browsers` 에 크로미움뿐). NOW B 5 가 말한 사파리
//   쪽은 여기서 재지 못한다 — 「모름」으로 두고 보고에 적는다(§20: 못 본 것은 못 봤다고 한다).
//
// 돌리기: node samples/e2e_room_tr_test.js
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');

console.log('=== 끝까지: 진짜 방이 번역해 손님 셋에게 (B 5) ===');
let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 진짜 Room 을 담는 그릇 (relay/test 의 가짜 ctx 와 같은 모양) ───────────── */
class Bridge {
  constructor() { this.socks = []; }
  add(ws, tag) { ws.__tag = tag; ws.__att = null; this.socks.push(ws); }
  drop(ws) { this.socks = this.socks.filter((s) => s !== ws); }
  ctx() {
    const store = new Map();
    const self = this;
    return {
      storage: {
        get: async (k) => (Array.isArray(k) ? new Map(k.map((x) => [x, store.get(x)])) : store.get(k)),
        put: async (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) store.set(a, b); else store.set(k, v); },
        delete: async (k) => store.delete(k),
        setAlarm: async () => {}, deleteAlarm: async () => {}, list: async () => new Map()
      },
      blockConcurrencyWhile: (fn) => fn(),
      getWebSockets: (tag) => self.socks.filter((s) => !tag || s.__tag === tag),
      getTags: (ws) => [ws.__tag],
      waitUntil: () => {}, acceptWebSocket: () => {}, setWebSocketAutoResponse: () => {}
    };
  }
}

(async () => {
  const bridge = new Bridge();
  const { Room } = await import('../relay/src/room.js');

  /* 목 `/translate` — 운영 규약을 **그대로** 지킨다(배열만·`{t:[]}` 만). 부른 것을 센다. */
  const calls = [];
  const env = {
    LICENSE_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    RELAY_BASE_URL: 'https://relay.test',
    SELF: {
      async fetch(req) {
        const b = await req.json();
        calls.push({ target: b.target, n: (b.q || []).length });
        if (!Array.isArray(b.q)) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 });
        /* ne 는 **일부러 죽인다** — 한 언어가 실패해도 나머지는 가야 한다(R-15),
           그리고 그 손님은 「대기 중」에 갇히지 않아야 한다(no_tr). */
        if (b.target === 'ne') return new Response(JSON.stringify({ error: 'upstream' }), { status: 502 });
        return new Response(JSON.stringify({ t: b.q.map((x) => `[${b.target}] ${x}`) }), { status: 200 });
      }
    }
  };
  const room = new Room(bridge.ctx(), env);
  room.sub = 'e2e_user';
  room.licFlags = 0x10;
  room.att = { joined: 0, max: 0, langs: {} };

  /* 정적 파일 + ws 다리 */
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  const wss = new WebSocketServer({ server: srv, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const role = new URL(req.url, 'http://x').searchParams.get('role') === 'host' ? 'host' : 'listener';
    ws.serializeAttachment = (a) => { ws.__att = a; };
    ws.deserializeAttachment = () => ws.__att;
    bridge.add(ws, role);
    if (role === 'listener') room.attJoin(ws);
    ws.on('message', (raw) => { room.webSocketMessage(ws, raw.toString()).catch(() => {}); });
    ws.on('close', () => bridge.drop(ws));
  });
  await new Promise((res) => srv.listen(0, res));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const guests = [];
  let hostWs = null;
  try {
    /* 강사를 **먼저** 붙인다 — 손님 화면은 `welcome` 을 받고서야 자막 화면을 연다.
       (강사 화면이 하는 일 그대로: hello 가 오면 welcome 으로 답한다) */
    const WebSocket = require('ws');
    hostWs = new WebSocket(`${base.replace('http', 'ws')}/ws?room=ABC123&role=host`);
    await new Promise((res, rej) => { hostWs.on('open', res); hostWs.on('error', rej); });
    hostWs.on('message', (raw) => {
      const t = raw.toString();
      if (t.includes('"hello"')) hostWs.send(JSON.stringify({ welcome: 1, plan: 'web', guide: 1, src_lang: 'ko' }));
    });
    hostWs.send(JSON.stringify({ welcome: 1, plan: 'web', guide: 1, src_lang: 'ko' }));

    /* 손님 셋 — en · zh-CN · ne. 셋 다 **원문 언어가 아닌** 말을 쓴다. */
    for (const lang of ['en', 'zh-CN', 'ne']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.goto(`${base}/web/listener/?room=ABC123&lang=${lang}&relay=127.0.0.1:${srv.address().port}`);
      await page.waitForSelector('#btn-join');
      await page.click('#btn-join');
      await page.waitForSelector('#chat-screen', { state: 'visible' });
      guests.push({ ctx, page, lang });
    }
    await sleep(500);
    ok(bridge.socks.filter((s) => s.__tag === 'listener').length === 3, '손님 셋이 진짜 방에 붙었다');

    /* 강사는 **원문만** 보낸다(장부 43) — 원고를 올리고, 말하고, 문단을 넘긴다 */
    hostWs.send(JSON.stringify({ kind: 'script_src', srcLang: 'ko', total: 2,
      paras: [{ para: 1, src: '안전모를 쓰세요' }, { para: 2, src: '비상구를 확인하세요' }] }));
    await sleep(200);

    /* ── ① 🎤 줄: 강사가 말한 한 줄 ── */
    hostWs.send(JSON.stringify({ seq: 1, text: '지금부터 시작합니다', src_lang: 'ko', broadcast: true }));
    await sleep(1200);
    for (const g of guests.filter((x) => x.lang !== 'ne')) {
      const tr = await g.page.textContent('#msg-1 .msg-tr');
      ok(tr && tr.includes(`[${g.lang}]`), `① ${g.lang} 손님이 🎤 줄을 **자기 언어로** 받았다 ("${tr}")`);
    }

    /* ② 실패한 언어(ne)는 「대기 중」에 갇히지 않는다 — 원문은 남는다(R-15) */
    const ne = guests.find((x) => x.lang === 'ne');
    const neText = await ne.page.textContent('#msg-1 .msg-text');
    ok(neText && neText.includes('지금부터'), `② ne 손님에게 **원문은 남아 있다** ("${neText}") — 유실이 아니다`);
    const neWait = await ne.page.$('#msg-1 .badge-pending');
    ok(!neWait, '② 그리고 「번역 대기 중」에 갇히지 않았다 (no_tr 이 갔다)');

    /* ── ③ 원고 문단: 「다음」 한 번 ── */
    hostWs.send(JSON.stringify({ kind: 'script', para: 1, total: 2, src: '안전모를 쓰세요', srcLang: 'ko' }));
    await sleep(1400);
    for (const g of guests.filter((x) => x.lang !== 'ne')) {
      const tr = await g.page.textContent('.msg-script .msg-tr');
      ok(tr && tr.includes(`[${g.lang}]`), `③ ${g.lang} 손님이 원고 문단을 자기 언어로 받았다 ("${tr}")`);
    }

    /* ④ 돈 — 언어마다 한 번이다. 사람 수로 늘지 않는다 */
    const byLang = calls.reduce((a, c) => { a[c.target] = (a[c.target] || 0) + 1; return a; }, {});
    ok(!Object.values(byLang).some((n) => n > 3),
       `④ 부른 횟수가 언어마다 몇 번뿐이다 (${JSON.stringify(byLang)}) — 손님 수로 늘지 않는다`);
    ok(!byLang.ko, '④ 원문 언어(ko)는 부르지 않았다');

    /* ── ⑤ 되돌림 실증 (D-09) — 스위치를 끄면 **손님 화면에서 번역이 사라진다** ──
       위 초록들이 "방이 번역해서 보낸 결과"인지, 아니면 다른 길로 들어온 글자인지
       가르는 자리다. 끈 뒤에도 **원문은 간다**(R-15: 유실이 아니다). */
    room.env = { ...env, ROOM_TR: '0' };
    const callsBefore = calls.length;
    hostWs.send(JSON.stringify({ seq: 2, text: '스위치를 끈 뒤의 줄', src_lang: 'ko', broadcast: true }));
    const en = guests.find((x) => x.lang === 'en');
    await en.page.waitForSelector('#msg-2', { timeout: 5000 });
    await sleep(1200);
    const offText = await en.page.textContent('#msg-2 .msg-text');
    const offTr = await en.page.textContent('#msg-2 .msg-tr');
    ok(calls.length === callsBefore,
       `⑤ ROOM_TR=0 이면 **부르지 않는다** (${calls.length - callsBefore}회 늘었다) — 되돌림 실증`);
    ok(!offTr || !offTr.includes('[en]'),
       `⑤ 그래서 번역이 화면에 **붙지 않는다** ("${offTr}") — 위 초록은 이 코드에서 왔다`);
    ok(offText && offText.includes('스위치를 끈 뒤의 줄'),
       `⑤ 그래도 **원문은 간다** ("${offText}") — 끄는 것이 손님을 빈손으로 만들지 않는다(R-15)`);

    console.log(`\n[OK] ${pass}개 확인 — 끝까지 (진짜 방 + 손님 셋)`);
  } finally {
    try { if (hostWs) hostWs.close(); } catch (_) {}
    for (const g of guests) { try { await g.ctx.close(); } catch (_) {} }
    await browser.close();
    try { wss.close(); } catch (_) {}
    srv.close();
  }
  process.exit(0);
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
