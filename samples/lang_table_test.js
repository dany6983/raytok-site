/* samples/lang_table_test.js — **자막 언어 표가 한 곳인가** (2026-10-19 · 10-20 갱신)
 *
 * 왜 있나: 강사 화면이 고른 언어로 문단을 미리 번역해 보내면, 손님 화면은 `line.tr[내 언어]` 를
 * **그대로** 찾는다. 두 표가 한 글자라도 다르면 그 언어 손님은 **영원히 원문만** 본다 —
 * 조용히. 2026-10-19 에 `zh`(강사) vs `zh-CN`(손님) 이 그 꼴이었고, 데모 그림을 찍다가 잡혔다.
 * 사람 조심으로 막을 일이 아니라서(§4: 값의 출처를 바꾸면 읽는 곳을 전부 센다) 표로 센다.
 *
 * 돌리기: node samples/lang_table_test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

console.log('=== 강사 표 ↔ 손님 표 (자막 언어 코드) ===\n');

const hostHtml = fs.readFileSync(path.join(ROOT, 'web', 'host', 'index.html'), 'utf-8');
const guestSrc = fs.readFileSync(path.join(ROOT, 'web', 'listener', 'index.src.html'), 'utf-8');

/** 강사 화면이 **보낼 수 있는** 언어 코드 */
function hostCodes(html) {
  const m = html.match(/SUPPORTED_TARGET_LANGS\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (!m) return null;
  return [...m[1].matchAll(/code:\s*'([a-zA-Z-]+)'/g)].map((x) => x[1]);
}
/**
 * 손님 **페이지에 박힌** 되돌림 목록 — 정본이 아니다.
 *
 * ★ 10-21: 전에는 이 함수가 읽는 것을 "손님 표"로 세었다. 그때는 82개가 페이지 안에도
 * 박혀 있었기 때문이다. 같은 표를 두 번 보내는 꼴이라 짧게 줄였고(`1aa25b1`), 그러자
 * 이 시험이 "손님 표가 69개 모자라다"고 붉어졌다 — **표가 아니라 시험이 가리키는 자리가
 * 틀린** 것이다(§4: 값의 출처를 바꾸면 읽는 곳을 전부 센다, 그 읽는 곳에 시험도 든다).
 * 손님 표의 정본은 `web/listener/langs.json` 이고, 아래에서 그것으로 센다.
 */
function guestFallbackCodes(html) {
  const m = html.match(/const FALLBACK_LANGS = \[([\s\S]*?)\];/);
  if (!m) return null;
  return [...new Set([...m[1].matchAll(/"code":"([a-zA-Z-]+)"/g)].map((x) => x[1]))];
}

const host = hostCodes(hostHtml);          // 박혀 있는 **되돌림용** 목록(정본을 못 읽을 때만 쓴다)
const guestFb = guestFallbackCodes(guestSrc);
const canon = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'listener', 'langs.json'), 'utf-8'));
ok(Array.isArray(host) && host.length > 0, `강사의 되돌림 목록을 읽었다 (${host.length}개)`);
ok(Array.isArray(guestFb) && guestFb.length > 0, `손님의 되돌림 목록을 읽었다 (${guestFb.length}개)`);
ok(Array.isArray(canon) && canon.length > 50, `정본 langs.json 을 읽었다 (${canon.length}개)`);

/* 두 화면이 **같은 한 파일**을 받는가 — 그것이 "표가 한 곳"의 뜻이다 */
ok(/await fetch\('\.\/langs\.json'\)/.test(guestSrc) && /langs = await res\.json\(\)/.test(guestSrc),
   '손님 화면도 정본 파일을 받아 **목록을 통째로 간다** — 페이지에 박힌 것을 쓰지 않는다');
ok(/langs_from=/.test(guestSrc),
   '받았나 못 받았나를 손님 쪽도 기록한다 (§20 빈 답)');
