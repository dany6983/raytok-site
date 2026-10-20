#!/usr/bin/env node
/**
 * tools/build-voice-fallback.js — 대체어 표를 **앱에서 생성한다** (site NOW 1, 2026-10-20)
 *
 * 마스터: *"표는 앱 `src/offlineLangs.js` 와 **같은 값**(복사 말고 생성·대조 시험)"*.
 * 그래서 손으로 적지 않는다. 이 도구가 앱 저장소의 그 파일에서 두 표를 떠서
 * `web/common/voice-fallback.js` 를 쓴다.
 *
 *   node tools/build-voice-fallback.js              → 같으면 아무것도 쓰지 않는다(종료 0)
 *   node tools/build-voice-fallback.js --write      → 다르면 새로 쓴다
 *   node tools/build-voice-fallback.js --app <dir>  → 앱 저장소 자리 (없으면 아래 순서)
 *
 * 앱 저장소를 찾는 순서: `--app` → `RAYTOK_APP` → 형제 폴더 `../raytok-native1` →
 * `../raytok-native`. 하나도 없으면 **종료코드 2 와 까닭**이다 — 조용히 "같다"고 하지
 * 않는다(§20: 빈 답은 답이 아니다. 못 본 것은 못 봤다고 말한다).
 *
 * ★ 왜 두 표를 같이 뜨나 (앱 `docs/design/voice-fallback.md` §3)
 * 대체어가 있어도 **글자 꼴이 다르면 음성 대체가 안 된다** — 타이 음성은 라오 글자를 못
 * 읽는다. 그래서 `FALLBACK_CHOICES`(누구를 대신하나)와 `SCRIPT_OF`(어떤 꼴인가)를 **함께**
 * 떠 온다. 한쪽만 들고 오면 `lo→th` 를 소리로 읽으려 들고, 손님은 침묵을 듣는다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
const WRITE = process.argv.includes('--write');
const OUT = path.join(path.dirname(__dirname), 'web', 'common', 'voice-fallback.js');

/** 앱 저장소의 `src/offlineLangs.js` 를 찾는다 — 못 찾으면 null 과 본 자리 목록 */
function findApp() {
  const tried = [];
  const cands = [argOf('app'), process.env.RAYTOK_APP,
                 path.join(path.dirname(path.dirname(__dirname)), 'raytok-native1'),
                 path.join(path.dirname(path.dirname(__dirname)), 'raytok-native')];
  for (const c of cands) {
    if (!c) continue;
    const p = path.join(c, 'src', 'offlineLangs.js');
    tried.push(p);
    if (fs.existsSync(p)) return { file: p, tried };
  }
  return { file: null, tried };
}

/**
 * `export const NAME = { … };` 의 알맹이를 읽는다.
 *
 * 왜 정규식 한 줄이 아닌가: 표가 **여러 줄**이고 주석이 사이에 있다. 여는 괄호부터
 * 짝이 맞는 닫는 괄호까지 세어 떠야 주석·줄바꿈에 걸리지 않는다.
 *
 * ★ **읽기만 한다 — 돌리지 않는다.** 앱 파일을 `eval`/`new Function` 으로 돌리면 그
 * 파일이 들고 올 수 있는 것을 전부 들고 오게 된다. 우리가 원하는 것은 `키: '값'` 과
 * `키: ['값']` **두 꼴뿐**이고, 그 밖의 모양이 나오면 **멈춘다**(§20: 모르는 것을
 * 아는 것으로 읽지 않는다 · §4: 앱이 모양을 바꾸면 여기서 붉어져야 한다).
 */
function tableOf(src, name) {
  const m = src.match(new RegExp('export\\s+const\\s+' + name + '\\s*=\\s*\\{'));
  if (!m) throw new Error(`앱 파일에 ${name} 가 없다 — 이름이 바뀌었나(§4: 읽는 곳을 센다)`);
  const start = m.index + m[0].length - 1;
  let end = -1;
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error(`${name} 의 닫는 괄호를 못 찾았다`);
  /* 주석을 걷어 내고 칸만 남긴다 */
  const body = src.slice(start + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const out = {};
  const ENTRY = /(?:'([^']+)'|"([^"]+)"|([A-Za-z][\w-]*))\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")\s*(?:,|$)/g;
  let seen = 0;
  let hit;
  while ((hit = ENTRY.exec(body)) !== null) {
    const key = hit[1] || hit[2] || hit[3];
    const raw = hit[4].trim();
    let val;
    if (raw[0] === '[') {
      val = [];
      const ITEM = /'([^']*)'|"([^"]*)"/g;
      let it;
      while ((it = ITEM.exec(raw)) !== null) val.push(it[1] != null ? it[1] : it[2]);
    } else {
      val = raw.slice(1, -1);
    }
    out[key] = val;
    seen += 1;
  }
  /* 칸을 하나도 못 읽었거나, 읽은 글자 수가 알맹이보다 턱없이 적으면 **모양이 바뀐 것**이다 */
  if (!seen) throw new Error(`${name} 에서 칸을 하나도 못 읽었다 — 모양이 바뀌었다`);
  const leftover = body.replace(ENTRY, '').replace(/[\s,]/g, '');
  if (leftover) throw new Error(`${name} 에 모르는 모양이 남았다: ${leftover.slice(0, 40)}`);
  return out;
}

