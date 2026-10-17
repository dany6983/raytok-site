/* relay/test/asr-batch.mjs — `POST /asr/batch` 뼈대 시험 (B 22, 2026-10-17)
 *
 * 설계(비공개): raytok-native1/docs/design/post-asr.md · 마스터 10-17 12:45.
 * 공개 저장소라 **방법은 적지 않는다** — 이 시험이 보는 것은 문·상한·크기·보관 0 뿐이다.
 *
 * 망도 wrangler 도 쓰지 않는다 — 손잡이(`handleAsrBatch`)를 바로 부른다.
 * 돌리기: node relay/test/asr-batch.mjs
 */
import assert from 'node:assert/strict';
import { handleAsrBatch, fakeAsrEngine, ASR_MAX_BYTES, ASR_PRO_FLAG, ASR_DEFAULT_CAP_USD } from '../src/asr.js';

console.log('=== /asr/batch 뼈대 (문 0x20 · 상한 · 200MB · 보관 0 · 빈 답) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const MANIFEST = [
  { file: 'rec/0001.wav', t0: 0, t1: 30000 },
  { file: 'rec/0002.wav', t0: 30000, t1: 61000 }
];
const base = { enabled: true, licFlags: ASR_PRO_FLAG, manifest: MANIFEST, totalBytes: 1024 };

/* ① 꺼져 있으면 서지 않는다 (지금 기본 꺼짐 — 진짜 엔진 전) */
let r = await handleAsrBatch({ ...base, enabled: false });
ok(r.status === 503 && r.body.error === 'asr_disabled', `꺼져 있으면 503 asr_disabled (${r.status} ${r.body.error})`);

/* ② 0x20 없으면 403 no_package — /translate 의 0x10 거절과 **같은 모양**이라 앱이 이미 읽는다 */
r = await handleAsrBatch({ ...base, licFlags: 0x01 | 0x10 });
ok(r.status === 403 && r.body.why === 'no_package' && r.body.need === '0x20',
   `0x20 없으면 403 no_package need=0x20 (${r.status} ${r.body.why})`);

/* ③ 목록이 없거나 모양이 틀리면 400 — 빈 배열도 거절(§20: 빈 것을 "다 됐다"로 읽지 않는다) */
for (const [what, m] of [['없음', null], ['빈 배열', []], ['글자', 'x'],
                         ['t1 < t0', [{ file: 'a.wav', t0: 10, t1: 5 }]],
                         ['file 없음', [{ t0: 0, t1: 10 }]]]) {
  const rr = await handleAsrBatch({ ...base, manifest: m });
  ok(rr.status === 400 && rr.body.why === 'bad_manifest', `목록 ${what} → 400 bad_manifest`);
}

/* ④ 200MB 넘으면 413 — 넘는 쪽과 **딱 맞는 쪽**을 같이 본다(경계에서 막으면 안 된다) */
r = await handleAsrBatch({ ...base, totalBytes: ASR_MAX_BYTES + 1 });
ok(r.status === 413 && r.body.why === 'asr_too_big' && r.body.limit === ASR_MAX_BYTES,
   `200MB + 1 → 413 asr_too_big (limit ${r.body.limit})`);
r = await handleAsrBatch({ ...base, totalBytes: ASR_MAX_BYTES });
ok(r.status === 200, '딱 200MB 는 지나간다 (경계)');

/* ⑤ 오늘 몫을 다 썼으면 503 asr_cap */
r = await handleAsrBatch({ ...base, capUsd: 1, spentToday: 1 });
ok(r.status === 503 && r.body.why === 'asr_cap' && r.body.cap_usd === 1,
   `상한을 채웠으면 503 asr_cap (cap ${r.body.cap_usd})`);
r = await handleAsrBatch({ ...base, capUsd: 1, spentToday: 0.99 });
ok(r.status === 200, '상한 아래면 지나간다 (0.99 < 1)');

/* ⑥ 엔진이 못 하면 **지어내지 않는다** — 503, 줄 0 (실시간본이 남아 있다, R-15) */
r = await handleAsrBatch({ ...base, engine: async () => { throw new Error('gpu down'); } });
ok(r.status === 503 && r.body.why === 'asr_unavailable' && !r.body.lines,
   `엔진이 죽으면 503 asr_unavailable · 줄 없음 (${r.body.why})`);
r = await handleAsrBatch({ ...base, engine: async () => null });
ok(r.status === 503 && r.body.why === 'asr_unavailable', '엔진이 빈손이면 503 asr_unavailable (§20)');
r = await handleAsrBatch({ ...base, engine: async () => ({ engine: 'x', lines: 'nope' }) });
ok(r.status === 503 && r.body.why === 'asr_unavailable', '엔진이 줄 아닌 것을 주면 503 (모양을 믿지 않는다)');

/* ⑦ 빈 줄은 버리고 **버린 수를 센다** (숨기면 다음 판단의 근거가 없다) */
r = await handleAsrBatch({
  ...base,
  engine: async () => ({ engine: 'fake', usd: 0, lines: [
    { t0: 0, t1: 10, text: '  ', lang: 'ko', conf: 0.9 },
    { t0: 10, t1: 20, text: '있는 줄', lang: 'ko', conf: 0.8 },
    { t0: 20, t1: 30, text: '', lang: 'ko' }
  ] })
});
ok(r.status === 200 && r.body.lines.length === 1 && r.body.dropped === 2,
   `빈 줄 둘을 버리고 센다 (줄 ${r.body.lines.length} · 버림 ${r.body.dropped})`);
