/**
 * RayTok 쿠폰 온라인 결제 P1 (포트원 V2 연동 및 0x02 쿠폰 발급)
 * MASTER §18 사양:
 *   - 구매 페이지 → 포트원 결제창 → 웹훅/승인 검증 → 쿠폰 N개 발급(0x02+만료) → 화면·링크 전달
 *   - 멱등성: 동일 paymentId 중복 요청 시 기존 발급 목록 반환
 */
import crypto from 'node:crypto';
import {
  mintCode,
  verifyCode,
  testSeed,
  privateKeyFromSeed,
  FLAG
} from '../tools/mint-code.mjs';

// 지원 상품 카탈로그 (MASTER 및 tour/index.html 기준)
export const PRODUCTS = {
  'pass_1d': {
    name: '손님 1일권 (1장)',
    price: 3300,
    days: 1,
    quantity: 1,
    flags: FLAG.private // 0x02
  },
  'pass_7d': {
    name: '손님 7일권 (1장)',
    price: 9900,
    days: 7,
    quantity: 1,
    flags: FLAG.private // 0x02
  },
  'group_1d_20': {
    name: '손님 20명 당일 투어 (1일권 20장)',
    price: 66000,
    days: 1,
    quantity: 20,
    flags: FLAG.private // 0x02
  },
  'group_7d_10': {
    name: '손님 10명 3박 4일 투어 (7일권 10장)',
    price: 99000,
    days: 7,
    quantity: 10,
    flags: FLAG.private // 0x02
  },
  'group_7d_20': {
    name: '손님 20명 6박 7일 투어 (7일권 20장)',
    price: 198000,
    days: 7,
    quantity: 20,
    flags: FLAG.private // 0x02
  }
};

// 인메모리 결제 내역 저장소 (테스트 및 모의 환경용)
const paymentStore = new Map();

/**
 * 결제 완료 및 쿠폰 발급 처리
 */
export function handlePaymentComplete({
  paymentId,
  productId,
  amount,
  customerName = 'Guest',
  testKey = true,
  privateKeySeed = null
}) {
  if (!paymentId || typeof paymentId !== 'string') {
    return { status: 400, body: { error: 'invalid_payment_id', message: 'paymentId가 필요합니다.' } };
  }

  // 1. 멱등성 검사: 이미 처리된 paymentId는 기존 발급 데이터 그대로 반환
  if (paymentStore.has(paymentId)) {
    const existing = paymentStore.get(paymentId);
    return { status: 200, body: existing };
  }

  // 2. 상품 검증
  const product = PRODUCTS[productId];
  if (!product) {
    return { status: 400, body: { error: 'invalid_product', message: '유효하지 않은 상품입니다.' } };
  }

  // 3. 결제 금액 일치 검증 (위조 방지)
  if (Number(amount) !== product.price) {
    return { status: 400, body: { error: 'amount_mismatch', message: '결제 금액이 일치하지 않습니다.' } };
  }

  // 4. 서명용 Ed25519 개인키 준비 (테스트 모드는 키 0 사용)
  const keyId = testKey ? 0 : 1;
  const seed = privateKeySeed ? Buffer.from(privateKeySeed, 'hex') : testSeed();
  const privateKey = privateKeyFromSeed(seed);

  // 5. 만료 시각 계산 (UTC 초 단위)
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + (product.days * 86400);

  // 6. 쿠폰 N개 발급 (0x02 플래그)
  const codes = [];
  const baseCust = (customerName.replace(/[^a-zA-Z0-9]/g, '') || 'RT').slice(0, 3);

  for (let i = 0; i < product.quantity; i++) {
    // 6자 이내 고유 식별자 (예: RT0001, RT0002)
    const seqStr = String(i + 1).padStart(3, '0');
    const custTag = `${baseCust}${seqStr}`.slice(0, 6);

    const minted = mintCode({
      keyId,
      exp: expSec,
      flags: product.flags, // 0x02 (private)
      cust: custTag,
      privateKey
    });

    codes.push({
      code: minted.code,
      grouped: minted.grouped,
      link: minted.link,
      exp: expSec,
      flags: product.flags,
      days: product.days
    });
  }

  const responseData = {
    ok: true,
    paymentId,
    productId,
    productName: product.name,
    amount: product.price,
    quantity: product.quantity,
    codes,
    issuedAt: new Date().toISOString()
  };

  // 멱등 저장을 위해 보관
  paymentStore.set(paymentId, responseData);

  return { status: 200, body: responseData };
}

/**
 * 포트원 웹훅 서명 검증 (포트원 V2 규격)
 */
export function verifyPortoneWebhook(signature, bodyString, secret) {
  if (!signature || !secret) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const expected = hmac.update(bodyString, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
