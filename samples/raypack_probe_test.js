/**
 * 레이팩 브라우저 측정 글 지킴이 (장부 63 · `web/raypack-probe/probe.js`).
 *
 * 이 시험이 막는 것 — **10-27 에 실제로 당한 일**(MISTAKES #15):
 * 「기다리는 길을 만들었는데 **상한을 안 둬서** 아이폰이 멈춘 연결을 영원히 기다렸다」.
 * 10-28 에 측정 글도 똑같이 상한 없이 올렸다가 대표님 아이폰에서 멈춘 것처럼 보였다.
 * 그래서 **상한이 정말 무는지**를 여기서 본다. 그리고 주소 구멍이 **바깥 주소를 거절하는지**.
 *
 * 쓰기: node samples/raypack_probe_test.js
 */
const path = require('path');
const { pathToFileURL } = require('url');

const SRC = pathToFileURL(path.join(__dirname, '..', 'web', 'raypack-probe', 'probe.js')).href;

let bad = 0;
const ok = (cond, name) => {
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}`);
  if (!cond) bad += 1;
};

(async () => {
  const m = await import(SRC);
  const { withLimit, LIMIT, rowFor, baseFromUrl, autoFromUrl, postFromUrl,
          PACK_BASE, CACHE_NAME, SENTENCES, parseIndexless } = m;

  console.log('\n[1] 상한 — 기다리는 길에는 끝이 있어야 한다 (MISTAKES #15)');
  for (const k of ['index', 'stall', 'unzip', 'engine', 'sentence']) {
    ok(typeof LIMIT[k] === 'number' && LIMIT[k] > 0, `상한 ${k} 가 있다 (${LIMIT[k]}ms)`);
  }
  let bit = null;
  try { await withLimit(new Promise(() => {}), 60, '시험 자리'); } catch (e) { bit = e.message; }
  ok(!!bit && /시험 자리/.test(bit), '★ 안 끝나는 일을 끊는다 — 그리고 **어디서** 멈췄는지 말한다');
  ok(!!bit && /상한에 걸렸다/.test(bit), '「죽은 것이 아니라 상한」이라고 적는다');
  ok((await withLimit(Promise.resolve(7), 500, 'x')) === 7, '제때 끝난 값은 그대로 온다');
  const t0 = Date.now();
  try { await withLimit(new Promise(() => {}), 80, 'y'); } catch { /* 걸려야 한다 */ }
  ok(Date.now() - t0 < 2000, '상한이 지나면 **곧** 끊는다(기다리지 않는다)');

  console.log('\n[2] 주소 구멍 — 같은 집 길만 받는다');
  ok(baseFromUrl('?base=https://evil.test') === PACK_BASE, '바깥 주소는 **거절**하고 제 자리로');
  ok(baseFromUrl('?base=//evil.test') === PACK_BASE, '//호스트 꼴도 거절');
  ok(baseFromUrl('?base=/r2') === '/r2', '같은 집 길은 받는다(올리기 전 시험용)');
  ok(baseFromUrl('') === PACK_BASE, '안 주면 R2 공개 주소');
  ok(postFromUrl('?post=https://evil.test') === null, 'post 도 바깥 주소는 거절');
  ok(postFromUrl('?post=//evil.test') === null, 'post 도 //호스트 꼴 거절');
  ok(postFromUrl('?post=/collect') === '/collect', 'post 는 같은 집 길만');
  ok(JSON.stringify(autoFromUrl('?auto=en,vi')) === '["en","vi"]', 'auto 는 말 목록을 읽는다');
  ok(autoFromUrl('?auto=<script>').length === 0, 'auto 는 말 아닌 것을 버린다');

  console.log('\n[3] 팩 고르기 — `ko→en` 전용 팩은 없다(1단이 모든 팩 안에 있다)');
  const rows = [
    { file: 'vi.rtpack', bytes: 9, sha256: 'a'.repeat(64), pair: { src: 'ko', dst: 'vi' } },
    { file: 'ml.rtpack', bytes: 5, sha256: 'b'.repeat(64), pair: { src: 'ko', dst: 'ml' } },
    { file: 'bad.rtpack', bytes: 0, sha256: 'c'.repeat(64), pair: { src: 'ko', dst: 'en' } },
  ];
  const en = rowFor(rows, 'en');
  ok(en.carrier === true && en.row.file === 'ml.rtpack', 'en 은 **가장 작은 팩**을 운반 팩으로 고른다');
  const vi = rowFor(rows, 'vi');
  ok(vi.carrier === false && vi.row.file === 'vi.rtpack', 'vi 는 제 팩을 쓴다');
  ok(rowFor(rows, 'zz').row === null, '없는 말은 null — 지어내지 않는다');
  ok(rowFor([], 'en').row === null, '목록이 비면 null');

  console.log('\n[4] 재는 문장 — 짧은 인사말로 재면 숫자가 거짓이 된다');
  ok(SENTENCES.length === 10, `문장이 10개다 (${SENTENCES.length})`);
  const avg = SENTENCES.reduce((s, x) => s + x.length, 0) / SENTENCES.length;
  ok(avg > 20, `현장 말투라 한 문장이 길다 (평균 ${Math.round(avg)}자)`);
  ok(CACHE_NAME === 'raypack-v1', '저장 이름이 고정돼 있다(지우는 자리가 하나다)');

  /* ── 되돌림 실증 — **고침을 빼면 붉는다**를 코드로 보인다 ───────────────
   * 말로만 「되돌리면 붉다」 하면 빈 증거다(B-BACKLOG 그 줄). 그래서 **옛 꼴을 여기서
   * 다시 지어** 같은 검사를 돌려 본다. 옛 꼴이 통과하면 이 시험은 아무것도 지키지 않는 것이다.
   */
  console.log('\n[5] 되돌림 실증 — 고침을 빼면 붉어야 한다');

  // ⓐ 상한이 없던 꼴: 안 끝나는 일을 그냥 기다린다 → **영원히 멈춘다**(아이폰에서 본 그 꼴)
  const 되돌림_상한없음 = (p) => p;                 // 옛 꼴: 그냥 돌려준다
  let 옛꼴이멈췄나 = false;
  await Promise.race([
    되돌림_상한없음(new Promise(() => {})).then(() => { 옛꼴이멈췄나 = false; }),
    new Promise((r) => setTimeout(() => { 옛꼴이멈췄나 = true; r(); }, 300)),
  ]);
  ok(옛꼴이멈췄나, 'ⓐ 상한을 빼면 **끝나지 않는다** — 이 시험이 지키는 것이 그것이다');

  // ⓑ `//` 를 막지 않던 꼴: 같은 집 길인 줄 알고 **바깥 주소**를 받는다
  const 되돌림_빗금둘허용 = (v) => (v && v.startsWith('/') ? v : null);
  ok(되돌림_빗금둘허용('//evil.test') === '//evil.test' && baseFromUrl('?base=//evil.test') === PACK_BASE,
    'ⓑ `//호스트` 를 막는 줄을 빼면 바깥 주소가 들어온다 — 지금 꼴은 막는다');

  console.log(bad === 0 ? '\nraypack-probe 시험 통과 — 상한이 물고, 바깥 주소를 거절하고, 운반 팩을 고른다 (되돌림 실증 2건)'
    : `\n★ raypack-probe 시험 붉다 — ${bad}개`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error('시험이 터졌다:', e); process.exit(2); });
