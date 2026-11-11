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
 *
 * ★ 11-11 15:26 「질문 흐름 2」(스위치 `askFlow2` 기본 켬, `?askflow=0` 옛 판) — 대표님 「어떻게 쓰는지 모르겠어」
 *    「2번째 화면에도 문자 쓰는 창, 말하기 버튼 작동 안 함 — 둘 다(안드로이드·아이폰)」:
 *  · 지명 뒤 손님 화면 가득 **하나만** — 안드로이드 = 큰 「🎤 말하기」(글 칸은 「✍ 글로 쓰기」 눌렀을 때만) ·
 *    아이폰(Rec 없음) = 큰 글 칸 + 「보내기」(마이크 단추 없음).
 *  · 마이크가 실패하면(까닭 무엇이든 — onerror · onstart 없이 onend · 3초 안에 onstart 없음) 그 자리에서 글 칸으로.
 *    「눌러도 안 됨」 원인을 모름(D-11) — 까닭은 손님 화면 한 줄 + connLog(`ask rec nostart|silent_end|error <why>`).
 *    전에는 onstart·onend 둘 다 안 오면 `rec` 이 쥔 채라 **다음 누름이 조용히 무시**됐다(start 의 `|| rec` 문).
 *  · 보내면 「전달 중…」 → 방이 되돌려 준 내 질문을 보면 「강사님께 전달됨 ✓」 · 끝 「질문 끝 — 감사합니다」.
 */
