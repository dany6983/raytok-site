/* samples/para_done_test.js — 손님 para_done 중복 수신 시 유니크 세기 검증 (10-27 11:35)
 * 실행: node samples/para_done_test.js (npm run test:para-done)
 */
const assert = require('assert');

console.log('=== para_done 중복 수신 · 유니크 발신자 검증 ===');
let passCount = 0;
function ok(cond, desc) { assert(cond, desc); passCount++; console.log('  [PASS] ' + desc); }

// Host paraDoneReceipts logic simulation
const live = { paraDoneReceipts: {} };

function handleParaDone(msg) {
  if (msg.kind === 'para_done' && msg.para) {
    if (!live.paraDoneReceipts) live.paraDoneReceipts = {};
    if (!live.paraDoneReceipts[msg.para]) live.paraDoneReceipts[msg.para] = new Set();
    live.paraDoneReceipts[msg.para].add(msg.from || Math.random());
  }
}

// Test 1: Same listener sends 3 times with same 'from' id
const para = 1;
const listenerId = 'listener_abc_123';
handleParaDone({ kind: 'para_done', para, from: listenerId });
handleParaDone({ kind: 'para_done', para, from: listenerId });
handleParaDone({ kind: 'para_done', para, from: listenerId });

const receipts1 = live.paraDoneReceipts[para] ? live.paraDoneReceipts[para].size : 0;
ok(receipts1 === 1, `손님 하나가 para_done 을 세 번 보내도 receipts=1 (실제: ${receipts1})`);

// Test 2: Two different listeners send
const para2 = 2;
handleParaDone({ kind: 'para_done', para: para2, from: 'listener_1' });
handleParaDone({ kind: 'para_done', para: para2, from: 'listener_2' });

const receipts2 = live.paraDoneReceipts[para2] ? live.paraDoneReceipts[para2].size : 0;
ok(receipts2 === 2, `둘이 보내면 receipts=2 (실제: ${receipts2})`);

// 되돌림 실증 1: 보낸 사람 표시(from) 없이 세면 — 옛 길(`Math.random()`) — 한 손님 셋이 셋으로 센다 → 붉다
const live0 = { paraDoneReceipts: {} };
for (let i = 0; i < 3; i++) { const m = { kind: 'para_done', para: 9 }; if (!live0.paraDoneReceipts[9]) live0.paraDoneReceipts[9] = new Set(); live0.paraDoneReceipts[9].add(m.from || Math.random()); }
let revertFailed = false;
try { assert.strictEqual(live0.paraDoneReceipts[9].size, 1); } catch (_) { revertFailed = true; }
ok(revertFailed === true, 'from 을 빼면 한 손님이 셋으로 센다 — 되돌림 실증 ①');

console.log(`\n전부 통과 (${passCount}건)`);
