// 세션이 끝나면 줄을 지우는가 · Desk 번역이 캐시에 남지 않는가
// 로컬(wrangler dev)에서만 돌린다. 운영 주소로 돌리지 않는다.
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const WS_URL = BASE_URL.replace(/^http/, 'ws');

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE_URL)) {
  console.error('이 시험은 로컬 릴레이에서만 돌린다:', BASE_URL);
  process.exit(2);
}

let secret = process.env.LICENSE_SECRET;
let adminSecret = process.env.ADMIN_SECRET;
const devVarsPath = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(devVarsPath)) {
  for (const line of fs.readFileSync(devVarsPath, 'utf8').split('\n')) {
    const a = line.match(/^LICENSE_SECRET=(.*)$/);
    if (a) secret = a[1].trim();
    const b = line.match(/^ADMIN_SECRET=(.*)$/);
    if (b) adminSecret = b[1].trim();
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK = 'ZZ-본문-' + Date.now().toString(36);
let checks = 0;
function ok(cond, what) {
  assert(cond, what);
  checks++;
  console.log('  [PASS] ' + what);
}

// 방 종류마다 같은 시험을 돈다 — 한 종류만 지우는 일이 없게.
const KINDS = [
  { kind: 'guide', flags: 0x01 },
  { kind: 'desk', flags: 0x04 | 0x08 }
];

async function makeRoom({ kind, flags }) {
  const token = mintLicenseToken({ sub: 'nostore-' + kind + '-' + Math.random().toString(36).slice(2), days: 1, flags, secret });
  const res = await fetch(`${BASE_URL}/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind })
  });
  assert.strictEqual(res.status, 200, 'room ' + kind + ' → ' + res.status);
  return res.json();
}

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { closeTimeout: 500 });
    const got = [];
    ws.on('message', (d) => got.push(d.toString()));
    ws.on('open', () => resolve({ ws, got }));
    ws.on('error', reject);
  });
}

async function fill(code, host_token) {
  const host = await open(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  for (let seq = 1; seq <= 5; seq++) {
    host.ws.send(JSON.stringify({ seq, text: `${MARK} 원문 ${seq}`, tr: { en: `${MARK} translated ${seq}` } }));
  }
  await wait(200);
  // 끝나기 전에는 뒤늦게 온 청취자가 다섯 줄을 다 받는다 (보관이 살아 있는지 — 이게 없으면 아래 단언이 헛돈다)
  const early = await open(`${WS_URL}/ws?room=${code}&role=listener`);
  await wait(200);
  ok(early.got.filter((m) => m.includes(MARK)).length === 5, '끝나기 전: 뒤늦은 청취자가 5줄을 받는다');
  early.ws.close();
  return host;
}

async function lateJoin(code) {
  const late = await open(`${WS_URL}/ws?room=${code}&role=listener`);
  await wait(300);
  try { late.ws.close(); } catch (_) {}
  return late.got;
}

function alarm(code, advance_ms) {
  return fetch(`${BASE_URL}/room/${code}/test/alarm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
    body: JSON.stringify({ advance_ms })
  });
}

function assertOnlyEndMark(got, label, why) {
  ok(got.length === 1, `${label}: 뒤늦은 청취자가 받는 것은 한 줄뿐 (받은 수 ${got.length})`);
  ok(!got.join('\n').includes(MARK), `${label}: 원문·번역이 한 글자도 오지 않는다`);
  const mark = JSON.parse(got[0]);
  ok(mark.end === 1, `${label}: 그 한 줄은 끝 표시`);
  ok(!('text' in mark) && !('tr' in mark), `${label}: 끝 표시에 글 칸이 없다`);
  if (why) ok(mark.why === why, `${label}: why=${why}`);
  return mark;
}

async function endPaths() {
  for (const k of KINDS) {
    // (1) 호스트가 끝냄
    {
      const label = `${k.kind} · 호스트 종료`;
      console.log('\n[' + label + ']');
      const { code, host_token } = await makeRoom(k);
      const host = await fill(code, host_token);
      host.ws.send(JSON.stringify({ end: 1, summary: { lines: 5, minutes: 1, note: MARK + ' 요약에 숨긴 글' }, text: MARK + ' 끝줄에 숨긴 글' }));
      await wait(300);
      const mark = assertOnlyEndMark(await lateJoin(code), label);
      ok(mark.summary && mark.summary.lines === 5 && mark.summary.minutes === 1, `${label}: 숫자 요약은 남는다`);
      ok(Object.keys(mark.summary).every((key) => typeof mark.summary[key] === 'number'), `${label}: 요약에는 숫자만 있다`);
      host.ws.close();
    }
    // (2) 호스트가 끊긴 채 시간이 지남
    {
      const label = `${k.kind} · 호스트 끊김`;
      console.log('\n[' + label + ']');
      const { code, host_token } = await makeRoom(k);
      const host = await fill(code, host_token);
      host.ws.close();
      await wait(300);
      assert.strictEqual((await alarm(code, 1000)).status, 200);
      await wait(200);
      assertOnlyEndMark(await lateJoin(code), label, 'host_timeout');
    }
    // (3) 말이 없어 자동 종료
    {
      const label = `${k.kind} · 무음 종료`;
      console.log('\n[' + label + ']');
      const { code, host_token } = await makeRoom(k);
      const host = await fill(code, host_token);
      assert.strictEqual((await alarm(code, 11 * 60 * 1000)).status, 200);
      await wait(200);
      assertOnlyEndMark(await lateJoin(code), label, 'silence_timeout');
      host.ws.close();
    }
  }
}

async function tr(token, text) {
  const res = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Admin-Secret': adminSecret,
      'X-Translate-Engine': 'mock'
    },
    body: JSON.stringify({ q: [text], source: 'ko', target: 'en' })
  });
  assert.strictEqual(res.status, 200, 'translate → ' + res.status);
  await res.json();
  return { cache: res.headers.get('x-cache'), up: res.headers.get('x-upstream-count') };
}

