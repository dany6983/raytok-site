#!/usr/bin/env node
/* scripts/eval20-basic.mjs — 20문장 블라인드 평가의 **ⓑ 칸**(릴레이 basic = 구글)
 * 마스터 2026-10-15 23:25 (27 보탬) · 2026-10-16 17:55 "그 뒤 20문장 ⓑ basic 칸"
 *
 * 돌리는 법:
 *   RELAY_URL=https://raytok-relay.raytok.workers.dev \
 *   EVAL20=/path/to/raytok-native1/src/eval20.js \
 *   node scripts/eval20-basic.mjs
 *
 * 표를 파일로 받는 두 길 (B 15, 10-17):
 *   node scripts/eval20-basic.mjs --out                 → 돌린 결과를 docs/eval20-basic.md 로 쓴다
 *   node scripts/eval20-basic.mjs --out=<경로>           → 다른 자리에 쓴다
 *   node scripts/eval20-basic.mjs --paste=<파일|->       → **대표님 PC 출력**을 붙여 넣기만 한다(망 호출 0)
 * 마지막 길이 있는 까닭: 운영 릴레이에 닿는 것은 대표님 PC 뿐이다. 거기서 돌린 출력을
 * 그대로(또는 파이프로) 넘기면 이 저장소에 같은 표가 선다 — 사람이 손으로 옮겨 적지 않는다.
 *
 * ★ 문장 표는 **앱 저장소 `src/eval20.js` 하나**다(D-193). 여기로 베껴 오지 않는다 —
 *   베끼면 둘이 갈라지고, 갈라진 표로 잰 점수는 못 쓴다. 파일을 못 찾으면 **멈춘다.**
 * ★ 비밀값이 필요 없다: 시험 키 0 씨앗(공개값)으로 0x10(bundle) 코드를 발급해
 *   /license/redeem → /license/issue 로 **서버가 만든** 토큰을 받는다.
 *   (마스터 17:55 "0x10 시험 토큰은 LIC_TEST_SEED 길로" 와 같은 길이다.)
 * ★ 엔진 이름을 결과에 적지 않는다 — 대표님께는 A·B·C 로만 간다(블라인드).
 *   이 스크립트가 내는 것은 **ⓑ 칸의 번역문뿐**이고, 섞는 것은 마스터가 한다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mintCode, privateKeyFromSeed, testSeed, FLAG, TEST_KEY_ID } from '../relay/tools/mint-code.mjs';

const BASE = (process.env.RELAY_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const J = { 'Content-Type': 'application/json' };
const EVAL_PATH = resolve(process.env.EVAL20 || '../raytok-native1/src/eval20.js');

/** 앱 저장소의 표를 읽는다 — 그 파일이 정본이다(D-193). 베끼지 않는다. */
function loadSentences() {
  let src;
  try { src = readFileSync(EVAL_PATH, 'utf-8'); }
  catch (e) {
    throw new Error(`문장 표를 못 찾았다: ${EVAL_PATH}\n  EVAL20=<앱 저장소>/src/eval20.js 로 알려 달라.\n  (표를 이 저장소로 베끼지 않는다 — 둘이 갈라지면 점수를 못 쓴다, D-193)`);
  }
  const out = [];
  for (const m of src.matchAll(/\{\s*kind:\s*"([^"]+)",\s*text:\s*"((?:[^"\\]|\\.)*)"\s*\}/g)) {
    out.push({ kind: m[1], text: m[2].replace(/\\"/g, '"') });
  }
  const from = (src.match(/EVAL20_FROM\s*=\s*'([^']+)'/) || [])[1];
  const to = (src.match(/EVAL20_TO\s*=\s*'([^']+)'/) || [])[1];
  if (out.length !== 20) throw new Error(`문장이 20개가 아니다(${out.length}개) — 표가 바뀌었나 읽는 모양이 틀렸나`);
  if (!from || !to) throw new Error('EVAL20_FROM·EVAL20_TO 를 못 읽었다');
  return { rows: out, from, to };
}

/** 0x10(bundle) 토큰을 서버에서 받는다 — 비밀값 없이 */
async function bundleToken() {
  const device = 'eval20_' + Math.random().toString(36).slice(2, 10);
  const minted = mintCode({
    keyId: TEST_KEY_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
    days: 1,
    flags: FLAG.bundle,          // 0x10 = 인터넷 번역 패키지
    cust: 'EVAL',
    privateKey: privateKeyFromSeed(testSeed())
  });
  const r1 = await fetch(`${BASE}/license/redeem`, { method: 'POST', headers: J, body: JSON.stringify({ code: minted.code, deviceId: device }) });
  if (!r1.ok) throw new Error(`/license/redeem ${r1.status} ${(await r1.text()).slice(0, 200)}`);
  const r2 = await fetch(`${BASE}/license/issue`, { method: 'POST', headers: J, body: JSON.stringify({ device }) });
  if (!r2.ok) throw new Error(`/license/issue ${r2.status} ${(await r2.text()).slice(0, 200)}`);
  const { token } = await r2.json();
  let flags = 0;
  try { flags = Number(JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).flags || 0); } catch (_) {}
  if ((flags & 0x10) !== 0x10) throw new Error(`토큰에 0x10 이 없다 (flags=0x${flags.toString(16)}) — basic 번역을 청할 수 없다`);
  return token;
}

/** 숫자만 뽑는다 — 원문에 없던 숫자가 번역에 생겼는지 세려고 (지어냄 n/20) */
const numbersOf = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []);

const OUT_DEFAULT = 'docs/eval20-basic.md';
const argOf = (name) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  const eq = hit.indexOf('=');
  return eq < 0 ? '' : hit.slice(eq + 1);
};

/** 표 한 장을 글자로 만든다 — 화면과 파일이 **같은 함수**를 쓴다(§4: 만드는 자리 하나) */
export function renderMarkdown(meta, out) {
  const bad = out.filter((o) => o.why).length;
  const withInvented = out.filter((o) => o.invented && o.invented.length).length;
  const avg = out.length ? Math.round(out.reduce((a, o) => a + (o.ms || 0), 0) / out.length) : 0;
  const L = [];
  L.push('## ⓑ 릴레이 basic — 앱 저장소 docs/eval/zh-ko-20.md 에 붙일 칸');
  L.push('');
  if (meta.at) L.push(`- 돌린 때: ${meta.at}`);
  if (meta.base) L.push(`- 릴레이: ${meta.base}`);
  if (meta.from && meta.to) L.push(`- 방향: ${meta.from} → ${meta.to}`);
  if (meta.note) L.push(`- ${meta.note}`);
  L.push('');
  L.push('| # | 종류 | ms | ⓑ basic 번역 | 원문에 없던 숫자 |');
  L.push('|---|---|---|---|---|');
  for (const o of out) {
    const cell = o.why ? `**실패: ${o.why}**` : String(o.text || '').replace(/\|/g, '\\|');
    L.push(`| ${o.n} | ${o.kind} | ${o.ms} | ${cell} | ${(o.invented || []).join(', ') || '-'} |`);
  }
  L.push('');
  L.push(`셈: 실패 ${bad}/${out.length} · 원문에 없던 숫자가 생긴 줄 ${withInvented}/${out.length} · 평균 ${avg}ms`);
  L.push('');
  L.push('(점수는 대표님이 A·B·C 로 매긴다 — 이 표에는 엔진 이름을 적지 않는다)');
  return L.join('\n') + '\n';
}

/** 대표님 PC 출력에서 표를 되읽는다. 표 줄만 본다 — 앞뒤 진행 줄([1/20] …)은 무시한다. */
export function parsePasted(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    // 번역문 안에 막아 둔 세로줄(\|)은 칸 구분이 아니다 — 그것으로 자르면 한 줄이 조용히 빠진다
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5) continue;
    if (!/^\d+$/.test(cells[0])) continue;              // 머리줄·구분줄 건너뜀
    const fail = (cells[3].match(/^\*\*실패:\s*(.*)\*\*$/) || [])[1];
    out.push({
      n: Number(cells[0]),
      kind: cells[1],
      ms: Number(cells[2]) || 0,
      text: fail ? '' : cells[3].replace(/\\\|/g, '|'),
      why: fail || '',
      invented: cells[4] === '-' ? [] : cells[4].split(',').map((x) => x.trim()).filter(Boolean)
    });
  }
  const meta = {};
  const base = (text.match(/릴레이:\s*(\S+)/) || text.match(/=== 20문장 ⓑ basic — (\S+)/) || [])[1];
  if (base) meta.base = base;
  const dir = text.match(/([a-z]{2}(?:-[A-Za-z]{2,4})?)\s*→\s*([a-z]{2}(?:-[A-Za-z]{2,4})?)/);
  if (dir) { meta.from = dir[1]; meta.to = dir[2]; }
  return { meta, rows: out };
}

