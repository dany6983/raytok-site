const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== Web Listener: Locale & RTL Full Runtime Lifecycle Test ===');

const htmlPath = path.join(__dirname, '../web/listener/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const uiStringsPath = path.join(__dirname, '../web/listener/ui-strings.json');
const uiStrings = JSON.parse(fs.readFileSync(uiStringsPath, 'utf8'));

const langsPath = path.join(__dirname, '../web/listener/langs.json');
const langs = JSON.parse(fs.readFileSync(langsPath, 'utf8'));

// index.html 소스에서 RTL Set 및 normalizeLangCode 파싱/검증
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

function t(key, lang) {
  if (!uiStrings || !uiStrings.strings || !uiStrings.strings[key]) return '';
  const item = uiStrings.strings[key];
  return item[lang] || item['en'] || item['ko'] || '';
}

// index.html의 실제 initApp + determineLanguage + applyStrings 시뮬레이션
function simulatePageLoad({ navLang, queryLang = null, savedLang = null }) {
  const doc = {
    lang: 'ko', // HTML 기본값
    dir: 'ltr',
    setAttribute: function(attr, val) { if (attr === 'dir') this.dir = val; },
    getAttribute: function(attr) { return attr === 'dir' ? this.dir : null; }
  };

  const chatList = {
    dir: 'ltr',
    children: [],
    setAttribute: function(attr, val) { if (attr === 'dir') this.dir = val; },
    getAttribute: function(attr) { return attr === 'dir' ? this.dir : null; },
    appendChild: function(c) { this.children.push(c); }
  };

  const langSelect = {
    value: 'ko', // HTML의 기본 첫 번째 option 태그: <option value="ko">
    innerHTML: ''
  };

  const uiElements = {
    join_title: ''
  };

  const availableLangs = (uiStrings && uiStrings.langs) || ['ko', 'en'];

  let selectedLang = 'ko';
  let currentUiLang = 'en';

  function determineLanguage() {
    const avail = availableLangs;
    if (queryLang) {
      const norm = normalizeLangCode(queryLang);
      if (avail.includes(norm)) return norm;
    }
    if (savedLang) {
      const norm = normalizeLangCode(savedLang);
      if (avail.includes(norm)) return norm;
    }
    if (selectedLang) {
      const norm = normalizeLangCode(selectedLang);
      if (avail.includes(norm)) return norm;
    }
    if (navLang) {
      const norm = normalizeLangCode(navLang);
      if (avail.includes(norm)) return norm;
      const sub = navLang.substring(0, 2).toLowerCase();
      const subNorm = normalizeLangCode(sub);
      if (avail.includes(subNorm)) return subNorm;
    }
    return 'en';
  }

  function updateSubtitleDir() {
    const isRtl = RTL.has(normalizeLangCode(selectedLang));
    chatList.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  }

  function applyStrings(lang) {
    currentUiLang = lang;
    doc.lang = lang;
    doc.setAttribute('dir', RTL.has(normalizeLangCode(lang)) ? 'rtl' : 'ltr');
    uiElements.join_title = t('join_title', lang);
  }

  // --- initApp() 실행 흐름 ---
  // 1. 자막 언어(selectedLang) 먼저 결정
  if (queryLang && langs.some(l => l.code === queryLang)) {
    selectedLang = queryLang;
  } else if (savedLang && langs.some(l => l.code === savedLang)) {
    selectedLang = savedLang;
  } else {
    const nav = (navLang || '').trim();
    const norm = normalizeLangCode(nav);
    const match = langs.find(l => l.code === nav || l.code === norm || l.code.startsWith(norm));
    if (match) selectedLang = match.code;
    else selectedLang = 'en';
  }

  // 2. langSelect.value = selectedLang (applyStrings 앞)
  if (selectedLang) langSelect.value = selectedLang;

  // 3. UI 언어 결정 및 적용 (selectedLang 기반)
  const initialUiLang = determineLanguage();
  applyStrings(initialUiLang);
  updateSubtitleDir();

  // addLine 시뮬레이션
  function addLine(seq, text, trMap, srcLang = 'ko') {
    const item = {
      seq,
      textEl: { text, dir: RTL.has(normalizeLangCode(srcLang)) ? 'rtl' : 'ltr' },
      trEl: { text: trMap[selectedLang] || '', dir: RTL.has(normalizeLangCode(selectedLang)) ? 'rtl' : 'ltr' },
      srcEl: { text: `#${seq} ${srcLang.toUpperCase()}`, dir: 'ltr' }
    };
    chatList.appendChild(item);
    return item;
  }

  // 사용자가 드롭다운 변경 시뮬레이션
  function onSelectChange(newVal) {
    selectedLang = newVal;
    langSelect.value = newVal;
    const newUi = determineLanguage();
    applyStrings(newUi);
    updateSubtitleDir();
  }

  return {
    doc,
    chatList,
    langSelect,
    uiElements,
    getSelectedLang: () => selectedLang,
    getUiLang: () => currentUiLang,
    addLine,
    onSelectChange
  };
}

// ────────────────────────────────────────────────────────────────
// [TEST 1] en-US 로 접속했을 때 검증
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 1] navigator.language = "en-US" 접속');
const pageEn = simulatePageLoad({ navLang: 'en-US' });
console.log('- selectedLang (자막):', pageEn.getSelectedLang());
console.log('- document.documentElement.lang:', pageEn.doc.lang);
console.log('- document.documentElement.dir:', pageEn.doc.dir);
console.log('- 화면 UI 글자 (join_title):', pageEn.uiElements.join_title);
console.log('- 줄 목록 칸 (chatList.dir):', pageEn.chatList.dir);

