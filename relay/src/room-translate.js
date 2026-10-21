/* relay/src/room-translate.js — 방이 번역한다 (NOW B 3 · 보조 길)
 * 설계: docs/design/room-translate.md · 기준: 결정장부 51·43 · RULE: P-16
 *
 * 강사는 **원문만** 보낸다(장부 43). 방이 손님 언어마다 **한 번씩** 번역해서 그 언어
 * 손님에게만 보낸다. 손님 쪽은 아무것도 **청하지 않는다** — 방이 민다(RULE: P-16).
 *
 * 이 파일에는 **판단만** 둔다(언어 고르기·묶기·메시지 만들기). 소켓·시계·바깥 부르기는
 * `room.js` 가 한다. 그래서 이 판단을 가짜 없이 그대로 시험할 수 있다 — 10-20 에
 * 느슨한 가짜 둘이 사전 번역을 **운영에서 한 번도 안 되게** 두었다(D-11).
 */

/** 한 번에 번역할 언어 수 상한 — 강사 화면의 `MAX_SELECTED_LANGS` 와 같은 수다. */
export const MAX_LANGS = 30;
/** 모아서 한 번 부르기까지 기다리는 시간(ms). 늦어도 남는 쪽을 고른다(R-15). */
export const BATCH_MS = 250;
/** `/translate` 규약 — 바꾸지 않는다: 배열 ≤50개 · 합계 ≤5000자. */
export const MAX_ITEMS = 50;
export const MAX_CHARS = 5000;

/**
 * **견주기 위한** 꼴 — `zh-CN` 과 `zh_cn` 은 같고, `?` 는 **모름**이다(§20).
 *
 * ★ 이 값은 견줄 때만 쓴다. **보낼 때는 손님이 알린 글자를 그대로** 쓴다 — 청취 페이지는
 * `line.tr[내 언어]` 를 **그대로** 찾기 때문에 `zh-CN` 을 `zh-cn` 으로 바꿔 보내면 그 손님은
 * 영원히 원문만 본다. 10-19 에 `zh` vs `zh-CN` 이 그 꼴이었다(`samples/lang_table_test.js`).
 */
export function normLang(code) {
  const s = String(code || '').trim().replace('_', '-');
  if (!s || s === '?') return '';
  return s.toLowerCase();
}

/**
 * 번역할 언어를 고른다.
 *
 * 세 가지를 뺀다: ① **모름**(`?`·빈 값 — 아직 hello 를 안 보낸 손님) ② 원문과 **같은**
 * 언어(번역할 것이 없다) ③ 상한을 넘는 것. ③ 은 **버리는 것이 아니라 세어서 알린다** —
 * 조용히 자르면 그 언어 손님은 왜 원문만 보이는지 영원히 모른다(§20).
 *
 * 모름을 "없음"으로 읽지 않는다(D-70): `?` 손님은 **번역 대상이 아닐 뿐**이고, 그 손님이
 * 언어를 알리면(`attSetLang`) 다음 줄부터 대상이 된다.
 */
export function pickLangs(langs, srcLang) {
  const src = normLang(srcLang);
  const seen = new Set();
  const out = [];                       // **손님이 알린 글자 그대로** 담는다(위 ★)
  for (const raw of langs || []) {
    const c = normLang(raw);
    if (!c) continue;
    if (src && c === src) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(String(raw).trim().replace('_', '-'));
  }
  return { langs: out.slice(0, MAX_LANGS), capped: Math.max(0, out.length - MAX_LANGS) };
}

/**
 * 밀린 줄을 규약 상한에 맞춰 묶는다. **긴 줄 하나가 상한을 넘으면 혼자 보낸다** —
 * 버리지 않는다(R-15). 자르지도 않는다: 자른 번역은 틀린 번역이다.
 */