async function runEval() {
  const { rows, from, to } = loadSentences();
  console.log(`=== 20문장 ⓑ basic — ${BASE} · ${from} → ${to} · 표: ${EVAL_PATH} ===\n`);
  const token = await bundleToken();
  const AUTH = { ...J, Authorization: `Bearer ${token}` };

  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const t0 = Date.now();
    let text = '', why = '';
    try {
      // 한 문장씩 보낸다 — 묶어 보내면 어느 줄이 어떻게 됐는지 못 가린다
      const res = await fetch(`${BASE}/translate`, {
        method: 'POST', headers: AUTH,
        body: JSON.stringify({ q: [r.text], source: from, target: to })
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) { why = `HTTP ${res.status} ${d && d.why ? d.why : ''}`.trim(); }
      // 답 모양은 relay/src/index.js 의 /translate 응답 그대로: { t: [...], src, chars, lines, tier }
      else {
        const list = d && d.t;
        text = Array.isArray(list) ? String(list[0] == null ? '' : list[0]) : '';
        if (!text) why = `빈 답 (tier=${d && d.tier} ${JSON.stringify(d && d.t)})`;   // §20 빈 답은 없음이 아니다
      }
    } catch (e) { why = e.message; }
    const ms = Date.now() - t0;
    const srcNums = numbersOf(r.text), outNums = numbersOf(text);
    const invented = outNums.filter((n) => !srcNums.includes(n));
    out.push({ n: i + 1, kind: r.kind, ms, text, why, invented });
    console.log(`[${i + 1}/20] ${r.kind} ${ms}ms ${why ? '❌ ' + why : (text.slice(0, 40) + (text.length > 40 ? '…' : ''))}`);
  }
  return { meta: { base: BASE, from, to }, rows: out };
}

