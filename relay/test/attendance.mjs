// 참석 집계 — 숫자만, 호스트에게만, 끝나면 지움. 로컬(wrangler dev)에서만 돌린다.
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';
const WS_URL = BASE_URL.replace(/^http/, 'ws');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE_URL)) { console.error('로컬 릴레이에서만:', BASE_URL); process.exit(2); }
let secret = process.env.LICENSE_SECRET;
const dv = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(dv)) for (const line of fs.readFileSync(dv, 'utf8').split('\n')) { const a = line.match(/^LICENSE_SECRET=(.*)$/); if (a) secret = a[1].trim(); }

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (c, w) => { assert(c, w); checks++; console.log('  [PASS] ' + w); };
const open = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); const got = []; ws.on('message', (d) => got.push(d.toString())); ws.on('open', () => res({ ws, got })); ws.on('error', rej); });
const lastAtt = (got) => { const a = got.filter((m) => m.includes('"att":1')); return a.length ? JSON.parse(a[a.length - 1]) : null; };
const MARK = 'ATT-' + Date.now().toString(36);

async function run() {
  console.log('=== 참석 집계 ===');
  assert(secret, '.dev.vars 에 LICENSE_SECRET');
  const token = mintLicenseToken({ sub: 'att-' + Math.random().toString(36).slice(2), days: 1, flags: 0x01, secret });
  const res = await fetch(`${BASE_URL}/room`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ kind: 'guide' }) });
  assert.strictEqual(res.status, 200);
  const { code, host_token } = await res.json();

  const host = await open(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  await wait(200);
  let a = lastAtt(host.got);
  ok(a && a.now === 0 && a.joined === 0, '호스트 접속 때 집계 0명');

  const L = [];
  for (const lang of ['en', 'en', 'vi']) {
    const l = await open(`${WS_URL}/ws?room=${code}&role=listener`);
    l.ws.send(JSON.stringify({ hello: 1, lang, name: MARK + '-이름', deviceId: 'd' }));
    L.push(l);
  }
  await wait(300);
  a = lastAtt(host.got);
  ok(a.now === 3 && a.joined === 3 && a.max === 3, `세 명 붙음 (now=${a.now} joined=${a.joined} max=${a.max})`);
  ok(a.langs.en && a.langs.en.now === 2 && a.langs.vi && a.langs.vi.now === 1, '언어별: en 2 · vi 1');
  ok(Object.values(a.langs).every((x) => typeof x.min === 'number'), '언어별 들은 분이 숫자로 있다');
  ok(!JSON.stringify(a).includes('이름') && !JSON.stringify(a).includes(MARK), '집계에 이름이 없다');

  L[1].ws.send(JSON.stringify({ hello: 1, lang: 'ja' }));
  await wait(200);
  a = lastAtt(host.got);
  ok(a.langs.en.now === 1 && a.langs.ja.now === 1 && a.now === 3, '언어 바꿈: en 1 · ja 1 (전체 3)');

  L[2].ws.close();
  await wait(300);
  a = lastAtt(host.got);
  ok(a.now === 2 && a.max === 3 && a.langs.vi.now === 0 && a.langs.vi.max === 1, '한 명 나감: now 2 · max 3 · vi now 0/max 1');

  // 호스트가 줄을 보내도 청취자에게 집계는 가지 않는다
  host.ws.send(JSON.stringify({ seq: 1, text: '안녕', tr: { en: 'hi' } }));
  await wait(200);
  ok(L.every((l) => !l.got.some((m) => m.includes('"att":1'))), '청취자는 집계를 한 줄도 받지 않는다');

  // 호스트 재접속 → 현재 집계 한 번
  const host2 = await open(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  await wait(200);
  a = lastAtt(host2.got);
  ok(a && a.now === 2 && a.joined === 3, '호스트 재접속 때 현재 집계를 받는다');

  // 끝 → 마지막 집계 뒤 지움
  host2.ws.send(JSON.stringify({ end: 1, summary: { lines: 1, minutes: 1 } }));
  await wait(400);
  a = lastAtt(host2.got);
  ok(a && a.now === 2, '끝날 때 마지막 집계를 호스트에게 준다');
  const late = await open(`${WS_URL}/ws?room=${code}&role=listener`);
  late.ws.send(JSON.stringify({ hello: 1, lang: 'en' }));
  await wait(200);
  const host3 = await open(`${WS_URL}/ws?room=${code}&role=host&token=${host_token}`);
  await wait(200);
  ok(!host3.got.some((m) => m.includes('"att":1')), '끝난 뒤 호스트가 다시 붙어도 집계가 없다(지워짐)');
  ok(!late.got.some((m) => m.includes('"att":1')), '끝난 뒤 들어온 청취자도 집계를 받지 않는다');
  for (const w of [host.ws, host2.ws, host3.ws, late.ws, L[0].ws, L[1].ws]) { try { w.close(); } catch (_) {} }
  console.log(`\n전부 통과 (${checks}건)`);
  process.exit(0);
}
run().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
