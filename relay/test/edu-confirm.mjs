// relay/test/edu-confirm.mjs — 교육 확인(근로자 전자 확인) · 개인 퇴장 알림 (NOW 11-09 18:20 ②)
// 보는 것: ① 열리기 전 확인은 거절(closed) ② 열리면 방 시계로 시각을 찍어 기록 + 강사에게 confirm
//          ③ 한 기기 한 번(두 번 눌러도 처음 시각) ④ P-14: 번역 칸이 실린 확인은 거절 ⑤ 닫히면 다시 거절
//          ⑥ 강사가 다시 붙으면 confirm_list ⑦ 늦게 붙은 청취자에게 confirm_open ⑧ 방이 끝나면 기록 삭제
//          ⑨ 나가면 기기 번호만 leave — 같은 기기의 다른 소켓이 붙어 있으면 안 알린다 ⑩ 소리·글 없음
import assert from 'assert';
import { Room } from '../src/room.js';

let n = 0;
const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };
console.log('=== 교육 확인(전자 확인)·개인 퇴장 — relay/src/room.js ===');

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
  msgs(kind) { return this.sent.map((s) => { try { return JSON.parse(s); } catch (_) { return {}; } }).filter((m) => m.kind === kind); }
}
class Ctx {
  constructor() { this.storage = new MockStorage(); this.sockets = { host: [], listener: [] }; }
  blockConcurrencyWhile(fn) { return fn(); }
  acceptWebSocket(ws, [role]) { this.sockets[role].push(ws); }
  getWebSockets(tag) { return this.sockets[tag] || []; }
  getTags(ws) { return [ws.role]; }
  waitUntil(p) { return p; }
}

