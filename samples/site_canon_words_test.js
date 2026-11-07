// samples/site_canon_words_test.js — 쪽 글자 ↔ 정본 금지어 대조 (2026-11-07 신설)
//
// 왜 새로 만들었나
//   `site_wording_test.js` 는 금지어를 **손으로 적은 정규식 하나**로만 봤다. 「인터넷 없이」 한 낱말이다.
//   그래서 정본 `marketing/products/_common-forbidden.json` 의 **words 32개를 44쪽 어디서도 안 보고 있었다.**
//   「초록」이 「봤다」는 뜻이 아니었다 — 그 시험은 그 32개를 **세지도 않았다.**
//
// 왜 아무도 정본을 안 걸었나 (이게 핵심이다)
//   HTML 을 통째로 `includes()` 하면 **쓸 수 없다.** 실측: 걸림 64건 / 진짜 0건.
//   `style="width:100%"` 가 56건 · 「유일한」은 **HTML 주석 안의 코드 설명** · 나머지가 Dolby 다.
//   **HTML 은 글이 아니다.** 주석·`<style>`·`<script>`·태그 속성을 떼고 **손님이 읽는 글자만** 남겨야 센다.
//   떼고 나니 64 → 2건이 됐다.
//
// words / notice 를 가른다 (정본이 가르고 있다)
//   `words` = 막는다(붉다) · `notice` = 막지 않고 통지만 한다(10-26 해제분). 한 덩어리로 막으면 시험이 정본보다 세진다.
//   (smartever 실측: `marketing/lib/check.mjs` 도 이 두 칸을 가른다. 시험만 안 가르고 있었다.)
//
// 돌리기: node samples/site_canon_words_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 쪽 글자 ↔ 정본 금지어 대조 (words 막음 · notice 통지) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };
const ROOT = path.join(__dirname, '..');
const CANON = JSON.parse(fs.readFileSync(path.join(ROOT, 'marketing/products/_common-forbidden.json'), 'utf-8'));

// 쪽 목록은 손으로 적지 않는다 — 걸어 찾는다 (11-07 네 자리에서 같은 병을 찾았다)
const walkHtml = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return (e.name === 'node_modules' || e.name === '.git') ? [] : walkHtml(full, base);
  return e.name === 'index.html' ? [path.relative(base, full).split(path.sep).join('/')] : [];
});
const PAGES = walkHtml(ROOT).sort();

// 손님이 실제로 읽는 글자만 남긴다
const visible = (h) => h
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ');

/* ★ 면제는 **낱말이 아니라 뜻**에 건다. 그리고 매번 찍는다 — 조용히 늘어나면 그물이 풀린다.
 *   Dolby: 정본이 막는 것은 「돌비 사운드 탑재」 같은 **제품 주장**이다.
 *   걸린 두 쪽은 **손님 폰의 Dolby Atmos 를 끄라는 안내**다(켜져 있으면 좌우 소리가 안 갈린다).
 *   주장의 반대말이라 빼면 손님이 손해를 본다. 그래서 「끄라는 꼴일 때만」 면제한다. */
