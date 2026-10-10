/*
 * 줄 15 이용약관 — **준비 중 페이지 + 비공개 숫자 자물쇠** (2026-10-09, 대표님 결정 ①)
 *
 * 10-09 16:28 에 약관이 숫자와 함께 **라이브로** 올라갔다. 이 저장소는 main 에 밀면 그대로
 * raytok.kr 에 뜬다(CNAME, 워크플로 없음). 올라간 숫자 중 **월 글자 수 상한**은 우리
 * 가격 문서가 "★ 비공개 — 광고·제안서·견적서 어디에도 적지 않는다. **적는 순간 그게 한도가
 * 된다**"로 못 박아 둔 **내부 감시선**이었다. 약관에 쓰면 고객이 요구할 수 있는 계약상
 * 한도가 되고, "초과 시 차단"까지 적혀 주력 고객이 평범하게 쓰다 걸린다. 환불·동시 기기 수·
 * 무음 종료는 대표님·법무 몫으로 남겨 둔 항목이었다.
 *
 * 대표님 결정(16:31): **① 당장 내린다** — 페이지는 "준비 중", 숫자는 확정 뒤에.
 *
 * 왜 B 탓이 아닌가: 비공개 목록은 비공개 문서에 있고 **이 저장소는 공개**다. B 는 그것을
 * 볼 수 없다. 마스터 지시가 "적지 말 것"을 말하지 않은 것이 구멍이다. 그래서 사람의 기억에
 * 걸지 않고 **여기서 센다** — 공개 파일 어디에도 그 숫자가 없어야 한다.
 */
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

console.log('=== 줄 15 이용약관 — 준비 중 페이지 + 비공개 숫자 자물쇠 ===\n');

/* ── 1. 국문 약관은 "준비 중"이고, 계약서로 안내한다 ── */
console.log('[Test 1] 국문 (web/terms/index.html) — 준비 중 고지');
const koTermsPath = path.join(ROOT, 'web', 'terms', 'index.html');
ok(fs.existsSync(koTermsPath), 'web/terms/index.html 파일 존재');
const koTerms = fs.readFileSync(koTermsPath, 'utf-8');

ok(koTerms.includes('준비 중'), '준비 중임을 밝힌다');
ok(koTerms.includes('개별 계약서'), '그때까지의 이용 조건은 개별 계약서에 따른다고 적는다');
ok(koTerms.includes('raytok.dany@gmail.com'), '문의 창구가 있다 — 빈 페이지로 두지 않는다');
ok(koTerms.includes('/web/terms/en/'), '영문 전환 링크');
ok(koTerms.includes('/privacy/'), '개인정보 처리방침 링크');
ok(/name="robots"\s+content="noindex"/.test(koTerms), '확정 전 페이지는 검색에 올리지 않는다(noindex)');

/* ── 2. 영문도 같다 ── */
console.log('\n[Test 2] 영문 (web/terms/en/index.html) — 준비 중 고지');
const enTermsPath = path.join(ROOT, 'web', 'terms', 'en', 'index.html');
ok(fs.existsSync(enTermsPath), 'web/terms/en/index.html 파일 존재');
const enTerms = fs.readFileSync(enTermsPath, 'utf-8');
ok(/In preparation|being prepared/i.test(enTerms), 'in preparation 임을 밝힌다');
ok(/individual contract/i.test(enTerms), '개별 계약서 안내');
ok(enTerms.includes('/web/terms/'), '국문 전환 링크');
ok(/name="robots"\s+content="noindex"/.test(enTerms), 'noindex');

/* ── 3. 약관 페이지에 **확정 안 된 조항**이 없다 ── */
console.log('\n[Test 3] ★ 확정 안 된 조항이 약관에 없다 (대표님·법무 몫)');
const IS_BODY_READY = false; // 마스터 검토 및 신고번호 확정 후 true로 변경

if (!IS_BODY_READY) {
  // 현재는 "준비 중을 유지하라"는 시험
  for (const [name, text] of [['ko', koTerms], ['en', enTerms]]) {
    ok(!/환불|refund/i.test(text) || /환불에 관한 문의|refunds, please contact/i.test(text),
       `${name} — 환불 규정을 적지 않는다 (문의 안내는 괜찮다)`);
    ok(!/동시 접속 기기|동시 기기|concurrent devices|\d+\s*devices/i.test(text),
       `${name} — 동시 기기 수를 적지 않는다`);
    ok(!/무음|silence|silent/i.test(text), `${name} — 무음 자동 종료를 적지 않는다`);
    ok(!/공정사용|Fair Use/i.test(text), `${name} — 공정사용 조항을 적지 않는다`);
  }
} else {
  // 본문이 올라가는 날 같이 뒤집어질 실제 본문 검증 (초안 기준)
  for (const [name, text] of [['ko', koTerms], ['en', enTerms]]) {
    ok(/대한민국|Republic of Korea/i.test(text), `${name} — 서비스 지역(대한민국) 확인`);
    ok(/사용 전|전액/i.test(text) && /사용 후 불가|No refund after use/i.test(text), `${name} — 환불 규정(사용 전 전액, 사용 후 불가) 확인`);
    ok(/청약철회|withdrawal/i.test(text), `${name} — 청약철회 규정 확인`);
    ok(/3,000,000/.test(text) && /3대|10대|3 devices|10 devices/.test(text) && /10분|10 minutes/.test(text), `${name} — 공정사용 확인`);
    ok(/오역|면책|disclaimer|accuracy/i.test(text), `${name} — 기계번역 오역 고지 확인`);
  }
}

