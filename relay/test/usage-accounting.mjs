import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mintLicenseToken } from '../tools/mint-license.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.RELAY_URL || 'http://127.0.0.1:8787';

let secret = process.env.LICENSE_SECRET;
let adminSecret = process.env.ADMIN_SECRET || 'dev-admin-secret-key-12345';

const devVarsPath = path.resolve(__dirname, '../.dev.vars');
if (fs.existsSync(devVarsPath)) {
  const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
  for (const line of lines) {
    const matchSec = line.match(/^LICENSE_SECRET=(.*)$/);
    if (matchSec) secret = matchSec[1].trim();
    const matchAdmin = line.match(/^ADMIN_SECRET=(.*)$/);
    if (matchAdmin) adminSecret = matchAdmin[1].trim();
  }
}

async function run() {
  console.log('=== Relay Usage & Cost Monitoring Accounting Test ===');
  console.log('Target URL:', BASE_URL);

  const guideSub = 'guide-sub-' + Date.now();
  const deskSub = 'desk-sub-' + Date.now();

  const guideToken = mintLicenseToken({ sub: guideSub, days: 1, flags: 0x01 | 0x04, secret });
  const deskToken = mintLicenseToken({ sub: deskSub, days: 1, flags: 0x04 | 0x08, secret });

  // 1. 가이드 번역 호출 (영어 대상 15자)
  console.log('\n[Test 1] Translate call with guide token...');
  const text1 = '회계 원가 감시 시험 문장입니다.'; // 17자
  const resTr1 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${guideToken}`
    },
    body: JSON.stringify({ q: [text1], source: 'ko', target: 'en' })
  });
  assert.strictEqual(resTr1.status, 200);
  const dataTr1 = await resTr1.json();
  console.log('   - 번역 결과:', dataTr1.t[0], `(chars: ${dataTr1.chars})`);

  // 2. 가이드 번역 호출 (일본어 대상 10자)
  console.log('\n[Test 2] Translate call to ja with guide token...');
  const text2 = '감시 시험 문장'; // 8자
  const resTr2 = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${guideToken}`
    },
    body: JSON.stringify({ q: [text2], source: 'ko', target: 'ja' })
  });
  assert.strictEqual(resTr2.status, 200);
  const dataTr2 = await resTr2.json();
  console.log('   - 번역 결과:', dataTr2.t[0], `(chars: ${dataTr2.chars})`);

  // 3. Desk STT 임시 키 발급
  console.log('\n[Test 3] STT ephemeral key issue with desk token...');
  const resStt = await fetch(`${BASE_URL}/stt/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deskToken}`
    }
  });
  assert.strictEqual(resStt.status, 200);
  const dataStt = await resStt.json();
  console.log('   - 발급 성공: key_id =', dataStt.key_id);

  // 4. GET /usage 관리자 조회 -> 월별 × 코드별 × 언어별 원가 감시 데이터 검증
  console.log('\n[Test 4] Query GET /usage as admin...');
  const resUsage = await fetch(`${BASE_URL}/usage`, {
    headers: {
      'X-Admin-Secret': adminSecret
    }
  });
  assert.strictEqual(resUsage.status, 200);
  const usageAll = await resUsage.json();
  console.log('Admin Usage Response:', JSON.stringify(usageAll, null, 2));

  assert(usageAll.usage, 'usage 객체 존재');
  assert(usageAll.usage[guideSub], 'guideSub 항목 존재');
  const gRec = usageAll.usage[guideSub];
  assert(gRec.total_chars >= dataTr1.chars + dataTr2.chars, 'total_chars 합산 검증');
  assert.strictEqual(gRec.total_calls, 2, 'total_calls 2회 검증');
  assert(gRec.targets.en, 'targets.en 존재');
  assert.strictEqual(gRec.targets.en.chars, dataTr1.chars, 'en 언어 글자수 정확도 검증');
  assert(gRec.targets.ja, 'targets.ja 존재');
  assert.strictEqual(gRec.targets.ja.chars, dataTr2.chars, 'ja 언어 글자수 정확도 검증');
  assert.strictEqual(gRec._note, '원가 감시용 · 과금 근거 아님', '_note 문구 검증');

  assert(usageAll.usage[deskSub], 'deskSub 항목 존재');
  const dRec = usageAll.usage[deskSub];
  assert.strictEqual(dRec.stt_keys_issued, 1, 'stt_keys_issued 1회 카운트 검증');

  // 5. GET /usage 일반 토큰 조회 -> 본인 sub 기록만 반환 검증
  console.log('\n[Test 5] Query GET /usage with guide license token...');
  const resSelf = await fetch(`${BASE_URL}/usage`, {
    headers: {
      'Authorization': `Bearer ${guideToken}`
    }
  });
  assert.strictEqual(resSelf.status, 200);
  const selfData = await resSelf.json();
  console.log('Self Usage Response:', JSON.stringify(selfData, null, 2));
  assert.strictEqual(selfData.sub, guideSub, '본인 sub만 반환');
  assert.strictEqual(selfData.total_calls, 2, '본인 호출수 일치');
  assert.strictEqual(selfData._note, '원가 감시용 · 과금 근거 아님');

  console.log('\n=== All Usage & Cost Monitoring Tests Passed! ===');
}

run().catch(err => {
  console.error('\n*** Test Failed ***:', err.message);
  process.exit(1);
});
