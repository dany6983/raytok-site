// samples/voice_check_test.js — QR 진입 때 그 언어 음성이 있는지 보는가 (B 24, 2026-10-17)
//
// 가리는 것 셋 (§20 · D-70 — **모름은 없음이 아니다**):
//   have=1        있다        → 알림 숨김
//   have=0        없다        → 그 자리에서 한 줄, 자막 언어로
//   have=unknown  아직 모른다 → **아무 말도 하지 않는다** (없다고 하면 멀쩡한 폰을 막는다)
// 그리고 목록이 **늦게 차는** 경우를 돈다 — 브라우저가 빈 배열을 주고 뒤에 채우는 일이 흔하다.
// 목을 채워 놓고 도는 시험은 "답이 온다" 만 본 것이다(§20).
//
// 돌리기: node samples/voice_check_test.js   (playwright 필요)
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');

console.log('=== QR 진입 음성 검사 (voice_check) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf-8'));

/* 브라우저의 음성 목록을 **우리가 정한 대로** 만든다. mode:
     'ready'  — 처음부터 목록이 있다
     'late'   — 처음엔 빈 배열, 1.2초 뒤에 차고 voiceschanged 가 온다 (흔한 실기)
     'never'  — 끝까지 빈 배열 (unknown 이어야 한다)
     'noapi'  — speechSynthesis 자체가 없다 */