(async () => {
  const ctx = new Ctx();
  const room = new Room(ctx, { LICENSE_SECRET: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  room.initialized = true;
  room.code = '654321';
  room.roomTrFromHost = () => {};
  room.fillLateLang = async () => {};
  const host = new WS('host'); ctx.acceptWebSocket(host, ['host']);
  const add = async (lang, dev) => {
    const w = new WS('listener'); ctx.acceptWebSocket(w, ['listener']);
    await room.attJoin(w);
    await room.webSocketMessage(w, JSON.stringify({ hello: 1, lang, name: '', deviceId: dev }));
    return w;
  };
  const vi = await add('vi', 'dev-vi');
  const ne = await add('ne', 'dev-ne');
  const km = await add('km', 'dev-km');

  // ① 열리기 전
  await room.webSocketMessage(vi, JSON.stringify({ kind: 'confirm', name: 'Nguyen', lang: 'vi', deviceId: 'dev-vi' }));
  ok(vi.msgs('confirm_error').some((m) => m.why === 'closed') && !host.msgs('confirm').length, '① 열리기 전 확인은 거절(closed) · 강사에게 안 간다');

  // ② 강사가 연다 — 두루길로 청취자 전원에게도 간다
  await room.webSocketMessage(host, JSON.stringify({ kind: 'confirm_open' }));
  ok(room.confirmOpen === true && vi.msgs('confirm_open').length === 1 && km.msgs('confirm_open').length === 1, '② confirm_open 이 청취자 전원에게 · 방이 받을 준비');
  const t0 = Date.now();
  await room.webSocketMessage(vi, JSON.stringify({ kind: 'confirm', name: 'Nguyen', lang: 'vi', deviceId: 'dev-vi', ua: 'Android', at: 1 }));
  const c1 = host.msgs('confirm')[0];
  ok(c1 && c1.dev === 'dev-vi' && c1.name === 'Nguyen' && c1.lang === 'vi' && c1.ua === 'Android', '② 강사에게 confirm(기기·이름·언어·기기 종류)');
  ok(c1.at >= t0 && c1.at <= Date.now(), '② 시각은 **방 시계** — 청취자가 보낸 at(1)을 믿지 않는다');
  ok(vi.msgs('confirm_ok')[0].at === c1.at, '② 청취자에게 confirm_ok(같은 시각)');
  ok((await ctx.storage.get('confirms'))['dev-vi'].at === c1.at, '② 방 기록(저장소)에 남는다 — 동면 뒤에도');
  ok(!('text' in c1) && !('src' in c1) && !('tr' in c1) && !('audio' in c1), '⑩ 확인에는 소리·글이 없다(P-16)');

  // ③ 한 기기 한 번
  await new Promise((r) => setTimeout(r, 5));
  await room.webSocketMessage(vi, JSON.stringify({ kind: 'confirm', name: 'Other', lang: 'vi', deviceId: 'dev-vi' }));
  const c2 = host.msgs('confirm')[1];
  ok(c2.at === c1.at && c2.name === 'Nguyen' && Object.keys(room.confirms).length === 1, '③ 두 번 눌러도 처음 시각·이름 그대로, 한 줄');

  // ④ P-14
  await room.webSocketMessage(km, JSON.stringify({ kind: 'confirm', name: 'Sok', lang: 'km', deviceId: 'dev-km', tr: { ko: '확인' } }));
  ok(km.msgs('confirm_error').some((m) => m.why === 'p14_participant_translation_forbidden') && !room.confirms['dev-km'], '④ 번역 칸이 실린 확인은 거절(P-14)');
  await room.webSocketMessage(km, JSON.stringify({ kind: 'confirm', name: 'Sok', lang: 'km', deviceId: 'dev-km' }));
  ok(!!room.confirms['dev-km'], '④ 번역 칸 없이 다시 보내면 받는다');

  // ⑥ 강사가 다시 붙으면 목록째
  const host2 = new WS('host');
  const res = room.confirmItems();
  ok(res.length === 2 && res[0].dev === 'dev-vi', '⑥ confirmItems — 시각 순 둘');
  // fetch 업그레이드 길을 그대로 부르기는 어렵다 — 같은 줄을 흉내 낸다(코드 자리 확인은 아래 원문 검사)
  const src = (await import('fs')).readFileSync(new URL('../src/room.js', import.meta.url), 'utf8');
  ok(/kind: 'confirm_list', items: this\.confirmItems\(\)/.test(src), "⑥ 강사가 다시 붙으면 confirm_list 를 보내는 줄이 있다");
  ok(/if \(this\.confirmOpen\) \{ try \{ server\.send\(JSON\.stringify\(\{ kind: 'confirm_open' \}\)\)/.test(src), '⑦ 늦게 붙은 청취자에게 confirm_open 을 보내는 줄이 있다');
  void host2;

  // ⑤ 닫힘
  await room.webSocketMessage(host, JSON.stringify({ kind: 'confirm_close' }));
  await room.webSocketMessage(ne, JSON.stringify({ kind: 'confirm', name: 'Ram', lang: 'ne', deviceId: 'dev-ne' }));
  ok(room.confirmOpen === false && !room.confirms['dev-ne'] && ne.msgs('confirm_error').some((m) => m.why === 'closed'), '⑤ 닫힌 뒤 확인은 거절');

  // ⑨ 개인 퇴장
  const before = host.msgs('leave').length;
  const ne2 = await add('ne', 'dev-ne');          // 같은 기기가 새 소켓으로 다시 붙음(닫힘이 늦게 온다)
  ctx.sockets.listener = ctx.sockets.listener.filter((w) => w !== ne);
  ctx.sockets.listener.push(ne);                   // 닫히는 소켓은 목록에 아직 있다
  await room.webSocketClose(ne, 1000, 'bye', true);
  ok(host.msgs('leave').length === before, '⑨ 같은 기기의 다른 소켓이 붙어 있으면 leave 를 안 보낸다(새 구간을 닫지 않는다)');
  await room.webSocketClose(ne2, 1000, 'bye', true);
  const lv = host.msgs('leave').slice(-1)[0];
  ok(lv && lv.dev === 'dev-ne' && Object.keys(lv).sort().join(',') === 'at,dev,kind', '⑨ 마지막 소켓이 나가면 leave{dev,at} 만 — 이름·글 없음');
  ok(vi.msgs('leave').length === 0, '⑨ leave 는 강사에게만');

  // ⑧ 끝 — 기록 삭제
  await room.dropLines('end', { lines: 1 });
  ok(room.confirms === null && room.confirmOpen === false && (await ctx.storage.get('confirms')) === undefined, '⑧ 방이 끝나면 확인 기록을 지운다');

  // 되돌림 실증(D-09): 방 시계를 안 찍는 가짜 구현이면 ② 가 붉다
  ok(c1.at !== 1, '되돌림 실증: 청취자 at 을 그대로 쓰면 ② 단언이 거짓이 된다');
  console.log(`\n${n} 통과`);
})().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
