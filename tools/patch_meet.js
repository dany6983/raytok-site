const fs = require('fs');
const path = require('path');

const MEET_DIR = 'C:\\GitHub\\raytok-meet';

// 1. main.js 수정 (오버레이 로직 추가)
let mainJs = fs.readFileSync(path.join(MEET_DIR, 'main.js'), 'utf8');

if (!mainJs.includes('let overlayWindow = null;')) {
  mainJs = mainJs.replace('let mainWindow = null;', 'let mainWindow = null;\nlet overlayWindow = null;');

  const overlayIpc = `
ipcMain.handle('toggle-overlay', (_event, show) => {
  if (show) {
    if (!overlayWindow) {
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;
      
      overlayWindow = new BrowserWindow({
        width: 800,
        height: 100,
        x: (width - 800) / 2,
        y: height - 150,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.setVisibleOnAllWorkspaces(true);
      overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
      
      overlayWindow.on('closed', () => {
        overlayWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('overlay-closed');
        }
      });
    }
  } else {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  }
  return { ok: true };
});
`;
  mainJs = mainJs.replace('// IPC Handlers\n', '// IPC Handlers\n' + overlayIpc);

  const overlaySend = `
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stt-result', {
      seq,
      spk,
      transcript: text,
      is_final: true
    });
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-subtitle', { spk, text });
  }
`;
  mainJs = mainJs.replace(
`  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stt-result', {
      seq,
      spk,
      transcript: text,
      is_final: true
    });
  }`, overlaySend);

  // 화자 정정 시 오버레이 반영
  const overlayFix = `
      // 1. 호스트 UI 화자 정정
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fix-speaker', {
          seq: matchedMe.seq,
          spk: 'meeting'
        });
      }
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('overlay-fix', { seq: matchedMe.seq, spk: 'meeting' });
      }
`;
  mainJs = mainJs.replace(
`      // 1. 호스트 UI 화자 정정
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fix-speaker', {
          seq: matchedMe.seq,
          spk: 'meeting'
        });
      }`, overlayFix);

  fs.writeFileSync(path.join(MEET_DIR, 'main.js'), mainJs, 'utf8');
}

// 2. preload.js 수정
let preloadJs = fs.readFileSync(path.join(MEET_DIR, 'preload.js'), 'utf8');
if (!preloadJs.includes('toggleOverlay')) {
  preloadJs = preloadJs.replace('captureScreenshot: (path) => ipcRenderer.invoke(\'capture-screenshot\', path),', 
`captureScreenshot: (path) => ipcRenderer.invoke('capture-screenshot', path),
  toggleOverlay: (show) => ipcRenderer.invoke('toggle-overlay', show),
  onOverlaySubtitle: (cb) => ipcRenderer.on('overlay-subtitle', (e, data) => cb(data)),
  onOverlayFix: (cb) => ipcRenderer.on('overlay-fix', (e, data) => cb(data)),
  onOverlayClosed: (cb) => ipcRenderer.on('overlay-closed', () => cb()),`);
  fs.writeFileSync(path.join(MEET_DIR, 'preload.js'), preloadJs, 'utf8');
}

// 3. renderer/index.html 수정 (버전 표시 및 오버레이 단추 추가)
let indexHtml = fs.readFileSync(path.join(MEET_DIR, 'renderer', 'index.html'), 'utf8');
if (!indexHtml.includes('btnOverlay')) {
  // 버전 표시
  indexHtml = indexHtml.replace('<h1>RayTok Desk</h1>', '<h1>RayTok Desk <span style="font-size: 12px; color: #64748b; margin-left: 8px;">v1.0.0</span></h1>');
  
  // 오버레이 단추 추가
  const overlayBtn = `<button id="btnOverlay" class="btn" style="background:#3b82f6; width:100%; margin-top:10px;">오버레이 켜기</button>`;
  indexHtml = indexHtml.replace('id="btnStop" class="btn" style="background:#ef4444; display:none;">인식 정지</button>', 'id="btnStop" class="btn" style="background:#ef4444; display:none;">인식 정지</button>\n          ' + overlayBtn);

  // 오버레이 단추 동작
  const overlayScript = `
    const btnOverlay = document.getElementById('btnOverlay');
    let isOverlayOn = false;
    btnOverlay.addEventListener('click', async () => {
      isOverlayOn = !isOverlayOn;
      await window.api.toggleOverlay(isOverlayOn);
      btnOverlay.textContent = isOverlayOn ? '오버레이 끄기' : '오버레이 켜기';
      btnOverlay.style.background = isOverlayOn ? '#64748b' : '#3b82f6';
    });
    window.api.onOverlayClosed && window.api.onOverlayClosed(() => {
      isOverlayOn = false;
      btnOverlay.textContent = '오버레이 켜기';
      btnOverlay.style.background = '#3b82f6';
    });
`;
  indexHtml = indexHtml.replace('const btnStop = document.getElementById(\'btnStop\');', 'const btnStop = document.getElementById(\'btnStop\');\n' + overlayScript);

  fs.writeFileSync(path.join(MEET_DIR, 'renderer', 'index.html'), indexHtml, 'utf8');
}

// 4. renderer/overlay.html 생성
const overlayHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>RayTok Overlay</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .overlay-container {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(51, 65, 85, 0.8);
      border-radius: 12px;
      padding: 16px 24px;
      color: #fff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 10px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      -webkit-app-region: drag;
    }
    .subtitle {
      font-size: 24px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      text-align: center;
      text-shadow: 1px 1px 2px #000;
    }
    .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 24px;
      cursor: pointer;
      -webkit-app-region: no-drag;
    }
    .close-btn:hover { color: #f87171; }
    .spk-me { color: #34d399; }
    .spk-meeting { color: #38bdf8; }
  </style>
</head>
<body>
  <div class="overlay-container">
    <div class="subtitle" id="subtitle-text">RayTok Desk 오버레이 자막</div>
    <button class="close-btn" id="close-btn">&times;</button>
  </div>
  <script>
    document.getElementById('close-btn').addEventListener('click', () => {
      window.api.toggleOverlay(false);
    });
    window.api.onOverlaySubtitle((data) => {
      const el = document.getElementById('subtitle-text');
      el.textContent = data.text;
      el.className = 'subtitle spk-' + data.spk;
    });
    window.api.onOverlayFix((data) => {
      const el = document.getElementById('subtitle-text');
      el.className = 'subtitle spk-' + data.spk;
    });
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(MEET_DIR, 'renderer', 'overlay.html'), overlayHtml, 'utf8');

console.log('Patch done!');
