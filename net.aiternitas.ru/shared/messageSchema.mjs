/**
 * Message schema — canonical serialization for signing and validation.
 * No transport-specific metadata.
 */

import { MESSAGE_VERSION_ACTIVE, MESSAGE_VERSION_DEAD } from './constants.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_REGEX = /^[0-9a-f]+$/i;

/**
 * Serialize message fields (excluding signature) for signing.
 * Order: message_id, sender_id, receiver_id, encrypted_payload, created_at, ttl_seconds, version.
 * @param {import('./types.mjs').Message} msg
 * @returns {Uint8Array}
 */
export function messageCanonicalBytes(msg) {
  const payload = typeof msg.encrypted_payload === 'string'
    ? msg.encrypted_payload
    : Buffer.from(msg.encrypted_payload).toString('base64');
  const parts = [
    msg.message_id,
    msg.sender_id,
    msg.receiver_id,
    payload,
    String(msg.created_at),
    String(msg.ttl_seconds),
    String(msg.version),
  ];
  const str = parts.join('\n');
  return new TextEncoder().encode(str);
}

/**
 * Validate message shape and value constraints.
 * @param {unknown} obj
 * @returns {{ ok: true, message: import('./types.mjs').Message } | { ok: false, error: string }}
 */
export function validateMessage(obj) {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, error: 'Message must be an object' };
  }
  const m = /** @type {Record<string, unknown>} */ (obj);
  if (typeof m.message_id !== 'string' || !UUID_REGEX.test(m.message_id)) {
    return { ok: false, error: 'message_id must be a valid UUID' };
  }
  if (typeof m.sender_id !== 'string' || !HEX_REGEX.test(m.sender_id) || m.sender_id.length < 32) {
    return { ok: false, error: 'sender_id must be hex string (UserID)' };
  }
  if (typeof m.receiver_id !== 'string' || !HEX_REGEX.test(m.receiver_id) || m.receiver_id.length < 32) {
    return { ok: false, error: 'receiver_id must be hex string (UserID)' };
  }
  if (typeof m.encrypted_payload !== 'string' && !(m.encrypted_payload instanceof Uint8Array)) {
    return { ok: false, error: 'encrypted_payload must be string (base64) or Uint8Array' };
  }
  const created_at = Number(m.created_at);
  if (!Number.isInteger(created_at) || created_at <= 0) {
    return { ok: false, error: 'created_at must be positive integer (unix timestamp)' };
  }
  const ttl_seconds = Number(m.ttl_seconds);
  if (!Number.isInteger(ttl_seconds) || ttl_seconds <= 0) {
    return { ok: false, error: 'ttl_seconds must be positive integer' };
  }
  const version = Number(m.version);
  if (version !== MESSAGE_VERSION_ACTIVE && version !== MESSAGE_VERSION_DEAD) {
    return { ok: false, error: 'version must be 1 (ACTIVE) or 2 (DEAD)' };
  }
  if (typeof m.sender_signature !== 'string' || m.sender_signature.length === 0) {
    return { ok: false, error: 'sender_signature must be non-empty string (base64)' };
  }

  const message = {
    message_id: m.message_id,
    sender_id: m.sender_id,
    receiver_id: m.receiver_id,
    encrypted_payload: typeof m.encrypted_payload === 'string' ? m.encrypted_payload : Buffer.from(m.encrypted_payload).toString('base64'),
    created_at,
    ttl_seconds,
    version,
    sender_signature: m.sender_signature,
  };
  return { ok: true, message };
}

/**
 * Check if message is DEAD (deleted).
 * @param {import('./types.mjs').Message} msg
 */
export function isDead(msg) {
  return msg.version === MESSAGE_VERSION_DEAD;
}

/**
 * Check if message is still within TTL (not expired for decryption).
 * @param {import('./types.mjs').Message} msg
 * @param {number} [now] Unix timestamp, default Date.now()/1000
 */
export function isWithinTtl(msg, now = Math.floor(Date.now() / 1000)) {
  return (now - msg.created_at) <= msg.ttl_seconds;
}
