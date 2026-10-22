/* relay/test/room-translate.mjs — **방이 번역한다** (NOW B 3)
 * 설계: docs/design/room-translate.md · 기준: 결정장부 51·43 · RULE: P-16
 *
 * 무엇을 보는가: 강사가 **원문만** 보냈을 때, 방이 손님 언어마다 **한 번씩** 번역해서
 * **그 언어 손님에게만** 보내는가. 그리고 **안 될 때 안 된다고 보내는가** — 그것을
 * 안 보내면 손님 화면은 영원히 「번역 대기 중」이다.
 *
 * 가짜는 운영보다 **느슨하면 안 된다**(D-11): 아래 가짜 `/translate` 는 운영과 같이
 * `q` 가 배열이 아니면 400 이고, 답은 `{ t: [...] }` 뿐이다. 10-20 에 느슨한 가짜 둘이
 * 사전 번역을 **운영에서 한 번도 안 되게** 두었다.
 *
 * 돌리기: node relay/test/room-translate.mjs
 */
import assert from 'assert';
import { Room } from '../src/room.js';
import fs from 'fs';
import * as RTR from '../src/room-translate.js';

console.log('=== 방이 번역한다 (room_tr · B 3) ===');
let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) { const m = new Map(); k.forEach((x) => m.set(x, this.map.get(x))); return m; }
    return this.map.get(k);
  }
  async put(k, v) { if (typeof k === 'object') { for (const [a, b] of Object.entries(k)) this.map.set(a, b); } else this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
  async setAlarm() {}
}

/** 손님 소켓 가짜 — 언어 한 칸(attachment)과 받은 것을 들고 있다. 운영과 같은 모양이다. */
function listener(lang) {
  const got = [];
  return {
    got,
    att: { lang, at: Date.now() },
    send(s) { got.push(JSON.parse(s)); },
    serializeAttachment(v) { this.att = v; },
    deserializeAttachment() { return this.att; }
  };
}

/** 가짜 `/translate` — 운영 규약을 **그대로** 지킨다(배열만·`{t:[]}` 만) */
function makeEnv(mode, listeners) {
  const calls = [];
  return {
    calls,
    env: {
      LICENSE_SECRET: SECRET,
      RELAY_BASE_URL: 'https://relay.test',
      SELF: {
        async fetch(req) {
          const body = await req.json();
          calls.push({ target: body.target, q: body.q, engine: body.engine, auth: req.headers.get('Authorization') });
          if (!Array.isArray(body.q)) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 });
          if (mode === 'fail') return new Response(JSON.stringify({ error: 'upstream' }), { status: 502 });
          if (mode === 'empty') return new Response(JSON.stringify({ t: [] }), { status: 200 });
          if (mode === 'null') return new Response(JSON.stringify({ t: null }), { status: 200 });
          return new Response(JSON.stringify({ t: body.q.map((x) => `[${body.target}] ${x}`) }), { status: 200 });
        }
      }
    }
  };
}

function makeRoom(langs, mode = 'ok', extraEnv = {}) {
  const ls = langs.map(listener);
  const hostWs = listener(null);                 // 강사 소켓 — 실패 알림을 받는 자리(B 5)
  const { env, calls } = makeEnv(mode, ls);
  const ctx = {
    storage: new MockStorage(),
    getTags: () => ['host'],
    blockConcurrencyWhile: async (fn) => await fn(),
    getWebSockets: (tag) => (tag === 'listener' ? ls : tag === 'host' ? [hostWs] : [...ls, hostWs])
  };
  const room = new Room(ctx, { ...env, ...extraEnv });
  room.sub = 'room_tr_user';
  room.licFlags = 0x10;                 // 인터넷 번역 패키지를 산 라이선스로 만든 방
  room.att = { joined: ls.length, max: ls.length, langs: {} };
  return { room, ls, calls, hostWs };
}

