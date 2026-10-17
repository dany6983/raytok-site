/* relay/src/asr.js — `POST /asr/batch` 뼈대 (B 22, 2026-10-17)
 *
 * 설계(비공개): `raytok-native1/docs/design/post-asr.md` · 마스터 2026-10-17 12:45
 * 이 저장소는 공개다 — **방법은 여기 적지 않는다.** 이름과 위 경로만 둔다(§9).
 *
 * 이 파일이 지키는 것만 적는다:
 *   · `ASR_ENABLED` 가 아니면 서지 않는다 (지금 기본 꺼짐 — 진짜 엔진은 E-8 뒤)
 *   · 이용권 0x20 이 없으면 거절                      → 403 no_package
 *   · 올라온 소리가 200MB 를 넘으면 거절               → 413 asr_too_big
 *   · 오늘 쓴 돈이 `ASR_DAILY_CAP_USD` 를 넘으면 거절  → 503 asr_cap
 *   · 엔진이 답을 안 주면 **아무것도 지어내지 않는다** → 503 asr_unavailable (§20)
 *   · 소리는 **저장하지 않는다.** 이 함수는 storage 를 받아도 쓰지 않는다(보관 0, 시험이 센다)
 */

export const ASR_PRO_FLAG = 0x20;                    // 프로 이용권
export const ASR_MAX_BYTES = 200 * 1024 * 1024;      // 200MB
export const ASR_DEFAULT_CAP_USD = 1;                // 처음 1달러/일

/** 가짜 엔진 — 정해진 줄을 돌려준다. 진짜 GPU 워커는 E-8 이 주소를 정한 뒤 붙인다. */
export async function fakeAsrEngine(manifest) {
  return {
    engine: 'fake',
    usd: 0,
    lines: manifest.map((m, i) => ({
      t0: m.t0, t1: m.t1,
      text: `ASR_FAKE_${i + 1}`,
      lang: m.lang || 'ko',
      conf: 0
    }))
  };
}

const bad = (status, error, message, extra = {}) => ({ status, body: { error, message, ...extra } });

/**
 * @param enabled      env.ASR_ENABLED 가 켜졌나 (문자열 '1'·'true' 를 index.js 가 판정해 넘긴다)
 * @param licFlags     토큰의 이용권 플래그
 * @param manifest     [{file, t0, t1, lang?}] — 토막 목록
 * @param totalBytes   올라온 소리의 바이트 합
 * @param capUsd       일일 상한(달러)
 * @param spentToday   오늘 이미 쓴 돈(달러)
 * @param engine       async (manifest) => {engine, usd, lines}
 * @param storage      넘겨도 **쓰지 않는다**. 보관 0 을 시험이 확인하는 자리다
 */
export async function handleAsrBatch({
  enabled = false,
  licFlags = 0,
  manifest = null,
  totalBytes = 0,
  capUsd = ASR_DEFAULT_CAP_USD,
  spentToday = 0,
  engine = fakeAsrEngine,
  storage = null            // eslint-disable-line no-unused-vars — 일부러 쓰지 않는다
} = {}) {
  if (enabled !== true) {
    return bad(503, 'asr_disabled', 'ASR_ENABLED 가 켜져 있지 않습니다.');
  }
  if ((Number(licFlags) & ASR_PRO_FLAG) === 0) {
    return bad(403, 'no_package', 'Post-ASR requires the pro package (0x20)', { why: 'no_package', need: '0x20' });
  }
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return bad(400, 'bad_manifest', 'manifest 는 [{file, t0, t1}] 배열이어야 합니다.', { why: 'bad_manifest' });
  }
  for (const [i, m] of manifest.entries()) {
    if (!m || typeof m.file !== 'string' || !m.file ||
        !Number.isFinite(Number(m.t0)) || !Number.isFinite(Number(m.t1)) ||
        Number(m.t1) < Number(m.t0)) {
      return bad(400, 'bad_manifest', `manifest[${i}] 가 {file, t0, t1} 모양이 아닙니다.`, { why: 'bad_manifest', at: i });
    }
  }
  if (Number(totalBytes) > ASR_MAX_BYTES) {
    return bad(413, 'asr_too_big', '올린 소리가 한 번에 받는 크기를 넘습니다.',
               { why: 'asr_too_big', limit: ASR_MAX_BYTES, got: Number(totalBytes) });
  }
  if (Number(spentToday) >= Number(capUsd)) {
    return bad(503, 'asr_cap', '오늘 몫을 다 썼습니다.', { why: 'asr_cap', cap_usd: Number(capUsd) });
  }

  let out = null;
  try {
    out = await engine(manifest);
  } catch (e) {
    /* 엔진이 못 하면 **빈손으로 돌려준다.** 지어낸 줄을 주면 실시간본보다 나쁘다(§20·R-15). */
    return bad(503, 'asr_unavailable', `엔진이 답하지 않았습니다: ${(e && e.message) || e}`, { why: 'asr_unavailable' });
  }
  if (!out || !Array.isArray(out.lines)) {
    return bad(503, 'asr_unavailable', '엔진이 줄 목록을 주지 않았습니다.', { why: 'asr_unavailable' });
  }

  /* 빈 줄은 버린다 — 버린 수를 **숨기지 않고 센다**(몇 줄이 비었는지가 다음 판단의 근거다) */
  const lines = [];
  let dropped = 0;
  for (const l of out.lines) {
    const text = typeof l.text === 'string' ? l.text.trim() : '';
    if (!text) { dropped += 1; continue; }
    lines.push({
      t0: Number(l.t0), t1: Number(l.t1), text,
      lang: typeof l.lang === 'string' && l.lang ? l.lang : 'und',
      conf: Number.isFinite(Number(l.conf)) ? Number(l.conf) : 0
    });
  }

  return {
    status: 200,
    body: {
      ok: true,
      engine: out.engine || 'unknown',
      lines,
      dropped,
      chunks: manifest.length,
      bytes_in: Number(totalBytes),
      usd: Number(out.usd || 0),
      kept: 0            // 서버가 들고 있는 소리 — 늘 0 이다
    }
  };
}
