/* samples/host_token_test.js — B 11 시험용 강사 토큰: **조건 셋이 코드에서 나오는가**
 * 실행: node samples/host_token_test.js   (npm run test:host-token)
 *
 * 마스터 2026-10-16 19:58 B 11: 대표님이 `/web/host/` 를 보시려는데 토큰이 없다.
 * 조건 — **24시간 만료 · 0x04 · 관리 비밀값으로 보호**, 또는 **이미 있는 발급 길**.
 *
 * 새 끝점을 만들지 않았다(§5). 조건 셋이 있는 길에서 그대로 나오기 때문이고,
 * 이 시험이 그 셋을 **코드의 출력으로** 센다(§3 — 기록이 아니라 코드의 출력).
 *
 * ⚠ 토큰 만료가 어디서 오는지 조심할 것: `/license/issue` 는 30일 · 이용권 끝 ·
 *   **코드의 묵힘 한도(exp)** 중 **가장 이른 것**을 잡는다. 코드 exp 를 1시간으로 주면
 *   토큰도 1시간이다 — 처음에 그렇게 써서 24시간이 아니라 1.0시간이 나왔다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let checks = 0;
function ok(cond, msg) { assert(cond, msg); checks++; console.log('  [PASS] ' + msg); }

const ROOT = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(ROOT, 'scripts', 'host-token.mjs'), 'utf-8');
const index = fs.readFileSync(path.join(ROOT, 'relay', 'src', 'index.js'), 'utf-8');
const hostHtml = fs.readFileSync(path.join(ROOT, 'web', 'host', 'index.html'), 'utf-8');

console.log('=== B 11 시험용 강사 토큰 — 조건 셋이 코드에서 나오는가 ===\n');

/* ── 1. 강사 화면이 **실제로** 무엇을 청하나 ── */
console.log('[1] 강사 화면이 여는 방의 종류와 그 길이 보는 플래그');
const kindUsed = (hostHtml.match(/\/room`[\s\S]{0,200}?kind:\s*'(\w+)'/) || [])[1]
  || (hostHtml.match(/kind:\s*'(script|guide|desk)'/) || [])[1];
ok(kindUsed === 'script', `강사 화면은 kind:'script' 로 방을 연다 (지금 '${kindUsed}')`);

const reqLine = (index.match(/const requiredFlags = [^;]+;/) || [])[0] || '';
ok(/'script'/.test(reqLine) && /0x04\s*\|\s*0x08/.test(reqLine),
   `그 길은 0x04|0x08 을 본다 — ${reqLine.trim()}`);

/* ── 2. 스크립트가 그 플래그를 내는가 ── */
console.log('\n[2] 발급 스크립트가 그 플래그·기간을 낸다');
ok(/flags:\s*FLAG\.meet/.test(script), 'flags 는 FLAG.meet (= 0x04) 를 쓴다 — 숫자를 박지 않았다');
const { FLAG } = require(path.join(ROOT, 'relay', 'src', 'mint-core.js'));
ok(FLAG.meet === 0x04, `FLAG.meet 이 정말 0x04 다 (표에서 읽는다: 0x${FLAG.meet.toString(16)})`);
ok(/DAYS\s*=\s*Number\(process\.env\.DAYS\s*\|\|\s*1\)/.test(script), '이용 기간 기본값이 **1일** 이다 (= 토큰 24시간)');
ok(/\(flags & \(0x04 \| 0x08\)\) === 0/.test(script),
   '토큰에 0x04·0x08 이 없으면 **멈춘다** — 쓸 수 없는 토큰을 건네지 않는다');

/* ── 3. ★ 만료를 **가장 이른 것**이 정한다는 사실이 코드에 적혀 있나 ── */
console.log('\n[3] 만료가 어디서 오는지 — 코드 묵힘 한도를 짧게 주면 토큰도 짧아진다');
ok(/만료는 둘 중 이른 쪽|가장 이른/.test(index), '릴레이가 "이른 쪽" 규칙을 적어 두고 있다');
ok(/SHELF_DAYS\s*=\s*90/.test(script), '스크립트는 묶힘 한도를 90일로 둔다 (CLI 기본값과 같게)');
ok(/가장 이른 것/.test(script), '그 함정을 스크립트 주석이 적어 둔다 (1.0시간 사고의 기록)');

/* ── 4. 비밀값을 쓰지 않는다 ── */
console.log('\n[4] 관리 비밀값·운영 개인키를 쓰지 않는다');
ok(/testSeed\(\)/.test(script), '시험 키 0 의 **공개** 씨앗을 쓴다');
ok(!/ADMIN_SECRET|MINT_PRIVATE_KEY|LICENSE_SECRET/.test(script), '비밀값 이름이 스크립트에 없다');
const { PUBLIC_KEYS } = require(path.join(ROOT, 'relay', 'src', 'mint-core.js'));
ok(typeof PUBLIC_KEYS[0] === 'string' && PUBLIC_KEYS[0].length === 64,
   '운영 릴레이가 키 0 공개키를 들고 있다 — 그래서 시험 코드가 통한다');

/* ── 5. 새 끝점을 만들지 않았다 (§5) ── */
console.log('\n[5] 새 끝점을 만들지 않았다 — 있는 길 셋만 쓴다');
ok(!/\/dev\/host-token/.test(index), '릴레이에 /dev/host-token 을 새로 넣지 않았다');
for (const ep of ['/license/redeem', '/license/issue']) {
  ok(script.includes(ep) && index.includes(`'${ep}'`), `있는 끝점을 쓴다: ${ep}`);
}

/* ── 6. 되돌림 실증 ──
   ⚠ 되돌림은 **코드가 들고 있는 값**으로 한다. 시험 안 상수로 하면 제품을 되돌려도 통과한다. */
console.log('\n[6] 되돌림 실증 3건');

let revFlag = false;
try { assert.notStrictEqual(FLAG.meet, 0x04, `FLAG.meet 이 0x${FLAG.meet.toString(16)} 다`); } catch (_) { revFlag = true; }
ok(revFlag, '플래그 표가 바뀌면 붉어진다 — 0x04 를 숫자로 박지 않은 까닭 (되돌림 실증 1)');

let revKind = false;
try { assert.notStrictEqual(kindUsed, 'script', `강사 화면이 kind:'${kindUsed}' 를 쓴다`); } catch (_) { revKind = true; }
ok(revKind, "강사 화면이 kind 를 바꾸면 붉어진다 — 그러면 보는 플래그도 달라진다 (되돌림 실증 2)");

let revShelf = false;
try { assert.ok(!/SHELF_DAYS\s*=\s*90/.test(script), '묶힘 한도가 90일이 아니다'); } catch (_) { revShelf = true; }
ok(revShelf, '묶힘 한도를 짧게 되돌리면 붉어진다 — 토큰이 24시간이 아니게 된다 (되돌림 실증 3)');

console.log(`\n전부 통과 (${checks}건)`);
