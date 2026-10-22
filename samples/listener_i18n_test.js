/**
 * 청취 페이지 손님 글자 — 사전에 있나, 81개 언어가 다 있나 (마스터 10-14: "청취 페이지 손님 글자는 80언어 사전에").
 *
 * 4번(음성 없음 안내)·7번(익명)·8번(목소리 단추·제목·없음·미리듣기 인사말)의 키 여섯이
 * `web/listener/ui-strings.json` 에 있고, `langs.json` 의 언어 전부(zh-* 는 zh 하나)에 값이 있으며,
 * `index.html` 이 그 키를 실제로 쓴다(data-i18n 또는 t('키')). 하드코딩 한국어가 남으면 붉다.
 *
 * 되돌려서 실패 확인: ui-strings.json 에서 `voice_none.sw` 를 지우면 ① 이 붉다. index.html 의
 * `t('anon_name')` 을 '익명' 으로 되돌리면 ③ 이 붉다.
 */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf8'));
const langs = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/langs.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'web/listener/index.html'), 'utf8');
const KEYS = ['voice_absent_notice', 'voice_button', 'voice_pick_title', 'voice_none', 'voice_preview_text', 'anon_name',
  // ④ (10-14 11:10) 빈 방 문구 셋 · 글자 크기 넷
  'empty_waiting', 'empty_disconnected', 'empty_ended', 'font_size_label', 'font_small', 'font_medium', 'font_large',
  /* ⑤ (10-22 마스터 13:00) 정본 v1 로 생긴 글자 — 「번역 중」·「원문 보기」·「앱 같이 받기」.
     이 넷은 **번역이 아직일 때·원문을 숨겼을 때** 손님이 보는 글자다. 비면 그 자리에
     한국어가 남는다(§18 — 영어 폰에 한국어가 나오는 그 모양). */
  'badge_pending', 'badge_no_tr', 'btn_show_src', 'tr_server_btn', 'btn_get_pack', 'pack_optional'];
const want = [...new Set(langs.map(l => l.code.startsWith('zh') ? 'zh' : l.code))];
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };

console.log('=== 청취 페이지 손님 글자 사전 (키 ' + KEYS.length + ' × 언어 ' + want.length + ') ===');
// ① 키 여섯 × 언어 전부
for (const k of KEYS) {
  const item = dict.strings[k];
  assert(item, '사전에 키가 없다: ' + k);
  const miss = want.filter(l => !item[l] || !String(item[l]).trim());
  ok(miss.length === 0, `${k}: ${want.length}개 언어 전부 있다` + (miss.length ? ' — 빠짐 ' + miss.join(',') : ''));
}
// ② index.html 이 키를 쓴다
for (const k of KEYS) {
  const used = html.includes(`data-i18n="${k}"`) || html.includes(`data-i18n-aria="${k}"`) || html.includes(`t('${k}'`) || html.includes(`'${k}'`);
  ok(used, `index.html 이 ${k} 를 쓴다`);
}
// ③ 하드코딩이 남지 않았다 (손님이 보는 글자)
ok(!/myName \|\| '익명'/.test(html), "'익명' 하드코딩 없음 (anon_name)");
ok(!/SpeechSynthesisUtterance\('안녕하세요'\)/.test(html), "미리듣기 인사말 하드코딩 없음 (voice_preview_text — 그 언어로)");
ok(!/음성이 없어 자막으로만/.test(html), '음성 없음 안내 하드코딩 없음 (voice_absent_notice)');
ok(!/>사용 가능한 목소리가 없습니다/.test(html), "'사용 가능한 목소리가 없습니다' 하드코딩 없음 (voice_none)");
// ⑤ 모든 키 × 모든 언어 (마스터 10-14 ①: 기존 47키를 62언어에 채움) + 모양 검사
const EMO = /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\uFE0F]|•|※)+/u;
const shape = (s) => ({
  lead: (s.match(/^\s*/) || [''])[0], trail: (s.match(/\s*$/) || [''])[0],
  emo: (s.match(EMO) || [''])[0].replace(/\uFE0F/g, ''),
  txt: /\(TXT\)/.test(s), six: /6/.test(s), colon: /[:：៖]\s*$/.test(s),
});
/* ★ 79언어를 기다리는 키 — **ko·en 만** 들어온 자리 (마스터 2026-10-16 21:35 ⓐ).
 *
 * B 12 에서 청취 화면의 손님 글자 **열 곳**이 사전을 아예 안 거치는 것을 찾았다 — 그래서
 * 영어뿐 아니라 **81개 언어 전부에서 한국어**로 나왔다. B 가 ko·en 을 넣고 마크업까지 이었고,
 * 나머지 79언어는 **A2 몫**이다(앱 MASTER). 제가 지어내면 "다 찼다"로 보이는 가짜가 된다(D-11).
 *
 * 이 목록은 **비어야 맞다.** A2 커밋이 오면 그 키를 여기서 지운다 — 안 지우면 아래 ⑥ 이 붉다.
 *
 * **2026-10-17 A2: 다 채웠다.** 열 중 일곱(save_content·both·src·trans·format·do·close)은
 * 앱이 이미 81언어로 갖고 있던 말이라 `src/i18n-auto` 에서 가져왔다 — 같은 말을 두 번
 * 번역하지 않는다(D-193). 앱 키는 reportContent·reportContentBoth/Src/Trans·reportFormat·
 * termSave·close 이고 ①②③ 은 청취 화면이 붙이는 번호라 앞에 다시 붙였다. 청취의 zh 는
 * 간체 하나뿐이라 앱의 zh-CN 을 썼다. 나머지 셋(save_title·foot_privacy·foot_terms)만 손으로 썼다.
 */
