/**
 * 원고 자동 넘김 — **판정 한 곳** (정본 `docs/design/web-lecture-one-page.md` §1 ④).
 *
 * 묻는 것 둘:
 *  ① *이 문단을 보여 준 뒤 몇 밀리초 있다가 다음으로 넘기나?* (`paraMs`)
 *  ② *멈췄다 다시 켤 때 어느 문단부터인가?* (`resumeFrom`)
 *
 * 화면은 이 답만 쓴다 — 시간 셈을 `web/host/index.html` 안에 두면 시험이 돌 수 없고,
 * 조이개를 고칠 자리가 둘이 된다(§4: 읽는 곳·쓰는 곳을 전부 센다).
 *
 * ## 글자 수 속도 — `CPS` 는 **조이개**이고 추측이다
 * 사람이 소리내어 읽는 속도는 언어·사람마다 다르다. 지금 값은 한국어 낭독 어림이고,
 * **실기 기록(`play_tick` 의 `ms`·`chars`)으로 고친다** — 코드 안에서 언어로 분기하지
 * 않는다(§6). 대표님 결정: 기본 **1.0배**, 0.8~1.5배(정본 §6 ③).
 *
 * ## 멈춤은 **잃지 않는다**
 * 🎤 끼어들기로 멈춘 문단을 기억하고, 다시 켤 때 **그 문단부터** 간다. 그 사이 사람이
 * 딴 문단을 보고 있었으면 멈춘 문단을 **다시 보낸다** — 손님이 그 문단을 건너뛰는 것보다
 * 두 번 보는 쪽이 낫다(R-15: 유실 > 지연).
 */
(function (global) {
  'use strict';

  /** 1초에 읽는 글자 수(어림) · 한 문단의 최소·최대 머무름 */
  var CPS = 5.5;
  var MIN_MS = 1500;
  /* 상한은 **긴 문단을 자르지 않을 만큼** 커야 한다 — 400자(강연에서 흔하다)는 1.0배로
   * 약 73초다. 30초로 잡았더니 강사가 아직 읽는 중에 다음 문단이 손님에게 갔다(시험이 잡았다). */
  var MAX_MS = 120000;

  /** 대표님 결정(정본 §6 ③) — 기본 1.0배, 고를 수 있는 범위 0.8~1.5배 */
  var DEFAULT_RATE = 1.0;
  var RATE_MIN = 0.8;
  var RATE_MAX = 1.5;
  var RATES = [0.8, 1.0, 1.25, 1.5];

  /** 고른 배속을 범위 안으로. 숫자가 아니면 기본값 — **빈 답을 0 으로 읽지 않는다**(§20) */
  function clampRate(r) {
    var v = Number(r);
    if (!isFinite(v) || v <= 0) return DEFAULT_RATE;
    if (v < RATE_MIN) return RATE_MIN;
    if (v > RATE_MAX) return RATE_MAX;
    return v;
  }

  /** 글자 수로 머무는 시간. 배속이 클수록 짧다. 빈 문단도 최소 시간은 머문다 */
  function paraMs(text, rate) {
    var chars = String(text == null ? '' : text).trim().length;
    var ms = (chars / CPS) * 1000 / clampRate(rate);
    if (!isFinite(ms) || ms < MIN_MS) ms = MIN_MS;
    if (ms > MAX_MS) ms = MAX_MS;
    return Math.round(ms);
  }

  /** 다음에 갈 문단. 마지막이면 `null` — 부르는 쪽이 재생을 끈다 */
  function nextPara(opts) {
    var o = opts || {};
    var total = Math.max(0, Math.floor(Number(o.total) || 0));
    var cur = Math.max(0, Math.floor(Number(o.cur) || 0));
    var n = cur + 1;
    return n >= 1 && n <= total ? n : null;
  }

  /**
   * 다시 켤 때 어디부터인가.
   * - 멈춘 문단을 모르면 지금 자리에서 이어 간다 (`go:false`)
   * - 멈춘 문단이 지금 자리와 같으면 그대로 이어 간다 (`go:false`)
   * - 다르면 멈춘 문단으로 **되돌아가서** 다시 보낸다 (`go:true`)
   */
  function resumeFrom(opts) {
    var o = opts || {};
    var total = Math.max(0, Math.floor(Number(o.total) || 0));
    var cur = Math.max(0, Math.floor(Number(o.cur) || 0));
    var at = Math.floor(Number(o.pausedAt) || 0);
    if (!(at >= 1 && at <= total)) return { go: false, para: cur };
    if (at === cur) return { go: false, para: cur };
    return { go: true, para: at };
  }

  var API = { CPS: CPS, MIN_MS: MIN_MS, MAX_MS: MAX_MS,
              DEFAULT_RATE: DEFAULT_RATE, RATE_MIN: RATE_MIN, RATE_MAX: RATE_MAX, RATES: RATES,
              clampRate: clampRate, paraMs: paraMs, nextPara: nextPara, resumeFrom: resumeFrom };

  global.rtScriptPlay = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