/* 이 파일을 **불러 쓰는 쪽**(시험)에서는 아무것도 돌지 않는다 — 표 만드는 함수만 가져간다. */
const RUN_DIRECT = process.argv[1] && /eval20-basic\.mjs$/.test(process.argv[1]);

if (RUN_DIRECT) {
  const pasteArg = argOf('paste');
  const outArg = argOf('out');
  (async () => {
    let got;
    if (pasteArg !== null) {
      if (!pasteArg) throw new Error('--paste=<파일> 또는 --paste=- (표준입력) 가 필요하다');
      const text = pasteArg === '-'
        ? readFileSync(0, 'utf-8')
        : readFileSync(resolve(pasteArg), 'utf-8');
      got = parsePasted(text);
      if (!got.rows.length) throw new Error(`붙인 글에서 표 줄을 못 찾았다: ${pasteArg}\n  (대표님 PC 출력의 "| # | 종류 | ms | …" 표를 그대로 넘긴다)`);
      got.meta.note = `대표님 PC 출력을 옮긴 것 (--paste ${pasteArg === '-' ? '표준입력' : pasteArg})`;
      console.log(`붙임: 표 줄 ${got.rows.length}개`);
    } else {
      got = await runEval();
    }
    got.meta.at = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    const md = renderMarkdown(got.meta, got.rows);
    if (outArg === null) {
      console.log('\n' + md);
    } else {
      const dest = resolve(outArg || OUT_DEFAULT);
      writeFileSync(dest, md);
      console.log(`\n썼다: ${dest} (${got.rows.length}줄)`);
    }
    if (got.rows.some((o) => o.why)) process.exitCode = 1;
  })().catch((e) => { console.error('\n[FAIL]', e.message); process.exitCode = 1; });
}
