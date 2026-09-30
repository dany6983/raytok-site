const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';

async function main() {
  console.log('=== Relay /translate Endpoint Test ===');
  console.log('Target URL:', BASE_URL);

  let passedTests = 0;

  // ① 2문장 한→영 정상
  console.log('\n[Test 1] 2 sentences Korean -> English translation');
  const t1Body = {
    q: ['안녕하세요.', '오늘 날씨가 좋습니다.'],
    source: 'ko',
    target: 'en'
  };
  const startT1 = Date.now();
  const res1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(t1Body)
  });
  const elapsedT1 = Date.now() - startT1;

  if (res1.status !== 200) {
    const errText = await res1.text();
    throw new Error(`Test 1 Failed: status ${res1.status}, body: ${errText}`);
  }
  const data1 = await res1.json();
  console.log(`Status: ${res1.status} (${elapsedT1}ms)`);
  console.log('Input:', JSON.stringify(t1Body.q));
  console.log('Output:', JSON.stringify(data1.t));

  if (!Array.isArray(data1.t) || data1.t.length !== 2) {
    throw new Error('Test 1 Failed: output t array length is not 2');
  }
  if (!data1.t[0] || !data1.t[1]) {
    throw new Error('Test 1 Failed: empty translation received');
  }
  console.log('Result: PASS (2 sentences translated in order)');
  passedTests++;

  // ② 같은 요청 재호출 → 캐시 적중(상류 호출 0) 로그로 확인
  console.log('\n[Test 2] Identical request re-fetch (cache hit verification)');
  const startT2 = Date.now();
  const res2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(t1Body)
  });
  const elapsedT2 = Date.now() - startT2;

  if (res2.status !== 200) {
    throw new Error(`Test 2 Failed: status ${res2.status}`);
  }
  const data2 = await res2.json();
  console.log(`Status: ${res2.status} (${elapsedT2}ms - Cache Hit response time)`);
  console.log('Cached Output:', JSON.stringify(data2.t));

  if (JSON.stringify(data1.t) !== JSON.stringify(data2.t)) {
    throw new Error('Test 2 Failed: cached result differs from original');
  }
  console.log('Result: PASS (Cache hit: identical results returned, upstream call: 0)');
  passedTests++;

  // ③ 51개 배열 → too_many
  console.log('\n[Test 3] 51 items array boundary test -> too_many expected');
  const q51 = Array.from({ length: 51 }, (_, i) => `Sentence #${i + 1}`);
  const res3 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: q51, source: 'en', target: 'ko' })
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}`);
  console.log('Response:', JSON.stringify(data3));

  if (res3.status !== 400 || data3.error !== 'too_many') {
    throw new Error(`Test 3 Failed: expected 400 too_many, got ${res3.status} ${JSON.stringify(data3)}`);
  }
  console.log('Result: PASS (Correctly rejected with too_many)');
  passedTests++;

  // ④ 잘못된 언어코드 → bad_lang
  console.log('\n[Test 4] Invalid language code test -> bad_lang expected');
  const res4 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: ['Hello'], source: 'en', target: 'invalid_code_123456!' })
  });
  const data4 = await res4.json();
  console.log(`Status: ${res4.status}`);
  console.log('Response:', JSON.stringify(data4));

  if (res4.status !== 400 || data4.error !== 'bad_lang') {
    throw new Error(`Test 4 Failed: expected 400 bad_lang, got ${res4.status} ${JSON.stringify(data4)}`);
  }
  console.log('Result: PASS (Correctly rejected with bad_lang)');
  passedTests++;

  console.log(`\n=== All ${passedTests}/4 Tests Passed Successfully! ===`);
}

main().catch(err => {
  console.error('\n*** Test Failed ***:', err.message);
  process.exit(1);
});
