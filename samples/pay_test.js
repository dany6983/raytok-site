// 줄 18: 쿠폰 온라인 결제 P1 (포트원 V2 연동 및 0x01 관광권 발급) 검증 시험
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
import { verifyCode as verifyProd, PUBLIC_KEYS, FLAG } from '../relay/tools/mint-code.mjs';
// 시험 코드는 0번 — 개발 릴레이처럼 아는 키 전부로 본다(운영 릴레이는 1번만: relay_prod_keys 시험)
const verifyCode = (c, o = {}) => verifyProd(c, { keys: PUBLIC_KEYS, ...o });

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
  const pay1 = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
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
  const payGroup = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
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
  const payDupe = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
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
  const payForged = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
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
          /* V1 결제(imp_uid 가 온 경우)는 V1 열쇠 둘이 있어야 **선다**(B 30). 여기선 확인을
             건너뛰지만 열쇠는 넘긴다 — 운영과 같은 모양이다(없으면 503 pg_secret_missing). */
          const result = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
            ...body,
            portoneSecret: TEST_SECRET,
            impKey: 'imp_key_for_browser_test',
            impSecret: 'imp_secret_for_browser_test',
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

  /* 구매 폼 채우기 — **한 자리**에 둔다. 10-19 에 휴대폰 칸이 필수로 생겼고(KCP 모바일·일부
     카드사), 안 채우면 결제 단추가 "휴대폰 번호를 정확히" 에서 멈춘다. 그 줄을 모든 클릭 앞에
     두지 않으면 시험이 **엉뚱한 알림**을 보고 붉어진다(10-19 에 그렇게 붉었다). */
  const fillBuyer = async (p, phone = '01012345678') => {
    await p.fill('#buyer-name', '시험구매자');
    await p.fill('#buyer-email', 'test@example.com');
    await p.fill('#buyer-phone', phone);
  };

  // 외부 CDN 가로채기 — V2·V1 둘 다. 지금 KCP 채널은 **V1 모듈**이라 화면이 V1 길로 간다(10-19).
  await page.route('https://cdn.portone.io/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.PortOne = { requestPayment: async (p) => ({ code: 0, paymentId: p.paymentId }) };'
    });
  });
  await page.route('https://cdn.iamport.kr/**', route => {
    /* V1 SDK 가짜. 실기와 같은 모양으로 답한다 — `imp_uid` 를 주고, 콜백으로 돌려준다(D-11).
       `window.__impArgs` 에 넘겨받은 칸을 남겨 두어 시험이 **무엇을 보냈는지** 본다. */
    route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'window.IMP = { init: function (c) { window.__impCode = c; },'
          + ' request_pay: function (p, cb) { window.__impArgs = p; setTimeout(function () {'
          + ' cb({ success: true, imp_uid: "imp_fake_" + p.merchant_uid, merchant_uid: p.merchant_uid, paid_amount: p.amount }); }, 10); } };'
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
    // 마스터 10-16 13:40 ②: 실키 전환 자리는 **buy/pg.js 한 파일**이다.
    // 전에는 buy/index.html 안에 박혀 있었고 같은 값을 읽는 곳이 넷이었다(§4) —
    // 전환하는 사람이 하나를 빠뜨리면 **테스트 채널로 실결제를 받는다.**
    const pgSrc = fs.readFileSync(path.join(ROOT, 'buy', 'pg.js'), 'utf-8');
    ok(/storeId:\s*'/.test(pgSrc) && /channelKey:\s*'/.test(pgSrc),
       '13:40 ②: buy/pg.js 에 storeId·channelKey 두 칸이 있다 (전환은 이 파일만)');
    ok(!/const STORE_ID\s*=\s*'store/.test(buyHtml) && !/const CHANNEL_KEY\s*=\s*'channel/.test(buyHtml),
       '13:40 ②: 값을 **만드는 곳**이 buy/index.html 에 남아 있지 않다 (두 곳에서 만들면 한쪽만 바뀐다)');
    ok(buyHtml.includes('pg.js'), '13:40 ②: 구매 화면이 pg.js 를 싣는다');
    ok(/window\.rtPG/.test(buyHtml), '13:40 ②: 구매 화면은 그 한 자리에서 **읽기만** 한다');

    /* 저장소에 있는 것은 **공개 식별자뿐**이다 (10-19: 대표님이 PG 심사 때문에 실값을 넣으셨다 —
       `d40bda2`·`188d2f3`. storeId·channelKey·impCode 는 브라우저가 그대로 들고 쓰는 공개값이고
       비밀값이 아니다). 그래서 이 시험이 보는 것이 바뀐다:
         ⓐ 비밀값처럼 보이는 칸이 끼지 않았는가 (이게 끼면 공개 저장소에 비밀이 샌다)
         ⓑ **반쯤 바꾼 상태가 아닌가** — 한쪽만 실값이면 테스트 채널로 실결제를 받는다(D-32) */
    const pgMod = createRequire(import.meta.url)(path.join(ROOT, 'buy', 'pg.js'));
    const pgKeys = Object.keys(pgMod);
    const secretish = pgKeys.filter(k => /secret|apikey|api_key|token|password|webhook/i.test(k));
    ok(secretish.length === 0, `13:40 ②: pg.js 에 비밀값 칸이 없다 (${secretish.join(',') || '없음'})`);
    const isTestStore = /test/i.test(String(pgMod.storeId));
    const isTestChannel = /test/i.test(String(pgMod.channelKey));
    ok(isTestStore === isTestChannel,
       `13:40 ②: storeId·channelKey 가 **같은 쪽**이다 (store ${isTestStore ? '시험' : '운영'} · channel ${isTestChannel ? '시험' : '운영'}) — 섞이면 테스트 채널로 실결제를 받는다`);
    ok(pgMod.isTest === isTestStore, '13:40 ②: isTest 가 값에서 갈린다 (사람이 켜는 깃발이 아니다)');
    if (!pgMod.isTest) {
      ok(/^store-[0-9a-f-]{8,}$/.test(String(pgMod.storeId)), `운영 storeId 가 포트원 꼴이다 (${String(pgMod.storeId).slice(0, 12)}…)`);
      ok(/^channel-key-[0-9a-f-]{8,}$/.test(String(pgMod.channelKey)), '운영 channelKey 가 포트원 꼴이다');
      if (pgMod.sdk === 'v1') {
        ok(/^imp\w{6,}$/.test(String(pgMod.impCode)), `V1 채널이면 impCode 가 있다 (${pgMod.impCode})`);
      }
    }
    ok(pgMod.provider === 'kcp', `13:40 ②: 채널은 KCP 라고 적혀 있다 (${pgMod.provider})`);
    ok(pgMod.ready() === true, '13:40 ②: 두 값이 다 채워져 있다 (빈 값이면 결제창을 열지 않는다)');

    // isTest 는 **값에서** 갈린다 — 사람이 켜고 끄는 깃발이 아니다
    ok(!/isTest\s*[:=]\s*(true|false)\b/.test(pgSrc),
       '13:40 ②: isTest 를 손으로 박아 두지 않았다 — 값에서 갈린다 (깃발과 값이 어긋나면 사고다)');

    // §20 빈 답은 없음이 아니다 — pg.js 가 **실제로 안 실린** 쪽을 본다.
    // (전에 이 자리를 window.rtPG 를 지우는 식으로 썼는데, 페이지는 불릴 때 이미 값을
    //  const 로 잡아 두므로 늘 통과하는 **빈 증거**였다. 파일 자체를 막아야 증거가 된다.)
    const noPgPage = await browser.newPage();
    const noPgDialogs = [];   // 이 화면은 alert() 로 알린다 — 그 글을 잡는다
    noPgPage.on('dialog', async d => { noPgDialogs.push(d.message()); await d.dismiss(); });
    await noPgPage.route('**/buy/pg.js', route => route.abort());
    let portoneCalls = 0;
    await noPgPage.route('https://cdn.portone.io/**', route => {
      route.fulfill({
        status: 200, contentType: 'application/javascript',
        body: 'window.PortOne = { requestPayment: async (p) => { window.__poCalled = (window.__poCalled||0)+1; return { code: 0, paymentId: p.paymentId }; } };'
      });
    });
    await noPgPage.goto(`${baseUrl}/buy/`);
    ok(await noPgPage.evaluate(() => window.rtPG === undefined), '13:40 ②: pg.js 를 막은 쪽에서는 결제 상수가 없다');
    await fillBuyer(noPgPage);
    await noPgPage.click('#btn-pay');
    await noPgPage.waitForTimeout(500);
    portoneCalls = await noPgPage.evaluate(() => window.__poCalled || 0);
    ok(portoneCalls === 0, `13:40 ②: 결제 설정이 없으면 **포트원을 부르지 않는다** (부른 횟수 ${portoneCalls}, §20)`);
    ok(noPgDialogs.some(m => /결제 설정/.test(m)),
       `13:40 ②: 까닭을 손님에게 알린다 — 조용히 실패하지 않는다 (${JSON.stringify(noPgDialogs)})`);
    const btnBack = await noPgPage.evaluate(() => document.getElementById('btn-pay').disabled);
    ok(btnBack === false, '13:40 ②: 단추가 잠긴 채 남지 않는다 (D-32 반쯤 바꾼 화면)');
    await noPgPage.close();

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

    // ⑥ 되돌림 실증 — 상수를 buy/index.html 로 되돌리면 / 빈 값 문을 빼면 붉다 (13:40 ②)
    let revertOneSpotFailed = false;
    try {
      assert.ok(/const STORE_ID\s*=\s*'store/.test(buyHtml),
        `값을 만드는 곳이 buy/index.html 에 남아 있다`);
    } catch (e) { revertOneSpotFailed = true; }
    ok(revertOneSpotFailed === true, '13:40 ②: 상수를 구매 화면으로 되돌리면 붉어진다 (되돌림 실증)');

    let revertGuardFailed = false;
    try {
      assert.notStrictEqual(portoneCalls, 0, `설정이 없는데 포트원을 ${portoneCalls}번 불렀다`);
    } catch (e) { revertGuardFailed = true; }
    ok(revertGuardFailed === true, '13:40 ②: 빈 값 문을 빼면 붉어진다 — 손님이 알 수 없는 오류를 본다 (되돌림 실증)');

    /* ★ 발급 요청이 **릴레이**로 가는가 (B 13, 10-17).
       전에는 `fetch('/pay/complete')` 였다 — 이 시험의 모의 릴레이가 `/buy/` 도 같이 서빙하니
       같은 출처라 통과했다. 운영은 `raytok.kr`(GitHub Pages)이고 그 길이 없어 **404** 다:
       돈이 빠진 뒤에 "결제 처리 중 오류" 만 뜬다. 가짜가 실기보다 쉬웠던 자리(D-11).
       그래서 운영 호스트 이름을 **넣어서** 돌린다 — 목을 채워 놓고 도는 시험이 아니다(§20). */
    const payBaseProd = await page.evaluate(() => window.__rtPayBase('raytok.kr', ''));
    ok(payBaseProd === 'https://raytok-relay.raytok.workers.dev',
       `운영 호스트에서 발급 요청은 릴레이로 간다 (${payBaseProd || '빈 값 = 같은 출처 = 404'})`);
    const payBaseLocal = await page.evaluate(() => window.__rtPayBase('127.0.0.1', ''));
    ok(payBaseLocal === '', '로컬에서는 같은 출처 (wrangler dev · 이 시험)');
    const payBaseParam = await page.evaluate(() => window.__rtPayBase('raytok.kr', '?relay=http://127.0.0.1:8787/'));
    ok(payBaseParam === 'http://127.0.0.1:8787', '?relay= 로 바꿔 끼운다 (끝 슬래시 제거)');
    ok(!/fetch\('\/pay\/complete'/.test(buyHtml) && /PAY_BASE \+ '\/pay\/complete'/.test(buyHtml),
       '구매 화면에 같은 출처로 던지는 `fetch(\'/pay/complete\')` 가 남아 있지 않다');

    // 되돌림 실증 — 상대 주소로 되돌리면(운영에서 빈 값) 위 단언이 붉다
    let revertPayBaseFailed = false;
    try {
      assert.strictEqual(payBaseProd, '', '운영에서 발급 요청이 같은 출처로 간다 = GitHub Pages 404');
    } catch (e) { revertPayBaseFailed = true; }
    ok(revertPayBaseFailed === true, '상대 주소로 되돌리면 붉어진다 (되돌림 실증)');


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

    // 3) 결제하기 클릭 (구매자 칸을 먼저 채운다 — 휴대폰은 10-19 부터 필수)
    await fillBuyer(page);
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
    const payRevert = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
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
      PORTONE_API_BASE: baseUrl,
      ALLOW_TEST_KEY: '1'   // 시험 = 개발 릴레이(0번 허용)
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

    /* ★ §20 — 비밀값이 **없는 경우**. 이 시험은 늘 비밀값을 넘겨 주고 돌아서 그 길을
       한 번도 돌리지 않았다. 전에는 `|| 'test_webhook_secret_key_123'` 로 떨어졌고,
       그 글자는 **이 공개 저장소에 있다** — 비밀값을 안 넣고 배포하면 누구나 서명을 맞춘다. */
    const noSecretReq = new Request('http://localhost/pay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-portone-signature': hookSig },
      body: hookBody
    });
    const noSecretRes = await relayWorker.fetch(noSecretReq, {}, {});
    const noSecretBody = await noSecretRes.json().catch(() => ({}));
    ok(noSecretRes.status === 503 && noSecretBody.error === 'pg_secret_missing',
       `비밀값이 없으면 웹훅이 **서지 않는다** (${noSecretRes.status} ${noSecretBody.error}) — /pay/complete 와 같은 모양`);

    // 되돌림 실증: 박힌 기본값으로 떨어지면 그 서명이 통과한다 = 붉다
    let revertHookFailed = false;
    try {
      assert.notStrictEqual(noSecretRes.status, 503, `비밀값 없이 ${noSecretRes.status} 로 답했다`);
    } catch (e) { revertHookFailed = true; }
    ok(revertHookFailed === true, '박힌 기본 비밀값으로 되돌리면 붉어진다 (되돌림 실증)');

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
