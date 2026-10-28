/**
 * 레이팩 **브라우저 측정** — 손님 브라우저에서 ko→X 를 돌려 보고 숫자를 낸다.
 * 장부 63 · 마스터 NOW 10-28 11:35 ①.
 *
 * 흐름: 목록(R2) → `.rtpack` 받기(진행 막대) → 브라우저 안에서 풀기(fflate) →
 *       Worker 에서 bergamot WASM 으로 ko→en→X 두 다리 → 숫자 다섯.
 *
 * 재는 것 다섯 (마스터가 적은 그대로):
 *   ① 받는 시간      ② 첫 번역까지 시간(엔진 띄우기 + 모델 싣기 포함)
 *   ③ 한 문장 ms(10문장 평균) ④ 메모리(`performance.memory` 되는 곳만)
 *   ⑤ 저장(Cache Storage) 뒤 **두 번째 열 때** 받는 시간
 *
 * ★ **방법은 비밀이 아니다** — bergamot 은 공개 기술이고 팩은 공개 모델로 만든다.
 *   그래서 이 글은 공개 저장소에 둔다(마스터 ①).
 * ★ **CDN 에 기대지 않는다** — bergamot WASM 은 `web/vendor/bergamot/` 에 같이 올린다.
 * ★ **안 되는 것을 화면에 적는다**(D-70): CORS·없는 팩·해시 어긋남을 숨기지 않는다.
 */
import { TranslatorBacking, LatencyOptimisedTranslator } from '../vendor/bergamot/translator.js';

/** 팩이 사는 곳 — 엔진이 올린 R2 공개 주소. **한 곳에만** 적는다 */
export const PACK_BASE = 'https://pub-e2d5652d16454d42ad1823093e2c8809.r2.dev';
export const CACHE_NAME = 'raypack-v1';

/** 잴 문장 10개 — 현장 말투(안전교육). 짧은 인사말로 재면 숫자가 거짓이 된다 */
export const SENTENCES = [
  '오늘 교육은 용접 작업 전 안전 점검에 대한 내용입니다.',
  '보호구는 용접면과 가죽 장갑을 반드시 착용합니다.',
  '밀폐 공간에서는 산소 농도를 측정기로 먼저 확인하세요.',
  '용접기 접지선이 풀려 있으면 감전 위험이 있습니다.',
  '불꽃이 튀는 반경 오 미터 안에는 인화성 물질을 두지 않습니다.',
  '소화기는 작업 지점에서 삼 미터 안에 둡니다.',
  '고소 작업을 할 때는 안전대를 먼저 걸고 시작합니다.',
  '이상이 발견되면 작업을 멈추고 반장에게 보고합니다.',
  '보고했다는 이유로 불이익을 받는 일은 없습니다.',
  '다음 주 교육은 지게차와 보행자 동선 분리입니다.',
];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const ms = (t) => Math.round(t);

/**
 * ★ **기다리는 길에는 상한을 같이 둔다** (사이트 MISTAKES #15 — 10-27 에 아이폰 손님이
 *   멈춘 연결을 영원히 기다린 그 사고). 상한이 없으면 화면이 **죽은 것처럼** 보이고,
 *   보는 사람은 기다려야 하는지 다시 눌러야 하는지 모른다. 그래서 **어디서 멈췄는지 적고** 끝낸다.
 */
export const LIMIT = {
  index: 15000,      // 목록(32KB)
  stall: 25000,      // 받다가 **더 이상 늘지 않는** 시간
  unzip: 120000,     // 60MB 풀기 (낡은 폰은 느리다)
  engine: 120000,    // 엔진 띄우기 + 모델 싣기 + 첫 문장
  sentence: 60000,   // 한 문장
};

export function withLimit(p, msLimit, why) {
  let t;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((_, bad) => {
      t = setTimeout(() => bad(new Error(`${why} — ${Math.round(msLimit / 1000)}초를 넘겼다. `
        + '멈춘 자리가 여기다(죽은 것이 아니라 상한에 걸렸다).')), msLimit);
    }),
  ]);
}

