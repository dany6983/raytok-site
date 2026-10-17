/* samples/eval20_out_test.mjs — 20문장 ⓑ 표를 파일로 내는 길 시험 (B 15, 2026-10-17)
 *
 * 왜 망 없이 도나: 운영 릴레이에 닿는 것은 대표님 PC 뿐이다. 그래서 `--paste` 길이 있고,
 * 이 시험은 **그 길 자체**(글 → 표 → 글)를 센다. 망을 부르는 쪽은 대표님 PC 에서만 돈다.
 * 돌리기: node samples/eval20_out_test.mjs
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { renderMarkdown, parsePasted } from '../scripts/eval20-basic.mjs';

console.log('=== 20문장 ⓑ 표 내보내기 시험 (--out · --paste) ===');
let checks = 0;
const ok = (c, d) => { assert(c, d); checks++; console.log('  [PASS] ' + d); };

/* 대표님 PC 출력을 흉내 낸 글. **실기보다 쉽지 않게** 짚을 것을 넣는다(D-11):
   진행 줄 · 번역문 안의 세로줄(\|) · 실패 줄 · 지어낸 숫자 · 표 아닌 줄. */
const pasted = [
  '=== 20문장 ⓑ basic — https://raytok-relay.raytok.workers.dev · zh → ko · 표: /x/src/eval20.js ===',
  '',
  '[1/20] 일상 312ms 안녕하세요',
  '[2/20] 숫자 980ms ❌ HTTP 503 pg',
  '',
  '## ⓑ 릴레이 basic — 앱 저장소 docs/eval/zh-ko-20.md 에 붙일 칸',
  '',
  '| # | 종류 | ms | ⓑ basic 번역 | 원문에 없던 숫자 |',
  '|---|---|---|---|---|',
  '| 1 | 일상 | 312 | 안녕하세요, 잘 지내셨어요? | - |',
  '| 2 | 숫자 | 980 | **실패: HTTP 503 upstream** | - |',
  '| 3 | 표 | 120 | 가로 \\| 세로 모두 | 7 |',
  '',
  '셈: 실패 1/3 · 원문에 없던 숫자가 생긴 줄 1/3 · 평균 471ms'
].join('\n');

const { meta, rows } = parsePasted(pasted);
ok(rows.length === 3, `표 줄 셋만 읽었다 (진행 줄·머리줄·구분줄·셈 줄은 아니다) — ${rows.length}`);
ok(rows[0].text === '안녕하세요, 잘 지내셨어요?' && !rows[0].why, '성공 줄의 번역문을 그대로 읽는다');
ok(rows[1].why === 'HTTP 503 upstream' && rows[1].text === '', '실패 줄은 번역문이 아니라 **까닭**으로 읽는다');
ok(rows[2].text === '가로 | 세로 모두', '번역문 안의 세로줄을 되돌려 읽는다 (\\| → |)');
ok(rows[2].invented.join(',') === '7' && rows[0].invented.length === 0, '원문에 없던 숫자 칸을 읽는다');
ok(meta.base === 'https://raytok-relay.raytok.workers.dev', '머리글에서 릴레이 주소를 읽는다');
ok(meta.from === 'zh' && meta.to === 'ko', '머리글에서 방향을 읽는다');

/* 되읽은 것을 다시 써서 **같은 표**가 나오는가 — 한 바퀴 돌려 잃는 것이 없어야 한다 */
const md = renderMarkdown({ ...meta, at: '2026-10-17 00:00 UTC' }, rows);
ok(md.includes('| 1 | 일상 | 312 | 안녕하세요, 잘 지내셨어요? | - |'), '다시 쓴 표에 성공 줄이 그대로 있다');
ok(md.includes('**실패: HTTP 503 upstream**'), '다시 쓴 표에 실패가 숨지 않는다');
ok(md.includes('가로 \\| 세로 모두'), '다시 쓸 때 세로줄을 또 막아 준다 (표가 깨지지 않게)');
ok(md.includes('셈: 실패 1/3 · 원문에 없던 숫자가 생긴 줄 1/3'), '셈을 다시 센다 (붙인 글의 셈 줄을 믿지 않는다)');
ok(!/구글|google|deepl|gpt|엔진 이름은/i.test(md), '표에 엔진 이름이 없다 (블라인드)');
const back = parsePasted(md);
ok(back.rows.length === 3 && back.rows[2].text === rows[2].text, '쓴 것을 다시 읽어도 같다 (한 바퀴)');

/* §20 — 빈 답. 표가 한 줄도 없는 글을 넘기면 **0줄**이라고 말해야 한다(없는 표를 지어내지 않는다) */
const empty = parsePasted('아무 표도 없는 글\n[1/20] 일상 10ms 안녕');
ok(empty.rows.length === 0, '표가 없으면 0줄 — 지어내지 않는다 (§20)');

/* 틀 문서 — 아직 안 돌렸다는 것이 보이고, 숫자를 지어내지 않았다 */
const skel = readFileSync(new URL('../docs/eval20-basic.md', import.meta.url), 'utf-8');
ok(/아직/.test(skel), '틀 문서가 "아직 돌리지 않았다"고 말한다');
ok(skel.includes('--out') && skel.includes('--paste'), '틀 문서에 채우는 두 길이 적혀 있다');
ok(!/\| \d+ \| .* \| \d+ \|/.test(skel), '틀 문서에 가짜 결과 줄이 없다');

/* 되돌림 실증 — 실패를 성공처럼 읽으면 붉다 */
let reverted = false;
try { assert.strictEqual(rows[1].text, 'HTTP 503 upstream', '실패 까닭을 번역문 칸으로 읽었다'); }
catch (e) { reverted = true; }
ok(reverted === true, '실패 줄을 번역문으로 읽으면 붉어진다 (되돌림 실증)');

console.log(`\n전부 통과 (${checks}건)`);
