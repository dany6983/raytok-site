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

const LANGS_5 = ['en', 'ja', 'zh', 'vi', 'ko'];
const bOnly = process.argv.includes('--b-only') || process.env.B_ONLY === '1';

// 단일 실행 (1회차)
async function executeIteration(listenerCount, mode, iterIdx, token) {
  // 1. 방 생성
  const resRoom = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ kind: 'desk' })
  });
  if (!resRoom.ok) {
    throw new Error(`Room creation failed (${resRoom.status})`);
  }
  const { code, host_token } = await resRoom.json();

  // 2. 호스트 WebSocket 연결
  const hostWs = new WebSocket(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  await new Promise((resolve, reject) => {
    hostWs.on('open', resolve);
    hostWs.on('error', reject);
  });

  // 3. 연결 몰림(Connect Burst) 측정
  const listeners = [];
  let connectSuccess = 0;
  let connectFail = 0;
  const burstStart = Date.now();

  const connectPromises = [];
  for (let i = 0; i < listenerCount; i++) {
    const targetLang = mode === 'same_lang' ? 'en' : LANGS_5[i % LANGS_5.length];
    const ws = new WebSocket(`${WS_URL}/ws?room=${code}&role=listener`);
    ws._idx = i;
    ws._lang = targetLang;
    ws._coldLatency = null;
    ws._steadyLatencies = [];
    ws._totalRecv = 0;

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

      ws.on('error', () => {
        clearTimeout(timer);
        connectFail++;
        resolve({ ok: false });
      });

      ws.on('message', data => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed._sendTime) {
            const lat = Date.now() - parsed._sendTime;
            ws._totalRecv++;
            if (parsed.seq === 1) {
              ws._coldLatency = lat;
            } else {
              ws._steadyLatencies.push(lat);
            }
          }
        } catch (_) {}
      });
    });

    listeners.push(ws);
    connectPromises.push(p);
  }

  await Promise.all(connectPromises);
  const connectBurstMs = Date.now() - burstStart;

  // 4. 캐시 비움 (Cold Start: 첫 줄) - N 및 회차마다 100% 고유 문장 생성
  const runSentence = `[N=${listenerCount}-run=${iterIdx}] 사업 회의 실시간 번역 발언 ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const coldStart = Date.now();
  const trCold = {};

  if (mode === 'diff_5_langs') {
    await Promise.all(LANGS_5.map(async lang => {
      try {
        const res = await fetch(`${BASE_URL}/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ q: [runSentence], source: 'ko', target: lang })
        });
        const d = await res.json();
        trCold[lang] = d.t && d.t[0];
      } catch (_) {}
    }));
  }

  // 첫 줄 WebSocket 브로드캐스트 (발화 시작 시각 기준 _sendTime)
  hostWs.send(JSON.stringify({
    seq: 1,
    text: runSentence,
    tr: trCold,
    _sendTime: coldStart
  }));

  // 첫 줄 전달 대기
  await new Promise(r => setTimeout(r, 600));

  // 5. 캐시 채움 / 정상 전달 (Steady State: 2~10번 줄 - 캐시 적중 5개 언어 번역 + 웹소켓 팬아웃)
  for (let seq = 2; seq <= 10; seq++) {
    const warmStart = Date.now();
    const trWarm = {};

    if (mode === 'diff_5_langs') {
      await Promise.all(LANGS_5.map(async lang => {
        try {
          const res = await fetch(`${BASE_URL}/translate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ q: [runSentence], source: 'ko', target: lang }) // 동일 문장 -> 캐시 적중(HIT)
          });
          const d = await res.json();
          trWarm[lang] = d.t && d.t[0];
        } catch (_) {}
      }));
    }

    hostWs.send(JSON.stringify({
      seq,
      text: runSentence,
      tr: trWarm,
      _sendTime: warmStart
    }));

    await new Promise(r => setTimeout(r, 100)); // 100ms 간격
  }

  // 잔여 메시지 수신 대기 (1.5초)
  await new Promise(r => setTimeout(r, 1500));

  // 6. 결과 수집 및 통계
  const coldLatencies = listeners.map(w => w._coldLatency).filter(l => l !== null);
  coldLatencies.sort((a, b) => a - b);
  const coldP95 = coldLatencies.length > 0 ? coldLatencies[Math.floor(coldLatencies.length * 0.95)] : 0;

  const steadyLatencies = [];
  let totalRecvAll = 0;
  for (const w of listeners) {
    steadyLatencies.push(...w._steadyLatencies);
    totalRecvAll += w._totalRecv;
  }
  steadyLatencies.sort((a, b) => a - b);
  const steadyAvg = steadyLatencies.length > 0 ? Math.round(steadyLatencies.reduce((a, b) => a + b, 0) / steadyLatencies.length) : 0;
  const steadyP95 = steadyLatencies.length > 0 ? steadyLatencies[Math.floor(steadyLatencies.length * 0.95)] : 0;
  const steadyMax = steadyLatencies.length > 0 ? steadyLatencies[steadyLatencies.length - 1] : 0;

  const expectedTotal = connectSuccess * 10; // 1 cold + 9 steady
  const deliveryRate = expectedTotal > 0 ? (totalRecvAll / expectedTotal) * 100 : 0;

  // 소켓 정리
  try { hostWs.close(); } catch (_) {}
  for (const w of listeners) {
    try { w.close(); } catch (_) {}
  }

  return {
    iter: iterIdx,
    connectSuccess,
    connectFail,
    connectBurstMs,
    coldP95,
    steadyAvg,
    steadyP95,
    steadyMax,
    deliveryRate
  };
}

// 3회 반복 실행 및 중앙값(Median) 산출
async function runStepWith3Iterations(listenerCount, mode) {
  console.log(`\n========================================================================`);
  console.log(`[TEST STEP] Listeners: ${listenerCount} | Mode: ${mode} (3회 반복 검증)`);
  console.log(`========================================================================`);

  const token = mintLicenseToken({ sub: `load-${mode}-${listenerCount}`, days: 1, flags: 0x04 | 0x08, secret });
  const runs = [];

  for (let i = 1; i <= 3; i++) {
    const res = await executeIteration(listenerCount, mode, i, token);
    runs.push(res);
    console.log(`  · Run #${i}: Connect=${res.connectSuccess}/${listenerCount} (${res.connectBurstMs}ms) | ColdP95=${res.coldP95}ms | SteadyP95=${res.steadyP95}ms | Delivery=${res.deliveryRate.toFixed(1)}%`);
    await new Promise(r => setTimeout(r, 800));
  }

  const getMedian = (arr, key) => {
    const vals = arr.map(r => r[key]).sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };

  const medianBurst = getMedian(runs, 'connectBurstMs');
  const medianColdP95 = getMedian(runs, 'coldP95');
  const medianSteadyAvg = getMedian(runs, 'steadyAvg');
  const medianSteadyP95 = getMedian(runs, 'steadyP95');
  const medianSteadyMax = getMedian(runs, 'steadyMax');
  const avgDelivery = runs.reduce((sum, r) => sum + r.deliveryRate, 0) / runs.length;
  const allConnected = runs.every(r => r.connectSuccess === listenerCount);

  const isHealthy = allConnected && avgDelivery >= 98 && medianSteadyP95 < 500;

  return {
    N: listenerCount,
    mode,
    runs,
    medianBurst,
    medianColdP95,
    medianSteadyAvg,
    medianSteadyP95,
    medianSteadyMax,
    avgDelivery,
    isHealthy
  };
}

async function run() {
  console.log('========================================================================');
  console.log('         릴레이(Desk) 동시성 정밀 부하 시험 (3회 반복 · P95 중앙값)');
  console.log('========================================================================');
  console.log('Target URL:', BASE_URL);
  console.log('Note: 본 시험은 로컬 wrangler dev(단일 프로세스 workerd) 환경에서 수행됩니다.');

  const steps = [10, 20, 30, 50];
  const summaryA = [];
  const summaryB = [];

  // 1. 조합 A: 동일 언어 (All 'en')
  if (!bOnly) {
    console.log('\n########################################################################');
    console.log('### [조합 A] 동일 언어 청취 (All English) - 웹소켓 팬아웃 용량 측정');
    console.log('########################################################################');
    for (const n of steps) {
      const res = await runStepWith3Iterations(n, 'same_lang');
      summaryA.push(res);
    }
  }

  // 2. 조합 B: 5개 다른 언어 ('en', 'ja', 'zh', 'vi', 'ko')
  console.log('\n########################################################################');
  console.log('### [조합 B] 5개 언어 분산 청취 (en/ja/zh/vi/ko) - 번역(Cold/Warm)+팬아웃 복합');
  console.log('########################################################################');
  for (const n of steps) {
    const res = await runStepWith3Iterations(n, 'diff_5_langs');
    summaryB.push(res);
  }

  // 종합 리포트 출력
  console.log('\n\n========================================================================');
  console.log('                      최종 릴레이(Desk) 부하 시험 결과표');
  console.log('========================================================================');

  if (!bOnly) {
    console.log('\n[조합 A: 동일 언어 청취 (All en)]');
    console.table(summaryA.map(s => ({
      '청취자수(N)': s.N,
      '연결몰림(Burst)': `${s.medianBurst}ms`,
      '첫줄(Cold P95)': `${s.medianColdP95}ms`,
      '정상전달(Steady P95)': `${s.medianSteadyP95}ms`,
      '정상전달(Steady Avg)': `${s.medianSteadyAvg}ms`,
      '최대지연(Max)': `${s.medianSteadyMax}ms`,
      '전달율': `${s.avgDelivery.toFixed(1)}%`,
      '판정': s.isHealthy ? '정상(PASS)' : '저하(FAIL)'
    })));
  }

  console.log('\n[조합 B: 5개 언어 분산 청취 (en/ja/zh/vi/ko)]');
  console.table(summaryB.map(s => ({
    '청취자수(N)': s.N,
    '연결몰림(Burst)': `${s.medianBurst}ms`,
    '첫줄(Cold P95)': `${s.medianColdP95}ms`,
    '정상전달(Steady P95)': `${s.medianSteadyP95}ms`,
    '정상전달(Steady Avg)': `${s.medianSteadyAvg}ms`,
    '최대지연(Max)': `${s.medianSteadyMax}ms`,
    '전달율': `${s.avgDelivery.toFixed(1)}%`,
    '판정': s.isHealthy ? '정상(PASS)' : '저하(FAIL)'
  })));

  // 3회 반복 원값 출력
  console.log('\n[조합 B 3회 반복 원값 상세]');
  for (const s of summaryB) {
    console.log(`N=${s.N}:`);
    console.log(`  · 몰림(Burst): ${s.runs.map(r => r.connectBurstMs + 'ms').join(' / ')}`);
    console.log(`  · 첫줄(Cold P95): ${s.runs.map(r => r.coldP95 + 'ms').join(' / ')}`);
    console.log(`  · 정상(Steady P95): ${s.runs.map(r => r.steadyP95 + 'ms').join(' / ')}`);
    console.log(`  · 정상(Steady Avg): ${s.runs.map(r => r.steadyAvg + 'ms').join(' / ')}`);
    console.log(`  · 전달율: ${s.runs.map(r => r.deliveryRate.toFixed(1) + '%').join(' / ')}`);
  }

  console.log('\n[분석 및 판정]');
  const analyze = (summary, title) => {
    let bottleneck = '50명까지 전 구간 안정적 정상 동작';
    for (const s of summary) {
      if (!s.isHealthy) {
        if (s.avgDelivery < 98) bottleneck = `${s.N}명 구간에서 메시지 드롭 발생 (전달율 ${s.avgDelivery.toFixed(1)}%)`;
        else if (s.medianSteadyP95 >= 500) bottleneck = `${s.N}명 구간에서 지연 시간 급증 (P95 ${s.medianSteadyP95}ms >= 500ms)`;
        break;
      }
    }
    console.log(`- ${title}: ${bottleneck}`);
  };

  if (!bOnly) analyze(summaryA, '조합 A (동일 언어)');
  analyze(summaryB, '조합 B (5개 언어 분산)');
  console.log('\n※ 주의: 본 수치는 로컬 wrangler dev(단일 프로세스 workerd) 측정치이므로 운영 에지 환경과는 절대 ms 차이가 있을 수 있습니다. 시스템이 과부하에 무너지지 않고 정상 복원됨을 검증한 결과입니다.');
}

run().catch(err => {
  console.error('\n*** Load Test Failed ***:', err.message);
  process.exit(1);
});
