/* samples/listener_logo_test.js — 손님 머리에 앱 로고 (NOW 10-22 18:05 「로고도 내 것으로」, web-open 95)
 * 실행: node samples/listener_logo_test.js   (npm run test:listener-logo)
 * 만든 판(index.html)을 본다 — 손님이 받는 것이 그 판이다. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
let n = 0;
const ok = (c, m) => { assert(c, m); n += 1; console.log('  [PASS] ' + m); };
console.log('=== 손님 화면 머리 로고 ===');
const html = fs.readFileSync(path.join(ROOT, 'web', 'listener', 'index.html'), 'utf8');
const m = html.match(/<div class="header-title">([\s\S]*?)<\/div>/);
ok(!!m, '머리(header-title)가 있다');
const head = m[1];
const img = head.match(/<img[^>]*src="([^"]+)"/);
ok(img && img[1] === '/assets/raytok-symbol-44.png', `머리에 앱 로고 기호 그림 (${img && img[1]})`);
ok(fs.existsSync(path.join(ROOT, img[1])), '그 그림 파일이 저장소에 있다');
ok(!/<svg/.test(head), '마이크 그림(svg)은 치웠다(§5)');
ok(/data-i18n="header_title"/.test(head), '머리 글자는 손님 언어 표(header_title)에서 그대로');
/* 되돌림 실증 — 만든 판에서 로고 그림을 옛 마이크 그림(svg)으로 바꿔 끼우면 위 단언이 던져야 한다 */
const headOk = (h) => { const mm = h.match(/<div class="header-title">([\s\S]*?)<\/div>/); return !!mm && /<img[^>]*src="\/assets\/raytok-symbol-44\.png"/.test(mm[1]) && !/<svg/.test(mm[1]); };
let revertFailed = false;
try {
  assert(headOk(html.replace(/<img[^>]*class="brand-logo"[^>]*>/, '<svg width="20" height="20"></svg>')), '로고를 빼면');
} catch (e) { revertFailed = true; }
ok(headOk(html) && revertFailed === true, '로고를 마이크 그림으로 되돌리면 붉어진다 (되돌림 실증)');
console.log(`\n전부 통과 (${n}건)`);
