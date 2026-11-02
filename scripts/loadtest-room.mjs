#!/usr/bin/env node
/**
 * scripts/loadtest-room.mjs — 방 하나에 손님 N명, 얼마까지 버티나 (NOW 11-01 13:47 · GS인증 「동시 청취자 수」)
 *
 * 하는 일(단계마다 방을 새로 연다):
 *   시험 키 0번 코드 → /license/redeem → /license/issue → 강사 토큰 → POST /room {kind:'script'}
 *   → 강사 WS 1 + 손님 WS N (`{hello:1, lang}` · 언어는 아래 표를 돌아가며)
 *   → 강사가 `--interval` ms 마다 한 줄 `{seq, text, srcLang, t}` → 손님마다 받은 시각 기록
 *   → 단계 끝: 도착 지연 p50·p95·최대, 빠진 seq, 연결 실패·끊김, 서버 오류
 * 「한계」 = p95 2초 넘음·빠짐·연결 실패가 처음 생긴 단계의 **바로 앞** 단계.
 *
 * 강사는 **원문만** 보낸다(RULE: P-14 — 보내는 기기는 번역문을 보내지 않는다). 번역 줄의 무게는
 * `--pad` 바이트(기본 = 원문 길이만큼)를 덧붙여 흉내 낸다. 시험용 릴레이는 방 번역을 끈다(ROOM_TR=0).
 * 지연은 같은 프로세스의 시계로 잰다(보낸 `t` → 받은 시각). 이 프로그램 자체가 느려지면 지연이
 * 부풀므로 이벤트 루프 밀림(lag)도 같이 적는다 — lag 가 크면 그 단계 숫자는 노트북 한계다.
 *
 * 쓰는 법:
 *   node scripts/loadtest-room.mjs --relay http://127.0.0.1:8787 --steps 50 --dur 20
 *   node scripts/loadtest-room.mjs --relay https://raytok-relay-loadtest.<계정>.workers.dev --steps 50,100,200,500,1000
 * 고르개: --steps 50,100 · --dur 120(초, 단계마다) · --interval 1500 · --pad <바이트> · --out docs/loadtest-<날짜>
 *         (--out 은 확장자 없이 — .md 와 .json 둘을 쓴다. 안 주면 표만 화면에)
 * 운영 릴레이(raytok-relay.raytok.workers.dev)는 받지 않는다 — 운영은 시험 키를 안 받고, 손님을 건드린다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mintCode, privateKeyFromSeed, testSeed, TEST_KEY_ID, FLAG } from '../relay/src/mint-core.js';

const __filename = fileURLToPath(import.meta.url);
export const PROD_HOST = 'raytok-relay.raytok.workers.dev';
/* 손님 언어 — data 표에서 자주 쓰는 열둘을 돌아가며 (언어로 분기하지 않는다, hello 에 싣기만) */
export const LANGS = ['en', 'ja', 'zh-CN', 'vi', 'th', 'id', 'es', 'fr', 'de', 'ru', 'ar', 'ko'];
export const P95_LIMIT_MS = 2000;
/* relay/src/room.js 「상한: 청취자 200」 — 표에 적기만 한다(판정은 실제로 붙은 수로) */
export const ROOM_LISTENER_CAP = 200;

/* ── 셈 (순수 함수 — 시험이 직접 부른다) ─────────────────────────────── */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/**
 * 한 단계 요약.
 * sent: [{seq, t}] — 강사가 실제로 보낸 줄(보낸 시각)
 * listeners: [{opened, failed, closedEarly, errors, got: Map(seq → 받은 시각)}]
 */
