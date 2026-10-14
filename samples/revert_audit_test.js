/*
 * ⑨-1 되돌림 실증 **점검** — 되돌림이 증거인지 센다 (2026-10-14, B-BACKLOG ⑨-1)
 *
 * B-BACKLOG ⑨-1: "`samples/` 의 되돌림 사례를 **실제로 되돌려 붉은지** 하나씩 확인하고
 * 빈 사례(되돌려도 통과)를 찾아 REPORT 에 올린다. **이것이 우리가 가장 자주 당한 사고다.**"
 *
 * 2026-10-14 에 60건을 훑으니 **16건이 빈 사례**였다. 전부 같은 꼴이다:
 *
 *     let revertFailed = false;
 *     try {
 *       const fakeStatus = 400;                       // ← 시험 안에서 만든 상수
 *       assert.strictEqual(fakeStatus, 200, '...');   // ← 400 !== 200, 늘 던진다
 *     } catch (e) { revertFailed = true; }
 *     ok(revertFailed === true, '... (되돌림 실증 완료)');
 *
 * 이것은 `400 !== 200` 을 증명할 뿐이다. **제품을 어떻게 되돌려도 늘 초록이다.**
 * P-17·P-14·특허 독립항 자물쇠 셋도 이 꼴이었다.
 *
 * 되돌림이 증거가 되려면 try 안의 단언이 **제품이 만든 값**을 봐야 한다 —
 * 응답 코드, 화면에서 읽은 글, 릴레이 방 상태, 세어 둔 요청 수.
 *
 * 그래서 이 시험은 그 꼴이 **다시 들어오는 것을 막는다**:
 *  [1] 되돌림 try 블록 안에서 그 블록이 만든 상수만 보고 단언하면 붉다
 *  [2] 머리말에 "되돌림 실증 N건" 이라 적어 두고 코드가 없으면 붉다 (셋이 그랬다)
 *  [3] 되돌림 주장이 있는 파일은 되돌림 코드도 있어야 한다
 */
const fs = require('fs');
const path = require('path');

let checks = 0;
const fails = [];
function ok(cond, msg) {
  checks++;
  if (!cond) { fails.push(msg); console.error(`  [FAIL] ${msg}`); }
  else console.log(`  [PASS] ${msg}`);
}

const ROOT = path.join(__dirname, '..');
const DIRS = ['samples', 'relay/test', 'test', 'tools'];

/* 이 파일 자신은 건너뛴다 — 위 설명에 그 꼴을 **본보기로** 적어 뒀다 */
const SELF = 'samples/revert_audit_test.js';

function listFiles() {
  const out = [];
  for (const d of DIRS) {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!/\.(js|mjs|cjs)$/.test(name)) continue;
      const rel = `${d}/${name}`;
      if (rel !== SELF) out.push(rel);
    }
  }
  return out.sort();
}

/* 주석을 지운 본문 — 주석 속 '되돌림' 은 주장이지 코드가 아니다 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const BUILTINS = /^(assert|strictEqual|notStrictEqual|deepStrictEqual|equal|notEqual|ok|true|false|null|undefined|length|filter|includes|some|every|map|find|slice|trim|toString|JSON|Object|Array|Math|String|Number|Boolean|parse|stringify|keys|values)$/;

/* 값이 **리터럴뿐**인가 — 시험이 지어낸 값이라는 뜻.
   await·함수 호출·바깥 이름이 하나라도 섞이면 제품에서 온 값일 수 있으니 리터럴이 아니다. */
function isLiteralOnly(expr, declaredSoFar) {
  const e = expr.trim();
  if (/\bawait\b/.test(e)) return false;
  // 식별자를 뽑아 리터럴 키워드·앞서 리터럴로 판정된 이름 말고 다른 것이 있으면 제품 값일 수 있다
  const idents = [...e.matchAll(/[A-Za-z_$][\w$]*/g)].map(m => m[0]);
  for (const id of idents) {
    if (/^(true|false|null|undefined)$/.test(id)) continue;
    if (declaredSoFar.has(id) && declaredSoFar.get(id) === true) continue;  // 리터럴에서 온 이름
    return false;   // 바깥에서 온 이름이나 함수 호출 → 제품 값일 수 있다
  }
  return true;
}

/* try{…}catch 블록 하나를 보고, **빈 되돌림**인 단언들을 돌려준다 */
function hollowAssertsIn(blk) {
  const out = [];
  // 선언을 차례로 읽으며 "리터럴뿐인 이름"을 모은다
  const declared = new Map();   // 이름 → 리터럴뿐인가
  for (const m of blk.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
    declared.set(m[1], isLiteralOnly(m[2], declared));
  }
  if (![...declared.values()].some(Boolean)) return out;   // 리터럴 상수가 없으면 볼 것 없다

  for (const a of blk.match(/assert[.\w]*\([^;]*/g) || []) {
    const args = a.slice(a.indexOf('(') + 1);
    // 글(메시지) 안의 낱말은 세지 않는다
    const code = args.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');
    const idents = [...code.matchAll(/[A-Za-z_$][\w$]*/g)].map(m => m[0]);
    let usesLiteralConst = false, usesProductValue = false;
    for (const id of idents) {
      if (BUILTINS.test(id)) continue;
      if (declared.has(id)) { if (declared.get(id)) usesLiteralConst = true; else usesProductValue = true; }
      else usesProductValue = true;     // 블록 바깥에서 온 이름 → 제품 값
    }
    if (usesLiteralConst && !usesProductValue) out.push(a.replace(/\s+/g, ' ').slice(0, 100));
  }
  return out;
}

function tryBlocks(body) {
  return body.match(/try\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}\s*catch/g) || [];
}

