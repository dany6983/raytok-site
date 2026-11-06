// relay/test/server-mt.mjs — site NOW 11-01 11:40 「서버 번역(MADLAD-3B)」 엔진 칸
// 가짜 서버로 off·reverse·all × 정상·느림·5xx·빈 답 — 떨어지는 길(구글)과 기록(머리·몸·하루 호출 수).
// 배포하지 않는다 — 릴레이 배포는 대표님 손.
import assert from 'assert';
import http from 'http';
import relayApp from '../src/index.js';
import { Room } from '../src/room.js';
import { mintLicenseToken } from '../tools/mint-license.mjs';
import { callServerMt, serverMtWanted, serverMtMode, smtDayKey, isRunpod } from '../src/server-mt.js';

console.log('=== 릴레이 /translate 서버 번역(MADLAD-3B) 칸 시험 ===');
let pass = 0;
function ok(cond, desc) { assert(cond, desc); pass++; console.log('  [PASS] ' + desc); }

class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) { if (Array.isArray(k)) { const m = new Map(); k.forEach((x) => m.set(x, this.map.get(x))); return m; } return this.map.get(k); }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { this.map.delete(k); }
}
const storage = new MockStorage();
const room = new Room({ storage, getTags: () => [], blockConcurrencyWhile: async (fn) => fn(), getWebSockets: () => [] }, {});

// 가짜 구글
let googleCalls = 0;
const google = http.createServer((req, res) => {
  googleCalls++;
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const q = JSON.parse(b || '{}').q || [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { translations: q.map((t) => ({ translatedText: `[g] ${t}` })) } }));
  });
});
// 가짜 서버 번역 — 모드: ok | slow | 500 | empty | short | numbers
let smtMode = 'ok';
let smtCalls = 0;
let smtLastKey = null;
let smtLastBody = null;
const smt = http.createServer((req, res) => {
  smtCalls++;
  smtLastKey = req.headers['x-raytok-key'] || null;
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const body = JSON.parse(b || '{}');
    smtLastBody = body;
    const q = body.q || [];
    const send = (st, obj) => { if (res.writableEnded) return; res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (smtMode === 'slow') return setTimeout(() => send(200, { t: q.map((t) => `[s] ${t}`), engine: 'madlad3b', ms: 1 }), 1500);
    if (smtMode === '500') return send(503, { why: 'down' });
    if (smtMode === 'empty') return send(200, { t: [], engine: 'madlad3b', ms: 1 });
    if (smtMode === 'blank') return send(200, { t: q.map(() => ''), engine: 'madlad3b', ms: 1 });
    if (smtMode === 'numbers') return send(200, { t: q.map((t) => `[s] ${t} 999`), engine: 'madlad3b', ms: 1 });
    return send(200, { t: q.map((t) => `[s] ${t}`), engine: 'madlad3b', ms: 1 });
  });
});
await new Promise((r) => google.listen(0, r));
await new Promise((r) => smt.listen(0, r));

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const baseEnv = {
  LICENSE_SECRET: SECRET,
  GOOGLE_TRANSLATE_KEY: 'test_google_key',
  GOOGLE_TRANSLATE_URL: `http://127.0.0.1:${google.address().port}/language/translate/v2`,
  SERVER_MT_URL: `http://127.0.0.1:${smt.address().port}/translate`,
  SERVER_MT_KEY: 'test_smt_key',
  SERVER_MT_TIMEOUT_MS: '400',
  ROOM: { idFromName: (name) => ({ name }), get: () => ({ fetch: (req) => room.fetch(req) }) }
};
const ctx = { waitUntil: (p) => p };
const tok10 = mintLicenseToken({ sub: 'smt_user', days: 30, flags: 0x10, secret: SECRET });
const tok30 = mintLicenseToken({ sub: 'smt_user', days: 30, flags: 0x30, secret: SECRET });

