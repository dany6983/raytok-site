/* relay/src/pro-translate.js — B 10 「프로(LLM) 번역」 엔진
 * 설계: app docs/MASTER.md 2026-10-15 17:45 [열림] 27 의 [B] 1~6.
 *
 * 기본(basic) = 지금 구글 번역(0x10 패키지). 프로(pro) = LLM 번역, **별도 플래그 0x20**.
 * 프로는 0x10 을 포함한다 — 프로 = 인터넷 번역 + LLM.
 *
 * ⛔ 10-14 사고 재발 금지: 구글 Gemini API 가 한 달 476,423원 나왔다. 그래서 이 파일의
 *    절반은 **멈추는 장치**다 — 일일 상한, 느리면 포기, 이상하면 버림. 셋 다 basic 으로
 *    떨어뜨리고 기록한다. **모름은 됨이 아니다(§20)** 의 돈 쪽 얼굴이다.
 *
 * 키는 릴레이 안에서만 쓴다(`LLM_API_KEY` = wrangler secret). 앱·웹은 키를 모른다.
 */

/** 프로를 여는 비트. 0x10(인터넷 번역 패키지)과 **따로** 산다. */
export const PRO_FLAG = 0x20;

/** 왜 basic 으로 떨어졌는지 — 손님 화면이 아니라 보고·시험이 읽는 값이다. */
export const PRO_FALLBACK = {
  CAP: 'pro_cap',       // 일일 상한을 넘겼다
  SLOW: 'pro_slow',     // 2초 안에 안 왔다
  NUMBERS: 'pro_numbers', // 원문에 없는 숫자가 생겼다 (지어냈다)
  ERROR: 'pro_error',   // 상류가 죽었다
  NO_KEY: 'pro_no_key'  // 키가 없다 (운영 전)
};

/* ── 프롬프트 규칙 셋 (고정. 시험이 지킨다) ───────────────────────────────
   ⓐ **앞 확정 문장 1개만** 맥락으로 준다. 이전 **번역문**은 주지 않는다 —
      P-14 는 기기 사이의 얘기지만 같은 선을 여기서도 지킨다.
   ⓑ "모르면 원문 그대로, **지어내지 않는다**" — R-15.
   ⓒ 출력은 **번역문만**. 설명·따옴표·머리말 없음.
   ─────────────────────────────────────────────────────────────────────── */
export const PRO_SYSTEM_RULES = [
  'You are a translation engine. Output ONLY the translation.',
  'No explanation, no quotation marks, no preamble, no numbering.',
  'If you are unsure of a word, keep the original word as-is. Never invent names, numbers, or facts.',
  'Do not add or change any number, date, or proper noun that is not in the source.'
].join(' ');

/**
 * 한 줄을 위한 프롬프트. 맥락은 **앞 확정 문장 하나**뿐이다.
 * 용어집(16)이 있으면 그 강연의 용어 표를 같이 준다 — 이게 프로의 둘째 값이다.
 */
export function buildProPrompt({ text, sourceLang, targetLang, context, glossary }) {
  const lines = [];
  if (Array.isArray(glossary) && glossary.length) {
    const pairs = glossary
      .filter((g) => g && typeof g.src === 'string' && typeof g.dst === 'string')
      .slice(0, 100)
      .map((g) => `${g.src} = ${g.dst}`);
    if (pairs.length) lines.push(`Glossary for this talk (use exactly):\n${pairs.join('\n')}`);
  }
  if (typeof context === 'string' && context.trim()) {
    // ⓐ 앞 **확정 원문** 한 문장만. 번역문은 넣지 않는다.
    lines.push(`Previous sentence (context only, do not translate):\n${oneSentence(context)}`);
  }
  lines.push(`Translate from ${sourceLang || 'the source language'} to ${targetLang}:\n${text}`);
  return lines.join('\n\n');
}

