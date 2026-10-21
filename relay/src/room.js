import { verifyLicense, mintLicense } from './license.js';
import { verifyCode } from './mint-core.js';
import * as RTR from './room-translate.js';
import crypto from 'node:crypto';

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
    this.licFlags = 0;            // 방을 만든 라이선스가 들고 있던 깃발 — 번역 문을 여는 열쇠(B 3)
    this.trQueue = [];            // 번역을 기다리는 줄. 250ms 모아서 한 번 부른다
    this.trTimer = null;
    this.trToken = null;          // 방 안에서만 쓰는 짧은 토큰(아래 trFetch)
    this.licStore = new Map();
    this.batchStore = new Map();
    this.issuedStore = new Map();

    // RULE: __ping 원문을 setWebSocketAutoResponse 로 같은 원문 되돌림
    if (typeof WebSocketRequestResponsePair !== 'undefined' && this.ctx.setWebSocketAutoResponse) {
      try {
        this.ctx.setWebSocketAutoResponse(
          new WebSocketRequestResponsePair('{"__ping":true}', '{"__ping":true}')
        );
      } catch (e) {}
    }

    // N:1 질문 대기열 상태 (FIX_QUESTION, question.md)
    this.askQueue = [];
    this.askSeq = 0;
    this.activeAsk = null;
    this.askHistory = [];
    this.listenerBytesOut = 0;
    this.hostBytesIn = 0;

    // 동면(Hibernation) 복구 시 영속 상태 복원
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get(['hostToken', 'startedAt', 'code', 'ringBuffer', 'initialized', 'lastLineAt', 'kind', 'sub', 'licFlags', 'silenceWarnMs', 'silenceTimeoutMs', 'att']);
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
        this.licFlags = Number(stored.get('licFlags') || 0);
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
  // 소켓 쪽지는 **통째로 덮인다**(D-19 savePrefs 와 같은 병). 한 칸만 쓰면 언어·붙은 시각이
  // 조용히 지워지고, 그러면 참석 집계가 틀린다. 칸을 더하거나 고칠 때는 꼭 이 함수로 합친다.
  attPatch(ws, patch) {
    const m = this.attMark(ws) || {};
    try { ws.serializeAttachment({ ...m, ...patch }); } catch (_) {}
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
    this.attPatch(ws, { lang: code, at: now });
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
      this.attPatch(ws, { left: true });
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

  /* ─────────────────────────────────────────────────────────────────────────
   * 방이 번역한다 — NOW B 3 (보조 길). 설계: docs/design/room-translate.md
   *
   * 강사는 **원문만** 보낸다(장부 43). 여기서 손님 언어마다 한 번씩 번역해 **그 언어
   * 손님에게만** 보낸다. 손님 쪽은 아무것도 청하지 않는다 — 방이 민다 (RULE: P-16).
   * 판단(언어 고르기·묶기·메시지 모양)은 `room-translate.js` 에 있다.
   * ───────────────────────────────────────────────────────────────────────── */

  /** 문이 열려 있나 — 스위치는 **끄기 위해** 있다(§24: 기본 켬). 깃발이 없으면 닫힌다. */
  roomTrOn() {
    if (String(this.env && this.env.ROOM_TR) === '0') return false;
    return (Number(this.licFlags) & (0x10 | 0x04 | 0x08)) !== 0;
  }

  /** 지금 방에 있는 손님들의 언어 — **아는 칸은 이 하나**다(§4: 새 칸을 만들지 않는다) */
  listenerLangs() {
    const out = [];
    try {
      for (const ws of this.ctx.getWebSockets('listener')) {
        const m = this.attMark(ws);
        if (m && m.lang && !m.left) out.push(m.lang);
      }
    } catch (_) {}
    return out;
  }

  /**
   * 강사가 보낸 줄에서 **번역할 것**을 집는다. 집지 않는 것:
   * ① 중간 인식 결과(`pending`) — 확정만 번역·재생한다 (RULE: P-03)
   * ② 끝·인사 같은 알림 ③ 짝 맞출 번호가 없는 줄 (보내도 손님이 어디에 붙일지 모른다)
   */
  trItemOf(parsed) {
    if (!parsed || parsed.end || parsed.hello) return null;
    const srcLang = parsed.srcLang || parsed.src_lang || 'ko';
    if (parsed.kind === 'script' && typeof parsed.src === 'string' && parsed.src.trim()) {
      return { script: 1, para: Number(parsed.para) || 0, text: parsed.src, srcLang };
    }
    if (parsed.kind) return null;                       // skip·break·grant 등은 글이 아니다
    if (parsed.pending) return null;                    // RULE: P-03
    if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null;
    if (parsed.seq === undefined || parsed.seq === null) return null;
    return { seq: parsed.seq, text: parsed.text, srcLang };
  }

  /** 줄을 대기줄에 넣고 **모아서** 한 번 부른다. 원문은 이미 전원에게 갔다. */
  roomTrFromHost(parsed) {
    if (!this.roomTrOn()) return;
    const item = this.trItemOf(parsed);
    if (!item) return;
    this.trQueue.push(item);
    if (this.trTimer) return;
    this.trTimer = setTimeout(() => {
      this.trTimer = null;
      const batch = this.trQueue.splice(0, this.trQueue.length);
      /* 대기줄을 비우고 **그 다음에** 부른다 — 부르는 동안 들어온 줄은 다음 묶음이다.
         `waitUntil` 이 없는 자리이므로 실패해도 소켓을 막지 않게 따로 돌린다. */
      this.roomTrFlush(batch).catch(() => {});
    }, RTR.BATCH_MS);
  }

  /** 방 안에서만 쓰는 짧은 토큰. **비밀값을 들고 있지 않고** 깃발로 만들어 쓴다. */
  async trToken_() {
    if (this.trToken) return this.trToken;
    const secret = this.env && this.env.LICENSE_SECRET;
    if (!secret || !this.sub) return null;
    try {
      const { token } = await mintLicense(this.sub, 1, Number(this.licFlags) || 0, secret);
      this.trToken = token;
      return token;
    } catch (_) { return null; }
  }

  /**
   * `/translate` 를 **같은 릴레이**에 부른다 — 같은 엔진·같은 상한·같은 글자 세기다.
   * 길이 없으면 `null` 을 돌려주고 까닭을 적는다. 못 부른 것을 "번역 없음"으로
   * 조용히 넘기지 않는다(§20).
   */
  async trFetch(body) {
    const token = await this.trToken_();
    if (!token) return { res: null, why: 'no_token' };
    const base = String((this.env && this.env.RELAY_BASE_URL) || 'http://internal').replace(/\/$/, '');
    const req = new Request(base + '/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const self = this.env && this.env.SELF;
    try {
      if (self && typeof self.fetch === 'function') return { res: await self.fetch(req), why: null };
      if (this.env && this.env.RELAY_BASE_URL) return { res: await fetch(req), why: null };
    } catch (e) {
      return { res: null, why: 'fetch_error' };
    }
    return { res: null, why: 'no_route' };
  }

  /** 그 언어 손님에게만 보낸다 — 남의 언어 번역문을 받을 필요가 없다(바이트도 돈이다) */
  sendToLang(lang, msgs) {
    const want = RTR.normLang(lang);
    let n = 0;
    try {
      for (const ws of this.ctx.getWebSockets('listener')) {
        const m = this.attMark(ws);
        if (!m || m.left || RTR.normLang(m.lang) !== want) continue;
        for (const msg of msgs) this.sendToListener(ws, msg);
        n += 1;
      }
    } catch (_) {}
    return n;
  }

  /** 묶음 하나를 언어마다 한 번씩 번역한다. 사람이 20명이어도 번역은 **언어 수만큼**이다. */
  async roomTrFlush(batch) {
    if (!batch || !batch.length) return;
    const srcLang = batch[0].srcLang || 'ko';
    const { langs, capped } = RTR.pickLangs(this.listenerLangs(), srcLang);
    if (capped > 0) {
      /* 막고 **알린다** — 조용히 자르면 그 언어 손님은 까닭을 모른다(§20) */
      try { console.log(`room_tr_cap langs=${langs.length} dropped=${capped}`); } catch (_) {}
    }
    for (const lang of langs) {
      for (const part of RTR.chunk(batch)) {
        const texts = part.map((it) => it.text);
        const { res, why } = await this.trFetch({ q: texts, source: srcLang, target: lang, engine: 'basic' });
        if (!res || !res.ok) {
          const code = why || (res ? 'http_' + res.status : 'no_res');
          try { console.log(`room_tr_fail lang=${lang} why=${code}`); } catch (_) {}
          this.sendToLang(lang, RTR.noTrMessages(part, code));
          continue;
        }
        let out;
        try { out = RTR.textsOf(await res.json()); } catch (_) { out = []; }
        const made = RTR.trMessages(part, lang, out);
        if (!made.ok) {
          try { console.log(`room_tr_fail lang=${lang} why=${made.why}`); } catch (_) {}
          this.sendToLang(lang, RTR.noTrMessages(part, made.why));
          continue;
        }
        const chars = texts.reduce((a, t) => a + t.length, 0);
        const sent = this.sendToLang(lang, made.msgs);
        try { console.log(`room_tr lang=${lang} n=${part.length} chars=${chars} to=${sent}`); } catch (_) {}
      }
    }
  }

  sendToListener(ws, msg) {
    try {
      const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
      const byteLen = typeof Buffer !== 'undefined' ? Buffer.byteLength(str, 'utf8') : new TextEncoder().encode(str).length;
      this.listenerBytesOut = (this.listenerBytesOut || 0) + byteLen;
      ws.send(str);
    } catch (_) {}
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

    // 0-1-A. 이용권 등록 및 검증: POST /internal/license/redeem ({ code, batch, deviceId })
    if (url.pathname === '/internal/license/redeem' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { code, batch, deviceId } = body;
        if (!deviceId || typeof deviceId !== 'string') {
          return new Response(JSON.stringify({ error: 'bad_request', message: 'deviceId is required' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
          });
        }

        /*
         * B-1 (MASTER 10-14 09:00): 등록한 기기 → 이용권 플래그 색인.
         * 앱은 `/room` 에 `/license/issue` 의 HMAC 토큰을 쓴다. 그 토큰에 0x01 이 실리려면
         * 발급 때 "이 기기가 어떤 이용권을 등록했나"를 알아야 한다 — 그 자리가 이 색인이다.
         * 키는 `dev:<sha256(deviceId)>`, 값은 `[{flags, activatedAt, expiresAt}]`.
         */
        const deviceKey = 'dev:' + crypto.createHash('sha256').update(deviceId).digest('hex');
        const noteDevice = async (flags, activatedAt, expiresAt) => {
          const list = (await this.ctx.storage.get(deviceKey)) || [];
          const now = Date.now();
          const kept = list.filter(e => e && e.expiresAt > now && !(e.activatedAt === activatedAt && e.flags === flags));
          kept.push({ flags: Number(flags) || 0, activatedAt, expiresAt });
          await this.ctx.storage.put(deviceKey, kept);
        };

        // A. 묶음 QR 분기 ({ batch, deviceId }) (대표님 08:46 주력 사양)
        if (batch) {
          const rawId = String(batch).replace(/^b_/, '');
          let batchData = await this.ctx.storage.get('batch:' + rawId);
          if (!batchData && this.batchStore) batchData = this.batchStore.get(rawId);
          if (!batchData) {
            return new Response(JSON.stringify({ error: 'unknown_batch', message: '존재하지 않는 묶음 QR입니다.' }), {
              status: 404, headers: { 'Content-Type': 'application/json' }
            });
          }
          if (Date.now() > batchData.validTo) {
            return new Response(JSON.stringify({ error: 'expired', message: '묶음 QR 유효기간이 만료되었습니다.' }), {
              status: 401, headers: { 'Content-Type': 'application/json' }
            });
          }
          if (!Array.isArray(batchData.used)) batchData.used = [];

          // 같은 deviceId 재요청: 200 OK (자리 안 씀)
          const existing = batchData.used.find(u => u.deviceId === deviceId);
          if (existing) {
            await noteDevice(batchData.flags || 0x01, existing.activatedAt, existing.expiresAt);
            return new Response(JSON.stringify({
              valid: true,
              activatedAt: existing.activatedAt,
              expiresAt: existing.expiresAt,
              seats: batchData.seats,
              used: batchData.used.length
            }), {
              status: 200, headers: { 'Content-Type': 'application/json' }
            });
          }

          // 자리 수 초과 시 no_seats
          if (batchData.used.length >= batchData.seats) {
            return new Response(JSON.stringify({
              error: 'no_seats',
              message: '정원이 모두 찼습니다.',
              seats: batchData.seats,
              used: batchData.used.length
            }), {
              status: 401, headers: { 'Content-Type': 'application/json' }
            });
          }

          // 신규 자리 배정
          const activatedAt = Date.now();
          const expiresAt = activatedAt + (batchData.days || 1) * 86400 * 1000;
          batchData.used.push({ deviceId, activatedAt, expiresAt });
          await this.ctx.storage.put('batch:' + rawId, batchData);
          if (this.batchStore) this.batchStore.set(rawId, batchData);
          await noteDevice(batchData.flags || 0x01, activatedAt, expiresAt);   // 묶음(관광) = 호스트 0x01

          return new Response(JSON.stringify({
            valid: true,
            activatedAt,
            expiresAt,
            seats: batchData.seats,
            used: batchData.used.length
          }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
          });
        }

        // B. 개별 코드 분기 ({ code, deviceId })
        if (code) {
          const v = verifyCode(code);
          if (!v.ok) {
            return new Response(JSON.stringify({ error: v.why || 'bad_sig', message: '코드 검증 실패' }), {
              status: 401, headers: { 'Content-Type': 'application/json' }
            });
          }

          const codeHash = crypto.createHash('sha256').update(String(code).trim()).digest('hex');
          let licRecord = await this.ctx.storage.get('lic:' + codeHash);
          if (!licRecord && this.licStore) licRecord = this.licStore.get(codeHash);

          if (licRecord) {
            // 같은 기기 재요청: 200 OK
            if (licRecord.deviceId === deviceId) {
              await noteDevice(licRecord.flags, licRecord.activatedAt, licRecord.expiresAt);
              return new Response(JSON.stringify({
                valid: true,
                activatedAt: licRecord.activatedAt,
                expiresAt: licRecord.expiresAt,
                flags: licRecord.flags,
                devices: { count: 1, limit: 1 }
              }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
              });
            } else {
              // 다른 기기: 401 too_many_devices (쿠폰 하나 = 기기 하나)
              return new Response(JSON.stringify({
                error: 'too_many_devices',
                message: '다른 기기에 이미 등록된 이용권입니다 (쿠폰 하나 = 기기 하나).',
                count: 1,
                limit: 1
              }), {
                status: 401, headers: { 'Content-Type': 'application/json' }
              });
            }
          }

          // 첫 등록
          const activatedAt = Date.now();
          /* 정본 [3..4] 기간(일): 있으면 등록 시각부터 센다, 0 이면 절대 만료(exp)만 (앱 effectiveExp 와 같은 셈) */
          const days = Number(v.claims.days) || 0;
          const expiresAt = days ? Math.min(activatedAt + days * 86400 * 1000, v.claims.exp * 1000) : v.claims.exp * 1000;
          licRecord = {
            deviceId,
            activatedAt,
            expiresAt,
            flags: v.claims.flags || 0x01
          };
          await this.ctx.storage.put('lic:' + codeHash, licRecord);
          if (this.licStore) this.licStore.set(codeHash, licRecord);
          await noteDevice(licRecord.flags, activatedAt, expiresAt);

          return new Response(JSON.stringify({
            valid: true,
            activatedAt,
            expiresAt,
            flags: licRecord.flags,
            devices: { count: 1, limit: 1 }
          }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ error: 'bad_request', message: 'code 또는 batch 가 필요합니다.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'server_error', message: err.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 0-1-A2. 기기의 살아 있는 이용권 플래그: GET /internal/license/device?deviceId=... (B-1)
    //   → { flags: OR(살아 있는 것), until: 그중 가장 이른 expiresAt(ms), count }. 없으면 flags 0.
    if (url.pathname === '/internal/license/device' && request.method === 'GET') {
      const deviceId = String(url.searchParams.get('deviceId') || '');
      if (!deviceId) {
        return new Response(JSON.stringify({ error: 'bad_request', message: 'deviceId is required' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      const deviceKey = 'dev:' + crypto.createHash('sha256').update(deviceId).digest('hex');
      const now = Date.now();
      const list = ((await this.ctx.storage.get(deviceKey)) || []).filter(e => e && e.expiresAt > now);
      let flags = 0, until = 0;
      for (const e of list) {
        flags |= Number(e.flags) || 0;
        until = until ? Math.min(until, e.expiresAt) : e.expiresAt;
      }
      return new Response(JSON.stringify({ flags, until, count: list.length }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-1-B. 묶음 QR 상태 조회: GET /internal/license/batch?batch=...
    if (url.pathname === '/internal/license/batch' && request.method === 'GET') {
      const rawId = String(url.searchParams.get('batch') || '').replace(/^b_/, '');
      let batchData = await this.ctx.storage.get('batch:' + rawId);
      if (!batchData && this.batchStore) batchData = this.batchStore.get(rawId);
      if (!batchData) {
        return new Response(JSON.stringify({ error: 'unknown_batch' }), {
          status: 404, headers: { 'Content-Type': 'application/json' }
        });
      }
      const now = Date.now();
      const oneDayAgo = now - 86400 * 1000;
      const todayCount = (batchData.used || []).filter(u => u.activatedAt >= oneDayAgo).length;
      return new Response(JSON.stringify({
        batchId: batchData.batchId,
        seats: batchData.seats,
        usedCount: (batchData.used || []).length,
        todayCount: todayCount,
        summaryText: `오늘 ${todayCount}명 / 총 ${batchData.seats}명`
      }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-1-C. 발급 기록 저장: POST /internal/license/issue_record
    if (url.pathname === '/internal/license/issue_record' && request.method === 'POST') {
      const body = await request.json();
      if (body.batchId) {
        const rawId = body.batchId.replace(/^b_/, '');
        await this.ctx.storage.put('batch:' + rawId, body);
        if (this.batchStore) this.batchStore.set(rawId, body);
      }
      if (body.codeHash) {
        await this.ctx.storage.put('issued:' + body.codeHash, body);
        if (this.issuedStore) this.issuedStore.set(body.codeHash, body);
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
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
      const { sub, target, chars = 0, sttKey = false, deskMinutes = 0, listenerBytes = 0, listenerCount = 0,
              pro_tokens_in = 0, pro_tokens_out = 0, pro_usd = 0, pro_day = null,
              asr_usd = 0, asr_day = null } = await request.json();
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
          total_listener_bytes: 0,
          total_listener_sessions: 0,
          avg_listener_bytes: 0,
          pro_tokens_in: 0,      // B 10 — 프로(LLM) 토큰. 원가 감시용, 과금 근거 아님
          pro_tokens_out: 0,
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

      // B 10 — 프로(LLM) 토큰은 **떨어졌어도** 센다. 부른 몫은 돈이다.
      if (pro_tokens_in > 0 || pro_tokens_out > 0) {
        record.pro_tokens_in = (record.pro_tokens_in || 0) + pro_tokens_in;
        record.pro_tokens_out = (record.pro_tokens_out || 0) + pro_tokens_out;
      }

      // 일일 상한이 읽는 칸 — 오늘 쓴 달러. 하루가 바뀌면 키가 바뀌어 저절로 0 부터다.
      // ⛔ 10-14 Gemini 476,423원 사고를 막는 자리다.
      if (pro_day && pro_usd > 0) {
        const spent = Number((await this.ctx.storage.get(pro_day)) || 0) + Number(pro_usd);
        await this.ctx.storage.put(pro_day, spent);
      }

      // B 22 — 사후 받아쓰기 일일 상한이 읽는 칸 (asr_usd:YYYY-MM-DD). 원가 감시용, 과금 근거 아님
      if (asr_day && asr_usd > 0) {
        const spent = Number((await this.ctx.storage.get(asr_day)) || 0) + Number(asr_usd);
        await this.ctx.storage.put(asr_day, spent);
      }

      if (listenerBytes > 0) {
        record.total_listener_bytes = (record.total_listener_bytes || 0) + listenerBytes;
        record.total_listener_sessions = (record.total_listener_sessions || 0) + (listenerCount || 1);
        record.avg_listener_bytes = Math.round(record.total_listener_bytes / Math.max(1, record.total_listener_sessions));
      }

      record.updated_at = now.toISOString();
      await this.ctx.storage.put(key, record);

      return new Response(JSON.stringify({ ok: true, month, sub }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-5. 내부 월별·코드별 사용량 조회 (/usage/summary)
    // 0-6. 내부 동시 기기 등록 및 한도 검사 (/devices/register)
    // 0-7. Desk 세션 멱등 저장 (/desk/session) - 바이트 단위 분할 저장 및 크기 상한
    if (url.pathname === '/desk/session' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { last, session, items, sub } = body;
      if (!last || !session || !Array.isArray(items)) {
        return new Response(JSON.stringify({ error: 'bad_params' }), { status: 400 });
      }

      const key = `desk:${last}`;
      const existing = await this.ctx.storage.get(key);
      if (existing) {
        return new Response(JSON.stringify({
          id: existing.id,
          last: existing.last
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const id = 'ds_' + (last ? last.slice(0, 8) : 'session');
      const encoder = new TextEncoder();
      const MAX_CHUNK_BYTES = 64 * 1024; // 64 KiB
      const MAX_SINGLE_ITEM_BYTES = 120 * 1024; // 120 KiB

      // items 분할: TextEncoder 바이트 단위로 정확히 측정하여 64 KiB 이하 청크 분할
      const chunks = [];
      let currentChunk = [];
      let currentBytes = 0;

      for (const item of items) {
        const itemJson = JSON.stringify(item);
        const itemBytes = encoder.encode(itemJson).length;

        // 120 KiB 초과 단일 항목 -> 413
        if (itemBytes > MAX_SINGLE_ITEM_BYTES) {
          return new Response(JSON.stringify({ why: 'item_too_large', max: MAX_SINGLE_ITEM_BYTES, size: itemBytes }), {
            status: 413,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // 단일 항목이 64 KiB 초과 (64~120 KiB): 단독 조각으로 분리
        if (itemBytes > MAX_CHUNK_BYTES) {
          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentBytes = 0;
          }
          chunks.push([item]);
          continue;
        }

        if (currentBytes + itemBytes > MAX_CHUNK_BYTES && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [item];
          currentBytes = itemBytes;
        } else {
          currentChunk.push(item);
          currentBytes += itemBytes;
        }
      }
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      // DO put 키 상한 128개 (헤더 1 + 조각 최대 127)
      if (chunks.length > 127) {
        return new Response(JSON.stringify({ why: 'too_large', max_chunks: 127, chunks: chunks.length }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const recordHeader = {
        id,
        last,
        sub: sub || null,
        code: session.code,
        host: session.host,
        lang: session.lang || 'ko',
        started: session.started,
        chunks: chunks.length,
        received_at: new Date().toISOString()
      };

      const putMap = {};
      putMap[key] = recordHeader;
      putMap[`desk_id:${id}`] = last;

      for (let i = 0; i < chunks.length; i++) {
        putMap[`desk:${last}:${i}`] = chunks[i];
      }

      // 사용자별 세션 목록 인덱싱 (최신 50개 유지)
      if (sub) {
        let subList = (await this.ctx.storage.get(`sub_sessions:${sub}`)) || [];
        if (!Array.isArray(subList)) subList = [];
        const itemSummary = {
          id,
          code: session.code,
          host: session.host,
          started: session.started,
          received_at: recordHeader.received_at,
          count: items.length
        };
        if (!subList.some(s => s.id === id)) {
          subList.unshift(itemSummary);
          if (subList.length > 50) subList = subList.slice(0, 50);
          putMap[`sub_sessions:${sub}`] = subList;
        }
      }

      await this.ctx.storage.put(putMap);

      return new Response(JSON.stringify({
        id,
        last
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-8. 내부 Desk 세션 목록 조회 (/desk/sessions) — 보관 기한(기본 30일) 자동 필터링
    if (url.pathname === '/desk/sessions' && request.method === 'GET') {
      const sub = url.searchParams.get('sub');
      if (!sub) {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
      }
      const keepDays = parseInt(this.env.DESK_KEEP_DAYS || '30', 10);
      const cutoff = Date.now() - (keepDays * 86400 * 1000);
      const rawList = (await this.ctx.storage.get(`sub_sessions:${sub}`)) || [];
      const validList = rawList.filter(item => !item.started || item.started >= cutoff);

      if (validList.length !== rawList.length) {
        await this.ctx.storage.put(`sub_sessions:${sub}`, validList);
      }
      return new Response(JSON.stringify(validList), { headers: { 'Content-Type': 'application/json' } });
    }

    // 0-9. 내부 Desk 단건 세션 상세 조회 (/desk/session/:id)
    if (url.pathname.startsWith('/desk/session/') && request.method === 'GET') {
      const id = url.pathname.slice('/desk/session/'.length);
      const sub = url.searchParams.get('sub');
      if (!id) {
        return new Response(JSON.stringify({ error: 'id_required' }), { status: 400 });
      }

      const last = await this.ctx.storage.get(`desk_id:${id}`);
      if (!last) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }

      const header = await this.ctx.storage.get(`desk:${last}`);
      if (!header || (sub && header.sub !== sub)) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }

      // 보관 기한(기본 30일) 검사
      const keepDays = parseInt(this.env.DESK_KEEP_DAYS || '30', 10);
      const cutoff = Date.now() - (keepDays * 86400 * 1000);
      if (header.started && header.started < cutoff) {
        return new Response(JSON.stringify({ error: 'expired' }), { status: 404 });
      }

      // 조각들을 순서대로 결합하여 items 복원
      const keys = Array.from({ length: header.chunks || 1 }, (_, i) => `desk:${last}:${i}`);
      const chunkMap = await this.ctx.storage.get(keys);
      let items = [];
      for (const k of keys) {
        const c = chunkMap.get(k);
        if (Array.isArray(c)) {
          items.push(...c);
        }
      }

      // 올린 그대로의 정본 JSON 형태 복원
      const fullSession = {
        ver: 1,
        session: {
          code: header.code,
          host: header.host,
          lang: header.lang || 'ko',
          started: header.started
        },
        items,
        last: header.last
      };

      return new Response(JSON.stringify(fullSession), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 0-9-1. 내부 Desk 세션 영구 삭제 (/desk/session/:id - DELETE)
    if (url.pathname.startsWith('/desk/session/') && request.method === 'DELETE') {
      const id = url.pathname.slice('/desk/session/'.length);
      const sub = url.searchParams.get('sub');
      if (!id) {
        return new Response(JSON.stringify({ error: 'id_required' }), { status: 400 });
      }

      const last = await this.ctx.storage.get(`desk_id:${id}`);
      if (!last) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }

      const header = await this.ctx.storage.get(`desk:${last}`);
      if (!header || (sub && header.sub !== sub)) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      }

      // 1) 청크 및 헤더, ID 인덱스 영구 삭제
      const keysToDelete = [`desk_id:${id}`, `desk:${last}`];
      for (let i = 0; i < (header.chunks || 1); i++) {
        keysToDelete.push(`desk:${last}:${i}`);
      }
      await this.ctx.storage.delete(keysToDelete);

      // 2) sub 세션 목록 인덱스에서도 제거
      if (header.sub) {
        const curList = (await this.ctx.storage.get(`sub_sessions:${header.sub}`)) || [];
        const nextList = curList.filter(item => item.id !== id);
        await this.ctx.storage.put(`sub_sessions:${header.sub}`, nextList);
      }

      return new Response(JSON.stringify({ ok: true, deleted: id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    if (url.pathname === '/devices/count' && request.method === 'GET') {
      const tokenHash = url.searchParams.get('tokenHash');
      const maxDevices = parseInt(url.searchParams.get('max') || '3', 10);
      if (!tokenHash) {
        return new Response(JSON.stringify({ count: 0, max: maxDevices }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const key = `devices:${tokenHash}`;
      const devices = (await this.ctx.storage.get(key)) || [];
      const count = Array.isArray(devices) ? devices.length : 0;
      return new Response(JSON.stringify({ count, max: maxDevices }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/usage/summary' && request.method === 'GET') {
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const month = url.searchParams.get('month') || currentMonth;
      const sub = url.searchParams.get('sub');

      // B 10 — 일일 상한이 읽는 칸 하나 (pro_usd:YYYY-MM-DD). 다른 칸은 보지 않는다.
      const oneKey = url.searchParams.get('key');
      if (oneKey) {
        if (!/^(pro_usd|asr_usd):\d{4}-\d{2}-\d{2}$/.test(oneKey)) {
          return new Response(JSON.stringify({ error: 'bad_key' }), { status: 400 });
        }
        const spent = Number((await this.ctx.storage.get(oneKey)) || 0);
        const asKey = oneKey.startsWith('asr_usd:') ? 'asr_usd' : 'pro_usd';
        return new Response(JSON.stringify({ key: oneKey, [asKey]: spent, keys: { [oneKey]: spent } }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

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
          pro_tokens_in: rec.pro_tokens_in || 0,
          pro_tokens_out: rec.pro_tokens_out || 0,
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
      /* B 3 — 방이 번역할 수 있나는 **방을 만든 라이선스**가 정한다. 깃발만 들고 있고
         토큰(비밀값)은 들고 있지 않는다 — 필요할 때 이 깃발로 짧게 만들어 쓴다. */
      this.licFlags = Number(body.flags || 0);
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
        licFlags: this.licFlags,
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
        if (!this.initialized) {
          return new Response('Forbidden: Room uninitialized', { status: 403 });
        }

        // 호스트 상한: 같은 방에 호스트 최대 2명 (W5 기본안: 한 방에 호스트 둘 허용)
        const currentHosts = this.ctx.getWebSockets('host').length;
        if (currentHosts >= 2) {
          return new Response('Too Many Requests: Host limit reached (2 max)', { status: 429 });
        }

        // 호스트 인증:
        // 1) 발급된 host_token 과 일치하거나,
        // 2) 이용권 토큰(License Token)인 경우: sub 가 이 방의 this.sub 와 일치하고 유효한 서명
        let authorized = false;
        if (token && token === this.hostToken) {
          authorized = true;
        } else if (token) {
          const secret = (this.env && this.env.LICENSE_SECRET ? this.env.LICENSE_SECRET : '').trim().replace(/^["']|["']$/g, '');
          const reqFlags = (this.kind === 'desk' || this.kind === 'script') ? (0x04 | 0x08) : 0x01;
          const fakeReq = new Request('http://internal', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const licRes = await verifyLicense(fakeReq, secret, reqFlags);
          if (licRes.valid && this.sub && licRes.payload.sub === this.sub) {
            authorized = true;
          }
        }

        if (!authorized) {
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
        if (this.askQueue && this.askQueue.length) {
          try {
            server.send(JSON.stringify({
              kind: 'ask_queue',
              count: this.askQueue.length,
              queue: this.askQueue.map(q => ({ id: q.id, seq: q.seq, name: q.name, lang: q.lang }))
            }));
          } catch (_) {}
        }
        if (this.activeAsk) {
          try { server.send(JSON.stringify({ kind: 'ask_active', ...this.activeAsk })); } catch (_) {}
        }
      } else {
        this.attSend(server);
        if (this.askQueue && this.askQueue.length) {
          try {
            server.send(JSON.stringify({ kind: 'ask_queue', queue: this.askQueue }));
          } catch (_) {}
        }
        if (this.activeAsk) {
          try { server.send(JSON.stringify({ kind: 'ask_active', ...this.activeAsk })); } catch (_) {}
        }
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
      const inBytes = typeof Buffer !== 'undefined' ? Buffer.byteLength(msgStr, 'utf8') : new TextEncoder().encode(msgStr).length;
      this.hostBytesIn = (this.hostBytesIn || 0) + inBytes;

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
        this.sendToListener(listenerWs, message);
      }

      // 호스트 둘(1:N 실시간 강사 컨트롤, W5): 다른 호스트(폰 마이크 / PC 컨트롤)에게도 중계 (자기 자신은 제외)
      for (const otherHostWs of this.ctx.getWebSockets('host')) {
        if (otherHostWs !== ws) {
          try {
            otherHostWs.send(message);
          } catch (e) {}
        }
      }

      // 무음(새 자막 줄 없음) 판정 기준: 호스트가 보낸 메시지에 text가 있고 end가 아닌 경우 새 자막으로 판정.
      // 원고 문단(kind:"script")도 새 줄이다 — 웹 강사 화면은 text 를 보내지 않으므로 여기서 세지 않으면 10분 뒤 끊긴다.
      let isSubtitleLine = false;
      let isEnd = false;
      let endSummary = null;
      let parsed = null;
      try {
        parsed = JSON.parse(msgStr);
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

      /* 방이 번역한다 (B 3 · 보조 길). 원문은 **위에서 이미** 전원에게 갔다 — 번역은
         늦게 그 언어 손님에게만 간다(R-15: 늦어도 남는 쪽). 되돌림 자리는 이 한 줄이다. */
      if (parsed) this.roomTrFromHost(parsed);

      if (parsed) {
        // N:1 질문 지명 및 종료 처리 (정본 wire-messages.json: grant, revoke 규격 완비)
        if (parsed.kind === 'grant' || parsed.kind === 'ask_grant') {
          if (this.activeAsk) {
            try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'already_active' })); } catch (_) {}
            return;
          }
          const target = (this.askQueue || []).find(q => q.id === parsed.id);
          if (target) {
            this.activeAsk = {
              id: target.id,
              seq: target.seq,
              name: target.name,
              lang: target.lang,
              text: target.text,
              src: target.src || target.text,
              trans: parsed.trans || {},
              grantedAt: Date.now()
            };
            if (this.askHistory) {
              const hItem = this.askHistory.find(h => h.id === target.id);
              if (hItem) hItem.status = 'granted';
            }

            // 정본 와이어 grant 메시지
            const grantWireMsg = JSON.stringify({
              kind: 'grant',
              id: target.id,
              seq: target.seq,
              name: target.name,
              lang: target.lang,
              max_sec: parsed.max_sec || 90,
              at: this.activeAsk.grantedAt
            });

            // 정본 와이어 question 메시지 (역번역 포함 배포)
            const questionWireMsg = JSON.stringify({
              kind: 'question',
              id: target.id,
              seq: target.seq,
              name: target.name,
              src: target.src || target.text,
              srcLang: target.lang,
              trans: parsed.trans || {},
              at: this.activeAsk.grantedAt
            });

            const activeMsg = JSON.stringify({ kind: 'ask_active', ...this.activeAsk });
            for (const listenerWs of this.ctx.getWebSockets('listener')) {
              try {
                listenerWs.send(grantWireMsg);
                listenerWs.send(questionWireMsg);
                listenerWs.send(activeMsg);
              } catch (_) {}
            }
            for (const hostWs of this.ctx.getWebSockets('host')) {
              try {
                hostWs.send(grantWireMsg);
                hostWs.send(questionWireMsg);
                hostWs.send(activeMsg);
              } catch (_) {}
            }
          }
          return;
        }

        if (parsed.kind === 'revoke' || parsed.kind === 'ask_close') {
          const askId = parsed.id || (this.activeAsk && this.activeAsk.id);
          const reason = parsed.reason || 'host_done';
          let askSeq = undefined;
          // 특허 독립항 핵심: 호스트가 건너뛰어 지명하고 종료해도 다른 요청자의 요청 사실과 순번은 영구 보존
          this.askQueue = (this.askQueue || []).filter(q => q.id !== askId);
          if (this.askHistory) {
            const hItem = this.askHistory.find(h => h.id === askId);
            if (hItem) {
              hItem.status = 'closed';
              hItem.reason = reason;
              hItem.closedAt = Date.now();
              askSeq = hItem.seq;
            }
          }
          this.activeAsk = null;

          // 정본 와이어 revoke 메시지
          const revokeWireMsg = JSON.stringify({
            kind: 'revoke',
            id: askId,
            seq: askSeq,
            reason: reason,
            at: Date.now()
          });

          const endMsg = JSON.stringify({ kind: 'ask_ended', id: askId, reason: reason, seq: askSeq });
          for (const listenerWs of this.ctx.getWebSockets('listener')) {
            try {
              listenerWs.send(revokeWireMsg);
              listenerWs.send(endMsg);
            } catch (_) {}
          }
          for (const hostWs of this.ctx.getWebSockets('host')) {
            try {
              hostWs.send(revokeWireMsg);
              hostWs.send(endMsg);
            } catch (_) {}
          }
          const queueHostMsg = JSON.stringify({ kind: 'ask_queue', queue: this.askQueue, history: this.askHistory });
          for (const hostWs of this.ctx.getWebSockets('host')) {
            try { hostWs.send(queueHostMsg); } catch (_) {}
          }
          const queueListMsg = JSON.stringify({
            kind: 'ask_queue',
            count: this.askQueue.length,
            queue: this.askQueue.map(q => ({ id: q.id, seq: q.seq, name: q.name, lang: q.lang }))
          });
          for (const listenerWs of this.ctx.getWebSockets('listener')) {
            try { listenerWs.send(queueListMsg); } catch (_) {}
          }
          return;
        }
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
        if ((this.listenerBytesOut > 0 || this.hostBytesIn > 0) && this.env && this.env.ROOM) {
          try {
            const limiterId = this.env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
            const limiter = this.env.ROOM.get(limiterId);
            const lisCount = (this.att && this.att.max) || this.ctx.getWebSockets('listener').length || 1;
            await limiter.fetch(new Request('http://internal/usage/record', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sub: this.sub || 'default',
                listenerBytes: this.listenerBytesOut || 0,
                hostBytes: this.hostBytesIn || 0,
                listenerCount: lisCount
              })
            }));
          } catch (_) {}
        }
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
      let parsed = null;
      try {
        parsed = JSON.parse(msgStr);
        if (parsed && parsed.hello && parsed.lang) await this.attSetLang(ws, parsed.lang);
      } catch (_) {}

      // N:1 참여자 질문 요청 (P-16 텍스트 질문만, P-14 참여자 번역 배제, B-3 도착 순번, 정본 ask)
      if (parsed && (parsed.kind === 'ask' || parsed.kind === 'ask_req')) {
        // P-14 자물쇠: 참여자는 번역하지 않는다 (trans 또는 tr 포함 시 거부)
        if (parsed.trans || parsed.tr) {
          try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'p14_participant_translation_forbidden' })); } catch (_) {}
          return;
        }

        this.askSeq = (this.askSeq || 0) + 1;
        const askItem = {
          id: parsed.id || ('q_' + this.askSeq + '_' + Math.random().toString(36).slice(2, 6)),
          seq: this.askSeq,
          name: parsed.name || '익명',
          lang: parsed.lang || 'ko',
          text: parsed.text || parsed.src || '',
          src: parsed.src || parsed.text || '',
          at: Date.now(),
          status: 'requested'
        };
        if (!this.askQueue) this.askQueue = [];
        if (!this.askHistory) this.askHistory = [];
        this.askQueue.push(askItem);
        this.askHistory.push({ ...askItem });
        // 손든 **그 소켓**을 표시한다. 질문 id 는 grant 로 방 전체에 나가므로 id 만으로는
        // 다른 청취자가 흉내낼 수 있다(7번 마이크 질문의 문). 쪽지는 합쳐서 쓴다(D-19).
        this.attPatch(ws, { askId: askItem.id });

        // 정본 와이어 ask 메시지 (docs/samples/wire-messages.json)
        const wireAskMsg = JSON.stringify({
          kind: 'ask',
          id: askItem.id,
          seq: askItem.seq,
          name: askItem.name,
          lang: askItem.lang,
          src: askItem.src,
          at: askItem.at
        });

        // 강사에게 전달 (정본 ask + 호환 ask_queue)
        const hostMsg = JSON.stringify({ kind: 'ask_queue', queue: this.askQueue, history: this.askHistory });
        for (const hostWs of this.ctx.getWebSockets('host')) {
          try {
            hostWs.send(wireAskMsg);
            hostWs.send(hostMsg);
          } catch (_) {}
        }

        // 청취자에게 전달 (정본 ask + 호환 ask_queue)
        const listMsg = JSON.stringify({
          kind: 'ask_queue',
          count: this.askQueue.length,
          queue: this.askQueue.map(q => ({ id: q.id, seq: q.seq, name: q.name, lang: q.lang }))
        });
        for (const listenerWs of this.ctx.getWebSockets('listener')) {
          try {
            listenerWs.send(wireAskMsg);
            listenerWs.send(listMsg);
          } catch (_) {}
        }
        return;
      }

      // 7번: 지명된 **브라우저 청취자의 마이크 질문** — 원문+언어만 올라온다.
      // 여기가 그 값을 **읽는 곳**이다. 이 가지가 없으면 청취자가 말한 말은 아래 두루길로
      // 호스트에게만 날것으로 가고(= 다른 청취자는 못 듣고, P-14 검사도 안 받고) 화면에는
      // 아무것도 안 나온다. 대표님 10-13 22:38: **질문도 답도 전원에게.**
      if (parsed && parsed.kind === 'question') {
        // P-14 자물쇠: 참여자는 번역하지 않는다 (ask 길과 같은 문)
        if (parsed.trans || parsed.tr) {
          try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'p14_participant_translation_forbidden' })); } catch (_) {}
          return;
        }
        // P-17 수동 지명: 지금 발언권을 받은 **그 소켓**만 말할 수 있다.
        // id 는 grant 로 방 전체에 나가므로 id 만 보면 흉내낼 수 있다 — 쪽지도 같이 본다.
        const mark = this.attMark(ws);
        const mine = mark && mark.askId;
        if (!this.activeAsk || !parsed.id || parsed.id !== this.activeAsk.id || mine !== parsed.id) {
          try { ws.send(JSON.stringify({ kind: 'ask_error', why: 'not_granted' })); } catch (_) {}
          return;
        }
        // §20 빈 답은 없음이 아니다 — 인식기는 빈 줄도 준다. 버리되 발언권은 그대로 둔다.
        const spoken = typeof parsed.src === 'string' ? parsed.src.trim() : '';
        if (!spoken) return;

        // 기록에 남긴다 — 리포트가 읽는 곳이 askHistory 다(R-15 유실 > 지연).
        this.activeAsk.src = spoken;
        this.activeAsk.text = spoken;
        if (this.askHistory) {
          const hItem = this.askHistory.find(h => h.id === parsed.id);
          if (hItem) {
            hItem.src = spoken;
            hItem.text = spoken;
            hItem.spokenAt = Date.now();
          }
        }

        // 정본 와이어 question (docs/samples/wire-messages.json) — 번역 칸은 **싣지 않는다**(P-14).
        const spokenMsg = JSON.stringify({
          kind: 'question',
          id: this.activeAsk.id,
          seq: this.activeAsk.seq,
          name: this.activeAsk.name,
          src: spoken,
          srcLang: this.activeAsk.lang || parsed.srcLang || 'ko',
          at: Date.now()
        });
        for (const hostWs of this.ctx.getWebSockets('host')) {
          try { hostWs.send(spokenMsg); } catch (_) {}
        }
        for (const listenerWs of this.ctx.getWebSockets('listener')) {
          try { listenerWs.send(spokenMsg); } catch (_) {}
        }
        return;
      }

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
    if (tags.includes('listener') && this.activeAsk) {
      // 발언 중인 청취자 단절 감지 시 사유 disconnect 기록 및 회수
      const askId = this.activeAsk.id;
      if (this.askHistory) {
        const hItem = this.askHistory.find(h => h.id === askId);
        if (hItem) {
          hItem.status = 'closed';
          hItem.reason = 'disconnect';
          hItem.closedAt = Date.now();
        }
      }
      this.askQueue = (this.askQueue || []).filter(q => q.id !== askId);
      this.activeAsk = null;
      const endMsg = JSON.stringify({ kind: 'ask_ended', id: askId, reason: 'disconnect' });
      for (const hostWs of this.ctx.getWebSockets('host')) {
        try { hostWs.send(endMsg); } catch (_) {}
      }
      for (const listenerWs of this.ctx.getWebSockets('listener')) {
        try { listenerWs.send(endMsg); } catch (_) {}
      }
    }
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
