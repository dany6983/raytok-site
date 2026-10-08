// samples/lic_page_test.js — /lic/<code> 이용권 딥링크 페이지 (MASTER 01:12 B 줄 5) 브라우저 시험
// 실행: node samples/lic_page_test.js   (CHROME=<경로> 로 브라우저를 바꿀 수 있다)
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== /lic/<code> 이용권 페이지 (lic/index.html + 404.html) 검증 시험 ===');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const ROOT = path.join(__dirname, '..');
// 정본 벡터 ① (raytok-native1/docs/samples/license-code.md) — relay/test/mint-code.mjs 와 같은 글자
const VEC1 = '00000000E3DXH003A9A30C1G66PQMK63P1PDQTQ1SNYDX9P9MYBRBKBA626VVW133ARGBWE9XCVD2CAZAQVT2V5XQGWS73NYH6GYYR34D9V2YM8V9H6Y8XJ9801EGYGA';
const GROUPED = VEC1.replace(/(.{4})/g, '$1-').replace(/-$/, '');

// GitHub Pages 흉내: 있는 파일은 그대로, 없는 주소는 404.html (상태 404)
const srv = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  let f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(ROOT, '404.html')).pipe(res);
  }
});

(async () => {
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(
    process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }
  );

  async function open(url, ua, locale) {
    const ctx = await browser.newContext({ userAgent: ua, locale: locale || 'ko-KR', viewport: { width: 400, height: 800 } });
    const page = await ctx.newPage();
    const outside = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) outside.push(r.url()); });
    await page.goto(url);
    await page.waitForTimeout(150);
    return { page, ctx, outside };
  }
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';

  // 1. /lic/<code> → 404.html → /lic/?c=<code>  (GitHub Pages 에는 그 파일이 없다)
  let t = await open(`${base}/lic/${VEC1}`, IPHONE);
  ok(new URL(t.page.url()).pathname === '/lic/' && new URL(t.page.url()).searchParams.get('c') === VEC1, '/lic/<code> 가 404.html 을 거쳐 /lic/?c=<code> 로 온다');
  ok((await t.page.textContent('#code')).trim() === GROUPED, '코드를 4자 × 32칸으로 보여 준다');
  ok((await t.page.getAttribute('#open', 'href')) === `raytok://lic/${VEC1}`, '안드로이드가 아니면 raytok://lic/<code> 딥링크');
  ok(await t.page.isVisible('#copy'), '복사 단추가 있다');
  ok((await t.page.getAttribute('#store', 'href')) === 'https://raytok.kr/download/', '설치 안내는 raytok.kr/download');
  ok(/4자씩 32칸/.test(await t.page.textContent('#hint')), '손입력 안내(4자 × 32칸)');
  ok(t.outside.length === 0, '바깥으로 나가는 요청 0건 (코드를 어디에도 보내지 않는다)');
  await t.ctx.close();

  // 2. 안드로이드: intent 로 앱에 넘기고, 없으면 다운로드로
  t = await open(`${base}/lic/?c=${GROUPED.toLowerCase()}`, ANDROID);
  const href = await t.page.getAttribute('#open', 'href');
  ok(href.startsWith(`intent://lic/${VEC1}#Intent;scheme=raytok;package=com.raytok.ear;`), '안드로이드는 intent://lic/<code> (scheme=raytok, package=com.raytok.ear)');
  ok(/S\.browser_fallback_url=https%3A%2F%2Fraytok\.kr%2Fdownload%2F;end$/.test(href), '앱이 없으면 다운로드 페이지로 (browser_fallback_url)');
  ok((await t.page.textContent('#code')).trim() === GROUPED, '하이픈·소문자로 와도 같은 코드로 읽는다');
  await t.ctx.close();

  // 3. 사람이 혼동하는 글자 I·L→1, O→0 (앱과 같은 규칙)
  const confusable = VEC1.replace(/1/g, 'I').replace(/0/g, 'O');
  t = await open(`${base}/lic/#${confusable}`, IPHONE);
  ok((await t.page.textContent('#code')).trim() === GROUPED, 'I·L→1, O→0 으로 고쳐 읽는다 (# 조각으로도 온다)');
  await t.ctx.close();

  // 4. 코드가 없거나 깨진 링크
  for (const bad of ['/lic/', `/lic/?c=${VEC1.slice(0, 100)}`, `/lic/?c=U${VEC1.slice(1)}`]) {
    t = await open(base + bad, IPHONE);
    ok(!(await t.page.isVisible('#open')) && /맞지 않는/.test(await t.page.textContent('#msg')), `깨진 링크(${bad.slice(0, 20)}…)는 열기 단추를 숨기고 안내만`);
    await t.ctx.close();
  }

  // 5. 영어 — 브라우저 언어로 고르고, 단추로 바꾼다
  t = await open(`${base}/lic/?c=${VEC1}`, IPHONE, 'en-US');
  ok((await t.page.textContent('#open')).trim() === 'Open in app', '영어 브라우저면 영어');
  await t.page.click('.lang a[data-lang="ko"]');
  ok((await t.page.textContent('#open')).trim() === '앱에서 열기', '단추로 한국어로 바꾼다');
  await t.ctx.close();

  // 6. 다른 없는 주소는 그냥 404 안내 (옮기지 않는다)
  t = await open(`${base}/nope/abc`, IPHONE);
  ok(new URL(t.page.url()).pathname === '/nope/abc' && /없는 페이지/.test(await t.page.textContent('h1')), '/lic/ 밖의 없는 주소는 404 안내만');
  await t.ctx.close();

  await browser.close();
  srv.close();
  console.log(`=== ${passCount}건 전원 통과 ===`);
})().catch((e) => { console.error('[FAIL]', e.message); process.exit(1); });
