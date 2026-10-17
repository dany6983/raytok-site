#!/usr/bin/env node
/* scripts/measure-first-load.mjs — 손님 첫 화면이 받는 양 **실측** (B 20, 2026-10-17)
 *
 * 로컬과 실서버를 **같은 방법**으로 잰다 — 주소만 바꾼다.
 *   node scripts/measure-first-load.mjs                        # 이 저장소를 띄워서 (로컬)
 *   node scripts/measure-first-load.mjs --base https://raytok.kr   # 배포된 실서버
 *   node scripts/measure-first-load.mjs --lang ja --out docs/first-load.md
 *
 * 왜 두 가지를 다 찍나: 로컬 정적 서버는 **압축을 안 한다**. 실서버(GitHub Pages)는 gzip·br 로
 * 보낸다. 그래서 둘을 그냥 견주면 로컬이 세 배로 보인다. 이 스크립트는
 *   ① 브라우저가 **실제로 받은 양**(transferSize — 실서버에서는 압축된 양)
 *   ② 받은 본문을 여기서 gzip 해 본 양(계산) — 로컬과 실서버를 견줄 수 있는 자리
 * 둘을 나란히 찍는다. 숫자를 하나만 찍으면 다음 사람이 잘못 견준다.
 *
 * 재는 것은 **첫 화면 한 번**이다. 글자 스트리밍(2시간 0.2~0.4 MB)은 여기서 재지 않는다 —
 * 그쪽은 `tools/measure_listener_bytes.js`(계산)와 릴레이 `bytes_out`(실측)이 있다.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argOf = (n, d = null) => {
  const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const BASE = argOf('base', process.env.BASE || null);
const LANG = argOf('lang', 'vi');
const OUT = argOf('out', process.argv.includes('--out') ? 'docs/first-load.md' : null);
const PAGES = ['/web/listener/', '/join/'];
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const kb = (n) => (n / 1024).toFixed(1);

function serveRepo() {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  return new Promise((ok) => srv.listen(0, () => ok({ srv, base: 'http://127.0.0.1:' + srv.address().port })));
}

(async () => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch (e) { throw new Error('playwright 가 없다 — `npm ci` 뒤 다시. (실서버 측정도 브라우저로 한다)'); }

  const local = BASE ? null : await serveRepo();
  const base = BASE ? BASE.replace(/\/$/, '') : local.base;
  const where = BASE ? '실서버' : '로컬(이 저장소, 압축 없음)';
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const rows = [];

  try {
    for (const route of PAGES) {
      const ctx = await browser.newContext();           // 쪽마다 새 창 — 캐시가 섞이면 첫 화면이 아니다
      const page = await ctx.newPage();
      const got = new Map();
      page.on('response', async (res) => {
        try {
          const u = new URL(res.url());
          const body = await res.body();
          got.set(u.pathname, { raw: body.length, gz: zlib.gzipSync(body, { level: 9 }).length });
        } catch (_) {}
      });
      const url = `${base}${route}?lang=${encodeURIComponent(LANG)}`;
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(1200);                  // 글자 조각까지 받을 틈

      /* 브라우저가 **실제로 받은 양**. 비어 올 수 있다(§20) — 그러면 그렇다고 찍는다. */
      const perf = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({
        name: r.name, transfer: r.transferSize || 0, enc: r.encodedBodySize || 0
      })));
      const docSize = await page.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return n ? { transfer: n.transferSize || 0, enc: n.encodedBodySize || 0 } : null;
      });
      await ctx.close();

      const items = [...got.entries()].map(([p, v]) => {
        const hit = perf.find((r) => new URL(r.name).pathname === p);
        const transfer = hit ? hit.transfer : (p === route ? (docSize ? docSize.transfer : 0) : 0);
        return { p, raw: v.raw, gz: v.gz, transfer };
      }).sort((a, b) => b.gz - a.gz);

      const sum = (k) => items.reduce((a, i) => a + i[k], 0);
      rows.push({ route, items, raw: sum('raw'), gz: sum('gz'), transfer: sum('transfer') });

      console.log(`\n## ${route}  (${where} · lang=${LANG})`);
      console.log('| 받은 것 | raw KB | gz KB(계산) | 실제 받은 KB |');
      console.log('|---|---:|---:|---:|');
      for (const i of items) console.log(`| ${i.p} | ${kb(i.raw)} | ${kb(i.gz)} | ${i.transfer ? kb(i.transfer) : '—'} |`);
      console.log(`| **합계 (${items.length}개)** | **${kb(sum('raw'))}** | **${kb(sum('gz'))}** | **${sum('transfer') ? kb(sum('transfer')) : '—'}** |`);
      if (!sum('transfer')) console.log('\n실제 받은 양이 비어 있다 — 브라우저가 안 알려 준 것이다(로컬·캐시). gz(계산) 쪽을 본다.');
      const whole = items.filter((i) => /ui-strings\.json$/.test(i.p));
      if (whole.length) console.log(`\n⚠ 81개 언어 **통째 사전**을 받았다: ${whole.map((w) => w.p + ' ' + kb(w.gz) + 'KB').join(', ')} — 조각 길이 깨졌다.`);
    }
  } finally {
    await browser.close();
    if (local) local.srv.close();
  }

  const md = [
    `## 손님 첫 화면 실측 — ${where}`,
    '',
    `- 잰 때: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `- 주소: ${base} · 언어: ${LANG}`,
    '',
    '| 쪽 | 받은 것 | raw KB | gz KB(계산) | 실제 받은 KB |',
    '|---|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.route} | ${r.items.length} | ${kb(r.raw)} | ${kb(r.gz)} | ${r.transfer ? kb(r.transfer) : '—'} |`),
    '',
    '가장 큰 것:',
    ...rows.map((r) => `- ${r.route} → ` + r.items.slice(0, 4).map((i) => `${i.p} ${kb(i.gz)}KB`).join(' · ')),
    ''
  ].join('\n');

  if (OUT) {
    /* 머리글은 사람이 쓴 설명이라 **지우지 않는다** — 표만 갈아 끼운다.
       그 자리를 가리키는 줄이 MARK 다. 없으면 파일 전체를 표로 쓴다(처음 만들 때). */
    const MARK = '<!-- 아래는 기계가 쓴다 — scripts/measure-first-load.mjs -->';
    const dest = path.resolve(ROOT, OUT);
    let head = '';
    if (fs.existsSync(dest)) {
      const cur = fs.readFileSync(dest, 'utf-8');
      const at = cur.indexOf(MARK);
      if (at >= 0) head = cur.slice(0, at);
    }
    fs.writeFileSync(dest, head + MARK + '\n\n' + md);
    console.log(`\n썼다: ${dest}${head ? ' (머리글은 그대로)' : ''}`);
  } else {
    console.log('\n' + md);
  }
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exitCode = 1; });
