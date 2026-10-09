import { Room } from '../src/room.js';
import { mintLicense } from '../src/license.js';

let checks = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    process.exit(1);
  }
  checks++;
  console.log(`  [PASS] ${msg}`);
}

class FakeWs {
  constructor(tag) {
    this.tag = tag;
    this.sent = [];
    this.closed = false;
    this.attachment = null;
  }
  send(m) {
    this.sent.push(typeof m === 'string' ? m : new TextDecoder().decode(m));
  }
  close(code, reason) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }
  serializeAttachment(a) {
    this.attachment = a;
  }
  deserializeAttachment() {
    return this.attachment;
  }
}

class FakeWebSocketPair {
  constructor() {
    this[0] = new FakeWs('client');
    this[1] = new FakeWs('server');
  }
}
globalThis.WebSocketPair = FakeWebSocketPair;

const NativeResponse = globalThis.Response;
class MockResponse extends NativeResponse {
  constructor(body, init) {
    if (init && init.status === 101) {
      super(null, { status: 200 });
      this._status = 101;
      this.webSocket = init.webSocket;
      return;
    }
    super(body, init);
  }
  get status() {
    return this._status !== undefined ? this._status : super.status;
  }
}
globalThis.Response = MockResponse;

function fakeCtx(initialSockets = []) {
  const sockets = [...initialSockets];
  const storage = new Map();
  let alarmTimestamp = null;
  return {
    storage: {
      get: async (k) => {
        if (Array.isArray(k)) {
          const m = new Map();
          for (const key of k) if (storage.has(key)) m.set(key, storage.get(key));
          return m;
        }
        return storage.get(k);
      },
      put: async (k, v) => {
        if (typeof k === 'object' && k !== null && v === undefined) {
          for (const [key, val] of Object.entries(k)) storage.set(key, val);
        } else {
          storage.set(k, v);
        }
      },
      delete: async (k) => storage.delete(k),
      deleteAlarm: async () => { alarmTimestamp = null; },
      setAlarm: async (ts) => { alarmTimestamp = ts; }
    },
    alarmAt: () => alarmTimestamp,
    getWebSockets: (tag) => sockets.filter(s => !tag || s.tag === tag),
    getTags: (ws) => [ws.tag],
    blockConcurrencyWhile: async (fn) => await fn(),
    waitUntil: () => {},
    acceptWebSocket: (ws, tags = []) => {
      ws.tag = tags[0] || 'unknown';
      sockets.push(ws);
    },
    removeWebSocket: (ws) => {
      const idx = sockets.indexOf(ws);
      if (idx !== -1) sockets.splice(idx, 1);
    },
    setWebSocketAutoResponse: () => {}
  };
}

