// samples/listener_open_chrome_test.js — 「크롬으로 열기」 (NOW B 7 · 편의)
//
// 왜 있나: 아이폰 사파리에서 **새 자막 줄까지** 번역되는지 우리는 아직 모른다(실기 대기).
// 크롬이 있으면 손님이 한 번 눌러 옮겨 갈 수 있게 한다. 없으면 아무 일도 일어나지 않고
// 사파리 번역 → 「서버 번역으로」가 받친다 — 그래서 **묻지 않는다**(물어서 알 길이 없다).
//
// 보는 것: ① 아이폰 사파리에서만 띠가 뜬다 ② 아이폰 크롬·안드로이드·PC 에서는 안 뜬다
//          ③ 띠 자리(구조) ④ 단추가 **같은 주소**를 크롬 꼴로 연다 ⑤ 기록 `ios_chrome on=·go=`
//          ⑥ 되돌림 실증: UA 에서 iPhone 을 빼면 띠가 사라진다
//
// ⚠ 이 기계에는 **웹킷이 없다** — 여기서 도는 것은 크로미움이고, UA 만 아이폰 꼴로 준다.
//    사파리 **엔진**이 하는 일은 증명하지 못한다(§20: 못 본 것은 못 봤다고 한다).
//
// 돌리기: node samples/listener_open_chrome_test.js
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

console.log('=== 「크롬으로 열기」 — 아이폰 사파리 (B 7) ===');
let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

/* 가짜 릴레이로 **실제로 참여**한다. 왜: 이 띠는 `#chat-screen` 안에 있어 참여 전에는
   화면에 없다. 참여하지 않고 `style.display` 만 보면 **화면에 없는 것을 통과시킨다** —
   §12 가 적어 둔 그 사고다("화면에 안 보였는데 testID 시험은 전부 통과했다").
   그래서 아래는 **보이는지**(computed)와 **눌리는지**를 함께 본다. */
const relay = createMockRelay({ root: path.join(__dirname, '..'), roomTranslate: false });

function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const t = raw.toString();
      if (t.includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'web', guide: 1, src_lang: 'ko' }));
    });
  });
}

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  pc: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const room = relay.newRoom('guide');
  const host = await openHost(base, room);
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });

  async function open(ua) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
    const page = await ctx.newPage();
    await page.goto(`${base}/web/listener/?room=${room.code}&lang=en`, { waitUntil: 'load' });
    await page.waitForSelector('#btn-join');
    await page.click('#btn-join');                      // **참여한다** — 그래야 이 띠가 화면에 있다
    await page.waitForSelector('#chat-screen', { state: 'visible' });
    await page.waitForTimeout(250);
    const got = await page.evaluate(() => {
      const box = document.getElementById('ios-chrome');
      const vis = box ? !!(box.offsetWidth || box.offsetHeight || box.getClientRects().length) : null;
      return {
        shown: vis,                                     // **보이는가**(computed) — style 값이 아니다
        log: (window.rtIosChrome && window.rtIosChrome.log()) || [],
        text: box ? box.textContent.replace(/\s+/g, ' ').trim() : '',
        parent: box && box.parentElement ? box.parentElement.id : '',
        next: box && box.nextElementSibling ? box.nextElementSibling.id : '',
        url: window.rtIosChrome ? window.rtIosChrome.urlOf('https://raytok.kr/web/listener/?room=ABC123&lang=ne') : ''
      };
    });
    return { ctx, page, got };
  }

  try {
    /* ① 아이폰 사파리 — 뜬다 */
    let r = await open(UA.iosSafari);
    ok(r.got.shown === true, `① 아이폰 사파리에서 띠가 **화면에 보인다** (기록 ${JSON.stringify(r.got.log)})`);
    ok(/Chrome/.test(r.got.text) && r.got.text.length > 10,
       `① 글자가 손님 말로 들어 있다 ("${r.got.text}")`);
    /* ③ 자리 — #chat-screen 안, #tr-notice **바로 앞** 형제 (§12 구조 단언) */
    ok(r.got.parent === 'chat-screen' && r.got.next === 'tr-notice',
       `③ 자리: #${r.got.parent} > #ios-chrome → 다음 형제 #${r.got.next}`);
    /* ④ 같은 주소를 크롬 꼴로 — 방 코드·언어가 그대로 간다 */
    ok(r.got.url === 'googlechromes://raytok.kr/web/listener/?room=ABC123&lang=ne',
       `④ 같은 주소를 크롬 꼴로 연다 (${r.got.url})`);
    /* ⑤ 단추를 누르면 기록이 남는다 (크롬이 없는 기계라 실제로 넘어가지는 않는다) */
    await r.page.click('#btn-open-chrome');
    await r.page.waitForTimeout(200);
    const log2 = await r.page.evaluate(() => window.rtIosChrome.log());
    ok(log2.some((l) => l === 'ios_chrome go=1'), `⑤ 누른 것이 기록에 남는다 (${JSON.stringify(log2)})`);
    await r.ctx.close();

    /* ② 아이폰 크롬 — 이미 크롬이다. 뜨면 손님을 제자리로 보내는 꼴이다 */
    r = await open(UA.iosChrome);
    ok(r.got.shown === false, `② 아이폰 크롬에서는 안 뜬다 (기록 ${JSON.stringify(r.got.log)})`);
    await r.ctx.close();

    /* ② 안드로이드·PC — 크롬 꼴 주소가 쓸모없다 */
    r = await open(UA.android);
    ok(r.got.shown === false, '② 안드로이드에서는 안 뜬다');
    await r.ctx.close();
    r = await open(UA.pc);
    ok(r.got.shown === false, '② PC 에서는 안 뜬다');
    await r.ctx.close();

    /*
     * ⑥ 되돌림 실증 (D-09) — 페이지가 **UA 를 읽는가**.
     * 아이폰 사파리 UA 에서 `iPhone` 만 뺀 것으로 같은 자리를 돈다. 띠가 사라지면 ①의
     * 초록은 **UA 를 읽은 결과**다. 어딘가에 "늘 뜬다"가 박혀 있으면 이 줄이 통과하지 않는다.
     */
    r = await open(UA.iosSafari.replace('iPhone; CPU iPhone OS', 'X11; Linux'));
    ok(r.got.shown === false,
       `⑥ UA 에서 iPhone 을 빼면 띠가 사라진다 (기록 ${JSON.stringify(r.got.log)}) — 되돌림 실증`);
    await r.ctx.close();

    console.log(`\n[OK] ${pass}개 확인 — 「크롬으로 열기」`);
  } finally {
    try { host.close(); } catch (_) {}
    for (const rm of relay.rooms.values()) {
      for (const l of [...rm.listeners.keys()]) { try { l.close(1000, 'test_end'); } catch (_) {} }
      for (const h of [...rm.hosts]) { try { h.close(1000, 'test_end'); } catch (_) {} }
    }
    await browser.close();
    relay.close();
  }
  process.exit(0);
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
