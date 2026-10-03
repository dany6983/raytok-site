import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const WS_URL = BASE_URL.replace(/^http/, 'ws');

let secret = process.env.LICENSE_SECRET;
const devVarsPath = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(devVarsPath)) {
  const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
  for (const line of lines) {
    const matchSec = line.match(/^LICENSE_SECRET=(.*)$/);
    if (matchSec) secret = matchSec[1].trim();
  }
}

// 5개 언어 조합
const LANGS_5 = ['en', 'ja', 'zh', 'vi', 'ko'];

async function runStep(listenerCount, mode = 'same_lang') {
  console.log(`\n=============================================================`);
  console.log(`[LOAD STEP] Listeners: ${listenerCount} | Mode: ${mode}`);
  console.log(`=============================================================`);

  const sub = `load-${mode}-${listenerCount}-${Date.now()}`;
  const token = mintLicenseToken({ sub, days: 1, flags: 0x01 | 0x04, secret });

  // 1. 방 생성
  const resRoom = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ kind: 'guide' })
  });
  if (!resRoom.ok) {
    console.error(`[FAIL] Room creation failed with status ${resRoom.status}`);
    return { ok: false, error: 'room_creation_failed' };
  }
  const { code, host_token } = await resRoom.json();

  // 2. 호스트 WebSocket 연결
  const hostWs = new WebSocket(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  await new Promise((resolve, reject) => {
    hostWs.on('open', resolve);
    hostWs.on('error', reject);
  });

  // 3. 청취자 WebSocket 대량 연결
  const listeners = [];
  let connectSuccess = 0;
  let connectFail = 0;
  const connectStart = Date.now();

  const connectPromises = [];
  for (let i = 0; i < listenerCount; i++) {
    const targetLang = mode === 'same_lang' ? 'en' : LANGS_5[i % LANGS_5.length];
    const ws = new WebSocket(`${WS_URL}/ws?room=${code}&role=listener`);
    ws._idx = i;
    ws._lang = targetLang;
    ws._recvCount = 0;
    ws._latencies = [];

    const p = new Promise(resolve => {
      const timer = setTimeout(() => {
        connectFail++;
        resolve({ ok: false, reason: 'timeout' });
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timer);
        connectSuccess++;
        resolve({ ok: true });
      });

      ws.on('error', err => {
        clearTimeout(timer);
        connectFail++;
        resolve({ ok: false, reason: err.message });
      });

      ws.on('message', data => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed._sendTime) {
            const lat = Date.now() - parsed._sendTime;
            ws._latencies.push(lat);
            ws._recvCount++;
          }
        } catch (_) {}
      });
    });

    listeners.push(ws);
    connectPromises.push(p);
  }

  await Promise.all(connectPromises);
  const connectDuration = Date.now() - connectStart;
  console.log(`- Connection Result: Success=${connectSuccess}/${listenerCount}, Fail=${connectFail} (${connectDuration}ms)`);

  if (connectSuccess === 0) {
    try { hostWs.close(); } catch (_) {}
    return { ok: false, firstFailure: 'all_connections_failed' };
  }

  // 4. 호스트 메시지 연속 전송 (10개 메시지 전송, 100ms 간격)
  const totalSent = 10;
  console.log(`- Sending ${totalSent} broadcast lines from host (fanout test)...`);
  for (let seq = 1; seq <= totalSent; seq++) {
    const payload = JSON.stringify({
      seq,
      text: `부하 시험 메시지 #${seq}`,
      _sendTime: Date.now()
    });
    hostWs.send(payload);
    await new Promise(r => setTimeout(r, 100));
  }

  // 메시지 수신 대기 (2초)
  await new Promise(r => setTimeout(r, 2000));

  // 5. 통계 집계
  const expectedTotalDeliveries = connectSuccess * totalSent;
  let totalReceived = 0;
  const allLatencies = [];

  for (const ws of listeners) {
    totalReceived += ws._recvCount;
    allLatencies.push(...ws._latencies);
  }

  const deliveryRate = expectedTotalDeliveries > 0 ? (totalReceived / expectedTotalDeliveries) * 100 : 0;
  allLatencies.sort((a, b) => a - b);
  const avgLatency = allLatencies.length > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : 0;
  const p95Latency = allLatencies.length > 0 ? allLatencies[Math.floor(allLatencies.length * 0.95)] : 0;
  const maxLatency = allLatencies.length > 0 ? allLatencies[allLatencies.length - 1] : 0;

  console.log(`- Fanout Delivery Rate: ${deliveryRate.toFixed(1)}% (${totalReceived}/${expectedTotalDeliveries})`);
  console.log(`- Latency: Avg=${avgLatency}ms | P95=${p95Latency}ms | Max=${maxLatency}ms`);

  // 정리
  try { hostWs.close(); } catch (_) {}
  for (const ws of listeners) {
    try { ws.close(); } catch (_) {}
  }

  const isHealthy = connectSuccess === listenerCount && deliveryRate >= 98 && p95Latency < 500;
  return {
    listenerCount,
    mode,
    connectSuccess,
    connectFail,
    deliveryRate,
    avgLatency,
    p95Latency,
    maxLatency,
    isHealthy
  };
}

