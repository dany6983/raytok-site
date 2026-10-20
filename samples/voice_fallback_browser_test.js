// samples/voice_fallback_browser_test.js — 대체어 음성이 **손님 폰에서** 일어나는가 (site NOW 1)
//
// `voice_fallback_test.js` 는 표를 본다. 이 시험은 **페이지가 그 표대로 움직이는가**를 본다 —
// 목소리 목록을 우리가 정해 놓고(가짜) 네 경우를 돈다:
//   ① ne 자막 · hi 음성만  → 대체어로 읽는다. 기록 `voice_fallback lang=ne use=hi` · **알림은 숨는다**
//   ② lo 자막 · th 음성만  → **대체하지 않는다**(꼴이 다르다). 자막만이라고 알린다
//   ③ uz 자막 · ru 음성만  → 앱 표에 uz 가 **없어서** 대체하지 않는다 (보고에 적은 자리)
//   ④ ne 자막 · ne 음성 있음 → 대체 기록이 **없다** (그 언어로 읽는다)
//   ⑤ 언어를 ne→ja→ne 로 오가도 기록은 **짝마다 한 번**이다 (300줄이 300줄이 되지 않는다)
//
// 가짜가 실기와 다르면 시험이 거짓말을 한다(D-11) — 그래서 `voice_check_test.js` 의 가짜를
// **그대로** 쓴다(같은 꼴: lang·name·voiceURI·localService + 늦게 차기).
//
// 돌리기: node samples/voice_fallback_browser_test.js   (playwright 필요)
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');