/** 목록에서 그 말의 줄을 고른다. `en` 은 **전용 팩이 없다** — 아래 쪽지 */
export function rowFor(rows, to) {
  const list = Array.isArray(rows) ? rows : [];
  const ok = (r) => r && r.file && r.bytes > 0 && typeof r.sha256 === 'string' && r.sha256.length === 64;
  const hit = list.find((r) => ok(r) && r.pair && r.pair.src === 'ko' && r.pair.dst === to);
  if (hit) return { row: hit, carrier: false };
  // ★ `ko→en` 팩은 **없다. 일부러다** — 1단 `mt/ko-en/` 이 **모든 팩 안에** 들어 있다
  //   (엔진 `HANDOFF-raypack.md` 5-2). 그래서 가장 작은 팩을 **운반 팩**으로 쓰고,
  //   받는 시간 칸은 **그 팩 크기**임을 화면에 적는다. 숨기면 표를 잘못 읽는다.
  if (to === 'en') {
    const small = list.filter(ok).sort((a, b) => a.bytes - b.bytes)[0];
    if (small) return { row: small, carrier: true };
  }
  return { row: null, carrier: false };
}

/** 사람이 읽을 크기 */
export const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;

/**
 * 팩 자리를 주소줄로 바꿔 보는 **시험 구멍**: `?base=/r2` 처럼 **같은 집 길**만 받는다.
 * 까닭: 올리기 전에 이 쪽에서 끝까지 돌려 봐야 하는데, R2 CORS 가 `https://raytok.kr` 하나만
 * 허용한다(10-28 에 재서 알았다). 그래서 시험할 때는 **우리 서버가 대신 받아** 같은 집에서 준다.
 * 바깥 주소는 받지 않는다 — 남이 이 장을 엉뚱한 곳으로 돌리지 못하게.
 */
export function baseFromUrl(search = '', fallback = PACK_BASE) {
  const v = new URLSearchParams(search).get('base');
  // ★ `//호스트` 는 **같은 집 길이 아니다** — 브라우저가 바깥 주소로 읽는다(`//evil.test`).
  //   `/` 로 시작한다고 다 안집이 아니다. 시험이 이것을 잡았다(10-28).
  if (v && v.startsWith('/') && !v.startsWith('//')) return v.replace(/\/+$/, '');
  return fallback;
}

/**
 * 폰에서 재려면 **손가락 없이** 돌아야 한다(USB 로 주소만 띄운다) — `?auto=en,vi`.
 * 아는 말만 받는다(두 글자). 안 주면 빈 배열이고, 그때는 사람이 단추를 누른다.
 */
export function autoFromUrl(search = '') {
  const v = new URLSearchParams(search).get('auto') || '';
  return v.split(',').map((s) => s.trim()).filter((s) => /^[a-z]{2,3}$/.test(s));
}

/**
 * 폰 화면의 숫자를 손으로 베끼면 틀린다 — 끝나면 **같은 집 길**로 보내 둔다(`?post=/collect`).
 * 바깥 주소는 받지 않는다. 받는 자리가 없으면 조용히 넘어간다(측정은 이미 끝났다).
 */
/**
 * **저장을 건너뛴다** (`?nocache=1`). 아이폰에서 60MB 를 Cache Storage 에 쓰는 동안
 * 같은 60MB 를 메모리에 들고 있으면 거기서 죽을 수 있다 — 가볍게 재 볼 길을 남긴다.
 * 끄면 ⑤(두 번째 열 때)는 못 잰다. 그 칸은 「안 쟀다」로 남는다.
 */
export function cacheFromUrl(search = '') {
  return new URLSearchParams(search).get('nocache') !== '1';
}

export function postFromUrl(search = '') {
  const v = new URLSearchParams(search).get('post');
  return v && v.startsWith('/') && !v.startsWith('//') ? v : null;   // `//호스트` 는 바깥이다
}

