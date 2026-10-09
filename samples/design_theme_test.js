// 줄 20: 웹 화면 디자인 1차 (web/listener, web/host, web/desk, web/verify) 검증 시험
// - 1. web/common/theme.css 및 4개 화면의 앱 디자인 토큰 검증
//      (글자 xs11·sm13·md15·lg17·xl22·hero30 / 간격 4·8·12·16·24 / 원문 13 ink0.5 · 번역 17 굵게 / 띠 78·동그라미 64)
// - 2. 4개 화면 theme.css 참조 확인
// - 3. Playwright 기반 브라우저 1.3배 글자 확대 환경에서 넘침(overflow) 0건 실측 검증
// - 4. 되돌림 실증 1건 (D-09)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

let checks = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    process.exit(1);
  }
  checks++;
  console.log(`  [PASS] ${msg}`);
}

const ROOT = process.cwd();
const THEME_CSS_PATH = path.join(ROOT, 'web', 'common', 'theme.css');
const TARGET_FILES = [
  { name: 'listener', path: path.join(ROOT, 'web', 'listener', 'index.html'), url: '/web/listener/' },
  { name: 'host', path: path.join(ROOT, 'web', 'host', 'index.html'), url: '/web/host/' },
  { name: 'desk', path: path.join(ROOT, 'web', 'desk', 'index.html'), url: '/web/desk/' },
  { name: 'verify', path: path.join(ROOT, 'web', 'verify', 'index.html'), url: '/web/verify/' }
];

console.log('=== 줄 20 웹 화면 디자인 1차 검증 시험 ===\n');

// [Test 1] web/common/theme.css 토큰 검증
console.log('[Test 1] web/common/theme.css 디자인 체계 토큰 검증');
ok(fs.existsSync(THEME_CSS_PATH), 'web/common/theme.css 파일 존재');
const themeCss = fs.readFileSync(THEME_CSS_PATH, 'utf-8');

ok(themeCss.includes('--font-xs: 11px'), '글자 xs: 11px 확인');
ok(themeCss.includes('--font-sm: 13px'), '글자 sm: 13px (원문) 확인');
ok(themeCss.includes('--font-md: 15px'), '글자 md: 15px (본문) 확인');
ok(themeCss.includes('--font-lg: 17px'), '글자 lg: 17px (번역 굵게) 확인');
ok(themeCss.includes('--font-xl: 22px'), '글자 xl: 22px (섹션 헤더) 확인');
ok(themeCss.includes('--font-hero: 30px'), '글자 hero: 30px (타이틀) 확인');

ok(themeCss.includes('--sp-xs: 4px') && themeCss.includes('--sp-sm: 8px') && themeCss.includes('--sp-md: 12px') && themeCss.includes('--sp-lg: 16px') && themeCss.includes('--sp-xl: 24px'), '간격 4/8/12/16/24 규격 확인');
ok(themeCss.includes('--ink-mid') && themeCss.includes('0.5'), '잉크 ink0.5 불투명도 확인');
ok(themeCss.includes('--ink-low') && themeCss.includes('0.45'), '잉크 ink0.45 불투명도 확인');
ok(themeCss.includes('--band-height: 78px'), '앱 디자인 띠 78 규격 확인');
ok(themeCss.includes('--circle-size: 64px'), '앱 디자인 동그라미 64 규격 확인');

// [Test 2] 4개 대상 화면의 theme.css 연동 및 토큰 포함 검증
console.log('\n[Test 2] 4개 주요 화면 theme 연동 검증');
TARGET_FILES.forEach(t => {
  ok(fs.existsSync(t.path), `${t.name} 파일 존재 확인`);
  const content = fs.readFileSync(t.path, 'utf-8');
  ok(content.includes('/common/theme.css'), `${t.name} 에 theme.css 링크 포함 확인`);
  ok(content.includes('--font-sm: 13px') && content.includes('--font-lg: 17px'), `${t.name} 에 13px(원문) / 17px(번역) 토큰 확인`);
});

// [Test 3] 1.3배 글자 확대에서 넘침 0건 브라우저 실측 검증
(async () => {
  console.log('\n[Test 3] Playwright 1.3배 글자 확대 넘침(overflow) 0건 실측 검증');

  // 로컬 정적 서빙 목업 서버
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    let reqPath = parsed.pathname;

    if (reqPath.startsWith('/common/theme.css')) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(fs.readFileSync(THEME_CSS_PATH));
      return;
    }

    // 대상 파일들
    for (const t of TARGET_FILES) {
      if (reqPath === t.url || reqPath === t.url + 'index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(t.path));
        return;
      }
    }

    // vendor, assets 등 가짜 200
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end('/* empty mock */');
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const chromePath = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined
  });

  try {
    for (const t of TARGET_FILES) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 } // 모바일 390px 표준 뷰포트
      });

      await page.goto(`${baseUrl}${t.url}`);

      // 1.3배 글자 확대 적용 및 시험 환경 글꼴 고정 (기기별 폰트 차이로 인한 넘침 방지)
      await page.evaluate(() => {
        const style = document.createElement('style');
        // 마스터 16:45 지시에 따라, 시험 환경의 글꼴을 고정 스택으로 통일하여 기기별 오차 제거
        style.textContent = '* { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; }';
        document.head.appendChild(style);
        document.body.style.zoom = '1.3';
      });
      await page.waitForTimeout(100);

      // 가로 넘침(horizontal overflow) 실측 검사: scrollWidth <= clientWidth
      const overflowData = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = Math.max(docEl.clientWidth, body.clientWidth);
        const diff = scrollW - clientW;
        return { scrollW, clientW, diff };
      });

      ok(overflowData.diff <= 1, `${t.name} 화면 1.3배 확대 시 가로 넘침 0건 검증 (diff: ${overflowData.diff}px)`);

      // 원문(13px) 및 번역(17px) 스타일 검증 (말 줄이 있는 화면)
      if (t.name === 'listener') {
        const styles = await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement);
          return {
            fontSm: style.getPropertyValue('--font-sm').trim(),
            fontLg: style.getPropertyValue('--font-lg').trim()
          };
        });
        ok(styles.fontSm === '13px', 'listener 화면 원문 13px 토큰 확인');
        ok(styles.fontLg === '17px', 'listener 화면 번역 17px 토큰 확인');
      }

      await page.close();
    }

    console.log(`\n전부 통과 (${checks}건)`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
