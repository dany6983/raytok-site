/* samples/host_mic_commit_test.js — 웹 강사 🎤: 확정을 크롬에 맡기지 않는다 · 엉킴 탈출 (NOW 11-11 13:28 ①②⑧)
 * 실행: node samples/host_mic_commit_test.js   (npm run test:host-mic-commit)
 *
 *  ① final 0 · interim 만(11-11 실기 꼴) — 크롬처럼 interim 을 **여러 칸**으로 주고 바뀐 칸부터 알린다(resultIndex)
 *     · 1.5초 멈춤마다 한 줄 · 쉬지 않고 13초 말해도 6초마다 낱말 경계로 한 줄 · 끝나면 나머지
 *     · 보낸 글을 이으면 말한 낱말 **그대로**(유실 0 · 겹침 0)
 *     · 크롬 final 이 뒤늦게 같은 글로 오면 보낸 만큼 빼고 나머지만
 *  ② aborted→end 폭풍 — 새로 만들기 1회(`mic_rebuild`) · 화면 「마이크 다시 잡는 중」 → 말 오면 「듣는 중」
 *     · 새로 만든 것도 엉키면 1초 쉬고 한 번 더(again=1)
 *  거울(D-09): `?interimCommit=0` 이면 ① 이 붉다 · `?micRebuild=0` 이면 ② 가 붉다
 *
 * 시간은 Playwright 시계로 앞당긴다. 인식기는 가짜(헤드리스에 없다) — 칸 나눔은 크롬 꼴(D-11:
 * 11-11 실기 `mic.log` 의 끝 조각 2~46자가 resultIndex 앞 칸을 버린 흔적).
 */
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { createMockRelay } = require('./mock_relay');

let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

const FAKE_SPEECH = `
  window.__recLog = []; window.__stormLeft = 0; window.__made = 0; window.__stormUpTo = 0;
  class FakeRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.running=false;
                    this.finals=[]; this.id = ++window.__made; }
    start() {
      if (this.running) throw new Error('already started');
      this.running = true; this.finals = []; window.__recLog.push('start'); window.__rec = this;
      if (this.onstart) this.onstart();
      if (window.__stormLeft > 0 && this.id <= window.__stormUpTo && this.storm !== false) {
        window.__stormLeft -= 1;
        setTimeout(() => { if (!this.running) return; this.running = false;
          if (this.onerror) this.onerror({ error: 'aborted' }); if (this.onend) this.onend(); }, 20);
      }
    }
    stop() { if (!this.running) return; this.running = false; window.__recLog.push('stop'); if (this.onend) this.onend(); }
    abort() { this.storm = false; this.running = false; window.__recLog.push('abort'); if (this.onend) this.onend(); }
    _emit(segs, changedFrom) {
      const r = this.finals.map(t => ({ 0: { transcript: t }, isFinal: true, length: 1 }))
        .concat(segs.map(t => ({ 0: { transcript: t }, isFinal: false, length: 1 })));
      r.length = r.length;
      const ri = changedFrom == null ? Math.max(this.finals.length, r.length - 1) : changedFrom;
      if (this.onresult) this.onresult({ resultIndex: ri, results: r });
    }
    /* interim — 낱말 5개마다 새 칸. 바뀐 것은 늘 마지막 칸(크롬 꼴) */
    interimWords(words) {
      const segs = [];
      for (let i = 0; i < words.length; i += 5) segs.push((i ? ' ' : '') + words.slice(i, i + 5).join(' '));
      this._emit(segs);
    }
    finalText(t) { this.finals.push(t); this._emit([], this.finals.length - 1); }
  }
  window.SpeechRecognition = FakeRecognition;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) }
  });
`;

async function openHost(browser, base, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 }, locale: 'ko-KR' });
  await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  await page.clock.install();
  await page.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR${extra || ''}`);
  await page.fill('#tokenInput', 'valid_instructor_token');
  await page.click('#btnVerifyToken');
  await page.waitForSelector('#step-prepare', { state: 'visible' });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['원고 한 문단입니다.'], 'g.txt', { type: 'text/plain' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.para-item').length === 1);
  await page.check('#chkBroadcastRaw');
  await page.click('#btnPreTranslate');
  await page.waitForFunction(() => window.rtHostReady && window.rtHostReady.mode() === 'raw', null, { timeout: 5000 });
  await page.click('#btnStartLecture');
  await page.waitForSelector('#step-live', { state: 'visible' });
  await page.waitForFunction(() => document.getElementById('liveStatus').textContent === '연결됨', null, { timeout: 5000 });
  const code = (await page.textContent('#roomCode')).trim();
  await page.click('#btnMic');
  await page.waitForFunction(() => window.rtHostMic.state.live === true);
  return { ctx, page, code };
}

const W = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i + 1}`);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const settle = () => new Promise(r => setTimeout(r, 300));

