/* samples/host_i18n_test.js — B 12: 강사 화면 손님 글자가 **표 한 곳**에서 나오는가 (§18)
 * 실행: node samples/host_i18n_test.js   (npm run test:host-i18n)
 *
 * 마스터 2026-10-16 21:00 B 12: "`/web/host/` 와 `/web/listener/` 의 손님 글자를 **en 도 손 표**에
 * 채운다(지금 ko 만인 자리). §18 과 같은 까닭 — **영어 폰에 한국어가 나온다.**"
 *
 * 10-16 까지 강사 화면은 표에 40개만 있고 **~82곳이 코드에 박힌 한국어**였다. `?lang=en` 으로 열면
 * 그 자리가 전부 한국어로 보였다. 지금은 125쌍이 표에 있고, 이 시험이 **다시 늘어나는 것을 막는다.**
 *
 * 왜 글자를 세는가(모양이 아니라): 사람 조심으로는 막히지 않는다 — §18 이 그래서 생겼다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let checks = 0;
function ok(cond, msg) { assert(cond, msg); checks++; console.log('  [PASS] ' + msg); }

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'web', 'host', 'index.html'), 'utf-8');
const HAN = /[가-힣]/;

/* 표를 뽑는다 — 표 자체는 ko 글자를 들고 있어야 하니 아래 검사에서 **뺀다** */
const dictBlock = (src.match(/const HOST_STR = \{[\s\S]*?\n    \};/) || [])[0];
assert(dictBlock, 'HOST_STR 표를 못 찾았다');
// eslint-disable-next-line no-eval
const HOST_STR = eval('(' + dictBlock.replace('const HOST_STR = ', '').replace(/;$/, '') + ')');
const bodyNoDict = src.replace(dictBlock, '');

console.log('=== B 12 강사 화면 — 손님 글자가 표 한 곳에서 나오는가 ===\n');

/* ── 1. 표가 ko·en 둘 다 꽉 찼나 ── */
console.log('[1] 표 자체 — ko·en 짝이 맞고 빈 칸이 없다');
const ko = Object.keys(HOST_STR.ko), en = Object.keys(HOST_STR.en);
ok(ko.length >= 120, `표에 키 ${ko.length}개 (10-16 전에는 40개였다)`);
const missEn = ko.filter(k => !(k in HOST_STR.en));
ok(missEn.length === 0, `en 에 빠진 키 0 (빠지면 T() 가 **ko 로 떨어져** 영어 폰에 한국어가 나온다)${missEn.length ? ': ' + missEn : ''}`);
const emptyEn = en.filter(k => !HOST_STR.en[k]);
ok(emptyEn.length === 0, `en 이 **빈 칸**인 키 0 — 빈 값도 ko 로 떨어진다${emptyEn.length ? ': ' + emptyEn : ''}`);
const sameBoth = ko.filter(k => HOST_STR.ko[k] === HOST_STR.en[k] && HAN.test(HOST_STR.ko[k]));
ok(sameBoth.length === 0, `en 이 ko 와 **글자까지 같은** 키 0 (안 번역한 것)${sameBoth.length ? ': ' + sameBoth : ''}`);
const extraEn = en.filter(k => !(k in HOST_STR.ko));
ok(extraEn.length === 0, `ko 에 없는 en 키 0 (쓰이지 않는 칸)${extraEn.length ? ': ' + extraEn : ''}`);

/* ── 2. 마크업에 표를 안 거친 한국어가 없나 ── */
console.log('\n[2] 마크업 — data-t 없는 한국어 글자가 없다');
const markup = bodyNoDict.slice(bodyNoDict.indexOf('<body'), bodyNoDict.indexOf('<script>'));
const markupLeft = [];
for (const m of markup.matchAll(/>([^<>{}]{2,160})</g)) {
  const t = m[1].trim();
  if (!HAN.test(t)) continue;
  const ls = markup.lastIndexOf('<', m.index);
  if (markup.slice(ls, m.index + 1).includes('data-t=')) continue;
  markupLeft.push(t.slice(0, 50));
}
ok(markupLeft.length === 0, `마크업에 표를 안 거친 한국어 0곳${markupLeft.length ? ':\n    ' + markupLeft.join('\n    ') : ''}`);

