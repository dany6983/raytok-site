#!/usr/bin/env node
// 범용 마케팅 엔진 — 발행 계획 생성기
//
//   node route.mjs plan <productId> <YYYY-MM> [주당횟수]
//   node route.mjs quota <YYYY-MM>
//   node route.mjs check <productId> "검사할 문구"
//   node route.mjs selftest
//
// 계획만 뱉는다. 실제 발행은 Metricool / Upload-Post MCP 도구가 한다.
// 쓴 후킹은 quota 로그에 남아 다음 달에 중복되지 않는다.

import { loadProduct, check, auditNumbers, auditRequired, stripRequired } from './lib/check.mjs';
import * as Q from './lib/quota.mjs';
import { writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';

// 같은 달·같은 도구로 이미 세운 다른 제품의 계획분을 합산한다.
// 한 브랜드를 여러 제품이 나눠 쓰므로 계획끼리도 서로 자리를 먹는다.
function plannedElsewhere(month, tool, exceptPid) {
  if (!existsSync('out')) return 0;
  let n = 0;
  for (const f of readdirSync('out')) {
    if (!f.endsWith(`-${month}.json`) || !f.startsWith('plan-')) continue;
    try {
      const j = JSON.parse(readFileSync(`out/${f}`, 'utf8'));
      if (j.tool === tool && j.product !== exceptPid) n += j.quota?.willUse || 0;
    } catch {}
  }
  return n;
}

const [cmd, ...args] = process.argv.slice(2);

function usedHooks(month, productId) {
  const seen = new Set();
  for (const m of [month, prevMonth(month), prevMonth(prevMonth(month))]) {
    for (const e of Q.read(m).log || []) if (e.productId === productId) seen.add(e.hookId);
  }
  return seen;
}
function prevMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

// 그 달의 발행 날짜 — 화요일·금요일 오전 10시 (한국 업무시간 시작 직후)
function slots(month, perWeek, day) {
  const [y, mo] = month.split('-').map(Number);
  const days = new Date(y, mo, 0).getDate();
  // 같은 도구를 나눠 쓰는 제품끼리 요일을 다르게 줘서 서로 안 밀리게 한다.
  const want = day ? [Number(day)] : (perWeek >= 2 ? [2, 5] : [2]);   // 화=2, 금=5
  const out = [];
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, mo - 1, d);
    if (want.includes(dt.getDay())) out.push(`${month}-${String(d).padStart(2, '0')} 10:00`);
  }
  return out;
}

