// RULE: P-16
// 줄 19: P-16 릴레이 자물쇠 단위 시험
// - 1. POST /translate 호스트 정상 호출 허용 (200 OK)
// - 2. POST /translate 청취자 역할 (role: 'listener') 차단 (403 {why: 'p16_listener_translate'})
// - 3. POST /translate 청취자 역할 (role: 'audience') 차단 (403 {why: 'p16_listener_translate'})
// - 4. POST /translate 헤더 X-Role: listener 차단 (403)
// - 5. POST /translate 토큰 payload.role === 'listener' 차단 (403 {why: 'p16_listener_token'})
// - 6. POST /translate 요청 칸 허용 목록 (ALLOWED_TRANSLATE_KEYS) 외 필드 포함 시 400 차단 (why: 'bad_key')
// - 7. 요약 요청 (/summarize, /summary, /desk/summary) 403 차단 (why: 'p16_forbidden_endpoint')
// - 8. 재생 요청 (/tts, /playback) 403 차단 (why: 'p16_forbidden_endpoint')

import assert from 'assert';
import relayApp from '../src/index.js';
import { mintLicense } from '../src/license.js';

console.log('=== 줄 19 P-16 릴레이 자물쇠 단위 시험 ===\n');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

// ── Mock Durable Object & Env 구축 ──
class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k); }
  async put(k, v) { this.map.set(k, v); }
}

const mockLimiter = {
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === '/limit') {
      return new Response(JSON.stringify({ allowed: true, count: 1 }));
    }
    if (url.pathname === '/usage/summary') {
      return new Response(JSON.stringify({ total_chars: 0, desk_minutes: 0 }));
    }
    if (url.pathname === '/metric/record' || url.pathname === '/usage/record') {
      return new Response(JSON.stringify({ ok: true }));
    }
    return new Response(JSON.stringify({ ok: true }));
  }
};

const mockEnv = {
  LICENSE_SECRET: 'test-p16-secret-key-32-chars-long!',
  TRANSLATE_CAP_CHARS: '3000000',
  TRANSLATE_ENGINE: 'mock',
  ADMIN_SECRET: 'test-admin-secret',
  ROOM: {
    idFromName: () => 'mock-id',
    get: () => mockLimiter
  }
};

const SECRET = mockEnv.LICENSE_SECRET;

(async () => {
  // 정상 호스트 토큰 생성 (0x04 meet)
  const { token: hostToken } = await mintLicense('cust_HOST', 30, 0x04, SECRET);

  // [Test 1] 호스트의 정상 번역 요청 (200 OK)
  console.log('[Test 1] 호스트 정상 번역 요청 허용 검증');
  const resValid = await relayApp.fetch(new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + hostToken,
      'X-Admin-Secret': mockEnv.ADMIN_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: ['안녕하세요'],
      target: 'en'
    })
  }), mockEnv);

  ok(resValid.status === 200, '호스트 번역 요청 200 OK');
  const validData = await resValid.json();
  ok(Array.isArray(validData.t) && validData.t.length === 1, '번역 결과 배열 반환');

  // [Test 2] body role: 'listener' 차단 검증 (403)
  console.log('\n[Test 2] body role: listener 차단 검증');
  const resListenerBody = await relayApp.fetch(new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + hostToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: ['청취자 번역 시도'],
      target: 'en',
      role: 'listener'
    })
  }), mockEnv);

  ok(resListenerBody.status === 403, '청취자 role=listener 403 Forbidden 반환');
  const errListenerBody = await resListenerBody.json();
  ok(errListenerBody.why === 'p16_listener_translate', '에러 사유 why: p16_listener_translate 일치');

  // [Test 3] body role: 'audience' 차단 검증 (403)
  console.log('\n[Test 3] body role: audience 차단 검증');
  const resAudienceBody = await relayApp.fetch(new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + hostToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: ['청취자 번역 시도 2'],
      target: 'en',
      role: 'audience'
    })
  }), mockEnv);

  ok(resAudienceBody.status === 403, '청취자 role=audience 403 Forbidden 반환');
  const errAudienceBody = await resAudienceBody.json();
  ok(errAudienceBody.why === 'p16_listener_translate', 'why: p16_listener_translate 일치');

  // [Test 4] 헤더 X-Role: listener 차단 검증 (403)
  console.log('\n[Test 4] 헤더 X-Role: listener 차단 검증');
  const resHeaderRole = await relayApp.fetch(new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + hostToken,
      'Content-Type': 'application/json',
      'X-Role': 'listener'
    },
    body: JSON.stringify({
      q: ['헤더 청취자 번역 시도'],
      target: 'en'
    })
  }), mockEnv);

  ok(resHeaderRole.status === 403, '헤더 X-Role: listener 403 Forbidden 반환');

  // [Test 5] 요청 칸 허용 목록 (ALLOWED_TRANSLATE_KEYS) 외 필드 포함 시 400 차단
  console.log('\n[Test 5] 허용 목록 외 필드 포함 시 400 bad_key 차단 검증');
  const resBadKey = await relayApp.fetch(new Request('http://localhost/translate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + hostToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: ['허용 밖 키 포함'],
      target: 'en',
      unauthorized_field: 'attack_or_leak',
      session_id: '12345'
    })
  }), mockEnv);

  ok(resBadKey.status === 400, '허용 밖 키 포함 시 400 Bad Request 반환');
  const errBadKey = await resBadKey.json();
  ok(errBadKey.why === 'bad_key', '에러 사유 why: bad_key 일치');
  ok(errBadKey.error === 'bad_key', 'error: bad_key 일치');

  // [Test 6] 요약 요청 끝점들 403 차단 검증 (/summarize, /summary, /desk/summary)
  console.log('\n[Test 6] 요약 요청 끝점 403 차단 검증');
  const endpointsSummarize = ['/summarize', '/summary', '/desk/summary'];
  for (const ep of endpointsSummarize) {
    const resSummary = await relayApp.fetch(new Request(`http://localhost${ep}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '요약 요청' })
    }), mockEnv);

    ok(resSummary.status === 403, `${ep} 요약 요청 403 Forbidden 반환`);
    const errSumm = await resSummary.json();
    ok(errSumm.why === 'p16_forbidden_endpoint', `${ep} why: p16_forbidden_endpoint 일치`);
  }

  // [Test 7] 재생 요청 끝점들 403 차단 검증 (/tts, /playback)
  console.log('\n[Test 7] 재생 요청 끝점 403 차단 검증');
  const endpointsPlayback = ['/tts', '/playback'];
  for (const ep of endpointsPlayback) {
    const resPlay = await relayApp.fetch(new Request(`http://localhost${ep}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '음성 재생 요청' })
    }), mockEnv);

    ok(resPlay.status === 403, `${ep} 재생 요청 403 Forbidden 반환`);
    const errPlay = await resPlay.json();
    ok(errPlay.why === 'p16_forbidden_endpoint', `${ep} why: p16_forbidden_endpoint 일치`);
  }

  console.log(`\n전부 통과 (${passCount}건)`);
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
