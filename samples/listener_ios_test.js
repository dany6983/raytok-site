/**
 * 손님 청취 화면 — **아이폰 사파리에서 끝까지** (앱 MASTER 10-19 20:35 A2-1).
 *
 * ★ 이 시험이 **재지 못하는 것**부터 적는다 (D-11 — 가짜가 실기와 다르면 안 된다):
 * 이 컨테이너에는 **웹킷이 없다**(`cdn.playwright.dev` 가 네트워크 정책에 막혀 있다).
 * 그래서 여기서 도는 것은 **크로미움**이고, 사파리 **엔진**이 하는 일은 증명하지 못한다.
 * 대신 사파리에서만 깨지는 **자리**를 소스에서 센다 — 눈으로 훑는 것보다 이쪽이 안 놓친다.
 * 웹킷이 열리면 ①②를 실제 기기 꼴(iPhone 13 + webkit)로 한 번 더 돈다.
 */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const SRC = fs.readFileSync(path.join(ROOT, 'web/listener/index.src.html'), 'utf8');
const OUT = fs.readFileSync(path.join(ROOT, 'web/listener/index.html'), 'utf8');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };

console.log('=== 청취 화면 · 아이폰 사파리 자리 ===');

/* ── ① 높이: 아이폰 사파리는 `100vh` 가 보이는 높이보다 크다 (아래 막대가 덮는다) ──
   손으로 목록을 적지 않는다 — **세서** 짝 없는 것을 찾는다. 새 규칙이 생겨도 걸린다. */
const vhRules = [];
for (const m of SRC.matchAll(/^[^\n]*\b(?:min-)?height:\s*100vh[^\n]*$/gm)) vhRules.push(m[0].trim());
ok(vhRules.length > 0, `화면 높이를 정하는 줄이 ${vhRules.length}개 있다 (빈 목록은 늘 통과한다 — D-189)`);
const lonely = vhRules.filter((line) => !/100dvh/.test(line));
ok(lonely.length === 0,
   '100vh 를 쓰는 줄은 **전부** 같은 줄에 100dvh 짝이 있다'
   + (lonely.length ? '\n    짝 없는 줄:\n      ' + lonely.join('\n      ') : ''));

/* ── ② 노치: 바닥에 붙는 막대는 홈 인디케이터 자리를 비운다 ── */
const bottomBars = [];
for (const m of SRC.matchAll(/^[^\n]*position:\s*fixed[^\n]*bottom:\s*0[^\n]*$/gm)) bottomBars.push(m[0].trim());
ok(bottomBars.length > 0, `바닥에 붙는 막대가 ${bottomBars.length}개 있다`);
const noSafe = bottomBars.filter((line) => !/safe-area-inset-bottom/.test(line));
ok(noSafe.length === 0,
   '바닥 막대는 전부 env(safe-area-inset-bottom) 을 둔다'
   + (noSafe.length ? '\n    안 둔 줄:\n      ' + noSafe.join('\n      ') : ''));

/* ── ③ 소리 문 둘: 아이폰은 **사람 손짓 안에서만** 열어 준다. 둘은 **다른 문**이다 ──
   `<audio>` 를 열어도 speechSynthesis 는 안 열린다 — 하나만 하면 자막은 나오고 소리는 안 난다. */
const joinBlock = (SRC.match(/btnJoin\.addEventListener\('click',[\s\S]{0,600}/) || [''])[0];
ok(/speechSynthesis\.speak\(/.test(joinBlock),
   '「참여하기」 손짓 안에서 speechSynthesis 를 깨운다 (빈 말 한 번)');
ok(/bgAudioUnlock\(\)/.test(joinBlock),
   '같은 손짓 안에서 소리 세션도 연다 (무음 오디오)');

/* ── ④ 되붙기: 아이폰은 화면을 끄면 소켓을 끊는다. 돌아왔을 때 스스로 붙어야 한다 ── */
ok(/visibilitychange/.test(SRC) && /readyState !== WebSocket\.OPEN[\s\S]{0,200}connect\(\)/.test(SRC),
   '화면이 돌아오면 소켓이 끊겼는지 보고 다시 붙는다');
ok(/resume_from/.test(SRC) && /raytok_last_seq_/.test(SRC),
   '다시 붙을 때 **받던 자리부터** 이어 받는다 — 끊긴 동안의 줄을 잃지 않는다 (R-15)');

/* ── ⑤ 사파리에서만 터지는 글 ── */
ok(!/new Date\(\s*['"`]\d{4}-\d{2}-\d{2} /.test(SRC),
   "new Date('YYYY-MM-DD HH:mm') 가 없다 — 사파리는 그 꼴을 Invalid Date 로 읽는다");
ok(!/\(\?<[=!]/.test(SRC),
   '정규식 lookbehind 가 없다 — 사파리 16.4 미만이 통째로 죽는다');

/* ── ⑥ 만든 판에도 그대로 들어갔나 — 손님이 받는 것은 index.html 이다 ── */
ok(/100dvh/.test(OUT), '만든 index.html 에도 100dvh 가 있다 (빌더를 다시 돌렸다)');
ok(/safe-area-inset-bottom/.test(OUT), '만든 index.html 에도 safe-area-inset-bottom 이 있다');

/* ── 되돌림 실증 (D-09) — 잣대가 살아 있나 ── */
ok(['height: 100vh; overflow: hidden;'].every((s) => !/100dvh/.test(s)),
   '되돌림 실증: 100dvh 짝을 떼면 ①의 걸러내기가 그 줄을 잡는다');
ok(!/safe-area-inset-bottom/.test('position: fixed; left: 0; right: 0; bottom: 0;'),
   '되돌림 실증: safe-area 를 떼면 ②의 걸러내기가 그 줄을 잡는다');

console.log(`\n전부 통과 (${n}건)`);
