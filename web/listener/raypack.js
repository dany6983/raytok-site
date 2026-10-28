/**
 * 손님 페이지의 **레이팩(브라우저 안 번역)** — 장부 63 「붙이기」 (마스터 사이트 NOW 10-28 14:35).
 *
 * 손님이 말을 고르면 **뒤에서 저절로** 그 말의 팩(ko→X)을 받아 브라우저 안에서 번역한다.
 * 받는 동안·실패하면 지금 길(서버 번역)로 그대로 듣는다(R-15 — 손님을 멈추지 않는다).
 *
 * ★ 엔진·뒷배는 **측정 페이지의 것을 그대로** 쓴다(`../raypack-probe/probe.js`) — 두 벌을 두지
 *   않는다(§5). 거기서 재서 고친 것(SIMD 살피기 · 팩을 작업자에 한 벌 더 보내지 않기 ·
 *   기다리는 길마다 상한)이 손님 쪽에도 그대로 간다.
 * ★ 이 글은 첫 화면에 싣지 않는다 — 손님 페이지가 **말을 고른 뒤** `import()` 로 부른다
 *   (첫 화면 한도 37KB). bergamot·fflate 도 그때 같이 온다.
 * ★ 방법은 비밀이 아니다 — bergamot 은 공개 기술이고 팩은 공개 모델로 만든다(측정 글과 같다).
 *
 * 상태: idle → off(못 돈다·팩 없음·원문이 ko 아님) | ask(셀룰러 — 묻는다) | wait(와이파이 기다림)
 *       | loading(n%) → ready | failed
 */
import { canRun, fetchIndex, rowFor, getPack, sha256Hex, unzip, readPack, makeBacking,
         withLimit, LIMIT, PACK_BASE, CACHE_NAME } from '../raypack-probe/probe.js?v=4';
import { LatencyOptimisedTranslator } from '../vendor/bergamot/translator.js';

/** 판 번호 — 화면 기록에 같이 적는다(옛 글이 캐시에서 도는지 가리려고. 측정 페이지 10-28 에 배웠다) */
export const RP_VER = 1;

/** Cache Storage 에 두는 말 수. 넘으면 **오래 안 쓴 것부터** 지운다(팩 하나 50~70MB) */
export const KEEP = 2;

/** 한 줄 상한 — 넘으면 그 줄은 서버 번역으로(데운 뒤 한 문장 41~79ms 를 쟀다 · 폰 크롬) */
export const LINE_MS = 8000;

/**
 * 손님 화면의 말 코드 → 팩 목록의 `pair.dst`. **표로 읽는다**(§6 — 이름으로 가르지 않는다).
 * 팩 이름이 표준과 다른 것만 적는다(엔진 `HANDOFF-raypack.md` — `zt`·`tp` 는 엔진이 정한 이름).
 * 표에 없으면 앞 조각 그대로(`vi` → `vi`). 목록에 그 팩이 없으면 받지 않는다.
 */
export const PACK_CODE = { 'zh-CN': 'zh', 'zh-TW': 'zt', nb: 'no', fil: 'tl', tet: 'tp' };

export function packCode(lang) {
  const l = String(lang || '').trim();
  if (!l) return '';
  if (PACK_CODE[l]) return PACK_CODE[l];
  return l.split(/[-_]/)[0].toLowerCase();
}

/**
 * 받기 전에 물어야 하는 그물인가 — 데이터 아끼기를 켰거나 **모바일 데이터**로 보일 때.
 * `connection.type`(안드로이드 크롬) 이 있으면 그것을 믿는다. 없으면 `effectiveType` 이 느린 쪽
 * (`2g`·`3g`)일 때만 묻는다 — `effectiveType` 은 빠르기라 4g 와이파이와 4g 셀룰러를 못 가른다.
 * `connection` 이 아예 없으면(사파리) 모른다 → 묻지 않는다(짐작으로 막지 않는다 — D-11).
 */
export function onCellular(g = globalThis) {
  const c = g && g.navigator && g.navigator.connection;
  if (!c) return false;
  if (c.saveData) return true;
  if (c.type) return c.type === 'cellular';
  return /^(slow-2g|2g|3g)$/.test(String(c.effectiveType || ''));
}

/** fflate 는 `window.fflate` 로 쓴다(측정 글의 `unzip` 이 거기서 찾는다) — 없을 때만 싣는다 */
export function loadFflate(g = globalThis) {
  if (g.fflate) return Promise.resolve();
  const d = g.document;
  if (!d) return Promise.reject(new Error('fflate 를 실을 문서가 없다'));
  return withLimit(new Promise((ok, bad) => {
    const s = d.createElement('script');
    s.src = new URL('../vendor/fflate.min.js?v=4', import.meta.url).href;
    s.onload = () => ok();
    s.onerror = () => bad(new Error('fflate 를 못 실었다'));
    d.head.appendChild(s);
  }), LIMIT.index, 'fflate 싣기');
}

