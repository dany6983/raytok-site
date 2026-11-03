/* NOW 11-03 18:45 ④ — 손님 실시간 줄 밀림 규칙, 숫자부터.
 * 입력: 앱 실기 기록 reclog-lecture.txt (앱 docs/reclog/2026-11-02-lang99/) 의 translate_ok isFinal=true
 *       줄 = 손님에게 닿는 번역 줄(시각 ms, 글자 수). 읽는 시간 = 글자 / 초당 글자(cps).
 * ⓐ 지금 웹: 새 줄마다 cancel → 최신만. 다음 줄이 오기 전에 다 읽어야 「끝까지 읽힘」.
 * ⓑ 앱식: 큐에 넣고 순서대로, 다음을 꺼낼 때 안 읽은 것(꺼낼 줄 포함) 합이 5초 넘으면 가장 최근 줄로 건너뜀.
 * 실행: node tts-queue-sim.js <reclog-lecture.txt>
 */
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf-8').split('\n')
  .map(l => l.match(/^(\d+) translate_ok chars=(\d+) .*isFinal=true/)).filter(Boolean)
  .map(m => ({ t: +m[1], chars: +m[2] }));
function simA(cps) {
  let done = 0, cut = 0;
  for (let i = 0; i < rows.length; i++) {
    const dur = rows[i].chars / cps * 1000;
    const next = rows[i + 1] ? rows[i + 1].t : Infinity;
    if (rows[i].t + dur <= next) done++; else cut++;
  }
  return { done, cut, maxLag: 0 };
}
function simB(cps, jumpMs = 5000) {
  const dur = r => r.chars / cps * 1000;
  let now = 0, i = 0, done = 0, skipped = 0, maxLag = 0, lagSum = 0;
  const q = [];
  while (i < rows.length || q.length) {
    if (!q.length) { now = Math.max(now, rows[i].t); }
    while (i < rows.length && rows[i].t <= now) q.push(rows[i++]);
    const back = q.reduce((s, r) => s + dur(r), 0);
    if (back > jumpMs && q.length > 1) { skipped += q.length - 1; q.splice(0, q.length - 1); }
    const r = q.shift();
    const lag = now - r.t; maxLag = Math.max(maxLag, lag); lagSum += lag;
    now += dur(r); done++;
  }
  return { done, skipped, maxLag: Math.round(maxLag), avgLag: Math.round(lagSum / done) };
}
console.log(`줄 ${rows.length}개 · ${Math.round((rows[rows.length - 1].t - rows[0].t) / 60000)}분`);
for (const cps of [6, 8, 10]) {
  const a = simA(cps), b = simB(cps);
  console.log(`cps=${cps}  ⓐ cancel-최신: 끝까지 ${a.done}/${rows.length} (${(100 * a.done / rows.length).toFixed(1)}%) 잘림 ${a.cut} · 최대 밀림 0s` +
    `  |  ⓑ 큐+5초 건너뜀: 끝까지 ${b.done}/${rows.length} (${(100 * b.done / rows.length).toFixed(1)}%) 건너뜀 ${b.skipped} · 최대 밀림 ${(b.maxLag / 1000).toFixed(1)}s 평균 ${(b.avgLag / 1000).toFixed(1)}s`);
}
