// RULE: P-16
/* relay/test/p16-no-audio.mjs — 릴레이는 **소리를 내보내지 않는다** (B 26, 2026-10-17)
 *
 * `p16-lock.mjs` 는 `/tts`·`/playback` 두 길이 403 인지 본다. 이 시험은 그보다 넓게 본다 —
 * **모든 길의 모든 응답**에 소리가 섞이지 않았는가. 길이 하나 새로 생겨도 자동으로 센다:
 * 길 목록을 손으로 적지 않고 `relay/src/index.js` 에서 **읽어 온다**(§4 — 손 목록은 썩는다).
 *
 * 보는 것 셋:
 *   ① 응답 머리글 Content-Type 에 `audio/` 가 0건
 *   ② 응답 본문이 소리 파일의 머리(RIFF·ID3·OggS·fLaC·ftyp)로 시작하지 않는다
 *   ③ JSON 답에 소리 주소 칸(audio_url·audioUrl·voice_url·mp3·wav)이 없다
 * 그리고 **잡는 눈이 멀지 않았는지** 가짜 소리 응답으로 되돌려 확인한다(D-09).
 *
 * 돌리기: node relay/test/p16-no-audio.mjs   (망·wrangler 필요 없음)
 */
import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import relayApp from '../src/index.js';
import { mintLicense } from '../src/license.js';

console.log('=== P-16 — 릴레이가 소리를 내보내지 않는다 (모든 길) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

/* ── 소리인지 가리는 눈. 이 함수가 멀면 시험 전체가 거짓이 된다 — 아래 ⑤에서 되돌려 본다 ── */
const AUDIO_KEYS = /"(audio_url|audioUrl|voice_url|voiceUrl|mp3_url|wav_url)"\s*:/i;
const MAGIC = [
  ['RIFF', 'WAV'], ['ID3', 'MP3'], ['OggS', 'Ogg'], ['fLaC', 'FLAC']
];
async function audioSmell(res) {
  const why = [];
  const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
  if (ctype.includes('audio/')) why.push(`Content-Type ${ctype}`);
  let body = '';
  try { body = await res.clone().text(); } catch (_) { body = ''; }
  for (const [magic, name] of MAGIC) if (body.startsWith(magic)) why.push(`본문이 ${name} 머리로 시작`);
  if (body.includes('ftypM4A') || body.includes('ftypmp4')) why.push('본문이 MP4/M4A 머리');
  if (AUDIO_KEYS.test(body)) why.push(`JSON 에 소리 주소 칸 (${(body.match(AUDIO_KEYS) || [])[1]})`);
  return why;
}

/* ── 길 목록을 코드에서 읽어 온다 ── */
const indexSrc = fs.readFileSync(path.join(SRC, 'index.js'), 'utf-8');
const paths = new Set();
for (const m of indexSrc.matchAll(/url\.pathname\s*===\s*'([^']+)'/g)) paths.add(m[1]);
for (const m of indexSrc.matchAll(/url\.pathname\.startsWith\('([^']+)'\)/g)) paths.add(m[1] + 'x');
ok(paths.size >= 15, `코드에서 길 ${paths.size}개를 읽었다 (손 목록이 아니다)`);
for (const must of ['/tts', '/playback', '/translate']) {
  ok([...paths].some((p) => p.startsWith(must)), `읽은 목록에 ${must} 가 있다`);
}

/* ── 가짜 환경 (p16-lock.mjs 와 같은 모양) ── */
const mockLimiter = { fetch: async () => new Response(JSON.stringify({ allowed: true, count: 1, total_chars: 0, desk_minutes: 0, ok: true })) };
const mockEnv = {
  LICENSE_SECRET: 'test-p16-noaudio-secret-32-chars!!',
  TRANSLATE_CAP_CHARS: '3000000',
  TRANSLATE_ENGINE: 'mock',
  ADMIN_SECRET: 'test-admin-secret',
  ASR_ENABLED: '1',                     // 켜 놓고 본다 — 꺼 두면 그 길을 안 돌게 된다(§20)
  ROOM: { idFromName: () => 'mock-id', get: () => mockLimiter }
};
const { token } = await mintLicense('cust_ALL', 30, 0x3f, mockEnv.LICENSE_SECRET);   // 문을 다 연 토큰

const bodies = {
  '/translate': { q: ['안녕하세요'], target: 'en' },
  '/room': { kind: 'guide' },
  /* 정본 1장 꼴이어야 **성공 경로**를 돈다. 옛 배열 꼴로 두면 400 bad_manifest 만 돌고
     "소리를 안 보낸다"가 **빈 사례**가 된다 (AGENTS §4: 꼴을 바꾸면 읽는 곳을 전부 센다). */
  '/asr/batch': {
    manifest: { sessionId: 's#1', lang: 'ko', clockBaseMs: 0, segments: [{ file: 'a.wav', t0: 0, t1: 10 }] },
    bytes: 10
  },
  '/license/redeem': { code: '0000-0000-0000-0000', deviceId: 'd1' },
  '/license/issue': { device: 'd1' },
  '/pay/complete': { paymentId: 'x', productId: 'pass_1d', amount: 3300 }
};

let called = 0, audioHits = [];
for (const p of [...paths].sort()) {
  const url = 'http://localhost' + p.replace(/x$/, 'probe');
  for (const method of ['GET', 'POST']) {
    const init = { method, headers: { Authorization: 'Bearer ' + token, 'X-Admin-Secret': mockEnv.ADMIN_SECRET } };
    if (method === 'POST') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(bodies[p] || {});
    }
    let res;
    try { res = await relayApp.fetch(new Request(url, init), mockEnv, { waitUntil: () => {} }); }
    catch (e) { continue; }                 // 던지는 길은 소리를 못 보낸다
    if (!res) continue;
    called += 1;
    const why = await audioSmell(res);
    if (why.length) audioHits.push(`${method} ${p} → ${why.join(' · ')}`);
  }
}
ok(called >= 20, `길 ${called}번을 실제로 불렀다 (안 부르면 아래 셈이 거짓이다)`);
ok(audioHits.length === 0, `소리가 섞인 응답 0건 (${audioHits.slice(0, 2).join(' / ') || '없음'})`);

/* ── /tts·/playback 은 그 위에 403 이다 (p16-lock.mjs 와 겹치지만, 여기서도 한 줄 ── */
for (const p of ['/tts', '/playback']) {
  const res = await relayApp.fetch(new Request('http://localhost' + p, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}'
  }), mockEnv, {});
  const d = await res.clone().json().catch(() => ({}));
  ok(res.status === 403 && d.why === 'p16_forbidden_endpoint', `${p} → 403 p16_forbidden_endpoint`);
}

