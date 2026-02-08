/**
 * Presence Worker — фоновый сервис для проверки онлайн-статуса контактов.
 * Постоянно опрашивает сервер, чтобы показывать, доступен ли пользователь для звонка.
 */
const INTERVAL_MS = 45000; // 45 сек
let timerId = null;
let config = null;

function fetchStatus() {
  if (!config || !config.subscriberId || !config.serverUrl) return;
  const ids = config.contactIds || [];
  if (ids.length === 0) {
    self.postMessage({ type: 'presence:bulk', status: {} });
    return;
  }
  const url = config.serverUrl + '/api/presence/status?ids=' + encodeURIComponent(ids.join(','));
  fetch(url, {
    method: 'GET',
    headers: { 'X-Subscriber-Id': config.subscriberId },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success && data.status) {
        self.postMessage({ type: 'presence:bulk', status: data.status });
      }
    })
    .catch(() => {});
}

function startPolling() {
  if (timerId) clearInterval(timerId);
  fetchStatus();
  timerId = setInterval(fetchStatus, INTERVAL_MS);
}

function stopPolling() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

self.onmessage = (e) => {
  const { type, payload } = e.data || {};
  if (type === 'init') {
    config = payload || {};
    if (config.subscriberId && config.serverUrl) {
      startPolling();
    } else {
      stopPolling();
    }
  } else if (type === 'updateContacts') {
    if (config) {
      config.contactIds = Array.isArray(payload) ? payload : [];
      if (config.subscriberId && config.serverUrl) {
        fetchStatus(); // немедленно обновить
      }
    }
  } else if (type === 'stop') {
    stopPolling();
    config = null;
  }
};
