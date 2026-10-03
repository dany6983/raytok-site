/* RayTok 소개 페이지 번역 (한국어 원문 → en / zh / ja / vi)
   - 원문은 HTML 에 있는 한국어 그대로다. 번역은 /assets/i18n/<언어>.json 의 { "한국어 원문": "번역문" } 사전.
   - 사전에 없는 문장은 한국어로 남는다(깨지지 않는다). 빠진 문장은 주소에 ?i18n=debug 를 붙이면 콘솔에 나온다.
   - 문장 안의 <b>·<span>·<a> 같은 태그는 <1>…</1> 번호표로 바꿔서 사전에 싣는다. 번역문도 같은 번호표를 쓴다.
   - 언어 선택은 이 브라우저에만 기억한다(localStorage). 주소에 ?lang=en 을 붙이면 그 언어로 열린다.
   - Desk 페이지는 번역하지 않는다(국내 한정). 그 페이지에는 이 스크립트를 싣지 않는다. */
(function () {
  "use strict";
  var LANGS = ["ko", "en", "zh", "ja", "vi"], KEY = "raytok-lang";
  var INLINE = { B: 1, STRONG: 1, SPAN: 1, A: 1, I: 1, EM: 1, SMALL: 1, U: 1, BR: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, VIDEO: 1, SVG: 1, NOSCRIPT: 1 };
  var ATTRS = ["alt", "aria-label", "title"];
  var root = document.documentElement;

  function pick() {
    var l = (location.search.match(/[?&]lang=([a-z]{2})/) || [])[1];
    if (!l) { try { l = localStorage.getItem(KEY); } catch (e) {} }
    return LANGS.indexOf(l) >= 0 ? l : "ko";
  }
  function norm(s) { return s.replace(/\s+/g, " ").trim(); }
  function hasText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    return false;
  }
  function inlineOnly(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!INLINE[c.tagName] || !inlineOnly(c)) return false;
    }
    return true;
  }
  /* 한 덩어리(문장)를 번호표 문자열로 바꾼다. els 에 번호 순서대로 원래 요소를 담는다. */
  function ser(el, els) {
    var out = "";
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) {
        if (n.tagName === "BR") out += "<br>";
        else { els.push(n); var i = els.length; out += "<" + i + ">" + ser(n, els) + "</" + i + ">"; }
      }
    }
    return out;
  }
  /* 번역문(번호표 문자열)으로 요소의 내용을 다시 짠다. */
  function build(el, text, els) {
    var frag = document.createDocumentFragment(), stack = [frag], re = /<(\/?)(\d+)>|<br>/g, last = 0, m;
    function put(s) { if (s) stack[stack.length - 1].appendChild(document.createTextNode(s)); }
    while ((m = re.exec(text))) {
      put(text.slice(last, m.index)); last = re.lastIndex;
      if (m[0] === "<br>") stack[stack.length - 1].appendChild(document.createElement("br"));
      else if (m[1]) { if (stack.length > 1) stack.pop(); }
      else {
        var src = els[+m[2] - 1]; if (!src) continue;
        var c = src.cloneNode(false); stack[stack.length - 1].appendChild(c); stack.push(c);
      }
    }
    put(text.slice(last));
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(frag);
  }
  /* 문서를 돌며 번역 단위를 모은다. fn(종류, 대상, 원문키, 요소목록) */
  function walk(el, fn) {
    if (SKIP[el.tagName] || el.hasAttribute("data-noi18n")) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var v = el.getAttribute(ATTRS[a]);
      if (v && /[가-힣]/.test(v)) fn("attr", el, norm(v), ATTRS[a]);
    }
    if (hasText(el) && inlineOnly(el)) {
      var els = [], key = norm(ser(el, els));
      if (/[가-힣]/.test(key)) fn("unit", el, key, els);
      for (var i = 0; i < els.length; i++) attrsOnly(els[i], fn);
      return;
    }
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1) walk(n, fn);
      else if (n.nodeType === 3 && /[가-힣]/.test(n.nodeValue)) fn("text", n, norm(n.nodeValue));
    }
  }
  function attrsOnly(el, fn) {
    for (var a = 0; a < ATTRS.length; a++) {
      var v = el.getAttribute(ATTRS[a]);
      if (v && /[가-힣]/.test(v)) fn("attr", el, norm(v), ATTRS[a]);
    }
  }
  /* 이 페이지의 원문 목록 (사전 만들 때 쓴다) */
  window.__i18nKeys = function () {
    var keys = {}, d = document.querySelector('meta[name="description"]');
    keys[norm(document.title)] = 1;
    if (d) keys[norm(d.getAttribute("content"))] = 1;
    walk(document.body, function (kind, node, key) { keys[key] = 1; });
    return Object.keys(keys);
  };

  function apply(dict) {
    var missing = [], todo = [];
    walk(document.body, function (kind, node, key, extra) { todo.push([kind, node, key, extra]); });
    for (var i = 0; i < todo.length; i++) {
      var t = todo[i], tr = dict[t[2]];
      if (tr == null) { missing.push(t[2]); continue; }
      if (t[0] === "unit") build(t[1], tr, t[3]);
      else if (t[0] === "text") t[1].nodeValue = tr;
      else t[1].setAttribute(t[3], tr);
    }
    var ti = dict[norm(document.title)]; if (ti) document.title = ti;
    if (/[?&]i18n=debug/.test(location.search) && missing.length) console.log("[i18n] 사전에 없는 문장 " + missing.length + "개", missing);
  }
  function done() { root.classList.remove("i18n-wait"); }
  function mark(lang) {
    var bs = document.querySelectorAll(".langbar button");
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute("data-lang") === lang;
      if (on) bs[i].setAttribute("aria-pressed", "true"); else bs[i].removeAttribute("aria-pressed");
      bs[i].addEventListener("click", function () {
        var l = this.getAttribute("data-lang"), saved = false;
        try { localStorage.setItem(KEY, l); saved = true; } catch (e) {}
        var q = location.search.replace(/[?&]lang=[a-z]{2}/, "").replace(/^&/, "?");
        if (!saved && l !== "ko") q += (q ? "&" : "?") + "lang=" + l;
        var u = location.pathname + q + location.hash;
        if (u === location.pathname + location.search + location.hash) location.reload(); else location.href = u;
      });
    }
  }
  function start() {
    var lang = pick();
    mark(lang);
    if (lang === "ko") { done(); return; }
    root.lang = lang === "zh" ? "zh-Hans" : lang;
    root.setAttribute("data-lang", lang);
    var me = document.querySelector('script[src*="/assets/i18n.js"]'), v = me ? (me.src.match(/\?v=(\w+)/) || [])[1] : "";
    var timer = setTimeout(done, 1500);
    fetch("/assets/i18n/" + lang + ".json" + (v ? "?v=" + v : ""))
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { apply(d); })
      .catch(function (e) { console.log("[i18n] 사전을 못 읽음", e); })
      .then(function () { clearTimeout(timer); done(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