/**
 * 그물 오류를 **사람 말로** 바꾼다. CORS 는 브라우저가 까닭을 숨기므로(보안) 짐작이 아니라
 * **그럴 때 무엇을 봐야 하는지**를 적는다.
 */
export function whyNet(err, url) {
  const m = String((err && err.message) || err || '');
  if (/Failed to fetch|NetworkError|load failed/i.test(m)) {
    return `받지 못했다 — **CORS 필요**일 수 있다. 이 페이지 주소(${location.origin}) 가 `
      + `R2 버킷 CORS 에 GET 으로 허용되어 있어야 한다 (대시보드 → R2 → raytok-packs → Settings → CORS). `
      + `주소: ${url} · 원래 오류: ${m}`;
  }
  return `${m} · 주소: ${url}`;
}

/**
 * **먼저 가린다 — 이 브라우저가 엔진을 돌릴 수 있나** (10-28, 대표님 아이폰에서 배웠다).
 *
 * 아이폰 iOS 15 에서 받기(48MB)와 풀기는 다 됐는데 **「엔진 띄우고 첫 문장」에서 멈췄다.**
 * ★ **SIMD 가 없으면 막는다 — 10-28 에 기기가 직접 말했다.** 처음에는 「확인 못 했다」며
 *   알려만 주고 돌렸더니, 대표님 아이폰(iOS 15.0)이 받기·풀기를 다 마치고 엔진에서 이렇게 냈다:
 *     `WebAssembly.Module doesn't parse at byte 79: invalid opcode 253, in function at index 4096`
 *   **opcode 253 = 0xFD = WASM SIMD 머리 바이트**다. 한 줄에 둘이 같이 증명됐다 —
 *   이 기기에 SIMD 가 없고, bergamot wasm 이 **실제로 SIMD 를 쓴다**. 사파리는 **iOS 16.4 부터**다.
 *   그러니 이제는 **48MB 를 받기 전에 멈추는 것**이 맞다(손님 데이터를 버리지 않는다).
 *
 * 재는 법은 짐작이 아니다: **작은 SIMD 꾸러미 하나를 실제로 검사시켜** 본다
 * (`wasm-feature-detect` 가 쓰는 그 꼴 그대로).
 */
export const SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
]);

export function canRun(g = globalThis) {
  const wasm = typeof g.WebAssembly === 'object' && typeof g.WebAssembly.validate === 'function';
  let simd = false;
  try { simd = wasm && g.WebAssembly.validate(SIMD_PROBE); } catch { simd = false; }
  const worker = typeof g.Worker === 'function';
  const cache = typeof g.caches !== 'undefined';
  const why = !wasm ? 'WASM 이 없다 — 이 브라우저로는 못 돈다'
    : (!worker ? '작업자(Worker)가 없다 — 이 브라우저로는 못 돈다'
      : (!simd ? '**WASM SIMD 가 없다 — 이 브라우저로는 못 돈다.** 번역 엔진이 SIMD 로 지어져 있어 '
        + '모듈을 읽다가 멈춘다(`invalid opcode 253` = SIMD 머리 바이트 — 10-28 에 아이폰 iOS 15 에서 '
        + '직접 봤다). 사파리는 **iOS 16.4 부터** 된다. 48MB 를 받아도 소용이 없어 **여기서 멈춘다**. '
        + '이 기기에서는 지금 쓰는 길(서버 번역)로 간다.' : ''));
  return { ok: !why, wasm, simd, worker, cache, why, warn: '' };
}

