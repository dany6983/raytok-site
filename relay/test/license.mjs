import { mintLicenseToken } from '../tools/mint-license.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';

// Load secret from .dev.vars if not in env
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

async function main() {
  console.log('=== Relay License Token Test ===');
  console.log('Target URL:', BASE_URL);

  let passedTests = 0;

  // ① 유효 토큰 → 200
  console.log('\n[Test 1] Valid token (flags=6: camera|meet, days=30) -> 200 expected');
  const validToken = mintLicenseToken({ sub: 'device-valid-1', days: 30, flags: 6, secret });
  const res1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validToken}`
    },
    body: JSON.stringify({ q: ['반갑습니다.'], source: 'ko', target: 'en' })
  });
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}`);
  console.log('Response:', JSON.stringify(data1));

  if (res1.status !== 200 || !data1.t) {
    throw new Error(`Test 1 Failed: expected 200 with t array, got ${res1.status}`);
  }
  console.log('Result: PASS (Valid token accepted, translated output received)');
  passedTests++;

  // ② 헤더 없음 → 401 no_token
  console.log('\n[Test 2] Missing Authorization header -> 401 no_token expected');
  const res2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: ['테스트'], target: 'en' })
  });
  const data2 = await res2.json();
  console.log(`Status: ${res2.status}`);
  console.log('Response:', JSON.stringify(data2));

  if (res2.status !== 401 || data2.error !== 'no_token') {
    throw new Error(`Test 2 Failed: expected 401 no_token, got ${res2.status} ${JSON.stringify(data2)}`);
  }
  console.log('Result: PASS (Rejected with no_token)');
  passedTests++;

  // ③ 서명 조작 → 401 bad_token
  console.log('\n[Test 3] Tampered token signature -> 401 bad_token expected');
  const parts = validToken.split('.');
  const tamperedSig = (parts[1].slice(0, -4) + 'zzzz');
  const tamperedToken = `${parts[0]}.${tamperedSig}`;

  const res3 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tamperedToken}`
    },
    body: JSON.stringify({ q: ['테스트'], target: 'en' })
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}`);
  console.log('Response:', JSON.stringify(data3));

  if (res3.status !== 401 || data3.error !== 'bad_token') {
    throw new Error(`Test 3 Failed: expected 401 bad_token, got ${res3.status} ${JSON.stringify(data3)}`);
  }
  console.log('Result: PASS (Rejected with bad_token)');
  passedTests++;

  // ④ 만료 토큰 → 401 expired
  console.log('\n[Test 4] Expired token (days=-1) -> 401 expired expected');
  const expiredToken = mintLicenseToken({ sub: 'device-expired', days: -1, flags: 6, secret });
  const res4 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${expiredToken}`
    },
    body: JSON.stringify({ q: ['테스트'], target: 'en' })
  });
  const data4 = await res4.json();
  console.log(`Status: ${res4.status}`);
  console.log('Response:', JSON.stringify(data4));

  if (res4.status !== 401 || data4.error !== 'expired') {
    throw new Error(`Test 4 Failed: expected 401 expired, got ${res4.status} ${JSON.stringify(data4)}`);
  }
  console.log('Result: PASS (Rejected with expired)');
  passedTests++;

  // ⑤ flags=1(guide만) → 403 not_allowed
  console.log('\n[Test 5] Insufficient flags (flags=1: guide only) -> 403 not_allowed expected');
  const guideOnlyToken = mintLicenseToken({ sub: 'device-guide-only', days: 30, flags: 1, secret });
  const res5 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${guideOnlyToken}`
    },
    body: JSON.stringify({ q: ['테스트'], target: 'en' })
  });
  const data5 = await res5.json();
  console.log(`Status: ${res5.status}`);
  console.log('Response:', JSON.stringify(data5));

  if (res5.status !== 403 || data5.error !== 'not_allowed') {
    throw new Error(`Test 5 Failed: expected 403 not_allowed, got ${res5.status} ${JSON.stringify(data5)}`);
  }
  console.log('Result: PASS (Rejected with not_allowed)');
  passedTests++;

  // ⑥ 같은 sub로 61회 → 429 rate_limited
  console.log('\n[Test 6] 61 requests with same sub -> 429 rate_limited on 61st request expected');
  const spamSub = `device-spam-${Date.now()}`;
  const spamToken = mintLicenseToken({ sub: spamSub, days: 30, flags: 6, secret });

  console.log('Sending requests 1 to 60...');
  for (let i = 1; i <= 60; i++) {
    const res = await fetch(`${BASE_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${spamToken}`
      },
      body: JSON.stringify({ q: ['안녕'], target: 'en' })
    });
    if (res.status !== 200) {
      throw new Error(`Test 6 Failed early at request #${i}: status ${res.status}`);
    }
  }
  console.log('60 requests accepted (200 OK). Sending 61st request...');

  const res61 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spamToken}`
    },
    body: JSON.stringify({ q: ['안녕'], target: 'en' })
  });
  const data61 = await res61.json();
  console.log(`61st Request Status: ${res61.status}`);
  console.log('61st Request Response:', JSON.stringify(data61));

  if (res61.status !== 429 || data61.error !== 'rate_limited') {
    throw new Error(`Test 6 Failed: expected 429 rate_limited on 61st request, got ${res61.status} ${JSON.stringify(data61)}`);
  }
  console.log('Result: PASS (61st request blocked with 429 rate_limited)');
  passedTests++;

  console.log(`\n=== All ${passedTests}/6 License Tests Passed Successfully! ===`);
}

main().catch(err => {
  console.error('\n*** License Test Failed ***:', err.message);
  process.exit(1);
});