const AWAIT_A2 = [];   /* 2026-10-17 A2 가 열 키 × 79언어를 채웠다 — 비었다 = 다 끝났다(ⓒ) */

const allKeys = Object.keys(dict.strings);
const fullKeys = allKeys.filter(k => !AWAIT_A2.includes(k));
let bad = [];
for (const k of fullKeys) {
  const en = dict.strings[k].en; const se = shape(en);
  for (const l of dict.langs) {
    const v = dict.strings[k][l];
    if (v == null || !String(v).trim()) { bad.push(`${k}.${l}: 비었다`); continue; }
    if (/[<>]/.test(v)) bad.push(`${k}.${l}: HTML 꺾쇠`);
    if (/\$\{|\{\d\}/.test(v)) bad.push(`${k}.${l}: 자리표가 생겼다`);
    if ((v.match(/"/g) || []).length % 2) bad.push(`${k}.${l}: 따옴표 홀수`);
    const sv = shape(v);
    if (sv.lead !== se.lead || sv.trail !== se.trail) bad.push(`${k}.${l}: 앞뒤 빈칸이 en 과 다르다`);
    if (sv.emo !== se.emo) bad.push(`${k}.${l}: 머리 기호(🔊✋•※)가 en 과 다르다`);
    if (sv.txt !== se.txt) bad.push(`${k}.${l}: (TXT) 유무가 en 과 다르다`);
    if (se.six && !sv.six && !/[६৬૬୬௬౬೬൬๖໖၆۶٦៦]/.test(v)) bad.push(`${k}.${l}: 숫자 6 이 빠졌다`);
    if (se.colon && !sv.colon) bad.push(`${k}.${l}: 끝 콜론이 빠졌다`);
  }
}
ok(dict.langs.length >= 80, `사전 langs 가 ${dict.langs.length}개 (80 이상)`);
ok(fullKeys.length * dict.langs.length > 4000, `키 ${fullKeys.length} × 언어 ${dict.langs.length} = ${fullKeys.length * dict.langs.length} 칸이 다 찼다`);

/* ── ⑥ 예외 목록이 썩지 않게 ──
   ⓐ 목록에 적힌 키는 ko·en 이 **반드시** 있어야 한다(그래야 영어 폰이 한국어를 안 본다).
   ⓑ 81언어가 다 찬 키가 목록에 남아 있으면 붉다 — A2 가 채웠는데 안 지운 것이다.
   ⓒ 목록이 비면 이 줄들은 저절로 통과한다 = 다 끝났다는 뜻. */
for (const k of AWAIT_A2) {
  const item = dict.strings[k];
  ok(item && item.ko && item.en, `${k}: 79언어를 기다리는 동안에도 ko·en 은 있다`);
}
const paid = AWAIT_A2.filter(k => {
  const item = dict.strings[k] || {};
  return want.every(l => item[l] && String(item[l]).trim());
});
ok(paid.length === 0,
   paid.length === 0
     ? `79언어 대기 ${AWAIT_A2.length}개 (A2 몫) · 이미 찬 것 0`
     : `A2 가 채웠으면 AWAIT_A2 에서 지워라: ${paid.join(', ')}`);
ok(AWAIT_A2.every(k => html.includes(`data-i18n="${k}"`)),
   '대기 중인 키도 **마크업에 이어져 있다** — 사전에만 있고 화면이 안 쓰면 아무 뜻이 없다');
ok(bad.length === 0, '모양 검사(빈칸·꺾쇠·자리표·따옴표·앞뒤 빈칸·머리 기호·(TXT)·6·콜론) 0건' + (bad.length ? '\n    ' + bad.slice(0, 20).join('\n    ') : ''));
// 되돌림 실증: 끝 빈칸을 지운 값은 걸린다
ok(shape('Connection rejected:').trail !== shape(dict.strings.alert_rejected.en).trail, '되돌림 실증: alert_rejected 의 끝 빈칸을 지우면 모양 검사가 붉다');

// ④ 되돌림 실증: 한 언어를 지우면 ① 이 붉는다
const copy = JSON.parse(JSON.stringify(dict.strings.voice_none)); delete copy.sw;
ok(want.some(l => !copy[l]), '되돌림 실증: voice_none.sw 를 지우면 ① 의 단언이 거짓이 된다');
console.log(`\n전부 통과 (${n}건)`);
