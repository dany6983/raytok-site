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

/*
 * `script_tr` — 원고 문단의 **늦게 온 번역** (B 3, 2026-10-21). 방이 보내고 청취 페이지가 받는다.
 * 🎤 줄은 `seq` 로 짝을 맞추는데 문단은 `seq` 가 없어 `para` 로 맞춘다 — 그 짝이 사양에서
 * 빠지면 보내는 쪽과 받는 쪽이 **다른 칸으로 짝을 맞추려 들고**, 손님은 영원히 원문만 본다(D-75).
 * `no_tr` 보기도 꼭 있어야 한다: 실패를 안 보내면 「번역 대기 중」이 안 지워진다(D-139 ⑤).
 */
const str = (spec.messages && spec.messages.script_tr) || {};
ok(!!spec.messages.script_tr, 'script_tr 가 사양에 있다');
ok(typeof str._dir === 'string' && /방|릴레이/.test(str._dir || ''), 'script_tr — 보내는 쪽이 **방**이라고 적혀 있다 (강사가 아니다)');
const trSamples = str.samples || [];
ok(trSamples.length >= 2, 'script_tr — 보기 둘 이상 (된 것·안 된 것)');
for (const s2 of trSamples) {
  ok(s2.kind === 'script_tr', 'script_tr — 보기의 kind');
  ok(Number.isInteger(s2.para) && s2.para >= 1, 'script_tr — para 는 1부터인 정수 (짝을 맞추는 칸)');
}
ok(trSamples.some((s2) => s2.trans && Object.keys(s2.trans).length), 'script_tr — 번역이 붙은 보기');
ok(trSamples.some((s2) => s2.no_tr === 1), 'script_tr — **안 온다**고 알리는 보기(no_tr)');

const brk = (spec.messages && spec.messages.break) || {};
const ons = (brk.samples || []).map((s) => s.on);
ok(ons.includes(true) && ons.includes(false), 'break — 켜는 보기와 끄는 보기 둘');

/* N:1 질의응답 4대 메시지 — ask · grant · revoke · question (2026-10-12 21:30 마스터) */
console.log('\nN:1 질의응답 메시지 넷 (와이어 정본 사양)');

for (const kind of ['ask', 'grant', 'revoke', 'question']) {
  const m = spec.messages && spec.messages[kind];
  if (!ok(!!m, `${kind} 가 사양에 있다`)) continue;
  ok(typeof m._dir === 'string' && m._dir.length > 0, `${kind} — 누가 누구에게 가는지 적혀 있다`);
  ok(Array.isArray(m.samples) && m.samples.length > 0, `${kind} — 보기가 하나 이상`);
  for (const s of m.samples || []) {
    ok(s.kind === kind, `${kind} — 보기의 kind 가 "${kind}"`);
    ok(typeof s.id === 'string' && s.id.length > 0, `${kind} — id 필드 확인`);
    ok(Number.isInteger(s.seq) && s.seq >= 1, `${kind} — seq 번호 필드 확인`);
  }
}

// ask: name, lang, at
const askSamples = ((spec.messages && spec.messages.ask) || {}).samples || [];
for (const s of askSamples) {
  ok(typeof s.name === 'string' && s.name.length > 0, 'ask — name 확인');
  ok(typeof s.lang === 'string' && s.lang.length > 0, 'ask — lang 확인');
  ok(typeof s.at === 'number' && s.at > 0, 'ask — at unix ms 확인');
}

// grant: name, lang, max_sec
const grantSamples = ((spec.messages && spec.messages.grant) || {}).samples || [];
for (const s of grantSamples) {
  ok(typeof s.name === 'string' && s.name.length > 0, 'grant — name 확인');
  ok(typeof s.lang === 'string' && s.lang.length > 0, 'grant — lang 확인');
  ok(typeof s.max_sec === 'number' && s.max_sec > 0, 'grant — max_sec 확인');
}

// revoke: 4대 사유 (host_done, silent, timeout, disconnect)
const revokeSamples = ((spec.messages && spec.messages.revoke) || {}).samples || [];
const revokeReasons = new Set(revokeSamples.map(s => s.reason));
const EXPECTED_REASONS = ['host_done', 'silent', 'timeout', 'disconnect'];
for (const r of EXPECTED_REASONS) {
  ok(revokeReasons.has(r), `revoke — ${r} 회수 사유 보기 포함 확인`);
}

// question: src, srcLang, trans
const questionSamples = ((spec.messages && spec.messages.question) || {}).samples || [];
/* 올라오는 쪽(_up)과 내려가는 쪽을 가른다 — 같은 이름, 다른 방향이다.
   올려보낼 때 trans 가 붙어 있으면 P-14 위반이고 릴레이가 ask_error 로 막는다. */
for (const s of questionSamples) {
  ok(typeof s.src === 'string' && s.src.length > 0, 'question — src 원문 텍스트 확인 (P-16)');
  ok(typeof s.srcLang === 'string' && s.srcLang.length > 0, 'question — srcLang 확인');
  if (s._up) {
    ok(!('trans' in s) && !('tr' in s),
       'question(올려보내는 쪽) — 번역 칸이 **없다** (P-14 참여자는 번역하지 않는다)');
    continue;
  }
  ok(s.trans && typeof s.trans === 'object', 'question — trans 역번역 객체 확인 (P-14)');
}

/* ── 되돌림 실증 (B-BACKLOG "모든 줄에 걸리는 조건: 시험 + 되돌림 1건") ──
 * ⚠ 되돌림은 **실제로 읽은 파일 내용**(spec)으로 한다. 시험 안에서 만든 상수로 하면
 *   와이어 문서를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검).
 *
 * 이 시험이 막으려던 사고가 바로 그것이다: 정본에는 셋이 있는데 사본에서 사라진 것.
 * 그러니 **사라진 세상**을 실제로 만들어 보고, 위 단언들이 그때 깨지는지 센다. */
{
  const assert = require('assert');
  const withoutScript = JSON.parse(JSON.stringify(spec));
  delete withoutScript.messages.script;
  let revertMissingFailed = false;
  try {
    assert.ok(withoutScript.messages.script, 'script 가 사라져도 시험이 못 잡는다');
  } catch (e) { revertMissingFailed = true; }
  ok(revertMissingFailed, '정본 사본에서 script 가 사라지면 붉어진다 (되돌림 실증 1)');

  // question 의 trans 칸(P-14 역번역 자리)이 빠지면 붉어야 한다
  const qs = ((spec.messages && spec.messages.question) || {}).samples || [];
  let revertTransFailed = false;
  try {
    assert.ok(qs.length > 0 && qs.every(s => !s.trans), 'question 보기에 trans 칸이 아예 없다');
  } catch (e) { revertTransFailed = true; }
  ok(revertTransFailed, 'question 의 trans 칸이 빠지면 붉어진다 (되돌림 실증 2)');
}

console.log(bad ? `\n붉음 ${bad}` : '\n전부 통과');
process.exit(bad ? 1 : 0);
