// samples/deploy_doc_test.js — 배포 한 장이 **코드와 어긋나지 않게** (B 17, 2026-10-17)
//
// 왜 있나 (AGENTS §4 — 문서도 값을 읽는 곳이다): 이 문서는 대표님이 보고 그대로 치는 종이다.
// 환경변수 이름 하나가 코드에서 바뀌면 문서는 조용히 거짓말이 되고, 대표님은 없는 이름을
// `wrangler secret put` 한다. 그리고 공개 저장소라 **값이 한 줄이라도 끼면 안 된다.**
// 돌리기: node samples/deploy_doc_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 배포 한 장 점검 (docs/deploy-2026-10-17.md) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'deploy-2026-10-17.md');
ok(fs.existsSync(DOC), '문서가 있다');
const doc = fs.readFileSync(DOC, 'utf-8');

const src = ['index.js', 'pay.js', 'room.js', 'pro-translate.js']
  .map((f) => path.join(ROOT, 'relay', 'src', f))
  .filter((p) => fs.existsSync(p))
  .map((p) => fs.readFileSync(p, 'utf-8'))
  .join('\n');

/* ① 문서가 든 환경변수 이름이 **릴레이 코드에 실제로 있는가** */
const names = [...new Set((doc.match(/`[A-Z][A-Z0-9_]{3,}`/g) || []).map((m) => m.slice(1, -1)))]
  .filter((n) => !['PASS', 'FAIL', 'JSON'].includes(n));
ok(names.length >= 8, `문서가 환경변수 이름 ${names.length}개를 든다`);
const ghost = names.filter((n) => !src.includes('env.' + n));
ok(ghost.length === 0, `코드에 없는 이름이 없다 (${ghost.join(', ') || '없음'})`);

/* ② 코드가 **반드시** 읽는 비밀값이 문서에 빠지지 않았는가 (빠지면 대표님이 못 넣는다) */
for (const must of ['LICENSE_SECRET', 'LICENSE_SALT', 'MINT_PRIVATE_KEY',
                    'PORTONE_API_SECRET', 'PORTONE_WEBHOOK_SECRET']) {
  ok(doc.includes('`' + must + '`'), `문서에 ${must} 가 있다`);
}
ok(/PORTONE_API_BASE[\s\S]{0,200}지운다/.test(doc), '운영에 두면 안 되는 PORTONE_API_BASE 를 지우라고 적혀 있다');

/* ③ 끝점·확인 명령이 실제로 있는가 */
for (const p of ['/pay/webhook', '/translate', '/usage']) {
  ok(doc.includes(p) && src.includes(`'${p}'`), `${p} 를 문서와 코드가 함께 안다`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
ok(doc.includes('npm run e2e:license') && !!pkg.scripts['e2e:license'],
   '문서가 든 확인 한 줄(npm run e2e:license)이 package.json 에 있다');

/* ④ 공개 저장소 — **값이 끼지 않았는가.** 비밀값처럼 긴 글자는 한 줄도 없어야 한다 */
const code = doc.replace(/```[\s\S]*?```/g, (b) => b);   // 코드 묶음도 같이 본다
const suspects = (code.match(/\b[A-Za-z0-9_\-]{32,}\b/g) || [])
  .filter((t) => !/^[가-힣]+$/.test(t))
  .filter((t) => !/claudeusercontent|raytok-relay|workers\.dev/.test(t));
ok(suspects.length === 0, `값처럼 보이는 긴 글자 0 (${suspects.slice(0, 2).join(', ') || '없음'})`);
ok(!/sk-|AIza|Bearer\s+[A-Za-z0-9]/.test(doc), '키 머리글자(sk- · AIza · Bearer <값>)가 없다');
ok(/<ADMIN_SECRET>/.test(doc), '값이 필요한 자리는 자리표(<ADMIN_SECRET>)로만 적혀 있다');

/* ⑤ 되돌림 실증 — 이름 하나를 코드에 없는 것으로 바꾸면 붉다 */
let reverted = false;
try {
  const faked = names.concat(['PORTONE_NOPE_SECRET']).filter((n) => !src.includes('env.' + n));
  assert.strictEqual(faked.length, 0, `코드에 없는 이름: ${faked.join(',')}`);
} catch (e) { reverted = true; }
ok(reverted === true, '코드에 없는 이름이 문서에 끼면 붉어진다 (되돌림 실증)');

console.log(`\n전부 통과 (${checks}건)`);
