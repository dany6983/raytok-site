// samples/desk_view_test.js — Desk 세션 꺼내 보기 및 검증 연동 브라우저 시험
// 실행: CHROME=<경로> node samples/desk_view_test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== L12 Desk 세션 꺼내 보기 (web/desk/index.html) 브라우저 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const DESK_DIR = path.join(__dirname, '../web/desk');
const VERIFY_DIR = path.join(__dirname, '../web/verify');
const ASSETS_DIR = path.join(__dirname, '../assets');

const outsideRequests = [];

// 정본 예시 2 (이름 가린 세션)
const mockSessionDetail = {
  ver: 1,
  session: { code: '483921', host: 'SM-F971N', lang: 'ko', started: 1759885200000 },
  items: [
    {
      kind: 'begin', ts: 1759885200000, session: '483921', host: 'SM-F971N', lang: 'ko',
      n: 1, prev: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: 'a8cd1dd0c95414d4844e719cc8648ace1ee857e6b746d0d0b971fd5c6a01a5de'
    },
    {
      kind: 'join', ts: 1759885260000, dev: 'a1b2c3', name: '', lang: 'en',
      n: 2, prev: 'a8cd1dd0c95414d4844e719cc8648ace1ee857e6b746d0d0b971fd5c6a01a5de',
      hash: 'f28fa962533d588362c822c0db4e7cb80300abbe75d5a4b5884952ae6a1830d3'
    },
    {
      kind: 'line', ts: 1759885320000, seq: 1, src: 'ko', text: '안전모를 쓰세요',
      tr: { en: 'Wear a helmet' }, via: '',
      n: 3, prev: 'f28fa962533d588362c822c0db4e7cb80300abbe75d5a4b5884952ae6a1830d3',
      hash: 'a49a121bb59dc5b69ec909059c2b635ebfb814be64880a1f02e7cf4c59b6a3b0'
    },
    {
      kind: 'leave', ts: 1759886460000, dev: 'a1b2c3', why: 'end',
      n: 4, prev: 'a49a121bb59dc5b69ec909059c2b635ebfb814be64880a1f02e7cf4c59b6a3b0',
      hash: '3b467a5e8855c9644669049b6796e7883f3b521f67c80d50de39ce9040a24c7d'
    },
    {
      kind: 'end', ts: 1759886460000, lines: 1, minutes: 21, joined_max: 1,
      n: 5, prev: '3b467a5e8855c9644669049b6796e7883f3b521f67c80d50de39ce9040a24c7d',
      hash: '1f123c8f29d4ce4f92d4dc1602d9876a3c377097a10f2d6bb3eb2fa54b8f34b4'
    }
  ],
  last: '1f123c8f29d4ce4f92d4dc1602d9876a3c377097a10f2d6bb3eb2fa54b8f34b4'
};

const srv = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1) 릴레이 API Mock: GET /desk/sessions
  if (url.pathname === '/desk/sessions' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { id: 'ds_test_01', code: '483921', host: 'SM-F971N', started: 1759885200000, count: 5 }
    ]));
    return;
  }

  // 2) 릴레이 API Mock: GET /desk/session/:id
  if (url.pathname.startsWith('/desk/session/') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockSessionDetail));
    return;
  }

  // 2-1) DELETE /desk/session/:id
  if (url.pathname.startsWith('/desk/session/') && req.method === 'DELETE') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, deleted: 'ds_test' }));
    return;
  }

  // 3) Assets
  if (url.pathname.startsWith('/assets/')) {
    const f = path.join(ASSETS_DIR, url.pathname.replace('/assets/', ''));
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(f).pipe(res);
      return;
    }
  }

  // 4) web/verify
  if (url.pathname.startsWith('/verify/')) {
    const p = path.join(VERIFY_DIR, url.pathname.replace(/^\/verify\//, '') || 'index.html');
    if (fs.existsSync(p)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(p).pipe(res);
      return;
    }
  }

  // 5) web/desk
  const filePath = path.join(DESK_DIR, url.pathname === '/' || url.pathname === '/desk/' ? 'index.html' : url.pathname.replace(/^\/desk\//, ''));
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;

  const browser = await chromium.launch(
    process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {}
  );
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();

  page.on('request', req => {
    const u = new URL(req.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      outsideRequests.push(req.url());
    }
  });

  try {
    await page.goto(`http://localhost:${port}/desk/?relay=http://localhost:${port}`);

    // 1. 토큰 입력 및 조회
    await page.fill('#input-token', 'test_desk_token_0x08');
    await page.click('#btn-auth');

    // 2. 세션 목록 노출 확인
    await page.waitForSelector('#view-list:not(.hidden)', { timeout: 3000 });
    const countText = await page.textContent('#session-count');
    ok(countText === '1', '세션 목록 1건 노출 확인');
    ok(await page.isVisible('.session-item'), '세션 카드 렌더링 확인');

    // 3. 세션 카드 클릭 -> 상세 타임라인 진입
    await page.click('.session-item');
    await page.waitForSelector('#view-detail:not(.hidden)', { timeout: 3000 });
    ok(await page.textContent('#detail-code') === '483921', '회의 코드 483921 상세 표시 확인');

    // 타임라인 항목 내용 확인
    const timelineText = await page.textContent('#timeline');
    ok(timelineText.includes('안전모를 쓰세요'), '원문 줄 텍스트 표시 확인');
    ok(timelineText.includes('Wear a helmet'), '번역 줄 텍스트 표시 확인');
    ok(timelineText.includes('(익명)'), '이름 가린 세션 익명 표시 확인');

    // 4. JSON 내려받기 단추 및 삭제 단추 존재 확인
    ok(await page.isVisible('#btn-download'), 'JSON 내려받기 단추 노출 확인');
    ok(await page.isVisible('#btn-delete'), '기록 삭제 단추 노출 확인');

    // 5. 검증 단추 클릭 -> web/verify 로 이동하여 통과 뱃지 확인
    await page.click('#btn-verify');
    await page.waitForURL(`**/verify/**`, { timeout: 3000 });
    await page.waitForSelector('#result-card', { state: 'visible', timeout: 3000 });
    await page.waitForFunction(() => {
      const b = document.getElementById('result-badge');
      return b && b.textContent.includes('통과');
    }, { timeout: 3000 });

    const badgeText = await page.textContent('#result-badge');
    ok(badgeText.includes('통과'), 'web/verify 이동 후 해시 체인 자동 검증 "통과" 확인');

    // 6. 외부 요청 0건 검증
    ok(outsideRequests.length === 0, `외부 네트워크 요청 0건 확인 (실제: ${outsideRequests.length})`);

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  srv.close();
  process.exit(1);
});
