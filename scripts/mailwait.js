#!/usr/bin/env node
// 메일박스 기다리기 (2026-10-16, 대표님 17:44 "5분마다 마스터의 메일박스를 보라").
// 빈 손일 때 세션이 이것을 돌린다: 60초마다 원격 docs/MASTER.md·REPORT 요청을 보고,
// 바뀌면 그 사실을 적고 exit 2 → 세션은 git pull 뒤 MASTER 를 다시 읽는다.
// 최대 9분(도구 시간 제한 안) 돌고 변화 없으면 exit 0 → 세션은 **다시 이것을 부른다.**
// 쓰기: node scripts/mailwait.js            (9분)
//       node scripts/mailwait.js --once     (한 번만 비교)
const { execSync } = require('child_process');
const WATCH = ['docs/MASTER.md'];
const EVERY_MS = 60 * 1000, MAX_MS = 9 * 60 * 1000;
const once = process.argv.includes('--once');
const git = (c) => execSync('git ' + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
let main = 'master';
try { main = git('symbolic-ref --short refs/remotes/origin/HEAD').replace(/^origin\//, ''); } catch (_) {}
const hashOf = (ref) => WATCH.map((f) => { try { return git(`rev-parse ${ref}:${f}`); } catch (_) { return '-'; } }).join(' ');
const mine = hashOf('HEAD');
const t0 = Date.now();
(async () => {
  for (;;) {
    try { git(`fetch -q origin ${main}`); } catch (_) {}
    const theirs = hashOf(`origin/${main}`);
    if (theirs !== mine) {
      console.error(`📬 메일박스 변경 — origin/${main} 의 ${WATCH.join(',')} 가 바뀌었다. git pull 하고 MASTER 를 다시 읽어라.`);
      process.exit(2);
    }
    if (once || Date.now() - t0 > MAX_MS) { console.log('변화 없음 — 다시 node scripts/mailwait.js'); process.exit(0); }
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
})();
