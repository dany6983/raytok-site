#!/usr/bin/env node
/* scripts/host-token.mjs — `/web/host/` 에 넣을 **시험용 강사 토큰** 한 줄 (B 11, 마스터 2026-10-16 19:58)
 *
 * 대표님이 PC 에서 치는 한 줄:
 *   RELAY_URL=https://raytok-relay.raytok.workers.dev node scripts/host-token.mjs
 *
 * ★ **새 끝점을 만들지 않았다**(§5 — 넣을 것이 대체하는 것이 있나). 마스터가 적은 조건 셋이
 *   이미 있는 길에서 그대로 나온다 — 로컬 릴레이로 확인했다:
 *     · 24시간 만료 → `/license/issue` 는 만료를 **둘 중 이른 쪽**(30일 vs 이용권 끝)으로 잡는다.
 *       코드를 `--days 1` 로 내면 토큰도 **24.0시간**이다.
 *     · 0x04 → 웹 강사 화면은 `POST /room {kind:'script'}` 를 열고, 그 길은 0x04|0x08 을 본다
 *       (`relay/src/index.js` requiredFlags). `--flags meet` = 0x04.
 *     · 운영은 운영 키만 받는다(10-28 20:15) — 운영 릴레이에는 **1번 개인키**가 있어야 한다:
 *       `KEY_FILE=<운영 개인키 파일>` 또는 `relay/.dev.vars` 의 `LIC_PRIVATE_KEY_1`.
 *       없으면 0번(시험 키)으로 내고, 그건 로컬·개발 릴레이(ALLOW_TEST_KEY=1)에서만 통한다.
 *
 * 하는 일 셋 — 다 **있는 끝점**이다:
 *   ① mint-code: 키 1 코드(없으면 키 0 시험 — 로컬만)(0x04, 1일)
 *   ② POST /license/redeem  — 코드를 이 PC 에 묶는다
 *   ③ POST /license/issue   — 토큰을 받는다 → 그 글자를 강사 화면에 붙여넣는다
 *
 * ⚠ 기기 1대 제한이 있다(`LICENSE_MAX_DEVICES=1`) — 그것은 **코드를 등록하는 쪽**(이 스크립트가
 *   쓰는 `deviceId`)의 제한이다. 돌릴 때마다 새 `deviceId` 로 새 코드를 내므로 부딪히지 않는다.
 *   **나온 토큰은 브라우저를 가리지 않는다** — 강사 화면은 `/license/verify` 에 `deviceId` 를
 *   보내지 않으므로(`web/host/index.html`) **한 토큰으로 PC 와 폰을 같이 쓴다.**
 * ⚠ 하루 발급 횟수 제한이 있다(기기당 5회). 다섯 번 넘으면 429 가 온다 — 그때는 내일.
 *
 * ── 11월 데모용 (마스터 NOW 2 ①) ────────────────────────────────────────────────
 *   UNTIL=2026-11-30 RELAY_URL=https://raytok-relay.raytok.workers.dev node scripts/host-token.mjs
 *
 *   `UNTIL` 을 주면 그 날 끝까지 사는 이용권으로 낸다(날수를 세어 `DAYS` 로 쓴다).
 *   ⚠ **토큰은 30일 넘게 못 산다** — `/license/issue` 가 `min(30일, 이용권 끝)` 으로 잡는다
 *   (`relay/src/index.js`). 그래서 `UNTIL` 까지 덮으려면 **UNTIL 에서 30일 안쪽에 들어와서**
 *   뽑아야 한다. 일찍 뽑으면 이 스크립트가 **며칠이 비는지 한 줄로 알려 주고**, 언제 다시
 *   뽑으면 되는지 날짜를 적어 준다. 이용권 자체는 그대로 사니 **다시 돌리면 그 날까지** 찬다.
 */
import { mintCode, FLAG, scriptMintKey, isLocalRelay } from '../relay/tools/mint-code.mjs';

