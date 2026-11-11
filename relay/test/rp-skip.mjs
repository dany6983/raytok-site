// relay/test/rp-skip.mjs — 레이팩 손님은 방 번역을 안 받는다 (사이트 NOW 11-11 14:59 ②)
// 보는 것: ① vi 손님 둘 중 하나만 rp → vi 들은 줄 그대로 산다 ② 둘 다 rp → vi 들은 줄 안 산다(room_tr_skip)
//          · ne(rp 아님)는 그대로 ③ 원고 줄은 rp 여도 산다 ④ 레이팩이 놓친 줄 srv:1 seq → 그 줄만 vi 로 사서 vi 에게
//          ⑤ P-14: tr 실린 tr_need 는 버린다 ⑥ 거울: env ROOM_TR_RPSKIP=0 이면 ② 가 산다
import assert from 'assert';
import { Room } from '../src/room.js';

let n = 0;
const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };
console.log('=== 레이팩 손님 방 번역 끄기 — relay/src/room.js ===');

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) { const r = new Map(); for (const i of k) if (this.map.has(i)) r.set(i, this.map.get(i)); return r; }
    return this.map.get(k);
  }
  async put(k, v) { if (typeof k === 'object' && v === undefined) { for (const [a, b] of Object.entries(k)) this.map.set(a, b); return; } this.map.set(k, v); }
  async delete(k) { for (const i of (Array.isArray(k) ? k : [k])) this.map.delete(i); }
  async setAlarm() {} async deleteAlarm() {}
}
class WS {
  constructor(role) { this.role = role; this.sent = []; this.attachment = null; }
  send(d) { this.sent.push(String(d)); }
  serializeAttachment(a) { this.attachment = a; }
  deserializeAttachment() { return this.attachment; }
  close() {}
  all() { return this.sent.map((s) => { try { return JSON.parse(s); } catch (_) { return {}; } }); }
}
class Ctx {
  constructor() { this.storage = new MockStorage(); this.sockets = { host: [], listener: [] }; }
  blockConcurrencyWhile(fn) { return fn(); }
  acceptWebSocket(ws, [role]) { this.sockets[role].push(ws); }
  getWebSockets(tag) { return this.sockets[tag] || []; }
  getTags(ws) { return [ws.role]; }
  waitUntil(p) { return p; }
}

async function makeRoom(env) {
  const ctx = new Ctx();
  const room = new Room(ctx, Object.assign({ LICENSE_SECRET: 'x' }, env || {}));
  await new Promise((r) => setTimeout(r, 0));
  room.initialized = true;
  room.code = '777777';
  room.licFlags = 0x04;
  room.fillLateLang = async () => {};
  room.logs = [];
  room.trLog = (s) => room.logs.push(s);
  room.calls = [];
  room.trFetch = async (body) => {
    room.calls.push({ target: body.target, q: body.q.slice() });
    return { res: { ok: true, status: 200, json: async () => ({ t: body.q.map((x) => body.target + ':' + x), tier: 'basic' }) } };
  };
  const host = new WS('host'); ctx.acceptWebSocket(host, ['host']);
  const add = async (lang, dev) => {
    const w = new WS('listener'); ctx.acceptWebSocket(w, ['listener']);
    await room.attJoin(w);
    await room.webSocketMessage(w, JSON.stringify({ hello: 1, lang, name: '', deviceId: dev }));
    return w;
  };
  return { ctx, room, host, add };
}
const live = (seq, text) => ({ seq, text, srcLang: 'ko', have: {} });
const bought = (room, lang) => room.calls.filter((c) => c.target === lang);

