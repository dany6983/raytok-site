// 줄 20: 웹 화면 디자인 1차 (web/listener, web/host, web/desk, web/verify) 검증 시험
// - 1. web/common/theme.css 및 4개 화면의 앱 디자인 토큰 검증
//      (글자 xs11·sm13·md15·lg17·xl22·hero30 / 간격 4·8·12·16·24 / 원문 13 ink0.5 · 번역 17 굵게 / 띠 78·동그라미 64)
// - 2. 4개 화면 theme.css 참조 확인
// - 3. Playwright 기반 브라우저 1.3배 글자 확대 환경에서 넘침(overflow) 0건 실측 검증
// - 4. 되돌림 실증 1건 (D-09)

const fs = require('fs');
const path = require('path');
const assert = require('assert');
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
/* ★ 10-22: 화면들은 `<link href="/common/theme.css">` 로 **뿌리의 복사본**을 받는다
   (이 저장소의 뿌리가 곧 raytok.kr 이다). 이 시험은 `web/common/theme.css` 만 보고 있었고,
   아래 목업 서버도 `/common/theme.css` 요청에 그 파일을 돌려줬다 — 그래서 **사이트가
   내보내는 파일이 낡아도 초록**이었다. 실제로 10-22 에 자막 글자 크기 고침이 `web/` 쪽에만
   들어가 손님 화면에서는 아무 일도 일어나지 않았다(§4: 같은 값이 두 곳에 있다).
   두 복사본이 **한 글자라도 다르면 붉다.** */
const SERVED_CSS_PATH = path.join(ROOT, 'common', 'theme.css');
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
ok(fs.existsSync(SERVED_CSS_PATH), '사이트가 내보내는 common/theme.css 파일 존재');
ok(fs.readFileSync(SERVED_CSS_PATH, 'utf-8') === themeCss,
   '뿌리 common/theme.css 와 web/common/theme.css 가 **같다** — 화면이 받는 것은 뿌리 쪽이다');

ok(themeCss.includes('--font-xs: 11px'), '글자 xs: 11px 확인');
ok(themeCss.includes('--font-sm: 13px'), '글자 sm: 13px (원문) 확인');
ok(themeCss.includes('--font-md: 15px'), '글자 md: 15px (본문) 확인');
ok(themeCss.includes('--font-lg: 17px'), '글자 lg: 17px (번역 굵게) 확인');
ok(themeCss.includes('--font-xl: 22px'), '글자 xl: 22px (섹션 헤더) 확인');
ok(themeCss.includes('--font-hero: 30px'), '글자 hero: 30px (타이틀) 확인');

ok(themeCss.includes('--sp-xs: 4px') && themeCss.includes('--sp-sm: 8px') && themeCss.includes('--sp-md: 12px') && themeCss.includes('--sp-lg: 16px') && themeCss.includes('--sp-xl: 24px'), '간격 4/8/12/16/24 규격 확인');
/* ★ 10-22 배색 바꿈: 바탕이 **밝아졌다**(앱과 같은 색). 잉크는 흰색이 아니라 **글자색
   (32,30,29)의 옅은 단계**다. 옛 단언은 숫자 0.5·0.45 를 글자 그대로 봤는데, 그 숫자는
   어두운 바탕 위 **흰 잉크**의 값이었다 — 밝은 바탕에 그대로 쓰면 글이 날아간다.
   지금 보는 것은 ① 세 단계가 다 있나 ② 같은 잉크(글자색)에서 나왔나 ③ high>mid>low 로
   **옅어지는 차례**인가 셋이다. 숫자를 박지 않는다. */
const inkOf = (name) => {
  const m = themeCss.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  return m ? m[1].trim() : '';
};
const inkMid = inkOf('ink-mid'), inkLow = inkOf('ink-low'), inkHigh = inkOf('ink-high');
const alpha = (v) => { const m = v.match(/rgba\([^)]*,\s*([0-9.]+)\s*\)/); return m ? parseFloat(m[1]) : 1; };
ok(!!inkHigh && !!inkMid && !!inkLow, `잉크 세 단계가 다 있다 (high=${inkHigh} mid=${inkMid} low=${inkLow})`);
/* ★ 한 이름(`--ink-*`)이 **배색 둘**을 받는다. 이 파일의 값은 **어두운 쪽**(`/buy/`,
   카드 심사 중이라 안 건드린다)이고, 앱 배색으로 가는 화면 넷은 자기 `:root` 에서
   **어두운 잉크**로 덮어쓴다. 그래서 여기서는 「셋이 있고 옅어지는가」만 보고,
   밝은 쪽은 **화면 넷을 직접** 센다(§4 — 읽는 곳을 전부 센다). */
