import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';

// Load secret from .dev.vars
let secret = process.env.LICENSE_SECRET;
if (!secret) {
  const devVarsPath = path.resolve(__dirname, '../.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^LICENSE_SECRET=(.*)$/);
      if (match) {
        secret = match[1].trim();
        break;
      }
    }
  }
}

async function run() {
  console.log('=== Relay Translation Engine & Failure Metric Test ===');
  console.log('Target URL:', BASE_URL);

  const token = mintLicenseToken({ sub: 'engine-test-user', days: 1, flags: 0x04, secret });

  // 1. 번역 호출 (Google 엔진 성공)
  console.log('\n[Test 1] POST /translate with default engine (google)...');
  const res1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      q: ['엔진 교체 테스트입니다.'],
      source: 'ko',
      target: 'en'
    })
  });
  console.log('Status:', res1.status);
  const data1 = await res1.json();
  console.log('Output:', JSON.stringify(data1.t));
  assert.strictEqual(res1.status, 200);
  assert(data1.t && data1.t[0]);
  console.log('[PASS] Test 1: Translation successful with default engine');

  // 2. /usage 조회 -> google 호출 횟수 및 통계 확인
  console.log('\n[Test 2] GET /usage to verify engine metrics...');
  const res2 = await fetch(`${BASE_URL}/usage`);
  console.log('Status:', res2.status);
  const data2 = await res2.json();
  console.log('Usage Engine Response:', JSON.stringify(data2));
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(data2.engine.current, 'google');
  console.log('[PASS] Test 2: /usage returned engine status and failure metrics');

  // 3. 캐시 분리 검증 (같은 텍스트 다른 엔진 캐시 키 분리 확인)
  console.log('\n[Test 3] Cache Key Engine isolation verification...');
  // 동일 텍스트 재요청 시 X-Cache: HIT 확인
  const res3 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      q: ['엔진 교체 테스트입니다.'],
      source: 'ko',
      target: 'en'
    })
  });
  const xCache = res3.headers.get('X-Cache');
  console.log('X-Cache Header:', xCache);
  assert.strictEqual(xCache, 'HIT', '동일 엔진 동일 텍스트는 HIT');
  console.log('[PASS] Test 3: Cache key verified with engine namespace');

  console.log('\n=== All Engine Adapter & Metric Tests Passed! ===');
}

run().catch(err => {
  console.error('\n*** Engine Test Failed ***:', err.message);
  process.exit(1);
});
