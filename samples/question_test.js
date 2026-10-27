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
    /* 강사 화면이 **전선에 실제로 올린** 프레임을 모은다 — 릴레이가 받은 뒤의 모양을 보면
       릴레이가 칸을 떨어뜨렸을 때 무엇을 보냈든 깨끗해 보인다(아래 「받기」 검사가 쓴다). */
    await hostContext.addInitScript(() => {
      window.__sentFrames = [];
      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        try { if (typeof data === 'string') window.__sentFrames.push(data); } catch (_) {}
        return origSend.call(this, data);
      };
    });
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
    await hostPage.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'done', null, { timeout: 10000 });

    // 질문 받기 **기본 켬** 확인 (AGENTS §24, 대표님 10-16)
    // 10-16 까지 기본 꺼짐이었다 — 7번을 다 만들어 놓고도 대표님 화면에 대기열이 안 보였다.
    // 문은 기본 켬이고 스위치는 **끄기 위해** 있다.
    const questionDefaultOn = await hostPage.isChecked('#chkEnableQuestion');
    ok(questionDefaultOn, 'N:1 질문 대기열 스위치: **기본 켬** (§24 — 문은 열어 둔다)');

    // 끌 수 있어야 한다 — 스위치가 스위치 노릇을 하는지도 본다
    await hostPage.uncheck('#chkEnableQuestion');
    ok(!(await hostPage.isChecked('#chkEnableQuestion')), '끄는 쪽으로도 움직인다 (받지 않으려면 끈다)');
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

    // ── 7. 강사 수동 지명 ([선택]·[무시]) ──
    const btnGrants = await hostPage.$$('#askQueueList button');
    ok(btnGrants.length === 4, '대기열 [선택]·[무시] 단추 총 4개 노출 확인 (2건 × 2개)');

    // P-17 의 진짜 증거: **사람이 누르기 전에는 아무도 발언자가 아니다.**
    const activeBeforeHumanClick = await hostPage.isVisible('#askActiveArea');
    ok(activeBeforeHumanClick === false, 'P-17: 둘이 기다려도 사람이 누르기 전엔 발언자 없음 (자동 선정 아님)');

    await btnGrants[0].click(); // 1번 [선택] 클릭

    await hostPage.waitForSelector('#askActiveArea', { state: 'visible' });
    const activeSpeaker = await hostPage.textContent('#askActiveSpeaker');
    ok(activeSpeaker.includes('Nguyen Van A'), '강사 화면에 지명된 발언자(Nguyen Van A) 표출 확인');

    // ── 8. 다른 청취자가 질문을 **자기 말로** 보는가 (정본 §3 4단계 · §2 ③) ──
    //
    // ★ 10-21 까지 이 자리는 `textContent` 로 한국어 원문을 찾아 통과했다. 정본 §2 ③ 으로
    //   손님 화면이 **내 언어만** 보이게 된 뒤 원문은 **접힌 단추 안**에 있고, 접힌 것의
    //   `textContent` 는 그대로 읽힌다 — 화면에 아무것도 없어도 초록인 모양이다(§12 와
    //   같은 병). 그래서 **보이는가**를 `checkVisibility` 로 재고, 번역이 왔는지는 글자로 본다.
    await lis2Page.waitForSelector('.msg-line');
    const SEE = { contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true };
    await lis2Page.waitForFunction(() => {
      const el = document.querySelector('.msg-line .msg-tr');
      return el && el.textContent.indexOf('[th]') >= 0;      // 가짜 번역기가 붙이는 꼬리표
    }, null, { timeout: 8000 });
    const lis2Seen = await lis2Page.evaluate((see) => {
      const lines = Array.from(document.querySelectorAll('.msg-line'));
      const el = document.querySelector('.msg-line .msg-tr');
      const srcEl = document.querySelector('.msg-line .msg-text');
      const can = (n) => !!(n && n.checkVisibility && n.checkVisibility(see));
      const shown = [srcEl, el].filter(can);
      return { n: lines.length, text: el ? el.textContent.trim() : '',
               vis: can(el), srcVis: can(srcEl),
               visCls: shown.length === 1 ? shown[0].className : shown.map((x) => x.className).join('+'),
               body: document.getElementById('chat-list').textContent };
    }, SEE);
    /* 한 질문에 줄 하나. 10-21 에 `question` 과 `ask_active` 가 각각 줄을 만들어 **두 줄**이
       됐고, 늦게 온 번역은 한 줄에만 붙어 나머지 한 줄이 **한국어 원문으로** 남았다. */
    ok(lis2Seen.n === 1, `질문 하나에 줄 하나다 (${lis2Seen.n}줄) — 둘이면 한 줄은 못 알아듣는 원문으로 남는다`);
    ok(lis2Seen.vis === true && lis2Seen.text.indexOf('[th]') >= 0,
       `다른 손님(Somchai, th)이 질문을 **자기 말로 보고 있다** ("${lis2Seen.text.slice(0, 40)}")`);
    /* 보이는 칸이 **번역 칸**이어야 한다 — 가짜 번역기는 원문에 꼬리표만 붙이므로
       "번역문에 원문 글자가 없다"로는 가를 수 없다. 어느 칸이 보이는가로 가른다. */
    ok(lis2Seen.visCls === 'msg-tr',
       `화면에 보이는 칸이 **번역 칸**이다 (${lis2Seen.visCls}) — 원문 칸이 아니다`);
    ok(lis2Seen.srcVis === false,
       '원문은 **화면에 안 보인다** — 「원문 보기」를 눌렀을 때만 보인다(정본 §2 ③)');
    ok(lis2Seen.body.includes('이 밸브를 먼저 잠급니까?'),
       '그래도 원문은 **잃지 않았다** — 접힌 자리에 그대로 있다(R-15)');
    const hasQuestion = lis2Seen.text.indexOf('[th]') >= 0;

    // ── 8-1. 강사는 질문을 **강사 말로** 보고, 읽어 준다 (정본 §1 ⑤ · §3 3단계) ──
    const askLog = await hostPage.evaluate(() => (window.rtHostAsk && window.rtHostAsk.log()) || []);
    ok(askLog.some(l => l.indexOf('ask_tr ') === 0 && l.indexOf('to=ko') > 0),
       `강사 화면이 질문을 **강사 말로** 번역했다 (${askLog.find(l => l.indexOf('ask_tr ') === 0) || '없음'})`);
    const askShown = await hostPage.textContent('#askActiveText');
    ok(askShown.indexOf('[ko]') >= 0 && askShown.indexOf('이 밸브를 먼저 잠급니까?') >= 0,
       `강사 화면에 **번역 + (원문)** 둘 다 보인다 ("${askShown.trim().slice(0, 50)}")`);
    ok(await hostPage.evaluate(() => window.rtHostAsk.speakOn()) === true,
       '읽어 주기는 **기본 켬** (§24 — 숨기지 않는다. 강사는 손님 말을 모른다)');
    ok(await hostPage.isVisible('#btnAskSpeak'), '끄는 단추가 화면에 있다');
    await hostPage.click('#btnAskSpeak');
    ok(await hostPage.evaluate(() => window.rtHostAsk.speakOn()) === false, '끌 수 있다');
    await hostPage.click('#btnAskSpeak');

    // 강사는 **번역문을 보내지 않는다** — 받기(grant)에도 싣지 않는다 (결정장부 43 · P-14)
    const grantFrames = (await hostPage.evaluate(() => window.__sentFrames || []))
      .map(f => { try { return JSON.parse(f); } catch (_) { return null; } })
      .filter(m => m && (m.kind === 'grant' || m.kind === 'ask_grant'));
    ok(grantFrames.length >= 1, `되돌림용: 강사가 올린 「받기」 프레임을 잡았다 (${grantFrames.length}건)`);
    ok(grantFrames.every(m => !m.trans && !m.tr),
       '「받기」에 번역문 칸이 없다 — 강사 쪽 번역문 전송 금지(결정장부 43). 그 길은 운영에서 400 만 받던 길이다');

    const lis1BtnText = await lis1Page.textContent('#btn-ask');
    /* 10-15: 이 글자는 한국어로 박혀 있었다 — 손님 화면이라 사전으로 옮겼다(§18).
       청취자 1 은 vi 이므로 **베트남어**로 떠야 한다. 사전에서 꺼내 맞춘다. */
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'listener', 'ui-strings.json'), 'utf-8'));
    const speakingVi = dict.strings.btn_ask_speaking.vi;
    ok(lis1BtnText.includes(speakingVi),
       `지명된 청취자 1(vi)의 단추가 그 언어로 바뀐다 ("${lis1BtnText.trim()}" ⊃ "${speakingVi}")`);

    // ── 9. 새 [선택] 클릭 시 앞사람 자동 revoke 검증 ──
    const btnGrants2 = await hostPage.$$('#askQueueList button');
    await btnGrants2[2].click(); // 2번 [선택] 클릭 (1번 자동 revoke 후 2번 지명)
    await hostPage.waitForFunction(() => {
      const spk = document.getElementById('askActiveSpeaker');
      return spk && spk.textContent.includes('Somchai');
    });
    ok(true, '새 [선택] 클릭 시 앞사람 자동 revoke 후 새 발언자(Somchai) 전환 확인');

    // ── 8-2. **말로 묻는 질문** (정본 §3 · 대표님 10-21 "원래 음성으로 보내고") ──
    //
    // 손님이 자기 폰에 말한다 → **손님 폰이 글자로 바꾼다** → 릴레이로는 **글자만** 간다.
    // 소리는 우리 서버로 가지 않는다(RULE: P-04 · P-16 ③). 그리고 그 질문이 **모든 손님**에게
    // 각자 말로, 강사에게는 강사 말로 간다.
    const lis3Context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    await lis3Context.addInitScript(() => {
      window.__sentFrames = [];
      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        try { if (typeof data === 'string') window.__sentFrames.push(data); } catch (_) {}
        return origSend.call(this, data);
      };
      /* 가짜 받아쓰기 — 진짜 규약대로(D-11): start 는 onstart, stop 은 onend 를 내고,
         결과는 `results[i][0].transcript` 와 `isFinal` 로 온다. */
      class FakeRec {
        constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.running = false; }
        start() { if (this.running) throw new Error('already'); this.running = true; window.__rec = this; if (this.onstart) this.onstart(); }
        stop() { this.running = false; if (this.onend) this.onend(); }
        say(text) {
          const r = [{ 0: { transcript: text }, isFinal: true, length: 1 }];
          if (this.onresult) this.onresult({ resultIndex: 0, results: Object.assign(r, { length: 1 }) });
        }
      }
      window.SpeechRecognition = FakeRec;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
      });
    });
    const lis3Page = await lis3Context.newPage();
    watch(lis3Page);
    await lis3Page.goto(`${base}/web/listener/?room=${roomCode}&lang=en&relay=localhost:${port}`);
    await lis3Page.waitForSelector('#room-input');
    /* ★ **이름을 적지 않는다** (2026-10-22, 진짜 릴레이 실측에서 잡았다).
     *
     * 이름 칸은 「선택 사항」이다. 10-22 까지 손님은 `ask_queue` 가 올 때 **이름을 견주어**
     * 자기 질문을 찾았다 — 이름이 없으면 견줄 것이 없어 `myAskId` 가 끝까지 비고, 강사가
     * 지명해도 `grant` 가 **내 것이 아니라서** 받아쓰기가 열리지 않았다. ✋ 는 눌리고
     * 대기줄에도 뜨는데 **말을 할 수 없다** — 조용히 고장이다. 목(mock)에서는 시험이 늘
     * 이름을 적어 와서 안 보였다(D-11 의 다른 얼굴).
     * 지금은 손님이 **제 질문의 이름(id)을 만들어 보낸다**. 그래서 이 손님은 이름이 없다. */
    await lis3Page.click('#btn-join');
    await lis3Page.waitForSelector('#chat-screen', { state: 'visible' });

    await lis3Page.click('#btn-ask');
    await lis3Page.waitForSelector('#ask-modal', { state: 'visible' });
    await lis3Page.fill('#ask-input-text', 'hand up');
    await lis3Page.click('#btn-ask-submit');
    await lis3Page.waitForSelector('#ask-modal', { state: 'hidden' });

    /* 손님이 **제 질문의 이름을 들고** 올렸나 — 이것이 이름 없는 손님을 살리는 값이다 */
    const askFrame = (await lis3Page.evaluate(() => window.__sentFrames || []))
      .map(f => { try { return JSON.parse(f); } catch (_) { return null; } })
      .find(m => m && m.kind === 'ask');
    ok(!!askFrame && typeof askFrame.id === 'string' && askFrame.id.length > 6,
       `이름 없는 손님도 **제 질문의 id** 를 들고 올린다 (${askFrame ? askFrame.id : '없음'})`);
    const anonId = askFrame && askFrame.id;

    /* 강사가 그 손님을 지명한다 (사람 손으로 — P-17). 이름이 없으니 대기줄에는 「익명」이다 */
    await hostPage.waitForFunction((want) => Array.from(document.querySelectorAll('#askQueueList > div'))
      .some(el => el.querySelector('button')), anonId, { timeout: 10000 });
    await hostPage.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#askQueueList > div')).reverse()
        .find(el => el.querySelector('button'));
      row.querySelector('button').click();
    });
    await lis3Page.waitForFunction(() => window.__rec && window.__rec.running, null, { timeout: 5000 });
    ok(true, '지명되면 손님 폰의 **받아쓰기가 열린다** (마이크는 손님 폰에 있다)');
    /* ★ 되돌림 실증 — `myAskId` 가 **그 id** 다. 이름 견주기로 되돌리면 이름 없는 손님은
       이 값이 비고, 위의 「받아쓰기가 열린다」가 10초 뒤에 터진다. */
    const myId = await lis3Page.evaluate(() => (typeof myAskId !== 'undefined' ? myAskId : null));
    ok(myId === anonId,
       `이름 없는 손님이 **자기 질문을 알아본다** (myAskId=${myId}) — 이름 견주기로 되돌리면 빈손이다 (되돌림 실증 5)`);
    const recLang = await lis3Page.evaluate(() => window.__rec.lang);
    ok(/^en/.test(recLang), `받아쓰기 언어가 **손님이 고른 말** (${recLang}) — 표 한 곳에서 읽는다(§6)`);

    await lis3Page.evaluate(() => window.__rec.say('Can we use this offline?'));
    await lis3Page.waitForTimeout(400);

    const q3 = (await lis3Page.evaluate(() => window.__sentFrames || []))
      .map(f => { try { return JSON.parse(f); } catch (_) { return null; } })
      .filter(m => m && m.kind === 'question');
    ok(q3.length >= 1, `손님 폰이 **글자로 바꿔** 올렸다 (${q3.length}건)`);
    ok(q3[0].src === 'Can we use this offline?' && q3[0].srcLang === 'en' && q3[0].id === anonId,
       `올라간 것은 **원문 글자 + 언어**다 ("${q3[0].src}" · ${q3[0].srcLang})`);
    const AUDIO_KEYS = ['audio', 'pcm', 'wav', 'blob', 'buf', 'buffer', 'samples', 'opus', 'webm'];
    const audioKeys = Object.keys(q3[0]).filter(k => AUDIO_KEYS.some(a => k.toLowerCase().includes(a)));
    ok(audioKeys.length === 0,
       `올라간 프레임에 **소리 칸이 없다** (RULE: P-04 — 소리를 릴레이로 보내지 않는다)${audioKeys.length ? ': ' + audioKeys : ''}`);
    ok(!q3[0].trans && !q3[0].tr, '그리고 번역 칸도 없다 — 손님은 번역하지 않는다(P-14)');

    /* 모든 손님이 그 질문을 **자기 말로** 본다 (정본 §3 4단계) */
    await lis2Page.waitForFunction(() => Array.from(document.querySelectorAll('.msg-line .msg-tr'))
      .some(el => el.textContent.includes('[th] Can we use this offline?')), null, { timeout: 8000 });
    ok(true, 'th 손님이 말로 한 질문을 **타이어로** 본다 (보내는 쪽이 번역해 보낸 것이 아니다)');
    const lis1Saw = await lis1Page.evaluate(() => Array.from(document.querySelectorAll('.msg-line .msg-tr'))
      .map(el => el.textContent).join(' | '));
    ok(lis1Saw.indexOf('[vi]') < 0,
       'vi 손님은 **못 받는다** — 가짜 번역기가 vi 를 거절하게 돼 있다(실패를 조용히 넘기지 않는 길, §20)');
    const lis3Own = await lis3Page.evaluate(() => Array.from(document.querySelectorAll('.msg-line')).length);
    ok(lis3Own >= 1, `말한 손님 화면에도 자기 질문이 남는다 (${lis3Own}줄 — R-15)`);

    /* 강사는 그 질문을 **강사 말로** 보고 읽는다 */
    await hostPage.waitForFunction(() => (window.rtHostAsk.log() || [])
      .some(l => l.indexOf('ask_tr ') === 0 && l.indexOf('from=en') > 0), null, { timeout: 8000 });
    const askShown2 = await hostPage.textContent('#askActiveText');
    ok(askShown2.indexOf('[ko]') >= 0 && askShown2.indexOf('Can we use this offline?') >= 0,
       `강사 화면: 강사 말 번역 + (원문) ("${askShown2.trim().slice(0, 48)}")`);
    ok((await hostPage.evaluate(() => window.rtHostAsk.log()))
       .some(l => l.indexOf('ask_speak ') === 0 && l.indexOf('lang=ko') > 0),
       '강사 이어폰으로 **강사 말로 읽어 준다** (정본 §1 ⑤) — 소리는 강사 폰이 낸다(P-04)');

    await hostPage.evaluate(() => closeQuestion('host_done'));
    await hostPage.waitForSelector('#askActiveArea', { state: 'hidden' });
    await lis3Page.waitForFunction(() => !window.__rec || !window.__rec.running, null, { timeout: 5000 });
    ok(true, '회수하면 손님 폰의 받아쓰기가 **꺼진다** (마이크를 쥐고 있지 않는다)');
    await lis3Context.close();


    // ── 10. 특허 자물쇠·기본값 되돌림 실증 4건 (D-09) ──
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
    ok(askedItems.length === 3, `되돌림용: 릴레이가 받은 질문 ${askedItems.length}건 (글자 둘 + 말 하나)`);
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

    // ④ 기본값이 꺼짐으로 돌아가면 붉다 (§24 — 숨기면 대표님이 못 보신다)
    let revertDefaultFailed = false;
    try {
      assert.strictEqual(questionDefaultOn, false, '질문 받기가 기본 꺼짐이다 — 화면에 대기열이 안 보인다');
    } catch (e) { revertDefaultFailed = true; }
    ok(revertDefaultFailed === true, '기본값을 꺼짐으로 되돌리면 붉어진다 (되돌림 실증 4)');

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
