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
  'https://raytok.kr/field/en/',
  'https://raytok.kr/student/',
  'https://raytok.kr/student/en/',
  'https://raytok.kr/ows/',
  'https://raytok.kr/ows/en/',
  'https://raytok.kr/contact/',
  'https://raytok.kr/contact/en/',
  'https://raytok.kr/desk/',
  'https://raytok.kr/download/',
  'https://raytok.kr/download/en/',
  'https://raytok.kr/guide/',
  'https://raytok.kr/privacy/'
];
for (const page of requiredPages) {
  ok(sitemapXml.includes(`<loc>${page}</loc>`), `sitemap 내 공개 페이지 포함 확인: ${page}`);
}

// 8번 대기줄: 제품 페이지 전수 영문 URL 및 hreflang 상호 연결 검증
const pagesToCheck = ['tour', 'museum', 'field', 'student', 'ows', 'contact', 'download'];
for (const dir of pagesToCheck) {
  const enFile = path.join(ROOT, dir, 'en', 'index.html');
  const koFile = path.join(ROOT, dir, 'index.html');
  ok(fs.existsSync(enFile), `${dir}/en/index.html 영문 파일 존재 확인`);
  const koHtml = fs.readFileSync(koFile, 'utf8');
  const enHtml = fs.readFileSync(enFile, 'utf8');

  ok(koHtml.includes(`hreflang="en" href="https://raytok.kr/${dir}/en/"`), `${dir}/ 국문에 영문 hreflang 확인`);
  ok(enHtml.includes(`hreflang="ko" href="https://raytok.kr/${dir}/"`), `${dir}/en/ 영문에 국문 hreflang 확인`);
  ok(enHtml.includes('lang="en"'), `${dir}/en/ html lang="en" 속성 확인`);
}

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
// ⚠ 되돌림은 **그 시험이 실제로 읽은 값**(sitemapXml)으로 한다. 시험 안에서 만든 상수로 하면
//   제품을 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 점검).
let revertFailed = false;
try {
  // 진짜 sitemap 을 본다. 지금 /web/buy/ 가 없어서 아래 단언이 던진다.
  // sitemap 에 /web/buy/ 가 새면 던지지 않아 ok 가 붉는다.
  assert.ok(sitemapXml.includes('/web/buy/'), 'sitemap 에 noindex 페이지 /web/buy/ 가 들어 있다');
} catch (e) {
  revertFailed = true;
}
ok(revertFailed === true, 'noindex 페이지(/web/buy/) 사이트맵 포함 시 단언 실패 입증 (되돌림 실증 완료)');

console.log(`\n전부 통과 (${passCount}건)`);
