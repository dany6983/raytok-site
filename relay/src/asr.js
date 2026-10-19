/* relay/src/asr.js — `POST /asr/batch` (B 22 뼈대 → B 18 정본 꼴, 2026-10-19)
 *
 * 설계(비공개): `raytok-native1/docs/design/post-asr.md` · 마스터 2026-10-17 12:45
 * 줄 JSON 꼴 정본: 엔진 저장소 `postasr/README.md` + 검사기 `postasr/validate.mjs`
 *   → 검사기를 `relay/src/postasr-shape.js` 로 가져왔고, 시험이 **우리 답을 그 검사기에 넣는다.**
 * 이 저장소는 공개다 — **방법은 여기 적지 않는다.** 이름과 위 경로만 둔다(§9).
 *
 * 이 파일이 지키는 것만 적는다:
 *   · `ASR_ENABLED` 가 아니면 서지 않는다                → 503 asr_disabled
 *   · 이용권 0x20 이 없으면 거절                          → 403 no_package
 *   · 요청이 정본 꼴이 아니면 거절                        → 400 bad_manifest
 *   · 올라온 소리가 200MB 를 넘으면 거절                  → 413 too_large
 *   · 오늘 쓴 돈이 `ASR_DAILY_CAP_USD` 를 넘으면 거절      → 503 asr_cap
 *   · 엔진이 늦으면 timeout, 못 서면 worker_down — **아무것도 지어내지 않는다**(§20·R-15)
 *   · 소리는 **저장하지 않는다.** 이 함수는 storage 를 받아도 쓰지 않는다(보관 0, 시험이 센다)
 *
 * ★ 모름을 값으로 바꾸지 않는다 (D-70 · §20). 엔진이 `conf` 를 안 주면 **`null` 이 정상**이고,
 *   줄 언어를 모르면 **`null`** 이다. 전에는 `conf: 0`(확신도 0 이라는 거짓)과 `lang: 'und'`
 *   (정본이 두 글자만 받는다)로 **채워** 넣고 있었다 — 정본 검사기가 그것을 거른다.
 */
import { checkRequest } from './postasr-shape.js';

export const ASR_PRO_FLAG = 0x20;                    // 프로 이용권
export const ASR_MAX_BYTES = 200 * 1024 * 1024;      // 200MB
export const ASR_DEFAULT_CAP_USD = 1;                // 처음 1달러/일

/** 엔진이 늦었다는 표 — 부르는 쪽이 이 이름을 던지면 timeout 으로 답한다. */
export class AsrTimeout extends Error {
  constructor(ms) { super(`엔진이 ${ms}ms 안에 답하지 않았습니다.`); this.name = 'AsrTimeout'; }
}

/** 가짜 엔진 — 정해진 줄을 돌려준다. 진짜 GPU 워커는 E-8 이 주소를 정한 뒤 붙인다.
 *  `conf` 는 **null** 이다 — 지금 엔진이 줄 단위 확신도를 주지 않는다(정본 4장). */
export async function fakeAsrEngine(req) {
  return {
    engine: 'fake',
    lang: req.lang ?? null,
    usd: 0,
    lines: req.segments.map((s, i) => ({
      t0: s.t0, t1: s.t1,
      text: `ASR_FAKE_${i + 1}`,
      lang: req.lang ?? null,
      conf: null
    }))
  };
}

const bad = (status, error, message, extra = {}) => ({ status, body: { error, message, ...extra } });

/** 두 글자 언어 코드만 통과시킨다. 모르면 null — **채우지 않는다**(D-70). */
const lang2 = (v) => (typeof v === 'string' && /^[a-z]{2}$/.test(v) ? v : null);
/** 0~1 수이거나 null. 엔진이 안 주면 null 로 둔다 — 0 은 "확신도 0" 이라는 **다른 말**이다. */
const conf01 = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

/**
 * @param enabled      env.ASR_ENABLED 가 켜졌나 (문자열 '1'·'true' 를 index.js 가 판정해 넘긴다)
 * @param licFlags     토큰의 이용권 플래그
 * @param req          정본 1장의 요청 객체 `{sessionId, lang, clockBaseMs, segments[]}`
 * @param totalBytes   올라온 소리의 바이트 합
 * @param capUsd       일일 상한(달러)
 * @param spentToday   오늘 이미 쓴 돈(달러)
 * @param engine       async (req) => {engine, lang?, usd?, lines[], stats?}
 * @param now          시계 (시험이 computeSec 을 고정하려고 넘긴다)
 * @param storage      넘겨도 **쓰지 않는다**. 보관 0 을 시험이 확인하는 자리다
 */
