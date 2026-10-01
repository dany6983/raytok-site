const BASE_URL = process.env.RELAY_URL || 'https://raytok-relay.raytok.workers.dev';

async function main() {
  console.log('=== Relay Cache & Source Language Test ===');
  console.log('Target URL:', BASE_URL);

  // 0. Issue token for testing
  const issueRes = await fetch(`${BASE_URL}/license/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device: 'cache-tester-' + Date.now(),
      app: 'raytok-android',
      ver: '1.0.0'
    })
  });
  if (!issueRes.ok) {
    throw new Error(`Failed to issue license token: ${issueRes.status}`);
  }
  const { token } = await issueRes.json();
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const rand = Math.random().toString(36).substring(2, 8);
  const s1 = `고유 테스트 문장 하나 ${rand}`;
  const s2 = `고유 테스트 문장 둘 ${rand}`;
  const s3 = `새로운 세번째 문장 ${rand}`;

  let passedTests = 0;

  // ① 새 문장 2개 → X-Cache: MISS, X-Upstream-Count: 1
  console.log('\n[① 새 문장 2개 요청 (Cold Cache)]');
  const t1Start = Date.now();
  const res1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ q: [s1, s2], source: 'ko', target: 'en' })
  });
  const elapsed1 = Date.now() - t1Start;
  const data1 = await res1.json();

  console.log(`Status: ${res1.status} (${elapsed1}ms)`);
  console.log(`X-Cache: ${res1.headers.get('x-cache')}`);
  console.log(`X-Cache-Hits: ${res1.headers.get('x-cache-hits')}`);
  console.log(`X-Upstream-Count: ${res1.headers.get('x-upstream-count')}`);
  console.log(`X-Upstream-Chars: ${res1.headers.get('x-upstream-chars')}`);
  console.log('Response body:', JSON.stringify(data1));

  if (res1.headers.get('x-cache') !== 'MISS' || res1.headers.get('x-upstream-count') !== '1') {
    throw new Error('Test ① Failed: expected X-Cache: MISS and X-Upstream-Count: 1');
  }
  if (res1.headers.get('x-upstream-chars') !== String(s1.length + s2.length)) {
    throw new Error(`Test ① Failed: expected X-Upstream-Chars: ${s1.length + s2.length}, got ${res1.headers.get('x-upstream-chars')}`);
  }
  console.log('Result: PASS');
  passedTests++;

  // ② 같은 요청 즉시 재호출 → X-Cache: HIT, X-Upstream-Count: 0
  console.log('\n[② 동일 요청 재호출 (Warm Cache)]');
  const t2Start = Date.now();
  const res2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ q: [s1, s2], source: 'ko', target: 'en' })
  });
  const elapsed2 = Date.now() - t2Start;
  const data2 = await res2.json();

  console.log(`Status: ${res2.status} (${elapsed2}ms)`);
  console.log(`X-Cache: ${res2.headers.get('x-cache')}`);
  console.log(`X-Cache-Hits: ${res2.headers.get('x-cache-hits')}`);
  console.log(`X-Upstream-Count: ${res2.headers.get('x-upstream-count')}`);
  console.log(`X-Upstream-Chars: ${res2.headers.get('x-upstream-chars')}`);
  console.log('Response body:', JSON.stringify(data2));

  if (res2.headers.get('x-cache') !== 'HIT' || res2.headers.get('x-upstream-count') !== '0') {
    throw new Error('Test ② Failed: expected X-Cache: HIT and X-Upstream-Count: 0');
  }
  if (res2.headers.get('x-cache-hits') !== '2') {
    throw new Error('Test ② Failed: expected X-Cache-Hits: 2');
  }
  console.log(`Response Time Comparison: Cold (${elapsed1}ms) vs Warm Hit (${elapsed2}ms)`);
  console.log('Result: PASS');
  passedTests++;

  // ③ 2문장 중 1개만 새 것 → X-Cache: PARTIAL, X-Upstream-Count: 1, X-Upstream-Chars 가 새 문장 길이만큼
  console.log('\n[③ 2문장 중 1개만 새 문장 (Partial Cache)]');
  const t3Start = Date.now();
  const res3 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ q: [s1, s3], source: 'ko', target: 'en' })
  });
  const elapsed3 = Date.now() - t3Start;
  const data3 = await res3.json();

  console.log(`Status: ${res3.status} (${elapsed3}ms)`);
  console.log(`X-Cache: ${res3.headers.get('x-cache')}`);
  console.log(`X-Cache-Hits: ${res3.headers.get('x-cache-hits')}`);
  console.log(`X-Upstream-Count: ${res3.headers.get('x-upstream-count')}`);
  console.log(`X-Upstream-Chars: ${res3.headers.get('x-upstream-chars')}`);
  console.log('Response body:', JSON.stringify(data3));

  if (res3.headers.get('x-cache') !== 'PARTIAL' || res3.headers.get('x-upstream-count') !== '1') {
    throw new Error('Test ③ Failed: expected X-Cache: PARTIAL and X-Upstream-Count: 1');
  }
  if (res3.headers.get('x-upstream-chars') !== String(s3.length)) {
    throw new Error(`Test ③ Failed: expected X-Upstream-Chars: ${s3.length}, got ${res3.headers.get('x-upstream-chars')}`);
  }
  if (res3.headers.get('x-cache-hits') !== '1') {
    throw new Error('Test ③ Failed: expected X-Cache-Hits: 1');
  }
  console.log('Result: PASS');
  passedTests++;

  // ④ 응답 본문에 src 가 들어오는지 (source 준 경우 / 안 준 경우 각각)
  console.log('\n[④ 응답 본문 src 검증]');

  // Case A: source 명시한 경우
  console.log('- Case A: source 지정 (source: "ko")');
  const res4A = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ q: [s1], source: 'ko', target: 'en' })
  });
  const data4A = await res4A.json();
  console.log('Status:', res4A.status);
  console.log('Response body:', JSON.stringify(data4A));
  if (data4A.src !== 'ko') {
    throw new Error(`Test ④-A Failed: expected src "ko", got "${data4A.src}"`);
  }

  // Case B: source 생략한 경우 (자동 감지)
  console.log('- Case B: source 생략 (자동 감지)');
  const sAuto = `자동 감지 테스트 문장 ${rand}`;
  const res4B = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ q: [sAuto], target: 'en' })
  });
  const data4B = await res4B.json();
  console.log('Status:', res4B.status);
  console.log('Response body:', JSON.stringify(data4B));
  if (!data4B.src || typeof data4B.src !== 'string') {
    throw new Error(`Test ④-B Failed: expected detected src string, got "${data4B.src}"`);
  }
  console.log(`Detected source language: "${data4B.src}"`);
  console.log('Result: PASS');
  passedTests++;

  console.log(`\n=== All ${passedTests}/4 Cache Verification Tests Passed Successfully! ===`);
}

main().catch(err => {
  console.error('\n*** Cache Test Failed ***:', err.message);
  process.exit(1);
});
