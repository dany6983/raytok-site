/* samples/host_mic_raw_test.js — 웹 강사 🎤 PC 소리 받기 가르기 판 (NOW 11-11 14:59 ①)
 * 실행: node samples/host_mic_raw_test.js   (npm run test:host-mic-raw)
 *
 *  기본(켬): getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}) · 기록 `mic_open raw=1`
 *  거울(D-09): `?micRaw=0` 이면 getUserMedia({audio:true}) · 기록 `mic_open raw=0`
 *  이것이 PC 유튜브 소리를 Web Speech 까지 살리는지는 **모름**(D-11) — 대표님 실기 「PC 유튜브 3분 · 켬/끔 두 판」.
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

const FAKE = `
  window.__gum = [];
  class FakeRecognition {
    constructor() { this.running = false; }
    start() { this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
    stop() { this.running = false; if (this.onend) this.onend(); }
    abort() { this.running = false; if (this.onend) this.onend(); }
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: async (c) => { window.__gum.push(JSON.stringify(c)); return { getTracks: () => [{ stop() {} }] }; } } });
`;

async function run(browser, base, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 }, locale: 'ko-KR' });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR${extra}`);
  await page.fill('#tokenInput', 'valid_instructor_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible' });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['원고 한 문단입니다.'], 'g.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 1);
  await page.check('#chkBroadcastRaw');
  await page.click('#btnPreTranslate');
  await page.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'raw', null, { timeout: 5000 });
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  await page.click('#btnMic');                                   // 단추를 누른다(MISTAKES #11)
  await page.waitForFunction(() => window.__gum.length > 0 && window.rtHostMic.state.on === true, null, { timeout: 5000 });
  const r = await page.evaluate(() => ({ gum: window.__gum.slice(), log: window.rtHostMic.log().filter((l) => /^mic_open/.test(l)) }));
  await ctx.close();
  return r;
}

(async () => {
  console.log('=== 웹 강사 🎤 — PC 소리 받기 가르기 판 (11-11 ①) ===');
  const relay = createMockRelay({ root: path.join(__dirname, '..') });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    const a = await run(browser, base, '');
    const c = JSON.parse(a.gum[0]);
    ok(a.gum.length === 1 && c.audio && c.audio.echoCancellation === false && c.audio.noiseSuppression === false && c.audio.autoGainControl === false,
      `기본: 에코 제거·잡음 억제·자동 음량 끔 (${a.gum[0]})`);
    ok(a.log.length === 1 && a.log[0] === 'mic_open raw=1', `기록 ${JSON.stringify(a.log)}`);
    const m = await run(browser, base, '&micRaw=0');
    ok(m.gum[0] === '{"audio":true}' && m.log[0] === 'mic_open raw=0', `되돌림 실증(D-09): ?micRaw=0 → ${m.gum[0]} · ${m.log[0]}`);
  } catch (e) { console.error('[FAIL]', e && e.message || e); process.exitCode = 1; }
  finally { await browser.close(); relay.close(); }
  console.log(`\n=== ${pass} PASS ===`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
