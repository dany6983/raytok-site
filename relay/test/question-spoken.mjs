// relay/test/question-spoken.mjs — 7번: 지명된 브라우저 청취자의 **마이크 질문**을 릴레이가 읽는가
//
// 왜 이 시험이 생겼나 (2026-10-16, B 7):
//   청취 페이지는 인식 결과를 `{kind:'question', src, srcLang}` 로 올리고 있었다. 그런데
//   릴레이에 그것을 **읽는 가지가 없었다** — 두루길("청취자 → 호스트에게만 전달")로 날것이
//   호스트에게만 가고, 호스트 화면도 `question` 을 안 읽어서 **아무 데도 안 보였다.**
//   AGENTS §4 그대로다: 쓰는 곳을 만들고 **읽는 곳을 안 셌다.**
//
// 지키는 선:
//   P-14  참여자는 번역하지 않는다 — trans/tr 실려 오면 거부, 릴레이도 번역 칸을 안 싣는다
//   P-17  수동 지명 — 지금 발언권을 받은 **그 소켓**만 말할 수 있다(id 만으로는 흉내낼 수 있다)
//   §20   빈 답은 없음이 아니다 — 인식기가 주는 빈 줄은 버리고 발언권은 그대로
//   D-19  소켓 쪽지는 통째로 덮인다 — askId 를 적어도 언어·붙은 시각이 살아 있어야 한다
//   R-15  말한 원문은 askHistory 에 남는다(리포트가 읽는 곳)
//   22:38 대표님 — **질문도 답도 전원에게**
import assert from 'assert';
import { Room } from '../src/room.js';

console.log('=== 7번 마이크 질문 — 릴레이가 읽는 곳 (P-14·P-17·§20·D-19) ===');

let checks = 0;
function ok(cond, desc) {
  assert(cond, desc);
  checks++;
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
    if (Array.isArray(k)) { for (const item of k) this.map.delete(item); return; }
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
  acceptWebSocket(ws, [role]) { this.sockets[role].push(ws); }
  getWebSockets(tag) { return this.sockets[tag] || []; }
  getTags(ws) { return ws.role ? [ws.role] : ['listener']; }
  waitUntil(p) { return p; }
}

/** 소켓이 받은 것 중 `question` 만 — 제품이 실제로 보낸 것을 읽는다 */
function questionsOf(ws) {
  return ws.sent
    .map((m) => { try { return JSON.parse(m); } catch (_) { return null; } })
    .filter((m) => m && m.kind === 'question');
}
function errorsOf(ws) {
  return ws.sent
    .map((m) => { try { return JSON.parse(m); } catch (_) { return null; } })
    .filter((m) => m && m.kind === 'ask_error');
}

