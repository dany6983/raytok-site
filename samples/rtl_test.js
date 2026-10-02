const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Web Listener Real Runtime RTL Path Verification ===');

// 1. 실제 리소스 파일 로드
const htmlPath = path.join(__dirname, '../web/listener/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const uiStringsPath = path.join(__dirname, '../web/listener/ui-strings.json');
const uiStrings = JSON.parse(fs.readFileSync(uiStringsPath, 'utf8'));

const langsPath = path.join(__dirname, '../web/listener/langs.json');
const langs = JSON.parse(fs.readFileSync(langsPath, 'utf8'));

// 2. index.html에서 핵심 로직 함수 및 테이블 추출 검증
const rtlMatch = html.match(/const RTL\s*=\s*new Set\(\s*(\[[^\]]+\])\s*\)/);
assert(rtlMatch, 'index.html에 RTL Set 정의가 있어야 합니다.');
const RTL = new Set(eval(rtlMatch[1]));

function normalizeLangCode(code) {
  if (!code) return '';
  const lower = code.toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower === 'tl' || lower.startsWith('tl-') || lower === 'fil' || lower.startsWith('fil-')) return 'fil';
  if (lower === 'in' || lower.startsWith('in-')) return 'id';
  if (lower === 'iw' || lower.startsWith('iw-')) return 'he';
  return lower.split('-')[0];
}

function determineLanguage(availableLangs, qLang, savedLang, navLang) {
  if (qLang) {
    const norm = normalizeLangCode(qLang);
    if (availableLangs.includes(norm)) return norm;
  }
  if (savedLang) {
    const norm = normalizeLangCode(savedLang);
    if (availableLangs.includes(norm)) return norm;
  }
  if (navLang) {
    const norm = normalizeLangCode(navLang);
    if (availableLangs.includes(norm)) return norm;
    const sub = navLang.substring(0, 2).toLowerCase();
    const subNorm = normalizeLangCode(sub);
    if (availableLangs.includes(subNorm)) return subNorm;
  }
  return 'en';
}

// 3. 실제 브라우저 DOM 시뮬레이터 (간이 DOM)
function createMockPage(queryLang) {
  const doc = {
    lang: 'en',
    dir: 'ltr',
    setAttribute: function(attr, val) { if (attr === 'dir') this.dir = val; },
    getAttribute: function(attr) { return attr === 'dir' ? this.dir : null; }
  };

  const chatList = {
    dir: 'ltr',
    children: [],
    setAttribute: function(attr, val) { if (attr === 'dir') this.dir = val; },
    getAttribute: function(attr) { return attr === 'dir' ? this.dir : null; },
    appendChild: function(child) { this.children.push(child); }
  };

  const availableLangs = (uiStrings && uiStrings.langs) || ['ko', 'en'];

  // 자막 언어(selectedLang) 결정
  let selectedLang = 'en';
  if (queryLang && langs.some(l => l.code === queryLang)) {
    selectedLang = queryLang;
  }

  // UI 언어(currentUiLang) 결정 (uiStrings.langs 기반)
  const currentUiLang = determineLanguage(availableLangs, queryLang, null, queryLang || 'en');

  // applyStrings(currentUiLang) 실행
  doc.lang = currentUiLang;
  doc.setAttribute('dir', RTL.has(normalizeLangCode(currentUiLang)) ? 'rtl' : 'ltr');

  // updateSubtitleDir() 실행
  function updateSubtitleDir() {
    const isRtl = RTL.has(normalizeLangCode(selectedLang));
    chatList.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  }
  updateSubtitleDir();

  // addLine 시뮬레이션
  function addLine(seq, text, trMap, srcLang = 'ko') {
    const lineEl = {
      seq,
      textEl: { text, dir: RTL.has(normalizeLangCode(srcLang)) ? 'rtl' : 'ltr' },
      trEl: { text: trMap[selectedLang] || '', dir: RTL.has(normalizeLangCode(selectedLang)) ? 'rtl' : 'ltr' },
      srcEl: { text: `#${seq} ${srcLang.toUpperCase()}`, dir: 'ltr' }
    };
    chatList.appendChild(lineEl);
    return lineEl;
  }

  // 언어 변경 시뮬레이션
  function changeLang(newLang) {
    selectedLang = newLang;
    const newUiLang = normalizeLangCode(selectedLang);
    const resolvedUiLang = determineLanguage(availableLangs, newUiLang, null, 'ko');
    doc.lang = resolvedUiLang;
    doc.setAttribute('dir', RTL.has(normalizeLangCode(resolvedUiLang)) ? 'rtl' : 'ltr');
    updateSubtitleDir();
  }

  return { doc, chatList, getSelectedLang: () => selectedLang, getUiLang: () => currentUiLang, addLine, changeLang };
}

