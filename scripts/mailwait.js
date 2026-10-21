#!/usr/bin/env node
// 메일박스 기다리기 (2026-10-16, 대표님 17:44 "5분마다 마스터의 메일박스를 보라").
// 빈 손일 때 세션이 이것을 돌린다: 60초마다 원격 `docs/MASTER.md` 를 보고,
// 바뀌면 그 사실을 적고 **exit 2** → 세션은 git pull 뒤 MASTER 를 다시 읽는다.
// 최대 9분(도구 시간 제한 안) 돌고 변화 없으면 **exit 0** → 세션은 다시 이것을 부른다.
//
// ★ 답은 셋이다 — **같다 / 바뀌었다 / 못 봤다.**
//   2026-10-16 에 사이트 저장소에서 이것이 **거짓 알림만** 냈다: `origin/HEAD` 가 안 잡혀
//   기본 가지를 'master' 로 떨어뜨렸고, 이 저장소엔 그 가지가 **없다.** 못 읽은 값을 '-' 로
//   두고 내 것과 견주니 늘 달랐고, 그래서 **매번 즉시 "메일박스 변경"** 이었다.
//   세션은 그 말을 믿고 git pull 을 했고 바뀐 것은 없었다 — **모름을 없음으로 읽은 것**이다
//   (D-70 · §20 "빈 답은 없음이 아니다"). 못 보면 **exit 3** 으로 멈추고 까닭을 적는다.
//
// 쓰기: node scripts/mailwait.js            (9분)
//       node scripts/mailwait.js --once     (한 번만 비교)
// 나가는 값: 0 변화 없음 · 2 바뀌었다 · 3 **못 봤다**(가지·원격·파일 문제 — 고쳐야 한다)
const { execSync } = require('child_process');

const WATCH = ['docs/NOW.md'];
const EVERY_MS = 60 * 1000, MAX_MS = 9 * 60 * 1000;
const FETCH_FAIL_LIMIT = 3;        // 원격을 세 번 내리 못 받으면 멈춘다(조용히 "변화 없음" 하지 않는다)
const once = process.argv.includes('--once');

const git = (c) => execSync('git ' + c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
const tryGit = (c) => { try { return { ok: true, out: git(c) }; } catch (e) { return { ok: false, out: '' }; } };

function die(why) {
  console.error(`⚠ 메일박스를 **못 봤다** — ${why}`);
  console.error('  "변화 없음" 도 "바뀌었다" 도 아니다. 이 줄을 REPORT "막힌 것"에 적고 고친다.');
  process.exit(3);
}

/** 기본 가지를 **확인해서** 고른다 — 못 찾으면 멈춘다(짐작하지 않는다) */
function defaultBranch() {
  if (process.env.MAILWAIT_BRANCH) return process.env.MAILWAIT_BRANCH;
  const sym = tryGit('symbolic-ref --short refs/remotes/origin/HEAD');
  if (sym.ok && sym.out) return sym.out.replace(/^origin\//, '');
  // origin/HEAD 가 없는 저장소가 많다(클론 방식에 따라). 원격에 **실제로 있는** 것을 고른다.
  for (const b of ['main', 'master']) {
    const r = tryGit(`ls-remote --heads origin ${b}`);
    if (r.ok && r.out.includes(`refs/heads/${b}`)) return b;
  }
  return null;
}

const branch = defaultBranch();
if (!branch) die('원격의 기본 가지를 못 찾았다 (origin/HEAD 없음 · main·master 둘 다 없음). MAILWAIT_BRANCH 로 알려 달라');

/** 그 ref 에서 보는 파일들의 해시. **못 읽으면 null** — '-' 같은 가짜 값을 돌려주지 않는다. */
function hashOf(ref) {
  const out = [];
  for (const f of WATCH) {
    const r = tryGit(`rev-parse ${ref}:${f}`);
    if (!r.ok || !r.out) return null;
    out.push(r.out);
  }
  return out.join(' ');
}

const mine = hashOf('HEAD');
if (!mine) die(`내 쪽에서 ${WATCH.join(',')} 를 못 읽었다 (HEAD 에 그 파일이 있나)`);

// 처음 한 번은 원격을 **반드시** 받아 봐야 한다 — 받지도 못하는데 "변화 없음" 은 거짓이다
{
  const f = tryGit(`fetch -q origin ${branch}`);
  if (!f.ok) die(`origin/${branch} 를 받지 못했다 (바깥 접속이 막혔나 · 권한)`);
  if (hashOf(`origin/${branch}`) === null) die(`origin/${branch} 에서 ${WATCH.join(',')} 를 못 읽었다 (가지 이름이 맞나: ${branch})`);
}

const t0 = Date.now();
let fetchFails = 0;

(async () => {
  for (;;) {
    const f = tryGit(`fetch -q origin ${branch}`);
    if (!f.ok) {
      fetchFails += 1;
      if (fetchFails >= FETCH_FAIL_LIMIT) die(`origin/${branch} 를 내리 ${fetchFails}번 못 받았다 — 기다려도 알림이 못 온다`);
    } else {
      fetchFails = 0;
    }

    const theirs = hashOf(`origin/${branch}`);
    if (theirs === null) die(`origin/${branch} 에서 ${WATCH.join(',')} 를 못 읽었다 (중간에 사라졌나)`);

    if (theirs !== mine) {
      console.error(`📬 메일박스 변경 — origin/${branch} 의 ${WATCH.join(',')} 가 바뀌었다. git pull 하고 MASTER 를 다시 읽어라.`);
      process.exit(2);
    }
    if (once || Date.now() - t0 > MAX_MS) {
      console.log(`변화 없음 (origin/${branch}) — 다시 node scripts/mailwait.js`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
})();
