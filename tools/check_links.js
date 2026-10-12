// tools/check_links.js — 전체 HTML 내 로컬 href/src 링크 깨짐(404) 전수 검사
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const htmlFiles = [];

function findHtmlFiles(dir) {
  for (const item of fs.readdirSync(dir)) {
    if (item === 'node_modules' || item === '.git' || item === '.wrangler' || item === 'dist') continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      findHtmlFiles(full);
    } else if (item.endsWith('.html')) {
      htmlFiles.push(full);
    }
  }
}

findHtmlFiles(ROOT);

let broken = 0;
let checked = 0;

for (const f of htmlFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const relFile = path.relative(ROOT, f);

  // Match href and src attributes
  const regex = /(?:href|src)=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const link = match[1];
    if (link.startsWith('http://') || link.startsWith('https://') ||
        link.startsWith('mailto:') || link.startsWith('tel:') ||
        link.startsWith('#') || link.startsWith('javascript:') ||
        link.startsWith('data:') || link.includes('${')) {
      continue;
    }

    // Strip hash and query parameters
    const cleanLink = link.split('?')[0].split('#')[0];
    if (!cleanLink) continue;

    checked++;
    let targetPath;
    if (cleanLink.startsWith('/')) {
      targetPath = path.join(ROOT, cleanLink.replace(/^\//, ''));
    } else {
      targetPath = path.join(path.dirname(f), cleanLink);
    }

    // Check directory with index.html or exact file
    let exists = false;
    if (fs.existsSync(targetPath)) {
      if (fs.statSync(targetPath).isDirectory()) {
        exists = fs.existsSync(path.join(targetPath, 'index.html'));
      } else {
        exists = true;
      }
    } else if (cleanLink.endsWith('/') && fs.existsSync(targetPath + 'index.html')) {
      exists = true;
    }

    if (!exists) {
      console.error(`[404 Broken] ${relFile} -> ${link} (Target not found: ${targetPath})`);
      broken++;
    }
  }
}

console.log(`\nLink Check Summary: ${checked} links checked across ${htmlFiles.length} HTML files.`);
if (broken > 0) {
  console.error(`Found ${broken} broken links!`);
  process.exit(1);
} else {
  console.log('All local links are valid! 0 broken links.');
}
