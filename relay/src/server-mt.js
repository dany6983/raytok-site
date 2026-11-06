/* relay/src/server-mt.js — 「서버 번역(MADLAD-3B)」 엔진 칸 (site NOW 11-01 11:40)
 *
 * 엔진 저장소 `premium/serve.py POST /translate`(엔진 NOW 11-01 11:40) 를 릴레이가 부르는 자리.
 * 대표님: 「서버는 다 만들어 두고, 쓰는 방법은 나중」 → **기본 꺼짐(off)**.
 *
 * 환경(값은 저장소 어디에도 쓰지 않는다):
 *   SERVER_MT_URL         서버의 /translate 주소 (wrangler secret 또는 vars)
 *                         또는 RunPod 서버리스 `https://api.runpod.ai/v2/<끝점>/runsync` — 그 꼴이면
 *                         `{input:{q,source,target}}` 로 감싸 `Authorization: Bearer <KEY>` 로 보내고 `output.t` 를 읽는다(마스터 11-06)
 *   SERVER_MT_KEY         요청 머리 `X-Raytok-Key` 에 싣는 열쇠 (wrangler secret)
 *   SERVER_MT_MODE        off(기본) | reverse(X→ko 만) | premium(이용권 플래그) | all
 *   SERVER_MT_FLAG        premium 일 때 여는 이용권 비트 (예: 0x20). **비면 premium 은 아무에게도 안 열린다**(§20)
 *   SERVER_MT_DAILY_CAP   하루 호출 수 상한 (기본 2000). 넘으면 부르지도 않고 구글로
 *   SERVER_MT_TIMEOUT_MS  기다리는 한도 (기본 3000)
 *
 * 켜졌을 때 떨어지는 길 — 전부 **지금 길(구글)** 로 내려앉고 까닭을 남긴다(pro-translate.js 와 같은 꼴):
 *   3초 넘음 · 5xx(그 밖 상류 오류) · 빈 답 · 줄 수 안 맞음 · 원문에 없는 숫자 · 하루 상한 · 주소/열쇠 없음.
 * 손님은 늘 번역을 받는다(R-15). P-14: 이 길도 릴레이 안의 일이다 — 보내는 기기는 원문만 보낸다.
 */

import { inventedNumbers, todayKey } from './pro-translate.js';

export const SERVER_MT_MODES = ['off', 'reverse', 'premium', 'all'];

/** 왜 구글로 떨어졌는지 — 손님 화면이 아니라 보고·시험이 읽는 값이다 */
export const SMT_FALLBACK = {
  NO_URL: 'smt_no_url',       // 켜졌는데 주소가 없다
  NO_KEY: 'smt_no_key',       // 켜졌는데 열쇠가 없다
  CAP: 'smt_cap',             // 하루 호출 수 상한
  SLOW: 'smt_slow',           // 3초 안에 안 왔다
  ERROR: 'smt_error',         // 상류 5xx·4xx·연결 실패·JSON 아님
  EMPTY: 'smt_empty',         // 빈 답(빈 배열·빈 글자·줄 수 다름)
  NUMBERS: 'smt_numbers',     // 원문에 없는 숫자가 생겼다
  TOO_LONG: 'smt_too_long'    // 서버 한도(한 줄 1000자) 밖
};

/** 서버 한도 — 엔진 NOW ① 과 같은 값(묶음 32 · 한 줄 1000자) */
export const SMT_MAX_BATCH = 32;
export const SMT_MAX_LINE = 1000;

/** 지금 모드 — 표에 없는 값은 **off**(모르는 것을 켬으로 읽지 않는다, §20) */
export function serverMtMode(env) {
  const m = String((env && env.SERVER_MT_MODE) || 'off').trim().toLowerCase();
  return SERVER_MT_MODES.includes(m) ? m : 'off';
}