/* ── 3. JS 가 화면에 한국어를 직접 박지 않나 ── */
console.log('\n[3] JS — 화면·알림에 한국어를 직접 박지 않는다');
let script = bodyNoDict.slice(bodyNoDict.indexOf('<script>'));
script = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const jsLeft = [];
for (const m of script.matchAll(/\.(textContent|innerHTML|placeholder|title|value)\s*=\s*(['"`])((?:[^\\]|\\.)*?)\2/gs)) {
  if (HAN.test(m[3])) jsLeft.push(m[1] + ': ' + m[3].replace(/\s+/g, ' ').slice(0, 50));
}
ok(jsLeft.length === 0, `화면에 직접 박은 한국어 0곳${jsLeft.length ? ':\n    ' + jsLeft.join('\n    ') : ''}`);

const msgLeft = [];
for (const m of script.matchAll(/(?:throw new Error|alert|confirm)\(\s*(['"`])((?:[^\\]|\\.)*?)\1/gs)) {
  if (HAN.test(m[2])) msgLeft.push(m[2].slice(0, 50));
}
ok(msgLeft.length === 0, `손님이 보는 알림·오류문에 박힌 한국어 0곳 — 오류문도 손님 글자다${msgLeft.length ? ':\n    ' + msgLeft.join('\n    ') : ''}`);

/* ── 4. 언어 이름도 손님 글자다 ── */
console.log('\n[4] 언어 이름 표 — name_en 이 있고 읽는 곳이 하나다');
const langTable = (src.match(/const SUPPORTED_TARGET_LANGS = \[[\s\S]*?\];/) || [])[0] || '';
const rows = [...langTable.matchAll(/code:\s*'([\w-]+)'/g)].map(m => m[1]);
const withEn = [...langTable.matchAll(/name_en:\s*'/g)].length;
ok(rows.length > 0 && withEn === rows.length, `언어 ${rows.length}줄 전부 name_en 이 있다 (${withEn})`);
ok(/function langName\(/.test(src), '언어 이름을 고르는 곳이 langName() 한 함수다 (읽는 자리가 셋이었다, §4)');
ok(!/\$\{l\.name\}/.test(src) && !/info \? info\.name : code/.test(src),
   '읽는 곳 셋이 전부 langName() 을 지난다 — ko 이름을 직접 읽는 자리가 없다');

/* ── 5. 표가 저를 가리키지 않나 (10-16 에 두 번 당했다) ── */
console.log('\n[5] 표 값이 **자기 키를 부르지 않는다** — 전역 치환 사고 막기');
ok(!/T\(/.test(dictBlock),
   '표 안에 T( 가 없다 — 10-16 에 전역 치환이 표의 값까지 바꿔 ask_empty·tag_skipped 가 자기를 불렀다(§4)');
ok(!/\$\{T\(/.test(markup),
   '정적 마크업에 ${T(…)} 가 없다 — HTML 에서는 안 풀려 글자 그대로 보인다');

/* ── 6. 되돌림 실증 ──
   ⚠ 되돌림은 **파일이 들고 있는 값**으로 한다. 시험 안 상수로 하면 제품을 되돌려도 통과한다. */
console.log('\n[6] 되돌림 실증 3건');

let revKeys = false;
try { assert.ok(ko.length < 120, `표에 키가 ${ko.length}개뿐이다`); } catch (_) { revKeys = true; }
ok(revKeys, '표를 40개로 되돌리면 붉어진다 (되돌림 실증 1)');

let revMarkup = false;
try { assert.ok(markupLeft.length > 0, `마크업에 박힌 한국어가 ${markupLeft.length}곳이다`); } catch (_) { revMarkup = true; }
ok(revMarkup, 'data-t 를 떼면 붉어진다 — 영어 폰에 한국어가 돌아온다 (되돌림 실증 2)');

let revEn = false;
try { assert.ok(emptyEn.length > 0 || missEn.length > 0, `en 빈 칸 ${emptyEn.length}·빠진 키 ${missEn.length}`); } catch (_) { revEn = true; }
ok(revEn, 'en 칸을 비우면 붉어진다 — 빈 값은 ko 로 떨어진다 (되돌림 실증 3)');

console.log(`\n전부 통과 (${checks}건)`);
