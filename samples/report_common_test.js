const assert = require('assert');
const {
  pad2,
  escapeHtml,
  buildReportText,
  buildReportHtml,
  generateReportFilename
} = require('../web/common/report');

console.log('=== L2 청취 페이지 공통 기록 저장 (web/common/report.js) 단위 시험 ===');

let passCount = 0;
function ok(cond, desc) {
  assert(cond, desc);
  passCount++;
  console.log('  [PASS] ' + desc);
}

const mockLines = [
  { at: 1759800000000, text: '안녕하세요. 회의를 시작합니다.', tr: { en: 'Hello. We start the meeting.', ar: 'مرحبا. نبدأ الاجتماع.' } },
  { at: 1759800005000, text: '번역이 아직 없는 줄입니다.', tr: {} },
  { at: 1759800010000, text: '안전한 <b>태그</b> & "따옴표" 테스트 <script>alert(1)</script>', tr: { en: 'Safe <b>tag</b> & "quotes" test <script>alert(1)</script>' } }
];

// --- 1. 파일 이름 생성 3 x 3 검증 ---
{
  const d = new Date(1759800000000);
  const fnBothTxt = generateReportFilename({ date: d, contentMode: 'both', langCode: 'en', ext: 'txt' });
  ok(/^raytok_\d{8}_\d{4}_en\.txt$/.test(fnBothTxt), '기본 both TXT: 기존 정규식 raytok_YYYYMMDD_HHMM_en.txt 일치');

  const fnSrcTxt = generateReportFilename({ date: d, contentMode: 'src', langCode: 'en', ext: 'txt' });
  ok(/^raytok_\d{8}_\d{4}_src_en\.txt$/.test(fnSrcTxt), 'src TXT: raytok_YYYYMMDD_HHMM_src_en.txt 일치');

  const fnTransDoc = generateReportFilename({ date: d, contentMode: 'trans', langCode: 'en', ext: 'doc' });
  ok(/^raytok_\d{8}_\d{4}_trans_en\.doc$/.test(fnTransDoc), 'trans DOC: raytok_YYYYMMDD_HHMM_trans_en.doc 일치 (tr은 터키어 코드와 겹치므로 trans 사용)');

  const fnBothPdf = generateReportFilename({ date: d, contentMode: 'both', langCode: 'ja', ext: 'pdf' });
  ok(/^raytok_\d{8}_\d{4}_ja\.pdf$/.test(fnBothPdf), 'both PDF: raytok_YYYYMMDD_HHMM_ja.pdf 일치');
}

// --- 2. 내용 3종 (both, src, tr) TXT 검증 ---
{
  // both
  const txtBoth = buildReportText({ lines: mockLines, srcLang: 'ko', targetLang: 'en', langName: 'English', contentMode: 'both' });
  ok(txtBoth.includes('Lines: 3'), 'Lines 수 일치');
  ok(txtBoth.includes('안녕하세요. 회의를 시작합니다.') && txtBoth.includes('Hello. We start the meeting.'), 'both: 원문과 번역문 둘 다 포함');
  ok(txtBoth.includes('번역이 아직 없는 줄입니다.'), 'both: 번역 없는 줄도 원문 보존');

  // src
  const txtSrc = buildReportText({ lines: mockLines, srcLang: 'ko', targetLang: 'en', langName: 'English', contentMode: 'src' });
  ok(txtSrc.includes('안녕하세요. 회의를 시작합니다.'), 'src: 원문 포함');
  ok(!txtSrc.includes('Hello. We start the meeting.'), 'src: 번역문 제외');

  // tr
  const txtTr = buildReportText({ lines: mockLines, srcLang: 'ko', targetLang: 'en', langName: 'English', contentMode: 'trans' });
  ok(txtTr.includes('Hello. We start the meeting.'), 'trans: 번역문 포함');
  ok(!txtTr.includes('안녕하세요. 회의를 시작합니다.'), 'trans: 번역이 있는 줄은 원문 제외');
  ok(txtTr.includes('번역이 아직 없는 줄입니다.'), 'trans: 번역이 없는 줄은 원문 보존(누락 없음)');
}

// --- 3. HTML/DOC 문서 검증 및 보안(XSS) 이스케이프 ---
{
  const html = buildReportHtml({ lines: mockLines, srcLang: 'ko', targetLang: 'en', langName: 'English', contentMode: 'both' });
  ok(!html.includes('<script>alert(1)</script>'), 'HTML 이스케이프: script 태그 실행 방지');
  ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'HTML 이스케이프: 엔티티 변환 확인');
  ok(html.includes('@media print'), '인쇄 스타일 @media print 포함');
  ok(html.includes('page-break-inside: avoid'), '페이지 넘김 줄바꿈 방지 스타일 포함');
}

// --- 4. RTL 언어(ar) 지원 검증 ---
{
  const htmlAr = buildReportHtml({ lines: mockLines, srcLang: 'ko', targetLang: 'ar', langName: 'Arabic', contentMode: 'both', isRtl: true });
  ok(htmlAr.includes('dir="rtl"'), 'RTL 언어: html/태그에 dir="rtl" 속성 적용');
  ok(htmlAr.includes('مرحبا. نبدأ الاجتماع.'), '아랍어 번역문 포함');
}

console.log(`\n전부 통과 (${passCount}건)`);
process.exit(0);
