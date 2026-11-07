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
  /* 2026-11-07 (claude-22): 이 시험은 env 를 `{}` 로 주고 200 을 바랐다. 그런데 10-31 에
   * 「저장할 곳이 없으면 받았다고 하지 않는다」는 보초가 들어갔다(relay/src/index.js §/contact).
   * 그래서 시험은 **옛것**이 되어 붉은 채 며칠 있었다. 운영에는 LEADS(KV)가 붙어 있다
   * (relay/wrangler.toml, 10-31 id 기입) — 코드가 아니라 시험이 틀렸다.
   * 고치는 방향: 저장소를 흉내만 내서 주고, **보초 자체도 따로 센다**(아래 Test 2-0). */
  const kvPuts = new Map();
  const mockLeads = { put: async (k, v) => { kvPuts.set(k, v); } };

  // Test 2-0: 저장소가 없으면 200 을 주지 않는다 (조용히 삼키지 않는다 — 10-31 보초)
  const noStoreRes = await relayWorker.fetch(validReq.clone(), {}, {});
  ok(noStoreRes.status === 503, '저장소(LEADS)가 없으면 503 — 받았다고 거짓말하지 않는다');
  const noStoreBody = await noStoreRes.json();
  ok(noStoreBody.error === 'storage_unconfigured' && !!noStoreBody.email,
    '503 본문이 까닭과 대신 닿을 길(메일·DM)을 준다');

  const validRes = await relayWorker.fetch(validReq, { LEADS: mockLeads }, {});
  ok(validRes.status === 200, 'relay POST /contact 정상 제출 시 200 OK');
  ok(kvPuts.size === 2 && [...kvPuts.keys()].some((k) => k.startsWith('lead:')),
    '받은 문의가 저장소에 실제로 쓰였다 (lead: + todo: 두 줄)');
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
        // 2026-11-07 (claude-22): 여기도 env 가 `{}` 였다 → 릴레이가 503 을 주고
        // 브라우저엔 #contact-success 가 끝까지 안 떴다. 운영엔 LEADS 가 붙어 있다.
        const relayRes = await relayWorker.fetch(relayReq, { LEADS: { put: async () => {} } }, {});
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
    // ⚠ 되돌림은 **릴레이가 실제로 돌려준 답**(missingRes)으로 한다. 시험 안에서 만든 상수로 하면
    //   릴레이를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
    let revertFailed = false;
    try {
      // 필수 항목을 뺀 진짜 요청의 답을 본다. 지금 400 이라서 아래 단언이 던진다.
      // 유효성 검사를 빼면 200 이 되어 던지지 않고 ok 가 붉는다.
      assert.strictEqual(missingRes.status, 200, '필수 항목이 빠졌는데 200 으로 접수됐다');
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
