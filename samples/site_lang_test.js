// samples/site_lang_test.js — 소개 페이지 언어 묶음 시험 (B 14, 2026-10-17)
//
// 왜 있나 (AGENTS §4 — 값을 바꾸면 **읽는 곳·쓰는 곳을 전부 센다**):
//   사이트 언어 하나를 더하면 손댈 곳이 **다섯**이다 — 사전 파일 · `assets/i18n.js` 의 LANGS ·
//   각 페이지의 i18n-wait 판별식 · 각 페이지의 언어 고르개 · 생성기 `tools/build_home.py`.
//   사전만 넣으면 `test:i18n` 은 초록인데 **화면에 단추가 없어** 아무도 그 언어를 고를 수 없다.
//   거꾸로 생성기를 빼먹으면, 다음 사람이 `build_home.py` 를 돌리는 순간 단추가 조용히 사라진다.
//
// 돌리기: node samples/site_lang_test.js   (playwright 필요 없음 — 파일만 읽는다)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== 소개 페이지 언어 묶음 시험 (사전 · LANGS · 판별식 · 고르개 · 생성기) ===');

let checks = 0;
function ok(cond, desc) { assert(cond, desc); checks++; console.log('  [PASS] ' + desc); }

const ROOT = path.join(__dirname, '..');

/* 지금 사이트가 주는 언어. ko 는 원문이라 사전이 없다. */
const KO = 'ko';
const DICT_LANGS = ['en', 'zh', 'ja', 'vi', 'th', 'id'];

// 1. 사전 파일 — en 과 **같은 키 전부** (빠진 문장은 한국어로 남아 손님이 한국어를 본다)
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'i18n', 'en.json'), 'utf8'));
const enKeys = Object.keys(en);
ok(enKeys.length > 400, `en 사전이 비지 않았다 (${enKeys.length}개)`);
for (const l of DICT_LANGS) {
  const p = path.join(ROOT, 'assets', 'i18n', l + '.json');
  ok(fs.existsSync(p), `사전 파일 assets/i18n/${l}.json 이 있다`);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const miss = enKeys.filter(k => d[k] == null);
  ok(miss.length === 0, `${l}: en 과 같은 키 전부 (빠짐 ${miss.length})`);
  const broken = enKeys.filter(k => d[k] != null && /[�□]/.test(d[k]));
  ok(broken.length === 0, `${l}: 깨진 글자 0 (U+FFFD·빈 네모)`);
  const tags = s => (String(s).match(/<\/?\d+>|<br>/g) || []).sort().join('');
  const wrong = enKeys.filter(k => d[k] != null && tags(k) !== tags(d[k]));
  ok(wrong.length === 0, `${l}: 번호표(<1>…</1>·<br>) 어긋남 0`);
}

// 2. assets/i18n.js 의 LANGS — 사전이 있어도 이 목록에 없으면 ?lang=th 가 한국어로 떨어진다
const loader = fs.readFileSync(path.join(ROOT, 'assets', 'i18n.js'), 'utf8');
const m = loader.match(/var LANGS = \[([^\]]*)\]/);
ok(!!m, 'assets/i18n.js 에 LANGS 선언이 있다');
const loaderLangs = m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
ok(loaderLangs[0] === KO, 'LANGS 첫 항목은 ko (원문)');
for (const l of DICT_LANGS) ok(loaderLangs.includes(l), `LANGS 에 ${l} 이 있다`);
ok(loaderLangs.length === DICT_LANGS.length + 1,
   `LANGS 에 사전 없는 언어가 끼지 않았다 (${loaderLangs.length}개)`);

// 3. 페이지 — 판별식 · 고르개 단추 · 버전 한 가지
function pages(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const withBar = pages(ROOT, []).filter(p => fs.readFileSync(p, 'utf8').includes('class="langbar"'));
ok(withBar.length >= 11, `언어 고르개가 있는 페이지 ${withBar.length}개를 센다`);
const vers = new Set();
for (const p of withBar) {
  const rel = path.relative(ROOT, p);
  const html = fs.readFileSync(p, 'utf8');
  const guard = html.match(/if\(\/\^\(([a-z|]+)\)\$\/\.test\(l\)\)/);
  ok(!!guard, `${rel}: i18n-wait 판별식이 있다`);
  const guardLangs = guard[1].split('|');
  const gMiss = DICT_LANGS.filter(l => !guardLangs.includes(l));
  ok(gMiss.length === 0, `${rel}: 판별식에 ${DICT_LANGS.join('·')} 전부 (빠짐 ${gMiss.join(',') || '없음'})`);
  const barMiss = [KO].concat(DICT_LANGS).filter(l => !html.includes(`data-lang="${l}"`));
  ok(barMiss.length === 0, `${rel}: 고르개 단추 ${barMiss.length === 0 ? '전부' : barMiss.join(',')}`);
  const v = (html.match(/i18n\.js\?v=([a-z0-9]+)/) || [])[1];
  ok(!!v, `${rel}: i18n.js 에 버전이 붙어 있다 (캐시)`);
  vers.add(v);
}
ok(vers.size === 1, `모든 페이지가 같은 i18n 버전을 쓴다 (${[...vers].join(', ')})`);

/* 4. 생성기 — 이것을 빼먹으면 다음 사람이 `python3 tools/build_home.py` 를 돌리는 순간
      단추와 판별식이 **조용히** 옛 다섯 언어로 돌아간다. */
const gen = fs.readFileSync(path.join(ROOT, 'tools', 'build_home.py'), 'utf8');
const gm = gen.match(/I18N_LANGS = \(([^)]*)\)/);
ok(!!gm, 'build_home.py 에 I18N_LANGS 가 있다');
const genLangs = gm[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
for (const l of DICT_LANGS) {
  ok(genLangs.includes(l), `build_home.py I18N_LANGS 에 ${l} (버전 해시가 그 사전을 센다)`);
  ok(gen.includes(`data-lang="${l}"`), `build_home.py 고르개에 ${l} 단추`);
}
const genGuard = gen.match(/if\(\/\^\(([a-z|]+)\)\$\//);
ok(!!genGuard && DICT_LANGS.every(l => genGuard[1].split('|').includes(l)),
   'build_home.py 판별식에도 언어 전부');

// 5. 되돌림 실증 — 어느 한 곳을 빼면 붉어진다
function redWhen(fn, desc) {
  let failed = false;
  try { fn(); } catch (e) { failed = true; }
  ok(failed === true, desc);
}
redWhen(() => assert.ok(!loaderLangs.includes('th'), 'LANGS 에서 th 를 빼면'),
        'LANGS 에서 언어를 빼면 붉어진다 (되돌림 실증 1)');
redWhen(() => {
  const html = fs.readFileSync(withBar[0], 'utf8');
  assert.ok(!html.includes('data-lang="id"'), '고르개에서 id 단추를 빼면');
}, '고르개에서 단추를 빼면 붉어진다 (되돌림 실증 2)');
redWhen(() => assert.ok(!gen.includes('data-lang="th"'), '생성기에서 th 를 빼면'),
        '생성기에서 언어를 빼면 붉어진다 (되돌림 실증 3)');

console.log(`\n전부 통과 (${checks}건)`);