/** 맥락은 **한 문장**이다. 길게 들어와도 여기서 자른다(ⓐ 를 코드로 못 박는다). */
export function oneSentence(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/^[\s\S]*?[.!?。！？…]["')\]]*\s/);
  const first = (m ? m[0] : t).trim();
  return first.slice(0, 400);
}

/** 글에서 숫자를 모은다 — 쉼표·공백은 버리고 자릿수만 본다(1,000 과 1000 을 같게). */
export function numbersOf(s) {
  const out = new Set();
  for (const m of String(s || '').matchAll(/\d[\d,.\s]*/g)) {
    const digits = m[0].replace(/[^\d]/g, '');
    if (digits) out.add(String(Number(digits)));
  }
  return out;
}

/**
 * 번역문에 **원문에 없는 숫자**가 생겼나 — 지어낸 것이다.
 * 빠진 것은 보지 않는다(언어에 따라 숫자를 글자로 쓰기도 한다). 생긴 것만 잡는다.
 */
export function inventedNumbers(src, out) {
  const a = numbersOf(src);
  const extra = [];
  for (const n of numbersOf(out)) if (!a.has(n)) extra.push(n);
  return extra;
}

/** 오늘(UTC) — 일일 상한을 세는 칸 이름 */
export function todayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * 공급자 한 곳만 안다 — 다른 공급자는 `LLM_PROVIDER` 와 이 함수에 더한다.
 * 스트리밍 아님(1차): 한 단위 한 응답.
 */
export async function callLlmOnce({ prompt, env, timeoutMs = 2000, fetchImpl }) {
  const key = (env.LLM_API_KEY || '').trim();
  if (!key) {
    const e = new Error('LLM_API_KEY is not set');
    e.why = PRO_FALLBACK.NO_KEY;
    throw e;
  }
  const provider = (env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
  const base = (env.LLM_BASE_URL || '').trim();
  const model = (env.LLM_MODEL || 'gemini-2.0-flash-lite').trim();
  const doFetch = fetchImpl || fetch;

  const ctl = new AbortController();
  // 2초 넘으면 **포기한다.** 기다리는 것이 손님에게는 고장이다(설계 4).
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let url, body, headers;
    if (provider === 'gemini') {
      url = `${base || 'https://generativelanguage.googleapis.com/v1beta'}/models/${model}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
      body = {
        systemInstruction: { parts: [{ text: PRO_SYSTEM_RULES }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, candidateCount: 1 }
      };
    } else {
      // OpenAI 꼴 — 다른 공급자도 대개 이 모양이다
      url = `${base || 'https://api.openai.com/v1'}/chat/completions`;
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      body = {
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: PRO_SYSTEM_RULES },
          { role: 'user', content: prompt }
        ]
      };
    }

    const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) {
      const e = new Error(`LLM upstream ${res.status}`);
      e.why = PRO_FALLBACK.ERROR;
      e.upstreamStatus = res.status;
      throw e;
    }
    const data = await res.json();
    let text = '';
    let tokIn = 0;
    let tokOut = 0;
    if (provider === 'gemini') {
      text = ((((data.candidates || [])[0] || {}).content || {}).parts || [])
        .map((p) => p && p.text).filter(Boolean).join('').trim();
      const u = data.usageMetadata || {};
      tokIn = Number(u.promptTokenCount || 0);
      tokOut = Number(u.candidatesTokenCount || 0);
    } else {
      text = (((data.choices || [])[0] || {}).message || {}).content || '';
      text = String(text).trim();
      const u = data.usage || {};
      tokIn = Number(u.prompt_tokens || 0);
      tokOut = Number(u.completion_tokens || 0);
    }
    // ⓒ 설명·따옴표를 붙여 보내는 모델이 있다 — 여기서 벗긴다
    text = stripWrapping(text);
    if (!text) {
      const e = new Error('LLM returned empty');
      e.why = PRO_FALLBACK.ERROR;
      throw e;
    }
    return { text, tokIn, tokOut };
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      const e = new Error(`LLM slower than ${timeoutMs}ms`);
      e.why = PRO_FALLBACK.SLOW;
      throw e;
    }
    if (!err.why) err.why = PRO_FALLBACK.ERROR;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** ⓒ — 따옴표로 감싸거나 "Translation:" 을 붙여 오는 것을 벗긴다 */
export function stripWrapping(s) {
  let t = String(s || '').trim();
  const pairs = [['"', '"'], ["'", "'"], ['“', '”'], ['「', '」'], ['『', '』']];
  // 따옴표 안에 머리말을 넣어 보내는 모델이 있다 — 벗기고 다시 본다(두 번이면 넉넉하다)
  for (let round = 0; round < 2; round++) {
    const before = t;
    t = t.replace(/^(translation|번역|翻訳|翻译)\s*[:：]\s*/i, '').trim();
    for (const [a, b] of pairs) {
      if (t.length >= 2 && t.startsWith(a) && t.endsWith(b)) { t = t.slice(1, -1).trim(); break; }
    }
    if (t === before) break;
  }
  return t;
}

/** 토큰을 돈으로 — 변수만 바꾸면 공급자를 갈아끼운다(마케팅이 요금표 확인 뒤) */
export function estimateUsd(tokIn, tokOut, env) {
  const inPer1M = Number(env.LLM_USD_PER_1M_IN || 0.075);
  const outPer1M = Number(env.LLM_USD_PER_1M_OUT || 0.30);
  return (tokIn / 1e6) * inPer1M + (tokOut / 1e6) * outPer1M;
}
