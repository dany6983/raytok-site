// samples/mock_relay.js — 시험용 목업 릴레이 + 정적 파일 서버 (live_test.js · end_test.js 가 같이 쓴다).
// relay/src/room.js 와 같은 규칙으로 돈다 — 가짜가 실제와 다르면 시험이 거짓말을 한다:
//   · 호스트 → 청취자 전원에 그대로, 청취자 → 호스트에게만. 링버퍼(최근 500)는 새 청취자에게 먼저 다시 보낸다.
//   · 참석 집계 att 는 숫자만, 호스트에게만. 한 번 본 언어는 now 0 으로도 langs 에 남는다. 끝난 방은 att 를 보내지 않는다.
//   · end:1 → 링버퍼를 끝 표시 하나(숫자 요약만)로 바꾸고 집계를 지우고, 5초 뒤 청취자 소켓을 닫는다.
//   · __ping 은 보낸 쪽에 그대로 되돌린다.
// HTTP: /license/verify · /translate(vi 는 일부러 503) · /room(이용권 Bearer) + 저장소 정적 파일.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { verifyCode } = require('../relay/src/mint-core.js');

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'application/javascript', '.png': 'image/png' };

/*
 * `roomTranslate: false` — **가짜 방이 번역하지 않게** 한다. 방 메시지(`tr`·`script_tr`·
 * `no_tr`)를 손으로 넣어 **청취 페이지가 그것을 어떻게 다루나**를 보는 시험을 위한 문이다
 * (`samples/listener_room_tr_test.js`). 그런 시험에서 가짜까지 번역하면 손으로 넣은 것과
 * 가짜가 넣은 것이 섞여 **무엇을 보고 통과했는지** 못 가른다. 기본은 **켬**이다 — 운영이
 * 그렇게 돌아가므로, 끄는 것은 그 까닭을 쓴 시험만 한다(D-11).
 */
