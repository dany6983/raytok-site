export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ringBuffer = [];
    this.hostToken = null;
    this.startedAt = null;
    this.code = null;
    this.initialized = false;
    this.hostMsgSec = 0;
    this.hostMsgCount = 0;
    this.lastLineAt = null;
    this.silenceWarningSent = false;

    // RULE: __ping 원문을 setWebSocketAutoResponse 로 같은 원문 되돌림
    if (typeof WebSocketRequestResponsePair !== 'undefined' && this.ctx.setWebSocketAutoResponse) {
      try {
        this.ctx.setWebSocketAutoResponse(
          new WebSocketRequestResponsePair('{"__ping":true}', '{"__ping":true}')
        );
      } catch (e) {}
    }

    // 동면(Hibernation) 복구 시 영속 상태 복원
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get(['hostToken', 'startedAt', 'code', 'ringBuffer', 'initialized', 'lastLineAt', 'kind', 'sub', 'silenceWarnMs', 'silenceTimeoutMs', 'att']);
      if (stored.get('initialized')) {
        this.initialized = true;
        this.att = stored.get('att') || null;
        this.hostToken = stored.get('hostToken') || null;
        this.startedAt = stored.get('startedAt') || null;
        this.code = stored.get('code') || null;
        this.ringBuffer = stored.get('ringBuffer') || [];
        this.lastLineAt = stored.get('lastLineAt') || (this.startedAt ? new Date(this.startedAt).getTime() : Date.now());
        this.kind = stored.get('kind') || 'guide';
        this.sub = stored.get('sub') || null;
        this.silenceWarnMs = stored.get('silenceWarnMs') || 9 * 60 * 1000;
        this.silenceTimeoutMs = stored.get('silenceTimeoutMs') || 10 * 60 * 1000;
      }
    });
  }

  // 참석 집계 — 숫자만(지금 몇 명·최대 몇 명·언어별 몇 명·언어별 들은 분). 이름·글은 없다.
  // 호스트에게만 보낸다. 세션이 끝나면 지운다.
  attInit() {
    if (!this.att) this.att = { joined: 0, max: 0, langs: {} };
    return this.att;
  }
  attLang(code) {
    const a = this.attInit();
    const k = String(code || '').trim() || '?';
    if (!a.langs[k]) a.langs[k] = { max: 0, sec: 0 };
    return a.langs[k];
  }
  attSave() {
    return this.ctx.storage.put('att', this.att);
  }
  attMark(ws) {
    try { return ws.deserializeAttachment() || null; } catch (_) { return null; }
  }
  // 지금 붙어 있는 청취자 수와 언어별 수 — 실제 소켓에서 센다(동면 뒤에도 맞다)
  attLive() {
    const byLang = {};
    let n = 0;
    for (const w of this.ctx.getWebSockets('listener')) {
      const m = this.attMark(w);
      if (!m || m.left) continue;   // 닫히는 중인 소켓은 목록에 아직 남아 있다
      const k = m.lang || '?';
      byLang[k] = (byLang[k] || 0) + 1;
      n++;
    }
    return { n, byLang };
  }
  attSnapshot(now = Date.now()) {
    const a = this.attInit();
    const live = this.attLive();
    if (live.n > a.max) a.max = live.n;
    for (const k of Object.keys(live.byLang)) {
      const L = this.attLang(k);
      if (live.byLang[k] > L.max) L.max = live.byLang[k];
    }
    const langs = {};
    const liveSec = {};
    for (const w of this.ctx.getWebSockets('listener')) {
      const m = this.attMark(w);
      if (!m || m.left) continue;
      const k = m.lang || '?';
      liveSec[k] = (liveSec[k] || 0) + Math.max(0, Math.floor((now - (m.at || now)) / 1000));
    }
    for (const k of Object.keys(a.langs)) {
      const sec = a.langs[k].sec + (liveSec[k] || 0);
      langs[k] = { now: live.byLang[k] || 0, max: a.langs[k].max, min: Math.floor(sec / 60) };
    }
    return { att: 1, now: live.n, max: a.max, joined: a.joined, langs };
  }
  attEnded() {
    return this.ringBuffer.some((m) => /"end"\s*:\s*1/.test(m));
  }
  attSend(ws) {
    if (!this.initialized || this.attEnded()) return;
    const msg = JSON.stringify(this.attSnapshot());
    const targets = ws ? [ws] : this.ctx.getWebSockets('host');
    for (const h of targets) {
      try { h.send(msg); } catch (_) {}
    }
  }
  // 청취자가 붙음 — 언어는 hello 가 오면 채운다
  attJoin(ws) {
    const a = this.attInit();
    a.joined++;
    try { ws.serializeAttachment({ lang: null, at: Date.now() }); } catch (_) {}
    this.attLang('?');
    this.attSnapshot();
    this.attSend();
    return this.attSave();
  }
  // 청취자가 언어를 알림(처음 또는 바꿈) — 지난 언어로 들은 초를 닫는다
  attSetLang(ws, lang) {
    const now = Date.now();
    const m = this.attMark(ws) || { lang: null, at: now };
    const code = String(lang || '').trim() || '?';
    if (m.lang === code) return;
    const prev = this.attLang(m.lang || '?');
    prev.sec += Math.max(0, Math.floor((now - (m.at || now)) / 1000));
    this.attLang(code);
    try { ws.serializeAttachment({ lang: code, at: now }); } catch (_) {}
    this.attSnapshot();
    this.attSend();
    return this.attSave();
  }
  attLeave(ws) {
    const now = Date.now();
    const m = this.attMark(ws);
    if (m && !m.left) {
      const L = this.attLang(m.lang || '?');
      L.sec += Math.max(0, Math.floor((now - (m.at || now)) / 1000));
      try { ws.serializeAttachment({ left: true }); } catch (_) {}
    }
    this.attSend();
    return this.attSave();
  }
  // 끝: 마지막 집계를 호스트에게 주고 지운다
  async attEnd() {
    if (!this.att) return;
    this.attSend();
    this.att = null;
    for (const w of this.ctx.getWebSockets('listener')) {
      try { w.serializeAttachment(null); } catch (_) {}
    }
    await this.ctx.storage.delete('att');
  }

  // 세션이 끝나면 보관하던 줄(원문·번역)을 지운다.
  // 끝났다는 표시 한 줄만 남긴다 — 뒤늦게 들어온 청취자가 "끝났다"를 알 수 있게.
  // 표시에는 숫자만 싣는다(글은 싣지 않는다).
  dropLines(why, summary) {
    const mark = { end: 1 };
    if (why) mark.why = why;
    if (summary && typeof summary === 'object') {
      const kept = {};
      for (const k of ['lines', 'minutes', 'joined_max']) {
        if (Number.isFinite(summary[k])) kept[k] = summary[k];
      }
      if (Object.keys(kept).length > 0) mark.summary = kept;
    }
    this.ringBuffer = [JSON.stringify(mark)];
    return this.ctx.storage.put('ringBuffer', this.ringBuffer);
  }

  async recordDeskSessionMinutes() {
    if (this.kind === 'desk' && this.sub && this.startedAt && !this.deskMinutesRecorded) {
      this.deskMinutesRecorded = true;
      const elapsedMs = Date.now() - new Date(this.startedAt).getTime();
      const elapsedMin = Math.max(1, Math.round(elapsedMs / 60000));
      try {
        const limiterId = this.env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = this.env.ROOM.get(limiterId);
        await limiter.fetch(new Request('http://internal/usage/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sub: this.sub, deskMinutes: elapsedMin })
        }));
      } catch (_) {}
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 0. 내부 rate limit 검사 호출 (/limit)
    if (url.pathname === '/limit' && request.method === 'POST') {
      const { key, limit = 5, windowMs = 86400000 } = await request.json();
      const now = Date.now();
      if (!this.limits) this.limits = new Map();
      let record = this.limits.get(key);
      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        this.limits.set(key, record);
        return new Response(JSON.stringify({ allowed: true, count: 1 }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (record.count >= limit) {
        return new Response(JSON.stringify({ allowed: false, count: record.count }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      record.count++;
      return new Response(JSON.stringify({ allowed: true, count: record.count }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-1. 내부 특정 IP rate limit 리셋 호출 (/limit/reset)
    if (url.pathname === '/limit/reset' && request.method === 'POST') {
      const { ip } = await request.json();
      if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
        return new Response(JSON.stringify({ error: 'ip required' }), { status: 400 });
      }
      const targetIp = ip.trim();
      let deleted = 0;
      if (this.limits) {
        if (this.limits.delete(`issue_ip:${targetIp}`)) deleted++;
        if (this.limits.delete(`ip:${targetIp}`)) deleted++;
      }
      return new Response(JSON.stringify({ ok: true, deleted, ip: targetIp }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-2. 내부 번역 엔진 호출/실패 기록 (/metric/record)
    if (url.pathname === '/metric/record' && request.method === 'POST') {
      const { engine, success } = await request.json();
      const eng = (engine || 'unknown').toLowerCase();
      const now = Date.now();
      const minute = Math.floor(now / 60000);

      // 분 단위 버킷 저장 (최근 24시간 = 1440분)
      if (!this.engineBuckets) this.engineBuckets = new Map();
      let bMap = this.engineBuckets.get(eng);
      if (!bMap) {
        bMap = new Map();
        this.engineBuckets.set(eng, bMap);
      }
      let bucket = bMap.get(minute);
      if (!bucket) {
        bucket = { calls: 0, failures: 0 };
        bMap.set(minute, bucket);
      }
      bucket.calls++;
      if (!success) bucket.failures++;

      // Lifetime 누적 저장
      if (!this.engineLifetime) this.engineLifetime = new Map();
      let life = this.engineLifetime.get(eng);
      if (!life) {
        life = { calls: 0, failures: 0 };
        this.engineLifetime.set(eng, life);
      }
      life.calls++;
      if (!success) life.failures++;

      // 24시간 이전 지난 분 버킷 정리
      const oldestMinute = minute - 1440;
      for (const m of bMap.keys()) {
        if (m < oldestMinute) bMap.delete(m);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-3. 내부 번역 엔진 통계 조회 (/metric/engine)
    if (url.pathname === '/metric/engine' && request.method === 'GET') {
      const now = Date.now();
      const currentMinute = Math.floor(now / 60000);
      const min1h = currentMinute - 60;
      const min24h = currentMinute - 1440;

      const stats = {};
      const formatRate = (calls, fails) => calls > 0 ? Number(((fails / calls) * 100).toFixed(2)) + '%' : '0%';

      if (this.engineBuckets) {
        for (const [eng, bMap] of this.engineBuckets.entries()) {
          let calls1h = 0, fail1h = 0;
          let calls24h = 0, fail24h = 0;

          for (const [m, b] of bMap.entries()) {
            if (m >= min1h) {
              calls1h += b.calls;
              fail1h += b.failures;
            }
            if (m >= min24h) {
              calls24h += b.calls;
              fail24h += b.failures;
            }
          }

          const life = (this.engineLifetime && this.engineLifetime.get(eng)) || { calls: 0, failures: 0 };

          stats[eng] = {
            window_1h: { calls: calls1h, failures: fail1h, rate: formatRate(calls1h, fail1h) },
            window_24h: { calls: calls24h, failures: fail24h, rate: formatRate(calls24h, fail24h) },
            lifetime: { calls: life.calls, failures: life.failures, rate: formatRate(life.calls, life.failures) }
          };
        }
      }

      return new Response(JSON.stringify(stats), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-4. 내부 월별·코드별·언어별 사용량 기록 (/usage/record)
    // - 원가 감시용 · 과금 근거 아님
    if (url.pathname === '/usage/record' && request.method === 'POST') {
      const { sub, target, chars = 0, sttKey = false, deskMinutes = 0 } = await request.json();
      if (!sub) {
        return new Response(JSON.stringify({ error: 'sub required' }), { status: 400 });
      }

      const now = new Date();
      const month = now.toISOString().slice(0, 7); // 'YYYY-MM'
      const key = `usage:${month}:${sub}`;

      let record = await this.ctx.storage.get(key);
      if (!record) {
        record = {
          month,
          sub,
          total_chars: 0,
          total_calls: 0,
          targets: {}, // { [targetLang]: { chars, calls } }
          stt_keys_issued: 0,
          desk_minutes: 0,
          updated_at: now.toISOString()
        };
      }

      if (chars > 0) {
        record.total_chars += chars;
        record.total_calls += 1;
        if (target) {
          const tKey = String(target).toLowerCase().trim();
          if (!record.targets[tKey]) {
            record.targets[tKey] = { chars: 0, calls: 0 };
          }
          record.targets[tKey].chars += chars;
          record.targets[tKey].calls += 1;
        }
      }

      if (sttKey) {
        record.stt_keys_issued = (record.stt_keys_issued || 0) + 1;
      }

      if (deskMinutes > 0) {
        record.desk_minutes = (record.desk_minutes || 0) + deskMinutes;
      }

      record.updated_at = now.toISOString();
      await this.ctx.storage.put(key, record);

      return new Response(JSON.stringify({ ok: true, month, sub }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-5. 내부 월별·코드별 사용량 조회 (/usage/summary)
    // 0-6. 내부 동시 기기 등록 및 한도 검사 (/devices/register)
    if (url.pathname === '/devices/register' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { tokenHash, deviceHash, maxDevices = 3 } = body;
      if (!tokenHash || !deviceHash) {
        return new Response(JSON.stringify({ allowed: false, error: 'bad_params' }), { status: 400 });
      }

      const key = `devices:${tokenHash}`;
      let devices = (await this.ctx.storage.get(key)) || [];
      if (!Array.isArray(devices)) devices = [];

      // 이미 등록된 기기인지 확인
      const isExisting = devices.includes(deviceHash);
      if (isExisting) {
        return new Response(JSON.stringify({ allowed: true, count: devices.length, max: maxDevices }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 신규 기기인데 한도 초과인지 확인
      if (devices.length >= maxDevices) {
        return new Response(JSON.stringify({ allowed: false, count: devices.length, max: maxDevices }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 신규 등록
      devices.push(deviceHash);
      await this.ctx.storage.put(key, devices);

      return new Response(JSON.stringify({ allowed: true, count: devices.length, max: maxDevices }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/usage/summary' && request.method === 'GET') {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const month = url.searchParams.get('month') || currentMonth;
      const sub = url.searchParams.get('sub');

      if (sub) {
        const key = `usage:${month}:${sub}`;
        const record = await this.ctx.storage.get(key);
        if (!record) {
          return new Response(JSON.stringify({
            month,
            sub,
            total_chars: 0,
            total_calls: 0,
            targets: {},
            stt_keys_issued: 0,
            desk_minutes: 0,
            _note: '원가 감시용 · 과금 근거 아님'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({
          ...record,
          _note: '원가 감시용 · 과금 근거 아님'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const prefix = `usage:${month}:`;
      const map = await this.ctx.storage.list({ prefix });
      const usageList = {};
      for (const [k, rec] of map.entries()) {
        usageList[rec.sub] = {
          total_chars: rec.total_chars,
          total_calls: rec.total_calls,
          targets: rec.targets,
          stt_keys_issued: rec.stt_keys_issued,
          desk_minutes: rec.desk_minutes,
          _note: '원가 감시용 · 과금 근거 아님'
        };
      }

      return new Response(JSON.stringify({
        month,
        usage: usageList,
        _note: '원가 감시용 · 과금 근거 아님'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-6. 테스트용 무음 알람 시뮬레이션 (/test/alarm)
    if (url.pathname === '/test/alarm' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.advance_ms) {
        this.lastLineAt = (this.lastLineAt || Date.now()) - body.advance_ms;
        if (this.startedAt) {
          this.startedAt = new Date(new Date(this.startedAt).getTime() - body.advance_ms).toISOString();
        }
      }
      await this.alarm();
      return new Response(JSON.stringify({ ok: true, silenceWarningSent: this.silenceWarningSent }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. 내부 초기화 호출
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json();
      this.code = body.code;
      this.hostToken = body.host_token;
      this.startedAt = new Date().toISOString();
      this.initialized = true;
      this.ringBuffer = [];
      this.lastLineAt = Date.now();
      this.silenceWarningSent = false;
      this.kind = body.kind || 'guide';
      this.sub = body.sub || null;
      this.silenceWarnMs = body.test_silence_warn_ms || 9 * 60 * 1000;
      this.silenceTimeoutMs = body.test_silence_timeout_ms || 10 * 60 * 1000;
      this.deskMinutesRecorded = false;
      await this.ctx.storage.put({
        code: this.code,
        hostToken: this.hostToken,
        startedAt: this.startedAt,
        initialized: true,
        ringBuffer: [],
        lastLineAt: this.lastLineAt,
        kind: this.kind,
        sub: this.sub,
        silenceWarnMs: this.silenceWarnMs,
        silenceTimeoutMs: this.silenceTimeoutMs
      });
      // 10분 무음 자동 정지 기준: 9분 경고 알람 설정
      await this.ctx.storage.setAlarm(this.lastLineAt + this.silenceWarnMs);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. 방 정보 조회 (/info)
    if (url.pathname === '/info' || url.pathname === '/internal/info' || url.pathname.startsWith('/room/')) {
      if (!this.initialized) {
        return new Response(JSON.stringify({ exists: false, listeners: 0, started_at: null }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const listenerCount = this.ctx.getWebSockets('listener').length;
      return new Response(JSON.stringify({
        exists: true,
        listeners: listenerCount,
        started_at: this.startedAt
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. WebSocket 업그레이드
    if (request.headers.get('Upgrade') === 'websocket') {
      const role = url.searchParams.get('role');
      const token = url.searchParams.get('token');

      if (role === 'host') {
        if (!this.initialized || token !== this.hostToken) {
          return new Response('Forbidden: Token mismatch or room uninitialized', { status: 403 });
        }
        // 호스트 재연결 시 타임아웃 알람 취소
        await this.ctx.storage.deleteAlarm();
      } else if (role === 'listener') {
        if (!this.initialized) {
          return new Response('Not Found: Room does not exist', { status: 404 });
        }
        // 상한: 청취자 200
        const currentListeners = this.ctx.getWebSockets('listener').length;
        if (currentListeners >= 200) {
          return new Response('Too Many Requests: Listener limit reached (200 max)', { status: 429 });
        }
      } else {
        return new Response('Bad Request: Invalid role', { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // RULE: state.acceptWebSocket(ws, [role]) 만 사용. ws.accept() 금지
      this.ctx.acceptWebSocket(server, [role]);

      // 새 청취자 접속 시 최근 500개 링버퍼 순서대로 먼저 전송
      if (role === 'listener') {
        for (const msg of this.ringBuffer) {
          try {
            server.send(msg);
          } catch (e) {}
        }
        if (!this.attEnded()) await this.attJoin(server);
      } else {
        this.attSend(server);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async webSocketMessage(ws, message) {
    // 상한: 메시지 16KB (초과 시 무시)
    const byteLen = typeof message === 'string' ? new TextEncoder().encode(message).length : message.byteLength;
    if (byteLen > 16384) {
      return;
    }

    const msgStr = typeof message === 'string' ? message : new TextDecoder().decode(message);

    // __ping 처리 (setWebSocketAutoResponse 미매칭 포맷 대비 fallback)
    if (msgStr.includes('__ping')) {
      try {
        ws.send(msgStr);
      } catch (e) {}
      return;
    }

    const tags = this.ctx.getTags(ws);
    const isHost = tags.includes('host');
    const isListener = tags.includes('listener');

    if (isHost) {
      // 상한: 호스트 20msg/s (넘으면 무시)
      const nowSec = Math.floor(Date.now() / 1000);
      if (this.hostMsgSec !== nowSec) {
        this.hostMsgSec = nowSec;
        this.hostMsgCount = 0;
      }
      this.hostMsgCount++;
      if (this.hostMsgCount > 20) {
        return;
      }

      // 호스트 메시지 최근 500개 링버퍼 저장
      this.ringBuffer.push(msgStr);
      if (this.ringBuffer.length > 500) {
        this.ringBuffer.shift();
      }
      this.ctx.storage.put('ringBuffer', this.ringBuffer);

      // 호스트 → 청취자 전원에 그대로 전달 (내용 해석 안 함)
      // L4-2 의 script·skip·break 도 여기로 그대로 간다 — 따로 저장하지 않는다(줄 보관은 위 링버퍼 규칙 그대로).
      for (const listenerWs of this.ctx.getWebSockets('listener')) {
        try {
          listenerWs.send(message);
        } catch (e) {}
      }

      // 무음(새 자막 줄 없음) 판정 기준: 호스트가 보낸 메시지에 text가 있고 end가 아닌 경우 새 자막으로 판정.
      // 원고 문단(kind:"script")도 새 줄이다 — 웹 강사 화면은 text 를 보내지 않으므로 여기서 세지 않으면 10분 뒤 끊긴다.
      let isSubtitleLine = false;
      let isEnd = false;
      let endSummary = null;
      try {
        const parsed = JSON.parse(msgStr);
        if (parsed.end) { isEnd = true; endSummary = parsed.summary; }
        if (!isEnd && (parsed.text || parsed.kind === 'script') && (parsed.seq !== undefined || parsed.para !== undefined || !parsed.hello)) {
          isSubtitleLine = true;
        }
        if (!isEnd && parsed.kind === 'script' && typeof parsed.src === 'string') {
          isSubtitleLine = true;
        }
      } catch (e) {
        if (/"end"\s*:\s*1/.test(msgStr)) isEnd = true;
        else if (/"text"\s*:/.test(msgStr) || /"kind"\s*:\s*"script"/.test(msgStr)) isSubtitleLine = true;
      }

      if (isSubtitleLine) {
        this.lastLineAt = Date.now();
        this.ctx.storage.put('lastLineAt', this.lastLineAt);
        if (this.silenceWarningSent) {
          this.silenceWarningSent = false;
          const clearMsg = JSON.stringify({ warning_cleared: 'silence_warning' });
          for (const hostWs of this.ctx.getWebSockets('host')) {
            try { hostWs.send(clearMsg); } catch (_) {}
          }
        }
        // 다음 경고 알람 예약
        this.ctx.storage.setAlarm(this.lastLineAt + (this.silenceWarnMs || 9 * 60 * 1000));
      }

      if (isEnd) {
        await this.attEnd();
        await this.dropLines(null, endSummary);
        await this.recordDeskSessionMinutes();
        this.ctx.waitUntil(
          new Promise((resolve) => {
            setTimeout(() => {
              for (const listenerWs of this.ctx.getWebSockets('listener')) {
                try {
                  listenerWs.close(1000, 'end');
                } catch (e) {}
              }
              resolve();
            }, 5000);
          })
        );
      }
    } else if (isListener) {
      // hello 의 lang 만 집계에 쓴다(이름·글은 읽지 않는다)
      try {
        const p = JSON.parse(msgStr);
        if (p && p.hello && p.lang) await this.attSetLang(ws, p.lang);
      } catch (_) {}
      // 청취자 → 호스트에게만 전달
      for (const hostWs of this.ctx.getWebSockets('host')) {
        try {
          hostWs.send(message);
        } catch (e) {}
      }
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    try {
      ws.close(code, reason || 'closed');
    } catch (e) {}
    const tags = this.ctx.getTags(ws);
    if (tags.includes('listener') && this.att) await this.attLeave(ws);
    if (tags.includes('host')) {
      const remainingHosts = this.ctx.getWebSockets('host').filter(w => w !== ws);
      if (remainingHosts.length === 0) {
        // 호스트 끊기면 10분 대기 후 자동 end
        await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
      }
    }
  }

  async webSocketError(ws, error) {
    // 에러 발생 시 리소스 정리
  }

  async alarm() {
    const now = Date.now();
    const warnMs = this.silenceWarnMs || 9 * 60 * 1000;
    const timeoutMs = this.silenceTimeoutMs || 10 * 60 * 1000;

    // 1. 호스트 끊김 10분 대기 후 자동 end
    if (this.ctx.getWebSockets('host').length === 0) {
      await this.attEnd();
      await this.dropLines('host_timeout');
      await this.recordDeskSessionMinutes();
      const endMsg = JSON.stringify({ end: 1, why: 'host_timeout' });
      for (const listenerWs of this.ctx.getWebSockets('listener')) {
        try {
          listenerWs.send(endMsg);
        } catch (e) {}
      }
      this.ctx.waitUntil(
        new Promise((resolve) => {
          setTimeout(() => {
            for (const listenerWs of this.ctx.getWebSockets('listener')) {
              try {
                listenerWs.close(1000, 'host_timeout');
              } catch (e) {}
            }
            resolve();
          }, 5000);
        })
      );
      return;
    }

    // 2. 무음(새 자막 줄 없음) 검사: 10분(600초) 도달 시 자동 종료, 9분(540초) 도달 시 1분 전 경고
    const lastTime = this.lastLineAt || (this.startedAt ? new Date(this.startedAt).getTime() : now);
    const silenceElapsed = now - lastTime;

    if (silenceElapsed >= timeoutMs) {
      await this.attEnd();
      await this.dropLines('silence_timeout');
      await this.recordDeskSessionMinutes();
      const endMsg = JSON.stringify({ end: 1, why: 'silence_timeout' });
      for (const hostWs of this.ctx.getWebSockets('host')) {
        try { hostWs.send(endMsg); } catch (e) {}
      }
      for (const listenerWs of this.ctx.getWebSockets('listener')) {
        try { listenerWs.send(endMsg); } catch (e) {}
      }
      this.ctx.waitUntil(
        new Promise((resolve) => {
          setTimeout(() => {
            for (const ws of [...this.ctx.getWebSockets('host'), ...this.ctx.getWebSockets('listener')]) {
              try {
                ws.close(1000, 'silence_timeout');
              } catch (e) {}
            }
            resolve();
          }, 5000);
        })
      );
      return;
    }

    if (silenceElapsed >= warnMs && !this.silenceWarningSent) {
      this.silenceWarningSent = true;
      const remainingSec = Math.max(0, Math.round((timeoutMs - silenceElapsed) / 1000));
      const warnMsg = JSON.stringify({
        warning: 'silence_warning',
        minutes: 9,
        remaining_sec: remainingSec,
        message: '10분 동안 새 자막 줄이 없어 1분 후 세션이 자동 종료됩니다.'
      });
      for (const hostWs of this.ctx.getWebSockets('host')) {
        try { hostWs.send(warnMsg); } catch (e) {}
      }
      // 10분 도달 시점 알람 설정
      await this.ctx.storage.setAlarm(lastTime + timeoutMs);
    }
  }
}