async function cachePaths() {
  console.log('\n[번역 캐시]');
  const rnd = Math.random().toString(36).slice(2);
  const cam = mintLicenseToken({ sub: 'nostore-cam-' + rnd, days: 1, flags: 0x02, secret });
  const deskTokens = [
    ['0x04', mintLicenseToken({ sub: 'nostore-meet-' + rnd, days: 1, flags: 0x04, secret })],
    ['0x08|0x04', mintLicenseToken({ sub: 'nostore-desk-' + rnd, days: 1, flags: 0x04 | 0x08, secret })]
  ];

  // 캐시가 이 환경에서 실제로 도는지부터 (안 돌면 아래 단언이 헛돈다)
  const s0 = `캐시 살아 있나 ${rnd}`;
  const a1 = await tr(cam, s0);
  await wait(150);
  const a2 = await tr(cam, s0);
  ok(a1.cache === 'MISS' && a2.cache === 'HIT' && a2.up === '0', `앱 토큰: 같은 문장 두 번째는 캐시에서 (MISS → ${a2.cache})`);

  for (const [name, tok] of deskTokens) {
    const s = `회의 문장 ${name} ${rnd}`;
    const d1 = await tr(tok, s);
    await wait(150);
    const d2 = await tr(tok, s);
    ok(d1.cache === 'BYPASS' && d2.cache === 'BYPASS', `Desk 토큰(${name}): 두 번 다 캐시를 건너뛴다`);
    ok(d1.up === '1' && d2.up === '1', `Desk 토큰(${name}): 두 번 다 번역 엔진까지 간다`);
    // 남기지 않았다는 증거: 같은 문장을 앱 토큰으로 물으면 캐시에 없다
    const c = await tr(cam, s);
    ok(c.cache === 'MISS', `Desk 토큰(${name}): 그 문장이 캐시에 남지 않았다`);
    // 읽지도 않는다: 앱이 이미 넣어 둔 문장도 Desk 는 건너뛴다
    const d3 = await tr(tok, s0);
    ok(d3.cache === 'BYPASS' && d3.up === '1', `Desk 토큰(${name}): 캐시에 있는 문장도 읽지 않는다`);
  }
}

async function run() {
  console.log('=== 종료 시 삭제 · Desk 번역 캐시 없음 ===');
  assert(secret && adminSecret, '.dev.vars 에 LICENSE_SECRET · ADMIN_SECRET 이 있어야 한다');
  await endPaths();
  await cachePaths();
  console.log(`\n전부 통과 (${checks}건)`);
  process.exit(0);
}

run().catch((e) => {
  console.error('\n[FAIL]', e.message);
  process.exit(1);
});
