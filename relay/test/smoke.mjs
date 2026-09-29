import WebSocket from 'ws';

const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== RayTok Relay v0 Smoke Test ===');
  console.log(`Target: ${BASE_URL}`);

  // 1. 방 생성: POST /room -> { code, host_token }
  console.log('\n[Step 1] Creating room via POST /room...');
  const roomRes = await fetch(`${BASE_URL}/room`, { method: 'POST' });
  if (!roomRes.ok) {
    throw new Error(`Failed to create room: ${roomRes.status} ${await roomRes.text()}`);
  }
  const { code, host_token } = await roomRes.json();
  console.log(`Created room: code=${code}, host_token=${host_token}`);
  if (!code || code.length !== 6) throw new Error(`Invalid room code: ${code}`);
  if (!host_token || host_token.length !== 32) throw new Error(`Invalid host_token: ${host_token}`);

  // 1-1. 방 정보 확인: GET /room/CODE
  const infoRes = await fetch(`${BASE_URL}/room/${code}`);
  const info = await infoRes.json();
  console.log('Room info:', info);
  if (!info.exists) throw new Error('Room info should exist');

  // 2. 호스트 접속: GET /ws?room=CODE&role=host&token=HOST_TOKEN
  console.log('\n[Step 2] Connecting host WebSocket...');
  const hostWs = new WebSocket(`${WS_BASE_URL}/ws?room=${code}&role=host&token=${host_token}`);
  await new Promise((resolve, reject) => {
    hostWs.on('open', resolve);
    hostWs.on('error', reject);
  });
  console.log('Host connected successfully.');

  // 3. 청취자 3명 접속: GET /ws?room=CODE&role=listener
  console.log('\n[Step 3] Connecting 3 listeners...');
  const listeners = [];
  const listenerMessages = [[], [], []];

  for (let i = 0; i < 3; i++) {
    const ws = new WebSocket(`${WS_BASE_URL}/ws?room=${code}&role=listener`);
    const idx = i;
    ws.on('message', (data) => {
      const str = data.toString();
      listenerMessages[idx].push(str);
    });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    listeners.push(ws);
  }
  console.log('All 3 listeners connected.');

  // 4. 호스트 line 5개 전송
  console.log('\n[Step 4] Host sending 5 line messages...');
  for (let seq = 1; seq <= 5; seq++) {
    const msg = JSON.stringify({
      seq,
      src: 'ko',
      text: `Line ${seq}`,
      tr: { en: `Line ${seq} en` }
    });
    hostWs.send(msg);
    await delay(50);
  }

  // 5. 청취자마다 5개 수신 확인
  console.log('\n[Step 5] Verifying 5 messages received by each listener...');
  await delay(300);
  for (let i = 0; i < 3; i++) {
    console.log(`Listener ${i + 1} received ${listenerMessages[i].length} messages.`);
    if (listenerMessages[i].length !== 5) {
      throw new Error(`Listener ${i + 1} expected 5 messages, got ${listenerMessages[i].length}`);
    }
    for (let seq = 1; seq <= 5; seq++) {
      const parsed = JSON.parse(listenerMessages[i][seq - 1]);
      if (parsed.seq !== seq) {
        throw new Error(`Listener ${i + 1} message ${seq} seq mismatch: ${parsed.seq}`);
      }
    }
  }
  console.log('All 3 listeners verified 5/5 messages in order.');

  // 6. 늦은 청취자 접속 -> 버퍼 5개 수신 확인
  console.log('\n[Step 6] Connecting late listener and verifying 5 buffered messages...');
  const lateMessages = [];
  const lateWs = new WebSocket(`${WS_BASE_URL}/ws?room=${code}&role=listener`);
  lateWs.on('message', (data) => {
    lateMessages.push(data.toString());
  });
  await new Promise((resolve, reject) => {
    lateWs.on('open', resolve);
    lateWs.on('error', reject);
  });
  await delay(300);
  console.log(`Late listener received ${lateMessages.length} buffered messages.`);
  if (lateMessages.length !== 5) {
    throw new Error(`Late listener expected 5 buffered messages, got ${lateMessages.length}`);
  }
  for (let seq = 1; seq <= 5; seq++) {
    const parsed = JSON.parse(lateMessages[seq - 1]);
    if (parsed.seq !== seq) {
      throw new Error(`Late listener buffered message ${seq} seq mismatch: ${parsed.seq}`);
    }
  }
  console.log('Late listener verified 5/5 buffered messages in order.');

  // 7. 호스트 end 전송 -> 청취자 close 코드 1000 확인
  console.log('\n[Step 7] Host sending end message and verifying close(1000)...');
  const allListeners = [...listeners, lateWs];
  const closePromises = allListeners.map((ws, idx) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Listener ${idx + 1} close timeout after end`));
      }, 8000);
      ws.on('close', (code, reason) => {
        clearTimeout(timer);
        console.log(`Listener ${idx + 1} closed with code: ${code}`);
        if (code !== 1000) {
          reject(new Error(`Listener ${idx + 1} expected close code 1000, got ${code}`));
        } else {
          resolve(code);
        }
      });
    });
  });

  const endMsg = JSON.stringify({ end: 1, summary: { lines: 5, minutes: 1 } });
  hostWs.send(endMsg);
  console.log('Host sent end message. Waiting for 5s close timer...');

  await Promise.all(closePromises);
  console.log('All listeners closed with code 1000 as expected.');

  hostWs.close();
  console.log('\n=== Smoke Test Passed Successfully! ===');
}

run().catch((err) => {
  console.error('\n*** Smoke Test Failed ***', err);
  process.exit(1);
});
