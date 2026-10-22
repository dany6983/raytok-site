/* samples/prod_script_test.js — 대표님이 치는 **한 줄**이 정말 도나 (NOW 6 · 마스터 10-22 13:00)
 * 실행: node samples/prod_script_test.js   (npm run test:prod-script)
 *
 * `scripts/prod-license-e2e.mjs` 는 **대표님 PC 에서 도는 줄**이다. 운영 주소는 이 세션의
 * 네트워크 정책에 막혀 있어 끝까지 돌릴 수 없다 — 그래서 **막히기 전까지**를 돌린다:
 * 낡은 Node 흉내 · 첫 걸음(코드 발급, 전부 로컬) · 안내문이 **할 수 있는 말**인가.
 *
 * ## 왜 생겼나 (2026-10-22)
 * 낡은 Node 에서 「`npm ci` 를 한 번 하고 다시 돌려 주세요」라고 **안내만** 했는데, 그 파일은
 * `ws` 를 아예 **안 불렀다** — `npm ci` 를 해도 **똑같이 멈춘다.** 대표님을 헛걸음시키는
 * 안내였다. 지금은 내장이 없으면 저장소의 `ws` 로 떨어지고, 그래서 그 안내가 **사실**이다.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.dirname(__dirname);
const SCRIPT = path.join(ROOT, 'scripts', 'prod-license-e2e.mjs');
let n = 0;
const ok = (c, m) => { assert(c, m); n += 1; console.log('  [PASS] ' + m); };

console.log('=== 대표님이 치는 한 줄 (prod-license-e2e.mjs) ===');

const src = fs.readFileSync(SCRIPT, 'utf8');

/** 닫힌 자리로 보낸다 — 바깥으로 안 나가고, 첫 걸음(로컬 발급)까지만 본다 */
function run(extraNodeCode) {
  const boot = `${extraNodeCode}\nawait import(${JSON.stringify('file://' + SCRIPT)});`;
  try {
    return execFileSync(process.execPath, ['--input-type=module', '-e', boot], {
      cwd: ROOT,
      env: { ...process.env, RELAY_URL: 'http://127.0.0.1:9', E2E_QUIET: '1' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000
    });
  } catch (e) {
    return String((e.stdout || '') + (e.stderr || ''));   // 뒷 단계는 연결이 없어 실패한다 — 그게 정상
  }
}

/* ── ① 지금 Node(내장 WebSocket 있음) — 첫 걸음이 돈다 ── */
const nowOut = run('');
ok(/\[PASS\] 1 코드 발급/.test(nowOut), '지금 Node 에서 **첫 걸음(코드 발급)이 돈다** — 전부 로컬이라 바깥이 필요 없다');
ok(!/내장 WebSocket 이 없/.test(nowOut), '내장 WebSocket 이 있으면 떨어짐 안내를 띄우지 않는다');

/* ── ② 낡은 Node 흉내 — **저장소의 ws 로 떨어져 그대로 돈다** ── */
const oldOut = run("Object.defineProperty(globalThis,'WebSocket',{value:undefined,configurable:true});");
ok(/저장소의 ws 로 돕니다/.test(oldOut), '내장이 없으면 **저장소의 ws 로 떨어진다**고 말한다');
ok(/\[PASS\] 1 코드 발급/.test(oldOut), '그리고 **멈추지 않고 돈다** — 전에는 여기서 끝났다');

/* ── ③ 안내문이 **할 수 있는 말**인가 ── */
const guide = (src.match(/둘 중 하나만 하시면 됩니다[^\n]*/) || [''])[0];
ok(/npm ci/.test(guide) && /import\('ws'\)/.test(src),
   '`npm ci` 를 권하면 그 파일이 **실제로 ws 를 부른다** — 아니면 헛걸음 안내다');

/* ── ④ 마스터가 시킨 ⑨번(프로)이 있나 ── */
ok(/step\(9,/.test(src) && /engine: 'pro'/.test(src),
   '⑨번 — 프로 이용권으로 engine=pro 를 열어 본다 (마스터 10-22 13:00)');
ok(/0x20/.test(src) && /FLAG\.bundle/.test(src),
   '그 이용권이 **0x10|0x20** 을 든다 — 프로는 인터넷 번역을 포함한다');
ok(/pro_no_key/.test(src) && /pro_no_provider/.test(src),
   '`tier=basic` 일 때 **무엇을 넣어야 하는지** 화면에 적는다');

/* ── ⑤ 발급이 터지는 자리 (10-22 에 당했다) ── */
const custs = [...src.matchAll(/cust:\s*'([^']*)'/g)].map((m) => m[1]);
ok(custs.length >= 2 && custs.every((c) => c.length <= 6 && /^[\x20-\x7e]*$/.test(c)),
   `고객 칸이 전부 **ASCII 6자 이내** (${custs.join(', ')}) — 7자를 넣으면 발급이 터진다`);

/* ── ⑥ 비밀값을 쓰지 않는다 · 화면에 가려 찍는다 ── */
/* ★ 이름이 **나오는 것**과 **읽는 것**은 다르다 — 안내문은 「`wrangler secret put
   LLM_API_KEY` 하세요」라고 **말해야** 한다. 막을 것은 `process.env.<비밀값>` 처럼
   **값을 집는 자리**다(그러면 그 값이 이 세션·기록에 들어온다). */
const reads = [...src.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
const secretish = reads.filter((k) => /SECRET|PRIVATE|API_KEY|TOKEN|PASS/.test(k));
ok(secretish.length === 0,
   `비밀값을 **읽는** 자리가 없다 (읽는 환경값: ${reads.join(', ') || '없음'}) — 시험 키 0 의 씨앗은 공개값이다`);
ok(/mask\(/.test(src), '코드·토큰은 **가려서** 찍는다');

/* ── 되돌림 실증 (D-09) — 떨어짐을 떼면 낡은 Node 에서 **멈춘다** ── */
/* ★ 사본을 **저장소 밖**에 두면 상대 import(`../relay/tools/mint-code.mjs`)가 깨져
   `ERR_MODULE_NOT_FOUND` 로 죽는다 — 되돌림이 아니라 **시험이 틀린** 것이고, 그 꼴로
   한 번 붉었다. 그래서 **원본 옆**에 두고 끝나면 지운다. */
const patched = path.join(ROOT, 'scripts', '.prod-e2e-norescue.tmp.mjs');
/* 떨어짐 **한 자리만** 무력화한다 — 긴 꼴을 정규식으로 맞추려 하면 들여쓰기가 조금
   바뀌어도 조용히 안 바뀌고, 그러면 이 되돌림은 **빈 증거**가 된다(그렇게 한 번 붉었다). */
const RESCUE = "(await import('ws')).default";
ok(src.includes(RESCUE), `되돌릴 자리를 찾았다: ${RESCUE}`);
fs.writeFileSync(patched, src.replace(RESCUE, 'undefined'));
let revOut = '';
try {
  revOut = execFileSync(process.execPath, ['--input-type=module', '-e',
    `Object.defineProperty(globalThis,'WebSocket',{value:undefined,configurable:true});\nawait import(${JSON.stringify('file://' + patched)});`],
    { cwd: ROOT, env: { ...process.env, RELAY_URL: 'http://127.0.0.1:9' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
} catch (e) { revOut = String((e.stdout || '') + (e.stderr || '')); }
fs.unlinkSync(patched);
ok(/내장 WebSocket 이 없고/.test(revOut) && !/\[PASS\] 1 코드 발급/.test(revOut),
   '되돌림 실증: 떨어짐을 떼면 낡은 Node 에서 **첫 걸음도 못 간다** — 그래서 위 ②가 증거다');

console.log(`\n전부 통과 (${n}건)`);
