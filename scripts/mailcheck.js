#!/usr/bin/env node
// 메일박스 감지 — 원격 docs/MASTER.md 가 내 것과 다르면 알린다 (2026-10-07, 마스터).
// Claude Code PostToolUse 훅이 도구를 쓸 때마다 부른다. 60초에 한 번만 fetch 한다.
// 다르면 stderr 로 한 줄 적고 exit 2 → 훅이 그 줄을 세션에 보여 준다. 같으면 조용히 0.
// 손으로: node scripts/mailcheck.js --force
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WATCH = ['docs/MASTER.md', 'docs/MAIL.md', 'docs/C_검색보고.md'];
const THROTTLE_MS = 60 * 1000;
const force = process.argv.includes('--force');

function git(cmd) {
  return execSync('git ' + cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

try {
  const top = git('rev-parse --show-toplevel');
  const stamp = path.join(os.tmpdir(), 'raytok-mailcheck-' + Buffer.from(top).toString('hex').slice(0, 24));
  let last = 0;
  try { last = Number(fs.readFileSync(stamp, 'utf8')) || 0; } catch (_) {}
  if (!force && Date.now() - last < THROTTLE_MS) process.exit(0);
  fs.writeFileSync(stamp, String(Date.now()));

  let main = 'master';
  try { main = git('symbolic-ref --short refs/remotes/origin/HEAD').replace(/^origin\//, ''); } catch (_) {}
  try { git(`fetch -q origin ${main}`); } catch (_) { process.exit(0); } // 오프라인이면 조용히
  const ref = `origin/${main}`;

  const changed = WATCH.filter((f) => {
    try { git(`cat-file -e ${ref}:${f}`); } catch (_) { return false; }
    try { git(`diff --quiet ${ref} -- ${f}`); return false; } catch (_) { return true; }
  });
  if (changed.length === 0) process.exit(0);

  process.stderr.write(
    `📬 메일박스 변경: ${changed.join(', ')} 가 ${ref} 와 다르다. ` +
    `지금 하던 도구 호출은 끝났다. 다음 행동 전에 \`git pull\`(A2는 \`git rebase origin/master\`) 하고 ` +
    `바뀐 파일을 읽어라. [열림]이 바뀌었으면 그것부터.\n`
  );
  process.exit(2);
} catch (_) {
  process.exit(0);
}
