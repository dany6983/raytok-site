/* samples/mailwait_test.js — 메일박스 대기(§25)가 **모름을 바뀜으로 읽지 않는가**
 * 실행: node samples/mailwait_test.js   (npm run test:mailwait)
 *
 * 왜 이 시험이 생겼나 (2026-10-16):
 *   `scripts/mailwait.js` 가 사이트 저장소에서 **매번 즉시 "메일박스 변경"** 을 외쳤다.
 *   `origin/HEAD` 가 안 잡혀 기본 가지를 'master' 로 떨어뜨렸고, 이 저장소엔 그 가지가
 *   **없다.** 못 읽은 값을 '-' 로 두고 내 것과 견주니 늘 달랐다.
 *   세션은 그 말을 믿고 git pull 을 두 번 했고 **바뀐 것은 없었다.**
 *   D-70 · §20 과 같은 병이다 — **모름은 없음이 아니고, 모름은 바뀜도 아니다.**
 *
 * 그래서 답은 셋이어야 한다: 같다(0) · 바뀌었다(2) · **못 봤다(3)**.
 * 가짜 저장소를 만들어 네 경우를 돌린다 — 목을 채우지 않고 **진짜 git** 으로 본다(D-11).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

let checks = 0;
function ok(cond, msg) { assert(cond, msg); checks++; console.log('  [PASS] ' + msg); }

const SCRIPT = path.join(__dirname, '..', 'scripts', 'mailwait.js');
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

/** 가짜 원격 + 복제본 한 쌍을 만든다. 기본 가지 이름을 골라 쓴다. */
function makePair(branch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mailwait-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  const seed = path.join(root, 'seed');
  fs.mkdirSync(seed);
  sh(`git init -q -b ${branch} .`, seed);
  sh('git config user.email t@t && git config user.name t', seed);
  fs.mkdirSync(path.join(seed, 'docs'));
  fs.writeFileSync(path.join(seed, 'docs', 'MASTER.md'), '첫 판\n');
  sh('git add -A && git commit -q -m first', seed);
  // bare 의 기본 가지도 맞춰 준다 — 안 맞추면 복제본의 HEAD 가 태어나지 않아
  // 체크아웃이 비고, 스크립트는 (올바르게) "못 봤다" 를 낸다. 틀의 흠이다.
  sh(`git init -q --bare -b ${branch} ${remote}`, root);
  sh(`git remote add origin ${remote} && git push -q origin ${branch}`, seed);
  sh(`git clone -q ${remote} work`, root);
  return { root, remote, work, seed, branch };
}
/** 스크립트를 한 번 돌리고 {code, out} 을 준다 */
function run(cwd, env = {}) {
  try {
    const out = execSync(`node ${SCRIPT} --once`, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '').toString() + (e.stderr || '').toString() };
  }
}
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });

console.log('=== 메일박스 대기(§25) — 같다 / 바뀌었다 / 못 봤다 셋을 가리는가 ===\n');

