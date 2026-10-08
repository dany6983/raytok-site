import assert from 'assert';
import relayApp from '../src/index.js';
import { Room } from '../src/room.js';
import { mintLicenseToken } from '../tools/mint-license.mjs';

console.log('=== Relay 서버 사용 제한 묶음 1차 순수 단위 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

// ── Mock Durable Object 환경 구축 ──
class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) {
      const res = new Map();
      k.forEach(key => res.set(key, this.map.get(key)));
      return res;
    }
    return this.map.get(k);
  }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
}

const mockStorage = new MockStorage();
const mockCtxObj = {
  storage: mockStorage,
  getTags: () => ['listener'],
  blockConcurrencyWhile: async (fn) => await fn(),
  getWebSockets: () => []
};
const mockRoomInstance = new Room(mockCtxObj, {});

const mockEnv = {
  LICENSE_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  LICENSE_MAX_DEVICES: '3',
  TRANSLATE_CAP_CHARS: '100', // 시험용 100자 상한
  GOOGLE_TRANSLATE_KEY: 'mock_google_key',
  ROOM: {
    idFromName: (name) => ({ name }),
    get: (_id) => ({
      fetch: (req) => mockRoomInstance.fetch(req)
    })
  }
};

const mockCtx = {
  waitUntil: (p) => p
};

// Google 번역 상류 mock
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : (input.url || '');
  if (urlStr.includes('translation.googleapis.com')) {
    return new Response(JSON.stringify({
      data: {
        translations: [{ translatedText: 'Mock translated text', detectedSourceLanguage: 'ko' }]
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(input, init);
};

async function testLimitsBundle() {
  const secret = mockEnv.LICENSE_SECRET;
  const sub = `bundle_sub_${Date.now()}`;
  const token = mintLicenseToken({
    sub,
    days: 30,
    flags: 0x02 | 0x04,
    secret
  });

  // ── 1. 동시 기기 수 제한 (LICENSE_MAX_DEVICES=3) 검증 ──
  console.log('\n[1] 동시 기기 수 제한 검증 (/license/verify)');
  
  // 기기 1 등록
  const req1 = new Request('http://localhost/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceId: 'device-1' })
  });
  const res1 = await relayApp.fetch(req1, mockEnv, mockCtx);
  ok(res1.status === 200, '기기 1 등록 성공 (200 OK)');

  // 기기 2 등록
  const req2 = new Request('http://localhost/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceId: 'device-2' })
  });
  const res2 = await relayApp.fetch(req2, mockEnv, mockCtx);
  ok(res2.status === 200, '기기 2 등록 성공 (200 OK)');

  // 기기 3 등록
  const req3 = new Request('http://localhost/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceId: 'device-3' })
  });
  const res3 = await relayApp.fetch(req3, mockEnv, mockCtx);
  ok(res3.status === 200, '기기 3 등록 성공 (200 OK)');

  // 기기 4 등록 시도 -> 401 too_many_devices
  const req4 = new Request('http://localhost/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceId: 'device-4' })
  });
  const res4 = await relayApp.fetch(req4, mockEnv, mockCtx);
  ok(res4.status === 401, '기기 4 등록 시도 시 401 차단');
  const d4 = await res4.json();
  ok(d4.error === 'too_many_devices', '에러 코드 too_many_devices 일치');
  ok(d4.limit === 3, '상한 정보 limit: 3 반환');

  // 기존 등록된 기기 1 재접속 허용 확인
  const req1Retry = new Request('http://localhost/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceId: 'device-1' })
  });
  const res1Retry = await relayApp.fetch(req1Retry, mockEnv, mockCtx);
  ok(res1Retry.status === 200, '기존 등록된 기기 1 재접속 허용 (200 OK)');

  // ── 2. 월 번역 글자 상한 및 80% 경고 검증 (/translate) ──
  console.log('\n[2] 월 번역 글자 상한 및 80% 경고 검증 (/translate)');
  const currentMonth = new Date().toISOString().slice(0, 7);

  // 2-1. 85자 사용량 주입 (상한 100자의 85%)
  const recRes = await mockRoomInstance.fetch(new Request('http://internal/usage/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub, target: 'en', chars: 85 })
  }));
  console.log('usage record response status:', recRes.status, await recRes.text());

  const chkRes = await mockRoomInstance.fetch(new Request(`http://internal/usage/summary?month=${currentMonth}&sub=${encodeURIComponent(sub)}`));
  console.log('direct usage summary:', await chkRes.json());

  // 번역 10자 요청 (누적 85자 + 10자 = 95자, 95% >= 80%)
  const reqWarn = new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: ['ABCDEFGHIJ'], source: 'ko', target: 'en' })
  });
  const resWarn = await relayApp.fetch(reqWarn, mockEnv, mockCtx);
  console.log('resWarn headers:', Object.fromEntries(resWarn.headers.entries()));
  ok(resWarn.status === 200, '번역 200 OK 성공');
  ok(resWarn.headers.get('X-RayTok-Warn') === '80', '80% 이상 사용 시 X-RayTok-Warn: 80 헤더 반환 확인');

  // 2-2. 105자 사용량 주입 (상한 100자 초과)
  await mockRoomInstance.fetch(new Request('http://internal/usage/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sub, target: 'en', chars: 20 })
  }));

  const reqExceeded = new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: ['HELLO'], source: 'ko', target: 'en' })
  });
  const resExceeded = await relayApp.fetch(reqExceeded, mockEnv, mockCtx);
  ok(resExceeded.status === 429, '상한 100% 초과 시 HTTP 429 반환');
  const excData = await resExceeded.json();
  ok(excData.error === 'quota_exceeded', '에러 코드 quota_exceeded 일치');
  ok(excData.scope === 'translate_chars', 'scope translate_chars 일치');
  ok(excData.limit === 100, 'limit 100 일치');

  console.log(`\n전부 통과 (${passCount}건)`);
  globalThis.fetch = realFetch;
  process.exit(0);
}

testLimitsBundle().catch(err => {
  console.error('\n[FAIL]', err);
  globalThis.fetch = realFetch;
  process.exit(1);
});