let seq = 0;
async function tr(envExtra, { source = 'en', target = 'ko', token = tok10, text } = {}) {
  const t = text || `hello line ${++seq} ${Math.random().toString(36).slice(2, 7)}`.replace(/\d/g, 'x');
  googleCalls = 0; smtCalls = 0;
  const res = await relayApp.fetch(new Request('http://localhost/translate', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: [t], source, target })
  }), { ...baseEnv, ...envExtra }, ctx);
  const data = await res.json();
  return { res, data, text: t, mt: res.headers.get('X-RayTok-MT'), why: res.headers.get('X-RayTok-MT-Why') };
}

try {
  // ── A. off(기본) — 서버를 부르지 않고, 답 모양도 전과 같다 ──
  console.log('\n[A] off — 기본 꺼짐');
  ok(serverMtMode({}) === 'off', '모드 칸이 비면 off');
  ok(serverMtMode({ SERVER_MT_MODE: 'ON' }) === 'off', '표에 없는 값(ON)도 off — 모르는 것을 켬으로 읽지 않는다');
  for (const m of ['ok', 'slow', '500', 'empty']) {
    smtMode = m;
    const r = await tr({});
    ok(r.res.status === 200 && r.data.t[0] === `[g] ${r.text}` && smtCalls === 0 && googleCalls === 1,
       `off × ${m}: 서버 0회 · 구글 1회`);
    ok(r.mt === null && !('mt' in r.data) && !('mt_why' in r.data), `off × ${m}: 답에 mt 표시 없음(모양 그대로)`);
  }

  // ── B. reverse — X→ko 만 ──
  console.log('\n[B] reverse — X→ko 만');
  const R = { SERVER_MT_MODE: 'reverse' };
  smtMode = 'ok';
  let r = await tr(R);
  ok(r.data.t[0] === `[s] ${r.text}` && smtCalls === 1 && googleCalls === 0, 'reverse × 정상: en→ko 는 서버가 번역, 구글 0회');
  ok(r.mt === 'server' && r.data.mt === 'server' && r.why === null, 'reverse × 정상: X-RayTok-MT=server, why 없음');
  ok(smtLastKey === 'test_smt_key', '열쇠는 X-Raytok-Key 머리로 간다');
  ok(Array.isArray(smtLastBody.q) && smtLastBody.target === 'ko' && smtLastBody.source === 'en', '서버로 가는 몸은 {q,source,target}');
  r = await tr(R, { source: 'ko', target: 'en' });
  ok(smtCalls === 0 && googleCalls === 1 && r.mt === null, 'reverse: ko→en 은 대상 아님 — 서버 0회, 표시 없음');
  let fell500 = null;
  for (const [m, why] of [['slow', 'smt_slow'], ['500', 'smt_error'], ['empty', 'smt_empty']]) {
    smtMode = m;
    r = await tr(R);
    if (m === '500') fell500 = r;
    ok(r.res.status === 200 && r.data.t[0] === `[g] ${r.text}` && googleCalls === 1,
       `reverse × ${m}: 구글로 떨어져 손님은 번역을 받는다`);
    ok(r.mt === 'google' && r.why === why && r.data.mt_why === why, `reverse × ${m}: 기록 why=${why}`);
  }

  // ── C. all — 모든 짝 ──
  console.log('\n[C] all — 모든 짝');
  const A = { SERVER_MT_MODE: 'all' };
  smtMode = 'ok';
  r = await tr(A, { source: 'ko', target: 'vi' });
  ok(r.data.t[0] === `[s] ${r.text}` && googleCalls === 0, 'all × 정상: ko→vi 도 서버');
  for (const [m, why] of [['slow', 'smt_slow'], ['500', 'smt_error'], ['empty', 'smt_empty'], ['blank', 'smt_empty'], ['numbers', 'smt_numbers']]) {
    smtMode = m;
    r = await tr(A, { source: 'ko', target: 'vi' });
    ok(r.data.t[0] === `[g] ${r.text}` && r.why === why, `all × ${m}: 구글로 · why=${why}`);
  }

  // ── D. premium — 플래그가 정해져야만 연다 ──
  console.log('\n[D] premium — 이용권 플래그');
  smtMode = 'ok';
  r = await tr({ SERVER_MT_MODE: 'premium' }, { token: tok30 });
  ok(smtCalls === 0 && r.mt === null, 'premium 인데 SERVER_MT_FLAG 가 비면 아무에게도 안 열림');
  r = await tr({ SERVER_MT_MODE: 'premium', SERVER_MT_FLAG: '0x20' }, { token: tok10 });
  ok(smtCalls === 0, 'premium(0x20): 0x10 만 든 토큰은 대상 아님');
  r = await tr({ SERVER_MT_MODE: 'premium', SERVER_MT_FLAG: '0x20' }, { token: tok30 });
  ok(smtCalls === 1 && r.mt === 'server', 'premium(0x20): 0x20 든 토큰은 서버');
  ok(serverMtWanted({ env: { SERVER_MT_MODE: 'premium', SERVER_MT_FLAG: 'abc' }, flags: 0xff }) === false, '플래그 값이 숫자가 아니면 안 열림');

  // ── E. 주소·열쇠 없음 · 하루 상한 ──
  console.log('\n[E] 주소·열쇠 없음 · 하루 상한');
  r = await tr({ SERVER_MT_MODE: 'all', SERVER_MT_URL: '' });
  ok(r.data.t[0] === `[g] ${r.text}` && r.why === 'smt_no_url', '켰는데 주소가 없으면 구글 · why=smt_no_url');
  r = await tr({ SERVER_MT_MODE: 'all', SERVER_MT_KEY: '' });
  ok(r.data.t[0] === `[g] ${r.text}` && r.why === 'smt_no_key' && smtCalls === 0, '열쇠가 없으면 부르지 않음 · why=smt_no_key');
  const before = Number((await storage.get(smtDayKey())) || 0);
  ok(before > 0, `하루 호출 수가 쌓인다 (smt_calls 오늘 ${before})`);
  r = await tr({ SERVER_MT_MODE: 'all', SERVER_MT_DAILY_CAP: String(before) });
  ok(smtCalls === 0 && r.why === 'smt_cap' && r.data.t[0] === `[g] ${r.text}`, '하루 상한에 닿으면 부르지도 않고 구글 · why=smt_cap');
  r = await tr({ SERVER_MT_MODE: 'all', SERVER_MT_DAILY_CAP: String(before + 100) });
  ok(smtCalls === 1 && r.mt === 'server', '상한 아래면 다시 서버');

  // ── F. 단위: 기본 기다림 3초 · 빈 답(null) ──
  console.log('\n[F] 단위 — 기본 3초 · null 답');
  const t0 = Date.now();
  let why = null;
  try {
    await callServerMt({
      texts: ['a'], sourceLang: 'en', targetLang: 'ko',
      env: { SERVER_MT_URL: 'http://x/translate', SERVER_MT_KEY: 'k' },
      fetchImpl: (_u, o) => new Promise((_res, rej) => o.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }))
    });
  } catch (e) { why = e.why; }
  const waited = Date.now() - t0;
  ok(why === 'smt_slow' && waited >= 2900 && waited < 3600, `기본 한도는 3초 (${waited}ms 에 smt_slow)`);
  why = null;
  try {
    await callServerMt({ texts: ['a'], sourceLang: 'en', targetLang: 'ko', env: { SERVER_MT_URL: 'http://x', SERVER_MT_KEY: 'k' },
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => null }) });
  } catch (e) { why = e.why; }
  ok(why === 'smt_empty', 'null 답 → smt_empty (§20)');
  why = null;
  try {
    await callServerMt({ texts: ['x'.repeat(1001)], sourceLang: 'en', targetLang: 'ko', env: { SERVER_MT_URL: 'http://x', SERVER_MT_KEY: 'k' },
      fetchImpl: async () => { throw new Error('불렸으면 안 됨'); } });
  } catch (e) { why = e.why; }
  ok(why === 'smt_too_long', '한 줄 1000자 넘으면 부르지 않고 smt_too_long');
  let batches = 0;
  const big = Array.from({ length: 40 }, (_, i) => `l${'x'.repeat(i)}`);
  const got = await callServerMt({ texts: big, sourceLang: 'en', targetLang: 'ko', env: { SERVER_MT_URL: 'http://x', SERVER_MT_KEY: 'k' },
    fetchImpl: async (_u, o) => { batches++; const q = JSON.parse(o.body).q; return { ok: true, status: 200, json: async () => ({ t: q.map((s) => `[s] ${s}`) }) }; } });
  ok(batches === 2 && got.translations.length === 40 && got.translations[39].translatedText === `[s] ${big[39]}`, '40줄은 32+8 로 나눠 묻고 순서 그대로');

  // ── 되돌림 실증 — **릴레이가 실제로 돌려준 답**으로 (시험 안 상수 아님) ──
  // ① 떨어짐 길을 빼면(서버 5xx 를 손님에게 그대로) 구글 번역이 아니게 된다 → 아래 단언이 던져야 한다
  let revertFallbackFailed = false;
  try {
    assert.notStrictEqual(fell500.data.t[0], `[g] ${fell500.text}`, '5xx 인데 구글로 떨어졌다');
  } catch (e) { revertFallbackFailed = true; }
  ok(revertFallbackFailed === true, '떨어짐 길을 빼면 붉어진다 (되돌림 실증 1)');
  // ② 기록(why)을 빼면 붉어야 한다 — 모름을 됨으로 넘기지 않는다(§20)
  let revertWhyFailed = false;
  try {
    assert.notStrictEqual(fell500.why, 'smt_error', '5xx 까닭이 기록됐다');
  } catch (e) { revertWhyFailed = true; }
  ok(revertWhyFailed === true, 'why 기록을 빼면 붉어진다 (되돌림 실증 2)');
  // (손 되돌림 넷도 붉음 확인 — 구글 가드 제거 · off→켬 · 숫자 검사 제거 · 상한 제거, 보고에 적음)


