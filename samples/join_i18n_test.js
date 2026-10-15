/**
 * /join 페이지 손님 글자 — 사전(join/ui-strings.json, 청취 페이지와 같은 모양) 81개 언어 (마스터 10-14 승인 ②).
 *
 * ① 키 12 × 언어 전부 차 있고 모양(빈칸·꺾쇠·자리표·따옴표)이 맞다  ② index.html 이 키를 다 쓴다
 * ③ 브라우저(Playwright): ?lang=vi 면 베트남어, ?lang=ar 면 dir=rtl, room= 있으면 「브라우저로 듣기」가 그 언어로,
 *    사전을 못 받아도(404) 한국어 원문 그대로 선다(R-15 — 글자 사전이 페이지를 막지 않는다).
 * 되돌려서 실패 확인: join/ui-strings.json 의 btn_web_listen.vi 를 지우면 ① 이 붉다; index.html 의 rtLoadStrings 호출을
 * 지우면 ③ 이 붉다.
 */
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.dirname(__dirname);
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'join/ui-strings.json'), 'utf8'));
const lis = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/listener/ui-strings.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'join/index.html'), 'utf8');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  [PASS] ' + m); };

(async () => {
  console.log('=== /join 손님 글자 사전 ===');
  const KEYS = Object.keys(dict.strings);
  ok(KEYS.length === 12, `키 12개 (${KEYS.length})`);
  ok(JSON.stringify(dict.langs) === JSON.stringify(lis.langs), `langs 가 청취 사전과 같다 (${dict.langs.length})`);
  let bad = [];
  for (const k of KEYS) for (const l of dict.langs) {
    const v = dict.strings[k][l];
    if (v == null || !String(v).trim()) { bad.push(`${k}.${l}: 비었다`); continue; }
    if (/[<>]/.test(v)) bad.push(`${k}.${l}: HTML 꺾쇠`);
    if (/\$\{|\{\d\}/.test(v)) bad.push(`${k}.${l}: 자리표`);
    if ((v.match(/"/g) || []).length % 2) bad.push(`${k}.${l}: 따옴표 홀수`);
    if (v !== v.trim()) bad.push(`${k}.${l}: 앞뒤 빈칸`);
    if (/RayTok/.test(dict.strings[k].en) && !/RayTok/.test(v)) bad.push(`${k}.${l}: RayTok 이름이 빠졌다`);
    if (/QR/.test(dict.strings[k].en) && !/QR/.test(v)) bad.push(`${k}.${l}: QR 이 빠졌다`);
  }
  ok(bad.length === 0, `${KEYS.length} × ${dict.langs.length} = ${KEYS.length * dict.langs.length} 칸 모양 검사 0건` + (bad.length ? '\n    ' + bad.slice(0, 15).join('\n    ') : ''));
  for (const k of KEYS) ok(html.includes(`data-i18n="${k}"`) || html.includes(`'${k}'`), `index.html 이 ${k} 를 쓴다`);
  ok(!/textContent = '[가-힣]/.test(html), '안내 글 한국어 하드코딩이 사전 뒤로 갔다 (setMsg)');

  // ③ 브라우저
  const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
  let hideDict = false;
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    if (hideDict && p.endsWith('ui-strings.json')) { r.writeHead(404); return r.end(); }
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(res => srv.listen(0, res));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const { chromium } = require('playwright');
  const chromePath = process.env.CHROME || (fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined);
  const b = await chromium.launch(chromePath ? { executablePath: chromePath, args: ['--no-sandbox'] } : {});
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => route.request().url().startsWith('intent://') ? route.abort() : route.continue());
  const q = '?ip=192.168.1.10&code=ABC123&room=ABC123';
  await page.goto(`${base}/join/${q}&lang=vi`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  ok((await page.textContent('h1')) === dict.strings.heading.vi, 'lang=vi → 머리글이 베트남어');
  ok((await page.textContent('#web-listen')) === dict.strings.btn_web_listen.vi, 'lang=vi → 「브라우저로 듣기」가 베트남어');
  ok((await page.textContent('#msg')) === dict.strings.msg_android.vi, 'lang=vi + Android → 안내 글이 베트남어 (setMsg)');
  ok((await page.getAttribute('html', 'lang')) === 'vi', '<html lang=vi>');
  await page.goto(`${base}/join/${q}&lang=ar`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  ok((await page.getAttribute('html', 'dir')) === 'rtl', 'lang=ar → dir=rtl');
  await page.goto(`${base}/join/?lang=de`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  ok((await page.textContent('#msg')) === dict.strings.msg_no_info.de, '연결 정보 없는 링크 + lang=de → 독일어 안내');
  await page.goto(`${base}/join/${q}&lang=xx`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  ok((await page.textContent('h1')) === dict.strings.heading.en || (await page.textContent('h1')) === dict.strings.heading.ko, '모르는 lang → 브라우저 언어(en) 또는 ko');
  hideDict = true;
  await page.goto(`${base}/join/${q}&lang=vi`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  ok((await page.textContent('h1')) === dict.strings.heading.ko && (await page.textContent('#msg')) === dict.strings.msg_android.ko, '사전 404 → 한국어 원문 그대로 선다 (R-15)');

  // ── 되돌림 실증 (B-BACKLOG "모든 줄에 걸리는 조건: 시험 + 되돌림 1건") ──
  // ⚠ 되돌림은 **그 화면에서 실제로 읽은 글**로 한다. 시험 안에서 만든 상수로 하면
  //   페이지를 되돌려도 그대로 통과한다 — 증거가 아니다(10-14 ⑨-1 전수 점검).
  //
  // R-15: 글자 사전을 못 받아도 페이지는 **서야 한다**. 지금 사전 404 인 채라 그 화면을 다시 본다.
  const fallbackHead = await page.textContent('h1');
  const fallbackMsg = await page.textContent('#msg');
  let revertR15Failed = false;
  try {
    assert.strictEqual(fallbackHead.trim(), '', `사전 404 인데 머리글이 비지 않았다 ("${fallbackHead}")`);
  } catch (e) { revertR15Failed = true; }
  ok(revertR15Failed === true, '사전을 못 받으면 화면이 빈다 — 그러면 붉어진다 (R-15, 되돌림 실증 1)');

  // 사전을 받은 뒤에는 **그 손님 언어**로 떠야 한다. 굳어 버리면 붉어야 한다.
  hideDict = false;
  await page.goto(`${base}/join/${q}&lang=vi`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  const viHead = await page.textContent('h1');
  ok(viHead === dict.strings.heading.vi, `사전을 받으면 그 언어로 뜬다 ("${viHead}")`);
  let revertLangFailed = false;
  try {
    assert.strictEqual(viHead, fallbackMsg && dict.strings.heading.ko, `vi 손님에게 한국어가 떴다 ("${viHead}")`);
  } catch (e) { revertLangFailed = true; }
  ok(revertLangFailed === true, '손님 언어를 한국어로 굳히면 붉어진다 (§18, 되돌림 실증 2)');

  await b.close(); srv.close();
  console.log(`\n전부 통과 (${n}건)`);
})().catch((e) => { console.error('\n[FAIL]', e.message); process.exit(1); });
