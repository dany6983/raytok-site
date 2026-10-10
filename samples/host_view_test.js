// samples/host_view_test.js — L4-1 웹 강사 화면 (들어가기 + 준비) 단위 및 브라우저 시험
// 실행: CHROME=<경로> node samples/host_view_test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== L4-1 웹 강사 화면 (web/host/index.html) 검증 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const DIR = path.join(__dirname, '../web/host');
const ASSETS_DIR = path.join(__dirname, '../assets');
const VENDOR_DIR = path.join(__dirname, '../web/vendor');

// 목업 릴레이 및 정적 파일 서빙 HTTP 서버
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Mock Relay: /license/verify
  if (url.pathname === '/license/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      if (data.token === 'valid_test_token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          valid: true,
          payload: { sub: 'instructor_1', flags: 12, exp: Math.floor(Date.now() / 1000) + 86400 }
        }));
      } else if (data.token === 'empty_body') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(); // Empty body
      } else if (data.token === 'timeout_token') {
        // Do nothing, let it timeout
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, message: 'Invalid signature' }));
      }
    });
    return;
  }

  // Mock Relay: /translate
  if (url.pathname === '/translate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        translatedText: `[${data.target}] ` + data.q
      }));
    });
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

  // 1. 외부 요청 0건 (relay 및 localhost 제외) 검증
  const outsideRequests = [];
  page.on('request', req => {
    const u = new URL(req.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      outsideRequests.push(req.url());
    }
  });

  await page.goto(`http://localhost:${port}/?relay=http://localhost:${port}`);

  ok(await page.isVisible('#step-auth'), '초기 화면: 이용권 인증 화면 표시');
  ok(!(await page.isVisible('#step-prepare')), '초기 화면: 원고 준비 화면 숨김');

  // 2. 잘못된 토큰 입력 시 에러 표시
  await page.fill('#tokenInput', 'wrong_token');
  await page.click('#btnVerifyToken');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#authError'), '잘못된 토큰 입력 시 에러 메시지 표시');

  // 2-1. 빈 응답 서버 오류 검증 (9-2 빈-답 시험)
  await page.fill('#tokenInput', 'empty_body');
  await page.click('#btnVerifyToken');
  await page.waitForTimeout(500);
  const emptyErr = await page.textContent('#authError');
  ok(emptyErr.includes('빈'), '빈 응답 시 올바른 에러 메시지 처리 확인');

  // 2-2. 시간 초과(Timeout) 서버 오류 검증 (9-2 빈-답 시험)
  await page.fill('#tokenInput', 'timeout_token');
  await page.click('#btnVerifyToken');
  // AbortSignal.timeout(5000)을 테스트하기 위해 시간을 모의할 수는 없으므로 실제 타임아웃을 기다린다
  await page.waitForTimeout(5500);
  const timeoutErr = await page.textContent('#authError');
  ok(timeoutErr.includes('초과'), '응답 시간 초과(5초) 시 올바른 에러 메시지 처리 확인');

  // 3. 올바른 토큰 입력 ➔ 준비 화면 전환
  await page.fill('#tokenInput', 'valid_test_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible', timeout: 5000 });
  ok(await page.isVisible('#step-prepare'), '올바른 토큰 인증 성공 ➔ 준비 화면 활성화');
  ok(!(await page.isVisible('#step-auth')), '준비 화면 진입 후 인증 화면 숨김');

  // 4. 원고 파일(TXT) 처리 및 문단 분리 테스트
  const sampleTxt = `안녕하세요. 오늘 현장 교육을 시작하겠습니다.\n\n첫 번째 안전 수칙은 보호구 착용입니다.\n작업장 내에서는 안전모와 안전화를 반드시 착용해 주세요.\n\n두 번째는 비상 대피로 확인입니다.`;

  await page.evaluate((txt) => {
    const dt = new DataTransfer();
    const file = new File([txt], 'sample_lecture.txt', { type: 'text/plain' });
    dt.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, sampleTxt);

  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 3);
  const parasCount = await page.$$eval('.para-item', els => els.length);
  ok(parasCount === 3, 'TXT 원고: 3개 문단 자동 분리 확인');

  // 5. 문단 합치기 (mergeWithNext) 테스트
  await page.click('.para-item:first-child .btn-action:has-text("아래와 합치기")');
  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 2);
  const mergedCount = await page.$$eval('.para-item', els => els.length);
  ok(mergedCount === 2, '문단 합치기 후 2개 문단으로 축소 확인');

  // 6. 사전 번역 실행 (릴레이 호출)
  await page.click('#btnPreTranslate');
  await page.waitForSelector('#readyArea', { state: 'visible', timeout: 8000 });
  ok(await page.isVisible('#readyArea'), '미리 번역 완료 후 준비 완료 영역 표시');

  // 7. IndexedDB 저장 검증
  const dbData = await page.evaluate(async () => {
    return await loadParagraphsFromDB();
  });
  ok(Array.isArray(dbData) && dbData.length === 2, 'IndexedDB: 2개 문단 저장 확인');
  ok(dbData[0].trans && dbData[0].trans.en && dbData[0].trans.en.includes('[en]'), 'IndexedDB: 사전 번역문 저장 확인');

  // 8. 바깥 요청 0건 검증
  ok(outsideRequests.length === 0, 'relay 외 외부 요청 0건 검증');

  // 9. L3 옛 .doc 업로드 시 경고 안내 검증
  let alertMsg = '';
  page.on('dialog', async dialog => {
    alertMsg = dialog.message();
    await dialog.accept();
  });

  await page.evaluate(() => {
    const dt = new DataTransfer();
    const file = new File(['binary_content'], 'legacy_sample.doc', { type: 'application/msword' });
    dt.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.waitForTimeout(300);
  ok(alertMsg.includes('Word 에서 .docx 로 저장해 다시 올려 주세요'), '.doc 업로드 시 .docx 안내 대화상자 노출 확인');

  // 10. L3 vendor 모듈(pdfjsLib, mammoth) 브라우저 로드 확인
  const vendorLoaded = await page.evaluate(() => {
    return {
      pdfjs: typeof window.pdfjsLib !== 'undefined',
      mammoth: typeof window.mammoth !== 'undefined'
    };
  });
  ok(vendorLoaded.pdfjs && vendorLoaded.mammoth, 'web/vendor 내 pdf.js 및 mammoth 브라우저 정상 로드 확인');


  await browser.close();
  srv.close();

  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FAIL]', err);
  srv.close();
  process.exit(1);
});
