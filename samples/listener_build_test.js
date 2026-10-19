// samples/listener_build_test.js — 청취 쪽 만든 판 == 소스 (B 21, 2026-10-17)
//
// 자리가 둘이다: `index.src.html`(주석 그대로, **사람이 고치는 곳**) ·
// `index.html`(주석 없는 판, **손님에게 가는 것**, `tools/build-listener.js` 가 만든다).
// 위험은 하나다 — 누가 `index.html` 을 손으로 고치면 다음에 만들 때 **조용히 지워진다**.
// B 16 과 같은 모양으로 그 자리를 막는다: 만든 판과 저장소가 다르면 붉다.
// 돌리기: node samples/listener_build_test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { execFileSync } = require('child_process');

console.log('=== 청취 쪽 만든 판 == 소스 ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web/listener/index.src.html');
const OUT = path.join(ROOT, 'web/listener/index.html');

ok(fs.existsSync(SRC), '소스 index.src.html 이 있다 (사람이 고치는 곳)');
ok(fs.existsSync(OUT), '만든 판 index.html 이 있다 (손님에게 가는 것)');
const src = fs.readFileSync(SRC, 'utf-8');
const out = fs.readFileSync(OUT, 'utf-8');

/* ① 만드는 길이 저장소와 같은가 */
let code = 0, log = '';
try { log = execFileSync('node', [path.join(ROOT, 'tools/build-listener.js'), '--check'], { cwd: ROOT, encoding: 'utf-8' }); }
catch (e) { code = e.status || 1; log = String(e.stdout || ''); }
ok(code === 0, `build-listener --check 종료코드 0 (${log.trim().split('\n').pop()})`);

/* ② 소스에는 주석이 있고, 만든 판에는 **주석만 있는 줄**이 없다 */
const onlyComment = (t) => t.split('\n').filter((l) => l.trim().startsWith('//')).length;
ok(onlyComment(src) > 30, `소스에 주석 줄이 남아 있다 (${onlyComment(src)}줄 — 이게 이 코드의 기억이다)`);
ok(onlyComment(out) === 0, `만든 판에 주석만 있는 줄이 없다 (${onlyComment(out)})`);
ok(out.startsWith('<!-- 이 파일은 tools/build-listener.js'), '만든 판 첫 줄이 "손으로 고치지 않는다" 고 말한다');

/* ③ 주석만 빠졌는가 — 모양이 그대로여야 한다 */
const count = (s, re) => (s.match(re) || []).length;
for (const [name, re] of [['id=', /\sid="/g], ['data-i18n', /\sdata-i18n="/g],
                          ['<script', /<script/g], ['function', /\bfunction\b/g],
                          ['addEventListener', /addEventListener\(/g]]) {
  ok(count(src, re) === count(out, re), `${name} 수가 같다 (${count(out, re)})`);
}
ok(Buffer.byteLength(out) < Buffer.byteLength(src),
   `만든 판이 더 작다 (${Buffer.byteLength(src)} → ${Buffer.byteLength(out)} B)`);

/* ④ 코드가 멀쩡한가 — 주석을 지우다 코드를 먹으면 여기서 걸린다 */
const bodies = [...out.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(bodies.length >= 1, `만든 판에 인라인 스크립트가 있다 (${bodies.length}개)`);
let parsed = true, why = '';
for (const b of bodies) { try { new vm.Script(b); } catch (e) { parsed = false; why = e.message; } }
ok(parsed, `만든 판의 스크립트가 파싱된다${parsed ? '' : ' — ' + why}`);

/* ⑤ 되돌림 실증 — 만든 판에 주석을 손으로 넣은 상태를 흉내 낸다 */
let reverted = false;
try {
  const faked = out.replace('<body>', '<body>\n    // 손으로 넣은 주석');
  assert.strictEqual(onlyComment(faked), 0, '주석을 넣었는데 0 줄이라고 한다');
} catch (e) { reverted = true; }
ok(reverted === true, '만든 판에 주석이 끼면 붉어진다 (되돌림 실증)');

console.log(`\n전부 통과 (${checks}건)`);
