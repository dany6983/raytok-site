/* relay/test/asr-batch.mjs — `POST /asr/batch` (B 22 뼈대 → B 18 정본 꼴, 2026-10-19)
 *
 * 설계(비공개): raytok-native1/docs/design/post-asr.md · 마스터 10-17 12:45.
 * 줄 JSON 꼴 정본: 엔진 저장소 `postasr/` (README + validate.mjs).
 * 공개 저장소라 **방법은 적지 않는다** — 이 시험이 보는 것은 문·상한·크기·보관 0·**꼴** 이다.
 *
 * ★ 이 시험의 중심: 우리 답을 **정본 검사기에 그대로 넣는다.** 꼴을 글로만 맞추면 어긋난다 —
 *   실제로 뼈대는 `conf: 0` · `lang: 'und'` 로 **모름을 값으로 채워** 정본을 통과하지 못했다.
 *
 * 망도 wrangler 도 쓰지 않는다 — 손잡이(`handleAsrBatch`)를 바로 부른다. 라우트 넷은 아래.
 * 돌리기: node relay/test/asr-batch.mjs
 */
import assert from 'node:assert/strict';
import { handleAsrBatch, fakeAsrEngine, AsrTimeout, ASR_MAX_BYTES, ASR_PRO_FLAG, ASR_DEFAULT_CAP_USD } from '../src/asr.js';
import { checkRequest, checkResponse, checkError, ERROR_CODES } from '../src/postasr-shape.js';