export async function handleAsrBatch({
  enabled = false,
  licFlags = 0,
  req = null,
  totalBytes = 0,
  capUsd = ASR_DEFAULT_CAP_USD,
  spentToday = 0,
  engine = fakeAsrEngine,
  now = () => Date.now(),
  storage = null            // eslint-disable-line no-unused-vars — 일부러 쓰지 않는다
} = {}) {
  if (enabled !== true) {
    return bad(503, 'asr_disabled', 'ASR_ENABLED 가 켜져 있지 않습니다.');
  }
  if ((Number(licFlags) & ASR_PRO_FLAG) === 0) {
    return bad(403, 'no_package', 'Post-ASR requires the pro package (0x20)', { why: 'no_package', need: '0x20' });
  }

  /* 요청 꼴은 **정본 검사기**가 본다. 우리가 따로 센 적이 있었고(뼈대), 둘이 어긋나면
     한쪽만 고쳐질 자리다(§4) — 그래서 세는 곳을 하나로 둔다. */
  const reqBad = checkRequest(req);
  if (reqBad.length) {
    return bad(400, 'bad_manifest', '요청이 줄 JSON 정본 꼴이 아닙니다.',
               { why: 'bad_manifest', detail: reqBad });
  }
  if (Number(totalBytes) > ASR_MAX_BYTES) {
    return bad(413, 'too_large', '올린 소리가 한 번에 받는 크기를 넘습니다.',
               { why: 'too_large', limit: ASR_MAX_BYTES, got: Number(totalBytes) });
  }
  if (Number(spentToday) >= Number(capUsd)) {
    return bad(503, 'asr_cap', '오늘 몫을 다 썼습니다.', { why: 'asr_cap', cap_usd: Number(capUsd) });
  }

  const t0 = now();
  let out = null;
  try {
    out = await engine(req);
  } catch (e) {
    /* 엔진이 못 하면 **빈손으로 돌려준다.** 지어낸 줄을 주면 실시간본보다 나쁘다(§20·R-15).
       늦은 것과 안 선 것을 가른다 — 앱이 할 일이 같지 않다(정본 6장의 표). */
    const late = e && (e.name === 'AsrTimeout' || e.name === 'AbortError' || e.name === 'TimeoutError');
    return late
      ? bad(504, 'timeout', `엔진이 제 때 답하지 않았습니다: ${(e && e.message) || e}`, { why: 'timeout' })
      : bad(503, 'worker_down', `엔진이 서지 않았습니다: ${(e && e.message) || e}`, { why: 'worker_down' });
  }
  if (!out || !Array.isArray(out.lines)) {
    return bad(503, 'worker_down', '엔진이 줄 목록을 주지 않았습니다.', { why: 'worker_down' });
  }
  const computeSec = Math.max(0, (now() - t0) / 1000);

  /* 빈 줄은 버린다 — 버린 수를 **숨기지 않고 센다**(몇 줄이 비었는지가 다음 판단의 근거다).
     `lines: []` 는 오류가 아니다(정본 2장: 말이 없었으면 빈 배열). */
  const lines = [];
  let dropped = 0;
  for (const l of out.lines) {
    const text = typeof l.text === 'string' ? l.text.trim() : '';
    if (!text) { dropped += 1; continue; }
    lines.push({
      t0: Number(l.t0), t1: Number(l.t1), text,
      lang: lang2(l.lang),
      conf: conf01(l.conf)
    });
  }

  /* stats — 엔진이 준 것이 정본 꼴이면 그것을 쓰고, 없으면 우리가 잰다.
     소리 길이가 0 이면 rtf 를 **만들지 않는다**(0 으로 나눈 값을 적으면 거짓이다). */
  let stats = null;
  const audioSec = req.segments.reduce((a, s) => a + (Number(s.t1) - Number(s.t0)), 0);
  if (out.stats && Number.isFinite(Number(out.stats.audioSec))) {
    stats = out.stats;
  } else if (audioSec > 0) {
    stats = { audioSec, computeSec, rtf: computeSec / audioSec };
  }

  return {
    status: 200,
    body: {
      /* 정본 2장 */
      engine: out.engine || 'unknown',
      lang: lang2(out.lang ?? req.lang),
      lines,
      ...(stats ? { stats } : {}),
      /* 릴레이가 더 얹는 것 — 정본은 모르는 칸을 탓하지 않는다(검사기가 아는 칸만 본다) */
      ok: true,
      dropped,
      chunks: req.segments.length,
      bytes_in: Number(totalBytes),
      usd: Number(out.usd || 0),
      kept: 0            // 서버가 들고 있는 소리 — 늘 0 이다
    }
  };
}
