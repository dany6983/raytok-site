/**
 * 대체어 표 — **생성된 파일이다. 손으로 고치지 않는다.**
 *
 *   node tools/build-voice-fallback.js --write
 *
 * 원본: 앱 저장소 `src/offlineLangs.js` (`FALLBACK_CHOICES` · `SCRIPT_OF`).
 * 설계: 앱 `docs/design/voice-fallback.md` — 숫자와 짝을 여기서 바꾸지 않는다.
 *
 * ★ 음성 대체는 **꼴이 같을 때만** 된다 (설계 §3). 타이 음성은 라오 글자를 못 읽으므로
 * `lo→th` 는 **글자 대체는 되고 음성 대체는 안 된다.** 그 판정은 `voiceFallbackFor`
 * 한 곳에 있다 — 부르는 쪽이 꼴을 다시 세지 않는다(D-193).
 *
 * 지문 `FINGERPRINT` 는 표 둘을 한 줄로 굳혀 해시한 것이다. `samples/voice_fallback_test.js`
 * 가 앱 파일에서 다시 세어 이 값과 맞댄다 — 손으로 고치면 그 자리에서 붉어진다.
 */
(function (global) {
  'use strict';

  /** 글자 대체 짝 (앱 표 그대로) */
  var FALLBACK_CHOICES = {
    "az": ["tr"],
    "kk": ["ru"],
    "ky": ["ru"],
    "lo": ["th"],
    "mn": ["ru"],
    "ne": ["hi"],
    "tet": ["id"],
    "tg": ["ru"],
  };

  /** 언어가 쓰는 글자 꼴 (앱 표 그대로) · 모르는 언어는 칸이 없다 */
  var SCRIPT_OF = {
    "az": "latn",
    "hi": "deva",
    "id": "latn",
    "kk": "cyrl",
    "ky": "cyrl",
    "lo": "laoo",
    "mn": "cyrl",
    "ne": "deva",
    "ru": "cyrl",
    "tet": "latn",
    "tg": "cyrl",
    "th": "thai",
    "tr": "latn",
  };

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
