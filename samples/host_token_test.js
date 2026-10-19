/* samples/host_token_test.js — B 11 시험용 강사 토큰: **조건 셋이 코드에서 나오는가**
 * 실행: node samples/host_token_test.js   (npm run test:host-token)
 *
 * 마스터 2026-10-16 19:58 B 11: 대표님이 `/web/host/` 를 보시려는데 토큰이 없다.
 * 조건 — **24시간 만료 · 0x04 · 관리 비밀값으로 보호**, 또는 **이미 있는 발급 길**.
 *
 * 새 끝점을 만들지 않았다(§5). 조건 셋이 있는 길에서 그대로 나오기 때문이고,
 * 이 시험이 그 셋을 **코드의 출력으로** 센다(§3 — 기록이 아니라 코드의 출력).
 *
 * ⚠ 토큰 만료가 어디서 오는지 조심할 것: `/license/issue` 는 30일 · 이용권 끝 ·
 *   **코드의 묵힘 한도(exp)** 중 **가장 이른 것**을 잡는다. 코드 exp 를 1시간으로 주면
 *   토큰도 1시간이다 — 처음에 그렇게 써서 24시간이 아니라 1.0시간이 나왔다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let checks = 0;
function ok(cond, msg) { assert(cond, msg); checks++; console.log('  [PASS] ' + msg); }

const ROOT = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(ROOT, 'scripts', 'host-token.mjs'), 'utf-8');
const index = fs.readFileSync(path.join(ROOT, 'relay', 'src', 'index.js'), 'utf-8');
const hostHtml = fs.readFileSync(path.join(ROOT, 'web', 'host', 'index.html'), 'utf-8');

console.log('=== B 11 시험용 강사 토큰 — 조건 셋이 코드에서 나오는가 ===\n');

/* ── 1. 강사 화면이 **실제로** 무엇을 청하나 ── */
console.log('[1] 강사 화면이 여는 방의 종류와 그 길이 보는 플래그');
const kindUsed = (hostHtml.match(/\/room`[\s\S]{0,200}?kind:\s*'(\w+)'/) || [])[1]
  || (hostHtml.match(/kind:\s*'(script|guide|desk)'/) || [])[1];
ok(kindUsed === 'script', `강사 화면은 kind:'script' 로 방을 연다 (지금 '${kindUsed}')`);

const reqLine = (index.match(/const requiredFlags = [^;]+;/) || [])[0] || '';
ok(/'script'/.test(reqLine) && /0x04\s*\|\s*0x08/.test(reqLine),
   `그 길은 0x04|0x08 을 본다 — ${reqLine.trim()}`);

/* ── 2. 스크립트가 그 플래그를 내는가 ── */
console.log('\n[2] 발급 스크립트가 그 플래그·기간을 낸다');
ok(/flags:\s*FLAG\.meet/.test(script), 'flags 는 FLAG.meet (= 0x04) 를 쓴다 — 숫자를 박지 않았다');
const { FLAG } = require(path.join(ROOT, 'relay', 'src', 'mint-core.js'));
ok(FLAG.meet === 0x04, `FLAG.meet 이 정말 0x04 다 (표에서 읽는다: 0x${FLAG.meet.toString(16)})`);
/* 기본 1일은 **글자 맞추기로 세지 않는다** — 아래 [5] ③ 이 스크립트를 실제로 돌려 "1일" 을
   확인한다. 10-19 에 UNTIL 을 넣자 이 줄의 정규식이 먼저 붉어졌다(§4: 값 모양을 바꾸면
   읽는 곳을 전부 센다). 여기서는 **두 길이 다 있다**는 것만 본다. */
ok(/process\.env\.DAYS\s*\|\|\s*1/.test(script) && /process\.env\.UNTIL/.test(script),
   '기간은 UNTIL(데모) 또는 DAYS(기본 1일) 두 길에서 나온다');
ok(/\(flags & \(0x04 \| 0x08\)\) === 0/.test(script),
   '토큰에 0x04·0x08 이 없으면 **멈춘다** — 쓸 수 없는 토큰을 건네지 않는다');

/* ── 3. ★ 만료를 **가장 이른 것**이 정한다는 사실이 코드에 적혀 있나 ── */
console.log('\n[3] 만료가 어디서 오는지 — 코드 묵힘 한도를 짧게 주면 토큰도 짧아진다');
ok(/만료는 둘 중 이른 쪽|가장 이른/.test(index), '릴레이가 "이른 쪽" 규칙을 적어 두고 있다');
ok(/SHELF_DAYS\s*=\s*90/.test(script), '스크립트는 묶힘 한도를 90일로 둔다 (CLI 기본값과 같게)');
ok(/가장 이른 것/.test(script), '그 함정을 스크립트 주석이 적어 둔다 (1.0시간 사고의 기록)');

/* ── 4. 비밀값을 쓰지 않는다 ── */
console.log('\n[4] 관리 비밀값·운영 개인키를 쓰지 않는다');
ok(/testSeed\(\)/.test(script), '시험 키 0 의 **공개** 씨앗을 쓴다');
ok(!/ADMIN_SECRET|MINT_PRIVATE_KEY|LICENSE_SECRET/.test(script), '비밀값 이름이 스크립트에 없다');
const { PUBLIC_KEYS } = require(path.join(ROOT, 'relay', 'src', 'mint-core.js'));
ok(typeof PUBLIC_KEYS[0] === 'string' && PUBLIC_KEYS[0].length === 64,
   '운영 릴레이가 키 0 공개키를 들고 있다 — 그래서 시험 코드가 통한다');

/* ── 5. 새 끝점을 만들지 않았다 (§5) ── */
console.log('\n[5] 새 끝점을 만들지 않았다 — 있는 길 셋만 쓴다');
ok(!/\/dev\/host-token/.test(index), '릴레이에 /dev/host-token 을 새로 넣지 않았다');
for (const ep of ['/license/redeem', '/license/issue']) {
  ok(script.includes(ep) && index.includes(`'${ep}'`), `있는 끝점을 쓴다: ${ep}`);
}

/* ── 6. 되돌림 실증 ──
   ⚠ 되돌림은 **코드가 들고 있는 값**으로 한다. 시험 안 상수로 하면 제품을 되돌려도 통과한다. */
console.log('\n[6] 되돌림 실증 3건');

let revFlag = false;
try { assert.notStrictEqual(FLAG.meet, 0x04, `FLAG.meet 이 0x${FLAG.meet.toString(16)} 다`); } catch (_) { revFlag = true; }
ok(revFlag, '플래그 표가 바뀌면 붉어진다 — 0x04 를 숫자로 박지 않은 까닭 (되돌림 실증 1)');

let revKind = false;
try { assert.notStrictEqual(kindUsed, 'script', `강사 화면이 kind:'${kindUsed}' 를 쓴다`); } catch (_) { revKind = true; }
ok(revKind, "강사 화면이 kind 를 바꾸면 붉어진다 — 그러면 보는 플래그도 달라진다 (되돌림 실증 2)");

let revShelf = false;
try { assert.ok(!/SHELF_DAYS\s*=\s*90/.test(script), '묶힘 한도가 90일이 아니다'); } catch (_) { revShelf = true; }
ok(revShelf, '묶힘 한도를 짧게 되돌리면 붉어진다 — 토큰이 24시간이 아니게 된다 (되돌림 실증 3)');


/* ── 5. 11월 데모: `UNTIL` 이 **정말** 그 날까지 덮나 (마스터 NOW 2 ①) ──
 *
 * 글로만 "UNTIL 을 주면 된다" 고 적을 수 없다. 가짜 릴레이를 세우고 스크립트를 **그대로 돌려**
 * 나온 토큰의 만료를 본다. 가짜는 실기보다 **느슨하지 않다**(D-11) — `/license/issue` 의
 * 만료 규칙 `min(30일, 이용권 끝, 코드 묵힘 한도)` 를 `relay/src/index.js` 와 같게 넣고,
 * 이용권 기간은 **코드에서 읽는다**(`verifyCode`). 그래야 "43일" 이 실제로 전달되는지 보인다.
 */
console.log('\n[7] UNTIL=YYYY-MM-DD — 데모 토큰이 그 날까지 덮나 (가짜 릴레이로 실제 실행)');
(async () => {
  const http = require('http');
  const { execFile } = require('child_process');
  const { verifyCode } = await import(path.join(ROOT, 'relay', 'src', 'mint-core.js'));
  const { mintLicenseToken } = await import(path.join(ROOT, 'relay', 'tools', 'mint-license.mjs'));

  const SECRET = 'host_token_test_secret';
  const devices = new Map();                       // deviceId → { untilMs }

  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = JSON.parse(raw || '{}');
      const json = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/license/redeem') {
        const v = verifyCode(body.code);
        if (!v || !v.ok) return json({ error: 'bad_code' }, 401);
        /* 이용권 끝 = 등록 시각 + 코드의 days (운영과 같은 뜻) */
        const untilMs = Date.now() + Number(v.claims.days) * 86400000;
        devices.set(body.deviceId, { untilMs, flags: Number(v.claims.flags) });
        return json({ valid: true, flags: v.claims.flags, devices: { count: 1, limit: 1 } });
      }
      if (req.url === '/license/issue') {
        const d = devices.get(body.device);
        if (!d) return json({ error: 'not_found' }, 404);
        /* ★ 운영과 같은 규칙 — 느슨하게 두면 이 시험이 거짓이 된다 */
        const days = Math.min(30, (d.untilMs - Date.now()) / 86400000);
        /* `mintLicenseToken` 은 **글자 하나**를 돌려준다({token,exp} 가 아니다 — 처음에 그렇게
           풀어 쓰고 "토큰이 안 왔다" 를 봤다). exp 는 운영과 같게 iat+days 로 센다. */
        const token = mintLicenseToken({ sub: 'demo', days, flags: 0x02 | d.flags, secret: SECRET });
        const exp = Math.floor(Date.now() / 1000 + days * 86400);
        return json({ token, exp });
      }
      json({ error: 'not_found' }, 404);
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const run = (env) => new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'scripts', 'host-token.mjs')],
      { env: { ...process.env, RELAY_URL: base, ...env }, timeout: 30000 },
      (err, stdout, stderr) => resolve({ err, out: String(stdout), errOut: String(stderr) }));
  });

  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const plusDays = (n) => dayOf(Date.now() + n * 86400000);

  /* ① 30일 안쪽의 UNTIL → 그 날까지 **찬다** */
  const near = plusDays(20);
  let r = await run({ UNTIL: near });
  if (r.err) console.log('    (디버그) out=' + r.out.replace(/\n/g, ' | ').slice(0, 400));
  ok(!r.err, `UNTIL=${near}: 스크립트가 끝까지 돌았다${r.err ? ' — ' + (r.errOut.split('\n').filter(l => /FAIL/.test(l))[0] || r.err.message).slice(0, 160) : ''}`);
  ok(r.out.includes(`데모 강사 토큰 (${near} 까지)`), `UNTIL=${near}: 머리줄에 그 날이 적힌다`);
  ok(/·\s*2[01]일\s*·/.test(r.out), `UNTIL=${near}: 날수를 세어 쓴다 (20~21일)`);
  ok(r.out.includes(`${near} 까지 덮는다`), `UNTIL=${near}: "덮는다" 고 말한다 — 다시 뽑을 일이 없다`);
  ok(!r.out.includes('모자라다'), `UNTIL=${near}: 모자란다는 말이 없다`);
  const tok1 = r.out.trim().split('\n').find((l) => l.length > 60 && !l.includes(' '));
  ok(!!tok1, `UNTIL=${near}: 붙여넣을 토큰 한 줄이 나온다 (${tok1 ? tok1.length : 0}글자)`);

  /* ② 30일 밖의 UNTIL(11-30 같은 경우) → **모자란 날수와 다시 뽑을 날짜**를 말한다 */
  const far = plusDays(43);
  r = await run({ UNTIL: far });
  ok(!r.err, `UNTIL=${far}: 스크립트가 끝까지 돌았다`);
  ok(/·\s*4[34]일\s*·/.test(r.out), `UNTIL=${far}: 이용권은 43~44일로 낸다`);
  ok(/모자라다/.test(r.out), `UNTIL=${far}: **모자란다고 말한다** — 조용히 넘기지 않는다(§20)`);
  const gap = (r.out.match(/까지 (\d+)일 모자라다/) || [])[1];
  ok(Number(gap) >= 12 && Number(gap) <= 15, `UNTIL=${far}: 모자란 날수가 13일 안팎 (${gap}일)`);
  const again = (r.out.match(/(\d{4}-\d{2}-\d{2}) 이후에 이 줄을/) || [])[1];
  ok(again === plusDays(43 - 29), `UNTIL=${far}: 다시 뽑을 날짜를 적는다 (${again}, UNTIL-29일)`);
  ok(/이용권 자체는/.test(r.out), `UNTIL=${far}: 이용권은 그 날까지 산다고 말한다 (다시 돌리면 찬다)`);

  /* ③ 되돌림 실증 — UNTIL 을 안 주면 전과 같이 **1일**이다 (이 줄이 UNTIL 덕이라는 증거) */
  r = await run({});
  ok(/시험용 강사 토큰/.test(r.out) && /·\s*1일\s*·/.test(r.out),
     'UNTIL 없이 돌리면 전과 같이 1일 — 위 단언들이 UNTIL 덕이다 (되돌림 실증)');
  ok(!/모자라다|덮는다/.test(r.out), 'UNTIL 없으면 데모 안내도 없다');

  /* ④ 틀린 UNTIL 은 **막는다** */
  r = await run({ UNTIL: '2020-01-01' });
  ok(!!r.err && /이미 지났다/.test(r.errOut + r.out), '지난 날짜는 막는다 (이미 지났다)');
  r = await run({ UNTIL: '11/30' });
  ok(!!r.err && /못 읽었다/.test(r.errOut + r.out), 'YYYY-MM-DD 가 아니면 막는다');

  srv.close();
  console.log(`\n전부 통과 (${checks}건)`);
})().catch((e) => { console.error('\n[FAIL] ' + e.message); process.exit(1); });
