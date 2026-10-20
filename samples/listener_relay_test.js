// samples/listener_relay_test.js — 손님 화면이 **어디로 붙나** (마스터 10-20 13:50 고침의 자물쇠)
//
// 대표님 웹 실기: "connecting↔reconnecting 반복". 까닭은 한 줄이었다 — QR 주소에 `relay` 가
// 없으면 손님 화면이 **같은 호스트**(raytok.kr)의 `/ws` 로 붙었고, 그곳은 **정적 사이트**라
// WebSocket 이 없다. 시험은 전부 `?relay=` 를 **손으로 넘겨서** 그 자리를 못 봤다(D-11 —
// 가짜가 실기와 다르면 시험이 거짓말을 한다).
//
// 그래서 이 시험은 **운영 주소를 흉내 낸다**: `https://raytok.kr/...` 로 들어가고(playwright
// 경로 가로채기로 그 호스트의 파일을 우리 것으로 준다), `WebSocket` 을 가짜로 바꿔 **붙으려 한
// 주소**를 적는다. 네 경우를 돈다:
//   ① 운영 · relay 없음  → **운영 릴레이**로 (같은 호스트가 아니다) ← 실기가 깨진 자리
//   ② `?relay=` 가 있으면 그것
//   ③ 로컬 개발(8788)      → 8787
//   ④ 로컬(그 밖)          → 같은 호스트 (시험·로컬은 전과 같다)
//
// 돌리기: node samples/listener_relay_test.js   (playwright 필요)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 손님 화면이 붙는 주소 (listener relay) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const PROD_RELAY = 'raytok-relay.raytok.workers.dev';

/** 붙으려 한 주소만 적고 실제로는 안 붙는 가짜 WebSocket */
const FAKE_WS = `(() => {
  window.__wsUrls = [];
  class FakeWS {
    constructor(url) {
      window.__wsUrls.push(String(url));
      this.url = String(url); this.readyState = 0;
      this.onopen = null; this.onclose = null; this.onerror = null; this.onmessage = null;
    }
    send() {} close() { this.readyState = 3; }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
})();`;

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});

  /**
   * 그 주소(호스트까지)로 들어간 것처럼 연다 — 파일은 이 저장소에서 준다.
   * 호스트가 판정에 들어가므로(운영이냐 로컬이냐) **주소를 흉내 내는 것이 핵심**이다.
   */
  async function openAt(url) {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    await ctx.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      let p = decodeURIComponent(u.pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream',
                             body: fs.readFileSync(f) });
    });
    await page.addInitScript(FAKE_WS);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => (window.__wsUrls || []).length > 0, { timeout: 8000 })
      .catch(() => {});
    const urls = await page.evaluate(() => window.__wsUrls || []);
    await ctx.close();
    return urls;
  }

  try {
    /* ① 운영 주소 · relay 없음 — 실기가 깨진 그 자리 */
    const prod = await openAt('https://raytok.kr/web/listener/?room=123456&auto=1');
    ok(prod.length > 0, `① 붙으려 한 주소가 있다 (${prod.length}개)`);
    ok(prod[0].startsWith(`wss://${PROD_RELAY}/ws?`),
       `① relay 가 없는 운영 주소는 **운영 릴레이**로 간다 — ${prod[0]}`);
    /*
     * ★ 되돌림 실증: 고침을 되돌리면(같은 호스트로 떨어지면) 이 줄이 붉어진다.
     * 그 값이 실기에 찍힌 모양이다 — `wss://raytok.kr/ws?...` (정적 사이트라 WebSocket 이 없다).
     */
    ok(!/^wss:\/\/raytok\.kr\//.test(prod[0]),
       `① 같은 호스트(raytok.kr)로는 붙지 않는다 (되돌림 실증 — 실기의 connecting↔reconnecting)`);
    ok(/room=123456/.test(prod[0]) && /role=listener/.test(prod[0]),
       '① 방 번호와 역할은 그대로 실린다');

    /* ② 주소에 relay 가 있으면 그것을 쓴다 (전과 같다) */
    const given = await openAt('https://raytok.kr/web/listener/?room=123456&auto=1&relay=relay.example.com');
    ok(given[0] && given[0].startsWith('wss://relay.example.com/ws?'),
       `② ?relay= 를 넘기면 그것으로 간다 — ${given[0]}`);

    /* ③ 로컬 개발(8788) — 릴레이는 8787 이다 */
    const dev = await openAt('http://localhost:8788/web/listener/?room=123456&auto=1');
    ok(dev[0] && dev[0].startsWith('ws://localhost:8787/ws?'),
       `③ 로컬 개발 8788 은 8787 로 간다 — ${dev[0]}`);

    /* ④ 로컬(그 밖) — 같은 호스트. 시험·로컬은 전과 같다 */
    const local = await openAt('http://localhost:4173/web/listener/?room=123456&auto=1');
    ok(local[0] && local[0].startsWith('ws://localhost:4173/ws?'),
       `④ 로컬은 같은 호스트로 간다 (전과 같다) — ${local[0]}`);

    /* ⑤ 강사 화면 QR 은 **늘** relay 를 넘긴다 — 같은 고침의 반쪽 */
    const host = fs.readFileSync(path.join(ROOT, 'web/host/index.html'), 'utf-8');
    ok(/u\.searchParams\.set\('relay', RELAY_BASE/.test(host),
       '⑤ 강사 화면 QR 이 relay 를 **조건 없이** 넘긴다 (운영에서도)');
    ok(!/if \(urlParams\.get\('relay'\)\) u\.searchParams\.set\('relay'/.test(host),
       '⑤ 옛 모양(주소에 relay 가 있을 때만 넘김)은 남아 있지 않다');

    console.log(`\n[OK] ${checks}개 확인 — 손님 화면이 붙는 주소`);
  } finally {
    await b.close();
  }
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
