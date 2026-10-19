/* scripts/demo-shots.mjs — 11월 웹 데모 **장면 기록** (마스터 NOW 10-19 21:35 B 1)
 *
 * 대표님 20:08 "작동하는 걸 **보여줘야** 내가 가서 팔 거 아니야."
 * → 로컬 릴레이 + 강사 화면 + 손님 3대를 끝까지 돌리고 **장면마다 PNG** 를 남긴다.
 *   대표님이 폰으로 넘겨 보며 "이렇게 된다" 를 본다.
 *
 * 돌리기:  node scripts/demo-shots.mjs          (→ docs/demo-shots/*.png + README.md)
 *         node scripts/demo-shots.mjs --check  (그리지 않고 **README 가 장면 목록과 같은지**만 본다)
 *
 * ★ 바깥으로 아무것도 안 나간다 — 목업 릴레이(`samples/mock_relay.js`)와 저장소 파일만 쓴다.
 *   브라우저 인식·소리·QR 은 모두 이 컨테이너 안에서 가짜로 돈다(실기 아님).
 *   **이것은 증거가 아니라 그림이다.** 됨/안 됨의 근거는 `docs/demo-web-gaps.md` 가 든다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from 'playwright';
const { chromium } = pw;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'demo-shots');
const VIDEO = 'demo-host.webm';            // 강사 화면 한 번 흐름 (손님 폰은 그림으로만)
const CHECK = process.argv.includes('--check');

/* 장면 목록 — **한 곳**이다. README 도 이 배열에서 만든다(§4: 같은 것을 두 곳에 적지 않는다). */
export const SCENES = [
  ['01-host-auth',      '강사 화면을 열고 이용권 한 줄을 붙여넣는다'],
  ['02-host-script',    '원고(TXT)를 올리면 문단이 나뉘고, 손님 언어로 미리 번역한다'],
  ['03-host-live-qr',   '강의 시작 — 방 코드 6자리와 QR 이 뜬다'],
  ['04-guest-join-1',   '손님 폰: QR 로 들어오면 코드가 채워져 있다 (영어·일본어·중국어 3대 — -1·-2·-3)'],
  ['05-guest-subtitle-1', '문단을 보내면 손님 3대에 각자 언어 자막이 뜬다 (-1·-2·-3)'],
  ['06-host-mic',       '🎤 생으로 말하기 — 확정된 문장만 손님에게 간다'],
  ['07-guest-hand',     '손님이 ✋ 를 들면 대기열에 번호가 붙는다'],
  ['08-host-queue',     '강사 화면 질문 대기열 — **사람이 지명해야** 발언권이 간다'],
  ['09-host-end',       '끝내기 — 참석·시간·읽은 문단·건너뛴 문단 요약'],
  ['10-host-report',    '리포트(내용 3 × 형식 3) · 참석 CSV · 정확본 칸']
];

const readmeOf = () => `# 데모 장면 기록 — 11월 웹 데모 (${new Date().toISOString().slice(0, 10)})

폰으로 넘겨 보시면 됩니다. 순서대로 한 장면씩입니다.

| | 장면 | 무엇 |
|---|---|---|
${SCENES.map(([f, d], i) => `| ${i + 1} | \`${f}.png\` | ${d} |`).join('\n')}

- \`${VIDEO}\` — 강사 화면이 처음부터 끝까지 가는 **짧은 영상**(소리 없음). 폰에서도 재생됩니다.
- 만드는 법: \`node scripts/demo-shots.mjs\` (저장소 루트에서). 목업 릴레이로 돌기 때문에
  **인터넷에 아무것도 나가지 않습니다.**
- ⚠ **이 그림은 증거가 아닙니다.** 브라우저 인식·소리·QR 읽기가 모두 이 컨테이너 안의
  가짜로 돌았습니다. 무엇이 실제로 되고 무엇이 아직 모르는지는 \`docs/demo-web-gaps.md\` 가 듭니다.
- 시연 순서와 막혔을 때 볼 것은 \`docs/demo-web-1119.md\` 한 장에 있습니다.
`;

