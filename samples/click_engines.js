#!/usr/bin/env node
/* samples/click_engines.js — 마스터 누르기 시험을 **두 엔진**으로 돌리는 틀 (B · 마스터 10-23 09:05 "다음: 웹킷으로도 같은 표")
 *
 * 재는 것은 `scripts/master-click.cjs` 다 — **마스터 것이라 고치지 않는다.** 이 글은 그 시험을
 * 크로미움·웹킷 **둘 다**에 돌리고 표를 **나란히** 놓는다. 손으로 두 번 돌리고 눈으로 맞춰
 * 보는 일을 없애려는 것이다(한 번 쓰고 버리는 글이 아니다 — 다시 돌릴 수 있는 틀).
 *
 * 왜 웹킷인가: 아이폰 손님은 **사파리 그대로가 기본**이다(대표님 10-22 19:10 실기 합격).
 * 그러면 손님 화면이 **웹킷에서** 도는 것이 기본 길인데, 10-22 표는 크로미움만 쟀다.
 *
 * 쓰는 법 (릴레이는 **스스로 띄운다** — `listener-qa.mjs` 와 같은 꼴):
 *   node samples/click_engines.js                          # 둘 다
 *   node samples/click_engines.js --only=webkit
 *   node samples/click_engines.js --shots                  # 사진도 남긴다
 *
 * 릴레이는 **진짜 `wrangler dev --local`** 이다 — 목으로 바꾸지 않는다(D-11). 비밀값은
 * `relay/.dev.vars`(LICENSE_SECRET·LICENSE_SALT)에서만 읽고 **어디에도 찍지 않는다**;
 * 없으면 무엇을 적어야 하는지 말하고 멈춘다. 주소가 로컬이라는 것은 첫 줄에 적는다(MISTAKES #2).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELAY = (process.env.E2E_RELAY || 'http://127.0.0.1:8787').replace(/\/$/, '');
const SITE_PORT = Number(process.env.SITE_PORT || 8099);
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const SHOTS = argv.includes('--shots');
const ENGINES = (only ? [only] : ['chromium', 'webkit']);
const STAMP = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(ROOT, 'docs', 'reclog', `${STAMP}-web`);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
               '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function startSite() {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(SITE_PORT, '127.0.0.1', () => ok(srv)));
}

async function relayUp() {
  try {
    const r = await fetch(`${RELAY}/room`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                             body: '{}', signal: AbortSignal.timeout(2500) });
    return r.status > 0;
  } catch { return false; }
}

/* 릴레이를 **스스로** 띄운다. 비밀값이 없으면 `/license/issue` 가 500 「missing salt or secret」
   을 내는데, 그것은 화면 결함처럼 보인다 — 먼저 가른다. */
function devVarsMissing() {
  const p = path.join(ROOT, 'relay', '.dev.vars');
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return 'relay/.dev.vars 가 없다';
  const t = fs.readFileSync(p, 'utf8');
  const need = ['LICENSE_SECRET', 'LICENSE_SALT'].filter((k) => !new RegExp(`^${k}=.+`, 'm').test(t));
  return need.length ? `relay/.dev.vars 에 ${need.join(' · ')} 가 없다` : '';
}
async function startRelay() {
  if (await relayUp()) return null;
  const miss = devVarsMissing();
  if (miss) {
    console.error(`\n[FAIL] ${miss}.`);
    console.error('  relay/.dev.vars 에 두 줄을 적는다(아무 긴 무작위 글자 — 저장소에 넣지 않는다. .gitignore 에 이미 있다):');
    console.error('    LICENSE_SECRET=…\n    LICENSE_SALT=…');
    process.exit(2);
  }
  console.log('[relay] wrangler dev 를 띄운다…');
  const p = spawn('npx', ['wrangler', 'dev', '--port', String(new URL(RELAY).port || 8787), '--local'],
                  { cwd: path.join(ROOT, 'relay'), stdio: 'ignore', shell: process.platform === 'win32' });
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 700));
    if (await relayUp()) { console.log(`[relay] 준비 (${Date.now() - t0}ms)`); return p; }
  }
  throw new Error('릴레이가 90초 안에 안 떴다');
}

/** 진짜 토큰 — `scripts/host-token.mjs` 가 내는 것 하나만 쓴다(§5: 새 길을 만들지 않는다) */
function mintToken() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'host-token.mjs')],
                      { cwd: ROOT, env: { ...process.env, RELAY_URL: RELAY }, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const tok = out.split('\n').map((l) => l.trim()).filter((l) => /^ey[A-Za-z0-9_-]{20,}/.test(l)).pop();
  if (!tok) {
    console.error('토큰을 못 받았다 — host-token.mjs 끝 줄:');
    console.error(out.split('\n').filter(Boolean).slice(-5).join('\n'));
    process.exit(2);
  }
  return tok;
}

