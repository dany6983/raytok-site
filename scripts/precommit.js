#!/usr/bin/env node
/**
 * scripts/precommit.js — **생성물만 고친 커밋을 막는다** (A1, 2026-10-20)
 *
 * ★ 왜 있나: 2026-10-20 하루에 급한 고침 **다섯**이 `web/listener/index.html`(만드는 파일)에만
 * 들어갔다. 그 파일은 `index.src.html` 에서 만들어지므로, 다음 `build-listener` 한 번이면
 * 그 고침들이 **조용히 사라진다.** 실제로 한 번 사라졌다가 되살렸다(커밋 `4cb39e3`→`6c836a0`).
 * 잃어버린 것은 대표님 실기에서 찾은 고침들이다 — 유실은 지연보다 나쁘다(R-15).
 *
 * 그래서 **커밋 때** 본다. 보는 것은 둘:
 *   ① 생성물(`index.html`)을 고쳤는데 소스(`index.src.html`)와 **어긋난다** → 멈춘다
 *   ② 소스를 고쳤는데 생성물을 **같이 안 올렸다** → 멈춘다 (다음 사람이 옛 판을 받는다)
 *
 * 막지 않는 것: 둘 다 올렸고 `--check` 가 조용한 커밋, 그리고 그 파일을 안 건드린 커밋.
 * 급할 때 넘기려면 `SKIP_BUILD_CHECK=1 git commit …` — **까닭을 커밋 글에 적는다.**
 *
 * 켜는 법(클론마다 한 번):  git config core.hooksPath .githooks
 */
const { execSync, spawnSync } = require('child_process');

const SRC = 'web/listener/index.src.html';
const OUT = 'web/listener/index.html';

function staged() {
  try {
    return execSync('git diff --cached --name-only', { encoding: 'utf-8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (_) { return []; }
}

const files = staged();
const touchedOut = files.includes(OUT);
const touchedSrc = files.includes(SRC);

if (!touchedOut && !touchedSrc) process.exit(0);
if (process.env.SKIP_BUILD_CHECK === '1') {
  console.log('[precommit] SKIP_BUILD_CHECK=1 — 건너뛴다. 까닭을 커밋 글에 적는다.');
  process.exit(0);
}

if (touchedSrc && !touchedOut) {
  console.error(`\n[precommit] ${SRC} 를 고쳤는데 ${OUT} 이 커밋에 없다.`);
  console.error('  → node tools/build-listener.js  를 돌리고 **같이** 커밋한다.');
  process.exit(1);
}

/* 생성물이 소스의 출력인가 — 도구가 스스로 센다(셈을 여기 베끼지 않는다) */
const r = spawnSync('node', ['tools/build-listener.js', '--check'], { encoding: 'utf-8' });
if (r.status !== 0) {
  console.error('\n[precommit] 만든 판이 소스와 다르다 — 생성물에 직접 고친 것은 다음 build 에 사라진다.');
  console.error((r.stdout || '').trim());
  console.error((r.stderr || '').trim());
  console.error('  → 고침을 ' + SRC + ' 로 옮기고 node tools/build-listener.js 를 돌려 같이 커밋한다.');
  console.error('  → 2026-10-20 에 이 일이 **다섯 번** 났다(한 번은 실제로 한 줄이 사라졌다).');
  process.exit(1);
}
console.log('[precommit] 청취 생성물 == 소스 (같다)');
process.exit(0);
