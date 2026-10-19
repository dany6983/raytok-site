#!/usr/bin/env node
/* tools/split-ui-strings.js — 손님 글자 사전을 **언어 한 조각씩** 쪼갠다 (B 19, 2026-10-17)
 *
 * 왜: 손님 폰은 첫 화면에서 81개 언어 사전을 **통째로** 받고 있었다.
 *   web/listener/ui-strings.json  238 KB (gz 85 KB)
 *   join/ui-strings.json          116 KB (gz 46 KB)
 * 그런데 그 폰이 쓰는 것은 **한 언어**다. 나머지 80개는 버리는 데이터다.
 *
 * 쪼갠 뒤: `<쪽>/ui-strings/<언어>.json` 한 조각(수 KB)만 받는다. 손 표(원본)는 그대로
 * 한 파일이다 — 사람이 고치는 자리는 하나여야 한다(§4). 조각은 **여기서 만든다.**
 *
 *   node tools/split-ui-strings.js          → 조각을 쓴다
 *   node tools/split-ui-strings.js --check  → 쓰지 않고 **원본과 다른 조각만** 센다 (다르면 종료코드 1)
 *
 * 조각 하나는 **자기 혼자로 완전하다**: `{ver, langs, strings:{키:{<언어>, en, ko}}}`.
 * `en`·`ko` 를 같이 넣는 까닭은 읽는 쪽 `t()` 가 `item[lang] || item.en || item.ko` 로
 * 떨어지기 때문이다 — 그 떨어짐을 조각 안에서도 그대로 쓰려면 셋이 있어야 한다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const CHECK = process.argv.includes('--check');
const FALLBACK = ['en', 'ko'];          // t() 의 떨어지는 순서와 같다

/* 쪼갤 사전 둘. 더 생기면 여기 한 줄 — 그리고 시험이 그 줄을 센다. */
const DICTS = [
  { src: 'web/listener/ui-strings.json', out: 'web/listener/ui-strings', index: true },
  { src: 'join/ui-strings.json',         out: 'join/ui-strings',         index: false }
];

function sliceOf(dict, lang) {
  const strings = {};
  for (const [key, vals] of Object.entries(dict.strings)) {
    const one = {};
    for (const l of [lang, ...FALLBACK]) {
      if (vals[l] != null) one[l] = vals[l];
    }
    // 그 언어에도, en·ko 에도 없으면 키를 넣지 않는다 — 없는 것을 있는 척하지 않는다(§20)
    if (Object.keys(one).length) strings[key] = one;
  }
  return { ver: dict.ver, langs: dict.langs, strings };
}

const text = (obj) => JSON.stringify(obj) + '\n';   // 조각은 사람이 읽는 파일이 아니다 — 들여쓰기 없이

let diffs = 0, wrote = 0;
for (const d of DICTS) {
  const dict = JSON.parse(fs.readFileSync(path.join(ROOT, d.src), 'utf-8'));
  const langs = dict.langs || [];
  const outDir = path.join(ROOT, d.out);
  if (!CHECK) fs.mkdirSync(outDir, { recursive: true });

  const files = new Map();
  for (const lang of langs) files.set(lang + '.json', text(sliceOf(dict, lang)));
  if (d.index) files.set('_langs.json', text({ ver: dict.ver, langs }));   // 고를 수 있는 언어 목록만 (조각보다 먼저 받는다)

  for (const [name, body] of files) {
    const p = path.join(outDir, name);
    if (CHECK) {
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
      if (cur !== body) { diffs += 1; console.log(`다름: ${d.out}/${name}${cur === null ? ' (없다)' : ''}`); }
    } else {
      fs.writeFileSync(p, body);
      wrote += 1;
    }
  }

  /* 원본에서 사라진 언어의 조각은 치운다 — 남겨 두면 옛 글자가 계속 나간다(§5) */
  if (fs.existsSync(outDir)) {
    for (const name of fs.readdirSync(outDir)) {
      if (!name.endsWith('.json') || files.has(name)) continue;
      if (CHECK) { diffs += 1; console.log(`남은 조각: ${d.out}/${name} (원본에 없는 언어)`); }
      else { fs.unlinkSync(path.join(outDir, name)); console.log(`지움: ${d.out}/${name}`); }
    }
  }

  const sizes = [...files.entries()].map(([n, b]) => Buffer.byteLength(b));
  const biggest = Math.max(...sizes);
  console.log(`${d.src} → ${files.size}개 조각 · 가장 큰 조각 ${biggest} B · 원본 ${fs.statSync(path.join(ROOT, d.src)).size} B`);
}

if (CHECK) {
  if (diffs) {
    console.log(`\n조각이 원본과 다르다 (${diffs}개). \`node tools/split-ui-strings.js\` 를 돌리고 같이 커밋한다.`);
    process.exit(1);
  }
  console.log('\n조각 == 원본 (전부 같다)');
} else {
  console.log(`\n${wrote}개 썼다.`);
}
