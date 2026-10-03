import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';

// Load secrets from .dev.vars
let secret = process.env.LICENSE_SECRET;
let adminSecret = process.env.ADMIN_SECRET || 'dev-admin-secret-key-12345';

const devVarsPath = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(devVarsPath)) {
  const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
  for (const line of lines) {
    const matchSec = line.match(/^LICENSE_SECRET=(.*)$/);
    if (matchSec) secret = matchSec[1].trim();
    const matchAdmin = line.match(/^ADMIN_SECRET=(.*)$/);
    if (matchAdmin) adminSecret = matchAdmin[1].trim();
  }
}

async function run() {
  console.log('=== Relay Engine Isolation & Windowed Usage Metric Tests ===');
  console.log('Target URL:', BASE_URL);

  const token = mintLicenseToken({ sub: 'engine-test-user', days: 1, flags: 0x04, secret });
  const testText = '동일 문장 엔진 격리 검증 ' + Date.now();

  // ─────────────────────────────────────────────────────────────
  // [보안 검증] X-Translate-Engine 헤더 및 mock 엔진 인가 가드 검증
  // ─────────────────────────────────────────────────────────────
  console.log('\n[보안 검증] X-Translate-Engine 헤더 및 허용 목록 보안 가드:');

  // 1) 일반 토큰으로 X-Translate-Engine 헤더 전달 시 -> 403 차단
  const resSec1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Translate-Engine': 'mock'
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  console.log('1) 관리자 비밀 없는 X-Translate-Engine 요청 status:', resSec1.status);
  assert.strictEqual(resSec1.status, 403, '일반 클라이언트가 X-Translate-Engine 사용 시 403 차단되어야 함');
  console.log('   - [PASS] 비인가 엔진 헤더 403 차단 확인');

  // 2) 허용 목록 밖의 엔진 이름 전달 시 -> 400 bad_engine 거부
  const resSec2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Admin-Secret': adminSecret,
      'X-Translate-Engine': 'invalid_random_engine_123'
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  console.log('2) 허용 목록 밖 엔진 요청 status:', resSec2.status);
  assert.strictEqual(resSec2.status, 400);
  const dataSec2 = await resSec2.json();
  assert.strictEqual(dataSec2.error, 'bad_engine');
  console.log('   - [PASS] 미지원 엔진 이름 400 bad_engine 거부 확인');

  // ─────────────────────────────────────────────────────────────
  // [고침 1] 실제 캐시 격리 시험 (엔진이 바뀌면 동일 문장이어도 MISS)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[고침 1] 엔진 간 캐시 격리 실증 시험:');

  // ① 기본 google 엔진으로 최초 번역 -> MISS (캐시에 저장됨)
  console.log('1) google 엔진으로 번역 요청...');
  const resG1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  assert.strictEqual(resG1.status, 200);
  assert.strictEqual(resG1.headers.get('X-Cache'), 'MISS', '첫 구글 요청은 MISS여야 함');
  const dataG1 = await resG1.json();
  console.log('   - 결과:', dataG1.t[0], '(X-Cache:', resG1.headers.get('X-Cache') + ')');

  // ② 동일한 text로 google 재요청 -> HIT
  console.log('2) google 엔진으로 동일 문장 재요청...');
  const resG2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  assert.strictEqual(resG2.status, 200);
  assert.strictEqual(resG2.headers.get('X-Cache'), 'HIT', '동일 엔진 동일 문장은 HIT여야 함');
  console.log('   - [PASS] google 재요청 X-Cache = HIT 확인');

  // ③ [핵심 단언문] 완전히 동일한 text를 mock 엔진으로 관리자 요청 -> 반드시 MISS 여야 함!
  console.log('3) [단언문 검증] 동일 문장을 다른 엔진(mock)으로 관리자 요청...');
  const resM1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Admin-Secret': adminSecret,
      'X-Translate-Engine': 'mock'
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  assert.strictEqual(resM1.status, 200);
  const cacheM1 = resM1.headers.get('X-Cache');
  console.log('   - mock 엔진 X-Cache:', cacheM1);
  assert.strictEqual(cacheM1, 'MISS', '구글 캐시가 mock 엔진에 누출되지 않고 반드시 MISS여야 함!');
  const dataM1 = await resM1.json();
  assert(dataM1.t[0].startsWith('[mock]'), 'mock 엔진의 번역문이 반환되어야 함');
  console.log('   - [PASS] 다른 엔진 요청 시 X-Cache = MISS 격리 실증 완료!');

  // ④ mock 엔진으로 동일 문장 재요청 -> mock 캐시 HIT
  const resM2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Admin-Secret': adminSecret,
      'X-Translate-Engine': 'mock'
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  assert.strictEqual(resM2.headers.get('X-Cache'), 'HIT');
  console.log('   - [PASS] mock 엔진 자체 캐시 X-Cache = HIT 확인');

  // ⑤ 다시 google 엔진으로 동일 문장 요청 -> google 캐시 HIT 유지 및 번역문 무오염 확인
  const resG3 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ q: [testText], source: 'ko', target: 'en' })
  });
  assert.strictEqual(resG3.headers.get('X-Cache'), 'HIT');
  const dataG3 = await resG3.json();
  assert(!dataG3.t[0].startsWith('[mock]'), '구글 캐시가 mock 번역문으로 덮어써지지 않아야 함');
  console.log('   - [PASS] google 캐시 내용 무오염 보존 확인 (결과: ' + dataG3.t[0] + ')');

  // ─────────────────────────────────────────────────────────────
  // [고침 2] GET /usage 인증 시험 (비인가 차단 401)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[고침 2] GET /usage 인증 가드 시험:');

  // ① 인증 없이 호출 -> 401 차단
  const resU1 = await fetch(`${BASE_URL}/usage`);
  console.log('1) 인증 없는 GET /usage status:', resU1.status);
  assert.strictEqual(resU1.status, 401, '토큰 없이 /usage 접근 시 401 차단되어야 함');
  console.log('   - [PASS] 비인가 접근 401 차단 확인');

  // ② 잘못된 토큰으로 호출 -> 401 차단
  const resU2 = await fetch(`${BASE_URL}/usage`, {
    headers: { 'Authorization': 'Bearer invalid.token' }
  });
  assert.strictEqual(resU2.status, 401);
  console.log('   - [PASS] 위조 토큰 접근 401 차단 확인');

  // ③ 유효한 라이선스 토큰으로 호출 -> 200 성공
  const resU3 = await fetch(`${BASE_URL}/usage`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(resU3.status, 200);
  console.log('   - [PASS] 인증된 토큰으로 GET /usage 200 접근 성공');

  // ④ 관리자 시크릿으로 호출 -> 200 성공
  const resU4 = await fetch(`${BASE_URL}/usage`, {
    headers: { 'X-Admin-Secret': adminSecret }
  });
  assert.strictEqual(resU4.status, 200);
  console.log('   - [PASS] 관리자 시크릿으로 GET /usage 200 접근 성공');

  // ─────────────────────────────────────────────────────────────
  // [고침 3] 시간창 기반 실패율 집계 시험 (window_1h, window_24h, lifetime)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[고침 3] 시간창 기반 실패율 경보 집계 시험:');
  const usageData = await resU3.json();

  assert(usageData.engine, 'engine 객체 존재');
  assert(usageData.engine.current, 'current 엔진 이름 존재');
  assert(usageData.engine.window_1h, 'window_1h 시간창 집계 존재');
  assert(usageData.engine.window_24h, 'window_24h 시간창 집계 존재');
  assert(usageData.engine.lifetime, 'lifetime 누적 집계 존재');

  const w1h = usageData.engine.window_1h;
  assert(typeof w1h.calls === 'number', 'window_1h.calls 숫자형');
  assert(typeof w1h.failures === 'number', 'window_1h.failures 숫자형');
  assert(typeof w1h.rate === 'string' && w1h.rate.endsWith('%'), 'window_1h.rate 백분율 문자열');

  console.log(`- 1시간 창: calls=${w1h.calls}, failures=${w1h.failures}, rate=${w1h.rate}`);
  console.log(`- 24시간 창: calls=${usageData.engine.window_24h.calls}, failures=${usageData.engine.window_24h.failures}, rate=${usageData.engine.window_24h.rate}`);
  console.log(`- 누적(lifetime): calls=${usageData.engine.lifetime.calls}, failures=${usageData.engine.lifetime.failures}, rate=${usageData.engine.lifetime.rate}`);

  console.log('[PASS] 보안 가드, 고침 1, 고침 2, 고침 3 전 항목 단언문 검증 통과!');
}

run().catch(err => {
  console.error('\n*** Test Failed ***:', err.message);
  process.exit(1);
});