console.log('=== /asr/batch (문 0x20 · 상한 · 200MB · 보관 0 · 빈 답 · 정본 꼴) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

/* 정본 1장의 요청. 시각은 **초**다(뼈대는 ms 를 넣고 있었다 — 정본 1장). */
const REQ = {
  sessionId: '2026-10-15T16:03:51+09:00#3',
  lang: 'zh',
  clockBaseMs: 0,
  segments: [
    { file: 'rec-000.wav', t0: 0.0, t1: 612.4 },
    { file: 'rec-001.wav', t0: 615.9, t1: 1204.7 }
  ]
};
ok(checkRequest(REQ).length === 0, '시험이 쓰는 요청이 정본 1장 꼴이다 (가짜가 실기보다 느슨하면 안 된다, D-11)');

const base = { enabled: true, licFlags: ASR_PRO_FLAG, req: REQ, totalBytes: 1024 };

/* ── 문 ──────────────────────────────────────────────────────────── */

/* ① 꺼져 있으면 서지 않는다 (지금 기본 꺼짐 — 진짜 엔진 전) */
let r = await handleAsrBatch({ ...base, enabled: false });
ok(r.status === 503 && r.body.error === 'asr_disabled', `꺼져 있으면 503 asr_disabled (${r.status} ${r.body.error})`);

/* ② 0x20 없으면 403 no_package — /translate 의 0x10 거절과 **같은 모양**이라 앱이 이미 읽는다 */
r = await handleAsrBatch({ ...base, licFlags: 0x01 | 0x10 });
ok(r.status === 403 && r.body.why === 'no_package' && r.body.need === '0x20',
   `0x20 없으면 403 no_package need=0x20 (${r.status} ${r.body.why})`);

/* ③ 문이 **순서대로** 선다 — 꺼져 있으면 이용권을 보기 전에 선다 */
r = await handleAsrBatch({ ...base, enabled: false, licFlags: 0 });
ok(r.body.error === 'asr_disabled', '꺼짐이 이용권보다 먼저다 (끈 길에서 이용권 오류가 새지 않는다)');

/* ── 요청 꼴: 정본 검사기 한 자리가 센다 ─────────────────────────── */

const badReqs = [
  ['요청이 없다', null],
  ['객체가 아니다', 'manifest'],
  ['segments 가 없다', { sessionId: 's', lang: 'ko', clockBaseMs: 0 }],
  ['segments 가 비었다', { ...REQ, segments: [] }],
  ['clockBaseMs 가 글이다', { ...REQ, clockBaseMs: '0' }],
  ['세 글자 언어 코드', { ...REQ, lang: 'zho' }],
  ['t1 < t0', { ...REQ, segments: [{ file: 'a.wav', t0: 10, t1: 5 }] }],
  ['t0 == t1 (길이 0)', { ...REQ, segments: [{ file: 'a.wav', t0: 5, t1: 5 }] }],
  ['file 이 없다', { ...REQ, segments: [{ t0: 0, t1: 1 }] }],
  ['sessionId 가 빈 글', { ...REQ, sessionId: '' }]
];
for (const [name, req] of badReqs) {
  r = await handleAsrBatch({ ...base, req });
  ok(r.status === 400 && r.body.error === 'bad_manifest' && Array.isArray(r.body.detail) && r.body.detail.length > 0,
     `꼴이 아니면 400 bad_manifest + 틀린 곳 — ${name}`);
}
ok(checkRequest(REQ).length === 0, '맞는 요청은 그대로 통과한다 (거르는 코드가 전부를 거르는 것이 아니다)');

/* `lang: null` 은 **맞다** — 모르면 모델이 고른다(정본 1장). 거절하면 안 된다. */
r = await handleAsrBatch({ ...base, req: { ...REQ, lang: null } });
ok(r.status === 200 && r.body.lang === null, 'lang: null 은 받는다 — 그리고 답의 lang 도 null 로 남는다 (D-70)');

/* ── 크기·상한 ───────────────────────────────────────────────────── */

r = await handleAsrBatch({ ...base, totalBytes: ASR_MAX_BYTES + 1 });
ok(r.status === 413 && r.body.error === 'too_large' && r.body.limit === ASR_MAX_BYTES,
   `200MB 넘으면 413 too_large (정본 6장의 코드 이름) (${r.status} ${r.body.error})`);
r = await handleAsrBatch({ ...base, totalBytes: ASR_MAX_BYTES });
ok(r.status === 200, '딱 200MB 는 받는다 (경계)');

r = await handleAsrBatch({ ...base, capUsd: 1, spentToday: 1 });
ok(r.status === 503 && r.body.error === 'asr_cap' && r.body.cap_usd === 1,
   `상한에 닿으면 503 asr_cap (${r.status} ${r.body.error})`);
r = await handleAsrBatch({ ...base, capUsd: ASR_DEFAULT_CAP_USD, spentToday: 0.99 });
ok(r.status === 200, '상한 아래면 간다 (0.99 < 1)');

/* ── 답 꼴: **정본 검사기에 넣는다** ─────────────────────────────── */

r = await handleAsrBatch({ ...base });
ok(r.status === 200, '정상 요청은 200');
let shapeBad = checkResponse(r.body);
ok(shapeBad.length === 0, `답이 정본 2장 꼴을 통과한다 (${shapeBad.join(' · ') || '어긋남 없음'})`);
ok(typeof r.body.engine === 'string' && r.body.engine.length > 0, `engine 이 무엇이 받아썼는지 말한다 (${r.body.engine})`);
ok(r.body.lines.length === REQ.segments.length, `줄 ${r.body.lines.length} 개`);
ok(r.body.lines.every(l => l.conf === null),
   'conf 가 **null** 로 남는다 — 지금 엔진이 확신도를 안 준다(정본 4장). 0 으로 채우면 거짓이다');
ok(r.body.lines.every(l => l.lang === 'zh'), '줄 언어가 두 글자 코드로 간다');
ok(r.body.stats && Math.abs(r.body.stats.rtf - r.body.stats.computeSec / r.body.stats.audioSec) < 0.01,
   `stats.rtf = computeSec/audioSec (audioSec ${r.body.stats.audioSec})`);
ok(r.body.kept === 0, '서버가 들고 있는 소리 0 (보관 0)');

/* 엔진이 모르는 것을 주면 **null 로 남는다** — 채우지 않는다 */
r = await handleAsrBatch({
  ...base,
  engine: async () => ({ engine: 'e', lang: null, lines: [{ t0: 0, t1: 1, text: '가', lang: null, conf: null }] })
});
shapeBad = checkResponse(r.body);
ok(shapeBad.length === 0 && r.body.lines[0].lang === null && r.body.lines[0].conf === null,
   '줄 언어·확신도를 모르면 null 그대로 (정본이 null 을 정상으로 둔다)');

/* 엔진이 엉뚱한 값을 주면 **버리고 null** — 정본이 받지 않는 값을 그냥 흘리지 않는다 */
r = await handleAsrBatch({
  ...base,
  engine: async () => ({ engine: 'e', lang: 'und', lines: [{ t0: 0, t1: 1, text: '가', lang: 'und', conf: 7 }] })
});
shapeBad = checkResponse(r.body);
ok(shapeBad.length === 0 && r.body.lang === null && r.body.lines[0].lang === null && r.body.lines[0].conf === null,
   `'und' · conf 7 처럼 정본이 안 받는 값은 null 로 바뀐다 (${shapeBad.join(' · ') || '꼴 통과'})`);

/* 빈 답 — **오류가 아니다**(정본 2장 · §20) */
r = await handleAsrBatch({ ...base, engine: async () => ({ engine: 'e', lang: 'zh', lines: [] }) });
ok(r.status === 200 && r.body.lines.length === 0 && checkResponse(r.body).length === 0,
   '말이 없었으면 lines: [] 로 200 — 오류가 아니다 (앱은 실시간본을 그대로 둔다)');

/* 빈 글 줄은 버리고 **버린 수를 센다** */
r = await handleAsrBatch({
  ...base,
  engine: async () => ({ engine: 'e', lang: 'zh', lines: [
    { t0: 0, t1: 1, text: '   ', lang: 'zh', conf: null },
    { t0: 1, t1: 2, text: '있다', lang: 'zh', conf: null }
  ] })
});
ok(r.body.lines.length === 1 && r.body.dropped === 1, `빈 글 줄은 버리고 dropped 로 센다 (${r.body.dropped})`);

/* ── 엔진이 못 할 때: 늦은 것과 안 선 것을 **가른다**(정본 6장) ──── */

r = await handleAsrBatch({ ...base, engine: async () => { throw new AsrTimeout(5000); } });
ok(r.status === 504 && r.body.error === 'timeout' && checkError(r.body).length === 0,
   `늦으면 timeout (${r.status} ${r.body.error}) — 앱은 실시간본을 그대로 둔다`);

r = await handleAsrBatch({ ...base, engine: async () => { throw new Error('ECONNREFUSED'); } });
ok(r.status === 503 && r.body.error === 'worker_down' && checkError(r.body).length === 0,
   `안 서면 worker_down (${r.status} ${r.body.error})`);

r = await handleAsrBatch({ ...base, engine: async () => null });
ok(r.body.error === 'worker_down', '엔진이 빈손이면 worker_down — 줄을 **지어내지 않는다**(§20)');

r = await handleAsrBatch({ ...base, engine: async () => ({ engine: 'e', lines: 'nope' }) });
ok(r.body.error === 'worker_down', '엔진이 배열이 아닌 것을 주면 worker_down');

/* 정본이 아는 오류 코드만 쓴다 — 우리가 내는 것 셋이 그 목록에 있다 */
for (const code of ['asr_cap', 'too_large', 'timeout', 'worker_down']) {
  ok(ERROR_CODES.includes(code), `정본이 아는 오류 코드다 — ${code}`);
}
ok(checkError({ error: 'asr_too_big' }).length > 0,
   '옛 이름 asr_too_big 은 정본이 모른다 — 그래서 too_large 로 바꿨다 (§4: 값 이름을 바꾸면 읽는 곳을 센다)');
/* 릴레이만 내는 문 둘은 정본 표에 없다 — 워커 길의 오류가 아니라 **릴레이의 문**이다 */
ok(!ERROR_CODES.includes('asr_disabled') && !ERROR_CODES.includes('no_package'),
   'asr_disabled·no_package 는 릴레이의 문이라 정본 워커 표에 없다 (배포 한 장에 적혀 있다)');

/* ── 보관 0 — storage 를 넘겨도 쓰지 않는다 ──────────────────────── */
let touched = 0;
const spy = new Proxy({}, { get: () => { touched += 1; return () => {}; } });
r = await handleAsrBatch({ ...base, storage: spy });
ok(r.status === 200 && touched === 0, `소리 저장소를 한 번도 건드리지 않는다 (건드린 횟수 ${touched})`);

/* ── 되돌림 실증 (D-09) ─────────────────────────────────────────── */
/* 뼈대가 하던 대로 모름을 값으로 **채우면** 정본 검사기가 거른다. 실제 값으로 센다 — 여기서
   만든 상수를 견주는 것이 아니라, 우리 답 객체의 칸을 그 꼴로 바꿔 검사기에 넣는다. */
const good = (await handleAsrBatch({ ...base })).body;
ok(checkResponse(good).length === 0, '되돌림 전: 우리 답이 정본을 통과한다');
const bentConf = { ...good, lines: good.lines.map(l => ({ ...l, conf: 0 })) };
ok(checkResponse(bentConf).length === 0,
   'conf 0 자체는 꼴로는 통과한다 — 그래서 꼴 검사만으로는 안 잡힌다(위 conf null 단언이 그 자리)');
const bentLang = { ...good, lines: good.lines.map(l => ({ ...l, lang: 'und' })) };
ok(checkResponse(bentLang).some(x => x.includes('lang')),
   `줄 언어를 'und' 로 채우면 정본이 거른다 (되돌림 실증 ①: 뼈대가 그렇게 보내고 있었다)`);
const bentOrder = { ...good, lines: [...good.lines].reverse() };
ok(checkResponse(bentOrder).length > 0, '줄 순서를 뒤집으면 정본이 거른다 (되돌림 실증 ②)');
const bentRtf = { ...good, stats: { ...good.stats, rtf: good.stats.rtf + 1 } };
ok(checkResponse(bentRtf).some(x => x.includes('rtf')), 'rtf 를 틀리게 적으면 정본이 거른다 (되돌림 실증 ③)');
const bentEngine = { ...good }; delete bentEngine.engine;
ok(checkResponse(bentEngine).some(x => x.includes('engine')), 'engine 을 빼면 정본이 거른다 (되돌림 실증 ④)');

/* ── 문을 빼면 붉어지는가 (D-09) ──────────────────────────────── */
let reverted = false;
try {
  const open = await handleAsrBatch({ ...base, licFlags: 0 });
  assert.strictEqual(open.status, 200, `0x20 없이 ${open.status} 로 지나갔다`);
} catch (e) { reverted = true; }
ok(reverted === true, '0x20 문을 빼면 붉어진다 (되돌림 실증 ⑤)');

let reverted2 = false;
try {
  const on = await handleAsrBatch({ ...base, enabled: false });
  assert.strictEqual(on.status, 200, `꺼져 있는데 ${on.status} 로 섰다`);
} catch (e) { reverted2 = true; }
ok(reverted2 === true, 'ASR_ENABLED 문을 빼면 붉어진다 (되돌림 실증 ⑥)');

ok(ASR_DEFAULT_CAP_USD === 1, '처음 일일 상한은 1달러 (설계 그대로)');

/* ── 라우트: 손잡이만 초록이고 길이 안 이어지면 아무 일도 안 일어난다 (B 7 교훈) ──
   wrangler 없이 워커를 바로 부른다. 토큰은 여기서 만든다(시험용 비밀값). */
const { default: relayWorker } = await import('../src/index.js');
const { mintLicenseToken } = await import('../tools/mint-license.mjs');
const SECRET = 'asr_test_secret_' + Math.random().toString(36).slice(2);
const tok = (flags) => mintLicenseToken({ sub: 'asr-test', days: 1, flags, secret: SECRET });
const call = (env, flags, body) => relayWorker.fetch(new Request('http://localhost/asr/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok(flags)}` },
  body: JSON.stringify(body)
}), { LICENSE_SECRET: SECRET, ...env }, {});
const jsonOf = async (res) => { try { return await res.json(); } catch (_) { return {}; } };

