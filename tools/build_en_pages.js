// tools/build_en_pages.js — tour/en 및 museum/en 정적 영문 페이지 자동 생성
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

// --- 손 고침 보호 가드 (2026-11-07) ---
// 이 생성기는 한국어 쪽을 렌더링해 영문 쪽을 다시 만든다.
// 영문 쪽에 손으로 넣은 글(고지문·섹션)이 있으면 그냥 돌리는 순간 지워진다.
// 그래서 "쓰려는 글"이 "지금 파일"과 다르면 한 쪽도 쓰지 않고 멈춘다. --force 로만 통과.
// (build_home.py 와 같은 규칙. 문서에 「돌리지 말 것」을 적는 것으로는 못 막는다)
const FORCE = process.argv.includes('--force');
const pending = [];

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url.split('?')[0]);
  if (req.url.endsWith('/') || !path.extname(filePath)) {
    filePath = path.join(filePath, 'index.html');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});

  const targets = [
    { dir: 'tour', path: '/tour/', canonical: 'https://raytok.kr/tour/en/' },
    { dir: 'museum', path: '/museum/', canonical: 'https://raytok.kr/museum/en/' },
    { dir: 'field', path: '/field/', canonical: 'https://raytok.kr/field/en/' },
    { dir: 'student', path: '/student/', canonical: 'https://raytok.kr/student/en/' },
    { dir: 'ows', path: '/ows/', canonical: 'https://raytok.kr/ows/en/' }
  ];

  for (const t of targets) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}${t.path}?lang=en`);
    await page.waitForFunction(() => !document.documentElement.classList.contains('i18n-wait'));
    await page.waitForTimeout(500);

    let html = await page.content();
    await page.close();

    // 1. html lang="en"
    html = html.replace(/<html[^>]*>/, '<html lang="en">');

    // 2. canonical 업데이트
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${t.canonical}">`);
    html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${t.canonical}">`);

    // 3. hreflang 태그 삽입
    const hreflangs = `
<link rel="alternate" hreflang="ko" href="https://raytok.kr/${t.dir}/">
<link rel="alternate" hreflang="en" href="https://raytok.kr/${t.dir}/en/">
<link rel="alternate" hreflang="x-default" href="https://raytok.kr/${t.dir}/">`;
    if (!html.includes('hreflang="en"')) {
      html = html.replace(/<\/head>/, `${hreflangs}\n</head>`);
    }

    const outDir = path.join(ROOT, t.dir, 'en');
    pending.push({ dir: t.dir, outDir, outPath: path.join(outDir, 'index.html'), html });
  }

  await browser.close();
  server.close();

  // 가드: 먼저 전부 대조한다. 하나라도 다르면 한 쪽도 쓰지 않는다
  const drift = pending.filter(o =>
    fs.existsSync(o.outPath) && fs.readFileSync(o.outPath, 'utf8') !== o.html
  );
  if (drift.length && !FORCE) {
    console.error('');
    console.error('멈췄습니다 — 지금 파일과 다릅니다. 손 고침이 지워질 수 있습니다:');
    for (const o of drift) console.error(`  - ${o.dir}/en/index.html`);
    console.error('');
    console.error('먼저 무엇이 다른지 보십시오:  git diff -- ' + drift.map(o => `${o.dir}/en/index.html`).join(' '));
    console.error('덮어쓰려면:                   node tools/build_en_pages.js --force');
    console.error('한 쪽도 쓰지 않았습니다.');
    process.exit(2);
  }

  for (const o of pending) {
    if (!fs.existsSync(o.outDir)) fs.mkdirSync(o.outDir, { recursive: true });
    fs.writeFileSync(o.outPath, o.html, 'utf8');
    console.log(`Generated: ${o.dir}/en/index.html`);
  }
  console.log('Done generating EN pages.');
})().catch(err => {
  console.error(err);
  server.close();
  process.exit(1);
});
