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

/** 장부의 planned = 「아직 예약은 안 걸었지만 남이 잡아둔 자리」 (2026-11-01 smartever 가 추가).
 *  used 만 보면 그 자리를 빈 자리로 보고 **겹쳐 예약**한다. 그래서 자리로 세서 빼 둔다.
 *  이미 posts 로 올라간 건은 두 번 세지 않는다 (hook 또는 날짜+제품으로 맞춰 본다). */
function reservedFromToolLedger(month, tool) {
  const j = readJson(toolPath(month, tool));
  if (!j || !Array.isArray(j.planned)) return { n: 0, items: 0 };
  const posts = Array.isArray(j.posts) ? j.posts : [];
  const done = (pl) => posts.some(po =>
    (pl.hook && (po.hook === pl.hook || po.hookId === pl.hook)) ||
    (pl.d && pl.p && (po.d === pl.d || po.when || '').includes?.(pl.d) && (po.p || po.productId) === pl.p));
  let n = 0, items = 0;
  for (const pl of j.planned) {
    if (done(pl)) continue;
    n += Number(pl.channels) > 0 ? Number(pl.channels) : 1;
    items++;
  }
  return { n, items };
}

export function read(month) {
  const agg = readJson(path(month)) || { month, used: {}, log: [] };
  const used = {}, reserved = {}, sources = {};
  for (const tool of Object.keys(CAPS)) {
    const a = agg.used?.[tool] || 0;
    const t = usedFromToolLedger(month, tool);
    used[tool] = Math.max(a, t.n);
    sources[tool] = used[tool] === t.n && t.src ? t.src : (a ? `${month}.json` : '장부 없음');
    reserved[tool] = reservedFromToolLedger(month, tool).n;
  }
  return { month, used, reserved, log: agg.log || [], sources };
}

/** 쓸 수 있는 자리 = 한도 - 실제로 쓴 것.
 *  planned(잡아둔 자리)는 **여기서 빼지 않는다.** 전역으로 빼면 자기 자리를 자기가 막아
 *  그 제품을 다시 plan 할 때 계획이 잘려 나간다. 「남이 잡아둔 자리」는
 *  plannedByOthers() 로 **제품을 제외하고** 센다. */
export function left(month, tool) {
  const cap = CAPS[tool]?.perMonth ?? 0;
  return cap - (read(month).used[tool] || 0);
}

/** 장부 planned 중 **다른 제품** 몫의 건수. plan 이 남의 자리를 밀어내지 않게 쓴다.
 *  out/ 계획 파일로 세는 plannedElsewhere() 와 같은 자리를 가리키므로
 *  route.mjs 는 둘을 **더하지 않고 큰 쪽**을 쓴다. */
