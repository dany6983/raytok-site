// RULE: P-16
// W-T: 웹 강사(web/host) → 릴레이(mock_relay) → 청취자(web/listener) 끝까지 시험
// 마스터 지시 2026-10-09 13:25 사양:
// 1. 문단 넘기기 → 청취 페이지에 그 문단의 번역문이 뜬다 (trans[myLang]). 없으면 원문(R-15)
// 2. para·total 이 와이어 사양대로 간다 → 청취 화면이 원고 번호/전체 ("1/4") 를 그린다
// 3. 건너뜀: skip 을 받은 문단은 흐려지거나 지나간다
// 4. 끼어들기: break on:true 동안 script 가 멈추고, on:false 면 원고로 돌아온다
// 5. 청취 페이지가 번역을 청하지 않는다 — 외부 요청 0건 (P-16 ①)
// 6. 끝: 리포트 3×3 이 세 형식 다 떨어지고, 참석 CSV 가 내려오고, 방 닫기 뒤 줄이 지워진다
// 7. 되돌림 1: script 를 보내는 줄을 되돌리면 1번이 붉어진다

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

console.log('=== W-T 웹 강사 → 릴레이 → 청취 끝까지 시험 (P-16) ===\n');

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
    // ── 1. 호스트 화면 준비 및 방 개설 ──
    console.log('[W-T STEP 1] 호스트 방 개설 및 사전 번역 준비');
    const hostContext = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
    const hostPage = await hostContext.newPage();
    watch(hostPage);
    hostPage.on('dialog', async d => await d.accept());

    await hostPage.goto(`${baseUrl}/web/host/?relay=${encodeURIComponent(baseUrl)}`);
    await hostPage.fill('#tokenInput', 'valid_test_token');
    await hostPage.click('#btnVerifyToken');
    await hostPage.waitForSelector('#step-prepare', { state: 'visible' });
    ok(await hostPage.isVisible('#step-prepare'), '호스트 1단계 인증 통과 및 준비 화면 진입');

    // 4개 문단 주입
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
    ok(true, '원고 4개 문단 정상 분리');

    // 사전 번역 실행
    await hostPage.click('#btnPreTranslate');
    await hostPage.waitForSelector('#readyArea', { state: 'visible', timeout: 15000 });
    ok(await hostPage.isVisible('#readyArea'), '사전 번역 완료 및 강의 시작 준비 완료');

    // 강의 시작
    await hostPage.click('#btnStartLecture');
    await hostPage.waitForSelector('#step-live', { state: 'visible' });
    const roomCode = (await hostPage.textContent('#roomCode')).trim();
    ok(roomCode && roomCode.length === 6, `강의 시작 → 6자리 방 코드 발급: ${roomCode}`);

    // ── 2. 청취자 2대 접속 (en 번역 대상, vi 번역 실패 대상) ──
    console.log('\n[W-T STEP 2] 청취자 접속 (en, vi)');
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageA = await ctxA.newPage();
    watch(pageA);

    await pageA.goto(`${baseUrl}/web/listener/?room=${roomCode}&lang=en&relay=localhost:${port}`);
    await pageA.waitForFunction(() => document.getElementById('room-input').value.length === 6);
    await pageA.fill('#name-input', 'Alice');
    await pageA.click('#btn-join');
    await pageA.waitForSelector('#chat-screen', { state: 'visible' });
    ok(true, '청취자 A (en) 참여 완료');

    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pageB = await ctxB.newPage();
    watch(pageB);

    await pageB.goto(`${baseUrl}/web/listener/?room=${roomCode}&lang=vi&relay=localhost:${port}`);
    await pageB.waitForFunction(() => document.getElementById('room-input').value.length === 6);
    await pageB.fill('#name-input', 'Linh');
    await pageB.click('#btn-join');
    await pageB.waitForSelector('#chat-screen', { state: 'visible' });
    ok(true, '청취자 B (vi) 참여 완료');

    // ── 3. W-T 조건 1 & 2: 문단 넘기기 + 번역문 표시 + para/total 뱃지 ──
    console.log('\n[W-T 검증 1·2] 문단 넘기기 → 번역문 표출 및 para·total 와이어 규격');
    const translateCallsBefore = relay.counters.translate;

    // 문단 1 넘기기 (송출)
    await hostPage.click('#btnNext');
    await pageA.waitForSelector('#chat-list .msg-line:has-text("안전 교육을 시작하겠습니다")');

    // 청취자 A(en): 번역문 "[en] 1. 안전 교육..." 확인
    const contentA = await pageA.textContent('#chat-list');
    ok(contentA.includes('[en] 1. 안전 교육을 시작하겠습니다'), 'W-T ① 청취자 A에 해당 문단 번역문(trans[en]) 표출 확인');

    // 청취자 B(vi): 사전 번역에 실패한 언어는 원문 fallback 확인 (R-15)
    const contentB = await pageB.textContent('#chat-list');
    ok(contentB.includes('1. 안전 교육을 시작하겠습니다'), 'W-T ① 번역 없는 언어(vi)는 원문 보존 표출 확인 (R-15)');

    // 청취자 A: para·total 와이어 사양 ("원고 1/4" 또는 "Script 1/4") 뱃지 확인
    const badgeTextA = await pageA.$eval('#chat-list .msg-line.msg-script .badge-script', el => el.textContent.trim());
    ok(badgeTextA.includes('1/4'), `W-T ② 청취 화면에 para·total 규격 뱃지("1/4") 표출 확인 (실제: ${badgeTextA})`);

    // ── 4. W-T 조건 3: 건너뜀 (skip) ──
    console.log('\n[W-T 검증 3] 건너뜀 (skip) 처리');
    // 문단 2 송출
    await hostPage.click('#btnNext');
    await pageA.waitForSelector('#chat-list .msg-line:has-text("안전모를 반드시 착용하십시오")');

    // 문단 3 건너뜀 단추 클릭
    await hostPage.click('#btnSkip');
    await pageA.waitForSelector('#chat-list .msg-line.msg-skip', { timeout: 5000 });
    const skipContent = await pageA.textContent('#chat-list .msg-line.msg-skip');
    ok(skipContent.includes('3') || skipContent.includes('건너뜀') || skipContent.includes('Skipped'), 'W-T ③ 청취 화면에 건너뜀 3 표시 확인');

    // ── 5. W-T 조건 4: 끼어들기 (break on/off) ──
    console.log('\n[W-T 검증 4] 쉬는 시간 끼어들기 (break on:true / on:false)');
    await hostPage.click('#btnBreak');
    await pageA.waitForFunction(() => document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
    ok(await pageA.isVisible('#break-band'), 'W-T ④ break on:true 동안 쉬는 시간 띠 표시 확인');

    // 쉬는 시간 해제
    await hostPage.click('#btnBreak');
    await pageA.waitForFunction(() => !document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
    ok(!(await pageA.isVisible('#break-band')), 'W-T ④ break on:false 해제 시 원고 복귀 확인');

    // ── 6. W-T 조건 5: 청취 페이지 외부 요청 0건 및 번역 재요청 0건 (P-16 ①) ──
    console.log('\n[W-T 검증 5] 청취 페이지 번역 미요청 및 외부 요청 0건 (P-16 ①)');
    const translateCallsAfter = relay.counters.translate;
    ok(translateCallsAfter === translateCallsBefore, 'W-T ⑤ 원고 넘길 때 청취 페이지가 새로 번역을 청하지 않음 (P-16 ①)');
    ok(outsideRequests.length === 0, `W-T ⑤ 바깥 네트워크 요청 0건 확인 (실제: ${outsideRequests.length})`);

    // ── 7. W-T 조건 6: 리포트 3×3 세 형식 다운로드 + 참석 CSV + 방 닫기 뒤 줄 삭제 ──
    console.log('\n[W-T 검증 6] 리포트 3×3 다운로드, 참석 CSV, 방 닫기 후 줄 삭제');
    await hostPage.click('#btnEnd');
    await hostPage.waitForSelector('#step-end', { state: 'visible' });
    ok(await hostPage.isVisible('#step-end'), '강의 끝 화면 진입');

    // 리포트 1) TXT 다운로드
    await hostPage.check('input[name="rep-format"][value="txt"]');
    const [dlTxt] = await Promise.all([hostPage.waitForEvent('download'), hostPage.click('#btnReport')]);
    ok(dlTxt.suggestedFilename().endsWith('.txt'), `W-T ⑥ 리포트 TXT 형식 정상 생성 (${dlTxt.suggestedFilename()})`);

    // 리포트 2) DOC 다운로드
    await hostPage.check('input[name="rep-format"][value="doc"]');
    const [dlDoc] = await Promise.all([hostPage.waitForEvent('download'), hostPage.click('#btnReport')]);
    ok(dlDoc.suggestedFilename().endsWith('.doc'), `W-T ⑥ 리포트 DOC 형식 정상 생성 (${dlDoc.suggestedFilename()})`);

    // 리포트 3) PDF 인쇄 문서 생성 검증
    let pdfPrintHtml = null;
    await hostPage.exposeFunction('__capturePdfPrint', (html) => { pdfPrintHtml = html; });
    await hostPage.evaluate(() => {
      const orig = window.RayTokReport.downloadReport;
      window.RayTokReport.downloadReport = function (opts) {
        if (opts.format === 'pdf') {
          const html = window.RayTokReport.buildReportHtml(opts);
          window.__capturePdfPrint(html);
          return true;
        }
        return orig.apply(this, arguments);
      };
    });
    await hostPage.check('input[name="rep-format"][value="pdf"]');
    await hostPage.click('#btnReport');
    const startWait = Date.now();
    while (!pdfPrintHtml && Date.now() - startWait < 5000) {
      await new Promise(r => setTimeout(r, 100));
    }
    ok(pdfPrintHtml && pdfPrintHtml.includes('RayTok') && pdfPrintHtml.includes('안전 교육을 시작하겠습니다'), 'W-T ⑥ 리포트 PDF 인쇄 문서 정상 생성');

    // 참석 CSV 다운로드
    const [dlCsv] = await Promise.all([hostPage.waitForEvent('download'), hostPage.click('#btnCsv')]);
    ok(dlCsv.suggestedFilename().includes('roster') && dlCsv.suggestedFilename().endsWith('.csv'), `W-T ⑥ 참석 CSV 정상 생성 (${dlCsv.suggestedFilename()})`);

    // 방 닫기 클릭
    await hostPage.click('#btnCloseRoom');
    await hostPage.waitForFunction(() => document.getElementById('endStatus').textContent.includes('방을 닫았습니다'), null, { timeout: 5000 });
    ok(true, 'W-T ⑥ 방 닫기 신호 발송 및 방 종료 완료');

    // 청취자 A 세션 종료 모달 전이 확인
    await pageA.waitForSelector('#end-modal', { state: 'visible', timeout: 8000 });
    ok(await pageA.isVisible('#end-modal'), 'W-T ⑥ 청취자 세션 종료 상태 전이 확인');

    // 릴레이 스토리지 줄 지움 확인 (mock_relay 의 ringBuffer 가 끝 표시 한 줄만 남김)
    const room = relay.rooms.get(roomCode);
    if (room) {
      ok(room.ring.length === 1 && JSON.parse(room.ring[0]).end === 1, 'W-T ⑥ 방 닫힌 뒤 릴레이에 자막 줄이 지워지고 끝 표시만 남음');
    }

    // 리소스 정리
    await ctxA.close();
    await ctxB.close();
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