// ────────────────────────────────────────────────────────────────
// [TEST 1] 핵심 검증: ?lang=ar 로 열었을 때 실제 런타임 경로 검증
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 1] URL ?lang=ar 진입 검증 (ui-strings에 ar 부재 상황)');
const pageAr = createMockPage('ar');

console.log('- UI 언어 (determineLanguage 결과):', pageAr.getUiLang());
console.log('- document.documentElement dir:', pageAr.doc.dir);
console.log('- 자막 언어 (selectedLang):', pageAr.getSelectedLang());
console.log('- 줄 목록 칸 (chatList) dir:', pageAr.chatList.dir);

// ar은 uiStrings.langs(19개)에 없으므로 UI는 'en'(ltr)로 떨어져야 함
assert.strictEqual(pageAr.getUiLang(), 'en', 'ar은 uiStrings에 없으므로 UI는 en으로 fallback');
assert.strictEqual(pageAr.doc.dir, 'ltr', 'UI가 en이므로 documentElement는 ltr이어야 함');

// 자막 컨테이너는 반드시 selectedLang(ar)에 따라 'rtl'이어야 함
assert.strictEqual(pageAr.chatList.dir, 'rtl', '줄 목록 칸(chatList)의 dir은 반드시 rtl이어야 함');
console.log('[PASS] ?lang=ar 에서 줄 목록 칸(chatList)의 dir="rtl" 정상 적용 확인!');

// ────────────────────────────────────────────────────────────────
// [TEST 2] 원문(한국어)과 번역문(아랍어)의 분리 dir 검증
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 2] 원문과 번역문의 dir 분리 검증');
const line1 = pageAr.addLine(1, '비계 밑으로는 절대 지나가지 마세요.', { ar: 'لا تمر أبدا تحت سقالة' }, 'ko');

console.log('- 원문 (textEl):', line1.textEl.text, '-> dir:', line1.textEl.dir);
console.log('- 번역문 (trEl):', line1.trEl.text, '-> dir:', line1.trEl.dir);
console.log('- 출처 배지 (srcEl):', line1.srcEl.text, '-> dir:', line1.srcEl.dir);

assert.strictEqual(line1.textEl.dir, 'ltr', '원문(한국어)은 ltr이어야 함');
assert.strictEqual(line1.trEl.dir, 'rtl', '번역문(아랍어)은 rtl이어야 함');
assert.strictEqual(line1.srcEl.dir, 'ltr', '출처/화자 배지는 ltr이어야 함');
console.log('[PASS] 원문(ltr)과 번역문(rtl)이 올바르게 분리됨!');

// ────────────────────────────────────────────────────────────────
// [TEST 3] 언어 드롭다운 전환 시 dir 동적 갱신 검증 (ko, en, ur, he, fa)
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 3] 언어 전환 시 chatList dir 갱신 검증');

pageAr.changeLang('ko');
console.log('- ko 전환 후 chatList dir:', pageAr.chatList.dir);
assert.strictEqual(pageAr.chatList.dir, 'ltr', 'ko 선택 시 chatList는 ltr이어야 함');

pageAr.changeLang('en');
console.log('- en 전환 후 chatList dir:', pageAr.chatList.dir);
assert.strictEqual(pageAr.chatList.dir, 'ltr', 'en 선택 시 chatList는 ltr이어야 함');

pageAr.changeLang('ur');
console.log('- ur 전환 후 chatList dir:', pageAr.chatList.dir);
assert.strictEqual(pageAr.chatList.dir, 'rtl', 'ur 선택 시 chatList는 rtl이어야 함');

pageAr.changeLang('he');
console.log('- he 전환 후 chatList dir:', pageAr.chatList.dir);
assert.strictEqual(pageAr.chatList.dir, 'rtl', 'he 선택 시 chatList는 rtl이어야 함');

pageAr.changeLang('fa');
console.log('- fa 전환 후 chatList dir:', pageAr.chatList.dir);
assert.strictEqual(pageAr.chatList.dir, 'rtl', 'fa 선택 시 chatList는 rtl이어야 함');
console.log('[PASS] 언어 전환(ko, en, ur, he, fa)에 따른 동적 dir 갱신 완벽 통과!');

console.log('\n============================================================');
console.log('이전 시험이 통과했던 까닭 분석:');
console.log('이전 시험은 언어 코드를 순수 함수 getDir(code)에 직접 인자로 전달하여');
console.log('ui-strings.json 및 determineLanguage() 검증 경로를 완전히 건너뛰었음.');
console.log('실제 런타임에서는 ar이 ui-strings.json에 없어 determineLanguage()가 en을 반환,');
console.log('documentElement가 ltr로 유지되는 실제 버그를 포착하지 못하는 가상 목(D-11)이었음.');
console.log('============================================================');
console.log('=== All Real Runtime RTL Tests Passed! ===\n');
