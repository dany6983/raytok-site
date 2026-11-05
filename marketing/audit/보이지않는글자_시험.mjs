// 보이지 않는 글자로 금지어가 새는지 지키는 시험 (2026-11-04 19시 claude-22)
// 돌리는 법:  node audit/보이지않는글자_시험.mjs
// 까닭: 인스타 캡션은 빈 줄을 만들려고 보이지 않는 글자를 넣는 것이 흔하다.
//   `ㅤ`(U+3164 한글 채움)·U+200B·U+2063 따위가 섞이면 \s* 로 이은 금지어 정규식이 못 본다.
//   아홉 번째 거짓 통과였다. 다시 생기지 않게 못을 박는다.
import { check, loadProduct, normalizeInvisible } from '../lib/check.mjs';

const app = loadProduct('raytok-app');
let 실패 = 0, 통과 = 0;
const 봄 = (이름, 참) => { if (참) { 통과++; } else { 실패++; console.log('  ✗ 실패:', 이름); } };

// ① 보이지 않는 글자 아홉 꼴 — 전부 걸려야 한다
const 꼴 = {
  '없음': '', 'ZWSP U+200B': '​', 'ZWNJ U+200C': '‌', 'ZWJ U+200D': '‍',
  'WJ U+2060': '⁠', '보이지않는구분 U+2063': '⁣', '한글채움 U+3164': 'ㅤ',
  'BOM U+FEFF': '﻿', 'NBSP U+00A0': ' ',
};
for (const [이름, c] of Object.entries(꼴)) {
  봄(`금지어 「구독료 0원」 + ${이름}`, check(`월 구독료${c} 0원입니다.`, app).hits.length === 1);
}

// ② 낱말 안에 끼어도 걸려야 한다
봄('낱말 속 ZWSP', check('월 구독​료 0원입니다.', app).hits.length === 1);
봄('여러 꼴 섞임', check('월ㅤ 구독​료⁣ 0원', app).hits.length === 1);

// ③ 깨끗한 글은 그대로 통과해야 한다 (오탐 금지)
봄('20:23 예약 본문 꼴', check('RayPac™, 85개 언어. 쓸 언어만 골라 내려받습니다.', app).ok);
봄('빈 글', check('', app).ok);

// ④ NBSP 는 지우지 말고 빈칸으로 바꿔야 한다 (지우면 낱말이 붙는다)
봄('NBSP → 빈칸', normalizeInvisible('가 나') === '가 나');
봄('폭 없는 글자 → 지움', normalizeInvisible('가​나') === '가나');

// ⑤ 언어팩 정서법 글자는 「검사용 사본」에서만 떼인다 — 원본 문자열은 안 바뀐다
const 크메르 = '​';
const 원본 = `ស្រុក${크메르}ខ្មែរ`;
봄('원본 문자열 무변경', 원본.includes('​'));
봄('사본에서만 떼임', !normalizeInvisible(원본).includes('​'));

// ⑥ 전각(全角) 글자도 걸려야 한다 (2026-11-05 11시 — 열 번째 거짓 통과)
//    까닭: 금지어 목록은 반각인데 캡션엔 전각이 섞여 온다. 「구독료０원」이 샜다
봄('전각 영 U+FF10', check('구독료０원입니다.', app).hits.length === 1);
봄('전각 영 + 빈칸', check('월 구독료 ０원', app).hits.length === 1);
봄('전각 해시 U+FF03', check('＃구독료없음', app).hits.length === 1);
봄('반각 그대로', check('월 구독료 0원', app).hits.length === 1);
봄('전각→반각 1:1 길이 보존', normalizeInvisible('０Ａ＃').length === 3);
봄('전각 접기 값', normalizeInvisible('０Ａ＃') === '0A#');
// 오탐 금지 — 전각 아닌 깨끗한 글은 그대로 통과
봄('전각 고침 뒤에도 깨끗한 글 통과', check('RayPac™, 85개 언어.', app).ok);

console.log(`\n시험 ${통과 + 실패}개 · 통과 ${통과} · 실패 ${실패}`);
process.exit(실패 ? 1 : 0);
