/**
 * Web Push notification service.
 * Sends push notifications to offline users (e.g. contact requests).
 * Requires VAPID keys: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.
 */
import webpush from 'web-push';

let vapidConfigured = false;

function initVapid() {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_MAILTO || 'mailto:conference@aiternitas.ru',
      publicKey,
      privateKey
    );
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.warn('[Push] VAPID init failed:', err?.message);
    return false;
  }
}

/**
 * @param {object} subscription - PushSubscription-like { endpoint, keys: { auth, p256dh } }
 * @param {object} payload - { title, body, data: { type, url, ... } }
 * @param {object} [webpushOptions] - { TTL, urgency, ... } passed to webpush.sendNotification
 */
export async function sendPushNotification(subscription, payload, webpushOptions = {}) {
  if (!initVapid()) return false;
  if (!subscription?.endpoint) return false;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), webpushOptions);
    return true;
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      return false; // Subscription expired
    }
    console.warn('[Push] Send failed:', err?.message);
    return false;
  }
}

/**
 * Send contact request notification to recipient.
 */
export async function sendContactRequestPush(getSubscription, toSubscriberId, { fromName, requestId }) {
  const subscription = typeof getSubscription === 'function'
    ? await getSubscription(toSubscriberId)
    : null;
  if (!subscription) return false;
  return sendPushNotification(subscription, {
    title: 'Запрос в контакты',
    body: `${fromName || 'Кто-то'} хочет добавить вас в контакты`,
    data: { type: 'contact-request', url: '/', requestId, fromName },
    options: { tag: 'conference-contact-request', vibrate: [100, 50, 100] },
  });
}

/**
 * Входящий звонок — уведомление получателю, когда он офлайн.
 * requireInteraction + actions (Принять/Отклонить) + длинная вибрация.
 */
export async function sendIncomingCallPush(getSubscription, toSubscriberId, { fromName, callType = 'audio', callId }) {
  const subscription = typeof getSubscription === 'function'
    ? await getSubscription(toSubscriberId)
    : null;
  if (!subscription) return false;
  const typeLabel = callType === 'video' ? 'видео' : 'аудио';
  return sendPushNotification(subscription, {
    title: 'Входящий звонок',
    body: `${fromName || 'Кто-то'} звонит вам (${typeLabel})`,
    data: { type: 'incoming-call', url: '/', callId, fromName, callType },
    options: {
      tag: 'conference-incoming-call',
      requireInteraction: true,
      renotify: true,
      vibrate: [500, 200, 500],
      actions: [
        { action: 'accept', title: 'Принять' },
        { action: 'decline', title: 'Отклонить' },
      ],
    },
  }, { TTL: 60, urgency: 'high' });
}

/**
 * Новое сообщение в чате — уведомление получателю, когда он офлайн.
 * Короткая вибрация для отличия от звонка.
 */
export async function sendNewMessagePush(getSubscription, toSubscriberId, { fromName, body }) {
  const subscription = typeof getSubscription === 'function'
    ? await getSubscription(toSubscriberId)
    : null;
  if (!subscription) return false;
  const preview = (body || '').slice(0, 100);
  return sendPushNotification(subscription, {
    title: fromName ? `Сообщение от ${fromName}` : 'Новое сообщение',
    body: preview || 'Вам написали',
    data: { type: 'new-message', url: '/', fromName },
    options: { tag: 'conference-new-message', vibrate: [100, 50, 100] },
  });
}

/**
 * Звонок отклонён — push инициатору, когда он офлайн.
 */
export async function sendCallDeclinedPush(getSubscription, callerId, { fromName }) {
  const subscription = typeof getSubscription === 'function'
    ? await getSubscription(callerId)
    : null;
  if (!subscription) return false;
  return sendPushNotification(subscription, {
    title: 'Звонок отклонён',
    body: `${fromName || 'Кто-то'} отклонил(а) звонок`,
    data: { type: 'call-declined', url: '/', fromName },
    options: { tag: 'conference-call-declined' },
  });
}

export function isPushAvailable() {
  return initVapid();
}
