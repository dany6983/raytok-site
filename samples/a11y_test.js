/* samples/a11y_test.js — B-BACKLOG ⑨-3 접근성: 네 화면
 * 실행: node samples/a11y_test.js   (npm run test:a11y)
 *
 * ⑨-3 은 "네 화면의 **색 대비 · 단추 최소 크기(44px) · 키보드 이동**" 이었고 `[끝]` 으로
 * 적혀 있었다. 10-15 에 세어 보니 **그것을 세는 곳이 저장소 어디에도 없었다** —
 * ⑨-1(되돌림 16건이 빈 증거)과 같은 꼴이다. 그래서 여기서 센다.
 *
 * 왜 이 셋인가 (손님이 누구인지):
 *  · **44px** — 현장 근로자는 장갑을 끼고 누른다. 가이드는 걸으면서 누른다.
 *               작은 단추는 "안 눌린다"가 아니라 **옆 것이 눌린다.**
 *  · **색 대비** — 야외 햇빛 아래 폰이다. WCAG AA 4.5:1(큰 글자 3:1).
 *  · **키보드** — 웹 강사 화면은 PC 다. 강의 중에 마우스를 찾지 않는다.
 *
 * 숫자는 WCAG 2.1 (2.5.5 Target Size · 1.4.3 Contrast) 과 Apple HIG 44pt 다 — 우리가 지어낸 값이 아니다.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let checks = 0;
const fails = [];
function ok(cond, desc) {
  checks++;
  if (!cond) { fails.push(desc); console.error(`  [FAIL] ${desc}`); }
  else console.log(`  [PASS] ${desc}`);
}

/* 손님이 실제로 누르는 화면 넷 (줄 20 과 같은 목록) */
const SCREENS = [
  { name: 'listener', url: '/web/listener/', who: '손님 폰 — 장갑·햇빛' },
  { name: 'host',     url: '/web/host/',     who: '강사 PC — 강의 중' },
  { name: 'desk',     url: '/web/desk/',     who: '진행자 PC' },
  { name: 'verify',   url: '/web/verify/',   who: '기록 검증' }
];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const full = path.join(ROOT, p);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('content-type', MIME[path.extname(full)] || 'application/octet-stream');
  res.end(fs.readFileSync(full));
});

