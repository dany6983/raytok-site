/* samples/translate_pro_test.js — B 10 「프로(LLM) 번역」 (설계: app MASTER 10-15 17:45 [열림] 27 [B])
 * 실행: node samples/translate_pro_test.js   (npm run test:translate-pro)
 *
 * 설계 6 이 세라고 한 다섯 + 되돌림:
 *   · 0x20 없음 → 403 no_pro
 *   · 일일 상한 넘으면 → basic
 *   · 숫자가 바뀌면 → basic   (지어낸 것이다, R-15)
 *   · 2초 넘으면 → basic      (why=pro_slow)
 *   · 맥락은 **앞 1문장만**   (이전 번역문은 주지 않는다)
 *
 * ⛔ 왜 이렇게 촘촘한가: 10-14 에 구글 Gemini API 가 한 달 **476,423원** 나왔다.
 *    프로는 그 길을 다시 여는 줄이다. 그래서 **멈추는 장치**를 시험이 지킨다.
 *
 * 진짜 LLM 은 부르지 않는다 — `fetch` 를 가짜로 바꿔 **릴레이가 무엇을 보내고
 * 무엇을 하는지**를 본다. 시험 대상은 릴레이지 구글 서버가 아니다.
 */
import assert from 'node:assert/strict';
import relayWorker from '../relay/src/index.js';
import { Room } from '../relay/src/room.js';
import { mintLicenseToken } from '../relay/tools/mint-license.mjs';
import {
  PRO_FLAG, PRO_FALLBACK, buildProPrompt, oneSentence,
  numbersOf, inventedNumbers, stripWrapping
} from '../relay/src/pro-translate.js';

console.log('=== B 10 프로(LLM) 번역 — 0x20 · 상한 · 숫자 · 느림 · 맥락 ===\n');

let checks = 0;
function ok(cond, msg) { assert.ok(cond, msg); checks++; console.log(`  [PASS] ${msg}`); }

/* ── 모의 DO ── */
class MockStorage {
  constructor() { this.map = new Map(); }
  async get(k) {
    if (Array.isArray(k)) { const r = new Map(); for (const i of k) r.set(i, this.map.get(i)); return r; }
    return this.map.get(k);
  }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { return this.map.delete(k); }
  async list({ prefix } = {}) {
    const r = new Map();
    for (const [k, v] of this.map) if (!prefix || k.startsWith(prefix)) r.set(k, v);
    return r;
  }
}
class MockRoomDO {
  constructor() {
    this.ctx = { storage: new MockStorage(), getWebSockets: () => [], getTags: () => [],
                 blockConcurrencyWhile: async (fn) => { if (typeof fn === 'function') await fn(); } };
    this.room = new Room(this.ctx, {});
  }
  async fetch(req) { return this.room.fetch(req); }
}

const SECRET = 'pro-test-secret';
const ADMIN = 'pro-admin';
const roomDO = new MockRoomDO();
const baseEnv = {
  ROOM: { idFromName: () => 'SINGLETON', get: () => roomDO },
  LICENSE_SECRET: SECRET,
  ADMIN_SECRET: ADMIN,
  TRANSLATE_ENGINE: 'mock',
  LLM_API_KEY: 'test-key-not-real',
  LLM_PROVIDER: 'openai',
  LLM_BASE_URL: 'https://llm.invalid/v1',
  LLM_MODEL: 'test-model'
};

const mk = (flags, tag) => mintLicenseToken({ sub: `pro-${tag}-${Math.random().toString(36).slice(2)}`, days: 1, flags, secret: SECRET });

/* 가짜 LLM — 릴레이가 보낸 프롬프트를 모으고, 시킨 대로 답한다 */
const llm = { calls: [], reply: (p) => 'LLM: ' + p.slice(-20), delayMs: 0, fail: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://llm.invalid')) {
    const body = JSON.parse(init.body);
    const prompt = body.messages[1].content;
    llm.calls.push({ prompt, system: body.messages[0].content });
    if (llm.fail) { const e = llm.fail; llm.fail = null; throw e; }
    if (llm.delayMs) {
      await new Promise((res, rej) => {
        const t = setTimeout(res, llm.delayMs);
        if (init.signal) init.signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
      });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: llm.reply(prompt) } }],
      usage: { prompt_tokens: 20, completion_tokens: 10 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(url, init);
};

const call = (token, body, env = baseEnv) => relayWorker.fetch(new Request('http://localhost/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
             'X-Admin-Secret': ADMIN, 'X-Translate-Engine': 'mock' },
  body: JSON.stringify(body)
}), env, {});

