/* samples/asset_version_test.js — 사전·CSS 를 고치면 **쪽의 `?v=` 가 같이 바뀌어야 한다**
 * 실행: node samples/asset_version_test.js   (npm run test:asset-ver)
 *
 * ## 왜 생겼나 (2026-10-22, 내가 낸 결함)
 * `assets/i18n/*.json` 에 글자를 채웠다. 그 해시가 쪽의 `i18n.js?v=` 에 박히는데 **쪽을
 * 다시 만들지 않았다.** 그래서 둘이 났다:
 *   ① `test:generator` 가 붉었다(생성기가 만드는 4쪽)
 *   ② **손으로 쓰는 7쪽**은 아무 시험도 안 보고 있었다 — 눈으로 찾았다
 * ②가 더 나쁘다: 해시가 옛것이면 **손님 브라우저가 옛 사전을 캐시에서 계속 읽는다.**
 * 새 글자를 채워도 그 폰에는 안 보인다. 조용한 고장이고, 시험은 초록이었다.
 *
 * ## 무엇을 세는가
 * ① 쪽들이 든 `?v=` 가 **전부 같다** (한 쪽만 옛것이면 그 쪽만 옛 사전을 읽는다)
 * ② 그 값이 **지금 파일에서 계산한 값과 같다** (생성기와 **같은 셈**으로 여기서 다시 센다)
 * ③ `site.css?v=` 도 같은 규칙
 *
 * 생성기(`tools/build_home.py`)를 부르지 않고 **셈을 옮겨 적는다** — 셈이 갈리면 ②가
 * 붉어지고, 그때 할 일은 둘을 맞추는 것이다(§4: 값을 만드는 자리도 센다).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let n = 0;
const ok = (c, m) => { assert(c, m); n += 1; console.log('  [PASS] ' + m); };

console.log('=== 사전·CSS 판 번호(?v=) 가 쪽과 맞나 ===');

/** 생성기와 **같은 셈**: md5(파일들을 이어 붙인 것), 앞 8자. 줄끝(CRLF)은 지운다 */
function ver(files) {
  const h = crypto.createHash('md5');
  for (const f of files) {
    const fp = path.join(ROOT, f);
    if (fs.existsSync(fp)) h.update(fs.readFileSync(fp).toString('binary').replace(/\r\n/g, '\n'), 'binary');
  }
  return h.digest('hex').slice(0, 8);
}

const I18N_LANGS = ['en', 'zh', 'ja', 'vi', 'th', 'id'];
const wantI18n = ver(['assets/i18n.js', ...I18N_LANGS.map((l) => `assets/i18n/${l}.json`)]);
const wantCss = ver(['assets/site.css']);

/** 쪽 전부에서 `?v=` 를 **센다** — 목록을 손으로 적지 않는다(새 쪽이 생겨도 걸린다) */
function pagesWith(re) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'docs' || e.name === 'samples') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) {
        const body = fs.readFileSync(p, 'utf8');
        const m = body.match(re);
        if (m) out.push({ file: path.relative(ROOT, p), v: m[1] });
      }
    }
  };
  walk(ROOT);
  return out;
}

/* ── ① 사전 판 번호 — 쪽마다 같아야 한다 ── */
const i18nPages = pagesWith(/i18n\.js\?v=([0-9a-f]+)/);
ok(i18nPages.length >= 8, `사전을 싣는 쪽 ${i18nPages.length}곳을 찾았다`);
const i18nBad = i18nPages.filter((p) => p.v !== wantI18n);
ok(i18nBad.length === 0,
   `그 쪽 전부가 **지금 사전의 판 번호**를 들고 있다 (${wantI18n})`
   + (i18nBad.length ? `\n    옛것: ` + i18nBad.map((p) => `${p.file}=${p.v}`).join(', ') : ''));

/* ── ② CSS 판 번호 ── */
const cssPages = pagesWith(/site\.css\?v=([0-9a-f]+)/);
ok(cssPages.length >= 8, `CSS 를 싣는 쪽 ${cssPages.length}곳을 찾았다`);
const cssBad = cssPages.filter((p) => p.v !== wantCss);
ok(cssBad.length === 0,
   `그 쪽 전부가 **지금 CSS 의 판 번호**를 들고 있다 (${wantCss})`
   + (cssBad.length ? `\n    옛것: ` + cssBad.map((p) => `${p.file}=${p.v}`).join(', ') : ''));

/* ── ③ 셈이 생성기와 같나 — 생성기가 만든 쪽의 값과 견준다 ──
   생성기를 부르지 않는다(파이썬이 없는 데서도 돌게). 생성기가 **이미 박아 놓은** 값을 본다.
   둘이 갈리면 ①이 아니라 여기서 먼저 붉어진다 — "내 셈이 틀렸다"를 가려 준다. */
const genPage = i18nPages.find((p) => p.file === 'index.html');
ok(!!genPage && genPage.v === wantI18n,
   `셈이 생성기와 같다 — index.html 의 값(${genPage ? genPage.v : '없음'}) = 내 셈(${wantI18n})`);

/* ── 되돌림 실증 (D-09) ──
   ⚠ 시험 안 상수로 하지 않는다. **쪽이 들고 있는 값**을 한 글자 바꿔 넣어 본다. */
const faked = i18nPages.map((p) => ({ ...p, v: p.file === i18nPages[0].file ? 'deadbeef' : p.v }));
ok(faked.filter((p) => p.v !== wantI18n).length === 1,
   '한 쪽만 옛 판 번호를 들면 **그 한 쪽이 잡힌다** (되돌림 실증 1)');

const emptyVer = ver(['assets/does-not-exist.json']);
ok(emptyVer === crypto.createHash('md5').digest('hex').slice(0, 8),
   '없는 파일만 주면 빈 해시다 — 목록 이름이 틀리면 **모든 쪽이 틀렸다고** 나온다(빈 증거 방지, 되돌림 실증 2)');

console.log(`\n전부 통과 (${n}건)`);
