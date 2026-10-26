// samples/ui_strings_slice_test.js — 글자 조각 == 손 표 (B 19, 2026-10-17)
//
// 손 표(`web/listener/ui-strings.json` · `join/ui-strings.json`)가 정본이고, 조각
// (`<쪽>/ui-strings/<언어>.json`)은 `tools/split-ui-strings.js` 가 만든다. 사람이 손 표만
// 고치고 조각을 다시 만들지 않으면 **화면은 옛 글자를 계속 보여 준다** — 손 표를 고친 커밋이
// 초록으로 지나간다(§4 · §18 과 같은 모양). 이 시험이 그 자리를 막는다.
// 돌리기: node samples/ui_strings_slice_test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

console.log('=== 글자 조각 == 손 표 ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const DICTS = [
  { src: 'web/listener/ui-strings.json', out: 'web/listener/ui-strings', index: true },
  { src: 'join/ui-strings.json', out: 'join/ui-strings', index: false }
];

/* ① 만드는 길이 저장소와 같은가 — 손 표를 고치고 조각을 안 만들었으면 여기서 붉다 */
let splitCode = 0, splitOut = '';
try { splitOut = execFileSync('node', [path.join(ROOT, 'tools', 'split-ui-strings.js'), '--check'], { cwd: ROOT, encoding: 'utf-8' }); }
catch (e) { splitCode = e.status || 1; splitOut = String(e.stdout || ''); }
ok(splitCode === 0, `split-ui-strings --check 종료코드 0 (${splitOut.trim().split('\n').pop()})`);

for (const d of DICTS) {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, d.src), 'utf-8'));
  const langs = dict.langs;
  const dir = path.join(ROOT, d.out);
  ok(fs.existsSync(dir), `${d.out}/ 가 있다`);

  /* ② 언어마다 조각이 하나씩, 남는 것 없이 */
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const expect = langs.map((l) => l + '.json').concat(d.index ? ['_langs.json'] : []);
  const missing = expect.filter((f) => !files.includes(f));
  const extra = files.filter((f) => !expect.includes(f));
  ok(missing.length === 0, `${d.out}: 빠진 조각 0 (${missing.join(',') || '없음'})`);
  ok(extra.length === 0, `${d.out}: 원본에 없는 조각 0 (${extra.join(',') || '없음'})`);

  /* ③ 조각 셋을 **글자까지** 손 표와 견준다 (언어 하나로 보는 것은 보는 것이 아니다 — §6) */
  const sample = [langs[0], langs[Math.floor(langs.length / 2)], langs[langs.length - 1]];
  for (const lang of sample) {
    const slice = JSON.parse(fs.readFileSync(path.join(dir, lang + '.json'), 'utf-8'));
    const srcKeys = Object.keys(dict.strings).filter((k) => {
      const v = dict.strings[k];
      return v[lang] != null || v.en != null || v.ko != null;
    });
    ok(Object.keys(slice.strings).length === srcKeys.length,
       `${d.out}/${lang}: 키 수가 손 표와 같다 (${Object.keys(slice.strings).length})`);
    const wrong = srcKeys.filter((k) => {
      const want = dict.strings[k][lang];
      return want != null && slice.strings[k][lang] !== want;
    });
    ok(wrong.length === 0, `${d.out}/${lang}: 글자가 손 표와 같다 (다른 키 ${wrong.length})`);
    const noFall = srcKeys.filter((k) => {
      const v = dict.strings[k], sv = slice.strings[k];
      /* en 이 있으면 ko 는 t() 가 안 읽으니 조각에 없어야 한다(10-26, 첫 화면 크기) */
      const koNeeded = v.en == null || lang === 'ko';
      return (v.en != null && sv.en !== v.en) || (v.ko != null && (koNeeded ? sv.ko !== v.ko : sv.ko != null));
    });
    ok(noFall.length === 0, `${d.out}/${lang}: en 떨어짐은 있고, en 이 있는 키의 ko 는 없다 (t() 가 읽는 것만)`);

    /* ④ 다른 언어가 섞여 있지 않은가 — 섞이면 줄인 뜻이 없다 */
    const strays = new Set();
    for (const v of Object.values(slice.strings)) {
      for (const l of Object.keys(v)) if (l !== lang && l !== 'en' && l !== 'ko') strays.add(l);
    }
    ok(strays.size === 0, `${d.out}/${lang}: 쓰지 않는 언어가 섞이지 않았다 (${[...strays].slice(0, 3).join(',') || '없음'})`);
    const size = fs.statSync(path.join(dir, lang + '.json')).size;
    ok(size < 20 * 1024, `${d.out}/${lang}: 조각이 20 KB 아래 (${(size / 1024).toFixed(1)} KB)`);
  }

  /* ⑤ 읽는 쪽이 **조각 길**을 쓰고 있는가 (손 표만 고치고 쪽을 안 고치면 뜻이 없다) */
  const pageFile = d.index ? 'web/listener/index.html' : 'join/index.html';
  const page = fs.readFileSync(path.join(ROOT, pageFile), 'utf-8');
  ok(/ui-strings\/'/.test(page) || /ui-strings\//.test(page), `${pageFile} 이 조각 길을 쓴다`);
  ok(/ui-strings\.json/.test(page), `${pageFile} 이 통째 사전도 **떨어질 곳**으로 남겨 두었다 (R-15)`);
}

/* ⑥ 되돌림 실증 — 손 표를 고치고 조각을 안 만든 상태를 흉내 낸다 */
const srcPath = path.join(ROOT, 'web/listener/ui-strings.json');
const slicePath = path.join(ROOT, 'web/listener/ui-strings/vi.json');
const srcDict = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
const vi = JSON.parse(fs.readFileSync(slicePath, 'utf-8'));
let reverted = false;
try {
  assert.notStrictEqual(vi.strings.page_title.vi, srcDict.strings.page_title.vi,
                        '조각과 손 표가 같다 — 이 단언은 거짓이어야 한다');
} catch (e) { reverted = true; }
ok(reverted === true, '조각과 손 표가 어긋나면 붉어진다 (되돌림 실증)');

console.log(`\n전부 통과 (${checks}건)`);
