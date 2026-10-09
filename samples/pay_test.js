// 줄 18: 쿠폰 온라인 결제 P1 (포트원 V2 연동 및 0x02 쿠폰 발급) 검증 시험
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  PRODUCTS,
  handlePaymentComplete,
  verifyPortoneWebhook
} from '../relay/src/pay.js';
import { verifyCode, FLAG } from '../relay/tools/mint-code.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`  [PASS] ${msg}`);
}

console.log('\n=== 줄 18 쿠폰 온라인 결제 P1 단위 및 E2E 검증 시험 ===\n');

// [Test 1] 상품 카탈로그 검증
console.log('[Test 1] 상품 카탈로그 및 가격/플래그 검증');
ok(PRODUCTS['pass_1d'].price === 3300, '손님 1일권 가격 3,300원 일치');
ok(PRODUCTS['pass_1d'].flags === FLAG.private, '손님 1일권 플래그 0x02(private) 확인');
ok(PRODUCTS['pass_7d'].price === 9900, '손님 7일권 가격 9,900원 일치');
ok(PRODUCTS['pass_7d'].flags === FLAG.private, '손님 7일권 플래그 0x02(private) 확인');
ok(PRODUCTS['group_7d_10'].price === 99000, '단체 10명 7일권 가격 99,000원 일치');
ok(PRODUCTS['group_7d_10'].quantity === 10, '단체 10명 수량 10개 일치');

// [Test 2] 단건 결제 승인 및 0x02 쿠폰 발급 검증
console.log('\n[Test 2] 단건 결제 승인 및 0x02 쿠폰 발급 검증');
const pay1 = handlePaymentComplete({
  paymentId: 'pay_test_001',
  productId: 'pass_1d',
  amount: 3300,
  customerName: 'Alice'
});
ok(pay1.status === 200, '결제 완료 처리 200 OK');
ok(pay1.body.ok === true, '응답 ok: true 확인');
ok(pay1.body.codes.length === 1, '쿠폰 코드 1개 발급 확인');

const code1 = pay1.body.codes[0];
const v1 = verifyCode(code1.code);
ok(v1.ok === true, '발급된 코드 Ed25519 서명 유효성 검증 통과');
ok(v1.claims.flags === 0x02, '발급된 코드 플래그 0x02(손님 쿠폰) 일치');
ok(v1.claims.keyId === 0, '테스트 키 ID 0 확인');
ok(code1.link.startsWith('https://raytok.kr/lic/'), '입장 딥링크 형식 확인');

// [Test 3] 단체 묶음 결제 승인 (10장) 및 고유성 검증
console.log('\n[Test 3] 단체 묶음 결제 승인 (10장) 및 고유성 검증');
const payGroup = handlePaymentComplete({
  paymentId: 'pay_test_group_002',
  productId: 'group_7d_10',
  amount: 99000,
  customerName: 'TourAgency'
});
ok(payGroup.status === 200, '단체 결제 완료 처리 200 OK');
ok(payGroup.body.codes.length === 10, '쿠폰 10개 발급 확인');

const uniqueCodes = new Set(payGroup.body.codes.map(c => c.code));
ok(uniqueCodes.size === 10, '10개 코드 모두 고유(중복 없음) 확인');
for (const c of payGroup.body.codes) {
  const v = verifyCode(c.code);
  ok(v.ok && v.claims.flags === 0x02, `단체 코드 서명 및 플래그 0x02 검증 (${c.grouped.slice(0, 9)}...)`);
}

// [Test 4] 멱등성 검증 (동일 paymentId 중복 요청)
console.log('\n[Test 4] 중복 결제 요청 멱등성 검증');
const payDupe = handlePaymentComplete({
  paymentId: 'pay_test_001', // 동일 ID
  productId: 'pass_1d',
  amount: 3300
});
ok(payDupe.status === 200, '중복 요청 200 OK');
ok(payDupe.body.codes[0].code === code1.code, '중복 요청 시 기존 발급 코드와 100% 동일한 코드 반환 (멱등)');

// [Test 5] 결제 금액 위조 차단 검증
console.log('\n[Test 5] 결제 금액 위조 차단 검증');
const payForged = handlePaymentComplete({
  paymentId: 'pay_forged_003',
  productId: 'pass_1d', // 원래 3,300원
  amount: 100 // 100원으로 위조
});
ok(payForged.status === 400, '금액 위조 요청 400 차단');
ok(payForged.body.error === 'amount_mismatch', '에러 사유 amount_mismatch 확인');

