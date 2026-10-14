// samples/license_redeem_test.js — 이용권 릴레이 등록 및 묶음 QR 주력 시스템 (08:25 · 08:50 지시) 검증 시험
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import relayWorker from '../relay/src/index.js';
import { Room } from '../relay/src/room.js';
import {
  mintCode,
  testSeed,
  privateKeyFromSeed,
  FLAG
} from '../relay/src/mint-core.js';
import { handlePaymentComplete, PRODUCTS } from '../relay/src/pay.js';

console.log('=== 이용권 릴레이 등록(/license/redeem) 및 묶음 QR 주력 검증 시험 ===\n');

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks++;
  console.log(`  [PASS] ${msg}`);
}

const key0 = privateKeyFromSeed(testSeed());

// Mock Environment & DO Context
class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) {
      const res = new Map();
      for (const item of k) res.set(item, this.map.get(item));
      return res;
    }
    return this.map.get(k);
  }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { return this.map.delete(k); }
}

class MockRoomDO {
  constructor() {
    this.ctx = {
      storage: new MockStorage(),
      getWebSockets: () => [],
      getTags: () => [],
      blockConcurrencyWhile: async (fn) => { if (typeof fn === 'function') await fn(); }
    };
    this.room = new Room(this.ctx, {});
  }
  async fetch(req) { return this.room.fetch(req); }
}

const roomDO = new MockRoomDO();
const env = {
  ROOM: {
    idFromName: () => 'SINGLETON_ID',
    get: () => roomDO
  },
  LICENSE_MAX_DEVICES: '1'
};

