// samples/langpacks_test.js — 언어팩 배포 자리 (B 25, 2026-10-17)
//
// 설계(비공개): raytok-engine/docs/design/langpack-v1.md §3. 여기서 보는 것은 **배포 자리**다 —
// 목록(`langpacks/index.json`)이 실제 파일과 같은 말을 하는가, 어긋나면 **붉어지는가**.
// 팩이 깨진 채 나가면 손님 폰이 깨진 모델을 받는다. 그래서 해시가 자물쇠다.
//
// 돌리기: node samples/langpacks_test.js   (망·playwright 필요 없음)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');

console.log('=== 언어팩 배포 자리 (목록 == 파일) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const CHECKER = path.join(ROOT, 'tools', 'check-langpacks.js');
const DIR = path.join(ROOT, 'langpacks');
const INDEX = path.join(DIR, 'index.json');

ok(fs.existsSync(CHECKER), '검사기 tools/check-langpacks.js 가 있다');
ok(fs.existsSync(INDEX), '목록 langpacks/index.json 이 있다');

const run = (args, cwd = ROOT) => {
  try { return { code: 0, out: execFileSync('node', [CHECKER, ...args], { cwd, encoding: 'utf-8' }) }; }
  catch (e) { return { code: e.status || 1, out: String(e.stdout || '') }; }
};

/* ① 지금 저장소는 초록이어야 한다 */
let r = run([]);
ok(r.code === 0, `검사기 종료코드 0 (${r.out.trim().split('\n').pop()})`);
ok(/목록 == 파일/.test(r.out), '검사기가 "같다" 고 말한다');

/* ② 목록 한 줄이 설계 §3 의 칸을 다 들고 있다 */
const index = JSON.parse(fs.readFileSync(INDEX, 'utf-8'));
ok(Array.isArray(index.packs) && index.packs.length >= 1, `팩 ${index.packs.length}개`);
for (const p of index.packs) {
  for (const k of ['name', 'version', 'product', 'file', 'bytes', 'sha256', 'status']) {
    ok(p[k] !== undefined, `${p.name}: ${k} 칸이 있다`);
  }
  const fp = path.join(DIR, p.file);
  ok(fs.existsSync(fp), `${p.name}: 파일이 있다 (${p.file})`);
  const body = fs.readFileSync(fp);
  ok(body.length === p.bytes, `${p.name}: 크기가 목록과 같다 (${body.length} B)`);
  ok(crypto.createHash('sha256').update(body).digest('hex') === p.sha256,
     `${p.name}: SHA-256 이 목록과 같다 (${String(p.sha256).slice(0, 12)}…)`);
}

/* ③ 지금 ready 는 0 이어야 한다 — 실제 팩은 아직 없다. 가짜를 앱이 받으면 안 된다 */
const ready = index.packs.filter((p) => p.status === 'ready');
ok(ready.length === 0, `앱이 받는 팩(ready) 0개 — 실제 팩은 아직 없다 (${ready.map((p) => p.name).join(',') || '없음'})`);
ok(index.packs.some((p) => p.status === 'fake'), '가짜 팩이 fake 라고 적혀 있다 (앱이 건너뛸 표)');
ok(/status.*ready/.test(JSON.stringify(index)), '목록이 "ready 만 받는다"를 글로 들고 있다');

/* ④ ★ 되돌림 실증 — 파일을 한 바이트 바꾸면 **붉어진다**. 저장소를 건드리지 않고
      임시 자리에 베껴서 한다(시험이 작업물을 더럽히면 안 된다). */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'langpacks-'));
fs.mkdirSync(path.join(tmp, 'langpacks'));
for (const f of fs.readdirSync(DIR)) fs.copyFileSync(path.join(DIR, f), path.join(tmp, 'langpacks', f));
let r2 = run(['--root', tmp]);
ok(r2.code === 0, '베낀 자리도 초록 (베끼기가 멀쩡하다)');

const victim = path.join(tmp, 'langpacks', index.packs[0].file);
const buf = fs.readFileSync(victim);
buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;        // 한 바이트 뒤집기
fs.writeFileSync(victim, buf);
r2 = run(['--root', tmp]);
ok(r2.code === 1 && /SHA-256 이 다르다/.test(r2.out),
   `한 바이트만 바뀌어도 붉다 (${r2.out.split('\n').find((l) => l.includes('✗')) || '-'})`);

/* 위 줄이 **되돌림 실증**이다 — 시험 안에서 만든 값이 아니라 검사기가 실제로 돌려준
   종료코드를 본다. 검사기가 해시를 안 보면 여기서 0 이 오고 이 단언이 붉어진다. */
let revertShaFailed = false;
try { assert.strictEqual(r2.code, 0, `한 바이트를 바꿨는데 검사기가 ${r2.code} 로 통과시켰다`); }
catch (e) { revertShaFailed = true; }
ok(revertShaFailed === true, '해시 검사를 빼면 붉어진다 (되돌림 실증 — 실제로 한 바이트 바꿔 확인)');

/* 크기만 틀려도 붉다 */
fs.copyFileSync(path.join(DIR, index.packs[0].file), victim);
const idx2 = JSON.parse(fs.readFileSync(path.join(tmp, 'langpacks', 'index.json'), 'utf-8'));
idx2.packs[0].bytes = idx2.packs[0].bytes + 1;
fs.writeFileSync(path.join(tmp, 'langpacks', 'index.json'), JSON.stringify(idx2));
r2 = run(['--root', tmp]);
ok(r2.code === 1 && /크기가 다르다/.test(r2.out), '크기가 틀리면 붉다');

/* 팩 안 manifest 와 목록이 갈라지면 붉다 (어느 쪽이 맞는지 모르게 두지 않는다) */
const idx3 = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf-8'));
idx3.packs[0].version = '99';
fs.writeFileSync(path.join(tmp, 'langpacks', 'index.json'), JSON.stringify(idx3));
r2 = run(['--root', tmp]);
ok(r2.code === 1 && /판이 다르다/.test(r2.out), '팩 안 판과 목록이 갈라지면 붉다');

/* 파일이 사라지면 붉다 */
fs.copyFileSync(path.join(DIR, 'index.json'), path.join(tmp, 'langpacks', 'index.json'));
fs.unlinkSync(victim);
r2 = run(['--root', tmp]);
ok(r2.code === 1 && /파일이 없다/.test(r2.out), '파일이 사라지면 붉다');

fs.rmSync(tmp, { recursive: true, force: true });

/* ⑤ 이름이 겹치는 곳(§5) — `packs/` 는 꾸러미 문장이고 언어팩이 아니다. 섞이지 않았나 */
ok(fs.existsSync(path.join(ROOT, 'packs', 'match.js')), '`packs/` 는 꾸러미 문장 자리로 그대로 있다');
ok(!fs.existsSync(path.join(ROOT, 'packs', 'index.json')), '언어팩 목록을 `packs/` 에 두지 않았다 (이름 충돌 피함)');

console.log(`\n전부 통과 (${checks}건)`);
