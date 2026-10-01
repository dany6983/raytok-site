export { Room } from './room.js';
import { verifyLicense, mintLicense, computeSub } from './license.js';

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
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'X-Cache, X-Cache-Hits, X-Upstream-Count, X-Upstream-Chars'
};

// Rate limiting: per key (sub / IP)
const rateLimitMap = new Map();

function checkRateLimit(key, limit = 60) {
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + 60000 };
    rateLimitMap.set(key, entry);
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count++;
  return true;
}

// License issue rate limiting: max 5 per day per sub
const issueLimitMap = new Map();

function checkIssueLimit(sub) {
  const now = Date.now();
  let entry = issueLimitMap.get(sub);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + 86400000 }; // 24 hours
    issueLimitMap.set(sub, entry);
    return true;
  }
  if (entry.count >= 5) {
    return false;
  }
  entry.count++;
  return true;
}

// In-memory fallback cache if Cache API is unavailable
const memoryCache = new Map();

// Compute normalized cache key: https://${host}/__cache/tr/<sha256>
async function computeCacheKey(host, source, target, text) {
  const input = `${source || ''}|${target}|${text}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return `https://${host}/__cache/tr/${hex}`;
}

const LANG_CODE_REGEX = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/;

function jsonError(code, message, status = 400, extra = {}) {
  return new Response(JSON.stringify({ error: code, message, ...extra }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // 0. 토큰 발급 엔드포인트: POST /license/issue (부트스트랩 허용)
    if (url.pathname === '/license/issue' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return jsonError('bad_request', 'Invalid JSON body', 400);
      }

      const { device } = body || {};
      if (!device || typeof device !== 'string' || device.trim().length === 0) {
        return jsonError('bad_request', 'device is required', 400);
      }

      const salt = (env.LICENSE_SALT || '').trim().replace(/^["']|["']$/g, '');
      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      if (!salt || !secret) {
        return jsonError('upstream', 'Server configuration error: missing salt or secret', 500);
      }

      // IP 추출 (로그에는 IP를 남기지 않고 카운터 키로만 사용)
      const clientIp = request.headers.get('CF-Connecting-IP') ||
                       request.headers.get('X-Forwarded-For') ||
                       '127.0.0.1';

      // 1. IP당 제한: 하루 20회 (초과 시 429 { error: 'rate_limited', scope: 'ip' })
      let ipAllowed = true;
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const limitRes = await limiter.fetch(new Request('http://internal/limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `issue_ip:${clientIp}`, limit: 20, windowMs: 86400000 })
        }));
        if (limitRes.ok) {
          const lData = await limitRes.json();
          ipAllowed = lData.allowed;
        }
      } catch (_) {
        ipAllowed = checkRateLimit(`issue_ip:${clientIp}`, 20);
      }

      if (!ipAllowed) {
        return jsonError('rate_limited', 'Daily license issuance limit reached for IP (20 per day)', 429, { scope: 'ip' });
      }

      // sha256(device + LICENSE_SALT) -> sub (원본은 저장·기록하지 않음)
      const sub = await computeSub(device.trim(), salt);

      // 2. device(sub)당 제한: 하루 5회 (초과 시 429)
      let subAllowed = true;
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const limitRes = await limiter.fetch(new Request('http://internal/limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `issue_sub:${sub}`, limit: 5, windowMs: 86400000 })
        }));
        if (limitRes.ok) {
          const lData = await limitRes.json();
          subAllowed = lData.allowed;
        }
      } catch (_) {
        subAllowed = checkIssueLimit(sub);
      }

      if (!subAllowed) {
        return jsonError('rate_limited', 'Daily license issuance limit reached for device (max 5 per day)', 429, { scope: 'device' });
      }

      // 발급 토큰: exp = 30일, flags = 0x02 (camera)
      const { token, exp } = await mintLicense(sub, 30, 0x02, secret);

      return new Response(JSON.stringify({ token, exp }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 0-0. 관리자 특정 IP 레이트 리밋 리셋: POST /limit/reset
    if (url.pathname === '/limit/reset' && request.method === 'POST') {
      const adminSecret = (env.ADMIN_SECRET || '').trim();
      if (!adminSecret) {
        return jsonError('upstream', 'Server configuration error: ADMIN_SECRET is not configured', 500);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const customSecret = request.headers.get('X-Admin-Secret') || '';
      const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : customSecret.trim();

      if (providedSecret !== adminSecret) {
        return jsonError('unauthorized', 'Invalid admin secret', 401);
      }

      // 엔드포인트 자체 한도: 하루 10회
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const adminLimitRes = await limiter.fetch(new Request('http://internal/limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'global:admin_reset_daily', limit: 10, windowMs: 86400000 })
        }));
        if (adminLimitRes.ok) {
          const aData = await adminLimitRes.json();
          if (!aData.allowed) {
            return jsonError('rate_limited', 'Admin reset daily quota exceeded (max 10 per day)', 429);
          }
        }
      } catch (_) {}

      let body;
      try {
        body = await request.json();
      } catch (_) {
        return jsonError('bad_request', 'Invalid JSON body', 400);
      }

      const { ip } = body || {};
      if (!ip || typeof ip !== 'string' || ip.trim().length === 0 || ip.includes('*')) {
        return jsonError('bad_request', 'A single valid IP address is required', 400);
      }
      const targetIp = ip.trim();

      // 특정 IP 리셋 실행 (DO 내부)
      const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
      const limiter = env.ROOM.get(limiterId);
      await limiter.fetch(new Request('http://internal/limit/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: targetIp })
      }));

      // 로컬 fallback 맵도 함께 정리
      rateLimitMap.delete(`issue_ip:${targetIp}`);
      rateLimitMap.delete(`ip:${targetIp}`);

      // 로그 남기기: 언제 어느 IP를 지웠는지
      console.log(`[ADMIN_RESET] ${new Date().toISOString()} reset limits for IP: ${targetIp}`);

      return new Response(JSON.stringify({ ok: true, reset_ip: targetIp }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 0-1. 번역 엔드포인트: POST /translate
    if (url.pathname === '/translate' && request.method === 'POST') {
      // 1) 라이선스 토큰 검증: 0x02 (camera) 또는 0x04 (meet) 필요
      const licenseRes = await verifyLicense(request, env.LICENSE_SECRET, 0x02 | 0x04);
      if (!licenseRes.valid) {
        return jsonError(licenseRes.error, licenseRes.message, licenseRes.status);
      }

      // 2) Rate Limit: 토큰 sub당 분당 60회 (Durable Object로 전역 카운팅 보장)
      const sub = licenseRes.payload.sub;
      let subAllowed = true;
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const limitRes = await limiter.fetch(new Request('http://internal/limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `sub:${sub}`, limit: 60, windowMs: 60000 })
        }));
        if (limitRes.ok) {
          const lData = await limitRes.json();
          subAllowed = lData.allowed;
        }
      } catch (_) {
        subAllowed = checkRateLimit(`sub:${sub}`, 60);
      }

      if (!subAllowed) {
        return jsonError('rate_limited', 'Rate limit exceeded for token subject (60 requests per minute)', 429);
      }

      // IP당 분당 200회 보조 한도 (Durable Object로 전역 카운팅 보장)
      const clientIp = request.headers.get('CF-Connecting-IP') ||
                       request.headers.get('X-Forwarded-For') ||
                       '127.0.0.1';
      let ipAllowed = true;
      let ipCount = 0;
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const limitRes = await limiter.fetch(new Request('http://internal/limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: `ip:${clientIp}`, limit: 200, windowMs: 60000 })
        }));
        if (limitRes.ok) {
          const lData = await limitRes.json();
          ipAllowed = lData.allowed;
          ipCount = lData.count;
        }
      } catch (_) {
        ipAllowed = checkRateLimit(`ip:${clientIp}`, 200);
      }

      if (!ipAllowed) {
        return jsonError('rate_limited', 'Rate limit exceeded for IP (200 requests per minute)', 429, { scope: 'ip', count: ipCount });
      }

      // 3) Body parsing
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return jsonError('bad_lang', 'Invalid JSON body', 400);
      }

      const { q, source, target } = body || {};

      // 4) q 배열 검사 (최대 50개, 합계 5000자)
      if (!Array.isArray(q) || q.length === 0 || q.length > 50) {
        return jsonError('too_many', 'q must be an array with 1 to 50 items', 400);
      }

      let totalChars = 0;
      for (let i = 0; i < q.length; i++) {
        if (typeof q[i] !== 'string') {
          return jsonError('too_many', 'All items in q must be strings', 400);
        }
        totalChars += q[i].length;
      }

      if (totalChars > 5000) {
        return jsonError('too_long', 'Total characters in q cannot exceed 5000', 400);
      }

      // 5) 언어 코드 검사
      if (!target || typeof target !== 'string' || !LANG_CODE_REGEX.test(target.trim())) {
        return jsonError('bad_lang', 'Invalid or missing target language', 400);
      }
      const targetLang = target.trim();

      let sourceLang = null;
      if (source) {
        if (typeof source !== 'string' || !LANG_CODE_REGEX.test(source.trim())) {
          return jsonError('bad_lang', 'Invalid source language', 400);
        }
        sourceLang = source.trim();
      }

      // 6) 캐시 조회 (Workers Cache API + Memory Fallback)
      let cache = null;
      try {
        if (typeof caches !== 'undefined' && caches.default) {
          cache = caches.default;
        }
      } catch (_) {}

      const results = new Array(q.length);
      const uncachedIndices = [];
      const uncachedTexts = [];
      let detectedSrc = sourceLang || null;

      for (let i = 0; i < q.length; i++) {
        const text = q[i];
        if (text.length === 0) {
          results[i] = '';
          continue;
        }

        const cacheUrl = await computeCacheKey(url.host, sourceLang, targetLang, text);
        let cachedVal = null;

        if (cache) {
          try {
            const matchRes = await cache.match(new Request(cacheUrl));
            if (matchRes) {
              const raw = await matchRes.text();
              try {
                cachedVal = JSON.parse(raw);
              } catch (_) {
                cachedVal = { t: raw, src: sourceLang };
              }
            }
          } catch (_) {}
        } else {
          const rawMem = memoryCache.get(cacheUrl);
          if (rawMem) {
            try {
              cachedVal = JSON.parse(rawMem);
            } catch (_) {
              cachedVal = { t: rawMem, src: sourceLang };
            }
          }
        }

        if (cachedVal !== null && cachedVal.t !== undefined) {
          results[i] = cachedVal.t;
          if (!detectedSrc && cachedVal.src) {
            detectedSrc = cachedVal.src;
          }
        } else {
          uncachedIndices.push(i);
          uncachedTexts.push(text);
        }
      }

      // 7) 상류(Google Translate v3 REST) 호출 (미적중분 1회 묶음 발송)
      let upstreamCount = 0;
      let upstreamChars = 0;

      if (uncachedTexts.length > 0) {
        upstreamCount = 1;
        upstreamChars = uncachedTexts.reduce((sum, s) => sum + s.length, 0);

        const apiKey = (env.GOOGLE_TRANSLATE_KEY || '').trim().replace(/^["']|["']$/g, '');
        if (!apiKey) {
          return jsonError('upstream', 'GOOGLE_TRANSLATE_KEY is not configured', 500);
        }

        const apiUrl = 'https://translation.googleapis.com/language/translate/v2?key=' + apiKey;
        const requestPayload = {
          q: uncachedTexts,
          target: targetLang,
          format: 'text'
        };
        if (sourceLang) {
          requestPayload.source = sourceLang;
        }

        let apiRes;
        try {
          apiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });
        } catch (fetchErr) {
          return jsonError('upstream', 'Failed to connect to translation upstream: ' + fetchErr.message, 502);
        }

        if (!apiRes.ok) {
          let errBody = {};
          try { errBody = await apiRes.json(); } catch (_) {}
          const errMsg = errBody?.error?.message || `Upstream error (${apiRes.status})`;

          if (apiRes.status === 400 && errMsg.toLowerCase().includes('language')) {
            return jsonError('bad_lang', errMsg, 400);
          }
          return jsonError('upstream', errMsg, 502);
        }

        let apiData;
        try {
          apiData = await apiRes.json();
        } catch (_) {
          return jsonError('upstream', 'Invalid JSON from upstream', 502);
        }

        const translations = apiData?.data?.translations;
        if (!Array.isArray(translations) || translations.length !== uncachedTexts.length) {
          return jsonError('upstream', 'Upstream response length mismatch', 502);
        }

        // 상류가 감지한 언어 코드 추출
        if (!detectedSrc && translations[0]?.detectedSourceLanguage) {
          detectedSrc = translations[0].detectedSourceLanguage;
        }

        // 결과 병합 및 캐시 저장 (TTL 30일 = 2,592,000초, JSON 포맷 { t, src })
        for (let k = 0; k < translations.length; k++) {
          const originalIdx = uncachedIndices[k];
          const transItem = translations[k];
          const transText = transItem.translatedText;
          const itemSrc = sourceLang || transItem.detectedSourceLanguage || detectedSrc || 'unknown';
          results[originalIdx] = transText;

          const cacheEntry = { t: transText, src: itemSrc };
          const cacheUrl = await computeCacheKey(url.host, sourceLang, targetLang, uncachedTexts[k]);
          const cacheValStr = JSON.stringify(cacheEntry);

          if (cache) {
            const saveRes = new Response(cacheValStr, {
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=2592000'
              }
            });
            const putPromise = cache.put(new Request(cacheUrl), saveRes).catch(() => {});
            if (ctx && ctx.waitUntil) {
              ctx.waitUntil(putPromise);
            }
          } else {
            memoryCache.set(cacheUrl, cacheValStr);
          }
        }
      }

      // 8) 캐시 판정 헤더 계산
      const hits = q.length - uncachedTexts.length;
      let xCache = 'MISS';
      if (hits === q.length) {
        xCache = 'HIT';
      } else if (hits > 0) {
        xCache = 'PARTIAL';
      }

      const responseHeaders = {
        'Content-Type': 'application/json',
        'X-Cache': xCache,
        'X-Cache-Hits': String(hits),
        'X-Upstream-Count': String(upstreamCount),
        'X-Upstream-Chars': String(upstreamChars),
        ...CORS_HEADERS
      };

      const finalSrc = detectedSrc || sourceLang || 'unknown';

      return new Response(JSON.stringify({ t: results, src: finalSrc }), {
        status: 200,
        headers: responseHeaders
      });
    }

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

      return room.fetch(new Request('http://internal/info'));
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
