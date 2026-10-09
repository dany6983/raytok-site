
const ALLOWED_BODY_KEYS = new Set(['ver', 'session', 'items', 'last']);
const ALLOWED_SESSION_KEYS = new Set(['code', 'host', 'lang', 'started']);
const ALLOWED_ITEM_KEYS = {
  common: new Set(['n', 'ts', 'kind', 'prev', 'hash']),
  begin: new Set(['session', 'host', 'lang']),
  line: new Set(['seq', 'src', 'text', 'tr', 'via']),
  tr: new Set(['seq', 'tr']),
  replace: new Set(['seq', 'text', 'tr', 'via']),
  join: new Set(['dev', 'name', 'lang']),
  leave: new Set(['dev', 'why']),
  gap: new Set(['dev', 'from', 'to']),
  gap_fill: new Set(['dev', 'from', 'to']),
  note: new Set(['text']),
  end: new Set(['lines', 'minutes', 'joined_max'])
};

function sortKeysDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeysDeep(obj[k]);
  }
  return sorted;
}

function normalizeDeskItem(item) {
  const copy = { ...item };
  delete copy.hash;
  return JSON.stringify(sortKeysDeep(copy));
}

function validateDeskSessionKeys(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  for (const k of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(k)) return false;
  }
  if (!body.session || typeof body.session !== 'object') return false;
  for (const k of Object.keys(body.session)) {
    if (!ALLOWED_SESSION_KEYS.has(k)) return false;
  }
  if (!Array.isArray(body.items)) return false;
  for (const it of body.items) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return false;
    const kind = it.kind;
    const kindKeys = ALLOWED_ITEM_KEYS[kind];
    if (!kindKeys) return false;
    for (const k of Object.keys(it)) {
      if (!ALLOWED_ITEM_KEYS.common.has(k) && !kindKeys.has(k)) return false;
    }
  }
  return true;
}

async function verifyDeskHashChain(data) {
  if (data.ver !== 1) return { ok: false, why: 'chain', at: 0 };
  const items = data.items;
  if (!Array.isArray(items) || items.length === 0) return { ok: false, why: 'chain', at: 0 };

  const zero64 = '0'.repeat(64);
  let prevHash = zero64;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const expectedN = i + 1;
    if (it.n !== expectedN) return { ok: false, why: 'chain', at: expectedN };
    if (it.prev !== prevHash) return { ok: false, why: 'chain', at: it.n };

    const normStr = normalizeDeskItem(it);
    const inputStr = it.prev + '\n' + normStr;
    const computedHash = await sha256Hex(inputStr);
    if (it.hash !== computedHash) return { ok: false, why: 'chain', at: it.n };

    prevHash = it.hash;
  }

  if (data.last !== prevHash) {
    return { ok: false, why: 'chain', at: items.length };
  }
  return { ok: true, last: prevHash };
}
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str || '');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

// 이 플래그가 있는 토큰의 번역은 캐시에 두지 않는다 (0x04 meet · 0x08 desktop)
const NO_STORE_FLAGS = 0x04 | 0x08;

// In-memory fallback cache if Cache API is unavailable
const memoryCache = new Map();
const memoryEngineStats = new Map();

// Compute normalized cache key: https://${host}/__cache/tr/<engine>/<sha256>
async function computeCacheKey(host, engine, source, target, text) {
  const input = `${engine}|${source || ''}|${target}|${text}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return `https://${host}/__cache/tr/${engine}/${hex}`;
}

async function recordEngineCall(env, engine, success) {
  try {
    const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
    const limiter = env.ROOM.get(limiterId);
    await limiter.fetch(new Request('http://internal/metric/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, success })
    }));
  } catch (_) {
    let stat = memoryEngineStats.get(engine);
    if (!stat) {
      stat = { calls: 0, failures: 0 };
      memoryEngineStats.set(engine, stat);
    }
    stat.calls++;
    if (!success) stat.failures++;
  }
}

async function recordUsage(env, { sub, target, chars = 0, sttKey = false, deskMinutes = 0 }) {
  if (!sub) return;
  try {
    const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
    const limiter = env.ROOM.get(limiterId);
    await limiter.fetch(new Request('http://internal/usage/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub, target, chars, sttKey, deskMinutes })
    }));
  } catch (_) {}
}