export function plannedByOthers(month, tool, exceptPid) {
  const j = readJson(toolPath(month, tool));
  if (!j || !Array.isArray(j.planned)) return 0;
  const posts = Array.isArray(j.posts) ? j.posts : [];
  let n = 0;
  for (const pl of j.planned) {
    if (exceptPid && pl.p === exceptPid) continue;
    if (posts.some(po => pl.hook && (po.hook === pl.hook || po.hookId === pl.hook))) continue;
    n += Number(pl.channels) > 0 ? Number(pl.channels) : 1;
  }
  return n;
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

/** 장부 planned 중 **이 제품** 몫의 날짜·후킹. plan 이 세운 날짜와 맞대 보는 데 쓴다.
 *  까닭: `plan` 은 요일 인자를 빼면 조용히 기본 요일(화·금)로 다시 깔린다.
 *    2026-11-02 터치톡 계획이 그렇게 목→화·금 으로 밀려 4편(11/5·12·19·26)이
 *    5편(11/3·6·10·13·17)으로 바뀌었고, 양쪽 세션이 하루 넘게 못 봤다.
 *    장부는 사람이 쓴 의도라 그쪽이 정본에 가깝다. 어긋나면 plan 이 소리를 내게 한다.
 *  반환 [{ d: "11-05", hook: "T1", channels: 2 }, ...] — 아직 posts 로 안 올라간 것만. */
export function plannedDatesFor(month, tool, pid) {
  const j = readJson(toolPath(month, tool));
  if (!j || !Array.isArray(j.planned)) return [];
  const posts = Array.isArray(j.posts) ? j.posts : [];
  return j.planned
    .filter(pl => pl.p === pid)
    .filter(pl => !posts.some(po => pl.hook && (po.hook === pl.hook || po.hookId === pl.hook)))
    .map(pl => ({ d: String(pl.d || ''), hook: pl.hook || null, channels: Number(pl.channels) || 1 }));
}

/** 장부 posts(이미 발행·예약된 것) 중 **이 제품** 몫의 날짜. 「MM-DD」 집합.
 *  까닭: plan 은 요일만 보고 그 달 날짜를 전부 깔아서, **이미 나간 날짜에 또 소재를 얹었다.**
 *    2026-11-02 smartever 가 사본에서 재현: posts 에 11-05 T1 이 들어 있는데도 plan 이
 *    11-05 T1 을 다시 계획에 넣었다 — 같은 소재가 두 번 나갈 자리다 (claude-22 고침 11-03).
 *  ★ 장부 p 는 짧은 이름을 쓰는 데가 있다 (metricool: "app"·"glass" / uploadpost: "touchtok").
 *    그래서 제품 id 와 **꼬리 일치**까지 본다. 못 맞추면 안 빼는 쪽으로 둔다(조용히 덜 빼기). */
export function publishedDatesFor(month, tool, pid) {
  const j = readJson(toolPath(month, tool));
  const posts = j && Array.isArray(j.posts) ? j.posts : [];
  const mine = (po) => {
    const q = String(po.p || po.product || '');
    if (!q) return false;
    return q === pid || pid === `raytok-${q}` || pid.endsWith(`-${q}`) || q.endsWith(`-${pid}`);
  };
  // 날짜꼴을 MM-DD 로 맞춘다. 장부에 2026-11-05 처럼 해까지 적힌 줄이 섞여도
  // route.mjs 의 비교(MM-DD)가 조용히 어긋나지 않게 두 꼴을 다 담는다
  // (2026-11-03 claude-22: 11-03 09:40 고침의 빈틈. 실제 장부는 MM-DD 라 영향 없었음).
  const out = new Set();
  for (const po of posts.filter(mine)) {
    const d = String(po.d || '').trim();
    if (!d) continue;
    out.add(d);
    const m = d.match(/^(\d{4})-(\d{2}-\d{2})$/);
    if (m) out.add(m[2]);
  }
  return out;
}

/** 장부 posts 에 이미 올라간 **후킹 id** — 제품 기준.
 *  publishedDatesFor 와 짝이다. 날짜만 빼면 남은 자리에 **이미 나간 소재가 다시 붙는다**
 *  (2026-11-03 smartever 재현: posts 3줄 → 남은 11-26 에 T1 이 또 잡혔다).
 *  ★ 장부 줄에 hook 이 없으면 아무것도 빼지 않는다 — 조용히 덜 빼는 쪽으로 둔다. */
export function publishedHooksFor(month, tool, pid) {
  const j = readJson(toolPath(month, tool));
  const posts = j && Array.isArray(j.posts) ? j.posts : [];
  const mine = (po) => {
    const q = String(po.p || po.product || '');
    if (!q) return false;
    return q === pid || pid === `raytok-${q}` || pid.endsWith(`-${q}`) || q.endsWith(`-${pid}`);
  };
  const out = new Set();
  for (const po of posts.filter(mine)) {
    const h = String(po.hook || po.hookId || '').trim();
    if (h) out.add(h);
  }
  return out;
}

export { CAPS };

