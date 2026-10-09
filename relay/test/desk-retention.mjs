// 줄 14: Desk 세션 보관 기한 (자동 만료 + 주인 삭제 DELETE + web/desk 삭제 단추) 단위 시험
import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import relayApp from '../src/index.js';
import { mintLicense } from '../src/license.js';

console.log('=== 줄 14 Desk 세션 보관 기한 및 삭제 단위 시험 ===\n');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) {
      const res = new Map();
      for (const item of k) res.set(item, this.map.get(item));
      return res;
    }
    return this.map.get(k);
  }
  async put(k, v) {
    if (typeof k === 'object' && k !== null && !Array.isArray(k)) {
      for (const [key, val] of Object.entries(k)) this.map.set(key, val);
      return;
    }
    this.map.set(k, v);
  }
  async delete(k) {
    if (Array.isArray(k)) {
      for (const item of k) this.map.delete(item);
      return;
    }
    this.map.delete(k);
  }
}

const mockStorage = new MockStorage();
const mockLimiter = {
  fetch: async (req) => {
    const mockRoom = {
      ctx: {
        storage: mockStorage,
        blockConcurrencyWhile: async (fn) => await fn(),
        getTags: () => [],
        getWebSockets: () => []
      },
      env: { DESK_KEEP_DAYS: '30' }
    };
    const RoomClass = (await import('../src/room.js')).Room;
    const roomInstance = new RoomClass(mockRoom.ctx, mockRoom.env);
    return roomInstance.fetch(req);
  }
};

const mockEnv = {
  LICENSE_SECRET: 'test-secret-key-32-chars-retention!',
  DESK_KEEP_DAYS: '30',
  ROOM: {
    idFromName: () => 'mock-id',
    get: () => mockLimiter
  }
};

const SECRET = mockEnv.LICENSE_SECRET;

// ── 해시 체인 생성 헬퍼 ──
function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function sortKeysDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = sortKeysDeep(obj[k]);
  return sorted;
}

function normalizeItem(item) {
  const copy = { ...item };
  delete copy.hash;
  return JSON.stringify(sortKeysDeep(copy));
}

