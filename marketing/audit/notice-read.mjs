// 통지(notice) 줄을 **세지 않고 읽는다** — 조건부(참) / 단정(거짓 위험) 으로 가른다.
// 2026-11-04 15시 claude-22. 까닭: 14시에 통지 46자리를 손으로 읽어 보니
//   「언어 팩을 미리 받아 두면 …」(조건부·참) 과 「폰 안에서 번역합니다」(단정·거짓 위험)이
//   같은 통지로 찍혔다. check() 에는 「조건절이 있는가」 칸이 없다.
// 엔진(route.mjs·lib/check.mjs)은 **건드리지 않는다.** 이 파일은 따로 도는 읽개다.
// 쓰기: node marketing/audit/notice-read.mjs <제품id> [파일...]
//   파일을 안 주면 레포 안 *.html 전부.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolveForbidden, loadProduct } from '../lib/check.mjs';

// 조건·단서 표시. 하나라도 있으면 「조건부」로 본다.
// 없으면 「단정」 — 기계가 판정하지 않고 **사람이 읽을 줄**로 올린다.
const COND = [
  /미리/, /받아\s*둔?/, /려받으면/, /있으면/, /없으면/, /하면/, /되면/, /으면/,
  /경우/, /때/, /※/, /단,/, /만약/, /라면/, /지원하는/, /준비된/, /한해/,
  /골라/, /고른/, /선택/, /설치/, /받은/, /깔아/, /담긴/, /들어\s*있/,
  // 11-04 15시 2차: 주어에 붙은 한정(「언어 팩이 **있는** 언어는」·「**로컬 저장** 기능은」)도 단서다.
  //   1차에서 이 꼴 넷이 거짓 단정으로 찍혔다. 사람이 읽어 걸러 넣는다.
  /있는\s*언어/, /팩이\s*있/, /로컬\s*저장/, /언어는/, /만\s*잽니다/
];
// 줄 안 태그는 '' 로 지운다 (SKILLS 11-04: ' ' 로 바꾸면 「(공산품) 입니다」가 되어 정본을 못 뗀다)
const strip = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]+/g, ' ');

// 문장 끊기: 마침표·물음표·느낌표·줄바꿈. 한국어 「…다.」 가 대부분이다.
const sentences = (t) => t.split(/(?<=[.!?。])\s+|\n+/).map(s => s.trim()).filter(Boolean);

const pid = process.argv[2];
if (!pid) { console.error('제품id 를 주십시오 (raytok-app | raytok-glass | touchtok)'); process.exit(2); }
const files = process.argv.slice(3).length ? process.argv.slice(3)
  : execSync(`find . -name '*.html' -not -path './node_modules/*' -not -path './.git/*'`, { cwd: process.cwd() })
      .toString().trim().split('\n');

const { notice } = resolveForbidden(loadProduct(pid));
const rows = [];
let scanned = 0, charsAll = 0;
// 11-04 15시 4차: 계획 json(out/plan-*.json)도 받는다. 예약 캡션이 거기 있다.
//   페이지만 읽으면 **대외로 나갈 글**을 못 본다 — 20:23·11-05 건이 그 꼴이다.
function partsOf(f, raw) {
  if (!f.endsWith('.json')) return [{ tag: '', text: strip(raw) }];
  const d = JSON.parse(raw);
  const out = [];
  for (const p of (d.plan || [])) {
    if (p.caption) out.push({ tag: `${p.when || '?'} 캡션`, text: String(p.caption) });
    const alt = p.image?.mediaAltText || p.mediaAltText;
    if (alt) out.push({ tag: `${p.when || '?'} alt`, text: String(alt) });
  }
  return out;
}

for (const f of files) {
  let raw; try { raw = readFileSync(f, 'utf8'); } catch { continue; }
  scanned++;
  for (const part of partsOf(f, raw)) {
  const text = part.text;
  const label = part.tag ? `${f} · ${part.tag}` : f;
  charsAll += text.length;
  const ss = sentences(text);
  ss.forEach((s, i) => {
    const hit = notice.filter(w => s.toLowerCase().includes(String(w).toLowerCase()));
    if (!hit.length) return;
    const cond = COND.some(r => r.test(s));
    // 11-04 15시 3차: **같은 칸의 ※ 가 받치는 단정**이 있다. 문장 하나만 보면 안 보인다.
    //   실측: img/d3/page.html 118행 「RayTok은 휴대폰 안에서 번역합니다.」(단정) 바로 아래
    //   121행에 「※ 폰에 그 언어가 없으면 서버가 번역합니다(인터넷 필요).」가 있다.
    //   이게 11-04 「안 B」(문장은 두고 ※ 한 줄만 더함)가 이미 쓰이고 있다는 증거다.
    const nearArr = ss.slice(Math.max(0, i - 2), i + 4);
    const near = nearArr.join(' ');
    // 2026-11-04 16시 smartever 알림: **받침 기호는 ※ 만이 아니다.** 터치톡 상세는
    //   줄 머리에 `* `(별표+빈칸)를 쓴다(347~350행). ※ 만 보면 그 꼴이 **민 단정으로 떨어진다**(거짓 🔴).
    //   후보를 넓힌다: ※ · 줄머리 `* ` · `주)` · `단,` · `(단`. 다른 몰·다른 제작자 글에 쓸 때를 위한 것.
    const MARK = (t) => /※/.test(t) || /^\s*\*\s/.test(t) || /주\)|단,|\(단/.test(t);
    const star = !cond && nearArr.some(MARK) && /(서버|인터넷|없으면|한해)/.test(near);
    rows.push({ file: label, n: i + 1, words: hit, cond, star, s: s.length > 180 ? s.slice(0, 180) + '…' : s });
  });
  }
}
const flat = rows.filter(r => !r.cond && !r.star);
const starred = rows.filter(r => r.star);
console.log(`# 통지 읽기 — 제품 ${pid}`);
console.log(`장 ${scanned} · 글자 ${charsAll} · 통지 낱말 ${notice.length}종`);
console.log(`통지 걸린 문장 ${rows.length} — 조건부 ${rows.length - flat.length - starred.length} / ※받침 ${starred.length} / **민 단정 ${flat.length}**`);
if (!charsAll) console.log('🔴 긁은 글자가 0 입니다 — 「깨끗」이 아니라 「셀 게 없음」입니다');
console.log('');
console.log('## 단정 (사람이 읽을 줄)');
if (!flat.length) console.log('- 없음');
for (const r of flat) console.log(`- 🔴 \`${r.file}\` 문장${r.n} [${r.words.join(', ')}]\n      ${r.s}`);
console.log('');
console.log('## ※ 받침 (문장은 단정이나 같은 칸의 ※ 가 받친다 — 「안 B」 꼴)');
if (!starred.length) console.log('- 없음');
for (const r of starred) console.log(`- 🟡 \`${r.file}\` 문장${r.n} [${r.words.join(', ')}]\n      ${r.s}`);
console.log('');
console.log('## 조건부 (단서가 붙어 있음 — 고칠 것 없음)');
const ok = rows.filter(r => r.cond);
if (!ok.length) console.log('- 없음');
for (const r of ok) console.log(`- ✓ \`${r.file}\` 문장${r.n} [${r.words.join(', ')}]`);
