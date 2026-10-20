#!/usr/bin/env node
/**
 * scripts/listener-qa.mjs — **손님 화면 전수 점검** (NOW 2026-10-20 13:25 A2 ★★★)
 *
 * 대표님 14:57 "손님폰 기능이 하나도 안 돼 … 이거 내가 처음부터 다 해야 돼".
 * **대표님이 QA 를 하시면 안 된다.** 손님 화면의 단추·띠·상태를 전부 우리가 먼저 돌리고
 * 통과 표를 들고 넘긴다. 그 표를 만드는 것이 이 파일이다.
 *
 * 가짜가 아니다 (D-11):
 *   · 릴레이 — 진짜 `wrangler dev` (relay/). 목이 아니다.
 *   · 브라우저 — 진짜 Chromium · WebKit. 폰 폭(390x844)으로 띄운다.
 *   · 강사 — 진짜 host_token 으로 붙은 WebSocket. 진짜 broadcast 를 쏜다.
 *
 * 돌리기 (저장소 뿌리에서):
 *   node scripts/listener-qa.mjs                 # 둘 다 (chromium · webkit)
 *   node scripts/listener-qa.mjs --only=webkit
 *   node scripts/listener-qa.mjs --keep          # 끝나고 릴레이를 안 내린다
 *
 * 비밀은 `relay/.dev.vars`(LICENSE_SECRET) 에서만 읽고 **어디에도 찍지 않는다**.
 * 운영 주소로는 안 돈다 — wrangler dev 기준이다.
 *
 * 칸은 셋이다: **됨 / 안 됨 / 모름**. 「모름」은 **우리가 못 재는 것만** 이다
 * (폰 하드웨어·브라우저 밖의 일). 못 잰 것을 "됨"으로 적지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { chromium, webkit } from 'playwright';
import { mintLicenseToken } from '../relay/tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RELAY_DIR = path.join(ROOT, 'relay');
const RELAY_PORT = 8787;
const SITE_PORT = 8788;                      // 8788 이면 화면이 8787 을 릴레이로 본다 (index.src.html 1300)
const BASE = `http://127.0.0.1:${RELAY_PORT}`;
const PHONE = { width: 390, height: 844 };   // 손님은 폰이다

const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const KEEP = argv.includes('--keep');

/* ── 표 ───────────────────────────────────────────────────────────────────── */
const rows = [];
const row = (item, browser, state, note) => rows.push({ item, browser, state, note });
const OK = '됨', NO = '안 됨', DUNNO = '모름';

/* ── 비밀 (찍지 않는다) ───────────────────────────────────────────────────── */
function secret() {
  const p = path.join(RELAY_DIR, '.dev.vars');
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return '';
  for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^LICENSE_SECRET=(.*)$/);
    if (m) return m[1].trim();
  }
  return '';
}

/* ── 릴레이 ───────────────────────────────────────────────────────────────── */
async function relayUp(ms = 1500) {
  try {
    const r = await fetch(`${BASE}/room`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: '{}', signal: AbortSignal.timeout(ms) });
    return r.status > 0;
  } catch { return false; }
}
async function startRelay() {
  if (await relayUp()) { console.log('[relay] 이미 떠 있다'); return null; }
  console.log('[relay] wrangler dev 를 띄운다…');
  const p = spawn('npx', ['wrangler', 'dev', '--port', String(RELAY_PORT), '--local'],
                  { cwd: RELAY_DIR, stdio: 'ignore' });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 700));
    if (await relayUp()) { console.log(`[relay] 준비 (${Date.now() - t0}ms)`); return p; }
  }
  throw new Error('릴레이가 90초 안에 안 떴다');
}