// Translation Engine Adapter
async function callEngineOnce(engine, texts, sourceLang, targetLang, env) {
  if (engine === 'self') {
    const selfUrl = (env.SELF_TRANSLATE_URL || '').trim();
    if (!selfUrl) {
      const err = new Error('SELF_TRANSLATE_URL is not configured');
      err.code = 'upstream';
      err.status = 503;
      err.why = 'self_not_configured';
      throw err;
    }
    let res;
    try {
      res = await fetch(selfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: texts, source: sourceLang, target: targetLang })
      });
    } catch (e) {
      const err = new Error('Failed to connect to self translate upstream: ' + e.message);
      err.code = 'upstream';
      err.status = 502;
      err.why = 'self_fetch_error';
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`Self translate upstream error: ${res.status}`);
      err.code = 'upstream';
      err.status = 502;
      err.upstreamStatus = res.status;
      err.why = `self_${res.status}`;
      throw err;
    }
    const data = await res.json();
    const rawList = data.t || data.translations || [];
    return {
      translations: rawList.map(item => typeof item === 'string' ? { translatedText: item } : item),
      detectedSrc: data.src || null
    };
  }

  if (engine === 'mock') {
    return {
      translations: texts.map(t => ({ translatedText: `[mock] ${t}` })),
      detectedSrc: sourceLang || 'ko'
    };
  }

  // Default: google
  const apiKey = (env.GOOGLE_TRANSLATE_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    const err = new Error('GOOGLE_TRANSLATE_KEY is not configured');
    err.code = 'upstream';
    err.status = 500;
    err.why = 'google_key_missing';
    throw err;
  }

  const apiUrl = (env.GOOGLE_TRANSLATE_URL || 'https://translation.googleapis.com/language/translate/v2') + '?key=' + apiKey;
  const requestPayload = {
    q: texts,
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
    const err = new Error('Failed to connect to translation upstream: ' + fetchErr.message);
    err.code = 'upstream';
    err.status = 502;
    err.why = 'google_fetch_error';
    throw err;
  }

  if (!apiRes.ok) {
    let errBody = {};
    try { errBody = await apiRes.json(); } catch (_) {}
    const errMsg = errBody?.error?.message || `Upstream error (${apiRes.status})`;
    const err = new Error(errMsg);
    if (apiRes.status === 400 && errMsg.toLowerCase().includes('language')) {
      err.code = 'bad_lang';
      err.status = 400;
      err.why = 'google_bad_lang';
    } else {
      err.code = 'upstream';
      err.status = 502;
      err.upstreamStatus = apiRes.status;
      err.why = `google_${apiRes.status}`;
    }
    throw err;
  }

  let apiData;
  try {
    apiData = await apiRes.json();
  } catch (_) {
    const err = new Error('Invalid JSON from upstream');
    err.code = 'upstream';
    err.status = 502;
    err.why = 'google_invalid_json';
    throw err;
  }

  const translations = apiData?.data?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    const err = new Error('Upstream response length mismatch');
    err.code = 'upstream';
    err.status = 502;
    err.why = 'google_length_mismatch';
    throw err;
  }

  const detectedSrc = translations[0]?.detectedSourceLanguage || null;
  return {
    translations,
    detectedSrc
  };
}

function isRetryableEngineError(err) {
  if (!err) return false;
  // 설정 오류는 즉시 던짐
  if (err.why === 'google_key_missing' || err.why === 'self_not_configured') return false;
  // 위쪽 4xx (429 포함)는 바로 던짐 (429에 재시도하면 더 막힌다)
  const status = Number(err.upstreamStatus || err.status || 0);
  if (status >= 400 && status < 500) return false;
  if (err.code === 'bad_lang') return false;
  // 재시도 대상: 5xx, 네트워크 연결 실패, length_mismatch, invalid_json
  if (status >= 500 && status < 600) return true;
  if (err.why && (err.why.includes('fetch_error') || err.why === 'google_length_mismatch' || err.why === 'google_invalid_json')) return true;
  return false;
}

