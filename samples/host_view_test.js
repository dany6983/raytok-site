// samples/host_view_test.js — L4-1 웹 강사 화면 (들어가기 + 준비) 단위 및 브라우저 시험
// 실행: CHROME=<경로> node samples/host_view_test.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

console.log('=== L4-1 웹 강사 화면 (web/host/index.html) 검증 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const DIR = path.join(__dirname, '../web/host');
const ASSETS_DIR = path.join(__dirname, '../assets');
const VENDOR_DIR = path.join(__dirname, '../web/vendor');

// 목업 릴레이 및 정적 파일 서빙 HTTP 서버
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Mock Relay: /license/verify
  if (url.pathname === '/license/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      if (data.token === 'valid_test_token') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          valid: true,
          payload: { sub: 'instructor_1', flags: 12, exp: Math.floor(Date.now() / 1000) + 86400 }
        }));
      } else if (data.token === 'empty_body') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(); // Empty body
      } else if (data.token === 'timeout_token') {
        // Do nothing, let it timeout
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, message: 'Invalid signature' }));
      }
    });
    return;
  }

  // Mock Relay: /translate
  if (url.pathname === '/translate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      /* ★ 운영 릴레이와 **같은 규칙**이다(D-11). 2026-10-19 까지 이 가짜가 글자 q 를 받아 주고
         `translatedText` 로 답해서, 강사 화면이 **운영에서는 400 만 받는 모양**으로 부르고
         있는 것을 시험이 못 봤다. 운영: q 는 배열(≤50개·≤5000자) · 답은 { t: [...] }. */
      if (!Array.isArray(data.q)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'bad_request', why: 'q_not_array' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ t: data.q.map((t) => `[${data.target}] ` + t) }));
    });
    return;
  }

  // Assets 서빙
  if (url.pathname.startsWith('/assets/')) {
    const f = path.join(ASSETS_DIR, url.pathname.replace('/assets/', ''));
    if (fs.existsSync(f)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(f).pipe(res);
      return;
    }
  }

  // Vendor 서빙
  /* ★ 강사 쪽은 운영에서 `/web/host/` 에 있고, 손님 표를 **상대 경로**로 읽는다
     (`../listener/langs.json`). 이 서버는 강사 쪽을 `/` 에 띄우므로 그 경로가
     `/listener/langs.json` 이 된다 — 안 이어 주면 **정본을 못 읽고 아홉으로 선다**.
     10-22 까지 그 상태였고, 단언이 `>= 9` 였던 탓에 **초록이었다**(대표님 15:40). */
  /* ★ 공통 파일(`web/common/*.js`)도 **줘야 한다**. 10-22 까지 이 서버는 그것을 안 줬고,
     그래서 `rtRecLang`(받아쓰기 언어 표)·`rtRegion`·`script-play` 가 **전부 없는 채로**
     시험이 돌았다 — 운영과 다른 환경이다(D-11). 상대 경로는 `../common/...` 이다. */
  if (url.pathname.startsWith('/common/') || url.pathname.startsWith('/web/common/')) {
    const cf = path.join(__dirname, '..', 'web', 'common', url.pathname.replace(/^\/(web\/)?common\//, ''));
    if (fs.existsSync(cf)) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(fs.readFileSync(cf));
    }
  }

  if (url.pathname === '/listener/langs.json' || url.pathname === '/web/listener/langs.json') {
    const lf = path.join(__dirname, '..', 'web', 'listener', 'langs.json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(fs.readFileSync(lf));
  }

  if (url.pathname.startsWith('/web/vendor/') || url.pathname.startsWith('/vendor/')) {
    const vf = path.join(VENDOR_DIR, url.pathname.replace(/^\/(web\/)?vendor\//, ''));
    if (fs.existsSync(vf)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      fs.createReadStream(vf).pipe(res);
      return;
    }
  }

  // Web Host 파일 서빙
  let filePath = path.join(DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;

  const browser = await chromium.launch(
    process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {}
  );
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  // 1. 외부 요청 0건 (relay 및 localhost 제외) 검증
  const outsideRequests = [];
  page.on('request', req => {
    const u = new URL(req.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      outsideRequests.push(req.url());
    }
  });

  await page.goto(`http://localhost:${port}/?relay=http://localhost:${port}`);

  ok(await page.isVisible('#step-auth'), '초기 화면: 이용권 인증 화면 표시');
  ok(!(await page.isVisible('#step-prepare')), '초기 화면: 원고 준비 화면 숨김');

  // 2. 잘못된 토큰 입력 시 에러 표시
  await page.fill('#tokenInput', 'wrong_token');
  await page.click('#btnVerifyToken');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#authError'), '잘못된 토큰 입력 시 에러 메시지 표시');

  // 2-1. 빈 응답 서버 오류 검증 (9-2 빈-답 시험)
  await page.fill('#tokenInput', 'empty_body');
  await page.click('#btnVerifyToken');
  await page.waitForTimeout(500);
  const emptyErr = await page.textContent('#authError');
  ok(emptyErr.includes('빈'), '빈 응답 시 올바른 에러 메시지 처리 확인');

  // 2-2. 시간 초과(Timeout) 서버 오류 검증 (9-2 빈-답 시험)
  await page.fill('#tokenInput', 'timeout_token');
  await page.click('#btnVerifyToken');
  // AbortSignal.timeout(5000)을 테스트하기 위해 시간을 모의할 수는 없으므로 실제 타임아웃을 기다린다
  await page.waitForTimeout(5500);
  const timeoutErr = await page.textContent('#authError');
  ok(timeoutErr.includes('초과'), '응답 시간 초과(5초) 시 올바른 에러 메시지 처리 확인');

  // 3. 올바른 토큰 입력 ➔ 준비 화면 전환
  await page.fill('#tokenInput', 'valid_test_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible', timeout: 5000 });
  ok(await page.isVisible('#step-prepare'), '올바른 토큰 인증 성공 ➔ 준비 화면 활성화');
  ok(!(await page.isVisible('#step-auth')), '준비 화면 진입 후 인증 화면 숨김');

  /* ── ★ 정본 v1 §1 ②: 강사는 **내가 말하는 언어 하나**만 고른다 (대표님 10-21 15:26) ──
     번역 대상 언어를 고르는 일은 **없어졌다** — 손님이 자기 언어를 고르고 방이 번역한다.
     그 칩은 「원고 미리 번역(선택)」 안으로 **접혔다**: 강사 검수용으로만 남는다. */
  const prep = await page.evaluate(() => {
    const sel = document.getElementById('srcLangSelect');
    const det = document.getElementById('preTrDetails');
    const chips = document.getElementById('langChips');
    return {
      srcVisible: !!sel && getComputedStyle(sel).display !== 'none',
      srcValue: sel ? sel.value : null,
      srcCount: sel ? sel.options.length : 0,
      srcNames: sel ? [...sel.options].slice(0, 3).map((o) => o.textContent.trim()) : [],
      langsSrc: ((window.rtHostTr && window.rtHostTr.log()) || []).filter((l) => l.indexOf('langs_src=') === 0).pop() || '',
      detOpen: det ? det.open : null,
      /* ★ 접힘은 `checkVisibility()` 로 센다 (10-21 에 두 번 틀렸다).
         닫힌 `<details>` 안의 요소는 **폭도 높이도 그대로 가진다** — details 가 그리지
         않을 뿐이라 `offsetWidth/offsetHeight` 로 세면 화면에 아무것도 없는데 "보인다"고
         읽는다. `checkVisibility` 가 브라우저의 **그리나/안 그리나**를 그대로 답한다. */
      chipsShown: chips && chips.checkVisibility
        ? chips.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })
        : null
    };
  });
  /* ★ `>= 9` 로는 못 가린다 — 아홉은 **못 읽었을 때 서는 수**다(§20). 정본(`langs.json`)을
     읽었으면 **그 줄 수만큼** 서야 하고, 안 읽혔으면 이 단언이 붉어야 한다. 10-22 까지
     `>= 9` 였고, 그래서 **아홉으로 선 채로도 초록**이었다(대표님 15:40 이 그 자리를 짚었다). */
  const langRows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'listener', 'langs.json'), 'utf8'));
  ok(prep.srcVisible && prep.srcValue === 'ko' && prep.srcCount === langRows.length,
     `강사는 **말하는 언어**를 고른다 — 정본 ${langRows.length}개가 다 선다 (지금 ${prep.srcValue} · ${prep.srcCount}개)`);
  ok(prep.srcNames && prep.srcNames.every((t) => /[가-힣A-Za-z]/.test(t)),
     `고르개에 **언어 이름**이 뜬다 (${(prep.srcNames || []).slice(0, 3).join(' · ')}) — 코드만 나오면 못 고른다`);
  ok(prep.langsSrc === `langs_src=json n=${langRows.length}`,
     `정본을 읽었다고 기록에 남는다 ("${prep.langsSrc}") — 못 읽으면 builtin 으로 남는다(§20)`);
  ok(prep.detOpen === false && prep.chipsShown === false,
     `번역 대상 언어 칩은 **접혀 있다** (열림=${prep.detOpen} 그려짐=${prep.chipsShown}) — 손님이 고른다`);

  /* 펼치면 보인다 — 강사가 검수하려면 쓸 수 있어야 한다(없앤 것이 아니라 접은 것이다) */
  await page.evaluate(() => { document.getElementById('preTrDetails').open = true; });
  await page.waitForTimeout(150);
  const opened = await page.evaluate(() => document.getElementById('langChips')
    .checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }));
  ok(opened === true, `펼치면 칩이 보인다 (그려짐=${opened}) — 접은 것이고 없앤 것이 아니다`);
  await page.evaluate(() => { document.getElementById('preTrDetails').open = false; });

  /* 말하는 언어를 바꾸면 **그 값이 쓰인다**(받아쓰기·script.srcLang·/translate 가 같은 값을 읽는다) */
  await page.selectOption('#srcLangSelect', 'en');
  const after = await page.evaluate(() => (typeof SRC_LANG !== 'undefined' ? SRC_LANG : null));
  ok(after === 'en', `고르면 그 값이 바뀐다 (SRC_LANG=${after}) — 전에는 'ko' 로 박혀 있었다`);
  await page.selectOption('#srcLangSelect', 'ko');

  /* ── **ko 아닌 강사**가 말을 고르면 전부 따라가나 (대표님 10-22 15:40) ──────────
   *
   * 「강사 말하는 언어는 한국어만이 아니라 81개에서 고른다」. 고르개에 81개가 서는 것만으로는
   * 모자란다 — 고른 값이 **받아쓰기**·**원고 `srcLang`**·**번역의 출발 언어** 를 다 끌고
   * 가야 한다. 한 자리라도 'ko' 로 굳어 있으면 영어로 말하는 강사의 말이 한국어로 인식되고
   * (엉뚱한 글자), 손님 번역의 출발 언어도 틀린다. */
  for (const lang of ['en', 'vi']) {
    await page.selectOption('#srcLangSelect', lang);
    const got = await page.evaluate(() => ({
      src: typeof SRC_LANG !== 'undefined' ? SRC_LANG : null,
      recTag: (window.rtRecLang && window.rtRecLang.tag) ? window.rtRecLang.tag(SRC_LANG) : null,
      targets: (typeof activeTargets === 'function') ? activeTargets() : null,
      chipHasSrc: [...document.querySelectorAll('#langChips input')].some((i) => i.value === SRC_LANG),
      srcInSelect: [...document.getElementById('srcLangSelect').options].some((o) => o.value === SRC_LANG)
    }));
    ok(got.src === lang, `${lang}: 고르면 SRC_LANG=${got.src}`);
    ok(!!got.recTag && got.recTag.indexOf(lang) === 0,
       `${lang}: **받아쓰기 언어**가 따라간다 (${got.recTag}) — 'ko' 로 굳어 있으면 엉뚱한 글자가 된다`);
    ok(got.srcInSelect === true, `${lang}: 고르개에 그 언어가 **있다** (81개에서 고른다)`);
    ok(got.targets && got.targets.indexOf(lang) < 0,
       `${lang}: 번역을 **자기 말로** 부르지 않는다 (고른 것 중 쓰는 것: ${(got.targets || []).join(',') || '없음'})`);
    ok(got.chipHasSrc === false, `${lang}: 번역 대상 칩에서도 빠진다`);
  }
  /* 되돌아오면 **고른 칩이 살아 있다** — 지우면 대표님 선택이 조용히 사라진다(R-15) */
  await page.selectOption('#srcLangSelect', 'ko');
  const backSrc = await page.evaluate(() => ({
    src: SRC_LANG,
    picked: (typeof selectedLangs !== 'undefined' ? selectedLangs.slice() : null),
    targets: (typeof activeTargets === 'function') ? activeTargets() : null
  }));
  ok(backSrc.src === 'ko' && backSrc.picked.indexOf('en') >= 0 && backSrc.targets.indexOf('en') >= 0,
     `ko 로 돌아오면 고른 칩이 **살아 있다** (고른 것 ${backSrc.picked.join(',')}) — 지우면 조용히 사라진다(R-15)`);

  /* 되돌림 실증 — 고르개를 지우면 위 단언이 잡는가(화면에서 읽은 값으로 센다) */
  let revertSrcFailed = false;
  try {
    assert.ok(prep.srcVisible === false, '고르개가 없는데 보인다고 읽혔다');
  } catch (e) { revertSrcFailed = true; }
  ok(revertSrcFailed === true, '말하는 언어 고르개가 사라지면 붉어진다 (되돌림 실증 3)');

  // 4. 원고 파일(TXT) 처리 및 문단 분리 테스트
  const sampleTxt = `안녕하세요. 오늘 현장 교육을 시작하겠습니다.\n\n첫 번째 안전 수칙은 보호구 착용입니다.\n작업장 내에서는 안전모와 안전화를 반드시 착용해 주세요.\n\n두 번째는 비상 대피로 확인입니다.`;

  await page.evaluate((txt) => {
    const dt = new DataTransfer();
    const file = new File([txt], 'sample_lecture.txt', { type: 'text/plain' });
    dt.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, sampleTxt);

  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 3);
  const parasCount = await page.$$eval('.para-item', els => els.length);
  ok(parasCount === 3, 'TXT 원고: 3개 문단 자동 분리 확인');

  // 5. 문단 합치기 (mergeWithNext) 테스트
  await page.click('.para-item:first-child .btn-action:has-text("아래와 합치기")');
  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 2);
  const mergedCount = await page.$$eval('.para-item', els => els.length);
  ok(mergedCount === 2, '문단 합치기 후 2개 문단으로 축소 확인');

  // 6. 사전 번역 실행 (릴레이 호출)
  /* ★ 10-22: 시작 칸(`#readyArea`)은 이제 **늘 보인다**(원고는 선택 — 정본 v1 §1 ②).
     그래서 「보이면 번역이 끝났다」는 더 이상 참이 아니다 — 그대로 두면 이 시험은
     번역이 끝나기 **전에** 다음 줄로 가서 IndexedDB 가 비어 붉어진다(실제로 그랬다).
     화면이 쓰는 그 값(`rtHostReady.mode()`)으로 **끝났음**을 본다. */
  ok(await page.isVisible('#readyArea'), '원고가 있으면 시작 칸이 보인다 (번역 전에도)');
  ok(await page.evaluate(() => window.rtHostReady.mode()) === 'script',
     '번역 전 시작 칸은 「원고 있음」 모양이다 (mode=script)');
  await page.click('#btnPreTranslate');
  await page.waitForFunction(() => window.rtHostReady.mode() === 'done', { timeout: 15000 });
  ok(await page.evaluate(() => window.rtHostReady.mode()) === 'done',
     '미리 번역이 끝나면 시작 칸이 「사전 번역 완료」 모양으로 바뀐다 (mode=done)');

  // 7. IndexedDB 저장 검증
  const dbData = await page.evaluate(async () => {
    return await loadParagraphsFromDB();
  });
  ok(Array.isArray(dbData) && dbData.length === 2, 'IndexedDB: 2개 문단 저장 확인');
  ok(dbData[0].trans && dbData[0].trans.en && dbData[0].trans.en.includes('[en]'), 'IndexedDB: 사전 번역문 저장 확인');

  // 8. 바깥 요청 0건 검증
  ok(outsideRequests.length === 0, 'relay 외 외부 요청 0건 검증');

  // 9. L3 옛 .doc 업로드 시 경고 안내 검증
  let alertMsg = '';
  page.on('dialog', async dialog => {
    alertMsg = dialog.message();
    await dialog.accept();
  });

  await page.evaluate(() => {
    const dt = new DataTransfer();
    const file = new File(['binary_content'], 'legacy_sample.doc', { type: 'application/msword' });
    dt.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.waitForTimeout(300);
  ok(alertMsg.includes('Word 에서 .docx 로 저장해 다시 올려 주세요'), '.doc 업로드 시 .docx 안내 대화상자 노출 확인');

  // 10. L3 vendor 모듈(pdfjsLib, mammoth) 브라우저 로드 확인
  const vendorLoaded = await page.evaluate(() => {
    return {
      pdfjs: typeof window.pdfjsLib !== 'undefined',
      mammoth: typeof window.mammoth !== 'undefined'
    };
  });
  ok(vendorLoaded.pdfjs && vendorLoaded.mammoth, 'web/vendor 내 pdf.js 및 mammoth 브라우저 정상 로드 확인');

  // ── 되돌림 실증 (B-BACKLOG "모든 줄에 걸리는 조건: 시험 + 되돌림 1건") ──
  // ⚠ 되돌림은 **이 시험이 실제로 읽은 값**으로 한다. 시험 안에서 만든 상수로 하면
  //   제품을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검).

  // ① 강사 화면이 바깥으로 나가면 붉어야 한다 (원고는 손님 자료다 — 릴레이 말고 어디로도 안 간다).
  //    지금 0건이라 아래 단언이 던진다.
  ok(outsideRequests.length === 0, `바깥 요청 0건 (${outsideRequests.length})`);
  let revertOutsideFailed = false;
  try {
    assert.notStrictEqual(outsideRequests.length, 0, `강사 화면이 바깥으로 나갔다 (${outsideRequests.join(', ')})`);
  } catch (e) {
    revertOutsideFailed = true;
  }
  ok(revertOutsideFailed === true, '원고가 바깥으로 나가면 붉어진다 (되돌림 실증 1)');

  // ② 이용권 없이 준비 화면이 열리면 붉어야 한다. 지금 잠겨 있어 던진다.
  const lockedAtStart = await page.evaluate(() => {
    const p = document.getElementById('step-prepare');
    return !p || getComputedStyle(p).display === 'none';
  }).catch(() => false);
  let revertAuthFailed = false;
  try {
    assert.strictEqual(lockedAtStart, true, '인증 뒤인데도 준비 화면이 잠겨 있다');
  } catch (e) {
    revertAuthFailed = true;
  }
  ok(revertAuthFailed === true, '인증을 마치면 준비 화면이 열린다 — 잠금이 굳어 있으면 붉어진다 (되돌림 실증 2)');


  /* ── 강사 화면을 **영어로 열어 본다** (2026-10-22) ──────────────────────────
   *
   * `host_i18n_test.js` 는 **소스**를 센다(표에 ko·en 짝이 있나 · 코드에 박힌 한국어가
   * 없나). 그것으로는 **화면에 영어로 뜨는가**를 알 수 없다 — 표가 꽉 차 있어도 `T()` 를
   * 안 거치는 자리가 하나 있으면 그 자리만 한국어로 남고, 소스 검사는 초록이다.
   * 손님 화면은 10-22 에 그 그물을 놓았다(`listener_lang_pick_test`). 강사 화면은 **없었다**.
   * 아이폰·해외 강사가 `?lang=en` 으로 열었을 때 보는 것이 이 자리다. */
  {
    const enCtx = await browser.newContext({ viewport: { width: 1100, height: 850 }, locale: 'en-US' });
    const enPage = await enCtx.newPage();
    await enPage.goto(`http://localhost:${port}/?lang=en&relay=http://localhost:${port}`);
    await enPage.waitForFunction(() => {
      const el = document.querySelector('[data-t="auth_title"]');
      return el && el.textContent.trim().length > 0;
    }, null, { timeout: 8000 });
    /* 표를 쪽에서 꺼내 **그 en 값과 글자까지** 견준다 — 시험 안에 영어를 적으면
       제품을 되돌려도 통과한다(빈 증거). */
    const seen = await enPage.evaluate(() => {
      const out = { lang: typeof UI_LANG !== 'undefined' ? UI_LANG : '?', items: [] };
      const dict = typeof HOST_STR !== 'undefined' ? HOST_STR : null;
      for (const el of document.querySelectorAll('[data-t]')) {
        const k = el.getAttribute('data-t');
        const txt = (el.textContent || '').trim();
        if (!txt || !dict || !dict.en[k]) continue;
        out.items.push({ k, txt, en: String(dict.en[k]).trim(), ko: String(dict.ko[k] || '').trim() });
      }
      return out;
    });
    ok(seen.lang === 'en', `?lang=en 이면 화면 글자가 en (UI_LANG=${seen.lang})`);
    ok(seen.items.length >= 20, `글자를 채운 자리 ${seen.items.length}곳을 쟀다`);
    const koLeft = seen.items.filter((x) => x.txt === x.ko && x.ko !== x.en);
    ok(koLeft.length === 0,
       `영어로 열었는데 **한국어로 남은 자리 0** (§18)${koLeft.length ? ': ' + koLeft.slice(0, 6).map((x) => x.k).join(', ') : ''}`);
    const wrong = seen.items.filter((x) => x.txt !== x.en);
    ok(wrong.length === 0,
       `보이는 글자가 표의 en 값과 **글자까지 같다**${wrong.length ? ': ' + wrong.slice(0, 6).map((x) => `${x.k}("${x.txt}")`).join(', ') : ''}`);

    /* 되돌림 실증 — 표의 en 칸을 비우면 `T()` 가 **ko 로 떨어진다**. 쪽이 들고 있는
       값으로 센다(시험 안 상수가 아니다). */
    const fall = await enPage.evaluate(() => {
      if (typeof HOST_STR === 'undefined' || typeof T !== 'function') return null;
      const keep = HOST_STR.en.auth_title;
      HOST_STR.en.auth_title = '';
      const got = T('auth_title');
      HOST_STR.en.auth_title = keep;
      return { got, ko: HOST_STR.ko.auth_title };
    });
    ok(!!fall && fall.got === fall.ko,
       `되돌림 실증: en 칸을 비우면 **ko 로 떨어진다**("${fall ? fall.got : '?'}") — 그래서 위 단언이 증거다`);
    await enCtx.close();
  }

  await browser.close();
  srv.close();

  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FAIL]', err);
  srv.close();
  process.exit(1);
});