export function summarizeStep({ n, sent, listeners, serverErrors = 0, lagMaxMs = 0 }) {
  const lat = [];
  const slowAll = [];          // {seq, ms, idx} — 가장 느린 줄이 어느 seq 였나(첫 줄 = 방 깨우기인지)
  const missList = [];         // {seq, idx} — 빠진 줄이 누구의 몇 번째였나
  let missing = 0;
  let dup = 0;
  const sentT = new Map(sent.map((s) => [s.seq, s.t]));
  let opened = 0, failed = 0, closedEarly = 0;
  for (const l of listeners) {
    if (l.failed) { failed++; continue; }
    if (!l.opened) { failed++; continue; }
    opened++;
    if (l.closedEarly) closedEarly++;
    dup += l.dup || 0;
    for (const s of sent) {
      const at = l.got.get(s.seq);
      if (at === undefined) { missing++; if (missList.length < 20) missList.push({ seq: s.seq, idx: l.idx }); continue; }
      const ms = at - sentT.get(s.seq);
      lat.push(ms);
      slowAll.push({ seq: s.seq, ms, idx: l.idx });
    }
  }
  lat.sort((a, b) => a - b);
  return {
    n,
    opened,
    connectFail: failed,
    closedEarly,
    linesSent: sent.length,
    delivered: lat.length,
    missing,
    dup,
    serverErrors,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    max: lat.length ? lat[lat.length - 1] : null,
    lagMaxMs: Math.round(lagMaxMs),
    slowest: slowAll.sort((a, b) => b.ms - a.ms).slice(0, 5),
    missList,
    lateAfterEnd: listeners.reduce((a, l) => a + (l.late || 0), 0)
  };
}

/** 단계 하나가 「버텼나」 */
export function stepOk(s) {
  return s.connectFail === 0 && s.missing === 0 && s.closedEarly === 0 && s.serverErrors === 0 &&
    s.linesSent > 0 && s.p95 !== null && s.p95 <= P95_LIMIT_MS;
}

/** 한계 = 처음 못 버틴 단계의 바로 앞. 다 버티면 마지막 단계(「그 이상은 안 재 봄」). */
export function pickLimit(steps) {
  let last = null;
  for (const s of steps) {
    if (!stepOk(s)) return { limit: last ? last.n : 0, brokeAt: s.n, why: whyBroke(s) };
    last = s;
  }
  return { limit: last ? last.n : 0, brokeAt: null, why: null };
}
export function whyBroke(s) {
  const w = [];
  if (s.connectFail) w.push(`연결 실패 ${s.connectFail}`);
  if (s.closedEarly) w.push(`끊김 ${s.closedEarly}`);
  if (s.missing) w.push(`빠진 줄 ${s.missing}`);
  if (s.serverErrors) w.push(`서버 오류 ${s.serverErrors}`);
  if (s.p95 === null) w.push('받은 줄 없음');
  else if (s.p95 > P95_LIMIT_MS) w.push(`p95 ${s.p95}ms > ${P95_LIMIT_MS}`);
  if (!s.linesSent) w.push('보낸 줄 없음');
  return w.join(' · ');
}

export function toMarkdown({ relay, startedAt, steps, limit, opts }) {
  const isLocal = /127\.0\.0\.1|localhost/.test(relay);
  const rows = steps.map((s) =>
    `| ${s.n} | ${s.opened} | ${s.connectFail} | ${s.closedEarly} | ${s.linesSent} | ${s.missing} | ${s.p50 ?? '-'} | ${s.p95 ?? '-'} | ${s.max ?? '-'} | ${s.serverErrors} | ${s.lagMaxMs} | ${stepOk(s) ? '버팀' : '✗'} |`);
  return [
    `# 동시 청취자 부하 시험 — ${startedAt.slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `- 릴레이: \`${relay}\`${isLocal ? ' — **로컬(wrangler dev). 이 숫자는 운영 한계가 아니다**(노트북 한 대·로컬 workerd)' : ''}`,
    `- 방 1개 · 강사 1 · 단계마다 ${opts.dur}초 · ${opts.interval}ms 마다 한 줄 · 덧붙임 ${opts.pad ?? '원문 길이만큼'}(바이트) · 손님 언어 ${LANGS.length}개 돌림`,
    `- 판정: p95 ≤ ${P95_LIMIT_MS}ms · 빠진 줄 0 · 연결 실패 0 · 끊김 0 · 서버 오류 0`,
    `- **한계: ${limit.limit}명**${limit.brokeAt ? ` (${limit.brokeAt}명에서 ${limit.why})` : ' (잰 단계 모두 버팀 — 그 위는 안 재 봄)'}`,
    '',
    '| N | 붙음 | 연결 실패 | 끊김 | 보낸 줄 | 빠진 줄 | p50 ms | p95 ms | 최대 ms | 서버 오류 | 시험기 lag ms | 판정 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    `- 방 손님 상한은 코드에 **${ROOM_LISTENER_CAP}명**(relay/src/room.js) — 그 위 단계의 연결 실패는 서버가 못 버틴 것이 아니라 설계값이다.`,
    '',
    '「시험기 lag」 이 수백 ms 를 넘는 단계는 지연이 이 프로그램 쪽에서 부푼 것일 수 있다 — 기계 둘로 나눠 다시 잰다.',
    ''
  ].join('\n');
}

