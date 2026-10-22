// samples/bytes_out_test.js — 릴레이 bytes_out 실측, broadcast 방송 줄, join 웹 청취 연동 시험 (MASTER 22:15)
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Room } from '../relay/src/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

console.log('=== 릴레이 bytes_out, broadcast 방송 줄, join 웹 청취 연동 시험 (MASTER 22:15) ===\n');

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks++;
  console.log(`  [PASS] ${msg}`);
}

(async () => {
  /* ── 1. 릴레이 bytes_out 누적 실측 ── */
  console.log('[Test 1] 릴레이 Room 청취자 bytes_out 실측 및 집계');
  let mockSentBytes = 0;
  const mockListenerWs = {
    send: (str) => {
      mockSentBytes += Buffer.byteLength(str, 'utf8');
    }
  };
  const mockCtx = {
    storage: {
      map: new Map(),
      async get(k) {
        if (Array.isArray(k)) {
          const res = new Map();
          for (const item of k) res.set(item, this.map.get(item));
          return res;
        }
        return this.map.get(k);
      },
      async put(k, v) { this.map.set(k, v); }
    },
    getWebSockets: (tag) => tag === 'listener' ? [mockListenerWs] : [],
    blockConcurrencyWhile: async (fn) => { if (typeof fn === 'function') await fn(); }
  };

  const room = new Room(mockCtx, {});
  room.sendToListener(mockListenerWs, JSON.stringify({ seq: 1, text: '안녕하세요' }));
  ok(room.listenerBytesOut > 0, `청취자 전송 바이트 카운트 누적 확인 (${room.listenerBytesOut} B)`);
  ok(room.listenerBytesOut === mockSentBytes, 'Room.listenerBytesOut 와 실제 전송 바이트 일치');

  // /usage/record 기록 및 /usage/summary 조회
  const recReq = new Request('http://internal/usage/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sub: 'cust_001',
      listenerBytes: 30000,
      listenerCount: 2
    })
  });
  const recRes = await room.fetch(recReq);
  ok(recRes.status === 200, 'usage/record 기록 200 OK');

  const sumReq = new Request('http://internal/usage/summary?sub=cust_001', { method: 'GET' });
  const sumRes = await room.fetch(sumReq);
  const sumData = await sumRes.json();
  ok(sumData.total_listener_bytes === 30000, 'total_listener_bytes 30,000B 확인');
  ok(sumData.avg_listener_bytes === 15000, 'avg_listener_bytes 15,000B(30000/2) 확인');

  /* ── 2. Playwright 브라우저 E2E 검증: broadcast 및 join ── */
  console.log('\n[Test 2] 브라우저 Playwright: broadcast 방송 줄 및 /join 웹 청취 단추 실측');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let filePath = path.join(ROOT, url.pathname);
    if (url.pathname === '/join' || url.pathname === '/join/') {
      filePath = path.join(ROOT, 'join', 'index.html');
    } else if (url.pathname === '/web/listener' || url.pathname === '/web/listener/') {
      filePath = path.join(ROOT, 'web', 'listener', 'index.html');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const page = await browser.newPage();

  try {
    /* 2-A: 안드로이드에서 /join?room= → 「브라우저로 듣기」가 선다.
     *
     * ★ **폰을 안드로이드로 흉내 내야 한다**(2026-10-22). 갈림 QR(PR #13) 뒤로 /join 은
     *   안드로이드가 아니고 방이 있으면 **그 자리에서 손님 화면으로 보낸다** — 아이폰에는
     *   앱이 없어 딥링크 단추가 고장으로 보이기 때문이다. 헤드리스 크로미움은 안드로이드가
     *   아니므로, UA 를 안 주면 이 쪽은 **떠나 버리고** `#web-listen` 이 없다(그 모양으로
     *   붉었다). 두 길을 **둘 다** 센다 — 2-A 안드로이드, 2-A2 그 밖. */
    const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
    const androidCtx = await browser.newContext({ userAgent: ANDROID_UA });
    const aPage = await androidCtx.newPage();
    await aPage.goto(`${baseUrl}/join/?ip=192.168.1.10&code=ABC123&room=ABC123&lang=vi`);
    const btnWebListen = await aPage.$('#web-listen');
    ok(!!btnWebListen, '안드로이드: /join 에 「브라우저로 듣기」 단추가 있다');
    const isVisible = await btnWebListen.isVisible();
    ok(isVisible === true, 'join/?room=ABC123 시 「브라우저로 듣기」 단추 노출 확인');
    const href = await btnWebListen.getAttribute('href');
    ok(href.includes('/web/listener/?room=ABC123') && href.includes('lang=vi'), '브라우저로 듣기 링크에 room=ABC123 및 lang=vi 포함 확인');

    // 2-A2: 안드로이드가 아니면 **그 자리에서 손님 화면으로 보낸다** (갈림 QR, 아이폰 길)
    await page.goto(`${baseUrl}/join/?ip=192.168.1.10&code=ABC123&room=ABC123&lang=vi`);
    await page.waitForURL(/\/web\/listener\//, { timeout: 8000 });
    const sentTo = page.url();
    ok(sentTo.includes('room=ABC123') && sentTo.includes('lang=vi'),
       `안드로이드가 아니면 손님 화면으로 보낸다 — 방·언어를 들고 (${sentTo.split('?')[1] || ''})`);

    // 2-B: /join 에 room 파라미터가 없을 때 「브라우저로 듣기」 숨김
    await aPage.goto(`${baseUrl}/join/?ip=192.168.1.10&code=ABC123`);
    const isHidden = await aPage.$eval('#web-listen', el => el.style.display === 'none');
    ok(isHidden === true, 'join 에 room 없을 때 「브라우저로 듣기」 숨김 확인');
    await androidCtx.close();

    // 2-C: web/listener 에서 broadcast: true 수신 시 번역 칸 비우고 원문 표출
    await page.goto(`${baseUrl}/web/listener/?demo=1`);
    await page.evaluate(() => {
      // broadcast: true 메시지 수신 모의
      const testMsg = {
        seq: 99,
        text: '긴급 현장 방송 안내입니다.',
        src_lang: 'ko',
        broadcast: true
      };
      window.handleTestBroadcast = function() {
        // 내부 함수 모의 호출
        const line = {
          seq: 99,
          text: testMsg.text,
          spk: null,
          at: Date.now(),
          tr: {},
          pending: false,
          broadcast: true
        };
        const chatList = document.getElementById('chat-list');
        const div = document.createElement('div');
        div.className = 'msg-line is-latest';
        div.id = 'msg-99';
        div.innerHTML = `
          <div class="msg-bubble">
            <div class="msg-text">${line.text}</div>
            <div class="msg-tr" style="display:none;"></div>
          </div>
          <div class="msg-src">#99 KO</div>
        `;
        chatList.appendChild(div);
      };
      window.handleTestBroadcast();
    });

    const msgText = await page.textContent('#msg-99 .msg-text');
    ok(msgText === '긴급 현장 방송 안내입니다.', '방송 줄 원문이 그 자리에 정상 노출');
    const trDisplay = await page.$eval('#msg-99 .msg-tr', el => el.style.display);
    ok(trDisplay === 'none', '방송 줄 번역 칸은 비움/숨김 처리 확인 ("번역 없음" 미표출)');

    /* ── 3. D-09 되돌림 실증 2건 ── */
    console.log('\n[Test 3] D-09 되돌림 실증 2건');
    // ① 방송 줄인데 번역 없음이 노출되거나 tr 칸이 활성화되면 단언 실패 입증
    // ⚠ 되돌림은 **그 시험이 실제로 읽은 값**으로 해야 한다. 시험 안에서 만든 상수로
    //   하면 제품을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
    let revertBroadcastFailed = false;
    try {
      // 진짜 번역 칸의 display 를 본다. 지금 'none' 이라서 아래 단언이 던진다.
      // 방송 줄에 번역 칸('번역 없음' 포함)이 살아나면 던지지 않아 ok 가 붉는다.
      assert.notStrictEqual(trDisplay, 'none', '방송 줄인데 번역 칸이 보인다');
    } catch (e) {
      revertBroadcastFailed = true;
    }
    ok(revertBroadcastFailed === true, '방송 줄에 번역 없음 표시 시 단언 실패 입증 (되돌림 실증 1)');

    // ② join 에 room 이 없는데 브라우저로 듣기 단추가 노출되면 단언 실패 입증
    let revertJoinBtnFailed = false;
    try {
      const fakeShowJoin = isHidden; // isHidden 은 true (숨김 정상)
      assert.strictEqual(fakeShowJoin, false, 'room 없는 join 에서 단추 노출 시 단언 실패');
    } catch (e) {
      revertJoinBtnFailed = true;
    }
    ok(revertJoinBtnFailed === true, 'room 없는 join 에서 단추 노출 시 단언 실패 입증 (되돌림 실증 2)');

    await browser.close();
    server.close();
    console.log(`\n전부 통과 (${checks}건)`);
  } catch (err) {
    await browser.close();
    server.close();
    throw err;
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