/** 표 둘을 **한 줄로 굳힌다** — 지문의 원본이고, 칸 차례가 흔들리면 지문도 흔들린다 */
function canon(fb, sc) {
  const ks = (o) => Object.keys(o).sort();
  const a = ks(fb).map((k) => k + '>' + [].concat(fb[k]).join('|')).join(',');
  const b = ks(sc).map((k) => k + ':' + sc[k]).join(',');
  return a + ';' + b;
}

function render(fb, sc, srcFile) {
  const fp = crypto.createHash('sha256').update(canon(fb, sc)).digest('hex').slice(0, 16);
  const q = (o, pad) => Object.keys(o).sort()
    .map((k) => pad + JSON.stringify(k) + ': ' + JSON.stringify(o[k]) + ',').join('\n');
  /* ★ 손님이 **첫 화면에서 받는 파일**이다 — 참여 전 「음성 없음」 띠가 이 표를 보므로
     미룰 수 없다(B 24). 그래서 **짧게 낸다**: 설명은 여기(생성기)와 앱 설계 문서에 두고,
     나온 파일에는 어디서 왔는지 두 줄만. 10-20 에 이 파일이 손님 첫 화면 한도를
     넘겼다(36.0 → 36.3KB) — 줄여서 35.x 로 돌아왔다. */
  const one = (o) => '{' + Object.keys(o).sort()
    .map((k) => JSON.stringify(k) + ':' + JSON.stringify(o[k])).join(',') + '}';
  return `/* 대체어 표 — 생성된 파일. 손대지 않는다: node tools/build-voice-fallback.js --write
   원본: 앱 src/offlineLangs.js · 설계: 앱 docs/design/voice-fallback.md */
(function (global) {
  'use strict';

  var FALLBACK_CHOICES = ${one(fb)};

  var SCRIPT_OF = ${one(sc)};

  var FINGERPRINT = '${fp}';

  function base(lang) {
    return String(lang || '').toLowerCase().split(/[-_]/)[0];
  }

  /** 그 언어가 쓰는 꼴 — 표에 없으면 '' (모름) */
  function scriptOf(lang) {
    return SCRIPT_OF[base(lang)] || '';
  }

  /**
   * 이 언어를 **소리로** 읽을 대체어 — 없으면 ''.
   *
   * 셋을 다 봐야 '' 가 아니다: ① 표에 짝이 있나 ② 두 꼴을 **둘 다 아나** ③ 같은 꼴인가.
   * 모르는 꼴을 "같다"로 읽으면 침묵이 소리로 둔갑한다(§20).
   */
  function voiceFallbackFor(lang) {
    var k = base(lang);
    var to = base((FALLBACK_CHOICES[k] || [])[0] || '');
    if (!to) return '';
    var a = scriptOf(k);
    var b = scriptOf(to);
    if (!a || !b || a !== b) return '';
    return to;
  }

  var API = { FALLBACK_CHOICES: FALLBACK_CHOICES, SCRIPT_OF: SCRIPT_OF,
              FINGERPRINT: FINGERPRINT, scriptOf: scriptOf, voiceFallbackFor: voiceFallbackFor };

  global.rtVoiceFallback = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

const { file, tried } = findApp();
if (!file) {
  console.error('[FAIL] 앱 저장소의 src/offlineLangs.js 를 못 찾았다. 본 자리:');
  for (const t of tried) console.error('  ' + t);
  console.error('  → --app <앱 저장소> 또는 RAYTOK_APP 으로 알려 준다');
  process.exit(2);
}
const src = fs.readFileSync(file, 'utf-8');
const fb = tableOf(src, 'FALLBACK_CHOICES');
const sc = tableOf(src, 'SCRIPT_OF');
const next = render(fb, sc, file);
const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8') : '';
const same = now.replace(/\r\n/g, '\n') === next.replace(/\r\n/g, '\n');

const voiced = Object.keys(fb).sort().filter((k) => {
  const to = [].concat(fb[k])[0];
  return sc[k] && sc[to] && sc[k] === sc[to];
});
console.log(`앱 표: 짝 ${Object.keys(fb).length}개 · 꼴 ${Object.keys(sc).length}개`);
console.log(`음성으로 대체되는 언어 ${voiced.length}개: ${voiced.join(' ')}`);
console.log(`꼴이 달라 **소리는 안 되는** 짝: ${Object.keys(fb).sort().filter((k) => !voiced.includes(k)).join(' ') || '없음'}`);

if (same) { console.log('[OK] ' + path.relative(path.dirname(__dirname), OUT) + ' 는 이미 같다 — 쓰지 않았다'); process.exit(0); }
if (!WRITE) { console.error('[DIFF] 생성 결과가 다르다 — `--write` 로 쓴다'); process.exit(1); }
fs.writeFileSync(OUT, next);
console.log('[WROTE] ' + path.relative(path.dirname(__dirname), OUT));