ok(r.body.lines[0].lang === 'ko' && r.body.lines[0].conf === 0.8,
   '남은 줄이 {t0,t1,text,lang,conf} 모양이다');
r = await handleAsrBatch({ ...base, engine: async () => ({ engine: 'f', lines: [{ t0: 0, t1: 1, text: 'x' }] }) });
ok(r.body.lines[0].lang === 'und' && r.body.lines[0].conf === 0,
   '엔진이 언어·확신을 안 주면 und·0 으로 둔다 — 모름은 없음이 아니다(D-70)');

/* ⑧ 보관 0 — storage 를 넘겨도 **한 번도 쓰지 않는다** */
const touched = [];
const spyStorage = new Proxy({}, { get: (_t, k) => (...a) => { touched.push(String(k)); return undefined; } });
r = await handleAsrBatch({ ...base, storage: spyStorage });
ok(r.status === 200 && touched.length === 0, `소리를 저장하지 않는다 — storage 호출 ${touched.length}건`);
ok(r.body.kept === 0, '답에 kept: 0 (서버가 들고 있는 소리 0)');

/* ⑨ 가짜 엔진은 **가짜라고 말한다** — 진짜 숫자로 오해하면 안 된다 */
r = await handleAsrBatch({ ...base, engine: fakeAsrEngine });
ok(r.body.engine === 'fake' && r.body.usd === 0, `엔진 이름이 fake · 돈 0 (${r.body.engine})`);
ok(r.body.lines.length === MANIFEST.length && r.body.lines[0].t0 === MANIFEST[0].t0,
   '가짜 엔진이 토막마다 한 줄, 시각은 목록 그대로');
ok(r.body.chunks === MANIFEST.length && r.body.bytes_in === 1024, '토막 수·받은 바이트를 그대로 돌려준다');

/* ⑩ 되돌림 실증 — 문을 빼면 붉다 */
let reverted = false;
try {
  const open = await handleAsrBatch({ ...base, licFlags: 0 });
  assert.strictEqual(open.status, 200, `0x20 없이 ${open.status} 로 지나갔다`);
} catch (e) { reverted = true; }
ok(reverted === true, '0x20 문을 빼면 붉어진다 (되돌림 실증 1)');

let reverted2 = false;
try {
  const on = await handleAsrBatch({ ...base, enabled: false });
  assert.strictEqual(on.status, 200, `꺼져 있는데 ${on.status} 로 섰다`);
} catch (e) { reverted2 = true; }
ok(reverted2 === true, 'ASR_ENABLED 문을 빼면 붉어진다 (되돌림 실증 2)');

ok(ASR_DEFAULT_CAP_USD === 1, '처음 일일 상한은 1달러 (설계 그대로)');

/* ⑪ 길이 **정말 이어져 있나** — 손잡이만 초록이고 라우트가 없으면 아무 일도 안 일어난다(B 7 의 교훈).
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

let res = await call({}, ASR_PRO_FLAG, { manifest: MANIFEST, bytes: 10 });
let d = await jsonOf(res);
ok(res.status === 503 && d.error === 'asr_disabled',
   `라우트: ASR_ENABLED 없으면 503 asr_disabled (${res.status} ${d.error})`);

res = await call({ ASR_ENABLED: '1' }, 0x10, { manifest: MANIFEST, bytes: 10 });
d = await jsonOf(res);
ok(res.status === 403 && d.why === 'no_package',
   `라우트: 0x20 없는 토큰 → 403 no_package (${res.status} ${d.why})`);

res = await call({ ASR_ENABLED: '1' }, ASR_PRO_FLAG, { manifest: MANIFEST, bytes: 2048 });
d = await jsonOf(res);
ok(res.status === 200 && d.engine === 'fake' && d.lines.length === MANIFEST.length && d.kept === 0,
   `라우트: 켜고 0x20 이면 200 · 가짜 엔진 줄 ${d.lines ? d.lines.length : '-'} · kept ${d.kept}`);

res = await call({ ASR_ENABLED: 'true' }, ASR_PRO_FLAG, { manifest: MANIFEST, bytes: ASR_MAX_BYTES + 1 });
d = await jsonOf(res);
ok(res.status === 413 && d.why === 'asr_too_big', `라우트: 200MB 넘으면 413 (${res.status})`);

res = await relayWorker.fetch(new Request('http://localhost/asr/batch', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
}), { LICENSE_SECRET: SECRET, ASR_ENABLED: '1' }, {});
ok(res.status === 401 || res.status === 403, `라우트: 토큰 없으면 막힌다 (${res.status})`);

// 되돌림 실증 — 라우트를 지우면 404 가 되고 위 셋이 붉다
res = await relayWorker.fetch(new Request('http://localhost/asr/nope', { method: 'POST' }),
                              { LICENSE_SECRET: SECRET }, {});
ok(res.status === 404, '없는 길은 404 (라우트를 지우면 /asr/batch 도 이 꼴이 된다)');

console.log(`\n전부 통과 (${checks}건)`);
