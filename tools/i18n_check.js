// 번역 사전 점검: 소개 페이지의 한국어 원문 가운데 사전(assets/i18n/<언어>.json)에 없는 문장을 찾는다.
// 실행(저장소 루트, playwright 필요):  node tools/i18n_check.js          → 언어별로 빠진 문장 수와 목록
//                                     node tools/i18n_check.js --keys   → 원문 목록만 JSON 으로 출력
//                                     node tools/i18n_check.js --claims → 특허·효능 주장 문장과 번역을 나란히 출력(사람 검토용)
// 금지표현은 2026-10-11 대표님 지시(`claude/RayTok-지시_창조우선_금지어폐지_1011.md`)로 **차단하지 않는다.**
//   "자꾸 말을 만들고 장벽을 쌓지 마. 그냥 나한테 노티스만 주고 나머지는 내가 알아서 할게."
//   → 발견하면 「통지」로 찍기만 하고 종료 코드에 반영하지 않는다. 쓸지 말지는 마케팅과 대표님이 정한다.
// 실패(종료 코드 1)로 남는 것은 기계가 틀렸다고 말할 수 있는 둘뿐이다: 빠진 문장 · 번호표(<1>) 불일치.
// 원문을 고친 뒤에는 이 점검에서 빠진 문장이 0 이 되도록 사전을 같이 고친다. 사전에 없는 문장은 한국어로 남는다.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname), PAGES = ['/', '/field/', '/tour/', '/museum/', '/ows/', '/student/'], LANGS = ['en', 'zh', 'ja', 'vi'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  const { chromium } = require('playwright');
  await new Promise(ok => srv.listen(0, ok));
  const base = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const keys = [], seen = new Set();
  for (const u of PAGES) {
    const p = await b.newPage(); await p.goto(base + u, { waitUntil: 'load' });
    for (const k of await p.evaluate(() => window.__i18nKeys())) if (!seen.has(k)) { seen.add(k); keys.push(k); }
    await p.close();
  }
  await b.close(); srv.close();
  if (process.argv.includes('--keys')) { console.log(JSON.stringify(keys, null, 1)); return; }
  // 아래 목록은 금지가 아니라 **통지용**이다 (2026-10-11 지시). 걸리면 「통지」로 찍고 지나간다.
  // 참고로 둔 뜻: "위변조 검출" 은 tamper-evident 다. tamper-proof(변조 불가)가 아니다.
  const BAN = {
    ko: ['동시통역', '세계 최초', '유일', '특허 기술', '특허받은', '독자 특허', '고칠 수 없는', '위변조 방지', '변조 불가', '®'],
    en: ['simultaneous interpret', 'patented', 'patent-protected', "world's first", 'world-first', 'the only', 'tamper-proof', 'tamperproof', 'tamper proof', 'unalterable', 'cannot be altered', "can't be altered", 'immutable', 'steriliz', 'guarantee', '100%', '®'],
    zh: ['同声传译', '同传', '专利技术', '已获专利', '全球首', '世界首创', '唯一', '防篡改', '不可篡改', '无法篡改', '无法修改', '保证', '100%', '®'],
    ja: ['同時通訳', '特許技術', '特許取得', '世界初', '唯一', '改ざん防止', '改ざん不可', '改ざんできない', '書き換えられない', '殺菌', '保証', '100%', '®'],
    vi: ['dịch cabin', 'phiên dịch đồng thời', 'dịch song song', 'độc quyền sáng chế', 'được cấp bằng sáng chế', 'đầu tiên trên thế giới', 'duy nhất', 'không thể chỉnh sửa', 'không thể sửa', 'chống giả mạo', 'chống sửa đổi', 'đảm bảo', 'cam kết', '100%', '®'],
  };
  const CLAIM = /위변조|검출|기록|정확|특허|억제|저장|밖으로|살균|인정|증빙/;   // 특허·효능 주장 문장
  const hit = (s, l) => BAN[l].filter(w => s.toLowerCase().includes(w.toLowerCase()));
  let bad = 0;
  let notices = 0;
  for (const k of keys) { const h = hit(k, 'ko'); if (h.length) { console.log('통지(ko) ' + h.join(',') + ' : ' + k); notices++; } }
  if (process.argv.includes('--claims')) {   // 사람이 눈으로 볼 목록: 주장 문장과 네 언어 번역
    const D = {}; for (const l of LANGS) D[l] = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'i18n', l + '.json'), 'utf8'));
    for (const k of keys.filter(k => CLAIM.test(k))) { console.log('KO ' + k); for (const l of LANGS) console.log('   ' + l + ' ' + D[l][k]); }
    return;
  }
  const tags = s => (s.match(/<\/?\d+>|<br>/g) || []).sort().join('');
  for (const l of LANGS) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'i18n', l + '.json'), 'utf8'));
    const miss = keys.filter(k => d[k] == null), wrong = keys.filter(k => d[k] != null && tags(k) !== tags(d[k]));
    const extra = Object.keys(d).filter(k => !seen.has(k));
    const banned = keys.filter(k => d[k] != null && hit(d[k], l).length);
    console.log(`${l}: 원문 ${keys.length} · 빠짐 ${miss.length} · 번호표 불일치 ${wrong.length} · 통지 ${banned.length} · 안 쓰는 항목 ${extra.length}`);
    miss.concat(wrong).forEach(k => console.log('   - ' + k));
    banned.forEach(k => console.log('   통지 ' + hit(d[k], l).join(',') + ' : ' + d[k]));
    notices += banned.length;
    bad += miss.length + wrong.length;   // 통지는 실패로 세지 않는다
  }
  if (notices) console.log(`\n통지 ${notices}건 — 막지 않는다. 쓸지 말지는 마케팅과 대표님이 정한다 (지시_창조우선_금지어폐지_1011).`);
  process.exit(bad ? 1 : 0);
})();
