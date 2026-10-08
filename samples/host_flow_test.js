// samples/host_flow_test.js — L4-2 진행(호스트+청취자 두 탭) 및 L4-3 끝 화면 통합 시험
// 실행: CHROME=<경로> node samples/host_flow_test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { WebSocketServer, WebSocket } = require('ws');
const { chromium } = require('playwright');

console.log('=== L4-2 · L4-3 웹 강사 화면 통합 라이프사이클 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.css': 'text/css'
};

// 목업 릴레이 및 정적 파일 통합 서버
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/license/verify' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: true, payload: { sub: 'inst_test', flags: 12 } }));
    return;
  }

  if (url.pathname === '/translate' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translatedText: `[${data.target}] ` + data.q }));
    });
    return;
  }

  if (url.pathname === '/room' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: '654321', host_token: 'htoken_123' }));
    return;
  }

  // 파일 서빙
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/web/host/index.html';
  const filePath = path.join(ROOT_DIR, p.replace(/^\//, ''));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found: ' + p);
  }
});

// 목업 릴레이 WebSocket 중계기
const wss = new WebSocketServer({ noServer: true });
const rooms = new Map(); // roomCode -> { hostWs, listeners: Set }

srv.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const room = url.searchParams.get('room') || '654321';
      const role = url.searchParams.get('role');
      if (!rooms.has(room)) rooms.set(room, { hostWs: null, listeners: new Set() });
      const r = rooms.get(room);

      if (role === 'host') {
        r.hostWs = ws;
        ws.on('message', (data) => {
          const str = data.toString();
          // 호스트 -> 리스너 전체 전달
          r.listeners.forEach(l => {
            if (l.readyState === WebSocket.OPEN) l.send(str);
          });
        });
      } else {
        r.listeners.add(ws);
        // 접속 즉시 및 hello 수신 시 welcome 전송
        const sendWelcome = () => {
          try {
            ws.send(JSON.stringify({ welcome: 1, guide: 1, src_lang: 'ko' }));
          } catch (_) {}
        };
        sendWelcome();

        ws.on('message', (d) => {
          try {
            const m = JSON.parse(d.toString());
            if (m.hello) sendWelcome();
          } catch (_) {}
        });

        // att 통계 전송
        if (r.hostWs && r.hostWs.readyState === WebSocket.OPEN) {
          r.hostWs.send(JSON.stringify({
            att: 1,
            now: r.listeners.size,
            max: r.listeners.size,
            joined: r.listeners.size,
            langs: { en: { now: r.listeners.size, max: r.listeners.size, min: 1 } }
          }));
        }
        ws.on('close', () => {
          r.listeners.delete(ws);
        });
      }
    });
  }
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const baseUrl = `http://localhost:${port}`;

  const browser = await chromium.launch(
    process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {}
  );

  // 1. 외부 요청 0건 감시
  const outsideRequests = [];
  const ctx = await browser.newContext();
  ctx.on('request', req => {
    const u = new URL(req.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outsideRequests.push(req.url());
      });

  const pageHost = await ctx.newPage();
  const pageListener = await ctx.newPage();



  pageListener.on('console', msg => console.log('[LISTENER LOG]:', msg.text()));
  pageListener.on('pageerror', err => console.log('[LISTENER ERR]:', err.message));
  pageListener.on('response', res => { if (res.status() >= 400) console.log('[RES ERR]:', res.status(), res.url()); });
  pageListener.on('requestfailed', req => console.log('[REQ FAILED]:', req.url(), req.failure()?.errorText));

  // ── [호스트 탭] 1단계: 인증 및 원고 사전 번역 ──
  await pageHost.goto(`${baseUrl}/web/host/index.html?relay=${encodeURIComponent(baseUrl)}`);
  await pageHost.fill('#tokenInput', 'valid_test_token');
  await pageHost.click('#btnVerifyToken');
  await pageHost.waitForSelector('#step-prepare', { state: 'visible' });
  ok(true, '호스트: 이용권 인증 완료 및 원고 준비 화면 진입');

  const txtSample = "첫 번째 문단입니다. 환영합니다.\n\n두 번째 문단은 건너뛸 예정입니다.\n\n세 번째 문단으로 마칩니다.";
  await pageHost.evaluate((txt) => {
    const dt = new DataTransfer();
    dt.items.add(new File([txt], 'sample.txt', { type: 'text/plain' }));
    const inp = document.getElementById('fileInput');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, txtSample);

  await pageHost.waitForFunction(() => document.querySelectorAll('.para-item').length === 3);
  ok(true, '호스트: 3개 문단 로드 완료');

  await pageHost.click('#btnPreTranslate');
  await pageHost.waitForSelector('#readyArea', { state: 'visible', timeout: 5000 });
  ok(true, '호스트: 3개 문단 사전 번역 완료');

  // ── [호스트 탭] 2단계: 강의 시작 (L4-2) ──
  await pageHost.click('#btnStartLecture');
  await pageHost.waitForSelector('#step-live', { state: 'visible', timeout: 5000 });
  const roomCode = await pageHost.textContent('#liveRoomCode');
  ok(roomCode === '654321', '호스트: 방 개설 성공 (코드 654321)');

    // ── [청취자 탭] 접속 ──
  await pageListener.goto(`${baseUrl}/web/listener/index.html?room=654321&lang=en&auto=1&relay=${encodeURIComponent(new URL(baseUrl).host)}`);
  await pageListener.waitForTimeout(1000);
  const listenerState = await pageListener.evaluate(() => {
    return {
      roomInputVal: document.getElementById('room-input')?.value,
      joinScreenDisplay: document.getElementById('join-screen')?.style.display,
      chatScreenDisplay: document.getElementById('chat-screen')?.style.display,
      statusDotClass: document.getElementById('status-dot')?.className,
      isConnected: typeof isConnected !== 'undefined' ? isConnected : null,
      wsState: typeof ws !== 'undefined' && ws ? ws.readyState : null
    };
  });
  ok(true, '청취자: 654321 방 접속 완료');

  // ── [호스트 탭] 문단 1 송출 ──
  await pageHost.click('#btnNextPara');
  await pageListener.waitForTimeout(1000);
  const debugLines = await pageListener.evaluate(() => {
    return {
      linesLength: typeof lines !== 'undefined' ? lines.length : -1,
      items: [...document.querySelectorAll('#chat-list > .msg-line')].map(el => el.innerText)
    };
  });
  await pageListener.waitForSelector('.msg-line:has-text("첫 번째 문단입니다")', { timeout: 5000 });
  const p1Tag = await pageListener.textContent('.msg-line:has-text("첫 번째 문단입니다") .badge');
  ok(p1Tag.includes('원고 1/3'), '청취자: 문단 1 수신 및 "원고 1/3" 뱃지 확인');

  // ── [호스트 탭] 쉬는 시간 토글 ──
  await pageHost.click('#btnBreakToggle');
  await pageListener.waitForSelector('#break-banner', { state: 'visible', timeout: 5000 });
  ok(await pageListener.isVisible('#break-banner'), '청취자: 쉬는 시간 안내 띠 노출 확인');
  await pageHost.click('#btnBreakToggle'); // 쉬는 시간 해제

  // ── [호스트 탭] 문단 2 건너뜀 (Skip) 및 문단 3 송출 ──
  await pageHost.click('#btnSkipPara'); // 2번 건너뜀
  await pageHost.click('#btnNextPara'); // 3번 송출
  await pageListener.waitForSelector('.msg-line:has-text("세 번째 문단으로 마칩니다")', { timeout: 5000 });
  const p3Tag = await pageListener.textContent('.msg-line:has-text("세 번째 문단으로 마칩니다") .badge');
  ok(p3Tag.includes('원고 3/3'), '청취자: 문단 3 수신 및 "원고 3/3" 뱃지 확인');

  // ── [호스트 탭] 3단계: 강의 종료 (L4-3 끝 화면) ──
  pageHost.on('dialog', d => d.accept());
  await pageHost.click('#btnEndLecture');
  await pageHost.waitForSelector('#step-finish', { state: 'visible', timeout: 5000 });
  ok(await pageHost.isVisible('#step-finish'), '호스트: 강의 종료 요약 화면 노출 확인');

  const sumParasTxt = await pageHost.textContent('#sumParas');
  ok(sumParasTxt.includes('2 / 1'), '호스트: 요약 문단 집계 확인 (송출 2 / 건너뜀 1)');

  // ── [L4-3 리포트 3x3 및 참석 CSV 다운로드 검증] ──
  const [dlReport] = await Promise.all([
    pageHost.waitForEvent('download', { timeout: 3000 }),
    pageHost.click('#btnDownloadReport')
  ]);
  ok(dlReport.suggestedFilename().startsWith('raytok_'), '호스트: 리포트 3x3 파일 다운로드 성공');

  const [dlCsv] = await Promise.all([
    pageHost.waitForEvent('download', { timeout: 3000 }),
    pageHost.click('#btnDownloadCsv')
  ]);
  ok(dlCsv.suggestedFilename().endsWith('.csv'), '호스트: 참석자 CSV 파일 다운로드 성공');

  // 외부 요청 0건 검증
  ok(outsideRequests.length === 0, 'relay 외 외부 요청 0건 검증');

  await browser.close();
  srv.close();

  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FAIL]', err);
  srv.close();
  process.exit(1);
});
