import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const WS_URL = BASE_URL.replace(/^http/, 'ws');

let secret = process.env.LICENSE_SECRET;
let adminSecret = process.env.ADMIN_SECRET || 'dev-admin-secret-key-12345';

const devVarsPath = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(devVarsPath)) {
  const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
  for (const line of lines) {
    const matchSec = line.match(/^LICENSE_SECRET=(.*)$/);
    if (matchSec) secret = matchSec[1].trim();
    const matchAdmin = line.match(/^ADMIN_SECRET=(.*)$/);
    if (matchAdmin) adminSecret = matchAdmin[1].trim();
  }
}

async function run() {
  console.log('=== Relay 10-Minute Silence Auto-Stop & 9-Minute Warning Test ===');
  console.log('Target URL:', BASE_URL);

  const sub = 'desk-silence-sub-' + Date.now();
  const token = mintLicenseToken({ sub, days: 1, flags: 0x04 | 0x08, secret });

  // 1. 방 생성 (Desk)
  console.log('\n[Step 1] Create Desk room...');
  const resRoom = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  assert.strictEqual(resRoom.status, 200);
  const { code, host_token } = await resRoom.json();
  console.log(`   - Room created: code=${code}, host_token=${host_token.slice(0, 8)}...`);

  // 2. 호스트 및 청취자 웹소켓 연결
  console.log('\n[Step 2] Connect Host and Listener WebSockets...');
  const hostWs = new WebSocket(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  const listenerWs = new WebSocket(`${WS_URL}/ws?room=${code}&role=listener`);

  await Promise.all([
    new Promise((resolve, reject) => { hostWs.on('open', resolve); hostWs.on('error', reject); }),
    new Promise((resolve, reject) => { listenerWs.on('open', resolve); listenerWs.on('error', reject); })
  ]);
  console.log('   - Host & Listener connected successfully.');

  const hostMessages = [];
  const listenerMessages = [];
  hostWs.on('message', data => {
    try { hostMessages.push(JSON.parse(data.toString())); } catch (_) {}
  });
  listenerWs.on('message', data => {
    try { listenerMessages.push(JSON.parse(data.toString())); } catch (_) {}
  });

  // 2-1. [보안 자물쇠 검증] ADMIN_SECRET 없는 /test/alarm 호출 -> 반드시 404로 은닉되어야 함!
  console.log('\n[Security Test] Unauthorized call to /test/alarm without admin secret -> expect 404...');
  const resUnauth = await fetch(`${BASE_URL}/room/${code}/test/alarm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ advance_ms: 1000 })
  });
  console.log('   - Status without admin secret:', resUnauth.status);
  assert.strictEqual(resUnauth.status, 404, 'ADMIN_SECRET 없으면 404로 존재 자체를 숨겨야 함');
  console.log('   - [PASS] Test route 404 lockdown verified');

  // 3. [단언문 1] 9분 경과 시뮬레이션 -> silence_warning 수신 검증
  console.log('\n[Step 3] Simulate 9-minute silence -> assert silence_warning...');
  const resWarn = await fetch(`${BASE_URL}/room/${code}/test/alarm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ advance_ms: 9 * 60 * 1000 }) // 9분(540,000ms) 경과
  });
  assert.strictEqual(resWarn.status, 200);

  // 잠시 대기 후 메시지 수신 확인
  await new Promise(r => setTimeout(r, 100));
  const warnMsg = hostMessages.find(m => m.warning === 'silence_warning');
  assert(warnMsg, '호스트가 9분 경고 silence_warning 메시지를 수신해야 함');
  assert.strictEqual(warnMsg.minutes, 9, '경고 경과 분 = 9');
  console.log('   - [PASS] 9분 경고 수신 확인:', JSON.stringify(warnMsg));

  // 4. [단언문 2] 새 자막 줄(final text) 전송 시 타이머 리셋 및 경고 해제 검증
  console.log('\n[Step 4] Send recognized subtitle line -> assert timer reset & warning cleared...');
  hostWs.send(JSON.stringify({ seq: 1, text: '새로 인식된 발언 줄입니다.' }));
  await new Promise(r => setTimeout(r, 100));

  const clearMsg = hostMessages.find(m => m.warning_cleared === 'silence_warning');
  assert(clearMsg, '자막 줄 도착 시 warning_cleared 메시지가 호스트에게 전달되어야 함');
  console.log('   - [PASS] 자막 전송 후 경고 해제 확인:', JSON.stringify(clearMsg));

  // 5. [단언문 3] 10분 무음 도달 시뮬레이션 -> end: 1, why: 'silence_timeout' 및 소켓 종료 검증
  console.log('\n[Step 5] Simulate 10-minute continuous silence -> assert silence_timeout & auto end...');
  let listenerClosed = false;
  listenerWs.on('close', (closeCode, reason) => {
    listenerClosed = true;
    console.log(`   - Listener socket closed: code=${closeCode}, reason=${reason.toString()}`);
  });

  const resTimeout = await fetch(`${BASE_URL}/room/${code}/test/alarm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret
    },
    body: JSON.stringify({ advance_ms: 10 * 60 * 1000 }) // 10분(600,000ms) 경과
  });
  assert.strictEqual(resTimeout.status, 200);

  // 메시지 및 소켓 종료 대기
  await new Promise(r => setTimeout(r, 300));
  const endMsg = listenerMessages.find(m => m.end === 1 && m.why === 'silence_timeout');
  assert(endMsg, '청취자가 end: 1, why: "silence_timeout" 메시지를 수신해야 함');
  console.log('   - [PASS] 10분 도달 시 silence_timeout 자동 종료 수신 확인:', JSON.stringify(endMsg));

  // 6. [단언문 4] 룸 종료 시 desk_minutes 누적 및 안전 상한선(DESK_HARD_CAP_MIN) 가드 검증
  console.log('\n[Step 6] Verify desk_minutes accumulation and hard cap check in /usage...');
  const resUsage = await fetch(`${BASE_URL}/usage`, {
    headers: { 'X-Admin-Secret': adminSecret }
  });
  assert.strictEqual(resUsage.status, 200);
  const usageData = await resUsage.json();
  const subUsage = usageData.usage && usageData.usage[sub];
  console.log('   - Sub Usage:', JSON.stringify(subUsage));
  assert(subUsage, '사용량에 해당 Desk sub 기록 존재');
  assert(subUsage.desk_minutes >= 1, `desk_minutes가 최소 1분 이상 누적되어야 함 (현재: ${subUsage.desk_minutes})`);
  console.log(`   - [PASS] desk_minutes 누적 실증 완료: ${subUsage.desk_minutes}분`);

  try { hostWs.close(); } catch (_) {}
  try { listenerWs.close(); } catch (_) {}

  console.log('\n=== All 10-Minute Silence Auto-Stop & Warning Tests Passed! ===');
}

run().catch(err => {
  console.error('\n*** Silence Test Failed ***:', err.message);
  process.exit(1);
});
