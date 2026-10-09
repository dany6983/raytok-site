// 줄 16: 사용 안내 페이지 (guide/) ko·en 정리 검증 시험
const fs = require('fs');
const path = require('path');

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

console.log('=== 줄 16 사용 안내 페이지 (guide/) 국문·영문 검증 시험 ===\n');

// 1. guide/index.html 국문 검증
console.log('[Test 1] 국문 사용 안내 (guide/index.html) 필수 항목 확인');
const koGuidePath = path.join(ROOT, 'guide', 'index.html');
ok(fs.existsSync(koGuidePath), 'guide/index.html 파일 존재');
const koGuide = fs.readFileSync(koGuidePath, 'utf-8');

// 강사 3단계
ok(koGuide.includes('웹 강사 화면') && koGuide.includes('web/host'), '강사 화면 섹션 명시 확인');
ok(koGuide.includes('1단계: 원고 준비') && koGuide.includes('HWPX'), '강사 1단계: 원고 준비(HWPX 포함) 확인');
ok(koGuide.includes('2단계: 강의 시작 및 청취자 초대'), '강사 2단계: 강의 시작 및 초대 확인');
ok(koGuide.includes('3단계: 실시간 진행 및 종료 리포트') && koGuide.includes('CSV'), '강사 3단계: 실시간 진행 및 리포트/CSV/방닫기 확인');

// 청취자 3단계
ok(koGuide.includes('청취자 화면') && koGuide.includes('web/listener'), '청취자 화면 섹션 명시 확인');
ok(koGuide.includes('1단계: 세션 참여'), '청취자 1단계: 세션 참여 확인');
ok(koGuide.includes('2단계: 실시간 자막 및 음성 청취'), '청취자 2단계: 실시간 자막/음성 청취 확인');
ok(koGuide.includes('3단계: 기록 저장'), '청취자 3단계: 로컬 기록 저장 확인');

// Desk 3단계
ok(koGuide.includes('RayTok Desk') && koGuide.includes('화상회의'), 'Desk 섹션 명시 확인');
ok(koGuide.includes('1단계: 실행 및 이용권 인증'), 'Desk 1단계: 실행 및 인증 확인');
ok(koGuide.includes('2단계: 소리 설정 및 세션 연결'), 'Desk 2단계: 소리 설정 확인');
ok(koGuide.includes('3단계: 실시간 자막 중계 및 무결성 보관'), 'Desk 3단계: 중계 및 해시 체인 무결성 보관 확인');

// Desk 회의 앱별 소리 잡기 (이름·효과만)
ok(koGuide.includes('Zoom') && koGuide.includes('Teams') && koGuide.includes('Meet'), 'Desk 회의 앱 3종(Zoom, Teams, Meet) 명시 확인');
ok(koGuide.includes('분리 캡처') || koGuide.includes('하울링') || koGuide.includes('루프백'), 'Desk 회의 앱 음향 캡처 효과 기술 확인');

// 바닥 링크
ok(koGuide.includes('/web/terms/'), '바닥에 이용약관 링크 확인');
ok(koGuide.includes('/privacy/'), '바닥에 개인정보 처리방침 링크 확인');

// 2. guide/en/index.html 영문 검증
console.log('\n[Test 2] 영문 사용 안내 (guide/en/index.html) 필수 항목 확인');
const enGuidePath = path.join(ROOT, 'guide', 'en', 'index.html');
ok(fs.existsSync(enGuidePath), 'guide/en/index.html 파일 존재');
const enGuide = fs.readFileSync(enGuidePath, 'utf-8');

ok(enGuide.includes('Web Presenter Screen') && enGuide.includes('web/host'), 'English Presenter Screen section 확인');
ok(enGuide.includes('Step 1: Prepare Scripts') && enGuide.includes('HWPX'), 'English Presenter Step 1 확인');
ok(enGuide.includes('Step 2: Start Lecture and Invite Audience'), 'English Presenter Step 2 확인');
ok(enGuide.includes('Step 3: Live Progression and Final Report'), 'English Presenter Step 3 확인');

ok(enGuide.includes('Audience Listener Screen') && enGuide.includes('web/listener'), 'English Listener section 확인');
ok(enGuide.includes('Step 1: Join Session'), 'English Listener Step 1 확인');
ok(enGuide.includes('Step 2: Live Captions and Audio'), 'English Listener Step 2 확인');
ok(enGuide.includes('Step 3: Save Transcript'), 'English Listener Step 3 확인');

ok(enGuide.includes('RayTok Desk Meeting'), 'English Desk section 확인');
ok(enGuide.includes('Step 1: Launch and License Verification'), 'English Desk Step 1 확인');
ok(enGuide.includes('Step 2: Audio Configuration and Connection'), 'English Desk Step 2 확인');
ok(enGuide.includes('Step 3: Live Relaying and Tamper-Proof Storage'), 'English Desk Step 3 확인');

ok(enGuide.includes('Zoom') && enGuide.includes('Teams') && enGuide.includes('Meet'), 'English Meeting apps (Zoom, Teams, Meet) 확인');
ok(enGuide.includes('/web/terms/en/'), 'English Terms of Service link 확인');
ok(enGuide.includes('/privacy/'), 'English Privacy Policy link 확인');

// 3. web/guide/index.html 리다이렉트 확인
console.log('\n[Test 3] web/guide/ 리다이렉트 확인');
const webGuidePath = path.join(ROOT, 'web', 'guide', 'index.html');
ok(fs.existsSync(webGuidePath), 'web/guide/index.html 파일 존재');
const webGuide = fs.readFileSync(webGuidePath, 'utf-8');
ok(webGuide.includes('/guide/'), 'web/guide/index.html -> /guide/ 리다이렉트 확인');

console.log(`\n전부 통과 (${checks}건)`);
