/**
 * Web Push notification service.
 * Sends push notifications to offline users (e.g. contact requests).
 * Requires VAPID keys: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.
 * FCM for full-screen call: requires firebase-service-account.json or FIREBASE_SERVICE_ACCOUNT_PATH.
 */
import webpush from 'web-push';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let vapidConfigured = false;
let firebaseAdmin = null;
let firebaseInitPromise = null;

async function initFirebase() {
  if (firebaseAdmin) return firebaseAdmin;
  if (firebaseInitPromise) return firebaseInitPromise;
  firebaseInitPromise = (async () => {
    try {
      const admin = await import('firebase-admin');
      const { existsSync } = await import('fs');
      const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
        path.join(__dirname, '..', 'firebase-service-account.json');
      if (!existsSync(keyPath)) return null;
      const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      firebaseAdmin = admin;
      return firebaseAdmin;
    } catch (err) {
      console.warn('[Push] Firebase init failed:', err?.message);
      return null;
    }
  })();
  return firebaseInitPromise;
}

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
 * Входящий звонок через FCM (full-screen на Android).
 * Data-only message для capacitor-fullscreen-notification.
 */
export async function sendIncomingCallFCM(getFcmToken, toSubscriberId, { fromName, callType = 'audio', callId }) {
  const token = typeof getFcmToken === 'function' ? await getFcmToken(toSubscriberId) : null;
  if (!token) return false;
  const fb = await initFirebase();
  if (!fb?.messaging) return false;
  const typeLabel = callType === 'video' ? 'видео' : 'аудио';
  const fullScreenId = `call:${callId}:${callType}`;
  const actionButtons = JSON.stringify([
    { id: 'decline', text: 'Отклонить' },
    { id: 'accept', text: 'Принять' },
  ]);
  try {
    await fb.messaging().send({
      token,
      data: {
        fullScreenId,
        callId,
        callType,
        channelId: 'incoming-call',
        channelName: 'Входящие звонки',
        channelDescription: 'Полноэкранные уведомления о звонках',
        title: 'Входящий звонок',
        text: `${fromName || 'Кто-то'} звонит вам (${typeLabel})`,
        timeout: '60000',
        vibrationPattern: '[500,200,500,200,500,200,500,200]',
        actionButtons,
      },
      android: {
        priority: 'high',
        ttl: 60,
        collapseKey: 'incoming-call',
      },
      apns: { headers: { 'apns-priority': '10' } },
    });
    return true;
  } catch (err) {
    if (err?.code === 'messaging/registration-token-not-registered') return false;
    console.warn('[Push] FCM send failed:', err?.message);
    return false;
  }
}

/**
 * Входящий звонок — Web Push (обычное уведомление).
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
 * Звонок отклонён — FCM инициатору (APK), когда он офлайн.
 */
export async function sendCallDeclinedFCM(getFcmToken, callerId, { fromName }) {
  const token = typeof getFcmToken === 'function' ? await getFcmToken(callerId) : null;
  if (!token) return false;
  const fb = await initFirebase();
  if (!fb?.messaging) return false;
  try {
    await fb.messaging().send({
      token,
      notification: {
        title: 'Звонок отклонён',
        body: `${fromName || 'Кто-то'} отклонил(а) звонок`,
      },
      data: { type: 'call-declined', url: '/', fromName: fromName || '' },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    });
    return true;
  } catch (err) {
    if (err?.code === 'messaging/registration-token-not-registered') return false;
    console.warn('[Push] FCM call declined send failed:', err?.message);
    return false;
  }
}

/**
 * Звонок отклонён — Web Push инициатору (PWA), когда он офлайн.
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
