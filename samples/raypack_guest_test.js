/* samples/raypack_guest_test.js — 손님 페이지 레이팩 붙이기 (장부 63 · 마스터 사이트 NOW 10-28 14:35 7번)
 *
 * 가짜 엔진으로 네 가지를 본다 (마스터가 적은 그대로):
 *   ① SIMD 없음   → 받기 0건 · 서버 번역
 *   ② 받는 중     → 서버 번역, 엔진이 뜨면 그 뒤 줄은 raypack (늦게 온 서버 글이 덮지 않는다)
 *   ③ 엔진 빈 답  → 그 줄은 서버 번역 (§20)
 *   ④ 셀룰러      → 받기 전에 「와이파이에서 받기 / 지금 받기」 · 받기 0건
 * 앞쪽(node)은 `raypack.js` 의 다스리개를 가짜 엔진으로 · 뒤쪽(크로미움)은 손님 페이지의 이음새를
 * 가짜 모듈로(②③) · 진짜 모듈로(④ — 진짜 import 사슬이 페이지에서 뜨는지도 같이 본다).
 *
 * 돌리기: node samples/raypack_guest_test.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const MOD = pathToFileURL(path.join(ROOT, 'web', 'listener', 'raypack.js')).href;
let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const SHA = 'a'.repeat(64);
const ROWS = [
  { pair: { src: 'ko', dst: 'vi' }, file: 'raypack-ko-vi@v1.rtpack', bytes: 3, sha256: SHA },
  { pair: { src: 'ko', dst: 'zt' }, file: 'raypack-ko-zt@v1.rtpack', bytes: 3, sha256: SHA },
];

/** 가짜 엔진 — 부른 수를 센다. `out(text)` 로 답을 정한다 */
function fakeDeps(o = {}) {
  const n = { index: 0, pack: 0 };
  const deps = {
    canRun: () => (o.simd === false ? { ok: false, simd: false } : { ok: true, simd: true }),
    fetchIndex: async () => { n.index += 1; return { rows: ROWS }; },
    loadFflate: async () => {},
    getPack: async (row) => { n.pack += 1; return { bytes: new Uint8Array(3), url: `https://r2/${row.file}`, from: '그물' }; },
    sha256Hex: async () => (o.badHash ? 'b'.repeat(64) : SHA),
    trimCache: async () => [],
    unzip: async () => ({}),
    readPack: () => ({ manifest: { chain: [{ from: 'ko', to: 'en' }, { from: 'en', to: o.to || 'vi' }] }, files: { x: 1 } }),
    makeBacking: () => ({}),
    Translator: class {
      translate({ text, to }) { n.to = to; return Promise.resolve({ target: { text: text === '안녕하세요.' ? 'Hi' : (o.out ? o.out(text) : `T:${text}`) } }); }
      delete() {}
    },
  };
  return { deps, n };
}

