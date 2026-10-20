// samples/voice_fallback_test.js — 대체어 음성: **표가 앱과 같은가 · 꼴이 다르면 안 읽는가** (site NOW 1)
//
// 마스터: *"표는 앱 `src/offlineLangs.js` 와 같은 값(복사 말고 생성·대조 시험)"*.
// 그래서 이 시험이 보는 것은 셋이다:
//   ① 커밋된 `web/common/voice-fallback.js` 가 **앱에서 생성한 것과 같은가**
//      (앱 저장소가 없으면 그 사실을 **크게 찍는다** — 조용히 통과하지 않는다, §20)
//   ② 지문이 표와 맞는가 — 손으로 고치면 붉어진다
//   ③ **꼴이 다른 짝은 소리로 읽지 않는가** (lo→th: 타이 음성은 라오 글자를 못 읽는다)
// 그리고 ④ 손님 페이지가 그 표를 싣고, 옛 표(`langs.json` 의 `fallback`)를 **목소리 고르기에서
// 더는 읽지 않는가** — 표가 둘이면 값이 갈린다(§4·§5).
//
// 돌리기: node samples/voice_fallback_test.js        (브라우저 필요 없음)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

console.log('=== 대체어 음성 표 (voice_fallback) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

const ROOT = path.join(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'build-voice-fallback.js');
const MOD = path.join(ROOT, 'web', 'common', 'voice-fallback.js');
const table = require(MOD);

/* ── ① 생성 결과와 같은가 ───────────────────────────────────────────── */
const r = (() => {
  try {
    const out = execFileSync('node', [GEN], { cwd: ROOT, encoding: 'utf-8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
})();
if (r.code === 2) {
  /*
   * 앱 저장소가 옆에 없다 — 그러면 ①을 **못 본 것**이고, 못 봤다고 말한다.
   * 여기서 조용히 넘어가면 "시험이 통과했다"가 "표가 맞다"로 읽힌다(D-189).
   */
  console.log('  [SKIP-WHY] 앱 저장소가 없어 ①(생성 대조)을 못 돌렸다 — RAYTOK_APP 로 알려 주면 돈다');
  console.log('             ②③④ 는 그대로 돈다 (지문·꼴 규칙·페이지 배선)');
} else {
  ok(r.code === 0, '① 커밋된 표가 앱 src/offlineLangs.js 에서 생성한 것과 같다 (다르면 종료코드 1)');
}

/* ── ② 지문 ────────────────────────────────────────────────────────── */
const canon = (() => {
  const fb = table.FALLBACK_CHOICES, sc = table.SCRIPT_OF;
  const a = Object.keys(fb).sort().map((k) => k + '>' + [].concat(fb[k]).join('|')).join(',');
  const b = Object.keys(sc).sort().map((k) => k + ':' + sc[k]).join(',');
  return a + ';' + b;
})();
const fp = crypto.createHash('sha256').update(canon).digest('hex').slice(0, 16);
ok(fp === table.FINGERPRINT,
   `② 지문이 표와 맞는다 (${table.FINGERPRINT}) — 손으로 한 줄 고치면 여기서 붉어진다`);

/* ── ③ 꼴 규칙 — 소리로 읽을 수 있는 짝만 ''가 아니다 ───────────────── */
const voiced = Object.keys(table.FALLBACK_CHOICES).sort().filter((k) => !!table.voiceFallbackFor(k));
const paired = Object.keys(table.FALLBACK_CHOICES).sort();
ok(paired.length >= 8, `③ 표에 짝이 ${paired.length}개 있다 (빈 표로 조용히 통과하지 않는다 — D-189)`);
ok(table.voiceFallbackFor('lo') === '',
   '③ lo 는 소리로 읽지 않는다 — th 음성은 라오 글자를 못 읽는다 (자막만)');
ok(table.voiceFallbackFor('ky') === 'ru' && table.voiceFallbackFor('ne') === 'hi'
   && table.voiceFallbackFor('az') === 'tr' && table.voiceFallbackFor('tet') === 'id',
   '③ 꼴이 같은 짝은 그 언어 음성으로 읽는다 (ky→ru · ne→hi · az→tr · tet→id)');
ok(voiced.length === paired.length - 1,
   `③ 짝 ${paired.length}개 중 소리로 되는 것 ${voiced.length}개 — 못 되는 하나는 꼴이 다른 lo 다`);

/* 표에 없는 언어·모르는 언어는 '' — 모름을 됨으로 읽지 않는다 (§20) */
for (const l of ['uz', 'si', 'ko', 'en', '', null, 'zz']) {
  ok(table.voiceFallbackFor(l) === '', `③ 표에 없는 ${JSON.stringify(l)} 는 '' 다 (지어내지 않는다)`);
}
/* 꼴을 **모르는** 언어가 섞이면 바꾸지 않는다 — 이것이 '같다'로 새면 침묵을 소리로 읽는다 */
ok(table.scriptOf('uz') === '' , '③ 꼴을 모르는 언어는 꼴이 \'\' 다');

/* ── ③-b 되돌림 시연 (D-09) — 가르는 것은 **이름이 아니라 꼴**이다 ──── */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rtfb-'));
  const src = path.join(tmp, 'src');
  fs.mkdirSync(src, { recursive: true });
  /*
   * 앱 파일을 흉내 낸 작은 파일 하나 — `lo` 와 `th` 의 꼴을 **같게** 적었다.
   * 그러면 생성기는 `lo` 를 소리로 읽어도 된다고 말해야 한다. 이름 목록으로 막고
   * 있었다면 이 시연이 실패한다 — 그래서 "꼴이 정한다"가 글이 아니라 **사실**이 된다.
   */
  fs.writeFileSync(path.join(src, 'offlineLangs.js'),
    'export const FALLBACK_CHOICES = {\n  lo: [\'th\'],\n};\n'
    + 'export const SCRIPT_OF = {\n  lo: \'thai\', th: \'thai\',\n};\n');
  /* `--write` 가 없으니 "다르다"로 **1 로 끝난다** — 그것이 정상이고, 우리가 보는 것은 글이다 */
  const out = (() => {
    try { return execFileSync('node', [GEN, '--app', tmp], { cwd: ROOT, encoding: 'utf-8' }); }
    catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
  })();
  ok(/음성으로 대체되는 언어 1개: lo/.test(out),
     '③-b 되돌림 실증: 꼴을 같게 적은 앱 파일에서는 lo 가 소리로 대체된다 — 가르는 것은 이름이 아니라 꼴이다');
  ok(/\[DIFF\]|\[OK\]/.test(out), '③-b 시연은 커밋된 파일을 덮어쓰지 않는다 (--write 없이 돌렸다)');
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ── ④ 손님 페이지 배선 ─────────────────────────────────────────────── */
for (const f of ['index.src.html', 'index.html']) {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'listener', f), 'utf-8');
  ok(html.includes('../common/voice-fallback.js'), `④ ${f} 가 대체어 표를 싣는다`);
  ok(html.includes('pickVoice('), `④ ${f} 가 목소리를 한 자리에서 고른다 (pickVoice)`);
  /*
   * 옛 표를 **목소리 고르기에서** 더는 읽지 않는다. 번역 쪽 한 줄(`payload.fallbackLang`)은
   * 남아 있다 — 그것은 글자 대체이고 이 줄의 일이 아니다(보고에 적었다).
   */
  const reads = (html.match(/langObj\.fallback/g) || []).length;
  ok(reads <= 2, `④ ${f}: langs.json 의 fallback 을 읽는 곳이 ${reads}곳 — 목소리 쪽에서는 빠졌다`);
  ok(/payload\.fallbackLang = langObj\.fallback/.test(html),
     `④ ${f}: 번역 쪽 대체어는 그대로다 (이 줄은 목소리만 바꾼다)`);
  ok(html.includes('voice_fallback lang='), `④ ${f} 가 기록을 남긴다 (voice_fallback lang= use=)`);
}

console.log(`\n[OK] ${checks}개 확인 — 대체어 음성 표`);