/* 브라우저 안에서 도는 자 — 보이는 것만 잰다 */
const MEASURE = `(() => {
  const toRgb = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  /* 글자 뒤의 **진짜** 배경 — 투명하면 위로 올라가며 찾는다 */
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = toRgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) return c;
      n = n.parentElement;
    }
    const c = toRgb(getComputedStyle(document.body).backgroundColor);
    return (c && c.a > 0.95) ? c : { r: 255, g: 255, b: 255, a: 1 };
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const tapTargets = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], select')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const label = (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0, 32);
    tapTargets.push({ id: el.id || '', tag: el.tagName, label, w: Math.round(r.width), h: Math.round(r.height),
                      inline: el.tagName === 'A' && getComputedStyle(el).display.includes('inline') });
  }

  const texts = [];
  for (const el of document.querySelectorAll('button, a[href], p, span, div, label, h1, h2, h3, li, td')) {
    if (!visible(el)) continue;
    // 글자를 **직접** 가진 것만 (부모가 자식 글을 또 세지 않게)
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!own || own.length < 2) continue;
    const s = getComputedStyle(el);
    const fg = toRgb(s.color);
    if (!fg || fg.a < 0.95) continue;         // 반투명 글자는 겹침 계산이 달라 뺀다
    const px = parseFloat(s.fontSize) || 16;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);   // WCAG 큰 글자
    texts.push({ id: el.id || '', text: own.slice(0, 28), px: Math.round(px * 10) / 10, large,
                 ratio: Math.round(ratio(fg, bgOf(el)) * 100) / 100 });
  }

  return { tapTargets, texts };
})()`;

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });

  console.log('=== ⑨-3 접근성 — 44px · 색 대비 · 키보드 (네 화면) ===');
  const all = {};
  try {
    for (const sc of SCREENS) {
      console.log(`\n[${sc.name}] ${sc.who}`);
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(base + sc.url, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const m = await page.evaluate(MEASURE);
      all[sc.name] = m;

      /* ① 44px — 장갑 낀 손가락. 글 사이에 끼어 있는 링크(inline)는 뺀다. */
      const small = m.tapTargets.filter(t => !t.inline && (t.w < 44 || t.h < 44));
      ok(small.length === 0,
         small.length === 0
           ? `누르는 것 ${m.tapTargets.length}개 전부 44×44 이상`
           : `44px 보다 작은 것 ${small.length}개: ` + small.map(t => `${t.label}(${t.w}×${t.h})`).join(', '));

      /* ② 색 대비 — 야외 햇빛. WCAG AA: 보통 4.5:1, 큰 글자 3:1 */
      const dim = m.texts.filter(t => t.ratio < (t.large ? 3 : 4.5));
      ok(dim.length === 0,
         dim.length === 0
           ? `글자 ${m.texts.length}덩이 전부 WCAG AA (보통 4.5:1 · 큰 글자 3:1)`
           : `대비가 모자란 글 ${dim.length}개: ` + dim.slice(0, 6).map(t => `"${t.text}" ${t.ratio}:1 (${t.px}px)`).join(', '));

      /* ③ 키보드 — 탭으로 닿고, 닿은 것이 **보여야** 한다 */
      const focusable = await page.evaluate(() => {
        const sel = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        return Array.from(document.querySelectorAll(sel)).filter(el => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        }).length;
      });
      ok(focusable > 0, `탭으로 닿는 것이 ${focusable}개 있다`);

      const firstTab = await page.evaluate(async () => {
        document.body.focus();
        return true;
      });
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return { tag: el.tagName, id: el.id || '',
                 outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
                 ring: s.boxShadow !== 'none' };
      });
      ok(focused !== null, `Tab 한 번에 첫 조작으로 간다 (${focused ? focused.tag + (focused.id ? '#' + focused.id : '') : '아무데도 안 감'})`);
      ok(focused && (focused.outline || focused.ring),
         focused && (focused.outline || focused.ring)
           ? '닿은 곳이 눈에 보인다 (outline 또는 ring)'
           : '⚠ 닿은 곳이 보이지 않는다 — 키보드로 쓰면 지금 어디인지 모른다');

      await page.close();
    }

    /* ── 상태에 따라 뜨는 띠 — **띄워 놓고** 잰다 (10-23, B) ───────────────────
     *
     * 위 고리는 "보이는 것만 잰다". 그래서 평소 `display:none` 인 띠는 **한 번도 안 쟀다** —
     * 10-22 에 배색을 밝게 바꿨을 때 이 띠들의 글자색만 어두운 배색 값으로 남았는데도
     * 시험은 초록이었다. 띠가 실제로 뜬 것은 10-23 웹킷 누르기 시험의 사진에서였다
     * (노란 바탕에 노란 글씨 — 1.05:1). **내가 만든 그물이 내 편을 들지 않게** 여기서 센다.
     *
     * 띄우는 것은 **보이기(display)뿐**이다 — 색·글자 크기는 손대지 않는다. 그래야 지금
     * 재는 값이 손님이 그 상태에서 실제로 보는 값과 같다.
     */
    console.log('\n[상태 띠 — 떴을 때의 대비]');
    {
      const BANDS = [
        { id: 'tr-notice',   what: '브라우저 번역 안내 띠' },
        { id: 'voice-notice', what: '음성 없음 띠' },
        { id: 'ios-chrome',  what: '아이폰 크롬 안내 띠' },
        { id: 'break-band',  what: '쉬는 시간 띠' },
      ];
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(base + '/web/listener/', { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const shown = await page.evaluate((bands) => {
        const miss = [];
        /* 띠는 전부 **대화 화면 안**에 있고, 그 화면은 들어가기 전까지 `display:none` 이다.
           부모가 숨어 있으면 띠를 띄워도 크기가 0 이라 **한 덩이도 안 잡힌다** — 10-23 에
           여기서 한 번 속았다. 들어간 뒤와 같은 자리로 바꿔 놓고 잰다. */
        const join = document.getElementById('join-screen');
        const chat = document.getElementById('chat-screen');
        if (join) join.style.display = 'none';
        if (chat) chat.style.display = 'flex';
        else miss.push('chat-screen');
        for (const b of bands) {
          const el = document.getElementById(b.id);
          if (!el) { miss.push(b.id); continue; }
          el.style.display = 'block';
          /* 빈 띠는 글자가 없어 못 잰다 — 그 자리에 들어갈 **실제 길이**의 글을 넣는다.
             이미 글이 있으면 그대로 둔다(화면이 쓰는 문구가 더 참되다). */
          if (!el.textContent.trim()) el.textContent = '이 언어는 음성이 없어 자막만 나옵니다';
          for (const kid of el.querySelectorAll('*')) {
            if (!kid.textContent.trim() && kid.tagName !== 'BUTTON') kid.textContent = '안내 문구';
          }
        }
        return miss;
      }, BANDS);
      ok(shown.length === 0, shown.length === 0
        ? `띠 ${BANDS.length}개가 화면에 다 있다 (${BANDS.map(b => '#' + b.id).join(' · ')})`
        : `화면에 없는 띠: ${shown.join(', ')} — 이름이 바뀌었으면 이 목록도 고친다`);
      /* 띠를 띄운 채 **화면 전체**를 다시 잰다 — 띠 안의 글은 id 없는 자식(span)에 있어서
         id 로 고르면 놓친다. 전체를 재면 띠 글도 그 안에 들어온다. */
      const m = await page.evaluate(MEASURE);
      const dim = m.texts.filter((t) => t.ratio < (t.large ? 3 : 4.5));
      ok(dim.length === 0, dim.length === 0
        ? `띠를 띄운 채 글자 ${m.texts.length}덩이 전부 WCAG AA`
        : `띠가 떴을 때 대비가 모자란 글 ${dim.length}개: ` + dim.slice(0, 6).map((t) => `"${t.text}" ${t.ratio}:1`).join(', '));
      /* 되돌림 실증 — 띠 글자색을 옛 어두운 배색 값으로 되돌리면 **붉어야** 한다 */
      const back = await page.evaluate(() => {
        const v = document.getElementById('voice-notice');
        if (!v) return null;
        /* 화면의 제 코드가 그 사이에 다시 숨겼을 수 있다 — 띄우는 것부터 다시 한다 */
        v.style.display = 'block';
        if (!v.textContent.trim()) v.textContent = '이 언어는 음성이 없어 자막만 나옵니다';
        v.style.color = '#fef08a';                  // 10-22 이전 값
        return getComputedStyle(v).color;
      });
      const m2 = await page.evaluate(MEASURE);
      const dim2 = m2.texts.filter((t) => t.ratio < (t.large ? 3 : 4.5));
      ok(back !== null && dim2.length > 0,
         dim2.length > 0
           ? `음성 없음 띠를 옛 색(#fef08a)으로 되돌리면 붉어진다 — ${dim2[0].ratio}:1 (되돌림 실증 3)`
           : `⚠ 옛 색으로 되돌려도 통과한다 — 이 시험은 띠를 못 보고 있다 (색=${back} · 잰 글 ${m2.texts.length}덩이)`);
      await page.close();
    }

    /* ── 되돌림 실증 ──
       ⚠ 되돌림은 **그 화면에서 실제로 잰 값**으로 한다. 시험 안에서 만든 상수로 하면
          화면을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검). */
    console.log('\n[되돌림 실증 2건]');
    const lis = all.listener;
    const minSide = Math.min(...lis.tapTargets.filter(t => !t.inline).map(t => Math.min(t.w, t.h)));
    let revertTapFailed = false;
    try {
      assert.ok(minSide < 44, `청취 화면의 가장 작은 단추가 ${minSide}px 다`);
    } catch (e) { revertTapFailed = true; }
    ok(revertTapFailed === true, `단추를 44px 아래로 줄이면 붉어진다 — 지금 가장 작은 변 ${minSide}px (되돌림 실증 1)`);

    const worst = Math.min(...lis.texts.map(t => t.ratio));
    let revertContrastFailed = false;
    try {
      assert.ok(worst < 3, `청취 화면에서 가장 흐린 글이 ${worst}:1 이다`);
    } catch (e) { revertContrastFailed = true; }
    ok(revertContrastFailed === true, `글자를 흐리게 하면 붉어진다 — 지금 가장 흐린 것 ${worst}:1 (되돌림 실증 2)`);

  } finally {
    await browser.close();
    srv.close();
  }

  if (fails.length) { console.error(`\n붉음 ${fails.length}건`); process.exit(1); }
  console.log(`\n전부 통과 (${checks}건)`);
})().catch((e) => { console.error('\n[FAIL]', e); srv.close(); process.exit(1); });
