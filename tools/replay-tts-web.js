#!/usr/bin/env node
/*
 * 웹 손님 읽기(TTS) 재생 시험대 — 앱 `raytok-native1/scripts/replay-tts.js` 와 **같은 입력·같은 셈**으로
 * 손님 화면(web/listener + web/common/tts-guard.js)에 흘린다 (NOW 11-10 12:56 ③).
 *
 * 입력: 앱 실기 기록의 강연 final 줄 `translate_ok chars=<영어 글자> ms=<번역 ms>` (기본
 *       docs/reclog/2026-11-10-web/lang106-final.txt — 앱 docs/reclog/2026-11-10-lang106/reclog.txt 에서 뽑음).
 * 앱 시험대와 맞춘 것:
 *   · 손님에게 줄이 닿는 시각 = 번역이 붙은 시각(기록 t) — 같은 간격
 *   · 읽을 글 길이(한국어) = round(영어 × 0.5) (앱: 기록에 짝이 없으면 비율 0.5)
 *   · 읽는 시간 = 영어 글자 × 83ms ÷ 배속 (앱: 기록에서 못 재면 83ms — 이 기록이 그렇다) · 줄 사이 쉼 없음
 * 가짜 speechSynthesis(진짜 규약: speak 는 줄 세움 · cancel 은 onerror('interrupted'))가 시간을 재고,
 * 시계는 Playwright 시계로 앞당긴다. 줄마다 보이지 않는 표 하나(한 글자)를 끝에 붙여 어느 줄을 읽었는지 센다
 * — 글자 수는 그대로다.
 *
 * 쓰기: node tools/replay-tts-web.js [기록] [--old]   (--old = ?tts106=0, 11-03 판)
 *       require('./tools/replay-tts-web.js').run({ file, old }) → 숫자
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const DEF = path.join(ROOT, 'docs', 'reclog', '2026-11-10-web', 'lang106-final.txt');
const RATIO = 0.5;
const MS_PER_EN = 83;
const MARK0 = 0x4E00;      // 줄 표: 한자 한 글자(군말 표·합치기 셈에 걸리지 않는다)

function readUnits(file) {
  const out = [];
  for (const ln of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = ln.match(/^\s*(\d+) translate_ok chars=(\d+).*mode="lecture".*\bms=(\d+)/);
    if (m && Number(m[2]) > 0) out.push({ trAt: Number(m[1]), en: Number(m[2]) });
  }
  out.sort((a, b) => a.trAt - b.trAt);
  out.forEach((u, i) => { u.i = i; u.ko = Math.max(1, Math.round(u.en * RATIO)); });
  return out;
}

async function run({ file = DEF, old = false, browser = null } = {}) {
  const units = readUnits(file);
  const { createMockRelay } = require(path.join(ROOT, 'samples', 'mock_relay'));
  const { chromium } = require('playwright');
  const relay = createMockRelay({ root: ROOT });
  const port = await relay.listen();
  const own = !browser;
  const b = browser || await chromium.launch();
  const room = relay.newRoom('guide');
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const enOf = units.map((u) => u.en);
  await ctx.addInitScript(([en, ms, mark0]) => {
    window.__rp = { speaks: [], starts: [] };
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; } };
    let cur = null, timer = null, q = [];
    const seqsOf = (t) => [...String(t || '')].map((c) => c.codePointAt(0) - mark0).filter((k) => k >= 0 && k < en.length);
    function next() {
      cur = q.shift() || null; S.speaking = !!cur;
      if (!cur) return;
      const u = cur;
      const seqs = seqsOf(u.text);
      const dur = Math.round(seqs.reduce((a, k) => a + en[k], 0) * ms / (u.rate || 1));
      window.__rp.speaks.push({ at: Date.now(), seqs, rate: u.rate || 1, dur });
      timer = setTimeout(() => { if (cur !== u) return; cur = null; if (u.onend) u.onend({}); if (!cur) next(); }, Math.max(1, dur));
    }
    const S = {
      getVoices: () => [{ lang: 'ko-KR', name: 'ko', localService: true, default: true }],
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      speak(u) { if (!u.text) return; q.push(u); if (!cur) next(); },
      cancel() { clearTimeout(timer); q = []; const p = cur; cur = null; S.speaking = false; if (p && p.onerror) p.onerror({ error: 'interrupted' }); },
      pause() {}, resume() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: S });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ release() {}, addEventListener() {} }) } });
  }, [enOf, MS_PER_EN, MARK0]);
  const g = await ctx.newPage();
  await g.clock.install();
  const WebSocket = require('ws');
  const hostWs = new WebSocket(`ws://localhost:${port}/ws?room=${room.code}&role=host&token=${room.token}`);
  await new Promise((res, rej) => { hostWs.on('open', res); hostWs.on('error', rej); });
  hostWs.send(JSON.stringify({ welcome: 1, plan: 'guide', guide: 1, src_lang: 'en' }));
  try {
    await g.goto(`http://localhost:${port}/web/listener/?room=${room.code}&lang=ko&auto=1&relay=localhost:${port}${old ? '&tts106=0' : ''}`);
    await g.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
    await g.waitForFunction(() => !!window.rtTtsGuard, null, { timeout: 5000 });
    await g.evaluate(() => { srcLang = 'en'; selectedLang = 'ko'; isTtsEnabled = true; window.__rp.speaks.length = 0; });
    const t0 = units.length ? units[0].trAt : 0;
    let now = t0;
    const arrive = {};
    for (const u of units) {
      if (u.trAt > now) { await g.clock.runFor(u.trAt - now); now = u.trAt; }
      const text = 'ㄱ'.repeat(Math.max(0, u.ko - 1)) + String.fromCodePoint(MARK0 + u.i);
      arrive[u.i] = await g.evaluate(([seq, text]) => {
        handleMessage({ seq: seq + 1, text: 'x', tr: { ko: text }, broadcast: true });
        return Date.now();
      }, [u.i, text]);
    }
    await g.clock.runFor(60000);
    const got = await g.evaluate(() => ({ speaks: window.__rp.speaks, st: window.rtTtsGuard.state() }));
    const read = new Set();
    const lags = [];
    const rates = {};
    for (const s of got.speaks) {
      rates[s.rate] = (rates[s.rate] || 0) + s.seqs.length;
      for (const k of s.seqs) { if (!read.has(k)) { read.add(k); lags.push(s.at - arrive[k]); } }
    }
    lags.sort((x, y) => x - y);
    const pct = (q) => (lags.length ? lags[Math.min(lags.length - 1, Math.floor(lags.length * q))] : 0);
    const enAll = units.reduce((a, u) => a + u.en, 0);
    const enRead = units.filter((u) => read.has(u.i)).reduce((a, u) => a + u.en, 0);
    const fast = Object.entries(rates).filter(([r]) => Number(r) >= 1.2).reduce((a, [, n]) => a + n, 0);
    return {
      code: old ? '웹 11-03 판(?tts106=0)' : '웹 지금(앱 106 규칙)',
      input: path.relative(ROOT, file),
      units: units.length,
      speaks: got.speaks.length,
      tts_unit: read.size,
      rate: rates,
      rateFastPct: read.size ? Math.round((fast / read.size) * 100) : 0,
      tts_jump: got.st.jumps,
      jumpedUnits: units.length - read.size,
      readUnitsPct: units.length ? Math.round((read.size / units.length) * 100) : 0,
      readCharsPct: enAll ? Math.round((enRead / enAll) * 100) : 0,
      lagMs: { p50: pct(0.5), p90: pct(0.9), max: lags.length ? lags[lags.length - 1] : 0 },
      timeouts: got.st.timeouts,
    };
  } finally {
    try { hostWs.close(); } catch (_) {}
    await ctx.close();
    if (own) await b.close();
    relay.close();
  }
}

module.exports = { run, readUnits, DEF };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) || DEF;
  run({ file, old: args.includes('--old') }).then((o) => {
    if (args.includes('--json')) { console.log(JSON.stringify(o)); return; }
    console.log(`읽기 재생 — ${o.code} · ${o.input}`);
    console.log(`단위 ${o.units} · 읽기 호출 ${o.speaks} (합친 뒤) · rate ${JSON.stringify(o.rate)} · rate≥1.2 ${o.rateFastPct}%`);
    console.log(`tts_jump ${o.tts_jump} (건너뛴 단위 ${o.jumpedUnits}) · 상한 넘음 ${o.timeouts}`);
    console.log(`끝까지 읽힌 단위 ${o.readUnitsPct}% · 글자 ${o.readCharsPct}% · 밀림(닿음→읽기 시작) p50 ${o.lagMs.p50} p90 ${o.lagMs.p90} max ${o.lagMs.max}ms`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
