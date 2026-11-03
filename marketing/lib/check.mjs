// 금지어 게이트. 발행 전에 반드시 통과시킨다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const common = JSON.parse(readFileSync(join(ROOT, 'products/_common-forbidden.json'), 'utf8'));

export function loadProduct(id) {
  return JSON.parse(readFileSync(join(ROOT, `products/${id}.json`), 'utf8'));
}

/** forbidden.inherit 을 풀어 낱말목록을 합친다.
 *  inherit 는 **문자열 하나 또는 배열**을 받는다 (배열은 2026-11-02 추가, smartever 동의).
 *    "common"                     → 공용 목록만        (예전 그대로 · 하위호환)
 *    ["common", "raytok-app"]     → 공용 + 앱 제품목록
 *  까닭: 선글라스 상세가 앱의 번역 기능을 같이 파는데 낱말목록은 선글라스 것만 썼다.
 *    그래서 「구독료 0원」·「휴대폰 안에서 번역」이 제품 경계를 타고 샜다
 *    (2026-11-02 claude-22). 베껴 적으면 또 갈라지므로 물려받게 한다.
 *  제품을 물려받으면 그 제품의 inherit 도 따라 풀린다. 고리(A→B→A)는 한 번만 보고 끊는다. */
export function resolveForbidden(product, seen = new Set()) {
  const words = [...(product.forbidden?.words || [])];
  const notice = [...(product.forbidden?.notice || [])];
  const inh = product.forbidden?.inherit;
  const list = inh == null ? [] : (Array.isArray(inh) ? inh : [inh]);
  for (const src of list) {
    if (seen.has(src)) continue;
    seen.add(src);
    if (src === 'common') {
      words.push(...(common.words || []));
      notice.push(...(common.notice || []));
      continue;
    }
    const up = resolveForbidden(loadProduct(src), seen);
    words.push(...up.words);
    notice.push(...up.notice);
  }
  const uniq = (a) => [...new Map(a.map(w => [w.toLowerCase(), w])).values()];
  // forbidden.exclude = **물려받되 빼는 낱말** (2026-11-03 15시 claude-22).
  //  까닭: 11-02 에 선글라스가 앱 목록을 물려받게 했다. 「휴대폰 안에서 번역」이
  //    제품 경계를 타고 새는 것을 막으려는 것이었는데, 앱 전용 금지어
  //    「구독료 0원」·「구독료 없음」까지 같이 끌려와 **선글라스 자기 정본이 제 게이트에 걸렸다**
  //    (products/raytok-glass.json listingTitle — 마켓플러스·쿠팡에 쓰는 상품명).
  //  근거 셋이 모두 「선글라스는 써도 된다」로 같다:
  //    · products/_common-forbidden.json rules[4] 「구독료 0원 문구는 선글라스에만」
  //    · products/raytok-app.json forbiddenNote 「구독료 0원은 선글라스 전용」
  //    · 공용 words 에는 구독료가 **없다** — 금지는 앱 제품목록에서만 온다
  //  그래서 판정 로직은 건드리지 않고 **빼는 칸**만 더했다. 칸이 없는 제품은 전과 같다.
  //  물려받는 쪽으로는 따라간다(이미 뺀 목록이 내려간다). 되돌리려면 그쪽 words 에 다시 적는다.
  const ex = new Set((product.forbidden?.exclude || []).map(w => String(w).toLowerCase()));
  const drop = (a) => a.filter(w => !ex.has(String(w).toLowerCase()));
  return { words: drop(uniq(words)), notice: drop(uniq(notice)) };
}

/** 금지어 검사. { ok, hits: [{word, where, suggest}], notices: [...] }
 *  words  = 법 자체라 막는다 (ok=false).
 *  notice = 2026-10-26 대표님 해제분. 막지 않고 통지만 한다 (ok 에 영향 없음).
 *           출처: claude/RayTok-광고규정_해제_1026.md */