/** 말하기: 낱말을 every ms 마다 하나씩 interim 으로 붙인다. 그때마다 [보낸 시각, 줄 수] 를 기록 */
async function speak(page, words, everyMs, prefix) {
  const all = (prefix || []).slice();
  for (const w of words) {
    all.push(w);
    await page.evaluate((ws) => window.__rec.interimWords(ws), all);
    await page.clock.runFor(everyMs);
  }
  return all;
}

async function scenarioA(browser, base, extra) {
  /* 말 4문장(12낱말씩) · 낱말 0.4초 · 문장 사이 2초 쉼 · final 은 한 번도 안 온다(11-11 실기) */
  const h = await openHost(browser, base, extra);
  const room = relay.rooms.get(h.code);
  const before = room.received.filter(m => m.broadcast).length;
  const spoken = [];
  const firstAt = [], sentAt = [];
  let words = [];
  for (let s = 0; s < 4; s++) {
    const ws = W(12, `s${s + 1}w`);
    for (const w of ws) {
      words.push(w); spoken.push(w);
      await h.page.evaluate((x) => window.__rec.interimWords(x), words);
      await h.page.clock.runFor(400);
    }
    await h.page.clock.runFor(2000);   // 쉼 — 1.5초 멈춤이 확정한다
  }
  await settle();
  const got = room.received.filter(m => m.broadcast).slice(before).map(m => m.text);
  const log = await h.page.evaluate(() => window.rtHostMic.log());
  await h.ctx.close();
  return { got, spoken, log };
}

