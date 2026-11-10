// web/common/edu-cert.js — 「안전보건교육 실시 확인서」 (NOW 11-09 18:20, 대표님 「고」)
//
// 웹 강사 화면 끝 화면이 이 한 곳에서 **확인서(인쇄 → PDF) · 명단 CSV · 진위 대조 JSON** 셋을 만든다.
// 셋은 같은 한 벌(model)에서 나온다 — 화면 숫자·PDF 숫자·CSV 숫자가 갈리지 않게(§4: 읽는 곳 하나).
//
// 진위 대조: 이미 공개된 `docs/hashchain-v1.md` 규칙 **그대로** 기록 체인을 만들고, 마지막 해시(last)를
// QR 에 싣는다. 새 항목 종류를 만들지 않는다 — 교육 정보·전자 확인은 v1 의 `note` 로 적는다.
// 서버에 새로 저장하는 것은 없다: PDF 와 함께 내려받는 `.json` 을 /web/verify/ 에 넣어 QR 의 해시와 견준다.
//
// 문구 규칙(⑥): 「법정 서식」「법정 교육 인정」을 쓰지 않는다. 바닥 줄은 「RayTok 기록으로 자동 작성 · 진위는 QR 로 확인」.
// 브라우저에서는 window.RayTokEduCert 하나, node 에서는 module.exports.
(function () {

const NONE = '미기재';
const KINDS = [
  { v: 'regular', ko: '정기교육', en: 'Regular training' },
  { v: 'hire', ko: '채용 시 교육', en: 'On hiring' },
  { v: 'change', ko: '작업내용 변경 시 교육', en: 'On change of work' },
  { v: 'special', ko: '특별교육', en: 'Special training' },
  { v: 'basic', ko: '기초안전보건교육(외국인)', en: 'Basic safety training (foreign workers)' }
];
const EDU_FIELDS = ['site', 'place', 'kind', 'subject', 'teacher', 'teacherOrg', 'teacherTitle', 'target'];

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(t) { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function hm(t) { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function kindLabel(v) { const k = KINDS.find(x => x.v === v); return k ? k.ko : ''; }
function clean(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 80); }

/** 강사가 적은 교육 정보 → 고른 모양. 빈칸은 빈 글자로 둔다(확인서에서만 「미기재」). */
function normEdu(e) {
  e = e || {};
  const out = {};
  for (const k of EDU_FIELDS) out[k] = clean(e[k], k === 'subject' ? 120 : 80);
  if (!KINDS.some(x => x.v === out.kind)) out.kind = '';
  const n = parseInt(out.target, 10);
  out.target = Number.isFinite(n) && n > 0 && n < 100000 ? String(n) : '';
  return out;
}

function listenMs(p, end) {
  let ms = 0;
  for (let i = 0; i < p.joinedAt.length; i++) {
    const to = Math.min(i < p.leftAt.length ? p.leftAt[i] : end, end);
    ms += Math.max(0, to - p.joinedAt[i]);
  }
  return ms;
}

/**
 * 확인서 한 벌.
 * @param o.edu       강사 입력(normEdu 전)
 * @param o.code      방 번호
 * @param o.startedAt 교육 시작(ms) · o.endedAt 교육 끝(「교육 끝」 누른 때)
 * @param o.roster    [{dev,name,lang,joinedAt[],leftAt[]}]
 * @param o.confirms  {dev:{dev,name,lang,at}}  (방이 시각을 찍은 전자 확인)
 * @param o.langName  (code) => 한국어 언어 이름
 * @param o.lines     붙임 2 줄 [{at,text,tr:{}}] — 없으면 붙임 2 가 없다
 */
function buildCertModel(o) {
  const edu = normEdu(o.edu);
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
  const startedAt = num(o.startedAt) == null ? Date.now() : num(o.startedAt);
  const endedAt = Math.max(startedAt, num(o.endedAt) == null ? startedAt : num(o.endedAt));
  const langName = typeof o.langName === 'function' ? o.langName : (c) => c;
  const confirms = o.confirms || {};
  const seen = new Set();
  const people = (o.roster || []).filter(p => p && Array.isArray(p.joinedAt) && p.joinedAt.length)
    .slice().sort((a, b) => a.joinedAt[0] - b.joinedAt[0]);
  const rows = people.map((p) => {
    const c = p.dev ? confirms[p.dev] : null;
    if (p.dev) seen.add(p.dev);
    const lastLeft = p.leftAt.length >= p.joinedAt.length ? p.leftAt[p.leftAt.length - 1] : null;
    const out = lastLeft == null ? endedAt : Math.min(lastLeft, endedAt);
    return {
      dev: p.dev || '',
      name: clean(p.name || (c && c.name), 60),
      org: '',
      lang: clean(p.lang || (c && c.lang), 16),
      inAt: p.joinedAt[0],
      outAt: Math.max(out, p.joinedAt[0]),
      leftEarly: lastLeft != null && lastLeft < endedAt,
      minutes: Math.round(listenMs(p, endedAt) / 60000),
      confirmAt: c ? c.at : null,
      rejoin: Math.max(0, p.joinedAt.length - 1)   // 화면(입장 칸)에만 — CSV 열은 그대로
    };
  });
  // 명단에 없는 기기의 확인(강사 화면을 새로 고쳤다 등) — 확인은 버리지 않는다(R-15). 시간 칸은 모름.
  for (const c of Object.values(confirms).sort((a, b) => a.at - b.at)) {
    if (!c || !c.dev || seen.has(c.dev)) continue;
    rows.push({ dev: c.dev, name: clean(c.name, 60), org: '', lang: clean(c.lang, 16), inAt: null, outAt: null, leftEarly: false, minutes: null, confirmAt: c.at });
  }
  rows.forEach((r, i) => { r.no = i + 1; r.langName = r.lang ? langName(r.lang) : ''; });
  const byLangMap = {};
  for (const r of rows) { const k = r.lang || '?'; byLangMap[k] = (byLangMap[k] || 0) + 1; }
  const byLang = Object.keys(byLangMap).sort((a, b) => byLangMap[b] - byLangMap[a] || a.localeCompare(b))
    .map(k => ({ code: k, name: k === '?' ? NONE : langName(k), n: byLangMap[k] }));
  const present = rows.length;
  const target = edu.target ? parseInt(edu.target, 10) : null;
  const confirmed = rows.filter(r => r.confirmAt != null).length;
  const d = new Date(startedAt);
  return {
    title: '안전보건교육 실시 확인서',
    docNo: `RT-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${clean(o.code, 12) || '000000'}`,
    code: clean(o.code, 12),
    edu,
    kindLabel: kindLabel(edu.kind),
    startedAt, endedAt,
    minutes: Math.round((endedAt - startedAt) / 60000),
    target, present,
    absent: target == null ? null : Math.max(0, target - present),
    confirmed, unconfirmed: present - confirmed,
    byLang, rows,
    lines: Array.isArray(o.lines) ? o.lines : null,
    srcLang: clean(o.srcLang, 16) || 'ko'
  };
}

function orNone(v) { return v ? v : NONE; }
function whenText(m) {
  return `${ymd(m.startedAt)} ${hm(m.startedAt)} ~ ${ymd(m.endedAt) === ymd(m.startedAt) ? '' : ymd(m.endedAt) + ' '}${hm(m.endedAt)} (${m.minutes}분)`;
}
function teacherText(e) {
  const t = [e.teacher, e.teacherOrg, e.teacherTitle].filter(Boolean);
  return t.length ? t.join(' · ') : NONE;
}

/** CSV — 붙임 1 과 같은 열. UTF-8 BOM(엑셀 한글) · CRLF · 수식 글자 막음. 첫 줄은 교육 정보 한 줄. */
function csvCell(v) {
  let c = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(c)) c = "'" + c;
  return /[",\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
}
const CSV_COLS = ['번호', '성명', '소속', '언어', '입장', '퇴장', '청취 시간(분)', '전자 확인'];
function certCsv(m) {
  const e = m.edu;
  const head = [m.title, `문서번호 ${m.docNo}`, `사업장 ${orNone(e.site)}`, `교육 종류 ${orNone(m.kindLabel)}`,
    `과목 ${orNone(e.subject)}`, `일시 ${whenText(m)}`, `장소 ${orNone(e.place)}`, `강사 ${teacherText(e)}`,
    `대상 ${m.target == null ? NONE : m.target}`, `참석 ${m.present}`, `확인 ${m.confirmed}`];
  const out = [head.map(csvCell).join(','), CSV_COLS.map(csvCell).join(',')];
  for (const r of m.rows) {
    out.push([r.no, r.name || NONE, r.org, r.langName || r.lang, r.inAt == null ? '' : hm(r.inAt), r.outAt == null ? '' : hm(r.outAt),
      r.minutes == null ? '' : r.minutes, r.confirmAt == null ? '미확인' : `${ymd(r.confirmAt)} ${hm(r.confirmAt)}`].map(csvCell).join(','));
  }
  return '﻿' + out.join('\r\n') + '\r\n';
}

/* ── 기록 체인 (docs/hashchain-v1.md 그대로) ── */
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortKeysDeep(v[k]);
    return o;
  }
  return v;
}
function canon(item) { const c = { ...item }; delete c.hash; return JSON.stringify(sortKeysDeep(c)); }
async function defaultSha256(str) {
  if (typeof require === 'function' && typeof window === 'undefined') {
    return require('crypto').createHash('sha256').update(str, 'utf8').digest('hex');
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 확인서 한 벌 + 명단 원본으로 v1 체인을 만든다. 반환: { ver, session, items, last }
 * o.roster 는 buildCertModel 과 같은 것(입장·퇴장 구간을 그대로 적는다).
 */
async function buildChain(m, o, sha256) {
  sha256 = sha256 || defaultSha256;
  const ev = [];
  const e = m.edu;
  ev.push({ ts: m.startedAt, ord: 0, kind: 'begin', session: m.code, host: e.teacher || '', lang: m.srcLang });
  const eduNote = sortKeysDeep({ doc: m.docNo, kind: e.kind, place: e.place, site: e.site, subject: e.subject,
    target: e.target, teacher: e.teacher, teacher_org: e.teacherOrg, teacher_title: e.teacherTitle });
  ev.push({ ts: m.startedAt, ord: 1, kind: 'note', text: 'edu ' + JSON.stringify(eduNote) });
  for (const p of (o && o.roster) || []) {
    if (!p || !p.dev || !Array.isArray(p.joinedAt)) continue;
    p.joinedAt.forEach((t, i) => {
      ev.push({ ts: t, ord: 2, kind: 'join', dev: p.dev, name: clean(p.name, 60), lang: clean(p.lang, 16) });
      if (i < p.leftAt.length) ev.push({ ts: p.leftAt[i], ord: 3, kind: 'leave', dev: p.dev, why: 'left' });
    });
  }
  for (const c of Object.values((o && o.confirms) || {})) {
    if (c && c.dev) ev.push({ ts: c.at, ord: 4, kind: 'note', text: `confirm ${c.dev} ${clean(c.lang, 16)} ${clean(c.name, 60)}`.trim() });
  }
  if (m.lines) {
    m.lines.forEach((l, i) => {
      const tr = {};
      for (const [k, v] of Object.entries(l.tr || {})) if (typeof v === 'string') tr[k] = v;
      ev.push({ ts: Number(l.at) || m.startedAt, ord: 2, kind: 'line', seq: i + 1, src: m.srcLang, text: String(l.text || ''), tr, via: 'script' });
    });
  }
  ev.sort((a, b) => a.ts - b.ts || a.ord - b.ord);
  const lastTs = Math.max(m.endedAt, ...ev.map(x => x.ts), Number(o && o.closedAt) || 0);
  ev.push({ ts: lastTs, ord: 9, kind: 'end', lines: m.lines ? m.lines.length : 0, minutes: m.minutes, joined_max: m.present });
  const items = [];
  let prev = '0'.repeat(64);
  for (let i = 0; i < ev.length; i++) {
    const x = { ...ev[i] };
    delete x.ord;
    x.ts = Math.round(x.ts);
    const item = { n: i + 1, ...x, prev };
    item.hash = await sha256(prev + '\n' + canon(item));
    prev = item.hash;
    items.push(item);
  }
  return { ver: 1, session: { code: m.code, host: e.teacher || '', lang: m.srcLang, started: Math.round(m.startedAt) }, items, last: prev };
}

/** 확인서 HTML(A4 인쇄용). opts.qrSvg — 진위 QR(SVG 글자) · opts.last — 마지막 해시 · opts.verifyUrl */
function certHtml(m, opts) {
  opts = opts || {};
  const e = m.edu;
  const langLine = m.byLang.length ? m.byLang.map(l => `${esc(l.name)} ${l.n}명`).join(' · ') : '없음';
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const att = m.rows.map(r => `<tr><td class="c">${r.no}</td><td>${esc(r.name || NONE)}</td><td>${esc(r.org)}</td><td>${esc(r.langName || r.lang)}</td>`
    + `<td class="c">${r.inAt == null ? '' : hm(r.inAt)}${r.rejoin ? `<br><span class="rj">재입장 ${r.rejoin}</span>` : ''}</td><td class="c">${r.outAt == null ? '' : hm(r.outAt)}</td>`
    + `<td class="c">${r.minutes == null ? '' : r.minutes}</td><td class="c">${r.confirmAt == null ? '미확인' : esc(hm(r.confirmAt))}</td></tr>`).join('');
  let annex2 = '';
  if (m.lines && m.lines.length) {
    // 참석자 언어를 앞에, 그 밖에 이 화면이 가진 번역(미리 번역한 언어)을 뒤에 — 없는 칸은 만들지 않는다
    const first = m.byLang.map(l => l.code).filter(c => c !== '?');
    const all = new Set(first);
    for (const l of m.lines) for (const k of Object.keys(l.tr || {})) all.add(k);
    const want = [...all];
    annex2 = `<div class="annex"><h2>붙임 2. 강의 내용</h2><table class="list"><thead><tr><th style="width:12%">시각</th><th>원문 · 번역</th></tr></thead><tbody>`
      + m.lines.map(l => `<tr><td class="c">${l.at ? hm(l.at) : ''}</td><td><div>${esc(l.text)}</div>`
        + want.filter(c => l.tr && l.tr[c]).map(c => `<div class="tr">[${esc(c)}] ${esc(l.tr[c])}</div>`).join('') + `</td></tr>`).join('')
      + `</tbody></table></div>`;
  }
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${esc(m.title)} ${esc(m.docNo)}</title><style>
@page { size: A4; margin: 15mm; }
body { font-family: 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR',sans-serif; color:#111; font-size:10.5pt; margin:0; }
h1 { text-align:center; font-size:20pt; letter-spacing:4px; margin:4px 0 2px; }
.docno { text-align:right; font-size:9pt; color:#333; margin-bottom:8px; }
table { width:100%; border-collapse:collapse; }
th, td { border:1px solid #333; padding:5px 6px; vertical-align:middle; }
.info th { width:22%; background:#f1f1f1; text-align:left; font-weight:600; }
.list th { background:#f1f1f1; font-weight:600; }
.c { text-align:center; }
.rj { font-size:8pt; }
.top { display:flex; gap:10px; align-items:flex-start; margin:10px 0; }
.sign { flex:1; } .sign td { height:52px; text-align:center; } .sign th { background:#f1f1f1; width:33%; }
.qr { width:120px; text-align:center; font-size:7pt; word-break:break-all; color:#333; }
.qr svg { width:110px; height:110px; }
h2 { font-size:12pt; margin:16px 0 6px; }
.annex { page-break-before: always; }
.tr { color:#444; font-size:9.5pt; }
.foot { margin-top:14px; font-size:8.5pt; color:#444; text-align:center; border-top:1px solid #999; padding-top:6px; }
</style></head><body>
<h1>${esc(m.title)}</h1>
<div class="docno">문서 번호 ${esc(m.docNo)}</div>
<table class="info"><tbody>
${row('사업장명', esc(orNone(e.site)))}
${row('교육 종류', esc(orNone(m.kindLabel)))}
${row('교육 과목', esc(orNone(e.subject)))}
${row('강사', esc(teacherText(e)))}
${row('교육 일시', esc(whenText(m)))}
${row('교육 장소', esc(orNone(e.place)))}
${row('인원', `대상 ${m.target == null ? NONE : m.target + '명'} / 참석 ${m.present}명 / 미참석 ${m.absent == null ? NONE : m.absent + '명'} · 전자 확인 ${m.confirmed}명 / 미확인 ${m.unconfirmed}명`)}
${row('언어별 인원', langLine)}
</tbody></table>
<div class="top">
<table class="sign"><thead><tr><th>구분</th><th>안전관리자</th><th>사업주</th></tr></thead><tbody><tr><th>서명</th><td></td><td></td></tr></tbody></table>
<div class="qr">${opts.qrSvg || ''}<div>진위 확인</div><div>${esc(opts.last || '')}</div></div>
</div>
<h2>붙임 1. 참석자 명단</h2>
<table class="list"><thead><tr><th style="width:6%">번호</th><th>성명</th><th style="width:14%">소속</th><th style="width:14%">언어</th><th style="width:9%">입장</th><th style="width:9%">퇴장</th><th style="width:10%">청취 시간(분)</th><th style="width:11%">전자 확인</th></tr></thead><tbody>
${att || '<tr><td colspan="8" class="c">참석자 없음</td></tr>'}
</tbody></table>
${annex2}
<div class="foot">RayTok 기록으로 자동 작성 · 진위는 QR 로 확인${opts.verifyUrl ? ' (' + esc(opts.verifyUrl.replace(/#.*$/, '')) + ')' : ''}</div>
</body></html>`;
}

const api = { KINDS, NONE, CSV_COLS, normEdu, buildCertModel, certCsv, certHtml, buildChain, sortKeysDeep, canon, hm, ymd };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.RayTokEduCert = api;

})();
