// relay/test/script-forward.mjs — L4-2: Room 이 script·skip·break 를 그대로 중계하는지(저장은 링버퍼 규칙 그대로),
// script 가 무음 판정의 "새 줄"로 세어지는지. wrangler 없이 가짜 ctx 로 Room 클래스를 바로 돌린다.
// 실행(relay 디렉터리): node test/script-forward.mjs   또는  npm run test:script
import assert from 'node:assert';
import { Room } from '../src/room.js';

let pass = 0;
function ok(c, d) { assert(c, d); pass++; console.log('  [PASS] ' + d); }

class FakeWs {
  constructor(tag) { this.tag = tag; this.sent = []; this.att = null; }
  send(m) { this.sent.push(typeof m === 'string' ? m : new TextDecoder().decode(m)); }
  serializeAttachment(a) { this.att = a; }
  deserializeAttachment() { return this.att; }
  close() {}
}

function fakeCtx(sockets) {
  const store = new Map();
  let alarm = null;
  return {
    alarmAt: () => alarm,
    storage: {
      get: async (k) => Array.isArray(k) ? new Map(k.map(x => [x, store.get(x)])) : store.get(k),
      put: async (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) store.set(a, b); else store.set(k, v); },
      delete: async (k) => store.delete(k),
      setAlarm: async (t) => { alarm = t; },
      deleteAlarm: async () => { alarm = null; },
      list: async () => new Map()
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: (tag) => sockets.filter(s => !tag || s.tag === tag),
    getTags: (ws) => [ws.tag],
    waitUntil: () => {},
    acceptWebSocket: () => {},
    setWebSocketAutoResponse: () => {}
  };
}

(async () => {
  console.log('=== relay Room: script·skip·break 중계 시험 ===');
  const host = new FakeWs('host');
  const l1 = new FakeWs('listener');
  const l2 = new FakeWs('listener');
  const ctx = fakeCtx([host, l1, l2]);
  const room = new Room(ctx, {});
  await room.fetch(new Request('http://internal/init', { method: 'POST', body: JSON.stringify({ code: 'ABC123', host_token: 't', kind: 'script' }) }));
  const alarm0 = ctx.alarmAt();

  // 무음 판정 시각을 뒤로 돌려 둔다 — script 가 새 줄이면 앞으로 당겨져야 한다
  room.lastLineAt = Date.now() - 5 * 60 * 1000;
  const before = room.lastLineAt;

  const script = JSON.stringify({ kind: 'script', para: 1, total: 3, src: '안전 교육을 시작하겠습니다.', srcLang: 'ko', trans: { en: 'Let us begin.' }, at: 1759800000000 });
  const skip = JSON.stringify({ kind: 'skip', para: 2 });
  const brk = JSON.stringify({ kind: 'break', on: true });
  await room.webSocketMessage(host, script);
  await room.webSocketMessage(host, skip);
  await room.webSocketMessage(host, brk);

  ok(l1.sent.join('\n') === [script, skip, brk].join('\n'), '청취자 1: script·skip·break 세 줄을 글자 그대로(해석·변형 없음)');
  ok(l2.sent.join('\n') === l1.sent.join('\n'), '청취자 2: 같은 세 줄');
  ok(host.sent.length === 0, '호스트에게 되돌려 보내지 않는다');
  ok(room.ringBuffer.length === 3 && room.ringBuffer[0] === script, '링버퍼 = 기존 줄 규칙 그대로(세 줄, 따로 저장 없음)');
  ok(room.lastLineAt > before, 'script 는 새 줄 — 무음 판정 시각이 당겨진다');
  ok(ctx.alarmAt() !== alarm0 && ctx.alarmAt() >= room.lastLineAt, 'script 뒤 무음 경고 알람을 다시 건다');

  const t2 = room.lastLineAt;
  await room.webSocketMessage(host, JSON.stringify({ kind: 'break', on: false }));
  ok(room.lastLineAt === t2, 'break 는 새 줄이 아니다(무음 판정 그대로)');

  // 청취자 hello.name 은 집계에 안 쓴다 — 언어만
  await room.attJoin(l1);
  await room.webSocketMessage(l1, JSON.stringify({ hello: 1, room: 'ABC123', lang: 'en', name: '홍길동' }));
  const att = room.attSnapshot();
  ok(att.langs.en && att.langs.en.now === 1, 'hello 의 lang 만 집계(en 1)');
  ok(!JSON.stringify(room.att).includes('홍길동'), '이름은 서버에 남지 않는다');
  ok(host.sent.some(s => s.includes('"hello"') && s.includes('홍길동')), 'hello 는 호스트에게 그대로 간다(진행자 화면용)');

  console.log(`\n전부 통과 (${pass}건)`);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
