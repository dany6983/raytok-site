// samples/site_wording_test.js — 소개 페이지 문구 시험 (NOW 10-28 21:50 ①②③)
//
// ① 「인터넷 없이」 금지어 0 — 번역 주체가 듣는 쪽으로 옮겨진 뒤(문구기준_번역주체_1021) 남은 페이지.
//    QR(웹) 청취는 인터넷이 필요하고, 앱 청취만 공유기 하나로 된다 — 두 길을 섞은 「인터넷 없이」를 쓰지 않는다.
//    처리방침(privacy · web/privacy)은 **빼고 센다** — 법 문서라 대표님 판단 대기(NOW ⑤ 「고치지 않는다」).
// ② 홈 특허 수 = 목록(<ol class="pat">) 수. 「여섯 건」 같은 손 숫자가 남으면 붉다. 6개 언어 사전도 같은 수.
// ③ field·tour FAQ — 앱 번역은 폰 안만(장부 59): 「인터넷이 되면 번역 서버로」 문장이 남으면 붉다.
//
// 돌리기: node samples/site_wording_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 소개 페이지 문구 시험 (①「인터넷 없이」 0 · ② 특허 수 = 목록 · ③ 서버 번역 FAQ) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ① 금지어 — 한국어·영문 둘 다
const PAGES = ['index.html', 'field/index.html', 'field/en/index.html', 'tour/index.html', 'tour/en/index.html',
  'student/index.html', 'student/en/index.html', 'guide/index.html', 'desk/index.html',
  'ows/index.html', 'ows/en/index.html', 'museum/index.html', 'museum/en/index.html'];
const BANNED = /인터넷\s*없이|인터넷 없는 곳|인터넷이 필요 없|인터넷 불필요|without (?:an? |the )?internet|no internet is needed/i;
for (const rel of PAGES) {
  const html = read(rel);
  const m = html.match(BANNED);
  ok(!m, `① ${rel}: 금지어 없음${m ? ' — 찾음: ' + m[0] : ''}`);
}
// 생성기도 같은 문장을 다시 넣지 않는다 (주석의 금지 목록 줄은 뺀다)
const gen = read('tools/build_home.py').split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
const gm = gen.match(BANNED);
ok(!gm, `① tools/build_home.py: 금지어 없음${gm ? ' — 찾음: ' + gm[0] : ''}`);

// ② 특허 수
const home = read('index.html');
const ol = home.match(/<ol class="pat">([\s\S]*?)<\/ol>/);
ok(ol, '② 홈에 특허 목록 <ol class="pat"> 이 있다');
const N = (ol[1].match(/<li>/g) || []).length;
ok(N > 0, `② 특허 목록 ${N}건`);
ok(!/여섯 건|여섯건|다섯 건|일곱 건/.test(home), '② 홈에 손으로 적은 한글 수(여섯 건 등)가 없다');
const counts = [...home.matchAll(/(외 )?(\d+)건/g)].map(m => Number(m[2]) + (m[1] ? 1 : 0));
ok(counts.length >= 4 && counts.every(n => n === N), `② 홈의 「N건」·「외 N-1건」 ${counts.length}곳이 전부 ${N} (찾은 값: ${counts.join(',')})`);
for (const rel of ['desk/index.html', 'field/index.html', 'tour/index.html', 'ows/index.html']) {
  const others = [...read(rel).matchAll(/외 (\d+)건/g)].map(m => Number(m[1]) + 1);
  ok(others.length > 0 && others.every(n => n === N), `② ${rel}: 바닥글 「외 ${N - 1}건」 (찾은 값 +1: ${others.join(',')})`);
}
ok(/NPAT\s*=\s*len\(PATS\)/.test(read('tools/build_home.py')), '② 생성기가 특허 수를 목록에서 센다 (NPAT = len(PATS))');
const noteKo = (home.match(/<p class="note">(출원인[^<]*)<\/p>/) || [])[1];
ok(noteKo && noteKo.includes(`${N}건`), `② 홈 출원 상태 문장이 ${N}건`);
for (const l of ['en', 'zh', 'ja', 'vi', 'th', 'id']) {
  const d = JSON.parse(read(`assets/i18n/${l}.json`));
  const v = d[noteKo];
  ok(typeof v === 'string' && v.includes(String(N)),
     `② 사전 ${l}: 출원 상태 문장 번역이 있고 수가 ${N}`);
}

// ③ field·tour FAQ — 「인터넷이 되면 번역 서버로」 가 남지 않는다 (앱 번역은 폰 안만)
for (const rel of ['field/index.html', 'tour/index.html', 'field/en/index.html', 'tour/en/index.html']) {
  const html = read(rel);
  ok(!/인터넷이 되면 번역 서버로|When there is internet, the translation server|강사 휴대폰의 인터넷|가이드 휴대폰의 인터넷|instructor's phone also works without/.test(html),
     `③ ${rel}: 「인터넷이 되면 번역 서버로」·「강사/가이드 폰 인터넷」 문장 없음`);
}

// 되돌림 실증 — 실제 페이지 글자에 옛 문장·틀린 수를 넣으면 위 단언이 붉어야 한다
{
  const field = read('field/index.html');
  const row = '대부분의 언어는 공유기 하나로 · 네팔어·미얀마어 등 일부 언어는 인터넷 필요';
  const oldField = field.replace(row, '대부분의 언어는 인터넷 없이 · 네팔어·미얀마어·크메르어 등 일부 언어는 강사 휴대폰의 인터넷 필요');
  const revertFailed1 = oldField !== field && BANNED.test(oldField);
  ok(revertFailed1, '되돌림 실증 ①: field 언어 줄을 옛 문장으로 되돌리면 금지어에 걸린다');
  const wrong = home.replace(`<div class="n">${N}건</div>`, `<div class="n">${N - 2}건</div>`);
  const c2 = [...wrong.matchAll(/(외 )?(\d+)건/g)].map(m => Number(m[2]) + (m[1] ? 1 : 0));
  const revertFailed2 = wrong !== home && !c2.every(n => n === N);
  ok(revertFailed2, '되돌림 실증 ②: 홈 특허 칸 수를 손으로 바꾸면 「N건 = 목록 수」 가 붉다');
}

console.log(`\n전부 통과 (${checks}건)`);
