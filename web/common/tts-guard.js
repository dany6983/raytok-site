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
 */
(function () {
  var q = new URLSearchParams(location.search);
  var CAP_ON = q.get('ttscap') !== '0';
  var Q_ON = q.get('ttsq') !== '0';
  var JUMP_MS = 5000;
  var st = { miss: 0, timeouts: 0, rebinds: 0, jumps: 0 };
  var live = { q: [], cur: null };
  var dep = { utter: null, on: function () { return true; }, log: function () {} };

  function capMs(chars) {
    var est = Math.round((Math.max(0, Number(chars) || 0) / 6) * 1000) * 2;
    return Math.min(30000, Math.max(5000, est));
  }
  function estMs(n) { return Math.round((Math.max(0, Number(n) || 0) / 6) * 1000); }

  /* 발화 하나에 상한을 건다. alive() 가 거짓이면(이미 끝남·멈춤) 안 센다. 이미 단 onend·onerror 를 감싸
     신호가 오면 「엔진 살아 있음」(연속 셈 0)으로 센다 */
  function arm(u, chars, alive, go, tag) {
    if (!CAP_ON) return;
    var e0 = u.onend, r0 = u.onerror;
    u.onend = function (e) { ok(u); if (e0) e0(e); };
    u.onerror = function (e) { ok(u); if (r0) r0(e); };
    var ms = capMs(chars);
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
    var u = live.cur = dep.utter(it.text, it.via);
    var next = function () { if (live.cur !== u) return; live.cur = null; pump(); };
    u.onend = next;
    u.onerror = function (e) {
      if (e && /interrupted|canceled/.test(e.error)) { if (live.cur === u) live.cur = null; return; }
      next();
    };
    arm(u, it.text.length, function () { return live.cur === u; }, next, 'live');
    speechSynthesis.speak(u);
  }
  /* 실시간 줄 하나. 큐가 꺼졌으면 false — 부르는 쪽이 옛 길(cancel 뒤 바로)로 간다 */
  function say(text, via) {
    if (!Q_ON || !text) return false;
    if (!live.cur) { speechSynthesis.cancel(); live.q.length = 0; }   // 읽는 것이 없다 — 전처럼 지금 것을 끊고 바로
    live.q.push({ text: text, via: via });
    pump();
    return true;
  }

  window.rtTtsGuard = {
    init: function (d) { for (var k in d) dep[k] = d[k]; },
    arm: arm, ok: ok, say: say, clear: clear, capMs: capMs,
    state: function () { return { cap: CAP_ON, queue: Q_ON, held: live.q.length, speaking: !!live.cur,
                                  miss: st.miss, timeouts: st.timeouts, rebinds: st.rebinds, jumps: st.jumps }; }
  };
  if (window.__rtTtsGuardReady) window.__rtTtsGuardReady();
})();
