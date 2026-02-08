/**
 * Message core — build message, validate, state machine (ACTIVE → DEAD only).
 * No transport-specific metadata.
 */

import { v4 as uuidv4 } from 'uuid';
import { validateMessage, isDead, isWithinTtl } from '../shared/messageSchema.mjs';
import {
  signMessage,
  encryptPayload,
  maxTtlForKeyAge,
  signKeypairToBox,
} from '../shared/crypto.mjs';
import { MESSAGE_VERSION_ACTIVE, MESSAGE_VERSION_DEAD } from '../shared/constants.mjs';

/**
 * Build a new message (ACTIVE, version=1). Encrypts payload, signs message.
 * Enforces key-age max TTL locally.
 * @param {string|Uint8Array} plaintext
 * @param {{ publicKey: Uint8Array, secretKey: Uint8Array, userId: string, keyCreatedAt: number }} senderIdentity
 * @param {string} receiverId UserID (hash of receiver public key)
 * @param {Uint8Array} receiverBoxPublic Receiver's Curve25519 public key (for E2EE)
 * @param {number} ttl_seconds Must be <= maxTtlForKeyAge(senderIdentity.keyCreatedAt)
 * @returns {Promise<import('../shared/types.mjs').Message>}
 */
export async function buildMessage(plaintext, senderIdentity, receiverId, receiverBoxPublic, ttl_seconds) {
  const now = Math.floor(Date.now() / 1000);
  const maxTtl = maxTtlForKeyAge(senderIdentity.keyCreatedAt, now);
  if (ttl_seconds > maxTtl || ttl_seconds <= 0) {
    throw new Error(`ttl_seconds must be in (0, ${maxTtl}] for this key age`);
  }
  const message_id = uuidv4();
  const created_at = now;
  const version = MESSAGE_VERSION_ACTIVE;
  const sender_id = senderIdentity.userId;

  const boxKeys = signKeypairToBox(senderIdentity);
  const encrypted_payload = await encryptPayload(
    plaintext,
    boxKeys.secretKey,
    receiverBoxPublic,
    created_at,
    message_id
  );

  const msg = {
    message_id,
    sender_id,
    receiver_id: receiverId,
    encrypted_payload,
    created_at,
    ttl_seconds,
    version,
    sender_signature: '', // filled below
  };
  msg.sender_signature = await signMessage(msg, senderIdentity.secretKey);
  const validated = validateMessage(msg);
  if (!validated.ok) throw new Error(validated.error);
  return validated.message;
}

/**
 * Build DELETE control message (version=2). Same message_id; signature from sender or receiver.
 * @param {string} messageId
 * @param {string} senderId
 * @param {string} receiverId
 * @param {Uint8Array} signSecretKey Sign secret of whoever issues delete (sender or receiver)
 * @param {number} created_at Original message created_at (for canonical bytes we use minimal fields)
 * @returns {Promise<import('../shared/types.mjs').Message>}
 */
export async function buildDeleteMessage(messageId, senderId, receiverId, signSecretKey, created_at) {
  const msg = {
    message_id: messageId,
    sender_id: senderId,
    receiver_id: receiverId,
    encrypted_payload: '', // empty for DELETE
    created_at,
    ttl_seconds: 1,
    version: MESSAGE_VERSION_DEAD,
    sender_signature: '',
  };
  msg.sender_signature = await signMessage(msg, signSecretKey);
  const validated = validateMessage(msg);
  if (!validated.ok) throw new Error(validated.error);
  return validated.message;
}

/**
 * Validate message shape and optionally signature (if sender public key provided).
 * @param {unknown} obj
 * @param {Uint8Array} [senderSignPublicKey]
 * @returns {Promise<{ ok: true, message: import('../shared/types.mjs').Message } | { ok: false, error: string }>}
 */
export async function validateMessageAndSignature(obj, senderSignPublicKey) {
  const result = validateMessage(obj);
  if (!result.ok) return result;
  if (senderSignPublicKey) {
    const { verifyMessageSignature } = await import('../shared/crypto.mjs');
    const ok = await verifyMessageSignature(result.message, senderSignPublicKey);
    if (!ok) return { ok: false, error: 'Invalid signature' };
  }
  return result;
}

/**
 * State: only ACTIVE (version=1) or DEAD (version=2). No resurrection.
 */
export { isDead, isWithinTtl };

/**
 * Merge rule: keep only the message with highest version for same message_id.
 * @param {import('../shared/types.mjs').Message} a
 * @param {import('../shared/types.mjs').Message} b
 * @returns {import('../shared/types.mjs').Message} The one with higher version
 */
export function mergeByVersion(a, b) {
  if (a.message_id !== b.message_id) throw new Error('Different message_id');
  return a.version >= b.version ? a : b;
}