console.log('=== ⑨-1 되돌림 실증 점검 — 되돌림이 증거인지 센다 ===\n');

const files = listFiles();
ok(files.length > 20, `${DIRS.join(' · ')} 의 시험 파일 ${files.length}개를 훑었다`);

/* ── [1] 빈 되돌림: try 블록이 제 안에서 만든 상수만 보고 단언한다 ── */
console.log('\n[1] 빈 되돌림 — try 안에서 만든 상수로만 단언하는 것 (제품을 되돌려도 통과한다)');

const hollow = [];
const withRevertCode = [];

for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  const body = stripComments(src);

  for (const blk of tryBlocks(body)) {
    for (const a of hollowAssertsIn(blk)) hollow.push(`${rel}: ${a}`);
  }

  if (/revert[A-Za-z]*\s*=|되돌림 실증 [①②③1-9]/.test(body) || /revert[A-Za-z]*Failed/.test(body)) {
    withRevertCode.push(rel);
  }
}

ok(hollow.length === 0,
   hollow.length === 0
     ? '시험 안에서 만든 상수로만 단언하는 되돌림 0건'
     : `빈 되돌림 ${hollow.length}건 — 제품을 되돌려도 통과한다:\n    ` + hollow.join('\n    '));

/* ── [2] 머리말로만 있는 되돌림 ── */
console.log('\n[2] 머리말에 "되돌림 실증" 이라 적고 코드가 없는 파일 (10-14 에 셋이 그랬다)');

const claimedOnly = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  if (!/되돌림/.test(src)) continue;
  const body = stripComments(src);
  const hasCode = /revert[A-Za-z]*Failed/.test(body) || /되돌림 실증/.test(body);
  if (!hasCode) claimedOnly.push(rel);
}
ok(claimedOnly.length === 0,
   claimedOnly.length === 0
     ? '되돌림을 말만 하고 코드가 없는 파일 0건'
     : `말만 있는 되돌림: ${claimedOnly.join(', ')}`);

/* ── [3] 되돌림이 있다고 적힌 시험은 npm test 가 돌려야 한다 ── */
console.log('\n[3] 되돌림을 가진 시험이 npm test 밖에 있지 않은지');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const testCmd = pkg.scripts.test || '';
const ranScripts = (testCmd.match(/test:[a-z0-9-]+/g) || []);
const ranFiles = new Set();
for (const name of ranScripts) {
  const cmd = pkg.scripts[name] || '';
  for (const m of cmd.matchAll(/([\w/.-]+\.(?:js|mjs|cjs))/g)) ranFiles.add(m[1].replace(/^\.\//, ''));
}

/* 운영 주소를 보는 시험은 일부러 npm test 밖이다 (MASTER: 읽기만, 배포 금지) */
const OUT_OF_SUITE = {
  'samples/prod_e2e_test.js': '운영 주소를 보는 시험 — 일부러 npm test 밖(MASTER 줄 23)',
  'samples/w_t_test.js': 'test:w-t 로 따로 돌린다 (ws 모듈 확인 뒤)',
};
const orphan = withRevertCode.filter(f => !ranFiles.has(f) && !OUT_OF_SUITE[f]);
ok(orphan.length === 0,
   orphan.length === 0
     ? `되돌림을 가진 시험 ${withRevertCode.length}개가 전부 npm test 안에 있다 (일부러 뺀 ${Object.keys(OUT_OF_SUITE).length}개 제외)`
     : `npm test 가 안 돌리는데 되돌림을 가진 시험: ${orphan.join(', ')}`);

Object.keys(OUT_OF_SUITE).forEach((f) => {
  ok(fs.existsSync(path.join(ROOT, f)), `일부러 뺀 ${f} 가 실제로 있다 (${OUT_OF_SUITE[f]})`);
});

/* ── [4] 이 점검 자신의 되돌림 실증 ── */
console.log('\n[4] 이 점검의 되돌림 실증 — 빈 되돌림을 넣으면 [1] 이 잡는가');
{
  // 10-14 에 실제로 있던 꼴을 그대로 넣어 [1] 의 판정기에 먹인다
  // 10-14 에 실제로 있던 꼴을 그대로 넣어 [1] 의 판정기에 먹인다
  const probeHollow = `
    try {
      const fakeStatus = 400;
      assert.strictEqual(fakeStatus, 200, '필수 항목 누락 시 200 성공 처리되면 단언 실패');
    } catch (e) { revertFailed = true; }`;
  // 고친 뒤의 꼴 — 제품이 돌려준 값을 본다. 이것은 잡히면 안 된다.
  const probeReal = `
    try {
      assert.strictEqual(missingRes.status, 200, '필수 항목이 빠졌는데 200 으로 접수됐다');
    } catch (e) { revertFailed = true; }`;
  const caught = tryBlocks(probeHollow).some(b => hollowAssertsIn(b).length > 0);
  const notCaught = tryBlocks(probeReal).every(b => hollowAssertsIn(b).length === 0);
  ok(notCaught === true, '제품 값을 보는 되돌림은 잡지 않는다 (헛짚음 0)');
  ok(caught === true, '10-14 에 실제로 있던 빈 되돌림을 넣으면 [1] 이 잡는다 (되돌림 실증)');
}

if (fails.length) {
  console.error(`\n붉음 ${fails.length}건`);
  process.exit(1);
}
console.log(`\n전부 통과 (${checks}건)`);