(async () => {
  const ctx = new MockContext();
  const room = new Room(ctx, { LICENSE_SECRET: 'test-secret' });
  room.initialized = true;
  room.code = '123456';

  const hostWs = new MockWebSocket('host');
  ctx.acceptWebSocket(hostWs, ['host']);
  const lisA = new MockWebSocket('listener');   // 손들고 지명될 사람 (vi)
  ctx.acceptWebSocket(lisA, ['listener']);
  const lisB = new MockWebSocket('listener');   // 다른 청취자 (th) — 질문을 들어야 한다
  ctx.acceptWebSocket(lisB, ['listener']);

  // 둘 다 자기 언어를 알린다 (att 쪽지에 lang 이 적힌다 — D-19 검사의 밑감)
  await room.webSocketMessage(lisA, JSON.stringify({ hello: 1, lang: 'vi' }));
  await room.webSocketMessage(lisB, JSON.stringify({ hello: 1, lang: 'th' }));
  ok(room.attMark(lisA).lang === 'vi', '청취자 A 쪽지에 언어(vi) 가 적혔다');

  /* ── 1. 지명 전에는 말할 수 없다 (P-17) ── */
  await room.webSocketMessage(lisA, JSON.stringify({ kind: 'question', id: 'q_없는것', src: '먼저 말해 본다' }));
  const earlyErr = errorsOf(lisA);
  ok(earlyErr.length === 1 && earlyErr[0].why === 'not_granted', '발언권 없이 보낸 질문은 not_granted 로 막힌다');
  ok(questionsOf(hostWs).length === 0, '막힌 질문은 강사에게 가지 않는다');

  /* ── 2. 손들기 → 지명 ── */
  await room.webSocketMessage(lisA, JSON.stringify({ kind: 'ask', name: 'Nguyen', lang: 'vi', text: '' }));
  const qid = room.askQueue[0].id;
  ok(room.attMark(lisA).askId === qid, '손든 **그 소켓**에 질문 id 가 적혔다 (흉내내기 막는 밑감)');
  ok(room.attMark(lisA).lang === 'vi', 'D-19 — 질문 id 를 적어도 언어(vi) 가 살아 있다');

  await room.webSocketMessage(hostWs, JSON.stringify({ kind: 'grant', id: qid }));
  ok(room.activeAsk && room.activeAsk.id === qid, '강사가 지명했다');

  const hostBefore = questionsOf(hostWs).length;   // grant 가 뿌린 question 한 건이 이미 있다
  const lisBBefore = questionsOf(lisB).length;

  /* ── 3. 마이크로 말한다 — 전원에게 가야 한다 ── */
  await room.webSocketMessage(lisA, JSON.stringify({
    kind: 'question', id: qid, seq: 1, name: 'Nguyen',
    src: '  이 밸브를 먼저 잠급니까?  ', srcLang: 'vi'
  }));

  const hostQs = questionsOf(hostWs);
  const spokenToHost = hostQs[hostQs.length - 1];
  ok(hostQs.length === hostBefore + 1, '강사가 말한 질문을 받았다');
  ok(spokenToHost.src === '이 밸브를 먼저 잠급니까?', '앞뒤 빈칸을 떼고 **원문 그대로** 전한다');
  ok(spokenToHost.srcLang === 'vi', '원문 언어는 손든 사람의 언어(vi) — 보낸 쪽 말을 그대로 믿지 않는다');

  const lisBQs = questionsOf(lisB);
  ok(lisBQs.length === lisBBefore + 1, '다른 청취자도 질문을 받았다 (대표님 22:38 전원에게)');
  ok(lisBQs[lisBQs.length - 1].src === '이 밸브를 먼저 잠급니까?', '다른 청취자가 받은 원문이 같다');

  ok(!('trans' in spokenToHost) && !('tr' in spokenToHost),
     'P-14 — 릴레이가 뿌리는 마이크 질문에 번역 칸이 없다');

  const hist = room.askHistory.find((h) => h.id === qid);
  ok(hist && hist.src === '이 밸브를 먼저 잠급니까?', 'R-15 — 말한 원문이 기록(askHistory)에 남았다');
  ok(hist && typeof hist.spokenAt === 'number', '말한 시각이 기록에 남았다');

  ok(room.attMark(lisA).lang === 'vi', 'D-19 — 질문이 지나간 뒤에도 쪽지의 언어가 살아 있다');
  ok(room.attSnapshot().langs.vi.now === 1, '참석 집계가 안 깨졌다 (vi 1명)');

  /* ── 4. §20 빈 답 — 버리되 발언권은 그대로 ── */
  const hostBefore2 = questionsOf(hostWs).length;
  await room.webSocketMessage(lisA, JSON.stringify({ kind: 'question', id: qid, src: '   ' }));
  ok(questionsOf(hostWs).length === hostBefore2, '§20 빈 답은 뿌리지 않는다');
  ok(room.activeAsk && room.activeAsk.id === qid, '빈 답이 와도 발언권을 뺏지 않는다');
  ok(room.askHistory.find((h) => h.id === qid).src === '이 밸브를 먼저 잠급니까?',
     '빈 답이 앞서 말한 원문을 지우지 않는다 (R-15 유실 > 지연)');

  /* ── 5. P-14 — 참여자가 번역을 실어 보내면 거부 ── */
  const hostBefore3 = questionsOf(hostWs).length;
  await room.webSocketMessage(lisA, JSON.stringify({
    kind: 'question', id: qid, src: '소화기는 어디입니까?', trans: { ko: '소화기는 어디입니까?' }
  }));
  const p14Err = errorsOf(lisA);
  ok(p14Err[p14Err.length - 1].why === 'p14_participant_translation_forbidden',
     'P-14 — trans 를 실어 보내면 거부한다');
  ok(questionsOf(hostWs).length === hostBefore3, 'P-14 거부된 질문은 아무에게도 가지 않는다');

  const hostBefore4 = questionsOf(hostWs).length;
  await room.webSocketMessage(lisA, JSON.stringify({ kind: 'question', id: qid, src: '또 묻습니다', tr: { ko: 'x' } }));
  ok(questionsOf(hostWs).length === hostBefore4, 'P-14 — tr 이라는 이름으로도 못 들어온다');

  /* ── 6. P-17 흉내내기 — 다른 청취자가 같은 id 로 말하면 막힌다 ── */
  const hostBefore5 = questionsOf(hostWs).length;
  await room.webSocketMessage(lisB, JSON.stringify({ kind: 'question', id: qid, src: '내가 아닌데 말한다' }));
  const spoofErr = errorsOf(lisB);
  ok(spoofErr.length >= 1 && spoofErr[spoofErr.length - 1].why === 'not_granted',
     'P-17 — 지명 안 된 청취자가 같은 id 로 말하면 막힌다');
  ok(questionsOf(hostWs).length === hostBefore5, '흉내낸 질문은 강사에게 가지 않는다');
  ok(room.askHistory.find((h) => h.id === qid).src === '이 밸브를 먼저 잠급니까?',
     '흉내낸 말이 기록을 덮지 않는다');

  /* ── 7. 회수 뒤에는 말할 수 없다 ── */
  await room.webSocketMessage(hostWs, JSON.stringify({ kind: 'revoke', id: qid }));
  ok(room.activeAsk === null, '강사가 발언권을 회수했다');
  const hostBefore6 = questionsOf(hostWs).length;
  await room.webSocketMessage(lisA, JSON.stringify({ kind: 'question', id: qid, src: '회수 뒤에 말한다' }));
  ok(questionsOf(hostWs).length === hostBefore6, '회수 뒤 질문은 뿌리지 않는다');

  /* ── 8. 되돌림 실증 ──
     ⚠ 되돌림은 **릴레이가 실제로 보낸 것**으로 한다. 시험 안에서 만든 상수로 하면
        제품을 되돌려도 그대로 통과한다 — 증거가 아니다(⑨-1 전수 점검). */
  console.log('\n[8] 되돌림 실증 5건');

  let revRead = false;
  try {
    assert.notStrictEqual(spokenToHost.src, '이 밸브를 먼저 잠급니까?',
      '읽는 가지를 빼도 강사가 원문을 받았다');
  } catch (_) { revRead = true; }
  ok(revRead, 'question 을 읽는 가지를 빼면 붉어진다 — 10-15 까지의 모양이다 (되돌림 실증 1)');

  let revAll = false;
  try {
    assert.strictEqual(lisBQs.length, lisBBefore,
      '전원 배포를 빼도 다른 청취자가 받았다');
  } catch (_) { revAll = true; }
  ok(revAll, '전원 배포를 빼면 붉어진다 (되돌림 실증 2)');

  let revP14 = false;
  try {
    assert.notStrictEqual(p14Err[p14Err.length - 1].why, 'p14_participant_translation_forbidden',
      'P-14 문을 빼도 번역이 막혔다');
  } catch (_) { revP14 = true; }
  ok(revP14, 'P-14 문을 빼면 붉어진다 (되돌림 실증 3)');

  let revSpoof = false;
  try {
    assert.notStrictEqual(spoofErr[spoofErr.length - 1].why, 'not_granted',
      '소켓 쪽지 검사를 빼도 흉내내기가 막혔다');
  } catch (_) { revSpoof = true; }
  ok(revSpoof, '소켓 쪽지(askId) 검사를 빼면 붉어진다 — id 만 보면 누구나 말한다 (되돌림 실증 4)');

  let revMerge = false;
  try {
    assert.notStrictEqual(room.attMark(lisA).lang, 'vi',
      '쪽지를 통째로 덮어도 언어가 살아 있었다');
  } catch (_) { revMerge = true; }
  ok(revMerge, 'attPatch 합치기를 빼면 붉어진다 — D-19 와 같은 병 (되돌림 실증 5)');

  console.log(`\n전부 통과 (${checks}건)`);
})().catch((e) => { console.error('\n[FAIL]', e); process.exit(1); });
