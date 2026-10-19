/* relay/src/postasr-shape.js — E-8 **줄 JSON 꼴 검사기** (가져온 것, 고치지 않는다)
 *
 * 정본은 엔진 저장소다: `raytok-engine/postasr/validate.mjs` (커밋 0c8836d, 2026-10-19).
 * 꼴 자체의 설명은 그 옆 `postasr/README.md` 에 있다 — 여기 옮겨 적지 않는다(한 곳, §4).
 *
 * **이 파일을 손으로 고치지 않는다.** 꼴이 바뀌면 엔진 쪽 정본을 고치고 그것을 다시 가져온다.
 * 가져오는 까닭: 릴레이는 엔진 저장소를 런타임에 들고 있지 않다. 그래서 같은 함수를 양쪽이
 * 들고, 우리 답이 **정본 검사기를 통과하는지**를 `relay/test/asr-batch.mjs` 가 센다.
 *
 * 아래는 정본 그대로다 (주석 포함).
 */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const isLang = (v) => v === null || (isStr(v) && /^[a-z]{2}$/.test(v));

/** 1장의 요청. 틀린 곳을 글로 돌려준다(빈 배열이면 맞다). */
export function checkRequest(o) {
  const e = [];
  if (!o || typeof o !== 'object') return ['요청이 객체가 아니다'];
  if (!isStr(o.sessionId) || !o.sessionId) e.push('sessionId 는 빈 글이 아닌 글이어야 한다');
  if (!isLang(o.lang)) e.push('lang 은 두 글자 코드이거나 null 이어야 한다');
  if (!isNum(o.clockBaseMs)) e.push('clockBaseMs 는 수여야 한다(실시간 기록과 같은 시계)');
  if (!Array.isArray(o.segments) || o.segments.length === 0) {
    e.push('segments 는 한 개 이상이어야 한다');
    return e;
  }
  o.segments.forEach((s, i) => {
    const at = `segments[${i}]`;
    if (!isStr(s?.file) || !s.file) e.push(`${at}.file 이 없다`);
    if (!isNum(s?.t0) || !isNum(s?.t1)) e.push(`${at}.t0/t1 은 수(초)여야 한다`);
    else if (!(s.t0 < s.t1)) e.push(`${at}: t0 < t1 이어야 한다 (${s.t0} .. ${s.t1})`);
  });
  return e;
}

/** 2장의 줄 JSON. */
export function checkResponse(o) {
  const e = [];
  if (!o || typeof o !== 'object') return ['답이 객체가 아니다'];
  if (!isStr(o.engine) || !o.engine) e.push('engine 은 글이어야 한다(무엇이 받아썼는지)');
  if (!isLang(o.lang)) e.push('lang 은 두 글자 코드이거나 null 이어야 한다');
  if (!Array.isArray(o.lines)) {
    e.push('lines 는 배열이어야 한다 (말이 없었으면 빈 배열 — 오류가 아니다)');
    return e;
  }

  let prev = -Infinity;
  o.lines.forEach((l, i) => {
    const at = `lines[${i}]`;
    if (!isNum(l?.t0) || !isNum(l?.t1)) e.push(`${at}.t0/t1 은 수(초)여야 한다`);
    else {
      if (!(l.t0 < l.t1)) e.push(`${at}: t0 < t1 이어야 한다 (${l.t0} .. ${l.t1})`);
      if (l.t0 < prev) e.push(`${at}: 줄이 t0 오름차순이 아니거나 앞 줄과 겹친다 (앞 끝 ${prev}, 이번 시작 ${l.t0})`);
      prev = Math.max(prev, l.t1);
    }
    if (!isStr(l?.text)) e.push(`${at}.text 는 글이어야 한다`);
    if (!isLang(l?.lang)) e.push(`${at}.lang 은 두 글자 코드이거나 null`);
    // conf 는 **null 이 정상**이다 — 지금 엔진이 확신도를 안 준다(README 4장)
    if (!(l?.conf === null || (isNum(l?.conf) && l.conf >= 0 && l.conf <= 1))) {
      e.push(`${at}.conf 는 0~1 수이거나 null 이어야 한다`);
    }
  });

  if (o.stats !== undefined) {
    const s = o.stats;
    if (!s || typeof s !== 'object') e.push('stats 는 객체여야 한다');
    else {
      for (const k of ['audioSec', 'computeSec', 'rtf']) {
        if (s[k] !== undefined && !isNum(s[k])) e.push(`stats.${k} 는 수여야 한다`);
      }
      if (isNum(s.audioSec) && isNum(s.computeSec) && isNum(s.rtf)) {
        const want = s.computeSec / s.audioSec;
        if (Math.abs(want - s.rtf) > 0.01) e.push(`stats.rtf 가 computeSec/audioSec 와 다르다 (${s.rtf} vs ${want.toFixed(3)})`);
      }
    }
  }
  return e;
}

/** 오류 몸통 `{"error":"코드"}` — 아는 코드인지 본다. */
export const ERROR_CODES = ['asr_cap', 'too_large', 'bad_manifest', 'timeout', 'worker_down'];
export function checkError(o) {
  if (!o || !isStr(o.error)) return ['오류 몸통은 {"error":"<코드>"} 꼴이어야 한다'];
  return ERROR_CODES.includes(o.error) ? [] : [`모르는 오류 코드: ${o.error} (아는 것: ${ERROR_CODES.join(', ')})`];
}
