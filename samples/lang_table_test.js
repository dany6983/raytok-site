/* samples/lang_table_test.js — **두 표가 서로 맞는가** (2026-10-19)
 *
 * 왜 있나: 강사 화면이 고른 언어로 문단을 미리 번역해 보내면, 손님 화면은 `line.tr[내 언어]` 를
 * **그대로** 찾는다. 두 표가 한 글자라도 다르면 그 언어 손님은 **영원히 원문만** 본다 —
 * 조용히. 2026-10-19 에 `zh`(강사) vs `zh-CN`(손님) 이 그 꼴이었고, 데모 그림을 찍다가 잡혔다.
 * 사람 조심으로 막을 일이 아니라서(§4: 값의 출처를 바꾸면 읽는 곳을 전부 센다) 표로 센다.
 *
 * 돌리기: node samples/lang_table_test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

console.log('=== 강사 표 ↔ 손님 표 (자막 언어 코드) ===\n');

const hostHtml = fs.readFileSync(path.join(ROOT, 'web', 'host', 'index.html'), 'utf-8');
const guestSrc = fs.readFileSync(path.join(ROOT, 'web', 'listener', 'index.src.html'), 'utf-8');

/** 강사 화면이 **보낼 수 있는** 언어 코드 */
function hostCodes(html) {
  const m = html.match(/SUPPORTED_TARGET_LANGS\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (!m) return null;
  return [...m[1].matchAll(/code:\s*'([a-zA-Z-]+)'/g)].map((x) => x[1]);
}
/** 손님 화면이 **고를 수 있는** 자막 언어 코드 */
function guestCodes(html) {
  return [...new Set([...html.matchAll(/"code":"([a-zA-Z-]+)"/g)].map((x) => x[1]))];
}

const host = hostCodes(hostHtml);
const guest = guestCodes(guestSrc);
ok(Array.isArray(host) && host.length > 0, `강사 표를 읽었다 (${host ? host.length : 0}개: ${host ? host.join(' ') : '-'})`);
ok(guest.length > 50, `손님 표를 읽었다 (${guest.length}개)`);

const gset = new Set(guest);
const orphan = host.filter((c) => !gset.has(c));
ok(orphan.length === 0,
   `강사가 보내는 코드가 전부 손님 표에 있다 (닿지 않는 코드: ${orphan.join(', ') || '없음'})`);

/* 손님이 **그대로** 찾는지 — 느슨하게 찾았다면 위 단언이 덜 중요해진다. 코드를 보고 센다. */
ok(/line\.tr\[selectedLang\]/.test(guestSrc),
   '손님은 tr[내 언어] 를 **그대로** 찾는다 — 그래서 코드가 한 글자만 달라도 원문이 된다');

/* 되돌림 실증 (D-09) — 10-19 에 실제로 있던 그 값으로 되돌리면 잡히는가.
   글자를 바꾸는 것이 아니라 **같은 함수**에 되돌린 표를 넣어 센다. */
const reverted = hostHtml.replace(/code: 'zh-CN'/, "code: 'zh'");
ok(reverted !== hostHtml, '되돌린 본문이 실제로 달라졌다');
const revertedCodes = hostCodes(reverted);
ok(revertedCodes.includes('zh') && revertedCodes.filter((c) => !gset.has(c)).length === 1,
   "10-19 의 값('zh')으로 되돌리면 닿지 않는 코드가 1개로 잡힌다 (되돌림 실증)");

/* ── 대표님 한 장이 **같은 아홉**을 적고 있나 ──────────────────────────────
   데모 때 그 한 장만 보신다. 거기 적힌 언어가 강사 표와 다르면 그 자리에서 원문이 나온다.
   이름으로 센다(코드가 아니라 사람이 읽는 말이 적혀 있다). */
const onePager = fs.readFileSync(path.join(ROOT, 'docs', 'demo-web-1119.md'), 'utf-8');
const names = [...hostHtml.match(/SUPPORTED_TARGET_LANGS\s*=\s*\[([\s\S]*?)\n\s*\];/)[1]
  .matchAll(/name:\s*'([^(']+)\s*\(/g)].map((x) => x[1].trim());
ok(names.length === host.length, `강사 표에서 언어 이름 ${names.length}개를 읽었다 (${names.join(' ')})`);
const notInDoc = names.filter((n) => !onePager.includes(n));
ok(notInDoc.length === 0, `한 장이 아홉을 다 적는다 (빠진 것: ${notInDoc.join(', ') || '없음'})`);
ok(/이 아홉 밖을 고르면 원문/.test(onePager),
   '한 장이 **그 밖이면 원문**이라고 적는다 — 데모 때 스페인어를 고르시면 안 된다');

/* 되돌림 실증 — 한 장에서 한 언어를 빼면 위 단언이 잡는가 (파일은 안 건드린다) */
const bentDoc = onePager.replace(names[names.length - 1], '§없는언어§');
ok(bentDoc !== onePager && names.filter((n) => !bentDoc.includes(n)).length === 1,
   `한 장에서 한 언어(${names[names.length - 1]})를 빼면 잡힌다 (되돌림 실증)`);

console.log(`\n${fail === 0 ? '전부 통과' : '붉다'} (${pass + fail}건${fail ? `, 실패 ${fail}` : ''})`);
process.exit(fail === 0 ? 0 : 1);
