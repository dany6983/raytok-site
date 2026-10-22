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
 *   ⑨ **프로 이용권으로 engine:'pro'** — 200 이 오고, `tier` 가 **pro 인지 basic 인지**
 *      보여 준다. 그 한 줄로 셋이 갈린다 (마스터 10-22 13:00):
 *        tier=pro                     → 프로가 **살아 있다**(키·공급자 다 있다)
 *        tier=basic why=pro_no_key     → 배포는 됐고 **키만 없다** (`wrangler secret put LLM_API_KEY`)
 *        tier=basic why=pro_no_provider→ 이름이 표에 없다 (`LLM_PROVIDER` 를 고친다)
 *      **돈**: 글자 몇 개짜리 한 줄이라 프로가 살아 있어도 비용은 사실상 0 이다.
 *
 * 토큰·코드는 화면에 **가려서** 찍는다(앞 6글자만). 저장소에 남기지 않는다.
 */
import assert from 'node:assert/strict';
import { mintCode, privateKeyFromSeed, testSeed, FLAG, TEST_KEY_ID } from '../relay/tools/mint-code.mjs';

/* WebSocket 은 Node 22 의 **내장**을 먼저 쓴다 — `ws` 를 위에서 import 하면 대표님 PC 에서
   `npm ci` 가 **먼저** 필요해지고, 그러면 "한 줄" 이 아니다.
   ★ 내장이 없으면(낡은 Node) **그때만** 저장소의 `ws` 로 떨어진다 (2026-10-22).
     그 전에는 "`npm ci` 를 하고 다시 돌려 주세요"라고 **안내만** 했는데, 이 파일은 `ws` 를
     아예 안 불렀다 — `npm ci` 를 해도 **똑같이 멈춘다.** 대표님을 헛걸음시키는 안내였다. */
let WebSocket = globalThis.WebSocket;
if (typeof WebSocket !== 'function') {
  try { WebSocket = (await import('ws')).default; } catch (_) { /* 아래에서 말하고 멈춘다 */ }
}

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
/* 내장 WebSocket 은 **브라우저 모양**이다 — addEventListener·ev.data 를 쓴다.
   `ws` 모듈의 .on('message', buf) 와 다르니 읽는 쪽을 여기 한 곳에서 맞춘다(§4). */
function openWs(url, tag) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.got = [];
    ws.addEventListener('message', (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
      try { ws.got.push(JSON.parse(raw)); } catch (_) { ws.got.push({ _raw: raw }); }
    });
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error(`${tag} ws 를 열지 못했다 (주소·토큰·방 번호)`)));
  });
}
async function waitFor(pred, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(150); }
  return pred();
}

(async () => {
  console.log(`=== 이용권 끝에서 끝 실측 — ${BASE} ===\n`);
  if (typeof WebSocket !== 'function') {
    console.error(`이 Node 에는 내장 WebSocket 이 없고(${process.version}) 저장소의 ws 도 없습니다.`);
    console.error('둘 중 하나만 하시면 됩니다: ① Node 22 이상으로 돌린다 ② 이 저장소에서 `npm ci` 를 한 번 한다.');
    process.exit(1);
  }
  if (!globalThis.WebSocket) console.log(`(내장 WebSocket 이 없어 저장소의 ws 로 돕니다 — ${process.version})`);
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

  /* ⑨ **프로 이용권**으로 다시 — 여기서 비로소 "프로가 사는가"가 보인다 (마스터 10-22 13:00).
   *
   * ⑥⑦ 은 **문이 닫히는지**를 봤다(패키지 없는 토큰 → 403). 그것만으로는 "프로가 돈다"를
   * 알 수 없다 — 문을 열어 봐야 한다. 그래서 0x10|0x20 을 든 코드를 새로 발급해 같은 길을
   * 한 번 더 지난다. 비밀값은 여기서도 필요 없다(시험 키 0 의 씨앗은 공개값이다).
   *
   * 200 이 오면 **그 다음이 본론**이다: `tier` 가 pro 면 살아 있고, basic 이면 `why` 가
   * 무엇을 넣어야 하는지 말해 준다. 404·403 이면 **아직 배포가 안 된 것**이다. */
  const proDevice = 'e2epro_' + Math.random().toString(36).slice(2, 10);
  const PRO_FLAG_BIT = 0x20;
  const proMinted = mintCode({
    keyId: TEST_KEY_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    days: 1,
    flags: FLAG.host | FLAG.bundle | PRO_FLAG_BIT,     // 호스트 + 인터넷 번역 + 프로
    cust: 'E2EPRO',       // 고객 칸은 ASCII **6자 이내**다 — 7자를 넣으면 발급이 터진다
    privateKey: privateKeyFromSeed(testSeed())
  });
  await fetch(`${BASE}/license/redeem`, {
    method: 'POST', headers: J, body: JSON.stringify({ code: proMinted.code, deviceId: proDevice })
  });
  const rProIssue = await fetch(`${BASE}/license/issue`, {
    method: 'POST', headers: J, body: JSON.stringify({ device: proDevice })
  });
  const dProIssue = await body(rProIssue);
  const proToken = dProIssue && dProIssue.token;
  let proFlags = 0;
  if (proToken) {
    try { proFlags = Number(JSON.parse(Buffer.from(proToken.split('.')[0], 'base64url').toString()).flags || 0); } catch (_) {}
  }
  if (!proToken || (proFlags & PRO_FLAG_BIT) === 0) {
    step(9, '프로 이용권 발급(0x20)', false,
         `${rProIssue.status} flags=0x${proFlags.toString(16)} — 0x20 이 안 실렸다`);
  } else {
    const rProOk = await fetch(`${BASE}/translate`, {
      method: 'POST',
      headers: { ...J, Authorization: `Bearer ${proToken}` },
      body: JSON.stringify({ q: ['안전모를 쓰세요'], source: 'ko', target: 'en', engine: 'pro' })
    });
    const dProOk = await body(rProOk);
    const tier = dProOk && dProOk.tier;
    const why = (dProOk && dProOk.why) || '';
    /* 200 이면 통과다 — basic 으로 내려앉은 것도 **설계 그대로**다(키가 없으면 그렇게 된다).
       400·403·404 면 아직 배포가 안 된 것이고, 그때 대표님이 할 일은 재배포다. */
    step(9, "프로 이용권으로 engine:'pro'", rProOk.status === 200 && !!tier,
         `${rProOk.status} tier=${tier || '-'}${why ? ' why=' + why : ''}`
         + (tier === 'pro' ? ' → 프로가 **살아 있다**'
            : why === 'pro_no_key' ? ' → 배포 OK · **키만 없다**(wrangler secret put LLM_API_KEY)'
              : why === 'pro_no_provider' ? ' → **LLM_PROVIDER 이름**이 표에 없다'
                : tier === 'basic' ? ' → basic 으로 내려앉았다(까닭은 위 why)' : ''));
  }

  report();

  function report() {
    console.log('\n| # | 단계 | 결과 | 비고 |');
    console.log('|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.n} | ${r.what} | ${r.ok ? '✅' : '❌'} | ${r.detail || ''} |`);
    console.log(`\n=== ${rows.filter((r) => r.ok).length}/${rows.length} 통과 (${BASE}) ===`);
    if (failed) process.exitCode = 1;
  }
})().catch((e) => { console.error('\n[FAIL] 터졌다:', e.message); process.exitCode = 1; });
