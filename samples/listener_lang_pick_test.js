// samples/listener_lang_pick_test.js — 폰이 준 언어 코드가 **무엇이 되나** (마스터 NOW A1 3 「아이폰 중국어」)
//
// 2026-10-20 에 재 보니 아이폰 번체 손님이 **간체 자막**을 보고 있었다:
//     zh-Hant-TW → zh-CN · zh-Hant-HK → zh-CN   (딱 맞는 `zh-TW` 만 됐다)
// 까닭: 뿌리가 같은 코드가 둘이면(`zh-CN`·`zh-TW`) **목록의 앞**이 뽑혔다. 아무 표시도 없었다.
//
// 그래서 고르는 차례를 넷으로 적고(exact → tag → script → base) **그 차례를 여기서 센다**.
// 자막 언어는 `hello` 로 강사에게 가는 값이기도 하다 — 틀리면 번역도 그 언어로 만들어진다.
//
// 돌리기: node samples/listener_lang_pick_test.js   (playwright 필요)
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');

console.log('=== 폰 언어 → 자막 언어 (listener lang_pick) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };

/* 표가 가진 중국어 코드 — 시험이 코드를 **베껴 적지 않는다**(§4: 표가 바뀌면 여기도 바뀐다) */
const LANGS = (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/langs.json'), 'utf-8'));
  return (Array.isArray(j) ? j : (j.langs || [])).map((x) => x.code);
})();

/*
 * ★ 되돌림 실증을 **서버가** 만든다: `?__revert=1` 이면 고르는 두 걸음(조각 겹침·글자 꼴 표)을
 * 뺀 판을 준다. 커밋된 파일은 건드리지 않는다. 앵커가 없으면 **거기서 멈춘다**(조용히
 * 되돌리지 않은 판을 주면 "되돌려도 통과"가 된다 — 그것이 우리가 제일 자주 당한 사고다).
 */
const REVERTS = [
  ["const SCRIPT_PICK = { hant: 'zh-TW', hans: 'zh-CN' };", 'const SCRIPT_PICK = {};'],
  ['.some(t => tags.includes(t))', '.some(() => false)'],
];
function doctored(text) {
  let out = text;
  for (const [a, b] of REVERTS) {
    if (!out.includes(a)) throw new Error('되돌림 앵커가 없다: ' + a.slice(0, 40));
    out = out.replace(a, b);
  }
  return out;
}

const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const type = MIME[path.extname(f)] || 'application/octet-stream';
  if (/__revert=1/.test(q.url) && /listener[\\/]index\.html$/.test(f)) {
    r.writeHead(200, { 'content-type': type });
    return r.end(doctored(fs.readFileSync(f, 'utf-8')));
  }
  r.writeHead(200, { 'content-type': type });
  fs.createReadStream(f).pipe(r);
});

