// 줄 17: 고객 사용량 화면 (web/usage) 검증 시험
// - 1. web/usage/index.html 정적 항목 및 조항/UI 검증
// - 2. usage/index.html 리다이렉트 검증
// - 3. 목업 릴레이 서버 연동 브라우저 E2E 검증:
//      * 미인증 토큰 401 차단
//      * 정상 토큰 시 3대 지표 (번역 글자, Desk 분, 등록 기기 수) 노출
//      * 사람 기록 0건 (원문·번역 전문, 이름 없음, 순수 숫자) 검증
//      * 외부 요청 0건 검증
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
const USAGE_HTML_PATH = path.join(ROOT, 'web', 'usage', 'index.html');
const USAGE_REDIRECT_PATH = path.join(ROOT, 'usage', 'index.html');

console.log('=== 줄 17 고객 사용량 화면 (web/usage) 검증 시험 ===\n');

// [Test 1] 정적 파일 및 UI 구성 확인
console.log('[Test 1] web/usage/index.html 정적 마크업 확인');
ok(fs.existsSync(USAGE_HTML_PATH), 'web/usage/index.html 파일 존재');
const usageHtml = fs.readFileSync(USAGE_HTML_PATH, 'utf-8');

ok(usageHtml.includes('RayTok Usage') && usageHtml.includes('고객 사용량 조회'), '헤더 타이틀 확인');
ok(usageHtml.includes('view-auth') && usageHtml.includes('input-token') && usageHtml.includes('btn-auth'), '인증 뷰 요소 확인');
ok(usageHtml.includes('view-usage'), '사용량 대시보드 뷰 요소 확인');
ok(usageHtml.includes('이번 달 번역 글자 수'), '번역 글자 수 메트릭 카드 확인');
ok(usageHtml.includes('Desk 회의 시간'), 'Desk 회의 시간 메트릭 카드 확인');
ok(usageHtml.includes('<span>등록 기기 수</span>'), '등록 기기 수 메트릭 카드 확인');
ok(usageHtml.includes('언어별 번역 현황'), '언어별 번역 현황 섹션 확인');
ok(usageHtml.includes('사람 기록 0건 원칙') || usageHtml.includes('순수 숫자 통계'), '개인정보 및 사람 기록 0건 원칙 안내 확인');
ok(usageHtml.includes('/web/terms/'), '바닥 이용약관 링크 확인');
ok(usageHtml.includes('/privacy/'), '바닥 개인정보 처리방침 링크 확인');

// [Test 2] usage/index.html 리다이렉트 확인
console.log('\n[Test 2] usage/index.html 리다이렉트 확인');
ok(fs.existsSync(USAGE_REDIRECT_PATH), 'usage/index.html 파일 존재');
const redirHtml = fs.readFileSync(USAGE_REDIRECT_PATH, 'utf-8');
ok(redirHtml.includes('/web/usage/'), 'usage/ -> /web/usage/ 리다이렉트 확인');

// [Test 3 & 4] Playwright 기반 브라우저 E2E 검증 (목업 릴레이)
(async () => {
  console.log('\n[Test 3] 브라우저 E2E 및 릴레이 연동 검증');

  let outsideRequests = [];
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (parsedUrl.pathname === '/usage') {
      const auth = req.headers['authorization'] || '';
      if (!auth.includes('valid_token')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized', message: 'Invalid token' }));
        return;
      }

      // 유효 토큰 응답: 순수 통계 숫자만
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        month: '2026-10',
        sub: 'cust_RT0001',
        total_chars: 1250000,
        cap_chars: 3000000,
        desk_minutes: 185,
        device_count: 3,
        max_devices: 10,
        total_calls: 320,
        targets: {
          en: { chars: 800000, calls: 200 },
          ja: { chars: 450000, calls: 120 }
        },
        _note: '원가 감시용 · 과금 근거 아님'
      }));
      return;
    }

    // 정적 파일 서빙 (/web/usage/index.html)
    if (parsedUrl.pathname === '/web/usage/' || parsedUrl.pathname === '/web/usage/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(USAGE_HTML_PATH));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const chromePath = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const launchOptions = {
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined
  };

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();

  page.on('request', req => {
    const u = req.url();
    if (!u.startsWith(baseUrl)) {
      outsideRequests.push(u);
    }
  });

  try {
    // 1) 페이지 접속
    await page.goto(`${baseUrl}/web/usage/?relay=${encodeURIComponent(baseUrl)}`);
    ok(await page.isVisible('#view-auth'), '초기 화면: 인증 뷰 노출');
    ok(!(await page.isVisible('#view-usage')), '초기 화면: 대시보드 뷰 숨김');

    // 2) 잘못된 토큰 입력 시 에러 표시
    await page.fill('#input-token', 'bad_token');
    await page.click('#btn-auth');
    await page.waitForSelector('#auth-msg:not([style*="display: none"])');
    const errMsg = await page.textContent('#auth-msg');
    ok(errMsg.includes('401'), '잘못된 토큰 입력 시 401 오류 메시지 노출 확인');

    // 3) 올바른 토큰 입력 시 대시보드 전환 및 3대 핵심 지표 표시
    await page.fill('#input-token', 'Bearer valid_token');
    await page.click('#btn-auth');
    await page.waitForSelector('#view-usage:not(.hidden)');
    ok(await page.isVisible('#view-usage'), '올바른 토큰 입력 후 대시보드 뷰 활성화');
    ok(!(await page.isVisible('#view-auth')), '대시보드 진입 후 인증 뷰 숨김');

    // 메트릭 값 검증
    const charsText = await page.textContent('#val-chars');
    const deskText = await page.textContent('#val-desk');
    const devText = await page.textContent('#val-devices');
    const subText = await page.textContent('#dash-sub');

    ok(charsText.includes('1,250,000'), '번역 글자 수 1,250,000자 노출 확인');
    ok(deskText.includes('185분'), 'Desk 회의 분 185분 노출 확인');
    const deskSub = await page.textContent('#sub-desk');
    ok(deskSub.includes('3시간 5분'), 'Desk 회의 시간 환산(3시간 5분) 확인');
    ok(devText.includes('3대'), '등록 기기 수 3대 노출 확인');
    ok(subText.includes('cust_RT0001'), '고객 식별자 cust_RT0001 노출 확인');

    // 언어별 현황 검증
    const langContent = await page.textContent('#lang-list');
    ok(langContent.includes('EN') && langContent.includes('800,000'), '언어별 번역 en 800,000자 확인');
    ok(langContent.includes('JA') && langContent.includes('450,000'), '언어별 번역 ja 450,000자 확인');

    // 사람 기록 0건 검증 (발화 전문, 번역 텍스트, 사람 이름 일절 없음)
    const bodyText = await page.textContent('body');
    ok(!bodyText.includes('안녕하세요') && !bodyText.includes('Hello') && !bodyText.includes('홍길동'), '전문/발화/이름 등 사람 기록 0건 확인');

    // 외부 네트워크 요청 0건 검증
    ok(outsideRequests.length === 0, `외부 네트워크 요청 0건 확인 (실제: ${outsideRequests.length})`);

    // 4) 다른 코드 조회 버튼 클릭 시 복귀
    await page.click('#btn-reauth');
    ok(await page.isVisible('#view-auth'), '다른 코드 조회 클릭 시 인증 뷰 복귀 확인');
    ok(!(await page.isVisible('#view-usage')), '인증 뷰 복귀 시 대시보드 숨김 확인');

    console.log(`\n전부 통과 (${checks}건)`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
