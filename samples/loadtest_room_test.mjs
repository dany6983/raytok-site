/* samples/loadtest_room_test.mjs — 부하 프로그램이 **맞게 세는가** (NOW 11-01 13:47 ③)
 *
 * 숫자를 믿으려면 세는 쪽부터 믿어야 한다. 두 가지로 본다:
 *  [1] 셈 함수(scripts/loadtest-room.mjs 의 summarizeStep·pickLimit) — 빠진 줄·실패·p95 를 손으로 만든 받음표로
 *  [2] 진짜 릴레이 코드(`wrangler dev --env loadtest`, 로컬)에 N=50 → 붙음 50·빠짐 0·받은 줄 = 50×보낸 줄
 *      그리고 N=205 → 방 상한 200(relay/src/room.js) 때문에 **연결 실패 5** 로 세는가 (실패를 놓치면 한계가 부푼다)
 * 로컬 값은 운영 한계가 아니다 — 여기서는 「세는 법」만 본다.
 * 되돌림 실증 ①: 받음표에서 한 줄을 빼면 「빠짐 0」 단언이 붉다 (summarizeStep 이 센 값).
 * 되돌림 실증 ②: N=205 단계의 실패 수를 0 으로 본다고 단언하면 붉다 (릴레이가 실제로 거절한 수).
 * 실행: node samples/loadtest_room_test.mjs   (npm run test:loadtest-room)
 */
import assert from 'node:assert';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeStep, pickLimit, stepOk, percentile, runStep, hostToken, parseArgs, main } from '../scripts/loadtest-room.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELAY_DIR = path.join(ROOT, 'relay');
let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

console.log('=== 부하 프로그램이 맞게 세는가 (loadtest-room) ===');

/* ── [1] 셈 ── */
console.log('\n[1] 셈 함수');
const sent = [1, 2, 3, 4].map((seq) => ({ seq, t: 1000 * seq }));
const mk = (delays) => ({ opened: true, failed: false, closedEarly: false, got: new Map(delays.map((d, i) => [i + 1, 1000 * (i + 1) + d]).filter(([, at]) => !Number.isNaN(at))) });
const full = summarizeStep({ n: 3, sent, listeners: [mk([10, 20, 30, 40]), mk([10, 20, 30, 3000]), { opened: false, failed: true, got: new Map() }] });
ok(full.opened === 2 && full.connectFail === 1, `붙음 2 · 실패 1 (실제 ${full.opened}·${full.connectFail})`);
ok(full.delivered === 8 && full.missing === 0, `받은 줄 8 · 빠짐 0 (실제 ${full.delivered}·${full.missing})`);
ok(full.max === 3000 && full.p50 === 20 && full.p95 === 3000, `p50 20 · p95 3000 · 최대 3000 (실제 ${full.p50}·${full.p95}·${full.max})`);
const holed = summarizeStep({ n: 1, sent, listeners: [mk([10, NaN, 30, 40])] });
ok(holed.missing === 1 && holed.delivered === 3, `한 줄 안 온 손님 → 빠짐 1 (실제 ${holed.missing})`);
ok(!stepOk(holed) && !stepOk(full), '빠짐·실패·p95 초과 단계는 「버팀」이 아니다');
ok(percentile([], 95) === null, '받은 줄이 없으면 p95 는 빈 값(0 으로 속이지 않는다)');
const good = (n) => ({ n, connectFail: 0, missing: 0, closedEarly: 0, serverErrors: 0, linesSent: 5, p95: 100 });
const lim = pickLimit([good(50), good(100), { ...good(200), p95: 2500 }, good(500)]);
ok(lim.limit === 100 && lim.brokeAt === 200 && /p95/.test(lim.why), `한계 = 처음 못 버틴 단계의 앞 (100명, 200에서 ${lim.why})`);
ok(pickLimit([good(50), good(100)]).brokeAt === null, '다 버티면 끊긴 단계 없음 — 마지막 단계가 한계(그 위 안 재 봄)');
ok(pickLimit([{ ...good(50), linesSent: 0 }]).limit === 0, '보낸 줄이 0 이면 첫 단계부터 못 버팀(빈 답 — §20)');
ok(parseArgs(['--steps', '50,100', '--dur', '3']).steps.join() === '50,100', '--steps 읽기');
let prodRefused = false;
try { await main(['--relay', 'https://raytok-relay.raytok.workers.dev', '--steps', '1'], () => {}); } catch (e) { prodRefused = /운영/.test(e.message); }
ok(prodRefused, '운영 릴레이 주소는 거절한다');
let revertFailed = false;
try { assert.strictEqual(holed.missing, 0, '빠짐 0'); } catch (_) { revertFailed = true; }
ok(revertFailed, '되돌림 실증 ①: 한 줄 뺀 받음표로는 「빠짐 0」 이 붉다');

