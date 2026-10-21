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

/** 릴레이 답(`{t:[...]}`)에서 글자만 꺼낸다. 다른 모양이면 **빈 배열** — 모름을 됨으로 읽지 않는다. */
export function textsOf(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.t)) return data.t.map((x) => (typeof x === 'string' ? x : ''));
  return [];
}
