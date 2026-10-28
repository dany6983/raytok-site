// samples/broadcast_raw_test.js — 아웃바운드: 번역 없이 방송(원문 브로드캐스팅, question.md §12) E2E 시험
// 실행: node samples/broadcast_raw_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

console.log('=== 아웃바운드: 번역 없이 방송(원문 브로드캐스팅) E2E 시험 ===');

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
    // ── 1. 호스트 탭: 로그인 → 원고 등록 → 「번역 없이 방송」 체크 → 강의 시작 ──
    const hostContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
    const hostPage = await hostContext.newPage();
    watch(hostPage);

    /* RULE: P-16 — 이 방은 **해외 방**으로 못 박는다. region 이 없으면 판정이 그 상자의
       브라우저 말로 떨어져 한국말 상자에서만 손님 페이지가 레이팩 팩 주소(R2)를 받으러 나가고,
       「바깥 요청 0건」이 기계마다 다른 답을 냈다(10-28). */
    await hostPage.goto(`${base}/web/host/?region=US&relay=${encodeURIComponent(base)}`);
    await hostPage.fill('#tokenInput', 'valid_instructor_token');
    await hostPage.click('#btnVerifyToken');
    await hostPage.waitForSelector('#step-prepare', { state: 'visible' });

    // 원고 파일 주입
    await hostPage.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['가이드 방송 1번 안내입니다.\n\n가이드 방송 2번 안내입니다.'], 'guide.txt', { type: 'text/plain' }));
      const input = document.getElementById('fileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await hostPage.waitForFunction(() => document.querySelectorAll('.para-item').length === 2);
    ok(true, '원고 2개 문단 준비 완료');

    // 「번역 없이 방송」 체크박스 체크 (question.md §12)
    const chkRaw = await hostPage.$('#chkBroadcastRaw');
    ok(chkRaw !== null, '강사 화면에 「번역 없이 방송」 체크박스 존재 확인');
    await chkRaw.check();

    // 단추 텍스트 변경 및 즉시 준비 완료 활성화 확인
    const btnText = await hostPage.textContent('#btnPreTranslate');
    ok(btnText.includes('원문 방송 준비 완료'), '체크 시 사전 번역 단추가 원문 방송 준비 모드로 전환');

    // 사전 번역 단추 클릭 (/translate 호출 0회)
    await hostPage.click('#btnPreTranslate');
    /* ★ 10-22: 시작 칸(`#readyArea`)이 **늘 보이게** 바뀌었다(원고는 선택 — 정본 v1 §1 ②).
     그래서 「보이면 번역이 끝났다」가 더는 참이 아니다 — 화면이 쓰는 값으로 기다린다. */
    await hostPage.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'raw', null, { timeout: 5000 });
    ok(relay.counters.translate === 0, '번역 없이 방송: translate 가 한 번도 안 불린다 (호출: 0회)');

    // 강의 시작
    await hostPage.click('#btnStartLecture');
    await hostPage.waitForSelector('#step-live', { state: 'visible' });
    await hostPage.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
    ok(true, '번역 없이 방송: 한국어→한국어로 강의 시작 성공');

    const joinUrl = await hostPage.evaluate(() => document.getElementById('joinUrl').value || document.getElementById('joinUrl').textContent);
    ok(joinUrl.includes('raw=1'), '참여 주소에 raw=1 파라미터 자동 장착 확인');

    // ── 2. 청취자 탭 접속 ──
    // 청취 화면의 '원문 방송 (번역 없음)' 글은 UI 언어가 ko 일 때만 — 헤드리스 로케일(en)에서도 같게 돌게 ko-KR 로 고정 (10-14 B)
    const lisContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
    const lisPage = await lisContext.newPage();
    watch(lisPage);

    await lisPage.goto(joinUrl);
    await lisPage.waitForSelector('#room-input');

    // 청취자 화면에서 언어 고르기 숨김 검증 (question.md 12-4 ③)
    const isLangSelectHidden = await lisPage.evaluate(() => {
      const sel = document.getElementById('lang-select');
      return sel && sel.style.display === 'none';
    });
    ok(isLangSelectHidden, '번역 없이 방송: 청취자 화면에 언어 고르기가 없다');

    await lisPage.click('#btn-join');
    await lisPage.waitForSelector('#chat-screen', { state: 'visible' });

    // 도구 막대에 원문 방송 표출 확인
    const langBarText = await lisPage.textContent('#current-lang-text');
    ok(langBarText.includes('원문 방송'), '청취 화면 도구 막대에 "원문 방송 (번역 없음)" 표출 확인');

    // ── 3. 강사가 문단 1 송출 ──
    await hostPage.click('#btnNext');
    await lisPage.waitForSelector('.msg-line');

    const lisLines = await lisPage.evaluate(() => {
      return Array.from(document.querySelectorAll('.msg-line')).map(l => l.textContent);
    });
    ok(lisLines.some(l => l.includes('가이드 방송 1번 안내입니다.')), '청취자가 원문 방송 1번 정상 수신');
    ok(relay.counters.translate === 0, '문단 송출 시에도 /translate 호출 0회 유지 (원가 0원)');

    // ── 4. 강사가 문단 2 송출 ──
    await hostPage.click('#btnNext');
    await lisPage.waitForFunction(() => document.querySelectorAll('.msg-line').length >= 2);
    ok(true, '청취자가 원문 방송 2번 연속 수신 확인');
    ok(relay.counters.translate === 0, '강의 전체 진행 동안 번역 API 호출 총 0회 확인');

    // ── 5. D-09 되돌림 실증 1건 (question.md 12-5) ──
    // ⚠ 되돌림은 **그 시험이 실제로 읽은 값**으로 해야 한다. 시험 안에서 만든 상수로
    //   하면 제품을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
    let revertFailed = false;
    try {
      // 이 방의 **진짜** /translate 호출 수를 읽는다. 지금 0 이라서 아래 단언이 던진다.
      // raw 방송이 번역을 부르도록 되돌리면 이 수가 0 이 아니게 되고 → 던지지 않아 ok 가 붉는다.
      assert.notStrictEqual(relay.counters.translate, 0, '번역 없이 방송인데 /translate 가 불렸다');
    } catch (e) {
      revertFailed = true;
    }
    ok(revertFailed === true, '번역 없이 방송 켜짐 시 번역 호출 발생 단언 실패 입증 (되돌림 실증 완료)');

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
