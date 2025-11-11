import registerPresenceHandlers from './presence.mjs';

export function registerSockets({ io, logger, metrics }) {
  if (!io) {
    throw new Error('registerSockets: io instance is required');
  }

  registerPresenceHandlers({ io, logger, metrics });
}

export default registerSockets;

