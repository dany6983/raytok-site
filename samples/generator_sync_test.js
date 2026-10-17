// samples/generator_sync_test.js — 생성기 == 저장소 시험 (B 16, 2026-10-17)
//
// 왜 있나: `tools/build_home.py` 가 소개 페이지 여섯 쪽을 만든다. 그런데 사람이 페이지를
// **손으로** 고치면 생성기는 그 변경을 모르고, 다음에 누가 생성기를 돌리는 순간 **조용히
// 지운다.** 10-17 에 실제로 그랬다 — 돌려 보니 홍보자료 묶음·`/buy/` 링크·유학생 메뉴가
// 사라지고 "다섯 가지 쓰임" 이 "네 가지" 로 되돌아갔다(48줄 삭제). 그게 덫이었다.
// 이 시험이 그 덫을 막는다: 생성기를 **진짜로 돌려** 저장소의 쪽과 글자 하나까지 견준다.
// 붉어지면 할 일은 **생성기에 그 변경을 넣는 것**이다(페이지를 되돌리는 것이 아니다).
//
// 돌리기: node samples/generator_sync_test.js   (python3 필요, 저장소에는 쓰지 않는다)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

console.log('=== 생성기 == 저장소 시험 (tools/build_home.py) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'build_home.py');
const PAGES = ['index.html', 'field/index.html', 'tour/index.html', 'ows/index.html',
               'desk/index.html', 'meet/index.html'];

ok(fs.existsSync(GEN), '생성기 tools/build_home.py 가 있다');

const bytes = (p) => fs.readFileSync(p);

/* ★ 돌리기 전에 `--out` 을 아는 생성기인지 본다. 모르는 생성기는 그 깃발을 **무시하고
   저장소에 바로 쓴다** — 이 시험을 돌린 것만으로 쪽 여섯이 낡은 출력으로 덮인다.
   (실제로 당했다: 옛 생성기로 되돌려 시험을 돌리니 index·field·tour·ows·desk 가 바뀌었다.) */
const genSrc = fs.readFileSync(GEN, 'utf-8');
ok(/--out/.test(genSrc) && /--check/.test(genSrc),
   '생성기가 --out·--check 를 안다 (모르면 저장소에 바로 써서 쪽을 덮는다)');

/* 그래도 안전망: 돌리기 전 쪽 여섯을 떠 두고, 돌린 뒤 바뀐 것이 있으면 **되돌리고** 붉어진다 */
const before = new Map();
for (const rel of PAGES) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p)) before.set(rel, bytes(p));
}

/* 생성기를 **다른 곳**에 돌린다 — 저장소 파일은 건드리지 않는다(시험이 작업물을 고치면 안 된다) */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'genout-'));
let ran = true, runErr = '';
try {
  execFileSync('python3', [GEN, '--out', tmp], { cwd: ROOT, stdio: 'pipe' });
} catch (e) { ran = false; runErr = String(e.stderr || e.message).slice(0, 300); }

const touched = [...before.keys()].filter((rel) => !bytes(path.join(ROOT, rel)).equals(before.get(rel)));
for (const rel of touched) fs.writeFileSync(path.join(ROOT, rel), before.get(rel));   // 되돌린다
ok(touched.length === 0, `--out 로 돌려도 저장소 쪽은 그대로 (${touched.join(', ') || '건드린 것 없음'})`);
ok(ran, `생성기가 돌았다 (--out <임시>)${ran ? '' : ' — ' + runErr}`);
const different = [];
for (const rel of PAGES) {
  const made = path.join(tmp, rel);
  const kept = path.join(ROOT, rel);
  ok(fs.existsSync(made), `${rel}: 생성기가 만들었다`);
  ok(fs.existsSync(kept), `${rel}: 저장소에 있다`);
  const same = bytes(made).equals(bytes(kept));
  if (!same) different.push(rel);
  ok(same, `${rel}: 생성기 출력 == 저장소 (글자 하나까지)`);
}
ok(different.length === 0, `다른 쪽 0 (${different.join(', ') || '없음'})`);

/* 손으로 고친 쪽을 생성기에 안 넣으면 붉어지는가 — 임시본 한 쪽을 바꿔 본다.
   (저장소 쪽을 바꾸지 않는다. 바꾸는 시험은 깨질 때 작업물을 더럽힌다.) */
const victim = path.join(tmp, 'index.html');
fs.writeFileSync(victim, bytes(victim).toString('utf-8').replace('</body>', '<p>손으로 넣은 줄</p></body>'));
let revertFailed = false;
try { assert.ok(bytes(victim).equals(bytes(path.join(ROOT, 'index.html'))), '한 줄 다른데 같다고 했다'); }
catch (e) { revertFailed = true; }
ok(revertFailed === true, '한 쪽이 한 줄이라도 다르면 붉어진다 (되돌림 실증)');

/* 사람이 쓰는 길 — `--check` 는 쓰지 않고 센다. 초록이면 종료코드 0 */
let checkCode = 0, checkOut = '';
try { checkOut = execFileSync('python3', [GEN, '--check'], { cwd: ROOT, encoding: 'utf-8' }); }
catch (e) { checkCode = e.status || 1; checkOut = String(e.stdout || ''); }
ok(checkCode === 0, `--check 가 종료코드 0 (${checkOut.trim().split('\n').pop()})`);
ok(/생성기 출력 == 저장소/.test(checkOut), '--check 가 "같다" 고 말한다');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n전부 통과 (${checks}건)`);