/* 박힌 목록이 다시 정본만큼 길어지면 **같은 표를 두 번 보내는** 것이다(첫 화면 gz 0.8 KB) */
ok(guestFb.length < canon.length / 2,
   `손님에 박힌 목록은 짧다 (${guestFb.length}개 < 정본 ${canon.length}개) — 표를 두 벌 보내지 않는다`);

/* ★ 10-20: 강사 화면이 **정본을 읽는다**. 아홉이 아니라 82 다(ko 는 원고 언어라 뺀다). */
ok(/const LANGS_URL = '\.\.\/listener\/langs\.json'/.test(hostHtml),
   '강사 화면이 손님 쪽 정본 파일을 가리킨다 — 표를 두 벌 들지 않는다(§4)');
/* ★ 10-22: 정본이 들어가는 칸은 **`allLangs` 하나**다. 말하는 언어 고르개는 그 통째 표를
   쓰고, 번역 대상(칩)은 거기서 **한 함수**(`syncTargetLangs`)로 갈린다 — 표가 두 벌이 되는
   것을 막는 것이 이 줄의 뜻이다(§4). 거르는 자리가 둘이 되면 아래 수가 2 가 되어 붉다. */
const allWrites = (hostHtml.match(/\ballLangs = (?!SUPPORTED_TARGET_LANGS)/g) || []).length;
const tgtWrites = (hostHtml.match(/\btargetLangs = (?!\[\];)/g) || []).length;
ok(/allLangs = rows/.test(hostHtml) && allWrites === 1 && tgtWrites === 1
   && /targetLangs = allLangs\.filter/.test(hostHtml) && /targetLangs\.forEach/.test(hostHtml),
   `읽은 정본을 **쓰는 칸**이 하나다 (allLangs ${allWrites}곳 → targetLangs ${tgtWrites}곳)`);