export function check(text, product) {
  const { words, notice: noticeWords } = resolveForbidden(product);
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
  const m = forbidRe(w, 'i').exec(text);
  if (m) return { index: m.index, length: m[0].length };
  return specFind(text, w);
}

/** 금지어·통지어 전용 정규식. 낱말 사이를 **\s* (0개 이상)** 로 잇는다.
 *  까닭 (2026-11-03 16시 claude-22): `looseRe` 는 \s+ 라 **공백이 꼭 하나는 있어야** 했다.
 *    그래서 **붙여쓴 꼴이 전부 샜다** — 한국어 광고 문구는 오히려 붙여쓰는 쪽이 흔하다:
 *      「특허 기술」 ✗ 걸림  ↔  「특허기술」 ✓ 샘
 *      「세계 최초」·「스마트 안경」·「청력 보호」·「주름 제거」·「효과 보장」·
 *      「임상 입증」·「무료 증정」·「14일 만에」·「블루투스 5.4」 전부 같은 구멍
 *    (「피부 재생」·「모공 수축」은 터치톡 목록에 붙여쓴 꼴이 따로 적혀 있어 걸렸다 —
 *     목록마다 손으로 두 번 적어야 막히는 구조였다. 그 손일을 없앤다)
 *  오탐 위험을 따져 본 결과: 붙여쓴 꼴이 **다른 뜻이 되는 낱말은 세 제품 목록에 없다.**
 *    두 꼴이 같은 주장을 가리킨다. 그래서 목록을 안 고치고 **판정만** 느슨하게 한다.
 *  ★ 고지문(mustInclude)은 그대로 `looseRe`(\s+) 를 쓴다 — 판정이 바뀌면 안 되는 정본이다.
 *    그래서 stripRequired·auditRequired 는 **전과 한 글자도 같다** (터치톡 영향 없음) */
function forbidRe(w, flags = '') {
  return new RegExp(w.trim().split(/\s+/)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), flags);
}

/** 사양표·수치 띠에서 **값이 이름 위**에 올 때를 잡는다 (2026-11-03 claude-22).
 *  까닭: `looseRe` 는 공백·줄바꿈만 잇고 **말 순서는 못 바꾼다.** 그래서
 *    「월 구독료 0원」  → ✗ 걸린다
 *    「0원 / 월 구독료」 → ✓ 샜다      ← 11-05 예약 그림이 바로 이 꼴이었다
 *  낱말 순서를 전부 섞으면 엉뚱한 데서 걸리므로(2026-11-02 결정) **딱 한 가지만** 본다:
 *    **맨 끝 낱말이 홑 수치**(「0원」·「5.4」·「14일」)인 금지어만, 그 수치가 먼저 오고
 *    남은 낱말이 **12자 안에** 뒤따르는 경우. 사양표 이름줄에 붙는 접두사(「월 」)를 넘긴다.
 *  ★ 남은 낱말이 **한 글자면 건너뛴다** — 「단 14일」의 「단」이 「단계」·「진단」에 걸린다.
 *    그래서 지금 실제로 보는 것은 「구독료 0원」·「블루투스 5.4/5.2」 세 개뿐이다. */
