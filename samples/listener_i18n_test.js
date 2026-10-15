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
  'empty_waiting', 'empty_disconnected', 'empty_ended', 'font_size_label', 'font_small', 'font_medium', 'font_large'];
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
const allKeys = Object.keys(dict.strings);
let bad = [];
for (const k of allKeys) {
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
ok(allKeys.length * dict.langs.length > 4000, `키 ${allKeys.length} × 언어 ${dict.langs.length} = ${allKeys.length * dict.langs.length} 칸이 다 찼다`);
ok(bad.length === 0, '모양 검사(빈칸·꺾쇠·자리표·따옴표·앞뒤 빈칸·머리 기호·(TXT)·6·콜론) 0건' + (bad.length ? '\n    ' + bad.slice(0, 20).join('\n    ') : ''));
// 되돌림 실증: 끝 빈칸을 지운 값은 걸린다
ok(shape('Connection rejected:').trail !== shape(dict.strings.alert_rejected.en).trail, '되돌림 실증: alert_rejected 의 끝 빈칸을 지우면 모양 검사가 붉다');

// ④ 되돌림 실증: 한 언어를 지우면 ① 이 붉는다
const copy = JSON.parse(JSON.stringify(dict.strings.voice_none)); delete copy.sw;
ok(want.some(l => !copy[l]), '되돌림 실증: voice_none.sw 를 지우면 ① 의 단언이 거짓이 된다');
console.log(`\n전부 통과 (${n}건)`);