/** premium 이 여는 비트. 비었거나 숫자가 아니면 0(= 아무에게도 안 열림) */
export function serverMtFlag(env) {
  const raw = String((env && env.SERVER_MT_FLAG) || '').trim();
  if (!raw) return 0;
  const n = /^0x/i.test(raw) ? parseInt(raw, 16) : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function baseLang(code) {
  return String(code || '').trim().toLowerCase().split(/[-_]/)[0];
}

/**
 * 이 요청이 서버 번역 대상인가. 주소·열쇠 여부는 여기서 보지 않는다
 * (대상인데 주소가 없으면 **떨어짐 기록**을 남겨야 하므로 callServerMt 가 본다).
 */
export function serverMtWanted({ env, sourceLang, targetLang, flags }) {
  const mode = serverMtMode(env);
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  if (mode === 'reverse') {
    // X→ko 만. 원문 말을 모르면(auto) 대상 ko 만 본다 — ko→ko 는 대상 아님
    return baseLang(targetLang) === 'ko' && baseLang(sourceLang) !== 'ko';
  }
  if (mode === 'premium') {
    const f = serverMtFlag(env);
    return f > 0 && (Number(flags || 0) & f) === f;
  }
  return false;
}

function fail(why, extra = {}) {
  const e = new Error(why);
  e.why = why;
  Object.assign(e, extra);
  return e;
}

/**
 * 서버에 묻는다. 성공이면 `{ translations: [{translatedText}], detectedSrc }`(callEngineOnce 와 같은 꼴),
 * 아니면 `why` 가 붙은 오류를 던진다. **재시도하지 않는다** — 떨어지면 구글이 받는다.
 * 묶음 32 를 넘으면 나눠 묻되, 기다리는 한도는 **전체에 하나**다.
 */
export async function callServerMt({ texts, sourceLang, targetLang, env, fetchImpl, timeoutMs }) {
  const url = String((env && env.SERVER_MT_URL) || '').trim();
  if (!url) throw fail(SMT_FALLBACK.NO_URL);
  const key = String((env && env.SERVER_MT_KEY) || '').trim();
  if (!key) throw fail(SMT_FALLBACK.NO_KEY);
  if (texts.some((t) => String(t).length > SMT_MAX_LINE)) throw fail(SMT_FALLBACK.TOO_LONG);

  const limitMs = Number(timeoutMs || (env && env.SERVER_MT_TIMEOUT_MS) || 3000);
  const doFetch = fetchImpl || fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), limitMs);
  const out = [];
  try {
    for (let i = 0; i < texts.length; i += SMT_MAX_BATCH) {
      const chunk = texts.slice(i, i + SMT_MAX_BATCH);
      let res;
      try {
        const job = { q: chunk, source: sourceLang || 'auto', target: targetLang };
        res = await doFetch(url, isRunpod(url)
          ? { method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({ input: job }), signal: ctl.signal }
          : { method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Raytok-Key': key },
              body: JSON.stringify(job), signal: ctl.signal });
      } catch (err) {
        if (ctl.signal.aborted || (err && (err.name === 'AbortError' || err.name === 'TimeoutError'))) {
          throw fail(SMT_FALLBACK.SLOW);
        }
        throw fail(SMT_FALLBACK.ERROR, { upstreamStatus: null });
      }
      if (!res.ok) throw fail(SMT_FALLBACK.ERROR, { upstreamStatus: res.status });
      let data;
      try {
        data = await res.json();
      } catch (err) {
        if (ctl.signal.aborted) throw fail(SMT_FALLBACK.SLOW);
        throw fail(SMT_FALLBACK.ERROR, { upstreamStatus: res.status });
      }
      // RunPod 꼴: {status:'COMPLETED', output:{t:[…]}} — 다 안 끝났으면(IN_QUEUE·첫 시동) 빈 답으로 보고 구글로
      const body = isRunpod(url) ? (data && data.status === 'COMPLETED' ? data.output : null) : data;
      const t = body && Array.isArray(body.t) ? body.t : null;
      // §20 빈 답: null·[]·줄 수 다름·빈 글자 하나라도 → 구글로
      if (!t || t.length !== chunk.length) throw fail(SMT_FALLBACK.EMPTY);
      for (let k = 0; k < chunk.length; k++) {
        const s = typeof t[k] === 'string' ? t[k].trim() : '';
        if (!s && String(chunk[k]).trim()) throw fail(SMT_FALLBACK.EMPTY);
        if (inventedNumbers(chunk[k], s).length) throw fail(SMT_FALLBACK.NUMBERS);
        out.push(s);
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return {
    translations: out.map((s) => ({ translatedText: s })),
    detectedSrc: sourceLang || null
  };
}

/** RunPod 서버리스 runsync 주소인가 (마스터 11-06) */
export function isRunpod(url) {
  return /^https:\/\/api\.runpod\.ai\/v2\/[A-Za-z0-9]+\/runsync\/?$/.test(String(url || '').trim());
}

/** 하루 호출 수를 세는 칸 이름 (room.js /usage/summary?key= 가 읽는다) */
export function smtDayKey(now = Date.now()) {
  return `smt_calls:${todayKey(now)}`;
}

/** 하루 상한 (기본 2000 호출). 0 이하·숫자 아님 → 기본 */
export function serverMtDailyCap(env) {
  const n = Number((env && env.SERVER_MT_DAILY_CAP) || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2000;
}
