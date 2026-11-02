// 금지어 게이트. 발행 전에 반드시 통과시킨다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const common = JSON.parse(readFileSync(join(ROOT, 'products/_common-forbidden.json'), 'utf8'));

export function loadProduct(id) {
  return JSON.parse(readFileSync(join(ROOT, `products/${id}.json`), 'utf8'));
}

/** 금지어 검사. { ok, hits: [{word, where, suggest}], notices: [...] }
 *  words  = 법 자체라 막는다 (ok=false).
 *  notice = 2026-10-26 대표님 해제분. 막지 않고 통지만 한다 (ok 에 영향 없음).
 *           출처: claude/RayTok-광고규정_해제_1026.md */
export function check(text, product) {
  const words = [
    ...(product.forbidden?.inherit === 'common' ? common.words : []),
    ...(product.forbidden?.words || [])
  ];
  const noticeWords = [
    ...(product.forbidden?.inherit === 'common' ? (common.notice || []) : []),
    ...(product.forbidden?.notice || [])
  ];
  const hits = [];
  const find = (w) => {
    const m = looseFind(text, w);
    return m ? { word: w, where: context(text, m) } : null;
  };
  const notices = noticeWords.map(find).filter(Boolean);
  for (const w of words) {
    const m = looseFind(text, w);
    if (m) {
      hits.push({
        word: w,
        where: context(text, m),
        // 제품별 교체표가 공통보다 우선한다 (터치톡은 식약처 기준으로 따로 있다)
        suggest: (product.allowedInstead || {})[w] || common.allowed_instead[w] || null
      });
    }
  }
  return { ok: hits.length === 0, hits, notices };
}

/** 여러 낱말로 된 금지어·통지어를 **공백에 느슨하게** 찾는다.
 *  까닭: 카드 그림은 머리글을 줄바꿈으로 쪼개 넣는다. 11-05 예약 그림이
 *  「월 구독료 / 0원」 두 줄이라 금지어 「구독료 0원」이 indexOf 로 안 걸렸다.
 *  캡션(한 줄)은 ✗ 였는데 **같은 말이 박힌 그림은 ✓ 로 통과**했다 (2026-11-02 claude-22).
 *  고지문은 2026-11-01 부터 이미 looseRe 로 보고 있었다 — 금지어만 뒤처져 있었다.
 *  ★ \s+ 는 공백·줄바꿈만 잇는다. 「치료. 효과」처럼 사이에 글자가 끼면 안 걸린다 — 의도대로 */
function looseFind(text, w) {
  if (!w || !w.trim()) return null;
  const m = looseRe(w, 'i').exec(text);
  return m ? { index: m.index, length: m[0].length } : null;
}

/** 걸린 자리 앞뒤 15자. 줄바꿈이 섞이면 읽기 어려워 한 칸으로 눕힌다 */
function context(text, m) {
  return text.slice(Math.max(0, m.index - 15), m.index + m.length + 15)
             .replace(/\s+/g, ' ').trim();
}

/** 고지문 문장을 공백에 느슨한 정규식으로 바꾼다.
 *  고지문은 캡션·상세에 들어갈 때 줄바꿈이 섞이므로 공백은 \s+ 로 맞춘다. */
function looseRe(sentence, flags = '') {
  return new RegExp(sentence.trim().split(/\s+/)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), flags);
}

/** 법정 고지문(mustInclude)을 본문에서 떼어낸다.
 *  plan 은 body 만 게이트에 넣어 고지문 속 「치료」를 넘긴다. check 도 같아야 한다.
 *  반환 { body, stripped: [{ sentence, hits }...] }
 *  ★ 반환이 문자열 배열이 아니라 **{문장, 횟수}** 다. 예전엔 「문장 ×4」로 이어 붙여 넘겼는데
 *    부르는 쪽이 30자로 자르면서 ×4 가 잘려 「4회 떼였는데 1건으로 보인다」가 됐다
 *    (2026-11-02 smartever 신고). 횟수를 따로 주면 부르는 쪽이 어디든 둘 수 있다 */