(function () {
  var AUTO = new URLSearchParams(location.search).get('askauto') === '1';
  var ERR = { 'not-allowed': 'ask_err_perm', 'service-not-allowed': 'ask_err_perm',
              'audio-capture': 'ask_err_mic', 'no-speech': 'ask_err_nospeech' };
  var cx = null, rec = null, last = null, wired = false, gotStrings = null, log = [];
  var NOSTART_MS = 3000, flow2 = false, mode = '', sendWait = false, endTimer = null;

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
    if (flow2) { b.style.fontSize = mode === 'mic' ? '22px' : '16px'; b.style.padding = mode === 'mic' ? '22px 10px' : '10px'; }
  }
  function show(id, on) { var e = $(id); if (e) e.style.display = on ? '' : 'none'; }

  /* ── 흐름 2: 화면 꼴 둘 — 'mic'(큰 마이크 하나 + 작은 「글로 쓰기」) · 'text'(큰 글 칸 + 「보내기」) ── */
  function writeBtn() {
    var w = $('btn-ask-write');
    if (w) return w;
    var m = $('btn-ask-mic');
    if (!m) return null;
    w = document.createElement('button');
    w.id = 'btn-ask-write'; w.className = 'tool-btn';
    w.style.cssText = 'display:none; width:100%; padding:8px; font-size:14px; margin-bottom:8px; background:transparent;';
    w.addEventListener('click', function () { note('ask write_tap'); setMode('text'); });
    m.parentNode.insertBefore(w, m.nextSibling);
    return w;
  }
  function setMode(m, keepMic) {
    mode = m;
    var w = writeBtn(), i = $('ask-input-text'), sub = $('btn-ask-submit'), md = $('ask-modal');
    if (md) { md.style.width = '92vw'; md.style.maxWidth = '480px'; }
    if (m === 'mic') {
      btn('ask_mic_btn', !!rec);
      if (w) { w.textContent = T('ask_mic_write') || '✍'; w.style.display = 'block'; }
      show('ask-input-text', false); show('btn-ask-submit', false);
    } else {
      if (!keepMic) btn(null); else btn('ask_mic_again');
      if (w) w.style.display = 'none';
      if (i) { i.style.display = ''; i.style.height = '120px'; i.style.fontSize = '16px'; }
      if (sub) { sub.style.display = ''; sub.textContent = T('ask_mic_send') || sub.textContent; sub.style.fontSize = '16px'; sub.style.padding = '10px 18px'; }
    }
    note('ask mode ' + m);
  }
  /* 마이크 실패 — 까닭 무엇이든 글 칸으로(손든 사람이 말을 못 하고 끝나지 않게, R-15) */
  function micFail(why) {
    note('ask rec ' + why);
    status(errText(why));
    if (flow2) setMode('text', true);
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
        fetch('/web/listener/ui-strings/later/' + encodeURIComponent(lang) + '.json' + (window.rtUiRev ? '?v=' + window.rtUiRev : ''))
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
      var r = rec = last = new c.Rec(), began = false, failed = false;
      var nostart = setTimeout(function () {    // §20 — onstart 도 onerror 도 안 오면 쥔 채로 두지 않는다
        if (began || failed || rec !== r) return;
        failed = true; rec = null;
        try { r.abort ? r.abort() : r.stop(); } catch (_) {}
        if (c === cx && c.alive()) { micFail('nostart'); if (!flow2) btn('ask_mic_again'); }
      }, NOSTART_MS);
      // 언어 이름으로 가르지 않는다 — 말하는 쪽과 **같은 표**(§6, web/common/rec-lang.js). 없으면 코드 그대로(§20)
      r.lang = (window.rtRecLang && window.rtRecLang.tag) ? window.rtRecLang.tag(c.lang()) : c.lang();
      r.continuous = true;
      r.interimResults = false;
      r.onstart = function () { began = true; clearTimeout(nostart); note('ask rec start'); status(T('ask_speaking')); btn('ask_mic_btn', true); };
      r.onerror = function (ev) {
        var why = (ev && ev.error) || '';
        note('ask rec error ' + why);
        if (why === 'aborted') return;            // 우리가 stop() 한 것
        failed = true; clearTimeout(nostart);
        status(errText(why));                     // ① 왜 — 화면에
        if (flow2 && c === cx && c.alive()) setMode('text', true);
      };
      r.onend = function () {
        clearTimeout(nostart);
        if (rec === r) rec = null;
        if (!(c === cx && c.alive())) return;
        if (flow2 && !began && !failed) { failed = true; micFail('silent_end'); return; }   // 열리지도 않고 끝 — 실패다
        if (!flow2 || mode === 'mic') btn('ask_mic_again');
      };
      r.onresult = function (e) {
        var from = typeof e.resultIndex === 'number' ? e.resultIndex : 0;
        var text = Array.prototype.slice.call(e.results, from).filter(function (x) { return x.isFinal !== false; })
          .map(function (x) { return x[0].transcript; }).join(' ').trim();
        note('ask rec result len=' + text.length);
        if (text) { c.send({ kind: 'question', id: c.id, seq: c.seq, name: c.name(), src: text, srcLang: c.lang(), at: Date.now() }); sending(); }
      };
      r.start();
    } catch (e) {
      rec = null;
      note('ask rec start threw');
      status(errText('start'));
      btn('ask_mic_again');
      if (flow2) setMode('text', true);
    }
  }
  function sending() { if (!flow2) return; sendWait = true; status(T('ask_mic_sending') || '…'); note('ask sending'); }

  window.rtAskMic = {
    /* 지명됐다 — 단추를 붙인다. 인식기는 아직 안 연다(AUTO 가 아니면) */
    open: function (c) {
      cx = c; flow2 = !!c.flow2; sendWait = false; clearTimeout(endTimer);
      if (!wired) { var b = $('btn-ask-mic'); if (b) { b.addEventListener('click', start); wired = true; } }
      if (c.Rec) c.loadRecLang();                 // 단추를 누르기 전에 미리 받아 둔다
      if (flow2) setMode(c.Rec ? 'mic' : 'text'); // 글자 조각이 오기 전에도 꼴은 바로 — 글자는 아래에서 다시 채운다
      return loadStrings(c.lang()).then(function () {
        if (cx !== c || !c.alive()) return;
        if (flow2 && !c.Rec) { setMode('text'); status(T('ask_notice')); note('ask ios→text'); return; }
        try { var i = $('ask-input-text'); if (i && document.activeElement === i) i.blur(); } catch (_) {}
        status(T('ask_mic_tap'));
        if (flow2 && mode === 'text') { btn('ask_mic_again'); setMode('text', true); return; }   // 이미 글로 바꿨다
        if (flow2) setMode('mic'); else btn('ask_mic_btn');
        if (AUTO) start();
      });
    },
    /* 글 칸으로 보냈다(손님 페이지의 「보내기」 한 길) — 「전달 중…」 */
    sending: sending,
    /* 방이 내 질문을 되돌려 줬다 — 보낸 뒤일 때만 「강사님께 전달됨 ✓」(지명 때 오는 같은 id 질문은 아니다) */
    sent: function () { if (!flow2 || !sendWait) return; sendWait = false; status(T('ask_mic_sent') || '✓'); note('ask sent_ok'); },
    /* 흐름 2의 끝 — 「질문 끝 — 감사합니다」 를 잠깐 보이고 창을 닫는다 */
    end: function (hide) {
      var was = flow2, bye = T('ask_mic_end');   // close() 가 cx 를 비우므로 글자를 먼저 쥔다
      this.close();
      if (!was) return hide();
      show('ask-input-text', false); show('btn-ask-submit', false);
      var w = $('btn-ask-write'); if (w) w.style.display = 'none';
      status(bye || '✓');
      note('ask end_thanks');
      clearTimeout(endTimer);
      endTimer = setTimeout(function () { if (!cx) hide(); }, 2500);
    },
    /* 새로 손들 때 창을 처음 꼴로 — 흐름 2가 숨긴 글 칸·전송 단추를 되살린다 */
    reset: function () {
      clearTimeout(endTimer); mode = ''; sendWait = false;
      var w = $('btn-ask-write'); if (w) w.style.display = 'none';
      show('ask-input-text', true); show('btn-ask-submit', true);
    },
    /* 발언권 끝 — 인식기를 닫고 단추를 숨긴다 */
    close: function () {
      /* 이미 끝난 인식기도 한 번 더 stop — 끝났다고 알린 뒤에도 마이크를 쥐고 있는 엔진이 있다면 놓게(해는 없다) */
      var r = rec || last; rec = null; last = null; cx = null;
      if (r) { try { r.stop(); } catch (_) {} }
      btn(null);
      flow2 = false; mode = ''; sendWait = false;
    },
    mode: function () { return mode; },
    start: start,
    log: function () { return log.slice(); },
    auto: AUTO
  };
})();