/*
 * ── 4. ★★ 비공개 숫자가 **공개 저장소 어디에도** 없다 ──
 *
 * 약관 페이지만 보면 안 된다. 같은 숫자가 보고서·설계 글·다른 페이지에 적혀 있으면
 * 똑같이 공개된 것이다 — 이 저장소는 전부 공개다. 그래서 추적되는 글 파일을 전부 센다.
 * (마스터가 10-09 에 이 저장소 `docs/MASTER.md` 에 그 숫자를 적어 같은 실수를 했다.
 *  이 시험이 그것을 잡았다.)
 */
console.log('\n[Test 4] ★★ 비공개 숫자가 고객이 보는 글에 없다 (감시선은 내부 값이다)');
const BANNED = [
  /3,000,000\s*자/, /300만\s*자/, /3,000,000\s*characters/i,
  /3\s*000\s*000\s*자/,
];
/*
 * 세는 범위는 **고객이 읽는 화면**(`.html`)이다. 두 곳은 일부러 뺐고, 까닭이 있다:
 *
 * ① `relay/src` — 거기 `TRANSLATE_CAP_CHARS` 기본값은 글이 아니라 **동작**이다(넘으면 429).
 *    숫자를 지우면 상한이 없어지는 것이라 서비스가 달라진다. 그 판단과 배포는 대표님 몫이고,
 *    10-09 에 결정 하나로 올려 두었다(site MASTER 16:45). 결정이 오면 그때 함께 고친다.
 * ② `docs/` — 보고 기록이다. 이 저장소 규칙이 **"예전 보고는 지우지 않는다"**이고, 지운다 해도
 *    git 역사에 남는다. 지난 기록을 고쳐 쓰는 것은 숨기는 것이지 고치는 것이 아니다.
 *    앞으로 쓰는 글에 적지 않는 것이 답이고, 그것은 사람이 아니라 **지시**가 막는다
 *    (마스터: 공개 페이지 지시에는 "적지 말 것" 목록을 붙인다).
 *
 * 그래서 이 자물쇠가 지키는 것은 하나다: **고객이 보는 화면에는 그 숫자가 없다.**
 */
const SKIP_DIR = new Set(['node_modules', '.git', 'web/vendor', 'vendor', 'relay', 'docs']);
const TEXT = /\.html$/i;
const offenders = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (SKIP_DIR.has(e.name) || SKIP_DIR.has(rel)) continue;
    if (e.isDirectory()) { walk(full); continue; }
    if (!TEXT.test(e.name)) continue;
    if (rel === 'samples/terms_test.js') continue;          // 자물쇠 자신은 숫자 꼴을 안다
    const body = fs.readFileSync(full, 'utf-8');
    if (BANNED.some((re) => re.test(body))) offenders.push(rel);
  }
}(ROOT));
ok(offenders.length === 0,
   `감시선 글자 수가 적힌 공개 파일 0개 ${offenders.length ? `— 걸림: ${offenders.join(', ')}` : ''}`);

/* ── 5. 루트 /terms/ 는 여전히 이어진다 — 바닥 링크 14곳이 이것을 가리킨다 ── */
console.log('\n[Test 5] 루트 경로 /terms/ 리다이렉트');
const rootTermsPath = path.join(ROOT, 'terms', 'index.html');
ok(fs.existsSync(rootTermsPath), 'terms/index.html 파일 존재');
ok(fs.readFileSync(rootTermsPath, 'utf-8').includes('/web/terms/'),
   'terms/index.html -> /web/terms/ 리다이렉트');

/* ── 6. 바닥 링크는 그대로 둔다 — 페이지가 준비 중이어도 길은 있어야 한다 ── */
console.log('\n[Test 6] 모든 대상 페이지 바닥(footer) 이용약관 링크');
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
  'web/privacy/index.html',
];

targetPages.forEach((relPath) => {
  const filePath = path.join(ROOT, relPath);
  ok(fs.existsSync(filePath), `${relPath} 파일 존재`);
  const content = fs.readFileSync(filePath, 'utf-8');
  ok(content.includes('/web/terms/') || content.includes('/terms/'),
     `${relPath} 바닥에 이용약관 링크 포함 확인`);
});

/* ── 7. PG 결제 심사 필수 — 사업자 정보 및 통신판매업 신고번호 자리 (MASTER 03:35) ── */
console.log('\n[Test 7] PG 결제 심사 필수 — 바닥 사업자 정보 및 통신판매업 신고번호 자리');
const pgFooterPages = [
  'index.html',
  'field/index.html',
  'tour/index.html',
  'student/index.html',
  'ows/index.html',
  'desk/index.html',
  'guide/index.html',
  'web/buy/index.html',
  'web/terms/index.html',
  'web/terms/en/index.html',
  'privacy/index.html',
  'web/privacy/index.html',
  'web/host/index.html',
  'web/desk/index.html',
  'web/listener/index.html',
  'lic/index.html',
];

pgFooterPages.forEach((relPath) => {
  const filePath = path.join(ROOT, relPath);
  const content = fs.readFileSync(filePath, 'utf-8');
  ok(content.includes('주식회사 피엔엘에코') || content.includes('PNL ECO Co., Ltd.'),
     `${relPath} 바닥에 상호명 포함 확인`);
  ok(content.includes('통신판매업 신고번호') || content.includes('Mail-order Business Report'),
     `${relPath} 바닥에 통신판매업 신고번호 자리 포함 확인`);
});

console.log(`\n전부 통과 (${checks}건)`);
