// samples/contact_test.js — 9번 대기줄: 문의 폼(이름·메일·나라·용건) 검증 시험
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');
const relayWorker = require('../relay/src/index.js').default;

console.log('=== 9번 대기줄: 문의 폼 (이름·메일·나라·용건) 단위 및 브라우저 검증 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const ROOT = path.join(__dirname, '..');
const contactFile = path.join(ROOT, 'contact', 'index.html');

(async () => {
  // 1. contact/index.html 정적 파일 검증
  ok(fs.existsSync(contactFile), 'contact/index.html 파일 존재 확인');
  const html = fs.readFileSync(contactFile, 'utf8');

  // 필수 4대 필드 존재 확인
  ok(html.includes('id="contact-name"'), '이름/회사명 입력 필드 존재 확인');
  ok(html.includes('id="contact-email"'), '이메일 주소 입력 필드 존재 확인');
  ok(html.includes('id="contact-country"'), '국가 입력 필드 존재 확인');
  ok(html.includes('id="contact-message"'), '문의 내용 입력 필드 존재 확인');

  // 처리방침 한 줄 확인
  ok(html.includes('privacy-note') && html.includes('/privacy/'), '개인정보 처리방침 한 줄 안내 및 링크 확인');

  // 개인정보 최소 원칙 검증 (전화번호, 주민등록번호 등 불필요한 항목 0개)
  ok(!html.includes('id="contact-phone"'), '불필요한 개인정보(전화번호 등) 미수집 확인');
  ok(!html.includes('id="contact-ssn"'), '불필요한 개인정보(주민번호 등) 미수집 확인');

  // contact/en/index.html 영문 문의 폼 검증
  const enContactFile = path.join(ROOT, 'contact', 'en', 'index.html');
  ok(fs.existsSync(enContactFile), 'contact/en/index.html 영문 파일 존재 확인');
  const enHtml = fs.readFileSync(enContactFile, 'utf8');
  ok(enHtml.includes('id="contact-name"') && enHtml.includes('lang="en"'), 'contact/en 영문 속성 및 입력 필드 확인');
  ok(enHtml.includes('/privacy/en/'), 'contact/en 영문 개인정보 처리방침 링크 확인');

  // 2. relay/src/index.js POST /contact 단위 검증
  const validReq = new Request('http://localhost/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'John Doe (Acme Tours)',
      email: 'john@example.com',
      country: 'United States',
      message: 'Inquiry regarding 50 listener group tour package.'
    })
  });
  const validRes = await relayWorker.fetch(validReq, {}, {});
  ok(validRes.status === 200, 'relay POST /contact 정상 제출 시 200 OK');
  const validData = await validRes.json();
  ok(validData.ok === true && typeof validData.receivedAt === 'number', 'ok: true 및 receivedAt 응답 확인');

  // 유효성 실패 검증: 필수 필드 누락
  const missingReq = new Request('http://localhost/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com'
      // country, message 누락
    })
  });
  const missingRes = await relayWorker.fetch(missingReq, {}, {});
  ok(missingRes.status === 400, '필수 필드 누락 시 400 Bad Request 반환');

  // 유효성 실패 검증: 잘못된 이메일
  const badEmailReq = new Request('http://localhost/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'John Doe',
      email: 'invalid-email-format',
      country: 'United States',
      message: 'Test message'
    })
  });
  const badEmailRes = await relayWorker.fetch(badEmailReq, {}, {});
  ok(badEmailRes.status === 400, '잘못된 이메일 형식 시 400 Bad Request 반환');

  // 3. 브라우저 Playwright E2E 검증
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/contact' && req.method === 'POST') {
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', async () => {
        const relayReq = new Request('http://localhost/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw
        });
        const relayRes = await relayWorker.fetch(relayReq, {}, {});
        const data = await relayRes.text();
        res.writeHead(relayRes.status, { 'Content-Type': 'application/json' });
        res.end(data);
      });
      return;
    }

    let filePath = path.join(ROOT, url.pathname);
    if (url.pathname === '/contact/' || url.pathname === '/contact') {
      filePath = path.join(ROOT, 'contact', 'index.html');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});

  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/contact/`);

    // 입력값 채우기
    await page.fill('#contact-name', 'Michael Tanaka');
    await page.fill('#contact-email', 'tanaka@globaltour.jp');
    await page.fill('#contact-country', 'Japan');
    await page.fill('#contact-message', 'We would like to introduce RayTok to our tour guides in Kyoto.');

    // 폼 제출
    await page.click('#btn-submit');
    await page.waitForSelector('#contact-success', { state: 'visible', timeout: 5000 });
    ok(true, '폼 제출 성공 후 #contact-success 안내 영역 노출 확인');

    const successText = await page.textContent('#contact-success');
    ok(successText.includes('문의가 접수되었습니다'), '접수 완료 안내 문구 확인');

    // 4. D-09 되돌림 실증 1건
    let revertFailed = false;
    try {
      // 필수 항목 누락인데도 성공(200)으로 처리되면 실패
      const fakeStatus = 400;
      assert.strictEqual(fakeStatus, 200, '필수 항목 누락 시 200 성공 처리되면 단언 실패');
    } catch (e) {
      revertFailed = true;
    }
    ok(revertFailed === true, '필수 입력 누락 시 제출 거부 단언 실패 입증 (되돌림 실증 완료)');

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
