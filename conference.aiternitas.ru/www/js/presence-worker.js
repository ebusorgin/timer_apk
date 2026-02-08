/**
 * Presence Worker — разовая загрузка статуса контактов из Redis.
 * Реал-тайм обновления — через Socket.IO (presence:subscriber:online/offline), без polling.
 */
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

self.onmessage = (e) => {
  const { type, payload } = e.data || {};
  if (type === 'init') {
    config = payload || {};
    if (config.subscriberId && config.serverUrl) {
      fetchStatus(); // разовая загрузка при инициализации
    }
  } else if (type === 'updateContacts') {
    if (config) {
      config.contactIds = Array.isArray(payload) ? payload : [];
      if (config.subscriberId && config.serverUrl) {
        fetchStatus(); // разовая загрузка при смене списка контактов
      }
    }
  } else if (type === 'stop') {
    config = null;
  }
};