/* ── 실제 돌리기 ─────────────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wsBase = (relay) => relay.replace(/^http/, 'ws').replace(/\/$/, '');

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
}

/** 시험 키 0번으로 강사(0x04) 토큰 하나 — 시험용 릴레이(ALLOW_TEST_KEY=1)만 받는다 */
export async function hostToken(relay) {
  const priv = privateKeyFromSeed(testSeed());
  const now = Math.floor(Date.now() / 1000);
  const cust = 'LT' + crypto.randomBytes(2).toString('hex').toUpperCase();
  const { code } = mintCode({ keyId: TEST_KEY_ID, exp: now + 90 * 86400, days: 1, flags: FLAG.meet, cust, privateKey: priv });
  const device = 'loadtest-' + crypto.randomBytes(6).toString('hex');
  const rd = await postJson(`${relay}/license/redeem`, { code, deviceId: device });
  if (rd.status !== 200) throw new Error(`/license/redeem ${rd.status} ${JSON.stringify(rd.data)} — 시험용 릴레이(ALLOW_TEST_KEY=1)인가?`);
  const is = await postJson(`${relay}/license/issue`, { device });
  if (is.status !== 200 || !is.data || !is.data.token) throw new Error(`/license/issue ${is.status} ${JSON.stringify(is.data)} — LICENSE_SECRET·LICENSE_SALT 비밀값이 있나?`);
  return is.data.token;
}

function openWs(url, timeoutMs) {
  return new Promise((resolve) => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { resolve({ ws: null, err: String(e) }); return; }
    const to = setTimeout(() => { try { ws.close(); } catch (_) {} resolve({ ws: null, err: 'timeout' }); }, timeoutMs);
    ws.addEventListener('open', () => { clearTimeout(to); resolve({ ws, err: null }); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(to); resolve({ ws: null, err: 'error' }); }, { once: true });
  });
}

