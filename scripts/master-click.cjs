#!/usr/bin/env node
/* scripts/master-click.cjs — 마스터가 직접 누르는 시험 (대표님 10-22 17:57 "고")
 *
 * 만든 세션이 아니라 마스터가 쓴다. 기준은 코드가 아니라 정본 v1 과 대표님 실기 목록이다.
 * 단추를 하나씩 누르고 「무언가 일어났나」(화면 글자·보이는 칸·방으로 간 메시지)를 잰다.
 * 아무것도 안 바뀌면 FAIL. 결과는 단추 × 결과 표.
 *
 * 쓰는 법 (로컬):
 *   cd relay && npx wrangler dev --local --port 8787
 *   python3 -m http.server 8099        # 저장소 뿌리
 *   RELAY_URL=http://127.0.0.1:8787 node scripts/host-token.mjs | tail -1 > /tmp/tok.txt
 *   TOK=$(cat /tmp/tok.txt) node scripts/master-click.cjs
 */
const { chromium, webkit } = require(process.env.PW_PATH || 'playwright');
const SITE = process.env.SITE || 'http://127.0.0.1:8099';
const RELAY = process.env.E2E_RELAY || 'http://127.0.0.1:8787';
const TOK = (process.env.TOK || '').trim();
const ENGINE = process.env.ENGINE || 'chromium';
const rows = [];
const row = (screen, btn, pass, note) => { rows.push({ screen, btn, pass, note }); };

const FRAMES = `(() => { window.__sent = []; const S = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { window.__sent.push(String(d).slice(0, 300)); } catch (e) {} return S.call(this, d); }; })();`;

async function snap(p) {
  return p.evaluate(() => {
    const vis = [...document.querySelectorAll('body *')].filter((e) => e.offsetParent !== null).length;
    return { text: document.body.innerText, vis, sent: (window.__sent || []).length,
      speaking: !!(window.speechSynthesis && window.speechSynthesis.speaking) };
  });
}
async function press(p, screen, sel, label) {
  const el = await p.$(sel);
  if (!el) return row(screen, label, false, '단추가 없다');
  const shown = await el.isVisible();
  if (!shown) return row(screen, label, false, '안 보인다');
  const a = await snap(p);
  try { await el.click({ timeout: 3000 }); } catch (e) { return row(screen, label, false, '눌리지 않는다: ' + e.message.split('\n')[0]); }
  await p.waitForTimeout(900);
  const b = await snap(p);
  const what = [];
  if (a.text !== b.text) what.push('글자 바뀜');
  if (a.vis !== b.vis) what.push(`보이는 칸 ${a.vis}→${b.vis}`);
  if (b.sent > a.sent) what.push(`방으로 ${b.sent - a.sent}건`);
  if (b.speaking !== a.speaking) what.push('소리');
  row(screen, label, what.length > 0, what.join(' · ') || '아무 일도 안 일어났다');
}

