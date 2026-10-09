const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SHOTS_DIR = path.join(ROOT, 'docs', 'shots');

if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

(async () => {
  const server = http.createServer((req, res) => {
    let filePath = path.join(ROOT, req.url.split('?')[0]);
    if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    headless: true
  });

  const targets = [
    { name: 'buy', path: '/web/buy/' },
    { name: 'listener', path: '/web/listener/' },
    { name: 'host', path: '/web/host/' },
    { name: 'desk', path: '/web/desk/' },
    { name: 'verify', path: '/web/verify/' }
  ];

  const widths = [360, 420];

  for (const t of targets) {
    for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height: 800 } });
      await page.goto(`${baseUrl}${t.path}`);
      await page.waitForTimeout(500); // wait for render
      const outPath = path.join(SHOTS_DIR, `${t.name}-${w}.png`);
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`Saved screenshot: ${outPath}`);
      await page.close();
    }
  }

  await browser.close();
  server.close();
})();