const lineOf = (seq, text) => ({ seq, text, srcLang: 'ko' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ① 언어 3개 → 부르기 **3회**. 사람 수가 아니라 **언어 수**다 */
{
  const { room, ls, calls } = makeRoom(['en', 'ja', 'en', 'en', 'zh-CN']);
  room.roomTrFromHost(lineOf(1, '안전 제일'));
  await wait(RTR.BATCH_MS + 60);
  ok(calls.length === 3, `언어 3개 → ${calls.length}회 부른다 (손님 5명)`);
  ok(calls.every((c) => c.engine === 'basic'), '엔진은 basic 고정 — 프로(돈)를 이 길에서 쓰지 않는다');
  ok(calls.every((c) => (c.auth || '').startsWith('Bearer ')), '방이 만든 짧은 토큰으로 부른다 (RULE: P-16)');
  const enGot = ls[0].got;
  ok(enGot.length === 1 && enGot[0].seq === 1 && enGot[0].tr && enGot[0].tr.en === '[en] 안전 제일',
     `en 손님은 en 번역만 받는다 (${JSON.stringify(enGot[0])})`);
  ok(ls[1].got[0].tr.ja === '[ja] 안전 제일', 'ja 손님은 ja 번역을 받는다');
  ok(ls[4].got[0].tr['zh-CN'] === '[zh-CN] 안전 제일',
     'zh-CN 손님의 칸 이름이 **그대로** 다 — 소문자로 바꾸면 그 손님은 원문만 본다(10-19)');
  ok(!('zh-cn' in ls[4].got[0].tr), 'zh-cn 처럼 다른 글자로 보내지 않는다');
}

/* ② 원문과 같은 언어·모름(`?`)은 **부르지 않는다** */
{
  const { room, ls, calls } = makeRoom(['ko', '?', 'en']);
  room.roomTrFromHost(lineOf(2, '안녕하세요'));
  await wait(RTR.BATCH_MS + 60);
  ok(calls.length === 1 && calls[0].target === 'en',
     `원문 언어(ko)와 모름(?)은 부르지 않는다 — ${calls.length}회 (${calls.map((c) => c.target).join(',')})`);
  ok(ls[0].got.length === 0 && ls[1].got.length === 0, '그 둘에게는 아무것도 보내지 않는다');
}

/* ③ 상류가 죽으면 **안 된다고 보낸다** — 「대기 중」에 갇히지 않게 */
{
  const { room, ls } = makeRoom(['en'], 'fail');
  room.roomTrFromHost(lineOf(3, '불이 났습니다'));
  await wait(RTR.BATCH_MS + 60);
  ok(ls[0].got.length === 1 && ls[0].got[0].no_tr === 1 && ls[0].got[0].seq === 3,
     `실패해도 no_tr 이 간다 (${JSON.stringify(ls[0].got[0])})`);
  ok(/^http_502|fetch_error$/.test(String(ls[0].got[0].why)), `까닭을 적는다 (why=${ls[0].got[0].why})`);
}

/* ①-2 기록에 **방 코드**가 붙는다 — 방이 여럿 돌면 `wrangler tail` 에서 가릴 수 없다 */
{
  const { room } = makeRoom(['en']);
  room.code = 'ABC123';
  const said = [];
  const real = console.log;
  console.log = (...a) => { said.push(a.join(' ')); };
  try {
    room.roomTrFromHost(lineOf(61, '방 코드'));
    await wait(RTR.BATCH_MS + 60);
  } finally { console.log = real; }
  const line = said.find((l) => /room_tr lang=en/.test(l));
  ok(line && line.startsWith('[ABC123] '),
     `기록 앞에 방 코드가 붙는다 ("${line}") — 대표님이 tail 에서 어느 방인지 가린다`);
  const bare = said.filter((l) => /room_tr/.test(l) && !/^\[/.test(l));
  ok(bare.length === 0, `코드 없는 줄이 없다 (${bare.length}개) — 적는 곳이 한 함수다(§4)`);
}

/* ③-2 강사에게도 **알린다** — 손님은 「번역 안 됨」을 봐도 할 수 있는 일이 없고 강사는 있다 */
{
  const { room, hostWs } = makeRoom(['en'], 'fail');
  room.roomTrFromHost(lineOf(31, '강사도 알아야 한다'));
  await wait(RTR.BATCH_MS + 60);
  const m = hostWs.got.find((x) => x.kind === 'tr_fail');
  ok(m && m.lang === 'en' && /^http_502|fetch_error$/.test(String(m.why)) && m.seq === 31,
     `실패를 강사 화면에 알린다 (${JSON.stringify(m)}) — 조용히 넘기면 강사는 되고 있다고 믿는다`);
}

/* ③-3 같은 언어가 또 실패해도 **한 번만** 알린다. 되살아나면 **그것도 알린다** (10-21) */
{
  const ls = ['en'].map(listener);
  const hostWs = listener(null);
  let mode = 'fail';
  const calls = [];
  const env = {
    LICENSE_SECRET: SECRET, RELAY_BASE_URL: 'https://relay.test',
    SELF: { async fetch(req) {
      const b = await req.json();
      calls.push(b.target);
      if (mode === 'fail') return new Response(JSON.stringify({ error: 'upstream' }), { status: 502 });
      return new Response(JSON.stringify({ t: b.q.map((x) => `[${b.target}] ${x}`) }), { status: 200 });
    } }
  };
  const room = new Room({
    storage: new MockStorage(), getTags: () => ['host'],
    blockConcurrencyWhile: async (fn) => await fn(),
    getWebSockets: (tag) => (tag === 'listener' ? ls : tag === 'host' ? [hostWs] : [...ls, hostWs])
  }, env);
  room.sub = 'state_user'; room.licFlags = 0x10; room.att = { joined: 1, max: 1, langs: {} };

  room.roomTrFromHost(lineOf(41, '첫 실패'));
  await wait(RTR.BATCH_MS + 60);
  room.roomTrFromHost(lineOf(42, '또 실패'));
  await wait(RTR.BATCH_MS + 60);
  const fails = hostWs.got.filter((m) => m.kind === 'tr_fail' && !m.ok);
  ok(fails.length === 1, `두 번 실패해도 알림은 **한 번**이다 (${fails.length}번) — 줄마다 보내면 화면이 덮인다`);

  mode = 'ok';
  room.roomTrFromHost(lineOf(43, '되살아났다'));
  await wait(RTR.BATCH_MS + 60);
  const oks = hostWs.got.filter((m) => m.kind === 'tr_fail' && m.ok === 1);
  ok(oks.length === 1 && oks[0].lang === 'en',
     `되살아나면 **그것도 알린다** (${JSON.stringify(oks)}) — 안 알리면 그 띠는 거짓이 된다`);
  room.roomTrFromHost(lineOf(44, '계속 된다'));
  await wait(RTR.BATCH_MS + 60);
  ok(hostWs.got.filter((m) => m.kind === 'tr_fail').length === 2,
     '잘 되는 동안은 **한 줄도 더 보내지 않는다** (상태가 바뀔 때만 보낸다)');
}

/* ③-4 언어 상한에 닿으면 강사 화면에도 알린다 — 기록만 남기면 강사는 모른다(§20) */
{
  const many = Array.from({ length: RTR.MAX_LANGS + 3 }, (_, i) => 'l' + i);
  const { room, hostWs } = makeRoom(many);
  room.roomTrFromHost(lineOf(51, '상한'));
  await wait(RTR.BATCH_MS + 400);
  const cap = hostWs.got.find((m) => m.kind === 'tr_cap');
  ok(cap && cap.n === RTR.MAX_LANGS && cap.dropped === 3,
     `상한을 강사 화면에 알린다 (${JSON.stringify(cap)}) — 그 언어 손님은 원문만 본다`);
}

/* ④ **빈 답**은 답이 아니다(§20) — `{t:[]}` · `{t:null}` 둘 다 no_tr */
for (const mode of ['empty', 'null']) {
  const { room, ls } = makeRoom(['en'], mode);
  room.roomTrFromHost(lineOf(4, '빈 답'));
  await wait(RTR.BATCH_MS + 60);
  ok(ls[0].got.length === 1 && ls[0].got[0].no_tr === 1,
     `${mode}: 빈 답을 "번역 없음"으로 조용히 넘기지 않는다 (${JSON.stringify(ls[0].got[0])})`);
}

/* ⑤ 원고 문단은 `script_tr` + `para` 로 짝을 맞춘다 (seq 가 없다) */
{
  const { room, ls } = makeRoom(['en']);
  room.roomTrFromHost({ kind: 'script', para: 7, total: 40, src: '첫 문단입니다', srcLang: 'ko' });
  await wait(RTR.BATCH_MS + 60);
  const m = ls[0].got[0];
  ok(m && m.kind === 'script_tr' && m.para === 7 && m.trans.en === '[en] 첫 문단입니다',
     `원고 문단은 script_tr/para 로 간다 (${JSON.stringify(m)})`);
}

/* ⑥ 중간 인식 결과(pending)는 **번역하지 않는다** (RULE: P-03) */
{
  const { room, calls } = makeRoom(['en']);
  room.roomTrFromHost({ seq: 9, text: '중간 결과', pending: 1, srcLang: 'ko' });
  room.roomTrFromHost({ kind: 'skip', para: 3 });
  room.roomTrFromHost({ end: 1 });
  await wait(RTR.BATCH_MS + 60);
  ok(calls.length === 0, `pending·skip·end 는 부르지 않는다 (${calls.length}회)`);
}

/* ⑦ 묶기 — 250ms 안에 들어온 줄은 **한 번에** 간다 */
{
  const { room, ls, calls } = makeRoom(['en']);
  room.roomTrFromHost(lineOf(11, '하나'));
  room.roomTrFromHost(lineOf(12, '둘'));
  room.roomTrFromHost(lineOf(13, '셋'));
  await wait(RTR.BATCH_MS + 80);
  ok(calls.length === 1 && calls[0].q.length === 3, `세 줄이 한 번에 간다 (${calls.length}회 · ${calls[0].q.length}개)`);
  ok(ls[0].got.length === 3 && ls[0].got[2].seq === 13, '손님은 줄마다 하나씩 받는다 (짝이 맞다)');
}

/* ⑧ 언어 수 상한 — 막고 **알린다**(§20). 조용히 자르지 않는다 */
{
  const many = Array.from({ length: RTR.MAX_LANGS + 5 }, (_, i) => 'l' + i);
  const picked = RTR.pickLangs(many, 'ko');
  ok(picked.langs.length === RTR.MAX_LANGS && picked.capped === 5,
     `언어 ${many.length}개면 ${RTR.MAX_LANGS}개만 부르고 ${picked.capped}개를 **세어 둔다**`);
}

/* ⑨ 되돌림 실증 (D-09) — 스위치를 끄면 **번역이 사라진다** */
{
  const { room, ls, calls } = makeRoom(['en'], 'ok', { ROOM_TR: '0' });
  room.roomTrFromHost(lineOf(21, '스위치 끔'));
  await wait(RTR.BATCH_MS + 60);
  ok(calls.length === 0 && ls[0].got.length === 0,
     'ROOM_TR=0 이면 부르지도 보내지도 않는다 — 위 초록이 이 코드에서 온 것이다 (되돌림 실증)');
}

/* ⑩ 되돌림 실증 ② — 깃발(0x10)이 없는 라이선스로 만든 방은 번역하지 않는다 */
{
  const { room, calls } = makeRoom(['en']);
  room.licFlags = 0x01;            // 호스트 코드만 산 방
  room.roomTrFromHost(lineOf(22, '깃발 없음'));
  await wait(RTR.BATCH_MS + 60);
  ok(calls.length === 0, '인터넷 번역 패키지를 안 산 방은 부르지 않는다 — 문을 여는 것은 라이선스다 (되돌림 실증 ②)');
}

/* ⑪ 길이 없으면(주소도 없고 묶음도 없다) **조용하지 않다** — no_tr 을 보낸다 */
{
  const { room, ls } = makeRoom(['en']);
  room.env = { LICENSE_SECRET: SECRET };      // SELF·RELAY_BASE_URL 둘 다 없다
  room.roomTrFromHost(lineOf(23, '길 없음'));
  await wait(RTR.BATCH_MS + 60);
  ok(ls[0].got.length === 1 && ls[0].got[0].no_tr === 1 && ls[0].got[0].why === 'no_route',
     `부를 길이 없으면 까닭과 함께 no_tr (${JSON.stringify(ls[0].got[0])})`);
}

/* ───────────── 미리 번역은 **선택** (NOW B 4) ───────────── */

const SRC = (n, from = 1) => ({
  kind: 'script_src', srcLang: 'ko', total: n,
  paras: Array.from({ length: n - from + 1 }, (_, i) => ({ para: from + i, src: '문단 ' + (from + i) }))
});

/* ⑫ 원고를 올려도 **번역을 부르지 않는다** — 보관은 공짜, 번역은 돈 */
{
  const { room, calls } = makeRoom(['en', 'ja']);
  room.roomTrFromHost(SRC(40));
  await wait(RTR.BATCH_MS + 60);
  ok(calls.length === 0, `원고 40문단을 올려도 부르지 않는다 (${calls.length}회) — 통째로 미리 하면 언어 30개에 720회다`);
  ok(room.script && room.script.paras.size === 40 && room.script.total === 40,
     `원문은 보관한다 (${room.script.paras.size}문단)`);
}

/* ⑬ 원고에 번역문이 섞여 오면 **그 칸만 버리고 센다** — 원고는 올라간다(R-15) */
{
  const { room } = makeRoom(['en']);
  const msg = SRC(3);
  msg.paras[1].trans = { en: 'paragraph two' };          // 결정장부 43 위반 칸
  room.roomTrFromHost(msg);
  await wait(50);
  ok(room.script.paras.size === 3, '번역문이 섞여도 원고 세 문단이 다 올라간다 (통째로 버리면 손님이 아무것도 못 본다)');
  const got = RTR.scriptSrcOf(msg);
  ok(got.dropped === 1, `섞여 온 번역문을 **세어 둔다** (dropped=${got.dropped}) — 보내는 쪽을 고치게`);
  ok(!JSON.stringify(got.paras).includes('paragraph two'), '그 번역문은 방 안으로 들어오지 않는다');
}

/* ⑭ 「다음」을 누르면 **다음 문단이 미리** 된다. 그리고 그 문단을 넘길 때 **다시 사지 않는다** */
{
  const { room, ls, calls } = makeRoom(['en']);
  room.roomTrFromHost(SRC(5));
  room.roomTrFromHost({ kind: 'script', para: 1, total: 5, src: '문단 1', srcLang: 'ko' });
  await wait(RTR.BATCH_MS + 120);
  const first = calls.map((c) => c.q.join('/')).join(' | ');
  ok(calls.length === 2 && /문단 2/.test(first),
     `문단 1을 넘기면 **2번을 미리** 산다 (${calls.length}회: ${first})`);
  ok(ls[0].got.length === 1 && ls[0].got[0].para === 1,
     `손님에게는 1번만 갔다 (미리 산 2번은 쥐고 있는다) — ${JSON.stringify(ls[0].got)}`);

  const before = calls.length;
  room.roomTrFromHost({ kind: 'script', para: 2, total: 5, src: '문단 2', srcLang: 'ko' });
  await wait(RTR.BATCH_MS + 120);
  const added = calls.slice(before).map((c) => c.q.join('/'));
  ok(!added.some((q) => /문단 2$|^문단 2/.test(q)),
     `2번을 넘길 때 **다시 사지 않는다** (새로 부른 것: ${added.join(' | ') || '없음'}) — 미리 산 글자를 보낸다`);
  ok(ls[0].got.some((m) => m.para === 2 && m.trans && m.trans.en),
     `2번 번역이 **그 자리에서** 간다 (지연 0) — ${JSON.stringify(ls[0].got.filter((m) => m.para === 2))}`);
}

/* ⑮ 늦게 온 언어 — 방이 **지금 문단부터** 채운다. 지난 문단은 사지 않는다(돈) */
{
  const { room, calls } = makeRoom([]);
  room.roomTrFromHost(SRC(8));
  room.scriptCur = 6;
  await room.fillLateLang('vi');
  const asked = calls.filter((c) => c.target === 'vi').flatMap((c) => c.q);
  ok(asked.length === 3 && asked.join(',') === '문단 6,문단 7,문단 8',
     `지금 문단(6)부터 끝까지만 산다 (${asked.join(',') || '없음'}) — 지난 5문단은 사지 않는다`);
  const n1 = calls.length;
  await room.fillLateLang('vi');
  ok(calls.length === n1, '같은 언어를 두 번 채우지 않는다');

  /* 사 둔 것은 **쥐고 있다가** 그 문단이 갈 때 따라간다 — 아직 안 온 문단에 보내면
     손님 화면에 붙을 자리가 없어 조용히 버려진다 */
  const late = listener('vi');
  room.ctx.getWebSockets = (tag) => (tag === 'listener' ? [late] : []);
  room.roomTrFromHost({ kind: 'script', para: 7, total: 8, src: '문단 7', srcLang: 'ko' });
  await wait(RTR.BATCH_MS + 120);
  ok(calls.length === n1, `그 문단을 넘길 때 **다시 사지 않는다** (${calls.length}회 그대로)`);
  ok(late.got.some((m) => m.para === 7 && m.trans && m.trans.vi === '[vi] 문단 7'),
     `쥐고 있던 번역이 그 자리에서 간다 (${JSON.stringify(late.got)})`);
}

/* �⑯ 늦은 언어 규칙이 **정본 사례와 같은 답**을 내는가 (앱·웹·방 셋이 같은 표를 본다, D-75) */
{
  const cases = JSON.parse(fs.readFileSync(new URL('../../samples/script-follow-cases.json', import.meta.url), 'utf-8'));
  const late = cases.late;
  let same = 0;
  for (const c of late.cases) {
    const got = JSON.stringify(RTR.latePlan({ total: c.total, cur: c.cur, have: c.have, batch: late.batch }));
    if (got === JSON.stringify(c.want)) same += 1;
    else console.log(`    [다름] ${c.name}: ${got}`);
  }
  for (const c of late.newLangs) {
    const got = JSON.stringify(RTR.newLangs(c.prev, c.now, c.srcLang));
    if (got === JSON.stringify(c.want)) same += 1;
    else console.log(`    [다름] ${c.name}: ${got}`);
  }
  const want = late.cases.length + late.newLangs.length;
  ok(same === want, `정본 사례 ${want}건과 **같은 답**을 낸다 (${same}/${want}) — 규칙을 새로 쓰지 않고 옮겼다`);
  ok(RTR.LATE_BATCH === late.batch, `한 묶음 크기가 정본과 같다 (${RTR.LATE_BATCH} = ${late.batch})`);
}

/* ⑰ 되돌림 실증 ③ — 미리 하기를 끄면 "미리 돼 있다"가 사라진다 */
{
  const { room, calls } = makeRoom(['en']);
  const keep = RTR.PREFETCH;
  room.prefetchNext = function (para) {                 // PREFETCH = 0 과 같은 자리
    if (!0 || !this.script) return;
  };
  room.roomTrFromHost(SRC(5));
  room.roomTrFromHost({ kind: 'script', para: 1, total: 5, src: '문단 1', srcLang: 'ko' });
  await wait(RTR.BATCH_MS + 120);
  ok(calls.length === 1 && keep === 1,
     `미리 하기를 끄면 부르는 횟수가 2 → ${calls.length} 로 줄는다 (되돌림 실증 ③)`);
}

/* ⑱ 손님 질문도 **각자 자기 언어로** (정본 §3 4단계) ─────────────────────────
 *
 * 10-21 까지 질문은 **원문만** 뿌려졌다. 그리고 청취 페이지는 정본 §2 ③ 뒤로 **내 언어만**
 * 보여 주므로, 번역이 없는 질문은 손님 화면에 **빈 줄**로 떨어진다 — 쓰는 곳(뿌리기)만
 * 만들고 읽는 곳(손님 화면)을 안 센 자리다(§4). */
{
  console.log('\n[18] 손님 질문 — 방이 각자 언어로 번역해 보낸다');
  const { room, ls, calls } = makeRoom(['en', 'vi', 'ko']);
  room.roomTrAsk({ id: 'ask_7', text: '이 기능은 오프라인에서도 되나요?', srcLang: 'ko' });
  await wait(60);

  const en = ls[0].got.filter((m) => m.kind === 'question_tr');
  const vi = ls[1].got.filter((m) => m.kind === 'question_tr');
  const ko = ls[2].got.filter((m) => m.kind === 'question_tr');
  ok(en.length === 1 && vi.length === 1, `en·vi 손님이 질문 번역을 받았다 (en ${en.length} · vi ${vi.length})`);
  ok(en[0].id === 'ask_7' && vi[0].id === 'ask_7',
     '번역이 **질문 id** 로 짝을 맞춘다 — 손님이 어느 질문에 붙일지 안다');
  ok(!!en[0].trans.en && !!vi[0].trans.vi && !en[0].trans.vi,
     '자기 언어 칸만 온다 — 남의 언어 번역문은 안 받는다(바이트도 돈이다)');
  ok(ko.length === 0, '말한 손님과 **같은 언어**는 번역하지 않는다 — 번역할 것이 없다');
  ok(calls.length === 2, `언어 수만큼만 샀다 (2회 — 사람 수가 아니다) ${calls.length}`);

  /* 질문 길이 원고 길에 섞이면 — 질문 7번 번역이 원고 7번 문단에 붙는다 */
  const asScript = ls[0].got.filter((m) => m.kind === 'script_tr');
  ok(asScript.length === 0, '질문이 `script_tr` 로 가지 않는다 — 원고 문단에 붙으면 글이 뒤바뀐다');
  ok(RTR.doneKey({ ask: '3', text: 'x' }, 'en') !== RTR.doneKey({ script: 1, para: 3 }, 'en'),
     `질문 3번과 원고 3번 문단의 이름이 다르다 (${RTR.doneKey({ ask: '3' }, 'en')} ≠ ${RTR.doneKey({ script: 1, para: 3 }, 'en')})`);
}

/* ⑲ 질문 — 안 되면 **안 된다고** 보낸다 · 빈 말은 사지 않는다 */
{
  console.log('\n[19] 질문 — 실패·빈 말 (§20 · R-15)');
  const bad = makeRoom(['en'], 'fail');
  bad.room.roomTrAsk({ id: 'ask_9', text: '안 되는 질문', srcLang: 'ko' });
  await wait(60);
  const no = bad.ls[0].got.filter((m) => m.kind === 'question_tr' && m.no_tr);
  ok(no.length === 1 && no[0].id === 'ask_9' && !!no[0].why,
     `번역이 깨지면 「안 됨」이 간다 (why=${no.length ? no[0].why : '-'}) — 안 보내면 「번역 중」에 갇힌다`);
  const failBand = bad.hostWs.got.filter((m) => m.kind === 'tr_fail');
  ok(failBand.length === 1, '강사 화면에도 알린다 — 조용히 넘기지 않는다(§20)');

  const blank = makeRoom(['en']);
  blank.room.roomTrAsk({ id: 'ask_10', text: '   ', srcLang: 'ko' });
  blank.room.roomTrAsk({ id: '', text: '아이디 없는 질문', srcLang: 'ko' });
  blank.room.roomTrAsk(null);
  await wait(60);
  ok(blank.calls.length === 0, `빈 말·id 없는 질문은 **사지 않는다** (${blank.calls.length}회) — 인식기는 빈 줄도 준다(§20)`);
  ok(blank.ls[0].got.length === 0, '그리고 손님에게 아무것도 안 간다 — 빈 줄이 화면에 떨어지지 않게');

  /* 스위치를 끈 방은 질문도 번역하지 않는다 — 원문은 이미 갔다(R-15) */
  const off = makeRoom(['en'], 'ok', { ROOM_TR: '0' });
  off.room.roomTrAsk({ id: 'ask_11', text: '꺼진 방의 질문', srcLang: 'ko' });
  await wait(60);
  ok(off.calls.length === 0, 'ROOM_TR=0 이면 질문도 안 산다 — 스위치는 한 곳이다');
}

/* ⑲-1 한 질문의 글자가 **두 번** 온다 — 손들 때 적은 글자, 지명 뒤 **말한 글자** ───
 *
 * 10-21 에 질문 번역을 넣자마자 생긴 자리다. 적어 두는 이름이 `q<id>` 뿐이면 두 번째가
 * "이미 샀다"로 걸러지고, 손님에게는 **손들 때 적은 글자의 번역**이 간다 — 말한 질문이
 * 아무에게도 안 가는 모양이다. 글자가 **같을** 때는 두 번 사지 않아야 한다(그게 표의 일). */
{
  console.log('\n[19-1] 한 질문, 글자 둘 (손들 때 → 말한 뒤)');
  const { room, ls, calls } = makeRoom(['th']);
  room.roomTrAsk({ id: 'ask_20', text: 'hand up', srcLang: 'en' });
  await wait(50);
  room.roomTrAsk({ id: 'ask_20', text: 'Can we use this offline?', srcLang: 'en' });
  await wait(50);
  const got = ls[0].got.filter((m) => m.kind === 'question_tr').map((m) => m.trans.th);
  ok(got.length === 2, `번역이 둘 다 갔다 (${got.length}건)`);
  ok(/Can we use this offline\?/.test(got[got.length - 1] || ''),
     `마지막에 간 것이 **말한 글자**다 ("${got[got.length - 1] || '없음'}")`);
  ok(calls.length === 2, `두 번 샀다 (${calls.length}회) — 글자가 다르니 당연하다`);

  /* 같은 글자가 또 오면 **사지 않는다** */
  room.roomTrAsk({ id: 'ask_20', text: 'Can we use this offline?', srcLang: 'en' });
  await wait(50);
  ok(calls.length === 2, `같은 글자가 또 오면 안 산다 (${calls.length}회 그대로) — 돈이다`);

  /* 되돌림 실증 — 이름에서 글자의 표를 빼면 두 번째가 **걸러진다** */
  const a = { ask: 'x', askRev: RTR.textRev('hand up'), text: 'hand up' };
  const b = { ask: 'x', askRev: RTR.textRev('말한 글자'), text: '말한 글자' };
  ok(RTR.doneKey(a, 'th') !== RTR.doneKey(b, 'th'),
     `같은 질문의 다른 글자는 **다른 이름**이다 (${RTR.doneKey(a, 'th')} ≠ ${RTR.doneKey(b, 'th')})`);
  const noRev = { ask: 'x', text: 'hand up' };
  const noRev2 = { ask: 'x', text: '말한 글자' };
  ok(RTR.doneKey(noRev, 'th') === RTR.doneKey(noRev2, 'th'),
     '글자의 표를 빼면 둘이 **같은 이름**이 된다 — 두 번째가 걸러진다 (되돌림 실증 ⑤)');
}

/* ⑳ 되돌림 실증 ④ — 질문 번역을 안 밀면 손님은 **빈 줄**을 본다 */
{
  const { room, ls } = makeRoom(['en']);
  room.roomTrAsk = function () { /* 10-21 이전의 모양: 원문만 뿌리고 끝 */ };
  room.roomTrAsk({ id: 'ask_12', text: '되돌린 질문', srcLang: 'ko' });
  await wait(60);
  ok(ls[0].got.length === 0,
     '질문 번역을 밀지 않게 되돌리면 en 손님에게 아무 번역도 안 온다 (되돌림 실증 ④)');
}

console.log(`\n[OK] ${pass}개 확인 — 방이 번역한다`);
