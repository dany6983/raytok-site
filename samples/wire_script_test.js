/*
 * 와이어 사양에 원고 메시지 셋이 있는가 — `script` · `skip` · `break` (2026-10-09 마스터).
 *
 * 왜 시험이 필요한가: 이 파일(docs/samples/wire-messages.json)은 **정본의 사본**이다.
 * 정본은 `raytok-native1/docs/samples/wire-messages.json` 이고, 10-09 에 보니 정본에는
 * 셋이 있는데 **이 사본에는 없었다** — 설계 글(RayTok-설계_웹강사화면_v0.md §2)이
 * "추가 요청" 이라 적어 둔 그대로 남아 있었다.
 *
 * 한 와이어를 두 쪽이 **다른 사양으로** 읽는 것이 D-75 가 말하는 사고다. 웹 강사 화면(W3)이
 * `script` 를 보내고 청취 페이지가 받으므로, 셋이 사라지면 그 자리에서 조용히 어긋난다.
 * 사람의 기억에 걸지 않는다.
 *
 * 저장소가 다르니 정본과 글자 대조는 못 한다. 대신 **있는지와 칸이 맞는지**를 본다.
 */
const fs = require('fs');
const path = require('path');

const SPEC = path.join(__dirname, '..', 'docs', 'samples', 'wire-messages.json');
const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));

let bad = 0;
const ok = (cond, what) => {
  if (cond) { console.log('  ok   ' + what); return true; }
  console.log('  FAIL ' + what); bad++; return false;
};

console.log('와이어 원고 메시지 셋 (정본에서 옮긴 것)');

for (const kind of ['script', 'skip', 'break']) {
  const m = spec.messages && spec.messages[kind];
  if (!ok(!!m, `${kind} 가 사양에 있다`)) continue;
  ok(typeof m._dir === 'string' && m._dir.length > 0, `${kind} — 누가 누구에게 가는지 적혀 있다`);
  ok(Array.isArray(m.samples) && m.samples.length > 0, `${kind} — 보기가 하나 이상`);
  for (const s of m.samples || []) {
    ok(s.kind === kind, `${kind} — 보기의 kind 가 "${kind}"`);
  }
}

/* 칸 — 받는 쪽이 "3/20" 을 그리고, 다시 번역해야 하는지 가를 수 있어야 한다 */
const script = (spec.messages && spec.messages.script) || {};
for (const s of script.samples || []) {
  ok(Number.isInteger(s.para) && s.para >= 1, 'script — para 는 1부터인 정수');
  ok(Number.isInteger(s.total) && s.total >= s.para, 'script — total 은 문단 수');
  ok(typeof s.src === 'string' && s.src.length > 0, 'script — src 에 원문 글자');
  ok(typeof s.srcLang === 'string' && s.srcLang.length > 0, 'script — srcLang');
}
/*
 * `trans` 는 **선택**이다 (마스터 23:15 P-14 판정): LAN 길(앱 투폰·가이드)은 비우고 받는 폰이
 * 번역하고, relay 길(웹 강사 화면)은 채운다. 보기 둘이 그 둘을 각각 보여야 한다 — 하나만
 * 남으면 다음 사람이 "늘 채운다"나 "늘 비운다"로 읽는다.
 */
const withTrans = (script.samples || []).filter((s) => s.trans && Object.keys(s.trans).length);
const noTrans = (script.samples || []).filter((s) => !s.trans);
ok(withTrans.length > 0, 'script — relay 길 보기(trans 채움)가 있다');
ok(noTrans.length > 0, 'script — LAN 길 보기(trans 없음)가 있다');

const brk = (spec.messages && spec.messages.break) || {};
const ons = (brk.samples || []).map((s) => s.on);
ok(ons.includes(true) && ons.includes(false), 'break — 켜는 보기와 끄는 보기 둘');

console.log(bad ? `\n붉음 ${bad}` : '\n전부 통과');
process.exit(bad ? 1 : 0);
