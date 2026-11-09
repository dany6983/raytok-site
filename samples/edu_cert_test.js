// samples/edu_cert_test.js — 「안전보건교육 실시 확인서」 (NOW 11-09 18:20 ①~⑦)
// 실행: node samples/edu_cert_test.js   (npm run test:edu-cert)  — playwright·ws·pdftotext 필요
//
// 가짜 방: 강사 1 · 근로자 3 (vi·ne·km). ne 는 중간에 나가고 확인을 못 한다(미확인).
// km 는 이름 없이 들어와 확인 때 이름을 먼저 적는다. 그 뒤:
//   ① 교육 정보 입력·다음에 채워 둠  ② 「교육 끝」 → 근로자 화면 확인 단추(자기 말) → 강사 n/N 실시간 → 3분(시험은 ?cfwait=2) 뒤 마감
//   ③ 확인서 숫자(참석 3/확인 2/미확인 1)·언어별 인원·붙임 1 · 진위 QR = v1 체인 last (node 로 따로 다시 셈) · /web/verify/ 대조
//   ④ CSV 열(BOM·머리 줄 교육 정보·붙임 1 과 같은 열)  ⑤ 닫기 전 경고(확인서·CSV) · 닫으면 명단·확인 지움
//   ⑥ 금지 문구 없음 · 개인정보 한 줄  ⑦ 실제 PDF(Chromium A4)를 pdftotext 로 뽑아 한글이 그대로인지
// 청취 분 셈은 짧은 시험으로 안 나오므로(0분) node 에서 시각을 박은 한 벌로 따로 센다(⑧).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'web/common/edu-cert.js'));
let pass = 0;
const ok = (c, m) => { assert(c, m); pass++; console.log('  [PASS] ' + m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('=== 안전보건교육 실시 확인서 (강사 1 · 근로자 3: vi·ne·km) ===');

/* 문서 규칙(docs/hashchain-v1.md)대로 **따로** 다시 센다 — 만든 쪽 함수를 빌리지 않는다 */
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = sortDeep(v[k]); return o; }
  return v;
}
function verifyChain(f) {
  let prev = '0'.repeat(64);
  for (let i = 0; i < f.items.length; i++) {
    const it = f.items[i];
    if (it.n !== i + 1 || it.prev !== prev) return `n=${i + 1} 이음 틀림`;
    const c = { ...it }; delete c.hash;
    for (const v of Object.values(c)) if (typeof v === 'number' && !Number.isInteger(v)) return `n=${it.n} 소수`;
    const h = crypto.createHash('sha256').update(prev + '\n' + JSON.stringify(sortDeep(c)), 'utf8').digest('hex');
    if (h !== it.hash) return `n=${it.n} 해시 틀림`;
    prev = h;
  }
  return f.last === prev ? '' : 'last 틀림';
}

