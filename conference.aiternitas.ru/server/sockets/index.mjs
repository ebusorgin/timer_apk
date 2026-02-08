import registerPresenceHandlers from './presence.mjs';
import { registerSubscriberSocket, unregisterSocket, emitToSubscriber } from './chat.mjs';
import { addOnline, removeOnline } from '../services/redis.mjs';

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
      addOnline(subscriberId.trim()).catch(() => {});
      io.emit('presence:subscriber:online', { subscriberId: subscriberId.trim() });
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
      if (sid) {
        removeOnline(sid).catch(() => {});
        io.emit('presence:subscriber:offline', { subscriberId: sid });
      }
    });
  });
}

export default registerSockets;

