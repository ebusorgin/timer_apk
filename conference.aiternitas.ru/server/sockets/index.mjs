import registerPresenceHandlers from './presence.mjs';
import { registerSubscriberSocket, unregisterSocket, emitToSubscriber, getSubscriberOnlineStatus } from './chat.mjs';
import { addOnline, removeOnline, isRedisAvailable } from '../services/redis.mjs';

export function registerSockets({ io, logger, metrics }) {
  if (!io) {
    throw new Error('registerSockets: io instance is required');
  }

  registerPresenceHandlers({ io, logger, metrics });

  io.on('connection', (socket) => {
    const subscriberId =
      socket.handshake?.auth?.subscriberId ||
      socket.handshake?.query?.subscriberId ||
      null;
    if (subscriberId) {
      registerSubscriberSocket(socket, subscriberId);
      const sid = subscriberId.trim();
      if (isRedisAvailable()) {
        addOnline(sid).catch(() => {}); // Redis publish → sub эмитит presence:subscriber:online
      } else {
        addOnline(sid).catch(() => {});
        io.emit('presence:subscriber:online', { subscriberId: sid });
      }
    }

    // Typing indicator
    socket.on('chat:typing', (data) => {
      if (!data?.toId || !subscriberId) return;
      emitToSubscriber(io, data.toId, 'chat:typing', {
        fromId: subscriberId,
        typing: data.typing !== false,
      });
    });

    socket.on('disconnect', () => {
      const sid = socket.data?.subscriberId;
      unregisterSocket(socket.id);
      if (sid && !getSubscriberOnlineStatus(sid)) {
        removeOnline(sid).catch(() => {}); // Redis SREM + publish (для multi-instance)
        io.emit('presence:subscriber:offline', { subscriberId: sid }); // всегда эмитим сразу — не полагаемся на Redis pub
      }
    });
  });
}

export default registerSockets;

