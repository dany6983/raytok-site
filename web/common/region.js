/* RULE: P-16
 *
 * 브라우저 음성 인식은 클라우드다(구글·애플 서버). 그래서 **말하는 쪽 브라우저의 🎤 는
 * 국내에서만 켠다.** 해외는 특허 세션 답이 올 때까지 원고 모드만 쓴다.
 * (MASTER 2026-10-14 22:55 ④ — 조건은 **이 한 곳**에 두고 시험이 센다.)
 *
 * 켜는 조건 둘 중 하나:
 *   ① 브라우저 언어가 ko (ko, ko-KR …)
 *   ② 이용권 토큰에 KR 표시 (payload.region === 'KR')
 *
 * 시험·시연용으로 `?region=` 을 받는다 — 운영 화면에서 손님이 쓸 일은 없고,
 * 이 값이 없으면 위 둘로만 정한다.
 */
(function (global) {
  'use strict';

  function fromQuery() {
    try {
      return new URLSearchParams(global.location.search).get('region') || '';
    } catch (_) {
      return '';
    }
  }

  function fromNavigator() {
    try {
      return (global.navigator && global.navigator.language) || '';
    } catch (_) {
      return '';
    }
  }

  /* 토큰은 JSON 한 덩이거나 payload 를 가진 것 — 둘 다 받는다. 서명은 보지 않는다
     (서명은 릴레이 몫이다. 여기서는 화면을 켤지만 정한다). */
  function fromToken(token) {
    if (!token) return '';
    try {
      const t = typeof token === 'string' ? JSON.parse(token) : token;
      return (t && (t.region || (t.payload && t.payload.region))) || '';
    } catch (_) {
      return '';
    }
  }

  const Region = {
    /** 지금 화면이 국내인가 — 🎤 를 켤지 정하는 **하나뿐인** 자리 */
    isKR: function (opts) {
      const o = opts || {};
      const forced = o.region || fromQuery();
      if (forced) return String(forced).toUpperCase() === 'KR';
      if (String(fromToken(o.token)).toUpperCase() === 'KR') return true;
      return /^ko\b/i.test(fromNavigator());
    },

    /** 왜 꺼졌는지 — 화면에 한 줄로 보일 때 쓴다 */
    whyOff: function (opts) {
      return this.isKR(opts) ? '' : 'p16_region_not_kr';
    }
  };

  global.rtRegion = Region;
  if (typeof module !== 'undefined' && module.exports) module.exports = Region;
})(typeof window !== 'undefined' ? window : globalThis);