const LRU_KEY = 'raytok_raypack_lru';

/**
 * 저장 정리 — 최근 `KEEP` 개만 남긴다. 쓴 차례는 localStorage 에 주소로 적는다
 * (Cache Storage 는 쓴 때를 주지 않는다). 차례를 모르는 팩(측정 페이지가 둔 것)은 **가장 오래된 것**으로 친다.
 * 실패해도 손님 일은 계속한다 — 저장은 덤이다.
 */
export async function trimCache(url, g = globalThis, keep = KEEP) {
  let lru = [];
  try { lru = JSON.parse(g.localStorage.getItem(LRU_KEY) || '[]'); } catch { lru = []; }
  if (!Array.isArray(lru)) lru = [];
  lru = lru.filter((u) => u !== url).concat(url);
  const stay = lru.slice(-keep);
  try { g.localStorage.setItem(LRU_KEY, JSON.stringify(stay)); } catch { /* 사생활 창 */ }
  const gone = [];
  if (!g.caches) return gone;
  try {
    const c = await g.caches.open(CACHE_NAME);
    const keys = await c.keys();
    for (const k of keys) {
      const u = typeof k === 'string' ? k : k.url;
      if (!/\.rtpack$/.test(u) || stay.includes(u)) continue;
      await c.delete(k);
      gone.push(u);
    }
  } catch { /* 저장이 안 되는 브라우저 */ }
  return gone;
}

/**
 * 손님 페이지가 부르는 하나.
 *   opts.row   — `#pack-row` 요소(없으면 화면 없이 돈다 · 시험)
 *   opts.t     — 글자 꺼내기 `t(key)` (손님 페이지의 것)
 *   opts.src   — 원문 말 `() => srcLang`
 *   opts.log   — 기록 한 줄 `log(line)`
 *   opts.g     — 전역(시험이 바꿔 넣는다)
 *   opts.deps  — 엔진 쪽 함수들(시험이 가짜로 바꿔 넣는다)
 */
