// 금지어 게이트. 발행 전에 반드시 통과시킨다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const common = JSON.parse(readFileSync(join(ROOT, 'products/_common-forbidden.json'), 'utf8'));

export function loadProduct(id) {
  return JSON.parse(readFileSync(join(ROOT, `products/${id}.json`), 'utf8'));
}

/** 금지어 검사. { ok, hits: [{word, where, suggest}] } */
export function check(text, product) {
  const words = [
    ...(product.forbidden?.inherit === 'common' ? common.words : []),
    ...(product.forbidden?.words || [])
  ];
  const hits = [];
  const lower = text.toLowerCase();
  for (const w of words) {
    const i = lower.indexOf(w.toLowerCase());
    if (i >= 0) {
      hits.push({
        word: w,
        where: text.slice(Math.max(0, i - 15), i + w.length + 15),
        suggest: common.allowed_instead[w] || null
      });
    }
  }
  return { ok: hits.length === 0, hits };
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

export { common };