// ── RunPod 서버리스 꼴 (마스터 11-06) ──
{
  const RP = 'https://api.runpod.ai/v2/oykvi2gds7l70v/runsync';
  ok(isRunpod(RP) && !isRunpod('https://x.example/translate') && !isRunpod('https://api.runpod.ai/v2/abc/run'), 'isRunpod: runsync 주소만 RunPod 꼴');
  let seen = null;
  const fakeRp = async (url, init) => { seen = { url, init }; const inp = JSON.parse(init.body).input;
    return { ok: true, status: 200, json: async () => ({ status: 'COMPLETED', output: { t: inp.q.map((x) => '번역:' + x) } }) }; };
  const r = await callServerMt({ texts: ['hello', 'world'], sourceLang: 'en', targetLang: 'ko', env: { SERVER_MT_URL: RP, SERVER_MT_KEY: 'k' }, fetchImpl: fakeRp });
  ok(r.translations.map((x) => x.translatedText).join('|') === '번역:hello|번역:world', 'RunPod: output.t 를 읽는다');
  ok(seen.init.headers.Authorization === 'Bearer k' && !('X-Raytok-Key' in seen.init.headers), 'RunPod: Bearer 머리, X-Raytok-Key 안 씀');
  ok(JSON.parse(seen.init.body).input.target === 'ko', 'RunPod: {input:{…}} 로 감싼다');
  const queued = async () => ({ ok: true, status: 200, json: async () => ({ status: 'IN_QUEUE', id: 'x' }) });
  let why = null;
  try { await callServerMt({ texts: ['hi'], sourceLang: 'en', targetLang: 'ko', env: { SERVER_MT_URL: RP, SERVER_MT_KEY: 'k' }, fetchImpl: queued }); } catch (e) { why = e.why || e.message; }
  ok(why != null, 'RunPod: 첫 시동(IN_QUEUE)은 실패로 → 구글이 받는다(R-15)');
}
  console.log(`\n전부 통과 (${pass}건)`);
  google.close(); smt.close();
  process.exit(0);
} catch (err) {
  console.error('\n[FAIL]', err && err.message);
  google.close(); smt.close();
  process.exit(1);
}
