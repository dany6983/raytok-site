// samples/end_test.js — L4-3 끝 화면 시험: 호스트(web/host) + 청취자(web/listener) + 원고 줄 TTS.
// 실행(저장소 루트, playwright·ws 필요):  node samples/end_test.js   또는  npm run test:end
//   CHROME=<크롬 경로> 를 주면 그 브라우저를 쓴다.
// 보는 것: ① 원고 줄 TTS — 기본은 안 읽음 / 청취자가 소리 단추를 켰으면 읽음 / 들은 줄(line)은 전과 같이 읽음
//          ② 문단 3 + 건너뜀 1 → 끝내기 → 요약(참석·최대 동시·진행 시간·읽은/건너뛴 문단)
//          ③ 리포트 내용 3 × 형식 3 — 원고 줄에 "(원고 n)", 끝에 "건너뛴 문단: …" (내려받은 파일을 읽어 본다)
//          ④ 참석 CSV — BOM·CRLF·머리 + 한 사람 한 줄, 쉼표·따옴표·수식 글자 처리
//          ⑤ 방 닫기 — 릴레이의 기존 end:1 그대로 → 청취자 종료 화면, 릴레이 줄 삭제, 명단 메모리에서 삭제
//          ⑥ 명단은 어디로도 나가지 않는다(/ws·HTTP·localStorage) · 바깥 요청 0건
// 목업 릴레이는 samples/mock_relay.js (relay/src/room.js 와 같은 규칙).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

