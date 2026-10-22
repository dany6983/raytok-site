/**
 * 가짜 번역 상류 — **로컬 끝까지 시험**에서만 쓴다 (NOW B 5 · 결정장부 46)
 *
 * 로컬 릴레이에는 번역기가 없다(`GOOGLE_TRANSLATE_KEY` 가 없으면 기본 길이 500 을 던지고,
 * `mock` 엔진은 관리자만 쓴다). 그러면 손님은 「번역 안 됨」만 받고 **번역을 잴 수 없다.**
 *
 * 그래서 **운영 상류와 같은 규약**으로 답하는 작은 쪽을 띄운다(D-11 — 가짜가 느슨하면
 * 시험이 거짓말한다). 구글 v2 규약 그대로:
 *   요청  POST ?key=…  { q: [...], target, source?, format }
 *   답    { data: { translations: [ { translatedText } ] } }
 * 글자 앞에 `[<언어>]` 를 붙여 **어느 언어로 갔는지** 눈으로 가린다.
 *
 * 쓰는 법: node scripts/e2e-fake-upstream.cjs 8099
 * 릴레이에는 `.dev.vars` 로 넘긴다(그 파일은 gitignore 다):
 *   GOOGLE_TRANSLATE_KEY=local-e2e
 *   GOOGLE_TRANSLATE_URL=http://127.0.0.1:8099/translate
 */
const http = require('http');
const PORT = Number(process.argv[2] || 8099);
let calls = 0;

http.createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let d = {};
    try { d = JSON.parse(body || '{}'); } catch (_) {}
    /* 운영 규약을 **그대로** 지킨다 — 배열이 아니면 400 (느슨하면 시험이 거짓말한다) */
    if (!Array.isArray(d.q)) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'q must be an array' } }));
    }
    calls += 1;
    const target = String(d.target || '?');
    console.log(`[fake-upstream] #${calls} target=${target} n=${d.q.length} chars=${d.q.join('').length}`);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      data: { translations: d.q.map((t) => ({ translatedText: `[${target}] ${t}` })) }
    }));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`[fake-upstream] ${PORT} 에서 듣는다 (구글 v2 규약)`));