if (CHECK) {
  const p = path.join(OUT, 'README.md');
  if (!fs.existsSync(p)) { console.error('[FAIL] README 가 없다 — node scripts/demo-shots.mjs'); process.exit(1); }
  const have = fs.readFileSync(p, 'utf-8');
  const missing = SCENES.filter(([f]) => !have.includes(`\`${f}.png\``));
  const noFile = SCENES.filter(([f]) => !fs.existsSync(path.join(OUT, `${f}.png`)));
  /* README 가 영상을 가리키면 그 파일이 **있어야** 한다. 영상은 "가능하면" 이라 없을 수도
     있는데, 그때는 README 도 안 가리켜야 한다 — 가리키면서 없는 것이 거짓말이다. */
  if (have.includes(VIDEO) && !fs.existsSync(path.join(OUT, VIDEO))) {
    console.error(`[FAIL] README 는 ${VIDEO} 를 가리키는데 파일이 없다`);
    process.exit(1);
  }
  if (missing.length || noFile.length) {
    console.error(`[FAIL] README 빠짐 ${missing.map(x => x[0]).join(',') || '없음'} · 그림 빠짐 ${noFile.map(x => x[0]).join(',') || '없음'}`);
    process.exit(1);
  }
  /* 되돌림 실증 (D-09) — 위 비교가 **정말 비교인지** 본다. 장면 하나를 뺀 README 를 만들어
     같은 셈에 넣는다(파일은 건드리지 않는다). 못 잡으면 위 [OK] 는 빈 말이다. */
  const bent = have.replace(`\`${SCENES[0][0]}.png\``, '`없는-장면.png`');
  const bentMissing = SCENES.filter(([f]) => !bent.includes(`\`${f}.png\``));
  if (bent === have || bentMissing.length !== 1) {
    console.error('[FAIL] 장면 하나를 뺀 README 를 못 잡는다 — 이 검사는 증거가 아니다 (되돌림 실증)');
    process.exit(1);
  }
  console.log(`[OK] 장면 ${SCENES.length}개 — README 와 PNG 가 목록과 같다 (되돌림 실증: 한 장을 빼면 잡힌다)`);
  process.exit(0);
}

/* ── 그리기 ────────────────────────────────────────────────────────────── */
const { createMockRelay } = await import(path.join(ROOT, 'samples', 'mock_relay.js'));
const relay = createMockRelay({ root: ROOT });

const FAKE_SPEECH = `
  class FakeRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.running=false; }
    start() { if (this.running) throw new Error('already started'); this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
    stop() { this.running = false; if (this.onend) this.onend(); }
    say(text, isFinal) {
      const r = [{ isFinal: !!isFinal, length: 1 }];
      r[0][0] = { transcript: text };
      if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
    }
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true,
    value: { request: async () => ({ release() {}, addEventListener() {} }) } });
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en' }, { lang: 'ja-JP', name: 'ja' }, { lang: 'vi-VN', name: 'vi' }];
    window.speechSynthesis.speak = (u) => { if (u && u.text) window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = () => {};
  }
`;

const shot = async (page, name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};
/* 손님 3대를 한 장에 — 폰 셋을 나란히 붙인다(대표님이 한눈에 본다) */
const guestStrip = async (pages, name) => {
  const bufs = [];
  for (const p of pages) { await p.waitForTimeout(150); bufs.push(await p.screenshot()); }
  /* 캔버스 없이 세 장을 그대로 둔다 — 합치려면 브라우저 하나를 더 띄워야 해서 그러지 않는다 */
  /* 폰 셋을 각각 남긴다 — 합치려면 브라우저를 하나 더 띄워야 해서 그러지 않는다.
     목록이 가리키는 이름은 `-1` 이다(같은 그림을 두 번 쓰지 않는다). */
  for (let i = 0; i < bufs.length; i++) fs.writeFileSync(path.join(OUT, `${name}-${i + 1}.png`), bufs[i]);
  console.log(`  ✓ ${name}-1..${bufs.length}.png`);
};

