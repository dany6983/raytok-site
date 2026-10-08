import assert from 'assert';
import crypto from 'crypto';
import relayApp from '../src/index.js';
import { Room } from '../src/room.js';
import { mintLicenseToken } from '../tools/mint-license.mjs';

console.log('=== Relay Desk 세션 업로드 (POST /desk/session) 단위 시험 ===');

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

let mockStorage = new MockStorage();
let storageShouldThrow = false;

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
      fetch: async (req) => {
        if (storageShouldThrow) {
          throw new Error('Durable Object Storage Disconnected');
        }
        return mockRoomInstance.fetch(req);
      }
    })
  }
};

const mockCtx = {
  waitUntil: (p) => p
};

// ── 헬퍼: SHA-256 및 해시 체인 생성 ──
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

  // 1) begin
  const begin = {
    kind: 'begin', ts: session.started, session: session.code, host: session.host, lang: session.lang,
    n: 1, prev: prevHash
  };
  begin.hash = sha256Hex(prevHash + '\n' + normalizeItem(begin));
  prevHash = begin.hash;
  items.push(begin);

  // 2) lines
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

  // 3) end
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

// ── 정본 예시 1: 이름 보임 ──
const sampleNamed = {
  ver: 1,
  session: { code: '483921', host: 'SM-F971N', lang: 'ko', started: 1759885200000 },
  items: [
    {
      kind: 'begin', ts: 1759885200000, session: '483921', host: 'SM-F971N', lang: 'ko',
      n: 1, prev: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: 'a8cd1dd0c95414d4844e719cc8648ace1ee857e6b746d0d0b971fd5c6a01a5de'
    },
    {
      kind: 'join', ts: 1759885260000, dev: 'a1b2c3', name: '김철수', lang: 'en',
      n: 2, prev: 'a8cd1dd0c95414d4844e719cc8648ace1ee857e6b746d0d0b971fd5c6a01a5de',
      hash: 'c6e09081746451fc80e7fa329e6111c062d4cf229d60f2e04b58f1a06c5741a8'
    },
    {
      kind: 'line', ts: 1759885320000, seq: 1, src: 'ko', text: '안전모를 쓰세요',
      tr: { en: 'Wear a helmet' }, via: '',
      n: 3, prev: 'c6e09081746451fc80e7fa329e6111c062d4cf229d60f2e04b58f1a06c5741a8',
      hash: 'e7118e50ea9c1f17ea1bc4bb739e1d8739b316588df01c2548a1f05f7dc0118a'
    },
    {
      kind: 'leave', ts: 1759886460000, dev: 'a1b2c3', why: 'end',
      n: 4, prev: 'e7118e50ea9c1f17ea1bc4bb739e1d8739b316588df01c2548a1f05f7dc0118a',
      hash: '3ae4295c6b4072d7fcaad6be1575ba9b883e88f23a59bf9decb787b8fdc93801'
    },
    {
      kind: 'end', ts: 1759886460000, lines: 1, minutes: 21, joined_max: 1,
      n: 5, prev: '3ae4295c6b4072d7fcaad6be1575ba9b883e88f23a59bf9decb787b8fdc93801',
      hash: '73d30ff91fab9cdf21392fb9469337aff4bf1ef0126871d745f4c5ba3dd31689'
    }
  ],
  last: '73d30ff91fab9cdf21392fb9469337aff4bf1ef0126871d745f4c5ba3dd31689'
};

// ── 정본 예시 2: 이름 가림 (name: "") ──
const sampleMasked = {
  ver: 1,
  session: { code: '483921', host: 'SM-F971N', lang: 'ko', started: 1759885200000 },
  items: [
    {
      kind: 'begin', ts: 1759885200000, session: '483921', host: 'SM-F971N', lang: 'ko',
      n: 1, prev: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: 'a8cd1dd0c95414d4844e719cc8648ace1ee857e6b746d0d0b971fd5c6a01a5de'
    },
    {
      kind: 'join', ts: 1759885260000, dev: 'a1b2c3', name: '', lang: 'en',
      n: 2, prev: 'a8cd1dd0c95414d4844e719cc8648ace1ee857e6b746d0d0b971fd5c6a01a5de',
      hash: 'f28fa962533d588362c822c0db4e7cb80300abbe75d5a4b5884952ae6a1830d3'
    },
    {
      kind: 'line', ts: 1759885320000, seq: 1, src: 'ko', text: '안전모를 쓰세요',
      tr: { en: 'Wear a helmet' }, via: '',
      n: 3, prev: 'f28fa962533d588362c822c0db4e7cb80300abbe75d5a4b5884952ae6a1830d3',
      hash: 'a49a121bb59dc5b69ec909059c2b635ebfb814be64880a1f02e7cf4c59b6a3b0'
    },
    {
      kind: 'leave', ts: 1759886460000, dev: 'a1b2c3', why: 'end',
      n: 4, prev: 'a49a121bb59dc5b69ec909059c2b635ebfb814be64880a1f02e7cf4c59b6a3b0',
      hash: '3b467a5e8855c9644669049b6796e7883f3b521f67c80d50de39ce9040a24c7d'
    },
    {
      kind: 'end', ts: 1759886460000, lines: 1, minutes: 21, joined_max: 1,
      n: 5, prev: '3b467a5e8855c9644669049b6796e7883f3b521f67c80d50de39ce9040a24c7d',
      hash: '1f123c8f29d4ce4f92d4dc1602d9876a3c377097a10f2d6bb3eb2fa54b8f34b4'
    }
  ],
  last: '1f123c8f29d4ce4f92d4dc1602d9876a3c377097a10f2d6bb3eb2fa54b8f34b4'
};

