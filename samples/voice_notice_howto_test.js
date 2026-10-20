// samples/voice_notice_howto_test.js — 음성 없음 띠는 **깔는 방법까지** 말한다
//
// 대표님 2026-10-20 실기: *"언어팩 까는 것도 없다"*. 전수 점검(scripts/listener-qa.mjs)에서
// 띠 문구를 직접 읽어 확인했다 — 그때 글은 이랬다:
//
//     "이 언어는 음성이 없어 자막만 나옵니다"
//
// **무엇이 없는지만 말하고 어떻게 하라는 말이 없다.** 띠가 떠도 손님은 할 일을 모른다.
// 그래서 81개 언어 전부에 "폰 설정에서 이 언어의 음성을 추가하면 들을 수 있습니다" 를 붙였다.
//
// 여기서 세는 것은 **빠진 칸이 없다**는 것이다 — 한 언어만 보면 나머지 80개가 빈 채로
// 통과한다(AGENTS §6: 언어 하나로 확인한 것은 확인이 아니다).
//
// 되돌려서 실패 확인(D-09): `ui-strings.json` 의 `voice_absent_notice` 에서 아무 언어의
// 뒷문장을 지우면 붉어진다.
//
// 돌리기: node samples/voice_notice_howto_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 음성 없음 띠: 깔는 방법까지 ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web/listener/ui-strings.json');
const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const notice = all.strings.voice_absent_notice;

const howto = all.strings.voice_absent_howto;
const langs = Object.keys(notice);
ok(langs.length >= 81, `"무엇이 없다" 가 ${langs.length}개 언어에 있다 (빈 목록은 늘 통과한다 — D-189)`);
ok(!!howto, '"어떻게 한다"(voice_absent_howto) 키가 있다');

/*
 * 뒷문장을 **제 키**로 둔 까닭이 여기다. 한 덩어리로 이어 붙였다면 "방법이 들었나" 를
 * 낱말이나 문장 수로 세야 하는데, 번역이 81가지라 둘 다 못 센다 — 태국어는 문장 끝에
 * 부호를 안 쓰고, 낱말로 가르면 §6(언어 이름이 분기에 나오면 잘못) 위반이다.
 * 키가 따로면 **있나 없나**만 세면 된다. 한 언어라도 빠지면 붉다.
 */
const miss = langs.filter((k) => !String(howto[k] || '').trim());
ok(miss.length === 0,
   `81개 언어 **모두** 방법 문장을 갖고 있다${miss.length ? ' — 빠진 언어: ' + miss.join(',') : ''}`);
ok(Object.keys(howto).length === langs.length,
   `두 키의 언어가 같다 (${Object.keys(howto).length} = ${langs.length}) — 한쪽만 늘면 띠가 반만 나온다`);

const tooShort = langs.filter((k) => String(howto[k]).trim().length < 12);
ok(tooShort.length === 0, `방법 문장이 자리만 채운 것이 없다${tooShort.length ? ' — ' + tooShort.join(',') : ''}`);

/* 화면이 두 키를 **둘 다** 쓰는가 — 사전에만 있고 안 쓰면 손님에겐 없는 것이다 */
const src = fs.readFileSync(path.join(ROOT, 'web/listener/index.src.html'), 'utf8');
/*
 * ★ **이름이 아니라 부르는 모양으로 센다.** 처음엔 `/voice_absent_howto/` 로 봤는데,
 * 바로 위 주석에 그 이름이 적혀 있어서 **코드를 지워도 통과했다** — 되돌림이 안 물었다.
 * 오늘 같은 함정에 세 번 걸렸다(앱 쪽 noLangNames·design1 도 같은 모양이다).
 */
ok(/t\(\s*['"]voice_absent_howto['"]/.test(src), '청취 화면이 voice_absent_howto 를 **부른다**');
ok(/t\(\s*['"]voice_absent_notice['"]/.test(src), '청취 화면이 voice_absent_notice 도 **부른다**');

/* 조각(손님 폰이 실제로 받는 것)에도 같이 들어갔나 — 원본만 고치면 폰은 옛 글을 받는다 */
const sliceDir = path.join(ROOT, 'web/listener/ui-strings');
const slices = fs.readdirSync(sliceDir).filter((f) => f.endsWith('.json'));
ok(slices.length >= 81, `조각 ${slices.length}개를 센다`);
const stale = [];
for (const f of slices) {
  const code = f.replace(/\.json$/, '');
  if (!notice[code]) continue;
  const one = JSON.parse(fs.readFileSync(path.join(sliceDir, f), 'utf8'));
  /* 조각은 손 표와 **같은 모양**이다: { 키: { 언어: 글 } } — 그 언어 칸을 꺼내 견준다 */
  const st1 = (one.strings || one);
  if (((st1.voice_absent_notice || {})[code]) !== notice[code]) stale.push(`${code}:notice`);
  if (((st1.voice_absent_howto || {})[code]) !== howto[code]) stale.push(`${code}:howto`);
}
ok(stale.length === 0,
   `조각이 원본과 같다 — 폰이 받는 글도 바뀌었다${stale.length ? ' — 낡은 조각: ' + stale.slice(0, 5).join(',') : ''}`);

/*
 * ⑨-1 **되돌림 실증** — 말로만 적지 않는다. 고침을 실제로 되돌려 위 단언이 붉은지 본다.
 * 되돌림의 뜻: 손 표에서 `voice_absent_howto` 를 통째로 뺀다 = 고치기 전의 모습
 * ("무엇이 없다"만 말하고 할 일을 안 말하던 그 띠).
 * 보는 값은 **제품 파일에서 읽은 것**(`all`)이지 이 블록이 지어낸 상수가 아니다.
 */
let revertFailed = false;
try {
  const before = JSON.parse(JSON.stringify(all.strings));
  delete before.voice_absent_howto;
  const h = before.voice_absent_howto || {};
  const gone = Object.keys(before.voice_absent_notice).filter((k) => !String(h[k] || '').trim());
  assert.strictEqual(gone.length, 0, '되돌리면 여기가 붉어야 한다 — 81개 전부 방법 문장을 잃는다');
} catch (e) { revertFailed = true; }
ok(revertFailed === true, '되돌리면 붉어진다 (방법 키를 빼면 81개 언어가 전부 빈손) — 되돌림 실증 1건');

console.log(`=== ${checks}/${checks} PASS ===`);