/* ── 정적 서버 (8788) ─────────────────────────────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
               '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function startSite() {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(SITE_PORT, '127.0.0.1', () => ok(srv)));
}

/* ── 강사 (진짜 host_token 으로 붙는다) ───────────────────────────────────── */
async function openRoom(SECRET) {
  const lic = mintLicenseToken({ sub: `qa-${Date.now()}`, days: 1, flags: 0x01, secret: SECRET });
  const r = await fetch(`${BASE}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lic}` },
    body: JSON.stringify({ kind: 'guide' }) });
  if (r.status !== 200) throw new Error(`/room → ${r.status}`);
  return r.json();                                     // { code, host_token }
}
/*
 * ★ **가짜 강사는 진짜 강사처럼 답해야 한다** (D-11 — 처음에 이걸 틀렸다).
 *
 * 프로토콜은 `docs/samples/wire-messages.json` 에 적혀 있다:
 *   청취자 → hello → **가이드 → welcome** → 이후 가이드가 line·tr·no_tr
 * `welcome` 은 **릴레이가 아니라 강사 화면이** 보낸다(`web/host/index.html:1916`).
 * 처음 판은 가짜 강사가 hello 에 답을 안 해서 손님 화면이 영영 "Connecting…" 에
 * 멈췄고, 하마터면 **없는 고장**을 보고할 뻔했다. 가짜가 실기와 다르면 이렇게 된다.
 *
 * `q` 는 ✋ 질문 단추를 여는 깃발이다 — 숨은 것과 열린 것을 **둘 다** 재려고 받는다.
 */
