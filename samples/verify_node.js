const crypto = require('crypto');

function sortKeysDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortKeysDeep(obj[key]);
  }
  return sortedObj;
}

function normalize(item) {
  // 1) hash 제거
  const copy = { ...item };
  delete copy.hash;
  
  // 2) 키 정렬 및 정규화 문자열 생성
  const sorted = sortKeysDeep(copy);
  return JSON.stringify(sorted);
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function verifyHashChain(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: '올바르지 않은 JSON 데이터입니다.' };
  }
  
  if (data.ver !== 1) {
    return { ok: false, error: '버전 정보(ver)가 1이 아닙니다.' };
  }
  
  const items = data.items || [];
  if (items.length === 0) {
    return { ok: false, error: '검증할 항목(items)이 비어 있습니다.' };
  }
  
  // 1) n이 1부터 N까지 연속적인지 검증
  for (let i = 0; i < items.length; i++) {
    const expectedN = i + 1;
    if (items[i].n !== expectedN) {
      return { ok: false, error: `n 불연속: ${expectedN} 없음 (현재 n=${items[i].n})`, n: expectedN };
    }
  }
  
  // 2) items[0].prev == "0" * 64 검증
  const zero64 = '0'.repeat(64);
  if (items[0].prev !== zero64) {
    return { ok: false, error: '첫 항목의 prev 값이 올바르지 않습니다.', n: 1 };
  }
  
  // 3) 각 hash 재계산 및 4) prev == 직전 hash 검증
  let prevHash = zero64;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (item.prev !== prevHash) {
      return { ok: false, error: `prev 불일치: n=${item.n}의 prev가 직전 hash와 다릅니다.`, n: item.item ? item.n : item.n };
    }
    
    const normStr = normalize(item);
    const inputStr = item.prev + '\n' + normStr;
    const computedHash = sha256(inputStr);
    
    if (item.hash !== computedHash) {
      return { ok: false, error: `해시 불일치: n=${item.n}의 hash 값이 계산된 값과 다릅니다.`, n: item.n };
    }
    
    prevHash = item.hash;
  }
  
  // 5) last == 마지막 hash 검증
  if (data.last !== prevHash) {
    return { ok: false, error: 'last 불일치: last 값이 마지막 항목의 hash와 다릅니다.' };
  }
  
  // 6) gap 분석
  // gap과 gap_fill 구간 추적
  const gaps = [];
  const gapFills = [];
  
  for (const item of items) {
    if (item.kind === 'gap') {
      gaps.push({ dev: item.dev, from: item.from, to: item.to });
    } else if (item.kind === 'gap_fill') {
      gapFills.push({ dev: item.dev, from: item.from, to: item.to });
    }
  }
  
  const unfilledGaps = [];
  for (const gap of gaps) {
    const isFilled = gapFills.some(fill => fill.dev === gap.dev && fill.from === gap.from && fill.to === gap.to);
    if (!isFilled) {
      unfilledGaps.push(gap);
    }
  }
  
  return {
    ok: true,
    unfilledGaps: unfilledGaps
  };
}

// Node CLI 실행 지원
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node verify_node.js <file1.json> <file2.json> ...');
    process.exit(1);
  }
  
  for (const file of args) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(content);
      const res = verifyHashChain(parsed);
      const baseName = path.basename(file);
      if (res.ok) {
        let msg = `${baseName}: 통과`;
        if (res.unfilledGaps.length > 0) {
          msg += ` (누락 구간 존재: ${res.unfilledGaps.map(g => `${g.dev}:${g.from}-${g.to}`).join(', ')})`;
        }
        console.log(msg);
      } else {
        console.log(`${baseName}: 실패 - ${res.error}`);
      }
    } catch (e) {
      console.log(`${path.basename(file)}: 에러 - ${e.message}`);
    }
  }
}

module.exports = {
  sortKeysDeep,
  normalize,
  verifyHashChain
};
