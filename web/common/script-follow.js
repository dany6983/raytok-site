/**
 * 원고 따라가기 — **웹 쪽 구현** (마스터 2026-10-20 02:45 판정 ⓐ "웹도 같게").
 *
 * 묻는 것 하나: *들린 확정 문장이 **원고 밖**인가?* 밖이면 손님에게 보내고, 아니면
 * 보내지 않는다 — 문단은 이미 **검수 번역문**으로 갔으니 또 보내면 손님 화면에 두 번 뜬다.
 *
 * ## 왜 같은 코드를 두 번 쓰나
 * 앱(`raytok-native` `src/scriptFollow.js`)과 이 파일은 **다른 저장소**라 코드를 공유할
 * 수 없다. 그래서 **사례 표를 공유한다**: `samples/script-follow-cases.json` 은 앱의
 * `docs/samples/script-follow-cases.json` 과 **같은 파일**이고, 두 쪽 시험이 같은 표를
 * 먹인다. 한쪽만 고치면 그쪽이 붉어진다.
 *
 * 문턱 값과 세는 법의 **원본은 한 문서**다: 앱 저장소 `docs/design/script-follow.md`.
 * 숫자를 여기서 바꾸지 않는다 — 그 문서를 고치고 두 저장소를 같은 날 맞춘다.
 *
 * ## 웹은 문단을 **단추로** 넘긴다
 * 앱은 들린 말로 문단을 자동으로 따라가지만, 웹 강사 화면은 사람이 「다음」을 누른다.
 * 그래서 이 파일은 **상태를 바꾸지 않는다** — "이 말이 원고 밖인가"만 답한다(`offScript`).
 * 넘기는 규칙을 웹에 새로 들이면 두 화면의 동작이 갈린다(§5).
 */
(function (global) {
  'use strict';

  /** 1차 문턱 — 원본: 앱 `docs/design/script-follow.md` §2 */
  var FOLLOW = {
    next: 0.6,
    tailFrac: 0.4,
    break: 0.25,
    breakRun: 2,
    resume: 0.5
  };

  var PUNCT = /[\s.,!?;:·、。！？，；：…"'"'`()[\]{}〈〉《》「」『』【】\-—–/\\|~*#@$%^&+=<>]+/g;

  function bigrams(one) {
    if (one.length < 2) return [one];
    var out = [];
    for (var i = 0; i + 1 < one.length; i += 1) out.push(one.slice(i, i + 2));
    return out;
  }

  /**
   * 낱말 나누기 — 언어 **이름**으로 가르지 않는다(§6). 글자를 본다.
   * ⚠ 띄어쓰기가 있었는지는 **구두점을 지우기 전에** 본다 — 지운 뒤 조각 수로 가르면
   * 일본어의 `、` 하나가 조각을 둘로 만들어 "띄어쓰기 체계"로 오인된다.
   */
  function wordsOf(text) {
    var raw = String(text == null ? '' : text).toLowerCase();
    var s = raw.replace(PUNCT, ' ').trim();
    if (!s) return [];
    var parts = s.split(' ').filter(Boolean);
    if (/\s/.test(raw.trim())) return parts;
    return parts.reduce(function (all, one) { return all.concat(bigrams(one)); }, []);
  }

  /** 겹침 비율 — **들린 말 쪽을 분모로**, 같은 낱말은 한 번만 */
  function matchRate(heard, para) {
    var h = wordsOf(heard);
    if (!h.length) return 0;
    var bag = {};
    wordsOf(para).forEach(function (w) { bag[w] = 1; });
    if (!Object.keys(bag).length) return 0;
    var seen = {};
    var hit = 0;
    var n = 0;
    h.forEach(function (w) {
      if (seen[w]) return;
      seen[w] = 1;
      n += 1;
      if (bag[w]) hit += 1;
    });
    return n ? hit / n : 0;
  }

  /** 문단의 **끝쪽** 낱말만 — 다 읽었는지는 끝을 봐야 안다 */
  function tailOf(para, frac) {
    var w = wordsOf(para);
    if (!w.length) return '';
    var f = typeof frac === 'number' ? frac : FOLLOW.tailFrac;
    var n = Math.max(1, Math.round(w.length * f));
    return w.slice(w.length - n).join(' ');
  }

  var srcAt = function (paras, n) {
    var p = (paras || []).filter(function (x) { return Number(x && x.n) === n; })[0];
    return p ? String(p.src || '') : '';
  };

  /**
   * **이 말이 원고 밖인가** — 앱 `followStep` 의 `off` 와 같은 답을 낸다.
   *
   * `state` = `{ para, broke, miss }` (para 0 = 아직 시작 전). 상태는 **바꾸지 않는다** —
   * 다음 `miss` 값만 함께 돌려주어 부르는 쪽이 세어 둘 수 있게 한다.
   */
  function offScript(state, heard, paras, th) {
    var t = th || FOLLOW;
    var st = state || {};
    var para = Number(st.para) || 0;
    var miss = Number(st.miss) || 0;
    var cur = srcAt(paras, para);
    var nextN = para + 1;
    var nxt = srcAt(paras, nextN);
    var mCurTail = cur ? matchRate(heard, tailOf(cur, t.tailFrac)) : 0;
    var mCur = cur ? matchRate(heard, cur) : 0;
    var mNext = nxt ? matchRate(heard, nxt) : 0;
    var best = Math.max(mCur, mNext);

    if (st.broke) {
      /* 끼어든 중 — 원고 말이 다시 들리면 그 줄은 원고다(보내지 않는다) */
      if (best >= t.resume) return { off: false, why: 'resume', miss: 0, match: best };
      return { off: true, why: 'broke', miss: 0, match: best };
    }
    if (!para) {
      if (nxt && mNext >= t.break) return { off: false, why: 'open', miss: 0, match: mNext };
      return { off: true, why: 'before', miss: miss, match: best };
    }
    if (nxt && mNext >= t.next && mNext > mCurTail) return { off: false, why: 'next', miss: 0, match: mNext };
    if (nxt && mCurTail >= t.next) return { off: false, why: 'tail', miss: 0, match: mCurTail };
    if (best < t.break) {
      var m2 = miss + 1;
      return { off: true, why: m2 >= t.breakRun ? 'break' : 'miss', miss: m2 >= t.breakRun ? 0 : m2,
               match: best };
    }
    /* 맞는데 아직 그 문단 안이다 — 그 문단은 이미 번역문으로 갔다 */
    return { off: false, why: 'inside', miss: 0, match: best };
  }

  var API = { FOLLOW: FOLLOW, wordsOf: wordsOf, matchRate: matchRate, tailOf: tailOf,
              offScript: offScript };

  global.rtScriptFollow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