/* ── [2] 진짜 릴레이 코드(로컬) ── */
console.log('\n[2] wrangler dev --env loadtest (로컬) — N=50 · N=205');
if (!fs.existsSync(path.join(RELAY_DIR, 'node_modules', 'wrangler'))) {
  console.log('  relay/node_modules 에 wrangler 없음 → npm ci (한 번)');
  execSync('npm ci --no-audit --no-fund', { cwd: RELAY_DIR, stdio: 'inherit', shell: true });
}
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const relay = `http://127.0.0.1:${port}`;
const isWin = process.platform === 'win32';
const args = ['wrangler', 'dev', '--env', 'loadtest', '--port', String(port), '--ip', '127.0.0.1',
  '--var', 'LICENSE_SECRET:' + 'ab'.repeat(32), '--var', 'LICENSE_SALT:loadtest-local-salt',
  '--persist-to', path.join(RELAY_DIR, '.wrangler', 'loadtest-test')];
const dev = spawn(isWin ? 'npx.cmd' : 'npx', args, { cwd: RELAY_DIR, detached: !isWin, shell: isWin, env: { ...process.env, NO_PROXY: '127.0.0.1,localhost' } });
let devLog = '';
dev.stdout.on('data', (d) => { devLog += d; });
dev.stderr.on('data', (d) => { devLog += d; });
function stopDev() {
  try {
    if (isWin) execSync(`taskkill /pid ${dev.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-dev.pid, 'SIGTERM');
  } catch (_) {}
}
process.on('exit', stopDev);

try {
  const t0 = Date.now();
  while (!/Ready on/.test(devLog)) {
    if (Date.now() - t0 > 90000) throw new Error('wrangler dev 가 90초 안에 안 떴다:\n' + devLog.slice(-1500));
    await new Promise((r) => setTimeout(r, 300));
  }
  const token = await hostToken(relay);
  ok(typeof token === 'string' && token.length > 20, '시험 키 0번 → redeem → issue → 강사 토큰 (ALLOW_TEST_KEY=1 env)');

  const s50 = await runStep({ relay, token, n: 50, durMs: 6000, intervalMs: 1500, pad: null });
  console.log('   ', JSON.stringify(s50));
  ok(s50.opened === 50 && s50.connectFail === 0, `N=50 붙음 50 · 실패 0 (실제 ${s50.opened}·${s50.connectFail})`);
  ok(s50.linesSent >= 3, `강사가 6초에 ${s50.linesSent}줄 보냄 (1.5초마다)`);
  ok(s50.delivered === 50 * s50.linesSent && s50.missing === 0, `받은 줄 = 50 × ${s50.linesSent} = ${s50.delivered} · 빠짐 ${s50.missing}`);
  ok(s50.dup === 0 && s50.closedEarly === 0 && s50.serverErrors === 0, '겹침 0 · 끊김 0 · 서버 오류 0');
  ok(s50.p95 !== null && s50.p95 >= 0, `p95 를 쟀다 (${s50.p95}ms — 로컬값, 운영 한계 아님)`);

  const s205 = await runStep({ relay, token, n: 205, durMs: 3000, intervalMs: 1500, pad: null });
  console.log('   ', JSON.stringify(s205));
  ok(s205.opened === 200 && s205.connectFail === 5, `N=205 → 방 상한 200 이라 붙음 200 · 연결 실패 5 로 센다 (실제 ${s205.opened}·${s205.connectFail})`);
  ok(s205.missing === 0, `붙은 200명은 빠짐 없음 (실제 ${s205.missing})`);
  ok(pickLimit([s50, s205]).brokeAt === 205, '두 단계 → 205 에서 끊김 · 한계 50 으로 적힌다');
  let revertFailFailed = false;
  try { assert.strictEqual(s205.connectFail, 0, '205 명 모두 붙었다'); } catch (_) { revertFailFailed = true; }
  ok(revertFailFailed, '되돌림 실증 ②: 릴레이가 거절한 5명을 0 으로 볼 수 없다');
} finally {
  stopDev();
}

console.log(`\n=== 통과 ${pass} ===`);
process.exit(0);
