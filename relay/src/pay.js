/**
 * RayTok 쿠폰 온라인 결제 P1 (포트원 V2 연동 및 0x01 관광권 발급)
 * MASTER 08:25 · 08:50 사양:
 *   - 관광권은 하나 (FLAG.host = 0x01 전 상품)
 *   - 만료는 기간(days: 1·7일) + 묵힘 한도(shelfLife: 90일)
 *   - 묶음 상품 (버스 한 대 며칠 몇 명): batchId 발급 및 https://raytok.kr/lic/b/<batch> QR
 *   - 발급 기록 DO 저장소 연동 지원
 */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  mintCode,
  verifyCode,
  testSeed,
  privateKeyFromSeed,
  FLAG
} from './mint-core.js';

// 지원 상품 카탈로그 (MASTER 08:25·08:50 기준: 관광권 0x01 통일, 묶음 QR 지원)
export const PRODUCTS = {
  'pass_1d': {
    name: '관광 1일권 (1장)',
    price: 3300,
    days: 1,
    quantity: 1,
    flags: FLAG.host // 0x01
  },
  'pass_7d': {
    name: '관광 7일권 (1장)',
    price: 9900,
    days: 7,
    quantity: 1,
    flags: FLAG.host // 0x01
  },
  'bus_1d_20': {
    name: '버스 1대 당일 투어 (1일권 20명 묶음 QR)',
    price: 66000,
    days: 1,
    seats: 20,
    quantity: 1,
    isBatch: true,
    flags: FLAG.host // 0x01
  },
  'bus_3d_20': {
    name: '버스 1대 2박 3일 투어 (3일권 20명 묶음 QR)',
    price: 132000,
    days: 3,
    seats: 20,
    quantity: 1,
    isBatch: true,
    flags: FLAG.host // 0x01
  },
  'bus_7d_20': {
    name: '버스 1대 6박 7일 투어 (7일권 20명 묶음 QR)',
    price: 198000,
    days: 7,
    seats: 20,
    quantity: 1,
    isBatch: true,
    flags: FLAG.host // 0x01
  },
  // 단체 개별 발급 호환
  'group_1d_20': {
    name: '관광 20명 당일 투어 (1일권 20장)',
    price: 66000,
    days: 1,
    quantity: 20,
    flags: FLAG.host // 0x01
  },
  'group_7d_10': {
    name: '관광 10명 3박 4일 투어 (7일권 10장)',
    price: 99000,
    days: 7,
    quantity: 10,
    flags: FLAG.host // 0x01
  },
  'group_7d_20': {
    name: '관광 20명 6박 7일 투어 (7일권 20장)',
    price: 198000,
    days: 7,
    quantity: 20,
    flags: FLAG.host // 0x01
  }
};

// 인메모리 결제 내역 저장소 (테스트 및 모의 환경 폴백용)
const paymentStore = new Map();
const batchStore = new Map();
const issuedStore = new Map();

export { paymentStore, batchStore, issuedStore };

/**
 * 결제 완료 및 쿠폰 발급 처리
 */
export async function handlePaymentComplete({
  paymentId,
  productId,
  amount,
  customerName = 'Guest',
  testKey = true,
  privateKeySeed = null,
  storage = null
}) {
  if (!paymentId || typeof paymentId !== 'string') {
    return { status: 400, body: { error: 'invalid_payment_id', message: 'paymentId가 필요합니다.' } };
  }

  // 1. 멱등성 검사: 이미 처리된 paymentId는 기존 발급 데이터 그대로 반환
  if (storage) {
    const existing = await storage.get('payment:' + paymentId);
    if (existing) return { status: 200, body: existing };
  } else if (paymentStore.has(paymentId)) {
    return { status: 200, body: paymentStore.get(paymentId) };
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

  // 4. 서명용 Ed25519 개인키 준비 (08:25 ⑤: privateKeySeed 가 있으면 키 1, 없으면 키 0)
  const keyId = (privateKeySeed && !testKey) ? 1 : 0;
  const seed = privateKeySeed ? Buffer.from(privateKeySeed, 'hex') : testSeed();
  const privateKey = privateKeyFromSeed(seed);

  // 5. 묵힘 한도 계산 (발급 후 90일 이내 첫 사용)
  const nowSec = Math.floor(Date.now() / 1000);
  const shelfLife = nowSec + (90 * 86400);

  // 6-A. 묶음 상품 (버스 한 대 묶음 QR — 08:50 주력 사양)
  if (product.isBatch) {
    const rawUuid = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const batchId = 'b_' + rawUuid;
    const batchData = {
      batchId,
      productId,
      paymentId,
      seats: product.seats,
      days: product.days,
      validFrom: Date.now(),
      validTo: Date.now() + ((product.days + 90) * 86400 * 1000),
      used: [],
      issuedAt: Date.now()
    };

    if (storage) {
      await storage.put('batch:' + rawUuid, batchData);
      await storage.put('payment:' + paymentId, {
        ok: true,
        paymentId,
        productId,
        productName: product.name,
        amount: product.price,
        isBatch: true,
        batchId,
        seats: product.seats,
        days: product.days,
        link: 'https://raytok.kr/lic/b/' + rawUuid,
        issuedAt: batchData.issuedAt
      });
    }
    batchStore.set(rawUuid, batchData);

    const responseBody = {
      ok: true,
      paymentId,
      productId,
      productName: product.name,
      amount: product.price,
      isBatch: true,
      batchId,
      seats: product.seats,
      days: product.days,
      link: 'https://raytok.kr/lic/b/' + rawUuid,
      issuedAt: batchData.issuedAt
    };
    paymentStore.set(paymentId, responseBody);
    return { status: 200, body: responseBody };
  }

  // 6-B. 개별 코드 N개 발급 (관광 1일/7일권, 0x01 플래그)
  const codes = [];
  const baseCust = (customerName.replace(/[^a-zA-Z0-9]/g, '') || 'RT').slice(0, 3);

  for (let i = 0; i < product.quantity; i++) {
    const seqStr = String(i + 1).padStart(3, '0');
    const custTag = `${baseCust}${seqStr}`.slice(0, 6);

    const minted = mintCode({
      keyId,
      days: product.days,
      shelfLife,
      flags: product.flags, // 0x01
      cust: custTag,
      privateKey
    });

    const codeHash = crypto.createHash('sha256').update(minted.code).digest('hex');
    const record = {
      code: minted.code,
      grouped: minted.grouped,
      link: minted.link,
      flags: product.flags,
      days: product.days,
      keyId,
      shelfLife,
      paymentId,
      productId,
      issuedAt: Date.now()
    };

    codes.push(record);
    issuedStore.set(codeHash, record);
    if (storage) {
      await storage.put('issued:' + codeHash, record);
    }
  }

  const responseBody = {
    ok: true,
    paymentId,
    productId,
    productName: product.name,
    amount: product.price,
    quantity: product.quantity,
    codes,
    issuedAt: Date.now()
  };

  if (storage) {
    await storage.put('payment:' + paymentId, responseBody);
  }
  paymentStore.set(paymentId, responseBody);
  return { status: 200, body: responseBody };
}

/**
 * 포트원 웹훅 서명 검증 (HMAC-SHA256)
 */
export function verifyPortoneWebhook(signature, bodyString, secret) {
  if (!signature || !bodyString || !secret) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const expected = hmac.update(bodyString, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
