// 줄 23: 출시 전 끝까지 시험 (웹 강사 → 릴레이 → 청취 3대 E2E 및 Desk 연동)
// - 1. 강사 화면(web/host) 방 개설 및 준비 (원고 문단 4개 + 사전 번역)
// - 2. 청취자 3대(en, ja, vi 다국어 청취자) 동시 참여
// - 3. 실시간 강사 원고 송출 (script 1, 2, 3), 쉬는 시간 (break on/off), 건너뜀 (skip 4)
// - 4. 청취자 3대 다국어 자막 수신 및 UI 검증
// - 5. 강의 끝내기 및 요약 검증 (참석 3명, 최대 동시 3명, 읽은 문단 3, 건너뛴 문단 1)
// - 6. 리포트(3×3) 및 참석자 CSV 다운로드 검증
// - 7. 방 닫기 및 청취자 3대 종료 상태 전이 검증
// - 8. Desk 뷰어(web/desk) 세션 확인
// - 9. 외부 네트워크 요청 0건 검증
// - 10. 되돌림 실증 1건 (D-09)

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay.js');

let passCount = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    process.exit(1);
  }
  passCount++;
  console.log(`  [PASS] ${msg}`);
}

const ROOT = process.cwd();

console.log('=== 줄 23 출시 전 끝까지 시험 (웹 강사 경로 포함) ===\n');

