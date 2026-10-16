#!/usr/bin/env node
/* scripts/prod-license-e2e.mjs — 이용권 **끝에서 끝** 실측 (마스터 2026-10-16 13:40 ①)
 *
 * 돌리는 법:
 *   RELAY_URL=https://raytok-relay.raytok.workers.dev node scripts/prod-license-e2e.mjs
 *   (주소를 안 주면 로컬 127.0.0.1:8787 — wrangler dev 가 떠 있어야 한다)
 *
 * ★ **비밀값이 필요 없다.** 시험 키 0 의 씨앗(`testSeed()`)은 공개값이고, 토큰은 서버가
 *   `/license/issue` 에서 자기 비밀값으로 만들어 준다. 그래서 운영 비밀값을 이 세션이
 *   들고 있지 않아도 돈다 — 그게 이 길을 고른 까닭이다.
 *   (`scripts/e2e-room.mjs` 는 토큰을 **로컬에서** 만들기 때문에 운영 LICENSE_SECRET 이
 *    있어야 하고, 그것은 이 세션에 없고 있어서도 안 된다.)
 *
 * 하는 일 — 읽기와 발급뿐이고 **지우거나 배포하지 않는다**:
 *   ① 코드 발급(로컬, 키 0 시험 씨앗, 0x01 호스트, 1일)
 *   ② POST /license/redeem  — 코드를 기기에 묶는다
 *   ③ POST /license/issue   — 기기로 토큰을 받는다 (0x01 실렸나)
 *   ④ POST /room {kind:'guide'} — 방이 열리나 (200 + 코드)
 *   ⑤ ws /ws?room=&role=listener — 청취자가 붙어 호스트 글을 받나
 *   ⑥ POST /translate       — 0x10 없는 토큰은 403 why=no_package
 *   ⑦ POST /translate engine:'pro' — 0x20 없으면 403 (B 10 이 배포됐는지 바로 보인다)
 *   ⑧ 지명된 청취자 마이크 질문이 전원에게 (B 7 이 배포됐는지 바로 보인다)
 *
 * 토큰·코드는 화면에 **가려서** 찍는다(앞 6글자만). 저장소에 남기지 않는다.
 */
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { mintCode, privateKeyFromSeed, testSeed, FLAG, TEST_KEY_ID } from '../relay/tools/mint-code.mjs';

const BASE = (process.env.RELAY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const J = { 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (s) => (typeof s === 'string' && s.length > 8 ? s.slice(0, 6) + '…(' + s.length + '글자)' : String(s));

const rows = [];
let failed = 0;
function step(n, what, okFlag, detail) {
  rows.push({ n, what, ok: okFlag, detail });
  if (!okFlag) failed++;
  console.log(`[${okFlag ? 'PASS' : 'FAIL'}] ${n} ${what}${detail ? ' — ' + detail : ''}`);
}
async function body(res) {
  try { return await res.json(); } catch (_) { return null; }
}
function openWs(url, tag) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.got = [];
    ws.on('message', (d) => { try { ws.got.push(JSON.parse(String(d))); } catch (_) { ws.got.push({ _raw: String(d) }); } });
    ws.on('open', () => resolve(ws));
    ws.on('error', (e) => reject(new Error(`${tag} ws: ${e.message}`)));
    ws.on('unexpected-response', (_q, r) => reject(new Error(`${tag} ws ${r.statusCode}`)));
  });
}
async function waitFor(pred, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(150); }
  return pred();
}