const made = [];
try {
  /* ── 1. 바뀐 것이 없으면 0 ── */
  console.log('[1] 바뀐 것이 없으면 0 (변화 없음)');
  const a = makePair('main'); made.push(a.root);
  const r1 = run(a.work);
  ok(r1.code === 0, `변화 없음 → 0 (실제 ${r1.code})`);
  ok(/변화 없음 \(origin\//.test(r1.out), `"변화 없음" 과 **본 가지**를 적는다 ("${r1.out.trim()}")`);

  /* ── 2. 원격이 바뀌면 2 ── */
  console.log('\n[2] 원격이 바뀌면 2 (메일박스 변경)');
  fs.writeFileSync(path.join(a.seed, 'docs', 'MASTER.md'), '첫 판\n새 지시\n');
  sh('git add -A && git commit -q -m second && git push -q origin main', a.seed);
  const r2 = run(a.work);
  ok(r2.code === 2, `바뀌면 → 2 (실제 ${r2.code})`);
  ok(/메일박스 변경/.test(r2.out), '"메일박스 변경" 이라고 적는다');

  /* ── 3. ★ origin/HEAD 가 없고 기본 가지가 main 이어도 **찾아낸다** ──
     이것이 10-16 에 거짓 알림을 낸 바로 그 상황이다: 복제본에 origin/HEAD 가 없고
     스크립트는 'master' 로 떨어졌는데, 이 저장소의 가지는 main 이다. */
  console.log('\n[3] origin/HEAD 가 없어도 원격에 있는 가지를 찾는다 (10-16 거짓 알림의 자리)');
  const b = makePair('main'); made.push(b.root);
  try { sh('git remote set-head origin -d', b.work); } catch (_) {}
  let hasHead = true;
  try { sh('git symbolic-ref --short refs/remotes/origin/HEAD', b.work); } catch (_) { hasHead = false; }
  ok(hasHead === false, 'origin/HEAD 를 지웠다 (10-16 사이트 저장소와 같은 모양)');
  const r3 = run(b.work);
  ok(r3.code === 0, `그래도 **변화 없음(0)** 이라고 답한다 — 전에는 즉시 2 였다 (실제 ${r3.code})`);
  ok(/origin\/main/.test(r3.out), `어느 가지를 봤는지 적는다 ("${r3.out.trim()}")`);

  /* ── 4. ★ 볼 수 없으면 **3**(못 봤다) — 2 가 아니다 ── */
  console.log('\n[4] 볼 수 없으면 3 (못 봤다) — 바뀜으로 읽지 않는다');
  const c = makePair('main'); made.push(c.root);
  const r4 = run(c.work, { MAILWAIT_BRANCH: 'nosuchbranch' });
  ok(r4.code === 3, `없는 가지를 보라고 하면 → 3 (실제 ${r4.code})`);
  ok(/못 봤다/.test(r4.out), '"못 봤다" 라고 적는다 (변화 없음·변경 둘 다 아니다)');
  ok(!/메일박스 변경/.test(r4.out), '**"메일박스 변경" 이라고 하지 않는다** — 10-16 의 거짓 알림');

  const d = makePair('main'); made.push(d.root);
  rmrf(d.remote);                                   // 원격을 들어낸다 = 바깥이 막힌 것과 같은 꼴
  const r5 = run(d.work);
  ok(r5.code === 3, `원격을 못 받으면 → 3 (실제 ${r5.code})`);
  ok(!/변화 없음 \(origin\//.test(r5.out) && /못 봤다/.test(r5.out),
     '받지도 못했는데 "변화 없음" 으로 끝내지 않는다 (조용한 실패 금지)');

  /* ── 5. 되돌림 실증 ──
     ⚠ 되돌림은 **스크립트가 실제로 낸 종료값**으로 한다. 시험 안에서 만든 상수로 하면
        스크립트를 되돌려도 그대로 통과한다(⑨-1 전수 점검). */
  console.log('\n[5] 되돌림 실증 3건');

  let revFalseAlarm = false;
  try { assert.notStrictEqual(r3.code, 0, `origin/HEAD 가 없을 때 ${r3.code} 로 답했다`); } catch (_) { revFalseAlarm = true; }
  ok(revFalseAlarm, '가지 찾기를 되돌리면 붉어진다 — 즉시 2(거짓 알림)로 돌아간다 (되돌림 실증 1)');

  let revUnknown = false;
  try { assert.notStrictEqual(r4.code, 3, `못 보는데 ${r4.code} 로 답했다`); } catch (_) { revUnknown = true; }
  ok(revUnknown, '"못 봤다" 를 빼면 붉어진다 — 모름이 바뀜으로 읽힌다 (되돌림 실증 2)');

  let revSilent = false;
  try { assert.notStrictEqual(r5.code, 3, `원격이 없는데 ${r5.code} 로 답했다`); } catch (_) { revSilent = true; }
  ok(revSilent, '원격 못 받음 검사를 빼면 붉어진다 — 조용히 "변화 없음" (되돌림 실증 3)');

  console.log(`\n전부 통과 (${checks}건)`);
} finally {
  for (const r of made) { try { rmrf(r); } catch (_) {} }
}