function createSessionPayload(session) {
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

  const line = {
    kind: 'line', ts: session.started + 1000, seq: 1, src: session.lang,
    text: '테스트 회의 발화 내용', tr: { en: 'Test utterance' }, via: '',
    n: 2, prev: prevHash
  };
  line.hash = sha256Hex(prevHash + '\n' + normalizeItem(line));
  prevHash = line.hash;
  items.push(line);

  const end = {
    kind: 'end', ts: session.started + 2000, lines: 1, minutes: 1, joined_max: 1,
    n: 3, prev: prevHash
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

(async () => {
  // 토큰 발급 (0x08 desk)
  const { token: userAToken } = await mintLicense('cust_UserA', 30, 0x08, SECRET);
  const { token: userBToken } = await mintLicense('cust_UserB', 30, 0x08, SECRET);
  const { token: noDeskToken } = await mintLicense('cust_UserA', 30, 0x01, SECRET);

  // [Setup] 세션 2건 생성
  const recentStarted = Date.now() - 3600000; // 1시간 전
  const expiredStarted = Date.now() - (35 * 86400 * 1000); // 35일 전

  const recentPayload = createSessionPayload({ code: '112233', host: 'PC-A', lang: 'ko', started: recentStarted });
  const expiredPayload = createSessionPayload({ code: '445566', host: 'PC-A', lang: 'ko', started: expiredStarted });

  // 1) 최근 세션 업로드
  const resRecent = await relayApp.fetch(new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + userAToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(recentPayload)
  }), mockEnv);

  const recentData = await resRecent.json();
  const recentId = recentData.id;
  ok(recentId, '최근 세션 업로드 성공 (id 발급)');

  // 2) 35일 전 만료 세션 업로드
  const resExpired = await relayApp.fetch(new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + userAToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(expiredPayload)
  }), mockEnv);

  const expiredData = await resExpired.json();
  const expiredId = expiredData.id;
  ok(expiredId, '35일 전 세션 업로드 성공 (id 발급)');

  // [Test 1] 세션 목록 조회 시 30일 만료 세션 자동 제외 검증
  console.log('\n[Test 1] 30일 경과 세션 목록 자동 필터링 검증');
  const resList = await relayApp.fetch(new Request('http://localhost/desk/sessions', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + userAToken }
  }), mockEnv);

  const list = await resList.json();
  ok(list.length === 1, `만료 세션 제외되어 목록에 1건만 노출 (실제: ${list.length})`);
  ok(list[0].id === recentId, '유효한 최근 세션만 목록에 유지');

  // [Test 2] 만료 세션 단건 상세 조회 시 404 차단
  console.log('\n[Test 2] 만료 세션 상세 조회 시 404 검증');
  const resExpDetail = await relayApp.fetch(new Request(`http://localhost/desk/session/${expiredId}`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + userAToken }
  }), mockEnv);
  ok(resExpDetail.status === 404, '30일 지난 세션 상세 조회 시 404 반환');

  // [Test 3] 타인 토큰으로 삭제 시도 시 404 차단
  console.log('\n[Test 3] 타인(User B) 토큰으로 삭제 시도 시 차단 검증');
  const resDelOther = await relayApp.fetch(new Request(`http://localhost/desk/session/${recentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + userBToken }
  }), mockEnv);
  ok(resDelOther.status === 404, '남의 세션 삭제 시 404 Not Found 반환');

  // [Test 4] 0x08 권한 없는 토큰 삭제 차단 (403)
  console.log('\n[Test 4] 0x08 미보유 토큰 삭제 차단 검증');
  const resDelNoDesk = await relayApp.fetch(new Request(`http://localhost/desk/session/${recentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + noDeskToken }
  }), mockEnv);
  ok(resDelNoDesk.status === 403, '0x08 누락 토큰 삭제 시 403 Forbidden 반환');

  // [Test 5] 주인 토큰으로 DELETE /desk/session/:id 영구 삭제 성공 검증
  console.log('\n[Test 5] 주인 토큰 영구 삭제 검증');
  const resDelOwner = await relayApp.fetch(new Request(`http://localhost/desk/session/${recentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + userAToken }
  }), mockEnv);
  ok(resDelOwner.status === 200, '주인 삭제 요청 200 OK');
  const delOwnerData = await resDelOwner.json();
  ok(delOwnerData.ok === true && delOwnerData.deleted === recentId, 'deleted: recentId 응답 확인');

  // [Test 6] 삭제 후 단건 및 목록 재조회 시 영구 제거 확인
  console.log('\n[Test 6] 삭제 후 영구 제거 확인');
  const resAfterDetail = await relayApp.fetch(new Request(`http://localhost/desk/session/${recentId}`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + userAToken }
  }), mockEnv);
  ok(resAfterDetail.status === 404, '삭제 후 상세 조회 404 확인');

  const resAfterList = await relayApp.fetch(new Request('http://localhost/desk/sessions', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + userAToken }
  }), mockEnv);
  const afterList = await resAfterList.json();
  ok(afterList.length === 0, '삭제 후 목록 0건 확인');

  // [Test 7] web/desk/index.html 및 privacy 마크업 확인
  console.log('\n[Test 7] web/desk 및 처리방침 UI/문구 확인');
  const deskHtml = fs.readFileSync(path.join(process.cwd(), 'web', 'desk', 'index.html'), 'utf-8');
  ok(deskHtml.includes('btn-delete') && deskHtml.includes('기록 삭제'), 'web/desk 에 기록 삭제 단추 확인');

  const privacyHtml = fs.readFileSync(path.join(process.cwd(), 'web', 'privacy', 'index.html'), 'utf-8');
  ok(privacyHtml.includes('Desk 회의 기록') && privacyHtml.includes('기본 30일') && privacyHtml.includes('즉시 영구 삭제'), '처리방침에 30일 보관 및 즉시 영구 삭제권 명시 확인');

  console.log(`\n전부 통과 (${passCount}건)`);
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
