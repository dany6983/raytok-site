// 줄 16: 사용 안내 페이지 (guide/) data-t 다국어 체계 및 ko·en 검증 시험
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
const KO_GUIDE_PATH = path.join(ROOT, 'guide', 'index.html');
const WEB_GUIDE_PATH = path.join(ROOT, 'web', 'guide', 'index.html');

console.log('=== 줄 16 사용 안내 페이지 (guide/) data-t 다국어 및 내용 검증 시험 ===\n');

// [Test 1] guide/index.html data-t 속성 개수 및 필수 키 검증
console.log('[Test 1] guide/index.html data-t 속성 보유 검증 (0개 방지)');
ok(fs.existsSync(KO_GUIDE_PATH), 'guide/index.html 파일 존재');
const koGuide = fs.readFileSync(KO_GUIDE_PATH, 'utf-8');

// data-t 속성 개수 카운트
const dataMatches = koGuide.match(/data-t=["'][^"']+["']/g) || [];
ok(dataMatches.length >= 30, `data-t 속성이 충분히 부여됨 (실제: ${dataMatches.length}개)`);

// 강사 3단계 data-t 확인
ok(koGuide.includes('data-t="host_step1"') && koGuide.includes('HWPX'), '강사 1단계: data-t 및 HWPX 확인');
ok(koGuide.includes('data-t="host_step2"'), '강사 2단계: data-t 확인');
ok(koGuide.includes('data-t="host_step3"'), '강사 3단계: data-t 확인');

// 청취자 3단계 data-t 확인
ok(koGuide.includes('data-t="listener_step1"'), '청취자 1단계: data-t 확인');
ok(koGuide.includes('data-t="listener_step2"'), '청취자 2단계: data-t 확인');
ok(koGuide.includes('data-t="listener_step3"'), '청취자 3단계: data-t 확인');

// Desk 3단계 data-t 확인
ok(koGuide.includes('data-t="desk_step1"'), 'Desk 1단계: data-t 확인');
ok(koGuide.includes('data-t="desk_step2"'), 'Desk 2단계: data-t 확인');
ok(koGuide.includes('data-t="desk_step3"'), 'Desk 3단계: data-t 확인');

// Desk 회의 앱별 소리 잡기 (이름·효과만)
ok(koGuide.includes('Zoom') && koGuide.includes('Teams') && koGuide.includes('Meet'), 'Desk 회의 앱 3종(Zoom, Teams, Meet) 명시 확인');
ok(koGuide.includes('data-t="td_zoom_eff"') && koGuide.includes('data-t="td_teams_eff"'), '회의 앱 효과 data-t 속성 확인');

// 바닥 링크
ok(koGuide.includes('/web/terms/'), '바닥에 이용약관 링크 확인');
ok(koGuide.includes('/privacy/'), '바닥에 개인정보 처리방침 링크 확인');

// [Test 2] web/guide/index.html 리다이렉트 확인
console.log('\n[Test 2] web/guide/ 리다이렉트 확인');
ok(fs.existsSync(WEB_GUIDE_PATH), 'web/guide/index.html 파일 존재');
const webGuide = fs.readFileSync(WEB_GUIDE_PATH, 'utf-8');
ok(webGuide.includes('/guide/'), 'web/guide/index.html -> /guide/ 리다이렉트 확인');

// [Test 3] 브라우저 Playwright 언어 전환 (?lang=en 및 버튼 클릭) E2E 검증
(async () => {
  console.log('\n[Test 3] 브라우저 Playwright 다국어 전환 실측 검증');

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, `http://${req.headers.host}`);
    if (parsed.pathname === '/guide/' || parsed.pathname === '/guide/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(KO_GUIDE_PATH));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
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
    const page = await browser.newPage();

    // 1) 기본 한국어 진입
    await page.goto(`${baseUrl}/guide/?lang=ko`);
    const titleKo = await page.textContent('h1');
    ok(titleKo.includes('RayTok 사용설명서'), '기본 ko: "RayTok 사용설명서" 렌더링 확인');
    const hostStep1Ko = await page.textContent('[data-t="host_step1"]');
    ok(hostStep1Ko.includes('원고 준비') && hostStep1Ko.includes('HWPX'), 'ko 강사 1단계 HWPX 포함 확인');

    // 2) English 버튼 클릭하여 언어 전환
    await page.click('#btn-lang-en');
    await page.waitForTimeout(100);

    const titleEn = await page.textContent('h1');
    ok(titleEn.includes('RayTok User Guide'), 'English 전환: "RayTok User Guide" 실시간 반영 확인');

    const hostStep1En = await page.textContent('[data-t="host_step1"]');
    ok(hostStep1En.includes('Step 1: Prepare Scripts') && hostStep1En.includes('HWPX'), 'en 강사 1단계 영문화 확인');

    const listenerStep1En = await page.textContent('[data-t="listener_step1"]');
    ok(listenerStep1En.includes('Step 1: Join Session'), 'en 청취자 1단계 영문화 확인');

    const deskStep1En = await page.textContent('[data-t="desk_step1"]');
    ok(deskStep1En.includes('Step 1: Launch and License Verification'), 'en Desk 1단계 영문화 확인');

    // 3) ?lang=en URL 파라미터로 직접 접속
    await page.goto(`${baseUrl}/guide/?lang=en`);
    const directTitleEn = await page.textContent('h1');
    ok(directTitleEn.includes('RayTok User Guide'), '?lang=en 직접 접속 시 영문 렌더링 확인');

    // 4) 日本語 (ja) 전환 검증
    await page.click('#btn-lang-ja');
    await page.waitForTimeout(100);
    const titleJa = await page.textContent('h1');
    ok(titleJa.includes('使い方ガイド'), 'ja 일본어판 전환 렌더링 확인');

    // 5) 中文 (zh) 전환 검증
    await page.click('#btn-lang-zh');
    await page.waitForTimeout(100);
    const titleZh = await page.textContent('h1');
    ok(titleZh.includes('使用指南'), 'zh 중국어판 전환 렌더링 확인');

    // 6) Tiếng Việt (vi) 전환 검증
    await page.click('#btn-lang-vi');
    await page.waitForTimeout(100);
    const titleVi = await page.textContent('h1');
    ok(titleVi.includes('Hướng dẫn'), 'vi 베트남어판 전환 렌더링 확인');

    await browser.close();
    server.close();

    console.log(`\n전부 통과 (${checks}건)`);
  } catch (err) {
    await browser.close();
    server.close();
    throw err;
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
