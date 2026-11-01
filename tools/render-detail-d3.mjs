#!/usr/bin/env node
// 상세 v3 렌더 → 860px 4분할 JPG (claude-22, 2026-11-01)
//
//   node tools/render-detail-d3.mjs
//
// 전제: 글꼴이 /root/.fonts/Pretendard-{Regular,Medium,SemiBold,Bold}.otf 에 있어야 한다.
// 없으면 아래 한 줄로 받는다 (npm 패키지, 다운로드 아님):
//   npm pack pretendard && tar xzf pretendard-*.tgz && \
//   mkdir -p /root/.fonts && cp package/dist/public/static/Pretendard-{Regular,Medium,SemiBold,Bold}.otf /root/.fonts/
//
// 글꼴이 없으면 조용히 다른 글꼴로 렌더되고 줄바꿈 위치까지 달라진다 → 반드시 먼저 확인.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import pw from '/opt/npm-tools/node_modules/playwright/index.js';
const { chromium } = pw;

const NEED = ['Regular', 'Medium', 'SemiBold', 'Bold'].map(w => `/root/.fonts/Pretendard-${w}.otf`);
const missing = NEED.filter(f => !fs.existsSync(f));
if (missing.length) { console.error('글꼴 없음:\n  ' + missing.join('\n  ')); process.exit(1); }

const SRC = 'img/d3/page.html', OUT = 'img/d3', W = 860, MAXB = 153600;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: 1200 }, deviceScaleFactor: 1 });
await p.goto('file://' + process.cwd() + '/' + SRC);
await p.waitForTimeout(2500);
const H = await p.evaluate(() => document.documentElement.scrollHeight);
// 그림이 걸친 자리에서 자르면 안 된다 → 그림 구간을 받아 둔다
const spans = await p.evaluate(() => [...document.querySelectorAll('img')]
  .map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.top + scrollY), Math.round(r.bottom + scrollY)]; }));
await p.screenshot({ path: '/tmp/d3-full.png', fullPage: true });
await b.close();
console.log('height', H);
fs.writeFileSync('/tmp/d3-spans.json', JSON.stringify({ H, W, spans, maxb: MAXB, out: OUT }));

// 자르기·저장은 PIL 이 빠르다
execFileSync('python3', ['-c', `
import json, os
from PIL import Image
import numpy as np
m=json.load(open('/tmp/d3-spans.json')); H=m['H']; W=m['W']
im=Image.open('/tmp/d3-full.png').convert('RGB'); a=np.asarray(im,dtype=np.int16)
def inimg(y): return any(s-4<=y<=e+4 for s,e in m['spans'])
def clean(y):
    if inimg(y): return False
    for yy in (y-1,y,y+1):
        row=a[yy]; med=np.median(row,axis=0)
        if (np.abs(row-med).max(axis=1)>20).sum()>0: return False
    return True
def find(t,win=320):
    c=[y for y in range(max(2,t-win),min(H-2,t+win)) if clean(y)]
    if not c: raise SystemExit('자를 빈 줄을 못 찾음: %d' % t)
    return min(c,key=lambda y:abs(y-t))
cuts=[0]+[find(t) for t in (H//4,H//2,H*3//4)]+[H]
print('cuts',cuts)
tot=0
for i in range(4):
    sl=im.crop((0,cuts[i],W,cuts[i+1])); f=os.path.join(m['out'],'RT18G_v3_%d.jpg'%(i+1))
    for q in (88,85,82,79,76):
        sl.save(f,quality=q,optimize=True); sz=os.path.getsize(f)
        if sz<=m['maxb']: break
    tot+=sz; print(i+1, sl.size, sz, 'q', q)
print('합계 KB', round(tot/1024))
`], { stdio: 'inherit' });
