/**
 * /join 페이지 — room= 이 있으면 /web/listener/ 로 바로 리다이렉트 (NOW 장부 63).
 * 되돌림 실증 포함.
 */
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'join/ui-strings.json'), 'utf8'));
const lis = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'join/index.html'), 'utf8');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };

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
  console.log('=== /join 페이지 리다이렉트 및 i18n 검증 (되돌림 실증 포함) ===');
  const KEYS = Object.keys(dict.strings);
  ok(KEYS.length === 12, `키 12개 (${KEYS.length})`);
  ok(JSON.stringify(dict.langs) === JSON.stringify(lis.langs), `langs 가 청취 사전과 같다 (${dict.langs.length})`);

  const { srv, base } = await serve();
  const { chromium } = require('playwright');
  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const b = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});
  const ctx = await b.newContext();
  const page = await ctx.newPage();

  // room= 이 있으면 /web/listener/ 로 리다이렉트
  await page.goto(`${base}/join/?room=ABC123&relay=example.com`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const u = page.url();
  ok(u.includes('/web/listener/') && u.includes('room=ABC123'), 'room= 이 있으면 /web/listener/ 로 리다이렉트된다');

  // 방이 없으면 안내 문구
  await page.goto(`${base}/join/?lang=de`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  ok((await page.textContent('#msg')) === dict.strings.msg_no_info.de, '연결 정보 없는 링크 + lang=de → 독일어 안내');

  // ── 되돌림 실증 — 리다이렉트를 되돌린 사본을 서빙한다 ──
  let hit = false;
  const { srv: srv2, base: base2 } = await serve((pathname, text) => {
    if (!/\/join\/(index\.html)?$/.test(pathname)) return null;
    hit = true;
    return text.replace('location.replace(listenerUrl);', '// location.replace(listenerUrl);');
  });
  const page2 = await ctx.newPage();
  await page2.goto(`${base2}/join/?room=ABC123&relay=example.com`, { waitUntil: 'load' });
  await page2.waitForTimeout(300);
  const u2 = page2.url();
  ok(hit === true, '되돌린 사본이 실제로 서빙됐다');
  let revertFailed = false;
  try {
    assert.strictEqual(u2.includes('/web/listener/'), true, '리다이렉트를 지우면 /web/listener/ 로 가지 않는다');
  } catch (e) {
    revertFailed = true;
  }
  ok(revertFailed === true, '리다이렉트를 지우면 검사가 붉어진다 (되돌림 실증 완료)');

  await b.close(); srv.close(); srv2.close();
  console.log(`\n전부 통과 (${n}건)`);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