export async function runStep({ relay, token, n, durMs, intervalMs, pad, log = () => {} }) {
  const room = await postJson(`${relay}/room`, { kind: 'script' }, { Authorization: `Bearer ${token}` });
  if (room.status !== 200) throw new Error(`POST /room ${room.status} ${JSON.stringify(room.data)}`);
  const { code, host_token: hostTok } = room.data;
  const W = wsBase(relay);
  let serverErrors = 0;

  const h = await openWs(`${W}/ws?room=${code}&role=host&token=${encodeURIComponent(hostTok)}`, 15000);
  if (!h.ws) throw new Error(`강사 WS 못 붙음 (${h.err})`);
  const host = h.ws;
  host.addEventListener('message', (e) => { try { const m = JSON.parse(e.data); if (m && (m.error || m.kind === 'error')) serverErrors++; } catch (_) {} });

  /* 손님 N — 한꺼번에(강의 시작 때 QR 을 동시에 찍는 꼴) */
  let ending = false;
  const listeners = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const l = { idx: i, lang: LANGS[i % LANGS.length], opened: false, failed: false, closedEarly: false, dup: 0, got: new Map(), err: null };
    const r = await openWs(`${W}/ws?room=${code}&role=listener`, 20000);
    if (!r.ws) { l.failed = true; l.err = r.err; return l; }
    l.opened = true;
    l.ws = r.ws;
    r.ws.addEventListener('message', (e) => {
      const at = Date.now();
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m && (m.error || m.kind === 'error')) { serverErrors++; return; }
      if (m && typeof m.seq === 'number' && typeof m.t === 'number' && m.lt === 1) {
        if (ending) { l.late = (l.late || 0) + 1; return; }   // 기다림이 끝난 뒤 온 줄 — 「빠짐」과 따로 센다
        if (l.got.has(m.seq)) l.dup++; else l.got.set(m.seq, at);
      }
    });
    r.ws.addEventListener('close', (e) => { if (!ending) { l.closedEarly = true; if (e.code === 1011) serverErrors++; } });
    try { r.ws.send(JSON.stringify({ hello: 1, lang: l.lang })); } catch (_) {}
    return l;
  }));
  const failedN = listeners.filter((l) => l.failed).length;
  log(`  N=${n} 방 ${code} · 붙음 ${n - failedN} · 실패 ${failedN}`);
  await sleep(500);

  /* 이 프로그램의 이벤트 루프 밀림 — 지연이 어디서 부풀었는지 가르는 값 */
  let lagMax = 0;
  let lagPrev = Date.now();
  const lagT = setInterval(() => { const now = Date.now(); lagMax = Math.max(lagMax, now - lagPrev - 100); lagPrev = now; }, 100);

  const sent = [];
  const text = '오늘 강의는 여기 있는 모든 분이 각자 말로 듣습니다. 질문은 손을 들어 주세요.';
  const padStr = 'x'.repeat(pad == null ? Buffer.byteLength(text) : pad);
  const t0 = Date.now();
  let seq = 0;
  while (Date.now() - t0 < durMs) {
    seq++;
    const t = Date.now();
    try {
      host.send(JSON.stringify({ seq, text, srcLang: 'ko', t, lt: 1, pad: padStr }));
      sent.push({ seq, t });
    } catch (_) { serverErrors++; }
    await sleep(intervalMs);
  }
  await sleep(Math.max(3000, P95_LIMIT_MS * 2));   // 늦게 오는 줄을 「빠짐」으로 세지 않도록 기다린다
  clearInterval(lagT);
  ending = true;
  try { host.send(JSON.stringify({ end: 1 })); } catch (_) {}
  await sleep(300);
  for (const l of listeners) { try { l.ws && l.ws.close(); } catch (_) {} }
  try { host.close(); } catch (_) {}

  const s = summarizeStep({ n, sent, listeners, serverErrors, lagMaxMs: lagMax });
  s.room = code;
  s.failReasons = [...new Set(listeners.filter((l) => l.failed).map((l) => l.err))];
  return s;
}

export function parseArgs(argv) {
  const o = { relay: 'http://127.0.0.1:8787', steps: [50, 100, 200, 500, 1000], dur: 120, interval: 1500, pad: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--relay') { o.relay = v.replace(/\/$/, ''); i++; }
    else if (a === '--steps') { o.steps = v.split(',').map(Number).filter((x) => x > 0); i++; }
    else if (a === '--dur') { o.dur = Number(v); i++; }
    else if (a === '--interval') { o.interval = Number(v); i++; }
    else if (a === '--pad') { o.pad = Number(v); i++; }
    else if (a === '--out') { o.out = v; i++; }
  }
  return o;
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  const opts = parseArgs(argv);
  if (opts.relay.includes(PROD_HOST)) throw new Error('운영 릴레이에는 돌리지 않는다 — raytok-relay-loadtest 주소를 쓴다');
  const startedAt = new Date().toISOString();
  log(`부하 시험 → ${opts.relay} · 단계 ${opts.steps.join(',')} · ${opts.dur}초씩`);
  const token = await hostToken(opts.relay);
  const steps = [];
  for (const n of opts.steps) {
    const s = await runStep({ relay: opts.relay, token, n, durMs: opts.dur * 1000, intervalMs: opts.interval, pad: opts.pad, log });
    log(`  → p50 ${s.p50} · p95 ${s.p95} · 최대 ${s.max} ms · 빠짐 ${s.missing} · 실패 ${s.connectFail}${s.failReasons.length ? ' (' + s.failReasons.join(',') + ')' : ''} · 끊김 ${s.closedEarly} · lag ${s.lagMaxMs}ms`);
    steps.push(s);
    await sleep(2000);
  }
  const limit = pickLimit(steps);
  const md = toMarkdown({ relay: opts.relay, startedAt, steps, limit, opts });
  if (opts.out) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out + '.md', md);
    fs.writeFileSync(opts.out + '.json', JSON.stringify({ relay: opts.relay, startedAt, opts, limit, steps }, null, 2));
    log(`적음: ${opts.out}.md · ${opts.out}.json`);
  }
  log('\n' + md);
  return { steps, limit, md };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(__filename).href) {
  main().catch((e) => { console.error('[실패]', e.message); process.exit(1); });
}
