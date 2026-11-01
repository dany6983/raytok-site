// 무료 플랜 한도 카운터. 채널마다 1건으로 센다.
//
// 장부 파일이 두 종류 있다. 둘 다 읽는다 (2026-11-01 claude-22):
//   quota/<tool>-<month>.json   실제로 예약을 건 세션이 쓰는 것. {tool, month, used, posts:[]}
//   quota/<month>.json          record() 가 쓰는 집계본.      {month, used:{}, log:[]}
// 한쪽만 읽으면 이미 찬 한도를 「비어 있다」고 보고해 중복 예약이 난다.
// 그래서 도구별로 **큰 쪽**을 쓴다. 적게 세는 쪽으로 틀리면 한도를 넘긴다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QDIR = join(ROOT, 'quota');

const CAPS = {
  metricool: { perMonth: 20, scope: 'tool', note: 'Metricool 무료: 브랜드 1개, 월 20건' },
  uploadpost: { perMonth: 10, scope: 'tool', note: 'Upload-Post 무료: 프로필 2개, 월 10건' }
};

function path(month) { return join(QDIR, `${month}.json`); }
function toolPath(month, tool) { return join(QDIR, `${tool}-${month}.json`); }

function readJson(p) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** 도구별 장부에서 쓴 건수. used(숫자)가 정본, 없으면 posts 길이. */
function usedFromToolLedger(month, tool) {
  const j = readJson(toolPath(month, tool));
  if (!j) return { n: 0, src: null };
  if (typeof j.used === 'number') return { n: j.used, src: `${tool}-${month}.json` };
  if (Array.isArray(j.posts)) return { n: j.posts.length, src: `${tool}-${month}.json(posts)` };
  return { n: 0, src: `${tool}-${month}.json` };
}

export function read(month) {
  const agg = readJson(path(month)) || { month, used: {}, log: [] };
  const used = {}, sources = {};
  for (const tool of Object.keys(CAPS)) {
    const a = agg.used?.[tool] || 0;
    const t = usedFromToolLedger(month, tool);
    used[tool] = Math.max(a, t.n);
    sources[tool] = used[tool] === t.n && t.src ? t.src : (a ? `${month}.json` : '장부 없음');
  }
  return { month, used, log: agg.log || [], sources };
}

export function left(month, tool) {
  const cap = CAPS[tool]?.perMonth ?? 0;
  return cap - (read(month).used[tool] || 0);
}

/** 발행 1건(채널 n개)이 들어갈 자리가 있나 */
export function canFit(month, tool, channelCount) {
  return left(month, tool) >= channelCount;
}

export function record(month, tool, { productId, hookId, channels, when }) {
  if (!existsSync(QDIR)) mkdirSync(QDIR, { recursive: true });
  const agg = readJson(path(month)) || { month, used: {}, log: [] };
  agg.used = agg.used || {}; agg.log = agg.log || [];
  // 집계본에는 집계본이 센 것만 더한다. 도구별 장부는 read() 가 따로 읽는다
  agg.used[tool] = (agg.used[tool] || 0) + channels.length;
  agg.log.push({ productId, hookId, channels, when, counted: channels.length, at: new Date().toISOString() });
  writeFileSync(path(month), JSON.stringify(agg, null, 2));
  return left(month, tool);
}

export { CAPS };
