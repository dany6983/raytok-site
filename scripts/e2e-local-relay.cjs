// 쓰는 법: relay 에서 `npx wrangler dev --local --env-file <LICENSE_SECRET·LICENSE_SALT·ADMIN_SECRET>` · 사이트 `python3 -m http.server 8080` · `node scripts/host-token.mjs` 의 토큰을 $E2E_DIR/tok.txt 에 → node scripts/e2e-local-relay.cjs
// 가짜 릴레이가 아니라 **진짜 릴레이 코드**로 강사 1 + 손님 3 을 끝까지 돈다(D-11). mock 번역은 admin 만 → 번역 칸은 이 판으로는 못 잰다
// 마스터 로컬 e2e: 진짜 릴레이(wrangler dev, mock 번역) + 진짜 강사/손님 화면
const { chromium } = require('playwright');
const fs = require('fs');
const S = process.env.E2E_DIR || require('os').tmpdir();
const tok = fs.readFileSync(S + '/tok.txt', 'utf8').trim();
const SITE = 'http://127.0.0.1:8080', RELAY = 'http://127.0.0.1:8787';
const out = [];
const log = (k, v) => { out.push(`${k}: ${v}`); console.log(k, '→', v); };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const host = await (await b.newContext()).newPage();
  host.on('dialog', d => { log('host dialog', d.message()); d.accept(); });
  await host.goto(`${SITE}/web/host/?relay=${encodeURIComponent(RELAY)}`);
  await host.fill('#tokenInput', tok);
  await host.click('#btnVerifyToken');
  await host.waitForSelector('#step-prepare', { state: 'visible', timeout: 10000 });
  log('1 이용권', 'ok');
  const txt = '안전 교육을 시작하겠습니다.\n\n안전모를 반드시 착용하십시오.\n\n비상구 위치를 확인하세요.';
  await host.evaluate((t) => { const dt = new DataTransfer(); dt.items.add(new File([t], 'l.txt', { type: 'text/plain' })); const i = document.getElementById('fileInput'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); }, txt);
  await host.waitForFunction(() => document.querySelectorAll('.para-item').length === 3);
  const chips = await host.$$eval('#langChips input:checked', els => els.map(e => e.value));
  log('2 기본 선택 언어', chips.join(','));
  for (const c of ['en', 'zh-CN']) { if (!chips.includes(c)) await host.click(`#langChips input[value="${c}"]`); }
  const raw = await host.isChecked('#chkBroadcastRaw');
  log('3 번역 없이 방송 기본', raw);
  // 미리 번역 없이 시작해 보기 (대표님: 안 넘어감)
  const startVisible = await host.isVisible('#btnStartLecture');
  log('4 미리 번역 전 시작 단추 보임', startVisible);
  await host.click('#btnPreTranslate');
  await host.waitForSelector('#readyArea', { state: 'visible', timeout: 15000 });
  const tr = await host.$$eval('.para-item', els => els.map(e => e.textContent.replace(/\s+/g, ' ').slice(0, 120)));
  log('5 미리 번역 결과', JSON.stringify(tr));
  await host.click('#btnStartLecture');
  await host.waitForSelector('#step-live', { state: 'visible', timeout: 8000 });
  await host.waitForFunction(() => /연결/.test(document.getElementById('liveStatus').textContent), null, { timeout: 8000 });
  const code = (await host.textContent('#roomCode')).trim();
  const qr = await host.evaluate(() => { const a = document.querySelector('#qrUrl, .qr-url, [data-qr-url]'); return a ? (a.textContent || a.href) : ''; });
  log('6 방', code + ' QR=' + qr);
  const guests = [];
  for (const lang of ['en', 'zh-CN', 'ne']) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
    await p.addInitScript(() => { window.__spoken = []; const o = window.speechSynthesis && window.speechSynthesis.speak.bind(window.speechSynthesis); if (o) window.speechSynthesis.speak = (u) => { window.__spoken.push({ t: u.text, l: u.lang, v: u.voice && u.voice.name }); }; });
    await p.goto(`${SITE}/web/listener/?room=${code}&lang=${lang}&relay=127.0.0.1:8787`);
    await p.waitForFunction(() => document.getElementById('room-input').value.length === 6);
    await p.click('#btn-join');
    await p.waitForSelector('#chat-screen', { state: 'visible', timeout: 8000 });
    guests.push({ lang, p });
  }
  log('7 손님 3 붙음', 'ok');
  await host.waitForTimeout(800);
  await host.click('#btnNext');
  await host.waitForTimeout(1500);
  for (const g of guests) {
    const lines = await g.p.$$eval('#chat-list .msg-line', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 140)));
    const tts = await g.p.textContent('#btn-toggle-tts');
    log(`8 손님 ${g.lang} 줄`, JSON.stringify(lines) + ' | 소리단추=' + tts.trim());
  }
  // 소리 켜고 다음
  for (const g of guests) await g.p.click('#btn-toggle-tts');
  await host.click('#btnNext');
  await host.waitForTimeout(1500);
  for (const g of guests) {
    const sp = await g.p.evaluate(() => window.__spoken.slice());
    log(`9 손님 ${g.lang} 읽은 것`, JSON.stringify(sp));
  }
  // 🎤 줄 흉내: 원고 밖 말
  const sent = await host.evaluate(() => (typeof sendSpokenLine === 'function') ? sendSpokenLine('오늘 점심은 12시에 먹습니다') : 'no fn');
  await host.waitForTimeout(1500);
  log('10 🎤 줄 보냄', sent);
  for (const g of guests) {
    const last = await g.p.$$eval('#chat-list .msg-line', els => { const e = els[els.length - 1]; return e ? e.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) : ''; });
    log(`11 손님 ${g.lang} 마지막 줄`, last);
  }
  fs.writeFileSync(S + '/e2e.out', out.join('\n'));
  await b.close();
})().catch(e => { console.log('ERR', e.message); fs.writeFileSync(S + '/e2e.out', out.join('\n') + '\nERR ' + e.message); process.exit(1); });
