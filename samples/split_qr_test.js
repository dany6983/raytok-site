/* samples/split_qr_test.js — 강사 QR 고르개 없음 + 언제나 웹 손님 주소 (NOW 2026-10-28 장부 63)
 *
 * QR 은 언제나 웹 손님 주소 하나이며 강사 화면의 고르개(둘 다/앱/웹)는 없다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

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

(async () => {
  console.log('=== 강사 QR 고르개 없음 + 웹 손님 주소 하나 (NOW 장부 63) ===\n');
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  const errs = [];

  /* ── ① 강사 화면 — QR 고르개가 없고 주소는 늘 웹 손님 주소 ─────────────── */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('host: ' + e.message));
    await page.goto(base + '/web/host/?relay=r.example', { waitUntil: 'load' });

    const hasBox = await page.evaluate(() => !!document.getElementById('qrTargetBox'));
    ok(hasBox === false, '강사 화면에 QR 고르개(#qrTargetBox)가 없다');

    const url = await page.evaluate(() => {
      live.code = 'AB12X3';
      return joinQrUrl('AB12X3');
    });
    ok(/\/web\/listener\/\?/.test(url) && /[?&]room=AB12X3\b/.test(url), 'QR 은 언제나 웹 손님 주소(/web/listener/)다');
    ok(/[?&]relay=r\.example\b/.test(url) && !/relay=https?/.test(url), '릴레이가 스킴 없이 실린다');
    await ctx.close();
  }

  ok(errs.length === 0, 'pageerror 0' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await new Promise((r) => srv.close(r));

  /* ── ② 되돌림 실증 — QR 고르개를 되돌린 **사본**을 서빙한다 ─────────── */
  {
    const hit = { ok: false };
    const { srv: srv2, base: base2 } = await serve((pathname, text) => {
      if (!/\/web\/host\/(index\.html)?$/.test(pathname)) return null;
      hit.ok = true;
      /* 고르개 HTML을 다시 넣는다 */
      return text.replace(
        '<div class="room-code" id="roomCode">------</div>',
        '<div class="room-code" id="roomCode">------</div>\n          <div class="qr-target" id="qrTargetBox"></div>'
      );
    });
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(base2 + '/web/host/', { waitUntil: 'load' });
    const revertedHasBox = await page2.evaluate(() => !!document.getElementById('qrTargetBox'));
    ok(hit.ok === true, '되돌린 사본이 실제로 서빙됐다');
    ok(revertedHasBox === true, '고르개를 되돌리면 검사 단언이 붉어진다 (되돌림 실증 완료)');
    await ctx2.close();
    await new Promise((r) => srv2.close(r));
  }

  await browser.close();
  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