console.log('=== 대체어 음성 — 손님 폰 (voice_fallback) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

function fakeVoices(langs) {
  return `(() => {
    const LANGS = ${JSON.stringify(langs)};
    const make = (l, i) => ({ lang: l, name: 'Fake ' + l + i, voiceURI: 'fake:' + l, localService: true, default: i === 0 });
    const list = LANGS.map(make);
    const api = {
      getVoices: () => list,
      speak: (u) => { (window.__rtSpoke = window.__rtSpoke || []).push({ lang: u && u.lang, voice: u && u.voice && u.voice.voiceURI }); },
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

  async function open(voiceLangs, lang, waitMs = 900) {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (/voice_fallback/.test(m.text())) logs.push(m.text()); });
    await page.addInitScript(fakeVoices(voiceLangs));
    await page.goto(`${base}/web/listener/?lang=${lang}`, { waitUntil: 'load' });
    await page.waitForTimeout(waitMs);
    const used = await page.evaluate(() => (window.__rtVoiceFallback || []).map((x) => x.lang + '>' + x.use));
    const notice = await page.evaluate(() => {
      const el = document.getElementById('voice-notice');
      return el ? el.style.display !== 'none' : null;
    });
    const table = await page.evaluate(() => (window.rtVoiceFallback ? window.rtVoiceFallback.FINGERPRINT : ''));
    const why = await page.evaluate(() => ({
      asked: window.rtVoiceFallback ? window.rtVoiceFallback.voiceFallbackFor('ne') : 'no-table',
      check: (window.__rtVoiceCheck || []).map((x) => x.lang + '=' + x.have).join(' '),
      sel: (document.getElementById('lang-select') || {}).value || '',
      voices: (window.speechSynthesis && window.speechSynthesis.getVoices() || []).map((v) => v.lang).join(','),
    }));
    return { ctx, page, logs, used, notice, table, why };
  }

  try {
    /* ① 그 언어 음성이 없고 대체어 음성이 있다 — 읽는다 */
    let r = await open(['hi-IN', 'en-US'], 'ne');
    ok(!!r.table, `표가 페이지에 실렸다 (지문 ${r.table})`);
    ok(r.used.includes('ne>hi'),
       `① ne 를 hi 음성으로 읽는다 (${r.used.join(' ') || '없음'} · ${JSON.stringify(r.why)})`);
    ok(r.logs.some((l) => /voice_fallback lang=ne use=hi/.test(l)), `① 기록 한 줄 (${r.logs[0] || '없음'})`);
    ok(r.notice === false, '① 소리가 나므로 "음성 없음" 알림은 숨는다 — 알림이 거짓이 되지 않는다');
    await r.ctx.close();

    /* ② 꼴이 다른 짝 — 대체하지 않는다. 자막만이라고 알린다 */
    r = await open(['th-TH', 'en-US'], 'lo');
    ok(r.used.length === 0, `② lo 는 대체하지 않는다 (${r.used.join(' ') || '없음'}) — 타이 음성은 라오 글자를 못 읽는다`);
    ok(r.notice === true, '② 그래서 자막만이라고 알린다');
    await r.ctx.close();

    /* ③ 앱 표에 없는 언어 — 지어내지 않는다 (마스터 예시 uz→ru 가 앱 표에 없는 자리) */
    r = await open(['ru-RU', 'en-US'], 'uz');
    ok(r.used.length === 0, `③ uz 는 앱 표에 없어 대체하지 않는다 (${r.used.join(' ') || '없음'})`);
    ok(r.notice === true, '③ 알림은 그대로 뜬다 (소리가 안 나는 것이 사실이다)');
    await r.ctx.close();

    /* ④ 그 언어 음성이 있으면 대체는 **일어나지 않는다** */
    r = await open(['ne-NP', 'hi-IN'], 'ne');
    ok(r.used.length === 0, `④ ne 음성이 있으면 대체 기록이 없다 (${r.used.join(' ') || '없음'})`);
    ok(r.notice === false, '④ 알림도 없다');
    await r.ctx.close();

    /* ⑤ 기록은 짝마다 한 번 — 언어를 오가도 한 줄이다 */
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(fakeVoices(['hi-IN', 'ja-JP']));
    await page.goto(`${base}/web/listener/?lang=ne`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    await page.selectOption('#lang-select', 'ja');
    await page.waitForTimeout(400);
    await page.selectOption('#lang-select', 'ne');
    await page.waitForTimeout(700);
    const used5 = await page.evaluate(() => (window.__rtVoiceFallback || []).map((x) => x.lang + '>' + x.use));
    ok(used5.filter((x) => x === 'ne>hi').length === 1,
       `⑤ 오가도 기록은 한 줄이다 (${used5.join(' ') || '없음'})`);
    await ctx.close();

    /*
     * ⑥ **되돌림 실증** (D-09 · 이 저장소의 ⑨-1) — 페이지가 **표를 읽는가**.
     *
     * 표를 "아무 짝도 없다"로 바꿔 끼우고 같은 자리를 돈다. 대체가 사라지고 알림이
     * 돌아오면, ①의 초록은 **표를 읽은 결과**다. 어딘가에 `ne→hi` 를 박아 두었다면
     * 이 줄이 통과하지 않는다 — 그것이 되돌림이 증거가 되는 꼴이다.
     */
    {
      const ctx6 = await b.newContext();
      const page6 = await ctx6.newPage();
      await page6.addInitScript(fakeVoices(['hi-IN', 'en-US']));
      await page6.addInitScript(`Object.defineProperty(window, 'rtVoiceFallback', {
        get: () => ({ FINGERPRINT: 'stub', voiceFallbackFor: () => '', scriptOf: () => '' }),
        set: () => {}, configurable: true });`);
      await page6.goto(`${base}/web/listener/?lang=ne`, { waitUntil: 'load' });
      await page6.waitForTimeout(900);
      const used6 = await page6.evaluate(() => (window.__rtVoiceFallback || []).map((x) => x.lang + '>' + x.use));
      const notice6 = await page6.evaluate(() => {
        const el = document.getElementById('voice-notice');
        return el ? el.style.display !== 'none' : null;
      });
      ok(used6.length === 0, `⑥ 되돌림 실증: 표를 비우면 대체가 사라진다 (${used6.join(' ') || '없음'}) — 페이지가 표를 읽는다`);
      ok(notice6 === true, '⑥ 그리고 "음성 없음" 알림이 돌아온다 (①의 초록이 표에서 온 것이다)');
      await ctx6.close();
    }

    console.log(`\n[OK] ${checks}개 확인 — 대체어 음성 (손님 폰)`);
  } finally {
    await b.close();
    srv.close();
  }
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