function hostConnect(code, token, { q = 0 } = {}) {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws?room=${code}&role=host&token=${token}`);
  ws.on('message', (raw) => {
    let m = null;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m && m.hello) {
      ws.send(JSON.stringify({ welcome: 1, plan: 'web', guide: 1, src_lang: 'ko', raw: 0, q }));
    }
  });
  return new Promise((ok, no) => {
    ws.once('open', () => ok(ws));
    ws.once('error', no);
    setTimeout(() => no(new Error('강사 접속 시간 초과')), 10000);
  });
}


/* ── 한 브라우저를 끝까지 돌린다 ──────────────────────────────────────────── */
async function runBrowser(name, type, code, host) {
  const br = await type.launch();
  const ctx = await br.newContext({ viewport: PHONE, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  const R = (item, state, note) => {
    row(item, name, state, note);
    /* 바로 찍는다 — 도중에 멈추면 **어디서** 멈췄는지 보여야 한다 */
    process.stdout.write(`  [${state}] ${item}${note ? ' — ' + note : ''}\n`);
  };
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const shown = async (sel) => (await has(sel)) && await page.locator(sel).first().isVisible();

  const url = `http://127.0.0.1:${SITE_PORT}/web/listener/index.html?room=${code}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  process.stdout.write("   … "+'① 들어가기 화면'+"\n");
  /* ① 들어가기 화면 */
  R('① 화면이 뜬다 (폰 폭 390)', (await has('#join-screen')) ? OK : NO, url);
  /*
   * `langs.json` 은 **비동기로** 온다. 처음 판은 바로 세어 1차 82개 · 2차 1개가 나왔다 —
   * 같은 코드가 돌 때마다 다른 답을 주는 시험은 시험이 아니다. 찰 때까지 기다리고 센다.
   */
  let langOpts = 0;
  for (let i = 0; i < 40; i += 1) {
    langOpts = await page.locator('#lang-select option').count();
    if (langOpts > 5) break;
    await page.waitForTimeout(250);
  }
  R('② 언어 고르기 — 목록이 찬다', langOpts > 5 ? OK : NO, `option ${langOpts}개`);

  /* 들어가기 */
  if (await has('#name-input')) await page.fill('#name-input', 'QA');
  if (await has('#lang-select') && langOpts > 1) await page.selectOption('#lang-select', { index: 1 }).catch(() => {});
  if (await has('#btn-join')) await page.click('#btn-join');
  await page.waitForTimeout(2500);
  const joined = await shown('#chat-screen');
  R('③ 들어가기 — 대화 화면으로 넘어간다', joined ? OK : NO, '');

  /* ④ 연결 상태 */
  const stTxt = (await page.locator('#status-text').textContent().catch(() => '') || '').trim();
  const dotCls = await page.locator('#status-dot').getAttribute('class').catch(() => '') || '';
  R('④ 연결 상태 띠', /연결|connect|준비|ready/i.test(stTxt) || dotCls ? OK : NO, `"${stTxt}" · ${dotCls}`);

  process.stdout.write("   … "+'⑤ 강사가'+"\n");
  /* ⑤ 강사가 한 줄 쏜다 → 받는가 */
  const line = `QA-${name}-${Date.now()}`;
  host.send(JSON.stringify({ text: line, lang: 'ko', final: true, seq: 1 }));
  let got = false;
  for (let i = 0; i < 40 && !got; i += 1) {
    await page.waitForTimeout(250);
    got = (await page.locator('#chat-list').textContent().catch(() => '') || '').includes(line);
  }
  R('⑤ 강사가 말한 줄이 손님 화면에 뜬다', got ? OK : NO, got ? '' : '40회(10초) 기다려도 안 옴');

  /* ⑥ 🔊 소리 켬/끔 — 누르면 글자가 바뀌고 상태가 따라간다 */
  if (await has('#btn-toggle-tts')) {
    const a = (await page.locator('#btn-toggle-tts').textContent() || '').trim();
    await page.click('#btn-toggle-tts'); await page.waitForTimeout(300);
    const b = (await page.locator('#btn-toggle-tts').textContent() || '').trim();
    R('⑥ 🔊 소리 켬/끔 — 누르면 바뀐다', a !== b ? OK : NO, `"${a}" → "${b}"`);
    const stopped = await page.evaluate(() => {
      try { return window.speechSynthesis ? window.speechSynthesis.speaking === false : null; } catch { return null; }
    });
    R('⑥-2 끔 = 읽던 것도 즉시 멈춤 (마스터 14:57)',
      stopped === true ? OK : (stopped === null ? DUNNO : NO),
      stopped === null ? 'speechSynthesis 가 이 브라우저에 없다' : 'speaking=false');
    await page.click('#btn-toggle-tts'); await page.waitForTimeout(200);   // 되돌려 놓는다
  } else R('⑥ 🔊 소리 켬/끔', NO, '단추가 없다');

  process.stdout.write("   … "+'⑦ 🗣 목소리 고르기'+"\n");
  /* ⑦ 🗣 목소리 고르기 */
  if (await has('#btn-open-voice-picker')) {
    await page.click('#btn-open-voice-picker'); await page.waitForTimeout(500);
    const open = await shown('#voice-picker-modal');
    const n = await page.locator('#voice-list-container *').count();
    R('⑦ 🗣 목소리 — 창이 열린다', open ? OK : NO, '');
    R('⑦-2 목소리 목록이 찬다', open ? (n > 0 ? OK : DUNNO) : NO,
      n > 0 ? `${n}칸` : '빈 목록 — 머리 없는 브라우저엔 음성이 없을 수 있다(폰에서 확인)');
    if (await has('#btn-close-voice-picker')) { await page.click('#btn-close-voice-picker'); await page.waitForTimeout(200); }
    R('⑦-3 창이 닫힌다', await shown('#voice-picker-modal') ? NO : OK, '');
  } else R('⑦ 🗣 목소리 고르기', NO, '단추가 없다');

  /* ⑧ 화면 꺼도 듣기 */
  if (await has('#btn-bg-audio')) {
    const before = await page.locator('#btn-bg-audio').getAttribute('class') || '';
    await page.click('#btn-bg-audio'); await page.waitForTimeout(300);
    const after = await page.locator('#btn-bg-audio').getAttribute('class') || '';
    R('⑧ 🔒 화면 꺼도 듣기 — 누르면 상태가 바뀐다', before !== after ? OK : NO, `${before} → ${after}`);
    await page.click('#btn-bg-audio'); await page.waitForTimeout(200);
  } else R('⑧ 화면 꺼도 듣기', NO, '단추가 없다');

  /* ⑨ 글자 크기 셋 */
  /*
   * 크기는 `<html>` 의 `font-s`/`font-l` 반으로 걸리고, CSS 가 겨누는 것은
   * **`.msg-bubble`** 이다(index.src.html 163~165). 처음 판은 `#chat-list` 를 재서
   * 셋 다 16px 로 나왔다 — **엉뚱한 것을 재고 "안 됨"이라 적을 뻔했다.**
   * 잰 것이 없으면(말풍선이 하나도 없으면) 「모름」이다. 빈손을 통과로 적지 않는다(D-189).
   */
  const bubbles = await page.locator('.msg-bubble').count();
  const sizes = [];
  for (const k of ['s', 'm', 'l']) {
    if (!(await has(`#btn-font-${k}`))) { sizes.push(`${k}:단추없음`); continue; }
    await page.click(`#btn-font-${k}`); await page.waitForTimeout(250);
    const px = await page.evaluate(() => {
      const el = document.querySelector('.msg-bubble');
      return el ? getComputedStyle(el).fontSize : '';
    });
    sizes.push(`${k}:${px || '말풍선없음'}`);
  }
  const vals = sizes.map((x) => x.split(':')[1]);
  R('⑨ 글자 크기 작게·보통·크게 — 셋이 실제로 다르다',
    bubbles === 0 ? DUNNO : (new Set(vals).size === 3 ? OK : NO),
    bubbles === 0 ? '말풍선이 없어 못 쟀다' : `${sizes.join(' ')} (말풍선 ${bubbles}개)`);
  await page.click('#btn-font-m').catch(() => {});

  process.stdout.write("   … "+'⑩ TXT 저장'+"\n");
  /* ⑩ TXT 저장 */
  if (await has('#btn-save')) {
    await page.click('#btn-save'); await page.waitForTimeout(500);
    const open = await shown('#save-picker-modal');
    R('⑩ ⬇ TXT — 고르는 창이 열린다', open ? OK : NO, '');
    let dl = null;
    if (open && await has('#btn-save-execute')) {
      const wait = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await page.click('#btn-save-execute');
      dl = await wait;
    }
    R('⑩-2 받기가 실제로 떨어진다', dl ? OK : NO, dl ? await dl.suggestedFilename() : '내려받기 이벤트 없음');
    if (await shown('#save-picker-modal') && await has('#btn-save-close')) await page.click('#btn-save-close');
  } else R('⑩ TXT 저장', NO, '단추가 없다');

  /* ⑪ ✋ 질문 — 강사가 열기 전엔 숨어 있어야 한다 */
  const askShown = await shown('#btn-ask');
  R('⑪ ✋ 질문 — 강사가 열기 전엔 숨어 있다', askShown ? NO : OK, askShown ? '처음부터 보인다' : '');

  /* ⑫ 음성 없음 띠 */
  /*
   * 화면이 스스로 남기는 판정 기록(`window.__rtVoiceCheck`, index.src.html 983)을 읽는다 —
   * "띠가 보이나"만 보면 **판정이 아예 안 돈 것**과 "음성이 있어서 안 띄운 것"을 못 가른다.
   */
  const vcheck = await page.evaluate(() => (window.__rtVoiceCheck || []).slice(-3));
  const vnShown = await shown('#voice-notice');
  const vnText = (await page.locator('#voice-notice').textContent().catch(() => '') || '').trim();
  const last = vcheck[vcheck.length - 1];
  R('⑫ 음성 있나 없나를 **판정은 한다**',
    vcheck.length ? OK : NO,
    vcheck.length ? JSON.stringify(vcheck.map((v) => `${v.lang}:${v.have}`)) : '판정 기록이 비어 있다 — 길이 안 돈다');
  if (last && (last.have === false || last.have === 'no' || last.have === 0)) {
    R('⑫-2 없으면 띠가 뜬다', vnShown ? OK : NO, `판정 have=${last.have}`);
    R('⑫-3 그 띠가 **깔는 방법**까지 알려 준다 (대표님 "언어팩 까는 것도 없다")',
      vnShown ? (/설치|install|다운|download|추가|add|설정|setting/i.test(vnText) ? OK : NO) : NO,
      vnShown ? `"${vnText.slice(0, 90)}"` : '띠가 안 떴다');
  } else {
    R('⑫-2 없으면 띠가 뜬다', DUNNO, `이 브라우저는 음성이 있다고 나왔다(have=${last && last.have}) — 폰에서 확인`);
    R('⑫-3 그 띠가 **깔는 방법**까지 알려 준다 (대표님 "언어팩 까는 것도 없다")', DUNNO, '띠가 뜰 상황이 아니라 못 쟀다');
  }

  /* ⑬ 쉬는 시간 띠 */
  /*
   * ★ 모양을 **지어내지 않는다.** `docs/samples/wire-messages.json` 이 못 박았다 —
   * **`type` 필드는 없다.** 종류는 들어 있는 키로 가른다. 쉬는 시간은
   * `{ kind: 'break', on: … }` 이고(index.src.html 1427), 끝은 `{ end: 1 }` 이다(1370).
   * 처음 판은 `{type:'break'}`·`{type:'end'}` 를 보내 놓고 **화면 탓을 할 뻔했다.**
   */
  host.send(JSON.stringify({ kind: 'break', on: true }));
  await page.waitForTimeout(1500);
  const brk = await shown('#break-band');
  R('⑬ 쉬는 시간 띠 — 강사가 켜면 뜬다', brk ? OK : NO, '');
  host.send(JSON.stringify({ kind: 'break', on: false }));
  await page.waitForTimeout(1200);
  /* 뜬 적이 없으면 "사라졌다"는 **빈 사례**다 — 통과로 적지 않는다 (D-189) */
  R('⑬-2 끄면 사라진다', brk ? (await shown('#break-band') ? NO : OK) : DUNNO,
    brk ? '' : '띠가 뜨지 않아 사라짐을 잴 수 없었다');

  process.stdout.write("   … "+'⑭ 다시 붙기'+"\n");
  /* ⑭ 다시 붙기 — 끊고 나서 저절로 돌아오는가 */
  /*
   * `window.ws` 는 밖에서 안 보인다. 그래서 **브라우저째로 망을 끊는다**(`setOffline`) —
   * 폰의 비행기 모드와 같은 일이고, 화면 속을 들여다보지 않으니 가짜가 끼지 않는다.
   */
  await ctx.setOffline(true);
  await page.waitForTimeout(3000);
  const offTxt = (await page.locator('#status-text').textContent().catch(() => '') || '').trim();
  await ctx.setOffline(false);
  await page.waitForTimeout(8000);
  const back = (await page.locator('#status-text').textContent().catch(() => '') || '').trim();
  const line2 = `QA2-${name}-${Date.now()}`;
  host.send(JSON.stringify({ text: line2, lang: 'ko', final: true, seq: 2 }));
  let got2 = false;
  for (let i = 0; i < 60 && !got2; i += 1) {
    await page.waitForTimeout(250);
    got2 = (await page.locator('#chat-list').textContent().catch(() => '') || '').includes(line2);
  }
  R('⑭ 망이 끊겼다 돌아오면 **저절로** 다시 붙고 줄이 다시 온다',
    got2 ? OK : NO, `끊겼을 때 "${offTxt}" → 돌아와서 "${back}"`);

  process.stdout.write("   … "+'⑮ 끝 화면'+"\n");
  /* ⑮ 끝 화면 */
  host.send(JSON.stringify({ end: 1 }));
  await page.waitForTimeout(2000);
  const endShown = await shown('#end-modal');
  R('⑮ 끝 화면 — 강사가 끝내면 뜬다', endShown ? OK : NO, '');
  if (endShown) {
    const sum = (await page.locator('#end-summary').textContent().catch(() => '') || '').trim();
    R('⑮-2 끝 화면에 줄 수·시간이 찬다', /\d/.test(sum) ? OK : NO, `"${sum.slice(0, 70)}"`);
    R('⑮-4 끝 화면에서도 저장할 수 있다', await has('#btn-save-end') ? OK : NO, '');
  }

  /* 콘솔 오류 */
  R('⑯ 화면이 도는 동안 자바스크립트 오류가 없다', errs.length === 0 ? OK : NO,
    errs.length ? errs.slice(0, 2).join(' | ') : '');

  await br.close();
}

