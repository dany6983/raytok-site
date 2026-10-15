#!/usr/bin/env node
/**
 * scripts/e2e-room.mjs — 릴레이 끝에서 끝 시험 틀 (MASTER 2026-10-14 11:10 ①)
 *
 *   발급(mint) → POST /room 열기 → /ws?room= 청취자 둘 접속 → 호스트가 broadcast 원문 한 줄
 *   → 둘 다 받는지 → /translate 에 0x10 없는 토큰이면 403(no_package) 확인.
 *
 * 돌리기 (저장소 뿌리에서):
 *   npm run e2e:room                 # 8787 에 wrangler dev 가 없으면 직접 띄우고 끝나면 내린다
 *   RELAY_URL=http://127.0.0.1:8787 node scripts/e2e-room.mjs   # 이미 떠 있는 릴레이에 붙는다
 *
 * 비밀은 `relay/.dev.vars` 에서만 읽는다(LICENSE_SECRET). 값은 어디에도 찍지 않는다.
 * 운영 주소로는 돌리지 않는다 — 이 틀은 wrangler dev 기준이다(배포는 대표님).
 *
 * 되돌려서 실패 확인(D-09):
 *   · relay/src/index.js `/translate` 의 허용 플래그에 0x02 를 더하면 [6] 이 붉다.
 *   · relay/src/room.js 호스트 → 청취자 전달 for 문을 지우면 [5] 가 붉다.
 *   · relay/src/room.js 의 inbound `question` 가지를 지우면 [5-3] 이 붉다 (B 7).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { mintLicenseToken } from '../relay/tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELAY_DIR = path.resolve(__dirname, '../relay');
const BASE = (process.env.RELAY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const J = { 'Content-Type': 'application/json' };

if (/raytok\.kr|workers\.dev/.test(BASE)) {
  console.error('이 틀은 wrangler dev 전용이다 — 운영 주소로는 돌리지 않는다:', BASE);
  process.exit(2);
}

// ── 비밀: .dev.vars 만, 찍지 않는다 ──────────────────────────────────────────
function readDevVars() {
  const p = path.join(RELAY_DIR, '.dev.vars');
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}
const devVars = readDevVars();
const SECRET = process.env.LICENSE_SECRET || devVars.LICENSE_SECRET;
if (!SECRET) {
  console.error('LICENSE_SECRET 이 없다 — relay/.dev.vars 에 적는다(저장소에 넣지 않는다).');
  process.exit(2);
}

// ── wrangler dev: 없으면 띄우고, 띄웠으면 끝에 내린다 ─────────────────────────
let devProc = null;
async function relayUp(ms = 1500) {
  try {
    const r = await fetch(`${BASE}/room`, { method: 'POST', headers: J, body: '{}', signal: AbortSignal.timeout(ms) });
    return r.status === 401 || r.ok;
  } catch (_) { return false; }
}
async function ensureRelay() {
  if (await relayUp()) { console.log(`[relay] 이미 떠 있다: ${BASE}`); return; }
  if (process.env.RELAY_URL) throw new Error(`RELAY_URL 에 릴레이가 없다: ${BASE}`);
  const port = new URL(BASE).port || '8787';
  console.log(`[relay] wrangler dev 를 띄운다 (port ${port})…`);
  const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  devProc = spawn(bin, ['wrangler', 'dev', '--port', port, '--local'], {
    cwd: RELAY_DIR, stdio: ['ignore', 'ignore', 'ignore'], detached: process.platform !== 'win32'
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (await relayUp()) { console.log(`[relay] 준비 (${Date.now() - t0}ms)`); return; }
    await sleep(500);
  }
  throw new Error('wrangler dev 가 60초 안에 뜨지 않았다');
}
function stopRelay() {
  if (!devProc) return;
  try {
    if (process.platform === 'win32') devProc.kill();
    else process.kill(-devProc.pid, 'SIGTERM');
  } catch (_) {}
  devProc = null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 청취자: 접속해서 받은 글을 모은다 ──────────────────────────────────────────
function openListener(code, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?room=${code}&role=listener`);
    const got = [];
    ws.on('message', (d) => { try { got.push(JSON.parse(String(d))); } catch (_) { got.push({ _raw: String(d) }); } });
    ws.on('open', () => resolve({ name, ws, got }));
    ws.on('error', reject);
  });
}
function openHost(code, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws?room=${code}&role=host&token=${encodeURIComponent(token)}`);
    // 강사도 받은 글을 모은다 — B 7 질문이 강사에게 닿는지 보려면 필요하다
    ws.got = [];
    ws.on('message', (d) => { try { ws.got.push(JSON.parse(String(d))); } catch (_) { ws.got.push({ _raw: String(d) }); } });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`host ws ${res.statusCode}`)));
  });
}
async function waitFor(pred, ms = 5000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(step); }
  return pred();
}

let n = 0;
const pass = (msg) => { n++; console.log(`[PASS] ${n} ${msg}`); };

async function main() {
  console.log(`=== e2e-room: mint → /room → 청취자 2 → broadcast 원문 → /translate 403 (${BASE}) ===`);
  await ensureRelay();
  const tag = Date.now().toString(36);

  // [1] 발급 — 가이드 이용권(0x01) 토큰. 0x10 은 일부러 없다.
  const hostLic = mintLicenseToken({ sub: `e2e-host-${tag}`, days: 1, flags: 0x01, secret: SECRET });
  assert.ok(hostLic.split('.').length === 2, '토큰 모양 payload.sig');
  pass('발급: 가이드 토큰(0x01, 0x10 없음)');

  // [2] /room 열기
  const rr = await fetch(`${BASE}/room`, { method: 'POST', headers: { ...J, Authorization: `Bearer ${hostLic}` }, body: JSON.stringify({ kind: 'guide' }) });
  assert.equal(rr.status, 200, `/room → 200, got ${rr.status}`);
  const { code, host_token } = await rr.json();
  assert.match(code, /^[0-9A-Z]{6}$/, '방 코드 6자');
  assert.ok(host_token, 'host_token');
  pass(`/room 열림: ${code}`);

  // [3] 청취자 둘 접속
  const [L1, L2] = await Promise.all([openListener(code, 'L1'), openListener(code, 'L2')]);
  L1.ws.send(JSON.stringify({ hello: 1, lang: 'en' }));
  L2.ws.send(JSON.stringify({ hello: 1, lang: 'vi' }));
  pass('청취자 둘 접속 (en, vi)');

  // [4] 호스트 접속
  const host = await openHost(code, host_token);
  pass('호스트 접속 (host_token)');

  // [5] broadcast 원문 한 줄 → 둘 다 받는가 (정본 line.broadcast — 번역 없이 원문만)
  const text = `현장 방송 안내입니다 ${tag}`;
  host.send(JSON.stringify({ seq: 1, src_lang: 'ko', text, broadcast: true }));
  const both = await waitFor(() => [L1, L2].every((L) => L.got.some((m) => m.text === text && m.broadcast === true)));
  assert.ok(both, `둘 다 받아야 한다 — L1:${JSON.stringify(L1.got)} L2:${JSON.stringify(L2.got)}`);
  for (const L of [L1, L2]) {
    const m = L.got.find((x) => x.text === text);
    assert.equal(m.tr, undefined, `${L.name}: 방송 줄에 번역 칸이 없어야 한다`);
  }
  pass('broadcast 원문 한 줄 → 청취자 둘 다 받음(tr 없음)');

  // [5-2] B 9 웹 호스트가 **말한** 줄 — 브라우저 인식이 내는 것과 같은 모양 한 줄
  //       (web/host 의 sendSpokenLine 이 만드는 것: seq 10000+, 원문+언어, broadcast, 번역 칸 없음)
  //       화면 시험은 samples/web_host_mic_test.js 가 본다. 여기서는 **끝에서 끝**으로 닿는지만.
  const spoken = `안전모를 반드시 착용하십시오 ${tag}`;
  host.send(JSON.stringify({ seq: 10001, src_lang: 'ko', text: spoken, broadcast: true }));
  const bothSpoken = await waitFor(() => [L1, L2].every((L) => L.got.some((m) => m.text === spoken && m.broadcast === true)));
  assert.ok(bothSpoken, `웹 호스트가 말한 줄이 둘 다에 닿아야 한다 — L1:${JSON.stringify(L1.got)} L2:${JSON.stringify(L2.got)}`);
  for (const L of [L1, L2]) {
    const m = L.got.find((x) => x.text === spoken);
    assert.equal(m.tr, undefined, `${L.name}: 말한 줄에도 번역 칸이 없어야 한다 (P-14)`);
    assert.equal(m.src_lang, 'ko', `${L.name}: 말한 줄에 언어가 실려야 한다`);
  }
  pass('B 9 웹 호스트가 말한 줄 → 청취자 둘 다 받음 (원문+언어만, P-14)');

  // [5-3] B 7 — 지명된 청취자가 **마이크로 말한 질문**이 전원에게 닿는가.
  //       화면 쪽은 samples/listener_mic_voice_test.js · web_host_mic_test.js 가 본다.
  //       여기서는 와이어를 끝에서 끝으로: 손들기 → 지명 → 말하기 → 강사 + **다른 청취자**.
  L1.ws.send(JSON.stringify({ kind: 'ask', name: 'L1', lang: 'en', text: '' }));
  const askSeen = await waitFor(() => host.got && host.got.some((m) => m.kind === 'ask'));
  assert.ok(askSeen, `손들기가 강사에게 닿아야 한다 — host:${JSON.stringify(host.got)}`);
  const askMsg = host.got.find((m) => m.kind === 'ask');
  pass('B 7 손들기 → 강사에게 닿음');

  host.send(JSON.stringify({ kind: 'grant', id: askMsg.id }));
  await waitFor(() => L1.got.some((m) => m.kind === 'grant' && m.id === askMsg.id));

  const spokenQ = `비상구는 어디입니까 ${tag}`;
  L1.ws.send(JSON.stringify({ kind: 'question', id: askMsg.id, src: spokenQ, srcLang: 'en' }));
  const qEverywhere = await waitFor(() =>
    host.got.some((m) => m.kind === 'question' && m.src === spokenQ) &&
    L2.got.some((m) => m.kind === 'question' && m.src === spokenQ));
  assert.ok(qEverywhere,
    `말한 질문이 강사와 **다른 청취자** 둘 다에 닿아야 한다 — host:${JSON.stringify(host.got)} L2:${JSON.stringify(L2.got)}`);
  const qAtHost = host.got.find((m) => m.kind === 'question' && m.src === spokenQ);
  assert.equal(qAtHost.trans, undefined, '말한 질문에 번역 칸이 없어야 한다 (P-14)');
  assert.equal(qAtHost.srcLang, 'en', '말한 질문에 언어가 실려야 한다');
  pass('B 7 말한 질문 → 강사 + 다른 청취자 둘 다 (원문+언어만, P-14)');

  // 지명 안 된 청취자는 같은 id 로도 말할 수 없다 (P-17)
  const spoof = `내가 아닌데 말한다 ${tag}`;
  L2.ws.send(JSON.stringify({ kind: 'question', id: askMsg.id, src: spoof }));
  await sleep(300);
  assert.ok(!host.got.some((m) => m.kind === 'question' && m.src === spoof),
    '지명 안 된 청취자의 질문은 닿지 않아야 한다 (P-17)');
  assert.ok(L2.got.some((m) => m.kind === 'ask_error' && m.why === 'not_granted'),
    `막힌 쪽에 까닭이 돌아가야 한다 — L2:${JSON.stringify(L2.got)}`);
  pass('B 7 지명 안 된 청취자가 같은 id 로 말하면 막힌다 (P-17 not_granted)');

  host.send(JSON.stringify({ kind: 'revoke', id: askMsg.id }));
  await sleep(200);

  // [6] /translate — 0x10 없는 토큰은 403 no_package (B-3). 호스트 토큰(0x01)도 마찬가지.
  const tr = await fetch(`${BASE}/translate`, {
    method: 'POST', headers: { ...J, Authorization: `Bearer ${hostLic}` },
    body: JSON.stringify({ q: [text], source: 'ko', target: 'en' })
  });
  let trBody = null; try { trBody = await tr.json(); } catch (_) {}
  assert.equal(tr.status, 403, `/translate 0x10 없음 → 403, got ${tr.status} ${JSON.stringify(trBody)}`);
  assert.equal(trBody && trBody.why, 'no_package');
  pass('/translate 0x10 없는 토큰 → 403 no_package');

  // [6-2] B 10 — 프로(LLM). 0x20 없는 토큰이 engine:'pro' 를 쓰면 403 no_pro.
  //        끝에서 끝에서는 **문만** 본다 — LLM 을 실제로 부르는 길은 samples/translate_pro_test.js
  //        가 가짜 상류로 본다(여기서 진짜 키를 쓰면 돈이 나간다).
  //        ⚠ 문 둘은 **순서가 있다**: 패키지(0x10) 문이 먼저다. 0x01 뿐인 토큰은 거기서
  //        막혀 no_package 가 나온다 — 그래서 프로 문을 보려면 **0x10 은 있고 0x20 은 없는**
  //        토큰이어야 한다. (10-16: 이 단언이 0x01 토큰을 쓰고 있었다. 이 스크립트를
  //        돌려 본 적이 없어서 몰랐다 — relay/.dev.vars 가 없으면 시작도 못 한다.)
  const pkgLic = mintLicenseToken({ sub: `e2e-pkg-${tag}`, days: 1, flags: 0x10, secret: SECRET });
  const proNo = await fetch(`${BASE}/translate`, {
    method: 'POST', headers: { ...J, Authorization: `Bearer ${pkgLic}` },
    body: JSON.stringify({ q: [text], source: 'ko', target: 'en', engine: 'pro' })
  });
  let proBody = null; try { proBody = await proNo.json(); } catch (_) {}
  assert.equal(proNo.status, 403, `/translate engine:pro, 0x20 없음 → 403, got ${proNo.status} ${JSON.stringify(proBody)}`);
  assert.equal(proBody && proBody.why, 'no_pro', `why=no_pro, got ${proBody && proBody.why}`);
  pass('/translate engine:pro — 0x10 은 있고 0x20 없는 토큰 → 403 no_pro');

  //        0x01 뿐인 토큰은 프로를 청해도 **패키지 문**에서 먼저 막힌다 (문 순서가 사실이다)
  const proNoPkg = await fetch(`${BASE}/translate`, {
    method: 'POST', headers: { ...J, Authorization: `Bearer ${hostLic}` },
    body: JSON.stringify({ q: [text], source: 'ko', target: 'en', engine: 'pro' })
  });
  let proNoPkgBody = null; try { proNoPkgBody = await proNoPkg.json(); } catch (_) {}
  assert.equal(proNoPkg.status, 403);
  assert.equal(proNoPkgBody && proNoPkgBody.why, 'no_package',
    `0x10 없는 토큰은 프로를 청해도 패키지 문에서 먼저 막힌다, got ${proNoPkgBody && proNoPkgBody.why}`);
  pass('/translate engine:pro — 0x10 도 없으면 no_package 가 먼저 (문 순서)');

  // [7] 토큰 없이 /translate → 401 (403 보다 먼저)
  const tr0 = await fetch(`${BASE}/translate`, { method: 'POST', headers: J, body: JSON.stringify({ q: ['x'], target: 'en' }) });
  assert.equal(tr0.status, 401);
  pass('/translate 토큰 없음 → 401');

  host.send(JSON.stringify({ end: 1 }));
  await sleep(200);
  for (const w of [host, L1.ws, L2.ws]) { try { w.close(); } catch (_) {} }
  console.log(`\n=== e2e-room: ${n}/${n} PASS ===`);
}

main()
  .then(() => { stopRelay(); process.exit(0); })
  .catch((e) => { console.error('\n*** e2e-room FAILED ***', e && e.message ? e.message : e); stopRelay(); process.exit(1); });
