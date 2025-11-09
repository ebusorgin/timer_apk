const SW_VERSION = '1.0.0';

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate', SW_VERSION);
  event.waitUntil(self.clients.claim());
});

const defaultNotificationOptions = {
  body: 'Открывайте приложение, чтобы принять звонок.',
  tag: 'conference-call',
  renotify: true,
  data: {},
};

self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received:', event);
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.warn('[ServiceWorker] Не удалось разобрать push payload:', error);
    payload = { body: event.data ? event.data.text() : null };
  }

  const title = payload.title || 'Входящий звонок';
  const options = {
    ...defaultNotificationOptions,
    ...payload.options,
    body: payload.body || defaultNotificationOptions.body,
    data: {
      ...(defaultNotificationOptions.data || {}),
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click', event.notification);
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'incoming-call',
            payload: event.notification.data || {},
          });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  if (type === 'subscriber-profile') {
    self.__subscriberProfile = payload;
    console.log('[ServiceWorker] Обновлён профиль подписчика', payload);
  } else {
    console.log('[ServiceWorker] Сообщение', event.data);
  }
});