async function run() {
  const secret = mockEnv.LICENSE_SECRET;
  
  // 1) Desk 권한이 있는 토큰 (flags: 0x08 Desk 포함)
  const deskToken = mintLicenseToken({
    sub: 'desk_corp_001',
    days: 30,
    flags: 0x08,
    secret
  });

  // 2) Desk 권한이 없는 토큰 (flags: 0x02 카메라 전용)
  const noDeskToken = mintLicenseToken({
    sub: 'app_user_002',
    days: 30,
    flags: 0x02,
    secret
  });

  // ── Test 1: 정본 예시 1 (이름 보임) ──
  console.log('\n[Test 1] 정본 예시 1: 이름 보임');
  const req1 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sampleNamed)
  });
  const res1 = await relayApp.fetch(req1, mockEnv, mockCtx);
  ok(res1.status === 200, '예시 1 응답 200 OK');
  const data1 = await res1.json();
  ok(typeof data1.id === 'string' && data1.id.length > 0, 'id 발급 확인');
  ok(data1.last === sampleNamed.last, '다시 센 last 일치 확인');

  // ── Test 2: 멱등성 검증 (같은 것 두 번 -> 같은 id) ──
  console.log('\n[Test 2] 멱등성 검증 (같은 것 두 번 -> 같은 id)');
  const req2 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sampleNamed)
  });
  const res2 = await relayApp.fetch(req2, mockEnv, mockCtx);
  ok(res2.status === 200, '예시 1 재전송 200 OK');
  const data2 = await res2.json();
  ok(data2.id === data1.id, '새로 만들지 않고 기존 id 반환 (멱등)');
  ok(data2.last === sampleNamed.last, 'last 일치 확인');

  // ── Test 3: 정본 예시 2 (이름 가림) ──
  console.log('\n[Test 3] 정본 예시 2: 이름 가림');
  const req3 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sampleMasked)
  });
  const res3 = await relayApp.fetch(req3, mockEnv, mockCtx);
  ok(res3.status === 200, '예시 2 응답 200 OK');
  const data3 = await res3.json();
  ok(typeof data3.id === 'string' && data3.id !== data1.id, '가린 것은 새 id 발급');
  ok(data3.last === sampleMasked.last, '가린 것의 새 last 일치 확인');

  // ── Test 4: last 위조 (체인 어긋남 -> 400 {why:"chain"}) ──
  console.log('\n[Test 4] last 위조 차단 검증');
  const forgedLast = { ...sampleNamed, last: '0000000000000000000000000000000000000000000000000000000000000000' };
  const req4 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(forgedLast)
  });
  const res4 = await relayApp.fetch(req4, mockEnv, mockCtx);
  ok(res4.status === 400, 'last 위조 시 400 반환');
  const data4 = await res4.json();
  ok(data4.why === 'chain', '에러 사유 why: "chain" 일치');

  // ── Test 5: 이용권 플래그 0x08(Desk) 누락 -> 403 ──
  console.log('\n[Test 5] 이용권 플래그 0x08 누락 차단 검증');
  const req5 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + noDeskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sampleNamed)
  });
  const res5 = await relayApp.fetch(req5, mockEnv, mockCtx);
  ok(res5.status === 403, '0x08 플래그 누락 시 403 반환');
  const data5 = await res5.json();
  ok(data5.why === 'forbidden', '에러 사유 why: "forbidden" 일치');

  // ── Test 6: 허용 목록 외 키 포함 -> 400 {why:"bad_key"} ──
  console.log('\n[Test 6] 허용 목록 외 키 포함 차단 검증');
  const badKeyBody = { ...sampleNamed, audio_recording: 'secret_audio_url' };
  const req6 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(badKeyBody)
  });
  const res6 = await relayApp.fetch(req6, mockEnv, mockCtx);
  ok(res6.status === 400, '허용 밖 키 포함 시 400 반환');
  const data6 = await res6.json();
  ok(data6.why === 'bad_key', '에러 사유 why: "bad_key" 일치');

  // ── Test 7: 저장 가짜가 던지면 503 {why:"store"} 반환 (200 아님!) ──
  console.log('\n[Test 7] DO 스토리지 저장 실패 시 503 {why:"store"} 반환 검증');
  storageShouldThrow = true;
  try {
    const req7 = new Request('http://localhost/desk/session', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + deskToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sampleNamed)
    });
    const res7 = await relayApp.fetch(req7, mockEnv, mockCtx);
    ok(res7.status === 503, '저장 실패 시 503 Service Unavailable 반환 (200 아님)');
    const data7 = await res7.json();
    ok(data7.why === 'store', 'why: "store" 일치 (앱 대기열 재전송 대상)');
  } finally {
    storageShouldThrow = false;
  }

  // ── Test 8: 한국어만 300 KiB 세션 -> 모든 조각 <= 64 KiB (바이트 단위) ──
  console.log('\n[Test 8] 한국어만 300 KiB 세션 분할 저장 및 조각별 바이트 크기(<=64 KiB) 검증');
  const koreanSession = {
    code: '777888',
    host: 'SM-KOREAN-TEST',
    lang: 'ko',
    started: 1759885200000
  };
  // 한국어 텍스트는 1글자당 UTF-8 3바이트
  const koreanSentence = '대한민국 안전보건공단 표준 작업장 안전 수칙 교육 원고입니다. 보호구를 철저히 착용하고 작업을 진행하세요. ';
  // 약 800개 문단 -> 본문 약 320 KiB 이상
  const koreanChain = generateChain(koreanSession, 800, koreanSentence);
  const koreanBodyStr = JSON.stringify(koreanChain);
  const koreanByteLength = Buffer.byteLength(koreanBodyStr, 'utf8');
  const koreanKiB = Math.round(koreanByteLength / 1024);
  ok(koreanKiB >= 300, `한국어 세션 바이트 크기 300 KiB 이상 확인 (실제: ${koreanKiB} KiB, ${koreanByteLength} 바이트)`);

  const req8 = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: koreanBodyStr
  });
  const res8 = await relayApp.fetch(req8, mockEnv, mockCtx);
  ok(res8.status === 200, '한국어 300 KiB 세션 저장 성공 200 OK');
  const data8 = await res8.json();
  ok(data8.last === koreanChain.last, '한국어 세션 last 일치');

  // 저장된 모든 조각이 UTF-8 바이트 기준으로 64 KiB 이하인지 검증
  const headerRec = await mockStorage.get(`desk:${koreanChain.last}`);
  ok(headerRec && headerRec.chunks >= 5, `청크 5개 이상 분할 저장 확인 (chunks: ${headerRec.chunks})`);
  let maxChunkBytes = 0;
  for (let i = 0; i < headerRec.chunks; i++) {
    const chunkItems = await mockStorage.get(`desk:${koreanChain.last}:${i}`);
    ok(Array.isArray(chunkItems) && chunkItems.length > 0, `조각 ${i} 항목 존재 확인`);
    const chunkBytes = Buffer.byteLength(JSON.stringify(chunkItems), 'utf8');
    if (chunkBytes > maxChunkBytes) maxChunkBytes = chunkBytes;
    ok(chunkBytes <= 64 * 1024, `조각 ${i} 크기 <= 64 KiB (실제: ${chunkBytes} 바이트, ${Math.round(chunkBytes/1024)} KiB)`);
  }
  console.log(`  -> 한국어 분할 조각 중 최대 크기: ${maxChunkBytes} 바이트 (<= 65,536 바이트 완벽 충족)`);

  // ── Test 9: 130 KiB 단일 항목 하나 포함 시 413 {why:"item_too_large"} 차단 ──
  console.log('\n[Test 9] 130 KiB 초과 단일 항목 차단 검증 (413)');
  const giantSentence = '가'.repeat(45 * 1024); // 한글 45,000자 = 약 135 KiB
  const giantChain = generateChain(koreanSession, 4, giantSentence);
  const giantReq = new Request('http://localhost/desk/session', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + deskToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(giantChain)
  });
  const giantRes = await relayApp.fetch(giantReq, mockEnv, mockCtx);
  ok(giantRes.status === 413, '130 KiB 초과 단일 항목 413 Payload Too Large 반환');
  const giantData = await giantRes.json();
  ok(giantData.why === 'item_too_large', 'why: "item_too_large" 일치');

  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
}

run().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
