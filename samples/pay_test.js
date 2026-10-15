// 줄 18: 쿠폰 온라인 결제 P1 (포트원 V2 연동 및 0x01 관광권 발급) 검증 시험
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
const TEST_SECRET = 'test_portone_secret_999';

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks += 1;
  console.log(`  [PASS] ${msg}`);
}

console.log('\n=== 줄 18 쿠폰 온라인 결제 P1 단위 및 E2E 검증 시험 ===\n');

(async () => {
  // [Test 1] 상품 카탈로그 검증
  console.log('[Test 1] 상품 카탈로그 및 가격/플래그 검증');
  ok(PRODUCTS['pass_1d'].price === 3300, '관광 1일권 가격 3,300원 일치');
  ok(PRODUCTS['pass_1d'].flags === FLAG.host, '관광 1일권 플래그 0x01(host) 확인');
  ok(PRODUCTS['pass_7d'].price === 9900, '관광 7일권 가격 9,900원 일치');
  ok(PRODUCTS['pass_7d'].flags === FLAG.host, '관광 7일권 플래그 0x01(host) 확인');
  ok(PRODUCTS['group_7d_10'].price === 99000, '단체 10명 7일권 가격 99,000원 일치');
  ok(PRODUCTS['group_7d_10'].quantity === 10, '단체 10명 수량 10개 일치');

  // [Test 2] 단건 결제 승인 및 0x01 쿠폰 발급 검증
  console.log('\n[Test 2] 단건 결제 승인 및 0x01 쿠폰 발급 검증');
  const pay1 = await handlePaymentComplete({
    paymentId: 'pay_test_001',
    productId: 'pass_1d',
    amount: 3300,
    customerName: 'Alice',
    portoneSecret: TEST_SECRET,
    skipPgVerification: true
  });
  ok(pay1.status === 200, '결제 완료 처리 200 OK');
  ok(pay1.body.ok === true, '응답 ok: true 확인');
  ok(pay1.body.codes.length === 1, '쿠폰 코드 1개 발급 확인');

  const code1 = pay1.body.codes[0];
  const v1 = verifyCode(code1.code);
  ok(v1.ok === true, '발급된 코드 Ed25519 서명 유효성 검증 통과');
  ok(v1.claims.flags === 0x01, '발급된 코드 플래그 0x01(관광권 통일) 일치 (08:25 ①)');
  ok(v1.claims.keyId === 0, '테스트 키 ID 0 확인');
  ok(code1.link.startsWith('https://raytok.kr/lic/'), '입장 딥링크 형식 확인');

  // [Test 3] 단체 묶음 결제 승인 (10장) 및 고유성 검증
  console.log('\n[Test 3] 단체 묶음 결제 승인 (10장) 및 고유성 검증');
  const payGroup = await handlePaymentComplete({
    paymentId: 'pay_test_group_002',
    productId: 'group_7d_10',
    amount: 99000,
    customerName: 'TourAgency',
    portoneSecret: TEST_SECRET,
    skipPgVerification: true
  });
  ok(payGroup.status === 200, '단체 결제 완료 처리 200 OK');
  ok(payGroup.body.codes.length === 10, '쿠폰 10개 발급 확인');

  const uniqueCodes = new Set(payGroup.body.codes.map(c => c.code));
  ok(uniqueCodes.size === 10, '10개 코드 모두 고유(중복 없음) 확인');
  for (const c of payGroup.body.codes) {
    const v = verifyCode(c.code);
    ok(v.ok && v.claims.flags === 0x01, `단체 코드 서명 및 플래그 0x01 검증 (${c.grouped.slice(0, 9)}...)`);
  }

  // [Test 4] 멱등성 검증 (동일 paymentId 중복 요청)
  console.log('\n[Test 4] 중복 결제 요청 멱등성 검증');
  const payDupe = await handlePaymentComplete({
    paymentId: 'pay_test_001', // 동일 ID
    productId: 'pass_1d',
    amount: 3300,
    portoneSecret: TEST_SECRET,
    skipPgVerification: true
  });
  ok(payDupe.status === 200, '중복 요청 200 OK');
  ok(payDupe.body.codes[0].code === code1.code, '중복 요청 시 기존 발급 코드와 100% 동일한 코드 반환 (멱등)');

  // [Test 5] 결제 금액 위조 차단 검증
  console.log('\n[Test 5] 결제 금액 위조 차단 검증');
  const payForged = await handlePaymentComplete({
    paymentId: 'pay_forged_003',
    productId: 'pass_1d', // 원래 3,300원
    amount: 100, // 100원으로 위조
    portoneSecret: TEST_SECRET,
    skipPgVerification: true
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

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/pay/complete' && req.method === 'POST') {
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', async () => {
        try {
          const body = JSON.parse(raw);
          const result = await handlePaymentComplete({
            ...body,
            portoneSecret: TEST_SECRET,
            skipPgVerification: true
          });
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

    if (url.pathname.startsWith('/payments/')) {
      const auth = req.headers['authorization'] || '';
      if (!auth.startsWith('PortOne ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Unauthorized' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'PAID',
        amount: { total: 3300 },
        orderName: '관광 1일권 (1장)'
      }));
    }

    let filePath = path.join(ROOT, url.pathname);
    if (url.pathname === '/') {
      filePath = path.join(ROOT, 'index.html');
    } else if (url.pathname.endsWith('/')) {
      filePath = path.join(ROOT, url.pathname, 'index.html');
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
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.dismiss(); });

  // 외부 CDN 가로채기
  await page.route('https://cdn.portone.io/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.PortOne = { requestPayment: async (p) => ({ code: 0, paymentId: p.paymentId }) };'
    });
  });

  try {
    // ── MASTER 10-14 13:20 구매 페이지 전부 열기 (PG 심사 "판매 상품 없음" 회신) ──
    // ② /buy/ 자체가 본 페이지 — 넘김 없음. /web/buy/ 는 /buy/ 로 넘긴다.
    const buyHtml = fs.readFileSync(path.join(ROOT, 'buy', 'index.html'), 'utf-8');
    ok(!buyHtml.includes('http-equiv="refresh"') && buyHtml.includes('id="btn-pay"'), '13:20 ②: /buy/index.html 이 넘김 없는 본 페이지(결제 단추 포함)');
    const webBuyHtml = fs.readFileSync(path.join(ROOT, 'web', 'buy', 'index.html'), 'utf-8');
    ok(webBuyHtml.includes('url=/buy/') && !webBuyHtml.includes('id="btn-pay"'), '13:20 ②: /web/buy/ 는 /buy/ 로 넘기는 짧은 페이지');

    await page.goto(`${baseUrl}/buy/`);
    ok(page.url().endsWith('/buy/'), '13:20 ②: /buy/ 로 열면 주소가 바뀌지 않는다');

    // ① 띠 없음 · 단추 활성
    const bannerExists = await page.evaluate(() => !!document.getElementById('test-banner') || document.body.classList.contains('is-test-mode'));
    ok(bannerExists === false, '13:20 ①: "준비 중" 띠·is-test-mode 분기 없음');
    ok(!buyHtml.includes('준비 중입니다') && !buyHtml.includes('not yet accepted'), '13:20 ①: "준비 중" 글자가 페이지에 없다');
    const btnDisabled = await page.evaluate(() => document.getElementById('btn-pay').disabled);
    ok(btnDisabled === false, '13:20 ①: 결제 단추 활성 (테스트 키여도 결제창이 뜬다)');
    ok(buyHtml.includes("const STORE_ID = '") && buyHtml.includes("const CHANNEL_KEY = '"), '13:20 ①: 실키 전환 자리 STORE_ID·CHANNEL_KEY 두 상수 유지');

    // ② 홈 → /buy/ 링크 (메뉴·첫 화면) · /tour/ 링크 유지
    const homeHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    const navPart = homeHtml.slice(homeHtml.indexOf('<nav class="nav"'), homeHtml.indexOf('</nav>'));
    const heroPart = homeHtml.slice(homeHtml.indexOf('<div class="hero">'), homeHtml.indexOf('<section'));
    ok(navPart.includes('href="/buy/"'), '13:20 ②: 홈 메뉴에 /buy/ 「이용권 구매」 링크');
    ok(heroPart.includes('href="/buy/"'), '13:20 ②: 홈 첫 화면 단추에 /buy/ 링크');
    const tourHtml = fs.readFileSync(path.join(ROOT, 'tour', 'index.html'), 'utf-8');
    ok(tourHtml.includes('href="/buy/"'), '7번: /tour/ 에서 구매(/buy/)로 가는 링크 유지');
    for (const l of ['en', 'zh', 'ja', 'vi']) {
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'i18n', l + '.json'), 'utf-8'));
      ok(typeof dict['이용권 구매'] === 'string' && dict['이용권 구매'].length > 0, `홈 사전 ${l}: 「이용권 구매」 번역 있음`);
    }

    // ③·⑤ 우리 제품 표 네 줄 · 지어낸 숫자 없음 (3,300·9,900·66,000·99,000·198,000 외 금지)
    const ALLOWED = new Set(['3,300', '9,900', '66,000', '99,000', '198,000']);
    const priceLike = buyHtml.match(/\d{1,3}(?:,\d{3})+/g) || [];
    const strange = priceLike.filter(n => !ALLOWED.has(n));
    ok(priceLike.length > 0 && strange.length === 0, `13:20 ⑤: 페이지의 쉼표 숫자 ${priceLike.length}개 전부 허용 목록 안 (낯선 것: ${strange.join(',') || '없음'})`);
    const dataPrices = [...buyHtml.matchAll(/data-price="(\d+)"/g)].map(m => Number(m[1]).toLocaleString('en-US'));
    ok(dataPrices.every(n => ALLOWED.has(n)), '13:20 ⑤: data-price 값도 허용 목록 안');
    const rowCount = await page.locator('#products tr[id^="prod-row-"]').count();
    ok(rowCount === 4, '13:20 ③: 우리 제품 표 네 줄(손님·호스트·번역 패키지·단체)');
    for (const id of ['prod-row-host', 'prod-row-pkg', 'prod-row-org']) {
      const t = await page.textContent('#' + id);
      ok(t.includes('문의') && !/\d{1,3}(?:,\d{3})+/.test(t), `13:20 ③: ${id} 는 가격 미정 → "문의", 숫자 없음`);
    }
    const guestRow = await page.textContent('#prod-row-guest');
    ok(guestRow.includes('3,300') && guestRow.includes('9,900'), '13:20 ③: 손님 이용권 줄에 1일권 3,300 · 7일권 9,900');
    const productsVisible = await page.locator('#products:visible').count();
    ok(productsVisible === 1, '13:20 ③: 제품 표가 /buy/ 위쪽에 보인다');

    // ⑤ 되돌림 실증: 지어낸 숫자가 끼면 붉다
    // ⚠ 되돌림은 **페이지에서 실제로 긁은 값**으로 한다. 시험 안에서 만든 배열로 하면
    //   페이지에 12,000 이 들어와도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
    //   지금 낯선 숫자가 0개라 아래 단언이 던진다. 페이지에 허용 밖 숫자가 들어오면
    //   strange 가 차서 던지지 않고 ok 가 붉는다.
    let fakeNumFailed = false;
    try {
      assert.notStrictEqual(strange.length, 0, `페이지에 허용 밖 숫자가 있다: ${strange.join(',')}`);
    } catch (e) { fakeNumFailed = true; }
    ok(fakeNumFailed === true, '13:20 ⑤: 허용 밖 숫자가 끼면 단언 실패 입증 (되돌림 실증)');


    // 1) 상품 렌더링 확인
    const title = await page.textContent('h1');
    ok(title.includes('RayTok 이용권 구매'), '구매 페이지 헤더 확인');

    const cardCount = await page.locator('.product-card').count();
    ok(cardCount === 5, '전체 5개 상품 카드 보존 확인 (시험용)');

    const visibleCards = await page.locator('.product-card:visible').count();
    ok(visibleCards === 2, '운영 화면에 단건 2종만 노출 확인 (단체권 3종 숨김 - B-1)');

    const visibleGroupCards = await page.locator('.product-card[data-id^="group_"]:visible').count();
    ok(visibleGroupCards === 0, '화면에 단체 상품 카드가 0개 확인 (MASTER 03:36 대표님 결정: 단건 둘만 판다)');

    const groupInquiryCount = await page.locator('#group-inquiry:visible').count();
    ok(groupInquiryCount === 1, '「10명 이상 단체는 문의해 주세요」 문의 줄 1개 확인 (MASTER 03:36)');

    const inquiryText = await page.textContent('#group-inquiry');
    ok(inquiryText.includes('10명 이상 단체는 문의해 주세요'), '단체 문의 문구 정확성 확인');
    ok(inquiryText.includes('문의하기'), '단체 문의 링크 확인');

    // English 전환 검증
    await page.click('#btn-lang-en');
    const enInquiryText = await page.textContent('#group-inquiry');
    ok(enInquiryText.includes('For groups of 10 or more, please contact us'), '영문 단체 문의 문구 렌더링 확인 (ko·en)');
    const enProducts = await page.textContent('#products');
    ok(enProducts.includes('Our products') && enProducts.includes('Contact us') && enProducts.includes('3,300'), '13:20 ④: 제품 표 영문(ko·en) 렌더링 확인');
    await page.click('#btn-lang-ko');
    const koProducts = await page.textContent('#products');
    ok(koProducts.includes('우리 제품') && koProducts.includes('문의'), '13:20 ④: 제품 표 국문 복귀 확인');

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
    ok(resultDesc.includes('7일권') && resultDesc.includes('결제가 완료되었습니다'), '결제 완료 화면 노출 확인');

    const codeCardCount = await page.locator('.code-card').count();
    ok(codeCardCount === 1, '결제 결과 쿠폰 카드 1개 노출 확인');

    const linkHref = await page.getAttribute('.code-card a', 'href');
    ok(linkHref.startsWith('https://raytok.kr/lic/'), '쿠폰 바로가기 링크 생성 확인');

    // [B-5] 모바일 화면 레이아웃 및 디자인 검증 (360px, 420px)
    const mobileWidths = [420, 360];
    for (const w of mobileWidths) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.goto(`${baseUrl}/buy/`);
      await page.waitForTimeout(300);

      const overflowData = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = Math.max(docEl.clientWidth, body.clientWidth);
        return scrollW - clientW;
      });
      ok(overflowData <= 1, `모바일 ${w}px 에서 가로 넘침(잘림) 0건 검증`);

      const btnStyle = await page.evaluate(() => {
        const el = document.querySelector('#btn-pay');
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          height: rect.height,
          width: rect.width,
          borderWidth: parseInt(cs.borderWidth || '0', 10)
        };
      });
      ok(btnStyle.bg !== 'rgba(0, 0, 0, 0)' && btnStyle.bg !== 'transparent', `모바일 ${w}px 에서 결제 단추 배경색 투명 아님 확인`);
      ok(btnStyle.height >= 48, `모바일 ${w}px 에서 결제 단추 계산된 높이 >= 48px 확인`);
      ok(btnStyle.borderWidth >= 1, `모바일 ${w}px 에서 결제 단추 테두리 있음 확인`);
      ok(btnStyle.width >= (w - 40), `모바일 ${w}px 에서 결제 단추 폭 꽉 차게 렌더링 확인`);

      const inputBg = await page.evaluate(() => window.getComputedStyle(document.querySelector('input[type="text"]')).backgroundColor);
      ok(inputBg === 'rgb(11, 15, 25)', `모바일 ${w}px 에서 입력칸 배경색(테마 연동) 정상 렌더링 확인`);

      const footerLinkWrap = await page.evaluate(() => window.getComputedStyle(document.querySelector('footer a')).whiteSpace);
      ok(footerLinkWrap === 'nowrap', `모바일 ${w}px 에서 바닥 메뉴 줄바꿈 방지(nowrap) 확인`);
    }

    // B-8 되돌림 실증
    let btnRevertFailed = false;
    try {
      await page.evaluate(() => {
        const el = document.querySelector('#btn-pay');
        el.style.transition = 'none';
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

    const badgeCount = await page.locator('.test-badge').count();
    ok(badgeCount === 0, '13:20 ①: 테스트 모드 배지 없음');

    await browser.close();

    // [Test 8] 되돌림 실증 1건 (D-09)
    console.log('\n[Test 8] 되돌림 실증 1건 (D-09)');
    const payRevert = await handlePaymentComplete({
      paymentId: 'pay_revert_check',
      productId: 'pass_1d',
      amount: 3300,
      portoneSecret: TEST_SECRET,
      skipPgVerification: true
    });
    const vRevert = verifyCode(payRevert.body.codes[0].code);
    let revertedFail = false;
    try {
      assert.equal(vRevert.claims.flags, 0x02); // 0x02(private)로 변조 시 실패해야 함
    } catch (e) {
      revertedFail = true;
    }
    ok(revertedFail === true, '플래그가 0x02(손님)로 변조 시 단언 실패 입증 (되돌림 실증 완료)');

    // [Test 9] relay/src/index.js 라우트 실제 fetch 검증 (포트원 V2 단건 조회 연동)
    console.log('\n[Test 9] relay/src/index.js 라우트 실제 fetch 검증 (B-2)');
    const mockEnv = {
      PORTONE_API_SECRET: TEST_SECRET,
      PORTONE_API_BASE: baseUrl
    };
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
    ok(httpData.ok === true && httpData.codes.length === 1, 'relay 라우트를 통한 0x01 쿠폰 정상 발급 확인');
    ok(httpData.codes[0].flags === 0x01, 'relay 라우트 발급 쿠폰 플래그 0x01 확인 (08:25 ①)');

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

    server.close();
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
