// samples/qr_sheet_test.js — 묶음 QR 인쇄 페이지 web/tools/qr-sheet/ (MASTER 10-14 11:10 ③) 브라우저 시험
// 실행: node samples/qr_sheet_test.js   (CHROME=<경로> 로 브라우저를 바꿀 수 있다)
// 되돌려서 실패 확인: index.html daysOf 가 [3..4] 가 아닌 자리를 읽으면 "1일권·7일권" 단언이 붉다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== 묶음 QR 인쇄 페이지 (web/tools/qr-sheet) 검증 시험 ===');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'web', 'tools', 'qr-sheet', 'index.html');

const srv = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  const f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' });
    fs.createReadStream(f).pipe(res);
  } else { res.writeHead(404); res.end('nf'); }
});

(async () => {
  // 정적 검사
  const html = fs.readFileSync(PAGE, 'utf8');
  ok(/@page\s*\{[^}]*A4/.test(html), '인쇄 CSS: @page A4');
  ok(html.includes('grid-template-columns:1fr 1fr') && html.includes('repeat(4, 1fr)'), '격자 2열 × 4행');
  ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon/.test(html), '서버 호출 코드 없음 (fetch/XHR/beacon 0)');
  ok(html.includes('/web/vendor/qrcode.js'), 'QR 은 로컬 vendor 로 그린다');

  // 시험 키 0 으로 코드 10장 (1일권 ×8, 7일권 ×2) — 정본 [3..4] 기간
  const { mintCode, privateKeyFromSeed, testSeed, FLAG } = await import('../relay/src/mint-core.js');
  const pk = privateKeyFromSeed(testSeed());
  const exp = Math.floor(Date.now() / 1000) + 90 * 86400;
  const codes = [];
  for (let i = 0; i < 10; i++) {
    codes.push(mintCode({ keyId: 0, exp, days: i < 8 ? 1 : 7, flags: FLAG.host, cust: `QS${String(i + 1).padStart(3, '0')}`, privateKey: pk }));
  }
  const input = [
    codes[0].grouped,                        // 하이픈 묶음
    codes[1].link,                           // 링크 모양
    codes[2].code.toLowerCase(),             // 소문자
    ...codes.slice(3).map((c) => c.code),
    'ABCD-EFGH',                             // 읽을 수 없는 줄
    ''
  ].join('\n');

  await new Promise((r) => srv.listen(0, r));
  const base = `http://localhost:${srv.address().port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ locale: 'ko-KR' });
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  try {
    await page.goto(`${base}/web/tools/qr-sheet/`);
    await page.fill('#codes', input);
    await page.fill('#title', '시험 박물관');
    const r = await page.evaluate(() => window.rtQrSheetBuild());
    ok(r.total === 11 && r.good === 10 && r.bad === 1, `11줄 → 10칸 + 읽을 수 없는 줄 1 (${JSON.stringify(r)})`);
    ok((await page.$$('.sheet')).length === 2, '10칸 → A4 2장 (8 + 2)');
    ok((await page.$$('.sheet:nth-child(1) .cell')).length === 8, '첫 장 8칸');
    ok((await page.$$('.sheet:nth-child(2) .cell')).length === 3, '둘째 장 3칸 (코드 2 + 읽을 수 없는 줄 1)');
    ok((await page.$$('.cell .qr svg')).length === 10, '칸마다 QR svg 하나 (10)');
    const codeTexts = await page.$$eval('.cell:not(.bad) .code', (els) => els.map((e) => e.textContent));
    ok(codeTexts[0] === codes[0].grouped && codeTexts[1] === codes[1].grouped && codeTexts[2] === codes[2].grouped, '하이픈·링크·소문자 입력 셋 다 4자 묶음 코드로');
    const dayTexts = await page.$$eval('.cell:not(.bad) .days', (els) => els.map((e) => e.textContent));
    ok(dayTexts.slice(0, 8).every((t) => t === '1일권') && dayTexts[8] === '7일권' && dayTexts[9] === '7일권', '기간(일) = payload [3..4] (1일권 ×8, 7일권 ×2)');
    ok((await page.textContent('.cell.bad')).includes('읽을 수 없는 줄'), '읽을 수 없는 줄은 붉은 칸');
    ok((await page.textContent('.sheet-title')).includes('시험 박물관') && (await page.textContent('.sheet-title')).includes('1/2장'), '장 머리글 + 쪽 번호');
    ok(!(await page.isDisabled('#btn-print')), '인쇄 단추 켜짐');
    const nonStatic = requests.filter((u) => !/\/web\/tools\/qr-sheet\/$|\/web\/vendor\/qrcode\.js$/.test(u));
    ok(nonStatic.length === 0, `페이지·qrcode.js 밖의 요청 0건 (실제: ${nonStatic.length})`);
    ok(requests.every((u) => u.startsWith(base)), '외부 요청 0건');

    // 기간 0 (절대 만료만) → "기간 없음"
    const c0 = mintCode({ keyId: 0, exp, days: 0, flags: FLAG.host, cust: 'QS0', privateKey: pk });
    await page.fill('#codes', c0.code);
    await page.evaluate(() => window.rtQrSheetBuild());
    ok((await page.textContent('.cell .days')) === '기간 없음', '기간 0 → "기간 없음"');

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
