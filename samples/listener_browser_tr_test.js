/* samples/listener_browser_tr_test.js — **손님 폰이 번역한다** (결정장부 51, 대표님 10-20 18:04)
 *
 * 설계: 원문이 가고 **받는 폰이 번역**한다(분산 — 발열·부하가 한쪽에 안 쏠린다).
 * 웹에서 그 길은 손님이 누르는 **브라우저 「페이지 번역」**이다. 페이지 코드가 폰의 번역기를
 * 부를 수는 없다 — 우리가 하는 일은 **번역되게 두는 것**과 **번역됐는지 세는 것**이다.
 *
 * ⚠ 크로미움은 이 자리에서 **실제로 번역하지 않는다**(번역은 브라우저 기능이고 모델이 있어야
 *   한다). 그래서 번역을 **흉내내지 않고**, 브라우저가 하는 일과 **같은 모양**으로 — 즉
 *   자막의 글자를 **밖에서** 바꿔 — 우리 쪽 판정이 도는지 센다. 사파리·삼성 인터넷에서
 *   정말 번역되는지는 **모름**이고, 그건 `docs/demo-web-gaps.md` 에 그렇게 적는다(D-11).
 *
 * 돌리기: node samples/listener_browser_tr_test.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

(async () => {
  console.log('=== 손님 폰이 번역한다 — 브라우저 「페이지 번역」이 설 자리 ===\n');
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const logs = [];
  page.on('console', (m) => { if (/guest_tr=/.test(m.text())) logs.push(m.text()); });

  try {
    await page.goto(`${base}/web/listener/?lang=vi`);
    await page.waitForSelector('#lang-select');

    /* ① 브라우저에게 **무슨 말의 페이지인지** 알린다 — 원문 언어다.
       손님 언어로 적으면 브라우저가 "이미 그 말이네" 하고 번역을 **안 권한다**. */
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    ok(htmlLang === 'ko', `<html lang> 이 원문 언어다 (${htmlLang}) — 손님 언어(vi)가 아니다`);

    /* ② 둘레는 번역 금지 — 이미 손님 말이고, 방 코드·단추는 기능이 걸려 있다 */
    const chrome = await page.evaluate(() => {
      const q = (sel) => { const e = document.querySelector(sel); return e ? e.getAttribute('translate') : 'none'; };
      return { room: q('#room-input'), sel: q('#lang-select'), status: q('#status-text'),
               join: q('#btn-join'), tts: q('#btn-toggle-tts') };
    });
    for (const [k, v] of Object.entries(chrome)) {
      ok(v === 'no', `둘레 ${k} 는 번역 금지 (translate=${v})`);
    }

    /* ③ 자막 칸은 **번역 금지가 아니다** — 여기가 번역돼야 한다 */
    await page.evaluate(() => {
      srcLang = 'ko';
      addLine({ seq: 1, text: '안전모를 반드시 착용하십시오.', tr: {}, at: Date.now(), broadcast: true });
    });
    const sub = await page.evaluate(() => {
      const el = document.querySelector('.msg-text');
      return { lang: el.getAttribute('lang'), tr: el.getAttribute('translate'),
               head: document.querySelector('.msg-src').getAttribute('translate'),
               text: el.textContent, memo: el.getAttribute('data-src-text') };
    });
    ok(sub.lang === 'ko', `자막 칸에 원문 언어가 적힌다 (lang=${sub.lang})`);
    ok(sub.tr === null, '자막 칸에는 번역 금지를 붙이지 않는다 — 여기가 번역될 자리다');
    ok(sub.head === 'no', '줄 머리(#번호·언어 코드)는 번역 금지');
    ok(sub.memo === sub.text, '우리가 쓴 글자를 적어 둔다 — 밖에서 바뀌면 그때가 번역된 때다');

    /* ④ 아직 아무도 번역하지 않았다 */
    ok((await page.evaluate(() => rtGuestTr.mode())) === 'none', '번역 전에는 guest_tr=none');

    /* ⑤ 브라우저가 번역한 것과 **같은 모양** — 글자를 밖에서 바꾼다 */
    await page.evaluate(() => {
      document.querySelector('.msg-text').textContent = 'Luôn đội mũ bảo hộ.';
    });
    await page.waitForFunction(() => rtGuestTr.mode() === 'browser', null, { timeout: 4000 }).catch(() => {});
    ok((await page.evaluate(() => rtGuestTr.mode())) === 'browser',
       '밖에서 글자가 바뀌면 **번역됐다**고 센다 (guest_tr=browser)');
    ok(logs.some((l) => l.includes('guest_tr=browser')), `기록 한 줄이 남는다 (${logs.join(' · ') || '없음'})`);

    /* ⑥ 되돌림 실증 — 우리가 쓰는 것은 번역으로 세지 않는다 */
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page2.goto(`${base}/web/listener/?lang=vi`);
    await page2.waitForSelector('#lang-select');
    await page2.evaluate(() => {
      srcLang = 'ko';
      addLine({ seq: 1, text: '첫 줄', tr: {}, at: Date.now(), broadcast: true });
      addLine({ seq: 2, text: '둘째 줄', tr: {}, at: Date.now(), broadcast: true });
    });
    await page2.waitForTimeout(300);
    ok((await page2.evaluate(() => rtGuestTr.mode())) === 'none',
       '우리가 줄을 더 쓰는 것은 번역으로 세지 않는다 (되돌림 실증 ①)');

    /* 되돌림 실증 ② — 적어 둔 글자를 지우면 판정이 못 센다(그 메모가 근거라는 증거) */
    await page2.evaluate(() => {
      const el = document.querySelector('.msg-text');
      el.removeAttribute('data-src-text');
      el.textContent = 'Dòng đầu tiên';
    });
    await page2.waitForTimeout(300);
    ok((await page2.evaluate(() => rtGuestTr.mode())) === 'none',
       '적어 둔 글자가 없으면 못 센다 — 그 메모가 판정의 근거다 (되돌림 실증 ②)');
    await page2.close();
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\n${fail === 0 ? '전부 통과' : '붉다'} (${pass + fail}건${fail ? `, 실패 ${fail}` : ''})`);
  process.exit(fail === 0 ? 0 : 1);
})();
