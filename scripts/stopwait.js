#!/usr/bin/env node
// Stop 훅 (2026-10-17, 마스터 — 대표님 16:55 "내가 매번 깨워야 하나?")
// 세션이 차례를 끝내려 할 때 불린다. 메일박스(docs/MASTER.md · NOW.md)를 최대 9분 지켜보고
//  - 바뀌었으면: exit 2 + 까닭(stderr) → 세션은 멈추지 않고 그 지시로 이어 간다
//  - 그대로거나 못 봤으면: exit 0 → 평소처럼 멈춘다
// 고리 막기: 한 시간에 12번까지만 이어 간다(.claude/stopwait.count). 넘으면 그냥 멈춘다.
const { spawnSync } = require('child_process');
const fs = require('fs');
const CNT = '.claude/stopwait.count', LIMIT = 12, HOUR = 3600e3;
let c = { t: Date.now(), n: 0 };
try { c = JSON.parse(fs.readFileSync(CNT, 'utf8')); } catch (e) {}
if (Date.now() - c.t > HOUR) c = { t: Date.now(), n: 0 };
if (c.n >= LIMIT) process.exit(0);
const r = spawnSync('node', ['scripts/mailwait.js'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 560e3 });
if (r.status === 2) {
  c.n++; try { fs.writeFileSync(CNT, JSON.stringify(c)); } catch (e) {}
  process.stderr.write('📬 메일박스가 바뀌었다. 멈추지 말고: git pull (A2 는 git rebase origin/master) → docs/NOW.md 맨 위 줄부터 시작. 끝나면 REPORT.\n');
  process.exit(2);
}
process.exit(0);
