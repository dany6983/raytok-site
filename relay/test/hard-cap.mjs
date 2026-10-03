import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';

let secret = process.env.LICENSE_SECRET;
const devVarsPath = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(devVarsPath)) {
  const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
  for (const line of lines) {
    const matchSec = line.match(/^LICENSE_SECRET=(.*)$/);
    if (matchSec) secret = matchSec[1].trim();
  }
}

async function run() {
  console.log('=== Relay Desk STT Monthly Hard Cap (100h / 6000m) Guard Test ===');
  console.log('Target URL:', BASE_URL);

  const sub = 'desk-capped-sub-' + Date.now();
  const token = mintLicenseToken({ sub, days: 1, flags: 0x04 | 0x08, secret });

  // 1. 정상 발급 확인 (0분 사용 상태)
  console.log('\n[Test 1] POST /stt/token with 0 usage (should succeed)...');
  const res1 = await fetch(`${BASE_URL}/stt/token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(res1.status, 200);
  console.log('   - [PASS] Normal STT token issue succeeded (200)');

  // 2. 월 상한선 도달 시뮬레이션: 6000분 기록 주입
  console.log('\n[Test 2] Inject 6000 minutes into usage...');
  // Room을 통해 6000분 기록
  const roomRes = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  const { code } = await roomRes.json();
  // 6000분 경과 시뮬레이션
  const adminSecret = process.env.ADMIN_SECRET || 'dev-admin-secret-key-12345';
  await fetch(`${BASE_URL}/room/${code}/test/alarm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ advance_ms: 6000 * 60 * 1000 })
  });
  console.log('   - Desk minutes advanced to cap (6000m)');

  // 3. 상한 초과 상태에서 /stt/token 요청 -> 429 quota_exceeded 차단 검증
  console.log('\n[Test 3] POST /stt/token after hitting hard cap -> expect 429 quota_exceeded...');
  const resCapped = await fetch(`${BASE_URL}/stt/token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('   - Status:', resCapped.status);
  assert.strictEqual(resCapped.status, 429, '상한 도달 시 429 거부되어야 함');
  const errData = await resCapped.json();
  console.log('   - Response Body:', JSON.stringify(errData));
  assert.strictEqual(errData.error, 'quota_exceeded');
  assert.strictEqual(errData.scope, 'desk_minutes');
  assert(errData.used >= 6000, '사용 시간 6000분 이상 반영');
  console.log('   - [PASS] 429 quota_exceeded hard cap guard verified!');

  console.log('\n=== All Hard Cap Guard Tests Passed! ===');
}

run().catch(err => {
  console.error('\n*** Hard Cap Test Failed ***:', err.message);
  process.exit(1);
});
