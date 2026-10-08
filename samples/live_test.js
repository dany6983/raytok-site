// samples/live_test.js — L4-2 진행 화면 시험: 호스트(web/host) + 청취자(web/listener) 두 탭.
// 실행(저장소 루트, playwright·ws 필요):  node samples/live_test.js   또는  npm run test:live
//   CHROME=<크롬 경로> 를 주면 그 브라우저를 쓴다.
// 보는 것: ① /room 으로 방 → 코드·QR·참석 수 ② 문단 3개 넘기기 → 청취자 화면 3줄("원고 n/total")
//          ③ 건너뜀 → 청취자 "건너뜀 n" ④ 쉬는 시간 띠 on/off ⑤ 와이어 모양(script·skip·break) 정본 그대로
//          ⑥ 넘길 때 /translate 0회(번역을 새로 청하지 않는다) ⑦ 바깥 요청 0건 ⑧ 키보드 →·←·스페이스
// 목업 릴레이는 relay/src/room.js 와 같은 규칙(호스트→청취자 그대로, 청취자→호스트, 링버퍼 재전송, att 집계)로 여기서 돈다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');

console.log('=== L4-2 진행 화면 (web/host + web/listener) 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'application/javascript', '.png': 'image/png' };

// ── 목업 릴레이 상태 ──
const rooms = new Map();           // code -> { token, ring: [], hosts: Set, listeners: Map(ws -> {lang}) , joined, max }
let translateCalls = 0;            // /translate 호출 수 — 진행 중에는 0 이어야 한다
const hostReceived = [];           // 호스트가 /ws 로 보낸 메시지(해석한 것)

function attSnapshot(room) {
  const langs = {};
  let now = 0;
  for (const m of room.listeners.values()) {
    const k = m.lang || '?';
    if (!langs[k]) langs[k] = { now: 0, max: 0, min: 0 };
    langs[k].now++;
    now++;
  }
  if (now > room.max) room.max = now;
  for (const k of Object.keys(langs)) if (langs[k].now > langs[k].max) langs[k].max = langs[k].now;
  return { att: 1, now, max: room.max, joined: room.joined, langs };
}
function sendAtt(room) {
  const msg = JSON.stringify(attSnapshot(room));
  for (const h of room.hosts) { try { h.send(msg); } catch (_) {} }
}

const srv = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/license/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      if (data.token === 'valid_test_token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: true, payload: { sub: 'instructor_1', flags: 12, exp: Math.floor(Date.now() / 1000) + 86400 } }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, message: 'Invalid signature' }));
      }
    });
    return;
  }

  if (url.pathname === '/translate' && req.method === 'POST') {
    translateCalls++;
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      // vi 는 일부러 실패시킨다(503) — 그 언어는 trans 에서 빠져야 한다(R-15)
      if (data.target === 'vi') { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText: `[${data.target}] ` + data.q }));
    });
    return;
  }

  if (url.pathname === '/room' && req.method === 'POST') {
    if ((req.headers.authorization || '') !== 'Bearer valid_test_token') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      const code = 'ABC123';
      const token = 'host_tok_' + Math.random().toString(36).slice(2);
      rooms.set(code, { token, kind: data.kind, ring: [], hosts: new Set(), listeners: new Map(), joined: 0, max: 0 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code, host_token: token }));
    });
    return;
  }

  // 정적 파일: /web/... , /assets/...
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const wss = new WebSocketServer({ noServer: true });
srv.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  const code = (url.searchParams.get('room') || '').toUpperCase();
  const role = url.searchParams.get('role');
  const room = rooms.get(code);
  if (!room) { socket.destroy(); return; }
  if (role === 'host' && url.searchParams.get('token') !== room.token) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (role === 'host') {
      room.hosts.add(ws);
      try { ws.send(JSON.stringify(attSnapshot(room))); } catch (_) {}
      ws.on('message', (raw) => {
        const s = raw.toString();
        if (s.includes('__ping')) { ws.send(s); return; }
        room.ring.push(s);
        for (const l of room.listeners.keys()) { try { l.send(s); } catch (_) {} }
        try { hostReceived.push(JSON.parse(s)); } catch (_) {}
      });
      ws.on('close', () => room.hosts.delete(ws));
    } else {
      for (const m of room.ring) { try { ws.send(m); } catch (_) {} }
      room.joined++;
      room.listeners.set(ws, { lang: null });
      sendAtt(room);
      ws.on('message', (raw) => {
        const s = raw.toString();
        try {
          const p = JSON.parse(s);
          if (p.hello && p.lang) { room.listeners.get(ws).lang = p.lang; sendAtt(room); }
        } catch (_) {}
        for (const h of room.hosts) { try { h.send(s); } catch (_) {} }
      });
      ws.on('close', () => { room.listeners.delete(ws); sendAtt(room); });
    }
  });
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const base = `http://localhost:${port}`;

  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const outside = [];
  const watch = (p) => p.on('request', rq => { const u = new URL(rq.url()); if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outside.push(rq.url()); });

  // ── 호스트 탭: 인증 → 원고 → 미리 번역 → 강의 시작 ──
  const hostCtx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const host = await hostCtx.newPage();
  watch(host);
  await host.goto(`${base}/web/host/?relay=${base}`);
  await host.fill('#tokenInput', 'valid_test_token');
  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible' });

  const txt = '안전 교육을 시작하겠습니다.\n\n안전모를 반드시 착용하십시오.\n\n비상구 위치를 확인하세요.\n\n질문 있으면 손을 드세요.';
  await host.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], 'lecture.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, txt);
  await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 4);
  await host.click('#btnPreTranslate');
  await host.waitForSelector('#readyArea', { state: 'visible', timeout: 10000 });
  const callsAfterPrep = translateCalls;
  ok(callsAfterPrep === 4 * 3, `미리 번역: /translate ${callsAfterPrep}회 (문단 4 × 언어 3)`);

  await host.click('#btnStartLecture');
  await host.waitForSelector('#step-live', { state: 'visible', timeout: 5000 });
  ok(await host.isVisible('#step-live'), '강의 시작 → 진행 화면 표시');
  ok(!(await host.isVisible('#step-prepare')), '진행 화면에서 준비 화면 숨김');
  const room = rooms.get('ABC123');
  ok(room && room.kind === 'script', '/room 을 이용권 토큰으로 불렀다 (kind=script)');
  ok((await host.textContent('#roomCode')).trim() === 'ABC123', '방 코드 표시');
  ok((await host.$$('#qrBox svg')).length === 1, 'QR(svg) 그림 — 바깥 요청 없이 로컬 생성');
  const joinUrl = (await host.textContent('#joinUrl')).trim();
  ok(joinUrl.includes('/web/listener/') && joinUrl.includes('room=ABC123'), '참여 주소 = 청취 페이지 + room 코드');
  await host.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
  ok(room.hosts.size === 1, '호스트 /ws 연결(role=host, 토큰)');
  ok(hostReceived.some(m => m.welcome === 1), '호스트가 welcome 을 먼저 보낸다(링버퍼 → 늦게 온 청취자도 받는다)');

  // 현재 강조 / 다음 흐림 — 시작 전엔 1번이 "다음"
  ok(await host.$eval('#live-para-1', el => el.classList.contains('is-next')), '시작 전: 1번 문단이 다음(흐림)');

  // ── 청취자 탭: 같은 방에 en 으로 참여 ──
  const lisCtx = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const lis = await lisCtx.newPage();
  watch(lis);
  await lis.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en' }];
      window.speechSynthesis.speak = function (u) { if (u && u.text) window.__spoken.push(u.text); };
      window.speechSynthesis.cancel = function () {};
    }
  });
  await lis.goto(`${base}/web/listener/?room=ABC123&lang=en&auto=1&relay=localhost:${port}`);
  await lis.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
  ok(await lis.isVisible('#chat-screen'), '청취자: welcome 받고 자막 화면으로');

  await host.waitForFunction(() => document.getElementById('attNow').textContent === '1', null, { timeout: 5000 });
  ok(true, '호스트: 참석 수 1');
  await host.waitForFunction(() => /en\s*1/.test(document.getElementById('attLangs').textContent), null, { timeout: 5000 });
  ok(true, '호스트: 언어별 인원 en 1');

  // ── 문단 3개 넘기기: 단추 → 키보드 → 스페이스 ──
  const before = translateCalls;
  await host.click('#btnNext');
  await host.keyboard.press('ArrowRight');
  await host.keyboard.press('Space');
  await lis.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 3, null, { timeout: 5000 });
  ok(true, '청취자: 문단 3개 → 원고 줄 3개');
  ok(translateCalls === before, '넘길 때 /translate 0회 — 번역을 새로 청하지 않는다');

  const scripts = hostReceived.filter(m => m.kind === 'script');
  ok(scripts.length === 3, '호스트 → /ws script 3건');
  const s1 = scripts[0];
  ok(Object.keys(s1).sort().join(',') === 'at,kind,para,src,srcLang,total,trans', 'script 모양 = {kind,para,total,src,srcLang,trans,at} (정본)');
  ok(s1.para === 1 && s1.total === 4 && s1.srcLang === 'ko' && s1.src === '안전 교육을 시작하겠습니다.', 'script 1: para·total·srcLang·src');
  ok(s1.trans.en === '[en] 안전 교육을 시작하겠습니다.' && s1.trans.ja === '[ja] 안전 교육을 시작하겠습니다.', 'script trans = IndexedDB 미리 번역(en·ja)');
  ok(!('vi' in s1.trans), '미리 번역 실패한 언어(vi)는 trans 에서 빠진다(R-15)');
  ok(scripts.map(s => s.para).join(',') === '1,2,3', '단추·→·스페이스 = 1,2,3 순서');

  const heads = await lis.$$eval('#chat-list .msg-line.msg-script .badge-script', els => els.map(e => e.textContent.trim()));
  ok(heads.join('|') === 'Script 1/4|Script 2/4|Script 3/4', '청취자 줄 머리 "원고 n/total"(en UI: Script n/4)');
  const trs = await lis.$$eval('#chat-list .msg-line.msg-script .msg-tr', els => els.map(e => e.textContent.trim()));
  ok(trs[0].startsWith('[en] 안전 교육을 시작하겠습니다.'), '청취자: trans[en] 표시');
  const spoken = await lis.evaluate(() => window.__spoken.length);
  ok(spoken === 3, `청취자: 번역문 읽기 3회 (${spoken})`);

  ok(await host.$eval('#live-para-3', el => el.classList.contains('is-current')), '호스트: 3번 문단 강조(현재)');
  ok(await host.$eval('#live-para-4', el => el.classList.contains('is-next')), '호스트: 4번 문단 흐림(다음)');
  ok((await host.textContent('#liveProgress')).trim() === '3 / 4', '호스트: 진행 3 / 4');

  // ── 이전(←): 2번을 다시 보낸다 ──
  await host.keyboard.press('ArrowLeft');
  await lis.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 4, null, { timeout: 5000 });
  const last = hostReceived.filter(m => m.kind === 'script').pop();
  ok(last.para === 2, '← = 이전 문단(2) script 다시 송출');

  // ── 건너뜀: 3번(다음)을 건너뛴다 ──
  await host.click('#btnSkip');
  await lis.waitForSelector('#chat-list .msg-line.msg-skip', { timeout: 5000 });
  const skip = hostReceived.find(m => m.kind === 'skip');
  ok(skip && Object.keys(skip).sort().join(',') === 'kind,para' && skip.para === 3, 'skip {kind,para:3} 송출');
  ok((await lis.textContent('#chat-list .msg-line.msg-skip')).trim() === 'Skipped 3', '청취자: "건너뜀 3" 줄(en UI: Skipped 3)');
  ok(await host.$eval('#live-para-3', el => el.classList.contains('is-skipped')), '호스트: 3번 건너뜀 표시');

  // ── 쉬는 시간 on/off ──
  await host.click('#btnBreak');
  await lis.waitForFunction(() => document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
  ok(await lis.isVisible('#break-band'), '청취자: 쉬는 시간 띠 표시');
  ok((await lis.textContent('#break-band')).trim() === 'Break', '쉬는 시간 띠 글(en UI: Break)');
  const brk = hostReceived.filter(m => m.kind === 'break');
  ok(brk.length === 1 && brk[0].on === true, 'break {kind,on:true} 송출');
  await host.click('#btnBreak');
  await lis.waitForFunction(() => !document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
  ok(!(await lis.isVisible('#break-band')), '청취자: 쉬는 시간 끝 → 띠 사라짐');
  ok(hostReceived.filter(m => m.kind === 'break').pop().on === false, 'break {on:false} 송출');

  // ── 늦게 온 청취자(vi): 링버퍼로 지난 원고를 받는다. 미리 번역 없는 언어는 원문을 본다 ──
  const lis2 = await lisCtx.newPage();
  watch(lis2);
  await lis2.goto(`${base}/web/listener/?room=ABC123&lang=vi&auto=1&relay=localhost:${port}`);
  await lis2.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 4, null, { timeout: 8000 });
  const vi = await lis2.$$eval('#chat-list .msg-line.msg-script', els => els.map(e => ({ src: e.querySelector('.msg-text').textContent, tr: e.querySelector('.msg-tr').textContent.trim() })));
  ok(vi[0].src === '안전 교육을 시작하겠습니다.' && vi[0].tr === '', '청취자(vi, 번역 없음): 원문만 — 줄을 빼지 않는다');
  await host.waitForFunction(() => document.getElementById('attNow').textContent === '2', null, { timeout: 5000 });
  ok(/vi\s*1/.test(await host.textContent('#attLangs')), '호스트: 언어별 인원 vi 1 추가');

  // ── 청취자 기록 저장(TXT)에 원고 줄이 들어간다 ──
  const txtOut = await lis.evaluate(() => buildTranscriptText('both'));
  ok(txtOut.includes('안전모를 반드시 착용하십시오.') && txtOut.includes('[en] 안전모를 반드시 착용하십시오.'), '청취자 기록: 원고 줄 원문+번역 포함');

  ok(outside.length === 0, `바깥 요청 0건 (${outside.length})`);

  await browser.close();
  srv.close();
  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FAIL]', err && err.message ? err.message : err);
  srv.close();
  process.exit(1);
});
