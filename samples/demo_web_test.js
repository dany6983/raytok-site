/* samples/demo_web_test.js — 11월 웹 데모의 **실측 두 줄**을 시험으로 굳힌다 (NOW 1, 2026-10-19)
 *
 * 표는 `docs/demo-web-gaps.md` 다. 그 표의 "실측" 칸이 여기서 나온다 — 다음에 화면이 넘치기
 * 시작하면 **표가 아니라 이 시험이** 먼저 붉어진다(표만 있으면 조용히 낡는다, §4).
 *
 * 보는 것:
 *   ① 강사 화면이 PC·폰(390·360) 폭에서 **좌우로 넘치지 않고**, 손가락이 닿는 칸이 44px 이상
 *   ② 손님 화면이 QR 링크(`?room=`)로 들어오면 코드 칸을 **채우고 읽기전용**으로 둔다
 *   ③ 두 화면 다 `pageerror` 0
 * 바깥 요청은 하지 않는다 — 저장소 파일을 그 자리에서 서빙한다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TOUCH_MIN = 44;                       // 접근성 시험(samples/a11y_test.js)과 같은 값

let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

const serve = () => new Promise((resolve) => {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    let f = path.join(ROOT, u.pathname);
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200); fs.createReadStream(f).pipe(res); }
    else { res.writeHead(404); res.end('Not Found'); }
  });
  srv.listen(0, () => resolve({ srv, base: `http://localhost:${srv.address().port}` }));
});

/** 좌우로 넘치나 — 이 한 함수가 판정의 **유일한** 자리다(되돌림 실증이 이것을 흔든다). */
const overflowX = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth > window.innerWidth + 1);

(async () => {
  console.log('=== 11월 웹 데모 실측 — 강사·손님 화면 폭과 QR 링크 ===\n');
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  try {
    /* ① 강사 화면 — PC 와 폰 둘 */
    for (const [name, width, height] of [['PC 1280', 1280, 900], ['폰 390', 390, 844], ['폰 360', 360, 740]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`${base}/web/host/`);
      await page.waitForSelector('#tokenInput');

      ok((await overflowX(page)) === false, `강사 화면 ${name}: 좌우로 넘치지 않는다`);
      ok(errs.length === 0, `강사 화면 ${name}: pageerror 0 (${errs[0] ? errs[0].slice(0, 40) : '없음'})`);

      const sizes = await page.evaluate((min) => {
        const r = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
        return { input: r('#tokenInput'), btn: r('#step-auth button'), min };
      }, TOUCH_MIN);
      ok(sizes.input >= TOUCH_MIN, `강사 화면 ${name}: 이용권 칸 ${sizes.input}px ≥ ${TOUCH_MIN}`);
      ok(sizes.btn >= TOUCH_MIN, `강사 화면 ${name}: 들어가기 단추 ${sizes.btn}px ≥ ${TOUCH_MIN}`);

      const step = await page.evaluate(() => ({
        auth: getComputedStyle(document.querySelector('#step-auth')).display !== 'none',
        prepare: getComputedStyle(document.querySelector('#step-prepare')).display === 'none'
      }));
      ok(step.auth && step.prepare, `강사 화면 ${name}: 처음은 이용권 인증 칸만 보인다`);
      await page.close();
    }

    /* ② 손님 화면 — QR 링크로 들어온 모양 */
    const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const gErrs = [];
    guest.on('pageerror', (e) => gErrs.push(e.message));
    await guest.goto(`${base}/web/listener/?room=abc123&lang=vi`);
    await guest.waitForSelector('#room-input');
    const g = await guest.evaluate(() => {
      const i = document.querySelector('#room-input');
      return { value: i.value, readOnly: i.readOnly, h: Math.round(i.getBoundingClientRect().height),
               body: (document.body.innerText || '').replace(/\s+/g, ' ') };
    });
    ok(g.value === 'ABC123', `손님: QR 링크의 방 코드가 칸에 채워진다 (${g.value}) — 손님은 치지 않는다`);
    /* 읽기전용은 **아니다** — 읽기전용은 `?demo` 로 들어온 고정 방(000000)에서만이다
       (`web/listener/index.src.html` 930). 손님이 코드를 고칠 수 있다는 뜻이고, 데모를 막지는
       않는다. 글로만 "읽기전용"이라고 적었다가 여기서 붉어져 고쳤다(§3: 코드의 출력이 사실이다). */
    ok(g.readOnly === false, '손님: QR 로 온 코드 칸은 읽기전용이 아니다 — 고칠 수 있다 (고정 방은 ?demo 뿐)');
    ok((await overflowX(guest)) === false, '손님 390폭: 좌우로 넘치지 않는다');
    ok(gErrs.length === 0, `손님: pageerror 0 (${gErrs[0] ? gErrs[0].slice(0, 40) : '없음'})`);
    ok(/Tham gia|Mã phiên/.test(g.body), '손님: 화면이 손님 언어(vi)로 뜬다 — 한국어가 아니다');
    ok(g.h >= TOUCH_MIN, `손님: 코드 칸 ${g.h}px ≥ ${TOUCH_MIN}`);

    /* ③ 되돌림 실증 (D-09) — 넘침 판정이 **정말 넘침을 보는지**.
       판정 함수를 그대로 쓰고, 화면에 넓은 것을 하나 붙여 본다. 여기서 만든 상수가 아니라
       **같은 페이지의 같은 함수**가 답을 바꾸어야 한다. */
    await guest.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'revert-probe';
      d.style.cssText = 'width:3000px;height:4px;';
      document.body.appendChild(d);
    });
    ok((await overflowX(guest)) === true, '3000px 짜리를 붙이면 넘침 판정이 참으로 바뀐다 (되돌림 실증 ①)');
    await guest.evaluate(() => document.getElementById('revert-probe').remove());
    ok((await overflowX(guest)) === false, '치우면 다시 거짓 — 판정이 들러붙지 않는다 (되돌림 실증 ②)');

    /* 코드 채우기를 빼면 붉어지나 — 링크에 room 이 없으면 칸이 비고 읽기전용이 아니다 */
    const bare = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await bare.goto(`${base}/web/listener/?lang=vi`);
    await bare.waitForSelector('#room-input');
    const b = await bare.evaluate(() => {
      const i = document.querySelector('#room-input');
      return { value: i.value, readOnly: i.readOnly };
    });
    ok(b.value === '' && b.readOnly === false,
       'QR 없이 열면 칸이 비고 손님이 친다 — 위 두 단언이 ?room= 덕이라는 증거 (되돌림 실증 ③)');
    await bare.close();
    await guest.close();
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\n${fail === 0 ? '전부 통과' : '붉다'} (${pass + fail}건${fail ? `, 실패 ${fail}` : ''})`);
  process.exit(fail === 0 ? 0 : 1);
})();
