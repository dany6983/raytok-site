/* NHN KCP 카드사 심사 동결 자물쇠 — 2026-10-19
 *
 * KCP 대외지원팀 회신(10-19): 카드사 심사는 **영업일 3~15일** 걸리고, 그 사이에
 *   ① 사이트 하단 정보("전화번호" 등) 변경   ② 상품 구매 불가 처리(품절)
 *   ③ 사이트 URL 주소 변경
 * 이 생기면 **심사불가**다. 그러니 이 셋은 심사 기간 중 사람 기억이 아니라 자물쇠가 지킨다.
 *
 * 굳힌 값은 `docs/kcp-review-freeze.json` 에 있다. 저장소가 그것과 어긋나면 붉어진다.
 * - 심사가 "완료"된 뒤 푸는 법: 그 파일의 `frozen` 을 false 로 바꾼다 (코드가 아니라 값이다).
 * - 굳힌 값을 다시 뜨는 법: `node samples/kcp_freeze_test.js --write`
 *
 * 새 페이지를 **더하는** 것은 막지 않는다 — KCP 가 말한 것은 **바뀌는** 것이다.
 * 있던 URL 이 없어지거나 이름이 바뀌는 것만 센다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SNAP = path.join(ROOT, 'docs', 'kcp-review-freeze.json');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  [PASS] ${msg}`); }
  else { fail++; console.log(`  [FAIL] ${msg}`); }
};

/* ── 저장소에서 지금 값을 읽는다 ───────────────────────────────── */
const BIZ = '376-88-02280';   // 사업자등록번호 — 하단 정보가 실린 페이지를 찾는 열쇠

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function readNow() {
  const files = walk(ROOT).filter(f => f.endsWith('.html'));
  const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

  // 하단 정보 — 사업자등록번호가 실린 줄을 그대로 뜬다(공백만 고른다)
  const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const line = (home.split('\n').find(l => l.includes(BIZ)) || '').replace(/\s+/g, ' ').trim();

  const footerPages = files.filter(f => fs.readFileSync(f, 'utf-8').includes(BIZ)).map(rel).sort();

  // URL — index.html 이 있는 자리(소스 파일 index.src.html 은 URL 이 아니다)
  const urls = files.filter(f => path.basename(f) === 'index.html')
    .map(f => '/' + rel(f).replace(/index\.html$/, '')).sort();

  // 상품 — 값과 **보이는지**(품절 처리가 아닌지)
  const buy = fs.readFileSync(path.join(ROOT, 'buy', 'index.html'), 'utf-8');
  const products = [];
  const re = /<div class="product-card[^"]*" data-id="([a-z0-9_]+)" data-price="(\d+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(buy))) {
    products.push({ id: m[1], price: Number(m[2]), hidden: /display:\s*none/.test(m[3]) });
  }
  return { footer: line, footerPages, urls, products };
}

/* ── 굳힌 값과 견준다 ─────────────────────────────────────────── */
function diff(snap, now) {
  const bad = [];
  if (snap.footer !== now.footer) bad.push('하단 정보 줄이 바뀌었다');
  for (const p of snap.footerPages) {
    if (!now.footerPages.includes(p)) bad.push(`하단 정보가 사라진 페이지: ${p}`);
  }
  for (const u of snap.urls) {
    if (!now.urls.includes(u)) bad.push(`없어진 URL: ${u}`);
  }
  for (const sp of snap.products) {
    const np = now.products.find(x => x.id === sp.id);
    if (!np) bad.push(`없어진 상품: ${sp.id}`);
    else if (np.price !== sp.price) bad.push(`상품값 변경: ${sp.id} ${sp.price} → ${np.price}`);
    else if (np.hidden !== sp.hidden) bad.push(`상품 노출 변경(품절 처리): ${sp.id}`);
  }
  return bad;
}

const now = readNow();

if (process.argv.includes('--write')) {
  const snap = Object.assign({
    frozen: true,
    since: new Date().toISOString().slice(0, 10),
    why: 'NHN KCP 카드사 심사 중(영업일 3~15일). 하단 정보·상품 구매 가능·URL 이 바뀌면 심사불가.',
    where: 'partner.kcp.co.kr → 상점정보관리 → 카드사심사 등록현황 (미등록 → 심사중 → 완료)'
  }, now);
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 2) + '\n');
  console.log(`굳혔다: ${path.relative(ROOT, SNAP)} (페이지 ${now.footerPages.length} · URL ${now.urls.length} · 상품 ${now.products.length})`);
  process.exit(0);
}

console.log('=== NHN KCP 카드사 심사 동결 ===\n');

if (!fs.existsSync(SNAP)) {
  console.log('  [FAIL] 굳힌 값이 없다 — node samples/kcp_freeze_test.js --write');
  process.exit(1);
}
const snap = JSON.parse(fs.readFileSync(SNAP, 'utf-8'));

if (snap.frozen !== true) {
  console.log(`  [PASS] 동결 풀림 (frozen=false, ${snap.since} 부터) — 심사가 끝난 뒤의 모양이다`);
  console.log('\n전부 통과 (1건)');
  process.exit(0);
}

ok(snap.footer.includes(BIZ) && snap.footer.includes('전화'), '굳힌 하단 정보에 사업자등록번호와 전화가 있다');

const bad = diff(snap, now);
ok(bad.length === 0, `심사 중 바뀌면 안 되는 것이 그대로다 (${bad.join(' · ') || '어긋남 없음'})`);
ok(now.footerPages.length === snap.footerPages.length,
   `하단 정보를 든 페이지 ${snap.footerPages.length}개 그대로 (지금 ${now.footerPages.length})`);
ok(now.products.filter(p => !p.hidden).length === snap.products.filter(p => !p.hidden).length,
   `살 수 있는 상품 ${snap.products.filter(p => !p.hidden).length}개 그대로 — 품절 처리가 없다`);

/* 되돌림 실증 (D-09) — 굳힌 값 셋을 하나씩 흔들어 보고, 견주는 쪽이 **실제로 잡는지** 본다.
   값은 저장소에서 읽은 것(now)과 굳힌 것(snap)뿐이다 — 여기서 만든 상수를 견주지 않는다. */
const bentPhone = JSON.parse(JSON.stringify(snap));
bentPhone.footer = bentPhone.footer.replace(/전화 [0-9-]+/, '전화 (굳힌 값을 흔든 자리)');
ok(bentPhone.footer !== snap.footer && diff(bentPhone, now).some(x => x.includes('하단 정보')),
   '하단 전화번호를 바꾸면 붉어진다 (되돌림 실증 ①)');

const bentSold = JSON.parse(JSON.stringify(snap));
const first = bentSold.products.find(p => !p.hidden);
first.hidden = true;
ok(diff(bentSold, now).some(x => x.includes('품절')),
   `상품 하나를 품절로 돌리면 붉어진다 — ${first.id} (되돌림 실증 ②)`);

const bentUrl = JSON.parse(JSON.stringify(snap));
bentUrl.urls.push('/buy/old/');
ok(diff(bentUrl, now).some(x => x.includes('없어진 URL')),
   'URL 이 없어지면 붉어진다 (되돌림 실증 ③)');

console.log(`\n${fail === 0 ? '전부 통과' : '붉다'} (${pass + fail}건${fail ? `, 실패 ${fail}` : ''})`);
process.exit(fail === 0 ? 0 : 1);
