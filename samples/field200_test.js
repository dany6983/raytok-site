// samples/field200_test.js — 엔진 평가용 현장 문장 200 (B 27·B 28, 2026-10-17)
//
// 이 표는 **엔진 점수의 근거**다(설계 raytok-engine/docs/design/langpack-v1.md §목적:
// "우리 현장 문장"으로 ML Kit 과 나란히 잰다). 표가 조용히 망가지면 그 점수가 거짓이 된다 —
// 줄이 하나 빠지거나, 영어 쪽 순서가 한 줄 밀리거나, 탭이 섞여 칸이 셋이 되면.
// 그래서 **기계가 센다.**
//
// 돌리기: node samples/field200_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 현장 문장 200 (ko / en 기준) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const KO = path.join(ROOT, 'docs/eval/field-ko-200.tsv');
const EN = path.join(ROOT, 'docs/eval/field-en-200.tsv');
const WANT = { 안전교육: 80, 가이드박물관: 60, 강의: 60 };

function load(p) {
  const raw = fs.readFileSync(p, 'utf-8');
  const head = raw.split('\n').filter((l) => l.startsWith('#'));
  const rows = raw.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return { raw, head, rows };
}

ok(fs.existsSync(KO), 'docs/eval/field-ko-200.tsv 가 있다');
ok(fs.existsSync(EN), 'docs/eval/field-en-200.tsv 가 있다');
const ko = load(KO), en = load(EN);

/* ① 수 — 200 이고 분야가 80·60·60 이다 */
for (const [name, f] of [['ko', ko], ['en', en]]) {
  ok(f.rows.length === 200, `${name}: 줄 200개 (${f.rows.length})`);
  const cnt = {};
  for (const r of f.rows) { const k = r.split('\t')[0]; cnt[k] = (cnt[k] || 0) + 1; }
  for (const [field, n] of Object.entries(WANT)) {
    ok(cnt[field] === n, `${name}: ${field} ${n}개 (${cnt[field] || 0})`);
  }
  ok(Object.keys(cnt).length === 3, `${name}: 분야 꼬리표가 셋뿐이다 (${Object.keys(cnt).join(',')})`);
  const badCols = f.rows.filter((r) => r.split('\t').length !== 2);
  ok(badCols.length === 0, `${name}: 칸이 둘 아닌 줄 0 (문장 안에 탭이 섞이면 점수가 밀린다)`);
}

/* ② ko·en 이 **같은 순서**다 — 한 줄만 밀려도 모든 점수가 거짓이 된다.
   재는 함수를 **바깥에 두고** 실제 줄과 밀어 본 줄에 같은 함수를 쓴다(⑧ 되돌림이 이 함수를 본다). */
const fieldMismatch = (rows) => {
  const bad = [];
  for (let i = 0; i < Math.min(ko.rows.length, rows.length); i++) {
    if (ko.rows[i].split('\t')[0] !== rows[i].split('\t')[0]) bad.push(i + 1);
  }
  return bad;
};
ok(fieldMismatch(en.rows).length === 0,
   `ko·en 분야 꼬리표가 줄마다 같다 (어긋난 줄 ${fieldMismatch(en.rows).join(',') || '없음'})`);

/* ②-2 ★ 꼬리표만으로는 **묶음 안에서 한 줄 밀린 것**을 못 잡는다(안전교육 80줄은 꼬리표가 같다).
   그래서 **숫자 지문**으로 줄마다 맞춘다: ko 에 숫자가 있으면 en 같은 줄에도 그 숫자가 있어야 한다.
   지금 잰 값은 93%(55/59)다 — 안 맞는 넷은 단위를 바꿔 옮긴 줄이다(120억 → 12 billion 꼴).
   한 줄만 밀면 이 값이 3% 로 떨어진다. 그래서 문턱을 80% 로 둔다(잰 값에서 여유를 두고). */
const digitsOf = (row) => new Set((row.split('\t')[1].replace(/,/g, '').match(/\d+/g) || []));
const numberAligned = (rows) => {
  let has = 0, hit = 0;
  for (let i = 0; i < Math.min(ko.rows.length, rows.length); i++) {
    const a = digitsOf(ko.rows[i]);
    if (!a.size) continue;
    has += 1;
    const b = digitsOf(rows[i]);
    if ([...a].some((n) => b.has(n))) hit += 1;
  }
  return { has, hit, pct: has ? Math.round((hit / has) * 100) : 0 };
};
const alignNow = numberAligned(en.rows);
ok(alignNow.pct >= 80,
   `숫자 지문이 줄마다 맞는다 ${alignNow.hit}/${alignNow.has} (${alignNow.pct}%) ≥ 80%`);