async function run() {
  console.log('=== Relay Single Room Concurrency Load Test (wrangler dev local) ===');
  console.log('Target URL:', BASE_URL);

  const steps = [10, 20, 30, 50];
  const resultsA = [];
  const resultsB = [];

  // 조합 A: 동일 언어 (All 'en')
  console.log('\n========================================');
  console.log('>>> [Combination A] Same Language (en) <<<');
  console.log('========================================');
  for (const n of steps) {
    const res = await runStep(n, 'same_lang');
    resultsA.push(res);
    await new Promise(r => setTimeout(r, 1000));
  }

  // 조합 B: 5개 다른 언어 ('en', 'ja', 'zh', 'vi', 'ko')
  console.log('\n========================================');
  console.log('>>> [Combination B] 5 Different Languages <<<');
  console.log('========================================');
  for (const n of steps) {
    const res = await runStep(n, 'diff_5_langs');
    resultsB.push(res);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n\n=============================================================');
  console.log('=================== FINAL LOAD TEST REPORT ===================');
  console.log('=============================================================');

  console.log('\n[Combination A: Same Language]');
  console.table(resultsA.map(r => ({
    N: r.listenerCount,
    Connect: `${r.connectSuccess}/${r.listenerCount}`,
    Delivery: `${r.deliveryRate.toFixed(1)}%`,
    AvgMs: r.avgLatency,
    P95Ms: r.p95Latency,
    MaxMs: r.maxLatency,
    Healthy: r.isHealthy ? 'YES' : 'NO'
  })));

  console.log('\n[Combination B: 5 Different Languages]');
  console.table(resultsB.map(r => ({
    N: r.listenerCount,
    Connect: `${r.connectSuccess}/${r.listenerCount}`,
    Delivery: `${r.deliveryRate.toFixed(1)}%`,
    AvgMs: r.avgLatency,
    P95Ms: r.p95Latency,
    MaxMs: r.maxLatency,
    Healthy: r.isHealthy ? 'YES' : 'NO'
  })));

  // 판정: N명까지 정상, N+에서 무엇이 무너지는가
  const findBreakPoint = (results) => {
    for (const r of results) {
      if (!r.isHealthy) {
        if (r.connectFail > 0) return `${r.listenerCount}명 (WebSocket 연결 핸드셰이크 실패)`;
        if (r.deliveryRate < 98) return `${r.listenerCount}명 (메시지 브로드캐스트 유실)`;
        if (r.p95Latency >= 500) return `${r.listenerCount}명 (지연 시간 500ms 초과)`;
      }
    }
    return '50명까지 전 구간 안정적 정상 동작';
  };

  console.log('\n[결과 분석]');
  console.log('- 조합 A 판정:', findBreakPoint(resultsA));
  console.log('- 조합 B 판정:', findBreakPoint(resultsB));
}

run().catch(err => {
  console.error('\n*** Load Test Failed ***:', err.message);
  process.exit(1);
});