/** 목록 받기 */
export async function fetchIndex(base = PACK_BASE) {
  const url = `${base.replace(/\/+$/, '')}/index.json`;
  const t0 = now();
  let res;
  try {
    res = await withLimit(fetch(url, { credentials: 'omit' }), LIMIT.index, '목록을 받지 못했다');
  } catch (err) {
    throw new Error(/상한에 걸렸다/.test(String(err.message)) ? err.message : whyNet(err, url));
  }
  if (!res.ok) throw new Error(`목록을 못 받았다 — HTTP ${res.status} · ${url}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('목록이 배열이 아니다 — 지어내지 않고 멈춘다');
  return { rows, ms: ms(now() - t0), url };
}

/**
 * 팩 받기 — **진행 막대**를 위해 조각으로 읽는다.
 * 저장(Cache Storage)이 되는 곳에서는 **두 번째부터 거기서** 꺼낸다(⑤ 를 재는 자리).
 */
export async function getPack(row, { base = PACK_BASE, onProgress = () => {}, useCache = true } = {}) {
  const url = `${base.replace(/\/+$/, '')}/${row.file}`;
  const t0 = now();
  let cache = null;
  if (useCache && typeof caches !== 'undefined') {
    try { cache = await caches.open(CACHE_NAME); } catch { cache = null; }
  }
  if (cache) {
    const hit = await cache.match(url).catch(() => null);
    if (hit) {
      const buf = new Uint8Array(await hit.arrayBuffer());
      return { bytes: buf, ms: ms(now() - t0), from: '저장', url };
    }
  }
  let res;
  try {
    res = await fetch(url, { credentials: 'omit' });
  } catch (err) {
    throw new Error(whyNet(err, url));
  }
  if (!res.ok) throw new Error(`팩을 못 받았다 — HTTP ${res.status} · ${url}`);

  const total = Number(res.headers.get('content-length')) || row.bytes || 0;
  const parts = [];
  let got = 0;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      // ★ 한 조각을 기다리는 데도 상한을 둔다 — 그물이 멈추면 **멈춘 자리**를 적고 끝낸다
      let step;
      try {
        step = await withLimit(reader.read(), LIMIT.stall,
          `받다가 멈췄다(${mb(got)} / ${total ? mb(total) : '?'} 에서)`);
      } catch (err) {
        try { await reader.cancel(); } catch { /* 이미 끊겼으면 넘어간다 */ }
        throw err;
      }
      if (step.done) break;
      parts.push(step.value);
      got += step.value.length;
      onProgress(got, total);
    }
  } else {
    const one = new Uint8Array(await res.arrayBuffer());
    parts.push(one);
    got = one.length;
    onProgress(got, total);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  const took = ms(now() - t0);

  // ★ **크기가 다르면 쓰지 않는다** — 끊긴 팩으로 번역하면 까닭 모를 오류가 된다
  if (row.bytes && bytes.length !== row.bytes) {
    throw new Error(`받은 크기가 다르다 — ${bytes.length} ≠ 목록의 ${row.bytes}`);
  }
  if (cache) {
    try {
      await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/zip' } }));
    } catch { /* 저장이 안 되는 브라우저도 있다 — 측정은 계속한다 */ }
  }
  return { bytes, ms: took, from: '그물', url };
}

/** sha256 을 브라우저가 셈한다(`crypto.subtle` 은 https 에서만 된다 — 안 되면 **안 쟀다**고 적는다) */
export async function sha256Hex(bytes) {
  if (!(globalThis.crypto && crypto.subtle && crypto.subtle.digest)) return null;
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** zip 풀기 — `fflate` 는 `window.fflate` 에 있다(페이지가 먼저 싣는다) */
export function unzip(bytes) {
  return new Promise((accept, reject) => {
    const f = globalThis.fflate;
    if (!f || !f.unzip) return reject(new Error('fflate 가 없다 — 페이지가 라이브러리를 못 실었다'));
    f.unzip(bytes, (err, files) => (err ? reject(err) : accept(files)));
  });
}

const ab = (u8) => (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
  ? u8.buffer : u8.slice().buffer);

/** 푼 팩 → `{manifest, files}`. `manifest.json` 이 없으면 멈춘다(지어내지 않는다) */
export function readPack(files) {
  const names = Object.keys(files);
  const mName = names.find((n) => n.replace(/^.*\//, '') === 'manifest.json');
  if (!mName) throw new Error(`팩 안에 manifest.json 이 없다 — 들어 있는 것: ${names.slice(0, 6).join(' ')}`);
  const manifest = JSON.parse(new TextDecoder().decode(files[mName]));
  if (!manifest.chain || !manifest.chain.length) throw new Error('manifest 에 chain 이 없다');
  return { manifest, files, names };
}

/**
 * **팩에서 모델을 꺼내 주는 뒷배** — bergamot 이 그물에서 받는 대신 우리 팩을 쓰게 한다.
 *
 * ★ `TranslatorBacking` 의 생성자가 **곧바로** `loadModelRegistery()` 를 부른다.
 *   그래서 팩을 `this.pack` 에 담아 두면 **늦다**(아직 안 만들어졌다) — `this.options.pack` 으로 읽는다.
 */
/**
 * ★ **팩을 `options` 에 넣지 않는다** — 10-28 에 재서 알았다.
 *   `TranslatorBacking` 은 작업자를 띄우며 `call('initialize', this.options)` 로 **옵션을 통째로
 *   작업자에 복사해 보낸다.** 거기에 팩(푼 모델 60MB)을 넣어 두면 **같은 60MB 가 한 벌 더** 간다 —
 *   아이폰에서 「엔진 띄우고 첫 문장」에 멈춘 자리가 바로 거기일 수 있다.
 *   게다가 거기에 함수(`onerror`)를 넣으면 **복사 자체가 터진다**
 *   (`Failed to execute 'postMessage' on 'Worker'` — 내 손으로 한 번 넣어 보고 걸렸다).
 *
 *   그런데 뒷배의 생성자가 **곧바로** `loadModelRegistery()` 를 부르므로 팩을 나중에 넣을 수도 없다.
 *   그래서 **만드는 동안만** 이 자리에 놓아 두고 꺼내 쓴다. `makeBacking()` 하나로만 만든다.
 */
let PENDING_PACK = null;

export function makeBacking(pack, { onerror } = {}) {
  PENDING_PACK = pack;
  try {
    // 작업자로 가는 것은 이 셋뿐이다 — 전부 작은 값이다
    const b = new RaypackBacking({ pivotLanguage: 'en', downloadTimeout: 0, cacheSize: 0 });
    b.pack = pack;
    if (typeof onerror === 'function') b.onerror = onerror;   // 함수는 **옵션 밖**에서 꽂는다
    return b;
  } finally {
    PENDING_PACK = null;
  }
}

export class RaypackBacking extends TranslatorBacking {
  async loadModelRegistery() {
    const pack = this.pack || PENDING_PACK;     // 생성자가 부를 때는 아직 `this.pack` 이 없다
    if (!pack) throw new Error('팩 없이 뒷배를 만들었다 — makeBacking() 으로 만들어라');
    this.pack = pack;
    return pack.manifest.chain.map((c) => ({ from: c.from, to: c.to, dir: c.dir }));
  }

  async loadTranslationModel({ from, to }) {
    const pack = this.pack;
    const leg = (await this.registry).find((m) => m.from === from && m.to === to);
    if (!leg) throw new Error(`팩에 ${from}→${to} 다리가 없다`);
    const pick = (name) => {
      const want = `${leg.dir}${name}`;
      const key = Object.keys(pack.files).find((k) => k === want || k.endsWith(`/${want}`) || k.endsWith(`${leg.dir}${name}`));
      return key ? pack.files[key] : null;
    };
    const model = pick('model.bin');
    const lex = pick('lex.bin');
    const vocab = pick('vocab.bin');
    const srcvocab = pick('srcvocab.bin');
    const trgvocab = pick('trgvocab.bin');
    if (!model || !lex) throw new Error(`${from}→${to} 에 model.bin 또는 lex.bin 이 없다`);
    // ★ 어휘는 **한 벌이거나 두 벌**이다 — `en→ja`·`en→ko` 둘만 두 벌(엔진 HANDOFF 1장)
    const vocabs = vocab ? [ab(vocab)] : (srcvocab && trgvocab ? [ab(srcvocab), ab(trgvocab)] : null);
    if (!vocabs) throw new Error(`${from}→${to} 에 vocab 이 없다`);
    return { model: ab(model), shortlist: ab(lex), vocabs, qualityModel: null, config: {} };
  }
}

/** 메모리 — 되는 브라우저만. 안 되면 **null**(0 이 아니다) */
export function memoryMb() {
  const m = (typeof performance !== 'undefined' && performance.memory) || null;
  return m && m.usedJSHeapSize ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

/**
 * 한 번 다 재는 길. `log(글)` 로 진행을 알린다.
 * 돌려주는 것: 숫자 다섯 + 번역 보기.
 */
export async function measure(to, { base = PACK_BASE, log = () => {}, onProgress = () => {},
                                    sentences = SENTENCES, useCache = true } = {}) {
  const out = { to, at: new Date().toISOString(), base };
  // ★ **48MB 를 받기 전에** 이 브라우저가 엔진을 돌릴 수 있는지 먼저 본다
  const can = canRun();
  out.can = can;
  log(`브라우저 살피기 — WASM ${can.wasm ? '있다' : '없다'} · SIMD ${can.simd ? '된다' : '**안 된다**'} · `
    + `작업자 ${can.worker ? '있다' : '없다'} · 저장 ${can.cache ? '된다' : '안 된다'}`);
  if (!can.ok) throw new Error(can.why);
  if (can.warn) log(`※ ${can.warn}`);
  log('목록 받는 중…');
  const idx = await fetchIndex(base);
  out.indexMs = idx.ms;

  const { row, carrier } = rowFor(idx.rows, to);
  if (!row) throw new Error(`목록에 ko→${to} 가 없다 (줄 ${idx.rows.length}개)`);
  out.file = row.file;
  out.packBytes = row.bytes;
  out.carrier = carrier;
  log(carrier
    ? `ko→en 전용 팩은 없다 — 1단이 모든 팩 안에 있다. 운반 팩 ${row.file} (${mb(row.bytes)}) 로 잰다.`
    : `팩 ${row.file} (${mb(row.bytes)}) 받는 중…`);

  // ① 받는 시간 (저장을 비우고 — 첫 손님 몫)
  if (typeof caches !== 'undefined') { try { await caches.delete(CACHE_NAME); } catch { /* 없으면 넘어간다 */ } }
  const got = await getPack(row, { base, onProgress, useCache });
  out.downloadMs = got.ms;
  out.downloadFrom = got.from;
  out.mbps = got.ms ? Math.round((row.bytes / 1048576) / (got.ms / 1000) * 10) / 10 : null;

  // 해시 — 팩이 성한지. 안 되는 브라우저면 「안 쟀다」
  const hex = await sha256Hex(got.bytes);
  out.sha256 = hex ? (hex === row.sha256 ? '맞음' : '다름') : '안 쟀다';
  if (out.sha256 === '다름') throw new Error('팩 해시가 다르다 — 쓰지 않는다');

  log('푸는 중…');
  const t1 = now();
  const pack = readPack(await withLimit(unzip(got.bytes), LIMIT.unzip, '푸는 데서 멈췄다'));
  out.unzipMs = ms(now() - t1);
  // ★ **60MB zip 을 놓아 준다.** 아이폰 사파리는 탭 메모리가 빡빡해서, 푼 것과 zip 을 같이
  //   들고 엔진을 띄우면 거기서 **조용히 죽는다**(대표님 10-28 「엔진 띄우고 첫 문장에서 멈춤」).
  //   더 쓸 일이 없으니 여기서 떼어 놓는다.
  got.bytes = null;
  out.packName = pack.manifest.name || '';
  out.legs = pack.manifest.chain.map((c) => `${c.from}→${c.to}`).join(' · ');

  // ② 첫 번역까지 — 엔진 띄우기 + 모델 싣기 + 첫 문장
  log('엔진 띄우고 첫 문장…');
  const t2 = now();
  // ★ **엔진이 내는 오류를 화면으로 끌어온다.** 전에는 멈춘 것만 보이고 **까닭이 안 보였다** —
  //   작업자(worker)가 WASM 메모리에서 죽으면 그 자리에서 조용히 끝난다. bergamot 은
  //   `onerror` 를 주면 그것을 불러 주므로(worker 의 'error' 를 그대로 잇는다) 그 글을 적는다.
  const engineErrs = [];
  const onerror = (e) => {
    const m = (e && (e.message || e.reason || e.type)) || String(e);
    engineErrs.push(String(m).slice(0, 200));
    log(`엔진이 오류를 냈다: ${String(m).slice(0, 160)}`);
  };
  const backing = makeBacking(pack, { onerror });
  // ★ 번역기 옵션에도 **함수를 넣지 않는다** — 같은 길로 작업자에 복사된다
  const tr = new LatencyOptimisedTranslator({ pivotLanguage: 'en', downloadTimeout: 0 }, backing);
  tr.onerror = onerror;
  // ★ 아이폰에서 가장 멈추기 쉬운 자리다 — WASM + 모델 두 다리를 메모리에 올린다.
  //   사파리는 탭 메모리가 빡빡해서 **조용히 죽는** 일이 있다. 그래서 여기에도 상한을 둔다.
  const first = await withLimit(tr.translate({ from: 'ko', to, text: sentences[0], html: false }),
    LIMIT.engine, '엔진이 뜨지 않았다(WASM·모델 싣기). 메모리가 모자랄 수 있다');
  out.firstMs = ms(now() - t2);
  // 모델은 이제 **작업자 안에** 있다 — 이쪽 복사본을 놓아 준다(아이폰 메모리를 아낀다).
  // 오류가 났으면 작업자가 다시 뜨면서 또 달라고 할 수 있으니 **그때는 들고 있는다.**
  if (!engineErrs.length) pack.files = {};
  const shown = [{ ko: sentences[0], out: first.target.text }];

  // ③ 한 문장 ms — 10문장. **첫 문장을 뺀 값도 함께** 적는다(데워진 뒤가 참값이다)
  const each = [out.firstMs];
  for (const s of sentences.slice(1)) {
    const t = now();
    const r = await withLimit(tr.translate({ from: 'ko', to, text: s, html: false }),
      LIMIT.sentence, `${each.length + 1}번째 문장에서 멈췄다`);
    each.push(ms(now() - t));
    if (shown.length < 3) shown.push({ ko: s, out: r.target.text });
  }
  out.n = each.length;
  out.perMs = Math.round(each.reduce((a, b) => a + b, 0) / each.length);
  out.perMsWarm = each.length > 1
    ? Math.round(each.slice(1).reduce((a, b) => a + b, 0) / (each.length - 1)) : null;
  out.each = each;
  out.sample = shown;

  // ④ 메모리
  out.memMb = memoryMb();

  // ⑤ 두 번째 열 때 — 저장에서 꺼내는 시간
  log('저장에서 다시 꺼내 보는 중…');
  try {
    const again = await getPack(row, { base, onProgress: () => {}, useCache });
    out.secondMs = again.ms;
    out.secondFrom = again.from;
  } catch (err) {
    out.secondMs = null;
    out.secondFrom = `못 함 — ${String(err.message || err).slice(0, 80)}`;
  }

  try { tr.delete(); } catch { /* 지우기가 없으면 넘어간다 */ }
  out.engineErrs = engineErrs;
  out.cached = useCache;
  log('끝.');
  return out;
}

/** 보고에 그대로 붙일 한 줄 */
export function line(r) {
  return `${r.to} | ${r.file}${r.carrier ? '(운반)' : ''} | ${mb(r.packBytes)} | `
    + `${r.downloadMs}ms(${r.mbps}MB/s) | ${r.unzipMs}ms | ${r.firstMs}ms | `
    + `${r.perMs}ms(데운 뒤 ${r.perMsWarm}ms) | ${r.memMb === null ? '안 쟀다' : `${r.memMb}MB`} | `
    + `${r.secondMs === null ? r.secondFrom : `${r.secondMs}ms(${r.secondFrom})`} | 해시 ${r.sha256}`;
}
