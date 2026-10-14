// relay/test/question-queue.mjs — N:1 질문 대기열 및 지명 상태머신 (question.md) 단위 시험
import assert from 'assert';
import { Room } from '../src/room.js';

console.log('=== Relay N:1 질문 대기열 및 지명 UI 상태머신 단위 시험 ===');

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
      for (const item of k) if (this.map.has(item)) res.set(item, this.map.get(item));
      return res;
    }
    return this.map.get(k);
  }
  async put(k, v) {
    if (typeof k === 'object' && v === undefined) {
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
  async setAlarm() {}
  async deleteAlarm() {}
}

class MockWebSocket {
  constructor(role = 'listener') {
    this.role = role;
    this.sent = [];
    this.readyState = 1;
    this.attachment = null;
  }
  send(data) { this.sent.push(typeof data === 'string' ? data : data.toString()); }
  serializeAttachment(a) { this.attachment = a; }
  deserializeAttachment() { return this.attachment; }
  close() { this.readyState = 3; }
}

class MockContext {
  constructor() {
    this.storage = new MockStorage();
    this.sockets = { host: [], listener: [] };
  }
  blockConcurrencyWhile(fn) { return fn(); }
  acceptWebSocket(ws, [role]) {
    this.sockets[role].push(ws);
  }
  getWebSockets(tag) { return this.sockets[tag] || []; }
  getTags(ws) { return ws.role ? [ws.role] : ['listener']; }
  waitUntil(p) { return p; }
}

(async () => {
  const ctx = new MockContext();
  const env = { LICENSE_SECRET: 'test-secret' };
  const room = new Room(ctx, env);
  room.initialized = true;
  room.code = '123456';

  const hostWs = new MockWebSocket('host');
  ctx.acceptWebSocket(hostWs, ['host']);

  const lis1 = new MockWebSocket('listener');
  ctx.acceptWebSocket(lis1, ['listener']);

  const lis2 = new MockWebSocket('listener');
  ctx.acceptWebSocket(lis2, ['listener']);

  // 1. 청취자 A(vi)가 텍스트 질문 요청 송신 (P-16, P-14)
  const req1 = JSON.stringify({
    kind: 'ask_req',
    name: 'Nguyen Van A',
    lang: 'vi',
    text: '이 밸브를 먼저 잠급니까?'
  });
  await room.webSocketMessage(lis1, req1);

  ok(room.askQueue.length === 1, '대기열에 1건 등록 확인');
  ok(room.askQueue[0].seq === 1, 'B-3 릴레이가 단일 순번 1 부여 확인');
  ok(room.askQueue[0].name === 'Nguyen Van A', '질문자 이름 보존 확인');
  ok(room.askQueue[0].lang === 'vi', '질문자 언어(vi) 보존 확인');
  ok(room.askQueue[0].text === '이 밸브를 먼저 잠급니까?', 'P-16 텍스트 질문 본문 일치 확인');

  // 호스트에게 원문 포함 ask_queue 수신 확인
  const hostLastMsg = JSON.parse(hostWs.sent[hostWs.sent.length - 1]);
  ok(hostLastMsg.kind === 'ask_queue' && hostLastMsg.queue.length === 1, '호스트에게 ask_queue 전송 확인');
  ok(hostLastMsg.queue[0].text === '이 밸브를 먼저 잠급니까?', '호스트에게 질문 원문 전달 확인');

  // 청취자에게 순번 및 건수 포함 ask_queue 수신 확인
  const lis2LastMsg = JSON.parse(lis2.sent[lis2.sent.length - 1]);
  ok(lis2LastMsg.kind === 'ask_queue' && lis2LastMsg.count === 1, '다른 청취자에게도 대기열 건수 브로드캐스트 확인');
  ok(lis2LastMsg.queue[0].seq === 1, '청취자에게 동일한 순번(1) 전달 확인');

  // 2. 청취자 B(th)가 두 번째 질문 요청 송신
  const req2 = JSON.stringify({
    kind: 'ask_req',
    name: 'Somchai',
    lang: 'th',
    text: '소화기는 어디에 있습니까?'
  });
  await room.webSocketMessage(lis2, req2);

  ok(room.askQueue.length === 2, '대기열에 2건 등록 확인');
  ok(room.askQueue[1].seq === 2, 'B-3 도착 순번 2 부여 확인');

  // 3. 강사가 1번 질문 수동 지명 (P-17, P-14 역번역 배포)
  const q1Id = room.askQueue[0].id;
  const grant1 = JSON.stringify({
    kind: 'ask_grant',
    id: q1Id,
    trans: { ko: '이 밸브를 먼저 잠급니까?', en: 'Do we shut this valve first?' }
  });
  await room.webSocketMessage(hostWs, grant1);

  ok(room.activeAsk !== null, '활성 발언 질문 설정 확인');
  ok(room.activeAsk.id === q1Id, '지명된 1번 질문 활성화 확인');
  ok(room.activeAsk.trans.ko === '이 밸브를 먼저 잠급니까?', 'P-14 강사 언어로 역번역된 번역문 장착 확인');

  const lisActiveMsg = JSON.parse(lis1.sent[lis1.sent.length - 1]);
  ok(lisActiveMsg.kind === 'ask_active', '전체 참여자에게 ask_active 브로드캐스트 확인');
  ok(lisActiveMsg.name === 'Nguyen Van A', '발언자 이름 표출 확인');
  ok(lisActiveMsg.trans.en === 'Do we shut this valve first?', '청취자 모국어 번역본 배포 확인');

  // 4. B-2 동시 2명 인가 차단 검증
  const q2Id = room.askQueue[1].id;
  const grant2 = JSON.stringify({
    kind: 'ask_grant',
    id: q2Id,
    trans: { ko: '소화기는 어디에 있습니까?' }
  });
  hostWs.sent = [];
  await room.webSocketMessage(hostWs, grant2);
  const hostErr = JSON.parse(hostWs.sent[0]);
  ok(hostErr.kind === 'ask_error' && hostErr.why === 'already_active', 'B-2 동시 2명 지명 시도 시 already_active 오류 차단');

  // 5. 강사가 1번 질문 답변 종료 및 회수 (B-4, B-5)
  const close1 = JSON.stringify({
    kind: 'ask_close',
    id: q1Id,
    reason: 'host_done'
  });
  await room.webSocketMessage(hostWs, close1);

  ok(room.activeAsk === null, '발언 종료 후 활성 질문 null 복구');
  ok(room.askQueue.length === 1 && room.askQueue[0].id === q2Id, '대기열에서 1번 질문 제거 및 2번 질문 유지 확인');

  const endMsg = JSON.parse(lis1.sent[lis1.sent.length - 2]);
  ok(endMsg.kind === 'ask_ended' && endMsg.reason === 'host_done', 'B-4/B-5 회수 사유(host_done) 명시 브로드캐스트 확인');

  // 6. 특허 독립항 핵심: 건너뛰어 지명해도 요청 사실과 순번 보존 (선행조사 §2-1)
  // 청취자 3 (seq 3) 추가 등록
  const lis3 = new MockWebSocket('listener');
  ctx.acceptWebSocket(lis3, ['listener']);
  const req3 = JSON.stringify({
    kind: 'ask_req',
    name: 'Kenji',
    lang: 'ja',
    text: '비상구는 몇 번입니까?'
  });
  await room.webSocketMessage(lis3, req3);
  ok(room.askQueue.length === 2, '대기열에 2건(2번, 3번) 유지 확인');
  ok(room.askQueue[0].seq === 2 && room.askQueue[1].seq === 3, '순번 2와 3 유지 확인');

  // 호스트가 2번을 건너뛰고 3번을 먼저 수동 지명
  const q3Id = room.askQueue[1].id;
  const grant3 = JSON.stringify({
    kind: 'ask_grant',
    id: q3Id,
    trans: { ko: '비상구는 몇 번입니까?' }
  });
  await room.webSocketMessage(hostWs, grant3);
  ok(room.activeAsk !== null && room.activeAsk.id === q3Id, '3번 질문 수동 지명 활성화');
  ok(room.askQueue[0].seq === 2, '호스트가 3번을 건너뛰어 지명해도 앞선 2번 순번은 변조되지 않고 유지됨 (독립항)');

  // 3번 종료 (사유: timeout)
  await room.webSocketMessage(hostWs, JSON.stringify({ kind: 'ask_close', id: q3Id, reason: 'timeout' }));
  ok(room.askQueue.length === 1 && room.askQueue[0].seq === 2, '3번 종료 후에도 2번 질문과 순번 2 보존 확인');

  // 청취자 4 (seq 4) 등록 후 silent 회수
  const lis4 = new MockWebSocket('listener');
  ctx.acceptWebSocket(lis4, ['listener']);
  await room.webSocketMessage(lis4, JSON.stringify({ kind: 'ask_req', name: 'User4', lang: 'en', text: 'Q4' }));
  const q4Id = room.askQueue[1].id;
  await room.webSocketMessage(hostWs, JSON.stringify({ kind: 'ask_grant', id: q4Id, trans: {} }));
  await room.webSocketMessage(hostWs, JSON.stringify({ kind: 'ask_close', id: q4Id, reason: 'silent' }));

  // 청취자 5 (seq 5) 등록 후 disconnect 회수 (소켓 닫힘)
  const lis5 = new MockWebSocket('listener');
  ctx.acceptWebSocket(lis5, ['listener']);
  await room.webSocketMessage(lis5, JSON.stringify({ kind: 'ask_req', name: 'User5', lang: 'en', text: 'Q5' }));
  const q5Id = room.askQueue[1].id;
  await room.webSocketMessage(hostWs, JSON.stringify({ kind: 'ask_grant', id: q5Id, trans: {} }));
  await room.webSocketClose(lis5, 1000, 'disconnect', true);

  // 7. 4대 회수 사유 (host_done, timeout, silent, disconnect) 각각 한 줄씩 기록 검증
  const recordedReasons = new Set((room.askHistory || []).map(h => h.reason).filter(Boolean));
  for (const r of ['host_done', 'timeout', 'silent', 'disconnect']) {
    ok(recordedReasons.has(r), `4대 회수 사유 중 ${r} 사유 한 줄 기록 확인`);
  }

  // 8. P-14 자물쇠: 참여자가 번역해 보내면 거부
  const lisP14 = new MockWebSocket('listener');
  ctx.acceptWebSocket(lisP14, ['listener']);
  const badReqP14 = JSON.stringify({
    kind: 'ask_req',
    name: 'Hacker',
    lang: 'en',
    text: 'Hello',
    trans: { ko: '안녕' } // 참여자 번역 포함 (위반)
  });
  await room.webSocketMessage(lisP14, badReqP14);
  const p14Err = JSON.parse(lisP14.sent[0] || '{}');
  ok(p14Err.kind === 'ask_error' && p14Err.why === 'p14_participant_translation_forbidden', 'P-14 참여자 번역 포함 요청 차단 확인');

  // 9. D-09 되돌림 실증 2건:
  // ① 건너뛰기 지명 시 앞선 순번 기록을 지우면 단언 실패 입증
  let revert1Failed = false;
  try {
    const fakeErasedSeq = room.askQueue.filter(q => q.seq === 2);
    assert.strictEqual(fakeErasedSeq.length, 0, '건너뛰기 지명 시 앞선 순번 기록 보존 단언 실패');
  } catch (e) {
    revert1Failed = true;
  }
  ok(revert1Failed === true, '건너뛰기 시 앞선 순번 삭제 변조 시 단언 실패 입증 (되돌림 실증 1)');

  // ② 참여자 번역 허용 시 단언 실패 입증
  // ⚠ 되돌림은 **릴레이가 실제로 돌려준 답**으로 한다. 시험 안에서 만든 상수로 하면
  //   릴레이를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
  let revert2Failed = false;
  try {
    // 릴레이가 실제로 돌려준 답을 본다. 지금 P-14 로 막혀서 아래 단언이 던진다.
    // 참여자 번역을 통과시키면 why 가 달라져 던지지 않고 ok 가 붉는다.
    assert.notStrictEqual(p14Err.why, 'p14_participant_translation_forbidden',
                          '참여자 번역(trans)이 P-14 로 막히지 않았다');
  } catch (e) {
    revert2Failed = true;
  }
  ok(revert2Failed === true, '참여자 번역 통과 시 단언 실패 입증 (되돌림 실증 2)');

  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
