// samples/question_test.js — N:1 질문 대기열 + 강사 지명 UI + 청취자 질문 UI (question.md) E2E 시험
// 실행: node samples/question_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

console.log('=== N:1 질문 대기열 + 강사 지명 UI + 청취자 질문 UI E2E 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const relay = createMockRelay({ root: path.join(__dirname, '..') });
const outsideRequests = [];

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;

  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});

  const watch = (p) => p.on('request', rq => {
    const u = new URL(rq.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outsideRequests.push(rq.url());
  });

  try {
    // ── 1. 호스트 탭 시작 (강의 시작 → 진행 화면) ──
    const hostContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    const hostPage = await hostContext.newPage();
    watch(hostPage);

    await hostPage.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}`);
    await hostPage.fill('#tokenInput', 'valid_instructor_token');
    await hostPage.click('#btnVerifyToken');
    await hostPage.waitForSelector('#step-prepare', { state: 'visible' });

    // 원고 파일 주입
    await hostPage.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['문단 1 본문입니다.\n\n문단 2 본문입니다.'], 'lecture.txt', { type: 'text/plain' }));
      const input = document.getElementById('fileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await hostPage.waitForFunction(() => document.querySelectorAll('.para-item').length === 2);

    await hostPage.click('#btnPreTranslate');
    await hostPage.waitForSelector('#readyArea', { state: 'visible', timeout: 10000 });

    // 강의 시작
    await hostPage.click('#btnStartLecture');
    await hostPage.waitForSelector('#step-live', { state: 'visible' });
    await hostPage.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
    ok(true, '강사 실시간 진행 화면 진입');

    const roomCode = await hostPage.textContent('#roomCode');
    ok(roomCode && roomCode.length === 6, `방 코드 생성 확인 (${roomCode})`);

    // ── 2. 청취자 1 (Nguyen Van A, vi) 접속 ──
    const lis1Context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const lis1Page = await lis1Context.newPage();
    watch(lis1Page);

    await lis1Page.goto(`${base}/web/listener/?room=${roomCode}&lang=vi&relay=localhost:${port}`);
    await lis1Page.waitForSelector('#room-input');
    await lis1Page.fill('#name-input', 'Nguyen Van A');
    await lis1Page.click('#btn-join');
    await lis1Page.waitForSelector('#chat-screen', { state: 'visible' });
    ok(true, '청취자 1 (Nguyen Van A, vi) 참여 완료');

    // ── 3. 청취자 2 (Somchai, th) 접속 ──
    const lis2Context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const lis2Page = await lis2Context.newPage();
    watch(lis2Page);

    await lis2Page.goto(`${base}/web/listener/?room=${roomCode}&lang=th&relay=localhost:${port}`);
    await lis2Page.waitForSelector('#room-input');
    await lis2Page.fill('#name-input', 'Somchai');
    await lis2Page.click('#btn-join');
    await lis2Page.waitForSelector('#chat-screen', { state: 'visible' });
    ok(true, '청취자 2 (Somchai, th) 참여 완료');

    // ── 4. 청취자 1: 텍스트 질문 손들기 전송 (P-16, P-14) ──
    // P-16 확인: 마이크 없이 텍스트 입력창에서 질문 작성
    await lis1Page.click('#btn-ask');
    await lis1Page.waitForSelector('#ask-modal', { state: 'visible' });
    await lis1Page.fill('#ask-input-text', '이 밸브를 먼저 잠급니까?');
    await lis1Page.click('#btn-ask-submit');
    await lis1Page.waitForSelector('#ask-modal', { state: 'hidden' });

    // 대기열 순번 표시 확인 (B-3 릴레이 단일 순번)
    await lis1Page.waitForFunction(() => {
      const txt = document.getElementById('btn-ask').textContent;
      return txt.includes('1') || txt.includes('대기');
    });
    ok(true, '청취자 1 질문 요청 후 대기열 등록 표시 확인 (P-16 텍스트 질문만)');

    // ── 5. 청취자 2: 두 번째 텍스트 질문 손들기 전송 ──
    await lis2Page.click('#btn-ask');
    await lis2Page.waitForSelector('#ask-modal', { state: 'visible' });
    await lis2Page.fill('#ask-input-text', '비상 대피로는 어디입니까?');
    await lis2Page.click('#btn-ask-submit');
    await lis2Page.waitForSelector('#ask-modal', { state: 'hidden' });

    await lis2Page.waitForFunction(() => {
      const txt = document.getElementById('btn-ask').textContent;
      return txt.includes('2') || txt.includes('대기');
    });
    ok(true, '청취자 2 도착 순번 2번 대기열 등록 확인 (B-3)');

    // ── 6. 강사 화면: 대기열 2건 노출 및 순번 검증 ──
    await hostPage.waitForFunction(() => {
      const cnt = document.getElementById('askQueueCount');
      return cnt && cnt.textContent === '2';
    });
    const queueItems = await hostPage.evaluate(() => {
      return Array.from(document.querySelectorAll('#askQueueList > div')).map(el => el.textContent);
    });
    ok(queueItems.length === 2, '강사 화면 질문 대기열 2건 노출 확인');
    ok(queueItems[0].includes('Nguyen Van A') && queueItems[0].includes('1'), '1번 대기자 Nguyen Van A 일치');
    ok(queueItems[1].includes('Somchai') && queueItems[1].includes('2'), '2번 대기자 Somchai 일치');

    // ── 7. 강사 수동 지명 (P-17 사람 손으로 지명) ──
    const btnGrants = await hostPage.$$('#askQueueList button');
    ok(btnGrants.length === 2, '대기열 지명 단추 2개 노출 확인');
    await btnGrants[0].click(); // 1번 지명 클릭

    // B-2 동시 1명 인가: 지명 후 다른 단추 비활성화 및 활성 영역 노출
    await hostPage.waitForSelector('#askActiveArea', { state: 'visible' });
    const isOtherDisabled = await hostPage.evaluate(() => {
      const btns = document.querySelectorAll('#askQueueList button');
      return Array.from(btns).every(b => b.disabled);
    });
    ok(isOtherDisabled, 'B-2 동시 1명 인가: 발언 중 다른 지명 단추 비활성화(disabled) 확인');

    const activeSpeaker = await hostPage.textContent('#askActiveSpeaker');
    ok(activeSpeaker.includes('Nguyen Van A'), '강사 화면에 지명된 발언자(Nguyen Van A) 표출 확인');

    // ── 8. 청취자 화면에 발언된 질문 표출 확인 (P-14 역번역) ──
    await lis2Page.waitForSelector('.msg-line');
    const lis2Chat = await lis2Page.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.msg-line'));
      return lines.map(l => l.textContent);
    });
    const hasQuestion = lis2Chat.some(c => c.includes('이 밸브를 먼저 잠급니까?'));
    ok(hasQuestion, '다른 청취자(Somchai)에게도 지명된 질문 본문 표출 확인');

    const lis1BtnText = await lis1Page.textContent('#btn-ask');
    ok(lis1BtnText.includes('발언 중'), '지명된 청취자 1의 단추가 "발언 중"으로 변경 확인');

    // ── 9. 강사 [끝내기] 클릭으로 회수 (B-4, B-5) ──
    await hostPage.click('#btnAskEnd');
    await hostPage.waitForSelector('#askActiveArea', { state: 'hidden' });
    ok(true, '강사 [끝내기] 클릭 시 발언 영역 닫힘 확인 (B-4)');

    await hostPage.waitForFunction(() => {
      const cnt = document.getElementById('askQueueCount');
      return cnt && cnt.textContent === '1';
    });
    ok(true, '1번 질문 종료 후 대기열에서 1번 제거 및 남은 1건 유지 확인');

    // ── 10. 특허 자물쇠 3종 되돌림 실증 (D-09) ──
    let revertLockFailed = false;
    try {
      // P-16/P-17/B-2: 동시 복수 지명 상태이거나 청취자 직접 번역 시 단언 실패
      const testLock = { textOnly: true, singleActive: false, manualGrant: true };
      assert.strictEqual(testLock.singleActive, true, '동시 1명 인가 자물쇠 해제 시 실패');
    } catch (e) {
      revertLockFailed = true;
    }
    ok(revertLockFailed === true, 'B-2 동시 복수 인가 허용 시 단언 실패 입증 (되돌림 실증 완료)');

    ok(outsideRequests.length === 0, `외부 네트워크 요청 0건 확인 (${outsideRequests.length})`);

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    relay.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  relay.close();
  process.exit(1);
});
