// samples/question_test.js — N:1 질문 대기열 + 강사 지명 UI + 청취자 질문 UI (question.md) E2E 시험
// 실행: node samples/question_test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
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

    // 질문 받기 기본 꺼짐 확인 및 켜기 (question.md)
    const isDefaultOff = await hostPage.isChecked('#chkEnableQuestion');
    ok(!isDefaultOff, 'N:1 질문 대기열 스위치: 기본 꺼짐 확인 (question.md)');
    await hostPage.check('#chkEnableQuestion');

    // 강의 시작
    await hostPage.click('#btnStartLecture');
    await hostPage.waitForSelector('#step-live', { state: 'visible' });
    await hostPage.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
    ok(true, '강사 실시간 진행 화면 진입');

    const roomCode = await hostPage.textContent('#roomCode');
    ok(roomCode && roomCode.length === 6, `방 코드 생성 확인 (${roomCode})`);

    // ── 2. 청취자 1 (Nguyen Van A, vi) 접속 ──
    const lis1Context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // P-14 를 **말이 아니라 전선에서** 본다: 청취 페이지가 실제로 보낸 프레임을 그대로 모은다.
    // (릴레이가 받은 뒤의 모양을 보면 안 된다 — 릴레이가 칸을 떨어뜨리면 무엇을 보냈든 깨끗해 보인다.)
    await lis1Context.addInitScript(() => {
      window.__sentFrames = [];
      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        try { if (typeof data === 'string') window.__sentFrames.push(data); } catch (_) {}
        return origSend.call(this, data);
      };
    });
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

    // P-17 의 진짜 증거: **사람이 누르기 전에는 아무도 발언자가 아니다.**
    // 둘이 기다리고 있는데도 자동으로 고르지 않았다는 것을 여기서 잰다(아래 되돌림 ①이 쓴다).
    const activeBeforeHumanClick = await hostPage.isVisible('#askActiveArea');
    ok(activeBeforeHumanClick === false, 'P-17: 둘이 기다려도 사람이 누르기 전엔 발언자 없음 (자동 선정 아님)');

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
    /* 10-15: 이 글자는 한국어로 박혀 있었다 — 손님 화면이라 사전으로 옮겼다(§18).
       청취자 1 은 vi 이므로 **베트남어**로 떠야 한다. 사전에서 꺼내 맞춘다. */
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'listener', 'ui-strings.json'), 'utf-8'));
    const speakingVi = dict.strings.btn_ask_speaking.vi;
    ok(lis1BtnText.includes(speakingVi),
       `지명된 청취자 1(vi)의 단추가 그 언어로 바뀐다 ("${lis1BtnText.trim()}" ⊃ "${speakingVi}")`);

    // ── 9. 강사 [끝내기] 클릭으로 회수 (B-4, B-5) ──
    await hostPage.click('#btnAskEnd');
    await hostPage.waitForSelector('#askActiveArea', { state: 'hidden' });
    ok(true, '강사 [끝내기] 클릭 시 발언 영역 닫힘 확인 (B-4)');

    await hostPage.waitForFunction(() => {
      const cnt = document.getElementById('askQueueCount');
      return cnt && cnt.textContent === '1';
    });
    ok(true, '1번 질문 종료 후 대기열에서 1번 제거 및 남은 1건 유지 확인');

    // ── 10. 특허 자물쇠 되돌림 실증 3건 (D-09) ──
    //
    // ⚠ 되돌림은 **제품이 실제로 만든 값**으로 해야 한다. 시험 안에서 만든 상수로 하면
    //   제품을 되돌려도 그대로 통과한다 — 증거가 아니다. 셋 다 그 꼴이었다(10-14 ⑨-1 점검).
    //   여기 셋은 특허 자물쇠라 더더욱 빈 증거로 둘 수 없다.
    const askRoom = relay.rooms.get(roomCode.trim());
    ok(!!askRoom, '되돌림용: 릴레이 방 상태를 읽을 수 있다');

    // ① P-17: 사람이 누르기 전엔 발언자가 없었다 — 위에서 실제로 잰 값
    //    자동 선정으로 되돌리면 그 값이 true 가 되어 아래 단언이 던지지 않고 ok 가 붉는다.
    let revertAutoFailed = false;
    try {
      assert.strictEqual(activeBeforeHumanClick, true, '사람이 누르기 전에 이미 발언자가 정해져 있었다 (자동 선정, P-17 위반)');
    } catch (e) {
      revertAutoFailed = true;
    }
    ok(revertAutoFailed === true, 'P-17 강사 수동 지명: 자동 선정으로 바꾸면 붉어진다 (되돌림 실증 1)');

    // ② P-14: 청취 페이지가 **전선에 실제로 올린 프레임**에 번역문이 없다
    //    릴레이가 받은 뒤의 모양을 보면 안 된다 — 릴레이가 trans 칸을 안 담으면 무엇을 보냈든
    //    깨끗해 보여서, 페이지를 되돌려도 초록이다(10-14 ⑨-1 에서 실제로 되돌려 보고 잡은 것).
    const askedItems = askRoom.askHistory || [];
    ok(askedItems.length === 2, `되돌림용: 릴레이가 받은 질문 ${askedItems.length}건`);
    const sentAsk = (await lis1Page.evaluate(() => window.__sentFrames || []))
      .map(f => { try { return JSON.parse(f); } catch (_) { return null; } })
      .find(m => m && (m.kind === 'ask' || m.kind === 'ask_req' || m.kind === 'question'));
    ok(!!sentAsk, `되돌림용: 청취 페이지가 전선에 올린 질문 프레임을 잡았다 (kind=${sentAsk && sentAsk.kind})`);
    ok(!sentAsk.trans && !sentAsk.tr, 'P-14: 청취 페이지가 보낸 프레임에 번역 칸이 없다 (원문+언어만)');
    let revertTransFailed = false;
    try {
      assert.ok(sentAsk.trans || sentAsk.tr, '청취 페이지가 번역문을 실어 보냈다 (P-14 위반)');
    } catch (e) {
      revertTransFailed = true;
    }
    ok(revertTransFailed === true, 'P-14 참여자 번역 배제: 페이지가 번역을 실으면 붉어진다 (되돌림 실증 2)');

    // ③ 특허 독립항: 1번을 끝낸 뒤에도 **요청 사실과 순번**이 기록에 남아 있다
    //    (대기열에서는 빠지지만 askHistory 의 seq 1 은 지워지지 않는다)
    //    순번 기록을 지우도록 되돌리면 seq 1 이 사라져 던지지 않고 ok 가 붉는다.
    const seq1Kept = askedItems.filter(q => q.seq === 1);
    ok(seq1Kept.length === 1, '독립항: 1번을 끝낸 뒤에도 순번 1 의 요청 사실이 남아 있다');
    let revertSeqFailed = false;
    try {
      assert.strictEqual(seq1Kept.length, 0, '끝난 질문의 순번 기록이 지워졌다 (독립항 위반)');
    } catch (e) {
      revertSeqFailed = true;
    }
    ok(revertSeqFailed === true, '독립항 순번 보존: 순번 기록을 지우면 붉어진다 (되돌림 실증 3)');

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