let res = await call({}, ASR_PRO_FLAG, { manifest: REQ, bytes: 10 });
let d = await jsonOf(res);
ok(res.status === 503 && d.error === 'asr_disabled',
   `라우트: ASR_ENABLED 없으면 503 asr_disabled (${res.status} ${d.error})`);

res = await call({ ASR_ENABLED: '1' }, 0x10, { manifest: REQ, bytes: 10 });
d = await jsonOf(res);
ok(res.status === 403 && d.why === 'no_package',
   `라우트: 0x20 없는 토큰 → 403 no_package (${res.status} ${d.why})`);

res = await call({ ASR_ENABLED: '1' }, ASR_PRO_FLAG, { manifest: REQ, bytes: 2048 });
d = await jsonOf(res);
ok(res.status === 200 && d.engine === 'fake' && d.lines.length === REQ.segments.length && d.kept === 0,
   `라우트: 켜고 0x20 이면 200 · 가짜 엔진 줄 ${d.lines ? d.lines.length : '-'} · kept ${d.kept}`);
ok(checkResponse(d).length === 0,
   `라우트가 **실제로 돌려준 몸통**이 정본 꼴이다 (${checkResponse(d).join(' · ') || '어긋남 없음'})`);

res = await call({ ASR_ENABLED: '1' }, ASR_PRO_FLAG, { manifest: { sessionId: 's' }, bytes: 10 });
d = await jsonOf(res);
ok(res.status === 400 && d.error === 'bad_manifest',
   `라우트: 꼴이 아니면 400 bad_manifest (${res.status} ${d.error})`);

res = await call({ ASR_ENABLED: 'true' }, ASR_PRO_FLAG, { manifest: REQ, bytes: ASR_MAX_BYTES + 1 });
d = await jsonOf(res);
ok(res.status === 413 && d.why === 'too_large', `라우트: 200MB 넘으면 413 too_large (${res.status})`);

res = await relayWorker.fetch(new Request('http://localhost/asr/batch', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
}), { LICENSE_SECRET: SECRET, ASR_ENABLED: '1' }, {});
ok(res.status === 401 || res.status === 403, `라우트: 토큰 없으면 막힌다 (${res.status})`);

// 되돌림 실증 — 라우트를 지우면 404 가 되고 위 넷이 붉다
res = await relayWorker.fetch(new Request('http://localhost/asr/nope', { method: 'POST' }),
                              { LICENSE_SECRET: SECRET }, {});
ok(res.status === 404, '없는 길은 404 (라우트를 지우면 /asr/batch 도 이 꼴이 된다)');

console.log(`\n전부 통과 (${checks}건)`);
