// 리드(상담 신청) 수신. 설계 2026-10-31
//
// 왜 만드나: /contact 가 형식만 검사하고 {ok:true} 를 돌려주고 **버리고 있었다.**
// 릴스로 사람을 불러도 받는 그릇이 없었다.
//
// 지키는 것
//  - 개인 휴대폰·개인 이메일은 받지 않는다. 업체·기관 공개 대표번호만.
//  - 대체 창구는 전화가 아니라 메일·인스타 DM·카카오톡 채널이다 (2026-10-31 대표님 지시).
//  - 저장소(KV)가 없으면 503 을 돌려준다. 조용히 삼키지 않는다. ← 지금 문제의 재발 방지
//  - 조회는 관리자 토큰(LEAD_ADMIN_TOKEN, wrangler secret)으로만.

const FIELDS = {
  company:  { required: true,  max: 80,  label: '업체·기관명' },
  contact:  { required: true,  max: 30,  label: '담당자 직함·성' },
  phone:    { required: true,  max: 30,  label: '업체 대표번호' },
  product:  { required: true,  max: 30,  label: '관심 품목' },
  headcount:{ required: false, max: 20,  label: '외국인 인원' },
  langs:    { required: false, max: 120, label: '필요 언어' },
  memo:     { required: false, max: 500, label: '하실 말씀' },
  src:      { required: false, max: 40,  label: '유입 경로 (릴스 키워드 등)' }
};

// 개인 휴대폰으로 보이는 번호를 거른다. 010/011/016~019 로 시작하면 받지 않는다.
const PERSONAL = /^0(1[0168])[-\s.]?\d{3,4}[-\s.]?\d{4}$/;

function bad(msg, extra) {
  return { status: 400, body: { error: 'bad_request', message: msg, ...extra } };
}

export function validate(body) {
  const out = {};
  for (const [k, spec] of Object.entries(FIELDS)) {
    const v = body?.[k];
    if (v == null || v === '') {
      if (spec.required) return bad(`${spec.label}을 적어 주세요.`, { field: k });
      continue;
    }
    if (typeof v !== 'string') return bad(`${spec.label} 형식이 맞지 않습니다.`, { field: k });
    const t = v.trim().slice(0, spec.max);
    if (!t) { if (spec.required) return bad(`${spec.label}을 적어 주세요.`, { field: k }); continue; }
    out[k] = t;
  }
  const digits = out.phone.replace(/[^\d]/g, '');
  if (digits.length < 8) return bad('업체 대표번호를 다시 확인해 주세요.', { field: 'phone' });
  if (PERSONAL.test(out.phone.replace(/\s/g, ''))) {
    return bad('개인 휴대폰 번호는 받지 않습니다. 업체·기관 대표번호를 적어 주세요.', { field: 'phone' });
  }
  // 이메일 칸은 아예 두지 않는다. 혹시 보내와도 버린다.
  return { ok: true, lead: out };
}

/** POST /lead */
export async function handleLead(request, env, cors) {
  const J = (b, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { 'Content-Type': 'application/json', ...cors }
  });

  let body;
  try { body = await request.json(); } catch { return J({ error: 'bad_request', message: 'JSON 이 아닙니다.' }, 400); }

  const v = validate(body);
  if (!v.ok) return J(v.body, v.status);

  if (!env.LEADS) {
    // 저장할 곳이 없으면 받았다고 하지 않는다. 신청자가 다시 전화할 수 있게 번호를 돌려준다.
    return J({
      error: 'storage_unconfigured',
      message: '지금 신청을 접수할 수 없습니다. 메일이나 인스타그램 DM 으로 보내 주시면 똑같이 처리됩니다.',
      email: 'raytok.dany@gmail.com',
      dm: 'https://ig.me/m/_raytok_'
    }, 503);
  }

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const rec = {
    id,
    at: new Date().toISOString(),
    ...v.lead,
    ua: (request.headers.get('user-agent') || '').slice(0, 120),
    country: request.headers.get('cf-ipcountry') || null
    // IP 는 저장하지 않는다.
  };

  await env.LEADS.put(`lead:${id}`, JSON.stringify(rec), {
    metadata: { company: rec.company, product: rec.product, at: rec.at }
  });
  // 미처리 큐에도 넣어 둔다. 담당자가 읽고 지운다.
  await env.LEADS.put(`todo:${id}`, '1', { expirationTtl: 60 * 60 * 24 * 90 });

  return J({ ok: true, id, message: '접수했습니다. 영업일 1일 안에 연락드립니다.' });
}

/** GET /lead/list?since=ISO  — 관리자 토큰 필요 */
export async function handleLeadList(request, env, cors) {
  const J = (b, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { 'Content-Type': 'application/json', ...cors }
  });

  const tok = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.LEAD_ADMIN_TOKEN || !tok || tok !== env.LEAD_ADMIN_TOKEN) {
    return J({ error: 'unauthorized' }, 401);
  }
  if (!env.LEADS) return J({ error: 'storage_unconfigured' }, 503);

  const url = new URL(request.url);
  const onlyTodo = url.searchParams.get('todo') === '1';
  const prefix = onlyTodo ? 'todo:' : 'lead:';
  const list = await env.LEADS.list({ prefix, limit: 200 });

  const items = [];
  for (const k of list.keys) {
    const id = k.name.slice(prefix.length);
    const raw = await env.LEADS.get(`lead:${id}`);
    if (raw) items.push(JSON.parse(raw));
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return J({ count: items.length, truncated: !list.list_complete, items });
}

/** POST /lead/done  {id} — 처리 완료 표시. 관리자 토큰 필요 */
export async function handleLeadDone(request, env, cors) {
  const J = (b, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { 'Content-Type': 'application/json', ...cors }
  });
  const tok = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.LEAD_ADMIN_TOKEN || !tok || tok !== env.LEAD_ADMIN_TOKEN) return J({ error: 'unauthorized' }, 401);
  if (!env.LEADS) return J({ error: 'storage_unconfigured' }, 503);
  let body; try { body = await request.json(); } catch { return J({ error: 'bad_request' }, 400); }
  if (!body?.id) return J({ error: 'bad_request', message: 'id 가 필요합니다.' }, 400);
  await env.LEADS.delete(`todo:${body.id}`);
  return J({ ok: true });
}

export { FIELDS };