export function chunk(items) {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const it of items || []) {
    const n = String(it.text || '').length;
    if (cur.length && (cur.length >= MAX_ITEMS || chars + n > MAX_CHARS)) {
      out.push(cur); cur = []; chars = 0;
    }
    cur.push(it); chars += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * 번역문을 손님이 **알아보는 모양**으로 만든다.
 *
 * 🎤 줄은 `seq` 로 짝을 맞추고(청취 페이지에 이미 있던 길), 원고 문단은 `seq` 가 없어
 * `script_tr` + `para` 로 맞춘다. 짝이 안 맞으면 손님 화면은 **영원히 「번역 대기 중」**
 * 이므로, 받은 개수가 보낸 개수와 다르면 **그 묶음을 실패로 돌린다**(아래 `ok` 가 false).
 */
export function trMessages(items, lang, texts) {
  const code = String(lang || '').trim().replace('_', '-');   // 그대로 쓴다 — 소문자로 바꾸지 않는다
  if (!Array.isArray(texts) || texts.length !== (items || []).length) {
    return { ok: false, msgs: [], why: 'shape' };
  }
  const msgs = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    const text = typeof texts[i] === 'string' ? texts[i] : '';
    if (!text) return { ok: false, msgs: [], why: 'empty' };   // 빈 답은 답이 아니다(§20)
    msgs.push(it.script
      ? { kind: 'script_tr', para: it.para, trans: { [code]: text } }
      : { seq: it.seq, tr: { [code]: text } });
  }
  return { ok: true, msgs, why: null };
}

/**
 * 안 된다고 **알린다**. 이것을 안 보내면 손님은 「번역 대기 중」에 갇힌다(D-139 ⑤).
 * 글자는 원문으로 화면에 남아 있다 — 유실이 아니다(R-15).
 */
export function noTrMessages(items, why) {
  return (items || []).map((it) => (it.script
    ? { kind: 'script_tr', para: it.para, trans: {}, no_tr: 1, why: why || 'tr_fail' }
    : { seq: it.seq, no_tr: 1, why: why || 'tr_fail' }));
}

/** 그 (줄, 언어) 짝의 이름 — 🎤 줄은 `seq`, 원고 문단은 `para` 다(둘은 번호가 섞인다) */
export function doneKey(item, lang) {
  const who = item && item.script ? 'p' + item.para : 's' + (item && item.seq);
  return who + '|' + normLang(lang);
}

/**
 * 그 언어 번역을 **이미 들고 있나**. 둘을 본다:
 * ① 강사가 메시지에 실어 보낸 칸(`have`) ② 이 방이 아까 산 것(`done`).
 * 둘 중 하나라도 있으면 **다시 사지 않는다** — 같은 문단을 두 번 사면 돈이 두 배다.
 */
export function alreadyHas(item, lang, done) {
  const code = normLang(lang);
  if (item && item.have && item.have[code]) return true;
  return !!(done && done.has(doneKey(item, lang)));
}

/** 샀다고 적어 둔다. 적는 곳은 이 함수 하나다(§4) */
export function markDone(item, lang, done) {
  if (!done) return;
  done.add(doneKey(item, lang));
  /* 한 강연이 길어도 적어 둔 것이 무한히 늘지 않게 — 오래된 것부터 버린다(문단 500 × 언어 30) */
  if (done.size > 15000) {
    const it = done.values();
    for (let i = 0; i < 5000; i += 1) { const v = it.next(); if (v.done) break; done.delete(v.value); }
  }
}

/** 릴레이 답(`{t:[...]}`)에서 글자만 꺼낸다. 다른 모양이면 **빈 배열** — 모름을 됨으로 읽지 않는다. */
export function textsOf(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.t)) return data.t.map((x) => (typeof x === 'string' ? x : ''));
  return [];
}

