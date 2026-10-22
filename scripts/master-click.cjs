#!/usr/bin/env node
/* scripts/master-click.cjs — 단추를 하나씩 **눌러 보는** 시험 (대표님 10-22 17:57 "고")
 *
 * 기준은 코드가 아니라 정본 v1 과 대표님 실기다. 단추를 누르고 **무언가 일어났나**를 잰다.
 * 아무것도 안 바뀌면 FAIL. 결과는 단추 × 결과 표.
 *
 * ★ 10-22 18:40 (B): 두 가지를 고쳤다 — 둘 다 **FAIL 을 숨기지 않고 늘리는** 쪽이다.
 *   ① **바퀴 둘**. 정본 v1 §1 ② 로 원고는 「선택」이 되어, 원고 없이 시작하면 문단 단추
 *      (▶·다음·이전·건너뜀)가 **맞게 꺼진다**. 한 바퀴로는 "꺼진 것"과 "고장난 것"을 가를
 *      수 없다. 그래서 **A 원고 없이(🎤)** · **B 원고 3문단** 두 바퀴를 돈다.
 *   ② **재는 것을 늘렸다.** 글자 크기 단추는 `html` 의 class 와 **자막 줄의 실제 글자 크기**를
 *      바꾼다 — 글·칸 수·전선으로는 **안 보인다**. 그래서 10-22 18:06 표에서 「아무 일도
 *      안 일어났다」로 찍혔는데, 실제로는 거품만 커지고 **자막은 안 커지는 진짜 결함**이었다
 *      (`theme.css` 의 `!important`). 이제 class·글자 크기·전체화면·active 도 같이 잰다.
 *   ③ **해당 없음(N/A)** 을 따로 센다. 「크롬으로 열기」는 **아이폰 사파리에서만** 나오는
 *      단추다 — 크로미움에서 안 보이는 것이 맞다. 통과로 세면 거짓이고 FAIL 로 세면
 *      고칠 것이 없는 줄이 영원히 붉다. 그래서 세 번째 칸에 적고 **통과 수에 넣지 않는다.**
 *
 * 쓰는 법 (로컬):
 *   cd relay && npx wrangler dev --local --port 8787
 *   python3 -m http.server 8099        # 저장소 뿌리
 *   RELAY_URL=http://127.0.0.1:8787 node scripts/host-token.mjs | grep -E '^ey' | tail -1 > /tmp/tok.txt
 *   SITE=http://127.0.0.1:8099 E2E_RELAY=http://127.0.0.1:8787 TOK=$(cat /tmp/tok.txt) node scripts/master-click.cjs
 *   ENGINE=webkit 로 아이폰 쪽도 돈다 — **이 컨테이너에는 웹킷이 깔리지 않는다**(내려받기 막힘).
 */
const { chromium, webkit } = require(process.env.PW_PATH || 'playwright');
const SITE = process.env.SITE || 'http://127.0.0.1:8099';
const RELAY = process.env.E2E_RELAY || 'http://127.0.0.1:8787';
const TOK = (process.env.TOK || '').trim();
const ENGINE = process.env.ENGINE || 'chromium';
const SHOT = process.env.SHOT_DIR || '';
const rows = [];
const row = (screen, btn, state, note) => { rows.push({ screen, btn, state, note }); };

const FRAMES = `(() => { window.__sent = []; const S = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { window.__sent.push(String(d).slice(0, 300)); } catch (e) {} return S.call(this, d); }; })();`;

