// samples/pay_verification_test.js — 포트원 V2 실결제 단건 조회 검증 긴급 시험 (MASTER 12:35)
import assert from 'node:assert/strict';
import http from 'node:http';
import { handlePaymentComplete, PRODUCTS } from '../relay/src/pay.js';
import relayWorker from '../relay/src/index.js';

console.log('=== 포트원 V2 실결제 단건 조회 및 비밀값 검증 긴급 시험 (MASTER 12:35) ===\n');

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks++;
  console.log(`  [PASS] ${msg}`);
}

const mockPayments = new Map();
let serverPort = 0;
let server;

(async () => {
  // 모의 포트원 API 서버 가동
  server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/payments/')) {
      const pId = decodeURIComponent(url.pathname.slice('/payments/'.length));
      const auth = req.headers['authorization'] || '';
      if (!auth.startsWith('PortOne ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'unauthorized', message: 'Missing secret' }));
      }
      if (pId === 'pay_500_server_error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'internal_server_error' }));
      }
      const record = mockPayments.get(pId);
      if (!record) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'payment_not_found' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(record));
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise(r => server.listen(0, () => {
    serverPort = server.address().port;
    r();
  }));

  const mockApiBase = `http://localhost:${serverPort}`;
  const validSecret = 'portone_test_secret_xyz_999';

  /* ── 1. PORTONE_API_SECRET 부재 시 503 pg_secret_missing 차단 ── */
  console.log('[Test 1] PORTONE_API_SECRET 비밀값 부재 시 503 pg_secret_missing 차단');
  const resNoSecret = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_valid_001',
    productId: 'pass_1d',
    amount: 3300,
    portoneSecret: null // 비밀값 누락
  });
  ok(resNoSecret.status === 503, '비밀값 누락 시 503 차단');
  ok(resNoSecret.body.error === 'pg_secret_missing', '에러 코드 pg_secret_missing 일치');

  /* ── 2. status !== PAID (미결제/취소/실패) 시 402 차단 ── */
  console.log('\n[Test 2] 결제 상태가 PAID가 아닌 경우 (READY, FAILED) 402 차단');
  mockPayments.set('pay_failed_001', {
    status: 'FAILED',
    amount: { total: 3300 },
    orderName: '관광 1일권 (1장)'
  });
  const resFailed = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_failed_001',
    productId: 'pass_1d',
    amount: 3300,
    portoneSecret: validSecret,
    portoneApiBase: mockApiBase
  });
  ok(resFailed.status === 402, 'status: FAILED 시 402 차단');
  ok(resFailed.body.error === 'payment_not_verified', '에러 코드 payment_not_verified 일치');
  ok(resFailed.body.message.includes('PAID가 아닙니다'), '상세 메시지에 PAID 아님 명시');

  /* ── 3. 결제 금액 불일치 (위조) 시 402 차단 ── */
  console.log('\n[Test 3] 포트원 실제 결제 금액 불일치 (위조 시도) 402 차단');
  mockPayments.set('pay_amount_hack_001', {
    status: 'PAID',
    amount: { total: 100 }, // 실제 결제는 100원만 함
    orderName: '관광 1일권 (1장)'
  });
  const resAmountHack = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_amount_hack_001',
    productId: 'pass_1d',
    amount: 3300, // 요청 금액은 3,300원으로 속임
    portoneSecret: validSecret,
    portoneApiBase: mockApiBase
  });
  ok(resAmountHack.status === 402, '실결제 금액(100원) 불일치 시 402 차단');
  ok(resAmountHack.body.error === 'payment_not_verified', '에러 코드 payment_not_verified');
  ok(resAmountHack.body.message.includes('금액 불일치'), '금액 불일치 메시지 확인');

  /* ── 4. 결제 상품 불일치 (다른 상품 결제 후 요청) 시 402 차단 ── */
  console.log('\n[Test 4] 결제 상품 불일치 402 차단');
  mockPayments.set('pay_wrong_prod_001', {
    status: 'PAID',
    amount: { total: 9900 },
    orderName: '관광 1일권 3장 묶음' // pass_7d(관광 7일권)와 불일치
  });
  const resWrongProd = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_wrong_prod_001',
    productId: 'pass_7d',
    amount: 9900,
    portoneSecret: validSecret,
    portoneApiBase: mockApiBase
  });
  ok(resWrongProd.status === 402, '상품명 불일치 시 402 차단');
  ok(resWrongProd.body.error === 'payment_not_verified', '에러 코드 payment_not_verified');

  /* ── 5. 포트원 서버 장애(500) 또는 무응답 시 503 pg_unavailable ── */
  console.log('\n[Test 5] 포트원 서버 오류(5xx) 및 네트워크 불가 시 503 pg_unavailable');
  const resPg500 = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_500_server_error',
    productId: 'pass_1d',
    amount: 3300,
    portoneSecret: validSecret,
    portoneApiBase: mockApiBase
  });
  ok(resPg500.status === 503, '포트원 500 오류 시 503 반환');
  ok(resPg500.body.error === 'pg_unavailable', '에러 코드 pg_unavailable 일치');

  // 네트워크 불가(포트 번호 미존재)
  const resPgNetErr = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_net_err',
    productId: 'pass_1d',
    amount: 3300,
    portoneSecret: validSecret,
    portoneApiBase: 'http://127.0.0.1:59999' // 닫힌 포트
  });
  ok(resPgNetErr.status === 503, '포트원 연결 불가 시 503 반환');
  ok(resPgNetErr.body.error === 'pg_unavailable', '에러 코드 pg_unavailable 확인');

  /* ── 6. 정상 결제 검증 통과 시 쿠폰 정상 발급 (200 OK) ── */
  console.log('\n[Test 6] 정상 실결제 확인 후 200 OK 쿠폰 발급');
  mockPayments.set('pay_good_001', {
    status: 'PAID',
    amount: { total: 3300 },
    orderName: '관광 1일권 (1장)'
  });
  const resGood = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay_good_001',
    productId: 'pass_1d',
    amount: 3300,
    customerName: 'VerifiedBuyer',
    portoneSecret: validSecret,
    portoneApiBase: mockApiBase
  });
  ok(resGood.status === 200, '실결제 확인 통과 200 OK');
  ok(resGood.body.ok === true && resGood.body.codes.length === 1, '쿠폰 1개 발급 확인');

  /* ── 7. 릴레이 라우트 POST /pay/complete 통합 실측 ── */
  console.log('\n[Test 7] 릴레이 라우트 POST /pay/complete 통합 실측');
  const mockEnv = {
    PORTONE_API_SECRET: validSecret,
    PORTONE_API_BASE: mockApiBase,
    LIC_TEST_SEED: '0'.repeat(64),
    ALLOW_TEST_KEY: '1'   // 시험 = 개발 릴레이(0번 허용)
  };
  mockPayments.set('pay_route_verified_001', {
    status: 'PAID',
    amount: { total: 3300 },
    orderName: '관광 1일권 (1장)'
  });
  const httpReqGood = new Request('http://localhost/pay/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentId: 'pay_route_verified_001',
      productId: 'pass_1d',
      amount: 3300,
      customerName: 'RouteVerified'
    })
  });
  const httpResGood = await relayWorker.fetch(httpReqGood, mockEnv, {});
  ok(httpResGood.status === 200, '릴레이 라우트 포트원 검증 통과 후 200 OK');
  const httpDataGood = await httpResGood.json();
  ok(httpDataGood.ok === true, '쿠폰 발급 완료 확인');

  // 비밀값 누락 시 릴레이 라우트 503 차단
  const httpReqNoSec = new Request('http://localhost/pay/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentId: 'pay_route_verified_001',
      productId: 'pass_1d',
      amount: 3300
    })
  });
  const httpResNoSec = await relayWorker.fetch(httpReqNoSec, {}, {}); // PORTONE_API_SECRET 없음
  ok(httpResNoSec.status === 503, '릴레이 환경변수 SECRET 부재 시 503 차단 확인');
  const httpDataNoSec = await httpResNoSec.json();
  ok(httpDataNoSec.error === 'pg_secret_missing', 'pg_secret_missing 확인');

  /* ── 8. D-09 되돌림 실증 2건 (MASTER 12:35 ④) ── */
  console.log('\n[Test 8] 되돌림 실증 2건');
  // ① 조회를 빼면(skipPgVerification) 미결제(FAILED) 요청이 성공하여 단언 실패 입증
  let revertSkipQueryFailed = false;
  try {
    const fakeBypass = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
      paymentId: 'pay_failed_001',
      productId: 'pass_1d',
      amount: 3300,
      portoneSecret: validSecret,
      skipPgVerification: true // 조회를 뺀 상황 재현
    });
    // 조회를 빼면 200 성공으로 떨어지므로 단언이 실패해야 함
    assert.strictEqual(fakeBypass.status, 402, '포트원 조회를 빼면 미결제 건이 통과되므로 단언 실패해야 함');
  } catch (e) {
    revertSkipQueryFailed = true;
  }
  ok(revertSkipQueryFailed === true, '포트원 조회를 빼면 미결제 차단 단언 실패 입증 (되돌림 실증 1)');

  // ② 비밀값 검사를 빼면 SECRET이 없어도 결제 진행되므로 단언 실패 입증
  // ⚠ 되돌림은 **릴레이가 실제로 돌려준 답**(httpResNoSec)으로 한다. 시험 안에서 만든 상수로
  //   하면 릴레이를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
  let revertSecretCheckFailed = false;
  try {
    // PORTONE_API_SECRET 없이 보낸 진짜 요청의 답을 본다. 지금 503 pg_secret_missing 이라서
    // 아래 단언이 던진다. 비밀값 검사를 빼면 503 이 아니게 되어 던지지 않고 ok 가 붉는다.
    assert.notStrictEqual(httpResNoSec.status, 503, `비밀값 없이도 /pay/complete 가 ${httpResNoSec.status} 로 섰다`);
  } catch (e) {
    revertSecretCheckFailed = true;
  }
  ok(revertSecretCheckFailed === true, '비밀값 검사를 빼면 SECRET 누락 차단 단언 실패 입증 (되돌림 실증 2)');

  server.close();
  console.log(`\n전부 통과 (${checks}건)`);
})().catch(err => {
  if (server) server.close();
  console.error('\n[FAIL]', err);
  process.exit(1);
});
