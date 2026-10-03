// 번역 사전 점검: 소개 페이지의 한국어 원문 가운데 사전(assets/i18n/<언어>.json)에 없는 문장을 찾는다.
// 실행(저장소 루트, playwright 필요):  node tools/i18n_check.js          → 언어별로 빠진 문장 수와 목록
//                                     node tools/i18n_check.js --keys   → 원문 목록만 JSON 으로 출력
// 원문을 고친 뒤에는 이 점검에서 빠진 문장이 0 이 되도록 사전을 같이 고친다. 사전에 없는 문장은 한국어로 남는다.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname), PAGES = ['/', '/field/', '/tour/', '/ows/'], LANGS = ['en', 'zh', 'ja', 'vi'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  const { chromium } = require('playwright');
  await new Promise(ok => srv.listen(0, ok));
  const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const keys = [], seen = new Set();
  for (const u of PAGES) {
    const p = await b.newPage(); await p.goto(base + u, { waitUntil: 'load' });
    for (const k of await p.evaluate(() => window.__i18nKeys())) if (!seen.has(k)) { seen.add(k); keys.push(k); }
    await p.close();
  }
  await b.close(); srv.close();
  if (process.argv.includes('--keys')) { console.log(JSON.stringify(keys, null, 1)); return; }
  let bad = 0;
  const tags = s => (s.match(/<\/?\d+>|<br>/g) || []).sort().join('');
  for (const l of LANGS) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'i18n', l + '.json'), 'utf8'));
    const miss = keys.filter(k => d[k] == null), wrong = keys.filter(k => d[k] != null && tags(k) !== tags(d[k]));
    const extra = Object.keys(d).filter(k => !seen.has(k));
    console.log(`${l}: 원문 ${keys.length} · 빠짐 ${miss.length} · 번호표 불일치 ${wrong.length} · 안 쓰는 항목 ${extra.length}`);
    miss.concat(wrong).forEach(k => console.log('   - ' + k));
    bad += miss.length + wrong.length;
  }
  process.exit(bad ? 1 : 0);
})();
