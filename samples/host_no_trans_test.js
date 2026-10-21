// samples/host_no_trans_test.js — 자물쇠: **강사는 번역문을 보내지 않는다** (NOW B 5)
//
// 기준: 결정장부 43(강사 쪽 번역문 전송 금지) · 51(번역은 손님 폰이, 보조는 방) · RULE: P-14
// 설계: docs/design/room-translate.md
//
// 왜 자물쇠인가: 10-20 까지 강사 화면은 원고 번역문을 `script.trans` 에 실어 보냈다. 그 길을
// 10-21 에 닫았는데, **닫힌 채로 있는지는 사람의 기억에 걸 수 없다** — 한 줄만 되살리면
// 조용히 다시 흐른다. 그래서 **실제로 나간 메시지를 센다**(정적 검사는 거드는 것뿐이다).
//
// 보는 것:
//   ① 강사 화면이 보낸 **모든** 메시지에 `trans`·`translated`·`tr` 가 없다 (깊이 전부)
//   ② 그 대신 `script_src` 로 **원문만** 올린다 (방이 번역할 거리)
//   ③ 늦게 온 언어(ne) 손님이 들어와도 강사는 번역문을 보내지 않는다
//   ④ 되돌림 실증: 같은 검사기에 10-20 의 그 메시지를 넣으면 **잡는다**
//
// 돌리기: node samples/host_no_trans_test.js
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const { createMockRelay } = require('./mock_relay');

console.log('=== 자물쇠: 강사는 번역문을 보내지 않는다 (B 5 · 장부 43) ===');
let pass = 0;
const ok = (c, d) => { assert(c, d); pass++; console.log('  [PASS] ' + d); };

const relay = createMockRelay({ root: path.join(__dirname, '..') });
const BAD_KEYS = ['trans', 'translated', 'tr', 'translation', 'translations'];

