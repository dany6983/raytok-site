const WebSocket = require('ws');
const langSwitch = process.argv.includes('--lang-switch');
const ws = new WebSocket('ws://localhost:8081');

let welcomeReceived = false;
const connectTimer = setTimeout(() => { console.log('CONNECT TIMEOUT'); process.exit(1); }, 3000);
const endTimer = setTimeout(() => { console.log('NO END'); process.exit(1); }, 20000);

ws.on('open', () => {
  clearTimeout(connectTimer);
  ws.send(JSON.stringify({ hello: 1, ver: "1.0.5", room: "123456", lang: "en", name: "T1", deviceId: "d1", caps: { tts: true, tr: false } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('MSG:', JSON.stringify(msg));
  
  if (msg.welcome && langSwitch && !welcomeReceived) {
    welcomeReceived = true;
    ws.send(JSON.stringify({ hello: 1, ver: "1.0.5", room: "123456", lang: "ky", fallbackLang: "ru", name: "T1", deviceId: "d1", caps: { tts: true, tr: false } }));
  }
  if (msg.end) { console.log('END received'); clearTimeout(endTimer); ws.close(); }
});

ws.on('close', () => { clearTimeout(endTimer); process.exit(0); });
