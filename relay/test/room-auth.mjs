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

if (!secret) {
  console.error('LICENSE_SECRET required for room auth tests');
  process.exit(1);
}

async function run() {
  console.log('=== Relay /room kind & /stt/token License Authentication Test ===');
  console.log('Target URL:', BASE_URL);

  const tokenConsumer = mintLicenseToken({ sub: 'user-consumer', days: 1, flags: 0x00, secret });
  const tokenGuide = mintLicenseToken({ sub: 'user-guide', days: 1, flags: 0x01, secret });
  const tokenMeet = mintLicenseToken({ sub: 'user-meet', days: 1, flags: 0x04, secret });
  const tokenDesktop = mintLicenseToken({ sub: 'user-desktop', days: 1, flags: 0x08, secret });
  const tokenExpired = mintLicenseToken({ sub: 'user-expired', days: -1, flags: 0x04, secret });

  // 1. 토큰 없이 /room 호출 -> 401
  console.log('\n[Test 1] POST /room without token...');
  const res1 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Status:', res1.status);
  const data1 = await res1.json();
  assert.strictEqual(res1.status, 401, '토큰 없을 시 401 응답이어야 함');
  assert.strictEqual(data1.error, 'no_token');
  console.log('[PASS] Test 1: Blocked with 401 (no_token)');

  // 2. kind 생략(기본 guide=0x01) + guide 토큰(0x01) -> 200
  console.log('\n[Test 2] POST /room kind omitted (default guide) + guide token (flags: 0x01)...');
  const res2 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenGuide}`
    }
  });
  console.log('Status:', res2.status);
  const data2 = await res2.json();
  assert.strictEqual(res2.status, 200, '기본 guide 방은 0x01 토큰으로 200이어야 함');
  assert(data2.code && data2.code.length === 6);
  console.log('[PASS] Test 2: Guide default room created with 200: code=' + data2.code);

  // 3. kind="guide" 명시 + guide 토큰(0x01) -> 200
  console.log('\n[Test 3] POST /room kind="guide" + guide token (flags: 0x01)...');
  const res3 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenGuide}`
    },
    body: JSON.stringify({ kind: 'guide' })
  });
  console.log('Status:', res3.status);
  const data3 = await res3.json();
  assert.strictEqual(res3.status, 200, 'kind="guide" 방은 0x01 토큰으로 200이어야 함');
  console.log('[PASS] Test 3: kind="guide" room created with 200: code=' + data3.code);

  // 4. [마스터 지시 필수 시험] guide 토큰으로 kind="desk" -> 401 차단!
  console.log('\n[Test 4] POST /room kind="desk" with guide token (flags: 0x01)...');
  const res4 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenGuide}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  console.log('Status:', res4.status);
  const data4 = await res4.json();
  console.log('Body:', JSON.stringify(data4));
  assert.strictEqual(res4.status, 401, 'guide 토큰으로 kind="desk" 요청 시 401 차단되어야 함');
  console.log('[PASS] Test 4: Successfully blocked guide token on desk room with 401!');

  // 5. meet 토큰(0x04)으로 kind="desk" -> 200
  console.log('\n[Test 5] POST /room kind="desk" with meet token (flags: 0x04)...');
  const res5 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenMeet}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  console.log('Status:', res5.status);
  const data5 = await res5.json();
  assert.strictEqual(res5.status, 200, 'meet 토큰으로 kind="desk" 방 200 생성되어야 함');
  console.log('[PASS] Test 5: Desk room created with 200 (flags: 0x04): code=' + data5.code);

  // 6. desktop 토큰(0x08)으로 kind="desk" -> 200
  console.log('\n[Test 6] POST /room kind="desk" with desktop token (flags: 0x08)...');
  const res6 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenDesktop}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  console.log('Status:', res6.status);
  const data6 = await res6.json();
  assert.strictEqual(res6.status, 200, 'desktop 토큰으로 kind="desk" 방 200 생성되어야 함');
  console.log('[PASS] Test 6: Desk room created with 200 (flags: 0x08): code=' + data6.code);

  // 7. consumer 토큰(0x00)으로 kind="desk" -> 401
  console.log('\n[Test 7] POST /room kind="desk" with consumer token (flags: 0x00)...');
  const res7 = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenConsumer}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  console.log('Status:', res7.status);
  assert.strictEqual(res7.status, 401, '소비자 토큰은 401 차단되어야 함');
  console.log('[PASS] Test 7: Consumer token blocked with 401');

  // 8. /stt/token 토큰 없이 호출 -> 401
  console.log('\n[Test 8] POST /stt/token without token...');
  const res8 = await fetch(`${BASE_URL}/stt/token`, { method: 'POST' });
  console.log('Status:', res8.status);
  assert.strictEqual(res8.status, 401);
  console.log('[PASS] Test 8: Blocked with 401 (no token)');

  // 9. /stt/token guide 토큰(0x01)으로 호출 -> 401
  console.log('\n[Test 9] POST /stt/token with guide token (flags: 0x01)...');
  const res9 = await fetch(`${BASE_URL}/stt/token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenGuide}` }
  });
  console.log('Status:', res9.status);
  assert.strictEqual(res9.status, 401, 'guide 토큰은 STT 임시 키 발급 불가(401)');
  console.log('[PASS] Test 9: Blocked guide token from STT key issuance with 401');

  // 10. /stt/token desk 토큰(0x04)으로 호출 -> 200 (Deepgram 임시 키 발급)
  console.log('\n[Test 10] POST /stt/token with desk token (flags: 0x04)...');
  const res10 = await fetch(`${BASE_URL}/stt/token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenMeet}` }
  });
  console.log('Status:', res10.status);
  const data10 = await res10.json();
  console.log('Response keys:', Object.keys(data10));
  if (res10.status === 200) {
    assert(data10.token, '임시 STT 토큰 발급 확인');
    assert(data10.key_id, 'Deepgram key_id 확인');
    console.log('[PASS] Test 10: Ephemeral Deepgram key issued successfully! Prefix=' + data10.token.slice(0, 8) + '...');
  } else {
    console.warn('[WARN] Test 10 upstream status:', res10.status, data10);
    assert.strictEqual(res10.status, 200, '정상 200 응답이어야 함');
  }

  console.log('\n=== All 10 Room Kind & STT Ephemeral Key Tests Passed! ===');
}

run().catch(err => {
  console.error('\n*** Test Failed ***:', err.message);
  process.exit(1);
});
