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
const KEYS = ['voice_absent_notice', 'voice_button', 'voice_pick_title', 'voice_none', 'voice_preview_text', 'anon_name'];
const want = [...new Set(langs.map(l => l.code.startsWith('zh') ? 'zh' : l.code))];
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };

console.log('=== 청취 페이지 손님 글자 사전 (키 6 × 언어 ' + want.length + ') ===');
// ① 키 여섯 × 언어 전부
for (const k of KEYS) {
  const item = dict.strings[k];
  assert(item, '사전에 키가 없다: ' + k);
  const miss = want.filter(l => !item[l] || !String(item[l]).trim());
  ok(miss.length === 0, `${k}: ${want.length}개 언어 전부 있다` + (miss.length ? ' — 빠짐 ' + miss.join(',') : ''));
}
// ② index.html 이 키를 쓴다
for (const k of KEYS) {
  const used = html.includes(`data-i18n="${k}"`) || html.includes(`t('${k}'`);
  ok(used, `index.html 이 ${k} 를 쓴다`);
}
// ③ 하드코딩이 남지 않았다 (손님이 보는 글자)
ok(!/myName \|\| '익명'/.test(html), "'익명' 하드코딩 없음 (anon_name)");
ok(!/SpeechSynthesisUtterance\('안녕하세요'\)/.test(html), "미리듣기 인사말 하드코딩 없음 (voice_preview_text — 그 언어로)");
ok(!/음성이 없어 자막으로만/.test(html), '음성 없음 안내 하드코딩 없음 (voice_absent_notice)');
ok(!/>사용 가능한 목소리가 없습니다/.test(html), "'사용 가능한 목소리가 없습니다' 하드코딩 없음 (voice_none)");
// ④ 되돌림 실증: 한 언어를 지우면 ① 이 붉는다
const copy = JSON.parse(JSON.stringify(dict.strings.voice_none)); delete copy.sw;
ok(want.some(l => !copy[l]), '되돌림 실증: voice_none.sw 를 지우면 ① 의 단언이 거짓이 된다');
console.log(`\n전부 통과 (${n}건)`);
