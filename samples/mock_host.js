const { WebSocketServer } = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('RayTok Mock Host Running');
});

const wss = new WebSocketServer({ noServer: true });
let scenarioStarted = false;

wss.on('connection', (ws) => {
  console.log('CONN: Client connected');
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.hello) {
        console.log('HELLO RECEIVED:', JSON.stringify(msg));
        if (!scenarioStarted) {
          scenarioStarted = true;
          ws.send(JSON.stringify({ welcome: 1, plan: "trial", guide: 1, src_lang: "ko" }));
          console.log('SEND: welcome');
          
          setTimeout(() => { ws.send(JSON.stringify({ seq: 1, src_lang: "ko", text: "대화를 시작합니다.", tr: { en: "Let's start." } })); console.log('SEND: seq 1'); }, 500);
          setTimeout(() => { ws.send(JSON.stringify({ seq: 2, src_lang: "ko", text: "안전모", tr: { ky: "Каска" }, via: "ru" })); console.log('SEND: seq 2'); }, 1000);
          setTimeout(() => { ws.send(JSON.stringify({ seq: 3, src_lang: "ko", text: "날씨 좋고.", tr: {}, pending: 1 })); console.log('SEND: seq 3 pending'); }, 1500);
          setTimeout(() => { ws.send(JSON.stringify({ seq: 3, tr: { en: "Nice weather.", ky: "Аба ырайы жакшы." } })); console.log('SEND: seq 3 tr'); }, 2000);
          setTimeout(() => { ws.send(JSON.stringify({ seq: 4, src_lang: "ko", text: "위험.", tr: {}, pending: 1 })); console.log('SEND: seq 4 pending'); }, 2500);
          setTimeout(() => { ws.send(JSON.stringify({ seq: 4, no_tr: 1 })); console.log('SEND: seq 4 no_tr'); }, 3000);
          setTimeout(() => { 
            ws.send(JSON.stringify({ end: 1, summary: { lines: 4, minutes: 1, joined_max: 1 } }));
            console.log('SEND: end');
            setTimeout(() => ws.close(), 500);
          }, 3500);
        }
      }
    } catch (e) { console.error('Error:', e); }
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => { wss.emit('connection', ws, request); });
});

server.listen(8081, () => {
  console.log('LISTENING 8081');
});
