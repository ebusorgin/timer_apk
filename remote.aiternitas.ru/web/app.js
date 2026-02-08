/**
 * Remote Control — экран компьютера на телефоне, тап = клик.
 */
let ws = null;
let screenWidth = 1920;
let screenHeight = 1080;
let streamWidth = 960;
let streamHeight = 540;
let reconnectTimer = null;

const statusEl = document.getElementById('status');
const screenStream = document.getElementById('screenStream');
const screenContainer = document.getElementById('screenContainer');
const streamOverlay = document.getElementById('streamOverlay');
const quickPanel = document.getElementById('quickPanel');
const keyboardPanel = document.getElementById('keyboardPanel');
const quickActions = document.getElementById('quickActions');
const textInput = document.getElementById('textInput');
const sendText = document.getElementById('sendText');

function setStatus(text, type = '') {
  statusEl.textContent = text;
  statusEl.className = type;
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.hostname}:${location.port || 8765}/ws`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    setStatus('Подключено', 'connected');
    clearTimeout(reconnectTimer);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'screen_info') {
        screenWidth = msg.width || 1920;
        screenHeight = msg.height || 1080;
        streamWidth = msg.streamWidth || 960;
        streamHeight = msg.streamHeight || 540;
      } else if (msg.type === 'error') {
        setStatus('Ошибка: ' + msg.message, 'error');
      }
    } catch (_) {}
  };

  ws.onclose = () => {
    setStatus('Отключено', 'error');
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => setStatus('Ошибка подключения', 'error');
}

function send(cmd, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: cmd, payload }));
  }
}

/** Преобразовать координаты касания в координаты стрима (0..streamWidth, 0..streamHeight) */
function touchToStreamCoords(clientX, clientY) {
  const rect = screenStream.getBoundingClientRect();
  const natW = screenStream.naturalWidth || streamWidth;
  const natH = screenStream.naturalHeight || streamHeight;
  const scale = Math.min(rect.width / natW, rect.height / natH);
  const dispW = natW * scale;
  const dispH = natH * scale;
  const offsetX = (rect.width - dispW) / 2;
  const offsetY = (rect.height - dispH) / 2;
  const x = (clientX - rect.left - offsetX) / scale;
  const y = (clientY - rect.top - offsetY) / scale;
  return {
    x: Math.max(0, Math.min(x, streamWidth)),
    y: Math.max(0, Math.min(y, streamHeight)),
    srcWidth: streamWidth,
    srcHeight: streamHeight
  };
}

/** Обработка касаний: 1 палец — курсор+клик, 2 пальца — скролл */
let touchStart = { x: 0, y: 0, t: 0 };
let lastX = 0, lastY = 0;
let lastTwoY = 0;
let hasMoved = false;

function handleScreenTouchStart(e) {
  if (e.touches.length === 1) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    hasMoved = false;
  } else if (e.touches.length === 2) {
    lastTwoY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  }
}

function handleScreenTouchMove(e) {
  if (e.touches.length === 2) {
    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const dy = lastTwoY - cy;
    lastTwoY = cy;
    if (Math.abs(dy) > 2) send('scroll', { dy: Math.round(dy * 2) });
  } else if (e.touches.length === 1) {
    const dx = (e.touches[0].clientX - lastX) * 2;
    const dy = (e.touches[0].clientY - lastY) * 2;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      hasMoved = true;
      send('mouse_move', { x: dx, y: dy, absolute: false });
    }
  }
}

function handleScreenTouchEnd(e) {
  if (e.changedTouches.length === 1) {
    const t = e.changedTouches[0];
    const dx = Math.abs(t.clientX - touchStart.x);
    const dy = Math.abs(t.clientY - touchStart.y);
    const dt = Date.now() - touchStart.t;
    if (!hasMoved && dx < 15 && dy < 15 && dt < 300) {
      const coords = touchToStreamCoords(t.clientX, t.clientY);
      send('mouse_click', { button: 'left', ...coords });
    }
  }
}

function handleScreenClick(e) {
  if (e.target === screenStream || e.target === streamOverlay) {
    const coords = touchToStreamCoords(e.clientX, e.clientY);
    send('mouse_click', { button: 'left', ...coords });
  }
}

// Делаем overlay кликабельным для тапов
streamOverlay.style.pointerEvents = 'auto';
screenContainer.addEventListener('touchstart', handleScreenTouchStart, { passive: true });
screenContainer.addEventListener('touchmove', handleScreenTouchMove, { passive: false });
screenContainer.addEventListener('touchend', handleScreenTouchEnd, { passive: true });
screenContainer.addEventListener('click', handleScreenClick);

// Долгое нажатие = ПКМ
let longPressTimer = null;
streamOverlay.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const coords = touchToStreamCoords(t.clientX, t.clientY);
    longPressTimer = setTimeout(() => {
      send('mouse_click', { button: 'right', ...coords });
      longPressTimer = null;
    }, 500);
  }
}, { passive: true });
streamOverlay.addEventListener('touchend', () => {
  if (longPressTimer) clearTimeout(longPressTimer);
});
streamOverlay.addEventListener('touchmove', () => {
  if (longPressTimer) clearTimeout(longPressTimer);
});

// Загрузка и отображение макросов
async function loadMacros() {
  try {
    const r = await fetch('/api/macros');
    const macros = await r.json();
    quickActions.innerHTML = Object.entries(macros).map(([id, m]) =>
      `<button class="quick-action-btn" data-macro="${id}">${m.name}</button>`
    ).join('');
    quickActions.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => send('macro', { id: btn.dataset.macro });
    });
  } catch (_) {
    quickActions.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">Нет макросов</span>';
  }
}

// Панели
document.getElementById('panelToggle').onclick = () => quickPanel.classList.toggle('collapsed');
document.getElementById('keyboardToggle').onclick = () => keyboardPanel.classList.toggle('collapsed');

// Клавиши
document.querySelectorAll('.quick-keys button').forEach(btn => {
  btn.onclick = () => send('key', { key: btn.dataset.key === 'space' ? 'space' : btn.dataset.key });
});
sendText.onclick = () => {
  const text = textInput.value;
  if (text) { send('type', { text }); textInput.value = ''; }
};
textInput.onkeydown = (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendText.click(); }
};

connect();
loadMacros();