/* ── 표 찍기 ──────────────────────────────────────────────────────────────── */
function printTable() {
  const names = [...new Set(rows.map((r) => r.browser))];
  const items = [...new Set(rows.map((r) => r.item))];
  const w = Math.max(...items.map((i) => [...i].length)) + 2;
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
  console.log('\n' + '='.repeat(w + names.length * 8));
  console.log(pad('항목', w) + names.map((n) => pad(n, 8)).join(''));
  console.log('-'.repeat(w + names.length * 8));
  for (const it of items) {
    const cells = names.map((n) => pad((rows.find((r) => r.item === it && r.browser === n) || {}).state || '-', 8));
    console.log(pad(it, w) + cells.join(''));
  }
  console.log('='.repeat(w + names.length * 8));
  console.log('\n── 근거 ──');
  for (const r of rows) if (r.note) console.log(`  [${r.browser}] ${r.item} — ${r.note}`);
  const bad = rows.filter((r) => r.state === NO);
  const dun = rows.filter((r) => r.state === DUNNO);
  console.log(`\n됨 ${rows.filter((r) => r.state === OK).length} · 안 됨 ${bad.length} · 모름 ${dun.length}`);
  if (bad.length) { console.log('\n★ 안 되는 것:'); for (const r of bad) console.log(`  · [${r.browser}] ${r.item}${r.note ? ' — ' + r.note : ''}`); }
  if (dun.length) { console.log('\n★ 모름 (대표님 실기로 남긴다):'); for (const r of dun) console.log(`  · [${r.browser}] ${r.item}${r.note ? ' — ' + r.note : ''}`); }
  return bad.length;
}