export function stripRequired(text, product) {
  let body = text;
  const stripped = [];
  for (const n of (product.mustInclude || [])) {
    // ★ g 가 없으면 **첫 1건만** 떼였다. 캡션 여러 편을 이어 붙이거나 상세 한 장에 고지문이
    //   두 번 들어가면 둘째 고지문 속 「치료」가 ✗ 로 떴다 (2026-11-02 smartever 신고).
    const re = looseRe(n, 'g');
    const hits = (body.match(re) || []).length;
    if (hits) { body = body.replace(re, ' '); stripped.push({ sentence: n, hits }); }
  }
  return { body: body.replace(/[ \t]{2,}/g, ' ').trim(), stripped };
}

/** 숫자가 제품 facts에 있는 값인지 거친 확인. 없는 숫자는 경고만. */
export function auditNumbers(text, product) {
  const known = new Set();
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'number') known.add(String(v));
    else if (typeof v === 'string') (v.match(/\d[\d,.]*/g) || []).forEach(n => known.add(n.replace(/[,.]$/, '')));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(product.facts);
  walk(product.lead);
  // 숫자처럼 보이지만 출처를 물을 것이 아닌 것을 먼저 가린다 (2026-11-01 smartever 오탐 신고).
  //  ① 날짜꼴 2026.06 · 2026.06.08  — 출처가 문장 안에 있다
  //  ② 줄 머리 목록 번호 「1. 세안 후…」 — 사용법 단계다
  //  ③ 한글 날짜꼴 「2026년 11월」·「2027년 1월 8일」 — 날짜다. 「2026년 11월 출시」의
  //     11 이 통계처럼 걸려 나왔다 (2026-11-02 claude-22). ★ 「년」이 앞에 있을 때만 가린다 —
  //     「67일 남았습니다」 같은 홑 수량은 계속 걸려야 한다
  const masked = text
    .replace(/\b(?:19|20)\d{2}\.\d{1,2}(?:\.\d{1,2})?\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\s*년(?:\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?)?/g, ' ')
    .replace(/^[ \t]*\d{1,2}\.(?=\s)/gm, ' ')
    //  ④ 「年」이 없는 헹 달 이름 「11월과 12월」 — 달이다. 1~12 만 가린다
    //     (2026-11-02 claude-22: 11-02 예약엘 「남은 건 11월과 12월」 의 11·12 가 통계처럼 걸렸다)
    //     ★ 「월」만 가린다. 「일」은 가리지 않는다 — 「67일 남았습니다」 는 산수를 물어야 한다
    .replace(/(?<![\d.,])(?:1[0-2]|[1-9])\s*월(?![\s]*\d)/g, ' ');
  const found = masked.match(/\d[\d,]*\.?\d*/g) || [];
  const unknown = [...new Set(found)].filter(n => {
    // 꼬리 마침표는 떼고 센다. 「1.」 이 두 글자로 세어져 한 자리 숫자가 걸려 나왔다
    const bare = n.replace(/,/g, '').replace(/\.$/, '');
    return !known.has(n) && !known.has(bare) && bare.length > 1;
  });
  return unknown;
}

/** 반드시 들어가야 하는 문구가 빠졌는지 (터치톡 의료기기 아님 고지 등) */
export function auditRequired(text, product) {
  const need = product.mustInclude || [];
  // 공백에 느슨한 전문(全文) 대조. 예전엔 머리 20자를 그대로 includes 로 봤는데,
  // 머리 20자 **안에** 줄바꿈이 떨어지면 들어 있는 고지문도 「빠짐」으로 떴다.
  // stripRequired 와 같은 판정이라 둘이 엇갈리지 않는다 (2026-11-01).
  return need.filter(n => !looseRe(n).test(text));
}

export { common };
