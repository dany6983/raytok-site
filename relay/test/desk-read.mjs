import assert from 'assert';
import crypto from 'crypto';
import relayApp from '../src/index.js';
import { Room } from '../src/room.js';
import { mintLicenseToken } from '../tools/mint-license.mjs';

console.log('=== Relay Desk 세션 꺼내 보기 (GET /desk/sessions, GET /desk/session/:id) 단위 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

// ── Mock Durable Object 환경 구축 ──
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
  async put(k, v) {
    if (typeof k === 'object' && v === undefined) {
      for (const [key, val] of Object.entries(k)) {
        this.map.set(key, val);
      }
      return;
    }
    this.map.set(k, v);
  }
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

const mockEnv = {
  LICENSE_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ROOM: {
    idFromName: (name) => ({ name }),
    get: (_id) => ({
      fetch: async (req) => mockRoomInstance.fetch(req)
    })
  }
};

const mockCtx = {
  waitUntil: (p) => p
};

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function sortKeysDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeysDeep(obj[k]);
  }
  return sorted;
}

function normalizeItem(item) {
  const copy = { ...item };
  delete copy.hash;
  return JSON.stringify(sortKeysDeep(copy));
}

function generateChain(session, itemCount, textPayload) {
  const zero64 = '0'.repeat(64);
  let prevHash = zero64;
  const items = [];

  const begin = {
    kind: 'begin', ts: session.started, session: session.code, host: session.host, lang: session.lang,
    n: 1, prev: prevHash
  };
  begin.hash = sha256Hex(prevHash + '\n' + normalizeItem(begin));
  prevHash = begin.hash;
  items.push(begin);

  for (let i = 2; i <= itemCount - 1; i++) {
    const line = {
      kind: 'line', ts: session.started + i * 1000, seq: i - 1, src: session.lang,
      text: typeof textPayload === 'function' ? textPayload(i) : textPayload,
      tr: { en: 'Translated text' }, via: '',
      n: i, prev: prevHash
    };
    line.hash = sha256Hex(prevHash + '\n' + normalizeItem(line));
    prevHash = line.hash;
    items.push(line);
  }

  const end = {
    kind: 'end', ts: session.started + itemCount * 1000, lines: itemCount - 2, minutes: 10, joined_max: 5,
    n: itemCount, prev: prevHash
  };
  end.hash = sha256Hex(prevHash + '\n' + normalizeItem(end));
  prevHash = end.hash;
  items.push(end);

  return {
    ver: 1,
    session,
    items,
    last: prevHash
  };
}

