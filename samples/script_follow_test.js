/**
 * 원고 따라가기 — **공용 사례 표**로 웹 구현을 센다 (마스터 2026-10-20 02:45 판정 ⓐ).
 *
 * 표: `samples/script-follow-cases.json` — 앱 저장소 `docs/samples/script-follow-cases.json`
 * 과 **같은 파일**이다. 설계·문턱 값의 원본은 앱 `docs/design/script-follow.md` 한 곳.
 *
 * 왜: 같은 질문을 두 저장소가 각자 구현한다(코드를 공유할 수 없다). 표가 둘을 묶는다 —
 * 한쪽만 고치면 그쪽이 붉어진다. 그것이 이 시험의 목적이다.
 *
 * 또 센다: 호스트 화면이 **그 판정을 실제로 쓰는지**(원고를 읽는 중이면 맞는 말을
 * 보내지 않는지). 모듈만 맞고 화면이 안 쓰면 손님에게는 여전히 두 번 간다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'samples/script-follow-cases.json'), 'utf8'));
const F = require(path.join(ROOT, 'web/common/script-follow.js'));

let fail = 0;
const ok = (cond, msg) => { if (cond) { console.log('  ✓ ' + msg); } else { fail += 1; console.log('  ✗ ' + msg); } };

console.log('[1] 표가 비어 있지 않다 (빈 표는 통과로 보인다)');
ok(Array.isArray(TABLE.cases) && TABLE.cases.length >= 10, `사례 ${TABLE.cases.length}개`);
for (const tag of ['ko', 'en', 'zh', 'ja', 'th', 'ru']) {
  ok(TABLE.cases.some((c) => String(c.name).startsWith(tag)), `${tag} 사례가 있다 (글자 체계를 돈다)`);
}

console.log('[2] 사례마다 앱과 같은 답인가 — off (보낼 것인가)');
for (const c of TABLE.cases) {
  const r = F.offScript(c.state, c.heard, c.paras);
  ok(r.off === c.want.off, `${c.name} → off=${r.off} (why=${r.why}, match=${r.match.toFixed(2)})`);
}

console.log('[3] 호스트 화면이 그 판정을 쓴다');
const host = fs.readFileSync(path.join(ROOT, 'web/host/index.html'), 'utf8');
ok(host.includes('web/common/script-follow.js'), '모듈을 불러온다');
ok(/rtScriptFollow/.test(host), 'rtScriptFollow 를 부른다');
/*
 * ⚠ 확정 줄을 보내는 자리는 **하나**여야 한다 — 둘이 되면 한 곳만 고쳐진다.
 * 그 자리에서 원고 판정을 거친다(아래 문구가 바뀌면 이 줄도 같이 고친다).
 */
const sends = host.match(/sendSpokenLine\(/g) || [];
/*
 * 둘이다: **정의** 하나와 **부르는 곳**(인식 확정 줄) 하나. 디버그 칸의
 * `send: sendSpokenLine` 은 괄호가 없어 세지 않는다 — 처음에 셋으로 썼다가
 * 내 기대가 틀린 것을 돌려 보고 알았다(코드는 맞았다).
 */
ok(sends.length === 2, `sendSpokenLine 자리 ${sends.length}개 (정의 1 · 부르는 곳 1)`);
ok(/scriptOffScript\(|offScript\(/.test(host), '보내기 전에 원고 밖인지 묻는다');

/*
 * [4] **되돌림 실증** — 문턱을 없애면(= 모든 말이 "원고와 맞는다") 공용 표가 붉어야 한다.
 *
 * 되돌리는 것은 **제품의 값**이다: 모듈의 문턱을 0 으로 낮춰 그대로 돌린다. 그러면
 * "원고 밖"이어야 하는 사례가 off=false 로 나오고, 어긋난 수는 **제품이 만든 수**다
 * (시험 안에서 만든 상수를 견주는 ⑨-1 의 그 꼴이 아니다).
 */
console.log('[4] 되돌림 실증 — 문턱을 없애면 표가 붉다');
let revertFailed = false;
let disagreeN = 0;
try {
  const dead = { next: 0, tailFrac: F.FOLLOW.tailFrac, break: 0, breakRun: 99, resume: 0 };
  disagreeN = TABLE.cases.filter((c) => F.offScript(c.state, c.heard, c.paras, dead).off !== c.want.off).length;
  assert.strictEqual(disagreeN, 0, '문턱을 없애도 표가 다 맞는다면 이 표는 아무것도 지키지 않는다');
} catch (e) { revertFailed = true; }
ok(revertFailed && disagreeN > 0,
   `되돌림 실증 완료 — 문턱을 없애면 ${disagreeN}건이 표와 어긋난다 (지금은 0건)`);

console.log(fail ? `\n✗ ${fail}개 실패` : '\n✓ 전부 통과');
process.exit(fail ? 1 : 0);