(async () => {
  if (!TOK) { console.error('TOK 가 필요하다'); process.exit(2); }
  const bt = ENGINE === 'webkit' ? webkit : chromium;
  const b = await bt.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ENGINE === 'chromium' ? ['microphone'] : [] });
  await ctx.addInitScript(FRAMES);
  const host = await ctx.newPage();
  host.on('pageerror', (e) => errs.push('강사 ' + e.message));
  host.on('dialog', (d) => d.accept());
  await host.goto(`${SITE}/web/host/?relay=${encodeURIComponent(RELAY)}&region=KR`);
  await host.fill('#tokenInput', TOK);
  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible', timeout: 15000 });

  /* 정본 v1 §1 ② — 원고는 선택이다. 원고 없이 시작 단추가 보여야 한다 */
  const startNoScript = await host.isVisible('#btnStartLecture');
  row('강사 준비', '원고 없이 「강의 시작」 보임', startNoScript, startNoScript ? '' : '원고를 올려야만 나온다');
  const overflow = await host.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  row('강사 준비', '폰 폭 가로 넘침 없음', overflow <= 1, `넘침 ${overflow}px`);

  if (!startNoScript) {
    await host.evaluate(() => {
      const t = '첫 문단입니다. 안전모를 씁니다.\n\n둘째 문단입니다. 안전화를 신습니다.\n\n셋째 문단입니다. 끝입니다.';
      const dt = new DataTransfer(); dt.items.add(new File([t], 'l.txt', { type: 'text/plain' }));
      const i = document.getElementById('fileInput'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await host.waitForTimeout(800);
    const vis2 = await host.isVisible('#btnStartLecture');
    row('강사 준비', '원고 올린 뒤 「강의 시작」 보임', vis2, vis2 ? '' : '원고를 올려도 안 나온다(미리 번역이 있어야?)');
    if (!vis2) { try { await host.click('#btnPreTranslate'); await host.waitForSelector('#readyArea', { state: 'visible', timeout: 20000 }); } catch (e) { row('강사 준비', '미리 번역 → 시작', false, e.message.split('\n')[0]); } }
  }
  try {
    await host.click('#btnStartLecture', { timeout: 5000 });
    await host.waitForSelector('#step-live', { state: 'visible', timeout: 10000 });
  } catch (e) {
    row('강사 진행', '진행 화면 열림', false, e.message.split('\n')[0]);
    return report(b, errs);
  }
  await host.waitForTimeout(1500);
  const code = (await host.textContent('#roomCode')).trim();
  row('강사 진행', '방 번호', /^[A-Z0-9]{6}$/.test(code), code);

  /* 손님 하나 */
  const gctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await gctx.addInitScript(FRAMES);
  const g = await gctx.newPage();
  g.on('pageerror', (e) => errs.push('손님 ' + e.message));
  await g.goto(`${SITE}/web/listener/?room=${code}&lang=en&relay=${RELAY.replace(/^https?:\/\//, '')}`);
  await g.waitForTimeout(1500);
  if (await g.isVisible('#btn-join')) await press(g, '손님', '#btn-join', '들어가기');
  await g.waitForTimeout(1500);

  for (const [sel, label] of [['#btnPlay', '▶ 재생/■'], ['#btnNext', '다음 ▶'], ['#btnPrev', '◀ 이전'], ['#btnPlay', '▶ 재생/■ (다시)'],
    ['#btnSkip', '건너뜀'], ['#btnBreak', '휴식'], ['#btnMic', '🎤']]) await press(host, '강사 진행', sel, label);

  for (const [sel, label] of [['#btn-toggle-src', '원문 보기'], ['#btn-tr-server', '서버 번역'], ['#btn-toggle-tts', '소리 켬/끔'],
    ['#btn-open-voice-picker', '목소리 고르기'], ['#btn-close-voice-picker', '목소리 닫기'], ['#btn-bg-audio', '화면 꺼도 듣기'],
    ['#btn-font-l', '글자 크게'], ['#btn-font-s', '글자 작게'], ['#btn-ask', '✋ 질문'], ['#btn-ask-cancel', '질문 취소'],
    ['#btn-fullscreen', '큰 화면'], ['#btn-save', '저장'], ['#btn-save-close', '저장 닫기'], ['#btn-open-chrome', '크롬으로 열기']]) await press(g, '손님', sel, label);

  await press(host, '강사 진행', '#btnEnd', '끝내기');
  report(b, errs);
})().catch((e) => { console.error('터졌다', e); process.exit(1); });

async function report(b, errs) {
  await b.close();
  const fail = rows.filter((r) => !r.pass).length;
  console.log(`\n=== 마스터 누르기 시험 (${ENGINE}, 폰 390px) — 통과 ${rows.length - fail} / ${rows.length} ===`);
  for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.screen} | ${r.btn} | ${r.note}`);
  if (errs.length) { console.log('\n페이지 오류:'); errs.slice(0, 10).forEach((e) => console.log(' - ' + e)); }
  process.exit(fail ? 1 : 0);
}
