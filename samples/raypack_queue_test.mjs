/* samples/raypack_queue_test.mjs — 레이팩 줄 세우기 (NOW 11-10 12:56 ②)
 *
 * 가짜 번역기는 **진짜 LatencyOptimisedTranslator 와 같은 꼴**로 군다(D-11 — vendor/bergamot/translator.js
 * translate()): 일꾼 하나 · 일꾼이 바쁠 때 새 줄이 오면 기다리던 줄을 SupersededError 로 버린다.
 * 그 위에서 3줄·10줄을 동시에 넣어 실패 0 인지, 줄 선 대기가 LINE_MS 를 넘으면 그 줄만 null 인지 본다.
 * 되돌림(D-09): setRpQueue(false) 면 같은 시험에서 실패가 난다 — 아래 [3] 이 그것을 센다.
 *
 * 돌리기: node samples/raypack_queue_test.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const m = await import(pathToFileURL(path.join(ROOT, 'web', 'listener', 'raypack.js')).href);
const { createRaypack, setRpQueue, LINE_MS } = m;

let pass = 0, fail = 0;
const ok = (c, d) => { if (c) { pass++; console.log('  [PASS] ' + d); } else { fail++; console.log('  [FAIL] ' + d); } };

/** 진짜와 같은 꼴: 일꾼 하나, pending 하나, 새 요청이 오면 pending 을 Superseded 로 */
function latencyLike(ms) {
  return class {
    constructor() { this.pending = null; this.busy = false; }
    translate(req) {
      if (this.pending) { const e = new Error('SupersededError'); this.pending.reject(e); }
      return new Promise((accept, reject) => { this.pending = { req, accept, reject }; this.notify(); });
    }
    notify() {
      setTimeout(() => {
        if (!this.pending || this.busy) return;
        const { req, accept } = this.pending; this.pending = null; this.busy = true;
        const d = req.text === '안녕하세요.' ? 1 : ms(req.text);
        setTimeout(() => { this.busy = false; accept({ target: { text: 'T:' + req.text } }); this.notify(); }, d);
      }, 0);
    }
    delete() {}
  };
}
function deps(ms) {
  return {
    canRun: () => ({ ok: true, simd: true }),
    fetchIndex: async () => ({ rows: [{ pair: { src: 'ko', dst: 'vi' }, file: 'raypack-ko-vi@v1.rtpack', bytes: 3, sha256: 'a'.repeat(64) }] }),
    loadFflate: async () => {}, getPack: async (r) => ({ bytes: new Uint8Array(3), url: 'https://r2/' + r.file }),
    sha256Hex: async () => 'a'.repeat(64), trimCache: async () => [], unzip: async () => ({}),
    readPack: () => ({ manifest: { chain: [{ from: 'ko', to: 'en' }, { from: 'en', to: 'vi' }] }, files: {} }),
    makeBacking: () => ({}), Translator: latencyLike(ms),
  };
}
async function burst(n, ms, logs) {
  const rp = createRaypack({ deps: deps(ms), g: {}, log: (s) => logs.push(s) });
  await rp.want('vi');
  const outs = await Promise.all(Array.from({ length: n }, (_, i) => rp.translate('줄' + i)));
  return outs;
}

console.log('\n[1] 3줄 동시 — 실패 0 · 순서대로 제 줄 번역');
{
  const logs = [];
  const outs = await burst(3, () => 40, logs);
  ok(outs.every((o, i) => o === 'T:줄' + i), `셋 다 폰 안 번역 (${outs.join(' | ')})`);
  ok(!logs.some((l) => /raypack_line_fail/.test(l)), `raypack_line_fail 0 (${logs.filter((l) => /fail/.test(l)).length})`);
}

console.log('\n[2] 10줄 동시 — 실패 0');
{
  const logs = [];
  const outs = await burst(10, () => 30, logs);
  const good = outs.filter((o, i) => o === 'T:줄' + i).length;
  ok(good === 10, `10/10 폰 안 번역 (${good})`);
  ok(!logs.some((l) => /raypack_line_(fail|queue_timeout)/.test(l)), '실패·대기 넘침 0');
}

console.log('\n[3] D-09 — 줄 세우기를 끄면 같은 3줄에서 실패가 난다(시험이 그것을 잡는다)');
{
  setRpQueue(false);
  const logs = [];
  const outs = await burst(3, () => 40, logs);
  setRpQueue(true);
  const nulls = outs.filter((o) => o === null).length;
  ok(nulls >= 1 && logs.some((l) => /raypack_line_fail .*Superseded/.test(l)),
    `되돌림 실증 — 끄면 앞 줄이 Superseded 로 버려진다 (null ${nulls} · fail ${logs.filter((l) => /fail/.test(l)).length})`);
}

console.log(`\n[4] 줄 선 대기가 LINE_MS(${LINE_MS}ms) 를 넘으면 그 줄만 서버 길(null) — 뒤 줄은 계속`);
{
  const logs = [];
  // 첫 줄이 LINE_MS 의 70% 를 잡아먹으면 둘째 줄은 남은 30% 안에 못 끝난다(엔진 60%) — 상한
  const slow = (t) => (t === '줄0' ? LINE_MS * 0.7 : t === '줄1' ? LINE_MS * 0.6 : 20);
  const rp = createRaypack({ deps: deps(slow), g: {}, log: (s) => logs.push(s) });
  await rp.want('vi');
  const t0 = Date.now();
  const p = [rp.translate('줄0'), rp.translate('줄1')];
  const outs = await Promise.all(p);
  const took = Date.now() - t0;
  const late = await rp.translate('줄2');
  ok(outs[0] === 'T:줄0', '첫 줄은 폰 안');
  ok(outs[1] === null && logs.some((l) => /raypack_line_fail .*한 줄/.test(l)), `둘째 줄은 남은 시간 안에 못 끝나 null (${outs[1]})`);
  ok(took < LINE_MS * 1.15, `둘째 줄을 기다린 시간이 상한 안 (${took}ms)`);
  ok(late === 'T:줄2', `뒤 줄은 다시 폰 안 (${late})`);
}

console.log('\n[5] 이미 LINE_MS 를 줄에서 다 쓴 줄은 엔진에 넣지도 않는다(raypack_line_queue_timeout)');
{
  const logs = [];
  const slow = (t) => (t === '줄0' ? LINE_MS + 300 : 20);
  const rp = createRaypack({ deps: deps(slow), g: {}, log: (s) => logs.push(s) });
  await rp.want('vi');
  const outs = await Promise.all([rp.translate('줄0'), rp.translate('줄1')]);
  ok(outs[0] === null && outs[1] === null, '둘 다 서버 길');
  ok(logs.some((l) => /raypack_line_queue_timeout waited=\d+/.test(l)), `기록 raypack_line_queue_timeout (${logs.filter((l) => /queue/.test(l)).join(' ') || '없음'})`);
}

console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
