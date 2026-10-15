/* 브라우저 음성 인식(Web Speech)에 넘길 언어 표 — 한 곳.
 *
 * 왜 표인가 (AGENTS §6): 전에는 `SRC_LANG === 'ko' ? 'ko-KR' : SRC_LANG` 처럼
 * **언어 이름이 분기 조건**에 있었다. 언어가 분기에 나오면 그 언어만 고치게 되고,
 * 같은 값을 읽는 곳(말하는 쪽 호스트 · 질문하는 청취자)이 서로 달라진다.
 * 그래서 값은 여기서만 만들고 두 화면이 같이 읽는다.
 *
 * 표에 **없는 언어는 코드를 그대로 넘긴다.** 지역표(ko-KR 꼴)를 지어내지 않는다 —
 * 실기로 확인한 것만 넣는다(D-11 "추측으로 인식기를 설계하지 않는다").
 * 새 줄을 넣을 근거는 실기 기록(reclog)의 `glass_mic`·`error` 줄이다.
 */
(function (global) {
  'use strict';

  // 실기로 확인된 것만. 늘릴 때는 어느 기록에서 봤는지 같이 적는다.
  var EXPLICIT = {
    ko: 'ko-KR'   // 10-14 B 9 웹 호스트 실기 — 맨 코드(ko)로도 열렸지만 ko-KR 로 썼고 그대로 돈다
  };

  var RecLang = {
    /** 인식기에 넘길 태그. 표에 없으면 받은 코드를 그대로 돌려준다. */
    tag: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return '';
      return EXPLICIT[c] || c;
    },
    /** 표에 명시된 줄인가 — 시험이 센다 */
    isExplicit: function (code) {
      return Object.prototype.hasOwnProperty.call(EXPLICIT, String(code || '').trim());
    },
    explicitCodes: function () {
      return Object.keys(EXPLICIT);
    }
  };

  global.rtRecLang = RecLang;
  if (typeof module !== 'undefined' && module.exports) module.exports = RecLang;
})(typeof window !== 'undefined' ? window : globalThis);