(async () => {
  console.log(`=== 이용권 끝에서 끝 실측 — ${BASE} ===\n`);
  const device = 'e2e_' + Math.random().toString(36).slice(2, 10);

  // ① 코드 발급 — 키 0 시험 씨앗(공개값), 0x01 호스트, 1일
  // exp 와 days 는 다른 칸이다: exp = 코드를 **쓸 수 있는 기한**(절대 시각),
  // days = 등록하면 주는 **이용 일수**. 둘을 섞으면 "만료는 uint32 초" 로 터진다.
  const minted = mintCode({
    keyId: TEST_KEY_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    days: 1,
    flags: FLAG.host,
    cust: 'E2E',
    privateKey: privateKeyFromSeed(testSeed())
  });
  step(1, '코드 발급(키 0 시험 씨앗 · 0x01 · 1일)', !!minted.code, `code=${mask(minted.code)}`);

  // ② 코드를 기기에 묶는다
  const rRedeem = await fetch(`${BASE}/license/redeem`, {
    method: 'POST', headers: J, body: JSON.stringify({ code: minted.code, deviceId: device })
  });
  const dRedeem = await body(rRedeem);
  step(2, 'POST /license/redeem', rRedeem.status === 200 && !!(dRedeem && dRedeem.ok !== false),
       `${rRedeem.status} ${JSON.stringify(dRedeem && { ok: dRedeem.ok, devices: dRedeem.devices, flags: dRedeem.flags })}`);

  // ③ 기기로 토큰을 받는다 — 0x01 이 실려야 한다
  const rIssue = await fetch(`${BASE}/license/issue`, {
    method: 'POST', headers: J, body: JSON.stringify({ device })
  });
  const dIssue = await body(rIssue);
  const token = dIssue && dIssue.token;
  let flags = null;
  if (token) {
    try { flags = Number(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).flags || 0); } catch (_) {}
  }
  step(3, 'POST /license/issue (토큰에 0x01)', rIssue.status === 200 && !!token && (flags & 0x01) === 0x01,
       `${rIssue.status} token=${mask(token)} flags=0x${(flags || 0).toString(16)}`);
  if (!token) { report(); return; }

  const AUTH = { ...J, Authorization: `Bearer ${token}` };

  // ④ 방 열기
  const rRoom = await fetch(`${BASE}/room`, { method: 'POST', headers: AUTH, body: JSON.stringify({ kind: 'guide' }) });
  const dRoom = await body(rRoom);
  const code = dRoom && dRoom.code;
  step(4, 'POST /room {kind:guide}', rRoom.status === 200 && !!code, `${rRoom.status} room=${code || '-'}`);

  let host = null, lis1 = null, lis2 = null;
  try {
    if (code) {
      // ⑤ 청취자가 붙어 호스트 글을 받나
      host = await openWs(`${WS_BASE}/ws?room=${code}&role=host&token=${encodeURIComponent(dRoom.host_token)}`, 'host');
      lis1 = await openWs(`${WS_BASE}/ws?room=${code}&role=listener`, 'L1');
      lis2 = await openWs(`${WS_BASE}/ws?room=${code}&role=listener`, 'L2');
      lis1.send(JSON.stringify({ hello: 1, lang: 'en' }));
      lis2.send(JSON.stringify({ hello: 1, lang: 'vi' }));
      await sleep(400);

      const line = `실측 한 줄 ${Date.now()}`;
      host.send(JSON.stringify({ seq: 1, src_lang: 'ko', text: line, broadcast: true }));
      const bothGot = await waitFor(() => [lis1, lis2].every((L) => L.got.some((m) => m.text === line)));
      step(5, 'ws 청취자 둘이 호스트 글을 받는다', bothGot,
           bothGot ? '둘 다 받음(번역 칸 없음 확인: ' + ([lis1, lis2].every((L) => (L.got.find((m) => m.text === line) || {}).tr === undefined) ? 'O' : 'X') + ')'
                   : `L1=${lis1.got.length}건 L2=${lis2.got.length}건`);

      // ⑧ B 7 — 지명된 청취자 마이크 질문이 **전원에게** (배포됐는지 바로 보인다)
      lis1.send(JSON.stringify({ kind: 'ask', name: 'E2E', lang: 'en', text: '' }));
      const askSeen = await waitFor(() => host.got.some((m) => m.kind === 'ask'));
      const askMsg = host.got.find((m) => m.kind === 'ask');
      if (askSeen && askMsg) {
        host.send(JSON.stringify({ kind: 'grant', id: askMsg.id }));
        await waitFor(() => lis1.got.some((m) => m.kind === 'grant' && m.id === askMsg.id));
        const spoken = `비상구는 어디입니까 ${Date.now()}`;
        lis1.send(JSON.stringify({ kind: 'question', id: askMsg.id, src: spoken, srcLang: 'en' }));
        const everywhere = await waitFor(() =>
          host.got.some((m) => m.kind === 'question' && m.src === spoken) &&
          lis2.got.some((m) => m.kind === 'question' && m.src === spoken));
        const atHost = host.got.find((m) => m.kind === 'question' && m.src === spoken);
        step(8, 'B 7 마이크 질문 → 강사 + 다른 청취자 (배포 확인)', everywhere && atHost && atHost.trans === undefined,
             everywhere ? '전원에게 · 번역 칸 없음(P-14)' : '한쪽에만 닿았다 = B 7 이 아직 배포 안 됨');
        host.send(JSON.stringify({ kind: 'revoke', id: askMsg.id }));
      } else {
        step(8, 'B 7 마이크 질문 (배포 확인)', false, '손들기가 강사에게 닿지 않았다');
      }
      host.send(JSON.stringify({ end: 1 }));
      await sleep(300);
    } else {
      step(5, 'ws 청취자 둘이 호스트 글을 받는다', false, '방이 안 열려 건너뜀');
      step(8, 'B 7 마이크 질문 (배포 확인)', false, '방이 안 열려 건너뜀');
    }
  } finally {
    for (const w of [host, lis1, lis2]) { try { w && w.close(); } catch (_) {} }
  }

  // ⑥ /translate — 0x10 없는 토큰은 403 no_package
  const rTr = await fetch(`${BASE}/translate`, {
    method: 'POST', headers: AUTH, body: JSON.stringify({ q: ['안전모를 쓰세요'], source: 'ko', target: 'en' })
  });
  const dTr = await body(rTr);
  step(6, 'POST /translate (0x10 없음 → 403 no_package)', rTr.status === 403 && dTr && dTr.why === 'no_package',
       `${rTr.status} why=${dTr && dTr.why}`);

  // ⑦ engine:'pro' — 0x20 없으면 403. B 10 이 배포됐으면 패키지 문이 먼저라 no_package 다.
  const rPro = await fetch(`${BASE}/translate`, {
    method: 'POST', headers: AUTH, body: JSON.stringify({ q: ['x'], source: 'ko', target: 'en', engine: 'pro' })
  });
  const dPro = await body(rPro);
  step(7, "POST /translate engine:'pro' (0x20 없음 → 403)", rPro.status === 403,
       `${rPro.status} why=${dPro && dPro.why} (문 순서상 0x10 도 없으니 no_package 가 맞다)`);

  report();

  function report() {
    console.log('\n| # | 단계 | 결과 | 비고 |');
    console.log('|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.n} | ${r.what} | ${r.ok ? '✅' : '❌'} | ${r.detail || ''} |`);
    console.log(`\n=== ${rows.filter((r) => r.ok).length}/${rows.length} 통과 (${BASE}) ===`);
    if (failed) process.exitCode = 1;
  }
})().catch((e) => { console.error('\n[FAIL] 터졌다:', e.message); process.exitCode = 1; });
