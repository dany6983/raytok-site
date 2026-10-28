// samples/pay_v1_test.js — 포트원 **V1** 실결제 확인 (B 30, 2026-10-19)
//
// 왜 급했나: 10-19 PG 심사에서 KCP 채널이 **V1 모듈**이라 결제창을 V1 SDK 로 열었다(`93a27bc`).
// 그때 손님 쪽이 주는 열쇠는 `imp_uid` 하나인데, 릴레이는 **V2 조회 API** 로 확인하고 있었다 —
// V2 로는 그 결제를 찾지 못하므로 **돈은 빠지고 쿠폰은 안 나온다.** 그 길을 막는다.
//
// V1 과 V2 를 섞어 읽으면 늘 통과하거나 늘 막힌다(status 가 'paid' / 'PAID' 로 다르다).
// 그래서 **가짜 V1 서버**를 세워 실제 모양대로 답하게 하고, 아래 여덟 가지를 돈다.
// 돌리기: node samples/pay_v1_test.js
import assert from 'node:assert/strict';
import http from 'node:http';
import { handlePaymentComplete, PRODUCTS } from '../relay/src/pay.js';

console.log('=== 포트원 V1(imp_uid) 실결제 확인 — B 30 ===');
let checks = 0;
const ok = (c, d) => { assert.ok(c, d); checks++; console.log('  [PASS] ' + d); };

const KEY = 'imp_key_test_1234';
const SECRET = 'imp_secret_test_5678';
const TOKEN = 'access_token_abc';
const payments = new Map();      // imp_uid → V1 response 본문
const PROD = 'pass_1d';
const P = PRODUCTS[PROD];        // 이름·값을 손으로 적지 않는다 — 제품 표에서 읽는다(§4)
let tokenCalls = 0, authSeen = [], lastPaymentId = '';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

  if (url.pathname === '/users/getToken' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    return req.on('end', () => {
      tokenCalls += 1;
      let b = {};
      try { b = JSON.parse(raw || '{}'); } catch (_) {}
      if (b.imp_key !== KEY || b.imp_secret !== SECRET) return json(401, { code: -1, message: 'invalid key' });
      json(200, { code: 0, message: null, response: { access_token: TOKEN, expired_at: 0, now: 0 } });
    });
  }
  if (url.pathname.startsWith('/payments/')) {
    const id = decodeURIComponent(url.pathname.slice('/payments/'.length));
    authSeen.push(req.headers['authorization'] || '');
    if ((req.headers['authorization'] || '') !== TOKEN) return json(401, { code: -1, message: 'unauthorized' });
    if (id === 'imp_boom') return json(500, { code: -1, message: 'server error' });
    const rec = payments.get(id);
    if (!rec) return json(404, { code: -1, message: 'not found' });
    /* merchant_uid 를 **그 호출의 번호**로 맞춰 돌려준다(포트원이 하는 일과 같다).
       `fixedMerchant` 가 있는 사례만 일부러 다른 번호를 돌려줘 ⑤ 를 본다. */
    const merchant = rec.fixedMerchant || lastPaymentId;
    return json(200, { code: 0, message: null, response: { ...rec, merchant_uid: merchant } });
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, r));
const BASE = 'http://127.0.0.1:' + server.address().port;

/* 정상 결제 하나 (손님 1일권 3,300원) */
payments.set('imp_good', { imp_uid: 'imp_good', status: 'paid', amount: P.price, name: P.name, custom_data: JSON.stringify({ productId: PROD }) });

/* ★ 주의: `pay.js` 는 paymentId 로 **멱등성**을 지킨다(모듈 안 메모리 보관소). 그래서 사례마다
   paymentId 를 새로 줘야 한다 — 같은 번호로 또 부르면 검증을 지나 **먼저 찍은 답**이 돌아온다.
   (이 시험을 쓰다 실제로 당했다: 상태 'ready' 사례가 200 으로 통과해 버렸다.) */
let payNo = 0;
const call = (over = {}) => handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
  paymentId: (lastPaymentId = over.paymentId || ('pay' + (++payNo).toString().padStart(3, '0'))),
  productId: PROD, amount: P.price,
  impUid: 'imp_good', impKey: KEY, impSecret: SECRET, impApiBase: BASE,
  ...over
});

