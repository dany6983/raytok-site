/* web/common/tts-guard.js — 손님 소리 지킴 (NOW 11-03 18:45 ③④) · 손님 페이지가 **들어갈 때** 싣는다
 *
 * 왜 따로: 첫 화면 gz 37KB 한도(10-27 01:20 ⑤) — 손님 페이지 안에 두면 0.7KB 넘는다. 언어 고르기
 * 화면에는 필요 없고, 방에 들어가 소리를 낼 때만 쓴다. **못 실으면**(404·느린 망) 페이지는 옛 판대로
 * 읽는다 — 반쯤 바뀐 상태가 아니다(D-32).
 *
 * ③ TTS 완료 신호 감시견 — 크롬 안드로이드는 긴 발화의 `onend` 를 가끔 안 낸다. 그러면 다음 문장으로
 *    못 간다. 발화마다 시간 상한(앱 `src/ttsCap.js timeoutMsFor` 그대로: 1초 6글자 × 2배, 5~30초 —
 *    작게 잡으면 멀쩡히 느리게 읽는 문장을 자른다), 넘으면 넘기고 `tts_timeout`. 연속 둘이면 cancel 뒤
 *    빈 발화 하나로 엔진을 되묶는다(`tts_rebind`). 끔: `?ttscap=0`.
 * ④ 실시간 줄 큐 — 전에는 새 줄마다 cancel → 늘 최신 줄만, 앞 줄은 중간에 잘렸다. 앱 실기 기록
 *    (11-02 강연 29분, 492줄)을 흘려 잰 숫자 `docs/reclog/2026-11-03-web/tts-queue-sim.txt`: 끝까지 읽힌
 *    줄 28~45% → 55~75%, 대신 평균 1.3~1.7초·최대 7초 늦다. 순서대로 읽되 안 읽은 것이 5초(1초 6글자)를
 *    넘으면 가장 최근 줄로 건너뛴다(`tts_jump`, 앱 TTS_JUMP_LATEST). 읽는 도중에는 자르지 않는다(P-13).
 *    글자는 화면에 그대로다(R-15). 끔: `?ttsq=0`.
 * ⑤ 앱 106 규칙 그대로 (NOW 11-10 12:56 ③ · 대표님 「듣는 게 앱보다 못함」 · 끔 `?tts106=0` → 위 ④ 옛 판):
 *    · 짧은 줄 합쳐 읽기 — 앱 `src/readLoop.js mergeAhead`(TTS_MERGE_SHORT): 지금 줄이 100자보다 짧고 뒤 줄이
 *      **이미 와 있으면** 240자·6줄까지 한 번에(기다리지 않는다). 줄마다 붙는 시작 값·쉼을 아낀다.
 *    · 군말 빼기 — 앱 `src/fillers.js` 말 표 그대로(쉼표·마침표 사이에 홀로 선 것만, 표에 없는 말은 안 뺌, §6).
 *      읽기만 — 화면 글자는 그대로.
 *    · 배속 — 앱 `src/ttsCap.js catchupRate`·`rateBacklogMs`: 지금 줄까지 넣은 안 읽은 시간 1.5초↑ 1.2배 ·
 *      3초↑ 1.4배(꼭대기, LANG-105 ⑤).
 *    · 최신으로 건너뜀 — 앱 `skipToFit`(TTS_JUMP_LATEST·TTS_RATE_FIRST): 지금 줄 **뒤** 밀림을 1.4배로 읽어도
 *      10초(JUMP_MS)를 넘으면 가장 최근 줄로. 단위 통째(P-13).
 *    · onend 안 오면 상한 — 위 ③ 그대로(배속을 넣어 셈 — 앱 timeoutMsFor(chars, rate)).
 */