function createMockRelay({ root, endCloseMs = 5000, roomTranslate: doRoomTr = true } = {}) {
  const rooms = new Map();        // code -> room
  const hostReceived = [];        // 호스트가 /ws 로 보낸 메시지(해석한 것, 방 구분 없이 시간 순)
  const httpLog = [];             // 릴레이 API 로 온 요청 "METHOD /path"
  const counters = { translate: 0, roomTranslate: 0 };   // HTTP /translate · 방이 한 번역(B 3)
  const licStore = new Map();
  const batchStore = new Map();
  const mockPortonePayments = new Map();
  let roomSeq = 0;

  function newRoom(kind) {
    const code = 'ABC' + (123 + roomSeq++);
    const token = 'host_tok_' + Math.random().toString(36).slice(2);
    const room = {
      code, token, kind, ring: [], received: [],
      hosts: new Set(), listeners: new Map(), att: null, ended: false,
      askQueue: [], askSeq: 0, activeAsk: null, askHistory: [],
      script: new Map(), trCache: new Map()      // 올려 둔 원고 원문 · 산 번역문 (B 3·B 4)
    };   // received = 이 방의 호스트가 보낸 메시지
    rooms.set(code, room);
    return room;
  }

  /* ── 방이 번역한다 (room.js roomTrFromHost·roomTrFlush — site NOW B 3·B 4, 2026-10-21) ──
   *
   * 왜 가짜에도 넣나: 10-21 에 강사 화면이 `script.trans` 를 **그만 보내게** 됐다(장부 43).
   * 번역해서 보내는 것은 이제 **방**이다. 이 가짜가 그 일을 안 하면, 손님 화면을 보는 시험
   * 전부가 **번역이 없는 화면**을 정상으로 알게 된다 — 가짜가 운영보다 느슨해지는 그 사고다
   * (D-11). 그래서 같은 길을 같은 모양으로 넣는다:
   *   원문은 그대로 전원에게 → 언어마다 한 번 번역 → 그 언어 손님에게만 `tr`/`script_tr`
   *   실패하면 `no_tr` (「대기 중」에 갇히지 않게)
   * `vi` 는 /translate 가 503 이므로 여기서도 실패한다 — R-15 시험이 그걸 본다.
   */
  function trOne(text, target) {
    /* ★ 세는 칸을 **따로** 둔다. `counters.translate` 는 **HTTP `/translate` 를 누가 불렀나**를
       세는 칸이고, 거기에 방 번역을 더하면 "청취 페이지가 번역을 청하지 않는다"(RULE: P-16 ①)
       를 보는 시험이 **방이 일한 것을 손님이 청한 것으로** 읽는다(10-21 에 `w_t_test` 가 그렇게
       붉었다). 방이 쓴 돈은 이 칸에서 센다. */
    counters.roomTranslate++;
    if (target === 'vi') return null;           // 위 /translate 와 **같은 규칙**
    return `[${target}] ` + text;
  }

  function roomTranslate(room, parsed) {
    if (!parsed || parsed.end || parsed.hello || parsed.welcome) return;
    const srcLang = parsed.srcLang || parsed.src_lang || 'ko';
    let item = null;
    if (parsed.kind === 'script' && typeof parsed.src === 'string' && parsed.src.trim()) {
      item = { script: 1, para: Number(parsed.para) || 0, text: parsed.src };
    } else if (parsed.kind === 'question' && typeof parsed.src === 'string' && parsed.src.trim() && parsed.id) {
      /* 손님 질문도 방이 번역한다 (정본 §3 4단계) — 운영 `relay/src/room.js` 의
         `roomTrAsk` 와 **같은 규칙**이어야 한다(D-11: 가짜가 느슨하면 시험이 거짓말한다) */
      item = { ask: String(parsed.id), text: parsed.src };
    } else if (parsed.kind === 'answer' && typeof parsed.src === 'string' && parsed.src.trim() && parsed.id) {
      item = { ask: String(parsed.id), text: parsed.src, answer: true };
    } else if (!parsed.kind && !parsed.pending && typeof parsed.text === 'string'
               && parsed.text.trim() && parsed.seq !== undefined) {
      item = { seq: parsed.seq, text: parsed.text };
    }
    if (!item) return;
    const have = {};
    for (const [k, v] of Object.entries(parsed.trans || {})) {
      if (typeof v === 'string' && v.trim()) have[String(k).toLowerCase()] = 1;   // 강사가 이미 보낸 칸은 안 산다
    }
    const seen = new Set();
    for (const [ws, mark] of room.listeners) {
      const lang = String((mark && mark.lang) || '').trim();
      const key = lang.toLowerCase();
      if (!lang || lang === '?' || key === String(srcLang).toLowerCase() || have[key]) continue;
      if (seen.has(key)) { /* 같은 언어 손님이 여럿 — 번역은 한 번, 보내기만 여러 번 */ }
      /* 줄 이름 — 질문·원고 문단·🎤 줄을 **갈라 센다**(운영 `doneKey` 와 같은 꼴).
         섞으면 질문 3번 번역이 원고 3번 문단에 붙는다. */
      /* 질문 이름에 **글자 길이**도 넣는다 — 운영 `doneKey` 가 글자의 표를 넣는 것과 같은
         까닭이다(한 질문의 글자가 손들 때·말할 때 두 번 온다). 가짜가 느슨하면 안 된다(D-11). */
      const prefix = item.answer ? 'ans' : 'q';
      const who = item.ask ? prefix + item.ask + '#' + String(item.text).length
        : item.script ? 'p' + item.para : 's' + item.seq;
      const text = seen.has(key) ? room.trCache.get(key + '|' + who) : trOne(item.text, lang);
      seen.add(key);
      room.trCache.set(key + '|' + who, text);
      const msg = text
        ? (item.ask
            ? (item.answer
                ? { kind: 'answer_tr', id: item.ask, trans: { [lang]: text } }
                : { kind: 'question_tr', id: item.ask, trans: { [lang]: text } })
            : item.script ? { kind: 'script_tr', para: item.para, trans: { [lang]: text } }
              : { seq: item.seq, tr: { [lang]: text } })
        : (item.ask
            ? (item.answer
                ? { kind: 'answer_tr', id: item.ask, trans: {}, no_tr: 1, why: 'http_503' }
                : { kind: 'question_tr', id: item.ask, trans: {}, no_tr: 1, why: 'http_503' })
            : item.script ? { kind: 'script_tr', para: item.para, trans: {}, no_tr: 1, why: 'http_503' }
              : { seq: item.seq, no_tr: 1, why: 'http_503' });
      try { ws.send(JSON.stringify(msg)); } catch (_) {}
    }
  }

  // ── 참석 집계 (room.js attInit·attLang·attSnapshot·attJoin·attSetLang·attLeave·attEnd) ──
  function attInit(room) {
    if (!room.att) room.att = { joined: 0, max: 0, langs: {} };
    return room.att;
  }
  function attLang(room, code) {
    const a = attInit(room);
    const k = String(code || '').trim() || '?';
    if (!a.langs[k]) a.langs[k] = { max: 0, sec: 0 };
    return a.langs[k];
  }
  function attSnapshot(room, now = Date.now()) {
    const a = attInit(room);
    const byLang = {};
    const liveSec = {};
    let n = 0;
    for (const m of room.listeners.values()) {
      const k = m.lang || '?';
      byLang[k] = (byLang[k] || 0) + 1;
      liveSec[k] = (liveSec[k] || 0) + Math.max(0, Math.floor((now - m.at) / 1000));
      n++;
    }
    if (n > a.max) a.max = n;
    for (const k of Object.keys(byLang)) {
      const L = attLang(room, k);
      if (byLang[k] > L.max) L.max = byLang[k];
    }
    const langs = {};
    for (const k of Object.keys(a.langs)) {
      langs[k] = { now: byLang[k] || 0, max: a.langs[k].max, min: Math.floor((a.langs[k].sec + (liveSec[k] || 0)) / 60) };
    }
    return { att: 1, now: n, max: a.max, joined: a.joined, langs };
  }
  function attSend(room, ws) {
    if (room.ended) return;
    const msg = JSON.stringify(attSnapshot(room));
    for (const h of (ws ? [ws] : room.hosts)) { try { h.send(msg); } catch (_) {} }
  }
  function attJoin(room, ws) {
    attInit(room).joined++;
    room.listeners.set(ws, { lang: null, at: Date.now() });
    attLang(room, '?');
    attSend(room);
  }
  function attSetLang(room, ws, lang) {
    const now = Date.now();
    const m = room.listeners.get(ws);
    if (!m) return;
    const code = String(lang || '').trim() || '?';
    if (m.lang === code) return;
    attLang(room, m.lang || '?').sec += Math.max(0, Math.floor((now - m.at) / 1000));
    attLang(room, code);
    m.lang = code;
    m.at = now;
    attSend(room);
  }
  function attLeave(room, ws) {
    const m = room.listeners.get(ws);
    if (!m) return;
    if (room.att) attLang(room, m.lang || '?').sec += Math.max(0, Math.floor((Date.now() - m.at) / 1000));
    room.listeners.delete(ws);
    if (room.att) attSend(room);
  }

  // end:1 — dropLines: 끝 표시 한 줄만(숫자 요약만) 남긴다
  function endRoom(room, summary) {
    room.ended = true;
    room.att = null;
    const mark = { end: 1 };
    if (summary && typeof summary === 'object') {
      const kept = {};
      for (const k of ['lines', 'minutes', 'joined_max']) if (Number.isFinite(summary[k])) kept[k] = summary[k];
      if (Object.keys(kept).length > 0) mark.summary = kept;
    }
    room.ring = [JSON.stringify(mark)];
    setTimeout(() => {
      for (const l of [...room.listeners.keys()]) { try { l.close(1000, 'end'); } catch (_) {} }
    }, endCloseMs).unref();
  }

  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const readBody = (cb) => { let body = ''; req.on('data', c => body += c); req.on('end', () => cb(JSON.parse(body || '{}'))); };

    if (url.pathname === '/license/verify' && req.method === 'POST') {
      httpLog.push('POST /license/verify');
      return readBody((data) => {
        if (data.token && data.token.includes('valid')) json(200, { valid: true, payload: { sub: 'instructor_1', flags: 12, exp: Math.floor(Date.now() / 1000) + 86400 } });
        else json(401, { valid: false, message: 'Invalid signature' });
      });
    }

    if (url.pathname === '/translate' && req.method === 'POST') {
      httpLog.push('POST /translate');
      counters.translate++;
      return readBody((data) => {
        /* ★ 운영 릴레이와 **같은 규칙**이다(D-11 — 가짜가 느슨하면 시험이 거짓말을 한다).
           2026-10-19 에 이 가짜가 글자 q 를 받아 주고 `translatedText` 로 답해서,
           강사 화면이 **운영에서는 한 번도 안 되는 모양**으로 부르고 있는 것을 시험이 못 봤다.
           운영: q 는 배열(최대 50개·합계 5000자) · 답은 { t: [...] }  (relay/src/index.js) */
        if (!Array.isArray(data.q)) {
          return json(400, { error: 'bad_request', message: 'q must be an array', why: 'q_not_array' });
        }
        if (data.q.length > 50) {
          return json(400, { error: 'bad_request', message: 'q cannot exceed 50 items', why: 'q_too_many' });
        }
        const chars = data.q.reduce((a, t) => a + String(t == null ? '' : t).length, 0);
        if (chars > 5000) {
          return json(400, { error: 'too_long', message: 'Total characters in q cannot exceed 5000', why: 'chars_exceed_5000' });
        }
        // vi 는 일부러 실패시킨다(503) — 그 언어는 trans 에서 빠져야 한다(R-15)
        if (data.target === 'vi') return json(503, {});
        json(200, { t: data.q.map((t) => `[${data.target}] ` + t) });
      });
    }

    if (url.pathname === '/room' && req.method === 'POST') {
      httpLog.push('POST /room');
      const auth = req.headers.authorization || '';
      if (!auth.includes('valid')) return json(401, { error: 'unauthorized' });
      return readBody((data) => {
        const room = newRoom(data.kind);
        room.raw = !!data.raw;
        json(200, { code: room.code, host_token: room.token, raw: room.raw ? 1 : 0 });
      });
    }

    if (url.pathname === '/license/redeem' && req.method === 'POST') {
      httpLog.push('POST /license/redeem');
      return readBody((data) => {
        const { code, batch, deviceId } = data;
        if (!deviceId) return json(400, { error: 'bad_request', message: 'deviceId is required' });

        // A. 묶음 QR
        if (batch) {
          const rawId = String(batch).replace(/^b_/, '');
          let b = batchStore.get(rawId);
          if (!b) return json(404, { error: 'unknown_batch' });
          if (Date.now() > b.validTo) return json(401, { error: 'expired' });
          const existing = b.used.find(u => u.deviceId === deviceId);
          if (existing) {
            return json(200, { valid: true, activatedAt: existing.activatedAt, expiresAt: existing.expiresAt, seats: b.seats, used: b.used.length });
          }
          if (b.used.length >= b.seats) {
            return json(401, { error: 'no_seats', message: 'All seats taken', seats: b.seats, used: b.used.length });
          }
          const activatedAt = Date.now();
          const expiresAt = activatedAt + (b.days || 1) * 86400 * 1000;
          b.used.push({ deviceId, activatedAt, expiresAt });
          return json(200, { valid: true, activatedAt, expiresAt, seats: b.seats, used: b.used.length });
        }

        // B. 개별 코드
        if (code) {
          const v = verifyCode(code);
          if (!v.ok) return json(401, { error: v.why || 'bad_sig' });
          const codeHash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
          let rec = licStore.get(codeHash);
          if (rec) {
            if (rec.deviceId === deviceId) {
              return json(200, { valid: true, activatedAt: rec.activatedAt, expiresAt: rec.expiresAt, flags: rec.flags, devices: { count: 1, limit: 1 } });
            }
            return json(401, { error: 'too_many_devices', count: 1, limit: 1 });
          }
          const activatedAt = Date.now();
          /* 정본 [3..4] 기간(일): 있으면 등록 시각부터 센다, 0 이면 절대 만료(exp)만 (앱 effectiveExp 와 같은 셈) */
          const days = Number(v.claims.days) || 0;
          const expiresAt = days ? Math.min(activatedAt + days * 86400 * 1000, v.claims.exp * 1000) : v.claims.exp * 1000;
          rec = { deviceId, activatedAt, expiresAt, flags: v.claims.flags || 0x01 };
          licStore.set(codeHash, rec);
          return json(200, { valid: true, activatedAt, expiresAt, flags: rec.flags, devices: { count: 1, limit: 1 } });
        }
        return json(400, { error: 'bad_request' });
      });
    }

    if (url.pathname.startsWith('/license/batch') && req.method === 'GET') {
      httpLog.push('GET /license/batch');
      let rawId = url.pathname.slice('/license/batch/'.length);
      if (!rawId || rawId === 'batch') rawId = url.searchParams.get('batch') || '';
      const b = batchStore.get(rawId.replace(/^b_/, ''));
      if (!b) return json(404, { error: 'unknown_batch' });
      const now = Date.now();
      const todayCount = (b.used || []).filter(u => u.activatedAt >= now - 86400 * 1000).length;
      return json(200, {
        batchId: b.batchId,
        seats: b.seats,
        usedCount: b.used.length,
        todayCount,
        summaryText: `오늘 ${todayCount}명 / 총 ${b.seats}명`
      });
    }

    if (url.pathname === '/desk/sessions' && req.method === 'GET') {
      httpLog.push('GET /desk/sessions');
      return json(200, [
        { id: 'desk_sess_1', code: '889900', host: 'Desk-PC-Host', started: Date.now() - 3600000, count: 2 }
      ]);
    }

    if (url.pathname.startsWith('/payments/') && req.method === 'GET') {
      httpLog.push('GET ' + url.pathname);
      const pId = url.pathname.slice('/payments/'.length);
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('PortOne ')) {
        return json(401, { message: 'Unauthorized: missing PortOne secret' });
      }
      const paymentRecord = mockPortonePayments.get(pId);
      if (!paymentRecord) {
        return json(404, { message: 'Payment not found' });
      }
      return json(200, paymentRecord);
    }

    // 정적 파일: /web/... , /assets/...
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });

  const wss = new WebSocketServer({ noServer: true });
  srv.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    const code = (url.searchParams.get('room') || '').toUpperCase();
    const role = url.searchParams.get('role');
    const room = rooms.get(code);
    if (!room) { socket.destroy(); return; }
    if (role === 'host' && url.searchParams.get('token') !== room.token) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (role === 'host') {
        room.hosts.add(ws);
        attSend(room, ws);
        if (room.askQueue && room.askQueue.length) {
          try { ws.send(JSON.stringify({ kind: 'ask_queue', queue: room.askQueue })); } catch (_) {}
        }
        if (room.activeAsk) {
          try { ws.send(JSON.stringify({ kind: 'ask_active', ...room.activeAsk })); } catch (_) {}
        }
        ws.on('message', (raw) => {
          const s = raw.toString();
          if (s.includes('__ping')) { ws.send(s); return; }
          let parsed = null;
          try { parsed = JSON.parse(s); } catch (_) {}
          if (parsed && (parsed.kind === 'grant' || parsed.kind === 'ask_grant')) {
            if (room.activeAsk) {
              try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'already_active' })); } catch (_) {}
              return;
            }
            const target = (room.askQueue || []).find(q => q.id === parsed.id);
            if (target) {
              room.activeAsk = {
                id: target.id, seq: target.seq, name: target.name, lang: target.lang,
                text: target.text, src: target.src || target.text, trans: parsed.trans || {}, grantedAt: Date.now()
              };
              if (room.askHistory) {
                const hItem = room.askHistory.find(h => h.id === target.id);
                if (hItem) hItem.status = 'granted';
              }
              const grantWireMsg = JSON.stringify({
                kind: 'grant', id: target.id, seq: target.seq, name: target.name, lang: target.lang, max_sec: parsed.max_sec || 90, at: room.activeAsk.grantedAt
              });
              const questionWireMsg = JSON.stringify({
                kind: 'question', id: target.id, seq: target.seq, name: target.name, src: target.src || target.text, srcLang: target.lang, trans: parsed.trans || {}, at: room.activeAsk.grantedAt
              });
              const activeMsg = JSON.stringify({ kind: 'ask_active', ...room.activeAsk });
              for (const l of room.listeners.keys()) {
                try {
                  l.send(grantWireMsg);
                  l.send(questionWireMsg);
                  l.send(activeMsg);
                } catch (_) {}
              }
              for (const h of room.hosts) {
                try {
                  h.send(grantWireMsg);
                  h.send(questionWireMsg);
                  h.send(activeMsg);
                } catch (_) {}
              }
              /* 정본 §3 4단계 — 글자로 적은 질문도 각자 자기 언어로(운영과 같은 자리) */
              if (doRoomTr) roomTranslate(room, JSON.parse(questionWireMsg));
            }
            return;
          }
          if (parsed && (parsed.kind === 'revoke' || parsed.kind === 'ask_close')) {
            const askId = parsed.id || (room.activeAsk && room.activeAsk.id);
            const reason = parsed.reason || 'host_done';
            let askSeq = undefined;
            room.askQueue = (room.askQueue || []).filter(q => q.id !== askId);
            if (room.askHistory) {
              const hItem = room.askHistory.find(h => h.id === askId);
              if (hItem) {
                hItem.status = 'closed';
                hItem.reason = reason;
                hItem.closedAt = Date.now();
                askSeq = hItem.seq;
              }
            }
            room.activeAsk = null;
            const revokeWireMsg = JSON.stringify({ kind: 'revoke', id: askId, seq: askSeq, reason: reason, at: Date.now() });
            const endMsg = JSON.stringify({ kind: 'ask_ended', id: askId, reason: reason, seq: askSeq });
            for (const l of room.listeners.keys()) {
              try {
                l.send(revokeWireMsg);
                l.send(endMsg);
              } catch (_) {}
            }
            for (const h of room.hosts) {
              try {
                h.send(revokeWireMsg);
                h.send(endMsg);
              } catch (_) {}
            }
            const qMsgHost = JSON.stringify({ kind: 'ask_queue', queue: room.askQueue, history: room.askHistory });
            for (const h of room.hosts) { try { h.send(qMsgHost); } catch (_) {} }
            const qMsgList = JSON.stringify({
              kind: 'ask_queue', count: room.askQueue.length,
              queue: room.askQueue.map(q => ({ id: q.id, seq: q.seq, name: q.name, lang: q.lang }))
            });
            for (const l of room.listeners.keys()) { try { l.send(qMsgList); } catch (_) {} }
            return;
          }
          /* 원고 원문 올리기(`script_src`)는 **손님에게 보내지 않는다** — 방이 보관만 한다(B 4) */
          if (parsed && parsed.kind === 'script_src') {
            for (const q of parsed.paras || []) {
              if (q && typeof q.src === 'string') room.script.set(Number(q.para) || 0, q.src);
            }
            hostReceived.push(parsed); room.received.push(parsed);
            return;
          }
          room.ring.push(s);
          if (room.ring.length > 500) room.ring.shift();
          for (const l of room.listeners.keys()) { try { l.send(s); } catch (_) {} }
          if (parsed) { hostReceived.push(parsed); room.received.push(parsed); }
          /* 원문이 간 **뒤에** 번역을 보낸다 — 늦어도 남는 쪽(R-15) */
          if (parsed && doRoomTr) roomTranslate(room, parsed);
          if (parsed && parsed.end) endRoom(room, parsed.summary);
        });
        ws.on('close', () => room.hosts.delete(ws));
      } else {
        for (const m of room.ring) { try { ws.send(m); } catch (_) {} }
        if (!room.ended) attJoin(room, ws);
        else room.listeners.set(ws, { lang: null, at: Date.now() });
        if (room.askQueue && room.askQueue.length) {
          try {
            ws.send(JSON.stringify({
              kind: 'ask_queue', count: room.askQueue.length,
              queue: room.askQueue.map(q => ({ id: q.id, seq: q.seq, name: q.name, lang: q.lang }))
            }));
          } catch (_) {}
        }
        if (room.activeAsk) {
          try { ws.send(JSON.stringify({ kind: 'ask_active', ...room.activeAsk })); } catch (_) {}
        }
        ws.on('message', (raw) => {
          const s = raw.toString();
          if (s.includes('__ping')) { ws.send(s); return; }
          let p = null;
          try {
            p = JSON.parse(s);
            if (p && p.hello && p.lang && room.att) attSetLang(room, ws, p.lang);
          } catch (_) {}
          if (p && (p.kind === 'ask' || p.kind === 'ask_req')) {
            if (p.trans || p.tr) {
              try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'p14_participant_translation_forbidden' })); } catch (_) {}
              return;
            }
            room.askSeq = (room.askSeq || 0) + 1;
            const askItem = {
              id: p.id || ('q_' + room.askSeq + '_' + Math.random().toString(36).slice(2, 6)),
              seq: room.askSeq,
              name: p.name || '익명',
              lang: p.lang || 'ko',
              text: p.text || p.src || '',
              src: p.src || p.text || '',
              at: Date.now(),
              status: 'requested'
            };
            if (!room.askQueue) room.askQueue = [];
            if (!room.askHistory) room.askHistory = [];
            if (!room.askOwner) room.askOwner = new Map();
            room.askQueue.push(askItem);
            room.askHistory.push({ ...askItem });
            room.askOwner.set(ws, askItem.id);   // 진짜 릴레이의 소켓 쪽지(askId) 와 같은 몫
            const wireAskMsg = JSON.stringify({
              kind: 'ask', id: askItem.id, seq: askItem.seq, name: askItem.name, lang: askItem.lang, src: askItem.src, at: askItem.at
            });
            const hostMsg = JSON.stringify({ kind: 'ask_queue', queue: room.askQueue, history: room.askHistory });
            for (const h of room.hosts) {
              try {
                h.send(wireAskMsg);
                h.send(hostMsg);
              } catch (_) {}
            }
            const listMsg = JSON.stringify({
              kind: 'ask_queue', count: room.askQueue.length,
              queue: room.askQueue.map(q => ({ id: q.id, seq: q.seq, name: q.name, lang: q.lang }))
            });
            for (const l of room.listeners.keys()) {
              try {
                l.send(wireAskMsg);
                l.send(listMsg);
              } catch (_) {}
            }
            return;
          }
          // 7번 마이크 질문 — relay/src/room.js 의 가지와 같은 문을 둔다(D-11).
          if (p && p.kind === 'question') {
            if (p.trans || p.tr) {
              try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'p14_participant_translation_forbidden' })); } catch (_) {}
              return;
            }
            const mine = room.askOwner && room.askOwner.get(ws);
            if (!room.activeAsk || !p.id || p.id !== room.activeAsk.id || mine !== p.id) {
              try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'not_granted' })); } catch (_) {}
              return;
            }
            const spoken = typeof p.src === 'string' ? p.src.trim() : '';
            if (!spoken) return;                       // §20 빈 답은 버린다
            room.activeAsk.src = spoken;
            room.activeAsk.text = spoken;
            if (room.askHistory) {
              const h = room.askHistory.find(x => x.id === p.id);
              if (h) { h.src = spoken; h.text = spoken; h.spokenAt = Date.now(); }
            }
            const spokenMsg = JSON.stringify({
              kind: 'question', id: room.activeAsk.id, seq: room.activeAsk.seq,
              name: room.activeAsk.name, src: spoken,
              srcLang: room.activeAsk.lang || p.srcLang || 'ko', at: Date.now()
            });
            for (const h of room.hosts) { try { h.send(spokenMsg); } catch (_) {} }
            for (const l of room.listeners.keys()) { try { l.send(spokenMsg); } catch (_) {} }
            /* 정본 §3 4단계 — 같은 질문을 각자 자기 언어로(운영: `roomTrAsk`) */
            if (doRoomTr) roomTranslate(room, JSON.parse(spokenMsg));
            return;
          }
          for (const h of room.hosts) { try { h.send(s); } catch (_) {} }
        });
        ws.on('close', () => { attLeave(room, ws); if (room.askOwner) room.askOwner.delete(ws); });
      }
    });
  });

  return {
    srv, rooms, hostReceived, httpLog, counters, newRoom,
    listen: () => new Promise(r => srv.listen(0, () => r(srv.address().port))),
    close: () => { try { wss.close(); } catch (_) {} srv.close(); }
  };
}

module.exports = { createMockRelay };
