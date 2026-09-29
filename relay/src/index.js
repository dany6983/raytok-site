export { Room } from './room.js';

// Crockford Base32 (I, L, O, U 제외 32자)
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateCrockfordCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CROCKFORD_ALPHABET[bytes[i] % 32];
  }
  return code;
}

function generateHostToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 1. 방 생성: POST /room -> { code, host_token }
    if (url.pathname === '/room' && request.method === 'POST') {
      const code = generateCrockfordCode(6);
      const host_token = generateHostToken();

      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);

      await room.fetch(new Request('http://internal/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, host_token })
      }));

      return new Response(JSON.stringify({ code, host_token }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 2. 방 정보 조회: GET /room/CODE -> { exists, listeners, started_at }
    if (url.pathname.startsWith('/room/') && request.method === 'GET') {
      const code = url.pathname.slice('/room/'.length).toUpperCase();
      if (!code) {
        return new Response('Bad Request: Room code required', { status: 400 });
      }
      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);

      const res = await room.fetch(new Request('http://internal/info'));
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 3. WebSocket 중계: GET /ws?room=CODE&role=...
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }

      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (!code) {
        return new Response('Bad Request: room parameter required', { status: 400 });
      }

      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);

      return room.fetch(request);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