const fail0 = (m) => { console.error('\n[FAIL] ' + m); process.exit(1); };
const BASE = (process.env.RELAY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const J = { 'Content-Type': 'application/json' };
/* `UNTIL=YYYY-MM-DD` 가 오면 그 날 **끝**(23:59:59 현지)까지로 날수를 센다. 없으면 DAYS(기본 1). */
const UNTIL = (process.env.UNTIL || '').trim();
const untilMs = UNTIL ? new Date(`${UNTIL}T23:59:59`).getTime() : 0;
if (UNTIL && !Number.isFinite(untilMs)) fail0(`UNTIL 을 못 읽었다: "${UNTIL}" — YYYY-MM-DD 로 주세요`);
if (UNTIL && untilMs <= Date.now()) fail0(`UNTIL 이 이미 지났다: ${UNTIL}`);
const DAYS = UNTIL ? Math.ceil((untilMs - Date.now()) / 86400000) : Number(process.env.DAYS || 1);
const SHELF_DAYS = 90;             // 코드 묵힘 한도 — mint-code.mjs CLI 의 기본값과 같게
const device = process.env.DEVICE || ('host_' + Math.random().toString(36).slice(2, 10));

const fail = (m) => { console.error('\n[FAIL] ' + m); process.exit(1); };

(async () => {
  console.log(`=== ${UNTIL ? `데모 강사 토큰 (${UNTIL} 까지)` : '시험용 강사 토큰'} — ${BASE} · ${DAYS}일 · 0x04(meet) ===\n`);

  const MK = scriptMintKey();                        // 1번 개인키가 있으면 1번, 없으면 0번(시험 키)
  if (MK.keyId === 0 && !isLocalRelay(BASE)) {
    fail0('운영은 운영 키만 받는다 — 1번 개인키가 없다. KEY_FILE=<운영 개인키 파일> 을 붙여 다시 돌려 주세요.');
  }
  const minted = mintCode({
    keyId: MK.keyId,
    // 코드의 `exp` 는 **묵힘 한도**(언제까지 등록할 수 있나)다 — CLI 와 같은 기본값(오늘+90일).
    // ⚠ 여기에 1시간을 넣으면 **토큰 만료가 그 1시간**이 된다: /license/issue 는 만료를
    //    30일·이용권 끝·코드 exp 중 **가장 이른 것**으로 잡는다. 처음에 그렇게 써서
    //    24시간이 아니라 1.0시간이 나왔다 — 눈으로 보고 잡았다.
    /* 코드 `exp` 는 **셋 중 가장 이른 것**에 끼므로 UNTIL 보다 짧게 두면 안 된다. */
    exp: Math.floor(Date.now() / 1000) + Math.max(SHELF_DAYS, DAYS + 1) * 86400,
    days: DAYS,                                       // 등록부터 N일 = 토큰 만료도 이쪽을 따른다
    flags: FLAG.meet,                                 // 0x04 — 웹 강사 화면(kind:'script')이 보는 것
    cust: 'HOSTT',
    privateKey: MK.privateKey
  });
  console.log(`① 코드 발급: 128글자 (키 ${MK.keyId}${MK.keyId === 0 ? ' 시험' : ' 운영'})`);

  const r1 = await fetch(`${BASE}/license/redeem`, {
    method: 'POST', headers: J, body: JSON.stringify({ code: minted.code, deviceId: device })
  }).catch((e) => fail(`/license/redeem 에 닿지 못했다: ${e.message}`));
  const d1 = await r1.json().catch(() => null);
  if (!r1.ok) fail(`/license/redeem ${r1.status} ${JSON.stringify(d1)}`);
  console.log(`② 이 PC 에 묶음: flags=${d1 && d1.flags} 기기 ${d1 && d1.devices && d1.devices.count}/${d1 && d1.devices && d1.devices.limit}`);

  const r2 = await fetch(`${BASE}/license/issue`, {
    method: 'POST', headers: J, body: JSON.stringify({ device })
  }).catch((e) => fail(`/license/issue 에 닿지 못했다: ${e.message}`));
  const d2 = await r2.json().catch(() => null);
  if (!r2.ok) fail(`/license/issue ${r2.status} ${JSON.stringify(d2)}`);
  const token = d2 && d2.token;
  if (!token) fail(`토큰이 안 왔다: ${JSON.stringify(d2)}`);

  let flags = 0, exp = 0;
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    flags = Number(p.flags || 0); exp = Number(p.exp || 0);
  } catch (_) {}
  const hours = exp ? ((exp * 1000 - Date.now()) / 3600000).toFixed(1) : '?';
  if ((flags & (0x04 | 0x08)) === 0) fail(`토큰에 0x04·0x08 이 없다 (flags=0x${flags.toString(16)}) — 강사 화면이 방을 못 연다`);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  console.log(`③ 토큰 받음: flags=0x${flags.toString(16)} · ${hours}시간 뒤 만료 (${day(exp * 1000)})\n`);

  /* 일찍 뽑으면 UNTIL 까지 **안 찬다** — 30일 상한 때문이다. 조용히 넘기지 않고 날짜로 말한다.
     이용권 자체는 UNTIL 까지 사니 "다시 돌려라" 가 답이다(§20: 모르게 두지 않는다). */
  if (UNTIL) {
    const gapDays = Math.ceil((untilMs - exp * 1000) / 86400000);
    if (gapDays > 0) {
      console.log(`⚠ 이 토큰은 ${day(exp * 1000)} 에 끝난다 — ${UNTIL} 까지 ${gapDays}일 모자라다.`);
      console.log(`  까닭: 토큰 기한은 min(30일, 이용권 끝) 이다(릴레이). **이용권 자체는 ${UNTIL} 까지 산다.**`);
      console.log(`  할 일: ${day(untilMs - 29 * 86400000)} 이후에 이 줄을 **다시** 돌리면 ${UNTIL} 까지 찬다.`);
      console.log('  (그때 새 코드가 또 나온다 — 하루 5회 제한 안이라 괜찮다)\n');
    } else {
      console.log(`✓ ${UNTIL} 까지 덮는다 — 데모 끝날 때까지 다시 뽑을 일이 없다.\n`);
    }
  }

  console.log('── 아래 한 줄을 통째로 복사해 강사 화면의 「이용권 코드」 칸에 붙여넣으세요 ──\n');
  console.log(token);
  console.log(`\n화면: ${BASE.includes('127.0.0.1') ? 'http://localhost:8080' : 'https://raytok.kr'}/web/host/`);
  console.log('(🎤 실시간 말하기는 국내에서만 켜집니다 — 해외에서 보시려면 주소 끝에 ?region=KR)');
})().catch((e) => fail(e.message));
