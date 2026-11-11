/* samples/edu_screen_1110_test.js — 안전교육 1차 실기 화면 고침 (NOW 11-10 12:56 ④)
 * 실행: node samples/edu_screen_1110_test.js   (npm run test:edu-screen-1110) — playwright·ws·pdftotext
 *
 *  1. 손님 줄 머리 `#10033 KO` 숨김 — ?dev=1 일 때만 보인다
 *  2. 근로자 확인 띠가 떠도 최신 번역 줄이 보인다(띠 아래 목록 안) · 띠와 줄이 겹치지 않는다
 *  3. 강사 화면 글자 검정(흐린 글자 포함)
 *  4. 확인서: 인쇄 여백 15mm(실제 PDF 에서 문서 번호·QR 이 종이 끝에서 15mm 안쪽) · 재입장한 사람 입장 칸 「재입장 n」
 *  5. 진위 화면 #h= — 제목 「교육 확인서 진위 확인」 · 맨 위 「확인서 번호 <앞 8자>… 받음 — …」 · 회색 글자 검정
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'web/common/edu-cert.js'));

let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };
const BLACK = 'rgb(0, 0, 0)';

(async () => {
  console.log('=== 안전교육 1차 실기 화면 고침 ===');
  const relay = createMockRelay({ root: ROOT });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    const room = relay.newRoom('guide');
    const hostWs = new WebSocket(`ws://localhost:${port}/ws?room=${room.code}&role=host&token=${room.token}`);
    await new Promise((res, rej) => { hostWs.on('open', res); hostWs.on('error', rej); });
    hostWs.send(JSON.stringify({ welcome: 1, plan: 'guide', guide: 1, src_lang: 'ko' }));
    for (let i = 1; i <= 14; i++) hostWs.send(JSON.stringify({ seq: 10020 + i, src_lang: 'ko', text: '줄 ' + i, tr: { en: 'Line number ' + i + ' of the safety training, please read it carefully.' } }));

    const open = async (extra) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
      const g = await ctx.newPage();
      await g.goto(`${base}/web/listener/?room=${room.code}&lang=en&auto=1&relay=localhost:${port}${extra || ''}`);
      await g.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
      await g.waitForFunction(() => document.querySelectorAll('#chat-list .msg-line').length >= 14, null, { timeout: 8000 });
      return { ctx, g };
    };

    console.log('\n[1] 줄 머리 #번호·말 코드 — 손님에게 숨김, ?dev=1 만');
    let a = await open();
    const head = await a.g.evaluate(() => {
      const s = document.querySelector('#chat-list .msg-line:last-child .msg-src');
      return { text: s.innerText.trim(), raw: s.textContent.replace(/\s+/g, ' ').trim() };
    });
    ok(!/#\d+/.test(head.text) && !/\bKO\b/.test(head.text), `손님 화면에 #번호·KO 없음 ("${head.text}")`);
    ok(/#10034/.test(head.raw), '글은 남아 있다(개발자 스위치로 보이게)');
    const b = await open('&dev=1');
    const headDev = await b.g.evaluate(() => document.querySelector('#chat-list .msg-line:last-child .msg-src').innerText.trim());
    ok(/#10034/.test(headDev) && /KO/.test(headDev), `?dev=1 이면 보인다 ("${headDev}")`);
    await b.ctx.close();

    console.log('\n[2] 근로자 확인 띠 — 최신 줄을 덮지 않는다');
    hostWs.send(JSON.stringify({ kind: 'confirm_open' }));
    await a.g.waitForFunction(() => { const b = document.getElementById('cf-band'); return b && getComputedStyle(b).display !== 'none' && (document.getElementById('btn-confirm').offsetHeight > 0 || document.getElementById('cf-head').offsetHeight > 0); }   /* 11-11 ③ 접힌 띠 — 머리만 보여도 뜬 것 */, null, { timeout: 8000 });
    await a.g.waitForTimeout(200);
    const geo = await a.g.evaluate(() => {
      const r = (e) => { const x = e.getBoundingClientRect(); return { top: x.top, bottom: x.bottom }; };
      const list = document.getElementById('chat-list');
      const last = list.querySelector('.msg-line:last-child');
      return { band: r(document.getElementById('cf-band')), list: r(list), last: r(last),
               next: document.getElementById('cf-band').nextElementSibling.id };
    });
    ok(geo.next === 'chat-list' && geo.band.bottom <= geo.list.top + 1, `띠는 목록 위 형제 — 겹치지 않는다 (띠 끝 ${Math.round(geo.band.bottom)} ≤ 목록 ${Math.round(geo.list.top)})`);
    ok(geo.last.bottom <= geo.list.bottom + 1 && geo.last.top >= geo.list.top - 1,
      `최신 줄이 목록 안에 보인다 (줄 ${Math.round(geo.last.top)}~${Math.round(geo.last.bottom)} · 목록 ${Math.round(geo.list.top)}~${Math.round(geo.list.bottom)})`);
    await a.ctx.close();
    hostWs.close();

    console.log('\n[3] 강사 화면 글자 검정');
    {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: 'ko-KR' });
      const h = await ctx.newPage();
      await h.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
      const col = await h.evaluate(() => {
        const cs = getComputedStyle(document.body);
        const muted = document.createElement('div'); muted.style.color = 'var(--text-muted)'; document.body.appendChild(muted);
        return { text: cs.color, muted: getComputedStyle(muted).color };
      });
      ok(col.text === BLACK && col.muted === BLACK, `글자 ${col.text} · 흐린 글자 ${col.muted}`);
      /* 되돌림: 같은 화면에서 덮는 한 줄만 빼고 다시 연다 — 검정이 그 줄에서 오는지 */
      const fs2 = require('fs');
      const src = fs2.readFileSync(path.join(ROOT, 'web/host/index.html'), 'utf8');
      const cut = src.replace('body { --text: #000; --text-muted: #000; }', '');
      const h2 = await ctx.newPage();
      await h2.route('**/web/host/?*', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: cut }));
      await h2.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
      const col2 = await h2.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--text-muted)'; document.body.appendChild(d); return getComputedStyle(d).color; });
      ok(cut !== src && col2 !== BLACK, `되돌림 실증 — 그 줄을 빼면 흐린 글자가 검정이 아니다 (${col2})`);
      await ctx.close();
    }

    console.log('\n[4] 확인서 — 여백 15mm · 재입장 n');
    {
      const t0 = Date.UTC(2026, 10, 10, 2, 0);
      const m = C.buildCertModel({
        edu: { site: '시험 사업장', kind: 'regular', subject: '안전', teacher: '강사' }, startedAt: t0, endedAt: t0 + 60 * 60000,
        roster: [
          { dev: 'd1', name: '응우옌', lang: 'vi', joinedAt: [t0 + 60000, t0 + 20 * 60000, t0 + 40 * 60000], leftAt: [t0 + 10 * 60000, t0 + 30 * 60000] },
          { dev: 'd2', name: '람', lang: 'ne', joinedAt: [t0 + 60000], leftAt: [] },
        ], confirms: {}, code: 'TEST01'
      });
      const html = C.certHtml(m, { qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110"><rect width="110" height="110"/></svg>', last: 'a'.repeat(64), verifyUrl: 'https://raytok.kr/web/verify/#h=' + 'a'.repeat(64) });
      ok(/@page \{ size: A4; margin: 15mm; \}/.test(html), '@page 여백 15mm');
      ok(/재입장 2/.test(html) && (html.match(/재입장/g) || []).length === 1, '두 번 다시 들어온 사람만 「재입장 2」');
      ok(C.certCsv(m).split('\r\n')[1] === C.CSV_COLS.join(','), 'CSV 열은 그대로');
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.setContent(html, { waitUntil: 'load' });
      const pdf = path.join(os.tmpdir(), `cert-1110-${process.pid}.pdf`);
      await p.pdf({ path: pdf, preferCSSPageSize: true });
      await ctx.close();
      const bbox = execFileSync('pdftotext', ['-bbox', '-f', '1', '-l', '1', pdf, '-'], { encoding: 'utf8' });
      fs.unlinkSync(pdf);
      const words = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
        .map((w) => ({ x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4], t: w[5] }));
      const page = (bbox.match(/<page width="([\d.]+)" height="([\d.]+)"/) || []).slice(1).map(Number);
      const mm = 72 / 25.4;
      const minX = Math.min(...words.map((w) => w.x0)), maxX = Math.max(...words.map((w) => w.x1)), minY = Math.min(...words.map((w) => w.y0));
      const doc = words.find((w) => /RT-\d{8}-TEST01/.test(w.t));
      const top = words.slice().sort((p, q) => p.y0 - q.y0)[0], right = words.slice().sort((p, q) => q.x1 - p.x1)[0];
      console.log('    맨 위 낱말', JSON.stringify(top), '· 맨 오른 낱말', JSON.stringify(right));
      ok(words.length > 20 && page[0] > 590, `PDF 를 실제로 뽑았다 (낱말 ${words.length} · 쪽 ${page.join('×')}pt)`);
      /* pdftotext 의 낱말 상자는 글꼴 상자라 실제 글자보다 조금 크다(제목 위·끝 글자 오른쪽 0.3~0.5mm). 옛 여백
         (좌우 14mm)과 가르는 문턱 14.3mm 로 잰다 — 옛 판이면 오른쪽 문서 번호가 13.6mm 안팎으로 나온다 */
      const L = 14.3 * mm;
      ok(minX >= L && page[0] - maxX >= L,
        `글자가 종이 좌우 끝에서 15mm 안쪽 (왼 ${(minX / mm).toFixed(1)} · 오른 ${((page[0] - maxX) / mm).toFixed(1)}mm, 상자 오차 감안 ≥14.3)`);
      ok(doc && page[0] - doc.x1 >= L && minY >= 10 * mm, `문서 번호 오른 ${doc ? ((page[0] - doc.x1) / mm).toFixed(1) : '?'}mm · 맨 위 상자 ${(minY / mm).toFixed(1)}mm`);
    }

    console.log('\n[5] 진위 화면 #h=');
    {
      const ctx = await browser.newContext();
      const v = await ctx.newPage();
      const h = 'abcdef0123456789'.repeat(4);
      await v.goto(`${base}/web/verify/#h=${h}`);
      const got = await v.evaluate(() => ({ t: document.title, h1: document.getElementById('vf-title').textContent,
        note: document.getElementById('qr-note').textContent, vis: getComputedStyle(document.getElementById('qr-note')).display !== 'none',
        muted: getComputedStyle(document.querySelector('p.desc')).color }));
      ok(got.h1 === '교육 확인서 진위 확인' && /교육 확인서 진위 확인/.test(got.t), `제목 「${got.h1}」`);
      ok(got.vis && got.note === `확인서 번호 ${h.slice(0, 8)}… 받음 — 함께 받은 기록 파일(.json)을 넣으면 진위를 확인합니다`, `맨 위 한 줄 「${got.note}」`);
      ok(got.muted === BLACK, `회색 글자 검정 (${got.muted})`);
      const v2 = await ctx.newPage();
      await v2.goto(`${base}/web/verify/`);
      const plain = await v2.evaluate(() => ({ h1: document.getElementById('vf-title').textContent, vis: getComputedStyle(document.getElementById('qr-note')).display !== 'none' }));
      ok(plain.h1 === 'RayTok 기록 해시 체인 검증' && !plain.vis, '#h= 없이 열면 전과 같다');
      await ctx.close();
    }
  } finally {
    await browser.close();
    relay.close();
  }
  console.log(`\n=== ${pass} PASS · ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('[FAIL]', e && e.stack || e); process.exit(1); });