(function () {
  var q = new URLSearchParams(location.search);
  var CAP_ON = q.get('ttscap') !== '0';
  var Q_ON = q.get('ttsq') !== '0';
  var APP106 = q.get('tts106') !== '0';
  var JUMP_MS = 5000;                       // ④ 옛 판(?tts106=0)
  /* ⑤ 앱 수치 — 앱이 바꾸면 같이 바꾼다(앱 src/readLoop.js · src/ttsCap.js) */
  var MERGE_SHORT = 100, MERGE_MAX = 240, MERGE_UNITS = 6;
  var APP_JUMP_MS = 10000, JUMP_AT_RATE = 1.4;
  var RATE_STEPS = [[5000, 1.4], [3000, 1.4], [1500, 1.2]];
  /* 앱 src/fillers.js FILLERS 그대로 — 말 코드(앞 두 글자로도 찾는다) → 홀로 선 군말 */
  var FILLERS = {
    ko: ['어', '음', '아', '에', '저', '글쎄', '알다시피', '있잖아요', '있잖아'],
    en: ['uh', 'um', 'er', 'erm', 'uhm', 'hmm', 'you know', 'i mean'],
    ja: ['えー', 'えーと', 'ええと', 'あの', 'あのー', 'まあ', 'うーん'],
    zh: ['嗯', '呃', '那个', '这个', '就是说'],
    es: ['eh', 'em', 'este', 'o sea', 'pues'],
    fr: ['euh', 'ben', 'bah', 'hein'],
    de: ['äh', 'ähm', 'öh', 'hm'],
    pt: ['hã', 'né'],
    it: ['ehm', 'cioè', 'tipo'],
    ru: ['э', 'эм', 'ну', 'типа', 'короче'],
    vi: ['ờ', 'ừm', 'à'],
    th: ['เอ่อ', 'อืม'],
    id: ['eh', 'em', 'anu']
  };
  var BOUND = '[,，、.。!?！？…;；]';
  var fillRe = {};
  function fillerPattern(lang) {
    var code = String(lang || '');
    var list = FILLERS[code] || FILLERS[code.split(/[-_]/)[0]] || null;
    if (!list || !list.length) return null;
    if (!fillRe[code]) {
      var alt = list.slice().sort(function (a, b) { return b.length - a.length; })
        .map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
      try { fillRe[code] = new RegExp('(^|' + BOUND + ')\\s*(?:' + alt + ')\\s*(?=' + BOUND + '|$)', 'giu'); }
      catch (_) { fillRe[code] = null; }
    }
    return fillRe[code];
  }
  /** 앱 dropFillers 와 같은 셈. 다 빠지면 '' (그 줄은 소리 없이 넘긴다 — 글자는 화면에) */
  function dropFillers(text, lang) {
    var src = String(text || '');
    var re = fillerPattern(lang);
    if (!re) return src;
    var out = src;
    for (var i = 0; i < 3; i++) { var nx = out.replace(re, '$1'); if (nx === out) break; out = nx; }
    try {
      out = out.replace(new RegExp('^\\s*' + BOUND + '+\\s*', 'u'), '')
               .replace(new RegExp('(' + BOUND + ')\\s*' + BOUND + '+', 'gu'), '$1')
               .replace(/\s{2,}/g, ' ').trim();
      return /[\p{L}\p{N}]/u.test(out) ? out : '';
    } catch (_) { return out.trim(); }
  }
  function catchupRate(ms) {
    for (var i = 0; i < RATE_STEPS.length; i++) if ((ms || 0) >= RATE_STEPS[i][0]) return Math.max(1, RATE_STEPS[i][1]);
    return 1;
  }
  var st = { miss: 0, timeouts: 0, rebinds: 0, jumps: 0, units: 0, merged: 0, fillers: 0, fast: 0, jumped: 0, read: 0 };
  var live = { q: [], cur: null };
  var dep = { utter: null, on: function () { return true; }, log: function () {}, lang: function () { return ''; } };

  function capMs(chars, rate) {
    var r = rate > 0 ? rate : 1;
    var est = Math.round((Math.max(0, Number(chars) || 0) / 6) * 1000 / r) * 2;
    return Math.min(30000, Math.max(5000, est));
  }
  function estMs(n) { return Math.round((Math.max(0, Number(n) || 0) / 6) * 1000); }

  /* 발화 하나에 상한을 건다. alive() 가 거짓이면(이미 끝남·멈춤) 안 센다. 이미 단 onend·onerror 를 감싸
     신호가 오면 「엔진 살아 있음」(연속 셈 0)으로 센다 */
  function arm(u, chars, alive, go, tag, rate) {
    if (!CAP_ON) return;
    var e0 = u.onend, r0 = u.onerror;
    u.onend = function (e) { ok(u); if (e0) e0(e); };
    u.onerror = function (e) { ok(u); if (r0) r0(e); };
    var ms = capMs(chars, rate);
    u.__rtCap = setTimeout(function () {
      if (!alive()) return;
      st.timeouts += 1; st.miss += 1;
      dep.log('tts_timeout ' + tag + ' ms=' + ms + ' n=' + st.miss);
      if (st.miss >= 2) {
        st.miss = 0; st.rebinds += 1;
        try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (_) {}
        dep.log('tts_rebind ' + tag);
      }
      go();
    }, ms);
  }
  /* onend·onerror 가 왔다 — 엔진은 살아 있다 */
  function ok(u) { try { clearTimeout(u.__rtCap); } catch (_) {} st.miss = 0; }

  function clear() { live.q.length = 0; live.cur = null; }
  function pump() {
    if (APP106) return pump106();
    if (live.cur || !live.q.length || !dep.on()) return;
    var back = 0;
    for (var i = 0; i < live.q.length; i++) back += estMs(live.q[i].text.length);
    if (back > JUMP_MS && live.q.length > 1) {
      var dropped = live.q.length - 1;
      live.q.splice(0, dropped);
      st.jumps += 1;
      dep.log('tts_jump dropped=' + dropped + ' backlogMs=' + back);
    }
    var it = live.q.shift();
    speakNow(it.text, it.via, 1, 'live');
  }
  function speakNow(text, via, rate, tag) {
    var u = live.cur = dep.utter(text, via);
    if (rate && rate !== 1) u.rate = rate;
    var next = function () { if (live.cur !== u) return; live.cur = null; pump(); };
    u.onend = next;
    u.onerror = function (e) {
      if (e && /interrupted|canceled/.test(e.error)) { if (live.cur === u) live.cur = null; return; }
      next();
    };
    arm(u, text.length, function () { return live.cur === u; }, next, tag, rate);
    speechSynthesis.speak(u);
  }
  /* ⑤ 앱 106 — 건너뜀(지금 줄 뒤 밀림 @1.4배 > 10초) → 합치기 → 배속 → 읽기 */
  function pump106() {
    if (live.cur || !live.q.length || !dep.on()) return;
    var behind = 0;
    for (var i = 1; i < live.q.length; i++) behind += estMs(live.q[i].text.length);
    if (behind / JUMP_AT_RATE > APP_JUMP_MS && live.q.length > 1) {
      var dropped = live.q.length - 1;
      live.q.splice(0, dropped);
      st.jumps += 1; st.jumped += dropped;
      dep.log('tts_jump dropped=' + dropped + ' backlogMs=' + Math.round(behind / JUMP_AT_RATE));
    }
    var all = 0;                              // 배속은 지금 줄까지 넣은 밀림(앱 rateBacklogMs)
    for (var j = 0; j < live.q.length; j++) all += estMs(live.q[j].text.length);
    var rate = catchupRate(all);
    var first = live.q.shift();
    var text = first.text, n = 1;
    if (text.length < MERGE_SHORT) {
      while (live.q.length && n < MERGE_UNITS) {
        var nx = live.q[0].text;
        var joined = text + ' ' + nx;
        if (joined.length > MERGE_MAX) break;
        live.q.shift(); text = joined; n += 1;
        if (text.length >= MERGE_SHORT && nx.length >= MERGE_SHORT) break;
      }
    }
    st.units += 1; st.read += n; if (n > 1) st.merged += n - 1; if (rate > 1) st.fast += 1;
    dep.log('tts_unit chars=' + text.length + ' n=' + n + ' rate=' + rate + ' rateMs=' + all);
    speakNow(text, first.via, rate, 'live');
  }
  /* 실시간 줄 하나. 큐가 꺼졌으면 false — 부르는 쪽이 옛 길(cancel 뒤 바로)로 간다 */
  function say(text, via) {
    if (!Q_ON || !text) return false;
    if (APP106) {
      var clean = dropFillers(text, via || dep.lang());
      if (clean !== text) { st.fillers += 1; dep.log('tts_filler from=' + text.length + ' to=' + clean.length); }
      if (!clean) return true;                // 군말뿐 — 소리 없이 넘긴다(글자는 화면에)
      text = clean;
    }
    if (!live.cur) { speechSynthesis.cancel(); live.q.length = 0; }   // 읽는 것이 없다 — 전처럼 지금 것을 끊고 바로
    live.q.push({ text: text, via: via });
    pump();
    return true;
  }

  window.rtTtsGuard = {
    init: function (d) { for (var k in d) dep[k] = d[k]; },
    arm: arm, ok: ok, say: say, clear: clear, capMs: capMs, dropFillers: dropFillers, catchupRate: catchupRate,
    state: function () { return { cap: CAP_ON, queue: Q_ON, app106: APP106, held: live.q.length, speaking: !!live.cur,
                                  miss: st.miss, timeouts: st.timeouts, rebinds: st.rebinds, jumps: st.jumps,
                                  jumped: st.jumped, units: st.units, read: st.read, merged: st.merged,
                                  fillers: st.fillers, fast: st.fast }; }
  };
  if (window.__rtTtsGuardReady) window.__rtTtsGuardReady();
})();
