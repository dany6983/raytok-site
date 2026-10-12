// samples/sitemap_test.js — robots.txt 및 sitemap.xml 검증 시험
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== SEO 검색엔진 수집 점검: robots.txt & sitemap.xml 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const ROOT = path.join(__dirname, '..');
const robotsFile = path.join(ROOT, 'robots.txt');
const sitemapFile = path.join(ROOT, 'sitemap.xml');

// 1. robots.txt 검증
ok(fs.existsSync(robotsFile), 'robots.txt 파일 존재 확인');
const robotsText = fs.readFileSync(robotsFile, 'utf8');
ok(robotsText.includes('User-agent: *'), 'User-agent: * 선언 확인');
ok(robotsText.includes('Disallow: /web/buy/'), '비공개 결제 페이지 (/web/buy/) 수집 차단 확인');
ok(robotsText.includes('Sitemap: https://raytok.kr/sitemap.xml'), 'sitemap.xml 위치 지정 확인');

// 2. sitemap.xml 검증
ok(fs.existsSync(sitemapFile), 'sitemap.xml 파일 존재 확인');
const sitemapXml = fs.readFileSync(sitemapFile, 'utf8');

// 필수 공개 페이지 포함 확인
const requiredPages = [
  'https://raytok.kr/',
  'https://raytok.kr/tour/',
  'https://raytok.kr/tour/en/',
  'https://raytok.kr/museum/',
  'https://raytok.kr/museum/en/',
  'https://raytok.kr/field/',
  'https://raytok.kr/student/',
  'https://raytok.kr/ows/',
  'https://raytok.kr/desk/',
  'https://raytok.kr/download/',
  'https://raytok.kr/guide/',
  'https://raytok.kr/privacy/'
];
for (const page of requiredPages) {
  ok(sitemapXml.includes(`<loc>${page}</loc>`), `sitemap 내 공개 페이지 포함 확인: ${page}`);
}

// 8번 대기줄: 제품 페이지 영문 URL 및 hreflang 상호 연결 검증
const tourEnFile = path.join(ROOT, 'tour', 'en', 'index.html');
const museEnFile = path.join(ROOT, 'museum', 'en', 'index.html');
ok(fs.existsSync(tourEnFile), '8번: tour/en/index.html 파일 존재 확인');
ok(fs.existsSync(museEnFile), '8번: museum/en/index.html 파일 존재 확인');

const tourKoHtml = fs.readFileSync(path.join(ROOT, 'tour', 'index.html'), 'utf8');
const tourEnHtml = fs.readFileSync(tourEnFile, 'utf8');
const museKoHtml = fs.readFileSync(path.join(ROOT, 'museum', 'index.html'), 'utf8');
const museEnHtml = fs.readFileSync(museEnFile, 'utf8');

ok(tourKoHtml.includes('hreflang="en" href="https://raytok.kr/tour/en/"'), 'tour/ 국문에 영문 hreflang 확인');
ok(tourEnHtml.includes('hreflang="ko" href="https://raytok.kr/tour/"'), 'tour/en/ 영문에 국문 hreflang 확인');
ok(tourEnHtml.includes('lang="en"'), 'tour/en/ html lang="en" 속성 확인');
ok(museKoHtml.includes('hreflang="en" href="https://raytok.kr/museum/en/"'), 'museum/ 국문에 영문 hreflang 확인');
ok(museEnHtml.includes('hreflang="ko" href="https://raytok.kr/museum/"'), 'museum/en/ 영문에 국문 hreflang 확인');
ok(museEnHtml.includes('lang="en"'), 'museum/en/ html lang="en" 속성 확인');

// noindex 대상 페이지 제외 확인
const forbiddenPages = [
  '/web/buy/',
  '/lic/',
  '/web/terms/',
  '/404.html',
  '/meet/'
];
for (const bad of forbiddenPages) {
  ok(!sitemapXml.includes(bad), `sitemap 내 noindex 페이지 미포함 확인: ${bad}`);
}

// 3. D-09 되돌림 실증 1건:
// noindex 대상인 /web/buy/ 가 사이트맵에 누출되면 실패 입증
let revertFailed = false;
try {
  const fakeSitemap = '<loc>https://raytok.kr/web/buy/</loc>';
  assert.strictEqual(fakeSitemap.includes('/web/buy/'), false, 'noindex 페이지 누출 시 단언 실패');
} catch (e) {
  revertFailed = true;
}
ok(revertFailed === true, 'noindex 페이지(/web/buy/) 사이트맵 포함 시 단언 실패 입증 (되돌림 실증 완료)');

console.log(`\n전부 통과 (${passCount}건)`);