let relay;
(async () => {
  console.log('=== 웹 강사 🎤 — interim 확정 · 엉킴 탈출 (11-11 ①②) ===');
  relay = createMockRelay({ root: path.join(__dirname, '..') });
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch();
  try {
    /* ── ① final 0 · 쉼 있는 말 ── */
    console.log('\n[①-1] final 0 · interim 만 · 문장 사이 2초 쉼');
    const A = await scenarioA(browser, base, '');
    ok(A.got.length === 4, `4문장 → 4줄 (${A.got.length}): ${JSON.stringify(A.got.map(t => t.slice(0, 20)))}`);
    ok(norm(A.got.join(' ')) === A.spoken.join(' '), `보낸 글을 이으면 말한 48낱말 그대로 — 유실 0 · 겹침 0`);
    ok(A.got.every(t => !/^s\d+w(1[0-2]|[2-9])$/.test(t)), '끝 조각(낱말 하나)만 나간 줄 없음');
    ok(A.log.filter(l => /^mic_commit why="still"/.test(l)).length === 4, '기록 mic_commit why=still 4줄');

    /* ── ① 쉬지 않는 말 13초 → 6초마다 낱말 경계 ── */
    console.log('\n[①-2] 쉬지 않고 13초(낱말 0.5초) — 6초 상한');
    {
      const h = await openHost(browser, base, '');
      const room = relay.rooms.get(h.code);
      const before = room.received.filter(m => m.broadcast).length;
      const ws = W(26, 'r');
      const times = [];
      let cur = [];
      for (let i = 0; i < ws.length; i++) {
        cur.push(ws[i]);
        await h.page.evaluate((x) => window.__rec.interimWords(x), cur);
        await h.page.clock.runFor(500);
        const n = await h.page.evaluate(() => window.rtHostMic.log().filter(l => /^mic_commit/.test(l)).length);
        if (n > times.length) times.push((i + 1) * 0.5);
      }
      ok(times.length === 2 && times[0] >= 5.5 && times[0] <= 6.5 && times[1] <= 13, `쉼 없이도 6초에 첫 줄, 그 6초 뒤 둘째 줄(0.5초 눈금) (${times.join('s, ')}s)`);
      await h.page.evaluate(() => window.__rec.stop());   // 인식기가 끝남 → 나머지
      await h.page.clock.runFor(500);
      await settle();
      const got = room.received.filter(m => m.broadcast).slice(before).map(m => m.text);
      ok(norm(got.join(' ')) === ws.join(' '), `끝나면 나머지까지 — 이으면 26낱말 그대로 (${got.length}줄)`);
      ok(got.slice(0, -1).every(t => /r\d+$/.test(t.trim())), '6초 줄은 낱말 경계에서 끊김(반 낱말 없음)');
      await h.ctx.close();
    }

    /* ── ① 크롬 final 이 뒤늦게 — 겹쳐 보내지 않는다 ── */
    console.log('\n[①-3] 확정한 뒤 크롬 final 이 같은 글 + 더 → 나머지만');
    {
      const h = await openHost(browser, base, '');
      const room = relay.rooms.get(h.code);
      const before = room.received.filter(m => m.broadcast).length;
      await h.page.evaluate(() => window.__rec.interimWords(['가', '나', '다']));
      await h.page.clock.runFor(2000);
      await h.page.evaluate(() => window.__rec.finalText('가 나 다 라'));
      await h.page.clock.runFor(300);
      await h.page.evaluate(() => window.__rec.interimWords(['마', '바']));
      await h.page.clock.runFor(2000);
      await h.page.evaluate(() => window.__rec.finalText('마 바'));    // 이미 다 보냄 — 아무것도 안 간다
      await h.page.clock.runFor(2000);
      await settle();
      const got = room.received.filter(m => m.broadcast).slice(before).map(m => m.text.trim());
      ok(JSON.stringify(got) === JSON.stringify(['가 나 다', '라', '마 바']), `줄: ${JSON.stringify(got)}`);
      await h.ctx.close();
    }

    /* ── ② 엉킴 ── */
    console.log('\n[②-1] aborted→end 폭풍 → 새로 만들기 1회');
    {
      const h = await openHost(browser, base, '');
      const made0 = await h.page.evaluate(() => window.__made);
      /* 지금 인식기만 엉킨다 — 새로 만든 것은 멀쩡(사람이 끄고 켜니 0 이던 11-11 실기 꼴) */
      await h.page.evaluate(() => { window.__stormUpTo = window.__made; window.__stormLeft = 50; window.__rec.stop(); });
      await h.page.clock.runFor(3000);
      const r = await h.page.evaluate(() => ({ n: window.rtHostMic.rebuild.n(), made: window.__made, left: window.__stormLeft,
        status: document.getElementById('micStatus').textContent, live: window.rtHostMic.state.live,
        log: window.rtHostMic.log().filter(l => /^mic_rebuild/.test(l)) }));
      ok(r.n === 1 && r.log.length === 1, `새로 만들기 1회 (${r.n}) · 기록 ${JSON.stringify(r.log)}`);
      ok(r.made === made0 + 1, `인식기를 새로 만들었다 (${made0}→${r.made})`);
      ok(r.left >= 40, `폭풍이 5번 안팎에서 멈췄다 (남은 폭풍 ${r.left} — 옛 판은 다 돈다)`);
      ok(r.live === true, '새 인식기가 열려 있다');
      ok(/다시 잡는 중/.test(r.status), `화면: 「${r.status}」`);
      await h.page.evaluate(() => window.__rec.interimWords(['말']));
      ok(/듣는 중/.test(await h.page.textContent('#micStatus')), '말이 들리면 「듣는 중」으로');
      await h.ctx.close();
    }
    console.log('\n[②-2] 새로 만든 것도 엉킴 → 1초 쉬고 한 번 더');
    {
      const h = await openHost(browser, base, '');
      await h.page.evaluate(() => { window.__stormUpTo = window.__made + 1; window.__stormLeft = 50; window.__rec.stop(); });   // 새로 만든 첫 것도 엉킨다
      await h.page.clock.runFor(3500);
      const r = await h.page.evaluate(() => ({ n: window.rtHostMic.rebuild.n(),
        log: window.rtHostMic.log().filter(l => /^mic_rebuild/.test(l)), live: window.rtHostMic.state.live }));
      ok(r.n === 2 && /again=1/.test(r.log[1] || ''), `두 번째는 again=1 (${JSON.stringify(r.log)})`);
      ok(r.live === true, '폭풍이 끝나면 열려 있다');
      await h.ctx.close();
    }

    /* ── 거울 (D-09) ── */
    console.log('\n[거울] 스위치를 끄면 붉다');
    const Aoff = await scenarioA(browser, base, '&interimCommit=0');
    ok(!(Aoff.got.length === 4 && norm(Aoff.got.join(' ')) === Aoff.spoken.join(' ')),
       `되돌림 실증 — ?interimCommit=0 → ①-1 붉음 (줄 ${Aoff.got.length}: ${JSON.stringify(Aoff.got.map(t => t.slice(0, 12)))})`);
    {
      const h = await openHost(browser, base, '&micRebuild=0');
      await h.page.evaluate(() => { window.__stormUpTo = window.__made; window.__stormLeft = 50; window.__rec.stop(); });
      await h.page.clock.runFor(3000);
      const r = await h.page.evaluate(() => ({ n: window.rtHostMic.rebuild.n(), left: window.__stormLeft }));
      ok(r.n === 0 && r.left < 40, `되돌림 실증 — ?micRebuild=0 → ②-1 붉음 (새로 만들기 ${r.n} · 남은 폭풍 ${r.left})`);
      await h.ctx.close();
    }

    console.log(`\n${passCount}건 통과`);
  } catch (e) {
    console.error('[FAIL]', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await relay.close();
  }
})();
