/* web/common/ask-mic.js — 손님 질문 마이크 (NOW 11-04 16:00 ①②) · 손님 페이지가 **지명됐을 때** 싣는다
 *
 * 왜 따로: 첫 화면 gz 37KB 한도(10-27 01:20 ⑤). 질문 마이크는 지명된 손님만 쓴다. 글자(7개 키 × 81말)도
 * 손 표 `web/listener/ui-strings.json` 한 곳에 있고, 쪼개기 도구가 `ui-strings/later/<말>.json` 으로 따로 낸다
 * (tools/split-ui-strings.js LATER). 못 실으면 손님 페이지는 글자 칸만 보인다 — 말할 길은 남는다(R-15).
 *
 * 대표님 실기 11-04 15:52: 「손들기 → 지명 받으면 마이크 표시는 보이는데 마이크 안 됨, 글자 칸만」(안드로이드 크롬).
 *  ① 왜 안 됐는지 **화면에** 한 줄 — 전에는 `ask rec error` 가 connLog 에만 있었다.
 *  ② `start()` 는 **사람 손가락 안에서**(「🎤 말하기」 단추). 지명 메시지(WS) 안에서 저절로 부르면 사용자 동작이
 *     아니라 크롬이 권한 창을 안 띄우거나 `not-allowed` 를 낸다(첫 방문·권한 미결정 때). 자동은 `?askauto=1` 로만.
 *  끝나면(onend) 「다시 말하기」 — 지명 중 저절로 다시 여는 고리는 없다(10-27 18:03 대표님).
 *  `getUserMedia` 로 마이크를 먼저 잡지 않는다 — 안드로이드 크롬은 그러면 인식기가 마이크를 못 잡는다(10-27 15:16).
 *  보내는 것은 **원문+언어만**(P-14), 소리는 안 보낸다(P-04).
 */
(function () {
  var AUTO = new URLSearchParams(location.search).get('askauto') === '1';
  var ERR = { 'not-allowed': 'ask_err_perm', 'service-not-allowed': 'ask_err_perm',
              'audio-capture': 'ask_err_mic', 'no-speech': 'ask_err_nospeech' };
  var cx = null, rec = null, last = null, wired = false, gotStrings = null, log = [];

  function $(id) { return document.getElementById(id); }
  function T(k) { return (cx && cx.t(k)) || ''; }
  function status(text) { var st = $('ask-status-msg'); if (st && text) st.textContent = text; }
  function btn(key, on) {
    var b = $('btn-ask-mic');
    if (!b) return;
    b.style.display = key ? 'block' : 'none';
    if (key) b.textContent = T(key) || '🎤';
    b.style.background = on ? '#d93025' : '';
    b.style.color = on ? '#fff' : '';
  }
  function note(l) { log.push(l); if (log.length > 100) log.shift(); if (cx) cx.log(l); }
  function errText(why) {
    return ERR[why] ? T(ERR[why]) : T('ask_err_other').replace('{code}', why || '?');
  }

  /* 나중 글자 조각 — 한 번만 받는다. 못 받아도 단추는 뜬다(글자가 en·ko 로 떨어지거나 🎤 만) */
  function loadStrings(lang) {
    if (gotStrings) return gotStrings;
    gotStrings = new Promise(function (res) {
      var done = false, fin = function () { if (!done) { done = true; res(); } };
      try {
        fetch('/web/listener/ui-strings/later/' + encodeURIComponent(lang) + '.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.strings && cx) cx.strings(d.strings); fin(); }, fin);
      } catch (_) { fin(); }
      setTimeout(fin, 2500);
    });
    return gotStrings;
  }

  /* 「🎤 말하기」 — 사람 손가락(user gesture) 안에서 `start()`. 기다리는 일(await)을 앞에 두지 않는다 */
  function start() {
    if (!cx || !cx.alive() || rec) return;
    var c = cx;
    try {
      var r = rec = last = new c.Rec();
      // 언어 이름으로 가르지 않는다 — 말하는 쪽과 **같은 표**(§6, web/common/rec-lang.js). 없으면 코드 그대로(§20)
      r.lang = (window.rtRecLang && window.rtRecLang.tag) ? window.rtRecLang.tag(c.lang()) : c.lang();
      r.continuous = true;
      r.interimResults = false;
      r.onstart = function () { note('ask rec start'); status(T('ask_speaking')); btn('ask_mic_btn', true); };
      r.onerror = function (ev) {
        var why = (ev && ev.error) || '';
        note('ask rec error ' + why);
        if (why === 'aborted') return;            // 우리가 stop() 한 것
        status(errText(why));                     // ① 왜 — 화면에
      };
      r.onend = function () {
        if (rec === r) rec = null;
        if (c === cx && c.alive()) btn('ask_mic_again');
      };
      r.onresult = function (e) {
        var from = typeof e.resultIndex === 'number' ? e.resultIndex : 0;
        var text = Array.prototype.slice.call(e.results, from).filter(function (x) { return x.isFinal !== false; })
          .map(function (x) { return x[0].transcript; }).join(' ').trim();
        note('ask rec result len=' + text.length);
        if (text) c.send({ kind: 'question', id: c.id, seq: c.seq, name: c.name(), src: text, srcLang: c.lang(), at: Date.now() });
      };
      r.start();
    } catch (e) {
      rec = null;
      note('ask rec start threw');
      status(errText('start'));
      btn('ask_mic_again');
    }
  }

  window.rtAskMic = {
    /* 지명됐다 — 단추를 붙인다. 인식기는 아직 안 연다(AUTO 가 아니면) */
    open: function (c) {
      cx = c;
      if (!wired) { var b = $('btn-ask-mic'); if (b) { b.addEventListener('click', start); wired = true; } }
      c.loadRecLang();                            // 단추를 누르기 전에 미리 받아 둔다
      return loadStrings(c.lang()).then(function () {
        if (cx !== c || !c.alive()) return;
        try { var i = $('ask-input-text'); if (i && document.activeElement === i) i.blur(); } catch (_) {}
        status(T('ask_mic_tap'));
        btn('ask_mic_btn');
        if (AUTO) start();
      });
    },
    /* 발언권 끝 — 인식기를 닫고 단추를 숨긴다 */
    close: function () {
      /* 이미 끝난 인식기도 한 번 더 stop — 끝났다고 알린 뒤에도 마이크를 쥐고 있는 엔진이 있다면 놓게(해는 없다) */
      var r = rec || last; rec = null; last = null; cx = null;
      if (r) { try { r.stop(); } catch (_) {} }
      btn(null);
    },
    start: start,
    log: function () { return log.slice(); },
    auto: AUTO
  };
})();