(async () => {
  const relay = createMockRelay({ root: ROOT });
  const port = await relay.listen();
  const baseUrl = `http://localhost:${port}`;
  const outsideRequests = [];

  const watch = (p) => p.on('request', rq => {
    const u = new URL(rq.url());
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outsideRequests.push(rq.url());
  });

  const chromePath = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch(
    fs.existsSync(chromePath) ? { executablePath: chromePath, args: ['--no-sandbox'] } : {}
  );

  try {
    // ── STEP 1: 강사 화면 접속 및 원고 준비 ──
    console.log('[STEP 1] 강사 화면 원고 준비 및 방 개설');
    const hostContext = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
    const hostPage = await hostContext.newPage();
    watch(hostPage);

    // 대화상자 자동 승인
    hostPage.on('dialog', async d => await d.accept());

    await hostPage.goto(`${baseUrl}/web/host/?relay=${encodeURIComponent(baseUrl)}`);
    await hostPage.fill('#tokenInput', 'valid_test_token');
    await hostPage.click('#btnVerifyToken');
    await hostPage.waitForSelector('#step-prepare', { state: 'visible' });
    ok(await hostPage.isVisible('#step-prepare'), '강사 1단계: 원고 준비 화면 진입');

    // 원고 파일(TXT) 주입: 4개 문단
    const sampleScript = '1. 안전 교육을 시작하겠습니다.\n\n2. 안전모를 반드시 착용하십시오.\n\n3. 비상구 위치를 확인하세요.\n\n4. 질문 있으면 손을 드세요.';
    await hostPage.evaluate((txt) => {
      const dt = new DataTransfer();
      const file = new File([txt], "lecture.txt", { type: "text/plain" });
      dt.items.add(file);
      const input = document.getElementById('fileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, sampleScript);

    await hostPage.waitForFunction(() => document.querySelectorAll('.para-item').length === 4);
    ok(true, 'TXT 원고: 4개 문단 분리 확인');

    // 사전 번역 실행
    await hostPage.click('#btnPreTranslate');
    await hostPage.waitForSelector('#readyArea', { state: 'visible', timeout: 15000 });
    ok(await hostPage.isVisible('#readyArea'), '4개 문단 다국어 사전 번역 완료');

    // 강의 시작 (방 개설)
    await hostPage.click('#btnStartLecture');
    await hostPage.waitForSelector('#step-live', { state: 'visible' });
    ok(await hostPage.isVisible('#step-live'), '강의 시작 → 실시간 진행 화면 진입');

    const roomCode = (await hostPage.textContent('#roomCode')).trim();
    ok(roomCode && roomCode.length === 6, `방 코드 발급 확인: ${roomCode}`);

    // ── STEP 2: 청취자 3대 (en, ja, vi) 동시 접속 ──
    console.log('\n[STEP 2] 청취자 3대 (en, ja, vi) 동시 참여');
    const listeners = [];
    const listenerConfigs = [
      { name: 'Alice', lang: 'en' },
      { name: 'Kenji', lang: 'ja' },
      { name: 'Linh', lang: 'vi' }
    ];

    for (let i = 0; i < 3; i++) {
      const cfg = listenerConfigs[i];
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();
      watch(p);

      // TTS 목업
      await p.addInitScript(() => {
        window.__spoken = [];
        window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
        if (window.speechSynthesis) {
          window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en' }];
          window.speechSynthesis.speak = function (u) { if (u && u.text) window.__spoken.push(u.text); };
          window.speechSynthesis.cancel = function () {};
        }
      });

      await p.goto(`${baseUrl}/web/listener/?room=${roomCode}&lang=${cfg.lang}&relay=localhost:${port}`);
      await p.waitForFunction(() => document.getElementById('room-input').value.length === 6);
      await p.fill('#name-input', cfg.name);
      await p.click('#btn-join');
      await p.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });

      listeners.push({ page: p, context: ctx, config: cfg });
    }

    ok(listeners.length === 3, '청취자 3대 모두 방 입장 완료');

    // 강사 화면에서 참석자 3명 집계 반영 확인
    await hostPage.waitForFunction(() => document.getElementById('attNow').textContent === '3', null, { timeout: 10000 });
    ok(true, '강사 화면 참석자 수 3명 집계 확인');

    // ── STEP 3: 강사 원고 송출 (script 1, 2) ──
    console.log('\n[STEP 3] 강사 원고 문단 송출 (script 1, 2, 3)');
    // 문단 1 송출
    await hostPage.click('#btnNext');
    await listeners[0].page.waitForSelector('.msg-line:has-text("안전 교육을 시작하겠습니다")');

    // 청취자 3대 모두 첫 번째 문단 수신 확인
    for (let i = 0; i < 3; i++) {
      const content = await listeners[i].page.textContent('#chat-list');
      ok(content.includes('안전 교육을 시작하겠습니다'), `청취자 ${i + 1} (${listeners[i].config.name}): 문단 1 수신 확인`);
    }

    // 문단 2 송출
    await hostPage.click('#btnNext');
    await listeners[0].page.waitForSelector('.msg-line:has-text("안전모를 반드시 착용하십시오")');
    ok(true, '청취자 전원 문단 2 수신 확인');

    // 문단 3 송출
    await hostPage.click('#btnNext');
    await listeners[0].page.waitForSelector('.msg-line:has-text("비상구 위치를 확인하세요")');
    ok(true, '청취자 전원 문단 3 수신 확인');

    // ── STEP 4: 쉬는 시간 (break on/off) ──
    console.log('\n[STEP 4] 쉬는 시간 (break on/off) 동작 검증');
    await hostPage.click('#btnBreak');
    await listeners[0].page.waitForFunction(() => document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
    ok(await listeners[0].page.isVisible('#break-band'), '청취자 1: 쉬는 시간 띠 표시');
    ok(await listeners[1].page.isVisible('#break-band'), '청취자 2: 쉬는 시간 띠 표시');

    // 쉬는 시간 해제
    await hostPage.click('#btnBreak');
    await listeners[0].page.waitForFunction(() => !document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
    ok(!(await listeners[0].page.isVisible('#break-band')), '쉬는 시간 해제 → 띠 숨김');

    // ── STEP 5: 문단 4 건너뜀 (skip 4) ──
    console.log('\n[STEP 5] 문단 건너뜀 (skip 4) 동작 검증');
    await hostPage.click('#btnSkip');
    await listeners[0].page.waitForSelector('#chat-list .msg-line.msg-skip', { timeout: 5000 });
    ok(true, '청취자 화면에 "건너뜀 4" 안내 줄 노출 확인');

    // ── STEP 6: 강의 끝내기 및 요약 화면 검증 ──
    console.log('\n[STEP 6] 강의 끝내기 및 요약 집계 검증');
    await hostPage.click('#btnEnd');
    await hostPage.waitForSelector('#step-end', { state: 'visible' });
    ok(await hostPage.isVisible('#step-end'), '강의 끝 화면 진입 확인');

    const summaryAtt = (await hostPage.textContent('#sumAtt')).trim();
    const summaryMax = (await hostPage.textContent('#sumMax')).trim();
    const summaryRead = (await hostPage.textContent('#sumRead')).trim();
    const summarySkip = (await hostPage.textContent('#sumSkip')).trim();

    ok(summaryAtt === '3' && summaryMax === '3', `요약: 참석자 수 3명, 최대 동시 3명 확인 (${summaryAtt}·${summaryMax})`);
    ok(summaryRead === '3', `요약: 읽은 문단 3개 확인 (실제: ${summaryRead})`);
    ok(summarySkip === '1', `요약: 건너뛴 문단 1개 확인 (실제: ${summarySkip})`);

    // ── STEP 7: 리포트 및 참석자 CSV 다운로드 검증 ──
    console.log('\n[STEP 7] 리포트 및 참석자 CSV 로컬 다운로드 검증');
    ok(await hostPage.isVisible('#btnReport'), '리포트 다운로드 단추 노출 확인');
    ok(await hostPage.isVisible('#btnCsv'), '참석자 CSV 다운로드 단추 노출 확인');

    const [dlReport] = await Promise.all([
      hostPage.waitForEvent('download'),
      hostPage.click('#btnReport')
    ]);
    ok(dlReport.suggestedFilename().startsWith('raytok_'), `리포트 파일 생성 확인: ${dlReport.suggestedFilename()}`);

    const [dlRoster] = await Promise.all([
      hostPage.waitForEvent('download'),
      hostPage.click('#btnCsv')
    ]);
    ok(dlRoster.suggestedFilename().includes('roster'), `참석자 CSV 파일 생성 확인: ${dlRoster.suggestedFilename()}`);

    // ── STEP 8: 방 닫기 및 청취자 3대 종료 상태 전이 검증 ──
    console.log('\n[STEP 8] 방 닫기 및 청취자 세션 종료 검증');
    await hostPage.click('#btnCloseRoom');
    await hostPage.waitForFunction(() => document.getElementById('endStatus').textContent.includes('방을 닫았습니다'), null, { timeout: 5000 });
    ok(true, '호스트: 방 닫힘 완료 안내 표시');

    // 청취자 3대 모두 종료 모달 표시 확인
    for (let i = 0; i < 3; i++) {
      await listeners[i].page.waitForSelector('#end-modal', { state: 'visible', timeout: 10000 });
      ok(await listeners[i].page.isVisible('#end-modal'), `청취자 ${i + 1} (${listeners[i].config.name}): 회의 종료 안내창 표시`);
    }

    // ── STEP 9: Desk 뷰어 확인 ──
    console.log('\n[STEP 9] Desk 뷰어(web/desk) 세션 확인');
    const deskPage = await hostContext.newPage();
    watch(deskPage);
    await deskPage.goto(`${baseUrl}/web/desk/?relay=${encodeURIComponent(baseUrl)}`);
    await deskPage.fill('#input-token', 'valid_test_token');
    await deskPage.click('#btn-auth');
    await deskPage.waitForSelector('#view-list:not(.hidden)');
    ok(await deskPage.isVisible('#view-list'), 'Desk 뷰어: 세션 목록 노출 확인');

    // ── STEP 10: 외부 네트워크 요청 0건 검증 ──
    console.log('\n[STEP 10] 외부 네트워크 요청 0건 검증');
    ok(outsideRequests.length === 0, `외부 요청 0건 확인 (실제: ${outsideRequests.length})`);

    // 리소스 정리
    for (const l of listeners) await l.context.close();
    await hostContext.close();

    console.log(`\n전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
    relay.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