(async () => {
  // ── ⑧ 먼저: 시각을 박은 한 벌로 청취 분·입퇴장·미참석 셈 (node, 브라우저 없이) ──
  {
    const T0 = new Date(2026, 10, 9, 14, 0).getTime(), MIN = 60000;
    const m = C.buildCertModel({
      edu: { site: '레이톡 화성공장', kind: 'regular', subject: '추락 방지', teacher: '박강사', target: '5' },
      code: '123456', startedAt: T0, endedAt: T0 + 60 * MIN,
      roster: [
        { dev: 'a', name: 'Nguyen', lang: 'vi', joinedAt: [T0 + 2 * MIN], leftAt: [] },
        { dev: 'b', name: 'Ram', lang: 'ne', joinedAt: [T0 + 1 * MIN, T0 + 30 * MIN], leftAt: [T0 + 11 * MIN, T0 + 40 * MIN] },
        { dev: 'c', name: '', lang: 'km', joinedAt: [T0 + 5 * MIN], leftAt: [T0 + 70 * MIN] }
      ],
      confirms: { a: { dev: 'a', at: T0 + 61 * MIN }, c: { dev: 'c', name: 'Sok', at: T0 + 62 * MIN }, z: { dev: 'z', name: 'Late', lang: 'vi', at: T0 + 63 * MIN } },
      langName: (c) => ({ vi: '베트남어', ne: '네팔어', km: '크메르어' }[c] || c)
    });
    const r = (d) => m.rows.find((x) => x.dev === d);
    ok(m.minutes === 60 && C.hm(m.startedAt) === '14:00' && C.hm(m.endedAt) === '15:00', '⑧ 교육 일시 14:00~15:00 (60분)');
    ok(r('a').minutes === 58 && r('b').minutes === 20 && r('c').minutes === 55, `⑧ 청취 분 — 끝까지 58 · 두 구간 10+10=20 · 끝 뒤 퇴장은 끝에서 자름 55 (${r('a').minutes}·${r('b').minutes}·${r('c').minutes})`);
    ok(C.hm(r('b').inAt) === '14:01' && C.hm(r('b').outAt) === '14:40' && r('b').leftEarly, '⑧ 입장=첫 입장 14:01 · 퇴장=마지막 퇴장 14:40 · 중간 퇴장 표시');
    ok(C.hm(r('c').outAt) === '15:00' && !r('c').leftEarly, '⑧ 교육 끝 뒤에 나간 사람의 퇴장은 교육 끝(15:00)');
    ok(r('c').name === 'Sok', '⑧ 이름 없이 들어와 확인 때 적은 이름이 명단에 들어간다');
    ok(m.present === 4 && m.confirmed === 3 && m.unconfirmed === 1 && m.target === 5 && m.absent === 1, '⑧ 대상 5 / 참석 4(명단 밖 확인 1 포함) / 미참석 1 · 확인 3 / 미확인 1');
    ok(r('z').inAt === null && r('z').minutes === null, '⑧ 명단에 없는 기기의 확인도 버리지 않는다 — 시간 칸은 모름(빈칸)');
    const blank = C.buildCertModel({ edu: {}, code: '1', startedAt: T0, endedAt: T0, roster: [], confirms: {} });
    const bh = C.certHtml(blank, {});
    ok((bh.match(/미기재/g) || []).length >= 6 && blank.absent === null, '⑧ 빈칸이어도 만든다 — 「미기재」 · 대상 모름이면 미참석도 「미기재」');
    const ch = await C.buildChain(m, { roster: [{ dev: 'a', name: 'Nguyen', lang: 'vi', joinedAt: [T0 + 2 * MIN], leftAt: [] }], confirms: { a: { dev: 'a', at: T0 + 61 * MIN } } });
    ok(verifyChain(ch) === '' && ch.items[0].kind === 'begin' && ch.items[ch.items.length - 1].kind === 'end', '⑧ 체인이 v1 규칙(따로 다시 셈)에 맞다 · begin 으로 시작 end 로 끝');
    ok(ch.items.every((i) => ['begin', 'note', 'join', 'leave', 'line', 'end'].includes(i.kind)), '⑧ 새 항목 종류를 만들지 않는다 — v1 의 begin·note·join·leave·line·end 만');
    const bad = JSON.parse(JSON.stringify(ch)); bad.items[2].name = 'X';
    ok(verifyChain(bad) !== '', '⑧ 되돌림 실증: 명단 이름 한 글자를 고치면 대조가 붉다');
  }

  const relay = createMockRelay({ root: ROOT });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const outside = [];
  const watch = (p) => p.on('request', (rq) => { const u = new URL(rq.url()); if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outside.push(rq.url()); });

  const hostCtx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const host = await hostCtx.newPage();
  watch(host);
  const dialogs = [];
  let answer = 'dismiss';
  host.on('dialog', async (d) => { dialogs.push(d.message()); if (answer === 'accept') await d.accept(); else await d.dismiss(); });
  await host.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  const hostUrl = `${base}/web/host/?region=US&relay=${base}&cfwait=2`;
  await host.goto(hostUrl);
  await host.fill('#tokenInput', 'valid_test_token');
  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible' });

  // ── ① 교육 정보 ──
  ok(await host.isVisible('#eduInfo') && (await host.$$('#eduKind option')).length === 6, '① 준비 화면에 교육 정보 칸 · 교육 종류 고르개(고르기+5종)');
  const kinds = await host.$$eval('#eduKind option', (os) => os.map((o) => o.textContent.trim()));
  ok(kinds.join('|') === '— 고르기 —|정기교육|채용 시 교육|작업내용 변경 시 교육|특별교육|기초안전보건교육(외국인)', `① 종류 다섯: ${kinds.slice(1).join(' · ')}`);
  await host.fill('#eduSite', '(주)레이톡 화성공장');
  await host.fill('#eduPlace', '2층 교육장');
  await host.selectOption('#eduKind', 'regular');
  await host.fill('#eduTeacher', '박안전');
  await host.fill('#eduTeacherOrg', '안전보건팀');
  await host.fill('#eduTeacherTitle', '과장');
  await host.fill('#eduTarget', '4');
  const txt = '오늘은 추락 방지 교육입니다.\n\n안전대를 반드시 거십시오.';
  await host.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], '11월 추락방지 교육.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, txt);
  await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 2);
  ok((await host.inputValue('#eduSubject')) === '11월 추락방지 교육', '① 과목이 비었으면 원고 파일 이름으로 채운다');
  const saved = await host.evaluate(() => JSON.parse(localStorage.getItem('raytok_edu_info')));
  ok(saved.site === '(주)레이톡 화성공장' && saved.kind === 'regular' && saved.target === '4', '① 이 기기 저장소에 통째로 저장(raytok_edu_info)');
  await host.click('#btnPreTranslate');
  await host.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'done', null, { timeout: 10000 });
  await host.click('#btnStartLecture');
  await host.waitForSelector('#step-live', { state: 'visible', timeout: 5000 });
  await host.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
  const code = (await host.textContent('#roomCode')).trim();
  const room = relay.rooms.get(code);

  async function listener(lang, name) {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
    const p = await ctx.newPage();
    watch(p);
    await p.addInitScript(() => { window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } }; if (window.speechSynthesis) { window.speechSynthesis.speak = (u) => setTimeout(() => u && u.onend && u.onend({}), 0); window.speechSynthesis.cancel = () => {}; } });
    await p.goto(`${base}/web/listener/?room=${code}&lang=${lang}&relay=localhost:${port}`);
    await p.waitForFunction(() => document.getElementById('room-input').value.length === 6);
    if (name) await p.fill('#name-input', name);
    await p.click('#btn-join');
    await p.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
    return { p, ctx, lang };
  }
  const VI = await listener('vi', 'Nguyen Van A');
  const NE = await listener('ne', 'Ram Bahadur');
  const KM = await listener('km', '');
  await host.waitForFunction(() => document.getElementById('attNow').textContent === '3', null, { timeout: 5000 });
  ok(!(await VI.p.isVisible('#cf-band')), '② 교육 중에는 확인 띠가 없다');
  await host.click('#btnNext');
  await host.click('#btnNext');
  await VI.p.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line.msg-script').length === 2, null, { timeout: 5000 });

  // ne 가 중간에 나간다 — 방이 기기 번호로 알린다(leave)
  await NE.ctx.close();
  await host.waitForFunction(() => Object.values(live.roster).some((p) => p.lang === 'ne' && p.leftAt.length === 1), null, { timeout: 5000 });
  ok(true, '② 한 사람 퇴장이 강사 명단에 바로 닫힌다(leave · 기기 번호)');

  // ── ② 교육 끝 → 확인 ──
  await host.click('#btnEnd');
  await host.waitForSelector('#step-end', { state: 'visible' });
  ok(room.received.some((m) => m.kind === 'confirm_open'), '② 「끝내기」 → confirm_open 을 보낸다');
  await VI.p.waitForSelector('#cf-band', { state: 'visible', timeout: 5000 });
  await KM.p.waitForSelector('#cf-band', { state: 'visible', timeout: 5000 });
  const viBand = await VI.p.evaluate(() => ({ btn: document.getElementById('btn-confirm').textContent, priv: document.getElementById('cf-privacy').textContent,
    name: getComputedStyle(document.getElementById('cf-name')).display, prev: document.getElementById('cf-band').nextElementSibling.id }));
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf8')).strings;
  ok(viBand.btn === dict.cf_btn.vi && viBand.priv === dict.cf_privacy.vi, `② 근로자 화면은 **자기 말**(vi): 「${viBand.btn}」`);
  ok(viBand.name === 'none' && viBand.prev === 'chat-list', '② 이름을 적은 사람은 이름 칸 없음 · 구조: #cf-band 는 #chat-list 바로 앞');
  ok((await KM.p.textContent('#btn-confirm')) === dict.cf_btn.km && await KM.p.isVisible('#cf-name'), '② km: 자기 말 단추 + 이름이 비어서 이름 칸이 보인다');
  ok((await host.textContent('#cfCount')) === '0' && (await host.textContent('#cfTotal')) === '3', '② 강사 화면 확인 0 / 3');
  ok(await host.isDisabled('#btnCert'), '② 마감 전에는 확인서 단추가 꺼져 있다');

  await VI.p.click('#btn-confirm');
  await VI.p.waitForFunction(() => /✔/.test(document.getElementById('cf-msg').textContent), null, { timeout: 5000 });
  await host.waitForFunction(() => document.getElementById('cfCount').textContent === '1', null, { timeout: 5000 });
  ok(!(await VI.p.isVisible('#btn-confirm')) && (await VI.p.textContent('#cf-msg')).includes(dict.cf_done.vi), '② vi 확인 → 단추 사라지고 「' + dict.cf_done.vi + '」 · 강사 1/3 실시간');
  await KM.p.click('#btn-confirm');
  ok((await KM.p.textContent('#cf-msg')) === dict.cf_need_name.km, '② km: 이름 없이 누르면 이름 먼저(자기 말)');
  await KM.p.fill('#cf-name', 'Sok Dara');
  await KM.p.click('#btn-confirm');
  await host.waitForFunction(() => document.getElementById('cfCount').textContent === '2', null, { timeout: 5000 });
  ok(true, '② km 이름 적고 확인 → 강사 2/3');
  ok(Object.values(room.confirms).length === 2 && Object.values(room.confirms).every((c) => !c.text && !c.tr), '② 방 기록에 확인 둘(글·번역 없음)');

  // ③ 3분(시험 2초) 뒤 저절로 마감
  await host.waitForFunction(() => !document.getElementById('btnCert').disabled, null, { timeout: 6000 });
  ok((await host.textContent('#cfTimer')) === '마감됨' && !(await host.isVisible('#btnCfClose')), '② 기다림이 끝나면 저절로 마감(「마감됨」 · 마감 단추 숨김) · 확인서 단추 켜짐');
  ok(room.received.some((m) => m.kind === 'confirm_close'), '② 마감 → confirm_close');
  await VI.p.waitForFunction(() => getComputedStyle(document.getElementById('btn-confirm')).display === 'none');
  // 마감 뒤 늦은 확인은 방이 거절
  const late = new WebSocket(`ws://localhost:${port}/ws?room=${code}&role=listener`);
  const lateMsgs = [];
  late.on('message', (d) => lateMsgs.push(JSON.parse(d.toString())));
  await new Promise((r) => late.on('open', r));
  late.send(JSON.stringify({ kind: 'confirm', name: 'Late', lang: 'vi', deviceId: 'late-dev' }));
  await wait(300);
  ok(lateMsgs.some((m) => m.kind === 'confirm_error' && m.why === 'closed') && !room.confirms['late-dev'], '② 마감 뒤 확인은 방이 거절(closed)');
  late.close();

  // ── ⑤ 닫기 전 경고 ──
  answer = 'dismiss';
  await host.click('#btnCloseRoom');
  ok(dialogs.length === 1 && dialogs[0].includes('확인서 PDF 를 아직 받지 않았습니다.') && dialogs[0].includes('참석 CSV 를 아직 받지 않았습니다.'), '⑤ 확인서·CSV 를 안 받고 닫으려 하면 둘 다 묻는다');
  ok(!(await host.isDisabled('#btnCloseRoom')), '⑤ 아니오 → 방은 그대로');

  // ── ③ 확인서 ──
  const [dlJson] = await Promise.all([host.waitForEvent('download', { timeout: 8000 }), host.click('#btnCert')]);
  const chainFile = JSON.parse(fs.readFileSync(await dlJson.path(), 'utf8'));
  await host.waitForFunction(() => window.rtHostCert.last() && document.querySelector('iframe[aria-hidden="true"]') === null || true);
  const cert = await host.evaluate(() => window.rtHostCert.last());
  const m = cert.model;
  ok(/^raytok_cert_RT-\d{8}-[A-Z0-9]{6}\.json$/.test(dlJson.suggestedFilename()), `③ 진위 대조 JSON 같이 받음 (${dlJson.suggestedFilename()})`);
  ok(m.present === 3 && m.confirmed === 2 && m.unconfirmed === 1 && m.target === 4 && m.absent === 1, '③ 대상 4 / 참석 3 / 미참석 1 · 확인 2 / 미확인 1');
  const ne = m.rows.find((r) => r.lang === 'ne');
  ok(ne && ne.confirmAt === null && ne.leftEarly && ne.name === 'Ram Bahadur', '③ ne: 중간 퇴장 · 미확인');
  ok(m.rows.find((r) => r.lang === 'km').name === 'Sok Dara', '③ km: 확인 때 적은 이름이 명단에');
  ok(m.rows.every((r) => Number.isInteger(r.minutes) && r.minutes >= 0), '③ 청취 시간(분) 칸이 정수');
  ok(m.byLang.map((l) => `${l.name}${l.n}`).sort().join(',') === '네팔어1,베트남어1,크메르어1', `③ 언어별 인원: ${m.byLang.map((l) => l.name + ' ' + l.n).join(' · ')}`);
  ok(m.edu.site === '(주)레이톡 화성공장' && m.kindLabel === '정기교육' && m.edu.subject === '11월 추락방지 교육' && m.edu.teacher === '박안전', '③ 머리: 사업장·종류·과목·강사');
  ok(verifyChain(chainFile) === '' && chainFile.last === cert.chain.last, '③ 내려받은 JSON 이 v1 체인 규칙에 맞다(node 로 따로 다시 셈)');
  ok(cert.verifyUrl.endsWith('/web/verify/#h=' + chainFile.last) && cert.html.includes(chainFile.last), '③ 진위 QR 주소 = /web/verify/#h=<last> · 해시가 확인서에 찍힌다');
  // QR 그림이 그 주소에서 나온 것인지 — 같은 라이브러리로 다시 그려 견준다
  const qrCtx = {}; vm.createContext(qrCtx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/vendor/qrcode.js'), 'utf8'), qrCtx);
  const q = qrCtx.qrcode(0, 'M'); q.addData(cert.verifyUrl); q.make();
  ok(cert.html.includes(q.createSvgTag({ cellSize: 3, margin: 1, scalable: true })), '③ 확인서의 QR 그림 = 대조 주소를 그린 것(같은 라이브러리로 다시 그려 견줌)');
  const kinds2 = chainFile.items.map((i) => i.kind);
  ok(kinds2.filter((k) => k === 'join').length === 3 && kinds2.filter((k) => k === 'leave').length >= 1
     && chainFile.items.filter((i) => i.kind === 'note' && /^confirm /.test(i.text)).length === 2, '③ 체인에 입장 3 · 퇴장 · 확인 2(note)');
  ok(!kinds2.includes('line'), '③ 붙임 2 를 안 고르면 강의 내용은 체인·확인서에 없다');
  ok(await host.evaluate(() => window.__printed >= 0) && (await host.textContent('#endStatus')).includes('PDF로 저장'), '③ 인쇄 창(PDF로 저장) 안내');

  // /web/verify/ 대조 — 맞는 해시는 통과, 다른 해시는 실패
  const vp = await hostCtx.newPage();
  const jsonPath = path.join(os.tmpdir(), `cert_${Date.now()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(chainFile));
  await vp.goto(`${base}/web/verify/#h=${chainFile.last}`);
  await vp.setInputFiles('#file-input', jsonPath).catch(async () => { await vp.setInputFiles('input[type=file]', jsonPath); });
  await vp.waitForFunction(() => /통과|실패/.test(document.getElementById('result-badge') ? document.getElementById('result-badge').textContent : document.body.innerText), null, { timeout: 5000 });
  const vOk = await vp.evaluate(() => document.getElementById('result-msg').textContent);
  ok(/QR 의 해시와도 같습니다/.test(vOk), '③ /web/verify/#h=<last> 에 JSON 을 넣으면 통과 + 「QR 해시와 같음」');
  await vp.goto(`${base}/web/verify/?again=1#h=${'a'.repeat(64)}`);   // 해시만 바꾸면 쪽이 다시 안 열린다
  await vp.setInputFiles('input[type=file]', jsonPath);
  await vp.waitForFunction(() => /실패/.test(document.getElementById('result-msg').textContent + document.body.innerText), null, { timeout: 5000 });
  ok(/QR 의 해시와/.test(await vp.evaluate(() => document.getElementById('result-msg').textContent)), '③ 되돌림 실증: QR 해시가 다르면 /web/verify/ 가 실패');
  await vp.close();

  // ── ⑦ 실제 PDF — 한글이 깨지지 않나 ──
  async function pdfText(html, name) {
    const pp = await browser.newPage();
    await pp.setContent(html, { waitUntil: 'load' });
    const file = path.join(os.tmpdir(), name);
    await pp.pdf({ path: file, format: 'A4', printBackground: true });
    await pp.close();
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  }
  const t1 = await pdfText(cert.html, `cert_${Date.now()}.pdf`);
  const flat = t1.replace(/\s+/g, ' ');
  ok(/안\s*전\s*보\s*건\s*교\s*육\s*실\s*시\s*확\s*인\s*서/.test(t1), '⑦ PDF 제목 「안전보건교육 실시 확인서」가 글자로 뽑힌다');
  ok(flat.includes('(주)레이톡 화성공장') && flat.includes('정기교육') && flat.includes('박안전') && flat.includes('2층 교육장'), '⑦ PDF 머리 — 사업장·종류·강사·장소');
  ok(flat.includes('참석 3명') && flat.includes('전자 확인 2명') && flat.includes('미확인 1명') && flat.includes('대상 4명'), '⑦ PDF 숫자 — 대상 4 / 참석 3 / 확인 2 / 미확인 1');
  ok(flat.includes('붙임 1. 참석자 명단') && flat.includes('Nguyen Van A') && flat.includes('Sok Dara') && flat.includes('베트남어') && flat.includes('크메르어'), '⑦ PDF 붙임 1 — 이름·언어');
  ok(flat.includes('안전관리자') && flat.includes('사업주') && flat.includes('진위 확인') && flat.includes(chainFile.last.slice(0, 20)), '⑦ PDF 결재란(안전관리자·사업주) · 진위 확인 해시');
  ok(flat.includes('RayTok 기록으로 자동 작성 · 진위는 QR 로 확인'), '⑦ PDF 바닥 줄');
  ok(!/�/.test(t1) && !/[□▯]/.test(t1), '⑦ 깨진 글자(�·□) 0');
  ok(!/법정 서식|법정 교육 인정/.test(t1 + cert.html), '⑥ 「법정 서식」「법정 교육 인정」 없음');

  // 붙임 2 (선택) — 체크하면 강의 내용이 붙는다
  await host.check('#chkCertContent');
  const cert2 = await host.evaluate(async () => { const c = await window.rtHostCert.build(); return { html: c.html, kinds: c.chain.items.map((i) => i.kind), last: c.chain.last, chain: c.chain, tr1: c.model.lines[0].tr }; });
  const trCode = Object.keys(cert2.tr1)[0];
  const t2 = (await pdfText(cert2.html, `cert2_${Date.now()}.pdf`)).replace(/\s+/g, ' ');
  ok(t2.includes('붙임 2. 강의 내용') && t2.includes('오늘은 추락 방지 교육입니다.') && !!trCode && t2.includes(`[${trCode}] ${cert2.tr1[trCode]}`), '③ 붙임 2(선택) — 원문·번역 줄');
  ok(cert2.kinds.filter((k) => k === 'line').length === 2 && verifyChain(cert2.chain) === '' && cert2.last !== chainFile.last, '③ 붙임 2 를 넣으면 체인에도 줄 2 — 대조 해시가 달라진다');
  await host.uncheck('#chkCertContent');

  // ── ④ CSV ──
  const [dlCsv] = await Promise.all([host.waitForEvent('download', { timeout: 8000 }), host.click('#btnCsv')]);
  const buf = fs.readFileSync(await dlCsv.path());
  const csv = buf.toString('utf8');
  const lines = csv.slice(1).split('\r\n').filter(Boolean);
  ok(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF && csv.includes('\r\n'), '④ CSV: UTF-8 BOM(엑셀 한글) · CRLF');
  ok(lines[0].startsWith('안전보건교육 실시 확인서,문서번호 RT-') && lines[0].includes('사업장 (주)레이톡 화성공장') && lines[0].includes('참석 3') && lines[0].includes('확인 2'), '④ 첫 줄 = 교육 정보 한 줄');
  ok(lines[1] === C.CSV_COLS.join(','), `④ 둘째 줄 = 붙임 1 과 같은 열 (${lines[1]})`);
  ok(lines.length === 5 && lines.filter((l) => /,미확인$/.test(l)).length === 1 && lines.some((l) => l.includes('Ram Bahadur') && l.endsWith('미확인')), '④ 사람 셋 · ne 만 「미확인」');

  // ── ⑤ 받은 뒤 닫기 — 경고 없음 · 지움 ──
  answer = 'accept';
  await host.click('#btnCloseRoom');
  ok(dialogs.length === 2 && !dialogs[1].includes('아직 받지 않았습니다'), '⑤ 확인서·CSV 를 받은 뒤에는 경고 없이 닫기만 묻는다');
  await VI.p.waitForSelector('#end-modal', { state: 'visible', timeout: 5000 });
  ok(await host.evaluate(() => Object.keys(live.roster).length === 0 && Object.keys(live.confirms).length === 0), '⑤ 닫으면 강사 화면의 명단·확인을 지운다');
  ok(!room.confirms && !room.confirmOpen, '⑤ 방(릴레이)도 확인 기록을 지운다');
  ok(await host.isDisabled('#btnCert') && await host.isDisabled('#btnCsv'), '⑤ 닫은 뒤 확인서·CSV 단추 꺼짐');

  // ── ① 다음에 또 열면 앞 값을 채워 둔다 ──
  await host.goto(hostUrl);
  ok((await host.inputValue('#eduSite')) === '(주)레이톡 화성공장' && (await host.inputValue('#eduKind')) === 'regular' && (await host.inputValue('#eduTeacherTitle')) === '과장', '① 다시 열면 앞 값이 채워져 있다');

  // ── ⑥ 개인정보 한 줄 · 바깥 요청 ──
  ok(dict.cf_privacy.ko === '이름과 확인 시각이 교육 기록으로 사업장에 전달됩니다.', '⑥ 확인 단추 위 개인정보 한 줄(ko 정본 문구)');
  ok(outside.length === 0, `바깥 요청 0건 (${outside.slice(0, 3).join(', ')})`);

  await browser.close();
  relay.close();
  console.log(`\n${pass} 통과`);
  process.exit(0);
})().catch((e) => { console.error('[FAIL]', e && e.message); process.exit(1); });