(async () => {
  console.log('=== W5 1:N 실시간 강사 컨트롤: 한 방 호스트 둘 허용 및 중계 단위 시험 ===\n');

  const SECRET = 'test-w5-secret-key-32bytes-length!';
  const env = { LICENSE_SECRET: SECRET };

  // 1. 이용권 토큰 2종 생성 (sub='cust_A', sub='cust_B')
  const { token: tokenA } = await mintLicense('cust_A', 30, 0x01 | 0x04, SECRET);
  const { token: tokenB } = await mintLicense('cust_B', 30, 0x01 | 0x04, SECRET);

  const ctx = fakeCtx();
  const room = new Room(ctx, env);

  // 방 초기화: cust_A 의 이용권으로 방 생성
  const initRes = await room.fetch(new Request('http://internal/init', {
    method: 'POST',
    body: JSON.stringify({
      code: 'W5ROOM',
      host_token: 'ht_secret_123',
      kind: 'guide',
      sub: 'cust_A'
    })
  }));
  ok(initRes.status === 200, '방 초기화 성공 (sub=cust_A, code=W5ROOM)');

  // [Test 1] 첫 번째 호스트(폰 마이크) 접속 - host_token 사용
  console.log('\n[Test 1] 호스트 1 접속 (host_token)');
  const wsReq1 = new Request('http://internal/ws?room=W5ROOM&role=host&token=ht_secret_123', {
    headers: { Upgrade: 'websocket' }
  });
  const res1 = await room.fetch(wsReq1);
  ok(res1.status === 101, '호스트 1 접속 허용 (101 Switching Protocols)');
  const host1 = ctx.getWebSockets('host')[0];
  ok(host1 && host1.tag === 'host', '호스트 1 웹소켓 등록 확인');

  // [Test 2] 두 번째 호스트(PC 브라우저) 접속 - 같은 이용권 토큰(sub=cust_A) 사용
  console.log('\n[Test 2] 호스트 2 접속 (같은 이용권 토큰 tokenA)');
  const wsReq2 = new Request(`http://internal/ws?room=W5ROOM&role=host&token=${tokenA}`, {
    headers: { Upgrade: 'websocket' }
  });
  const res2 = await room.fetch(wsReq2);
  ok(res2.status === 101, '호스트 2 접속 허용 (101 Switching Protocols)');
  const host2 = ctx.getWebSockets('host')[1];
  ok(host2 && host2.tag === 'host', '호스트 2 웹소켓 등록 확인 (현재 호스트 2명)');

  // [Test 3] 세 번째 호스트 접속 시도 -> 429 Too Many Requests (최대 2명 상한)
  console.log('\n[Test 3] 세 번째 호스트 접속 차단');
  const wsReq3 = new Request(`http://internal/ws?room=W5ROOM&role=host&token=${tokenA}`, {
    headers: { Upgrade: 'websocket' }
  });
  const res3 = await room.fetch(wsReq3);
  ok(res3.status === 429, '세 번째 호스트 429 차단 확인 (2명 상한 초과)');

  // [Test 4] 다른 이용권(sub=cust_B) 호스트 접속 시도
  console.log('\n[Test 4] 다른 사람(sub=cust_B)의 토큰으로 호스트 접속 시도');
  // 호스트 하나 제거 후 테스트
  ctx.removeWebSocket(host2);
  ok(ctx.getWebSockets('host').length === 1, '호스트 2 퇴장 후 현재 호스트 1명');

  const wsReqB = new Request(`http://internal/ws?room=W5ROOM&role=host&token=${tokenB}`, {
    headers: { Upgrade: 'websocket' }
  });
  const resB = await room.fetch(wsReqB);
  ok(resB.status === 403, '다른 고객(sub 불일치)의 토큰은 403 차단');

  // 호스트 2 다시 복구
  const res2_restore = await room.fetch(wsReq2);
  ok(res2_restore.status === 101, '호스트 2 재접속 성공');
  const host2_active = ctx.getWebSockets('host')[1];

  // 청취자 2명 접속
  const listenerReq1 = new Request('http://internal/ws?room=W5ROOM&role=listener', {
    headers: { Upgrade: 'websocket' }
  });
  await room.fetch(listenerReq1);
  const l1 = ctx.getWebSockets('listener')[0];

  const listenerReq2 = new Request('http://internal/ws?room=W5ROOM&role=listener', {
    headers: { Upgrade: 'websocket' }
  });
  await room.fetch(listenerReq2);
  const l2 = ctx.getWebSockets('listener')[1];
  ok(ctx.getWebSockets('listener').length === 2, '청취자 2명 접속 확인');

  // [Test 5] 메시지 상호 중계 검증
  console.log('\n[Test 5] 호스트 간 메시지 교차 중계 검증');
  // 5-1. 호스트 1(폰 마이크)이 음성 자막 전송
  const voiceLine = JSON.stringify({ seq: 1, text: '안녕하세요 여러분', tr: { en: 'Hello everyone' } });
  await room.webSocketMessage(host1, voiceLine);

  ok(l1.sent.includes(voiceLine), '청취자 1이 음성 자막 수신');
  ok(l2.sent.includes(voiceLine), '청취자 2가 음성 자막 수신');
  ok(host2_active.sent.includes(voiceLine), '호스트 2(PC 브라우저)가 호스트 1의 음성 자막 수신');
  ok(!host1.sent.includes(voiceLine), '호스트 1(자기 자신)에게는 에코되지 않음');

  // 5-2. 호스트 2(PC 컨트롤)가 원고 script 전송
  const scriptMsg = JSON.stringify({ kind: 'script', para: 1, total: 5, src: '1번 원고 문단', srcLang: 'ko', trans: { en: 'Paragraph 1' } });
  await room.webSocketMessage(host2_active, scriptMsg);

  ok(l1.sent.includes(scriptMsg), '청취자 1이 원고 script 수신');
  ok(l2.sent.includes(scriptMsg), '청취자 2가 원고 script 수신');
  ok(host1.sent.includes(scriptMsg), '호스트 1(폰)이 호스트 2의 script 수신');
  ok(!host2_active.sent.includes(scriptMsg), '호스트 2(자기 자신)에게는 에코되지 않음');

  // 5-3. 청취자가 hello 전송 -> 두 호스트 모두에게 전달
  const helloMsg = JSON.stringify({ hello: 1, lang: 'en', name: 'Alice' });
  await room.webSocketMessage(l1, helloMsg);
  ok(host1.sent.includes(helloMsg), '호스트 1이 청취자 hello 수신');
  ok(host2_active.sent.includes(helloMsg), '호스트 2가 청취자 hello 수신');

  // [Test 6] 호스트 퇴장 및 무음/종료 타이머 연동 검증
  console.log('\n[Test 6] 호스트 하나 끊김 시 알람 미발생 및 둘 다 끊길 때 알람 발생');
  const alarmBefore = ctx.alarmAt();
  // 호스트 1 접속 종료
  await room.webSocketClose(host1, 1000, 'normal', true);
  ctx.removeWebSocket(host1);
  ok(ctx.getWebSockets('host').length === 1, '호스트 1 종료 후 남은 호스트 1명');
  ok(ctx.alarmAt() === alarmBefore, '남은 호스트가 있으므로 10분 호스트 끊김 알람으로 변경되지 않음 (방 유지)');

  // 남은 호스트 2도 접속 종료
  await room.webSocketClose(host2_active, 1000, 'normal', true);
  ctx.removeWebSocket(host2_active);
  ok(ctx.getWebSockets('host').length === 0, '모든 호스트 종료');
  ok(ctx.alarmAt() !== alarmBefore, '모든 호스트가 끊겼으므로 10분 후 종료 알람으로 새로 예약됨');

  console.log(`\n전부 통과 (${checks}건)`);
})();
