// 무료 플랜 한도 카운터. 채널마다 1건으로 센다.
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

export function read(month) {
  if (!existsSync(path(month))) return { month, used: {}, log: [] };
  return JSON.parse(readFileSync(path(month), 'utf8'));
}

export function left(month, tool) {
  const q = read(month);
  const cap = CAPS[tool]?.perMonth ?? 0;
  return cap - (q.used[tool] || 0);
}

/** 발행 1건(채널 n개)이 들어갈 자리가 있나 */
export function canFit(month, tool, channelCount) {
  return left(month, tool) >= channelCount;
}

export function record(month, tool, { productId, hookId, channels, when }) {
  if (!existsSync(QDIR)) mkdirSync(QDIR, { recursive: true });
  const q = read(month);
  q.used[tool] = (q.used[tool] || 0) + channels.length;
  q.log.push({ productId, hookId, channels, when, counted: channels.length, at: new Date().toISOString() });
  writeFileSync(path(month), JSON.stringify(q, null, 2));
  return left(month, tool);
}

export { CAPS };