/* ── 코드에도 소리를 만드는 자리가 없다 (머리글을 적는 쪽) ── */
const srcFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
const audioCt = [];
for (const f of srcFiles) {
  const t = fs.readFileSync(path.join(SRC, f), 'utf-8');
  for (const m of t.matchAll(/['"`]audio\/[a-z0-9+.-]+['"`]/gi)) audioCt.push(`${f}: ${m[0]}`);
}
ok(audioCt.length === 0, `릴레이 코드에 audio/ 머리글을 적는 자리 0건 (${audioCt.slice(0, 2).join(', ') || '없음'})`);

/* ── ⑤ 되돌림 실증 — 눈이 멀지 않았나. 가짜 소리 응답 셋을 **같은 함수**에 넣는다 ── */
const fakes = [
  ['Content-Type', new Response('x', { headers: { 'Content-Type': 'audio/mpeg' } })],
  ['WAV 머리', new Response('RIFF....WAVEfmt ', { headers: { 'Content-Type': 'application/octet-stream' } })],
  ['JSON 소리 주소', new Response(JSON.stringify({ ok: true, audio_url: 'https://x/y.mp3' }), { headers: { 'Content-Type': 'application/json' } })]
];
for (const [what, fake] of fakes) {
  const why = await audioSmell(fake);
  ok(why.length > 0, `가짜 소리(${what})는 잡힌다 — 눈이 멀지 않았다 (되돌림 실증: ${why[0]})`);
}
let blindRevert = false;
try { assert.strictEqual((await audioSmell(fakes[0][1])).length, 0, '가짜 소리를 못 잡았다'); }
catch (e) { blindRevert = true; }
ok(blindRevert === true, '판정을 느슨하게 되돌리면 붉어진다 (되돌림 실증)');

console.log(`\n전부 통과 (${checks}건)`);
