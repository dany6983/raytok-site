const fs = require('fs');
const path = require('path');
const { loadPack, match } = require('../packs/match');

const packPath = path.join(__dirname, '../packs/ko.json');
const pack = loadPack(fs.readFileSync(packPath, 'utf8'));

// 1. items[1].ko 그대로 → id=2, score=1.0
const text1 = pack.items[1].ko;
const res1 = match(text1, pack);
console.log(`1. id=${res1 ? res1.id : null}, score=${res1 ? res1.score.toFixed(1) : null}`);

// 2. 같은 문장 끝에 "!" 붙이고 공백 하나 뺌 → id=2, score=1.0
const text2 = "모두 모여 주십시오. 작업전 안전점검회의를 진행하겠습니다!";
const res2 = match(text2, pack);
console.log(`2. id=${res2 ? res2.id : null}, score=${res2 ? res2.score.toFixed(1) : null}`);

// 3. 문장 한 단어 바꿈("안전점검회의"→"안전회의") → id=2, score ≥0.8
const text3 = pack.items[1].ko.replace('안전점검회의', '안전회의');
const res3 = match(text3, pack);
console.log(`3. id=${res3 ? res3.id : null}, score=${res3 ? res3.score.toFixed(4) : null}`);

// 4. "오늘 점심은 김치찌개" → null
const text4 = "오늘 점심은 김치찌개";
const res4 = match(text4, pack);
console.log(`4. ${res4 === null ? 'null' : JSON.stringify(res4)}`);

// 5. threshold=0.95로 3번 → null
const res5 = match(text3, pack, 0.95);
console.log(`5. ${res5 === null ? 'null' : JSON.stringify(res5)}`);