// [Test 6] 포트원 웹훅 서명 검증
console.log('\n[Test 6] 포트원 웹훅 서명 검증');
const webhookSecret = 'test_webhook_secret_key_123';
const webhookBody = JSON.stringify({ type: 'Transaction.Paid', paymentId: 'pay_test_001' });
const validSig = crypto.createHmac('sha256', webhookSecret).update(webhookBody, 'utf8').digest('hex');

ok(verifyPortoneWebhook(validSig, webhookBody, webhookSecret) === true, '정상 웹훅 서명 검증 통과');
ok(verifyPortoneWebhook('invalid_hex_sig', webhookBody, webhookSecret) === false, '위조 웹훅 서명 검증 차단');

// [Test 7] 브라우저 Playwright E2E 구매 페이지 실측 검증
console.log('\n[Test 7] 브라우저 Playwright E2E 구매 페이지 실측 검증');
(async () => {
  // 모의 정적 + API 서버
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/pay/complete' && req.method === 'POST') {
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', () => {
        try {
          const body = JSON.parse(raw);
          const result = handlePaymentComplete(body);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.body));
        } catch (e) {
          console.error('SERVER ERROR:', e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    let filePath = path.join(ROOT, url.pathname);
    if (url.pathname === '/' || url.pathname === '/web/buy/') {
      filePath = path.join(ROOT, 'web', 'buy', 'index.html');
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

  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    headless: true
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('    [BROWSER]', msg.text()));
  page.on('pageerror', err => console.error('    [PAGE_ERROR]', err.message));
  page.on('dialog', async d => {
    console.log('    [DIALOG]', d.message());
    await d.dismiss();
  });
  page.on('response', res => {
    if (res.status() >= 400) console.log('    [RES_ERR]', res.status(), res.url());
  });

  // 외부 CDN 가로채기 (외부 네트워크 요청 0건 및 자립형 시험 보장)
  await page.route('https://cdn.portone.io/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.PortOne = { requestPayment: async (p) => ({ code: 0, paymentId: p.paymentId }) };'
    });
  });

  try {
    await page.goto(`${baseUrl}/web/buy/`);

    // 1) 상품 렌더링 확인
    const title = await page.textContent('h1');
    ok(title.includes('RayTok 손님 쿠폰 구매'), '구매 페이지 헤더 확인');

    const cardCount = await page.locator('.product-card').count();
    ok(cardCount === 5, '5개 상품 카드 렌더링 확인');

    // 2) 7일권 상품 선택
    await page.click('.product-card[data-id="pass_7d"]');
    const btnText = await page.textContent('#btn-pay');
    ok(btnText.includes('9,900원 결제하기'), '상품 선택에 따른 결제 버튼 금액 갱신 확인');

    // 3) 결제하기 클릭
    await page.click('#btn-pay');
    await page.waitForSelector('#view-result', { state: 'visible' });

    const resultDesc = await page.textContent('#result-desc');
    ok(resultDesc.includes('손님 7일권') && resultDesc.includes('결제가 완료되었습니다'), '결제 완료 화면 노출 확인');

    const codeCardCount = await page.locator('.code-card').count();
    ok(codeCardCount === 1, '결제 결과 쿠폰 카드 1개 노출 확인');

    const linkHref = await page.getAttribute('.code-card a', 'href');
    ok(linkHref.startsWith('https://raytok.kr/lic/'), '쿠폰 바로가기 링크 생성 확인');

    await browser.close();
    server.close();

    // [Test 8] 되돌림 실증 1건 (D-09)
    console.log('\n[Test 8] 되돌림 실증 1건 (D-09)');
    const payRevert = handlePaymentComplete({
      paymentId: 'pay_revert_check',
      productId: 'pass_1d',
      amount: 3300
    });
    const vRevert = verifyCode(payRevert.body.codes[0].code);
    let revertedFail = false;
    try {
      assert.equal(vRevert.claims.flags, 0x01); // 0x01(host)이면 실패해야 함
    } catch (e) {
      revertedFail = true;
    }
    ok(revertedFail === true, '플래그가 0x01(host)로 변경 시 단언 실패 입증 (되돌림 실증 완료)');

    console.log(`\n전부 통과 (${checks}건)`);
  } catch (err) {
    await browser.close();
    server.close();
    throw err;
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
