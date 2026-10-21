#!/usr/bin/env node
/* tools/build-listener.js — 청취 쪽을 **낼 때만** 주석 없이 만든다 (B 21, 2026-10-17)
 *
 * 소스는 `web/listener/index.src.html` 다 — **주석이 그대로 있고, 사람은 그것만 고친다.**
 * 손님에게 가는 `web/listener/index.html` 은 여기서 만든다(주석을 뺀 판).
 *   node tools/build-listener.js          → index.html 을 만든다
 *   node tools/build-listener.js --check  → 쓰지 않고 다른지만 센다 (다르면 종료코드 1)
 *
 * 왜: 첫 화면 gz 29.7 KB 중 주석이 약 3.8 KB 다(B 19 보고). 손님은 그걸 데이터로 받는다.
 * 그런데 주석은 **이 코드가 살아 있는 까닭**이라 소스에서 지울 수 없다. 그래서 자리를 나눈다.
 *
 * 지우는 것은 **줄 전체가 주석인 줄**뿐이다:
 *   ① 다듬으면 `//` 로 시작하는 줄   ② 줄 전체를 차지하는 `/* … *\/` 묶음
 * 코드 뒤에 붙은 `// …` 는 **건드리지 않는다** — 그것을 지우려면 글자열·정규식을 가려야 하고,
 * 그 길에서 앱이 깨진다(얻는 것은 0.2 KB). 싸게 얻는 것만 얻는다.
 *
 * 만든 뒤 **스스로 검사한다**(틀리면 쓰지 않는다): 인라인 스크립트가 파싱되나 ·
 * `id=` · `data-i18n` · `<script>`/`<style>` 수가 소스와 같나 · 줄어들었나.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(__dirname);
const SRC = path.join(ROOT, 'web', 'listener', 'index.src.html');
const OUT = path.join(ROOT, 'web', 'listener', 'index.html');
const CHECK = process.argv.includes('--check');

const HEAD = '<!-- 이 파일은 tools/build-listener.js 가 index.src.html 에서 만든다 — 손으로 고치지 않는다.\n'
           + '     고칠 곳은 index.src.html (주석이 그대로 있는 소스). -->\n';

function strip(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0, dropped = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('//')) { dropped += 1; i += 1; continue; }
    if (t.startsWith('/*')) {
      let j = i;
      while (j < lines.length && !lines[j].includes('*/')) j += 1;
      if (j < lines.length && lines[j].split('*/')[1].trim() === '') {
        dropped += j - i + 1; i = j + 1; continue;
      }
    }
    out.push(lines[i]); i += 1;
  }
  /* ★ HTML 주석도 뺀다 (10-21). 이 생성기의 까닭은 "손님에게 가는 판은 **주석을 뺀 판**"
     인데 지금까지 **JS 주석만** 뺐다 — `<!-- … -->` 는 그대로 손님에게 갔다(9개 816 B,
     gz 682 B). 첫 화면 한도를 넘긴 것을 쫓다가 찾았다.
     IE 조건부 주석(`<!--[if`)은 **기능**이라 건드리지 않는다(지금은 없지만 규칙으로 둔다).
     맨 위 머리글(HEAD)은 이 함수 **뒤에** 붙으므로 여기서 지워지지 않는다. */
  let text = out.join('\n');
  const htmlComments = (text.match(/<!--(?!\[if)[\s\S]*?-->/g) || []).length;
  text = text.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  dropped += htmlComments;
  return { text: text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n'), dropped };
}

const count = (s, re) => (s.match(re) || []).length;
const SHAPE = [
  ['id=', /\sid="/g],
  ['data-i18n', /\sdata-i18n="/g],
  ['data-i18n-aria', /\sdata-i18n-aria="/g],
  ['<script>', /<script/g],
  ['<style>', /<style/g],
  ['function', /\bfunction\b/g],
  ['addEventListener', /addEventListener\(/g]
];

const src = fs.readFileSync(SRC, 'utf-8');
const { text, dropped } = strip(src);
const built = HEAD + text;

/* 검사 ① 인라인 스크립트가 파싱되나 — 주석을 지우다 코드를 먹었으면 여기서 걸린다 */
const scripts = [...built.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) { console.error('[FAIL] 만든 판에 인라인 스크립트가 없다 — 지우다 먹었다'); process.exit(1); }
for (const [n, body] of scripts.entries()) {
  try { new vm.Script(body); }
  catch (e) { console.error(`[FAIL] 인라인 스크립트 ${n} 가 파싱되지 않는다: ${e.message}`); process.exit(1); }
}

/* 검사 ② 모양이 그대로인가 (주석만 빠져야 한다) */
const bad = SHAPE.filter(([, re]) => count(src, re) !== count(built, re));
if (bad.length) {
  for (const [name, re] of bad) console.error(`[FAIL] ${name} 수가 다르다: 소스 ${count(src, re)} → 만든 판 ${count(built, re)}`);
  process.exit(1);
}

/* 검사 ③ 줄었는가 */
if (Buffer.byteLength(built) >= Buffer.byteLength(src)) {
  console.error('[FAIL] 만든 판이 소스보다 작지 않다 — 지운 것이 없다');
  process.exit(1);
}

const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8') : null;
const saved = Buffer.byteLength(src) - Buffer.byteLength(built);
console.log(`주석 줄 ${dropped}개 · ${Buffer.byteLength(src)} → ${Buffer.byteLength(built)} B (−${saved})`);

if (CHECK) {
  /*
   * ★ **줄바꿈은 세지 않는다** (2026-10-20, A1). 이 도구는 LF 로 쓰는데 윈도 체크아웃의
   * `index.html` 은 CRLF 다(`core.autocrlf`) — 바이트로 견주면 **윈도에서는 늘 "다름"**,
   * 리눅스에서는 늘 초록이다. 같은 저장소가 기계에 따라 다른 답을 내면 그 검사는
   * 아무것도 지키지 않는다(10-20 에 `npm test` 가 여기서 멈췄다). 글자가 하나라도
   * 다르면 여전히 "다름"이다.
   */
  const nl = (x) => (x == null ? null : x.replace(/\r\n/g, '\n'));
  if (nl(cur) !== nl(built)) {
    console.log('다름: web/listener/index.html');
    console.log('→ `node tools/build-listener.js` 를 돌리고 같이 커밋한다. (손으로 index.html 을 고쳤으면 그 변경을 index.src.html 로 옮긴다)');
    process.exit(1);
  }
  console.log('만든 판 == 저장소 (같다)');
} else {
  fs.writeFileSync(OUT, built);
  console.log(`썼다: ${OUT}`);
}
