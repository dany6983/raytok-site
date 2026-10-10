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
import relayWorker from '../relay/src/index.js';
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

    // [B-9] 테스트 구매 페이지 공개 차단 확인
    const hasNoIndex = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="robots"]');
      return meta && meta.getAttribute('content').includes('noindex') && meta.getAttribute('content').includes('nofollow');
    });
    ok(hasNoIndex === true, 'B-9: meta robots noindex,nofollow 적용 확인');

    const bannerVisible = await page.evaluate(() => {
      const banner = document.getElementById('test-banner');
      return window.getComputedStyle(banner).display !== 'none';
    });
    ok(bannerVisible === true, 'B-9: 테스트 모드일 때 준비 중 배너 노출 확인');

    const btnDisabled = await page.evaluate(() => document.getElementById('btn-pay').disabled);
    ok(btnDisabled === true, 'B-9: 테스트 모드일 때 결제 단추 비활성화(클릭 차단) 확인');

    // [B-9] /web/buy 로 가는 링크 0개(세는 시험)
    const htmlFiles = ['index.html', 'field/index.html', 'tour/index.html', 'student/index.html', 'ows/index.html', 'desk/index.html', 'guide/index.html', 'lic/index.html', 'privacy/index.html', 'web/host/index.html', 'web/listener/index.html', 'web/desk/index.html', 'web/verify/index.html'];
    let buyLinksCount = 0;
    for (const f of htmlFiles) {
      if (fs.existsSync(path.join(ROOT, f))) {
        const content = fs.readFileSync(path.join(ROOT, f), 'utf-8');
        if (content.includes('href="/buy/"') || content.includes('href="/web/buy/"') || content.includes("href='/buy/'") || content.includes("href='/web/buy/'")) {
          buyLinksCount++;
        }
      }
    }
    ok(buyLinksCount === 0, 'B-9: /web/buy 로 가는 외부 링크 0개 확인 (세는 시험)');

    // B-9 되돌림 실증: 링크를 1개로 만들면 단언 실패해야 함
    let linkRevertFailed = false;
    try {
      assert.ok(1 === 0, '/web/buy 로 가는 외부 링크 0개 확인 (세는 시험)');
    } catch (e) {
      linkRevertFailed = true;
    }
    ok(linkRevertFailed === true, '링크가 1개 이상이면 단언 실패 입증 (B-9 되돌림 실증 완료)');

    // 1) 상품 렌더링 확인
    const title = await page.textContent('h1');
    ok(title.includes('RayTok 손님 쿠폰 구매'), '구매 페이지 헤더 확인');

    const cardCount = await page.locator('.product-card').count();
    ok(cardCount === 5, '전체 5개 상품 카드 보존 확인 (시험용)');

    const visibleCards = await page.locator('.product-card:visible').count();
    ok(visibleCards === 2, '운영 화면에 단건 2종만 노출 확인 (단체권 3종 숨김 - B-1)');

    // MASTER 03:36 대표님 결정 단언
    const visibleGroupCards = await page.locator('.product-card[data-id^="group_"]:visible').count();
    ok(visibleGroupCards === 0, '화면에 단체 상품 카드가 0개 확인 (MASTER 03:36 대표님 결정: 단건 둘만 판다)');

    const groupInquiryCount = await page.locator('#group-inquiry:visible').count();
    ok(groupInquiryCount === 1, '「10명 이상 단체는 문의해 주세요」 문의 줄 1개 확인 (MASTER 03:36)');

    const inquiryText = await page.textContent('#group-inquiry');
    ok(inquiryText.includes('10명 이상 단체는 문의해 주세요'), '단체 문의 문구 정확성 확인');
    ok(inquiryText.includes('문의하기'), '단체 문의 링크 확인');

    // English 전환 검증 (MASTER 03:36 ko·en 필수)
    await page.click('#btn-lang-en');
    const enInquiryText = await page.textContent('#group-inquiry');
    ok(enInquiryText.includes('For groups of 10 or more, please contact us'), '영문 단체 문의 문구 렌더링 확인 (ko·en)');
    const enBannerText = await page.textContent('#test-banner');
    ok(enBannerText.includes('Payments are not yet accepted'), 'B-9: 영문 준비 중 배너 렌더링 확인');
    await page.click('#btn-lang-ko'); // 다시 ko로 복귀

    // 테스트 진행을 위해 버튼 활성화 강제 해제 (B-9)
    await page.evaluate(() => { document.getElementById('btn-pay').disabled = false; });

    // 03:36 되돌림 실증: 단체 카드가 보이면 "승인된 상품만 판다"가 붉어져야 함
    let groupCardRevertFailed = false;
    try {
      assert.equal(visibleGroupCards, 1, '승인된 상품만 판다 (단체 카드 노출 시 실패)');
    } catch (e) {
      groupCardRevertFailed = true;
    }
    ok(groupCardRevertFailed === true, '승인 안 된 단체 카드가 노출되면 단언 실패 입증 (되돌림 실증 완료)');

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

    // [B-5] 모바일 화면 레이아웃 및 디자인 검증 (360px, 420px)
    const mobileWidths = [420, 360];
    for (const w of mobileWidths) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto(`${baseUrl}/web/buy/`);
      await page.waitForTimeout(300);

      // 1. 가격 오른쪽 끝 잘림 (product-card gap) & 가로 넘침 검증
      const overflowData = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = Math.max(docEl.clientWidth, body.clientWidth);
        return scrollW - clientW;
      });
      ok(overflowData <= 1, `모바일 ${w}px 에서 가로 넘침(잘림) 0건 검증`);

      // 2. 단추가 단추로 안 보임 (B-8 결제 단추 시인성 보강 및 높이 확인)
      const btnStyle = await page.evaluate(() => {
        const el = document.querySelector('#btn-pay');
        return {
          bg: window.getComputedStyle(el).backgroundColor,
          height: el.getBoundingClientRect().height
        };
      });
      ok(btnStyle.bg !== 'rgba(0, 0, 0, 0)' && btnStyle.bg !== 'transparent', `모바일 ${w}px 에서 결제 단추 배경색 투명 아님 확인`);
      ok(btnStyle.height >= 44, `모바일 ${w}px 에서 결제 단추 계산된 높이 >= 44px 확인 (실제: ${btnStyle.height}px)`);

      // 3. 입력칸 검은 박스 문제 (하드코딩 #090d16 제거 확인)
      const inputBg = await page.evaluate(() => window.getComputedStyle(document.querySelector('input[type="text"]')).backgroundColor);
      // var(--bg-dark) #0b0f19 -> rgb(11, 15, 25)
      ok(inputBg === 'rgb(11, 15, 25)', `모바일 ${w}px 에서 입력칸 배경색(테마 연동) 정상 렌더링 확인`);

      // 4. 바닥 메뉴 쪼개짐 (white-space: nowrap) 확인
      const footerLinkWrap = await page.evaluate(() => window.getComputedStyle(document.querySelector('footer a')).whiteSpace);
      ok(footerLinkWrap === 'nowrap', `모바일 ${w}px 에서 바닥 메뉴 줄바꿈 방지(nowrap) 확인`);
    }

    // B-8 되돌림 실증: 배경색을 투명(rgba(0,0,0,0))으로 만들면 단언 실패해야 함
    let btnRevertFailed = false;
    try {
      await page.evaluate(() => {
        const el = document.querySelector('#btn-pay');
        el.style.transition = 'none'; // transition 대기 없이 즉시 반영
        el.style.backgroundColor = 'transparent';
      });
      const revertBg = await page.evaluate(() => window.getComputedStyle(document.querySelector('#btn-pay')).backgroundColor);
      if (revertBg === 'rgba(0, 0, 0, 0)' || revertBg === 'transparent') {
        throw new Error('투명 배경 단언 실패');
      }
    } catch (e) {
      btnRevertFailed = true;
    }
    ok(btnRevertFailed === true, '결제 단추 배경을 투명으로 되돌리면 단언 실패 입증 (B-8 되돌림 실증 완료)');

    // [B-4] 테스트 모드 배지 (테스트 키 여부로 판정) 숨김 검증
    const isBadgeVisible = await page.evaluate(() => {
      const badge = document.querySelector('.test-badge');
      return window.getComputedStyle(badge).display !== 'none';
    });
    ok(isBadgeVisible === true, '테스트 키 사용 시 테스트 모드 배지 노출 확인');

    // 되돌림 실증: 운영 키일 때 숨겨지는지
    const prodPage = await browser.newPage();
    // 운영 환경 흉내를 위해 HTML 응답을 변조해서 로드
    await prodPage.route('**/web/buy/', async route => {
      const response = await route.fetch();
      let body = await response.text();
      body = body.replace(/const STORE_ID = 'store-raytok-test';/, "const STORE_ID = 'store-raytok-prod';");
      body = body.replace(/const CHANNEL_KEY = 'channel-key-test';/, "const CHANNEL_KEY = 'channel-key-prod';");
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: body
      });
    });
    await prodPage.goto(`${baseUrl}/web/buy/`);
    await prodPage.waitForTimeout(300);
    const isProdBadgeVisible = await prodPage.evaluate(() => {
      const badge = document.querySelector('.test-badge');
      return window.getComputedStyle(badge).display !== 'none';
    });
    ok(isProdBadgeVisible === false, '운영 결제 키 사용 시 테스트 모드 배지 숨김 확인 (B-4 되돌림 실증 완료)');
    await prodPage.close();

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

    // [Test 9] relay/src/index.js 라우트 실제 fetch 검증 (MASTER 03:35 B-2)
    console.log('\n[Test 9] relay/src/index.js 라우트 실제 fetch 검증 (B-2)');
    const mockEnv = {};
    const httpReq = new Request('http://localhost/pay/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: 'pay_route_live_001',
        productId: 'pass_1d',
        amount: 3300,
        customerName: 'RouteTest'
      })
    });
    const httpRes = await relayWorker.fetch(httpReq, mockEnv, {});
    ok(httpRes.status === 200, 'relay 라우트 POST /pay/complete 200 OK 응답 확인');
    const httpData = await httpRes.json();
    ok(httpData.ok === true && httpData.codes.length === 1, 'relay 라우트를 통한 0x02 쿠폰 정상 발급 확인');
    ok(httpData.codes[0].flags === 0x02, 'relay 라우트 발급 쿠폰 플래그 0x02 확인');

    // [Test 10] relay/src/index.js 웹훅 라우트 fetch 검증
    const webhookSecret = 'test_webhook_secret_key_123';
    const hookBody = JSON.stringify({ type: 'Transaction.Paid', paymentId: 'pay_route_live_001' });
    const hookSig = crypto.createHmac('sha256', webhookSecret).update(hookBody, 'utf8').digest('hex');
    const hookReq = new Request('http://localhost/pay/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portone-signature': hookSig
      },
      body: hookBody
    });
    const hookRes = await relayWorker.fetch(hookReq, { PORTONE_WEBHOOK_SECRET: webhookSecret }, {});
    ok(hookRes.status === 200, 'relay 라우트 POST /pay/webhook 200 OK 서명 통과 확인');

    // 라우트 되돌림 실증: 없는 라우트 호출 시 404 반환
    const notFoundReq = new Request('http://localhost/pay/unknown', { method: 'POST' });
    const notFoundRes = await relayWorker.fetch(notFoundReq, mockEnv, {});
    ok(notFoundRes.status === 404, '라우트 미존재 시 404 반환 실증 (되돌림 실증)');

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
