import assert from 'assert';
import http from 'http';
import relayApp from '../src/index.js';
import { Room } from '../src/room.js';
import { mintLicenseToken } from '../tools/mint-license.mjs';

console.log('=== Relay /translate 상류 502 재시도 및 why 필드 단위 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

// ── Mock Durable Object ──
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

let mockUpstreamCount = 0;
let mockUpstreamMode = 'retry_ok'; // 'retry_ok' | 'always_500'

// 가짜 번역 업스트림 서버
const mockUpstreamServer = http.createServer((req, res) => {
  mockUpstreamCount++;
  if (mockUpstreamMode === 'retry_ok') {
    if (mockUpstreamCount === 1) {
      // 첫 번째 시도: 500 에러
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }));
    } else {
      // 두 번째 시도: 200 OK
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const payload = JSON.parse(body || '{}');
        const q = payload.q || [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            translations: q.map(text => ({ translatedText: `[translated] ${text}` }))
          }
        }));
      });
    }
  } else if (mockUpstreamMode === 'always_500') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 500, message: 'Persistent Engine Error' } }));
  }
});

await new Promise(resolve => mockUpstreamServer.listen(0, resolve));
const upstreamPort = mockUpstreamServer.address().port;

const mockEnv = {
  LICENSE_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  GOOGLE_TRANSLATE_KEY: 'test_google_key',
  GOOGLE_TRANSLATE_URL: `http://localhost:${upstreamPort}/language/translate/v2`,
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

async function run() {
  const secret = mockEnv.LICENSE_SECRET;
  const token = mintLicenseToken({
    sub: 'translate_user_001',
    days: 30,
    flags: 0x02, // camera / translate
    secret
  });

  try {
    // ── Test 1: 첫 번째 500 -> 두 번째 200 (재시도 성공) ──
    console.log('\n[Test 1] 상류 일시 500 발생 시 1회 재시도하여 200 성공 검증');
    mockUpstreamCount = 0;
    mockUpstreamMode = 'retry_ok';

    const req1 = new Request('http://localhost/translate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: ['안전 제일', '작업 시작'],
        source: 'ko',
        target: 'en'
      })
    });

    const res1 = await relayApp.fetch(req1, mockEnv, mockCtx);
    ok(res1.status === 200, '1차 500 후 2차 재시도로 200 OK 반환');
    const data1 = await res1.json();
    ok(Array.isArray(data1.t) && data1.t.length === 2, '번역 배열 2건 반환');
    ok(data1.t[0] === '[translated] 안전 제일', '번역 결과 일치');
    ok(mockUpstreamCount === 2, `상류 호출 횟수 정확히 2회 (실제: ${mockUpstreamCount})`);

    // ── Test 2: 두 번 다 500 실패 시 502 + why 반환 ──
    console.log('\n[Test 2] 두 번 다 500 실패 시 502 및 why 필드 검증 (원문 미노출)');
    mockUpstreamCount = 0;
    mockUpstreamMode = 'always_500';

    const req2 = new Request('http://localhost/translate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: ['기밀 원문 텍스트입니다'],
        source: 'ko',
        target: 'en'
      })
    });

    const res2 = await relayApp.fetch(req2, mockEnv, mockCtx);
    ok(res2.status === 502, '상류 2회 연속 실패 시 502 Bad Gateway 반환');
    const data2 = await res2.json();
    ok(data2.error === 'upstream', 'error: "upstream" 일치');
    ok(data2.why === 'google_500', `why: "google_500" 확인 (실제: ${data2.why})`);
    ok(data2.upstream === 'google', 'upstream: "google" 확인');
    ok(data2.upstream_status === 500, 'upstream_status: 500 확인');

    // ── Test 3: 보안 검증 — 502 응답 몸에 글자 원문(q)이 일절 포함되지 않음 ──
    console.log('\n[Test 3] 보안 검증: 502 에러 응답에 글자 원문 미포함 확인');
    const resBodyStr = JSON.stringify(data2);
    ok(!resBodyStr.includes('기밀 원문 텍스트입니다'), '에러 본문에 원문 글자 일절 미포함 확인');

    console.log(`\n전부 통과 (${passCount}건)`);
    process.exit(0);
  } finally {
    mockUpstreamServer.close();
  }
}

run().catch(err => {
  console.error('\n[FAIL]', err);
  mockUpstreamServer.close();
  process.exit(1);
});