/** 한 엔진 — 마스터 시험을 그대로 돌리고 표를 읽어 온다
 *
 * ⚠ **`spawnSync` 로 돌리면 안 된다**(10-23 에 한 번 걸렸다). 화면을 내주는 정적 서버가
 *   이 프로세스 안에 있어서, 동기 spawn 이 돌 동안 **아무 요청도 못 받는다** — 그러면
 *   `page.goto` 가 30초 만료로 터지고, 화면이 깨진 것처럼 보인다. 비동기로 돌린다. */
function runEngine(engine, tok) {
  const shotDir = SHOTS ? path.join(OUT_DIR, `click-${engine}`) : '';
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  return new Promise((done) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'master-click.cjs')], {
      cwd: ROOT,
      env: { ...process.env, SITE, E2E_RELAY: RELAY, TOK: tok, ENGINE: engine, SHOT_DIR: shotDir },
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => done({ out, code }));
  }).then(({ out, code }) => finishEngine(engine, out, code));
}
function finishEngine(engine, out, code) {
  fs.writeFileSync(path.join(OUT_DIR, `master-click-${engine}.txt`), out);
  const rows = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^(PASS|FAIL|N\/A) \| (.+?) \| (.+?) \| (.*)$/);
    if (m) rows.push({ state: m[1], screen: m[2], btn: m[3], note: m[4] });
  }
  return { engine, rows, code, out };
}

(async () => {
  console.log(`=== 누르기 시험 · 두 엔진 — **로컬** (화면 ${SITE} · 릴레이 ${RELAY}) ===`);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(RELAY)) console.log('⚠ 릴레이가 로컬이 아니다 — 운영 주소다');
  const relayProc = await startRelay();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const srv = await startSite();
  const tok = mintToken();
  console.log(`토큰 받음(글자는 찍지 않는다) · 엔진 ${ENGINES.join(' · ')}\n`);

  const runs = [];
  for (const e of ENGINES) {
    process.stdout.write(`[${e}] 도는 중…`);
    const r = await runEngine(e, tok);
    const f = r.rows.filter((x) => x.state === 'FAIL').length;
    const na = r.rows.filter((x) => x.state === 'N/A').length;
    console.log(` 통과 ${r.rows.length - f - na} / ${r.rows.length - na}${na ? ` (해당 없음 ${na})` : ''}`);
    if (!r.rows.length) console.log(r.out.split('\n').slice(-12).join('\n'));
    runs.push(r);
  }
  srv.close();
  if (relayProc) relayProc.kill();   // 내가 띄운 것만 내린다(이미 떠 있었으면 그대로 둔다)

  /* ── 나란히 놓은 표 ─────────────────────────────────────────────────────── */
  const key = (r) => `${r.screen} | ${r.btn}`;
  const order = [];
  const seen = new Set();
  for (const run of runs) for (const r of run.rows) { const k = key(r); if (!seen.has(k)) { seen.add(k); order.push(k); } }
  const w = Math.max(...order.map((k) => k.length), 20);
  console.log(`\n=== 단추 × 엔진 (폰 390px · 로컬 릴레이) ===`);
  console.log('단추'.padEnd(w) + runs.map((r) => r.engine.padEnd(10)).join(''));
  console.log('-'.repeat(w + runs.length * 10));
  const diff = [];
  for (const k of order) {
    const cells = runs.map((run) => {
      const r = run.rows.find((x) => key(x) === k);
      return r ? r.state : '없음';
    });
    console.log(k.padEnd(w) + cells.map((c) => c.padEnd(10)).join(''));
    if (new Set(cells).size > 1) diff.push({ k, cells });
  }
  for (const run of runs) {
    const f = run.rows.filter((x) => x.state === 'FAIL');
    if (f.length) {
      console.log(`\n[${run.engine}] FAIL ${f.length}`);
      for (const r of f) console.log(`  · ${r.screen} | ${r.btn} — ${r.note}`);
    }
  }
  if (diff.length) {
    console.log('\n★ 엔진이 갈린 줄 (여기부터 본다):');
    for (const d of diff) console.log(`  · ${d.k} — ${runs.map((r, i) => `${r.engine}=${d.cells[i]}`).join(' · ')}`);
  } else {
    console.log('\n엔진끼리 갈린 줄 없음');
  }
  console.log(`\n원본: docs/reclog/${STAMP}-web/master-click-<엔진>.txt`);
  process.exit(runs.some((r) => r.rows.some((x) => x.state === 'FAIL')) || runs.some((r) => !r.rows.length) ? 1 : 0);
})().catch((e) => { console.error('터졌다', e); process.exit(1); });