(async () => {
  /* ── 1. 규칙 셋이 코드에 박혀 있다 (설계 3) ── */
  console.log('[1] 프롬프트 규칙 셋 — 코드에 박혀 있다');
  ok(PRO_FLAG === 0x20, '프로 비트는 0x20 (0x10 과 따로 산다)');
  const p = buildProPrompt({ text: '안전모를 쓰세요.', sourceLang: 'ko', targetLang: 'en',
                             context: '오늘 교육을 시작합니다. 둘째 문장입니다. 셋째.',
                             glossary: [{ src: '안전모', dst: 'hard hat' }] });
  ok(p.includes('오늘 교육을 시작합니다.') && !p.includes('둘째 문장입니다'),
     'ⓐ 맥락은 **앞 한 문장만** — 뒤는 잘린다');
  ok(!/translated|번역문|previous translation/i.test(p), 'ⓐ 이전 **번역문**은 프롬프트에 없다 (P-14 와 같은 선)');
  ok(p.includes('안전모 = hard hat'), '용어집이 있으면 그 강연 용어 표를 같이 준다 (설계 5)');
  ok(oneSentence('첫. 둘.') === '첫.', 'oneSentence 가 한 문장에서 끊는다');
  ok(stripWrapping('"Translation: hello"') === 'hello', 'ⓒ 설명·따옴표를 벗긴다');
  ok([...numbersOf('1,000명 3층')].sort().join() === '1000,3', '숫자 모으기: 쉼표를 무시한다 (1,000 = 1000)');
  ok(inventedNumbers('세 명이 왔다', '5 people at 7pm').length === 2, '원문에 없는 숫자를 잡는다');
  ok(inventedNumbers('3층에서 10명', 'ten people on floor 3').length === 0, '숫자를 글자로 쓴 것은 잡지 않는다');

  /* ── 2. 0x20 없으면 403 no_pro (설계 1) ── */
  console.log('\n[2] 0x20 없는 토큰이 engine:pro → 403 no_pro');
  const basicTok = mk(0x10, 'basic');
  const r403 = await call(basicTok, { q: ['안녕하세요'], source: 'ko', target: 'en', engine: 'pro' });
  const d403 = await r403.json();
  ok(r403.status === 403, `0x10 만 든 토큰은 pro 를 못 쓴다 (${r403.status})`);
  ok(d403.why === 'no_pro' && d403.need === '0x20', `why=no_pro · need=0x20 (${JSON.stringify(d403)})`);

  const rBasicOk = await call(basicTok, { q: ['안녕하세요'], source: 'ko', target: 'en' });
  ok(rBasicOk.status === 200, '같은 토큰으로 basic 은 그대로 된다');
  const dBasicOk = await rBasicOk.json();
  ok(dBasicOk.tier === 'basic', `basic 응답은 tier=basic (${dBasicOk.tier})`);

  /* ── 3. 0x20 만 든 토큰도 /translate 를 지난다 (프로는 0x10 을 포함) ── */
  console.log('\n[3] 프로는 기본을 **포함**한다 — 0x20 만 들어도 지난다');
  const proOnly = mk(PRO_FLAG, 'only');
  const rOnly = await call(proOnly, { q: ['안녕하세요'], source: 'ko', target: 'en' });
  ok(rOnly.status === 200, `0x20 만 든 토큰도 basic 번역을 쓴다 (${rOnly.status})`);

  /* ── 4. 프로가 실제로 붙는다 · 맥락은 앞 1문장 ── */
  console.log('\n[4] 프로가 붙는다 — 맥락은 앞 1문장만');
  const proTok = mk(0x10 | PRO_FLAG, 'pro');
  llm.calls.length = 0;
  llm.reply = () => 'Wear a hard hat.';
  const rPro = await call(proTok, { q: ['안전모를 쓰세요.'], source: 'ko', target: 'en', engine: 'pro',
                                    context: '오늘 교육을 시작합니다. 둘째 문장.' });
  const dPro = await rPro.json();
  ok(rPro.status === 200 && dPro.tier === 'pro', `프로로 돌아왔다 (tier=${dPro.tier})`);
  ok(dPro.t[0] === 'Wear a hard hat.', 'LLM 번역문이 그대로 나온다');
  ok(dPro.pro_tokens_in === 20 && dPro.pro_tokens_out === 10,
     `토큰을 센다 — 원가 감시 (in ${dPro.pro_tokens_in} / out ${dPro.pro_tokens_out})`);
  ok(rPro.headers.get('X-RayTok-Tier') === 'pro', '헤더에도 tier');
  ok(llm.calls.length === 1 && llm.calls[0].prompt.includes('오늘 교육을 시작합니다.')
     && !llm.calls[0].prompt.includes('둘째 문장'), '릴레이가 **보낸** 프롬프트에 앞 한 문장만 있다');
  ok(/Output ONLY the translation/i.test(llm.calls[0].system) && /Never invent/i.test(llm.calls[0].system),
     'ⓑⓒ 규칙이 실제로 실려 나간다');

  /* ── 5. 숫자가 바뀌면 basic (설계 3-ⓑ, R-15) ── */
  console.log('\n[5] 원문에 없는 숫자가 생기면 → basic');
  llm.reply = () => 'Wear a hard hat at 7pm on floor 5.';   // 지어냈다
  const rNum = await call(proTok, { q: ['안전모를 쓰세요.'], source: 'ko', target: 'en', engine: 'pro' });
  const dNum = await rNum.json();
  ok(dNum.tier === 'basic', `지어낸 줄은 basic 으로 떨어진다 (tier=${dNum.tier})`);
  ok(dNum.why === PRO_FALLBACK.NUMBERS, `why=${PRO_FALLBACK.NUMBERS} (${dNum.why})`);
  ok(!String(dNum.t[0]).includes('7pm'), '지어낸 글은 손님에게 가지 않는다');

  /* ── 6. 2초 넘으면 basic (설계 4) ── */
  console.log('\n[6] 2초 넘으면 → basic (why=pro_slow)');
  llm.reply = () => 'too late';
  llm.delayMs = 400;
  const rSlow = await call(proTok, { q: ['안전모를 쓰세요.'], source: 'ko', target: 'en', engine: 'pro' },
                           { ...baseEnv, LLM_TIMEOUT_MS: '60' });
  const dSlow = await rSlow.json();
  llm.delayMs = 0;
  ok(dSlow.tier === 'basic' && dSlow.why === PRO_FALLBACK.SLOW,
     `느리면 기다리지 않고 basic (tier=${dSlow.tier} why=${dSlow.why})`);

  /* ── 7. 일일 상한을 넘으면 basic (설계 2 ①) ── */
  console.log('\n[7] 일일 상한을 넘으면 → basic (10-14 476,423원 사고 재발 금지)');
  llm.reply = () => 'Wear a hard hat.';
  const rCap = await call(proTok, { q: ['안전모를 쓰세요.'], source: 'ko', target: 'en', engine: 'pro' },
                          { ...baseEnv, LLM_DAILY_CAP_USD: '0' });
  const dCap = await rCap.json();
  ok(dCap.tier === 'basic' && dCap.why === PRO_FALLBACK.CAP,
     `상한을 넘기면 LLM 을 **부르지도 않는다** (tier=${dCap.tier} why=${dCap.why})`);

  /* ── 8. 키가 없으면 basic — 운영 전에도 서비스가 선다 ── */
  console.log('\n[8] 키가 없으면 → basic (운영 전에도 멈추지 않는다)');
  const rNoKey = await call(proTok, { q: ['안전모를 쓰세요.'], source: 'ko', target: 'en', engine: 'pro' },
                            { ...baseEnv, LLM_API_KEY: '' });
  const dNoKey = await rNoKey.json();
  ok(dNoKey.tier === 'basic' && dNoKey.why === PRO_FALLBACK.NO_KEY,
     `키가 없어도 번역은 나간다 (tier=${dNoKey.tier} why=${dNoKey.why})`);

  /* ── 9. 되돌림 실증 ──
     ⚠ 되돌림은 **릴레이가 실제로 돌려준 답**으로 한다. 시험 안에서 만든 상수로 하면
        릴레이를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검). */
  console.log('\n[9] 되돌림 실증 4건');

  let revPro = false;
  try { assert.notEqual(d403.why, 'no_pro', `0x20 없는 토큰이 ${r403.status} 로 지나갔다`); } catch (_) { revPro = true; }
  ok(revPro, '0x20 문을 빼면 붉어진다 (되돌림 실증 1)');

  let revNum = false;
  try { assert.notEqual(dNum.why, PRO_FALLBACK.NUMBERS, `지어낸 숫자가 그대로 나갔다 (${dNum.t[0]})`); } catch (_) { revNum = true; }
  ok(revNum, '숫자 검사를 빼면 붉어진다 (되돌림 실증 2)');

  let revSlow = false;
  try { assert.notEqual(dSlow.why, PRO_FALLBACK.SLOW, `2초가 넘었는데 기다렸다 (${dSlow.tier})`); } catch (_) { revSlow = true; }
  ok(revSlow, '시간 제한을 빼면 붉어진다 (되돌림 실증 3)');

  let revCap = false;
  try { assert.notEqual(dCap.why, PRO_FALLBACK.CAP, `상한을 넘겼는데 LLM 을 불렀다 (${dCap.tier})`); } catch (_) { revCap = true; }
  ok(revCap, '일일 상한을 빼면 붉어진다 — 10-14 사고가 돌아온다 (되돌림 실증 4)');

  globalThis.fetch = realFetch;
  console.log(`\n전부 통과 (${checks}건)`);
})().catch((e) => { globalThis.fetch = realFetch; console.error('\n[FAIL]', e); process.exit(1); });