const EXEMPT = [
  { word: 'Dolby', why: '손님 폰 Dolby Atmos 끄기 안내(제품 주장 아님)',
    sense: /Dolby Atmos(?:를)?\s*(?:끄|끔)|turn off Dolby Atmos|Dolby Atmos and Mono Audio are disabled|Dolby Atmos 및 모노 오디오 설정을 끕/i },
];
const exemptOk = (word, text) => {
  const e = EXEMPT.find((x) => x.word === word);
  if (!e) return false;
  // 그 쪽에서 낱말이 나온 **모든** 자리가 면제 꼴 안에 있어야 면제다
  const senses = (text.match(new RegExp(e.sense.source, 'gi')) || []).join(' ');
  const total = (text.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
  const inSense = (senses.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
  return total > 0 && total === inSense;
};

const bad = [];
const exempted = [];
const noticed = [];
for (const rel of PAGES) {
  const t = visible(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
  for (const w of CANON.words) {
    if (!t.includes(w)) continue;
    if (exemptOk(w, t)) { exempted.push(`${rel}: ${w}`); continue; }
    bad.push(`${rel}: ${w}`);
    console.log(`  [FAIL] 정본 words 걸림 — ${rel}: 「${w}」`);
  }
  for (const w of CANON.notice) if (t.includes(w)) noticed.push(`${rel}: ${w}`);
}

ok(PAGES.length >= 40, `쪽 ${PAGES.length}개를 걸어 찾았다 (손목록 아님)`);
ok(CANON.words.length > 0 && CANON.notice.length > 0,
   `정본을 읽었다 — words ${CANON.words.length}개 · notice ${CANON.notice.length}개`);
ok(bad.length === 0, `정본 words ${CANON.words.length}개 × ${PAGES.length}쪽 — 걸린 것 0 (${bad.join(' / ') || '없음'})`);

// 면제는 숨지 않는다
console.log(`  [면제] ${exempted.length}건 — ${exempted.join(' / ') || '없음'}`);
for (const e of EXEMPT) console.log(`         · ${e.word}: ${e.why}`);
ok(exempted.length <= 2, `면제 ${exempted.length}건 — 두 건을 넘으면 그물이 풀리는 것이니 사람이 본다`);

// notice 는 막지 않는다. 통지만 한다 (정본이 그렇게 가른다)
console.log(`  [통지] notice ${noticed.length}건 — ${noticed.join(' / ') || '없음'}`);
ok(true, `notice 는 붉히지 않는다 — 정본에서 막는 칸이 아니다 (${noticed.length}건 통지)`);

/* ★ 이 그물이 **못 보는 쪽**을 매번 찍는다 (2026-11-07 smartever 와 서로 같은 구멍을 찾았다)
 *   정본 words 32개 중 **30개가 한국어 낱말**이다(비한글은 Dolby·100% 둘뿐).
 *   그래서 **외국어판은 걸림이 구조적으로 0** 이다 — 「깨끗하다」가 아니라 **「안 봤다」**다.
 *   초록 안에 이 숫자가 숨으면 다음 사람이 「다 봤다」고 읽는다. 그래서 찍는다.
 *   고치는 길은 **정본에 영어 꼴을 넣는 것**이고, 정본은 터치톡과 공용이라 대표님 판정 몫이다 — 시험이 몰래 손대지 않는다. */
const krWord = (w) => /[가-힣]/.test(w);
const KR_ONLY = CANON.words.filter(krWord);
const blind = [];
for (const rel of PAGES) {
  const t = visible(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
  const hangul = (t.match(/[가-힣]/g) || []).length;
  const letters = (t.match(/[가-힣A-Za-z\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
  if (letters && hangul / letters < 0.05) blind.push(rel);
}
console.log(`  [못 봄] 외국어판 ${blind.length}쪽 — 한국어 낱말 ${KR_ONLY.length}개로는 걸림이 구조적으로 0`);
for (const b of blind) console.log(`         · ${b}`);
console.log(`         비한글 낱말은 ${CANON.words.filter((w) => !krWord(w)).join('·')} 둘뿐 — 이 둘만 외국어판을 본다`);
ok(blind.length > 0 ? KR_ONLY.length > 0 : true,
   `외국어판 ${blind.length}쪽 / 전체 ${PAGES.length}쪽 — 이 ${blind.length}쪽의 초록은 「깨끗함」이 아니라 「안 봄」이다 (정본에 영어 꼴 없음 · 대표님 판정 대기)`);

// 되돌림 실증 — 진짜 주장을 넣으면 붉어야 한다
{
  const probe = (html, word) => {
    const t = visible(html);
    return t.includes(word) && !exemptOk(word, t);
  };
  ok(probe('<p>돌비 사운드를 탑재했습니다</p>', '돌비'),
     '되돌림 실증 ①: 「돌비 사운드 탑재」 주장을 넣으면 붉다');
  ok(probe('<p>Dolby Atmos 음질을 지원합니다</p>', 'Dolby'),
     '되돌림 실증 ②: 끄기 안내가 아닌 Dolby 주장은 면제되지 않는다');
  ok(!probe('<li>삼성 폰은 Dolby Atmos를 끄세요</li>', 'Dolby'),
     '되돌림 실증 ③: 끄기 안내는 면제된다');
  ok(probe('<p style="width:100%">세계 최초 100% 완벽한 번역</p>', '세계 최초'),
     '되돌림 실증 ④: 글에 든 「세계 최초」는 붉다 (CSS 100% 는 안 센다)');
  ok(!probe('<div style="width:100%"><!-- 유일한 자리다 --></div>', '100%'),
     '되돌림 실증 ⑤: `style="width:100%"` 와 주석은 글이 아니다 — 안 센다');
}

console.log(`\n전부 통과 (${checks}건)`);
