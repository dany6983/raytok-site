/* 대체어 표 — 생성된 파일. 손대지 않는다: node tools/build-voice-fallback.js --write
   원본: 앱 src/offlineLangs.js · 설계: 앱 docs/design/voice-fallback.md */
(function (global) {
  'use strict';

  var FALLBACK_CHOICES = {"az":["tr"],"kk":["ru"],"ky":["ru"],"lo":["th"],"mn":["ru"],"ne":["hi"],"tet":["id"],"tg":["ru"]};

  var SCRIPT_OF = {"az":"latn","hi":"deva","id":"latn","kk":"cyrl","ky":"cyrl","lo":"laoo","mn":"cyrl","ne":"deva","ru":"cyrl","tet":"latn","tg":"cyrl","th":"thai","tr":"latn"};

  var FINGERPRINT = 'f55bda4097f301d3';

  function base(lang) {
    return String(lang || '').toLowerCase().split(/[-_]/)[0];
  }

  /** 그 언어가 쓰는 꼴 — 표에 없으면 '' (모름) */
  function scriptOf(lang) {
    return SCRIPT_OF[base(lang)] || '';
  }

  /**
   * 이 언어를 **소리로** 읽을 대체어 — 없으면 ''.
   *
   * 셋을 다 봐야 '' 가 아니다: ① 표에 짝이 있나 ② 두 꼴을 **둘 다 아나** ③ 같은 꼴인가.
   * 모르는 꼴을 "같다"로 읽으면 침묵이 소리로 둔갑한다(§20).
   */
  function voiceFallbackFor(lang) {
    var k = base(lang);
    var to = base((FALLBACK_CHOICES[k] || [])[0] || '');
    if (!to) return '';
    var a = scriptOf(k);
    var b = scriptOf(to);
    if (!a || !b || a !== b) return '';
    return to;
  }

  var API = { FALLBACK_CHOICES: FALLBACK_CHOICES, SCRIPT_OF: SCRIPT_OF,
              FINGERPRINT: FINGERPRINT, scriptOf: scriptOf, voiceFallbackFor: voiceFallbackFor };

  global.rtVoiceFallback = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