async function run() {
  const secret = mockEnv.LICENSE_SECRET;

  const tokenUserA = mintLicenseToken({ sub: 'user_a', days: 30, flags: 0x08, secret });
  const tokenUserB = mintLicenseToken({ sub: 'user_b', days: 30, flags: 0x08, secret });
  const tokenNoDesk = mintLicenseToken({ sub: 'user_no_desk', days: 30, flags: 0x02, secret });

  // 1) 세션 1 (User A, 단일 조각)
  const session1Data = { code: '111222', host: 'HOST_A_1', lang: 'ko', started: 1759885200000 };
  const chain1 = generateChain(session1Data, 5, '안전모 착용 확인');
  const upRes1 = await relayApp.fetch(new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tokenUserA, 'Content-Type': 'application/json' },
    body: JSON.stringify(chain1)
  }), mockEnv, mockCtx);
  ok(upRes1.status === 200, 'User A 세션 1 업로드 성공');
  const { id: id1 } = await upRes1.json();

  // 2) 세션 2 (User A, 대형 세션 - 조각 분할)
  const session2Data = { code: '333444', host: 'HOST_A_2', lang: 'ko', started: 1759885300000 };
  const chain2 = generateChain(session2Data, 200, '작업장 화재 대피 요령 안내 문단입니다. '.repeat(5));
  const upRes2 = await relayApp.fetch(new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tokenUserA, 'Content-Type': 'application/json' },
    body: JSON.stringify(chain2)
  }), mockEnv, mockCtx);
  ok(upRes2.status === 200, 'User A 세션 2 대형 세션 업로드 성공');
  const { id: id2 } = await upRes2.json();

  // 3) 세션 3 (User B, 단일 조각)
  const session3Data = { code: '555666', host: 'HOST_B', lang: 'en', started: 1759885400000 };
  const chain3 = generateChain(session3Data, 5, 'Safety First in Factory');
  const upRes3 = await relayApp.fetch(new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tokenUserB, 'Content-Type': 'application/json' },
    body: JSON.stringify(chain3)
  }), mockEnv, mockCtx);
  ok(upRes3.status === 200, 'User B 세션 3 업로드 성공');
  const { id: id3 } = await upRes3.json();

  // ── Test 1: GET /desk/sessions - 주인 목록만 반환 (User A) ──
  console.log('\n[Test 1] User A 세션 목록 조회 (주인 것만 2건)');
  const listResA = await relayApp.fetch(new Request('http://localhost/desk/sessions', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + tokenUserA }
  }), mockEnv, mockCtx);
  ok(listResA.status === 200, 'User A 목록 조회 200 OK');
  const listA = await listResA.json();
  ok(Array.isArray(listA) && listA.length === 2, `User A 세션 수 2건 일치 (실제: ${listA.length})`);
  ok(listA.some(s => s.id === id1) && listA.some(s => s.id === id2), 'User A의 세션 id1, id2 모두 포함');
  ok(!listA.some(s => s.id === id3), 'User B의 세션 id3은 목록에 일절 없음');

  // ── Test 2: GET /desk/sessions - User B 목록 조회 (1건) ──
  console.log('\n[Test 2] User B 세션 목록 조회 (1건)');
  const listResB = await relayApp.fetch(new Request('http://localhost/desk/sessions', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + tokenUserB }
  }), mockEnv, mockCtx);
  ok(listResB.status === 200, 'User B 목록 조회 200 OK');
  const listB = await listResB.json();
  ok(Array.isArray(listB) && listB.length === 1, 'User B 세션 수 1건 일치');
  ok(listB[0].id === id3, 'User B 세션 id3 일치');

  // ── Test 3: GET /desk/session/:id - 조각 합친 원형 복원 및 last 일치 검증 ──
  console.log('\n[Test 3] 분할 저장된 세션 2 원형 복원 및 last 해시 일치 검증');
  const getRes2 = await relayApp.fetch(new Request('http://localhost/desk/session/' + id2, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + tokenUserA }
  }), mockEnv, mockCtx);
  ok(getRes2.status === 200, '세션 2 조회 200 OK');
  const fetched2 = await getRes2.json();
  ok(fetched2.ver === 1, 'ver 1 일치');
  ok(fetched2.session.code === session2Data.code, 'session.code 일치');
  ok(fetched2.items.length === chain2.items.length, `items 개수 복원 일치 (${fetched2.items.length})`);
  ok(fetched2.last === chain2.last, 'last 해시 일치');
  // items 내용 완전 일치 확인
  ok(JSON.stringify(fetched2.items) === JSON.stringify(chain2.items), '분할 저장된 items 원본과 글자 단위 100% 일치');

  // ── Test 4: 남의 세션 조회 차단 (User B가 User A의 세션 조회 시 404) ──
  console.log('\n[Test 4] 남의 세션 조회 시 404 차단 (보안)');
  const sneakRes = await relayApp.fetch(new Request('http://localhost/desk/session/' + id1, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + tokenUserB }
  }), mockEnv, mockCtx);
  ok(sneakRes.status === 404, '남의 세션 조회 시 404 Not Found 반환');

  // ── Test 5: 0x08 Desk 권한 없는 토큰 차단 (403) ──
  console.log('\n[Test 5] Desk 권한(0x08) 없는 토큰 차단 (403)');
  const noDeskListRes = await relayApp.fetch(new Request('http://localhost/desk/sessions', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + tokenNoDesk }
  }), mockEnv, mockCtx);
  ok(noDeskListRes.status === 403, '0x08 누락 토큰 목록 조회 시 403 Forbidden 반환');

  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
}

run().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