async function nodePart() {
  const m = await import(MOD);
  const { createRaypack, packCode, onCellular, trimCache, KEEP } = m;

  console.log('\n[0] 말 코드 → 팩 이름은 표로 읽는다 (§6)');
  ok(packCode('zh-TW') === 'zt' && packCode('zh-CN') === 'zh' && packCode('nb') === 'no'
    && packCode('fil') === 'tl' && packCode('tet') === 'tp' && packCode('vi') === 'vi', '표의 다섯 + 그 밖은 앞 조각');

  console.log('\n[1] ① SIMD 없음 → 받기 0건');
  {
    const { deps, n } = fakeDeps({ simd: false });
    const logs = [];
    const rp = createRaypack({ deps, g: {}, log: (s) => logs.push(s) });
    await rp.want('vi');
    ok(n.index === 0 && n.pack === 0, `목록·팩을 받지 않았다 (목록 ${n.index} · 팩 ${n.pack})`);
    ok(rp.state() === 'off' && !rp.ready(), `상태 off · ready=false → 줄은 서버 번역 (${rp.state()})`);
    ok((await rp.translate('안전')) === null, 'translate 는 null — 이음새가 서버 길로 간다');
    ok(logs.some((l) => /raypack_skip why=nosimd/.test(l)), '까닭을 기록에 남긴다 (raypack_skip why=nosimd)');
  }

  console.log('\n[2] ② 받는 중 → 서버, 뜨면 raypack');
  {
    const { deps, n } = fakeDeps();
    let release;
    const gate = new Promise((r) => { release = r; });
    const slow = Object.assign({}, deps, { getPack: async (row, o) => { o.onProgress(1, 3); await gate; return deps.getPack(row, o); } });
    const rp = createRaypack({ deps: slow, g: {} });
    const p = rp.want('vi');
    await tick(5);
    ok(rp.state() === 'loading' && !rp.ready(), `받는 중에는 ready=false (${rp.state()} ${rp.pct()}%)`);
    ok(rp.pct() === 33, `진행 n% 를 센다 (${rp.pct()})`);
    ok((await rp.translate('안전')) === null, '받는 중 translate 는 null');
    release();
    await p;
    ok(rp.ready(), `뜨면 ready (${rp.state()})`);
    ok((await rp.translate('안전모')) === 'T:안전모', '그 뒤 줄은 폰 안에서 번역한다');
    ok(n.to === 'vi', '팩 안 말 이름으로 부른다');
    await rp.want('vi');
    ok(n.index === 1, `같은 말을 다시 골라도 다시 받지 않는다 (목록 ${n.index})`);
  }

  console.log('\n[3] ③ 엔진 빈 답 → null (그 줄 서버)');
  {
    const { deps } = fakeDeps({ out: (t) => (t === '빈' ? '   ' : t === '없' ? undefined : `T:${t}`) });
    const rp = createRaypack({ deps, g: {} });
    await rp.want('vi');
    ok((await rp.translate('빈')) === null, '공백만 온 답은 null');
    ok((await rp.translate('없')) === null, '글이 없는 답은 null');
    ok((await rp.translate('있')) === 'T:있', '다음 줄은 다시 폰 안에서');
    const { deps: d2 } = fakeDeps({ badHash: true });
    const rp2 = createRaypack({ deps: d2, g: {} });
    await rp2.want('vi');
    ok(rp2.state() === 'failed' && !rp2.ready(), '팩 해시가 다르면 쓰지 않는다 (failed)');
  }

  console.log('\n[4] ④ 셀룰러 → 묻는다, 받기 0건');
  {
    const hooks = [];
    const conn = { type: 'cellular', addEventListener: (e, f) => hooks.push(f), removeEventListener: () => {} };
    const g = { navigator: { connection: conn } };
    ok(onCellular(g) === true, 'type=cellular 는 셀룰러');
    ok(onCellular({ navigator: { connection: { type: 'wifi', effectiveType: '4g' } } }) === false, 'wifi 는 아니다');
    ok(onCellular({ navigator: { connection: { saveData: true, type: 'wifi' } } }) === true, '데이터 아끼기는 묻는다');
    ok(onCellular({ navigator: { connection: { effectiveType: '3g' } } }) === true, 'type 이 없고 3g 면 묻는다');
    ok(onCellular({ navigator: {} }) === false, 'connection 이 없으면(사파리) 모른다 → 묻지 않는다');
    const { deps, n } = fakeDeps();
    const rp = createRaypack({ deps, g });
    await rp.want('vi');
    ok(rp.state() === 'ask' && n.index === 0 && n.pack === 0, `기본은 기다림 — 받기 0건 (${rp.state()})`);
    rp.wifi();
    ok(rp.state() === 'wait' && hooks.length === 1, '「와이파이에서 받기」 → 그물 바뀜을 기다린다');
    hooks[0]();
    await tick(5);
    ok(n.index === 0, '아직 셀룰러면 받지 않는다');
    conn.type = 'wifi';
    hooks[0]();
    await tick(20);
    ok(n.pack === 1 && rp.ready(), `와이파이가 되면 받는다 (팩 ${n.pack} · ${rp.state()})`);
    const { deps: d3, n: n3 } = fakeDeps();
    const rp3 = createRaypack({ deps: d3, g: { navigator: { connection: { type: 'cellular' } } } });
    await rp3.want('vi');
    await rp3.now();
    ok(n3.pack === 1 && rp3.ready(), '「지금 받기」 → 바로 받는다');
  }

  console.log('\n[5] 받지 않는 자리');
  {
    const { deps, n } = fakeDeps();
    const rp = createRaypack({ deps, g: {}, src: () => 'en' });
    await rp.want('vi');
    ok(rp.state() === 'off' && n.index === 0, '원문이 ko 가 아니면 받지 않는다 (팩은 ko→X)');
    const rpk = createRaypack({ deps, g: {} });
    await rpk.want('ko');
    ok(rpk.state() === 'off' && n.index === 0, '한국어 손님은 받지 않는다');
    const rps = createRaypack({ deps, g: {} });
    await rps.want('sw');
    ok(rps.state() === 'off' && n.pack === 0, '목록에 팩이 없는 말(sw)은 받지 않는다 → 서버');
    const { deps: dz, n: nz } = fakeDeps({ to: 'zt' });
    const rpz = createRaypack({ deps: dz, g: {} });
    await rpz.want('zh-TW');
    await rpz.translate('가');
    ok(rpz.ready() && nz.to === 'zt', 'zh-TW → zt 팩');
  }

  console.log(`\n[6] 저장은 최근 ${KEEP}개 말까지 — 넘으면 오래된 것부터 지운다`);
  {
    const store = new Map();
    const ls = {};
    const g = {
      localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } },
      caches: { open: async () => ({
        keys: async () => [...store.keys()].map((url) => ({ url })),
        delete: async (k) => store.delete(k.url),
      }) },
    };
    const u = (x) => `https://r2/raypack-ko-${x}@v1.rtpack`;
    store.set(u('old'), 1);                        // 차례를 모르는 팩(측정 페이지가 둔 것)
    store.set('https://r2/index.json', 1);
    let gone = [];
    for (const x of ['vi', 'ja', 'th']) { store.set(u(x), 1); gone = gone.concat(await trimCache(u(x), g)); }
    ok([...store.keys()].filter((k) => /rtpack/.test(k)).sort().join() === [u('ja'), u('th')].sort().join(),
      `남은 팩 = ja·th (지운 것 ${gone.length}개: 차례 모르는 것 · 가장 오래된 vi)`);
    ok(store.has('https://r2/index.json'), '팩이 아닌 것은 건드리지 않는다');
    await trimCache(u('ja'), g);
    ok(JSON.parse(ls.raytok_raypack_lru).join() === [u('th'), u('ja')].join(), '다시 쓴 말은 뒤로(최근)');
  }

  console.log('\n[9] 되돌림 실증 — 살피기를 빼면 [1] 의 「받기 0건」이 붉어진다');
  let revertFailed = false;
  try {
    const { deps, n } = fakeDeps({ simd: false });
    deps.canRun = () => ({ ok: true, simd: true });      // 되돌림: 살피기가 늘 「된다」
    const rp = createRaypack({ deps, g: {} });
    await rp.want('vi');
    revertFailed = n.index > 0 && n.pack > 0 && rp.ready();
  } catch (e) { revertFailed = false; }
  ok(revertFailed === true, '살피기가 없으면 SIMD 없는 폰도 60MB 를 받는다 — [1] 이 그것을 센다 (되돌림 실증 ①)');
}