try {
  /* ① V1 열쇠가 없으면 **서지 않는다** — 돈을 받고 못 찍는 것보다 못 받는 쪽이 낫다 */
  let r = await call({ impKey: null });
  ok(r.status === 503 && r.body.why === 'imp_secret_missing',
     `IMP_API_KEY 가 없으면 503 pg_secret_missing (${r.status} ${r.body.why})`);
  r = await call({ impSecret: null });
  ok(r.status === 503 && r.body.why === 'imp_secret_missing', 'IMP_API_SECRET 이 없으면 503');
  ok(/IMP_API_KEY/.test(r.body.message) && /IMP_API_SECRET/.test(r.body.message),
     '메시지가 **어느 이름**이 없는지 말한다 (대표님이 그 이름으로 secret put 한다)');

  /* ② V2 비밀값은 **없어도 된다** — V1 결제는 V1 길로 간다 (여기서 막히면 V1 전환이 헛것이다) */
  r = await call({ portoneSecret: null });
  ok(r.status === 200 && r.body.ok === true, `V1 결제는 V2 비밀값 없이도 찍힌다 (${r.status})`);
  const firstCode = (r.body.codes && r.body.codes[0] && r.body.codes[0].grouped) || null;
  ok(!!firstCode && firstCode.length >= 16, `쿠폰 코드가 나왔다 (${String(firstCode).slice(0, 4)}…)`);
  ok(tokenCalls > 0 && authSeen.includes(TOKEN), '토큰을 받아 그 토큰으로 조회했다 (V1 두 걸음)');

  /* ③ 상태가 paid 가 아니면 안 찍는다 — V1 은 **소문자**다 */
  payments.set('imp_ready', { status: 'ready', amount: P.price, name: P.name });
  r = await call({ impUid: 'imp_ready' });
  ok(r.status === 402 && r.body.why === 'imp_status', `status 가 paid 가 아니면 402 (${r.body.why})`);
  payments.set('imp_PAID', { status: 'PAID', amount: P.price, name: P.name });
  r = await call({ impUid: 'imp_PAID' });
  ok(r.status === 200, '대문자 PAID 도 받아들인다 (포트원이 꼴을 바꿔도 막히지 않게)');

  /* ④ 금액이 다르면 안 찍는다 */
  payments.set('imp_cheap', { status: 'paid', amount: 100, name: P.name });
  r = await call({ impUid: 'imp_cheap' });
  ok(r.status === 402 && r.body.why === 'imp_amount', `금액이 다르면 402 (${r.body.message})`);

  /* ⑤ ★ 주문번호가 다르면 안 찍는다 — 이 줄이 없으면 **남의 결제 하나로 쿠폰을 계속 받는다** */
  payments.set('imp_other', { fixedMerchant: 'payZZZ', status: 'paid', amount: P.price, name: P.name });
  r = await call({ impUid: 'imp_other' });
  ok(r.status === 402 && r.body.why === 'imp_merchant', `주문번호가 다르면 402 (${r.body.message})`);

  /* ⑥ 상품이 다르면 안 찍는다 */
  payments.set('imp_wrongprod', { status: 'paid', amount: P.price, name: '다른 상품', custom_data: JSON.stringify({ productId: 'pass_7d' }) });
  r = await call({ impUid: 'imp_wrongprod' });
  ok(r.status === 402 && r.body.why === 'imp_product', `상품이 다르면 402 (${r.body.why})`);

  /* ⑦ 포트원이 답하지 않으면 **찍지 않고** 503 — 모름은 됨이 아니다(§20) */
  r = await call({ impUid: 'imp_boom' });
  ok(r.status === 503 && r.body.why === 'imp_unavailable', `5xx 면 503 pg_unavailable (${r.body.why})`);
  r = await call({ impUid: 'imp_nothere' });
  ok(r.status === 402 && r.body.why === 'imp_not_found', '포트원이 모르는 결제면 402 (404)');
  r = await call({ impApiBase: 'http://127.0.0.1:1' });
  ok(r.status === 503 && r.body.error === 'pg_unavailable', '포트원에 닿지 않으면 503 (네트워크)');
  r = await call({ impKey: 'wrong_key' });
  ok(r.status === 503 && r.body.why === 'imp_token', `열쇠가 틀리면 503 imp_token — 손님 잘못이 아니다 (${r.body.why})`);

  /* ⑧ 멱등성 — 같은 결제를 두 번 보내도 **같은 코드** 하나다 */
  const store = new Map();
  const storage = { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v); } };
  payments.set('imp_idem', { status: 'paid', amount: P.price, name: P.name });
  const a2 = await call({ paymentId: 'payIDEM', impUid: 'imp_idem', storage });
  const a3 = await call({ paymentId: 'payIDEM', impUid: 'imp_idem', storage });
  const c2 = a2.body.codes && a2.body.codes[0] && a2.body.codes[0].grouped;
  const c3 = a3.body.codes && a3.body.codes[0] && a3.body.codes[0].grouped;
  ok(a2.status === 200 && a3.status === 200 && !!c2 && c2 === c3,
     `같은 결제를 두 번 보내도 코드가 하나다 (${String(c2).slice(0, 4)}…)`);

  /* ⑨ 되돌림 실증 — V1 길을 빼면(=V2 로만 확인하면) 정상 결제가 **안 찍힌다**.
     V2 주소로 보내 보면 그 모습이 그대로 나온다: 손님은 돈을 내고 코드를 못 받는다. */
  const v2Only = await handlePaymentComplete({ allowTestKey: true,   // 시험 = 개발 릴레이(0번 허용)
    paymentId: 'pay001', productId: 'pass_1d', amount: 3300,
    impUid: null,                       // V1 열쇠를 안 넘기면 = 옛 코드와 같은 길
    portoneSecret: 'v2_secret', portoneApiBase: BASE
  });
  let revertFailed = false;
  try { assert.strictEqual(v2Only.status, 200, `V2 길로도 V1 결제가 찍혔다 (${v2Only.status})`); }
  catch (e) { revertFailed = true; }
  ok(revertFailed === true,
     `V1 길을 빼면 같은 결제가 안 찍힌다 — 그게 10-19 의 "돈만 빠지는 길"이다 (${v2Only.status} ${v2Only.body.error} · 되돌림 실증)`);
  /* ⑩ 길이 **정말 이어져 있나** — 손잡이만 초록이고 라우트가 V1 을 안 넘기면 아무 일도 안
     일어난다(B 7 의 교훈). 워커를 바로 부른다. */
  const { default: relayWorker } = await import('../relay/src/index.js');
  payments.set('imp_route', { status: 'paid', amount: P.price, name: P.name });
  const post = (env, body) => {
    lastPaymentId = body.paymentId;
    return relayWorker.fetch(new Request('http://localhost/pay/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }), { ALLOW_TEST_KEY: '1', ...env }, { waitUntil: () => {} });   // 시험 = 개발 릴레이(0번 허용)
  };
  const IMP_ENV = { IMP_API_KEY: KEY, IMP_API_SECRET: SECRET, IMP_API_BASE: BASE };

  let res = await post(IMP_ENV, { paymentId: 'payR01', impUid: 'imp_route', productId: PROD, amount: P.price });
  let d = await res.json().catch(() => ({}));
  ok(res.status === 200 && d.ok === true, `라우트: impUid 를 넘기면 V1 로 확인하고 찍는다 (${res.status})`);

  res = await post({ IMP_API_BASE: BASE }, { paymentId: 'payR02', impUid: 'imp_route', productId: PROD, amount: P.price });
  d = await res.json().catch(() => ({}));
  ok(res.status === 503 && d.why === 'imp_secret_missing',
     `라우트: V1 열쇠가 없으면 503 pg_secret_missing (${res.status} ${d.why})`);

  res = await post({ ...IMP_ENV }, { paymentId: 'payR03', imp_uid: 'imp_route', productId: PROD, amount: P.price });
  d = await res.json().catch(() => ({}));
  ok(res.status === 200 && d.ok === true, '라우트: 뱀 꼴 `imp_uid` 로 와도 읽는다 (SDK 가 주는 이름 그대로)');

  res = await post({ PORTONE_API_SECRET: 'v2', PORTONE_API_BASE: BASE },
                   { paymentId: 'payR04', productId: PROD, amount: P.price });
  d = await res.json().catch(() => ({}));
  ok(res.status !== 200, `라우트: impUid 가 없으면 전처럼 V2 길로 간다 (${res.status} ${d.error || ''})`);
} finally {
  server.close();
}

console.log(`\n전부 통과 (${checks}건)`);
