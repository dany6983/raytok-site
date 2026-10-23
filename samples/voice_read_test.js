// samples/voice_read_test.js — **고른 목소리로 읽는가** (대표님 10-22 17:55 ⓒ)
//
// 대표님이 보신 것: 「영어 목소리: 미리듣기는 좋은데 **읽을 때 기계음**」.
// 까닭은 자리 둘이 **다른 셈**을 들고 있던 것이었다(§4 — 읽는 곳을 전부 센다):
//   미리듣기 · 「목소리」 창 → `currentVoice`(고른 것, 없으면 `getRankedVoicesForLang` 1등)
//   실제 읽기(`speakWebTts` → `pickVoice`) → `getVoices().find(...)` = **그 언어 첫 목소리**
// 폰 목록의 첫 목소리는 흔히 기계음(compact·network)이다. 그래서 둘이 갈렸다.
//
// 이 시험은 **읽는 길로** 잰다 — 가짜 `speak()` 가 `uttr.voice.name` 을 적고, 그것을
// 고른 목소리와 견준다. 목을 화면 밖에 따로 두지 않는다(D-11).
//
// 돌리기: node samples/voice_read_test.js   (playwright 필요)
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');

console.log('=== 고른 목소리로 읽는가 (voice_read) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

/* 영어 목소리 셋 — **첫 번째가 기계음**이다(실기에서 흔한 모양).
   순위는 화면의 `getRankedVoicesForLang` 이 매긴다: localService +10 · premium/enhanced/natural +5
   · 이름에 network 가 없으면 +3. 그래서 1등은 'English Premium'(13+5=18)이다. */
const VOICES = [
  { lang: 'en-US', name: 'English Compact', uri: 'fake:en-compact', local: true },     // 10+3 = 13
  { lang: 'en-US', name: 'English Premium', uri: 'fake:en-premium', local: true },     // 10+5+3 = 18
  { lang: 'en-GB', name: 'English Network Male', uri: 'fake:en-net', local: false },   // 0
];
function fakeVoices() {
  return `(() => {
    const LIST = ${JSON.stringify(VOICES)}.map((v, i) => ({
      lang: v.lang, name: v.name, voiceURI: v.uri, localService: v.local, default: i === 0
    }));
    window.__spoken = [];
    /* 발언 그릇도 가짜로 바꾼다 — 진짜 SpeechSynthesisUtterance 는 voice 칸에
       **진짜 SpeechSynthesisVoice** 만 받아서(TypeError) 가짜 목록을 못 꽂는다.
       규약은 그대로다: 부르는 쪽은 voice·lang 을 채우고 speak() 를 부른다(D-11). */
    window.SpeechSynthesisUtterance = function (t) { this.text = t; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; };
    const api = {
      getVoices: () => LIST,
      speak: (u) => { window.__spoken.push({ name: u.voice ? u.voice.name : '', lang: u.lang }); },
      cancel: () => {}, pause: () => {}, resume: () => {},
      onvoiceschanged: null, speaking: false, paused: false, pending: false
    };
    Object.defineProperty(window, 'speechSynthesis', { get: () => api, configurable: true });
  })();`;
}

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const { chromium } = require('playwright');
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});

  async function open(pickUri) {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(fakeVoices());
    if (pickUri) await page.addInitScript(`try { localStorage.setItem('raytok_voice_uri_en', '${pickUri}'); } catch (e) {}`);
    await page.goto(base + '/web/listener/?lang=en', { waitUntil: 'load' });
    await page.waitForTimeout(900);
    /* 폰은 목록이 늦게 차면 `onvoiceschanged` 로 알린다 — 화면은 그때 `updateVoice()` 를
       돈다. 들어가기 전에도 같은 길로 목소리를 세우게 **그 손잡이를 부른다**(가짜를 따로
       두지 않는다, D-11). */
    await page.evaluate(() => { if (typeof speechSynthesis.onvoiceschanged === 'function') speechSynthesis.onvoiceschanged(); });
    await page.waitForTimeout(300);
    return { ctx, page };
  }

  try {
    /* ① 손님이 고르지 않았다 — **순위 1등**으로 읽는다. 목록 첫 번째(기계음)가 아니다 */
    let r = await open(null);
    const ranked = await r.page.evaluate(() => window.rtVoiceRead.ranked('en'));
    ok(ranked[0] === 'English Premium', `순위 1등은 좋은 목소리다 (${JSON.stringify(ranked)})`);
    const chosen = await r.page.evaluate(() => window.rtVoiceRead.chosen());
    ok(chosen && chosen.name === 'English Premium', `고른 것이 없으면 1등이 선다 (${JSON.stringify(chosen)})`);
    const picked = await r.page.evaluate(() => window.rtVoiceRead.pick('en', ''));
    ok(picked.name === chosen.name, `**읽기**도 같은 목소리를 집는다 (${picked.name})`);
    const spoken = await r.page.evaluate(() => { window.rtVoiceRead.say('hello'); return window.__spoken; });
    ok(spoken.length === 1 && spoken[0].name === 'English Premium',
       `진짜 읽기 길에서도 그 목소리로 말한다 (${JSON.stringify(spoken)})`);
    ok(spoken[0].name !== 'English Compact', '목록 **첫 번째**(기계음)로 읽지 않는다 — 10-22 ⓒ 가 그것이었다');
    await r.ctx.close();

    /* ② 손님이 **다른 목소리를 골랐다** — 읽기도 그것으로 간다 */
    r = await open('fake:en-compact');
    const chosen2 = await r.page.evaluate(() => window.rtVoiceRead.chosen());
    ok(chosen2 && chosen2.name === 'English Compact', `고른 것이 선다 (${JSON.stringify(chosen2)})`);
    const spoken2 = await r.page.evaluate(() => { window.rtVoiceRead.say('hello'); return window.__spoken; });
    ok(spoken2.length === 1 && spoken2[0].name === 'English Compact',
       `고른 목소리로 읽는다 — 미리듣기와 읽기가 갈리지 않는다 (${JSON.stringify(spoken2)})`);
    await r.ctx.close();

    /* ③ 되돌림 실증 — `pickVoice` 가 고른 것을 안 보면(옛 길) **목록 첫 번째**로 읽는다.
       화면 코드를 고치지 않고, 같은 셈을 여기서 돌려 **옛 답이 달랐다**는 것을 보인다. */
    r = await open('fake:en-compact');
    const oldWay = await r.page.evaluate(() => {
      const list = speechSynthesis.getVoices();
      const v = list.find((x) => x.lang && x.lang.toLowerCase().startsWith('en'));   // 옛 pickVoice
      return v ? v.name : '';
    });
    const newWay = await r.page.evaluate(() => window.rtVoiceRead.pick('en', '').name);
    ok(oldWay === 'English Compact' && newWay === 'English Compact',
       '② 에서는 둘이 같다 — 고른 것이 마침 첫 번째였다');
    await r.ctx.close();
    r = await open(null);
    const oldWay2 = await r.page.evaluate(() => {
      const list = speechSynthesis.getVoices();
      const v = list.find((x) => x.lang && x.lang.toLowerCase().startsWith('en'));
      return v ? v.name : '';
    });
    const newWay2 = await r.page.evaluate(() => window.rtVoiceRead.pick('en', '').name);
    ok(oldWay2 === 'English Compact' && newWay2 === 'English Premium',
       `되돌림 실증: 옛 길은 "${oldWay2}", 지금은 "${newWay2}" — 옛 길로 두면 ①이 붉다`);
    await r.ctx.close();

    console.log(`\n전부 통과 (${checks}건)`);
  } finally {
    await b.close();
    srv.close();
  }
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
