// samples/first_load_bytes_test.js — 손님 폰 **첫 화면이 받는 양** 시험 (B 19, 2026-10-17)
//
// 왜 있나: 손님은 QR 을 찍고 데이터로 받는다. 글자 스트리밍은 2시간에 0.2~0.4 MB 인데,
// **첫 화면 한 번**이 그보다 크면 안 된다. 10-17 전에는 81개 언어 사전을 통째로 받았다:
//   web/listener  238 KB (gz 85 KB) · join  116 KB (gz 46 KB) — 쓰는 것은 **한 언어**다.
// 지금은 조각 하나만 받는다. 이 시험이 **진짜 브라우저로** 첫 화면을 열어 받은 것을 센다.
// 붉어지면 "무엇이 다시 커졌나" 가 목록에 그대로 찍힌다.
//
// 돌리기: node samples/first_load_bytes_test.js   (playwright 필요)
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

console.log('=== 첫 화면이 받는 양 (청취 · join) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

/* 첫 화면 한도 — 지금 재는 값에 **여유를 두고** 잠근다. 통째 사전(gz 46~85 KB)이
   다시 섞이면 넘는다. 기능을 더해 넘게 되면 그때 이 수와 이유를 같이 고친다. */
/* 10-17 B 21(주석 빼기) 뒤 33.0 KB — 한도를 그만큼 조였다.
   10-20: 36 → **37 KB**. 손님에게 가는 것 둘이 늘었다 —
     · 대체어 음성 표(`web/common/voice-fallback.js`, PR #7) 0.9 KB — **미룰 수 없다**:
       참여 **전** 「이 언어 음성 없음」 띠가 이 표를 본다(B 24). 미뤘다가 그 띠가 깨지는 것을
       시험이 잡았다. 대신 생성기가 **짧게 내도록** 고쳤다(1.3 → 0.9 KB)
     · 「깔는 방법」 안내(PR #12) — 한 언어 조각에 182 바이트
   둘 다 손님이 **실제로 쓰는 것**이라 뺄 자리가 아니었다. 올린 폭은 1 KB 하나뿐이고,
   자물쇠는 그대로다 — 다음에 또 넘치면 여기가 먼저 붉어진다. */
const LIMIT_GZ = { '/web/listener/': 37 * 1024, '/join/': 12 * 1024 };

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
  const chromePath = process.env.CHROME || undefined;
  const b = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});

  try {
    for (const [route, limit] of Object.entries(LIMIT_GZ)) {
      const ctx = await b.newContext();
      const page = await ctx.newPage();
      const got = [];
      page.on('response', async (res) => {
        const u = new URL(res.url());
        if (u.origin !== base) return;                       // 바깥은 안 센다 (첫 화면엔 없다)
        try {
          const body = await res.body();
          got.push({ p: u.pathname, raw: body.length, gz: zlib.gzipSync(body, { level: 9 }).length });
        } catch (e) {}
      });
      await page.goto(`${base}${route}?lang=vi`, { waitUntil: 'load' });
      await page.waitForTimeout(700);                        // 글자 조각까지 받을 틈
      await ctx.close();

      const totRaw = got.reduce((a, g) => a + g.raw, 0);
      const totGz = got.reduce((a, g) => a + g.gz, 0);
      const list = got.slice().sort((x, y) => y.gz - x.gz)
        .map((g) => `${g.p} ${(g.gz / 1024).toFixed(1)}KB`).join(' · ');
      console.log(`  ${route} 받은 것 ${got.length}개 · raw ${(totRaw / 1024).toFixed(0)}KB · gz ${(totGz / 1024).toFixed(1)}KB`);
      console.log(`    ${list}`);

      ok(got.length > 0, `${route}: 첫 화면이 무엇이든 받았다 (안 받으면 아래 셈이 거짓이 된다)`);
      ok(totGz <= limit, `${route}: 첫 화면 gz ${(totGz / 1024).toFixed(1)}KB ≤ ${(limit / 1024).toFixed(0)}KB`);

      /* ★ 통째 사전을 **받지 않았는가** — 이것이 B 19 의 본문이다 */
      const whole = got.filter((g) => /ui-strings\.json$/.test(g.p));
      ok(whole.length === 0, `${route}: 81개 언어 통째 사전을 받지 않았다 (${whole.map((w) => w.p).join(',') || '없음'})`);

      /* 그리고 **조각은 받았는가** — 안 받았으면 글자가 안 뜬다(빼기만 하고 못 고친 것) */
      const slice = got.filter((g) => /ui-strings\/[a-z-]+\.json$/i.test(g.p));
      ok(slice.length >= 1, `${route}: 쓸 언어 조각을 받았다 (${slice.map((x) => x.p).join(', ') || '없음'})`);
    }

    /* 화면에 **그 언어가 떴는가** — 양만 줄이고 글자가 안 나오면 고친 것이 아니다 */
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf-8'));
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/web/listener/?lang=vi`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const shown = await page.title();
    ok(shown === dict.strings.page_title.vi,
       `청취: 조각만 받고도 제목이 베트남어다 ("${shown}")`);

    /* 언어를 바꾸면 **그 조각을 받아** 글자가 바뀐다 — 조각 하나만 받는 설계의 구멍 자리.
       주소에 ?lang= 이 있으면 그것이 UI 언어를 못 박으므로(determineLanguage ①) 여기서는
       빈 주소로 연다. 그러면 고른 자막 언어가 UI 언어가 된다(③). */
    const ctx2 = await b.newContext();
    const page2 = await ctx2.newPage();
    const asked = [];
    page2.on('response', (res) => { if (/ui-strings\//.test(res.url())) asked.push(new URL(res.url()).pathname); });
    await page2.goto(`${base}/web/listener/`, { waitUntil: 'load' });
    await page2.waitForTimeout(700);
    await page2.selectOption('#lang-select', 'ja');
    await page2.waitForTimeout(700);
    const ja = await page2.title();
    ok(ja === dict.strings.page_title.ja, `청취: 언어를 바꾸면 그 조각을 받아 일본어가 된다 ("${ja}")`);
    ok(asked.some((u) => u.endsWith('/ja.json')), `그때 ja 조각을 **그 자리에서** 받았다 (${asked.join(', ')})`);

    // 되돌림 실증 — 바뀌지 않고 처음 언어로 굳으면 붉다
    let revertFailed = false;
    try { assert.notStrictEqual(ja, dict.strings.page_title.ja, '언어를 바꿨는데 글자가 그대로다'); }
    catch (e) { revertFailed = true; }
    ok(revertFailed === true, '언어를 바꿔도 글자가 굳어 있으면 붉어진다 (되돌림 실증)');
    await ctx2.close();
    await ctx.close();
  } finally {
    await b.close();
    srv.close();
  }

  console.log(`\n전부 통과 (${checks}건)`);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
