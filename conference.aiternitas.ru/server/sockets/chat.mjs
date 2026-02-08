const subscriberIdToSockets = new Map();

export function registerSubscriberSocket(socket, subscriberId) {
  if (!subscriberId || typeof subscriberId !== 'string') return;
  const id = subscriberId.trim();
  if (!id) return;
  if (!subscriberIdToSockets.has(id)) {
    subscriberIdToSockets.set(id, new Set());
  }
  subscriberIdToSockets.get(id).add(socket.id);
  socket.data.subscriberId = id;
}

export function unregisterSocket(socketId) {
  for (const [subscriberId, socketIds] of subscriberIdToSockets) {
    if (socketIds.has(socketId)) {
      socketIds.delete(socketId);
      if (socketIds.size === 0) {
        subscriberIdToSockets.delete(subscriberId);
      }
      break;
    }
  }
}

export function emitToSubscriber(io, subscriberId, event, data) {
  if (!io || !subscriberId) return;
  const socketIds = subscriberIdToSockets.get(subscriberId);
  if (!socketIds || socketIds.size === 0) return;
  socketIds.forEach((sid) => {
    io.to(sid).emit(event, data);
  });
}

/** Проверяет, онлайн ли подписчик (есть активное сокет-соединение) */
export function getSubscriberOnlineStatus(subscriberId) {
  if (!subscriberId || typeof subscriberId !== 'string') return false;
  const socketIds = subscriberIdToSockets.get(subscriberId.trim());
  return !!(socketIds && socketIds.size > 0);
}

/** Возвращает статус онлайн для списка подписчиков: { [id]: boolean } */
export function getBulkPresenceStatus(subscriberIds) {
  if (!Array.isArray(subscriberIds)) return {};
  const result = {};
  for (const id of subscriberIds) {
    if (id && typeof id === 'string') {
      result[id.trim()] = getSubscriberOnlineStatus(id);
    }
  }
  return result;
}

/** Список всех онлайн подписчиков (для админки) */
export function getAllOnlineSubscriberIds() {
  return Array.from(subscriberIdToSockets.keys());
}