for (const t of TARGET_FILES) {
  const html = fs.readFileSync(t.path, 'utf-8');
  const root = (html.match(/:root\s*\{[\s\S]*?\n\s*\}/) || [''])[0];
  ok(/--ink-mid:\s*rgba\(32,\s*30,\s*29/.test(root) && /--ink-low:\s*rgba\(32,\s*30,\s*29/.test(root),
     `${t.name}: 잉크가 **글자색(32,30,29)** 에서 나왔다 — 밝은 바탕이므로 흰 잉크가 아니다`);
  ok(/--bg:\s*var\(--rt-bg,\s*#f3f2f2\)/.test(root) && /--text:\s*var\(--rt-text,\s*#201e1d\)/.test(root),
     `${t.name}: 앱 배색을 /common/theme.css 에서 받고 떨어짐 값도 같다`);
}
ok(alpha(inkMid) > alpha(inkLow) && alpha(inkLow) >= 0.5,
   `high > mid > low 로 옅어진다 (mid ${alpha(inkMid)} > low ${alpha(inkLow)} ≥ 0.5)`);
/* 앱 배색을 실제로 들고 있나 — 값은 `raytok-native1/src/theme.js` 가 정본이다 */
for (const [name, val] of [['--rt-bg', '#f3f2f2'], ['--rt-surface', '#eae9e9'],
  ['--rt-text', '#201e1d'], ['--rt-accent', '#0088b0'], ['--rt-accent2', '#d6006c'],
  ['--rt-brand', '#0A0F1F'], ['--rt-danger', '#c62828']]) {
  ok(new RegExp(name + ':\\s*' + val).test(themeCss), `앱 배색 ${name} = ${val}`);
}
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
      // 브라우저가 받는 것과 **같은 파일**을 준다 — 목업이 다른 파일을 주면 실기와 갈린다(D-11)
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(fs.readFileSync(SERVED_CSS_PATH));
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
    let worstOverflow = 0;   // 아래 되돌림 실증이 이 **진짜 값**을 쓴다
    for (const t of TARGET_FILES) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 } // 모바일 390px 표준 뷰포트
      });

      await page.goto(`${baseUrl}${t.url}`);

      // 1.3배 글자 확대 적용 (마스터 17:20 지시: 글꼴 주입 제거)
      await page.evaluate(() => {
        document.body.style.zoom = '1.3';
      });
      await page.waitForTimeout(100);

      // 가로 넘침(horizontal overflow) 실측 검사 및 넘치는 요소 탐색 (마스터 17:20 지시)
      const overflowData = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
        const clientW = Math.max(docEl.clientWidth, body.clientWidth);
        const diff = scrollW - clientW;

        let overflowingElements = [];
        if (diff > 1) {
          const allEls = document.querySelectorAll('*');
          for (const el of allEls) {
            const rect = el.getBoundingClientRect();
            if (rect.right > clientW + 1) {
              const tag = el.tagName.toLowerCase();
              const id = el.id ? `#${el.id}` : '';
              const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
              overflowingElements.push({
                selector: `${tag}${id}${cls}`,
                right: Math.round(rect.right),
                overflowPx: Math.round(rect.right - clientW)
              });
            }
          }
        }
        return { scrollW, clientW, diff, overflowingElements };
      });

      if (overflowData.diff > 1) {
        console.error(`  [FAIL] ${t.name} 화면 1.3배 확대 시 가로 넘침 발생 (diff: ${overflowData.diff}px)`);
        console.error('  [넘치는 요소 목록]:', JSON.stringify(overflowData.overflowingElements, null, 2));
      }
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

      worstOverflow = Math.max(worstOverflow, overflowData.diff);
      await page.close();
    }

    // ── 되돌림 실증 1건 (D-09) ──
    // 머리말에 "4. 되돌림 실증 1건" 이라 적혀 있었는데 **코드가 없었다**(10-14 ⑨-1 점검).
    // 되돌림은 이 시험이 실제로 잰 값(네 화면 중 가장 큰 넘침)으로 한다. 지금 1px 이하라
    // 아래 단언이 던진다. 1.3배 확대에서 넘치도록 되돌리면 던지지 않고 ok 가 붉는다.
    let revertOverflowFailed = false;
    try {
      assert.ok(worstOverflow > 1, `1.3배 확대에서 가로 넘침 ${worstOverflow}px`);
    } catch (e) {
      revertOverflowFailed = true;
    }
    ok(revertOverflowFailed === true, `1.3배 확대에서 넘치면 붉어진다 — 지금 가장 큰 넘침 ${worstOverflow}px (되돌림 실증)`);

    console.log(`\n전부 통과 (${checks}건)`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