// 릴레이 1회 재시도 (일시 장애만: 5xx·연결 실패·length_mismatch)
async function callEngine(engine, texts, sourceLang, targetLang, env) {
  try {
    return await callEngineOnce(engine, texts, sourceLang, targetLang, env);
  } catch (firstErr) {
    if (!isRetryableEngineError(firstErr)) {
      throw firstErr;
    }
    // 짧은 대기 (250ms) 후 1회 재시도
    await new Promise(resolve => setTimeout(resolve, 250));
    try {
      return await callEngineOnce(engine, texts, sourceLang, targetLang, env);
    } catch (secondErr) {
      throw secondErr;
    }
  }
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
      const clientIp = request.headers.get('CF-Connecting-IP') ||
                       request.headers.get('X-Forwarded-For') ||
                       '127.0.0.1';

      // 1) 보안: 비밀값 무차별 대입(브루트포스) 방지를 위해 시크릿 검증 전 엔드포인트 자체 한도 검사를 선행 실행
      // 전역 시도 한도 (하루 10회)
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
      } catch (_) {
        if (!checkRateLimit(`admin_reset_ip:${clientIp}`, 5)) {
          return jsonError('rate_limited', 'Too many admin reset attempts from this IP', 429);
        }
      }

      // 2) 시크릿 설정 여부 검사
      const adminSecret = (env.ADMIN_SECRET || '').trim();
      if (!adminSecret) {
        return jsonError('admin_disabled', 'Admin reset is disabled (ADMIN_SECRET not configured)', 503);
      }

      // 3) 시크릿 일치 검증
      const authHeader = request.headers.get('Authorization') || '';
      const customSecret = request.headers.get('X-Admin-Secret') || '';
      const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : customSecret.trim();

      if (providedSecret !== adminSecret) {
        return jsonError('unauthorized', 'Invalid admin secret', 401);
      }

      // 4) 바디 파싱 및 단일 IP 검증 (전체 초기화 및 와일드카드 금지)
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

      // 5) 특정 IP 리셋 실행 (DO 내부)
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

      // 6) 감사 로그 남기기: 언제 어느 IP를 지웠는지
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
        // 0-0. 라이선스 검증 및 기기 등록 엔드포인트: POST /license/verify
    // 0-0-1. Desk 세션 저장 엔드포인트: POST /desk/session
    if (url.pathname === '/desk/session' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const licenseRes = await verifyLicense(request, secret);

      if (!licenseRes.valid) {
        return new Response(JSON.stringify({ why: 'token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // 플래그 검사: 0x08 (Desk) 필수
      const flags = Number(licenseRes.payload.flags || 0);
      if ((flags & 0x08) === 0) {
        return new Response(JSON.stringify({ why: 'forbidden', message: 'Desk flag 0x08 required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // 몸통 파싱 및 키 검사
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return new Response(JSON.stringify({ why: 'bad_key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      if (!validateDeskSessionKeys(body)) {
        return new Response(JSON.stringify({ why: 'bad_key' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // 해시 체인 다시 세기 검증
      const chainRes = await verifyDeskHashChain(body);
      if (!chainRes.ok) {
        return new Response(JSON.stringify({ why: chainRes.why, at: chainRes.at }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // 멱등 저장 및 ID 발급 (GLOBAL_RATE_LIMITER DO 경유)
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const storeRes = await limiter.fetch(new Request('http://internal/desk/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            last: chainRes.last,
            session: body.session,
            items: body.items,
            sub: licenseRes.payload.sub
          })
        }));

        if (storeRes.ok) {
          const storeData = await storeRes.json();
          return new Response(JSON.stringify({
            id: storeData.id,
            last: chainRes.last
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        } else {
          const errData = await storeRes.json().catch(() => ({}));
          const status = storeRes.status || 503;
          return new Response(JSON.stringify(errData.why ? errData : { why: 'store', error: 'storage_error' }), {
            status,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }
      } catch (e) {
        console.warn('[Desk Session Store Error]:', e.message);
        return new Response(JSON.stringify({ why: 'store', error: 'storage_error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
    }

    // 0-0-2. Desk 세션 목록 조회: GET /desk/sessions (주인 세션 최신 50개)
    if (url.pathname === '/desk/sessions' && request.method === 'GET') {
      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const licenseRes = await verifyLicense(request, secret);
      if (!licenseRes.valid) {
        return new Response(JSON.stringify({ why: 'token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
      const flags = Number(licenseRes.payload.flags || 0);
      if ((flags & 0x08) === 0) {
        return new Response(JSON.stringify({ why: 'forbidden', message: 'Desk flag 0x08 required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
      const limiter = env.ROOM.get(limiterId);
      const res = await limiter.fetch(new Request('http://internal/desk/sessions?sub=' + encodeURIComponent(licenseRes.payload.sub)));
      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // 0-0-3. Desk 단건 세션 상세 조회: GET /desk/session/:id (정본 원형 복원, 남의 세션 404)
    if (url.pathname.startsWith('/desk/session/') && request.method === 'GET') {
      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const licenseRes = await verifyLicense(request, secret);
      if (!licenseRes.valid) {
        return new Response(JSON.stringify({ why: 'token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
      const flags = Number(licenseRes.payload.flags || 0);
      if ((flags & 0x08) === 0) {
        return new Response(JSON.stringify({ why: 'forbidden', message: 'Desk flag 0x08 required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      const id = url.pathname.slice('/desk/session/'.length);
      const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
      const limiter = env.ROOM.get(limiterId);
      const res = await limiter.fetch(new Request('http://internal/desk/session/' + encodeURIComponent(id) + '?sub=' + encodeURIComponent(licenseRes.payload.sub)));
      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    if (url.pathname === '/license/verify' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const authHeader = request.headers.get('Authorization') || '';
      const token = (body.token || authHeader.replace(/^Bearer\s+/i, '') || '').trim();

      if (!token) {
        return jsonError('bad_token', 'License token is required', 400);
      }

      const fakeReq = new Request(request.url, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const licenseRes = await verifyLicense(fakeReq, secret);

      if (!licenseRes.valid) {
        return jsonError(licenseRes.error || 'bad_token', licenseRes.message || 'Invalid signature', licenseRes.status || 401);
      }

      if (body.deviceId && String(body.deviceId).trim()) {
        const rawDevice = String(body.deviceId).trim();
        const maxDevices = parseInt(env.LICENSE_MAX_DEVICES || '3', 10);
        const tokenHash = await sha256Hex(token);
        const deviceHash = await sha256Hex(rawDevice);

        try {
          const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
          const limiter = env.ROOM.get(limiterId);
          const devRes = await limiter.fetch(new Request('http://internal/devices/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenHash, deviceHash, maxDevices })
          }));

          if (devRes.ok) {
            const devData = await devRes.json();
            if (!devData.allowed) {
              return new Response(JSON.stringify({
                error: 'too_many_devices',
                message: `Maximum device limit reached for this license (limit: ${maxDevices}).`,
                limit: maxDevices,
                count: devData.count
              }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
              });
            }
          }
        } catch (e) {
          console.warn('[Device Register Warning]:', e.message);
        }
      }

      return new Response(JSON.stringify({
        valid: true,
        payload: licenseRes.payload
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    if (url.pathname === '/translate' && request.method === 'POST') {
      const capChars = parseInt(env.TRANSLATE_CAP_CHARS || '3000000', 10);
      let currentUsedChars = 0;
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
        return jsonError('bad_request', 'Invalid JSON body', 400, { why: 'invalid_json' });
      }

      const { q, source, target } = body || {};

      // 4) q 배열 검사 (최대 50개, 합계 5000자)
      if (!Array.isArray(q)) {
        return jsonError('bad_request', 'q must be an array', 400, { why: 'q_not_array' });
      }
      if (q.length === 0) {
        return jsonError('too_many', 'q must have at least 1 item', 400, { why: 'empty_q' });
      }
      if (q.length > 50) {
        return jsonError('too_many', 'q cannot exceed 50 items', 400, { why: 'q_exceeds_50', count: q.length });
      }

      let totalChars = 0;
      for (let i = 0; i < q.length; i++) {
        if (typeof q[i] !== 'string') {
          return jsonError('too_many', `Item at index ${i} in q is not a string`, 400, { why: 'item_not_string', index: i });
        }
        totalChars += q[i].length;
      }

      if (totalChars > 5000) {
        return jsonError('too_long', 'Total characters in q cannot exceed 5000', 400, { why: 'chars_exceed_5000', totalChars });
      }

      // 4-2) 월 번역 글자 상한 검사 (TRANSLATE_CAP_CHARS, 기본 3,000,000자)
      const currentMonth = new Date().toISOString().slice(0, 7);
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const uRes = await limiter.fetch(new Request(`http://internal/usage/summary?month=${currentMonth}&sub=${encodeURIComponent(sub)}`));
        if (uRes.ok) {
          const uData = await uRes.json();
          currentUsedChars = (uData.subs && uData.subs[sub]) ? (uData.subs[sub].total_chars || 0) : (uData.total_chars || 0);
        }
      } catch (_) {}

      if (currentUsedChars >= capChars) {
        return new Response(JSON.stringify({
          error: 'quota_exceeded',
          message: `Monthly translation character limit exceeded (used ${currentUsedChars} chars, limit ${capChars}). Contact support to increase.`,
          scope: 'translate_chars',
          used: currentUsedChars,
          limit: capChars
        }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // 5) 언어 코드 검사 및 호환성 처리 (언더스코어 및 auto 처리)
      if (!target || typeof target !== 'string') {
        return jsonError('bad_lang', 'target language is required', 400, { why: 'missing_target' });
      }
      const targetNorm = target.trim().replace('_', '-');
      if (!LANG_CODE_REGEX.test(targetNorm)) {
        return jsonError('bad_lang', `Invalid target language code: '${target}'`, 400, { why: 'invalid_target_lang', val: target });
      }
      const targetLang = targetNorm;

      let sourceLang = null;
      if (source && typeof source === 'string') {
        const srcTrim = source.trim();
        if (srcTrim.length > 0 && srcTrim.toLowerCase() !== 'auto' && srcTrim.toLowerCase() !== 'und') {
          const srcNorm = srcTrim.replace('_', '-');
          if (!LANG_CODE_REGEX.test(srcNorm)) {
            return jsonError('bad_lang', `Invalid source language code: '${source}'`, 400, { why: 'invalid_source_lang', val: source });
          }
          sourceLang = srcNorm;
        }
      }

      // 6) 캐시 조회 (Workers Cache API + Memory Fallback)
      // Desk 토큰(0x04·0x08)의 번역은 캐시를 읽지도 쓰지도 않는다 — 회의 내용을 남기지 않는다.
      const useCache = (Number(licenseRes.payload.flags) & NO_STORE_FLAGS) === 0;
      let cache = null;
      try {
        if (useCache && typeof caches !== 'undefined' && caches.default) {
          cache = caches.default;
        }
      } catch (_) {}

      // 6) 번역 엔진 결정 및 보안 가드
      const adminSecret = (env.ADMIN_SECRET || '').trim();
      const authHeader = request.headers.get('Authorization') || '';
      const customAdmin = (request.headers.get('X-Admin-Secret') || '').trim();
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const isAdmin = Boolean(adminSecret && (customAdmin === adminSecret || bearerToken === adminSecret));

      let engine = (env.TRANSLATE_ENGINE || 'google').trim().toLowerCase();
      const requestedEngine = request.headers.get('X-Translate-Engine');
      if (requestedEngine) {
        if (!isAdmin) {
          return jsonError('forbidden', 'X-Translate-Engine header requires admin privileges', 403);
        }
        engine = requestedEngine.trim().toLowerCase();
      }

      const ALLOWED_ENGINES = ['google', 'self', 'mock'];
      if (!ALLOWED_ENGINES.includes(engine)) {
        return jsonError('bad_engine', `Unsupported translation engine: '${engine}'`, 400);
      }
      if (engine === 'mock' && !isAdmin) {
        return jsonError('forbidden', 'mock engine requires admin privileges', 403);
      }

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

        const cacheUrl = await computeCacheKey(url.host, engine, sourceLang, targetLang, text);
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
        } else if (useCache) {
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

      // 7) 상류 번역 엔진 호출 (미적중분 1회 묶음 발송)
      let upstreamCount = 0;
      let upstreamChars = 0;

      if (uncachedTexts.length > 0) {
        upstreamCount = 1;
        upstreamChars = uncachedTexts.reduce((sum, s) => sum + s.length, 0);

        let engineRes;
        try {
          engineRes = await callEngine(engine, uncachedTexts, sourceLang, targetLang, env);
          if (ctx && ctx.waitUntil) {
            ctx.waitUntil(recordEngineCall(env, engine, true));
          } else {
            await recordEngineCall(env, engine, true);
          }
        } catch (engineErr) {
          await recordEngineCall(env, engine, false);
          return jsonError(
            engineErr.code || 'upstream',
            engineErr.message || 'Translation engine error',
            engineErr.status || 502,
            {
              why: engineErr.why || 'upstream_error',
              upstream: engine,
              upstream_status: engineErr.upstreamStatus || null
            }
          );
        }

        const translations = engineRes.translations;
        if (!detectedSrc && engineRes.detectedSrc) {
          detectedSrc = engineRes.detectedSrc;
        }

        // 결과 병합 및 캐시 저장 (TTL 30일 = 2,592,000초, JSON 포맷 { t, src })
        for (let k = 0; k < translations.length; k++) {
          const originalIdx = uncachedIndices[k];
          const transItem = translations[k];
          const transText = transItem.translatedText || transItem.text || '';
          const itemSrc = sourceLang || transItem.detectedSourceLanguage || detectedSrc || 'unknown';
          results[originalIdx] = transText;

          const cacheEntry = { t: transText, src: itemSrc };
          const cacheUrl = await computeCacheKey(url.host, engine, sourceLang, targetLang, uncachedTexts[k]);
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
          } else if (useCache) {
            memoryCache.set(cacheUrl, cacheValStr);
          }
        }
      }

      // 8) 캐시 판정 헤더 계산
      const hits = q.length - uncachedTexts.length;
      let xCache = 'MISS';
      if (!useCache) {
        xCache = 'BYPASS';
      } else if (hits === q.length) {
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

      
      if ((currentUsedChars + totalChars) / capChars >= 0.8) {
        responseHeaders['X-RayTok-Warn'] = '80';
      }
      const finalSrc = detectedSrc || sourceLang || 'unknown';

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(recordUsage(env, { sub, target: targetLang, chars: totalChars }));
      } else {
        await recordUsage(env, { sub, target: targetLang, chars: totalChars });
      }

      return new Response(JSON.stringify({
        t: results,
        src: finalSrc,
        chars: totalChars,
        lines: q.length
      }), {
        status: 200,
        headers: responseHeaders
      });
    }

    // 0-2. 사용량 및 번역 엔진 통계 조회: GET /usage
    if (url.pathname === '/usage' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization') || '';
      const customSecret = request.headers.get('X-Admin-Secret') || '';
      const adminSecret = (env.ADMIN_SECRET || '').trim();

      let isAuthorized = false;
      let authedSub = null;

      // 1) 관리자 비밀 확인
      if (adminSecret) {
        const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : customSecret.trim();
        if (providedSecret === adminSecret) {
          isAuthorized = true;
        }
      }

      // 2) 라이선스 토큰 확인
      let authedToken = null;
      if (!isAuthorized) {
        const licenseSecret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
        if (licenseSecret) {
          const licRes = await verifyLicense(request, licenseSecret);
          if (licRes.valid) {
            isAuthorized = true;
            authedSub = licRes.payload.sub;
            if (authHeader.startsWith('Bearer ')) {
              authedToken = authHeader.slice(7).trim();
            }
          }
        }
      }

      if (!isAuthorized) {
        return jsonError('unauthorized', 'Admin secret or valid license token required to access usage metrics', 401);
      }

      const querySub = url.searchParams.get('sub');
      const targetSub = authedSub ? authedSub : querySub;
      const month = url.searchParams.get('month') || '';

      const capChars = parseInt(env.TRANSLATE_CAP_CHARS || '3000000', 10);
      const maxDevices = parseInt(env.LICENSE_MAX_DEVICES || '10', 10);
      let deviceCount = 0;

      let engineStats = {};
      let usageData = {};
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const fetches = [
          limiter.fetch(new Request('http://internal/metric/engine')),
          limiter.fetch(new Request(`http://internal/usage/summary?month=${encodeURIComponent(month)}&sub=${encodeURIComponent(targetSub || '')}`))
        ];
        if (authedToken) {
          const tokenHash = await sha256Hex(authedToken);
          fetches.push(limiter.fetch(new Request(`http://internal/devices/count?tokenHash=${encodeURIComponent(tokenHash)}&max=${maxDevices}`)));
        }

        const [engRes, useRes, devRes] = await Promise.all(fetches);

        if (engRes && engRes.ok) engineStats = await engRes.json();
        if (useRes && useRes.ok) usageData = await useRes.json();
        if (devRes && devRes.ok) {
          const devData = await devRes.json();
          deviceCount = devData.count || 0;
        }
      } catch (_) {
        const formatRate = (calls, fails) => calls > 0 ? Number(((fails / calls) * 100).toFixed(2)) + '%' : '0%';
        for (const [eng, s] of memoryEngineStats.entries()) {
          engineStats[eng] = {
            window_1h: { calls: s.calls, failures: s.failures, rate: formatRate(s.calls, s.failures) },
            window_24h: { calls: s.calls, failures: s.failures, rate: formatRate(s.calls, s.failures) },
            lifetime: { calls: s.calls, failures: s.failures, rate: formatRate(s.calls, s.failures) }
          };
        }
      }

      const currentEngine = (env.TRANSLATE_ENGINE || 'google').trim().toLowerCase();
      const currentStat = engineStats[currentEngine] || {
        window_1h: { calls: 0, failures: 0, rate: '0%' },
        window_24h: { calls: 0, failures: 0, rate: '0%' },
        lifetime: { calls: 0, failures: 0, rate: '0%' }
      };

      return new Response(JSON.stringify({
        engine: {
          current: currentEngine,
          window_1h: currentStat.window_1h,
          window_24h: currentStat.window_24h,
          lifetime: currentStat.lifetime
        },
        engine_stats: engineStats,
        ...usageData
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 1. 방 생성: POST /room -> { code, host_token }
    if (url.pathname === '/room' && request.method === 'POST') {
      let body = {};
      const cl = request.headers.get('content-length');
      if (cl && cl !== '0' && request.body) {
        try {
          body = await request.json();
        } catch (_) {}
      }

      const kind = (body && body.kind) ? String(body.kind).toLowerCase().trim() : 'guide';
      // script = 웹 강사 화면(L4-2, 원고 미리 번역 배포). Desk 와 같은 이용권(0x04|0x08)이지만 Desk 분 집계는 하지 않는다.
      const requiredFlags = (kind === 'desk' || kind === 'script') ? (0x04 | 0x08) : 0x01;

      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const licenseRes = await verifyLicense(request, secret, requiredFlags);
      if (!licenseRes.valid) {
        return new Response(JSON.stringify({
          error: licenseRes.error || 'unauthorized',
          message: licenseRes.message || (kind === 'desk' ? 'Desk license (0x04 or 0x08) required' : 'Guide license (0x01) required')
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      const code = generateCrockfordCode(6);
      const host_token = generateHostToken();

      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);

      await room.fetch(new Request('http://internal/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          host_token,
          kind,
          sub: licenseRes.payload.sub,
          test_silence_warn_ms: body.test_silence_warn_ms,
          test_silence_timeout_ms: body.test_silence_timeout_ms
        })
      }));

      return new Response(JSON.stringify({ code, host_token }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }

    // 1-0. 테스트용 룸 알람 시뮬레이션: POST /room/:code/test/alarm (ADMIN_SECRET 필수, 미일치 시 404 은닉)
    if (url.pathname.startsWith('/room/') && url.pathname.endsWith('/test/alarm') && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const customSecret = (request.headers.get('X-Admin-Secret') || '').trim();
      const adminSecret = (env.ADMIN_SECRET || '').trim();
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

      if (!adminSecret || (customSecret !== adminSecret && bearerToken !== adminSecret)) {
        return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
      }

      const pathParts = url.pathname.split('/');
      const code = (pathParts[2] || '').toUpperCase();
      const id = env.ROOM.idFromName(code);
      const room = env.ROOM.get(id);
      return room.fetch(new Request('http://internal/test/alarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body
      }));
    }

    // 1-1. Deepgram STT 임시 키 발급: POST /stt/token
    if (url.pathname === '/stt/token' && request.method === 'POST') {
      // 1) 라이선스 검증: Desk (0x04 또는 0x08) 필수
      const secret = (env.LICENSE_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const licenseRes = await verifyLicense(request, secret, 0x04 | 0x08);
      if (!licenseRes.valid) {
        return new Response(JSON.stringify({
          error: licenseRes.error || 'unauthorized',
          message: licenseRes.message || 'Valid Desk license required for STT token'
        }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      const sub = licenseRes.payload.sub;

      // 1-1) Desk STT 월 안전 상한선(DESK_HARD_CAP_MIN) 검사 (기본 6000분 = 월 100시간)
      const hardCapMin = Number(env.DESK_HARD_CAP_MIN) || 6000;
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      try {
        const limiterId = env.ROOM.idFromName('GLOBAL_RATE_LIMITER');
        const limiter = env.ROOM.get(limiterId);
        const uRes = await limiter.fetch(new Request(`http://internal/usage/summary?month=${currentMonth}&sub=${encodeURIComponent(sub)}`));
        if (uRes.ok) {
          const uData = await uRes.json();
          const usedMin = uData.desk_minutes || 0;
          if (usedMin >= hardCapMin) {
            return new Response(JSON.stringify({
              error: 'quota_exceeded',
              message: `Monthly Desk STT hard cap exceeded (${usedMin}/${hardCapMin} minutes, ${Math.round(hardCapMin / 60)} hours). Contact support to increase.`,
              scope: 'desk_minutes',
              used: usedMin,
              limit: hardCapMin
            }), {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                ...CORS_HEADERS
              }
            });
          }
        }
      } catch (_) {}

      // 2) Deepgram 마스터 API 키 확인
      const deepgramKey = (env.DEEPGRAM_API_KEY || '').trim().replace(/^["']|["']$/g, '');
      if (!deepgramKey) {
        return new Response(JSON.stringify({
          error: 'upstream',
          message: 'Server DEEPGRAM_API_KEY not configured',
          debug: {
            hasDeepgram: Boolean(env.DEEPGRAM_API_KEY),
            valType: typeof env.DEEPGRAM_API_KEY,
            envKeys: Object.keys(env)
          }
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      // 3) Deepgram Project ID 확인 (env 없으면 프로젝트 목록에서 첫 프로젝트 자동 조회)
      let projectId = (env.DEEPGRAM_PROJECT_ID || '').trim().replace(/^["']|["']$/g, '');
      if (!projectId) {
        try {
          const pRes = await fetch('https://api.deepgram.com/v1/projects', {
            headers: { 'Authorization': 'Token ' + deepgramKey }
          });
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData.projects && pData.projects[0]) {
              projectId = pData.projects[0].project_id;
            }
          }
        } catch (_) {}
      }

      if (!projectId) {
        return new Response(JSON.stringify({
          error: 'upstream',
          message: 'Failed to resolve Deepgram Project ID'
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }

      // 4) 임시 키 발급 (수명: 1시간 = 3600초, 권한: usage:write)
      const ttlSec = 3600;
      try {
        const kRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
          method: 'POST',
          headers: {
            'Authorization': 'Token ' + deepgramKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            comment: `Ephemeral key for sub: ${sub.slice(0, 8)}`,
            scopes: ['usage:write'],
            time_to_live_in_seconds: ttlSec
          })
        });

        if (!kRes.ok) {
          const errText = await kRes.text().catch(() => '');
          return new Response(JSON.stringify({
            error: 'upstream',
            message: 'Failed to mint Deepgram key: ' + errText
          }), {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              ...CORS_HEADERS
            }
          });
        }

        const kData = await kRes.json();

        // 5) 발급 감사 로그 (키 원문은 절대 로깅하지 않고 ID 접두사만 기록)
        console.log(`[STT_TOKEN] Issued ephemeral key for sub=${sub.slice(0, 8)}..., key_id=${(kData.api_key_id || '').slice(0, 8)}..., ttl=${ttlSec}s`);

        if (ctx && ctx.waitUntil) {
          ctx.waitUntil(recordUsage(env, { sub, sttKey: true }));
        } else {
          await recordUsage(env, { sub, sttKey: true });
        }

        return new Response(JSON.stringify({
          token: kData.key,
          key_id: kData.api_key_id,
          expires_in: ttlSec
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: 'upstream',
          message: 'Error communicating with Deepgram: ' + err.message
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS
          }
        });
      }
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
