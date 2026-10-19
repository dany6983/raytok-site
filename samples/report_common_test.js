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

// --- 5. L4-3 원고 모드: 줄의 출처 표시(label) · 본문 뒤 꼬리 줄(footer) ---
{
  const scriptLines = [
    { at: 1759800000000, text: '안전모를 착용하십시오.', tr: { en: 'Wear a hard hat.' }, label: '(원고 1)' },
    { at: 1759800005000, text: '비상구를 확인하세요.', tr: {}, label: '(원고 <3>)' }
  ];
  const footer = ['건너뛴 문단: 2, 4 <끝>'];
  const args = { lines: scriptLines, srcLang: 'ko', targetLang: 'en', langName: 'English', footer };

  const both = buildReportText({ ...args, contentMode: 'both' });
  ok(/\] \(원고 1\) 안전모를 착용하십시오\.\r\nWear a hard hat\.\r\n/.test(both), 'label both: 시각 뒤·원문 앞에 출처, 번역은 다음 줄');
  ok(/\] \(원고 1\) 안전모를 착용하십시오\./.test(buildReportText({ ...args, contentMode: 'src' })), 'label src: 원문 앞에 출처');
  const trans = buildReportText({ ...args, contentMode: 'trans' });
  ok(/\] \(원고 1\) Wear a hard hat\./.test(trans) && /\] \(원고 <3>\) 비상구를 확인하세요\./.test(trans), 'label trans: 번역 앞에 출처 · 번역 없는 줄은 원문 앞에');
  ok(both.endsWith('비상구를 확인하세요.\r\n\r\n건너뛴 문단: 2, 4 <끝>\r\n'), 'footer TXT: 본문 뒤 한 줄');

  const html = buildReportHtml({ ...args, contentMode: 'both' });
  ok(html.includes('<div class="line-src">(원고 1) 안전모를 착용하십시오.</div>') && html.includes('(원고 &lt;3&gt;) 비상구를 확인하세요.'), 'label HTML: 출처 포함 · 이스케이프');
  ok(html.includes('건너뛴 문단: 2, 4 &lt;끝&gt;</p>') && html.indexOf('report-footer') > html.indexOf('</table>'), 'footer HTML: 표 뒤 한 줄 · 이스케이프');

  // label·footer 가 없으면 전과 같다(들은 줄 리포트는 바뀌지 않는다)
  const plain = buildReportText({ lines: mockLines, srcLang: 'ko', targetLang: 'en', langName: 'English', contentMode: 'both' });
  ok(/\] 안녕하세요\. 회의를 시작합니다\.\r\nHello\. We start the meeting\./.test(plain) && plain.endsWith('test <script>alert(1)</script>\r\n'), 'label·footer 없음 TXT: 줄 모양·끝이 전과 같다');
  ok(!buildReportHtml({ lines: mockLines, srcLang: 'ko', targetLang: 'en', langName: 'English' }).includes('report-footer'), 'label·footer 없음 HTML: 꼬리 줄 없음');
  ok(buildReportText({ ...args, footer: [] }) === buildReportText({ ...args, footer: null }), '빈 footer = footer 없음');

  // ── 되돌림 실증 (B-BACKLOG "모든 줄에 걸리는 조건: 시험 + 되돌림 1건") ──
  // ⚠ 되돌림은 **실제로 만들어진 글**로 한다. 시험 안에서 만든 상수로 하면 만드는 쪽을
  //   되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검).
  //
  // ① 이스케이프가 빠지면 붉어야 한다. 리포트는 손님이 열어 보는 파일이라, 원고에 꺾쇠가
  //    섞여 있으면 그대로 태그가 된다. 지금 &lt; 로 바뀌어 있어 아래 단언이 던진다.
  let revertEscapeFailed = false;
  try {
    assert.ok(html.includes('<script>alert(1)</script>'), '리포트 HTML 에 날 꺾쇠가 그대로 들어갔다');
  } catch (e) { revertEscapeFailed = true; }
  ok(revertEscapeFailed === true, '이스케이프를 빼면 붉어진다 (되돌림 실증 1)');

  // ② 줄 끝이 CRLF 가 아니면 붉어야 한다 — 받는 쪽이 메모장이다(관공서·학교).
  let revertCrlfFailed = false;
  try {
    assert.ok(!/\r\n/.test(plain), `리포트 TXT 에 CRLF 가 없다`);
  } catch (e) { revertCrlfFailed = true; }
  ok(revertCrlfFailed === true, 'CRLF 를 LF 로 바꾸면 붉어진다 — 메모장에서 한 줄로 붙는다 (되돌림 실증 2)');
}


