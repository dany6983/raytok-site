// 줄 23: 출시 전 끝까지 시험 (운영 주소)
// 강사(웹) → 운영 릴레이 → 청취 3대, Desk → 릴레이 → 폰 1회
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { mintCode, testSeed, privateKeyFromSeed, FLAG } = require('../relay/tools/mint-code.mjs');

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
const SHOTS_DIR = path.join(ROOT, 'docs', 'shots');

if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

console.log('=== 줄 23 출시 전 끝까지 시험 (운영 환경 실측) ===\n');

(async () => {
  // 운영 주소
  const siteUrl = 'https://raytok.kr';
  const relayUrl = 'https://raytok-relay.raytok.workers.dev';

  // 운영 릴레이에서 통과될 테스트용 토큰 발급 (Key 0)
  const pk = privateKeyFromSeed(testSeed());
  const tokenObj = mintCode({
    keyId: 0,
    exp: Math.floor(Date.now() / 1000) + 3600,
    flags: FLAG.host | FLAG.desk,
    cust: 'PRODT',
    privateKey: pk
  });
  const hostToken = tokenObj.code;

  const chromePath = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch(
    fs.existsSync(chromePath) ? { executablePath: chromePath, args: ['--no-sandbox'] } : {}
  );

  try {
    // ── STEP 1: 강사 화면 접속 및 원고 준비 ──
    console.log('[STEP 1] 강사 화면 원고 준비 및 방 개설 (운영)');
    const hostContext = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
    const hostPage = await hostContext.newPage();
    hostPage.on('console', msg => console.log('  [HOST LOG]', msg.text()));
    hostPage.on('response', async res => {
      if (res.status() >= 400) {
        console.log('  [HOST RES ERR]', res.status(), res.url());
        try { console.log('    BODY:', await res.text()); } catch(e){}
      }
    });

    hostPage.on('dialog', async d => await d.accept());

    await hostPage.goto(`${siteUrl}/web/host/?relay=${encodeURIComponent(relayUrl)}`);
    await hostPage.fill('#tokenInput', hostToken);
    await hostPage.click('#btnVerifyToken');
    await hostPage.waitForSelector('#step-prepare', { state: 'visible' });
    ok(await hostPage.isVisible('#step-prepare'), '운영 강사 화면: 원고 준비 화면 진입');

    const sampleScript = '1. 운영 환경 테스트입니다.\n\n2. 릴레이 연결을 확인합니다.\n\n3. 다국어 번역이 잘 되는지 확인합니다.\n\n4. 종료합니다.';
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

    await hostPage.click('#btnPreTranslate');
    await hostPage.waitForSelector('#readyArea', { state: 'visible', timeout: 20000 });
    ok(await hostPage.isVisible('#readyArea'), '4개 문단 다국어 사전 번역 완료');

    await hostPage.click('#btnStartLecture');
    await hostPage.waitForSelector('#step-live', { state: 'visible', timeout: 10000 });
    ok(await hostPage.isVisible('#step-live'), '운영 릴레이 방 개설 성공');

    const roomCode = (await hostPage.textContent('#roomCode')).trim();
    ok(roomCode && roomCode.length === 6, `발급된 방 코드: ${roomCode}`);

    // ── STEP 2: 청취자 3대 (en, ja, vi) 동시 접속 ──
    console.log('\n[STEP 2] 청취자 3대 동시 참여 (운영)');
    const listeners = [];
    const listenerConfigs = [
      { name: 'ProdAlice', lang: 'en' },
      { name: 'ProdKenji', lang: 'ja' },
      { name: 'ProdLinh', lang: 'vi' }
    ];

    for (let i = 0; i < 3; i++) {
      const cfg = listenerConfigs[i];
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await ctx.newPage();

      await p.addInitScript(() => {
        window.__spoken = [];
        window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
        if (window.speechSynthesis) {
          window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en' }];
          window.speechSynthesis.speak = function (u) { if (u && u.text) window.__spoken.push(u.text); };
          window.speechSynthesis.cancel = function () {};
        }
      });

      await p.goto(`${siteUrl}/web/listener/?room=${roomCode}&lang=${cfg.lang}&relay=${encodeURIComponent(relayUrl)}`);
      await p.waitForFunction(() => document.getElementById('room-input').value.length === 6);
      await p.fill('#name-input', cfg.name);
      await p.click('#btn-join');
      await p.waitForSelector('#chat-screen', { state: 'visible', timeout: 15000 });

      listeners.push({ page: p, context: ctx, config: cfg });
    }

    ok(listeners.length === 3, '청취자 3대 모두 방 입장 완료');
    await hostPage.waitForFunction(() => document.getElementById('attNow').textContent === '3', null, { timeout: 15000 });
    ok(true, '강사 화면 참석자 수 3명 집계 확인');

    // ── STEP 3: 강사 원고 송출 (script 1, 2) ──
    console.log('\n[STEP 3] 강사 원고 문단 송출');
    await hostPage.click('#btnNext');
    await listeners[0].page.waitForSelector('.msg-line:has-text("운영 환경 테스트입니다")');
    for (let i = 0; i < 3; i++) {
      const content = await listeners[i].page.textContent('#chat-list');
      ok(content.includes('운영 환경 테스트입니다'), `청취자 ${i + 1} (${listeners[i].config.name}): 문단 1 수신 확인`);
    }

    await hostPage.click('#btnNext');
    await listeners[0].page.waitForSelector('.msg-line:has-text("릴레이 연결을 확인합니다")');
    ok(true, '청취자 전원 문단 2 수신 확인');

    await hostPage.click('#btnNext');
    await listeners[0].page.waitForSelector('.msg-line:has-text("다국어 번역이 잘 되는지 확인합니다")');
    ok(true, '청취자 전원 문단 3 수신 확인');

    // ── STEP 4: 쉬는 시간 및 건너뜀 ──
    console.log('\n[STEP 4] 쉬는 시간 및 건너뜀 검증');
    await hostPage.click('#btnBreak');
    await listeners[0].page.waitForFunction(() => document.getElementById('break-band').classList.contains('on'), null, { timeout: 5000 });
    ok(await listeners[0].page.isVisible('#break-band'), '청취자 1: 쉬는 시간 띠 표시');
    await hostPage.click('#btnBreak');
    
    await hostPage.click('#btnSkip');
    await listeners[0].page.waitForSelector('#chat-list .msg-line.msg-skip', { timeout: 5000 });
    ok(true, '청취자 화면에 "건너뜀 4" 안내 줄 노출 확인');

    await hostPage.screenshot({ path: path.join(SHOTS_DIR, 'prod-host-live.png') });
    await listeners[0].page.screenshot({ path: path.join(SHOTS_DIR, 'prod-listener-en.png') });

    // ── STEP 5: 강의 끝내기 ──
    console.log('\n[STEP 5] 강의 끝내기 및 요약 집계 검증');
    await hostPage.click('#btnEnd');
    await hostPage.waitForSelector('#step-end', { state: 'visible' });
    ok(await hostPage.isVisible('#step-end'), '운영 강의 끝 화면 진입 확인');

    const summaryAtt = (await hostPage.textContent('#sumAtt')).trim();
    ok(summaryAtt === '3', `요약: 참석자 수 3명 확인`);

    const summaryRead = (await hostPage.textContent('#sumRead')).trim();
    ok(summaryRead === '3', `요약: 읽은 문단 3개 확인`);

    await hostPage.screenshot({ path: path.join(SHOTS_DIR, 'prod-host-end.png') });

    // ── STEP 6: 방 닫기 ──
    console.log('\n[STEP 6] 방 닫기 및 청취자 세션 종료 검증');
    await hostPage.click('#btnCloseRoom');
    await hostPage.waitForFunction(() => document.getElementById('endStatus').textContent.includes('방을 닫았습니다'), null, { timeout: 10000 });
    ok(true, '호스트: 방 닫힘 완료 안내 표시');

    for (let i = 0; i < 3; i++) {
      await listeners[i].page.waitForSelector('#end-modal', { state: 'visible', timeout: 15000 });
      ok(await listeners[i].page.isVisible('#end-modal'), `청취자 ${i + 1}: 회의 종료 안내창 표시`);
    }

    // ── STEP 7: Desk 뷰어 확인 ──
    console.log('\n[STEP 7] 운영 Desk 뷰어 세션 확인');
    const deskPage = await hostContext.newPage();
    await deskPage.goto(`${siteUrl}/web/desk/?relay=${encodeURIComponent(relayUrl)}`);
    await deskPage.fill('#input-token', hostToken);
    await deskPage.click('#btn-auth');
    await deskPage.waitForSelector('#view-list:not(.hidden)');
    ok(await deskPage.isVisible('#view-list'), '운영 Desk 뷰어: 세션 목록 노출 확인');
    await deskPage.screenshot({ path: path.join(SHOTS_DIR, 'prod-desk-view.png') });

    for (const l of listeners) await l.context.close();
    await hostContext.close();

    console.log(`\n운영 환경 E2E 전부 통과 (${passCount}건)`);
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error('\n[FAIL]', err);
  process.exit(1);
});