if (cmd === 'plan') {
  const [pid, month, pw, day] = args;
  const perWeek = Number(pw || 2);
  const p = loadProduct(pid);
  const tool = p.publish.tool;
  const channels = p.publish.channels;
  const cost = channels.length;                 // 한 편이 소비하는 건수

  // out/ 계획 파일과 장부 planned 는 **같은 자리**를 가리킨다. 더하면 두 번 센다 → 큰 쪽을 쓴다
  const reserved = Math.max(plannedElsewhere(month, tool, pid), Q.plannedByOthers(month, tool, pid));
  const available = Q.left(month, tool) - reserved;
  const already = usedHooks(month, pid);
  const pool = (p.hooks || [])
    .filter(h => !already.has(h.id))
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const plan = [];
  let blocked = null;
  for (const when of slots(month, perWeek, day)) {
    if (!pool.length) { blocked = 'hooks_exhausted'; break; }
    if (!Q.canFit(month, tool, cost + plan.length * cost - plan.length * cost)) { /* 아래에서 합산 */ }
    const willUse = (plan.length + 1) * cost;
    if (willUse > available) { blocked = 'quota'; break; }
    const h = pool.shift();
    // 전화는 대외 유도 창구로 쓰지 않는다 (2026-10-31 지시). 메일·DM·카톡만.
    const ways = [p.lead.form, p.lead.kakao ? '카카오톡 채널' : null, p.lead.dm ? 'DM' : null].filter(Boolean).join(' · ');
    const body = `${h.first3s}\n\n댓글에 「${h.keyword}」 남기시면 자료 보내드립니다.\n${ways}`;
    // 필수 표기(mustInclude)는 캡션에 자동으로 붙인다. 사람이 빼먹으면 법적 위험이라
    // 계획 단계에서 본문에 심어 둔다. 이미 들어 있으면 중복해서 붙이지 않는다.
    const notices = (p.mustInclude || []).filter(n => !body.includes(n.slice(0, 20)));
    const caption = notices.length ? `${body}\n\n${notices.join('\n')}` : body;
    // 금지어 게이트는 **마케팅 문구(body)** 만 본다.
    // 필수 고지문은 법에서 정한 정본이라 「치료」 같은 금지어가 들어 있어도 고칠 수 없다.
    // 고지문까지 게이트에 넣으면 「규정을 지킨 문구가 규정 위반으로 잡히는」 모순이 난다.
    const g = check(body, p);
    const missingRequired = auditRequired(caption, p);
    plan.push({
      when, hookId: h.id, axis: h.axis, channels,
      counts: cost,
      first3s: h.first3s, keyword: h.keyword,
      caption,
      gate: g.ok ? 'pass' : 'BLOCK',
      gateHits: g.hits,
      gateNotices: g.notices || [],
      required: missingRequired.length ? 'BLOCK' : 'pass',
      missingRequired,
      humanCheck: p.mustIncludeRules || [],
      image: (p.images || {})[h.id] || null,
      unknownNumbers: auditNumbers(body, p)
    });
  }

  const outPath = `out/plan-${pid}-${month}.json`;
  const result = {
    product: pid, name: p.name, owner: p.owner, month, tool,
    channels, costPerPost: cost,
    quota: { cap: Q.CAPS[tool].perMonth, left: Q.left(month, tool), reservedByOthers: reserved, available, willUse: plan.length * cost },
    perWeek, day: day || null, posts: plan.length,
    blocked,
    hooksLeftAfter: pool.length,
    plan
  };
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`\n■ ${p.name} — ${month}`);
  console.log(`  도구 ${tool} · 채널 ${channels.join('+')} (한 편 = ${cost}건)`);
  console.log(`  한도 ${Q.CAPS[tool].perMonth}건 · 발행됨 ${Q.CAPS[tool].perMonth - Q.left(month, tool)}건 · 다른 제품 계획 ${reserved}건 · 이 계획 ${plan.length * cost}건 · 남김 ${available - plan.length * cost}건`);
  if (blocked === 'quota') console.log(`  ⚠ 한도에 걸려 ${plan.length}편에서 끊겼습니다.`);
  if (blocked === 'hooks_exhausted') console.log(`  ⚠ 안 쓴 소재가 떨어졌습니다. 후킹을 더 넣어야 합니다.`);
  console.log('');
  for (const x of plan) {
    const mark = (x.gate === 'pass' && x.required === 'pass') ? '✓' : '✗';
    console.log(`  ${mark} ${x.when}  [${x.hookId} ${x.axis}]  ${x.first3s.slice(0, 34)}`);
    if (x.gate !== 'pass') x.gateHits.forEach(h => console.log(`      금지어 「${h.word}」${h.suggest ? ` → ${h.suggest}` : ''}`));
    x.gateNotices.forEach(h => console.log(`      통지(막지 않음) 「${h.word}」 — 10-26 해제분`));
    if (x.required !== 'pass') x.missingRequired.forEach(n => console.log(`      ✗ 필수 표기 빠짐: ${n.slice(0, 40)}…`));
    if (!x.image) console.log(`      ⚠ 이미지 없음 — products/${pid}.json 의 images.${x.hookId} 를 채워야 발행 가능`);
    if (x.unknownNumbers.length) console.log(`      출처 확인 필요한 숫자: ${x.unknownNumbers.join(', ')}`);
  }
  console.log(`\n  → ${outPath}\n`);
}

else if (cmd === 'quota') {
  // 달을 안 주면 이번 달. 전엔 undefined 로 빈 장부를 읽어 「0/20」을 찍었다 (위험)
  const month = args[0] || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.log(`\n  달 형식이 틀렸습니다: 「${month}」 → YYYY-MM 로 주세요\n`);
    process.exit(1);
  }
  const q = Q.read(month);
  console.log(`\n■ ${month} 사용량${args[0] ? '' : ' (이번 달)'}`);
  for (const [tool, cap] of Object.entries(Q.CAPS)) {
    const used = q.used[tool] || 0;
    const rsv = q.reserved?.[tool] || 0;           // planned = 남이 잡아둔 자리
    const taken = used + rsv;                       // plan 이 실제로 쓸 수 없는 칸
    const u = Math.min(20, Math.round(used / cap.perMonth * 20));
    const r = Math.min(20 - u, Math.round(rsv / cap.perMonth * 20));
    const bar = ('█'.repeat(u) + '▒'.repeat(r)).padEnd(20, '·');
    const flag = taken >= cap.perMonth ? ' ← 꽉 찼습니다' : '';
    const rsvTxt = rsv ? ` (쓴 것 ${used} + 잡아둔 자리 ${rsv})` : '';
    console.log(`  ${tool.padEnd(11)} ${bar} ${taken}/${cap.perMonth}  [${q.sources?.[tool] || '모름'}]${rsvTxt}${flag}`);
  }
  if (Object.values(q.reserved || {}).some(n => n > 0))
    console.log('  ▒ = 장부의 planned. 예약은 아직 안 걸렸지만 **남이 잡아둔 자리**라 plan 이 쓰지 않습니다');
  console.log(`  발행 기록 ${(q.log || []).length}건\n`);
}