fs.mkdirSync(OUT, { recursive: true });
const VIDEO_TMP = fs.mkdtempSync(path.join(OUT, '.video-'));
const port = await relay.listen();
const base = `http://localhost:${port}`;
const browser = await chromium.launch();
const outside = [];
const watch = (p) => p.on('request', (rq) => {
  const u = new URL(rq.url());
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outside.push(rq.url());
});

try {
  /* ── 강사 ── */
  /* 강사 화면은 **영상으로도** 남긴다(마스터 NOW 1 "가능하면 짧은 영상"). 손님 폰은 안 찍는다 —
     셋을 다 찍으면 파일이 커지고, 대표님이 보시는 흐름은 강사 화면 하나로 이어진다. */
  const hostCtx = await browser.newContext({
    viewport: { width: 1100, height: 980 }, acceptDownloads: true,
    recordVideo: { dir: VIDEO_TMP, size: { width: 1100, height: 980 } }
  });
  await hostCtx.addInitScript(FAKE_SPEECH);
  const host = await hostCtx.newPage();
  watch(host);
  host.on('dialog', async (d) => { await d.accept(); });
  await host.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
  await host.fill('#tokenInput', 'valid_demo_token');
  await shot(host, SCENES[0][0]);

  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible' });
  const txt = '안전 교육을 시작하겠습니다.\n\n안전모를 반드시 착용하십시오.\n\n비상구 위치를 확인하세요.\n\n질문 있으면 손을 드세요.';
  await host.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], 'lecture.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, txt);
  await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 4);
  /* 손님 셋의 언어를 **고른다**. 안 고르면 그 언어는 사전 번역이 없어 손님 화면에 **원문**이
     뜬다 — 화면 안내 그대로다("번역이 없는 언어의 청취자는 원문을 봅니다"). 처음에 안 골랐다가
     베트남어 손님 그림에 한국어가 찍혀 다시 찍었다. */
  await host.evaluate((want) => {
    document.querySelectorAll('#langChips input[type=checkbox]').forEach((cb) => {
      const on = want.includes(cb.value);
      if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }, ['en', 'ja', 'zh-CN']);
  await host.click('#btnPreTranslate');
  await host.waitForSelector('#readyArea', { state: 'visible', timeout: 15000 });
  await shot(host, SCENES[1][0]);

  await host.click('#btnStartLecture');
  await host.waitForSelector('#step-live', { state: 'visible', timeout: 8000 });
  await host.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 8000 });
  const code = (await host.textContent('#roomCode')).trim();
  await shot(host, SCENES[2][0]);

  /* ── 손님 3대 (폰 폭) ── */
  const guests = [];
  /* ⚠ 목업 릴레이는 **vi 를 일부러 503 으로 실패**시킨다(R-15 시험: 한 언어가 실패해도 나머지는
     간다). 그 언어로 찍으면 그림에 원문만 나와 **오해를 준다** — 번역이 오는 언어로 찍는다.
     손님 화면 글자 자체는 81개 언어로 나온다(`test:listener-i18n`). */
  for (const [lang, name] of [['en', 'Alice'], ['ja', 'Kenji'], ['zh-CN', 'Mei']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(FAKE_SPEECH);
    const p = await ctx.newPage();
    watch(p);
    await p.goto(`${base}/web/listener/?room=${code}&lang=${lang}&relay=localhost:${port}`);
    await p.waitForFunction(() => document.getElementById('room-input').value.length === 6);
    await p.fill('#name-input', name);
    guests.push({ p, lang, name });
  }
  await guestStrip(guests.map((g) => g.p), '04-guest-join');

  for (const g of guests) {
    await g.p.click('#btn-join');
    await g.p.waitForSelector('#chat-screen', { state: 'visible', timeout: 10000 });
  }
  await host.waitForFunction(() => document.getElementById('attNow').textContent === '3', null, { timeout: 8000 });

  /* ── 자막 ── */
  await host.click('#btnNext');
  await host.keyboard.press('ArrowRight');
  for (const g of guests) {
    await g.p.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length >= 2, null, { timeout: 8000 });
  }
  await guestStrip(guests.map((g) => g.p), '05-guest-subtitle');

  /* ── 🎤 ── */
  await host.waitForSelector('#micBox', { state: 'visible', timeout: 8000 });
  await host.click('#btnMic');
  await host.waitForFunction(() => !!window.__rec, null, { timeout: 8000 });
  await host.evaluate(() => window.__rec.say('비상구는 저쪽 계단 옆에 있습니다.', true));
  await host.waitForTimeout(600);
  await shot(host, SCENES[5][0]);

  /* ── ✋ 질문 ── */
  const asker = guests[2];                       // 중국어 손님
  await asker.p.waitForSelector('#btn-ask', { state: 'visible', timeout: 8000 });
  await asker.p.click('#btn-ask');
  await asker.p.waitForSelector('#ask-modal', { state: 'visible', timeout: 8000 });
  await asker.p.fill('#ask-input-text', '紧急出口在哪里?');
  await asker.p.click('#btn-ask-submit');
  await asker.p.waitForFunction(() => /#\d/.test(document.getElementById('btn-ask').textContent), null, { timeout: 8000 });
  await shot(asker.p, SCENES[6][0]);

  /* 강사 화면 대기열 — 사람이 지명해야 발언권이 간다(P-17). 지명 단추까지 보이는 장면을 남긴다. */
  await host.waitForFunction(() => document.querySelectorAll('#askQueue li, #askQueue .ask-item, #askQueue tr').length >= 1,
                             null, { timeout: 8000 }).catch(() => {});
  await host.evaluate(() => {
    const q = document.getElementById('askQueue');
    if (q) q.scrollIntoView({ block: 'center' });
  });
  await shot(host, SCENES[7][0]);

  /* ── 끝내기 ── */
  await host.click('#btnMic');                   // 🎤 를 끄고 끝낸다
  await host.click('#btnEnd');
  await host.waitForSelector('#step-end', { state: 'visible', timeout: 8000 });
  await shot(host, SCENES[8][0]);

  await host.evaluate(() => document.getElementById('postasrBox').scrollIntoView({ block: 'center' }));
  await shot(host, SCENES[9][0]);

  /* 영상 — 컨텍스트를 닫아야 파일이 떨어진다. 한 파일만 남기고 임시 자리는 치운다. */
  await hostCtx.close();
  const vids = fs.readdirSync(VIDEO_TMP).filter((f) => f.endsWith('.webm'));
  if (vids.length) {
    fs.copyFileSync(path.join(VIDEO_TMP, vids[0]), path.join(OUT, VIDEO));
    const kb = Math.round(fs.statSync(path.join(OUT, VIDEO)).size / 1024);
    console.log(`  ✓ ${VIDEO} (${kb}KB)`);
  } else {
    console.log(`  (영상 없음 — 브라우저가 못 찍었다. 그림 ${SCENES.length}장은 그대로다)`);
  }
  fs.rmSync(VIDEO_TMP, { recursive: true, force: true });

  fs.writeFileSync(path.join(OUT, 'README.md'), readmeOf());
  console.log(`\n장면 ${SCENES.length}개 · 바깥 요청 ${outside.length}건${outside.length ? ' — ' + outside[0] : ''}`);
  if (outside.length) { console.error('[FAIL] 바깥으로 요청이 나갔다'); process.exit(1); }
  console.log(`→ ${path.relative(ROOT, OUT)}/`);
} finally {
  await browser.close();
  if (relay.close) await relay.close();
}
process.exit(0);