/* ③ 글자 — ko 는 한국어, en 은 한글 0 */
const koSents = ko.rows.map((r) => r.split('\t')[1]);
const enSents = en.rows.map((r) => r.split('\t')[1]);
ok(koSents.every((s) => /[가-힣]/.test(s)), 'ko: 모든 줄에 한글이 있다');
const hangulInEn = enSents.filter((s) => /[가-힣]/.test(s));
ok(hangulInEn.length === 0, `en: 한글이 남은 줄 0 (${hangulInEn.slice(0, 1).join('') || '없음'})`);
ok(enSents.every((s) => /[A-Za-z]/.test(s)), 'en: 모든 줄에 영문이 있다');

/* ④ 중복 0 — 같은 문장을 두 번 재면 그 문장에 가중치가 두 배로 붙는다 */
for (const [name, list] of [['ko', koSents], ['en', enSents]]) {
  ok(new Set(list).size === list.length,
     `${name}: 같은 문장이 두 번 있지 않다 (${list.length - new Set(list).size}건)`);
}

/* ⑤ 현장스러움 — 숫자와 현장 용어가 실제로 섞여 있는가(설계가 요구한 것) */
const withNum = koSents.filter((s) => /\d/.test(s)).length;
ok(withNum >= 40, `ko: 숫자가 든 줄 ${withNum}개 (숫자 오역이 가장 비싼 오류다)`);
const TERMS = ['비계', '개구부', 'TBM', '안전대', '밀폐공간', '지게차', '분전반', '와이어로프'];
const hit = TERMS.filter((t) => koSents.some((s) => s.includes(t)));
ok(hit.length >= 6, `ko: 현장 용어가 들어 있다 (${hit.join('·')})`);
const PROPER = ['경복궁', '광화문', '불국사', '남이섬', '성산일출봉', '광장시장'];
ok(PROPER.filter((t) => koSents.some((s) => s.includes(t))).length >= 4,
   'ko: 고유명사가 들어 있다 (음역이 되는지 보는 자리)');

/* ⑥ 길이 — 한 줄이 너무 길면 자막 한 줄로 안 들어가고, 너무 짧으면 번역 품질이 안 갈린다 */
const tooShort = koSents.filter((s) => s.length < 10);
const tooLong = koSents.filter((s) => s.length > 120);
ok(tooShort.length === 0, `ko: 10자 미만 0 (${tooShort.length})`);
ok(tooLong.length === 0, `ko: 120자 초과 0 (${tooLong.length})`);

/* ⑦ 머리글 — en 은 **사람 검수 전**이라고 반드시 말한다(그 표시가 없으면 기준선으로 오해한다) */
ok(/검수 전/.test(en.head.join('\n')) && /기계 초안/.test(en.head.join('\n')),
   'en 머리글이 "기계 초안 · 사람 검수 전" 이라고 적혀 있다');
ok(/우리가 새로 쓴 문장만/.test(ko.head.join('\n')),
   'ko 머리글이 "우리가 새로 쓴 문장만" 이라고 적혀 있다 (베끼기 금지)');
ok(ko.head.some((l) => l.includes('langpack-v1.md')), 'ko 머리글이 설계 경로를 가리킨다');

/* ⑧ 되돌림 실증 — 영어 쪽을 **실제로 한 줄 밀어** ② 의 그 함수에 넣는다. 파일은 건드리지 않는다.
   밀어도 0 이 나오면 ② 는 아무것도 보지 않는 시험이라는 뜻이고, 그때 이 줄이 붉어진다. */
const shifted = en.rows.slice(1).concat(en.rows[0]);
let revertShiftFailed = false;
try {
  assert.ok(numberAligned(shifted).pct >= 80,
            `한 줄 밀었는데 숫자 지문이 ${numberAligned(shifted).pct}% 로 맞는다고 한다`);
} catch (e) { revertShiftFailed = true; }
ok(revertShiftFailed === true,
   `영어 쪽을 한 줄만 밀면 붉어진다 (지문 ${numberAligned(shifted).pct}% — 되돌림 실증)`);
ok(fieldMismatch(shifted).length > 0,
   `꼬리표 비교는 한 줄 밀기를 ${fieldMismatch(shifted).length}곳만 잡는다 — 그래서 ②-2 가 필요하다(사실)`);

console.log(`\n전부 통과 (${checks}건)`);
