/* web/common/edu-confirm.js — 손님 화면 「교육을 들었습니다 — 확인」(근로자 전자 확인, NOW 11-09 18:20 ②)
 *
 * 손님 페이지(web/listener)가 강사의 `confirm_open` 을 받으면 **그때** 이 파일을 싣는다 — 첫 화면 37KB 한도
 * (ask-mic.js 와 같은 꼴). 글자 4키(cf_*)는 손 표 `web/listener/ui-strings.json` 에 있고, 쪼개기 도구가
 * `ui-strings/later/<말>.json` 으로 따로 낸다.
 *
 * 보내는 것: `{kind:'confirm', name, lang, deviceId, ua}` — 시각은 **방이** 찍는다. 소리·글(원문·번역) 없음(P-16·P-14).
 * 누른 기록은 이 폰에도 둔다(`raytok_cf_<방>`) — 새로 고쳐도 「확인되었습니다」가 남는다(R-15).
 * 자리: #chat-screen > #cf-band (#chat-list 바로 앞 형제).
 */
(function () {
  var st = { open: false, done: 0, err: '', room: '' };
  var cx = null, gotStrings = null, band = null;
  function T(k) { return (cx && cx.t(k)) || ''; }
  function $(id) { return document.getElementById(id); }

  function loadStrings(lang) {
    if (gotStrings) return gotStrings;
    gotStrings = new Promise(function (res) {
      var done = false, fin = function () { if (!done) { done = true; res(); } };
      try {
        fetch('/web/listener/ui-strings/later/' + encodeURIComponent(lang) + '.json' + (window.rtUiRev ? '?v=' + window.rtUiRev : ''))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.strings && cx && cx.uiStrings && cx.uiStrings.strings) Object.assign(cx.uiStrings.strings, d.strings); fin(); }, fin);
      } catch (_) { fin(); }
      setTimeout(fin, 2500);
    });
    return gotStrings;
  }
  function ua() {
    var u = String(navigator.userAgent || '');
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
      : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'other';
  }
  function make() {
    if (band) return band;
    var list = $('chat-list');
    if (!list || !list.parentNode) return null;
    band = document.createElement('div');
    band.id = 'cf-band';
    band.className = 'notice-band';
    band.setAttribute('role', 'region');
    band.setAttribute('aria-live', 'polite');
    band.setAttribute('translate', 'no');
    band.style.cssText = 'display:none; background:rgba(34,197,94,0.12); border:1px solid #22c55e; color:var(--text);';
    band.innerHTML = '<div id="cf-privacy" style="font-size:13px; margin-bottom:6px;"></div>'
      + '<input type="text" id="cf-name" maxlength="60" style="display:none; width:100%; box-sizing:border-box; margin-bottom:6px;">'
      + '<button class="tool-btn" id="btn-confirm" style="font-size:15px; padding:8px 12px; font-weight:600;"></button>'
      + '<div id="cf-msg" style="font-size:14px; margin-top:4px; font-weight:600;"></div>';
    list.parentNode.insertBefore(band, list);
    $('btn-confirm').addEventListener('click', send);
    return band;
  }
  function render() {
    if (!make()) return;
    var ask = st.open && !st.done;
    band.style.display = (ask || st.done) ? '' : 'none';
    $('cf-privacy').textContent = T('cf_privacy');
    $('cf-privacy').style.display = ask ? '' : 'none';
    $('cf-name').placeholder = T('name_placeholder');
    $('cf-name').style.display = (ask && !cx.getName()) ? '' : 'none';
    $('btn-confirm').textContent = T('cf_btn');
    $('btn-confirm').style.display = ask ? '' : 'none';
    var d = st.done ? new Date(st.done) : null;
    $('cf-msg').textContent = d
      ? '✔ ' + T('cf_done') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : st.err;
    /* 띠가 생기거나 커지면 목록이 줄어든다 — 그때 맨 아래(최신 줄)를 다시 보인다. 안 하면 띠가 번역 줄을
       덮은 것처럼 보인다(실기 11-10 11:20 · NOW 11-10 12:56 ④). 띠는 목록 **위** 형제라 겹치지 않는다 */
    var list = $('chat-list');
    if (list) list.scrollTop = list.scrollHeight;
  }
  function send() {
    if (!cx || !st.open || st.done) return;
    cx = ctx();                                   // 망이 다시 붙었으면 소켓이 바뀌었다 — 누를 때의 것으로
    if (!cx.getName()) {
      var v = ($('cf-name').value || '').trim();
      if (!v) { st.err = T('cf_need_name'); render(); $('cf-name').focus(); return; }
      cx.setName(v.slice(0, 60));
    }
    st.err = '';
    if (cx.ws && cx.ws.readyState === 1) cx.ws.send(JSON.stringify({ kind: 'confirm', name: cx.getName(), lang: cx.lang || 'ko', deviceId: cx.dev, ua: ua() }));
  }
  /* 손님 쪽(web/listener)의 맨 위 이름을 읽는다 — 고전 <script> 맨 위 let·function 은 다른 스크립트에서도 보인다.
     꾸러미를 손님 쪽에서 만들면 첫 화면 37KB 를 넘는다. 이름이 바뀌면 여기도 같이(§4). */
  function ctx() {
    /* global t, uiStrings, ws, roomCode, selectedLang, deviceId, myName */
    return {
      t: t, uiStrings: uiStrings, ws: ws, room: roomCode, lang: selectedLang, dev: deviceId,
      getName: function () { return myName; }, setName: function (v) { myName = v; }
    };
  }
  function on(msg) {
    var c = cx = ctx();
    var room = c.room;
    if (st.room !== room) { st = { open: false, done: 0, err: '', room: room }; }
    if (msg.kind === 'confirm_open') {
      st.open = true;
      if (!st.done) { try { st.done = Number(localStorage.getItem('raytok_cf_' + room)) || 0; } catch (_) {} }
    } else if (msg.kind === 'confirm_close') st.open = false;
    else if (msg.kind === 'confirm_ok') {
      st.done = Number(msg.at) || Date.now();
      st.err = '';
      try { localStorage.setItem('raytok_cf_' + room, String(st.done)); } catch (_) {}
    } else if (msg.kind === 'confirm_error' && msg.why === 'closed') st.open = false;
    return loadStrings(c.lang || 'ko').then(render);
  }
  window.rtEduConfirm = { on: on, state: function () { return { open: st.open, done: st.done }; } };
})();
