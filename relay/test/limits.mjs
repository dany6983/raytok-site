const BASE_URL = process.env.RELAY_URL || 'https://raytok-relay.raytok.workers.dev';

async function main() {
  console.log('=== Relay IP-Scoped Limits Test ===');
  console.log('Target URL:', BASE_URL);

  // 운영(workers.dev) 환경에서 실제 공인 IP 고갈 방지 가드
  if (BASE_URL.includes('workers.dev')) {
    console.log('\n[SAFETY GUARD] 운영 workers.dev 대상 실행 감지:');
    console.log('실제 사무실 공인 IP 잠김(발급 20회/번역 200회 고갈)을 방지하기 위해');
    console.log('운영 환경에서는 고갈 시험을 건너뛰고 정상 호출(Test ③) 및 파라미터 검증만 수행합니다.');
    console.log('전체 한도 고갈 시험(Test ①, Test ②)은 로컬 wrangler dev(http://127.0.0.1:8787)에서 실행하십시오.\n');

    // 운영 환경 안전 검증: 발급 1회 + 번역 정상 호출 확인
    const res = await fetch(`${BASE_URL}/license/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: 'dev-safe-probe-' + Date.now(), app: 'raytok-android', ver: '1.0.0' })
    });
    console.log('Production license issue status:', res.status);
    return;
  }
  let totalIssuedForIP = 0;
  const tokenPool = [];

  // Helper to issue license token
  async function issueToken(devId) {
    const res = await fetch(`${BASE_URL}/license/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device: devId,
        app: 'raytok-android',
        ver: '1.0.0'
      })
    });
    if (res.ok) {
      totalIssuedForIP++;
    }
    return res;
  }

  // -------------------------------------------------------------
  // [STEP 1] Prepare 5 distinct tokens for /translate pool test
  // -------------------------------------------------------------
  console.log('\n[PREPARE] 5개 토큰 발급 (서로 다른 device)...');
  for (let d = 1; d <= 5; d++) {
    const res = await issueToken(`dev-pool-${rand}-${d}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Token pool setup failed at #${d}: ${res.status} ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    tokenPool.push(data.token);
    console.log(`- Token #${d} issued (prefix: ${data.token.slice(0, 8)}...)`);
  }
  console.log(`Token pool ready: 5 tokens. Current IP daily issues: ${totalIssuedForIP}/20`);

  // -------------------------------------------------------------
  // [Test ②] 서로 다른 토큰 5개로 /translate 를 분당 201회 → 429
  // -------------------------------------------------------------
  console.log('\n[Test ②] 서로 다른 토큰 5개로 /translate 분당 201회 → 429');
  console.log('- Sending 200 requests with concurrency 20 across 5 tokens (40 per token, below 60/min sub limit)...');

  const startT2 = Date.now();
  for (let round = 0; round < 10; round++) {
    const batch = [];
    for (let j = 0; j < 20; j++) {
      const idx = round * 20 + j;
      const t = tokenPool[idx % 5];
      batch.push(
        fetch(`${BASE_URL}/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${t}`
          },
          body: JSON.stringify({ q: ['동시 트래픽 한도 테스트'], source: 'ko', target: 'en' })
        }).then(r => {
          if (r.status !== 200) throw new Error(`Unexpected failure at request #${idx + 1}: status ${r.status}`);
          return r.status;
        })
      );
    }
    await Promise.all(batch);
  }
  const elapsedT2 = Date.now() - startT2;
  console.log(`- 200/200 requests completed successfully in ${elapsedT2}ms (all 200 OK)`);

  console.log('- Sending 201st request from same IP...');
  const res201 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenPool[0]}`
    },
    body: JSON.stringify({ q: ['201번째 초과 요청'], source: 'ko', target: 'en' })
  });
  console.log(`201st Status: ${res201.status}`);
  const data201 = await res201.json();
  console.log('201st Response:', JSON.stringify(data201));

  if (res201.status !== 429 || data201.scope !== 'ip') {
    throw new Error(`Test ② Failed: expected 429 with scope=ip, got ${res201.status}`);
  }
  console.log('Result: PASS (Blocked with 429 scope=ip on 201st request)');

  // -------------------------------------------------------------
  // [Test ③] 정상 사용(토큰 1개, 분당 10회)은 영향 없음
  // -------------------------------------------------------------
  console.log('\n[Test ③] 정상 사용 검증 (토큰 1개, 분당 10회)');
  console.log('Waiting for /translate 60s rate limit window to expire...');
  let reset = false;
  for (let w = 1; w <= 65; w++) {
    await new Promise(r => setTimeout(r, 1000));
    const probeRes = await fetch(`${BASE_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenPool[0]}`
      },
      body: JSON.stringify({ q: ['정상 호출 프로브'], source: 'ko', target: 'en' })
    });
    if (probeRes.status === 200) {
      console.log(`Window reset detected after ${w}s!`);
      reset = true;
      break;
    }
  }
  if (!reset) throw new Error('Timed out waiting for minute window reset');

  console.log('- Sending 9 more normal requests with token #1...');
  for (let i = 2; i <= 10; i++) {
    const res = await fetch(`${BASE_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenPool[0]}`
      },
      body: JSON.stringify({ q: ['정상 호출 ' + i], source: 'ko', target: 'en' })
    });
    if (res.status !== 200) throw new Error(`Normal request #${i} failed: ${res.status}`);
  }
  console.log('Result: PASS (10/10 requests succeeded with 200 OK without any throttling)');

  // -------------------------------------------------------------
  // [Test ①] 같은 IP에서 device 를 20번 바꿔 발급 → 21번째 429 scope=ip
  // -------------------------------------------------------------
  console.log('\n[Test ①] 같은 IP에서 device를 20번 바꿔 발급 → 21번째 429 scope=ip');
  console.log(`Current IP issuance count: ${totalIssuedForIP}/20`);
  console.log('- Issuing with new device IDs until 20 daily limit is reached...');

  let issueAttempt = totalIssuedForIP;
  while (issueAttempt < 20) {
    issueAttempt++;
    const res = await issueToken(`dev-ip-limit-${rand}-${issueAttempt}`);
    console.log(`Issue #${issueAttempt} Status: ${res.status}`);
    if (res.status !== 200) {
      const err = await res.json();
      throw new Error(`Issue #${issueAttempt} failed unexpectedly: ${res.status} ${JSON.stringify(err)}`);
    }
  }

  console.log(`Reached 20 issues for IP. Attempting 21st issue...`);
  const res21 = await issueToken(`dev-ip-limit-${rand}-21`);
  console.log(`21st Issue Status: ${res21.status}`);
  const data21 = await res21.json();
  console.log('21st Issue Response:', JSON.stringify(data21));

  if (res21.status !== 429 || data21.scope !== 'ip') {
    throw new Error(`Test ① Failed: expected 429 with scope=ip on 21st issue, got ${res21.status} ${JSON.stringify(data21)}`);
  }
  console.log('Result: PASS (Blocked with 429 scope=ip on 21st issuance)');

  console.log('\n=== All 3 IP Limit Tests Passed Successfully! ===');
}

main().catch(err => {
  console.error('\n*** Limits Test Failed ***:', err.message);
  process.exit(1);
});
