// tools/build_en_pages.js — tour/en 및 museum/en 정적 영문 페이지 자동 생성
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');

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
    { dir: 'museum', path: '/museum/', canonical: 'https://raytok.kr/museum/en/' }
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
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
    console.log(`Generated: ${t.dir}/en/index.html`);
  }

  await browser.close();
  server.close();
  console.log('Done generating EN pages.');
})().catch(err => {
  console.error(err);
  server.close();
  process.exit(1);
});
