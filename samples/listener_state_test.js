// samples/listener_state_test.js — 청취 페이지 ④ (MASTER 10-14 11:10): 빈 방 문구 셋(대기·끊김·끝남) · 자막 글자 크기 소·중·대 · wakeLock
// 실행: node samples/listener_state_test.js   (CHROME=<경로> 로 브라우저를 바꿀 수 있다)
// 되돌려서 실패 확인: index.html updateRoomState 의 'status_reconnecting' 분기를 지우면 [끊김] 이 붉다.
//                     applyFontSize 의 localStorage.setItem 을 지우면 [새로고침 뒤 기억] 이 붉다.
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

console.log('=== 청취 페이지 ④ 빈 방 문구 · 글자 크기 · wakeLock 시험 ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const relay = createMockRelay({ root: path.join(__dirname, '..') });

// 호스트 흉내: hello 가 오면 welcome, 그 뒤는 시험이 보낸다
function openHost(base, room) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room.code}&role=host&token=${room.token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const s = raw.toString();
      if (s.includes('"hello"')) ws.send(JSON.stringify({ welcome: 1, plan: 'trial', guide: 1, src_lang: 'ko' }));
    });
  });
}

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
    // wakeLock 호출을 센다 (헤드리스에는 진짜 wakeLock 이 없다)
    await ctx.addInitScript(() => {
      window.__wake = 0;
      Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wake++; return { release: async () => {}, addEventListener: () => {} }; } }, configurable: true });
    });
    const page = await ctx.newPage();
    const outside = [];
    page.on('request', (r) => { if (!r.url().startsWith(base)) outside.push(r.url()); });
    page.on('console', (m) => console.log('BROWSER CONSOLE:', m.text()));

    // ── 1. 대기: welcome 뒤 줄 0 → 띠 (UI 언어 vi)
    const room1 = relay.newRoom('guide');
    const host1 = await openHost(base, room1);
    await page.goto(`${base}/web/listener/?room=${room1.code}&lang=vi`);
    await page.waitForSelector('#btn-join');
    await page.click('#btn-join');
    await page.waitForSelector('#chat-screen', { state: 'visible' });
    await page.waitForSelector('#room-state.on.state-waiting', { timeout: 5000 });
    const waitTxt = await page.textContent('#room-state');
    ok(waitTxt === 'Đang chờ người nói…', `[대기] welcome 뒤 줄 0 → "${waitTxt}" (vi)`);
    ok(await page.evaluate(() => window.__wake) >= 1, '[wakeLock] 참여하면 navigator.wakeLock.request 를 부른다');

    // [앱 같이 받기] 단추가 없음 (장부 63: 손님은 전부 웹)
    const hasPackBtn = await page.$('#btn-get-pack');
    ok(hasPackBtn === null, '[받기 단추 없음] 「앱 같이 받기」 단추가 제거되었다 (장부 63)');

    // ── 2. 끊김: 호스트 쪽이 서버 소켓을 끊으면 재연결 중 → 띠가 끊김 문구로
    for (const l of [...room1.listeners.keys()]) { try { l.close(1012, 'restart'); } catch (_) {} }
    await page.waitForSelector('#room-state.on.state-disconnected', { timeout: 5000 });
    const discTxt = await page.textContent('#room-state');
    ok(discTxt === 'Mất kết nối. Đang kết nối lại…', `[끊김] 소켓이 끊기면 → "${discTxt}"`);
    // 3초 뒤 다시 붙어 welcome → 대기로 돌아온다
    await page.waitForSelector('#room-state.on.state-waiting', { timeout: 8000 });
    ok(true, '[끊김→대기] 다시 붙으면 대기 문구로 돌아온다');

    // ── 3. 줄이 오면 띠가 사라진다
    host1.send(JSON.stringify({ seq: 1, src_lang: 'ko', text: '안전모를 쓰세요', tr: { vi: 'Hãy đội mũ bảo hộ' } }));
    await page.waitForSelector('.msg-line');
    await page.waitForFunction(() => !document.getElementById('room-state').classList.contains('on'));
    ok(true, '[줄 도착] 줄이 하나라도 오면 빈 방 띠를 치운다');

    // ── 3.1. 「원문 보기」 상태 기억 (켜기 켜고 새 줄 → 원문 보임, 끄고 새 줄 → 원문 숨김) ──
    await page.click('#btn-toggle-src');
    host1.send(JSON.stringify({ seq: 2, src_lang: 'ko', text: '원문보기 켜짐 테스트', tr: { vi: 'Test On' } }));
    await page.waitForFunction(() => document.querySelectorAll('.msg-line').length >= 2);
    const srcVisOn = await page.$eval('.msg-line:last-child .msg-text', el => el.style.display !== 'none');
    ok(srcVisOn === true, '[원문 보기] 켠 상태에서 새 줄을 받으면 원문이 보인다');

    await page.click('#btn-toggle-src');
    host1.send(JSON.stringify({ seq: 3, src_lang: 'ko', text: '원문보기 꺼짐 테스트', tr: { vi: 'Test Off' } }));
    await page.waitForFunction(() => document.querySelectorAll('.msg-line').length >= 3);
    const srcVisOff = await page.$eval('.msg-line:last-child .msg-text', el => el.style.display === 'none');
    ok(srcVisOff === true, '[원문 보기] 끈 상태에서 새 줄을 받으면 원문이 숨겨진다');

    // ── 3.2. 질문 줄·스킵 줄 되풀이 거르기 (중복 메시지 전송 시 줄 수 1) ──
    const dupQ = JSON.stringify({ kind: 'question', id: 'q_dup_test', askRev: 1, src: '중복 질문', seq: 4 });
    host1.send(dupQ);
    host1.send(dupQ);
    await page.waitForTimeout(300);
    const dupCount = await page.evaluate(() => lines.filter(l => l.ask === 'q_dup_test').length);
    ok(dupCount === 1, '[중복 거르기] 같은 질문 메시지를 두 번 보내도 줄은 1개만 생성된다');

    // ── 4. 글자 크기 소·중·대 — 기본 중(15px), 대 20px, 소 13px, localStorage 기억 → 새로고침 뒤에도
    const fs0 = await page.$eval('.msg-bubble', (e) => getComputedStyle(e).fontSize);
    ok(fs0 === '15px', `[글자] 기본 = 보통 ${fs0}`);
    ok((await page.textContent('#btn-font-l')) === 'Lớn', '[글자] 단추 글자도 81언어 사전 (vi: Lớn)');
    await page.click('#btn-font-l');
    ok(await page.$eval('.msg-bubble', (e) => getComputedStyle(e).fontSize) === '20px', '[글자] 크게 → 20px');
    await page.click('#btn-font-s');
    ok(await page.$eval('.msg-bubble', (e) => getComputedStyle(e).fontSize) === '13px', '[글자] 작게 → 13px');
    ok(await page.evaluate(() => localStorage.getItem('raytok_font')) === 's', '[글자] localStorage raytok_font=s');
    await page.reload();
    await page.waitForSelector('#btn-join');
    ok(await page.evaluate(() => document.documentElement.classList.contains('font-s')), '[글자] 새로고침 뒤 기억(font-s)');
    ok(await page.evaluate(() => !document.getElementById('room-state').classList.contains('on')), '[대기] 참여 전(join 화면)에는 띠 없음');

    // ── 5. 끝남: 새 방에서 줄 없이 end → 끝남 문구 (+ 종료 창)
    const room2 = relay.newRoom('guide');
    const host2 = await openHost(base, room2);
    await page.goto(`${base}/web/listener/?room=${room2.code}&lang=vi`);
    await page.waitForSelector('#btn-join');
    await page.click('#btn-join');
    await page.waitForSelector('#room-state.on.state-waiting', { timeout: 5000 });
    host2.send(JSON.stringify({ end: 1, summary: { lines: 0, minutes: 0 } }));
    await page.waitForSelector('#room-state.on.state-ended', { timeout: 5000 });
    const endTxt = await page.textContent('#room-state');
    ok(endTxt === 'Phiên đã kết thúc', `[끝남] end 가 오면 → "${endTxt}"`);

    ok(outside.length === 0, `외부 요청 0건 (${outside.length})`);

    // ── 되돌림 실증 2건 (B-BACKLOG "모든 줄에 걸리는 조건: 시험 + 되돌림 1건") ──
    // ⚠ 되돌림은 **이 시험이 실제로 읽은 값**으로 한다. 시험 안에서 만든 상수로 하면
    //   제품을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검).

    // ① 띠 글자가 **한국어로 굳으면** 붉어야 한다 — 손님은 자기 언어로 본다(§18).
    //    지금 vi 청취자가 베트남어 끝남 문구를 봐서 아래 단언이 던진다.
    let revertLangFailed = false;
    try {
      assert.strictEqual(endTxt, '세션이 종료되었습니다', `vi 청취자에게 한국어 띠가 떴다 (실제: "${endTxt}")`);
    } catch (e) {
      revertLangFailed = true;
    }
    ok(revertLangFailed === true, '띠 글자를 한국어로 굳히면 붉어진다 (되돌림 실증 1)');

    // ② 청취 페이지가 바깥으로 나가면 붉어야 한다 (P-16 ① — 번역을 청하지 않는다).
    //    지금 0건이라 아래 단언이 던진다.
    let revertNetFailed = false;
    try {
      assert.notStrictEqual(outside.length, 0, `청취 페이지가 바깥으로 나갔다 (${outside.join(', ')})`);
    } catch (e) {
      revertNetFailed = true;
    }
    ok(revertNetFailed === true, '청취 페이지가 바깥을 부르면 붉어진다 (되돌림 실증 2 · P-16 ①)');

    try { host1.close(); host2.close(); } catch (_) {}
    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    relay.close();
  }
})().catch((e) => { console.error('\n[FAIL]', e.message); relay.close(); process.exit(1); });
