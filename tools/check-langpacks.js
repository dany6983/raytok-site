#!/usr/bin/env node
/* tools/check-langpacks.js — 언어팩 배포 자리 검사기 (B 25, 2026-10-17)
 *
 * 설계(비공개): `raytok-engine/docs/design/langpack-v1.md` §3 — 배포는 raytok.kr 정적 파일 +
 * SHA-256 검사. 이 검사기는 **목록(`langpacks/index.json`)과 실제 파일이 어긋나면 붉어진다.**
 *
 *   node tools/check-langpacks.js            → 검사 (다르면 종료코드 1)
 *   node tools/check-langpacks.js --fix      → bytes·sha256 을 실제 파일에서 다시 적는다
 *   node tools/check-langpacks.js --root <d> → 다른 자리에서 검사 (시험용)
 *
 * 팩을 더할 때: 파일을 `langpacks/` 에 넣고 → `--fix` → 커밋. 손으로 해시를 적지 않는다.
 *
 * ★ 이름이 겹치는 것 하나(§5): 이 저장소의 `packs/` 는 **꾸러미 문장**(match.js 가 읽는
 *   `ko.json`·`en.json` …)이고 언어팩과 아무 관계가 없다. 그래서 언어팩은 `langpacks/` 에 둔다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const argOf = (n) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
const FIX = process.argv.includes('--fix');
const ROOT = path.resolve(argOf('root') || path.dirname(__dirname));
const DIR = path.join(ROOT, 'langpacks');
const INDEX = path.join(DIR, 'index.json');

/** 목록 한 줄이 반드시 들고 있어야 하는 칸 (설계 §3: 팩 이름·판·크기·SHA-256·제품) */
const REQUIRED = ['name', 'version', 'product', 'file', 'bytes', 'sha256', 'status'];
const STATUS = ['ready', 'fake', 'draft'];          // ready 만 앱이 받는다

const errs = [];
const say = (s) => console.log(s);

if (!fs.existsSync(INDEX)) { console.error(`[FAIL] 목록이 없다: ${INDEX}`); process.exit(1); }
let index;
try { index = JSON.parse(fs.readFileSync(INDEX, 'utf-8')); }
catch (e) { console.error(`[FAIL] 목록을 읽지 못했다: ${e.message}`); process.exit(1); }

if (!index || !Array.isArray(index.packs)) { console.error('[FAIL] 목록에 packs 배열이 없다'); process.exit(1); }

const seen = new Set();
for (const [i, p] of index.packs.entries()) {
  const at = `packs[${i}]${p && p.name ? ' ' + p.name : ''}`;
  for (const k of REQUIRED) if (p[k] === undefined) errs.push(`${at}: ${k} 칸이 없다`);
  if (p.name && seen.has(p.name)) errs.push(`${at}: 같은 이름이 두 번 있다`);
  if (p.name) seen.add(p.name);
  if (p.status && !STATUS.includes(p.status)) errs.push(`${at}: status 는 ${STATUS.join('·')} 중 하나여야 한다 (${p.status})`);
  if (p.product !== undefined && (!Array.isArray(p.product) || !p.product.length ||
      p.product.some((n) => !Number.isInteger(n) || n < 1 || n > 4))) {
    errs.push(`${at}: product 는 1~4 중 하나 이상의 배열이어야 한다 (설계 §2)`);
  }
  if (p.pair !== undefined && (!p.pair || typeof p.pair.src !== 'string' || typeof p.pair.dst !== 'string')) {
    errs.push(`${at}: pair 는 {src, dst} 여야 한다`);
  }
  if (!p.file) continue;

  const fp = path.join(DIR, p.file);
  if (!fs.existsSync(fp)) { errs.push(`${at}: 파일이 없다 (${p.file})`); continue; }
  const body = fs.readFileSync(fp);
  const bytes = body.length;
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  if (FIX) { p.bytes = bytes; p.sha256 = sha; continue; }
  if (Number(p.bytes) !== bytes) errs.push(`${at}: 크기가 다르다 — 목록 ${p.bytes} · 파일 ${bytes}`);
  if (String(p.sha256).toLowerCase() !== sha) {
    errs.push(`${at}: **SHA-256 이 다르다** — 목록 ${String(p.sha256).slice(0, 16)}… · 파일 ${sha.slice(0, 16)}…`);
  }

  /* 팩 안 manifest.json 이 목록과 같은 말을 하는가 (둘이 갈라지면 어느 쪽이 맞는지 모른다 — §4) */
  let inner = null;
  try {
    const mf = readFromZip(body, 'manifest.json');
    inner = mf ? JSON.parse(mf) : null;
  } catch (e) { errs.push(`${at}: 팩 안 manifest.json 을 읽지 못했다 (${e.message})`); }
  if (!inner) { errs.push(`${at}: 팩 안에 manifest.json 이 없다 (설계 §3)`); continue; }
  if (inner.name !== p.name) errs.push(`${at}: 팩 안 이름이 다르다 (${inner.name})`);
  if (String(inner.version) !== String(p.version)) errs.push(`${at}: 팩 안 판이 다르다 (${inner.version})`);
  if (inner.status && inner.status !== p.status) errs.push(`${at}: 팩 안 status 가 다르다 (${inner.status})`);
}

/* zip 에서 파일 하나를 꺼낸다 — 의존성 0 (중앙 디렉터리를 읽고 deflate 를 푼다) */
function readFromZip(buf, want) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 이 아니다 (EOCD 없음)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('중앙 디렉터리가 깨졌다');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf-8');
    if (name === want) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.slice(start, start + csize);
      if (method === 0) return raw.toString('utf-8');
      if (method === 8) return zlib.inflateRawSync(raw).toString('utf-8');
      throw new Error(`모르는 압축 방법 ${method}`);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

if (FIX) {
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 1) + '\n');
  say(`다시 적었다: ${INDEX} (팩 ${index.packs.length}개)`);
  process.exit(0);
}

const ready = index.packs.filter((p) => p.status === 'ready').length;
say(`팩 ${index.packs.length}개 · 앱이 받는 것(ready) ${ready}개 · 가짜·초안 ${index.packs.length - ready}개`);
if (errs.length) {
  for (const e of errs) console.log('  ✗ ' + e);
  console.log(`\n목록과 파일이 어긋난다 (${errs.length}건). 파일을 바꿨으면 \`node tools/check-langpacks.js --fix\` 로 다시 적고 같이 커밋한다.`);
  process.exit(1);
}
say('목록 == 파일 (크기·SHA-256·팩 안 manifest 전부 같다)');