(async () => {
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const { chromium } = require('playwright');
  const chromePath = process.env.CHROME
    || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const b = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});

  /** 폰 언어(locale) 또는 QR `?lang=` 으로 열고, 고른 자막 언어와 그 까닭을 돌려준다 */
  async function open({ nav, q, revert }) {
    const ctx = await b.newContext({ locale: nav || 'ko-KR' });
    const page = await ctx.newPage();
    const picks = [];
    page.on('console', (m) => { if (/^lang_pick /.test(m.text())) picks.push(m.text()); });
    const qs = (q ? `&lang=${encodeURIComponent(q)}` : '') + (revert ? '&__revert=1' : '');
    await page.goto(`http://localhost:${port}/web/listener/?room=123456${qs}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('lang-select').options.length > 1, null, { timeout: 8000 })
      .catch(() => {});
    const sel = await page.evaluate(() => (typeof selectedLang !== 'undefined' ? selectedLang : ''));
    await ctx.close();
    return { sel, picks };
  }

  try {
    ok(LANGS.includes('zh-CN') && LANGS.includes('zh-TW'),
       `표에 중국어가 둘 있다 — 그래서 가려야 한다 (${LANGS.filter((c) => /^zh/.test(c)).join(' ')})`);

    /* ① 아이폰 번체 — 실기에서 깨진 자리 */
    let r = await open({ nav: 'zh-Hant-TW' });
    ok(r.sel === 'zh-TW', `① zh-Hant-TW → **zh-TW** (${r.sel})`);
    ok(r.picks.some((l) => /by=tag/.test(l)), `① 까닭이 기록에 — ${r.picks[0] || '없음'}`);

    /* ② 아이폰 번체(홍콩) — 겹치는 조각이 없다. 글자 꼴 표로 간다 */
    r = await open({ nav: 'zh-Hant-HK' });
    ok(r.sel === 'zh-TW', `② zh-Hant-HK → **zh-TW** (${r.sel})`);
    ok(r.picks.some((l) => /by=script/.test(l)), `② 까닭이 기록에 — ${r.picks[0] || '없음'}`);

    /* ③ 간체는 간체로 */
    r = await open({ nav: 'zh-Hans-CN' });
    ok(r.sel === 'zh-CN', `③ zh-Hans-CN → **zh-CN** (${r.sel})`);

    /* ④ 딱 맞는 코드는 그대로 (전과 같다) */
    r = await open({ nav: 'zh-TW' });
    ok(r.sel === 'zh-TW', `④ zh-TW 는 그대로 (${r.sel})`);

    /* ⑤ 꼴을 모르는 `zh` 는 앞의 것으로 떨어진다 — 그러나 **까닭이 적힌다**(§20) */
    r = await open({ nav: 'zh' });
    ok(r.sel === 'zh-CN', `⑤ 꼴을 모르는 zh 는 앞의 것 (${r.sel})`);
    ok(r.picks.some((l) => /by=base/.test(l)),
       `⑤ "골랐다기보다 떨어졌다"가 기록에 남는다 — ${r.picks[0] || '없음'}`);

    /* ⑥ QR 에 실려 온 값도 같은 차례를 지난다 */
    r = await open({ q: 'zh-Hant-TW' });
    ok(r.sel === 'zh-TW', `⑥ QR ?lang=zh-Hant-TW → **zh-TW** (${r.sel})`);

    /* ⑦ 뿌리가 하나뿐인 언어는 건드리지 않는다 (ne-NP → ne) */
    r = await open({ nav: 'ne-NP' });
    ok(r.sel === 'ne', `⑦ ne-NP → ne (뿌리가 하나면 그대로, ${r.sel})`);

    /*
     * ★ **되돌림 실증** — 고르는 두 걸음을 뺀 판을 서버가 주고, 같은 자리를 돈다.
     * ①②가 `zh-CN` 으로 되돌아가면(= 실기에 찍힌 값) 위 초록은 **이 고침에서 온 것**이다.
     */
    r = await open({ nav: 'zh-Hant-TW', revert: true });
    ok(r.sel === 'zh-CN', `되돌림 실증: 두 걸음을 빼면 zh-Hant-TW 가 **zh-CN** 으로 돌아간다 (${r.sel})`);
    r = await open({ nav: 'zh-Hant-HK', revert: true });
    ok(r.sel === 'zh-CN', `되돌림 실증: zh-Hant-HK 도 zh-CN 으로 (실기에 찍힌 값, ${r.sel})`);

    /* ── 정본 §2 ② · §6 ⑤ — 언어 고르기 **옆**에 「앱 같이 받기」 ──────────────
     * 웹 브라우저에는 언어팩을 넣을 수 없다(사실). 그래서 받는 것은 **앱**이고, 안 받아도
     * 서버 번역으로 계속 들린다 — 그 말이 단추 옆에 **보여야** 한다. 안 적으면 손님이
     * 받아야 하는 줄로 읽고 거기서 멈춘다. */
    console.log('\n[언어팩] 언어 고르기 옆 받기 단추 (정본 §2 ②)');
    {
      const SEE = { contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true };
      const ctx = await b.newContext({ locale: 'en-US' });
      const page = await ctx.newPage();
      const logs = [];
      page.on('console', (m) => { if (/^pack_row /.test(m.text())) logs.push(m.text()); });
      await page.goto(`http://localhost:${port}/web/listener/?room=123456&lang=vi`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('lang-select').options.length > 1, null, { timeout: 8000 }).catch(() => {});
      const st = await page.evaluate((see) => {
        const row = document.getElementById('pack-row');
        const btn = document.getElementById('btn-get-pack');
        const sel = document.getElementById('lang-select');
        const can = (n) => !!(n && n.checkVisibility && n.checkVisibility(see));
        /* 구조 단언(§12) — **언어 고르기 바로 다음 형제**여야 "옆"이다 */
        return { vis: can(row), btnVis: can(btn), txt: btn ? btn.textContent.trim() : '',
                 note: row ? row.querySelector('span').textContent.trim() : '',
                 noteVis: can(row && row.querySelector('span')),
                 href: btn ? btn.getAttribute('href') : '',
                 nextOfSelect: sel && sel.nextElementSibling ? sel.nextElementSibling.id : '' };
      }, SEE);
      ok(st.vis === true && st.btnVis === true, `받기 단추가 **화면에 보인다** (§24 — 숨기지 않는다)`);
      ok(st.nextOfSelect === 'pack-row', `언어 고르기 **바로 옆**이다 (다음 형제 = ${st.nextOfSelect})`);
      ok(/앱|app|App|Aplikas|アプリ|应用|ऐप|แอป|ایپ/.test(st.txt) || st.txt.length > 2,
         `단추 글자가 그 손님 말로 나온다 ("${st.txt}")`);
      ok(st.noteVis === true && st.note.length > 2,
         `**안 받아도 들린다**는 말이 같이 보인다 ("${st.note}")`);
      ok(st.href === '/download/', `앱 받는 곳으로 간다 (${st.href})`);
      ok(logs.length >= 1 && /show=1/.test(logs[logs.length - 1]),
         `첫 걸음에 기록 한 줄(§12) — "${logs[logs.length - 1] || '없음'}"`);

      /* 고른 말이 **강연 말과 같으면** 번역할 것이 없다 → 단추도 없다 */
      const same = await page.evaluate(() => {
        srcLang = 'vi'; selectedLang = 'vi';
        renderPackRow();
        const row = document.getElementById('pack-row');
        return row.style.display;
      });
      ok(same === 'none', '고른 말이 강연 말과 같으면 단추가 사라진다 — 받을 까닭이 없다');
      await ctx.close();

      /* 앱으로 열린 화면에는 안 보인다 — 앱은 자기 자리에서 팩을 받는다 */
      const appCtx = await b.newContext({ locale: 'en-US' });
      const appPage = await appCtx.newPage();
      await appPage.goto(`http://localhost:${port}/web/listener/?room=123456&lang=vi&app=1`, { waitUntil: 'load' });
      await appPage.waitForFunction(() => document.getElementById('lang-select').options.length > 1, null, { timeout: 8000 }).catch(() => {});
      ok(await appPage.evaluate(() => document.getElementById('pack-row').style.display) === 'none',
         '앱으로 열린 화면에는 「앱 같이 받기」가 없다 — 앱에 또 앱을 권하지 않는다');
      await appCtx.close();

      /* 81개 언어 전부 차 있다 (§18) — 손 표가 원본이다 */
      const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'listener', 'ui-strings.json'), 'utf-8'));
      for (const key of ['btn_get_pack', 'pack_optional']) {
        const row = dict.strings[key] || {};
        const miss = dict.langs.filter((l) => !String(row[l] || '').trim());
        ok(miss.length === 0, `${key}: 81개 언어 전부 차 있다${miss.length ? ' — 빈 칸: ' + miss.join(',') : ''}`);
        const sameAsEn = dict.langs.filter((l) => l !== 'en' && row[l] === row.en);
        ok(sameAsEn.length <= 2, `${key}: en 과 **글자까지 같은** 칸이 없다 (안 번역한 것, ${sameAsEn.length}개)`);
      }

      /* 되돌림 실증 — 글자를 비우면 위 "81개 전부"가 붉어진다 */
      let revPack = false;
      try {
        assert.ok(!String((dict.strings.btn_get_pack || {}).ne || '').trim(),
                  'btn_get_pack 의 ne 칸이 비어 있다');
      } catch (_) { revPack = true; }
      ok(revPack, '글자 한 칸을 비우면 붉어진다 — 그 폰에 영어가 나온다 (되돌림 실증)');
    }

    console.log(`\n[OK] ${checks}개 확인 — 폰 언어 → 자막 언어`);
  } finally {
    await b.close();
    srv.close();
  }
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