/* ── 크로미움: 손님 페이지 이음새 ───────────────────────────────────────── */
const FAKE = `export function createRaypack(o) {
  const f = window.__rpFake = window.__rpFake || { ready: false, out: '', wants: [], calls: 0 };
  return { want(l) { f.wants.push(l); }, ready() { return f.ready; },
           translate(t) { f.calls += 1; return Promise.resolve(f.out); } };
}`;

async function pagePart() {
  const { chromium } = require('playwright');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => srv.listen(0, res));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    console.log('\n[7] 페이지 — ② 받는 중엔 서버, 뜨면 raypack · ③ 빈 답은 그 줄 서버');
    const page = await browser.newPage();
    await page.route('**/web/listener/raypack.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
    await page.goto(`${base}/web/listener/?lang=vi`);
    await page.waitForSelector('#lang-select');
    await page.evaluate(() => handleMessage({ welcome: 1, src_lang: 'ko' }));
    await page.waitForFunction(() => window.__rpFake && window.__rpFake.wants.length >= 1);
    ok((await page.evaluate(() => window.__rpFake.wants[0])) === 'vi', '들어가면 고른 말로 받기를 시작한다');
    const txt = (seq) => page.evaluate((s) => {
      const l = lines.find((x) => x.seq === s);
      const e = l && document.querySelector('#' + CSS.escape(lineElId(l)) + ' .msg-tr');
      return e ? e.textContent : null;
    }, seq);
    await page.evaluate(() => { handleMessage({ seq: 1, text: '안전모를 쓰세요.', tr: {} }); });
    await page.evaluate(() => handleMessage({ seq: 1, tr: { vi: 'S1' } }));
    ok((await page.evaluate(() => window.__rpFake.calls)) === 0, '받는 중(ready=false)에는 엔진을 부르지 않는다');
    ok(String(await txt(1)).startsWith('S1'), `받는 중 줄은 서버 번역 (${await txt(1)})`);

    await page.evaluate(() => { window.__rpFake.ready = true; window.__rpFake.out = 'R2'; handleMessage({ seq: 2, text: '장갑을 끼세요.', tr: {} }); });
    const sawRp = await page.waitForFunction(() => trPlanLog.some((l) => /plan=raypack seq=2/.test(l)), null, { timeout: 3000 })
      .then(() => true, () => false);
    ok(sawRp, '기록 `guest_tr_plan plan=raypack seq=2`');
    ok(String(await txt(2)).startsWith('R2'), `엔진이 뜬 뒤 줄은 폰 안 번역 (${await txt(2)})`);
    await page.evaluate(() => handleMessage({ seq: 2, tr: { vi: 'S2', ja: 'J2' } }));
    ok(String(await txt(2)).startsWith('R2'), '늦게 온 서버 글이 폰 안 번역을 덮지 않는다');
    ok((await page.evaluate(() => lines.find((l) => l.seq === 2).tr.ja)) === 'J2', '다른 말 칸은 서버 글을 그대로 받는다');

    await page.evaluate(() => { window.__rpFake.out = null; handleMessage({ seq: 3, text: '멈추세요.', tr: {} }); });
    const sawSv = await page.waitForFunction(() => trPlanLog.some((l) => /plan=server seq=3 why=empty/.test(l)), null, { timeout: 3000 })
      .then(() => true, () => false);
    ok(sawSv, '빈 답 → 기록 `guest_tr_plan plan=server seq=3 why=empty`');
    await page.evaluate(() => handleMessage({ seq: 3, tr: { vi: 'S3' } }));
    ok(String(await txt(3)).startsWith('S3'), `빈 답 줄은 서버 번역으로 (${await txt(3)})`);
    await page.evaluate(() => { window.__rpFake.out = 'R4'; handleMessage({ seq: 4, text: '좋아요.', tr: { vi: 'S4' } }); });
    await tick(50);
    ok(String(await txt(4)).startsWith('S4') && (await page.evaluate(() => window.__rpFake.calls)) === 2,
      '서버 글이 이미 온 줄은 엔진을 부르지 않는다');
    await page.close();

    console.log('\n[8] 페이지 — 진짜 모듈 · ④ 셀룰러면 두 단추, 받기 0건');
    const p2 = await browser.newPage();
    await p2.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true,
        value: { type: 'cellular', effectiveType: '4g', saveData: false, addEventListener() {}, removeEventListener() {} } });
    });
    let r2 = 0;
    await p2.route('**/*.r2.dev/**', (r) => { r2 += 1; r.fulfill({ status: 404, body: '' }); });
    await p2.goto(`${base}/web/listener/?lang=vi`);
    await p2.waitForSelector('#lang-select');
    await p2.selectOption('#lang-select', 'ja');
    await p2.waitForSelector('#pack-row button[data-rp="pack_now"]', { timeout: 15000 });
    const btns = await p2.$$eval('#pack-row button', (b) => b.map((x) => x.dataset.rp + '=' + x.textContent));
    ok(btns.length === 2 && /pack_wifi=/.test(btns[0]) && /pack_now=/.test(btns[1]), `두 단추 (${btns.join(' · ')})`);
    ok(btns.every((b) => !/=pack_/.test(b) && !/=$/.test(b)), '단추 글자가 사전에서 온다(키가 그대로 보이지 않는다)');
    ok(r2 === 0, `묻는 동안 팩 주소에 0번 갔다 (${r2})`);
    await p2.click('#pack-row button[data-rp="pack_now"]');
    await p2.waitForFunction(() => trPlanLog.some((l) => /raypack_(fail|state failed)/.test(l)), null, { timeout: 15000 });
    ok(r2 >= 1, `「지금 받기」 → 받으러 갔다 (${r2}번 · 여기선 404 로 막았다)`);
    ok((await p2.$$eval('#pack-row button', (b) => b.length)) === 0, '못 받으면 줄을 비운다 — 손님은 서버 번역으로 계속');
    await p2.close();
  } finally {
    await browser.close();
    srv.close();
  }
}

(async () => {
  console.log('=== 손님 페이지 레이팩 붙이기 (장부 63) ===');
  await nodePart();
  await pagePart();
  console.log(`\n${fail ? '실패' : '전부 통과'} (${pass} 통과 · ${fail} 실패)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
