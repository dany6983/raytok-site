/**
 * 진짜 릴레이로 끝까지 — 강사 1 + 손님 3 (NOW B 5 · 결정장부 46)
 *
 * 가짜 방이 아니라 **릴레이 코드 자체**(`wrangler dev --local`)와 **진짜 화면**으로 돈다.
 * 목(mock)은 운영과 다를 수 있다(D-11) — 10-20 에 사전 번역이 운영에서 한 번도 동작하지
 * 않던 것을 목이 가려 주었다.
 *
 * ## 쓰는 법
 * ```
 * cd relay && npx wrangler dev --local            # LICENSE_SECRET·LICENSE_SALT·ADMIN_SECRET 필요
 * python3 -m http.server 8080                     # 저장소 뿌리에서
 * node scripts/host-token.mjs > $E2E_DIR/tok.txt  # 강사 이용권
 * node scripts/e2e-local-relay.cjs
 * ```
 *
 * ## 이 판이 재는 것 (NOW B 5)
 *  ① 손님 셋(en·zh-CN·**ne**)이 원고 문단·소리·🎤 줄을 **각자 말로** 받는다
 *     — `ne` 가 핵이다: 강사가 **사전 번역하지 않은** 언어이므로, 받으면 **방이 번역한 것**이다
 *  ② **자물쇠**: 강사가 전선에 올린 프레임에 `trans`·`translated`·`tr` 가 **하나도 없다**
 *     (결정장부 43 · RULE: P-14). 전선에서 재므로 릴레이가 칸을 떨어뜨려도 못 속인다
 *  ③ **질문 길**(정본 §3): 손님 ✋ → 강사 「받기」 → 손님 폰이 글자로 → **글자만** 올라가고
 *     (소리 칸 없음 · RULE: P-04) → **모든 손님이 각자 말로** 보고, 강사는 강사 말로 본다
 *  ④ 엔진 둘: **크로미움 + 웹킷**(아이폰 사파리와 같은 엔진). 웹킷이 안 깔린 환경에서는
 *     건너뛰고 **그 사실을 한 줄로 적는다** — 조용히 반만 돌면 "둘 다 됐다"로 읽힌다(§20)
 */
const playwright = require('playwright');
const fs = require('fs');
const S = process.env.E2E_DIR || require('os').tmpdir();
const tok = fs.readFileSync(S + '/tok.txt', 'utf8').trim();
const SITE = process.env.E2E_SITE || 'http://127.0.0.1:8080';
const RELAY = process.env.E2E_RELAY || 'http://127.0.0.1:8787';
const RELAY_HOST = RELAY.replace(/^https?:\/\//, '');
const out = [];
const log = (k, v) => { out.push(`${k}: ${v}`); console.log(k, '→', v); };
const bad = [];
const fail = (why) => { bad.push(why); console.log('  [FAIL]', why); };
const ok = (cond, why) => { if (cond) console.log('  [PASS]', why); else fail(why); };

/** 강사가 전선에 올린 프레임을 모은다 — 자물쇠(②)가 읽는 자리 */
const CATCH_FRAMES = () => {
  window.__sentFrames = [];
  const origSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    try { if (typeof data === 'string') window.__sentFrames.push(data); } catch (_) {}
    return origSend.call(this, data);
  };
};

/** 손님 폰의 받아쓰기 — 진짜 규약대로(D-11): start→onstart, stop→onend, 결과는 isFinal */
const FAKE_DICTATION = () => {
  class FakeRec {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.running = false; }
    start() { if (this.running) throw new Error('already'); this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
    stop() { this.running = false; if (this.onend) this.onend(); }
    say(text) {
      const r = [{ 0: { transcript: text }, isFinal: true, length: 1 }];
      if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
    }
  }
  window.SpeechRecognition = FakeRec;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
  });
  window.__spoken = [];
  const o = window.speechSynthesis && window.speechSynthesis.speak.bind(window.speechSynthesis);
  if (o) window.speechSynthesis.speak = (u) => { window.__spoken.push({ t: u.text, l: u.lang }); };
};

const SCRIPT_TXT = '안전 교육을 시작하겠습니다.\n\n안전모를 반드시 착용하십시오.\n\n비상구 위치를 확인하세요.';
const GUEST_LANGS = ['en', 'zh-CN', 'ne'];