/* 무엇이 바뀌었나를 재는 자리 — **한 곳**이다(§4). 재는 것을 늘릴 때는 여기만 고친다. */
async function snap(p) {
  return p.evaluate(() => {
    const vis = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null).length;
    /* ★ **자막 줄(`.msg-tr`)과 거품(`.msg-bubble`)을 따로** 잰다. 하나로 재면 10-22 의
       결함을 또 놓친다 — 거품은 커지는데 손님이 읽는 자막은 안 커졌다(§4 읽는 곳). */
    const tr = document.querySelector('#chat-list .msg-tr');
    const bub = document.querySelector('#chat-list .msg-bubble');
    return {
      text: document.body.innerText,
      vis,
      sent: (window.__sent || []).length,
      speaking: !!(window.speechSynthesis && window.speechSynthesis.speaking),
      cls: document.documentElement.className,                       // font-s/font-l · view-screen …
      fs: tr ? getComputedStyle(tr).fontSize : '',                    // 손님이 **읽는 줄**(자막)
      fsBub: bub ? getComputedStyle(bub).fontSize : '',               // 거품(원문 칸)
      full: !!document.fullscreenElement,
      active: [...document.querySelectorAll('.tool-btn.active, .btn.active')].map((e) => e.id).join(','),
    };
  });
}
function whatChanged(a, b) {
  const what = [];
  if (a.text !== b.text) what.push('글자 바뀜');
  if (a.vis !== b.vis) what.push(`보이는 칸 ${a.vis}→${b.vis}`);
  if (b.sent > a.sent) what.push(`방으로 ${b.sent - a.sent}건`);
  if (b.speaking !== a.speaking) what.push('소리');
  if (a.cls !== b.cls) what.push(`class ${a.cls || '-'}→${b.cls || '-'}`);
  if (a.fs !== b.fs) what.push(`자막 ${a.fs}→${b.fs}`);
  if (a.fsBub !== b.fsBub) what.push(`거품 ${a.fsBub}→${b.fsBub}`);
  if (a.full !== b.full) what.push('전체화면');
  if (a.active !== b.active) what.push('눌린 표시');
  return what;
}
/** 단추 하나. `expectOff` 면 꺼져 있는 것이 **맞다**(원고 0 에서 문단 단추). `na` 면 해당 없음 */
async function press(p, screen, sel, label, opts = {}) {
  const el = await p.$(sel);
  if (!el) return row(screen, label, opts.na ? 'N/A' : 'FAIL', opts.na || '단추가 없다');
  if (!(await el.isVisible())) return row(screen, label, opts.na ? 'N/A' : 'FAIL', opts.na || '안 보인다');
  if (await el.isDisabled()) {
    return row(screen, label, opts.expectOff ? 'PASS' : 'FAIL',
      opts.expectOff ? '꺼져 있다 — 원고 0 이니 맞다' : '꺼져 있다(disabled)');
  }
  if (opts.expectOff) return row(screen, label, 'FAIL', '켜져 있다 — 원고 0 인데 누를 수 있다');
  const a = await snap(p);
  try { await el.click({ timeout: 3000 }); } catch (e) { return row(screen, label, 'FAIL', '눌리지 않는다: ' + e.message.split('\n')[0]); }
  await p.waitForTimeout(900);
  const what = whatChanged(a, await snap(p));
  row(screen, label, what.length ? 'PASS' : 'FAIL', what.join(' · ') || '아무 일도 안 일어났다');
}

const SCRIPT_TXT = '첫 문단입니다. 안전모를 씁니다.\n\n둘째 문단입니다. 안전화를 신습니다.\n\n셋째 문단입니다. 끝입니다.';
async function putScript(host) {
  await host.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], 'l.txt', { type: 'text/plain' }));
    const i = document.getElementById('fileInput');
    i.files = dt.files;
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, SCRIPT_TXT);
  await host.waitForTimeout(900);
}

async function openHost(b, withScript, errs) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ENGINE === 'chromium' ? ['microphone'] : [] });
  await ctx.addInitScript(FRAMES);
  const host = await ctx.newPage();
  host.on('pageerror', (e) => errs.push('강사 ' + e.message));
  host.on('dialog', (d) => d.accept());
  await host.goto(`${SITE}/web/host/?relay=${encodeURIComponent(RELAY)}&region=KR`);
  await host.fill('#tokenInput', TOK);
  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible', timeout: 15000 });
  if (withScript) await putScript(host);
  return host;
}