(async () => {
  /* ── 1. 08:25 사양: 관광권 0x01 통일 및 기간형(일수) 발급 ── */
  console.log('[Test 1] 관광 1일권(0x01, days: 1) 발급 및 Ed25519 유효성');
  const minted1 = mintCode({
    keyId: 0,
    days: 1,
    shelfLife: Math.floor(Date.now() / 1000) + 90 * 86400,
    flags: FLAG.host, // 0x01
    cust: 'RT0001',
    privateKey: key0
  });
  ok(minted1.code.length === 128, '코드 128자 일치');

  /* ── 2. POST /license/redeem 개별 코드 등록: 쿠폰 하나 = 기기 하나 (08:25 ③) ── */
  console.log('\n[Test 2] 개별 코드 등록 (/license/redeem): 기기 1대 제한 자물쇠');
  // 기기 1 등록
  const req1 = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: minted1.code, deviceId: 'phone_device_001' })
  });
  const res1 = await relayWorker.fetch(req1, env, {});
  ok(res1.status === 200, '기기 1 최초 등록 200 OK');
  const data1 = await res1.json();
  ok(data1.valid === true, 'valid: true 응답 확인');
  ok(typeof data1.activatedAt === 'number' && typeof data1.expiresAt === 'number', 'activatedAt 및 expiresAt 타임스탬프 부여');
  ok(data1.devices.limit === 1 && data1.devices.count === 1, 'LICENSE_MAX_DEVICES=1 (기기 1대 제한)');

  // 기기 1 재요청 (동일 기기): 자리 차지 없이 200 OK
  const req1Dupe = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: minted1.code, deviceId: 'phone_device_001' })
  });
  const res1Dupe = await relayWorker.fetch(req1Dupe, env, {});
  ok(res1Dupe.status === 200, '동일 기기 재요청 200 OK (자리 차지 없음)');

  // 기기 2 등록 시도: 401 too_many_devices 거부
  const req2 = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: minted1.code, deviceId: 'phone_device_002' })
  });
  const res2 = await relayWorker.fetch(req2, env, {});
  ok(res2.status === 401, '다른 기기(2번째 기기) 등록 시 401 차단');
  const data2 = await res2.json();
  ok(data2.error === 'too_many_devices', 'error: too_many_devices 확인');

  // 잘못된 서명 코드
  const badCode = minted1.code.slice(0, 120) + 'XXXX';
  const reqBad = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: badCode, deviceId: 'phone_device_003' })
  });
  const resBad = await relayWorker.fetch(reqBad, env, {});
  ok(resBad.status === 401, '잘못된 코드(서명 오류) 401 차단');

  /* ── 3. 08:50 주력 사양: 묶음 QR (버스 한 대 며칠 몇 명) ── */
  console.log('\n[Test 3] 08:50 주력 사양: 묶음 QR 발급 및 N+1번째 no_seats 차단');
  // 버스 1대 당일 투어 (정원 3명 모의) 결제 완료 처리
  const payBatch = await handlePaymentComplete({
    paymentId: 'pay_batch_bus_001',
    productId: 'bus_1d_20',
    amount: 66000,
    customerName: 'TourBus',
    portoneSecret: 'test_portone_secret_999',
    skipPgVerification: true
  });
  ok(payBatch.status === 200, '묶음 상품 결제 승인 200 OK');
  ok(payBatch.body.isBatch === true, 'isBatch: true 확인');
  ok(payBatch.body.link.includes('/lic/b/'), '묶음 QR 링크 형식 확인 (/lic/b/<batch>)');

  // 묶음 데이터 DO 저장소 주입 (정원 3명으로 설정)
  const rawBatchId = payBatch.body.batchId.replace(/^b_/, '');
  const testBatchData = {
    batchId: payBatch.body.batchId,
    seats: 3, // 시험용 3명 정원
    days: 1,
    validFrom: Date.now() - 1000,
    validTo: Date.now() + 86400 * 1000 * 90,
    used: []
  };
  await roomDO.ctx.storage.put('batch:' + rawBatchId, testBatchData);

  // 손님 1 스캔
  const bReq1 = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: rawBatchId, deviceId: 'bus_guest_01' })
  });
  const bRes1 = await relayWorker.fetch(bReq1, env, {});
  ok(bRes1.status === 200, '묶음 손님 1 등록 200 OK');
  const bData1 = await bRes1.json();
  ok(bData1.valid === true && bData1.used === 1, '손님 1 등록 후 used=1 확인');

  // 손님 1 재스캔 (동일 기기): 자리 안 씀
  const bReq1Dupe = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: rawBatchId, deviceId: 'bus_guest_01' })
  });
  const bRes1Dupe = await relayWorker.fetch(bReq1Dupe, env, {});
  ok(bRes1Dupe.status === 200, '손님 1 재스캔 200 OK (자리 보존)');
  const bData1Dupe = await bRes1Dupe.json();
  ok(bData1Dupe.used === 1, '재스캔 시 used=1 유지 (자리 증가 없음)');

  // 손님 2 스캔
  const bReq2 = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: rawBatchId, deviceId: 'bus_guest_02' })
  });
  const bRes2 = await relayWorker.fetch(bReq2, env, {});
  ok(bRes2.status === 200, '묶음 손님 2 등록 200 OK (used=2)');

  // 손님 3 스캔 (정원 3명 만석)
  const bReq3 = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: rawBatchId, deviceId: 'bus_guest_03' })
  });
  const bRes3 = await relayWorker.fetch(bReq3, env, {});
  ok(bRes3.status === 200, '묶음 손님 3 등록 200 OK (used=3 만석)');

  // 손님 4 스캔 (정원 초과): 401 no_seats 거부
  const bReq4 = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: rawBatchId, deviceId: 'bus_guest_04' })
  });
  const bRes4 = await relayWorker.fetch(bReq4, env, {});
  ok(bRes4.status === 401, '자리 N(3)에 N+1번째 손님 4 등록 시 401 차단');
  const bData4 = await bRes4.json();
  ok(bData4.error === 'no_seats', 'error: no_seats 확인');

  // 유효기간 만료 묶음 QR: 401 expired
  const expiredBatchData = {
    batchId: 'b_expired_001',
    seats: 10,
    days: 1,
    validFrom: Date.now() - 100000,
    validTo: Date.now() - 1000, // 이미 만료
    used: []
  };
  await roomDO.ctx.storage.put('batch:expired_001', expiredBatchData);
  const bReqExp = new Request('http://localhost/license/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: 'expired_001', deviceId: 'bus_guest_exp' })
  });
  const bResExp = await relayWorker.fetch(bReqExp, env, {});
  ok(bResExp.status === 401, '유효기간 지난 묶음 QR 401 차단');
  const bDataExp = await bResExp.json();
  ok(bDataExp.error === 'expired', 'error: expired 확인');

  /* ── 4. 가이드 화면 현황 조회 (오늘 N명 / 총 M명) ── */
  console.log('\n[Test 4] 가이드 화면 현황 조회: 오늘 N명 / 총 M명');
  const statReq = new Request(`http://localhost/license/batch/${rawBatchId}`, { method: 'GET' });
  const statRes = await relayWorker.fetch(statReq, env, {});
  ok(statRes.status === 200, '가이드 batch 현황 조회 200 OK');
  const statData = await statRes.json();
  ok(statData.seats === 3 && statData.usedCount === 3, '정원 3명, 사용 3명 확인');
  ok(statData.summaryText === '오늘 3명 / 총 3명', '요약 문구 "오늘 3명 / 총 3명" 확인');

  /* ── 5. D-09 되돌림 실증 2건 ── */
  console.log('\n[Test 5] 특허/비즈니스 자물쇠 되돌림 실증 2건');
  // ⚠ 되돌림은 **릴레이가 실제로 돌려준 답**으로 한다. 시험 안에서 만든 상수로 하면
  //   릴레이를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).

  // ① 정원 3명에 4번째 손님이 받은 **진짜** 답을 본다. 지금 401 이라서 아래 단언이 던진다.
  //    자리 검사를 빼면 200 이 되어 던지지 않고 ok 가 붉는다.
  let revertSeatsFailed = false;
  try {
    assert.strictEqual(bRes4.status, 200, `정원 3명인데 4번째 손님이 ${bRes4.status} 로 승인됐다`);
  } catch (e) {
    revertSeatsFailed = true;
  }
  ok(revertSeatsFailed === true, '정원 초과 손님 no_seats 차단을 빼면 붉어진다 (되돌림 실증 1)');

  // ② 2번째 기기가 받은 **진짜** 오류를 본다. 지금 too_many_devices 라서 아래 단언이 던진다.
  //    기기 수 검사를 빼면 그 오류가 사라져 던지지 않고 ok 가 붉는다.
  let revertDevLimitFailed = false;
  try {
    assert.notStrictEqual(data2.error, 'too_many_devices', '2번째 기기가 too_many_devices 로 막히지 않았다');
  } catch (e) {
    revertDevLimitFailed = true;
  }
  ok(revertDevLimitFailed === true, '2번째 기기 too_many_devices 차단을 빼면 붉어진다 (되돌림 실증 2)');

  console.log(`\n전부 통과 (${checks}건)`);
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