/* 고르개는 **통째 표**를 쓴다 — 칩 표(말하는 언어가 빠진 것)를 쓰면 자기 말을 못 고른다 */
ok(/function renderSrcLangSelect/.test(hostHtml)
   && /const rows = \(allLangs && allLangs\.length/.test(hostHtml),
   '말하는 언어 고르개는 통째 표(82)를 쓴다 — 칩 표가 아니다');
/* 고른 것은 말을 바꿔도 **지우지 않는다**(R-15) — 거르기는 쓰는 자리에서 한다 */
ok(/function activeTargets/.test(hostHtml)
   && /return \(selectedLangs \|\| \[\]\)\.filter/.test(hostHtml),
   '말을 바꿔도 고른 칩은 살아 있다 — 거르기는 activeTargets() 한 곳');
ok(/langs_src=builtin/.test(hostHtml),
   '못 읽으면 박힌 목록으로 서고 **왜 그랬는지 기록**한다 (§20 빈 답)');

const gset = new Set(canon.map((l) => l.code));   // 손님이 **고를 수 있는** 코드 = 정본
const orphan = host.filter((c) => !gset.has(c));
ok(orphan.length === 0,
   `강사 되돌림 목록의 코드도 전부 정본에 있다 (닿지 않는 코드: ${orphan.join(', ') || '없음'})`);
/* 손님 쪽 되돌림 목록도 센다 — 정본에 없는 코드로 서면, 받기가 뒤늦게 되는 순간
   고른 언어가 목록에서 사라져 **말없이 다른 언어**가 된다(§20: 모름을 없음으로 읽지 않는다). */
const fbOrphan = guestFb.filter((c) => !gset.has(c));
ok(fbOrphan.length === 0,
   `손님 되돌림 목록의 코드도 전부 정본에 있다 (닿지 않는 코드: ${fbOrphan.join(', ') || '없음'})`);

/* 상한 — 미리 번역은 언어마다 한 번 부르고 릴레이는 분당 60회다. 숫자를 코드에서 읽는다. */
const cap = Number((hostHtml.match(/MAX_SELECTED_LANGS = (\d+)/) || [])[1]);
ok(cap >= 10 && cap <= 60, `한 번에 고를 수 있는 언어 상한이 있다 (${cap}개 · 릴레이 분당 60회)`);
ok(/err_lang_cap/.test(hostHtml) && /alert\(T\('err_lang_cap'\)/.test(hostHtml),
   '상한에 닿으면 **막고 알린다** — 조용히 자르지 않는다(§20)');

/* 손님이 **그대로** 찾는지 — 느슨하게 찾았다면 위 단언이 덜 중요해진다. 코드를 보고 센다. */
ok(/line\.tr\[selectedLang\]/.test(guestSrc),
   '손님은 tr[내 언어] 를 **그대로** 찾는다 — 그래서 코드가 한 글자만 달라도 원문이 된다');

/* 되돌림 실증 (D-09) — 10-19 에 실제로 있던 그 값으로 되돌리면 잡히는가.
   글자를 바꾸는 것이 아니라 **같은 함수**에 되돌린 표를 넣어 센다. */
const reverted = hostHtml.replace(/code: 'zh-CN'/, "code: 'zh'");
ok(reverted !== hostHtml, '되돌린 본문이 실제로 달라졌다');
const revertedCodes = hostCodes(reverted);
ok(revertedCodes.includes('zh') && revertedCodes.filter((c) => !gset.has(c)).length === 1,
   "10-19 의 값('zh')으로 되돌리면 닿지 않는 코드가 1개로 잡힌다 (되돌림 실증)");

/* 되돌림 실증 ② — 손님 쪽도 같은 자리를 센다. 박힌 목록의 `zh-CN` 을 10-19 의 `zh` 로
   되돌리면 위 `fbOrphan` 단언이 잡는가. 잡지 않으면 그 초록은 정본을 읽은 결과가 아니다. */
const bentGuest = guestSrc.replace('"code":"zh-CN"', '"code":"zh"');
const bentFb = guestFallbackCodes(bentGuest);
ok(bentGuest !== guestSrc && bentFb.filter((c) => !gset.has(c)).length === 1,
   "손님 박힌 목록을 'zh' 로 되돌리면 닿지 않는 코드가 1개로 잡힌다 (되돌림 실증)");

/* ── 대표님 한 장이 **같은 아홉**을 적고 있나 ──────────────────────────────
   데모 때 그 한 장만 보신다. 거기 적힌 언어가 강사 표와 다르면 그 자리에서 원문이 나온다.
   이름으로 센다(코드가 아니라 사람이 읽는 말이 적혀 있다). */
const onePager = fs.readFileSync(path.join(ROOT, 'docs', 'demo-web-1119.md'), 'utf-8');
/* 한 장은 이제 "아홉" 이 아니라 **정본 개수와 상한**을 적는다. 숫자를 글로 적어 두면 낡으므로
   여기서 **코드·정본과 맞는지** 센다 — 10-19 에 "아홉" 이라 적었다가 10-20 에 틀린 말이 됐다. */
ok(onePager.includes(String(canon.length - 1)),
   `한 장이 고를 수 있는 언어 수(${canon.length - 1})를 적는다`);
ok(onePager.includes(String(cap)), `한 장이 한 번에 고를 수 있는 상한(${cap})을 적는다`);
ok(!/이 아홉 밖을 고르면 원문/.test(onePager), '한 장에 옛 "아홉" 줄이 남아 있지 않다');

/* 되돌림 실증 — 한 장의 숫자를 흔들면 위 단언이 잡는가 (파일은 안 건드린다) */
const bentDoc = onePager.split(String(canon.length - 1)).join('§옛숫자§');
ok(bentDoc !== onePager && !bentDoc.includes(String(canon.length - 1)),
   `한 장에서 그 숫자를 빼면 잡힌다 (되돌림 실증)`);

console.log(`\n${fail === 0 ? '전부 통과' : '붉다'} (${pass + fail}건${fail ? `, 실패 ${fail}` : ''})`);
process.exit(fail === 0 ? 0 : 1);
