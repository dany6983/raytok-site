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
      const stored = await this.ctx.storage.get(['hostToken', 'startedAt', 'code', 'ringBuffer', 'initialized']);
      if (stored.get('initialized')) {
        this.initialized = true;
        this.hostToken = stored.get('hostToken') || null;
        this.startedAt = stored.get('startedAt') || null;
        this.code = stored.get('code') || null;
        this.ringBuffer = stored.get('ringBuffer') || [];
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 1. 내부 초기화 호출
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json();
      this.code = body.code;
      this.hostToken = body.host_token;
      this.startedAt = new Date().toISOString();
      this.initialized = true;
      this.ringBuffer = [];
      await this.ctx.storage.put({
        code: this.code,
        hostToken: this.hostToken,
        startedAt: this.startedAt,
        initialized: true,
        ringBuffer: []
      });
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
      for (const listenerWs of this.ctx.getWebSockets('listener')) {
        try {
          listenerWs.send(message);
        } catch (e) {}
      }

      // 호스트가 end 보내면 전원 전달 후 5초 뒤 청취자 close(1000)
      let isEnd = false;
      try {
        const parsed = JSON.parse(msgStr);
        if (parsed.end) isEnd = true;
      } catch (e) {
        if (/"end"\s*:\s*1/.test(msgStr)) isEnd = true;
      }

      if (isEnd) {
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
    // 10분 대기 후에도 호스트가 없으면 자동 end
    if (this.ctx.getWebSockets('host').length === 0) {
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
    }
  }
}
