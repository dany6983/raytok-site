/**
 * 웹 검증기가 **앱과 같은 해시**를 내는가 — 정본 벡터 5개 (앱 MASTER 10-20 00:40 A2-2).
 *
 * 앱 `__tests__/hashchain-v1.test.js` 72행이 이미 적어 두었다:
 *   "둘이 같은 값을 내지 않으면 **B 의 웹 검증기와도 어긋난다** — 그래서 같은 벡터로 본다."
 * 그런데 **웹 쪽엔 그 벡터를 도는 시험이 없었다.** 양쪽이 같다는 것을 지켜 줄 자물쇠가
 * 없으니 한쪽이 바뀌면 조용히 갈라지고, 그때 증상은 **"대표님이 받은 파일이 위변조로 뜬다"** 다.
 *
 * 그래서 `web/verify/index.html` 의 **그 함수들을 그대로 꺼내** 돌린다 — 베껴 적으면
 * 둘이 어긋나고 어긋난 쪽이 조용히 통과한다(D-193). 규칙 정본은
 * `raytok-native1/docs/RayTok-해시체인규칙_v1.md` §3·§4·§6.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const HTML = fs.readFileSync(path.join(ROOT, 'web/verify/index.html'), 'utf8');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };

console.log('=== 웹 검증기 · 해시 체인 v1 정본 벡터 ===');

/* ── 페이지에서 세 함수를 **그대로** 꺼낸다 (베끼지 않는다) ── */
function grab(name) {
  const m = HTML.match(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\([\\s\\S]*?\\n    \\}', 'm'));
  assert(m, `web/verify/index.html 에서 ${name}() 를 못 찾았다 — 이름이 바뀌었나?`);
  return m[0];
}
const sandbox = {
  TextEncoder, crypto: { subtle: crypto.webcrypto.subtle }, console,
};
vm.createContext(sandbox);
vm.runInContext([grab('sortKeysDeep'), grab('normalize'), grab('sha256'),
                 'globalThis.__n = normalize; globalThis.__h = sha256;'].join('\n'), sandbox);
const normalize = sandbox.__n;
const sha256 = sandbox.__h;
ok(typeof normalize === 'function' && typeof sha256 === 'function',
   '페이지에서 normalize()·sha256() 를 꺼냈다');

/* ── 정본 벡터 (규칙 v1 §6) — 키 순서를 일부러 섞어 두었다 ── */
const ZERO = '0'.repeat(64);
const ITEMS = [
  { ts: 1758500000000, session: '483921', n: 1, lang: 'ko', kind: 'begin', host: 'F971N' },
  { via: '', ts: 1758500003000, tr: { vi: 'Hãy đội mũ bảo hiểm', en: 'Wear a helmet' },
    text: '안전모를 쓰세요', src: 'ko', seq: 1, n: 2, kind: 'line' },
  { ts: 1758500004000, name: '', n: 3, lang: 'vi', kind: 'join', dev: 'a1b2c3' },
  { ts: 1758500010000, to: 4, n: 4, kind: 'gap', from: 2, dev: 'a1b2c3' },
  { ts: 1758500020000, n: 5, minutes: 0, lines: 1, kind: 'end', joined_max: 1 },
];
const EXPECT = [
  'b548e37f94be51d5922d4d528d61b72be1b64912d654d385a46f9095fff55bdd',
  'f6d03d6584553c373423ea0bfe224666013b1a8c533dae3932e62b774e6c3489',
  '61c80817f9498a6da7e595035314797b4a2e6e7a0f8718caaceefaf7ddbdfa2f',
  '7af2254f48d36f0fa6200f9b0fa05b9ea34641b9b5018178b2b7553d2c7d2a06',
  'a4435d240a9462b6a78adc2145d0ca11155a186fb76f6e78d362696edf73423e',
];

(async () => {
  ok(ITEMS.length === 5 && EXPECT.length === 5, '벡터가 5개다 — 0개를 도는 시험은 시험이 아니다');

  let prev = ZERO;
  const got = [];
  for (const it of ITEMS) {
    const item = { ...it, prev };
    got.push(await sha256(item.prev + '\n' + normalize(item)));
    prev = got[got.length - 1];
  }
  ok(JSON.stringify(got) === JSON.stringify(EXPECT),
     '다섯 해시가 앱과 **글자 하나까지 같다**'
     + (JSON.stringify(got) === JSON.stringify(EXPECT) ? '' : `\n    받음: ${JSON.stringify(got, null, 2)}`));
  ok(prev === EXPECT[4], '마지막 prev 가 마지막 hash 와 같다 (사슬이 이어진다)');

  /* §3 ① — hash 칸이 이미 있어도 정규화에서 빠진다 */
  const withHash = { ...ITEMS[0], prev: ZERO, hash: 'x'.repeat(64) };
  ok(await sha256(withHash.prev + '\n' + normalize(withHash)) === EXPECT[0],
     'hash 칸이 들어 있어도 같은 값이다 (§3 ①)');
  ok(!normalize(withHash).includes('xxxx'), '정규화한 글에 hash 가 안 남는다');

  /* §3 ③④ — 공백 없음 · 비ASCII 를 이스케이프하지 않음 */
  const norm1 = normalize({ ...ITEMS[1], prev: ZERO });
  ok(!/: |, /.test(norm1), '정규화에 군더더기 공백이 없다 (§3 ③)');
  ok(norm1.includes('안전모를 쓰세요') && norm1.includes('Hãy đội mũ bảo hiểm'),
     '비ASCII 를 그대로 둔다 — \\uXXXX 로 바꾸지 않는다 (§3 ④)');

  /* 키 정렬이 정말 도는가 — 섞어 넣어도 같은 글이 나와야 한다 */
  const a = normalize({ b: 2, a: 1, prev: ZERO });
  const b = normalize({ prev: ZERO, a: 1, b: 2 });
  ok(a === b, '키 순서가 달라도 정규화 결과가 같다 (§3 ②)');

  /* ── 되돌림 실증 (D-09) — 잣대가 살아 있나 ── */
  const bad = await sha256(ZERO + '\n' + JSON.stringify({ ...ITEMS[0], prev: ZERO }));
  ok(bad !== EXPECT[0], '되돌림 실증: 키를 정렬하지 않으면 다른 해시가 나온다');
  const bad2 = await sha256(ZERO + normalize({ ...ITEMS[0], prev: ZERO }));
  ok(bad2 !== EXPECT[0], "되돌림 실증: prev 뒤 '\\n' 을 빼면 다른 해시가 나온다");

  console.log(`\n전부 통과 (${n}건)`);
})().catch((e) => { console.error(e); process.exit(1); });