/* ── 미리 번역은 **선택** (NOW B 4) ─────────────────────────────────────────
 *
 * 왜 "통째로 미리"가 아닌가: 문단 40 × 언어 30 = 1,200줄이고, 묶어도 언어마다 24회 ×
 * 30 = 720회다. `/translate` 는 토큰당 **분당 60회** — 올리는 순간 429 가 쏟아지고 그 달
 * 글자 상한을 한 번에 먹는다. 게다가 **그 언어 손님이 올지도 모르는** 상태에서 돈을 쓴다.
 * 그래서 **보관은 미리, 번역은 그때그때**다.
 *
 * ★ 늦게 온 언어 규칙은 **새로 쓰지 않는다 — 옮긴다.** `web/common/script-follow.js` 의
 *   `newLangs`·`latePlan`(마스터 10-20 04:45: ① 지금 문단부터 앞으로만 ② 5문단씩)이 그
 *   규칙이고, 지금은 강사 화면이 그것을 돌려 번역문을 와이어에 싣는다 — 싣는 것이 장부 43
 *   금지다. 규칙은 그대로 두고 **돌리는 자리만** 방으로 옮긴다. 세 구현(앱·웹·방)이 같은
 *   답을 내는지는 `samples/script-follow-cases.json` 의 `late` 칸이 센다(D-75).
 * ─────────────────────────────────────────────────────────────────────────── */

/** 보관할 문단 수 — 링버퍼와 같은 수. 넘으면 앞을 버린다 */
export const SCRIPT_MAX = 500;
/** 「다음」을 누를 때 **미리** 해 두는 문단 수. 0 이면 미리 하지 않는다(되돌림 자리) */
export const PREFETCH = 1;
/** 늦게 온 언어를 채울 때 한 묶음 크기 — 강사 쪽 `LATE_BATCH` 와 **같은 수** */
export const LATE_BATCH = 5;

/** 새로 생긴 언어만 — 이미 있던 것·원고 언어·빈 값은 빼고, 두 번 와도 한 번 (강사 쪽과 같은 셈) */
export function newLangs(prev, now, srcLang) {
  const had = {};
  (prev || []).forEach((x) => { const l = String(x || '').trim(); if (l) had[l] = 1; });
  const src = String(srcLang || '').trim();
  const out = [];
  (now || []).forEach((raw) => {
    const l = String(raw || '').trim();
    if (!l || l === src || had[l] || out.indexOf(l) >= 0) return;
    out.push(l);
  });
  return out;
}

/** 어떤 문단을 어떤 차례로 — 지금 읽는 문단부터, batch 개씩. 이미 있는 것은 뺀다 (강사 쪽과 같은 셈) */
export function latePlan(opts) {
  const o = opts || {};
  const n = Math.max(0, Math.floor(Number(o.total) || 0));
  const from = Math.max(1, Math.floor(Number(o.cur) || 0) || 1);
  const skip = {};
  (o.have || []).forEach((x) => { const v = Number(x); if (isFinite(v)) skip[v] = 1; });
  const want = [];
  for (let i = from; i <= n; i += 1) if (!skip[i]) want.push(i);
  const b = Math.max(1, Math.floor(Number(o.batch) || LATE_BATCH));
  const out = [];
  for (let j = 0; j < want.length; j += b) out.push(want.slice(j, j + b));
  return out;
}

/**
 * 강사가 올린 원고에서 **원문만** 꺼낸다.
 *
 * `trans`·`translated`·`tr` 가 섞여 있으면 **그 칸만 버리고 센다**(결정장부 43). 메시지를
 * 통째로 버리지 않는 까닭: 그러면 원고가 안 올라가 손님이 아무것도 못 본다 — 그쪽이 더
 * 나쁘다(R-15). 버린 것은 기록으로 남아 **보내는 쪽을 고치게** 한다.
 */
export function scriptSrcOf(parsed) {
  if (!parsed || parsed.kind !== 'script_src' || !Array.isArray(parsed.paras)) return null;
  const srcLang = parsed.srcLang || parsed.src_lang || 'ko';
  const total = Math.max(0, Math.floor(Number(parsed.total) || 0));
  const paras = [];
  let dropped = 0;
  for (const p of parsed.paras.slice(0, SCRIPT_MAX)) {
    if (!p || typeof p.src !== 'string' || !p.src.trim()) continue;
    const n = Math.floor(Number(p.para) || 0);
    if (n < 1) continue;
    if (p.trans || p.translated || p.tr) dropped += 1;     // 번역문은 받지 않는다
    paras.push({ para: n, src: p.src });
  }
  return { srcLang, total: total || paras.length, paras, dropped };
}