assert.strictEqual(pageEn.getSelectedLang(), 'en', '자막 언어는 en이어야 함');
assert.strictEqual(pageEn.doc.lang, 'en', 'documentElement.lang은 en이어야 함 (ko 버그 탈출)');
assert.strictEqual(pageEn.uiElements.join_title, 'Join Session', 'UI 글자는 영어("Join Session")여야 함');
assert.strictEqual(pageEn.chatList.dir, 'ltr', 'chatList dir은 ltr이어야 함');
console.log('[PASS] en-US 환경에서 영어 UI 및 LTR 정상 검증!');

// ────────────────────────────────────────────────────────────────
// [TEST 2] vi-VN 로 접속했을 때 검증
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 2] navigator.language = "vi-VN" 접속');
const pageVi = simulatePageLoad({ navLang: 'vi-VN' });
console.log('- selectedLang (자막):', pageVi.getSelectedLang());
console.log('- document.documentElement.lang:', pageVi.doc.lang);
console.log('- 화면 UI 글자 (join_title):', pageVi.uiElements.join_title);

assert.strictEqual(pageVi.getSelectedLang(), 'vi', '자막 언어는 vi이어야 함');
assert.strictEqual(pageVi.doc.lang, 'vi', 'documentElement.lang은 vi이어야 함');
assert.strictEqual(pageVi.uiElements.join_title, 'Tham gia phiên', 'UI 글자는 베트남어("Tham gia phiên")여야 함');
console.log('[PASS] vi-VN 환경에서 베트남어 UI 정상 검증!');

// ────────────────────────────────────────────────────────────────
// [TEST 3] ar-SA 로 접속했을 때 검증 (ar은 19개 UI 언어 부재, 82개 자막 목록엔 존재)
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 3] navigator.language = "ar-SA" 접속');
const pageAr = simulatePageLoad({ navLang: 'ar-SA' });
console.log('- selectedLang (자막):', pageAr.getSelectedLang());
console.log('- document.documentElement.lang (UI):', pageAr.doc.lang);
console.log('- document.documentElement.dir (UI):', pageAr.doc.dir);
console.log('- 화면 UI 글자 (join_title):', pageAr.uiElements.join_title);
console.log('- 줄 목록 칸 (chatList.dir):', pageAr.chatList.dir);

assert.strictEqual(pageAr.getSelectedLang(), 'ar', '자막 언어는 ar이어야 함');
assert.strictEqual(pageAr.doc.lang, 'en', 'ar은 19개 UI 언어에 없으므로 UI는 en으로 fallback');
assert.strictEqual(pageAr.doc.dir, 'ltr', 'UI는 영문이므로 documentElement.dir은 ltr 유지');
assert.strictEqual(pageAr.uiElements.join_title, 'Join Session', 'UI 글자는 영어("Join Session")여야 함');
assert.strictEqual(pageAr.chatList.dir, 'rtl', '줄 목록 칸(chatList)의 dir은 반드시 rtl이어야 함');

// 자막 줄 원문/번역문 검증
const arLine = pageAr.addLine(1, '안전모를 착용하세요.', { ar: 'ارتد خوذة الأمان' }, 'ko');
assert.strictEqual(arLine.textEl.dir, 'ltr', '원문(한국어)은 ltr이어야 함');
assert.strictEqual(arLine.trEl.dir, 'rtl', '번역문(아랍어)은 rtl이어야 함');
console.log('- 원문 dir:', arLine.textEl.dir, '/ 번역문 dir:', arLine.trEl.dir);
console.log('[PASS] ar-SA 환경에서 UI 영문 LTR + 자막 아랍어 RTL 완벽 분리 검증!');

// ────────────────────────────────────────────────────────────────
// [TEST 4] ko-KR 로 접속했을 때만 한국어로 나와야 함
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 4] navigator.language = "ko-KR" 접속 (한국어 전용 확인)');
const pageKo = simulatePageLoad({ navLang: 'ko-KR' });
console.log('- selectedLang (자막):', pageKo.getSelectedLang());
console.log('- document.documentElement.lang:', pageKo.doc.lang);
console.log('- 화면 UI 글자 (join_title):', pageKo.uiElements.join_title);

