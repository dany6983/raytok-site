/* samples/split_qr_test.js — **갈림 QR + 데모 스위치** (NOW 2026-10-21 2번)
 *
 * QR 은 **한 장**이고 그 한 장이 세 가지 폰을 다 받는다. 가르는 일은 `/join` 페이지가 한다:
 *   · 안드로이드 + 앱 있음 → 앱(인텐트)      · 안드로이드 + 앱 없음 → 웹(+「앱 받기」)
 *   · 아이폰 → 웹 (아이폰 앱이 아직 없다)
 * 강사 화면에는 데모 스위치 「앱만 / 웹만 / 둘 다」(기본 **둘 다**).
 *
 * 왜 이 시험이 있나: 10-21 전까지 `/join` 의 `ok` 는 `ip`+`code` 만 보았다 — 웹 강사 방의
 * QR(`?room=`)이 오면 **「연결 정보가 없는 링크입니다」**가 뜨고 「앱으로 열기」가 숨었다.
 * 앱을 가진 손님이 웹 강연에 앱으로 들어갈 길이 **없었다**. 그리고 손님 화면으로 보낼 때
 * `relay=` 를 안 넘겨서, 넘겨도 **운영 릴레이**로 가 빈 방을 보는 10-20 실기의 증상이 남아 있었다.
 *
 * 보는 것:
 *   ① 강사 화면: 스위치 세 칸이 있고 기본이 「둘 다」 · 주소가 `/join/?room=..&relay=..`
 *      · 「앱만」 → `only=app` · 「웹만」 → `/web/listener/?room=..&relay=..`
 *      · **어느 쪽이든 `relay=` 가 스킴 없이 늘 실린다**
 *   ② /join + 안드로이드: 「앱으로 열기」가 `intent://` 이고 `room=`·`relay=` 를 싣는다 ·
 *      앱이 없을 때 떨어지는 자리(`browser_fallback_url`)가 **설치 페이지가 아니라 이 페이지**다
 *   ③ /join + 아이폰: 손님 화면(`/web/listener/?room=..&relay=..`)으로 **보낸다**
 *   ④ /join + `only=app`: 「브라우저로 듣기」가 없다 (데모 「앱만」)
 *   ⑤ 방도 주소도 없는 링크는 전처럼 "연결 정보가 없는 링크입니다"
 *   ⑥ **되돌림 실증**: `/join` 의 방 갈래를 되돌린 사본을 서빙하면 ②가 **붉어진다**
 *      (시험 안에서 만든 상수가 아니라 **페이지가 만든 값**을 본다 — `samples/revert_audit_test.js`)
 *
 * 바깥 요청은 하지 않는다 — 저장소 파일을 그 자리에서 서빙한다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

/**
 * 저장소를 그대로 서빙한다. `mutate` 가 있으면 그 파일의 글자를 바꿔 내보낸다 —
 * **되돌림 실증**이 그것을 쓴다(제품 파일을 되돌린 사본으로 같은 단언을 돌린다).
 */
const serve = (mutate) => new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    let f = path.join(ROOT, u.pathname);
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    let body = fs.readFileSync(f);
    if (mutate) {
      const changed = mutate(u.pathname, body.toString('utf8'));
      if (typeof changed === 'string') body = Buffer.from(changed, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8'
                                       : f.endsWith('.js') ? 'application/javascript'
                                       : f.endsWith('.json') ? 'application/json' : 'text/plain' });
    res.end(body);
  });
  srv.listen(0, () => resolve({ srv, base: `http://localhost:${srv.address().port}` }));
});

/** `/join` 한 번 열고 화면이 만든 값을 읽어 온다 (페이지가 만든 값이다 — 시험 상수가 아니다) */
async function joinState(browser, base, qs, ua) {
  const ctx = await browser.newContext({ userAgent: ua });
  const page = await ctx.newPage();
  await page.goto(base + '/join/?' + qs, { waitUntil: 'load' });
  await page.waitForTimeout(500);               // 300ms 뒤의 인텐트·보내기까지 본다
  const url = page.url();
  const state = await page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none';
    return {
      msg: (el('msg') || {}).textContent || '',
      openHref: el('open') ? el('open').getAttribute('href') || '' : '',
      openShown: shown(el('open')),
      webHref: el('web-listen') ? el('web-listen').getAttribute('href') || '' : '',
      webShown: shown(el('web-listen')),
      storeShown: shown(el('store')),
    };
  }).catch(() => null);                          // 손님 화면으로 떠났으면 읽을 것이 없다
  await ctx.close();
  return { url, state };
}