(async () => {
  const { room, add } = await makeRoom();
  const vi1 = await add('vi', 'd1');
  const vi2 = await add('vi', 'd2');
  const ne = await add('ne', 'd3');

  // ① 하나만 rp
  await room.webSocketMessage(vi1, JSON.stringify({ kind: 'tr_need', srv: 0 }));
  await room.roomTrFlush([live(1, '첫 줄')]);
  ok(bought(room, 'vi').length === 1 && bought(room, 'ne').length === 1, '① vi 손님 하나는 서버가 필요 — vi 들은 줄을 산다');

  // ② 둘 다 rp
  await room.webSocketMessage(vi2, JSON.stringify({ kind: 'tr_need', srv: 0 }));
  room.calls = [];
  await room.roomTrFlush([live(2, '둘째 줄')]);
  ok(bought(room, 'vi').length === 0, '② vi 손님 전부 레이팩 — vi 들은 줄을 사지 않는다');
  ok(bought(room, 'ne').length === 1, '② ne(레이팩 아님)는 그대로 산다');
  ok(room.logs.some((l) => /^room_tr_skip lang=vi n=1 why=raypack/.test(l)), '② 기록 room_tr_skip lang=vi n=1 why=raypack');
  ok(room.logs.some((l) => /^room_tr_need srv=0 lang=vi/.test(l)), '② 기록 room_tr_need srv=0 lang=vi');

  // ③ 원고 줄은 산다
  room.calls = [];
  await room.roomTrFlush([{ script: 1, para: 3, text: '원고 문단', srcLang: 'ko', have: {} }, live(4, '넷째 줄')]);
  const v3 = bought(room, 'vi');
  ok(v3.length === 1 && v3[0].q.length === 1 && v3[0].q[0] === '원고 문단', '③ 원고 줄은 rp 여도 산다 · 같은 묶음의 들은 줄은 뺀다');

  // ④ 놓친 줄 구조
  room.ringBuffer.push(JSON.stringify({ seq: 5, text: '다섯째 줄', broadcast: 1 }));
  room.calls = [];
  const before = vi2.all().filter((m) => m.seq === 5 && m.tr).length;
  await room.webSocketMessage(vi1, JSON.stringify({ kind: 'tr_need', srv: 1, seq: 5 }));
  await new Promise((r) => setTimeout(r, 10));
  const v4 = bought(room, 'vi');
  ok(v4.length === 1 && v4[0].q[0] === '다섯째 줄', '④ 놓친 줄(seq 5)만 vi 로 산다');
  ok(bought(room, 'ne').length === 0, '④ 다른 말은 사지 않는다');
  ok(vi1.all().some((m) => m.seq === 5 && m.tr && m.tr.vi === 'vi:다섯째 줄'), '④ vi 손님에게 그 줄 번역이 간다');
  ok(!ne.all().some((m) => m.seq === 5 && m.tr), '④ ne 손님에게는 안 간다');
  ok(vi2.all().filter((m) => m.seq === 5 && m.tr).length === before + 1, '④ 같은 말 손님도 같이 받는다(한 번 산 것)');
  // srv:1 뒤에는 vi 가 다시 「필요」 — 다음 들은 줄은 산다
  room.calls = [];
  await room.roomTrFlush([live(6, '여섯째 줄')]);
  ok(bought(room, 'vi').length === 1, '④ srv:1 보낸 손님이 있으면 다음 들은 줄은 vi 로 산다');

  // ⑤ P-14
  await room.webSocketMessage(vi1, JSON.stringify({ kind: 'tr_need', srv: 0, tr: { vi: 'x' } }));
  ok(vi1.attachment.rp === 0, '⑤ P-14 — 번역문 실린 tr_need 는 버린다(쪽지 그대로)');

  // ⑥ 거울
  const m = await makeRoom({ ROOM_TR_RPSKIP: '0' });
  const a = await m.add('vi', 'a');
  await m.room.webSocketMessage(a, JSON.stringify({ kind: 'tr_need', srv: 0 }));
  await m.room.roomTrFlush([live(1, '줄')]);
  ok(bought(m.room, 'vi').length === 1, '⑥ 되돌림 실증(D-09): ROOM_TR_RPSKIP=0 이면 레이팩 손님 말도 산다(옛 길)');

  console.log(`\n${n} passed`);
})().catch((e) => { console.error('[FAIL]', e && e.message ? e.message : e); process.exit(1); });
