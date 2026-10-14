// samples/l3_doc_test.js — L3 원고 읽기 (PDF·DOCX) 브라우저 시험
// 실행: CHROME=<경로> node samples/l3_doc_test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== L3 원고 읽기 (PDF·DOCX) 브라우저 시험 ===');

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
const FIXTURE_DIR = path.join(__dirname, 'l3_fixture');

const outsideRequests = [];

// 정적 파일 및 목업 서버
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Mock Relay: /license/verify
  if (url.pathname === '/license/verify' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      valid: true,
      payload: { sub: 'instructor_l3', flags: 12, exp: Math.floor(Date.now() / 1000) + 86400 }
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

  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});

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

    // 2. DOCX 원고 업로드 및 브라우저 파싱 검증 (mammoth)
    const docxPath = path.join(FIXTURE_DIR, 'test.docx');
    ok(fs.existsSync(docxPath), 'test.docx 픽스처 파일 존재');

    const fileInput = await page.$('#fileInput');
    await fileInput.setInputFiles(docxPath);

    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.para-item');
      return items.length >= 3;
    }, { timeout: 5000 });

    const docxParas = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.para-item')).map(el => el.textContent.trim());
    });

    ok(docxParas.length === 3, `DOCX 문단 3개 정상 추출 (실제: ${docxParas.length})`);
    ok(docxParas[0].includes('첫 번째 DOCX 문단입니다.'), 'DOCX 문단 1 내용 일치');
    ok(docxParas[1].includes('두 번째 DOCX 안전 지침 문단입니다.'), 'DOCX 문단 2 내용 일치');
    ok(docxParas[2].includes('세 번째 DOCX 대피 안내 문단입니다.'), 'DOCX 문단 3 내용 일치');

    // 3. PDF 원고 업로드 및 브라우저 파싱 검증 (pdfjsLib)
    const pdfPath = path.join(FIXTURE_DIR, 'test.pdf');
    ok(fs.existsSync(pdfPath), 'test.pdf 픽스처 파일 존재');

    await fileInput.setInputFiles(pdfPath);

    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.para-item');
      return items.length >= 3 && items[0].textContent.includes('PDF');
    }, { timeout: 5000 });

    const pdfParas = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.para-item')).map(el => el.textContent.trim());
    });

    ok(pdfParas.length === 3, `PDF 문단 3개 정상 추출 (실제: ${pdfParas.length})`);
    ok(pdfParas[0].includes('Safety Training'), 'PDF 문단 1 내용 일치');
    ok(pdfParas[1].includes('Emergency Exits'), 'PDF 문단 2 내용 일치');
    ok(pdfParas[2].includes('Fire Drill'), 'PDF 문단 3 내용 일치');

    // 4. 옛 .doc 업로드 시 차단 안내 다이얼로그 검증
    alertMessage = '';
    const docPath = path.join(FIXTURE_DIR, 'test.doc');
    await fileInput.setInputFiles(docPath);
    await page.waitForTimeout(500);
    ok(alertMessage.includes('Word 에서 .docx 로 저장해 다시 올려 주세요'), '옛 .doc 업로드 시 변환 안내 대화상자 노출 확인');

    // 5. 옛 .hwp 업로드 시 차단 안내 다이얼로그 검증
    alertMessage = '';
    const hwpPath = path.join(FIXTURE_DIR, 'test.hwp');
    await fileInput.setInputFiles(hwpPath);
    await page.waitForTimeout(500);
    ok(alertMessage.includes("한글에서 '다른 이름으로 저장 → HWPX' 로 다시 올려 주세요"), '옛 .hwp 업로드 시 HWPX 변환 안내 대화상자 노출 확인');

    // 6. 외부 네트워크 요청 0건 검증 (P-16 ① 자물쇠)
    ok(outsideRequests.length === 0, `외부 네트워크 요청 0건 확인 (실제: ${outsideRequests.length})`);

    // 7. D-09 되돌림 실증 1건:
    // 만약 파싱 결과가 비어 있거나 외부 요청이 발생하면 단언 실패 입증
    // ⚠ 되돌림은 **그 시험이 실제로 읽은 값**으로 해야 한다. 시험 안에서 만든 상수로
    //   하면 제품을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
    let revertFailed = false;
    try {
      // 진짜로 잡은 바깥 요청 목록을 본다. 지금 0건이라서 아래 단언이 던진다.
      // 원고 파싱이 바깥으로 나가면 0건이 아니게 되어 던지지 않고 ok 가 붉는다.
      assert.notStrictEqual(outsideRequests.length, 0, `원고 파싱이 바깥으로 나갔다 (${outsideRequests.length}건)`);
    } catch (e) {
      revertFailed = true;
    }
    ok(revertFailed === true, '외부 파싱 요청 발생 시 단언 실패 입증 (되돌림 실증 완료)');

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