(async () => {
  console.log('=== 갈림 QR + 데모 스위치 (NOW 10-21 2번) ===\n');
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  const errs = [];

  /* ── ① 강사 화면 — 주소를 만드는 자리 하나(joinQrUrl) ─────────────── */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('host: ' + e.message));
    await page.goto(base + '/web/host/?relay=r.example', { waitUntil: 'load' });

    const box = await page.evaluate(() => {
      const b = document.getElementById('qrTargetBox');
      return b ? Array.from(b.querySelectorAll('.qr-target-btn')).map((e) => ({ id: e.id, on: e.classList.contains('on') })) : null;
    });
    ok(!!box && box.length === 3, '강사 화면에 스위치 세 칸이 있다');
    ok(!!box && box.find((b) => b.id === 'qrTarget-both').on === true, '기본은 「둘 다」다');

    /* 주소 셋 — 페이지의 그 함수를 그대로 부른다(베끼지 않는다) */
    const urls = await page.evaluate(() => ({
      both: window.joinQrUrl('AB12X3', 'both'),
      app: window.joinQrUrl('AB12X3', 'app'),
      web: window.joinQrUrl('AB12X3', 'web'),
    }));
    ok(/\/join\/\?/.test(urls.both) && /[?&]room=AB12X3\b/.test(urls.both),
       '「둘 다」는 /join 으로 — 가르는 일은 그 페이지가 한다');
    ok(/[?&]relay=r\.example\b/.test(urls.both) && !/relay=https?/.test(urls.both),
       '릴레이를 **스킴 없이** 늘 싣는다 (없으면 손님이 빈 방으로 간다)');
    ok(/[?&]only=app\b/.test(urls.app), '「앱만」은 only=app');
    ok(/\/listener\/\?/.test(urls.web) && /[?&]relay=r\.example\b/.test(urls.web),
       '「웹만」은 손님 화면 주소 — 거기에도 릴레이가 실린다');
    ok(/^https?:\/\//.test(urls.both), 'QR 은 늘 https 주소다 (카메라 앱은 intent:// 를 링크로 안 본다)');

    /* 스위치를 누르면 QR 과 주소 글자가 **같이** 바뀐다 */
    const after = await page.evaluate(() => {
      live.code = 'AB12X3';            /* `const live` 는 window 에 안 붙는다 — 그대로 부른다 */
      window.setQrTarget('web');
      const t1 = document.getElementById('joinUrl').textContent;
      window.setQrTarget('both');
      return { web: t1, both: document.getElementById('joinUrl').textContent,
               on: document.getElementById('qrTarget-both').classList.contains('on'),
               svg: !!document.querySelector('#qrBox svg, #qrBox img') };
    });
    ok(/\/listener\//.test(after.web) && /\/join\//.test(after.both), '스위치를 누르면 주소 글자가 바뀐다');
    ok(after.on === true && after.svg === true, '고른 칸에 불이 켜지고 QR 이 그려진다');
    await ctx.close();
  }

  /* ── ② 안드로이드 — 앱으로, 그리고 앱이 없으면 떨어질 자리 ────────── */
  const andQs = 'room=ab12x3&relay=r.example';
  const and = await joinState(browser, base, andQs, UA_ANDROID);
  ok(/^intent:\/\/join\?/.test(and.state.openHref), '안드로이드: 「앱으로 열기」가 인텐트다');
  ok(/[?&]room=AB12X3\b/.test(and.state.openHref), '인텐트가 **방 코드**를 싣는다 (앱이 그것으로 붙는다)');
  ok(/[?&]relay=r\.example\b/.test(and.state.openHref), '인텐트가 **릴레이 주소**도 싣는다');
  ok(/[?&]mode=guide\b/.test(and.state.openHref), '가이드 세션으로 표시된다 (앱이 가이드 화면을 연다)');
  {
    const m = /browser_fallback_url=([^;]+)/.exec(and.state.openHref);
    const fb = m ? decodeURIComponent(m[1]) : '';
    ok(/\/join\/?\?/.test(fb) && /[?&]noapp=1\b/.test(fb),
       '앱이 없으면 **이 페이지로** 떨어진다 — 설치 페이지가 아니다 (NOW 2번: 웹 + 앱 받기)');
    ok(!/\/download\//.test(fb), '떨어지는 자리가 설치 페이지가 아니다');
  }
  {
    /* 앱이 없다고 안드로이드가 말해 준 뒤 — 웹으로 듣기와 앱 받기 둘이 선다 */
    const noapp = await joinState(browser, base, andQs + '&noapp=1', UA_ANDROID);
    ok(noapp.state.webShown === true && /\/web\/listener\/\?room=AB12X3/.test(noapp.state.webHref),
       '앱 없음: 「브라우저로 듣기」가 선다');
    ok(/[?&]relay=r\.example\b/.test(noapp.state.webHref), '그 주소에도 릴레이가 실린다 (빈 방 방지)');
    ok(noapp.state.storeShown === true, '앱 없음: 「앱 받기」도 같이 선다');
    ok(/\/join\//.test(noapp.url), '앱 없음: 인텐트를 다시 던지지 않는다 (고리가 돈다)');
  }

  /* ── ③ 아이폰 — 웹으로 보낸다 (아이폰 앱이 없다) ──────────────────── */
  {
    const ios = await joinState(browser, base, andQs, UA_IPHONE);
    ok(/\/web\/listener\/\?room=AB12X3/.test(ios.url), '아이폰: 손님 화면으로 보냈다');
    ok(/[?&]relay=r\.example\b/.test(ios.url), '아이폰: 그 주소에 릴레이가 실렸다');
  }

  /* ── ④ 데모 「앱만」 — 웹으로 듣는 단추가 없다 ────────────────────── */
  {
    const appOnly = await joinState(browser, base, andQs + '&only=app', UA_ANDROID);
    ok(appOnly.state.webShown === false, '「앱만」: 「브라우저로 듣기」가 없다');
    const iosAppOnly = await joinState(browser, base, andQs + '&only=app', UA_IPHONE);
    ok(!/\/web\/listener\//.test(iosAppOnly.url), '「앱만」: 아이폰도 웹으로 보내지 않는다');
  }

  /* ── ⑤ 방도 주소도 없으면 전처럼 ──────────────────────────────────── */
  {
    const none = await joinState(browser, base, 'lang=ko', UA_ANDROID);
    ok(/연결 정보가 없는/.test(none.state.msg) && none.state.openShown === false,
       '방도 주소도 없는 링크는 전처럼 사실을 말한다');
  }

  ok(errs.length === 0, 'pageerror 0' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await new Promise((r) => srv.close(r));

  /* ── ⑥ 되돌림 실증 — 방 갈래를 되돌린 **사본**을 서빙한다 ─────────── */
  {
    const hit = { ok: false };
    const { srv: srv2, base: base2 } = await serve((pathname, text) => {
      if (!/\/join\/(index\.html)?$/.test(pathname)) return null;
      hit.ok = true;
      /* 10-21 전의 그 줄로 되돌린다 — ip+code 만 연결 정보로 본다 */
      return text.replace(
        "var ok = (/^\\d{1,3}(\\.\\d{1,3}){3}$/.test(q.ip || '') && /^[A-Z0-9]{6}$/i.test(q.code || '')) || hasRoom;",
        "var ok = /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(q.ip || '') && /^[A-Z0-9]{6}$/i.test(q.code || '');");
    });
    const reverted = await joinState(browser, base2, andQs, UA_ANDROID);
    ok(hit.ok === true, '되돌린 사본이 실제로 서빙됐다 (안 바뀌었으면 아래 단언이 거짓 초록이다)');
    const revertFailed = !/^intent:\/\/join\?/.test(reverted.state.openHref) || reverted.state.openShown === false;
    ok(revertFailed === true,
       '되돌리면 ②가 붉다 — 방만 든 QR 에서 「앱으로 열기」가 사라진다 (되돌림 실증 완료)');
    await new Promise((r) => srv2.close(r));
  }

  await browser.close();
  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