(async () => {
  if (!TOK) { console.error('TOK 가 필요하다'); process.exit(2); }
  const bt = ENGINE === 'webkit' ? webkit : chromium;
  /* 🎤 길을 **진짜로** 밟으려면 마이크가 있어야 한다. 머리 없는 크로미움은 `getUserMedia` 가
     막혀서 `startMic()` 이 「거부됨」에서 되돌아온다 — 그러면 단추를 눌러도 글자가 안 바뀌어
     **고장처럼 보인다.** 가짜 장치를 켠다(소리는 빈 소리다 — 받아쓰기 결과는 여전히 안 온다). */
  const b = await bt.launch({ args: ENGINE === 'chromium'
    ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : [] });
  const errs = [];

  /* ── 바퀴 A — 원고 **없이** 시작한다 (정본 v1 §1 ②) ───────────────────────── */
  const hA = await openHost(b, false, errs);
  const startNoScript = await hA.isVisible('#btnStartLecture');
  row('A 강사 준비', '원고 없이 「강의 시작」 보임', startNoScript ? 'PASS' : 'FAIL', startNoScript ? '' : '원고를 올려야만 나온다');
  const overflow = await hA.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  row('A 강사 준비', '폰 폭 가로 넘침 없음', overflow <= 1 ? 'PASS' : 'FAIL', `넘침 ${overflow}px`);
  if (SHOT) await hA.screenshot({ path: `${SHOT}/A-host-prepare-390.png`, fullPage: true });
  if (startNoScript) {
    await hA.click('#btnStartLecture');
    try {
      await hA.waitForSelector('#step-live', { state: 'visible', timeout: 10000 });
      row('A 강사 진행', '원고 0 으로 진행 화면 열림', 'PASS', '🎤 길');
      await hA.waitForTimeout(1200);
      /* 원고가 0 이면 문단 단추는 **꺼져 있어야** 맞다 */
      for (const [sel, label] of [['#btnPlay', '▶ 재생/■'], ['#btnNext', '다음 ▶'], ['#btnPrev', '◀ 이전'], ['#btnSkip', '건너뜀']]) {
        await press(hA, 'A 강사 진행', sel, label, { expectOff: true });
      }
      /* ★ 10-22 17:35 ④: 원고가 0 이면 시작과 함께 🎤 가 **스스로 켜진다**.
         그러면 이 단추는 **끄는** 단추다 — 그 둘을 따로 센다. */
      const micAuto = await hA.evaluate(() => ({ on: window.rtHostMic.state.on, log: window.rtHostMic.log() }));
      row('A 강사 진행', '🎤 가 스스로 켜졌다 (원고 0)', micAuto.on ? 'PASS' : 'FAIL',
        micAuto.on ? '단추를 더 누르지 않아도 듣는다' : `꺼져 있다 (기록: ${micAuto.log.slice(-2).join(' / ') || '없음'})`);
      await press(hA, 'A 강사 진행', '#btnMic', micAuto.on ? '🎤 끄기' : '🎤');
      if (SHOT) await hA.screenshot({ path: `${SHOT}/A-host-live-390.png`, fullPage: true });
      await press(hA, 'A 강사 진행', '#btnEnd', '끝내기');
    } catch (e) {
      row('A 강사 진행', '원고 0 으로 진행 화면 열림', 'FAIL', e.message.split('\n')[0]);
    }
  }
  await hA.context().close();

  /* ── PC(1366px) 준비 화면 — 10-22 17:35 ②③ ─────────────────────────────────
   * ② 가로 넘침은 폰만의 일이 아니다. ③ 말하는 언어 고르개의 **펼침 목록**이 PC 에서
   * 흰 바탕에 한 줄만 보였다 — `option` 의 바탕·글자색은 스크린샷으로 가릴 수 없으니
   * **계산된 색**을 잰다(사진은 같이 남긴다). */
  {
    const pctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
    const pc = await pctx.newPage();
    pc.on('pageerror', (e) => errs.push('강사PC ' + e.message));
    await pc.goto(`${SITE}/web/host/?relay=${encodeURIComponent(RELAY)}&region=KR`);
    await pc.fill('#tokenInput', TOK);
    await pc.click('#btnVerifyToken');
    await pc.waitForSelector('#step-prepare', { state: 'visible', timeout: 15000 });
    await pc.waitForTimeout(1200);
    const over = await pc.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    row('PC 강사 준비', '1366px 가로 넘침 없음', over <= 1 ? 'PASS' : 'FAIL', `넘침 ${over}px`);
    const sel = await pc.evaluate(() => {
      const el = document.getElementById('srcLangSelect');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const op = el.options[0] ? getComputedStyle(el.options[0]) : null;
      return { n: el.options.length, scheme: cs.colorScheme,
               opBg: op ? op.backgroundColor : '', opFg: op ? op.color : '',
               first: el.options[0] ? el.options[0].textContent : '' };
    });
    row('PC 강사 준비', '고르개에 82개가 다 있다', sel && sel.n >= 82 ? 'PASS' : 'FAIL', sel ? `${sel.n}개 · 첫 줄 "${sel.first}"` : '고르개가 없다');
    /* 펼침 목록은 OS 가 그린다 — 화면 배색을 **말해 주지 않으면** 흰 바탕에 흰 글자가 된다
       (대표님 10-22 17:35 ③). 어느 쪽 배색인지는 그때그때 다르니(10-22 저녁에 밝은 쪽으로
       바뀌었다) **값을 박지 않고**, ① 배색을 말해 주었나 ② 바탕이 비치지 않나 ③ 글자와
       바탕이 다른가 셋만 본다. */
    const told = sel && /^(light|dark)$/.test((sel.scheme || '').trim());
    const opaque = sel && sel.opBg && sel.opBg !== 'rgba(0, 0, 0, 0)' && sel.opBg !== 'transparent';
    const readable = sel && sel.opFg && sel.opFg !== sel.opBg;
    row('PC 강사 준비', '펼침 목록이 화면 배색을 따른다', told && opaque && readable ? 'PASS' : 'FAIL',
      sel ? `color-scheme=${sel.scheme} · option 바탕 ${sel.opBg} · 글자 ${sel.opFg}` : '-');
    if (SHOT) await pc.screenshot({ path: `${SHOT}/PC-host-prepare-1366.png`, fullPage: true });
    await pctx.close();
  }

  /* ── 바퀴 B — 원고 3문단 (문단 단추가 **실제로** 도나) ────────────────────── */
  const h = await openHost(b, true, errs);
  const startWithScript = await h.isVisible('#btnStartLecture');
  row('B 강사 준비', '원고 올린 뒤 「강의 시작」 보임', startWithScript ? 'PASS' : 'FAIL', startWithScript ? '미리 번역 없이도' : '미리 번역이 있어야 나온다');
  try {
    await h.click('#btnStartLecture', { timeout: 5000 });
    await h.waitForSelector('#step-live', { state: 'visible', timeout: 10000 });
  } catch (e) {
    row('B 강사 진행', '진행 화면 열림', 'FAIL', e.message.split('\n')[0]);
    return report(b, errs);
  }
  await h.waitForTimeout(1500);
  const code = (await h.textContent('#roomCode')).trim();
  row('B 강사 진행', '방 번호', /^[A-Z0-9]{6}$/.test(code) ? 'PASS' : 'FAIL', code);

  /* 손님 하나 */
  const gctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await gctx.addInitScript(FRAMES);
  const g = await gctx.newPage();
  g.on('pageerror', (e) => errs.push('손님 ' + e.message));
  await g.goto(`${SITE}/web/listener/?room=${code}&lang=en&relay=${RELAY.replace(/^https?:\/\//, '')}`);
  await g.waitForTimeout(1500);
  if (await g.isVisible('#btn-join')) await press(g, 'B 손님', '#btn-join', '들어가기');
  await g.waitForTimeout(1500);

  for (const [sel, label] of [['#btnPlay', '▶ 재생/■'], ['#btnNext', '다음 ▶'], ['#btnPrev', '◀ 이전'], ['#btnPlay', '▶ 재생/■ (다시)'],
    ['#btnSkip', '건너뜀'], ['#btnBreak', '휴식'], ['#btnMic', '🎤']]) await press(h, 'B 강사 진행', sel, label);
  if (SHOT) await h.screenshot({ path: `${SHOT}/B-host-live-390.png`, fullPage: true });

  /* 손님 단추 — 줄이 와 있는 상태에서 누른다(자막 크기를 재려면 줄이 있어야 한다) */
  for (const [sel, label, opts] of [
    ['#btn-tr-server', '서버 번역', {}],
    ['#btn-toggle-src', '원문 보기', {}],
    ['#btn-toggle-tts', '소리 켬/끔', {}],
    ['#btn-open-voice-picker', '목소리 고르기', {}],
    ['#btn-close-voice-picker', '목소리 닫기', {}],
    ['#btn-bg-audio', '화면 꺼도 듣기', {}],
    ['#btn-font-l', '글자 크게', {}],
    ['#btn-font-s', '글자 작게', {}],
    ['#btn-font-m', '글자 보통', {}],
    ['#btn-ask', '✋ 질문', {}],
    ['#btn-ask-cancel', '질문 취소', {}],
    ['#btn-fullscreen', '큰 화면', {}],
    ['#btn-save', '저장', {}],
    ['#btn-save-close', '저장 닫기', {}],
    ['#btn-open-chrome', '크롬으로 열기', { na: '아이폰 사파리에서만 나온다 — 이 엔진에는 해당 없음' }],
  ]) await press(g, 'B 손님', sel, label, opts);
  if (SHOT) await g.screenshot({ path: `${SHOT}/B-guest-390.png`, fullPage: true });

  await press(h, 'B 강사 진행', '#btnEnd', '끝내기');
  report(b, errs);
})().catch((e) => { console.error('터졌다', e); process.exit(1); });

async function report(b, errs) {
  await b.close();
  const fail = rows.filter((r) => r.state === 'FAIL').length;
  const na = rows.filter((r) => r.state === 'N/A').length;
  console.log(`\n=== 마스터 누르기 시험 (${ENGINE}, 폰 390px) — 통과 ${rows.length - fail - na} / ${rows.length - na}${na ? ` (해당 없음 ${na})` : ''} ===`);
  for (const r of rows) console.log(`${r.state} | ${r.screen} | ${r.btn} | ${r.note}`);
  if (errs.length) { console.log('\n페이지 오류:'); errs.slice(0, 10).forEach((e) => console.log(' - ' + e)); }
  process.exit(fail ? 1 : 0);
}