export function createRaypack(opts = {}) {
  const g = opts.g || globalThis;
  const base = opts.base || PACK_BASE;
  const log = opts.log || (() => {});
  const t = opts.t || ((k) => k);
  const src = opts.src || (() => 'ko');
  const row = opts.row || null;
  const deps = Object.assign({ canRun, fetchIndex, getPack, sha256Hex, unzip, readPack, makeBacking,
    Translator: LatencyOptimisedTranslator, loadFflate: () => loadFflate(g), trimCache: (u) => trimCache(u, g) },
  opts.deps || {});

  let want = null;       // 손님이 고른 말(화면 코드)
  let state = 'idle';
  let pct = 0;
  let tr = null;         // 뜬 번역기
  let target = null;     // 번역기에 줄 말 이름(팩 안 이름)
  let run = 0;           // 말을 바꾸면 앞 일을 버린다
  let netHook = null;

  function render() {
    if (!row) return;
    const d = row.ownerDocument;
    // 손님이 방에 들어가면 고르기 화면이 숨는다 — 받는 줄이 보이게 자막 위로 옮긴다
    const list = d && d.getElementById && d.getElementById('chat-list');
    if (list && d.documentElement.classList.contains('in-chat') && row.parentNode !== list.parentNode) {
      list.parentNode.insertBefore(row, list);
    }
    row.textContent = '';
    row.style.cssText = 'font-size:13px;color:var(--text-muted);margin:4px 16px 8px;text-align:center';
    if (state === 'loading') {
      row.textContent = String(t('pack_loading') || '').replace('{n}', String(pct));
    } else if (state === 'ask') {
      for (const [k, now] of [['pack_wifi', false], ['pack_now', true]]) {
        const b = d.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        b.dataset.rp = k;
        b.style.cssText = 'margin:2px 4px;padding:6px 10px;font-size:13px;width:auto;display:inline-block';
        b.textContent = t(k);
        b.onclick = () => (now ? start(want, { force: true }) : waitWifi());
        row.appendChild(b);
      }
    }
  }

  function set(s, n) {
    const was = state;
    state = s;
    if (typeof n === 'number') pct = n;
    if (was !== s) log(`raypack_state ${s} me=${want || '-'} v=${RP_VER}`);
    render();
  }

  function stopNet() {
    const c = g.navigator && g.navigator.connection;
    if (netHook && c && c.removeEventListener) c.removeEventListener('change', netHook);
    netHook = null;
  }

  /** 「와이파이에서 받기」 — 그물이 바뀌어 셀룰러가 아니게 되면 그때 받는다 */
  function waitWifi() {
    set('wait');
    const c = g.navigator && g.navigator.connection;
    if (!c || !c.addEventListener) return;
    stopNet();
    netHook = () => { if (!onCellular(g)) { stopNet(); start(want, { force: true }); } };
    c.addEventListener('change', netHook);
  }

  function drop() {
    if (tr) { try { tr.delete(); } catch { /* 지우기가 없으면 넘어간다 */ } }
    tr = null;
    target = null;
  }

  async function start(lang, { force = false } = {}) {
    const code = packCode(lang);
    if (lang === want && !force && ['loading', 'ready', 'ask', 'wait', 'off'].includes(state)) return state;
    want = lang;
    const my = ++run;
    stopNet();
    drop();
    if (!code || code === 'ko' || String(src() || 'ko').split(/[-_]/)[0] !== 'ko') { set('off'); return state; }
    // ① 이 브라우저가 엔진을 돌릴 수 있나 — 안 되면 **받지 않고 말없이** 지금 길(서버 번역)
    const can = deps.canRun(g);
    if (!can || !can.ok) { log(`raypack_skip why=${can && !can.simd ? 'nosimd' : 'cannot'}`); set('off'); return state; }
    // ② 모바일 데이터 — 묻는다. 기본은 기다림
    if (!force && onCellular(g)) { set('ask'); return state; }
    set('loading', 0);
    try {
      const idx = await deps.fetchIndex(base);
      if (my !== run) return state;
      const { row: pick, carrier } = rowFor(idx.rows, code);
      if (!pick) { log(`raypack_skip why=nopack me=${lang}`); set('off'); return state; }
      await deps.loadFflate();
      const got = await deps.getPack(pick, {
        base,
        onProgress: (a, b) => { if (my === run && b) { const n = Math.min(99, Math.floor((a / b) * 100)); if (n !== pct) set('loading', n); } },
      });
      if (my !== run) return state;
      const hex = await deps.sha256Hex(got.bytes);
      if (hex && hex !== pick.sha256) throw new Error('팩 해시가 다르다');
      deps.trimCache(got.url).catch(() => {});
      const pack = deps.readPack(await withLimit(deps.unzip(got.bytes), LIMIT.unzip, '푸는 데서 멈췄다'));
      got.bytes = null;                      // 60MB zip 을 놓아 준다(측정 글과 같다)
      const legs = pack.manifest.chain;
      const to = carrier ? 'en' : legs[legs.length - 1].to;
      let errs = 0;
      const onerror = (e) => { errs += 1; log(`raypack_engine_error ${String((e && e.message) || e).slice(0, 120)}`); };
      const backing = deps.makeBacking(pack, { onerror });
      const tnew = new deps.Translator({ pivotLanguage: 'en', downloadTimeout: 0 }, backing);
      tnew.onerror = onerror;
      // 데우기 — 첫 문장은 엔진 띄우기라 느리다(폰 크롬 177~227ms → 데운 뒤 41~79ms)
      const warm = await withLimit(tnew.translate({ from: 'ko', to, text: '안녕하세요.', html: false }),
        LIMIT.engine, '엔진이 뜨지 않았다');
      if (my !== run) { try { tnew.delete(); } catch { /* */ } return state; }
      if (!(warm && warm.target && typeof warm.target.text === 'string')) throw new Error('엔진이 빈 답을 냈다');
      if (!errs) pack.files = {};            // 모델은 이제 작업자 안에 있다
      tr = tnew;
      target = to;
      log(`raypack_ready file=${pick.file} to=${to} v=${RP_VER} from=${got.from || '-'}`);
      set('ready', 100);
    } catch (err) {
      if (my !== run) return state;
      drop();
      log(`raypack_fail ${String((err && err.message) || err).slice(0, 160)}`);
      set('failed');
    }
    return state;
  }

  /** 한 줄 번역 — 못 하면 **null**(그 줄은 서버 번역). 빈 답도 null 이다(§20) */
  async function translate(text) {
    if (state !== 'ready' || !tr || !text) return null;
    try {
      const r = await withLimit(tr.translate({ from: 'ko', to: target, text: String(text), html: false }),
        LINE_MS, '한 줄');
      const s = r && r.target && r.target.text;
      return typeof s === 'string' && s.trim() ? s : null;
    } catch (err) {
      log(`raypack_line_fail ${String((err && err.message) || err).slice(0, 120)}`);
      return null;
    }
  }

  return {
    want: (lang) => start(lang),
    now: () => start(want, { force: true }),     // 「지금 받기」
    wifi: () => waitWifi(),                       // 「와이파이에서 받기」
    translate,
    ready: () => state === 'ready' && !!tr,
    state: () => state,
    pct: () => pct,
    render,
  };
}
