/**
 * net.aiternitas.ru — decentralized hybrid messenger.
 * One messenger, multiple transports (relay + DTN). E2EE, federation, bridging.
 */

export { createIdentity, identityFromSecretKey, userIdFromPublicKey, signKeypairToBox, maxTtlForKeyAge } from './shared/crypto.mjs';
export { validateMessage, isDead, isWithinTtl } from './shared/messageSchema.mjs';
export { buildMessage, buildDeleteMessage, mergeByVersion } from './core/messageCore.mjs';
export { MessengerClient } from './client/client.mjs';
export { UnifiedTransport } from './client/transport/UnifiedTransport.mjs';
export { OnlineRelayTransport } from './client/transport/OnlineRelayTransport.mjs';
export { DTNTransportStub } from './client/transport/DTNTransportStub.mjs';
export { RelayStore } from './server/store.mjs';
export { ContactStore } from './shared/contacts.mjs';

export {
  MESSAGE_VERSION_ACTIVE,
  MESSAGE_VERSION_DEAD,
  SLOT_SIZE_SECONDS,
  MAX_TTL_ABSOLUTE_SECONDS,
  DEFAULT_MAX_MESSAGES,
  DEFAULT_MAX_STORAGE_BYTES,
} from './shared/constants.mjs';