/** 어디에 숨어 있어도 찾는다 — 칸 이름을 **깊이 전부** 훑는다(배열 안, 객체 안) */
function badKeysIn(obj, at = '') {
  const hits = [];
  const walk = (o, where) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    for (const [k, v] of Object.entries(o)) {
      if (BAD_KEYS.includes(k)) hits.push(`${where}.${k}`);
      walk(v, `${where}.${k}`);
    }
  };
  walk(obj, at);
  return hits;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = await relay.listen();
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
  let guestWs = null;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 980 } });
    const host = await ctx.newPage();
    host.on('dialog', async (d) => { await d.accept(); });
    await host.goto(`${base}/web/host/?relay=${encodeURIComponent(base)}&region=KR`);
    await host.fill('#tokenInput', 'valid_demo_token');
    await host.click('#btnVerifyToken');
    await host.waitForSelector('#step-prepare', { state: 'visible' });

    const txt = '안전 교육을 시작하겠습니다.\n\n안전모를 반드시 착용하십시오.\n\n비상구 위치를 확인하세요.';
    await host.evaluate((t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'l.txt', { type: 'text/plain' }));
      const i = document.getElementById('fileInput');
      i.files = dt.files;
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, txt);
    await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 3);

    /* 언어 둘을 고르고 **사전 번역을 실제로 돌린다** — 번역문이 화면에 생긴 뒤에도
       보내지 않는지가 이 시험의 핵이다(번역문이 없으면 "안 보냈다"는 공짜 초록이다). */
    await host.evaluate((want) => {
      document.querySelectorAll('#langChips input[type=checkbox]').forEach((cb) => {
        const on = want.includes(cb.value);
        if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
    }, ['en', 'zh-CN']);
    await host.click('#btnPreTranslate');
    await host.waitForSelector('#readyArea', { state: 'visible', timeout: 20000 });
    /* 검수 칸은 `EN: …` 꼴로 그려진다(`renderParagraphs`). 언어 둘을 골랐으니 문단마다 둘이다.
       목 번역이 `[en] 원문` 꼴이라 **글자만 보면 한국어**다 — 칸 이름으로 센다. */
    const trCells = await host.$$eval('.para-item strong', (els) => els.map((e) => e.textContent.trim()));
    ok(trCells.filter((t) => /^(EN|ZH-CN):$/.test(t)).length >= 2,
       `강사 화면에 **검수 번역문이 생겼다** (${trCells.join(' ') || '없음'}) — 이제부터 "안 보낸다"가 공짜가 아니다`);

    await host.click('#btnStartLecture');
    await host.waitForSelector('#step-live', { state: 'visible', timeout: 8000 });
    await host.waitForFunction(() => /연결/.test(document.getElementById('liveStatus').textContent), null, { timeout: 8000 });
    const code = (await host.textContent('#roomCode')).trim();

    /* 문단 둘을 넘긴다 */
    await host.click('#btnNext');
    await sleep(200);
    await host.click('#btnNext');
    await sleep(300);

    /* ③ 늦게 온 언어 — 고르지 않은 ne 손님이 들어온다 */
    const room = [...relay.rooms.values()].find((r) => r.code === code);
    guestWs = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${code}&role=listener`);
    await new Promise((res, rej) => { guestWs.on('open', res); guestWs.on('error', rej); });
    guestWs.send(JSON.stringify({ hello: 1, room: code, lang: 'ne', name: 'Bikash' }));
    await sleep(1200);

    const sent = (room && room.received) || [];
    ok(sent.length >= 3, `강사가 보낸 메시지를 잡았다 (${sent.length}개: ${sent.map((m) => m.kind || (m.welcome ? 'welcome' : m.seq ? 'seq' + m.seq : '?')).join(',')})`);

    const hits = sent.flatMap((m, i) => badKeysIn(m, `#${i}(${m.kind || 'msg'})`));
    ok(hits.length === 0, `보낸 메시지에 번역문 칸이 **하나도 없다** (찾은 것: ${hits.join(', ') || '없음'})`);

    /* ② 대신 원문을 올렸나 */
    const src = sent.filter((m) => m.kind === 'script_src');
    ok(src.length >= 1, `원고를 \`script_src\` 로 올린다 (${src.length}개)`);
    const paras = src.flatMap((m) => m.paras || []);
    ok(paras.length === 3 && paras.every((p) => p.para >= 1 && typeof p.src === 'string' && p.src.length),
       `문단 셋이 원문으로 올라갔다 (${paras.map((p) => p.para).join(',')})`);
    ok(paras.every((p) => badKeysIn(p).length === 0), '올린 문단마다 번역문 칸이 없다');

    const scripts = sent.filter((m) => m.kind === 'script');
    ok(scripts.length >= 2, `「다음」으로 보낸 문단이 있다 (${scripts.map((m) => m.para).join(',')})`);
    ok(scripts.every((m) => typeof m.src === 'string' && m.srcLang),
       '그 문단은 **원문 + 원문 언어**만 들고 간다 (번역은 방이 한다)');

    /* ⑤ 번역이 안 되면 **강사 화면에 뜬다** (NOW B 5). 방이 보내는 `tr_fail` 을 그대로 넣어
       본다 — 화면에 안 뜨면 강사는 번역이 되고 있다고 믿는다(§20). */
    const hostSock = [...room.hosts][0];
    try { hostSock.send(JSON.stringify({ kind: 'tr_fail', lang: 'ne', why: 'http_502', para: 1 })); } catch (_) {}
    await sleep(400);
    const noteShown = await host.evaluate(() => {
      const el = document.getElementById('trFailNote');
      return el ? { vis: el.style.display !== 'none', text: el.textContent } : null;
    });
    ok(noteShown && noteShown.vis && /ne/.test(noteShown.text) && /502/.test(noteShown.text),
       `번역 실패가 강사 화면에 **언어와 까닭으로** 뜬다 ("${noteShown && noteShown.text}")`);

    /* 같은 언어가 또 실패해도 **한 줄로 모은다** — 줄마다 띠가 쌓이면 못 읽는다 */
    try { hostSock.send(JSON.stringify({ kind: 'tr_fail', lang: 'ne', why: 'shape', para: 2 })); } catch (_) {}
    await sleep(300);
    const again = await host.evaluate(() => document.getElementById('trFailNote').textContent);
    ok((again.match(/ne/g) || []).length === 1, `같은 언어는 한 줄로 모은다 ("${again}")`);

    /* ④ 되돌림 실증 — 10-20 에 실제로 나가던 그 메시지를 같은 검사기에 넣는다.
       잡지 않으면 위 초록은 "검사기가 아무것도 안 본다"는 뜻이다(D-09). */
    const old2020 = { kind: 'script', para: 1, total: 3, src: '안전모를 쓰세요', srcLang: 'ko',
                      trans: { en: 'Wear your helmet', 'zh-CN': '请戴安全帽' }, at: Date.now() };
    const found = badKeysIn(old2020, '#old');
    ok(found.length === 1 && found[0].endsWith('.trans'),
       `10-20 의 그 메시지를 넣으면 **잡는다** (${found.join(', ')}) — 되돌림 실증`);
    const nested = badKeysIn({ kind: 'script_src', paras: [{ para: 1, src: 'x', tr: { en: 'y' } }] }, '#n');
    ok(nested.length === 1, `문단 **안에 숨어 있어도** 잡는다 (${nested.join(', ')}) — 되돌림 실증 ②`);

    console.log(`\n[OK] ${pass}개 확인 — 강사는 번역문을 보내지 않는다`);
    await ctx.close();
  } finally {
    try { if (guestWs) guestWs.close(); } catch (_) {}
    for (const r of relay.rooms.values()) {
      for (const l of [...r.listeners.keys()]) { try { l.close(1000, 'test_end'); } catch (_) {} }
      for (const h of [...r.hosts]) { try { h.close(1000, 'test_end'); } catch (_) {} }
    }
    await browser.close();
    relay.close();
  }
  process.exit(0);
})().catch((e) => { console.error('[FAIL] ' + e.message); process.exit(1); });
