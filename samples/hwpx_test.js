// samples/hwpx_test.js — L3-2 HWPX 원고 읽기 브라우저 시험
// 실행: CHROME=<경로> node samples/hwpx_test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== L3-2 HWPX 원고 읽기 (web/host/index.html) 브라우저 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const DIR = path.join(__dirname, '../web/host');
const ASSETS_DIR = path.join(__dirname, '../assets');
const VENDOR_DIR = path.join(__dirname, '../web/vendor');
const COMMON_DIR = path.join(__dirname, '../web/common');
const FIXTURE_DIR = path.join(__dirname, 'hwpx_fixture');

const outsideRequests = [];

// 정적 파일 및 목업 서버
const srv = http.createServer(async (req, res) => {
  console.log('REQ:', req.method, req.url);
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Mock Relay: /license/verify
  if (url.pathname === '/license/verify' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      valid: true,
      payload: { sub: 'instructor_hwpx', flags: 12, exp: Math.floor(Date.now() / 1000) + 86400 }
    }));
    return;
  }

  // Assets 서빙
  if (url.pathname.startsWith('/assets/')) {
    const f = path.join(ASSETS_DIR, url.pathname.replace('/assets/', ''));
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(f).pipe(res);
      return;
    }
  }

  // Vendor 서빙
  if (url.pathname.startsWith('/web/vendor/') || url.pathname.startsWith('/vendor/')) {
    const vf = path.join(VENDOR_DIR, url.pathname.replace(/^\/(web\/)?vendor\//, ''));
    if (fs.existsSync(vf)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(vf).pipe(res);
      return;
    }
  }

  // Common 서빙
  if (url.pathname.startsWith('/web/common/') || url.pathname.startsWith('/common/')) {
    const cf = path.join(COMMON_DIR, url.pathname.replace(/^\/(web\/)?common\//, ''));
    if (fs.existsSync(cf)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(cf).pipe(res);
      return;
    }
  }

  // Web Host 파일 서빙
  let filePath = path.join(DIR, url.pathname === '/' ? 'index.html' : url.pathname);
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
  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[BROWSER ERROR]', err.message));

  page.on('request', req => {
    const u = new URL(req.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      outsideRequests.push(req.url());
    }
  });

  let alertMessage = '';
  page.on('dialog', async dialog => {
    alertMessage = dialog.message();
    await dialog.accept();
  });

  try {
    await page.goto(`http://localhost:${port}/?relay=http://localhost:${port}`);

    // 1. 호스트 로그인
    await page.fill('#tokenInput', 'valid_test_token');
    await page.click('#btnVerifyToken');
    await page.waitForSelector('#step-prepare', { state: 'visible', timeout: 5000 });
    ok(true, '강사 화면 준비 뷰 진입');

    // 2. test.hwpx 파일 업로드 (문단 3 + 표 1칸 + 머리말 1)
    const hwpxPath = path.join(FIXTURE_DIR, 'test.hwpx');
    ok(fs.existsSync(hwpxPath), 'test.hwpx 픽스처 파일 존재');

    const fileInput = await page.$('#fileInput');
    await fileInput.setInputFiles(hwpxPath);

    // 문단 로드 대기 (문단 목록 렌더링)
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.para-item');
      return items.length >= 4;
    }, { timeout: 5000 });

    const paras = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.para-item'));
      return items.map(el => el.textContent.trim());
    });

    // 검증 1: 문단 4개 (일반 문단 3 + 표 안 문단 1)
    ok(paras.length === 4, `추출된 문단 수 4개 (실제: ${paras.length})`);
    ok(paras[0].includes('첫 번째 관공서 교육 원고'), '문단 1 텍스트 일치');
    ok(paras[1].includes('두 번째 작업장 안전 수칙'), '문단 2 텍스트 일치');
    ok(paras[2].includes('세 번째 화재 대피 요령'), '문단 3 텍스트 일치');
    ok(paras[3].includes('표 안에 작성된 네 번째 문단'), '표 안 문단 4 텍스트 일치');

    // 검증 2: 머리말 0개, 꼬리말/각주 0개
    const hasHeader = paras.some(p => p.includes('머리말'));
    const hasFooter = paras.some(p => p.includes('꼬리말'));
    const hasFootNote = paras.some(p => p.includes('각주'));
    ok(!hasHeader, '머리말 텍스트 제외 확인 (머리말 0)');
    ok(!hasFooter, '꼬리말 텍스트 제외 확인 (꼬리말 0)');
    ok(!hasFootNote, '각주 텍스트 제외 확인 (각주 0)');

    // 3. 옛 .hwp 파일 업로드 시 안내 검증
    const dummyHwpPath = path.join(FIXTURE_DIR, 'dummy.hwp');
    fs.writeFileSync(dummyHwpPath, 'HWP Document Binary Data');
    try {
      alertMessage = '';
      await fileInput.setInputFiles(dummyHwpPath);
      await page.waitForTimeout(500);
      ok(alertMessage.includes("한글에서 '다른 이름으로 저장 → HWPX' 로 다시 올려 주세요"), '.hwp 안내 대화상자 노출 확인: ' + alertMessage);
    } finally {
      if (fs.existsSync(dummyHwpPath)) fs.unlinkSync(dummyHwpPath);
    }

    // 4. 외부 네트워크 요청 0건 검증
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