console.log('=== L4-3 끝 화면 (web/host 끝내기·요약·리포트·참석 CSV·방 닫기 + 원고 줄 TTS) 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const relay = createMockRelay({ root: path.join(__dirname, '..') });
const { hostReceived } = relay;

const NAME_A = '김, "철수"';     // 쉼표·따옴표 — CSV 에서 따옴표로 감싸고 " 는 겹친다
const NAME_B = '=SUM(1)';        // 수식처럼 보이는 이름 — 앞에 ' 를 붙인다

// 말하기(TTS)를 실제 소리 대신 기록한다
const ttsStub = () => {
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'en' }, { lang: 'ja-JP', name: 'ja' }];
    window.speechSynthesis.speak = function (u) { if (u && u.text) window.__spoken.push(u.text); };
    window.speechSynthesis.cancel = function () {};
  }
};

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;

  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const outside = [];
  const watch = (p) => p.on('request', rq => { const u = new URL(rq.url()); if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outside.push(rq.url()); });

  async function openListener({ room, lang, name }) {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });   // 사람마다 다른 브라우저(= 다른 기기 번호)
    const p = await ctx.newPage();
    watch(p);
    await p.addInitScript(ttsStub);
    await p.goto(`${base}/web/listener/?room=${room}&lang=${lang}&relay=localhost:${port}`);
    await p.waitForFunction(() => document.getElementById('room-input').value.length === 6);
    return { p, name };
  }
  async function join(l) {
    if (l.name) await l.p.fill('#name-input', l.name);
    await l.p.click('#btn-join');
    await l.p.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
  }
  async function download(page, selector) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click(selector)]);
    const file = await dl.path();
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(file) };
  }

  // ── 호스트: 인증 → 원고(문단 4) → 미리 번역 → 강의 시작 ──
  const hostCtx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const host = await hostCtx.newPage();
  watch(host);
  const dialogs = [];
  let dialogAnswer = 'accept';
  host.on('dialog', async (d) => { dialogs.push(d.message()); if (dialogAnswer === 'accept') await d.accept(); else await d.dismiss(); });
  await host.goto(`${base}/web/host/?relay=${base}`);
  await host.fill('#tokenInput', 'valid_test_token');
  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible' });
  const txt = '안전 교육을 시작하겠습니다.\n\n안전모를 반드시 착용하십시오.\n\n비상구 위치를 확인하세요.\n\n질문 있으면 손을 드세요.';
  await host.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], 'lecture.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, txt);
  await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 4);
  await host.click('#btnPreTranslate');
  await host.waitForSelector('#readyArea', { state: 'visible', timeout: 10000 });
  await host.click('#btnStartLecture');
  await host.waitForSelector('#step-live', { state: 'visible', timeout: 5000 });
  await host.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
  const code = (await host.textContent('#roomCode')).trim();
  const room = relay.rooms.get(code);
  ok(await host.isVisible('#btnEnd') && (await host.textContent('#btnEnd')).trim() === '끝내기', '진행 화면에 "끝내기" 단추');
  ok(!(await host.isVisible('#step-end')), '진행 중에는 끝 화면이 숨어 있다');
  const httpAtStart = relay.httpLog.length;

  // ── 청취자 둘: A(en, 소리 단추 안 건드림) · B(ja, 소리 단추를 직접 켬 = 끄고 다시 켬) ──
  const A = await openListener({ room: code, lang: 'en', name: NAME_A });
  const B = await openListener({ room: code, lang: 'ja', name: NAME_B });
  await join(A);
  await join(B);
  await B.p.click('#btn-toggle-tts');
  await B.p.click('#btn-toggle-tts');
  ok((await B.p.textContent('#btn-toggle-tts')).includes('🔊'), '청취자 B: 소리 단추를 직접 켰다');
  await host.waitForFunction(() => document.getElementById('attNow').textContent === '2', null, { timeout: 5000 });

  // ── 문단 3개 넘기고, 4번은 건너뜀 ──
  await host.click('#btnNext');
  await host.keyboard.press('ArrowRight');
  await host.keyboard.press('Space');
  await host.click('#btnSkip');
  await A.p.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 3, null, { timeout: 5000 });
  await B.p.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 3, null, { timeout: 5000 });
  await A.p.waitForSelector('#chat-list .msg-line.msg-skip', { timeout: 5000 });
  ok(room.received.filter(m => m.kind === 'script').map(m => m.para).join(',') === '1,2,3' && room.received.filter(m => m.kind === 'skip').map(m => m.para).join(',') === '4', '호스트: script 1,2,3 + skip 4 송출');

  // ① 원고 줄 TTS — 두 상태
  const spokenA = await A.p.evaluate(() => window.__spoken.slice());
  ok(spokenA.length === 0, `TTS 기본(단추 안 건드림): 원고 줄 3개를 읽지 않는다 (읽기 ${spokenA.length}회)`);
  ok((await A.p.textContent('#btn-toggle-tts')).includes('🔇'), 'TTS 기본: 소리 단추가 "소리 끔"으로 바뀌어 보인다');
  const trsA = await A.p.$$eval('#chat-list .msg-line.msg-script .msg-tr', els => els.map(e => e.textContent.trim()));
  ok(trsA.length === 3 && trsA[0].startsWith('[en] 안전 교육을 시작하겠습니다.'), 'TTS 기본: 읽지 않아도 번역 글은 그대로 보인다');
  const spokenB = await B.p.evaluate(() => window.__spoken.slice());
  ok(spokenB.length === 3 && spokenB[0] === '[ja] 안전 교육을 시작하겠습니다.' && spokenB[2] === '[ja] 비상구 위치를 확인하세요.', `TTS 켬(청취자가 직접 켬): 원고 줄 3개를 읽는다 (읽기 ${spokenB.length}회)`);
  ok((await B.p.textContent('#btn-toggle-tts')).includes('🔊'), 'TTS 켬: 원고 줄이 와도 단추는 켜진 채');

  // ① 들은 줄(line·tr)은 전과 같다 — 다른 방(원고 아님)에서, 단추를 안 건드린 청취자
  {
    const plain = relay.newRoom('guide');
    const hostWs = new WebSocket(`ws://localhost:${port}/ws?room=${plain.code}&role=host&token=${plain.token}`);
    await new Promise((res, rej) => { hostWs.on('open', res); hostWs.on('error', rej); });
    hostWs.send(JSON.stringify({ welcome: 1, plan: 'guide', guide: 1, src_lang: 'ko' }));
    const C = await openListener({ room: plain.code, lang: 'en', name: '' });
    await join(C);
    hostWs.send(JSON.stringify({ seq: 1, src_lang: 'ko', text: '안녕하세요.', tr: { en: 'Hello.' } }));
    hostWs.send(JSON.stringify({ seq: 2, src_lang: 'ko', text: '시작합니다.', tr: {}, pending: true }));
    hostWs.send(JSON.stringify({ seq: 2, tr: { en: 'Let us begin.' } }));
    await C.p.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
    const spokenC = await C.p.evaluate(() => window.__spoken.slice());
    ok(spokenC.join('|') === 'Hello.|Let us begin.', '들은 줄(line·tr): 단추를 안 건드려도 전과 같이 읽는다');
    ok((await C.p.textContent('#btn-toggle-tts')).includes('🔊'), '들은 줄만 오는 방: 소리 단추는 켜진 채(전과 같다)');

    // 원고 줄과 들은 줄이 섞여 오는 방(원고 읽다가 끼어든 말): 원고 줄은 안 읽고, 들은 줄은 그대로 읽는다
    hostWs.send(JSON.stringify({ kind: 'script', para: 1, total: 2, src: '원고 첫 문단.', srcLang: 'ko', trans: { en: 'Script one.' }, at: Date.now() }));
    await C.p.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 1, null, { timeout: 5000 });
    ok((await C.p.evaluate(() => window.__spoken.length)) === 2 && (await C.p.textContent('#btn-toggle-tts')).includes('🔇'), '섞인 방: 원고 줄은 읽지 않는다(단추 "소리 끔")');
    hostWs.send(JSON.stringify({ seq: 3, src_lang: 'ko', text: '끼어든 말입니다.', tr: { en: 'An aside.' } }));
    await C.p.waitForFunction(() => window.__spoken.length >= 3, null, { timeout: 5000 });
    ok((await C.p.evaluate(() => window.__spoken[2])) === 'An aside.' && (await C.p.textContent('#btn-toggle-tts')).includes('🔊'), '섞인 방: 원고 줄 뒤에 온 들은 줄은 전과 같이 읽는다(단추 "소리 켜짐")');
    hostWs.send(JSON.stringify({ seq: 4, src_lang: 'ko', text: '번역이 늦게 옵니다.', tr: {}, pending: true }));
    hostWs.send(JSON.stringify({ kind: 'script', para: 2, total: 2, src: '원고 둘째 문단.', srcLang: 'ko', trans: { en: 'Script two.' }, at: Date.now() }));
    hostWs.send(JSON.stringify({ seq: 4, tr: { en: 'Late translation.' } }));
    await C.p.waitForFunction(() => window.__spoken.length >= 4, null, { timeout: 5000 });
    ok((await C.p.evaluate(() => window.__spoken.join('|'))) === 'Hello.|Let us begin.|An aside.|Late translation.', '섞인 방: 늦게 온 번역(tr)도 읽고, 원고 줄 둘은 끝까지 안 읽었다');
    // 청취자가 직접 끄면 들은 줄도 읽지 않는다(전과 같다) — 페이지가 도로 켜지 않는다
    await C.p.click('#btn-toggle-tts');
    hostWs.send(JSON.stringify({ kind: 'script', para: 2, total: 2, src: '원고 둘째 문단.', srcLang: 'ko', trans: { en: 'Script two.' }, at: Date.now() }));
    hostWs.send(JSON.stringify({ seq: 5, src_lang: 'ko', text: '끈 뒤의 말.', tr: { en: 'After mute.' } }));
    await C.p.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line').length === 8, null, { timeout: 5000 });
    ok((await C.p.evaluate(() => window.__spoken.length)) === 4 && (await C.p.textContent('#btn-toggle-tts')).includes('🔇'), '청취자가 직접 끈 뒤: 들은 줄도 원고 줄도 읽지 않는다(페이지가 도로 켜지 않는다)');
    hostWs.close();
    await C.p.context().close();
  }

  // B 가 언어를 바꾼다(ja → vi) — 다시 hello 를 보내도 명단은 한 사람 한 줄
  await B.p.evaluate(() => { const s = document.getElementById('lang-select'); s.value = 'vi'; s.dispatchEvent(new Event('change')); });
  await host.waitForFunction(() => /vi\s*1/.test(document.getElementById('attLangs').textContent), null, { timeout: 5000 });
  await host.waitForFunction(() => Object.values(live.roster).some(p => p.lang === 'vi'), null, { timeout: 5000 });

  // ── ② 끝내기 → 요약 ──
  await host.click('#btnEnd');
  await host.waitForSelector('#step-end', { state: 'visible', timeout: 5000 });
  ok(!(await host.isVisible('#step-live')), '끝내기 → 끝 화면(진행 화면 숨김)');
  const sum = await host.evaluate(() => ({
    att: document.getElementById('sumAtt').textContent, max: document.getElementById('sumMax').textContent,
    dur: document.getElementById('sumDur').textContent, read: document.getElementById('sumRead').textContent,
    total: document.getElementById('sumTotal').textContent, skip: document.getElementById('sumSkip').textContent,
    skipList: document.getElementById('sumSkipList').textContent
  }));
  ok(sum.att === '2' && sum.max === '2', `요약: 참석 2 · 최대 동시 2 (${sum.att}·${sum.max})`);
  ok(/^\d+:\d\d:\d\d$/.test(sum.dur), `요약: 진행 시간 h:mm:ss (${sum.dur})`);
  ok(sum.read === '3' && sum.total === '4', `요약: 읽은 문단 3 / 4 (${sum.read} / ${sum.total})`);
  ok(sum.skip === '1' && sum.skipList === '4', `요약: 건너뛴 문단 1 — 4번 (${sum.skip} · ${sum.skipList})`);
  ok(!hostReceived.some(m => m.end), '끝내기만으로는 방을 닫지 않는다(end 미송출)');
  ok(!(await A.p.isVisible('#end-modal')), '끝내기만으로는 청취자 화면이 끝나지 않는다');
  await host.keyboard.press('ArrowRight');
  await host.keyboard.press('Space');
  await wait(300);
  ok(room.received.filter(m => m.kind === 'script').length === 3, '끝 화면에서는 →·스페이스가 문단을 넘기지 않는다');
  await host.click('#btnBackLive');
  ok(await host.isVisible('#step-live') && !(await host.isVisible('#step-end')), '"진행으로 돌아가기" → 진행 화면');
  await host.click('#btnEnd');
  await host.waitForSelector('#step-end', { state: 'visible', timeout: 5000 });

  // ── ③ 리포트 3 × 3 ──
  const repOpts = await host.$$eval('#repLang option', els => els.map(e => e.value));
  ok(repOpts.join(',') === 'en,ja', `리포트 언어 = 미리 번역이 실린 언어(en·ja) — 실패한 vi 는 없다 (${repOpts.join(',')})`);
  // both × TXT (기본)
  let f = await download(host, '#btnReport');
  let body = f.buf.toString('utf8');
  ok(/^raytok_\d{8}_\d{4}_en\.txt$/.test(f.name), `리포트 both·TXT 파일 이름 (${f.name})`);
  ok(body.includes('(원고 1) 안전 교육을 시작하겠습니다.') && body.includes('(원고 2) 안전모를 반드시 착용하십시오.') && body.includes('(원고 3) 비상구 위치를 확인하세요.'), '리포트: 원고 줄 3개에 출처 "(원고 n)"');
  ok(body.includes('[en] 안전 교육을 시작하겠습니다.') && body.includes('[en] 비상구 위치를 확인하세요.'), '리포트 both: 번역문(trans.en) 그대로');
  ok(body.includes('Lines: 3'), '리포트: 줄 수 3');
  ok(!body.includes('질문 있으면 손을 드세요.'), '리포트: 건너뛴 문단의 글은 본문에 없다');
  ok(body.trimEnd().endsWith('건너뛴 문단: 4') && body.indexOf('건너뛴 문단: 4') > body.indexOf('(원고 3)'), '리포트: 본문 뒤에 "건너뛴 문단: 4"');
  // src × DOC
  await host.check('input[name="rep-content"][value="src"]');
  await host.check('input[name="rep-format"][value="doc"]');
  f = await download(host, '#btnReport');
  body = f.buf.toString('utf8');
  ok(/^raytok_\d{8}_\d{4}_src_en\.doc$/.test(f.name), `리포트 src·DOC 파일 이름 (${f.name})`);
  ok(body.includes('(원고 2) 안전모를 반드시 착용하십시오.') && !body.includes('[en] '), '리포트 src·DOC: 출처 + 원문만(번역 없음)');
  ok(body.includes('건너뛴 문단: 4</p>'), '리포트 DOC: 건너뛴 문단 한 줄');
  // trans × TXT, 언어 ja
  await host.selectOption('#repLang', 'ja');
  await host.check('input[name="rep-content"][value="trans"]');
  await host.check('input[name="rep-format"][value="txt"]');
  f = await download(host, '#btnReport');
  body = f.buf.toString('utf8');
  ok(/^raytok_\d{8}_\d{4}_trans_ja\.txt$/.test(f.name), `리포트 trans·TXT 파일 이름 (${f.name})`);
  ok(body.includes('(원고 1) [ja] 안전 교육을 시작하겠습니다.') && !body.includes(') 안전 교육을 시작하겠습니다.'), '리포트 trans: 출처 + 번역문만(trans.ja)');
  // both × PDF — 인쇄 창 대신 인쇄에 넘긴 문서를 본다
  await host.evaluate(() => {
    const orig = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = orig(el);
      if (el.tagName === 'IFRAME') el.contentWindow.print = () => { window.__printed = el.contentDocument.documentElement.outerHTML; };
      return r;
    };
  });
  await host.check('input[name="rep-content"][value="both"]');
  await host.check('input[name="rep-format"][value="pdf"]');
  await host.click('#btnReport');
  await host.waitForFunction(() => typeof window.__printed === 'string', null, { timeout: 5000 });
  const printed = await host.evaluate(() => window.__printed);
  ok(printed.includes('(원고 3) 비상구 위치를 확인하세요.') && printed.includes('[ja] 비상구 위치를 확인하세요.') && printed.includes('건너뛴 문단: 4'), '리포트 both·PDF: 인쇄 문서에 출처·번역·건너뛴 문단');
  await host.evaluate(() => { delete document.body.appendChild; });

  // ── ⑤-0 방 닫기를 눌렀다가 취소 — CSV 를 아직 안 받았다고 알려 준다. 아무것도 바뀌지 않는다 ──
  dialogAnswer = 'dismiss';
  await host.click('#btnCloseRoom');
  await wait(200);
  ok(dialogs.length === 1 && dialogs[0].includes('참석 CSV 를 아직 받지 않았습니다') && dialogs[0].includes('명단이 지워집니다'), '방 닫기 확인 창: CSV 를 안 받았음 + 명단 삭제를 알린다');
  ok(!hostReceived.some(m => m.end) && (await host.evaluate(() => Object.keys(live.roster).length)) === 2, '취소하면 방도 명단도 그대로');

  // ── ④ 참석 CSV ──
  f = await download(host, '#btnCsv');
  ok(/^raytok_\d{8}_\d{4}_roster_ko\.csv$/.test(f.name), `참석 CSV 파일 이름 (${f.name})`);
  ok(f.buf[0] === 0xEF && f.buf[1] === 0xBB && f.buf[2] === 0xBF, '참석 CSV: BOM 으로 시작(엑셀 한글)');
  const csv = f.buf.toString('utf8').slice(1);
  ok(csv.endsWith('\r\n') && !/[^\r]\n/.test(csv), '참석 CSV: 줄 끝 CRLF');
  const rows = csv.trimEnd().split('\r\n');
  ok(rows[0] === '이름,언어,연결 분', `참석 CSV 머리 = 이름,언어,연결 분 (${rows[0]})`);
  ok(rows.length === 3, `참석 CSV: 머리 + 참석자 한 사람 한 줄 = 3줄 (${rows.length})`);
  ok(/^"김, ""철수""",en,\d+$/.test(rows[1]), `참석 CSV: 쉼표·따옴표 이름은 감싼다 · 연결 분은 숫자 (${rows[1]})`);
  ok(/^'=SUM\(1\),vi,\d+$/.test(rows[2]), `참석 CSV: 수식 같은 이름은 ' 를 붙인다 · 언어는 마지막 것(vi) (${rows[2]})`);

  // ⑥ 명단은 이 화면 밖으로 나가지 않는다
  ok(!JSON.stringify(hostReceived).includes('철수') && !JSON.stringify(hostReceived).includes('SUM'), '호스트가 /ws 로 보낸 글에 이름이 없다');
  ok(relay.httpLog.length === httpAtStart, `강의 시작 뒤 릴레이 HTTP 요청 0건 (${relay.httpLog.length - httpAtStart})`);
  const stored = await host.evaluate(async () => {
    const ls = JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage));
    const idb = JSON.stringify(await loadParagraphsFromDB());
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : ['RayTokHostDB'];
    return { ls, idb, dbs };
  });
  ok(!stored.ls.includes('철수') && !stored.idb.includes('철수') && stored.dbs.join(',') === 'RayTokHostDB', '명단은 localStorage·IndexedDB 에 없다(메모리만)');

  // ── ⑤ 방 닫기 ──
  dialogAnswer = 'accept';
  await host.click('#btnCloseRoom');
  await host.waitForFunction(() => document.getElementById('endStatus').textContent.includes('방을 닫았습니다'), null, { timeout: 5000 });
  ok(dialogs.length === 2 && !dialogs[1].includes('아직 받지 않았습니다'), '방 닫기 확인 창: CSV 를 받은 뒤에는 그 말이 없다');
  const end = hostReceived.find(m => m.end);
  ok(end && Object.keys(end).sort().join(',') === 'end,summary' && end.end === 1, '방 닫기 = 릴레이의 기존 끝 메시지 {end:1, summary}');
  const finalMin = await host.evaluate(() => Math.round(live.finalSummary.durationMs / 60000));
  ok(end.summary.lines === 3 && end.summary.minutes === finalMin && end.summary.joined_max === 2 && Object.keys(end.summary).sort().join(',') === 'joined_max,lines,minutes', `end.summary = 숫자 셋(lines 3·minutes ${finalMin}·joined_max 2)`);
  await A.p.waitForSelector('#end-modal', { state: 'visible', timeout: 5000 });
  ok((await A.p.textContent('#status-text')).trim() === 'Ended', '청취자 A: 상태 "종료됨"(en UI: Ended)');
  ok((await A.p.textContent('#sum-lines')).trim() === '3' && (await A.p.textContent('#sum-joined')).trim() === '2', '청취자 A: 종료 화면에 줄 수 3 · 최대 동시 2');
  await B.p.waitForSelector('#end-modal', { state: 'visible', timeout: 5000 });
  ok(true, '청취자 B: 종료 화면');
  ok(room.ring.length === 1 && JSON.parse(room.ring[0]).end === 1 && !room.ring[0].includes('안전'), '릴레이: 줄을 지우고 끝 표시 한 줄만(글 없음)');
  for (let i = 0; i < 30 && room.hosts.size > 0; i++) await wait(100);
  ok(room.hosts.size === 0, '호스트 /ws 연결을 닫았다(다시 붙지 않는다)');
  const after = await host.evaluate(() => ({
    roster: Object.keys(live.roster).length, finalRows: live.finalSummary && 'rows' in live.finalSummary,
    token: live.token, csvDisabled: document.getElementById('btnCsv').disabled, closeDisabled: document.getElementById('btnCloseRoom').disabled,
    backVisible: document.getElementById('btnBackLive').style.display !== 'none', att: document.getElementById('sumAtt').textContent,
    html: document.documentElement.outerHTML
  }));
  ok(after.roster === 0 && after.finalRows === false, '방을 닫은 뒤 명단은 메모리에 없다(요약은 숫자만 남는다)');
  ok(!after.html.includes('철수') && !after.html.includes('SUM(1)'), '방을 닫은 뒤 화면에도 이름이 없다');
  ok(after.token === null, '방을 닫은 뒤 호스트 토큰을 지웠다');
  ok(after.csvDisabled && after.closeDisabled && !after.backVisible, '방을 닫은 뒤: 참석 CSV·방 닫기 단추 잠김, 돌아가기 없음');
  ok(after.att === '2', '방을 닫은 뒤에도 요약 숫자(참석 2)는 화면에 남는다');
  // 리포트(원고 글 — 개인정보 아님)는 닫은 뒤에도 받을 수 있다
  await host.check('input[name="rep-format"][value="txt"]');
  f = await download(host, '#btnReport');
  ok(f.buf.toString('utf8').includes('(원고 1) 안전 교육을 시작하겠습니다.'), '방을 닫은 뒤에도 리포트는 받을 수 있다');
  ok(await host.evaluate(() => saveCsv()) === false, '방을 닫은 뒤 참석 CSV 는 만들지 않는다');

  // ── 셈법(순수 함수) — 화면에서 바로 불러 본다 ──
  const calc = await host.evaluate(() => {
    const out = {};
    // 연결 분: 나감은 "그 언어에 지금 0명"일 때만 안다
    live.roster = {};
    rosterJoin({ hello: 1, deviceId: 'a', name: 'A', lang: 'en' }, 0);
    rosterJoin({ hello: 1, deviceId: 'b', name: 'B', lang: 'en' }, 60000);
    rosterJoin({ hello: 1, deviceId: 'c', name: 'C', lang: 'vi' }, 0);
    rosterJoin({ hello: 1, deviceId: 'a', name: '', lang: 'en' }, 90000);                           // 같은 기기 다시 hello — 줄이 늘지 않고 이름도 안 지워진다
    rosterApplyAtt({ att: 1, now: 2, langs: { en: { now: 2 }, vi: { now: 0 } } }, 180000);          // vi 0명 → C 나감(3분)
    rosterApplyAtt({ att: 1, now: 1, langs: { en: { now: 1 }, vi: { now: 0 } } }, 240000);          // en 둘 중 누가 나갔는지 모른다 → 닫지 않는다
    rosterApplyAtt({ att: 1, now: 0, langs: { en: { now: 0 }, vi: { now: 0 } } }, 600000);          // 0명 → A·B 나감
    rosterJoin({ hello: 1, deviceId: 'a', name: 'A', lang: 'ja' }, 900000);                         // A 다시 들어옴(언어 바꿈)
    out.rows = rosterRows(1200000).map(r => `${r.name}/${r.lang}/${r.minutes}`).sort().join(' ');
    out.csv = buildRosterCsv([{ name: 'x\ny', lang: 'en', minutes: 1 }, { name: '', lang: '', minutes: 0 }]);
    clearRoster();
    // 요약: 다시 읽은 문단은 한 번만 세고, 안 나간 문단은 전부 건너뛴 문단
    const keepP = paragraphs, keepS = live.sent;
    paragraphs = [1, 2, 3, 4, 5].map(n => ({ id: n, src: 's' + n, trans: {} }));
    live.sent = [1, 2, 2, 4].map(n => ({ para: n, at: n, src: 's' + n, trans: {} }));
    live.finalSummary = null;
    const s = sessionSummary(0);
    out.sum = `${s.read}/${s.total} skip=${s.skipped.join(',')} lines=${s.lines} att=${s.attendees}`;
    out.dur = fmtDuration(3723000);
    paragraphs = keepP; live.sent = keepS;
    return out;
  });
  ok(calc.rows === 'A/ja/15 B/en/9 C/vi/3', `연결 분: 구간 합 · 언어 0명일 때만 나감 처리 · 같은 기기는 한 줄 (${calc.rows})`);
  ok(calc.csv === '﻿이름,언어,연결 분\r\n"x\ny",en,1\r\n,,0\r\n', '참석 CSV: 줄바꿈 든 칸은 감싸고, 빈 이름은 빈 칸');
  ok(calc.sum === '3/5 skip=3,5 lines=4 att=0', `요약 셈: 다시 읽은 문단 한 번 · 안 나간 문단은 건너뛴 문단 (${calc.sum})`);
  ok(calc.dur === '1:02:03', `진행 시간 표시 h:mm:ss (${calc.dur})`);

  // ── 영어 화면(?lang=en): 끝 화면 글이 HOST_STR.en 에서 나온다 ──
  {
    const en = await hostCtx.newPage();
    watch(en);
    await en.goto(`${base}/web/host/?relay=${base}&lang=en`);
    const texts = await en.evaluate(() => ({
      end: document.getElementById('btnEnd').textContent, close: document.getElementById('btnCloseRoom').textContent,
      csv: document.getElementById('btnCsv').textContent, head: buildRosterCsv([]),
      missing: Object.keys(HOST_STR.ko).filter(k => !HOST_STR.en[k]).concat(Object.keys(HOST_STR.en).filter(k => !HOST_STR.ko[k])),
      empty: [...document.querySelectorAll('[data-t]')].filter(el => !el.textContent.trim()).map(el => el.getAttribute('data-t'))
    }));
    ok(texts.end === 'Finish' && texts.close === 'Close room' && texts.csv === 'Download attendance CSV', '영어 화면: 끝내기·방 닫기·참석 CSV 단추 글');
    ok(texts.head === '﻿Name,Language,Minutes connected\r\n', '영어 화면: 참석 CSV 머리');
    ok(texts.missing.length === 0 && texts.empty.length === 0, `글자 표 ko·en 빠짐 0 · 빈 data-t 0 (${texts.missing.concat(texts.empty).join(',')})`);

    // ── 릴레이와 끊긴 채로 방 닫기: 종료 신호를 못 보냈다고 말하고, 그래도 명단은 지우고, 다시 붙지 않는다 ──
    en.on('dialog', d => d.accept());
    await en.waitForSelector('#readyArea', { state: 'visible', timeout: 8000 });   // 같은 브라우저의 IndexedDB 원고가 되살아난다
    await en.click('#btnStartLecture');
    await en.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
    const room2 = relay.rooms.get((await en.textContent('#roomCode')).trim());
    const D = await openListener({ room: room2.code, lang: 'en', name: 'Dana' });
    await join(D);
    await en.waitForFunction(() => Object.keys(live.roster).length === 1, null, { timeout: 5000 });
    for (const h of [...room2.hosts]) h.terminate();
    await en.waitForFunction(() => document.getElementById('liveStatus').textContent.includes('다시 연결 중'), null, { timeout: 5000 });
    await en.click('#btnEnd');
    await en.click('#btnCloseRoom');
    const st = (await en.textContent('#endStatus')).trim();
    ok(st.includes('could not be sent') && st.includes('erased'), '끊긴 채 방 닫기: 종료 신호를 못 보냈다고 알린다');
    ok((await en.evaluate(() => Object.keys(live.roster).length)) === 0, '끊긴 채 방 닫기: 그래도 명단은 지운다');
    await wait(3500);
    ok(room2.hosts.size === 0 && !room2.ended, '끊긴 채 방 닫기: 다시 붙지 않는다(방은 릴레이의 10분 규칙이 닫는다)');
    await D.p.context().close();
    await en.close();
  }

  // ── 릴레이가 먼저 끝낸 방(무음 정지 등): 끝내기 → 요약·리포트는 그대로, 방 닫기는 end 를 또 보내지 않고 명단만 지운다 ──
  {
    const pg = await hostCtx.newPage();
    watch(pg);
    pg.on('dialog', d => d.accept());
    await pg.goto(`${base}/web/host/?relay=${base}`);
    await pg.waitForSelector('#readyArea', { state: 'visible', timeout: 8000 });
    await pg.click('#btnStartLecture');
    await pg.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
    const room3 = relay.rooms.get((await pg.textContent('#roomCode')).trim());
    const E = await openListener({ room: room3.code, lang: 'en', name: 'Eun' });
    await join(E);
    await pg.waitForFunction(() => Object.keys(live.roster).length === 1, null, { timeout: 5000 });
    await pg.click('#btnNext');
    const endsBefore = hostReceived.filter(m => m.end).length;
    for (const h of room3.hosts) h.send(JSON.stringify({ end: 1, why: 'silence_timeout' }));   // room.js alarm() 이 호스트에게 보내는 글
    await pg.waitForFunction(() => document.getElementById('liveStatus').textContent.includes('silence_timeout'), null, { timeout: 5000 });
    await pg.click('#btnEnd');
    await pg.waitForSelector('#step-end', { state: 'visible', timeout: 5000 });
    ok((await pg.textContent('#sumAtt')).trim() === '1' && (await pg.textContent('#sumRead')).trim() === '1', '릴레이가 먼저 끝낸 방: 끝 화면 요약(참석 1·읽은 문단 1)');
    ok(!(await pg.isVisible('#btnBackLive')), '릴레이가 먼저 끝낸 방: 진행으로 돌아가기 없음');
    await pg.click('#btnCloseRoom');
    ok((await pg.textContent('#endStatus')).includes('방을 닫았습니다'), '릴레이가 먼저 끝낸 방: 방 닫기 → 닫힘 표시');
    ok(hostReceived.filter(m => m.end).length === endsBefore, '릴레이가 먼저 끝낸 방: end 를 또 보내지 않는다');
    ok((await pg.evaluate(() => Object.keys(live.roster).length)) === 0, '릴레이가 먼저 끝낸 방: 명단을 지운다');
    await E.p.context().close();
    await pg.close();
  }

  ok(outside.length === 0, `바깥 요청 0건 (${outside.length})`);

  await browser.close();
  relay.close();
  console.log(`\n전부 통과 (${passCount}건)`);
  process.exit(0);
})().catch(err => {
  console.error('\n[FAIL]', err && err.message ? err.message : err);
  relay.close();
  process.exit(1);
});
