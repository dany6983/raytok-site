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

/*
 * ★ **파이썬 이름은 OS 마다 다르다** (2026-10-20, A1).
 *
 * 윈도의 공식 설치판은 `python`(그리고 `py`)만 둔다 — `python3` 은 없다. 리눅스·맥은
 * 그 반대다. 이름을 하나로 박아 두면 **한쪽에서는 `npm test` 가 이 줄에서 멈추고
 * 뒤의 묶음이 아예 안 돈다** — 10-20 에 합치기 조건("3회 초록")을 확인할 수 없던 까닭
 * 둘 중 하나가 이것이었다(다른 하나는 `host_token` 의 ESM 경로).
 *
 * 있는 것을 **찾아서** 쓴다. 셋 다 없으면 지금처럼 "안 돌았다"로 붉는다 — 그 판정은
 * 그대로 둔다(파이썬이 없는 자리에서 조용히 넘어가면 생성기가 썩는다).
 */
const PY = ['python3', 'python', 'py'].find((bin) => {
  try { execFileSync(bin, ['--version'], { stdio: 'pipe' }); return true; } catch { return false; }
}) || 'python3';

/* 생성기를 **다른 곳**에 돌린다 — 저장소 파일은 건드리지 않는다(시험이 작업물을 고치면 안 된다) */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'genout-'));
let ran = true, runErr = '';
try {
  execFileSync(PY, [GEN, '--out', tmp], { cwd: ROOT, stdio: 'pipe' });
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
  /*
   * ★ **줄바꿈은 세지 않는다** (2026-10-20, A1).
   *
   * 생성기는 늘 LF 로 쓰는데, 윈도 체크아웃의 저장소 파일은 CRLF 다(`core.autocrlf`).
   * 바이트로 견주면 **윈도에서는 늘 붉고** 리눅스에서는 늘 초록이다 — 같은 저장소가
   * 기계에 따라 다른 답을 내면 그 시험은 아무것도 지키지 않는 것과 같다(실제로 10-20
   * 에 `npm test` 가 여기서 멈춰 뒤 묶음이 안 돌았다). 재서 확인했다: 다른 것은
   * **줄바꿈뿐**이었다(16208 대 16342 바이트, 줄바꿈을 맞추면 **한 글자도** 안 다르다).
   *
   * 지키려는 것은 "생성기 출력과 저장소 쪽이 **같은 글**인가"다 — 줄바꿈은 그 글이
   * 아니다. 글자가 하나라도 다르면 여전히 붉다.
   */
  const nl = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
  const same = nl(bytes(made)) === nl(bytes(kept));
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
/*
 * ★ 파이썬 **출력 인코딩**을 못 박는다 (2026-10-20, A1). 윈도의 파이썬은 콘솔
 * 코드페이지(cp949 등)로 쓰기 때문에 한글이 깨져 돌아왔다(`������`) — 그러면 아래
 * "같다고 말하나" 가 글자를 못 찾아 붉는다. 재서 확인했다: 깨진 글자만 문제였다.
 */
const PYENV = { ...process.env, PYTHONIOENCODING: 'utf-8' };
try { checkOut = execFileSync(PY, [GEN, '--check'], { cwd: ROOT, encoding: 'utf-8', env: PYENV }); }
catch (e) { checkCode = e.status || 1; checkOut = String(e.stdout || ''); }
ok(checkCode === 0, `--check 가 종료코드 0 (${checkOut.trim().split('\n').pop()})`);
ok(/생성기 출력 == 저장소/.test(checkOut), '--check 가 "같다" 고 말한다');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n전부 통과 (${checks}건)`);