const VALUE_TAIL = /^\d[\d.,]*\s*(?:원|%|개|g|kg|시간|분|초|일|배|회|명|mm|cm|m)?$/;
function specFind(text, w) {
  const toks = w.trim().split(/\s+/);
  if (toks.length < 2) return null;
  const tail = toks[toks.length - 1];
  const head = toks.slice(0, -1);
  if (!VALUE_TAIL.test(tail)) return null;
  if (head.some(t => t.length < 2)) return null;   // 한 글자 낱말은 오탐이 난다
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 값과 이름 사이는 **사양표 사이값만** 넘긴다: 공백·줄바꿈·슬래시·가운뎃점, 그리고
  // 이름줄 접두사 한 낱말(「월 」)까지. 마침표·쉼표는 안 넘긴다 —
  // 「0원으로 쓰십니다. 구독료는…」처럼 **문장을 건너뛰면** 엉뚱한 데서 걸린다.
  // 「사이에 글자가 끼면 안 걸린다」는 looseRe 의 원칙을 그대로 지킨다.
  const GAP = '[\\s/·|]+(?:[가-힣A-Za-z]{1,3}[\\s/·|]+)?';
  // 값 뒤에 한글이 이어 붙으면(「0원으로」) 홑 수치가 아니다 — 사양표 값이 아니라 문장이다
  const re = new RegExp(esc(tail) + '(?![가-힣])' + GAP + head.map(esc).join('\\s*'), 'i');
  const m = re.exec(text);
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
    //  ⑤ 전화·사업자·신고번호처럼 **붙임표로 이어진 숫자 묶음** — 식별번호다. 산수가 아니다
    //     (2026-11-03 claude-22: v3 본문 꼬리말에서 1800-6825 · 376-88-02280 ·
    //      2025-화성동탄-2002 가 통계처럼 걸려 14개가 쏟아졌다. 그러면 사람이 줄을 안 읽는다)
    //     ★ 뒤에 단위(시간·분·일·개·원·%·g·mm…)가 붙으면 가리지 않는다 — 「30-40시간」 같은
    //       범위는 계속 물어야 한다
    .replace(/\b\d{2,4}(?:-\d{2,5}){1,3}\b(?!\s*(?:시간|분|초|일|개|명|원|%|g|kg|mm|cm|m|초|배|회|년))/g, ' ')
    //  ⑥ 신고번호 「2025-화성동탄-2002」처럼 가운데가 한글인 것
    .replace(/\b\d{2,4}-[가-힣]+-\d{2,5}\b/g, ' ')
    //  ⑦ 주소의 길번호·층·호·동 — 번지다
    .replace(/(?:대로|로|길)\s*\d+(?:-\d+)?/g, ' ')
    //     ★ 뒤따르는 숫자를 보는 조건을 두지 않는다 — 「1동 15층 1507호」처럼 줄줄이
    //       붙으면 가운데가 안 가려진다 (2026-11-03 claude-22, 「15」 하나 남았다)
    //     ★ 「동」은 뒤에 한글이 붙으면 가리지 않는다 — 「5동작」 같은 사양은 물어야 한다
    .replace(/\d+\s*(?:층|호|번지)/g, ' ')
    .replace(/\d+\s*동(?![가-힣])/g, ' ')
    //  ⑧ **앞자리가 0 인 홑 숫자** 「01 02 03」 — 차례표다 (v3 상세 How to use 가 줄마다
    //     「01」만 적는다). 앞자리 0 을 붙이는 수는 통계가 아니라 이름표다
    .replace(/\b0\d+\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}[.\-/]\d{1,2}(?:[.\-/]\d{1,2})?\b/g, ' ')
    .replace(/\b(?:19|20)\d{2}\s*년(?:\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?)?/g, ' ')
    .replace(/^[ \t]*\d{1,2}\.(?=\s)/gm, ' ')
    //  ④ 「年」이 없는 헹 달 이름 「11월과 12월」 — 달이다. 1~12 만 가린다
    //     (2026-11-02 claude-22: 11-02 예약엘 「남은 건 11월과 12월」 의 11·12 가 통계처럼 걸렸다)
    //     ★ 「월」만 가린다. 「일」은 가리지 않는다 — 「67일 남았습니다」 는 산수를 물어야 한다
    .replace(/(?<![\d.,])(?:1[0-2]|[1-9])\s*월(?![\s]*\d)/g, ' ');
  // 꼬리에 붙은 쉼표·마침표를 떼고 모은다. 예전엔 「635,」처럼 쉼표가 붙은 채 찍혀
  // (주소 「동탄대로 635, SH TIME…」) 사람이 숫자를 못 알아봤다 (2026-11-03 claude-22)
  const found = (masked.match(/\d[\d,]*\.?\d*/g) || []).map(n => n.replace(/[,.]+$/, ''));
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
