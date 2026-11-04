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


  /* ── 말하는 언어가 **틀리게 잡힌 것**을 알아채는 표 (11-04 실기) ──
   *
   * 왜 생겼나: 강사 화면의 「내가 말하는 언어」는 82줄짜리 고르개 하나뿐이고,
   * 고른 뒤에는 **어디에도 다시 보이지 않는다.** 11-04 세션 KFT4TM 에서 그 값이
   * `ms`(말레이어)로 넘어가 있었고, 한국어를 말하는데 받아쓰기가 `serial`·`one`·`s`
   * 로 떨어졌다. 두 화면 어디에도 "왜 이러는지"를 말해 주는 줄이 없었다.
   *
   * 고치지 않는다 — **알리기만 한다.** 글자만 보고 말을 바꾸면, 한국어 강의에 섞인
   * 영어 한 줄이 언어를 되돌려 버린다(D-11: 추측으로 인식기를 설계하지 않는다).
   *
   * 표에는 **글자만 보고 확실히 가를 수 있는 것**만 넣는다. 한자(Han)는 중국어·일본어가
   * 같이 쓰므로 넣지 않는다 — 가를 수 없는 것을 가르면 거짓 경고가 난다.
   */
  var SCRIPTS = [
    { id: 'hangul',   re: /[\uAC00-\uD7A3\u1100-\u11FF]/g,              langs: ['ko'] },
    { id: 'kana',     re: /[\u3040-\u309F\u30A0-\u30FF]/g,              langs: ['ja'] },
    { id: 'cyrillic', re: /[\u0400-\u04FF]/g,                           langs: ['ru','uk','bg','sr','mk','be','kk','ky','mn','tg'] },
    { id: 'arabic',   re: /[\u0600-\u06FF\u0750-\u077F]/g,              langs: ['ar','fa','ur','ps','sd','ug'] },
    { id: 'hebrew',   re: /[\u0590-\u05FF]/g,                           langs: ['he','yi'] },
    { id: 'thai',     re: /[\u0E00-\u0E7F]/g,                           langs: ['th'] },
    { id: 'deva',     re: /[\u0900-\u097F]/g,                           langs: ['hi','mr','ne','sa','bho','mai'] },
    { id: 'greek',    re: /[\u0370-\u03FF]/g,                           langs: ['el'] }
  ];

  /** 글자 수가 이보다 적으면 보지 않는다 — 짧은 줄은 우연히 섞인다 */
  var MIN_CHARS = 8;
  /** 한 문자 계열이 이 비율을 넘어야 "이 글자로 쓰였다"고 본다 */
  var MIN_SHARE = 0.4;

  function dominantScript(text) {
    var t = String(text == null ? '' : text);
    if (t.replace(/\s/g, '').length < MIN_CHARS) return '';
    var best = '', bestN = 0, total = t.replace(/\s/g, '').length;
    for (var i = 0; i < SCRIPTS.length; i++) {
      var m = t.match(SCRIPTS[i].re);
      var n = m ? m.length : 0;
      if (n > bestN) { bestN = n; best = SCRIPTS[i].id; }
    }
    if (!best || bestN / total < MIN_SHARE) return '';
    return best;
  }

  var RecLang = {
    /** 인식기에 넘길 태그. 표에 없으면 받은 코드를 그대로 돌려준다. */
    tag: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return '';
      return EXPLICIT[c] || c;
    },
    /** 받아쓴 글자가 쓰는 문자 계열. 가를 수 없으면 '' */
    scriptOf: function (text) { return dominantScript(text); },
    /**
     * 받아쓴 글이 **고른 언어의 글자가 아닌가** — 맞으면 바뀐 말 후보를 함께 준다.
     * 가를 수 없을 때는 언제나 `null` 이다(모르면 아무 말도 하지 않는다).
     * @returns {null|{script:string, got:string[], want:string}}
     */
    mismatch: function (code, text) {
      var want = String(code == null ? '' : code).trim();
      if (!want) return null;
      var id = dominantScript(text);
      if (!id) return null;
      for (var i = 0; i < SCRIPTS.length; i++) {
        if (SCRIPTS[i].id !== id) continue;
        if (SCRIPTS[i].langs.indexOf(want) !== -1) return null;   // 고른 말이 이 글자를 쓴다 — 맞다
        return { script: id, got: SCRIPTS[i].langs.slice(), want: want };
      }
      return null;
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
