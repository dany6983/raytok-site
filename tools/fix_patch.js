const fs = require('fs');
const path = require('path');

const MEET_DIR = 'C:\\GitHub\\raytok-meet';

let indexHtml = fs.readFileSync(path.join(MEET_DIR, 'renderer', 'index.html'), 'utf8');

// HTML 단추 추가
if (!indexHtml.includes('id="btnOverlay"')) {
  const overlayBtn = `\n          <button id="btnOverlay" class="btn-start" style="background:#3b82f6; width:100%; margin-top:10px;">오버레이 켜기</button>`;
  indexHtml = indexHtml.replace('<button class="btn-stop" id="btnStop" disabled>종료</button>', '<button class="btn-stop" id="btnStop" disabled>종료</button>' + overlayBtn);
}

fs.writeFileSync(path.join(MEET_DIR, 'renderer', 'index.html'), indexHtml, 'utf8');
console.log('Fix patch done!');