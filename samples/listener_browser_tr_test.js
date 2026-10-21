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

    /* ⑥-2 안내 띠 — 손님 말이 원문과 다를 때만. 「서버 번역으로」는 보조 길.
       §12: 칸을 넣으면 **구조 단언**(어느 부모의 어느 형제인지)을 같이 넣는다. */
    {
      const pageN = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await pageN.goto(`${base}/web/listener/?lang=vi`);
      await pageN.waitForSelector('#lang-select');
      const before = await pageN.evaluate(() => {
        const b = document.getElementById('tr-notice');
        return { exists: !!b, vis: b ? getComputedStyle(b).display !== 'none' : null,
                 noTr: b ? b.getAttribute('translate') : null,
                 nextIsVoice: !!(b && b.nextElementSibling && b.nextElementSibling.id === 'voice-notice'),
                 inChat: !!(b && b.closest('#chat-screen')) };
      });
      ok(before.exists && before.noTr === 'no', '안내 띠가 있고 **번역 금지**다 — 이미 손님 말이다');
      ok(before.nextIsVoice && before.inChat,
         '구조: 청취 화면 안, 「음성 없음」 띠 **바로 앞 형제** (§12 구조 단언)');
      ok(before.vis === false, '아직 방에 안 들어왔으면 띠가 없다');

      /* 참여한 뒤의 화면으로 둔다 — 띠와 단추는 **청취 화면** 안에 있어서 참여 전에는
         안 보인다(그게 맞다). 방에 붙는 길은 릴레이가 있어야 하므로 화면만 그 자리로 둔다. */
      await pageN.evaluate(() => {
        srcLang = 'ko'; selectedLang = 'vi';
        document.getElementById('join-screen') && (document.getElementById('join-screen').style.display = 'none');
        document.querySelectorAll('.screen').forEach((el) => { if (el.id !== 'chat-screen') el.style.display = 'none'; });
        document.getElementById('chat-screen').style.display = 'flex';
        renderTrNotice();
      });
      const shown = await pageN.evaluate(() => ({
        vis: getComputedStyle(document.getElementById('tr-notice')).display !== 'none',
        text: document.getElementById('tr-notice-text').textContent,
        btn: document.getElementById('btn-tr-server').textContent,
        log: rtTrNotice.log()
      }));
      ok(shown.vis === true, '손님 말이 원문과 다르면 띠가 보인다');
      ok(/trình duyệt/i.test(shown.text), `안내가 **손님 말**로 나온다 — "${shown.text.slice(0, 40)}"`);
      ok(/máy chủ/i.test(shown.btn), `단추도 손님 말이다 — "${shown.btn}"`);
      ok(shown.log.some((l) => /^tr_notice on=1 from=ko me=vi$/.test(l)),
         `첫 걸음에 기록 한 줄 (§12) — ${shown.log.join(' · ')}`);

      /* 같은 말이면 띠가 없다 — 번역할 것이 없다 (되돌림 실증 ③) */
      await pageN.evaluate(() => { selectedLang = 'ko'; renderTrNotice(); });
      ok((await pageN.evaluate(() => getComputedStyle(document.getElementById('tr-notice')).display !== 'none')) === false,
         '손님 말이 원문과 같으면 띠가 없다 (되돌림 실증 ③)');

      /* 단추를 누르면 보조 길 — 띠가 사라지고 guest_tr=server */
      await pageN.evaluate(() => { selectedLang = 'vi'; renderTrNotice(); });
      await pageN.click('#btn-tr-server');
      ok((await pageN.evaluate(() => rtGuestTr.mode())) === 'server', '단추를 누르면 guest_tr=server');
      ok((await pageN.evaluate(() => getComputedStyle(document.getElementById('tr-notice')).display !== 'none')) === false,
         '고른 뒤에는 띠가 사라진다 — 두 번 묻지 않는다');
      await pageN.close();
    }

    /* ⑦ 소리는 **번역된 글자**를 읽는다 — 번역 전 원문을 읽으면 손님은 모르는 말을 듣는다.
       말하기를 기록으로 바꿔 놓고(가짜가 실기보다 느슨하지 않게 **같은 함수**를 거친다) 센다. */
    const page3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page3.addInitScript(() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: { getVoices: () => [{ lang: 'vi-VN', name: 'vi' }], cancel() {},
                 speak: (u) => { if (u && u.text) window.__spoken.push(u.text); } }
      });
    });
    await page3.goto(`${base}/web/listener/?lang=vi`);
    await page3.waitForSelector('#lang-select');
    /* 방송 줄(원문)이 오는 길을 그대로 탄다 — `addLine` 이 아니라 소켓이 주는 모양으로 */
    await page3.evaluate(() => {
      srcLang = 'ko'; selectedLang = 'vi'; ttsOn = true;
      const line = { seq: 11, text: '비상구는 저쪽입니다.', tr: {}, at: Date.now(), broadcast: true };
      lines.push(line); addLine(line);
      speakWhenTranslated(line, {});
    });
    await page3.waitForTimeout(300);
    ok((await page3.evaluate(() => window.__spoken.length)) === 0,
       '번역 전에는 **읽지 않는다** — 원문을 소리로 들려주지 않는다');
    await page3.evaluate(() => {
      /* 줄 칸 id 는 `lineElId` 가 만든다 — 시험이 꼴을 다시 적지 않는다(§4) */
      const el = document.querySelector('#' + CSS.escape(lineElId({ seq: 11 })) + ' .msg-text');
      el.textContent = 'Lối thoát hiểm ở đằng kia.';
    });
    await page3.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 4000 }).catch(() => {});
    const said = await page3.evaluate(() => window.__spoken.slice());
    ok(said[0] === 'Lối thoát hiểm ở đằng kia.', `번역이 오면 **바뀐 글자**를 읽는다 (${said[0] || '없음'})`);
    ok((await page3.evaluate(() => rtGuestTr.mode())) === 'browser', '그때 guest_tr=browser');

    /* ⑧ 상한까지 안 바뀌면 — 원문을 읽지 않고 보조 길(서버 번역)로 */
    await page3.evaluate(() => {
      window.__spoken = [];
      const line = { seq: 12, text: '안전모를 쓰십시오.', tr: { vi: 'Hãy đội mũ bảo hộ.' }, at: Date.now(), broadcast: true };
      lines.push(line); addLine(line);
      TR_WAIT_MS = 300;                 // 시험에서만 짧게 — 기다림이 **있다**는 것은 위에서 봤다
      speakWhenTranslated(line, {});
    });
    await page3.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 4000 }).catch(() => {});
    const said2 = await page3.evaluate(() => window.__spoken.slice());
    ok(said2[0] === 'Hãy đội mũ bảo hộ.', `상한을 넘기면 서버 번역을 읽는다 (${said2[0] || '없음'})`);
    ok((await page3.evaluate(() => rtGuestTr.mode())) === 'server', '그때 guest_tr=server');

    /* ⑨ 서버 번역도 없으면 — **아무 말도 안 한다**(원문을 읽지 않는다). 글자는 화면에 남는다 */
    await page3.evaluate(() => {
      window.__spoken = [];
      const line = { seq: 13, text: '다음으로 넘어갑니다.', tr: {}, at: Date.now(), broadcast: true };
      lines.push(line); addLine(line);
      TR_WAIT_MS = 300;
      speakWhenTranslated(line, {});
    });
    await page3.waitForTimeout(900);
    ok((await page3.evaluate(() => window.__spoken.length)) === 0,
       '번역도 서버 번역도 없으면 **읽지 않는다** — 모르는 말을 소리로 주지 않는다');
    ok((await page3.evaluate(() => !!document.querySelector('#' + CSS.escape(lineElId({ seq: 13 })) + ' .msg-text'))) === true,
       '그래도 **글자는 화면에 남는다** (R-15: 유실 > 지연)');
    await page3.close();

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
