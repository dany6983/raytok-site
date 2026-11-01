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
  const lower = text.toLowerCase();
  const find = (w) => {
    const i = lower.indexOf(w.toLowerCase());
    return i < 0 ? null : { word: w, where: text.slice(Math.max(0, i - 15), i + w.length + 15) };
  };
  const notices = noticeWords.map(find).filter(Boolean);
  for (const w of words) {
    const i = lower.indexOf(w.toLowerCase());
    if (i >= 0) {
      hits.push({
        word: w,
        where: text.slice(Math.max(0, i - 15), i + w.length + 15),
        // 제품별 교체표가 공통보다 우선한다 (터치톡은 식약처 기준으로 따로 있다)
        suggest: (product.allowedInstead || {})[w] || common.allowed_instead[w] || null
      });
    }
  }
  return { ok: hits.length === 0, hits, notices };
}

/** 고지문 문장을 공백에 느슨한 정규식으로 바꾼다.
 *  고지문은 캡션·상세에 들어갈 때 줄바꿈이 섞이므로 공백은 \s+ 로 맞춘다. */
function looseRe(sentence) {
  return new RegExp(sentence.trim().split(/\s+/)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'));
}

/** 법정 고지문(mustInclude)을 본문에서 떼어낸다.
 *  plan 은 body 만 게이트에 넣어 고지문 속 「치료」를 넘긴다. check 도 같아야 한다.
 *  반환 { body, stripped: [고지문 전문...] } */
export function stripRequired(text, product) {
  let body = text;
  const stripped = [];
  for (const n of (product.mustInclude || [])) {
    const re = looseRe(n);
    if (re.test(body)) { body = body.replace(re, ' '); stripped.push(n); }
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
  const found = text.match(/\d[\d,]*\.?\d*/g) || [];
  const unknown = [...new Set(found)].filter(n => {
    const bare = n.replace(/,/g, '');
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