else if (cmd === 'check') {
  const [pid, ...rest] = args;
  const p = loadProduct(pid);
  const text = rest.join(' ');
  // plan 과 같은 판정으로 맞춘다: 금지어는 **고지문을 뗀 본문**만 본다.
  // 법정 고지문(mustInclude)은 정본이라 「치료」가 들어 있어도 고칠 수 없다.
  // 예전엔 받은 문구 전체를 검사해 고지문을 넣으면 ✗, 빼면 「빠진 필수 표기」가 떠서
  // 두 번 돌려야 했다 (2026-11-01 smartever 보고). 한 번에 둘 다 본다.
  const { body, stripped } = stripRequired(text, p);
  const g = check(body, p);
  const n = auditNumbers(body, p);
  const miss = auditRequired(text, p);          // 필수 표기는 **받은 전문**으로 본다
  console.log(g.ok ? '✓ 금지어 없음' : '✗ 금지어 있음');
  g.hits.forEach(h => console.log(`  「${h.word}」 … ${h.where}${h.suggest ? `\n     → ${h.suggest}` : ''}`));
  (g.notices || []).forEach(h => console.log(`  통지(막지 않음) 「${h.word}」 … ${h.where}`));
  if (n.length) console.log(`  출처 확인 필요: ${n.join(', ')}`);
  // 「1종 N회」로 적는다. 횟수를 **말줄임 앞**에 두어야 잘리지 않는다 (2026-11-02 smartever 신고).
  stripped.forEach(m => console.log(`  법정 고지문 1종 ${m.hits}회 떼고 검사했습니다: ${m.sentence.slice(0, 30)}…`));
  if (miss.length) miss.forEach(m => console.log(`  빠진 필수 표기: ${m}`));
  else if ((p.mustInclude || []).length) console.log('  ✓ 필수 표기 들어 있음');
}

else if (cmd === 'selftest') {
  // 낱말 목록 자체의 모순을 찾는다. 문구가 아니라 **게이트를 검사한다.**
  // 생긴 까닭: 터치톡에 통지 「모공 조임」을 넣었더니 게이트가 내놓는 **대체어**
  //   「일시적 모공 조임」에 그 통지가 뜨게 됐다 (2026-11-02 smartever 신고).
  //   사람이 고칠 때마다 눈으로 보고 있을 수 없으니 한 번에 돌린다.
  // 공용 목록은 check.mjs 안에만 있다. 거기를 고치지 않고 여기서 한 번 더 읽는다
  const common = JSON.parse(readFileSync(new URL('./products/_common-forbidden.json', import.meta.url), 'utf8'));
  const PRODUCTS = ['raytok-glass', 'raytok-app', 'touchtok'];
  let bad = 0;
  for (const id of PRODUCTS) {
    const p = loadProduct(id);
    const inh = p.forbidden?.inherit === 'common';
    const words  = [...(inh ? common.words : []), ...(p.forbidden?.words || [])];
    const notice = [...(inh ? (common.notice || []) : []), ...(p.forbidden?.notice || [])];
    const table  = { ...(common.allowed_instead || {}), ...(p.allowedInstead || {}) };
    const say = (m) => { bad++; console.log(`  ✗ ${m}`); };
    console.log(`[${id}] 금지어 ${words.length} · 통지 ${notice.length} · 대체어 ${Object.keys(table).length}`);

    // ① 대체어가 제 발을 밟나 — 게이트가 권하는 말이 또 걸리면 고칠 길이 막힌다
    for (const [w, alt] of Object.entries(table)) {
      if (!alt) continue;
      const r = check(alt, p);
      r.hits.forEach(h => say(`대체어가 금지어: 「${w}」 → 「${alt}」 안에 「${h.word}」`));
      (r.notices || []).forEach(h => say(`대체어에 통지: 「${w}」 → 「${alt}」 안에 「${h.word}」`));
    }
    // ② 같은 말이 금지어·통지 양쪽에 — 막으면서 통지도 하면 사람이 헷갈린다
    for (const w of words)
      if (notice.some(n => n.toLowerCase() === w.toLowerCase())) say(`금지어·통지 양쪽에 있음: 「${w}」`);
    // ③ 통지어가 금지어 안에 들어 있나 — 한 자리가 ✗ 와 통지로 두 번 뜬다
    for (const n of notice)
      for (const w of words)
        if (w.toLowerCase().includes(n.toLowerCase())) say(`금지어 「${w}」 안에 통지어 「${n}」 (한 자리가 두 번 보고됨)`);
    // ④ 법정 고지문 자체가 게이트에 걸리나 — 걸리면 어떤 글도 통과 못 한다
    for (const s of (p.mustInclude || [])) {
      const r = check(stripRequired(s, p).body, p);
      r.hits.forEach(h => say(`고지문에 금지어: 「${h.word}」 … ${s.slice(0, 25)}…`));
    }
  }
  console.log(bad ? `\n✗ 모순 ${bad}개` : '\n✓ 모순 없음 (대체어·금지어·통지·고지문)');
  process.exitCode = bad ? 1 : 0;
}

else {
  console.log(`
범용 마케팅 엔진

  node route.mjs plan  <productId> <YYYY-MM> [주당횟수] [요일]  발행 계획 생성
                                                        요일 2=화 5=금 (같은 도구 공유 시 분리)
  node route.mjs quota <YYYY-MM>                          무료 한도 사용량
  node route.mjs check <productId> "문구"                  금지어 검사
  node route.mjs selftest                                 낱말 목록 모순 검사

  제품: ${['raytok-glass', 'raytok-app', 'touchtok'].join(' · ')}
  제품 추가 = products/<id>.json 하나 더. 엔진은 안 건드린다.
`);
}