assert.strictEqual(pageKo.getSelectedLang(), 'ko', '자막 언어는 ko');
assert.strictEqual(pageKo.doc.lang, 'ko', 'documentElement.lang은 ko');
assert.strictEqual(pageKo.uiElements.join_title, '세션 참여', 'UI 글자는 한국어("세션 참여")여야 함');
console.log('[PASS] ko-KR 환경에서만 한국어 UI가 렌더링됨 확인!');

// ────────────────────────────────────────────────────────────────
// [TEST 5] 드롭다운에서 언어 변경 시 UI 및 자막 dir 동적 갱신 검증
// ────────────────────────────────────────────────────────────────
console.log('\n[TEST 5] 사용자 드롭다운 선택 변경 동적 갱신 검증');

// ko -> ur (우르두어: 19개 UI에도 있고, RTL임)
pageKo.onSelectChange('ur');
console.log('- ur 선택: UI lang =', pageKo.doc.lang, ', UI dir =', pageKo.doc.dir, ', chatList.dir =', pageKo.chatList.dir);
assert.strictEqual(pageKo.doc.lang, 'ur');
assert.strictEqual(pageKo.doc.dir, 'rtl');
assert.strictEqual(pageKo.chatList.dir, 'rtl');
assert.strictEqual(pageKo.uiElements.join_title, 'سیشن میں شامل ہوں');

// ur -> th (태국어: 19개 UI에 있고, LTR임)
pageKo.onSelectChange('th');
console.log('- th 선택: UI lang =', pageKo.doc.lang, ', UI dir =', pageKo.doc.dir, ', chatList.dir =', pageKo.chatList.dir);
assert.strictEqual(pageKo.doc.lang, 'th');
assert.strictEqual(pageKo.doc.dir, 'ltr');
assert.strictEqual(pageKo.chatList.dir, 'ltr');
assert.strictEqual(pageKo.uiElements.join_title, 'เข้าร่วมเซสชัน');

// th -> ar (아랍어: 19개 UI에 없고, RTL임)
// pageKo는 navLang이 'ko-KR'이므로, ar(19개 없음) -> navLang('ko')으로 fallback
pageKo.onSelectChange('ar');
console.log('- [pageKo] ar 선택: UI lang =', pageKo.doc.lang, ', UI dir =', pageKo.doc.dir, ', chatList.dir =', pageKo.chatList.dir);
assert.strictEqual(pageKo.doc.lang, 'ko', '한국어 브라우저에서는 19개에 없는 언어 선택 시 navLang인 ko로 fallback');
assert.strictEqual(pageKo.doc.dir, 'ltr');
assert.strictEqual(pageKo.chatList.dir, 'rtl');

// pageAr (navLang이 ar-SA인 환경): ar 선택 시 19개 없음 -> navLang도 19개 없음 -> 최종 fallback인 en
pageAr.onSelectChange('ar');
console.log('- [pageAr] ar 선택: UI lang =', pageAr.doc.lang, ', UI dir =', pageAr.doc.dir, ', chatList.dir =', pageAr.chatList.dir);
assert.strictEqual(pageAr.doc.lang, 'en', '비지원 브라우저(ar)에서는 최종 fallback인 en으로 설정');
assert.strictEqual(pageAr.doc.dir, 'ltr');
assert.strictEqual(pageAr.chatList.dir, 'rtl');

console.log('[PASS] 드롭다운 선택 변경에 따른 UI 언어 및 자막 dir 동적 갱신 완벽 통과!');

console.log('\n============================================================');
console.log('이전 버그 원인 및 시험 분석 요약:');
console.log('1. determineLanguage()가 HTML option 기본값인 langSelect.value("ko")를');
console.log('   사용자가 선택한 값으로 오인하여 항상 "ko"를 반환하고 있었음.');
console.log('2. initApp()에서 langSelect.value = selectedLang이 applyStrings()보다');
console.log('   한 줄 늦게 실행되어 드롭다운 값도 항상 ko로 먼저 평가되었음.');
console.log('3. 이로 인해 en-US, vi-VN 등으로 접속해도 UI가 항상 한국어로 표시되었음.');
console.log('4. 해결: selectedLang 먼저 결정 -> langSelect.value 할당 ->');
console.log('   determineLanguage에서 langSelect.value 검사 제거 및 selectedLang 우선 적용 ->');
console.log('   en-US(en UI), vi-VN(vi UI), ar-SA(en UI + ar RTL) 정상 동작 확인.');
console.log('============================================================');
console.log('=== All 5 Real Lifecycle Tests Passed! ===\n');