/* ── B 31 사후 정확본 자리 (2026-10-19, 마스터 NOW) ───────────────────────────
 * 보는 것 셋:
 *   ① `accurate` 를 **안 주면** 전과 글자 하나 다르지 않다 (= 꺼진 스위치면 칸 없음)
 *   ② 주면 머리글에 상태 한 줄 · 줄에 `acc` 가 있으면 **원문 바로 아래**
 *   ③ 모르는 상태는 **적지 않는다** (지어내지 않는다, §20)
 */
console.log('\n=== B 31 사후 정확본 자리 ===');
const accLines = [
  { at: 1759800000000, text: '십오 미터입니다', acc: '十五米입니다', tr: { en: 'It is fifteen metres.' } },
  { at: 1759800060000, text: '다음으로 넘어갑니다', tr: { en: 'Moving on.' } }
];
const bare = accLines.map(({ acc, ...rest }) => rest);

/* ① 안 주면 전과 같다 — 같은 줄로 두 번 만들어 **글자 단위로** 견준다 */
const before = buildReportText({ lines: bare, targetLang: 'en' });
const afterNoAcc = buildReportText({ lines: bare, targetLang: 'en', accurate: null });
ok(before === afterNoAcc, 'accurate 를 안 주면 글자 하나 다르지 않다 (칸 없음)');
ok(!/Accurate/.test(before), '머리글에 정확본 줄이 없다');
const htmlNoAcc = buildReportHtml({ lines: bare, targetLang: 'en' });
/* `.line-acc` **스타일 규칙**은 늘 있다(쓰지 않아도 해롭지 않다). 없어야 하는 것은 **칸**이다 —
   `<div class="line-acc">` 요소와 머리글의 정확본 칸. 처음에 스타일까지 금지해 붉어졌다. */
ok(!/<div class="line-acc">/.test(htmlNoAcc) && !/<strong>정확본:<\/strong>/.test(htmlNoAcc),
   'HTML(PDF·DOC)에도 정확본 칸이 없다 (스타일 규칙은 쓰지 않을 뿐 남아 있다)');

/* ② 주면 머리글 + 줄 */
const running = buildReportText({ lines: accLines, targetLang: 'en', accurate: { state: 'running' } });
ok(running.includes('Accurate: processing'), '처리 중이면 머리글에 한 줄');
const doneTxt = buildReportText({ lines: accLines, targetLang: 'en', accurate: { state: 'done', lines: 2 } });
ok(doneTxt.includes('Accurate: done (2 lines)'), '끝이면 줄 수까지 적는다');
ok(/십오 미터입니다[\s\S]*※ 十五米입니다/.test(doneTxt),
   '정확본 글이 **실시간 줄 바로 아래**에 붙는다 (원문 자리 — 번역이 아니다)');
const trOnly = buildReportText({ lines: accLines, targetLang: 'en', contentMode: 'trans', accurate: { state: 'done' } });
ok(!trOnly.includes('十五米'), '번역만 보기에서는 정확본을 넣지 않는다 (원문 자리이므로)');
const srcOnly = buildReportText({ lines: accLines, targetLang: 'en', contentMode: 'src', accurate: { state: 'done' } });
ok(srcOnly.includes('※ 十五米입니다'), '원문만 보기에는 들어간다');
const htmlAcc = buildReportHtml({ lines: accLines, targetLang: 'en', accurate: { state: 'running' } });
ok(/class="line-acc"/.test(htmlAcc) && htmlAcc.includes('十五米입니다'), 'HTML 에도 정확본 줄이 있다');
ok(/<strong>정확본:<\/strong>/.test(htmlAcc), 'HTML 머리글에 정확본 상태');

/* ③ 모르는 상태·빈 글은 적지 않는다 */
const weird = buildReportText({ lines: bare, targetLang: 'en', accurate: { state: 'maybe' } });
ok(!/Accurate/.test(weird), "모르는 상태('maybe')는 적지 않는다 — 지어내지 않는다 (§20)");
const blankAcc = buildReportText({ lines: [{ at: 1759800000000, text: '가', acc: '   ' }], targetLang: 'en', accurate: { state: 'done' } });
ok(!blankAcc.includes('※'), '정확본이 빈 글이면 칸을 만들지 않는다 (D-70: 모름을 "없음"으로 적지 않는다)');

/* 되돌림 실증 (D-09) — 정확본 글을 **값으로** 넣었다 빼면 결과가 달라진다 */
const withAcc = buildReportText({ lines: accLines, targetLang: 'en', accurate: { state: 'done' } });
ok(withAcc !== buildReportText({ lines: bare, targetLang: 'en', accurate: { state: 'done' } }),
   'acc 를 떼면 결과가 달라진다 — 위 단언들이 글자 비교가 아니라 **값**에 걸려 있다 (되돌림 실증)');

console.log(`\n전부 통과 (${passCount}건)`);
process.exit(0);