function fakeVoices(mode, langs) {
  return `(() => {
    const LANGS = ${JSON.stringify(langs)};
    const make = (l, i) => ({ lang: l, name: 'Fake ' + l + i, voiceURI: 'fake:' + l, localService: true, default: i === 0 });
    if ('${mode}' === 'noapi') { try { delete window.speechSynthesis; } catch (e) {} 
      Object.defineProperty(window, 'speechSynthesis', { get: () => undefined, configurable: true }); return; }
    let list = '${mode}' === 'ready' ? LANGS.map(make) : [];
    const api = {
      getVoices: () => list,
      speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
      onvoiceschanged: null, speaking: false, paused: false, pending: false
    };
    Object.defineProperty(window, 'speechSynthesis', { get: () => api, configurable: true });
    if ('${mode}' === 'late') {
      setTimeout(() => { list = LANGS.map(make); if (typeof api.onvoiceschanged === 'function') api.onvoiceschanged(); }, 1200);
    }
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

  async function open(mode, langs, lang, waitMs = 1000) {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (/voice_check/.test(m.text())) logs.push(m.text()); });
    await page.addInitScript(fakeVoices(mode, langs));
    await page.goto(`${base}/web/listener/?lang=${lang}`, { waitUntil: 'load' });
    await page.waitForTimeout(waitMs);
    const seen = await page.evaluate(() => (window.__rtVoiceCheck || []).map((x) => ({ lang: x.lang, have: x.have })));
    const shown = await page.evaluate(() => {
      const el = document.getElementById('voice-notice');
      /* ★ 10-26 (B): 전에는 `el.style.display`(**inline** 값)만 봤다. 10-26 에 띠 셋의
       * 같은 꼴을 class 하나(`.notice-band`)로 모으면서 숨김이 inline 이 아니라 CSS 가
       * 되자, 안 띄운 띠가 **"보인다"로 찍혔다**. 재는 것을 **실제로 그려지는 값**으로
       * 바꾼다 — 숨긴 자리가 inline 이든 class 든 같은 답이 나온다.
       * (부모까지 보는 `offsetParent` 는 안 쓴다: 이 띠는 들어가기 전 화면에서도 떠야
       *  하고 그때는 부모가 숨어 있다 — 그러면 "없으면 알린다"가 거짓으로 붉어진다.) */
      return el ? { visible: getComputedStyle(el).display !== 'none', text: el.textContent } : null;
    });
    return { ctx, page, logs, seen, shown };
  }

  try {
    /* ① 있다 — 알림 없음 */
    let r = await open('ready', ['vi-VN', 'en-US'], 'vi');
    ok(r.seen.some((x) => x.lang === 'vi' && x.have === 1), `있으면 have=1 (${JSON.stringify(r.seen)})`);
    ok(r.shown && !r.shown.visible, '있으면 알림을 띄우지 않는다');
    ok(r.logs.some((l) => /voice_check lang=vi have=1/.test(l)), `기록 한 줄 (${r.logs[0] || '없음'})`);
    await r.ctx.close();

    /* ② 없다 — 그 자리에서 한 줄, **자막 언어로** */
    r = await open('ready', ['en-US', 'ja-JP'], 'ne');
    ok(r.seen.some((x) => x.lang === 'ne' && x.have === 0), `없으면 have=0 (${JSON.stringify(r.seen)})`);
    ok(r.shown && r.shown.visible, '없으면 그 자리에서 알린다 (연결 전)');
    ok(r.shown.text.includes(dict.strings.voice_absent_notice.ne),
       `알림이 자막 언어(ne)로 뜬다 — "${r.shown.text.slice(0, 40)}…"`);
    await r.ctx.close();

    /* ③ 늦게 찬다 — 처음엔 빈 배열, 1.2초 뒤에 온다. **기다렸다가** 제대로 알려야 한다 */
    r = await open('late', ['en-US'], 'ne', 2200);
    ok(r.seen.some((x) => x.lang === 'ne' && x.have === 0),
       `늦게 차도 결국 have=0 으로 안다 (${JSON.stringify(r.seen)})`);
    ok(!r.seen.some((x) => x.have === 'unknown'),
       '기다렸으므로 unknown 으로 끝나지 않는다 (§20 늦은 답)');
    ok(r.shown && r.shown.visible, '늦게 찬 뒤에 알림이 뜬다');
    await r.ctx.close();

    /* ③-b 늦게 차고 **음성이 있는** 경우 — 섣불리 "없다"고 띄웠다가 지우지 않는다 */
    r = await open('late', ['ne-NP', 'en-US'], 'ne', 2200);
    ok(r.seen.some((x) => x.lang === 'ne' && x.have === 1), '늦게 찬 목록에 있으면 have=1');
    ok(r.shown && !r.shown.visible, '늦게 차는 동안 "없다"를 띄우지 않았다 (깜빡임 없음)');
    await r.ctx.close();

    /* ④ 끝까지 비었다 — **모름.** 없다고 말하지 않는다 (D-70) */
    r = await open('never', [], 'ne', 3800);
    ok(r.seen.some((x) => x.lang === 'ne' && x.have === 'unknown'),
       `끝까지 비면 have=unknown (${JSON.stringify(r.seen)})`);
    ok(r.shown && !r.shown.visible, '모를 때는 알리지 않는다 — 멀쩡한 폰을 막지 않는다 (D-70)');
    ok(r.logs.some((l) => /have=unknown/.test(l)), '모름도 기록에는 남는다');
    await r.ctx.close();

    /* ⑤ 브라우저에 speechSynthesis 가 아예 없다 — 소리 길이 없으니 자막만 */
    r = await open('noapi', [], 'ne');
    ok(r.seen.some((x) => x.have === 'no_api'), `API 가 없으면 have=no_api (${JSON.stringify(r.seen)})`);
    ok(r.shown && r.shown.visible, 'API 가 없으면 자막만이라고 알린다');
    await r.ctx.close();

    /* ⑥ 언어를 바꾸면 **그 언어로 다시** 본다 (전에는 한 번 알리면 끝이었다) */
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.addInitScript(fakeVoices('ready', ['en-US', 'ja-JP']));
    await page.goto(`${base}/web/listener/`, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await page.selectOption('#lang-select', 'ja');
    await page.waitForTimeout(800);
    await page.selectOption('#lang-select', 'ne');
    await page.waitForTimeout(800);
    const seen2 = await page.evaluate(() => (window.__rtVoiceCheck || []).map((x) => x.lang + '=' + x.have));
    const vis2 = await page.evaluate(() => {
      const el = document.getElementById('voice-notice');
      return el ? el.style.display !== 'none' : null;
    });
    ok(seen2.includes('ja=1'), `일본어로 바꾸면 ja=1 (${seen2.join(' · ')})`);
    ok(seen2.includes('ne=0'), '네팔어로 바꾸면 ne=0');
    ok(vis2 === true, '음성 있는 언어 → 없는 언어로 바꾸면 그때 알린다');

    // 되돌림 실증 — 언어마다 다시 보지 않으면(한 번 알리고 끝) ne=0 이 안 생긴다
    let reverted = false;
    try { assert.ok(!seen2.includes('ne=0'), 'ne 를 다시 보지 않았다'); } catch (e) { reverted = true; }
    ok(reverted === true, '언어를 바꿀 때 다시 보지 않으면 붉어진다 (되돌림 실증)');
    await ctx.close();
  } finally {
    await b.close();
    srv.close();
  }

  console.log(`\n전부 통과 (${checks}건)`);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
