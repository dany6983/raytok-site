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
const { WebSocketServer } = require('ws');

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'application/javascript', '.png': 'image/png' };

function createMockRelay({ root, endCloseMs = 5000 } = {}) {
  const rooms = new Map();        // code -> room
  const hostReceived = [];        // 호스트가 /ws 로 보낸 메시지(해석한 것, 방 구분 없이 시간 순)
  const httpLog = [];             // 릴레이 API 로 온 요청 "METHOD /path"
  const counters = { translate: 0 };
  let roomSeq = 0;

  function newRoom(kind) {
    const code = 'ABC' + (123 + roomSeq++);
    const token = 'host_tok_' + Math.random().toString(36).slice(2);
    const room = { code, token, kind, ring: [], received: [], hosts: new Set(), listeners: new Map(), att: null, ended: false };   // received = 이 방의 호스트가 보낸 메시지
    rooms.set(code, room);
    return room;
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
        // vi 는 일부러 실패시킨다(503) — 그 언어는 trans 에서 빠져야 한다(R-15)
        if (data.target === 'vi') return json(503, {});
        json(200, { translatedText: `[${data.target}] ` + data.q });
      });
    }

    if (url.pathname === '/room' && req.method === 'POST') {
      httpLog.push('POST /room');
      const auth = req.headers.authorization || '';
      if (!auth.includes('valid')) return json(401, { error: 'unauthorized' });
      return readBody((data) => {
        const room = newRoom(data.kind);
        json(200, { code: room.code, host_token: room.token });
      });
    }

    if (url.pathname === '/desk/sessions' && req.method === 'GET') {
      httpLog.push('GET /desk/sessions');
      return json(200, [
        { id: 'desk_sess_1', code: '889900', host: 'Desk-PC-Host', started: Date.now() - 3600000, count: 2 }
      ]);
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
        ws.on('message', (raw) => {
          const s = raw.toString();
          if (s.includes('__ping')) { ws.send(s); return; }
          room.ring.push(s);
          if (room.ring.length > 500) room.ring.shift();
          for (const l of room.listeners.keys()) { try { l.send(s); } catch (_) {} }
          let parsed = null;
          try { parsed = JSON.parse(s); } catch (_) {}
          if (parsed) { hostReceived.push(parsed); room.received.push(parsed); }
          if (parsed && parsed.end) endRoom(room, parsed.summary);
        });
        ws.on('close', () => room.hosts.delete(ws));
      } else {
        for (const m of room.ring) { try { ws.send(m); } catch (_) {} }
        if (!room.ended) attJoin(room, ws);
        else room.listeners.set(ws, { lang: null, at: Date.now() });
        ws.on('message', (raw) => {
          const s = raw.toString();
          if (s.includes('__ping')) { ws.send(s); return; }
          try {
            const p = JSON.parse(s);
            if (p && p.hello && p.lang && room.att) attSetLang(room, ws, p.lang);
          } catch (_) {}
          for (const h of room.hosts) { try { h.send(s); } catch (_) {} }
        });
        ws.on('close', () => attLeave(room, ws));
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
