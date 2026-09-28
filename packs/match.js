// packs/match.js — 인식 문장을 꾸러미 문장에 맞추는 순수 JS 모듈 (앱·웹 공용, 의존성 0)

function toHalfWidth(str) {
  return str
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

function normalize(s) {
  if (typeof s !== 'string') return '';
  let str = toHalfWidth(s).toLowerCase();
  // 공백 및 구두점(.,!?·…~"'() 등) 제거
  str = str.replace(/[\s\.,!\?·…~"'`\(\)\[\]\{\}<>“”‘’—–\-_:;/\\|@#$%^&*+=]+/g, '');
  return str;
}

function getBigrams(str) {
  const map = new Map();
  for (let i = 0; i < str.length - 1; i++) {
    const bg = str.substring(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  return map;
}

function score(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.length < 2 || nb.length < 2) return 0.0;

  const bgA = getBigrams(na);
  const bgB = getBigrams(nb);

  const totalA = na.length - 1;
  const totalB = nb.length - 1;

  let intersection = 0;
  for (const [bg, countA] of bgA.entries()) {
    if (bgB.has(bg)) {
      intersection += Math.min(countA, bgB.get(bg));
    }
  }

  return (2.0 * intersection) / (totalA + totalB);
}

function match(text, pack, threshold = 0.8) {
  if (!pack || !Array.isArray(pack.items) || pack.items.length === 0) return null;
  const lang = pack.lang;

  let bestItem = null;
  let bestScore = -1;

  for (let i = 0; i < pack.items.length; i++) {
    const item = pack.items[i];
    const candidateText = (lang && item[lang]) || item.ko || item.tr || item.text || '';
    const s = score(text, candidateText);
    if (s > bestScore) {
      bestScore = s;
      bestItem = item;
    }
  }

  if (bestScore >= threshold && bestItem !== null) {
    return {
      id: bestItem.id,
      score: bestScore,
      item: bestItem
    };
  }

  return null;
}

function loadPack(json) {
  let obj = json;
  if (typeof json === 'string') {
    try {
      obj = JSON.parse(json);
    } catch (e) {
      throw new Error('Invalid JSON: ' + e.message);
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Pack must be an object');
  }

  if (
    typeof obj.ver !== 'number' ||
    typeof obj.lang !== 'string' ||
    !obj.cats ||
    typeof obj.cats !== 'object' ||
    !Array.isArray(obj.items)
  ) {
    throw new Error('Invalid pack format: {ver, lang, cats, items} required');
  }

  return obj;
}

const RayTokMatch = {
  normalize,
  score,
  match,
  loadPack
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RayTokMatch;
}
if (typeof window !== 'undefined') {
  window.RayTokMatch = RayTokMatch;
}