/* ── 본체 ─────────────────────────────────────────────────────────────────── */
(async () => {
  const SECRET = secret();
  if (!SECRET) { console.error('LICENSE_SECRET 이 없다 — relay/.dev.vars 에 적는다(저장소에 넣지 않는다).'); process.exit(2); }
  let relay = null; let site = null; let host = null;
  try {
    relay = await startRelay();
    site = await startSite();
    const list = [['chromium', chromium], ['webkit', webkit]].filter(([n]) => !only || n === only);
    for (const [n, t] of list) {
      /*
       * ★ **브라우저마다 방을 새로 연다.** 처음 판은 방 하나를 둘이 나눠 썼는데,
       * 앞 차례가 ⑮ 에서 `end:1` 로 **방을 닫아** 뒤 차례는 "Ended" 인 방에 들어갔다.
       * 그래서 webkit 이 통째로 붉었다 — 화면 탓이 아니라 틀 탓이다.
       */
      const { code, host_token } = await openRoom(SECRET);
      host = await hostConnect(code, host_token);
      console.log(`\n=== ${n} (폰 폭 ${PHONE.width}x${PHONE.height}) · 방 ${code} ===`);
      try { await runBrowser(n, t, code, host); }
      catch (e) { row('‼ 이 브라우저가 도중에 멈췄다', n, NO, String(e.message).slice(0, 120)); }
      try { host.close(); } catch { /* 이미 닫혔다 */ }
      host = null;
    }
    const bad = printTable();
    process.exitCode = bad ? 1 : 0;
  } finally {
    try { host && host.close(); } catch { /* 이미 닫혔다 */ }
    try { site && site.close(); } catch { /* 이미 닫혔다 */ }
    if (relay && !KEEP) { try { relay.kill('SIGTERM'); } catch { /* 이미 죽었다 */ } }
  }
})();
