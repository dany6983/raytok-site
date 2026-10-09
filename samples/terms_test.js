// 줄 15: 이용약관 페이지 (web/terms) ko·en 및 모든 페이지 바닥 링크 검증 시험
import fs from 'node:fs';
import path from 'node:path';

let checks = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error(`  [FAIL] ${msg}`);
    process.exit(1);
  }
  checks++;
  console.log(`  [PASS] ${msg}`);
}

const ROOT = process.cwd();

console.log('=== 줄 15 이용약관 페이지 (web/terms) 및 바닥 링크 검증 시험 ===\n');

// 1. web/terms/index.html 검증
console.log('[Test 1] 국문 이용약관 (web/terms/index.html) 필수 조항 확인');
const koTermsPath = path.join(ROOT, 'web', 'terms', 'index.html');
ok(fs.existsSync(koTermsPath), 'web/terms/index.html 파일 존재');
const koTerms = fs.readFileSync(koTermsPath, 'utf-8');

ok(koTerms.includes('대한민국(Republic of Korea)'), '제1조 서비스 지역: 대한민국 명시 확인');
ok(koTerms.includes('3,000,000자') || koTerms.includes('300만 자'), '제2조 공정사용: 월 3,000,000자 상한 명시 확인');
ok(koTerms.includes('동시 접속 기기') && koTerms.includes('3대') && koTerms.includes('10대'), '제2조 공정사용: 동시 기기 3대/10대 상한 명시 확인');
ok(koTerms.includes('10분') && koTerms.includes('무음'), '제2조 공정사용: 10분 무음 자동 종료 명시 확인');
ok(koTerms.includes('사용 전 전액 환불') && koTerms.includes('7일'), '제3조 환불: 사용 전 7일 이내 전액 환불 명시 확인');
ok(koTerms.includes('사용 후 환불 불가'), '제3조 환불: 사용 후 환불 불가 명시 확인');
ok(koTerms.includes('기계번역') && koTerms.includes('오역') && koTerms.includes('책임') && koTerms.includes('면책'), '제4조 기계번역 오역 한계 및 면책 고지 확인');
ok(koTerms.includes('/web/terms/en/'), '영문 이용약관 전환 링크 존재 확인');
ok(koTerms.includes('/privacy/'), '개인정보 처리방침 링크 존재 확인');

// 2. web/terms/en/index.html 검증
console.log('\n[Test 2] 영문 이용약관 (web/terms/en/index.html) 필수 조항 확인');
const enTermsPath = path.join(ROOT, 'web', 'terms', 'en', 'index.html');
ok(fs.existsSync(enTermsPath), 'web/terms/en/index.html 파일 존재');
const enTerms = fs.readFileSync(enTermsPath, 'utf-8');

ok(enTerms.includes('Republic of Korea'), 'Article 1 Service Region: Republic of Korea 확인');
ok(enTerms.includes('3,000,000 characters'), 'Article 2 Fair Use: 3,000,000 chars limit 확인');
ok(enTerms.includes('3 devices') && enTerms.includes('10'), 'Article 2 Fair Use: 3 / 10 devices limit 확인');
ok(enTerms.includes('Full Refund Before Use'), 'Article 3 Refund: Full refund before use 확인');
ok(enTerms.includes('No Refund After Use'), 'Article 3 Refund: No refund after use 확인');
ok(enTerms.includes('Potential Inaccuracies and Mistranslations') || enTerms.includes('Machine Translation Disclaimers'), 'Article 4 Translation disclaimers 확인');
ok(enTerms.includes('/web/terms/'), '국문 이용약관 전환 링크 존재 확인');

// 3. 루트 terms 리다이렉트 확인
console.log('\n[Test 3] 루트 경로 /terms/ 리다이렉트 확인');
const rootTermsPath = path.join(ROOT, 'terms', 'index.html');
ok(fs.existsSync(rootTermsPath), 'terms/index.html 파일 존재');
const rootTerms = fs.readFileSync(rootTermsPath, 'utf-8');
ok(rootTerms.includes('/web/terms/'), 'terms/index.html -> /web/terms/ 리다이렉트 확인');

// 4. 모든 주요 화면 바닥의 이용약관 링크 확인
console.log('\n[Test 4] 모든 대상 페이지 바닥(footer) 이용약관 링크 확인');
const targetPages = [
  'index.html',
  'desk/index.html',
  'field/index.html',
  'tour/index.html',
  'student/index.html',
  'ows/index.html',
  'tools/build_home.py',
  'web/host/index.html',
  'web/desk/index.html',
  'web/verify/index.html',
  'web/listener/index.html',
  'lic/index.html',
  'privacy/index.html',
  'web/privacy/index.html'
];

targetPages.forEach(relPath => {
  const filePath = path.join(ROOT, relPath);
  ok(fs.existsSync(filePath), `${relPath} 파일 존재`);
  const content = fs.readFileSync(filePath, 'utf-8');
  ok(content.includes('/web/terms/') || content.includes('/terms/'), `${relPath} 바닥에 이용약관 링크 포함 확인`);
});

console.log(`\n전부 통과 (${checks}건)`);