async function runOne(engineName, launcher) {
  const tag = `[${engineName}]`;
  console.log(`\n=== ${engineName} ===`);
  const b = await launcher();
  try {
    const hostCtx = await b.newContext();
    await hostCtx.addInitScript(CATCH_FRAMES);
    const host = await hostCtx.newPage();
    host.on('dialog', d => { log(`${tag} host dialog`, d.message()); d.accept(); });
    await host.goto(`${SITE}/web/host/?relay=${encodeURIComponent(RELAY)}&region=KR`);
    await host.fill('#tokenInput', tok);
    await host.click('#btnVerifyToken');
    await host.waitForSelector('#step-prepare', { state: 'visible', timeout: 15000 });
    log(`${tag} 1 이용권`, 'ok');

    await host.evaluate((t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'l.txt', { type: 'text/plain' }));
      const i = document.getElementById('fileInput');
      i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));
    }, SCRIPT_TXT);
    await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 3);

    /* 정본 §1 ② — 강사는 **말하는 언어 하나**만 고른다 */
    const srcLang = await host.evaluate(() => {
      const s = document.getElementById('srcLangSelect');
      return s ? s.value : '(없음)';
    });
    ok(srcLang === 'ko', `${tag} 강사 말하는 언어 하나 = ${srcLang}`);

    await host.click('#btnPreTranslate');
    await host.waitForSelector('#readyArea', { state: 'visible', timeout: 20000 });
    await host.click('#btnStartLecture');
    await host.waitForSelector('#step-live', { state: 'visible', timeout: 10000 });
    await host.waitForFunction(() => /연결/.test(document.getElementById('liveStatus').textContent), null, { timeout: 10000 });
    const code = (await host.textContent('#roomCode')).trim();
    log(`${tag} 2 방`, code);

    const guests = [];
    for (const lang of GUEST_LANGS) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
      await ctx.addInitScript(CATCH_FRAMES);
      await ctx.addInitScript(FAKE_DICTATION);
      const p = await ctx.newPage();
      await p.goto(`${SITE}/web/listener/?room=${code}&lang=${lang}&q=1&relay=${RELAY_HOST}`);
      await p.waitForFunction(() => document.getElementById('room-input').value.length === 6, null, { timeout: 10000 });
      await p.click('#btn-join');
      await p.waitForSelector('#chat-screen', { state: 'visible', timeout: 10000 });
      await p.click('#btn-toggle-tts');            // 소리 켠다
      guests.push({ lang, p });
    }
    log(`${tag} 3 손님 ${GUEST_LANGS.join('·')}`, '붙음');

    /* ① 원고 문단 — 각자 말로 */
    await host.waitForTimeout(800);
    await host.click('#btnNext');
    await host.waitForTimeout(2500);
    for (const g of guests) {
      const seen = await g.p.$$eval('#chat-list .msg-line', (els) => {
        const e = els[els.length - 1];
        if (!e) return { tr: '', pend: null };
        const t = e.querySelector('.msg-tr');
        return { tr: t ? t.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : '', pend: e.className };
      });
      /* ★ `!!seen.tr` 로는 못 가린다 — 번역이 실패하면 그 칸에 **「번역 안 됨」 배지**가
         들어가고 그것도 글자라서 초록이 된다(10-22 실측에서 그렇게 통과했다). 가짜 상류가
         붙이는 **언어 표**(`[en]`)를 본다. 그 표가 있으면 그 언어로 **번역을 샀다**는 뜻이다. */
      ok(seen.tr.indexOf(`[${g.lang}]`) === 0,
         `${tag} 문단 1 — ${g.lang} 손님이 **자기 말로** 받았다: "${seen.tr}"`);
      log(`${tag} 4 ${g.lang} 문단`, seen.tr);
    }

    /* ① 소리 — 각자 말로 */
    await host.click('#btnNext');
    await host.waitForTimeout(2500);
    for (const g of guests) {
      const sp = await g.p.evaluate(() => (window.__spoken || []).filter((x) => x && x.t).slice(-1)[0] || null);
      /* ★ 세 가지를 가른다(§20 · D-70 — **모름은 없음이 아니다**):
       *   읽었다            → 글자가 그 언어 번역이어야 한다 (빈 글자를 「읽었다」로 읽지 않는다)
       *   이 기계에 음성 없음 → 화면이 그렇게 **말하고 있으면** 맞는 동작이다(자막만 나간다)
       *   둘 다 아니다      → 붉다
       * 이 컨테이너에는 TTS 음성이 하나도 없다. 그것을 고장으로 읽으면 멀쩡한 길이 붉어지고,
       * 그냥 통과시키면 **음성 있는 폰에서 안 읽는 것**을 못 본다. 그래서 까닭을 적는다. */
      const voice = await g.p.evaluate(() => (window.__rtVoiceCheck || []).slice(-1)[0] || null);
      const noVoice = !!voice && (voice.have === 0 || voice.have === 'unknown');
      if (sp) {
        ok(sp.t.indexOf(`[${g.lang}]`) === 0,
           `${tag} 소리 — ${g.lang} 손님이 **자기 말로** 읽었다 (${sp.l})`);
      } else {
        ok(noVoice, `${tag} 소리 — ${g.lang}: 이 기계에 그 언어 음성이 없다 → 자막만 (화면도 그렇게 말한다: ${JSON.stringify(voice)})`);
      }
      log(`${tag} 5 ${g.lang} 소리`, JSON.stringify(sp));
    }

    /* ① 🎤 줄 — 원고 밖 말 */
    /* ★ `sendSpokenLine` 은 **전역이 아니다**(쪽 스크립트 안에 있다) — 창에 내놓은
       `window.rtHostMic.send` 로 부른다. 전역으로 부르면 조용히 'no fn' 이 되고 🎤 줄이
       아무에게도 안 간다(10-22 실측에서 그렇게 셋 다 빈손이었다). */
    const micSent = await host.evaluate(() => {
      if (window.rtHostMic && typeof window.rtHostMic.send === 'function') {
        window.rtHostMic.send('오늘 점심은 12시에 먹습니다');
        return 'rtHostMic.send';
      }
      return 'no fn';
    });
    ok(micSent !== 'no fn', `${tag} 🎤 줄을 보낼 자리가 있다 (${micSent})`);
    await host.waitForTimeout(3000);
    for (const g of guests) {
      const last = await g.p.$$eval('#chat-list .msg-line', (els) => {
        const e = els[els.length - 1];
        const t = e && e.querySelector('.msg-tr');
        return t ? t.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
      });
      ok(last.indexOf(`[${g.lang}]`) === 0, `${tag} 🎤 줄 — ${g.lang} 손님이 **자기 말로** 받았다: "${last}"`);
      log(`${tag} 6 ${g.lang} 🎤`, last);
    }

    /* ③ 질문 길 (정본 §3) — 손님이 말로 묻고, 모든 손님이 각자 말로 듣는다 */
    const qOn = await host.evaluate(() => {
      const c = document.getElementById('chkEnableQuestion');
      return c ? c.checked : null;
    });
    ok(qOn === true, `${tag} 질문 받기 기본 켬 (§24) = ${qOn}`);
    const asker = guests[0];                       // en 손님
    await asker.p.click('#btn-ask');
    await asker.p.waitForSelector('#ask-modal', { state: 'visible', timeout: 8000 });
    await asker.p.fill('#ask-input-text', 'hand up');
    await asker.p.click('#btn-ask-submit');
    /* ★ **단추가 있는 칸**을 기다린다. 대기줄의 첫 `div` 는 「질문 없음」 **자리표**이고
       단추가 없다 — 그것을 집으면 `b` 가 null 이라 **조용히 아무것도 안 눌리고**, 다음
       기다림이 10초 뒤에 터진다(10-22 실측에서 그 모양이었다). 사람이 누르는 것은 지명
       단추다(P-17) — 그 단추를 센다. */
    await host.waitForFunction(() => document.querySelectorAll('#askQueueList button').length >= 1, null, { timeout: 15000 });
    const granted = await host.evaluate(() => {
      const b = document.querySelector('#askQueueList button');
      if (!b) return false;
      b.click();
      return true;
    });
    ok(granted === true, `${tag} 질문 — 강사가 **사람 손으로** 지명했다 (P-17)`);
    await asker.p.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 10000 });
    ok(true, `${tag} 질문 — 지명되면 손님 폰의 받아쓰기가 열린다`);
    await asker.p.evaluate(() => window.__rec.say('Can we use this offline?'));
    await host.waitForTimeout(3000);

    const qFrames = (await asker.p.evaluate(() => window.__sentFrames || []))
      .map((f) => { try { return JSON.parse(f); } catch (_) { return null; } })
      .filter((m) => m && m.kind === 'question');
    ok(qFrames.length >= 1 && qFrames[0].src === 'Can we use this offline?',
       `${tag} 질문 — 손님 폰이 **글자로** 올렸다 ("${qFrames[0] ? qFrames[0].src : '없음'}")`);
    const AUDIO = ['audio', 'pcm', 'wav', 'blob', 'buf', 'samples', 'opus', 'webm'];
    const audioKeys = qFrames.length ? Object.keys(qFrames[0]).filter((k) => AUDIO.some((a) => k.toLowerCase().includes(a))) : [];
    ok(audioKeys.length === 0, `${tag} 질문 — 올라간 프레임에 **소리 칸이 없다** (RULE: P-04)`);

    for (const g of guests.slice(1)) {              // 질문한 손님 말고 **나머지 전부**
      const got = await g.p.$$eval('#chat-list .msg-line .msg-tr', (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /offline|오프라인|离线|अफलाइन/i.test(t)).slice(-1)[0] || '');
      ok(!!got, `${tag} 질문 — ${g.lang} 손님이 **자기 말로** 받았다: "${got.slice(0, 70)}"`);
      log(`${tag} 7 ${g.lang} 질문`, got.slice(0, 90));
    }
    const askShown = await host.textContent('#askActiveText');
    ok(/Can we use this offline\?/.test(askShown), `${tag} 질문 — 강사 화면에 원문이 있다`);
    const askLog = await host.evaluate(() => (window.rtHostAsk && window.rtHostAsk.log()) || []);
    ok(askLog.some((l) => l.indexOf('ask_tr ') === 0), `${tag} 질문 — 강사가 **강사 말로** 번역했다 (${askLog.find((l) => l.indexOf('ask_tr ') === 0) || '없음'})`);
    log(`${tag} 8 강사 질문 칸`, askShown.replace(/\s+/g, ' ').slice(0, 110));

    /* ② 자물쇠 — 강사가 올린 프레임에 번역 칸이 하나도 없다 (전선에서 잰다) */
    const BAD_KEYS = ['trans', 'translated', 'tr', 'translation', 'translations'];
    const deepFind = (o, path) => {
      const hits = [];
      if (!o || typeof o !== 'object') return hits;
      for (const [k, v] of Object.entries(o)) {
        const here = path ? path + '.' + k : k;
        if (BAD_KEYS.includes(k)) hits.push(here);
        if (v && typeof v === 'object') hits.push(...deepFind(v, here));
      }
      return hits;
    };
    const hostFrames = (await host.evaluate(() => window.__sentFrames || []))
      .map((f) => { try { return JSON.parse(f); } catch (_) { return null; } })
      .filter(Boolean);
    const leaks = hostFrames.flatMap((m, i) => deepFind(m, `#${i}(${m.kind || 'line'})`));
    ok(leaks.length === 0,
       `${tag} 자물쇠 — 강사가 올린 ${hostFrames.length}개 프레임에 번역 칸 0 (결정장부 43 · P-14)${leaks.length ? ': ' + leaks.join(', ') : ''}`);
    log(`${tag} 9 자물쇠`, `프레임 ${hostFrames.length} · 번역 칸 ${leaks.length}`);

    for (const g of guests) await g.p.context().close();
    await hostCtx.close();
  } finally {
    await b.close();
  }
}

(async () => {
  await runOne('chromium', () => playwright.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));

  /* ④ 웹킷 — 아이폰 사파리와 같은 엔진. 없으면 **건너뛰고 적는다**(§20: 조용히 반만 돌지 않는다) */
  let webkitPath = null;
  try { webkitPath = playwright.webkit.executablePath(); } catch (_) {}
  if (webkitPath && fs.existsSync(webkitPath)) {
    await runOne('webkit', () => playwright.webkit.launch());
  } else {
    log('웹킷', `안 깔렸다 — 건너뛴다 (${webkitPath || '경로 없음'}). 아이폰 사파리는 **실기 목록**이다`);
    console.log('  [SKIP] 웹킷이 이 환경에 없다. `npx playwright install webkit` 이 되는 곳에서 다시 돌린다');
  }

  fs.writeFileSync(S + '/e2e.out', out.join('\n'));
  console.log(`\n${bad.length ? '[FAIL] ' + bad.length + '건' : '[OK] 전부 통과'} — 기록: ${S}/e2e.out`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log('ERR', e.message);
  fs.writeFileSync(S + '/e2e.out', out.join('\n') + '\nERR ' + e.message);
  process.exit(1);
});
